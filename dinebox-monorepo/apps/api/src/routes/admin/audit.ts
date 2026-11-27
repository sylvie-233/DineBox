/** 操作日志路由（仅管理员）。 */
import { createRoute } from '@hono/zod-openapi';

import * as auditController from '../../controllers/admin/audit.controller.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import {
  dataSchema,
  errorResponses,
  idParamsSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { auditQuerySchema } from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireAdmin];

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 操作日志'],
  summary: '操作日志筛选与分页',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { query: auditQuerySchema },
  responses: { 200: successResponse(dataSchema, '操作日志'), ...errorResponses },
});
router.openapi(
  listRoute,
  routeHandler(listRoute, async (c) => auditController.list(c, c.req.valid('query'))),
);

const optionsRoute = createRoute({
  method: 'get',
  path: '/options',
  tags: ['后台 · 操作日志'],
  summary: '筛选项（操作类型 / 操作人）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '筛选项'), ...errorResponses },
});
router.openapi(
  optionsRoute,
  routeHandler(optionsRoute, async (c) => auditController.options(c)),
);

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['后台 · 操作日志'],
  summary: '日志详情',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '日志详情'), ...errorResponses },
});
router.openapi(
  detailRoute,
  routeHandler(detailRoute, async (c) => auditController.detail(c, c.req.valid('param').id)),
);

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 操作日志'],
  summary: '删除日志（仅清留痕）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '日志已删除'), ...errorResponses },
});
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, async (c) => auditController.remove(c, c.req.valid('param').id)),
);

export default router;
