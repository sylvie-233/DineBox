import type { MenuInfo, Role } from './common.js';

import type { AdminUserRow, ShopConfig } from './auth.js';

/** 系统设置页聚合数据。 */
export interface SystemSettings {
  shop: ShopConfig;
  menus: MenuInfo[];
  roleMenus: {
    ADMIN: string[];
    CASHIER: string[];
  };
  users: AdminUserRow[];
}

/** 保存系统配置入参（仅允许的开关与门店信息）。 */
export interface ShopConfigSaveInput {
  shopName: string;
  receiptTitle: string;
  openTime: string;
  closeTime: string;
  phone: string;
  roundOffEnabled: boolean;
  roundOffRule: 'ANGLE' | 'ANGLE5' | 'NONE';
}

/** 新增账号。 */
export interface AdminUserCreateInput {
  username: string;
  realName?: string;
  password: string;
  role: Role;
}

/** 修改账号。 */
export interface AdminUserUpdateInput {
  realName?: string;
  role?: Role;
  status?: 'ENABLED' | 'DISABLED';
  password?: string;
}

/** 保存角色菜单权限。 */
export interface PermissionSaveInput {
  cashierMenuCodes: string[];
}
