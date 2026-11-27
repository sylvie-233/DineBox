/**
 * 请求校验 schema：与 OpenAPI 文档共用同一份定义。
 * 金额单位为元，最多两位小数；数量为整数。
 */
import { z } from '@hono/zod-openapi';

const id = z.coerce.number().int().positive();
const optionalId = z.coerce.number().int().positive().optional();
const money = z.number().min(0).max(999999);
const qty = z.number().int().min(1).max(99);

/* ========================= 认证 ========================= */
export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入账号').max(32),
  password: z.string().min(1, '请输入密码').max(64),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入原密码').max(64),
  newPassword: z
    .string()
    .min(8, '新密码至少 8 位')
    .max(20, '新密码最多 20 位')
    .regex(/[A-Za-z]/, '新密码需包含字母')
    .regex(/\d/, '新密码需包含数字'),
});

/* ========================= 顾客端 ========================= */
export const tableTokenQuerySchema = z.object({
  tk: z.string().trim().min(4).max(32),
});

const addonInputSchema = z.object({
  addonId: id,
  qty: z.number().int().min(1).max(99),
});

export const orderItemInputSchema = z.object({
  dishId: id,
  qty,
  specOptionIds: z.array(id).max(10).default([]),
  addons: z.array(addonInputSchema).max(20).default([]),
});

export const createOrderSchema = z.object({
  tableToken: z.string().trim().min(4).max(32),
  peopleCount: z.number().int().min(1).max(12),
  remark: z.string().trim().max(200).default(''),
  items: z.array(orderItemInputSchema).min(1, '请至少选择一个菜品').max(50),
});

/* ========================= 收银台 ========================= */
export const modifyOrderSchema = z.object({
  remark: z.string().trim().max(200).optional(),
  items: z
    .array(
      z.object({
        itemId: id,
        qty,
        // 省略表示只改数量（保留原规格/加料与单价）；提供数组则按当前菜品重新计价。
        specOptionIds: z.array(id).max(10).optional(),
        addons: z.array(addonInputSchema).max(20).optional(),
      }),
    )
    .max(50)
    .default([]),
  newItems: z.array(orderItemInputSchema).max(50).default([]),
});

export const returnItemsSchema = z.object({
  itemIds: z.array(id).min(1, '请选择要退的菜品').max(50),
  reason: z.string().trim().max(100).default(''),
});

export const settleSchema = z.object({
  payMethod: z.enum(['CASH', 'WECHAT_QR', 'ALIPAY_QR', 'OTHER']),
  roundOff: z.boolean().optional(),
});

export const cashierSearchSchema = z.object({
  kw: z.string().trim().min(1).max(32),
});

/* ========================= 菜品 / 加料 / 分类 ========================= */
export const categorySaveSchema = z.object({
  name: z.string().trim().min(1, '请输入分类名称').max(32),
  sort: z.number().int().min(0).max(9999).optional(),
});

export const moveSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export const dishSpecOptionSchema = z.object({
  name: z.string().trim().min(1, '选项名称不能为空').max(32),
  priceDiff: z.number().min(-999).max(999),
});

export const dishSpecGroupSchema = z.object({
  name: z.string().trim().min(1, '规格组名称不能为空').max(32),
  options: z.array(dishSpecOptionSchema).min(1, '规格组至少需要一个选项').max(20),
});

export const dishSaveSchema = z.object({
  name: z.string().trim().min(1, '请输入菜品名称').max(64),
  description: z.string().trim().max(200).default(''),
  categoryId: id,
  price: money,
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.enum(['ON', 'OFF']).default('ON'),
  soldOut: z.boolean().default(false),
  imageFileId: z.number().int().positive().nullable().optional(),
  specs: z.array(dishSpecGroupSchema).max(10).default([]),
  addonIds: z.array(id).max(50).default([]),
});

export const dishToggleSchema = z.object({
  soldOut: z.boolean().optional(),
  status: z.enum(['ON', 'OFF']).optional(),
});

export const addonSaveSchema = z.object({
  name: z.string().trim().min(1, '请输入加料名称').max(32),
  price: money,
  maxSelect: z.number().int().min(0).max(99).default(0),
});

/* ========================= 桌台 ========================= */
export const areaSaveSchema = z.object({
  name: z.string().trim().min(1, '请输入区域名称').max(32),
  sort: z.number().int().min(0).max(9999).optional(),
});

export const tableSaveSchema = z.object({
  name: z.string().trim().min(1, '请输入桌号').max(32),
  areaId: id,
  seats: z.number().int().min(1).max(99).nullable().optional(),
});

/* ========================= 打印 ========================= */
export const printerSaveSchema = z.object({
  name: z.string().trim().min(1, '请输入打印机名称').max(64),
  ip: z
    .string()
    .trim()
    .regex(
      /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/,
      '请输入合法的内网 IPv4 地址',
    ),
  port: z.number().int().min(1).max(65535).default(9100),
  purpose: z.enum(['KITCHEN', 'BILL', 'ALL']),
});

export const templateSaveSchema = z.object({
  content: z.string().min(1, '模板内容不能为空').max(8000),
});

export const templateTypeParamsSchema = z.object({
  type: z.enum(['KITCHEN', 'BILL']),
});

export const printLogQuerySchema = z.object({
  kw: z.string().trim().max(64).optional(),
  docType: z.enum(['KITCHEN', 'BILL', 'TEST']).optional(),
  printerId: optionalId,
  status: z.enum(['SUCCESS', 'FAIL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const reprintSchema = z.object({
  orderId: id,
  docType: z.enum(['KITCHEN', 'BILL']),
});

/* ========================= 订单流水 ========================= */
export const orderListQuerySchema = z.object({
  kw: z.string().trim().max(64).optional(),
  range: z.enum(['all', 'today', '7d', 'custom']).default('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tableId: optionalId,
  status: z.enum(['PENDING', 'HUNG', 'SETTLED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

/* ========================= 报表 ========================= */
export const reportQuerySchema = z.object({
  range: z.enum(['today', '7d']).default('today'),
  trendRange: z.coerce.number().int().refine((value) => value === 7 || value === 30, {
    message: 'trendRange 仅支持 7 或 30',
  }).default(7),
});

/* ========================= 操作日志 ========================= */
export const auditQuerySchema = z.object({
  kw: z.string().trim().max(64).optional(),
  range: z.enum(['all', 'today', '7d', 'custom']).default('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  action: z.string().trim().max(32).optional(),
  userId: optionalId,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

/* ========================= 系统设置 ========================= */
export const shopConfigSaveSchema = z.object({
  shopName: z.string().trim().min(1, '请输入门店名称').max(64),
  receiptTitle: z.string().trim().max(64).default(''),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '营业开始时间格式 HH:MM'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '营业结束时间格式 HH:MM'),
  phone: z.string().trim().max(32).default(''),
  roundOffEnabled: z.boolean(),
  roundOffRule: z.enum(['ANGLE', 'ANGLE5', 'NONE']),
});

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, '账号至少 3 位')
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, '账号仅支持字母、数字、下划线与短横线'),
  realName: z.string().trim().max(32).default(''),
  password: z.string().min(6, '初始密码至少 6 位').max(20),
  role: z.enum(['ADMIN', 'CASHIER']),
});

export const userUpdateSchema = z.object({
  realName: z.string().trim().max(32).optional(),
  role: z.enum(['ADMIN', 'CASHIER']).optional(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
  password: z.string().min(6).max(20).optional(),
});

export const permissionSaveSchema = z.object({
  cashierMenuCodes: z.array(z.string().trim().max(32)).max(20),
});
