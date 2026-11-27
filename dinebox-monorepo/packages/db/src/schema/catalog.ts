/** 菜品模块（dish_ / addon）：分类、菜品、规格组、规格选项、加料与绑定。 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const dishCategory = mysqlTable('dish_category', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  catName: varchar('cat_name', { length: 32 }).notNull(),
  sort: int('sort').notNull().default(0),
  status: mysqlEnum('status', ['ENABLED', 'DISABLED']).notNull().default('ENABLED'),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  isDeleted: tinyint('is_deleted').notNull().default(0),
});

export const dish = mysqlTable('dish', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  categoryId: bigint('category_id', { mode: 'number', unsigned: true }).notNull(),
  dishName: varchar('dish_name', { length: 64 }).notNull(),
  description: varchar('description', { length: 200 }).notNull().default(''),
  imageFileId: bigint('image_file_id', { mode: 'number', unsigned: true }),
  price: decimal('price', { precision: 10, scale: 2 }).notNull().default('0.00'),
  sort: int('sort').notNull().default(0),
  status: mysqlEnum('status', ['ON', 'OFF']).notNull().default('ON'),
  soldOut: tinyint('sold_out').notNull().default(0),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  isDeleted: tinyint('is_deleted').notNull().default(0),
});

export const dishSpecGroup = mysqlTable('dish_spec_group', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  dishId: bigint('dish_id', { mode: 'number', unsigned: true }).notNull(),
  groupName: varchar('group_name', { length: 32 }).notNull(),
  sort: int('sort').notNull().default(0),
});

export const dishSpecOption = mysqlTable('dish_spec_option', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  groupId: bigint('group_id', { mode: 'number', unsigned: true }).notNull(),
  optionName: varchar('option_name', { length: 32 }).notNull(),
  priceDiff: decimal('price_diff', { precision: 10, scale: 2 }).notNull().default('0.00'),
  sort: int('sort').notNull().default(0),
});

export const addon = mysqlTable('addon', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  addonName: varchar('addon_name', { length: 32 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull().default('0.00'),
  maxSelect: int('max_select', { unsigned: true }).notNull().default(0),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  isDeleted: tinyint('is_deleted').notNull().default(0),
});

export const dishAddon = mysqlTable(
  'dish_addon',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    dishId: bigint('dish_id', { mode: 'number', unsigned: true }).notNull(),
    addonId: bigint('addon_id', { mode: 'number', unsigned: true }).notNull(),
    sort: int('sort').notNull().default(0),
  },
  (table) => [uniqueIndex('uk_dish_addon').on(table.dishId, table.addonId)],
);
