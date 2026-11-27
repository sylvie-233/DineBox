/**
 * 缓存实例装配：默认内存后端，可用 Redis 在多实例间共享限流计数与菜单缓存。
 */
import { createCache } from '@dinebox/cache';

import { env } from '../config/env.js';

export const cache = createCache({
  driver: env.CACHE_DRIVER,
  prefix: env.CACHE_PREFIX,
  defaultTtlSeconds: env.CACHE_DEFAULT_TTL,
  redis: {
    url: env.REDIS_URL || undefined,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
  },
});
