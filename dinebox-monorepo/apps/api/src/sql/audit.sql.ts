/** 操作日志域手写 SQL：复杂筛选、分页计数与详情。 */
import { resolveDateRange } from '@dinebox/utils';

import { likeParam } from './shared.js';
import type { SqlQuery } from './types.js';

interface AuditFilterInput {
  kw?: string;
  range?: 'all' | 'today' | '7d' | 'custom';
  from?: string;
  to?: string;
  action?: string;
  userId?: number;
}

function buildWhere(query: AuditFilterInput): { where: string; params: unknown[] } {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];

  const range = resolveDateRange(query.range, query.from, query.to);
  if (range) {
    where.push('created_at BETWEEN ? AND ?');
    params.push(range.from, range.to);
  }
  if (query.action) {
    where.push('action = ?');
    params.push(query.action);
  }
  if (query.userId) {
    where.push('user_id = ?');
    params.push(query.userId);
  }
  if (query.kw) {
    where.push('(target LIKE ? OR detail LIKE ? OR username LIKE ?)');
    const like = likeParam(query.kw);
    params.push(like, like, like);
  }
  return { where: where.join(' AND '), params };
}

export function auditListQuery(
  query: AuditFilterInput,
  pageSize: number,
  offset: number,
): SqlQuery {
  const { where, params } = buildWhere(query);
  return {
    sql: `SELECT id, user_id AS userId, username, action, target, detail, ip,
                 created_at AS createdAt
            FROM sys_operation_log
           WHERE ${where}
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  };
}

export function auditCountQuery(query: AuditFilterInput): SqlQuery {
  const { where, params } = buildWhere(query);
  return {
    sql: `SELECT COUNT(*) AS total FROM sys_operation_log WHERE ${where}`,
    params,
  };
}

export function auditOperatorsQuery(query: AuditFilterInput): SqlQuery {
  const { where, params } = buildWhere(query);
  return {
    sql: `SELECT COUNT(DISTINCT username) AS operators FROM sys_operation_log WHERE ${where}`,
    params,
  };
}

export function auditDetailQuery(id: number): SqlQuery {
  return {
    sql: `SELECT id, user_id AS userId, username, action, target, detail, ip,
                 created_at AS createdAt
            FROM sys_operation_log WHERE id = ? LIMIT 1`,
    params: [id],
  };
}
