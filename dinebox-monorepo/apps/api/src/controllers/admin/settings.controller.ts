/** 系统设置控制器：门店配置、账号与角色菜单权限。 */
import type {
  AdminUserCreateInput,
  AdminUserUpdateInput,
  ShopConfigSaveInput,
} from '@dinebox/types';

import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import {
  createUser,
  getSystemSettings,
  resetPermissions,
  savePermissions,
  saveShopConfig,
  updateUser,
} from '../../services/admin/settings.service.js';

export async function settings(c: AppContext) {
  return success(c, await getSystemSettings());
}

export async function saveShop(c: AppContext, input: ShopConfigSaveInput) {
  const user = operatorOf(c);
  await saveShopConfig(input, user, ipOf(c));
  return success(c, null, '设置已保存');
}

export async function addUser(c: AppContext, input: AdminUserCreateInput) {
  const user = operatorOf(c);
  return success(c, await createUser(input, user, ipOf(c)), '账号已新增', 201);
}

export async function editUser(c: AppContext, id: number, input: AdminUserUpdateInput) {
  const user = operatorOf(c);
  await updateUser(id, input, user, ipOf(c));
  return success(c, null, '账号已更新');
}

export async function permissions(c: AppContext, input: { cashierMenuCodes: string[] }) {
  const user = operatorOf(c);
  await savePermissions(input.cashierMenuCodes, user, ipOf(c));
  return success(c, null, '权限已更新');
}

export async function resetPermissionsHandler(c: AppContext) {
  const user = operatorOf(c);
  await resetPermissions(user, ipOf(c));
  return success(c, null, '已恢复默认权限');
}
