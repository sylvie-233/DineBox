/**
 * 文件代理接口：以 `/api/files/{key}` 读取对象存储中的菜品图片。
 * 仅放行 dishes/ 前缀，避免暴露桶内其他对象。
 */
import { z } from '@hono/zod-openapi';

import * as fileController from '../controllers/file.controller.js';
import { binaryResponse, ErrorResponseSchema, jsonContent } from '../openapi/models/common.js';
import { createApiRouter } from '../openapi/router.js';

const router = createApiRouter();

router.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{key}',
  tags: ['文件'],
  summary: '对象存储代理读取（仅 dishes/ 前缀）',
  security: [],
  request: {
    params: z.object({
      key: z.string().openapi({ param: { name: 'key', in: 'path' }, description: '对象键' }),
    }),
  },
  responses: {
    200: binaryResponse('application/octet-stream', '文件二进制流'),
    404: { content: jsonContent(ErrorResponseSchema), description: '文件不存在' },
  },
});

// key 可包含多级目录（如 dishes/202611/xxx.jpg）。
router.get('/:key{.+}', (c) => fileController.proxy(c, c.req.param('key')));

export default router;
