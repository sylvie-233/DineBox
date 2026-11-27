/** 操作日志控制器（仅管理员）。 */
import type { AuditQuery } from '@dinebox/types';

import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import {
  deleteAuditLog,
  getAuditLog,
  getAuditOptions,
  listAuditLogs,
  writeOperationLog,
} from '../../services/audit.service.js';

export async function list(c: AppContext, query: AuditQuery) {
  return success(c, await listAuditLogs(query));
}

export async function options(c: AppContext) {
  return success(c, await getAuditOptions());
}

export async function detail(c: AppContext, id: number) {
  const row = await getAuditLog(id);
  return success(c, row);
}

export async function remove(c: AppContext, id: number) {
  const user = operatorOf(c);
  const row = await getAuditLog(id);
  await deleteAuditLog(id);
  await writeOperationLog({
    userId: user.id,
    username: user.username,
    action: 'AUDIT_DELETE',
    target: row ? `${row.actionLabel} #${id}` : `log#${id}`,
    detail: '删除操作日志（仅清留痕，不动业务数据）',
    ip: ipOf(c),
  });
  return success(c, null, '日志已删除');
}
