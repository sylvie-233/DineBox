/** 订单流水路由：筛选、详情与 Excel 导出（需要「订单流水」菜单权限）。 */
import { createRoute } from '@hono/zod-openapi';

import * as orderController from '../../controllers/admin/order.controller.js';
import { authenticate, requireMenu } from '../../middleware/auth.js';
import {
  binaryResponse,
  dataSchema,
  errorResponses,
  idParamsSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { orderListQuerySchema } from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireMenu('orders')];

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 订单'],
  summary: '历史订单筛选（时间段 / 桌号 / 订单号 / 状态）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { query: orderListQuerySchema },
  responses: { 200: successResponse(dataSchema, '订单分页'), ...errorResponses },
});
router.openapi(
  listRoute,
  routeHandler(listRoute, async (c) => orderController.list(c, c.req.valid('query'))),
);

const tablesRoute = createRoute({
  method: 'get',
  path: '/tables',
  tags: ['后台 · 订单'],
  summary: '订单筛选用的桌台选项',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '桌台选项'), ...errorResponses },
});
router.openapi(
  tablesRoute,
  routeHandler(tablesRoute, async (c) => orderController.tables(c)),
);

const exportRoute = createRoute({
  method: 'get',
  path: '/export',
  tags: ['后台 · 订单'],
  summary: '按当前筛选导出 Excel（对账）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { query: orderListQuerySchema },
  responses: {
    200: binaryResponse(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Excel 文件',
    ),
    ...errorResponses,
  },
});
router.openapi(
  exportRoute,
  routeHandler(exportRoute, async (c) => orderController.exportFile(c, c.req.valid('query'))),
);

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['后台 · 订单'],
  summary: '订单详情',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '订单详情'), ...errorResponses },
});
router.openapi(
  detailRoute,
  routeHandler(detailRoute, async (c) => orderController.detail(c, c.req.valid('param').id)),
);

export default router;
