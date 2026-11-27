/**
 * 订单仓储层：订单头 / 明细 / 明细加料的读取与组装，
 * 以及下单 / 改单共用的菜品计价快照逻辑（规格、加料、单价）。
 *
 * 本文件只做数据访问与校验，不触发打印、不写操作日志。
 * 所有 SQL 来自 `src/sql/order.sql.ts`。
 */
import type {
  Order,
  OrderAddonSnapshot,
  OrderItem,
  OrderItemInput,
  SpecOption,
} from '@dinebox/types';
import { round2 } from '@dinebox/utils';

import { dbClient, executeOn, queryOn, queryOneOn, type TransactionConnection } from '../db/index.js';
import {
  boundAddonPricingQuery,
  dishPricingQuery,
  insertOrderItemAddonQuery,
  insertOrderItemQuery,
  lockOrderQuery,
  orderAddonsByItemIdsQuery,
  orderHeadersByIdsQuery,
  orderItemsByOrderIdsQuery,
  recalcOrderTotalQuery,
  specPricingQuery,
  sumNormalItemsQuery,
} from '../sql/order.sql.js';
import { placeholders } from '../sql/shared.js';
import { HttpError } from '../utils/http.js';

export interface OrderHeaderRow {
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
  remark: string;
  payMethod: 'CASH' | 'WECHAT_QR' | 'ALIPAY_QR' | 'OTHER' | null;
  settledBy: number | null;
  settledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

interface OrderItemRow {
  id: number;
  orderId: number;
  dishId: number | null;
  dishName: string;
  specText: string;
  specExtraPrice: number;
  unitPrice: number;
  qty: number;
  itemAmount: number;
  status: 'NORMAL' | 'RETURNED';
  returnReason: string;
  returnedAt: string | null;
}

interface OrderAddonRow {
  id: number;
  itemId: number;
  addonId: number | null;
  name: string;
  price: number;
  qty: number;
}

function toItems(
  itemRows: OrderItemRow[],
  addonRows: OrderAddonRow[],
): Map<number, OrderItem[]> {
  const addonMap = new Map<number, OrderAddonSnapshot[]>();
  for (const row of addonRows) {
    const list = addonMap.get(row.itemId) ?? [];
    list.push({
      id: row.id,
      addonId: row.addonId,
      name: row.name,
      price: Number(row.price),
      qty: row.qty,
    });
    addonMap.set(row.itemId, list);
  }

  const result = new Map<number, OrderItem[]>();
  for (const row of itemRows) {
    const list = result.get(row.orderId) ?? [];
    list.push({
      id: row.id,
      dishId: row.dishId,
      dishName: row.dishName,
      specText: row.specText,
      specExtraPrice: Number(row.specExtraPrice),
      unitPrice: Number(row.unitPrice),
      qty: row.qty,
      itemAmount: Number(row.itemAmount),
      status: row.status,
      returnReason: row.returnReason,
      returnedAt: row.returnedAt,
      addons: addonMap.get(row.id) ?? [],
    });
    result.set(row.orderId, list);
  }
  return result;
}

function toOrder(row: OrderHeaderRow, items: OrderItem[]): Order {
  const itemCount = items
    .filter((item) => item.status === 'NORMAL')
    .reduce((sum, item) => sum + item.qty, 0);
  const returnAmount = round2(
    items
      .filter((item) => item.status === 'RETURNED')
      .reduce((sum, item) => sum + item.itemAmount, 0),
  );
  return {
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
    remark: row.remark,
    payMethod: row.payMethod,
    settledBy: row.settledBy,
    settledAt: row.settledAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    items,
    itemCount,
    returnAmount,
  };
}

/** 批量读取订单详情（头 + 明细 + 加料）。 */
export async function loadOrderDetails(ids: number[]): Promise<Map<number, Order>> {
  const result = new Map<number, Order>();
  if (ids.length === 0) {
    return result;
  }
  const headerQuery = orderHeadersByIdsQuery(ids);
  const headers = await dbClient.query<OrderHeaderRow>(headerQuery.sql, headerQuery.params);
  if (headers.length === 0) {
    return result;
  }
  const orderIds = headers.map((row) => row.id);
  const itemQuery = orderItemsByOrderIdsQuery(orderIds);
  const itemRows = await dbClient.query<OrderItemRow>(itemQuery.sql, itemQuery.params);

  let addonRows: OrderAddonRow[] = [];
  if (itemRows.length > 0) {
    const addonQuery = orderAddonsByItemIdsQuery(itemRows.map((row) => row.id));
    addonRows = await dbClient.query<OrderAddonRow>(addonQuery.sql, addonQuery.params);
  }

  const itemsByOrder = toItems(itemRows, addonRows);
  for (const header of headers) {
    result.set(header.id, toOrder(header, itemsByOrder.get(header.id) ?? []));
  }
  return result;
}

/** 单条订单详情；不存在返回 null。 */
export async function loadOrderDetail(id: number): Promise<Order | null> {
  const map = await loadOrderDetails([id]);
  return map.get(id) ?? null;
}

/** 事务内锁订单并读取状态；不存在返回 null。 */
export async function lockOrder(
  conn: TransactionConnection,
  id: number,
): Promise<{
  id: number;
  orderNo: string;
  status: 'PENDING' | 'SETTLED' | 'CANCELLED';
  hungFlag: number;
  totalAmount: number;
  remark: string;
  tableId: number;
} | null> {
  const query = lockOrderQuery(id);
  return queryOneOn(conn, query.sql, query.params);
}

/** 校验订单可编辑（待结算，含挂单）。 */
export function assertEditable(order: { status: string; orderNo: string }): void {
  if (order.status !== 'PENDING') {
    throw new HttpError(
      409,
      `订单 ${order.orderNo} 已${order.status === 'SETTLED' ? '结清' : '取消'}，不能再修改`,
    );
  }
}

/** 重算订单合计（仅正常明细计入）并同步应收。 */
export async function recalcOrderTotal(
  conn: TransactionConnection,
  orderId: number,
): Promise<number> {
  const sumQuery = sumNormalItemsQuery(orderId);
  const row = await queryOneOn<{ total: number }>(conn, sumQuery.sql, sumQuery.params);
  const total = round2(Number(row?.total ?? 0));
  const update = recalcOrderTotalQuery(orderId, total);
  await executeOn(conn, update.sql, update.params);
  return total;
}

/* ========================= 菜品计价快照 ========================= */

interface DishPricingRow {
  id: number;
  name: string;
  price: number;
  status: 'ON' | 'OFF';
  soldOut: number;
  categoryStatus: string;
}

interface SpecGroupRow {
  groupId: number;
  dishId: number;
  groupName: string;
  groupSort: number;
  optionId: number | null;
  optionName: string | null;
  priceDiff: number | null;
  optionSort: number | null;
}

interface BoundAddonRow {
  dishId: number;
  addonId: number;
  name: string;
  price: number;
  maxSelect: number;
}

export interface DishPricing {
  id: number;
  name: string;
  price: number;
  status: 'ON' | 'OFF';
  soldOut: boolean;
  categoryStatus: string;
  groups: Array<{
    id: number;
    name: string;
    options: Array<SpecOption & { name: string }>;
  }>;
  addons: Map<number, { id: number; name: string; price: number; maxSelect: number }>;
}

/** 事务内批量加载菜品、规格与加料绑定，用于按当前数据计价。 */
export async function loadDishPricing(
  conn: TransactionConnection,
  dishIds: number[],
): Promise<Map<number, DishPricing>> {
  const result = new Map<number, DishPricing>();
  if (dishIds.length === 0) {
    return result;
  }

  const dishQuery = dishPricingQuery(dishIds);
  const dishes = await queryOn<DishPricingRow>(conn, dishQuery.sql, dishQuery.params);
  for (const dish of dishes) {
    result.set(dish.id, {
      id: dish.id,
      name: dish.name,
      price: Number(dish.price),
      status: dish.status,
      soldOut: dish.soldOut === 1,
      categoryStatus: dish.categoryStatus,
      groups: [],
      addons: new Map(),
    });
  }

  const specQuery = specPricingQuery(dishIds);
  const specRows = await queryOn<SpecGroupRow>(conn, specQuery.sql, specQuery.params);
  const groupMap = new Map<
    number,
    { id: number; name: string; dishId: number; options: Array<SpecOption & { name: string }> }
  >();
  for (const row of specRows) {
    let group = groupMap.get(row.groupId);
    if (!group) {
      group = { id: row.groupId, name: row.groupName, dishId: row.dishId, options: [] };
      groupMap.set(row.groupId, group);
      result.get(row.dishId)?.groups.push(group);
    }
    if (row.optionId !== null && row.optionName !== null) {
      group.options.push({
        id: row.optionId,
        name: row.optionName,
        priceDiff: Number(row.priceDiff ?? 0),
        sort: Number(row.optionSort ?? 0),
      });
    }
  }

  const addonQuery = boundAddonPricingQuery(dishIds);
  const addonRows = await queryOn<BoundAddonRow>(conn, addonQuery.sql, addonQuery.params);
  for (const row of addonRows) {
    result.get(row.dishId)?.addons.set(row.addonId, {
      id: row.addonId,
      name: row.name,
      price: Number(row.price),
      maxSelect: Number(row.maxSelect),
    });
  }

  return result;
}

export interface ItemSnapshot {
  dishId: number;
  dishName: string;
  specText: string;
  specExtraPrice: number;
  unitPrice: number;
  qty: number;
  itemAmount: number;
  addons: Array<{ addonId: number; name: string; price: number; qty: number }>;
}

/**
 * 由当前菜品数据生成明细快照：规格逐组必选、加料限选校验、单价含加料。
 * `allowSoldOut` 用于改单已有明细（菜品下单后售罄仍可改数量/规格）。
 */
export function buildItemSnapshot(
  pricing: DishPricing | undefined,
  input: OrderItemInput,
  allowSoldOut = false,
): ItemSnapshot {
  if (!pricing || pricing.categoryStatus !== 'ENABLED' || pricing.status !== 'ON') {
    throw new HttpError(400, `菜品 #${input.dishId} 已下架或不存在，请重新选择`);
  }
  if (pricing.soldOut && !allowSoldOut) {
    throw new HttpError(409, `「${pricing.name}」已售罄，请移除后重新提交`);
  }

  const selectedIds = [...new Set(input.specOptionIds ?? [])];
  const knownOptionIds = new Set(
    pricing.groups.flatMap((group) => group.options.map((option) => option.id)),
  );
  for (const optionId of selectedIds) {
    if (!knownOptionIds.has(optionId)) {
      throw new HttpError(400, '所选规格不属于该菜品，请重新选择');
    }
  }

  const specNames: string[] = [];
  let specExtra = 0;
  for (const group of pricing.groups) {
    const chosen = group.options.filter((option) => selectedIds.includes(option.id));
    if (chosen.length === 0) {
      throw new HttpError(400, `请选择「${group.name}」规格`);
    }
    if (chosen.length > 1) {
      throw new HttpError(400, `「${group.name}」只能选择一个选项`);
    }
    const option = chosen[0]!;
    specNames.push(option.name);
    specExtra = round2(specExtra + Number(option.priceDiff));
  }

  const addonQty = new Map<number, number>();
  for (const addon of input.addons ?? []) {
    addonQty.set(addon.addonId, (addonQty.get(addon.addonId) ?? 0) + addon.qty);
  }
  const addons: ItemSnapshot['addons'] = [];
  let addonTotal = 0;
  for (const [addonId, qty] of addonQty) {
    const bound = pricing.addons.get(addonId);
    if (!bound) {
      throw new HttpError(400, `加料 #${addonId} 未绑定到「${pricing.name}」`);
    }
    if (qty < 1) {
      continue;
    }
    if (bound.maxSelect > 0 && qty > bound.maxSelect) {
      throw new HttpError(400, `「${bound.name}」每单最多选 ${bound.maxSelect} 份`);
    }
    addons.push({ addonId, name: bound.name, price: Number(bound.price), qty });
    addonTotal = round2(addonTotal + Number(bound.price) * qty);
  }

  const unitPrice = round2(Number(pricing.price) + specExtra + addonTotal);
  if (unitPrice < 0) {
    throw new HttpError(400, `「${pricing.name}」的规格差价导致单价为负，请检查配置`);
  }

  return {
    dishId: pricing.id,
    dishName: pricing.name,
    specText: specNames.join('/'),
    specExtraPrice: specExtra,
    unitPrice,
    qty: input.qty,
    itemAmount: round2(unitPrice * input.qty),
    addons,
  };
}

/** 插入订单明细与加料快照，返回明细 ID。 */
export async function insertItemSnapshot(
  conn: TransactionConnection,
  orderId: number,
  snapshot: ItemSnapshot,
): Promise<number> {
  const itemQuery = insertOrderItemQuery(orderId, snapshot);
  const result = await executeOn(conn, itemQuery.sql, itemQuery.params);
  for (const addon of snapshot.addons) {
    const addonQuery = insertOrderItemAddonQuery(result.insertId, addon);
    await executeOn(conn, addonQuery.sql, addonQuery.params);
  }
  return result.insertId;
}

/** 订单明细 ID 的占位符工具，供服务拼装 IN 查询时复用。 */
export function itemIdPlaceholders(count: number): string {
  return placeholders(count);
}
