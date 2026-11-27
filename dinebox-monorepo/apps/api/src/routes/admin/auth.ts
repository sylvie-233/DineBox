/** 后台认证路由：登录、当前会话、修改密码。 */
import { createRoute } from '@hono/zod-openapi';

import * as authController from '../../controllers/admin/auth.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { loginAccountLimit, loginIpLimit } from '../../middleware/rate-limit.js';
import {
  dataSchema,
  errorResponses,
  jsonBody,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { changePasswordSchema, loginSchema } from '../../validators/index.js';

const router = createApiRouter();

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['后台 · 认证'],
  summary: '账号密码登录',
  security: [],
  middleware: [loginIpLimit, loginAccountLimit],
  request: { body: jsonBody(loginSchema) },
  responses: { 200: successResponse(dataSchema, '登录成功'), ...errorResponses },
});
router.openapi(
  loginRoute,
  routeHandler(loginRoute, async (c) => authController.loginHandler(c, c.req.valid('json'))),
);

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['后台 · 认证'],
  summary: '当前登录态（资料 + 菜单 + 门店配置）',
  security: [{ BearerAuth: [] }],
  middleware: [authenticate],
  responses: { 200: successResponse(dataSchema, '当前会话'), ...errorResponses },
});
router.openapi(meRoute, routeHandler(meRoute, async (c) => authController.me(c)));

const changePasswordRoute = createRoute({
  method: 'post',
  path: '/password',
  tags: ['后台 · 认证'],
  summary: '修改登录密码',
  security: [{ BearerAuth: [] }],
  middleware: [authenticate],
  request: { body: jsonBody(changePasswordSchema) },
  responses: { 200: successResponse(dataSchema, '密码已修改'), ...errorResponses },
});
router.openapi(
  changePasswordRoute,
  routeHandler(changePasswordRoute, async (c) =>
    authController.changePasswordHandler(c, c.req.valid('json')),
  ),
);

export default router;
