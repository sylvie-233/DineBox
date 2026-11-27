/** 桌台管理路由：区域、桌台与二维码（需要「桌台管理」菜单权限）。 */
import { createRoute } from '@hono/zod-openapi';

import * as tableController from '../../controllers/admin/table.controller.js';
import { authenticate, requireMenu } from '../../middleware/auth.js';
import {
  dataSchema,
  errorResponses,
  idParamsSchema,
  jsonBody,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { areaSaveSchema, moveSchema, tableSaveSchema } from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireMenu('tables')];

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 桌台'],
  summary: '区域与桌台列表（含实时状态）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '桌台数据'), ...errorResponses },
});
router.openapi(
  listRoute,
  routeHandler(listRoute, async (c) => tableController.list(c)),
);

const createAreaRoute = createRoute({
  method: 'post',
  path: '/areas',
  tags: ['后台 · 桌台'],
  summary: '新增区域',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(areaSaveSchema) },
  responses: { 201: successResponse(dataSchema, '区域已保存'), ...errorResponses },
});
router.openapi(
  createAreaRoute,
  routeHandler(createAreaRoute, async (c) =>
    tableController.createArea(c, c.req.valid('json')),
  ),
);

const updateAreaRoute = createRoute({
  method: 'put',
  path: '/areas/{id}',
  tags: ['后台 · 桌台'],
  summary: '编辑区域',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(areaSaveSchema) },
  responses: { 200: successResponse(dataSchema, '区域已保存'), ...errorResponses },
});
router.openapi(
  updateAreaRoute,
  routeHandler(updateAreaRoute, async (c) =>
    tableController.updateArea(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const deleteAreaRoute = createRoute({
  method: 'delete',
  path: '/areas/{id}',
  tags: ['后台 · 桌台'],
  summary: '删除区域（区域下无桌台）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '区域已删除'), ...errorResponses },
});
router.openapi(
  deleteAreaRoute,
  routeHandler(deleteAreaRoute, async (c) =>
    tableController.removeArea(c, c.req.valid('param').id),
  ),
);

const moveAreaRoute = createRoute({
  method: 'post',
  path: '/areas/{id}/move',
  tags: ['后台 · 桌台'],
  summary: '区域上移 / 下移',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(moveSchema) },
  responses: { 200: successResponse(dataSchema, '排序已更新'), ...errorResponses },
});
router.openapi(
  moveAreaRoute,
  routeHandler(moveAreaRoute, async (c) =>
    tableController.moveAreaHandler(c, c.req.valid('param').id, c.req.valid('json').direction),
  ),
);

const createTableRoute = createRoute({
  method: 'post',
  path: '/tables',
  tags: ['后台 · 桌台'],
  summary: '新增桌台（自动生成二维码令牌）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(tableSaveSchema) },
  responses: { 201: successResponse(dataSchema, '桌台已保存'), ...errorResponses },
});
router.openapi(
  createTableRoute,
  routeHandler(createTableRoute, async (c) =>
    tableController.createTable(c, c.req.valid('json')),
  ),
);

const updateTableRoute = createRoute({
  method: 'put',
  path: '/tables/{id}',
  tags: ['后台 · 桌台'],
  summary: '编辑桌台',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(tableSaveSchema) },
  responses: { 200: successResponse(dataSchema, '桌台已保存'), ...errorResponses },
});
router.openapi(
  updateTableRoute,
  routeHandler(updateTableRoute, async (c) =>
    tableController.updateTable(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const deleteTableRoute = createRoute({
  method: 'delete',
  path: '/tables/{id}',
  tags: ['后台 · 桌台'],
  summary: '删除桌台',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '桌台已删除'), ...errorResponses },
});
router.openapi(
  deleteTableRoute,
  routeHandler(deleteTableRoute, async (c) =>
    tableController.removeTable(c, c.req.valid('param').id),
  ),
);

export default router;
