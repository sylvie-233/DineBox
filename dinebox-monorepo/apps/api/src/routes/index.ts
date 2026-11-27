/**
 * API 路由总入口：挂载顾客端 / 后台 / 文件路由，
 * 注册 BearerAuth 安全方案并输出 `/api/openapi.json`。
 */
import { createApiRouter } from '../openapi/router.js';
import adminRoutes from './admin/index.js';
import fileRoutes from './files.js';
import publicRoutes from './public.js';

const router = createApiRouter();

router.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: '后台登录成功后签发的 JWT；顾客端接口无需鉴权。',
});

router.route('/public', publicRoutes);
router.route('/admin', adminRoutes);
router.route('/files', fileRoutes);

router.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'DineBox 扫码点餐 API',
    version: '1.0.0',
    description: [
      'DineBox 扫码点餐 v1 API（Hono + MySQL + RustFS + 局域网 ESC/POS 打印）。',
      '',
      '统一响应：成功 `{ code: 200, message, data }`，失败 `{ code, message, data: null }`。',
      '分页统一为 `{ list, total, page, pageSize, totalPages }`。',
      '后台接口位于 `/api/admin/*`，通过 `Authorization: Bearer <token>` 传递登录态，',
      '并按角色菜单权限做接口级鉴权；顾客端接口位于 `/api/public/*`，凭桌台二维码令牌访问。',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: '当前服务' }],
  tags: [
    { name: '顾客端', description: '扫码启动数据、下单与我的订单' },
    { name: '后台 · 认证', description: '登录、当前会话与修改密码' },
    { name: '后台 · 收银台', description: '桌台概览、订单检索、改单/退菜/挂单/取消/结算' },
    { name: '后台 · 菜品', description: '分类、菜品、规格组与加料' },
    { name: '后台 · 桌台', description: '区域、桌台与二维码' },
    { name: '后台 · 打印', description: '打印机、模板、日志与重打' },
    { name: '后台 · 订单', description: '订单流水筛选、详情与 Excel 导出' },
    { name: '后台 · 报表', description: '经营概览、趋势、排行、对账与退菜' },
    { name: '后台 · 操作日志', description: '全量留痕查询与清理' },
    { name: '后台 · 设置', description: '门店信息、抹零、账号与角色菜单权限' },
    { name: '后台 · 上传', description: '菜品图片上传' },
    { name: '文件', description: '对象存储代理读取' },
  ],
  security: [{ BearerAuth: [] }],
});

export default router;
