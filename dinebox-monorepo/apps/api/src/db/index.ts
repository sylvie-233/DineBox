/**
 * 数据库实例装配：按环境变量创建应用级 Drizzle / mysql2 连接池，
 * 并透传参数化查询与事务工具。
 */
import { DatabaseClient } from '@dinebox/db';

import { env } from '../config/env.js';

/** 应用级数据库实例：连接参数来自环境变量，`dbClient.db` 为 Drizzle 查询构建器。 */
export const dbClient = new DatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
});

export { executeOn, queryOn, queryOneOn, schema } from '@dinebox/db';
export type { TransactionConnection } from '@dinebox/db';
