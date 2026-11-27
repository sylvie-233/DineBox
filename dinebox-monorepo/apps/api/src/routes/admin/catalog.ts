/** 菜品管理路由：分类、菜品、规格与加料（需要「菜品管理」菜单权限）。 */
import { createRoute } from '@hono/zod-openapi';

import * as catalogController from '../../controllers/admin/catalog.controller.js';
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
  addonSaveSchema,
  categorySaveSchema,
  dishSaveSchema,
  dishToggleSchema,
  moveSchema,
} from '../../validators/index.js';

const router = createApiRouter();
const guard = [authenticate, requireMenu('dishes')];

const catalogRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 菜品'],
  summary: '菜品页聚合（分类 / 菜品 / 加料）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  responses: { 200: successResponse(dataSchema, '菜品数据'), ...errorResponses },
});
router.openapi(
  catalogRoute,
  routeHandler(catalogRoute, async (c) => catalogController.catalog(c)),
);

/* ---------- 分类 ---------- */

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/categories',
  tags: ['后台 · 菜品'],
  summary: '新增分类',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(categorySaveSchema) },
  responses: { 201: successResponse(dataSchema, '分类已保存'), ...errorResponses },
});
router.openapi(
  createCategoryRoute,
  routeHandler(createCategoryRoute, async (c) =>
    catalogController.createCategory(c, c.req.valid('json')),
  ),
);

const updateCategoryRoute = createRoute({
  method: 'put',
  path: '/categories/{id}',
  tags: ['后台 · 菜品'],
  summary: '编辑分类',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(categorySaveSchema) },
  responses: { 200: successResponse(dataSchema, '分类已保存'), ...errorResponses },
});
router.openapi(
  updateCategoryRoute,
  routeHandler(updateCategoryRoute, async (c) =>
    catalogController.updateCategory(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const deleteCategoryRoute = createRoute({
  method: 'delete',
  path: '/categories/{id}',
  tags: ['后台 · 菜品'],
  summary: '删除分类（分类下无菜品）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '分类已删除'), ...errorResponses },
});
router.openapi(
  deleteCategoryRoute,
  routeHandler(deleteCategoryRoute, async (c) =>
    catalogController.removeCategory(c, c.req.valid('param').id),
  ),
);

const moveCategoryRoute = createRoute({
  method: 'post',
  path: '/categories/{id}/move',
  tags: ['后台 · 菜品'],
  summary: '分类上移 / 下移',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(moveSchema) },
  responses: { 200: successResponse(dataSchema, '排序已更新'), ...errorResponses },
});
router.openapi(
  moveCategoryRoute,
  routeHandler(moveCategoryRoute, async (c) =>
    catalogController.moveCategoryHandler(c, c.req.valid('param').id, c.req.valid('json').direction),
  ),
);

/* ---------- 菜品 ---------- */

const createDishRoute = createRoute({
  method: 'post',
  path: '/dishes',
  tags: ['后台 · 菜品'],
  summary: '新增菜品（含规格组与加料绑定）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(dishSaveSchema) },
  responses: { 201: successResponse(dataSchema, '菜品已保存'), ...errorResponses },
});
router.openapi(
  createDishRoute,
  routeHandler(createDishRoute, async (c) => catalogController.createDish(c, c.req.valid('json'))),
);

const updateDishRoute = createRoute({
  method: 'put',
  path: '/dishes/{id}',
  tags: ['后台 · 菜品'],
  summary: '编辑菜品',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(dishSaveSchema) },
  responses: { 200: successResponse(dataSchema, '菜品已保存'), ...errorResponses },
});
router.openapi(
  updateDishRoute,
  routeHandler(updateDishRoute, async (c) =>
    catalogController.updateDish(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const deleteDishRoute = createRoute({
  method: 'delete',
  path: '/dishes/{id}',
  tags: ['后台 · 菜品'],
  summary: '删除菜品（历史订单快照不受影响）',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '菜品已删除'), ...errorResponses },
});
router.openapi(
  deleteDishRoute,
  routeHandler(deleteDishRoute, async (c) =>
    catalogController.removeDish(c, c.req.valid('param').id),
  ),
);

const toggleDishRoute = createRoute({
  method: 'post',
  path: '/dishes/{id}/toggle',
  tags: ['后台 · 菜品'],
  summary: '上架/下架或售罄开关',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(dishToggleSchema) },
  responses: { 200: successResponse(dataSchema, '状态已更新'), ...errorResponses },
});
router.openapi(
  toggleDishRoute,
  routeHandler(toggleDishRoute, async (c) =>
    catalogController.toggleDishHandler(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

/* ---------- 加料 ---------- */

const createAddonRoute = createRoute({
  method: 'post',
  path: '/addons',
  tags: ['后台 · 菜品'],
  summary: '新增加料',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { body: jsonBody(addonSaveSchema) },
  responses: { 201: successResponse(dataSchema, '加料已保存'), ...errorResponses },
});
router.openapi(
  createAddonRoute,
  routeHandler(createAddonRoute, async (c) =>
    catalogController.createAddon(c, c.req.valid('json')),
  ),
);

const updateAddonRoute = createRoute({
  method: 'put',
  path: '/addons/{id}',
  tags: ['后台 · 菜品'],
  summary: '编辑加料',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema, body: jsonBody(addonSaveSchema) },
  responses: { 200: successResponse(dataSchema, '加料已保存'), ...errorResponses },
});
router.openapi(
  updateAddonRoute,
  routeHandler(updateAddonRoute, async (c) =>
    catalogController.updateAddon(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

const deleteAddonRoute = createRoute({
  method: 'delete',
  path: '/addons/{id}',
  tags: ['后台 · 菜品'],
  summary: '删除加料并解除菜品绑定',
  security: [{ BearerAuth: [] }],
  middleware: guard,
  request: { params: idParamsSchema },
  responses: { 200: successResponse(dataSchema, '加料已删除'), ...errorResponses },
});
router.openapi(
  deleteAddonRoute,
  routeHandler(deleteAddonRoute, async (c) =>
    catalogController.removeAddon(c, c.req.valid('param').id),
  ),
);

export default router;
