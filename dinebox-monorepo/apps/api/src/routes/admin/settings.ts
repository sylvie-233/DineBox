/** 系统设置路由（仅管理员）：门店信息、账号与角色菜单权限。 */
import { createRoute } from '@hono/zod-openapi';

import * as settingsController from '../../controllers/admin/settings.controller.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import {
  dataSchema,
  errorResponses,
  idParamsSchema,
  jsonBody,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import {
  permissionSaveSchema,
  shopConfigSaveSchema,
  userCreateSchema,
  userUpdateSchema,
} from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireAdmin];

const getRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 设置'],
  summary: '设置页聚合（门店 / 菜单 / 权限 / 账号）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '设置数据'), ...errorResponses },
});
router.openapi(
  getRoute,
  routeHandler(getRoute, async (c) => settingsController.settings(c)),
);

const shopRoute = createRoute({
  method: 'put',
  path: '/shop',
  tags: ['后台 · 设置'],
  summary: '保存门店信息与抹零配置',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(shopConfigSaveSchema) },
  responses: { 200: successResponse(dataSchema, '设置已保存'), ...errorResponses },
});
router.openapi(
  shopRoute,
  routeHandler(shopRoute, async (c) =>
    settingsController.saveShop(c, c.req.valid('json')),
  ),
);

const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  tags: ['后台 · 设置'],
  summary: '新增账号',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(userCreateSchema) },
  responses: { 201: successResponse(dataSchema, '账号已新增'), ...errorResponses },
});
router.openapi(
  createUserRoute,
  routeHandler(createUserRoute, async (c) =>
    settingsController.addUser(c, c.req.valid('json')),
  ),
);

const updateUserRoute = createRoute({
  method: 'put',
  path: '/users/{id}',
  tags: ['后台 · 设置'],
  summary: '启用 / 禁用 / 改角色 / 重置密码',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(userUpdateSchema) },
  responses: { 200: successResponse(dataSchema, '账号已更新'), ...errorResponses },
});
router.openapi(
  updateUserRoute,
  routeHandler(updateUserRoute, async (c) =>
    settingsController.editUser(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const permissionsRoute = createRoute({
  method: 'put',
  path: '/permissions',
  tags: ['后台 · 设置'],
  summary: '保存收银员角色菜单权限',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(permissionSaveSchema) },
  responses: { 200: successResponse(dataSchema, '权限已更新'), ...errorResponses },
});
router.openapi(
  permissionsRoute,
  routeHandler(permissionsRoute, async (c) =>
    settingsController.permissions(c, c.req.valid('json')),
  ),
);

const resetPermissionsRoute = createRoute({
  method: 'post',
  path: '/permissions/reset',
  tags: ['后台 · 设置'],
  summary: '恢复默认权限（收银员仅见收银台）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '已恢复默认'), ...errorResponses },
});
router.openapi(
  resetPermissionsRoute,
  routeHandler(resetPermissionsRoute, async (c) =>
    settingsController.resetPermissionsHandler(c),
  ),
);

export default router;
