import { randomUUID } from 'node:crypto';

import type { Context, Next } from 'hono';

import { moduleLogger } from '../utils/logger.js';
import type { AppEnv } from '../types/context.js';

const log = moduleLogger('http');

/**
 * 请求日志：为每个请求生成 requestId，记录方法、路径、状态与耗时，
 * 并把请求级子日志挂到上下文供业务错误使用。
 */
export async function requestLogger(c: Context<AppEnv>, next: Next): Promise<void> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const requestLog = log.child({ requestId });
  c.set('logger', requestLog);
  c.header('X-Request-Id', requestId);

  await next();

  requestLog.info('请求完成', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
}
