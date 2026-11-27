/**
 * 订单服务：顾客下单、收银改单/退菜/挂单/取消/结算、订单流水与导出。
 *
 * 关键口径：
 * - 下单与改单按当前菜品数据快照名称/规格/加料/单价；
 * - 订单合计 = Σ 未退明细小计；抹零仅在结算时计算并落库；
 * - 后厨单 / 结账单打印为异步短连接，不阻塞业务响应。
 *
 * 所有手写 SQL 位于 `src/sql/order.sql.ts` 与 `src/sql/table.sql.ts`；
 * 本文件只负责事务编排与业务规则。
 */
import type {
  CreateOrderInput,
  ModifyOrderInput,
  Order,
  OrderListItem,
  OrderListQuery,
  OrderListResult,
  PublicOrderListItem,
  ReturnItemsInput,
  SettleOrderInput,
} from '@dinebox/types';
import { calcRoundOff, round2 } from '@dinebox/utils';
import * as XLSX from 'xlsx';

import { dbClient, executeOn, queryOn, queryOneOn } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { moduleLogger } from '../../utils/logger.js';
import { buildOrderNo, temporaryOrderNo } from '../../utils/order-no.js';
import { pageMeta, pageOffset } from '../../sql/shared.js';
import {
  cancelOrderQuery,
  deleteItemAddonsQuery,
  insertOrderItemAddonQuery,
  insertOrderQuery,
  markItemReturnedQuery,
  orderByNoAndTableQuery,
  orderCountQuery,
  orderExistingItemsQuery,
  orderListQuery,
  orderSummaryQuery,
  publicOrderIdsQuery,
  returnableItemsQuery,
  setHungQuery,
  settleOrderQuery,
  tableOptionsQuery,
  updateItemQtyOnlyQuery,
  updateItemSnapshotQuery,
  updateOrderNoQuery,
  updateOrderRemarkQuery,
} from '../../sql/order.sql.js';
import { tableByTokenQuery } from '../../sql/table.sql.js';
import { writeOperationLog } from '../audit.service.js';
import { getShopConfig } from '../config.service.js';
import {
  assertEditable,
  buildItemSnapshot,
  insertItemSnapshot,
  loadDishPricing,
  loadOrderDetail,
  loadOrderDetails,
  lockOrder,
  recalcOrderTotal,
  type ItemSnapshot,
} from '../order.repository.js';
import { getTableByToken } from './table.service.js';
import { dispatchOrderPrint } from './print.service.js';

const log = moduleLogger('order');

function itemCountOf(order: Order): number {
  return order.items
    .filter((item) => item.status === 'NORMAL')
    .reduce((sum, item) => sum + item.qty, 0);
}

function addonText(snapshot: ItemSnapshot): string {
  return snapshot.addons.map((addon) => `${addon.name}×${addon.qty}`).join('、');
}

function summaryOfOrder(order: Order): string {
  return `${order.tableName} · ${itemCountOf(order)} 件 · ¥${order.totalAmount.toFixed(2)}`;
}

/* ========================= 顾客下单 ========================= */

export async function createOrder(input: CreateOrderInput, ip: string | null): Promise<Order> {
  const created = await dbClient.transaction(async (conn) => {
    const tableQuery = tableByTokenQuery(input.tableToken);
    const table = await queryOneOn<{ id: number; name: string }>(
      conn,
      tableQuery.sql,
      tableQuery.params,
    );
    if (!table) {
      throw new HttpError(404, '桌台二维码无效，请联系服务员重新扫码');
    }

    const dishIds = [...new Set(input.items.map((item) => item.dishId))];
    const pricing = await loadDishPricing(conn, dishIds);

    const insert = insertOrderQuery({
      temporaryNo: temporaryOrderNo(),
      tableId: table.id,
      peopleCount: input.peopleCount,
      remark: input.remark ?? '',
    });
    const inserted = await executeOn(conn, insert.sql, insert.params);
    const orderId = inserted.insertId;
    const orderNo = buildOrderNo(orderId);
    const updateNo = updateOrderNoQuery(orderId, orderNo);
    await executeOn(conn, updateNo.sql, updateNo.params);

    for (const item of input.items) {
      const snapshot = buildItemSnapshot(pricing.get(item.dishId), item);
      await insertItemSnapshot(conn, orderId, snapshot);
    }
    await recalcOrderTotal(conn, orderId);
    return { orderId, orderNo, tableName: table.name };
  });

  const order = await loadOrderDetail(created.orderId);
  if (!order) {
    throw new HttpError(500, '订单创建后读取失败，请刷新收银台确认');
  }

  await writeOperationLog({
    userId: null,
    username: '顾客',
    action: 'ORDER_CREATE',
    target: order.orderNo,
    detail: `${summaryOfOrder(order)} · 备注：${order.remark || '无'}`,
    ip,
  });

  void dispatchOrderPrint(order, 'KITCHEN', null).catch((error) => {
    log.error('后厨小票下发异常', error, { orderNo: order.orderNo });
  });

  return order;
}

/* ========================= 查询 ========================= */

export async function getOrder(id: number): Promise<Order> {
  const order = await loadOrderDetail(id);
  if (!order) {
    throw new HttpError(404, '订单不存在');
  }
  return order;
}

interface OrderListRow {
  id: number;
  orderNo: string;
  tableId: number;
  tableName: string;
  areaName: string;
  peopleCount: number;
  status: 'PENDING' | 'SETTLED' | 'CANCELLED';
  hungFlag: number;
  totalAmount: number;
  roundOffAmount: number;
  payableAmount: number;
  payMethod: 'CASH' | 'WECHAT_QR' | 'ALIPAY_QR' | 'OTHER' | null;
  itemCount: number;
  remark: string;
  settledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/** 后台订单流水（分页 + 筛选摘要）。 */
export async function listOrders(query: OrderListQuery): Promise<OrderListResult> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(5000, Math.max(1, query.pageSize ?? 10));

  const list = orderListQuery(query, pageSize, pageOffset(page, pageSize));
  const summary = orderSummaryQuery(query);
  const count = orderCountQuery(query);

  const [rows, summaryRow, countRow] = await Promise.all([
    dbClient.query<OrderListRow>(list.sql, list.params),
    dbClient.queryOne<{ count: number; totalAmount: number; payableAmount: number }>(
      summary.sql,
      summary.params,
    ),
    dbClient.queryOne<{ total: number }>(count.sql, count.params),
  ]);

  const total = Number(countRow?.total ?? 0);
  const data: OrderListItem[] = rows.map((row) => ({
    id: row.id,
    orderNo: row.orderNo,
    tableId: row.tableId,
    tableName: row.tableName,
    areaName: row.areaName,
    peopleCount: row.peopleCount,
    status: row.status,
    hungFlag: row.hungFlag === 1,
    totalAmount: Number(row.totalAmount),
    roundOffAmount: Number(row.roundOffAmount),
    payableAmount: Number(row.payableAmount),
    payMethod: row.payMethod,
    itemCount: Number(row.itemCount),
    remark: row.remark,
    settledAt: row.settledAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
  }));

  return {
    list: data,
    ...pageMeta(total, page, pageSize),
    summary: {
      count: Number(summaryRow?.count ?? 0),
      totalAmount: round2(Number(summaryRow?.totalAmount ?? 0)),
      payableAmount: round2(Number(summaryRow?.payableAmount ?? 0)),
    },
  };
}

/** 收银台检索：按订单号 / 桌号模糊匹配，返回分页结果。 */
export async function searchOrders(
  keyword: string,
  page = 1,
  pageSize = 8,
): Promise<OrderListResult> {
  return listOrders({ kw: keyword, range: 'all', page, pageSize });
}

/** 导出 Excel（对账）：按当前筛选条件导出，最多 5000 条。 */
export async function exportOrders(query: OrderListQuery): Promise<{
  buffer: Buffer;
  filename: string;
  count: number;
}> {
  const result = await listOrders({ ...query, page: 1, pageSize: 5000 });
  if (result.list.length === 0) {
    throw new HttpError(400, '当前筛选结果为空，未生成文件');
  }

  const statusLabel: Record<string, string> = {
    PENDING: '待结算',
    SETTLED: '已结清',
    CANCELLED: '已取消',
  };
  const payLabel: Record<string, string> = {
    CASH: '现金',
    WECHAT_QR: '微信静态码',
    ALIPAY_QR: '支付宝静态码',
    OTHER: '其他',
  };

  const sheet = XLSX.utils.json_to_sheet(
    result.list.map((row) => ({
      订单号: row.orderNo,
      桌号: row.tableName,
      区域: row.areaName,
      人数: row.peopleCount,
      下单时间: row.createdAt,
      菜品件数: row.itemCount,
      菜品合计: row.totalAmount.toFixed(2),
      抹零: row.roundOffAmount.toFixed(2),
      应收: row.payableAmount.toFixed(2),
      结算方式: row.payMethod ? payLabel[row.payMethod] : '',
      状态: `${statusLabel[row.status]}${row.hungFlag ? '（挂单）' : ''}`,
      结算时间: row.settledAt ?? '',
      备注: row.remark,
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '订单流水');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  return {
    buffer,
    filename: `DineBox订单流水-${stamp}.xlsx`,
    count: result.list.length,
  };
}

/** 订单流水筛选用的桌台选项。 */
export async function listTableOptions(): Promise<
  Array<{ id: number; name: string; areaName: string }>
> {
  const query = tableOptionsQuery();
  return dbClient.query(query.sql, query.params);
}

/** 顾客端“我的订单”：当前桌台近 7 天与全部未结订单。 */
export async function listPublicOrders(tableToken: string): Promise<PublicOrderListItem[]> {
  const table = await getTableByToken(tableToken);
  const idQuery = publicOrderIdsQuery(table.id);
  const rows = await dbClient.query<{ id: number }>(idQuery.sql, idQuery.params);
  const details = await loadOrderDetails(rows.map((row) => row.id));
  return rows
    .map((row) => details.get(row.id))
    .filter((order): order is Order => Boolean(order))
    .map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      peopleCount: order.peopleCount,
      status: order.status,
      hungFlag: order.hungFlag,
      totalAmount: order.totalAmount,
      payableAmount: order.payableAmount,
      remark: order.remark,
      createdAt: order.createdAt,
      settledAt: order.settledAt,
      items: order.items,
      itemCount: order.itemCount,
    }));
}

/** 顾客端订单详情：必须属于扫码桌台。 */
export async function getPublicOrder(tableToken: string, orderNo: string): Promise<Order> {
  const table = await getTableByToken(tableToken);
  const query = orderByNoAndTableQuery(orderNo, table.id);
  const row = await dbClient.queryOne<{ id: number }>(query.sql, query.params);
  if (!row) {
    throw new HttpError(404, '订单不存在或不属于当前桌台');
  }
  const order = await loadOrderDetail(row.id);
  if (!order) {
    throw new HttpError(404, '订单不存在');
  }
  return order;
}

/* ========================= 收银操作 ========================= */

export async function modifyOrder(
  id: number,
  input: ModifyOrderInput,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  const changeSummary = await dbClient.transaction(async (conn) => {
    const current = await lockOrder(conn, id);
    if (!current) {
      throw new HttpError(404, '订单不存在');
    }
    assertEditable(current);

    const existingQuery = orderExistingItemsQuery(id);
    const existing = await queryOn<{
      id: number;
      dishId: number | null;
      dishName: string;
      qty: number;
      unitPrice: number;
      status: 'NORMAL' | 'RETURNED';
    }>(conn, existingQuery.sql, existingQuery.params);
    const existingMap = new Map(existing.map((row) => [row.id, row]));
    const requestedIds = input.items.map((item) => item.itemId);
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new HttpError(400, '改单明细存在重复项');
    }

    for (const itemInput of input.items) {
      const row = existingMap.get(itemInput.itemId);
      if (!row) {
        throw new HttpError(400, `明细 #${itemInput.itemId} 不属于该订单`);
      }
      if (row.status !== 'NORMAL') {
        throw new HttpError(409, `「${row.dishName}」已退菜，不能再修改`);
      }
    }

    const dishIds = [
      ...new Set([
        ...input.items
          .map((item) => existingMap.get(item.itemId)?.dishId)
          .filter((value): value is number => typeof value === 'number'),
        ...input.newItems.map((item) => item.dishId),
      ]),
    ];
    const pricing = await loadDishPricing(conn, dishIds);

    const changedNames: string[] = [];
    for (const itemInput of input.items) {
      const row = existingMap.get(itemInput.itemId)!;
      const specProvided =
        itemInput.specOptionIds !== undefined || itemInput.addons !== undefined;

      // 只改数量：保留原规格/加料与成交单价，仅重算小计。
      if (!specProvided) {
        const update = updateItemQtyOnlyQuery(
          row.id,
          itemInput.qty,
          round2(Number(row.unitPrice) * itemInput.qty),
        );
        await executeOn(conn, update.sql, update.params);
        changedNames.push(`${row.dishName}×${itemInput.qty}`);
        continue;
      }

      const snapshot = buildItemSnapshot(
        row.dishId ? pricing.get(row.dishId) : undefined,
        {
          dishId: row.dishId ?? 0,
          qty: itemInput.qty,
          specOptionIds: itemInput.specOptionIds ?? [],
          addons: itemInput.addons ?? [],
        },
        true,
      );
      const update = updateItemSnapshotQuery(row.id, snapshot);
      await executeOn(conn, update.sql, update.params);
      const deleteAddons = deleteItemAddonsQuery(row.id);
      await executeOn(conn, deleteAddons.sql, deleteAddons.params);
      for (const addon of snapshot.addons) {
        const addonQuery = insertOrderItemAddonQuery(row.id, addon);
        await executeOn(conn, addonQuery.sql, addonQuery.params);
      }
      changedNames.push(`${row.dishName}×${itemInput.qty}`);
    }

    for (const item of input.newItems) {
      const snapshot = buildItemSnapshot(pricing.get(item.dishId), item);
      await insertItemSnapshot(conn, id, snapshot);
      changedNames.push(
        `新增${snapshot.dishName}×${snapshot.qty}${addonText(snapshot) ? `(${addonText(snapshot)})` : ''}`,
      );
    }

    if (input.remark !== undefined) {
      const updateRemark = updateOrderRemarkQuery(id, input.remark);
      await executeOn(conn, updateRemark.sql, updateRemark.params);
    }
    await recalcOrderTotal(conn, id);
    return changedNames.join('、') || '仅更新备注';
  });

  const order = await getOrder(id);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'ORDER_MODIFY',
    target: order.orderNo,
    detail: `${summaryOfOrder(order)}；${changeSummary}`,
    ip,
  });
  void dispatchOrderPrint(order, 'KITCHEN', operator.id).catch((error) => {
    log.error('改单后厨小票下发异常', error, { orderNo: order.orderNo });
  });
  return order;
}

export async function returnItems(
  id: number,
  input: ReturnItemsInput,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  const returnedSummary = await dbClient.transaction(async (conn) => {
    const current = await lockOrder(conn, id);
    if (!current) {
      throw new HttpError(404, '订单不存在');
    }
    assertEditable(current);

    const query = returnableItemsQuery(id, input.itemIds);
    const rows = await queryOn<{
      id: number;
      dishName: string;
      itemAmount: number;
      status: 'NORMAL' | 'RETURNED';
    }>(conn, query.sql, query.params);
    if (rows.length !== [...new Set(input.itemIds)].length) {
      throw new HttpError(400, '所选明细不属于该订单或已被删除');
    }
    for (const row of rows) {
      if (row.status !== 'NORMAL') {
        throw new HttpError(409, `「${row.dishName}」已退菜，不能重复退`);
      }
      const update = markItemReturnedQuery(row.id, input.reason ?? '', operator.id);
      await executeOn(conn, update.sql, update.params);
    }
    await recalcOrderTotal(conn, id);
    return rows
      .map((row) => `${row.dishName}(¥${Number(row.itemAmount).toFixed(2)})`)
      .join('、');
  });

  const order = await getOrder(id);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'ITEM_RETURN',
    target: order.orderNo,
    detail: `退菜：${returnedSummary}；原因：${input.reason || '未填写'}`,
    ip,
  });
  return order;
}

export async function holdOrder(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  return setHung(id, true, operator, ip);
}

export async function resumeOrder(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  return setHung(id, false, operator, ip);
}

async function setHung(
  id: number,
  hung: boolean,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  const orderNo = await dbClient.transaction(async (conn) => {
    const current = await lockOrder(conn, id);
    if (!current) {
      throw new HttpError(404, '订单不存在');
    }
    assertEditable(current);
    if (current.hungFlag === (hung ? 1 : 0)) {
      throw new HttpError(409, hung ? '该订单已是挂单状态' : '该订单未挂单');
    }
    const update = setHungQuery(id, hung);
    await executeOn(conn, update.sql, update.params);
    return current.orderNo;
  });
  const order = await getOrder(id);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: hung ? 'ORDER_HUNG' : 'ORDER_RESUME',
    target: orderNo,
    detail: `${hung ? '挂单暂存' : '恢复待结算'} · ${summaryOfOrder(order)}`,
    ip,
  });
  return order;
}

export async function cancelOrder(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  const info = await dbClient.transaction(async (conn) => {
    const current = await lockOrder(conn, id);
    if (!current) {
      throw new HttpError(404, '订单不存在');
    }
    assertEditable(current);
    const update = cancelOrderQuery(id);
    await executeOn(conn, update.sql, update.params);
    return { orderNo: current.orderNo };
  });
  const order = await getOrder(id);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'ORDER_CANCEL',
    target: info.orderNo,
    detail: `整单取消 · ${summaryOfOrder(order)}`,
    ip,
  });
  return order;
}

export async function settleOrder(
  id: number,
  input: SettleOrderInput,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<Order> {
  const shop = await getShopConfig();
  // 全局开关优先：关闭抹零时，收银端不得通过传参绕过。
  const applyRoundOff = shop.roundOffEnabled && (input.roundOff ?? true);
  const rule = applyRoundOff ? shop.roundOffRule : 'NONE';

  const result = await dbClient.transaction(async (conn) => {
    const current = await lockOrder(conn, id);
    if (!current) {
      throw new HttpError(404, '订单不存在');
    }
    if (current.status !== 'PENDING') {
      throw new HttpError(409, '订单已结算或已取消，不能重复结算');
    }
    if (current.hungFlag === 1) {
      throw new HttpError(409, '挂单订单请先恢复为待结算再结算');
    }

    const total = await recalcOrderTotal(conn, id);
    const off = calcRoundOff(total, rule);
    const payable = round2(total - off);
    const update = settleOrderQuery({
      id,
      total,
      off,
      payable,
      payMethod: input.payMethod,
      operatorId: operator.id,
    });
    await executeOn(conn, update.sql, update.params);
    return { orderNo: current.orderNo, off, payable };
  });

  const order = await getOrder(id);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'ORDER_SETTLE',
    target: result.orderNo,
    detail: `${summaryOfOrder(order)} · ${input.payMethod} · 抹零¥${result.off.toFixed(2)} · 实收¥${result.payable.toFixed(2)}`,
    ip,
  });

  void dispatchOrderPrint(order, 'BILL', operator.id).catch((error) => {
    log.error('结账单下发异常', error, { orderNo: order.orderNo });
  });

  return order;
}
