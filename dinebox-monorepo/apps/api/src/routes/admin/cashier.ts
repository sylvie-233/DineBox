/** 收银台路由：桌台概览、订单检索、改单/退菜/挂单/取消/结算。 */
import { createRoute, z } from '@hono/zod-openapi';

import * as cashierController from '../../controllers/admin/cashier.controller.js';
import { authenticate, requireMenu } from '../../middleware/auth.js';
import {
  dataSchema,
  errorResponses,
  idParamsSchema,
  jsonBody,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import {
  cashierSearchSchema,
  modifyOrderSchema,
  returnItemsSchema,
  settleSchema,
} from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireMenu('cashier')];

const overviewRoute = createRoute({
  method: 'get',
  path: '/overview',
  tags: ['后台 · 收银台'],
  summary: '桌台概览与今日摘要',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '收银台数据'), ...errorResponses },
});
router.openapi(
  overviewRoute,
  routeHandler(overviewRoute, async (c) => cashierController.overview(c)),
);

const menuRoute = createRoute({
  method: 'get',
  path: '/menu',
  tags: ['后台 · 收银台'],
  summary: '改单面板菜品数据（规格 / 加料 / 售罄）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '菜品数据'), ...errorResponses },
});
router.openapi(
  menuRoute,
  routeHandler(menuRoute, async (c) => cashierController.menu(c)),
);

const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  tags: ['后台 · 收银台'],
  summary: '按订单号 / 桌号检索订单',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { query: cashierSearchSchema },
  responses: { 200: successResponse(dataSchema, '检索结果'), ...errorResponses },
});
router.openapi(
  searchRoute,
  routeHandler(searchRoute, async (c) => {
    const { kw, page, pageSize } = c.req.valid('query');
    return cashierController.search(c, kw, page, pageSize);
  }),
);

const orderDetailRoute = createRoute({
  method: 'get',
  path: '/orders/{id}',
  tags: ['后台 · 收银台'],
  summary: '订单详情（含明细与加料）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '订单详情'), ...errorResponses },
});
router.openapi(
  orderDetailRoute,
  routeHandler(orderDetailRoute, async (c) =>
    cashierController.orderDetail(c, c.req.valid('param').id),
  ),
);

const modifyRoute = createRoute({
  method: 'post',
  path: '/orders/{id}/modify',
  tags: ['后台 · 收银台'],
  summary: '改单：调整数量/规格/加料、追加菜品、修改备注',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(modifyOrderSchema) },
  responses: { 200: successResponse(dataSchema, '改单成功'), ...errorResponses },
});
router.openapi(
  modifyRoute,
  routeHandler(modifyRoute, async (c) =>
    cashierController.modify(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const returnRoute = createRoute({
  method: 'post',
  path: '/orders/{id}/return',
  tags: ['后台 · 收银台'],
  summary: '单品退菜（可选原因）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(returnItemsSchema) },
  responses: { 200: successResponse(dataSchema, '退菜成功'), ...errorResponses },
});
router.openapi(
  returnRoute,
  routeHandler(returnRoute, async (c) =>
    cashierController.returnItemsHandler(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

for (const action of ['hold', 'resume', 'cancel'] as const) {
  const route = createRoute({
    method: 'post',
    path: `/orders/{id}/${action}`,
    tags: ['后台 · 收银台'],
    summary:
      action === 'hold' ? '挂单暂存' : action === 'resume' ? '恢复待结算' : '整单取消',
    security: [{ BearerAuth: [] }],
    middleware: guard,
    request: { params: idParamsSchema },
    responses: { 200: successResponse(dataSchema), ...errorResponses },
  });
  router.openapi(
    route,
    routeHandler(route, async (c) => {
      const id = c.req.valid('param').id;
      if (action === 'hold') return cashierController.hold(c, id);
      if (action === 'resume') return cashierController.resume(c, id);
      return cashierController.cancel(c, id);
    }),
  );
}

const settleRoute = createRoute({
  method: 'post',
  path: '/orders/{id}/settle',
  tags: ['后台 · 收银台'],
  summary: '确认结算（线下收款后手动执行，自动打印结账单）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(settleSchema) },
  responses: { 200: successResponse(dataSchema, '结算成功'), ...errorResponses },
});
router.openapi(
  settleRoute,
  routeHandler(settleRoute, async (c) =>
    cashierController.settle(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

// 避免 z 未使用的 lint 警告（保留供后续扩展路径参数使用）。
void z;

export default router;
