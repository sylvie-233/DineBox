/**
 * 限流规则集中定义：基于缓存的固定窗口计数，按 IP / 账号维度限制；
 * 缓存不可用时放行请求，避免限流组件故障导致整站不可用。
 */
import { createHash } from 'node:crypto';

import { createMiddleware } from 'hono/factory';

import { cache } from '../cache/index.js';
import { env } from '../config/env.js';
import type { AppContext, AppEnv } from '../types/context.js';
import { failure } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { getRequestIp } from '../utils/request.js';

const RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试';

/** 客户端标识：优先反代头，缺失时归为 unknown。 */
export function requestIp(c: AppContext): string {
  return getRequestIp(c) ?? 'unknown';
}

/** 对账号做哈希，避免明文进入缓存键。 */
export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/** 读取请求体字段（不消费原始请求体），用于按账号限流。 */
export async function readJsonField(c: AppContext, field: string): Promise<string> {
  try {
    const body = (await c.req.raw.clone().json()) as Record<string, unknown> | null;
    const value = body?.[field];
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

export interface RateLimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
  key: (c: AppContext) => string | null | Promise<string | null>;
  message?: string;
  skip?: (c: AppContext) => boolean;
}

/** 固定窗口限流中间件。 */
export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (env.RATE_LIMIT_ENABLED !== 'true' || options.skip?.(c)) {
      await next();
      return;
    }

    try {
      const identifier = await options.key(c);
      if (!identifier) {
        await next();
        return;
      }

      const result = await cache.rateLimit(
        `${options.name}:${identifier}`,
        options.limit,
        options.windowSeconds,
      );

      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(result.remaining));
      c.header('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + result.resetSeconds));

      if (!result.allowed) {
        c.header('Retry-After', String(result.resetSeconds));
        (c.get('logger') ?? logger).warn('触发限流', {
          rule: options.name,
          key: identifier.slice(0, 48),
          path: c.req.path,
        });
        return failure(c, 429, options.message ?? RATE_LIMIT_MESSAGE);
      }
    } catch (error) {
      (c.get('logger') ?? logger).error('限流检查失败，已放行请求', error, {
        rule: options.name,
      });
    }

    await next();
  });
}

/** 全局接口限流：每 IP 每分钟 300 次；文件代理与文档不计入。 */
export const globalRateLimit = rateLimit({
  name: 'global',
  limit: 300,
  windowSeconds: 60,
  key: (c) => requestIp(c),
  skip: (c) =>
    c.req.path.startsWith('/api/files/') ||
    c.req.path === '/api/docs' ||
    c.req.path === '/api/openapi.json',
});

/** 后台登录同 IP：5 分钟内最多 10 次。 */
export const loginIpLimit = rateLimit({
  name: 'login:ip',
  limit: 10,
  windowSeconds: 300,
  key: (c) => requestIp(c),
});

/** 后台登录同账号：15 分钟内最多 5 次。 */
export const loginAccountLimit = rateLimit({
  name: 'login:account',
  limit: 5,
  windowSeconds: 900,
  key: async (c) => {
    const username = await readJsonField(c, 'username');
    return username ? hashIdentifier(username) : null;
  },
});

/** 顾客下单：同 IP 每分钟最多 20 单；下单接口本身有桌台归属校验。 */
export const createOrderLimit = rateLimit({
  name: 'order:create:ip',
  limit: 20,
  windowSeconds: 60,
  key: (c) => requestIp(c),
  message: '下单过于频繁，请稍后再试',
});

/** 顾客“本桌订单”查询：同 IP 每分钟 60 次。 */
export const publicQueryLimit = rateLimit({
  name: 'public:query:ip',
  limit: 60,
  windowSeconds: 60,
  key: (c) => requestIp(c),
});
