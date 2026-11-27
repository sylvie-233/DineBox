/**
 * Drizzle schema 入口：与 `scripts/init/01-schema.sql` 的 20 张表一一对应。
 * 仅作表结构类型化映射；业务查询以 `apps/api/src/sql/*` 中的参数化 SQL 为主。
 */
export * from './system.js';
export * from './catalog.js';
export * from './dining.js';
export * from './order.js';
export * from './print.js';
