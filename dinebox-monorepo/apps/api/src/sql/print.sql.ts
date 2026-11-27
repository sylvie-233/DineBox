/** 打印域手写 SQL：打印日志联查、重打定位与打印机在线统计。 */
import type { PrintLogQuery } from '@dinebox/types';

import { likeParam } from './shared.js';
import type { SqlQuery } from './types.js';

const PRINT_LOG_SELECT = `SELECT l.id, l.order_id AS orderId, o.order_no AS orderNo,
        l.printer_id AS printerId, p.printer_name AS printerName,
        p.ip AS printerIp, p.port AS printerPort,
        l.doc_type AS docType, l.status, l.fail_reason AS failReason,
        l.retry_count AS retryCount, u.username AS printedByName,
        l.created_at AS createdAt
   FROM print_log l
   LEFT JOIN orders o ON o.id = l.order_id
   LEFT JOIN printer p ON p.id = l.printer_id
   LEFT JOIN sys_user u ON u.id = l.printed_by`;

function buildWhere(query: PrintLogQuery): { where: string; params: unknown[] } {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (query.kw) {
    where.push('(o.order_no LIKE ? OR p.printer_name LIKE ?)');
    const like = likeParam(query.kw);
    params.push(like, like);
  }
  if (query.docType) {
    where.push('l.doc_type = ?');
    params.push(query.docType);
  }
  if (query.printerId) {
    where.push('l.printer_id = ?');
    params.push(query.printerId);
  }
  if (query.status) {
    where.push('l.status = ?');
    params.push(query.status);
  }
  return { where: where.join(' AND '), params };
}

export function printLogListQuery(
  query: PrintLogQuery,
  pageSize: number,
  offset: number,
): SqlQuery {
  const { where, params } = buildWhere(query);
  return {
    sql: `${PRINT_LOG_SELECT} WHERE ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  };
}

export function printLogCountQuery(query: PrintLogQuery): SqlQuery {
  const { where, params } = buildWhere(query);
  return {
    sql: `SELECT COUNT(*) AS total
            FROM print_log l
            LEFT JOIN orders o ON o.id = l.order_id
            LEFT JOIN printer p ON p.id = l.printer_id
           WHERE ${where}`,
    params,
  };
}

export function printLogDetailQuery(id: number): SqlQuery {
  return { sql: `${PRINT_LOG_SELECT} WHERE l.id = ? LIMIT 1`, params: [id] };
}

/** 重打时定位原订单、打印机与单据类型。 */
export function printLogRetryLookupQuery(id: number): SqlQuery {
  return {
    sql: `SELECT l.order_id AS orderId, l.printer_id AS printerId, l.doc_type AS docType,
                 p.printer_name AS printerName, p.ip AS printerIp, p.port AS printerPort,
                 p.is_deleted AS printerDeleted
            FROM print_log l
            JOIN printer p ON p.id = l.printer_id
           WHERE l.id = ? LIMIT 1`,
    params: [id],
  };
}

export function printerHealthQuery(): SqlQuery {
  return {
    sql: `SELECT COUNT(*) AS total, SUM(status = 'ONLINE') AS online
            FROM printer WHERE is_deleted = 0`,
    params: [],
  };
}
