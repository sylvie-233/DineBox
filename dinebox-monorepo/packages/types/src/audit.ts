import type { PageResult } from './common.js';

/** 操作类型编码与中文名（前端筛选与彩色标签共用）。 */
export const OPERATION_ACTIONS = {
  LOGIN: '登录',
  LOGOUT: '退出登录',
  PASSWORD_CHANGE: '修改密码',
  ORDER_CREATE: '顾客下单',
  ORDER_MODIFY: '改单',
  ITEM_RETURN: '单品退菜',
  ORDER_CANCEL: '整单取消',
  ORDER_HUNG: '挂单',
  ORDER_RESUME: '恢复待结算',
  ORDER_SETTLE: '结算',
  PRINT: '手动重打',
  PRINTER_ADD: '新增打印机',
  PRINTER_UPDATE: '编辑打印机',
  PRINTER_DELETE: '删除打印机',
  PRINTER_TEST: '测试打印',
  TEMPLATE_UPDATE: '修改打印模板',
  CATEGORY_SAVE: '分类维护',
  CATEGORY_DELETE: '删除分类',
  DISH_SAVE: '菜品维护',
  DISH_DELETE: '删除菜品',
  ADDON_SAVE: '加料维护',
  ADDON_DELETE: '删除加料',
  AREA_SAVE: '区域维护',
  AREA_DELETE: '删除区域',
  TABLE_SAVE: '桌台维护',
  TABLE_DELETE: '删除桌台',
  USER_ADD: '新增账号',
  USER_UPDATE: '账号维护',
  PERMISSION_UPDATE: '角色权限修改',
  PERMISSION_RESET: '角色权限重置',
  CONFIG_UPDATE: '系统设置变更',
  AUDIT_DELETE: '删除操作日志',
} as const;

export type OperationAction = keyof typeof OPERATION_ACTIONS;

/** 操作日志行。 */
export interface AuditLogRow {
  id: number;
  userId: number | null;
  username: string;
  action: OperationAction;
  actionLabel: string;
  target: string;
  detail: string;
  ip: string;
  createdAt: string;
}

/** 操作日志筛选。 */
export interface AuditQuery {
  kw?: string;
  range?: 'all' | 'today' | '7d' | 'custom';
  from?: string;
  to?: string;
  action?: string;
  userId?: number;
  page?: number;
  pageSize?: number;
}

/** 操作日志分页结果 + 筛选合计。 */
export interface AuditPage extends PageResult<AuditLogRow> {
  summary: {
    count: number;
    operators: number;
  };
}

/** 操作日志筛选选项。 */
export interface AuditOptions {
  actions: Array<{ value: string; label: string }>;
  users: Array<{ id: number; name: string }>;
}
