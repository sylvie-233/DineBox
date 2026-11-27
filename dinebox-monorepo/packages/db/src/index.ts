/**
 * `@dinebox/db` 公共入口：MySQL 连接池、Drizzle 查询构建器、
 * 参数化 SQL 与事务封装。表结构映射见 `./schema`。
 */
export * from './client.js';
export * as schema from './schema/index.js';
