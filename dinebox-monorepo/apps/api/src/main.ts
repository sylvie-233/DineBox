/**
 * 服务启动入口：确认数据库与对象存储可用后监听端口，
 * 并处理 SIGINT / SIGTERM 的优雅关闭。
 */
import { serve } from '@hono/node-server';

import app from './app.js';
import { cache } from './cache/index.js';
import { env } from './config/env.js';
import { dbClient } from './db/index.js';
import { ensureBucket } from './services/storage.service.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  // 启动前确认依赖可用，避免「服务可访问但所有接口报错」。
  await dbClient.ping();
  await ensureBucket();

  const server = serve(
    { fetch: app.fetch, port: env.PORT, hostname: env.HOST },
    (info) => {
      logger.info('服务已启动', {
        url: `http://${info.address}:${info.port}`,
        apiPrefix: '/api',
        docs: '/api/docs',
        health: '/health',
      });
    },
  );

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info('收到退出信号，正在关闭服务', { signal });
    server.close(() => {
      void (async () => {
        await Promise.allSettled([cache.close(), dbClient.close()]);
        logger.info('服务已关闭');
        process.exit(0);
      })();
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error('服务启动失败', error);
  process.exit(1);
});
