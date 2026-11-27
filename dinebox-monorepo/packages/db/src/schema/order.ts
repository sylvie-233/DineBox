/** 订单模块：订单、明细与明细加料快照。 */
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

export const orders = mysqlTable(
  'orders',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    orderNo: varchar('order_no', { length: 32 }).notNull(),
    tableId: bigint('table_id', { mode: 'number', unsigned: true }).notNull(),
    peopleCount: int('people_count', { unsigned: true }).notNull().default(1),
    status: mysqlEnum('status', ['PENDING', 'SETTLED', 'CANCELLED'])
      .notNull()
      .default('PENDING'),
    hungFlag: tinyint('hung_flag').notNull().default(0),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    roundOffAmount: decimal('round_off_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    payableAmount: decimal('payable_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    remark: varchar('remark', { length: 200 }).notNull().default(''),
    sessionToken: varchar('session_token', { length: 64 }).notNull().default(''),
    payMethod: mysqlEnum('pay_method', ['CASH', 'WECHAT_QR', 'ALIPAY_QR', 'OTHER']),
    settledBy: bigint('settled_by', { mode: 'number', unsigned: true }),
    settledAt: datetime('settled_at', { mode: 'string' }),
    cancelledAt: datetime('cancelled_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('uk_order_no').on(table.orderNo)],
);

export const orderItem = mysqlTable('order_item', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  orderId: bigint('order_id', { mode: 'number', unsigned: true }).notNull(),
  dishId: bigint('dish_id', { mode: 'number', unsigned: true }),
  dishName: varchar('dish_name', { length: 64 }).notNull(),
  specText: varchar('spec_text', { length: 100 }).notNull().default(''),
  specExtraPrice: decimal('spec_extra_price', { precision: 10, scale: 2 })
    .notNull()
    .default('0.00'),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull().default('0.00'),
  qty: int('qty', { unsigned: true }).notNull().default(1),
  itemAmount: decimal('item_amount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  itemStatus: mysqlEnum('item_status', ['NORMAL', 'RETURNED']).notNull().default('NORMAL'),
  returnReason: varchar('return_reason', { length: 100 }).notNull().default(''),
  returnedAt: datetime('returned_at', { mode: 'string' }),
  returnedBy: bigint('returned_by', { mode: 'number', unsigned: true }),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const orderItemAddon = mysqlTable('order_item_addon', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  itemId: bigint('item_id', { mode: 'number', unsigned: true }).notNull(),
  addonId: bigint('addon_id', { mode: 'number', unsigned: true }),
  addonName: varchar('addon_name', { length: 32 }).notNull(),
  addonPrice: decimal('addon_price', { precision: 10, scale: 2 }).notNull().default('0.00'),
  qty: int('qty', { unsigned: true }).notNull().default(1),
});
