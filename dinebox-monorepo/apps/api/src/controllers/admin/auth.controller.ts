/** 后台认证控制器。 */
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import {
  changePassword,
  getAuthContext,
  login,
} from '../../services/admin/auth.service.js';

export async function loginHandler(
  c: AppContext,
  input: { username: string; password: string },
) {
  const result = await login(input.username, input.password, ipOf(c));
  return success(c, result, '登录成功');
}

export async function me(c: AppContext) {
  const user = operatorOf(c);
  const data = await getAuthContext(user.id);
  return success(c, data);
}

export async function changePasswordHandler(
  c: AppContext,
  input: { oldPassword: string; newPassword: string },
) {
  const user = operatorOf(c);
  await changePassword(user.id, input.oldPassword, input.newPassword, ipOf(c));
  return success(c, null, '密码修改成功');
}
