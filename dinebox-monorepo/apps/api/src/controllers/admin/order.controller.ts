/** 订单流水控制器：分页查询、详情与 Excel 导出。 */
import type { OrderListQuery } from '@dinebox/types';

import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import {
  exportOrders,
  getOrder,
  listOrders,
  listTableOptions,
} from '../../services/admin/order.service.js';

export async function list(c: AppContext, query: OrderListQuery) {
  return success(c, await listOrders(query));
}

export async function detail(c: AppContext, id: number) {
  return success(c, await getOrder(id));
}

export async function tables(c: AppContext) {
  return success(c, await listTableOptions());
}

export async function exportFile(c: AppContext, query: OrderListQuery) {
  const result = await exportOrders(query);
  return c.body(result.buffer as unknown as ArrayBuffer, 200, {
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    'X-Export-Count': String(result.count),
  });
}
