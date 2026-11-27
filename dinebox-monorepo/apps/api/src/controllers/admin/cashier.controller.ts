/** 收银台控制器：桌台概览、订单检索与全部收银操作。 */
import type {
  ModifyOrderInput,
  ReturnItemsInput,
  SettleOrderInput,
} from '@dinebox/types';

import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import { getCashierOverview } from '../../services/admin/table.service.js';
import { getPublicMenu } from '../../services/admin/catalog.service.js';
import {
  cancelOrder,
  getOrder,
  holdOrder,
  modifyOrder,
  resumeOrder,
  returnItems,
  searchOrders,
  settleOrder,
} from '../../services/admin/order.service.js';

export async function overview(c: AppContext) {
  return success(c, await getCashierOverview());
}

/** 改单面板使用的菜品数据：含规格、加料与售罄标记。 */
export async function menu(c: AppContext) {
  return success(c, await getPublicMenu());
}

export async function orderDetail(c: AppContext, id: number) {
  return success(c, await getOrder(id));
}

export async function search(c: AppContext, keyword: string, page: number, pageSize: number) {
  return success(c, await searchOrders(keyword, page, pageSize));
}

export async function modify(c: AppContext, id: number, input: ModifyOrderInput) {
  const user = operatorOf(c);
  return success(c, await modifyOrder(id, input, user, ipOf(c)), '改单成功');
}

export async function returnItemsHandler(c: AppContext, id: number, input: ReturnItemsInput) {
  const user = operatorOf(c);
  return success(c, await returnItems(id, input, user, ipOf(c)), '退菜成功');
}

export async function hold(c: AppContext, id: number) {
  const user = operatorOf(c);
  return success(c, await holdOrder(id, user, ipOf(c)), '已挂单');
}

export async function resume(c: AppContext, id: number) {
  const user = operatorOf(c);
  return success(c, await resumeOrder(id, user, ipOf(c)), '已恢复待结算');
}

export async function cancel(c: AppContext, id: number) {
  const user = operatorOf(c);
  return success(c, await cancelOrder(id, user, ipOf(c)), '订单已取消');
}

export async function settle(c: AppContext, id: number, input: SettleOrderInput) {
  const user = operatorOf(c);
  return success(c, await settleOrder(id, input, user, ipOf(c)), '结算成功');
}
