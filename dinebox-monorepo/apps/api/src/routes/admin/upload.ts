/** 上传路由：菜品图片（需要「菜品管理」菜单权限）。 */
import { createRoute } from '@hono/zod-openapi';

import * as uploadController from '../../controllers/admin/upload.controller.js';
import { authenticate, requireMenu } from '../../middleware/auth.js';
import { errorResponses, successResponse, dataSchema } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';

const router = createApiRouter();

const uploadRoute = createRoute({
  method: 'post',
  path: '/dish-image',
  tags: ['后台 · 上传'],
  summary: '上传菜品图片（multipart 字段名 file，≤8MB）',
  security: [{ BearerAuth: [] }],
  middleware: [authenticate, requireMenu('dishes')],
  responses: { 201: successResponse(dataSchema, '上传成功'), ...errorResponses },
});
router.openapi(
  uploadRoute,
  routeHandler(uploadRoute, async (c) => uploadController.uploadDishImage(c)),
);

export default router;
