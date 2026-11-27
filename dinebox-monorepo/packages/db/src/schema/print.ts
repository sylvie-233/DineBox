/** 打印模块：打印机、ESC/POS 模板与打印日志。 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  int,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const printer = mysqlTable('printer', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  printerName: varchar('printer_name', { length: 64 }).notNull(),
  ip: varchar('ip', { length: 15 }).notNull(),
  port: smallint('port', { unsigned: true }).notNull().default(9100),
  purpose: mysqlEnum('purpose', ['KITCHEN', 'BILL', 'ALL']).notNull().default('KITCHEN'),
  status: mysqlEnum('status', ['ONLINE', 'OFFLINE']).notNull().default('OFFLINE'),
  lastTestAt: datetime('last_test_at', { mode: 'string' }),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  isDeleted: tinyint('is_deleted').notNull().default(0),
});

export const printTemplate = mysqlTable(
  'print_template',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    templateType: mysqlEnum('template_type', ['KITCHEN', 'BILL']).notNull(),
    templateContent: text('template_content').notNull(),
    updatedBy: bigint('updated_by', { mode: 'number', unsigned: true }),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('uk_template_type').on(table.templateType)],
);

export const printLog = mysqlTable('print_log', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  orderId: bigint('order_id', { mode: 'number', unsigned: true }),
  printerId: bigint('printer_id', { mode: 'number', unsigned: true }).notNull(),
  docType: mysqlEnum('doc_type', ['KITCHEN', 'BILL', 'TEST']).notNull(),
  status: mysqlEnum('status', ['SUCCESS', 'FAIL']).notNull(),
  failReason: varchar('fail_reason', { length: 255 }).notNull().default(''),
  retryCount: int('retry_count', { unsigned: true }).notNull().default(0),
  printedBy: bigint('printed_by', { mode: 'number', unsigned: true }),
  createdAt: datetime('created_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
