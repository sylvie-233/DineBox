/**
 * 操作日志服务：所有影响业务数据的操作统一写入 sys_operation_log。
 * 写日志失败只记录应用日志，不阻断业务流程（留痕优先但不牺牲可用性）。
 */
import { and, eq } from 'drizzle-orm';

import type { AuditLogRow, AuditOptions, AuditPage } from '@dinebox/types';
import { OPERATION_ACTIONS, type OperationAction } from '@dinebox/types';

import { dbClient, schema } from '../db/index.js';
import {
  auditCountQuery,
  auditDetailQuery,
  auditListQuery,
  auditOperatorsQuery,
} from '../sql/audit.sql.js';
import { pageMeta, pageOffset } from '../sql/shared.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('audit');

export interface OperationLogInput {
  userId: number | null;
  username?: string;
  action: OperationAction;
  target?: string;
  detail?: string;
  ip?: string | null;
}

/** 写入操作日志（异步失败不影响业务）。 */
export async function writeOperationLog(input: OperationLogInput): Promise<void> {
  try {
    let username = input.username ?? '';
    if (!username && input.userId) {
      const [row] = await dbClient.db
        .select({ username: schema.sysUser.username })
        .from(schema.sysUser)
        .where(eq(schema.sysUser.id, input.userId))
        .limit(1);
      username = row?.username ?? '';
    }
    await dbClient.db.insert(schema.sysOperationLog).values({
      userId: input.userId,
      username,
      action: input.action,
      target: (input.target ?? '').slice(0, 64),
      detail: (input.detail ?? '').slice(0, 500),
      ip: input.ip ?? '',
    });
  } catch (error) {
    log.error('写入操作日志失败', error, {
      action: input.action,
      target: input.target,
    });
  }
}

interface AuditRow {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  createdAt: string;
}

function toRow(row: AuditRow): AuditLogRow {
  const action = row.action as OperationAction;
  return {
    id: row.id,
    userId: row.userId,
    username: row.username,
    action,
    actionLabel: OPERATION_ACTIONS[action] ?? row.action,
    target: row.target,
    detail: row.detail,
    ip: row.ip,
    createdAt: row.createdAt,
  };
}

/** 分页查询操作日志。 */
export async function listAuditLogs(query: {
  kw?: string;
  range?: 'all' | 'today' | '7d' | 'custom';
  from?: string;
  to?: string;
  action?: string;
  userId?: number;
  page?: number;
  pageSize?: number;
}): Promise<AuditPage> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
  const listQuery = auditListQuery(query, pageSize, pageOffset(page, pageSize));
  const countQuery = auditCountQuery(query);
  const operatorsQuery = auditOperatorsQuery(query);

  const [rows, countRow, summaryRow] = await Promise.all([
    dbClient.query<AuditRow>(listQuery.sql, listQuery.params),
    dbClient.queryOne<{ total: number }>(countQuery.sql, countQuery.params),
    dbClient.queryOne<{ operators: number }>(operatorsQuery.sql, operatorsQuery.params),
  ]);

  const total = Number(countRow?.total ?? 0);
  return {
    list: rows.map(toRow),
    ...pageMeta(total, page, pageSize),
    summary: {
      count: total,
      operators: Number(summaryRow?.operators ?? 0),
    },
  };
}

/** 单条日志详情。 */
export async function getAuditLog(id: number): Promise<AuditLogRow | null> {
  const query = auditDetailQuery(id);
  const row = await dbClient.queryOne<AuditRow>(query.sql, query.params);
  return row ? toRow(row) : null;
}

/** 删除日志（仅清留痕，不动业务数据）。 */
export async function deleteAuditLog(id: number): Promise<boolean> {
  const [result] = await dbClient.db
    .delete(schema.sysOperationLog)
    .where(eq(schema.sysOperationLog.id, id));
  return result.affectedRows > 0;
}

/** 筛选选项：固定操作类型 + 实际出现过的操作人。 */
export async function getAuditOptions(): Promise<AuditOptions> {
  const users = await dbClient.db
    .select({ id: schema.sysUser.id, name: schema.sysUser.username })
    .from(schema.sysUser)
    .where(and(eq(schema.sysUser.isDeleted, 0)))
    .orderBy(schema.sysUser.id);
  return {
    actions: Object.entries(OPERATION_ACTIONS).map(([value, label]) => ({ value, label })),
    users,
  };
}
