/** 统一 API 响应结构；成功时 code 恒为 200。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 统一分页结构。 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 角色：管理员 / 收银员。 */
export type Role = 'ADMIN' | 'CASHIER';

/** 账号状态。 */
export type UserStatus = 'ENABLED' | 'DISABLED';

/** 后台菜单编码，与路由和接口权限一致。 */
export type MenuCode =
  | 'cashier'
  | 'dishes'
  | 'tables'
  | 'printer'
  | 'orders'
  | 'reports'
  | 'audit'
  | 'settings';

/** 侧边栏菜单。 */
export interface MenuInfo {
  id: number;
  code: MenuCode;
  name: string;
  sort: number;
}

/** 订单状态：待结算 / 已结清 / 已取消；挂单是待结算下的暂存标记。 */
export type OrderStatus = 'PENDING' | 'SETTLED' | 'CANCELLED';

/** 结算方式：现金 / 前台微信静态码 / 前台支付宝静态码 / 其他。 */
export type PayMethod = 'CASH' | 'WECHAT_QR' | 'ALIPAY_QR' | 'OTHER';

/** 桌台实时状态（由未结订单推导）。 */
export type LiveTableStatus = 'FREE' | 'OCCUPIED' | 'HUNG';

/** 菜品上下架状态。 */
export type DishStatus = 'ON' | 'OFF';

/** 打印单据类型。 */
export type PrintDocType = 'KITCHEN' | 'BILL' | 'TEST';

/** 打印机用途。 */
export type PrinterPurpose = 'KITCHEN' | 'BILL' | 'ALL';

/** 打印连接状态。 */
export type PrinterStatus = 'ONLINE' | 'OFFLINE';

/** 打印结果。 */
export type PrintStatus = 'SUCCESS' | 'FAIL';

/** 报表页面级口径。 */
export type ReportRange = 'today' | '7d';

/** 列表时间筛选口径。 */
export type DateRangeKey = 'all' | 'today' | '7d' | 'custom';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: '管理员',
  CASHIER: '收银员',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: '待结算',
  SETTLED: '已结清',
  CANCELLED: '已取消',
};

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  CASH: '现金',
  WECHAT_QR: '微信静态码',
  ALIPAY_QR: '支付宝静态码',
  OTHER: '其他',
};

export const PRINTER_PURPOSE_LABELS: Record<PrinterPurpose, string> = {
  KITCHEN: '后厨小票',
  BILL: '顾客结账单',
  ALL: '后厨小票 + 结账单',
};

export const PRINT_DOC_LABELS: Record<PrintDocType, string> = {
  KITCHEN: '后厨小票',
  BILL: '顾客结账单',
  TEST: '测试页',
};

/** 打印模板支持的占位变量（与后端渲染器保持一致）。 */
export const PRINT_TEMPLATE_VARS = [
  '{title}',
  '{table}',
  '{order_no}',
  '{time}',
  '{items}',
  '{note}',
  '{total}',
  '{off}',
  '{payable}',
  '{people}',
] as const;

/** 默认 ESC/POS 模板（后台可编辑，变量见 PRINT_TEMPLATE_VARS）。 */
export const DEFAULT_PRINT_TEMPLATES = {
  KITCHEN:
    '【后厨单】{table}桌\n单号：{order_no}\n人数：{people}\n--------------------------------\n{items}\n--------------------------------\n备注：{note}\n下单时间：{time}',
  BILL: '{title}\n结账单\n单号：{order_no}\n--------------------------------\n桌号：{table}\n{items}\n--------------------------------\n合计：{total}\n抹零：{off}\n应收：{payable}\n{time}',
} as const;

/** 日期参数统一格式：YYYY-MM-DD。 */
export interface DateRangeParams {
  range?: DateRangeKey;
  from?: string;
  to?: string;
}
