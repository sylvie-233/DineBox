/**
 * 系统与权限模块（sys_）：后台用户、菜单、角色菜单、KV 配置、上传文件与操作日志。
 * 与 `scripts/init/01-schema.sql` 中的表结构一一对应，仅作类型化映射。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  int,
  mysqlEnum,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const sysUser = mysqlTable(
  'sys_user',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    username: varchar('username', { length: 32 }).notNull(),
    passwordHash: varchar('password_hash', { length: 100 }).notNull(),
    realName: varchar('real_name', { length: 32 }).notNull().default(''),
    role: mysqlEnum('role', ['ADMIN', 'CASHIER']).notNull().default('CASHIER'),
    status: mysqlEnum('status', ['ENABLED', 'DISABLED']).notNull().default('ENABLED'),
    lastLoginAt: datetime('last_login_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    isDeleted: tinyint('is_deleted').notNull().default(0),
  },
  (table) => [uniqueIndex('uk_username').on(table.username)],
);

export const sysMenu = mysqlTable(
  'sys_menu',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    menuCode: varchar('menu_code', { length: 32 }).notNull(),
    menuName: varchar('menu_name', { length: 32 }).notNull(),
    sort: int('sort').notNull().default(0),
    status: mysqlEnum('status', ['ENABLED', 'DISABLED']).notNull().default('ENABLED'),
  },
  (table) => [uniqueIndex('uk_menu_code').on(table.menuCode)],
);

export const sysRoleMenu = mysqlTable(
  'sys_role_menu',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    role: mysqlEnum('role', ['ADMIN', 'CASHIER']).notNull(),
    menuId: bigint('menu_id', { mode: 'number', unsigned: true }).notNull(),
  },
  (table) => [uniqueIndex('uk_role_menu').on(table.role, table.menuId)],
);

export const sysConfig = mysqlTable(
  'sys_config',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    configKey: varchar('config_key', { length: 64 }).notNull(),
    configValue: varchar('config_value', { length: 255 }).notNull().default(''),
    remark: varchar('remark', { length: 100 }).notNull().default(''),
    updatedBy: bigint('updated_by', { mode: 'number', unsigned: true }),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('uk_config_key').on(table.configKey)],
);

export const sysFile = mysqlTable('sys_file', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  fileName: varchar('file_name', { length: 128 }).notNull(),
  filePath: varchar('file_path', { length: 255 }).notNull(),
  fileSize: bigint('file_size', { mode: 'number', unsigned: true }).notNull().default(0),
  mimeType: varchar('mime_type', { length: 64 }).notNull().default(''),
  bizType: varchar('biz_type', { length: 32 }).notNull().default(''),
  uploadedBy: bigint('uploaded_by', { mode: 'number', unsigned: true }),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sysOperationLog = mysqlTable('sys_operation_log', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  userId: bigint('user_id', { mode: 'number', unsigned: true }),
  username: varchar('username', { length: 32 }).notNull().default(''),
  action: varchar('action', { length: 32 }).notNull(),
  target: varchar('target', { length: 64 }).notNull().default(''),
  detail: varchar('detail', { length: 500 }).notNull().default(''),
  ip: varchar('ip', { length: 45 }).notNull().default(''),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
