/** 顾客端路由：扫码启动数据、下单与本桌订单（无需登录）。 */
import { createRoute, z } from '@hono/zod-openapi';

import * as publicController from '../controllers/public.controller.js';
import {
  dataSchema,
  errorResponses,
  jsonBody,
  successResponse,
} from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { createOrderLimit, publicQueryLimit } from '../middleware/rate-limit.js';
import { createOrderSchema, tableTokenQuerySchema } from '../validators/index.js';

const router = createApiRouter();

const orderNoParams = z.object({
  orderNo: z.string().min(6).max(32).openapi({
    param: { name: 'orderNo', in: 'path' },
    description: '订单号',
    example: 'DB202611270001',
  }),
});

const bootstrapRoute = createRoute({
  method: 'get',
  path: '/bootstrap',
  tags: ['顾客端'],
  summary: '扫码启动数据（门店 + 桌台 + 菜单）',
  security: [],
  middleware: [publicQueryLimit],
  request: { query: tableTokenQuerySchema },
  responses: { 200: successResponse(dataSchema, '启动数据'), ...errorResponses },
});
router.openapi(
  bootstrapRoute,
  routeHandler(bootstrapRoute, async (c) => {
    const { tk } = c.req.valid('query');
    return publicController.bootstrap(c, tk);
  }),
);

const tableRoute = createRoute({
  method: 'get',
  path: '/table',
  tags: ['顾客端'],
  summary: '校验桌台二维码令牌',
  security: [],
  middleware: [publicQueryLimit],
  request: { query: tableTokenQuerySchema },
  responses: { 200: successResponse(dataSchema, '桌台信息'), ...errorResponses },
});
router.openapi(
  tableRoute,
  routeHandler(tableRoute, async (c) => {
    const { tk } = c.req.valid('query');
    return publicController.table(c, tk);
  }),
);

const createOrderRoute = createRoute({
  method: 'post',
  path: '/orders',
  tags: ['顾客端'],
  summary: '提交订单（生成待结算订单并异步打印后厨小票）',
  security: [],
  middleware: [createOrderLimit],
  request: { body: jsonBody(createOrderSchema) },
  responses: { 201: successResponse(dataSchema, '订单已创建'), ...errorResponses },
});
router.openapi(
  createOrderRoute,
  routeHandler(createOrderRoute, async (c) => publicController.create(c, c.req.valid('json'))),
);

const myOrdersRoute = createRoute({
  method: 'get',
  path: '/orders',
  tags: ['顾客端'],
  summary: '当前桌台本次就餐会话的订单列表（同桌共享）',
  security: [],
  middleware: [publicQueryLimit],
  request: { query: tableTokenQuerySchema },
  responses: { 200: successResponse(dataSchema, '订单列表'), ...errorResponses },
});
router.openapi(
  myOrdersRoute,
  routeHandler(myOrdersRoute, async (c) => {
    const { tk } = c.req.valid('query');
    return publicController.myOrders(c, tk);
  }),
);

const orderDetailRoute = createRoute({
  method: 'get',
  path: '/orders/{orderNo}',
  tags: ['顾客端'],
  summary: '当前桌台本次就餐会话的订单详情',
  security: [],
  middleware: [publicQueryLimit],
  request: { params: orderNoParams, query: tableTokenQuerySchema },
  responses: { 200: successResponse(dataSchema, '订单详情'), ...errorResponses },
});
router.openapi(
  orderDetailRoute,
  routeHandler(orderDetailRoute, async (c) => {
    const { orderNo } = c.req.valid('param');
    const { tk } = c.req.valid('query');
    return publicController.orderDetail(c, tk, orderNo);
  }),
);

export default router;
