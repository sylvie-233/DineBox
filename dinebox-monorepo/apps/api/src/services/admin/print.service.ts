/**
 * 打印域服务：打印机与模板维护、测试打印、订单小票下发、打印日志与重打。
 *
 * 打印为 TCP 短连接异步流程，失败只写打印日志并提示，不阻塞下单 / 结算。
 * ESC/POS 指令与编码由 @dinebox/print（node-thermal-printer）负责。
 */
import { and, eq, inArray, sql } from 'drizzle-orm';

import type {
  Order,
  PrintDocType,
  PrintLogPage,
  PrintLogQuery,
  PrintLogRow,
  PrintTemplate,
  Printer,
  PrinterSaveInput,
  PrinterTestResult,
} from '@dinebox/types';
import {
  DEFAULT_PRINT_TEMPLATES,
  PRINT_DOC_LABELS,
  PRINTER_PURPOSE_LABELS,
} from '@dinebox/types';
import { formatDateTime, nowString } from '@dinebox/utils';
import { printText, renderTemplate, renderTestPage } from '@dinebox/print';

import { env } from '../../config/env.js';
import { dbClient, schema } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { moduleLogger } from '../../utils/logger.js';
import { pageMeta, pageOffset } from '../../sql/shared.js';
import {
  printLogCountQuery,
  printLogDetailQuery,
  printLogListQuery,
  printLogRetryLookupQuery,
  printerHealthQuery,
} from '../../sql/print.sql.js';
import { writeOperationLog } from '../audit.service.js';
import { getShopConfig } from '../config.service.js';
import { loadOrderDetail } from '../order.repository.js';

const log = moduleLogger('print');

interface PrinterRow {
  id: number;
  name: string;
  ip: string;
  port: number;
  purpose: 'KITCHEN' | 'BILL' | 'ALL';
  status: 'ONLINE' | 'OFFLINE';
  lastTestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PrintLogQueryRow {
  id: number;
  orderId: number | null;
  orderNo: string | null;
  printerId: number;
  printerName: string;
  printerIp: string;
  printerPort: number;
  docType: PrintDocType;
  status: 'SUCCESS' | 'FAIL';
  failReason: string;
  retryCount: number;
  printedByName: string | null;
  createdAt: string;
}

interface SendResult {
  ok: boolean;
  message: string;
  logId: number;
}

function toPrinter(row: PrinterRow): Printer {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    port: Number(row.port),
    purpose: row.purpose,
    status: row.status,
    lastTestAt: row.lastTestAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLogRow(row: PrintLogQueryRow): PrintLogRow {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNo: row.orderNo ?? '',
    printerId: row.printerId,
    printerName: row.printerName,
    printerIp: row.printerIp,
    printerPort: Number(row.printerPort),
    docType: row.docType,
    status: row.status,
    failReason: row.failReason,
    retryCount: row.retryCount,
    printedByName: row.printedByName ?? '系统',
    createdAt: row.createdAt,
  };
}

/* ========================= 打印机 ========================= */

export async function listPrinters(): Promise<Printer[]> {
  const rows = await dbClient.db
    .select({
      id: schema.printer.id,
      name: schema.printer.printerName,
      ip: schema.printer.ip,
      port: schema.printer.port,
      purpose: schema.printer.purpose,
      status: schema.printer.status,
      lastTestAt: schema.printer.lastTestAt,
      createdAt: schema.printer.createdAt,
      updatedAt: schema.printer.updatedAt,
    })
    .from(schema.printer)
    .where(eq(schema.printer.isDeleted, 0))
    .orderBy(schema.printer.id);
  return rows.map(toPrinter);
}

export async function savePrinter(
  input: PrinterSaveInput & { id?: number },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ id: number }> {
  let id = input.id;
  if (id) {
    const [result] = await dbClient.db
      .update(schema.printer)
      .set({
        printerName: input.name,
        ip: input.ip,
        port: input.port ?? 9100,
        purpose: input.purpose,
      })
      .where(and(eq(schema.printer.id, id), eq(schema.printer.isDeleted, 0)));
    if (result.affectedRows === 0) {
      throw new HttpError(404, '打印机不存在');
    }
  } else {
    const [result] = await dbClient.db.insert(schema.printer).values({
      printerName: input.name,
      ip: input.ip,
      port: input.port ?? 9100,
      purpose: input.purpose,
      status: 'OFFLINE',
    });
    id = result.insertId;
  }
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: input.id ? 'PRINTER_UPDATE' : 'PRINTER_ADD',
    target: input.name,
    detail: `${input.ip}:${input.port ?? 9100} · ${PRINTER_PURPOSE_LABELS[input.purpose]}`,
    ip,
  });
  return { id };
}

export async function deletePrinter(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const [row] = await dbClient.db
    .select({ name: schema.printer.printerName })
    .from(schema.printer)
    .where(and(eq(schema.printer.id, id), eq(schema.printer.isDeleted, 0)))
    .limit(1);
  if (!row) {
    throw new HttpError(404, '打印机不存在');
  }
  await dbClient.db
    .update(schema.printer)
    .set({ isDeleted: 1 })
    .where(eq(schema.printer.id, id));
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PRINTER_DELETE',
    target: row.name,
    detail: '删除打印机',
    ip,
  });
}

async function getPrinterById(id: number): Promise<PrinterRow | null> {
  const [row] = await dbClient.db
    .select({
      id: schema.printer.id,
      name: schema.printer.printerName,
      ip: schema.printer.ip,
      port: schema.printer.port,
      purpose: schema.printer.purpose,
      status: schema.printer.status,
      lastTestAt: schema.printer.lastTestAt,
      createdAt: schema.printer.createdAt,
      updatedAt: schema.printer.updatedAt,
    })
    .from(schema.printer)
    .where(and(eq(schema.printer.id, id), eq(schema.printer.isDeleted, 0)))
    .limit(1);
  return row ?? null;
}

/** 测试打印：向 ip:9100 发测试页，回写连通状态并记录日志。 */
export async function testPrinter(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<PrinterTestResult> {
  const printer = await getPrinterById(id);
  if (!printer) {
    throw new HttpError(404, '打印机不存在');
  }

  const text = renderTestPage(printer.name, nowString(), env.PRINT_WIDTH);
  let ok = true;
  let message = '测试打印成功，打印机连接正常';
  try {
    await printText({ ip: printer.ip, port: Number(printer.port) }, text, {
      encoding: env.PRINT_ENCODING,
      timeoutMs: env.PRINT_TIMEOUT_MS,
      width: env.PRINT_WIDTH,
    });
  } catch (error) {
    ok = false;
    message = error instanceof Error ? error.message : '测试打印失败';
  }

  await dbClient.db
    .update(schema.printer)
    .set({ status: ok ? 'ONLINE' : 'OFFLINE', lastTestAt: nowString() })
    .where(eq(schema.printer.id, id));
  const [inserted] = await dbClient.db.insert(schema.printLog).values({
    orderId: null,
    printerId: id,
    docType: 'TEST',
    status: ok ? 'SUCCESS' : 'FAIL',
    failReason: ok ? '' : message.slice(0, 255),
    printedBy: operator.id,
  });

  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PRINTER_TEST',
    target: printer.name,
    detail: ok ? '测试打印成功' : `测试打印失败：${message}`,
    ip,
  });

  return { ok, message, logId: inserted.insertId };
}

/* ========================= 模板 ========================= */

export async function getTemplates(): Promise<{ KITCHEN: PrintTemplate; BILL: PrintTemplate }> {
  const rows = await dbClient.db
    .select({
      templateType: schema.printTemplate.templateType,
      templateContent: schema.printTemplate.templateContent,
      updatedAt: schema.printTemplate.updatedAt,
    })
    .from(schema.printTemplate);
  const map = new Map(rows.map((row) => [row.templateType, row]));
  const build = (type: 'KITCHEN' | 'BILL'): PrintTemplate => {
    const row = map.get(type);
    return {
      type,
      content: row?.templateContent ?? DEFAULT_PRINT_TEMPLATES[type],
      updatedAt: row?.updatedAt ?? null,
    };
  };
  return { KITCHEN: build('KITCHEN'), BILL: build('BILL') };
}

export async function saveTemplate(
  type: 'KITCHEN' | 'BILL',
  content: string,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  await dbClient.db
    .insert(schema.printTemplate)
    .values({ templateType: type, templateContent: content, updatedBy: operator.id })
    .onDuplicateKeyUpdate({
      set: { templateContent: content, updatedBy: operator.id },
    });
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'TEMPLATE_UPDATE',
    target: PRINT_DOC_LABELS[type],
    detail: '修改 ESC/POS 打印模板',
    ip,
  });
}

export async function resetTemplate(
  type: 'KITCHEN' | 'BILL',
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  await saveTemplate(type, DEFAULT_PRINT_TEMPLATES[type], operator, ip);
}

/* ========================= 下发 ========================= */

async function buildTemplateText(order: Order, docType: 'KITCHEN' | 'BILL'): Promise<string> {
  const shop = await getShopConfig();
  const template = (await getTemplates())[docType];
  const items = order.items
    .filter((item) => item.status === 'NORMAL')
    .map((item) => ({
      name: item.dishName,
      specText: item.specText,
      addonText: item.addons.map((addon) => `${addon.name}×${addon.qty}`).join('、'),
      qty: item.qty,
      amount: Number(item.itemAmount),
    }));

  return renderTemplate(template.content, {
    title: shop.receiptTitle || shop.shopName,
    table: order.tableName,
    orderNo: order.orderNo,
    time: formatDateTime(docType === 'BILL' ? order.settledAt ?? order.createdAt : order.createdAt),
    note: order.remark,
    people: order.peopleCount,
    total: order.totalAmount,
    off: order.roundOffAmount,
    payable: order.payableAmount,
    items,
    width: env.PRINT_WIDTH,
  });
}

async function printersFor(docType: 'KITCHEN' | 'BILL'): Promise<PrinterRow[]> {
  const rows = await dbClient.db
    .select({
      id: schema.printer.id,
      name: schema.printer.printerName,
      ip: schema.printer.ip,
      port: schema.printer.port,
      purpose: schema.printer.purpose,
      status: schema.printer.status,
      lastTestAt: schema.printer.lastTestAt,
      createdAt: schema.printer.createdAt,
      updatedAt: schema.printer.updatedAt,
    })
    .from(schema.printer)
    .where(
      and(
        eq(schema.printer.isDeleted, 0),
        inArray(schema.printer.purpose, [docType, 'ALL']),
      ),
    )
    .orderBy(schema.printer.id);
  return rows;
}

/** 向指定打印机发送文本并写入打印日志；失败不抛错。 */
async function sendAndLog(input: {
  printer: PrinterRow;
  orderId: number | null;
  orderNo: string;
  docType: PrintDocType;
  text: string;
  printedBy: number | null;
}): Promise<SendResult> {
  let status: 'SUCCESS' | 'FAIL' = 'SUCCESS';
  let failReason = '';
  try {
    await printText({ ip: input.printer.ip, port: Number(input.printer.port) }, input.text, {
      encoding: env.PRINT_ENCODING,
      timeoutMs: env.PRINT_TIMEOUT_MS,
      width: env.PRINT_WIDTH,
    });
  } catch (error) {
    status = 'FAIL';
    failReason = error instanceof Error ? error.message : '打印失败';
  }

  let logId = 0;
  try {
    const [inserted] = await dbClient.db.insert(schema.printLog).values({
      orderId: input.orderId,
      printerId: input.printer.id,
      docType: input.docType,
      status,
      failReason: failReason.slice(0, 255),
      printedBy: input.printedBy,
    });
    logId = inserted.insertId;
    await dbClient.db
      .update(schema.printer)
      .set({ status: status === 'SUCCESS' ? 'ONLINE' : 'OFFLINE' })
      .where(eq(schema.printer.id, input.printer.id));
  } catch (error) {
    log.error('写入打印日志失败', error, { printerId: input.printer.id });
  }

  if (status === 'FAIL') {
    log.warn('打印失败', {
      orderNo: input.orderNo,
      printer: `${input.printer.name}(${input.printer.ip}:${input.printer.port})`,
      docType: input.docType,
      reason: failReason,
    });
  }

  return {
    ok: status === 'SUCCESS',
    message: status === 'SUCCESS' ? '打印成功' : failReason,
    logId,
  };
}

/**
 * 订单打印（下单后厨单 / 结算结账单 / 手动重打）。
 * 调用方用 `void dispatchOrderPrint(...)` 异步触发，不阻塞订单响应。
 */
export async function dispatchOrderPrint(
  order: Order,
  docType: 'KITCHEN' | 'BILL',
  printedBy: number | null,
): Promise<SendResult[]> {
  const printers = await printersFor(docType);
  if (printers.length === 0) {
    log.warn('未配置可用打印机，跳过打印', { docType, orderNo: order.orderNo });
    return [];
  }
  const text = await buildTemplateText(order, docType);
  return Promise.all(
    printers.map((printer) =>
      sendAndLog({
        printer,
        orderId: order.id,
        orderNo: order.orderNo,
        docType,
        text,
        printedBy,
      }),
    ),
  );
}

/** 手动重打：向该用途的全部打印机再发一次，并写日志。 */
export async function reprintOrder(
  orderId: number,
  docType: 'KITCHEN' | 'BILL',
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ sent: number; failed: number }> {
  const order = await loadOrderDetail(orderId);
  if (!order) {
    throw new HttpError(404, '订单不存在');
  }
  const results = await dispatchOrderPrint(order, docType, operator.id);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PRINT',
    target: order.orderNo,
    detail: `手动重打${PRINT_DOC_LABELS[docType]}，成功 ${results.filter((r) => r.ok).length}/${results.length}`,
    ip,
  });
  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  };
}

/* ========================= 日志 ========================= */

export async function listPrintLogs(query: PrintLogQuery): Promise<PrintLogPage> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
  const list = printLogListQuery(query, pageSize, pageOffset(page, pageSize));
  const count = printLogCountQuery(query);

  const [rows, countRow] = await Promise.all([
    dbClient.query<PrintLogQueryRow>(list.sql, list.params),
    dbClient.queryOne<{ total: number }>(count.sql, count.params),
  ]);
  const total = Number(countRow?.total ?? 0);
  return {
    list: rows.map(toLogRow),
    ...pageMeta(total, page, pageSize),
  };
}

export async function getPrintLog(id: number): Promise<PrintLogRow | null> {
  const query = printLogDetailQuery(id);
  const row = await dbClient.queryOne<PrintLogQueryRow>(query.sql, query.params);
  return row ? toLogRow(row) : null;
}

/** 重打 / 重试一条打印日志：沿用原订单、打印机与单据类型。 */
export async function retryPrintLog(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<PrinterTestResult> {
  const lookup = printLogRetryLookupQuery(id);
  const row = await dbClient.queryOne<{
    orderId: number | null;
    printerId: number;
    docType: PrintDocType;
    printerName: string;
    printerIp: string;
    printerPort: number;
    printerDeleted: number;
  }>(lookup.sql, lookup.params);
  if (!row) {
    throw new HttpError(404, '打印日志不存在');
  }
  if (row.printerDeleted === 1) {
    throw new HttpError(409, '该打印机已删除，请先在打印配置中恢复');
  }

  const printer: PrinterRow = {
    id: row.printerId,
    name: row.printerName,
    ip: row.printerIp,
    port: Number(row.printerPort),
    purpose: 'KITCHEN',
    status: 'OFFLINE',
    lastTestAt: null,
    createdAt: '',
    updatedAt: '',
  };

  let text: string;
  let orderNo = '';
  if (row.docType === 'TEST' || !row.orderId) {
    text = renderTestPage(row.printerName, nowString(), env.PRINT_WIDTH);
    orderNo = '测试页';
  } else {
    const order = await loadOrderDetail(row.orderId);
    if (!order) {
      throw new HttpError(404, '原订单不存在，无法重打');
    }
    orderNo = order.orderNo;
    text = await buildTemplateText(order, row.docType);
  }

  const result = await sendAndLog({
    printer,
    orderId: row.orderId,
    orderNo,
    docType: row.docType,
    text,
    printedBy: operator.id,
  });
  await dbClient.db
    .update(schema.printLog)
    .set({ retryCount: sql`${schema.printLog.retryCount} + 1` })
    .where(eq(schema.printLog.id, id));
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PRINT',
    target: orderNo,
    detail: `重打${PRINT_DOC_LABELS[row.docType]}：${result.message}`,
    ip,
  });
  return { ok: result.ok, message: result.message, logId: result.logId };
}

export async function deletePrintLog(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const detailQuery = printLogDetailQuery(id);
  const row = await dbClient.queryOne<{ id: number; orderNo: string | null }>(
    detailQuery.sql,
    detailQuery.params,
  );
  if (!row) {
    throw new HttpError(404, '打印日志不存在');
  }
  await dbClient.db.delete(schema.printLog).where(eq(schema.printLog.id, id));
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PRINT',
    target: row.orderNo ?? `log#${id}`,
    detail: '删除打印日志（仅清日志，不动订单）',
    ip,
  });
}

/** 供健康检查 / 仪表使用：打印机在线数。 */
export async function printerHealth(): Promise<{ total: number; online: number }> {
  const query = printerHealthQuery();
  const row = await dbClient.queryOne<{ total: number; online: number }>(
    query.sql,
    query.params,
  );
  return { total: Number(row?.total ?? 0), online: Number(row?.online ?? 0) };
}
