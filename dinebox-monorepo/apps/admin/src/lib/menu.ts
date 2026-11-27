/** 菜单与路由映射，前后端菜单编码保持一致。 */
import type { MenuCode, MenuInfo } from '@dinebox/types';

export const MENU_PATHS: Record<string, string> = {
  cashier: '/',
  dishes: '/dishes',
  tables: '/tables',
  printer: '/printers',
  orders: '/orders',
  reports: '/reports',
  audit: '/audit',
  settings: '/settings',
};

export const MENU_TITLES: Record<string, string> = {
  cashier: '收银台',
  dishes: '菜品管理',
  tables: '桌台管理',
  printer: '打印配置',
  orders: '订单流水',
  reports: '轻量报表',
  audit: '操作日志',
  settings: '系统设置',
};

/** 当前角色可用的第一个菜单路由（用于登录落地与越权重定向）。 */
export function firstMenuPath(menus: MenuInfo[]): string {
  for (const menu of menus) {
    const path = MENU_PATHS[menu.code as MenuCode];
    if (path) {
      return path;
    }
  }
  return '/';
}

export function pathToMenuCode(pathname: string): MenuCode | null {
  if (pathname === '/' || pathname.startsWith('/cashier')) return 'cashier';
  if (pathname.startsWith('/dishes')) return 'dishes';
  if (pathname.startsWith('/tables')) return 'tables';
  if (pathname.startsWith('/printers')) return 'printer';
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/audit')) return 'audit';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}
