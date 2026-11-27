/**
 * 桌台域服务：区域、桌台、二维码链接与实时状态推导。
 * 桌台实时状态（空闲/待结算/挂单）不落库，由未结订单实时计算。
 *
 * 约定：单条增删改查用 Drizzle；数量聚合、未结订单推导与排序交换
 * 使用 `src/sql/table.sql.ts` 中的参数化 SQL。
 */
import { randomBytes } from 'node:crypto';

import { and, count, eq, max, ne } from 'drizzle-orm';

import type {
  AreaGroup,
  CashierOverview,
  CashierStats,
  DiningArea,
  DiningTable,
  LiveTableStatus,
  PublicTableInfo,
  TableCard,
  TableOrderBrief,
} from '@dinebox/types';
import { round2 } from '@dinebox/utils';

import { env } from '../../config/env.js';
import { dbClient, schema } from '../../db/index.js';
import { executeOn, queryOneOn } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import {
  areaListQuery,
  cashierTodayStatsQuery,
  lockAreaQuery,
  neighborAreaQuery,
  pendingOrdersQuery,
  tableByTokenQuery,
  tablesWithAreaQuery,
  updateAreaSortQuery,
} from '../../sql/table.sql.js';
import { writeOperationLog } from '../audit.service.js';

interface AreaRow {
  id: number;
  name: string;
  sort: number;
  tableCount?: number;
}

interface TableRow {
  id: number;
  areaId: number;
  areaName: string;
  name: string;
  seats: number | null;
  qrToken: string;
  createdAt: string;
}

interface PendingOrderRow {
  id: number;
  orderNo: string;
  tableId: number;
  totalAmount: number;
  payableAmount: number;
  hungFlag: number;
  peopleCount: number;
  itemCount: number;
  createdAt: string;
}

/** 二维码链接：顾客扫码进入 H5 并锁定桌台。 */
export function buildQrLink(qrToken: string): string {
  const base = env.H5_PUBLIC_URL.replace(/\/+$/, '');
  return `${base}/?tk=${encodeURIComponent(qrToken)}`;
}

function generateQrToken(): string {
  return `tk_${randomBytes(6).toString('hex')}`;
}

/** 桌台就餐会话令牌：同桌顾客共享；结清/取消后由订单服务换新。 */
export function generateSessionToken(): string {
  return `ts_${randomBytes(16).toString('hex')}`;
}

/* ========================= 区域 ========================= */

export async function listAreas(): Promise<DiningArea[]> {
  const query = areaListQuery();
  const rows = await dbClient.query<AreaRow>(query.sql, query.params);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sort: row.sort,
    tableCount: Number(row.tableCount ?? 0),
  }));
}

export async function saveArea(
  input: { id?: number; name: string; sort?: number },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ id: number }> {
  let id = input.id;
  if (id) {
    const [result] = await dbClient.db
      .update(schema.diningArea)
      .set({
        areaName: input.name,
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
      })
      .where(and(eq(schema.diningArea.id, id), eq(schema.diningArea.isDeleted, 0)));
    if (result.affectedRows === 0) {
      throw new HttpError(404, '区域不存在');
    }
  } else {
    let sort = input.sort;
    if (sort === undefined) {
      const [row] = await dbClient.db
        .select({ maxSort: max(schema.diningArea.sort) })
        .from(schema.diningArea)
        .where(eq(schema.diningArea.isDeleted, 0));
      sort = Number(row?.maxSort ?? 0) + 1;
    }
    const [result] = await dbClient.db
      .insert(schema.diningArea)
      .values({ areaName: input.name, sort });
    id = result.insertId;
  }
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'AREA_SAVE',
    target: input.name,
    detail: input.id ? '编辑区域' : '新增区域',
    ip,
  });
  return { id };
}

export async function deleteArea(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const [area] = await dbClient.db
    .select({ name: schema.diningArea.areaName })
    .from(schema.diningArea)
    .where(and(eq(schema.diningArea.id, id), eq(schema.diningArea.isDeleted, 0)))
    .limit(1);
  if (!area) {
    throw new HttpError(404, '区域不存在');
  }
  const [countRow] = await dbClient.db
    .select({ total: count() })
    .from(schema.diningTable)
    .where(and(eq(schema.diningTable.areaId, id), eq(schema.diningTable.isDeleted, 0)));
  if (Number(countRow?.total ?? 0) > 0) {
    throw new HttpError(409, '该区域下还有桌台，请先移动或删除桌台');
  }
  await dbClient.db
    .update(schema.diningArea)
    .set({ isDeleted: 1 })
    .where(eq(schema.diningArea.id, id));
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'AREA_DELETE',
    target: area.name,
    detail: '删除区域',
    ip,
  });
}

export async function moveArea(
  id: number,
  direction: 'up' | 'down',
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const moved = await dbClient.transaction(async (conn) => {
    const lock = lockAreaQuery(id);
    const current = await queryOneOn<{ id: number; sort: number }>(
      conn,
      lock.sql,
      lock.params,
    );
    if (!current) {
      throw new HttpError(404, '区域不存在');
    }
    const neighborQuery = neighborAreaQuery(current.sort, id, direction);
    const neighbor = await queryOneOn<{ id: number; sort: number }>(
      conn,
      neighborQuery.sql,
      neighborQuery.params,
    );
    if (!neighbor) {
      return false;
    }
    const first = updateAreaSortQuery(current.id, neighbor.sort);
    const second = updateAreaSortQuery(neighbor.id, current.sort);
    await executeOn(conn, first.sql, first.params);
    await executeOn(conn, second.sql, second.params);
    return true;
  });

  if (moved) {
    await writeOperationLog({
      userId: operator.id,
      username: operator.username,
      action: 'AREA_SAVE',
      target: `area#${id}`,
      detail: direction === 'up' ? '区域上移' : '区域下移',
      ip,
    });
  }
}

/* ========================= 桌台 ========================= */

async function loadPendingOrders(): Promise<PendingOrderRow[]> {
  const query = pendingOrdersQuery();
  return dbClient.query<PendingOrderRow>(query.sql, query.params);
}

function groupPending(
  rows: PendingOrderRow[],
): Map<number, { status: LiveTableStatus; amount: number; orders: TableOrderBrief[] }> {
  const map = new Map<
    number,
    { status: LiveTableStatus; amount: number; orders: TableOrderBrief[] }
  >();
  for (const row of rows) {
    const entry = map.get(row.tableId) ?? {
      status: 'FREE' as LiveTableStatus,
      amount: 0,
      orders: [],
    };
    entry.status = row.hungFlag === 1 ? 'HUNG' : entry.status === 'HUNG' ? 'HUNG' : 'OCCUPIED';
    entry.amount = round2(entry.amount + Number(row.totalAmount));
    entry.orders.push({
      id: row.id,
      orderNo: row.orderNo,
      totalAmount: Number(row.totalAmount),
      payableAmount: Number(row.payableAmount),
      hungFlag: row.hungFlag === 1,
      peopleCount: row.peopleCount,
      itemCount: Number(row.itemCount),
      createdAt: row.createdAt,
    });
    map.set(row.tableId, entry);
  }
  return map;
}

function toTableDto(row: TableRow, pending: ReturnType<typeof groupPending>): DiningTable {
  const entry = pending.get(row.id);
  return {
    id: row.id,
    areaId: row.areaId,
    areaName: row.areaName,
    name: row.name,
    seats: row.seats,
    qrToken: row.qrToken,
    qrLink: buildQrLink(row.qrToken),
    status: entry?.status ?? 'FREE',
    pendingOrderCount: entry?.orders.length ?? 0,
    pendingAmount: entry?.amount ?? 0,
  };
}

/** 后台桌台列表（含实时状态）。 */
export async function listTables(): Promise<DiningTable[]> {
  const tableQuery = tablesWithAreaQuery();
  const [rows, pending] = await Promise.all([
    dbClient.query<TableRow>(tableQuery.sql, tableQuery.params),
    loadPendingOrders(),
  ]);
  const grouped = groupPending(pending);
  return rows.map((row) => toTableDto(row, grouped));
}

export async function saveTable(
  input: { id?: number; name: string; areaId: number; seats?: number | null },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ id: number }> {
  const [area] = await dbClient.db
    .select({ id: schema.diningArea.id })
    .from(schema.diningArea)
    .where(and(eq(schema.diningArea.id, input.areaId), eq(schema.diningArea.isDeleted, 0)))
    .limit(1);
  if (!area) {
    throw new HttpError(400, '所属区域不存在');
  }

  const [duplicate] = await dbClient.db
    .select({ id: schema.diningTable.id })
    .from(schema.diningTable)
    .where(
      and(
        eq(schema.diningTable.tableName, input.name),
        eq(schema.diningTable.isDeleted, 0),
        ne(schema.diningTable.id, input.id ?? 0),
      ),
    )
    .limit(1);
  if (duplicate) {
    throw new HttpError(409, '桌号已存在，请更换');
  }

  let id = input.id;
  if (id) {
    const [result] = await dbClient.db
      .update(schema.diningTable)
      .set({
        areaId: input.areaId,
        tableName: input.name,
        seats: input.seats ?? null,
      })
      .where(and(eq(schema.diningTable.id, id), eq(schema.diningTable.isDeleted, 0)));
    if (result.affectedRows === 0) {
      throw new HttpError(404, '桌台不存在');
    }
  } else {
    let qrToken = generateQrToken();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [exists] = await dbClient.db
        .select({ id: schema.diningTable.id })
        .from(schema.diningTable)
        .where(eq(schema.diningTable.qrToken, qrToken))
        .limit(1);
      if (!exists) {
        break;
      }
      qrToken = generateQrToken();
    }
    const [result] = await dbClient.db.insert(schema.diningTable).values({
      areaId: input.areaId,
      tableName: input.name,
      seats: input.seats ?? null,
      qrToken,
      sessionToken: generateSessionToken(),
    });
    id = result.insertId;
  }

  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'TABLE_SAVE',
    target: input.name,
    detail: input.id ? '编辑桌台' : '新增桌台',
    ip,
  });
  return { id };
}

export async function deleteTable(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const [table] = await dbClient.db
    .select({ name: schema.diningTable.tableName })
    .from(schema.diningTable)
    .where(and(eq(schema.diningTable.id, id), eq(schema.diningTable.isDeleted, 0)))
    .limit(1);
  if (!table) {
    throw new HttpError(404, '桌台不存在');
  }
  const [pending] = await dbClient.db
    .select({ total: count() })
    .from(schema.orders)
    .where(and(eq(schema.orders.tableId, id), eq(schema.orders.status, 'PENDING')));
  if (Number(pending?.total ?? 0) > 0) {
    throw new HttpError(409, '该桌台还有未结算订单，请先结算或取消');
  }
  await dbClient.db
    .update(schema.diningTable)
    .set({ isDeleted: 1 })
    .where(eq(schema.diningTable.id, id));
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'TABLE_DELETE',
    target: table.name,
    detail: '删除桌台',
    ip,
  });
}

/** 顾客端按二维码令牌定位桌台。 */
export async function getTableByToken(token: string): Promise<PublicTableInfo> {
  const query = tableByTokenQuery(token);
  const row = await dbClient.queryOne<{
    id: number;
    name: string;
    areaName: string;
    seats: number | null;
    qrToken: string;
    sessionToken: string;
  }>(query.sql, query.params);
  if (!row) {
    throw new HttpError(404, '桌台二维码无效，请联系服务员重新扫码');
  }
  const { sessionToken: _sessionToken, ...publicTable } = row;
  return publicTable;
}

/** 内部使用：读取桌台当前就餐会话（不对外暴露）。 */
export async function getTableSessionByToken(
  token: string,
): Promise<{ id: number; name: string; sessionToken: string }> {
  const query = tableByTokenQuery(token);
  const row = await dbClient.queryOne<{
    id: number;
    name: string;
    sessionToken: string;
  }>(query.sql, query.params);
  if (!row) {
    throw new HttpError(404, '桌台二维码无效，请联系服务员重新扫码');
  }
  return row;
}

/** 收银台首页：今日摘要 + 按区域分组的桌台卡片（含未结订单摘要）。 */
export async function getCashierOverview(): Promise<CashierOverview> {
  const tableQuery = tablesWithAreaQuery();
  const statsQuery = cashierTodayStatsQuery();
  const [areas, tableRows, pending, todayStats] = await Promise.all([
    listAreas(),
    dbClient.query<TableRow>(tableQuery.sql, tableQuery.params),
    loadPendingOrders(),
    dbClient.queryOne<{
      todayOrderCount: number;
      settledCount: number;
      todayRevenue: number;
    }>(statsQuery.sql, statsQuery.params),
  ]);

  const pendingMap = groupPending(pending);

  const groups: AreaGroup[] = areas.map((area) => ({
    id: area.id,
    name: area.name,
    tables: [],
  }));
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  for (const row of tableRows) {
    const entry = pendingMap.get(row.id);
    const card: TableCard = {
      id: row.id,
      name: row.name,
      areaId: row.areaId,
      areaName: row.areaName,
      seats: row.seats,
      status: entry?.status ?? 'FREE',
      pendingOrderCount: entry?.orders.length ?? 0,
      pendingAmount: entry?.amount ?? 0,
      orders: entry?.orders ?? [],
    };
    groupMap.get(row.areaId)?.tables.push(card);
  }

  const occupied = tableRows.filter((row) => {
    const status = pendingMap.get(row.id)?.status;
    return status === 'OCCUPIED' || status === 'HUNG';
  }).length;
  const pendingCount = pending.filter((row) => row.hungFlag === 0).length;
  const hungCount = pending.filter((row) => row.hungFlag === 1).length;
  const settledCount = Number(todayStats?.settledCount ?? 0);
  const revenue = Number(todayStats?.todayRevenue ?? 0);

  const stats: CashierStats = {
    todayOrderCount: Number(todayStats?.todayOrderCount ?? 0),
    todayRevenue: round2(revenue),
    pendingOrderCount: pendingCount,
    hungOrderCount: hungCount,
    occupiedTables: occupied,
    totalTables: tableRows.length,
    averagePerOrder: settledCount > 0 ? round2(revenue / settledCount) : 0,
  };

  return {
    stats,
    areas: groups.filter((group) => group.tables.length > 0),
  };
}
