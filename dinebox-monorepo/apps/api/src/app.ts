/**
 * Hono 应用装配：注册请求日志、CORS、限流与请求体限制等全局中间件，
 * 并挂载健康检查、API 文档与 `/api` 业务路由，统一 404 / 错误响应。
 */
import { Scalar } from '@scalar/hono-api-reference';
import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import { cache } from './cache/index.js';
import { corsOrigins } from './config/env.js';
import { dbClient } from './db/index.js';
import { errorHandler } from './middleware/error.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import apiRoutes from './routes/index.js';
import { storageHealthy } from './services/storage.service.js';
import type { AppEnv } from './types/context.js';
import { failure, success } from './utils/http.js';
import { logger } from './utils/logger.js';

export const app = new OpenAPIHono<AppEnv>();

app.use('*', requestLogger);
app.use(
  '*',
  cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Disposition', 'X-Export-Count', 'X-Request-Id'],
    maxAge: 86400,
  }),
);

app.use('/api/*', globalRateLimit);

// 普通 JSON 请求上限 2MB；菜品图片上传单独放宽到 12MB。
const normalBodyLimit = bodyLimit({
  maxSize: 2 * 1024 * 1024,
  onError: (c) => failure(c, 413, '请求体过大'),
});
const uploadBodyLimit = bodyLimit({
  maxSize: 12 * 1024 * 1024,
  onError: (c) => failure(c, 413, '上传文件过大'),
});
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/admin/upload')) {
    await next();
    return;
  }
  return normalBodyLimit(c, next);
});
app.use('/api/admin/upload', uploadBodyLimit);

/** 健康检查：探测数据库、对象存储与缓存，供容器编排使用。 */
app.get('/health', async (c) => {
  try {
    await dbClient.ping();
    const [storage, cacheReady] = await Promise.all([storageHealthy(), cache.ping()]);
    return success(c, {
      status: storage && cacheReady ? 'ok' : 'degraded',
      db: 'up',
      storage: storage ? 'up' : 'down',
      cache: cacheReady ? 'up' : 'down',
    });
  } catch (error) {
    (c.get('logger') ?? logger).error('健康检查失败：数据库连接异常', error);
    return failure(c, 503, '数据库连接不可用');
  }
});

app.get('/', (c) =>
  success(c, {
    name: 'DineBox 扫码点餐 API',
    version: 'v1',
    docs: 'API 文档 /api/docs，OpenAPI JSON /api/openapi.json，健康检查 /health',
  }),
);

app.get(
  '/api/docs',
  Scalar({
    url: '/api/openapi.json',
    pageTitle: 'DineBox 扫码点餐 API 文档',
    persistAuth: true,
    authentication: { preferredSecurityScheme: 'BearerAuth' },
  }),
);

app.route('/api', apiRoutes);

app.notFound((c) => failure(c, 404, '接口不存在'));
app.onError(errorHandler);

export default app;
