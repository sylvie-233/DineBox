/** 桌台模块（dining_）：区域与桌台。 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  int,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const diningArea = mysqlTable('dining_area', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  areaName: varchar('area_name', { length: 32 }).notNull(),
  sort: int('sort').notNull().default(0),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  isDeleted: tinyint('is_deleted').notNull().default(0),
});

export const diningTable = mysqlTable(
  'dining_table',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    areaId: bigint('area_id', { mode: 'number', unsigned: true }).notNull(),
    tableName: varchar('table_name', { length: 32 }).notNull(),
    seats: int('seats', { unsigned: true }),
    qrToken: varchar('qr_token', { length: 32 }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    isDeleted: tinyint('is_deleted').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uk_qr_token').on(table.qrToken),
    uniqueIndex('uk_table_name').on(table.tableName),
  ],
);
