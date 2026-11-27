import type { OrderStatus, PayMethod } from './common.js';
import type { PageResult } from './common.js';

/** 订单明细上的加料快照。 */
export interface OrderAddonSnapshot {
  id: number;
  addonId: number | null;
  name: string;
  price: number;
  qty: number;
}

/** 订单明细（快照字段不随菜品改动）。 */
export interface OrderItem {
  id: number;
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
  addons: OrderAddonSnapshot[];
}

/** 订单完整数据。 */
export interface Order {
  id: number;
  orderNo: string;
  tableId: number;
  tableName: string;
  areaName: string;
  peopleCount: number;
  status: OrderStatus;
  hungFlag: boolean;
  totalAmount: number;
  roundOffAmount: number;
  payableAmount: number;
  remark: string;
  payMethod: PayMethod | null;
  settledBy: number | null;
  settledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItem[];
  itemCount: number;
  returnAmount: number;
}

/** 订单列表行（不含明细）。 */
export interface OrderListItem {
  id: number;
  orderNo: string;
  tableId: number;
  tableName: string;
  areaName: string;
  peopleCount: number;
  status: OrderStatus;
  hungFlag: boolean;
  totalAmount: number;
  roundOffAmount: number;
  payableAmount: number;
  payMethod: PayMethod | null;
  itemCount: number;
  remark: string;
  settledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/** 订单列表结果：分页数据 + 当前筛选合计（对账摘要）。 */
export interface OrderListResult extends PageResult<OrderListItem> {
  summary: {
    count: number;
    totalAmount: number;
    payableAmount: number;
  };
}

/** 顾客下单的单品入参：规格按组选一个选项；加料按项带份数。 */
export interface OrderItemInput {
  dishId: number;
  qty: number;
  specOptionIds: number[];
  addons: Array<{ addonId: number; qty: number }>;
}

/** 顾客提交订单。 */
export interface CreateOrderInput {
  tableToken: string;
  peopleCount: number;
  remark?: string;
  items: OrderItemInput[];
}

/** 改单：existing 调整数量/规格/加料，newItems 追加菜品。 */
export interface ModifyOrderInput {
  remark?: string;
  items: Array<{
    itemId: number;
    qty: number;
    /** 省略表示只改数量，保留原规格/加料；提供则按当前菜品重新计价。 */
    specOptionIds?: number[];
    addons?: Array<{ addonId: number; qty: number }>;
  }>;
  newItems: OrderItemInput[];
}

/** 单品退菜。 */
export interface ReturnItemsInput {
  itemIds: number[];
  reason?: string;
}

/** 结算入参。 */
export interface SettleOrderInput {
  payMethod: PayMethod;
  /** 结算时是否应用抹零；缺省按系统开关。 */
  roundOff?: boolean;
}

/** 订单列表筛选。 */
export interface OrderListQuery {
  kw?: string;
  range?: 'all' | 'today' | '7d' | 'custom';
  from?: string;
  to?: string;
  tableId?: number;
  status?: 'PENDING' | 'HUNG' | 'SETTLED' | 'CANCELLED';
  page?: number;
  pageSize?: number;
}

/** 顾客端“我的订单”列表项（按桌台维度）。 */
export interface PublicOrderListItem {
  id: number;
  orderNo: string;
  peopleCount: number;
  status: OrderStatus;
  hungFlag: boolean;
  totalAmount: number;
  payableAmount: number;
  remark: string;
  createdAt: string;
  settledAt: string | null;
  items: OrderItem[];
  itemCount: number;
}
