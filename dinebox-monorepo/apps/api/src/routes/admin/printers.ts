/** 打印配置路由：打印机、模板、日志与重打（需要「打印配置」菜单权限）。 */
import { createRoute } from '@hono/zod-openapi';

import * as printController from '../../controllers/admin/print.controller.js';
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
  printLogQuerySchema,
  printerSaveSchema,
  reprintSchema,
  templateSaveSchema,
  templateTypeParamsSchema,
} from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireMenu('printer')];

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 打印'],
  summary: '打印机列表',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '打印机列表'), ...errorResponses },
});
router.openapi(
  listRoute,
  routeHandler(listRoute, async (c) => printController.printers(c)),
);

const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 打印'],
  summary: '添加打印机（默认离线）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(printerSaveSchema) },
  responses: { 201: successResponse(dataSchema, '打印机已保存'), ...errorResponses },
});
router.openapi(
  createRouteDef,
  routeHandler(createRouteDef, async (c) =>
    printController.createPrinter(c, c.req.valid('json')),
  ),
);

const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['后台 · 打印'],
  summary: '编辑打印机',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(printerSaveSchema) },
  responses: { 200: successResponse(dataSchema, '打印机已保存'), ...errorResponses },
});
router.openapi(
  updateRoute,
  routeHandler(updateRoute, async (c) =>
    printController.updatePrinter(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 打印'],
  summary: '删除打印机',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '打印机已删除'), ...errorResponses },
});
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, async (c) =>
    printController.removePrinter(c, c.req.valid('param').id),
  ),
);

const testRoute = createRoute({
  method: 'post',
  path: '/{id}/test',
  tags: ['后台 · 打印'],
  summary: '测试打印并回写连通状态',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '测试结果'), ...errorResponses },
});
router.openapi(
  testRoute,
  routeHandler(testRoute, async (c) => printController.test(c, c.req.valid('param').id)),
);

const templatesRoute = createRoute({
  method: 'get',
  path: '/templates',
  tags: ['后台 · 打印'],
  summary: '后厨小票 / 结账单模板',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '模板'), ...errorResponses },
});
router.openapi(
  templatesRoute,
  routeHandler(templatesRoute, async (c) => printController.templates(c)),
);

const saveTemplateRoute = createRoute({
  method: 'put',
  path: '/templates/{type}',
  tags: ['后台 · 打印'],
  summary: '保存模板（下次打印生效）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: templateTypeParamsSchema, body: jsonBody(templateSaveSchema) },
  responses: { 200: successResponse(dataSchema, '模板已保存'), ...errorResponses },
});
router.openapi(
  saveTemplateRoute,
  routeHandler(saveTemplateRoute, async (c) =>
    printController.saveTemplateHandler(c, c.req.valid('param').type, c.req.valid('json')),
  ),
);

const resetTemplateRoute = createRoute({
  method: 'post',
  path: '/templates/{type}/reset',
  tags: ['后台 · 打印'],
  summary: '恢复默认模板',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: templateTypeParamsSchema },
  responses: { 200: successResponse(dataSchema, '已恢复默认'), ...errorResponses },
});
router.openapi(
  resetTemplateRoute,
  routeHandler(resetTemplateRoute, async (c) =>
    printController.resetTemplateHandler(c, c.req.valid('param').type),
  ),
);

const logsRoute = createRoute({
  method: 'get',
  path: '/logs',
  tags: ['后台 · 打印'],
  summary: '打印日志（筛选 + 分页）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { query: printLogQuerySchema },
  responses: { 200: successResponse(dataSchema, '打印日志'), ...errorResponses },
});
router.openapi(
  logsRoute,
  routeHandler(logsRoute, async (c) => printController.logs(c, c.req.valid('query'))),
);

const logDetailRoute = createRoute({
  method: 'get',
  path: '/logs/{id}',
  tags: ['后台 · 打印'],
  summary: '打印日志详情',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '日志详情'), ...errorResponses },
});
router.openapi(
  logDetailRoute,
  routeHandler(logDetailRoute, async (c) => printController.logDetail(c, c.req.valid('param').id)),
);

const retryLogRoute = createRoute({
  method: 'post',
  path: '/logs/{id}/retry',
  tags: ['后台 · 打印'],
  summary: '重打 / 重试该日志对应单据',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '重打结果'), ...errorResponses },
});
router.openapi(
  retryLogRoute,
  routeHandler(retryLogRoute, async (c) => printController.retryLog(c, c.req.valid('param').id)),
);

const deleteLogRoute = createRoute({
  method: 'delete',
  path: '/logs/{id}',
  tags: ['后台 · 打印'],
  summary: '删除打印日志（不动订单）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '日志已删除'), ...errorResponses },
});
router.openapi(
  deleteLogRoute,
  routeHandler(deleteLogRoute, async (c) => printController.removeLog(c, c.req.valid('param').id)),
);

const reprintRoute = createRoute({
  method: 'post',
  path: '/reprint',
  tags: ['后台 · 打印'],
  summary: '按订单手动重打后厨单 / 结账单',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(reprintSchema) },
  responses: { 200: successResponse(dataSchema, '已重新下发'), ...errorResponses },
});
router.openapi(
  reprintRoute,
  routeHandler(reprintRoute, async (c) => printController.reprint(c, c.req.valid('json'))),
);

export default router;
