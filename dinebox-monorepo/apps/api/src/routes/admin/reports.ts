/** 报表路由：经营概览、趋势、排行、对账与退菜统计。 */
import { createRoute } from '@hono/zod-openapi';

import * as reportController from '../../controllers/admin/report.controller.js';
import { authenticate, requireMenu } from '../../middleware/auth.js';
import { dataSchema, errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { reportQuerySchema } from '../../validators/index.js';

const router = createApiRouter();

const reportRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 报表'],
  summary: '轻量经营报表',
  security: [{ BearerAuth: [] }],
  middleware: [authenticate, requireMenu('reports')],
  request: { query: reportQuerySchema },
  responses: { 200: successResponse(dataSchema, '报表数据'), ...errorResponses },
});
router.openapi(
  reportRoute,
  routeHandler(reportRoute, async (c) => {
    const { range, trendRange } = c.req.valid('query');
    return reportController.report(c, range, trendRange as 7 | 30);
  }),
);

export default router;
