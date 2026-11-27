/** 顾客端控制器：启动数据、桌台校验、下单与我的订单。 */
import type {
  CreateOrderInput,
} from '@dinebox/types';

import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { getRequestIp } from '../utils/request.js';
import { createOrder, getPublicOrder, listPublicOrders } from '../services/admin/order.service.js';
import { getBootstrap, getTable } from '../services/public.service.js';

export function bootstrap(c: AppContext, tableToken: string) {
  return getBootstrap(tableToken).then((data) => success(c, data, '获取菜单成功'));
}

export function table(c: AppContext, tableToken: string) {
  return getTable(tableToken).then((data) => success(c, data));
}

export async function create(c: AppContext, input: CreateOrderInput) {
  const order = await createOrder(input, getRequestIp(c) ?? null);
  return success(c, order, '下单成功', 201);
}

export async function myOrders(c: AppContext, tableToken: string) {
  const list = await listPublicOrders(tableToken);
  return success(c, list);
}

export async function orderDetail(c: AppContext, tableToken: string, orderNo: string) {
  const order = await getPublicOrder(tableToken, orderNo);
  return success(c, order);
}
