import type { MenuInfo, Role, UserStatus } from './common.js';

/** 门店信息（顾客端与结账单共用）。 */
export interface ShopConfig {
  shopName: string;
  receiptTitle: string;
  openTime: string;
  closeTime: string;
  phone: string;
  roundOffEnabled: boolean;
  roundOffRule: 'ANGLE' | 'ANGLE5' | 'NONE';
}

/** 当前登录账号。 */
export interface AdminProfile {
  id: number;
  username: string;
  realName: string;
  role: Role;
}

/** 登录结果。 */
export interface LoginResult {
  token: string;
  expiresIn: number;
  profile: AdminProfile;
  menus: MenuInfo[];
}

/** 登录态详情（/auth/me）。 */
export interface AuthContextInfo {
  profile: AdminProfile;
  menus: MenuInfo[];
  shop: ShopConfig;
}

/** 账号列表行。 */
export interface AdminUserRow {
  id: number;
  username: string;
  realName: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

/** 角色菜单权限矩阵。 */
export interface RoleMenuConfig {
  menus: MenuInfo[];
  /** 收银员可访问的菜单编码；管理员固定全量，不在此列表中生效。 */
  cashierMenus: string[];
}
