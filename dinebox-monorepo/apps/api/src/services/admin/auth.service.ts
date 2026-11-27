/**
 * 登录与会话：账号密码校验、JWT 签发、角色菜单与门店信息下发、修改密码。
 * 单表查询与更新使用 Drizzle。
 */
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

import type { AdminProfile, AuthContextInfo, LoginResult, MenuInfo, Role } from '@dinebox/types';
import { nowString } from '@dinebox/utils';

import { dbClient, schema } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { signToken } from '../../utils/jwt.js';
import { writeOperationLog } from '../audit.service.js';
import { getShopConfig } from '../config.service.js';

/** 按角色读取可见菜单；管理员固定全量。 */
export async function getMenusForRole(role: Role): Promise<MenuInfo[]> {
  const rows =
    role === 'ADMIN'
      ? await dbClient.db
          .select({
            id: schema.sysMenu.id,
            menuCode: schema.sysMenu.menuCode,
            menuName: schema.sysMenu.menuName,
            sort: schema.sysMenu.sort,
          })
          .from(schema.sysMenu)
          .where(eq(schema.sysMenu.status, 'ENABLED'))
          .orderBy(schema.sysMenu.sort)
      : await dbClient.db
          .select({
            id: schema.sysMenu.id,
            menuCode: schema.sysMenu.menuCode,
            menuName: schema.sysMenu.menuName,
            sort: schema.sysMenu.sort,
          })
          .from(schema.sysRoleMenu)
          .innerJoin(schema.sysMenu, eq(schema.sysMenu.id, schema.sysRoleMenu.menuId))
          .where(
            and(
              eq(schema.sysRoleMenu.role, 'CASHIER'),
              eq(schema.sysMenu.status, 'ENABLED'),
            ),
          )
          .orderBy(schema.sysMenu.sort);

  return rows.map((row) => ({
    id: row.id,
    code: row.menuCode,
    name: row.menuName,
    sort: row.sort,
  })) as MenuInfo[];
}

/** 登录：失败统一提示，不泄露账号是否存在；成功后记录登录日志。 */
export async function login(
  username: string,
  password: string,
  ip: string | null,
): Promise<LoginResult> {
  const [row] = await dbClient.db
    .select({
      id: schema.sysUser.id,
      username: schema.sysUser.username,
      realName: schema.sysUser.realName,
      passwordHash: schema.sysUser.passwordHash,
      role: schema.sysUser.role,
      status: schema.sysUser.status,
      isDeleted: schema.sysUser.isDeleted,
    })
    .from(schema.sysUser)
    .where(eq(schema.sysUser.username, username))
    .limit(1);

  const invalid = new HttpError(401, '账号或密码不正确');
  if (!row || row.isDeleted === 1 || row.status !== 'ENABLED') {
    throw invalid;
  }

  const matched = await bcrypt.compare(password, row.passwordHash);
  if (!matched) {
    throw invalid;
  }

  await dbClient.db
    .update(schema.sysUser)
    .set({ lastLoginAt: nowString() })
    .where(eq(schema.sysUser.id, row.id));

  const role = row.role as Role;
  const menus = await getMenusForRole(role);
  const { token, expiresIn } = await signToken(row.id);
  const profile: AdminProfile = {
    id: row.id,
    username: row.username,
    realName: row.realName,
    role,
  };

  await writeOperationLog({
    userId: row.id,
    username: row.username,
    action: 'LOGIN',
    target: row.username,
    detail: `登录成功（${role === 'ADMIN' ? '管理员' : '收银员'}）`,
    ip,
  });

  return { token, expiresIn, profile, menus };
}

/** 当前登录态详情：资料 + 菜单 + 门店配置。 */
export async function getAuthContext(userId: number): Promise<AuthContextInfo> {
  const [row] = await dbClient.db
    .select({
      id: schema.sysUser.id,
      username: schema.sysUser.username,
      realName: schema.sysUser.realName,
      role: schema.sysUser.role,
      status: schema.sysUser.status,
      isDeleted: schema.sysUser.isDeleted,
    })
    .from(schema.sysUser)
    .where(eq(schema.sysUser.id, userId))
    .limit(1);

  if (!row || row.isDeleted === 1 || row.status !== 'ENABLED') {
    throw new HttpError(401, '账号不存在、已停用或已被删除');
  }

  const role = row.role as Role;
  const [menus, shop] = await Promise.all([getMenusForRole(role), getShopConfig()]);
  return {
    profile: {
      id: row.id,
      username: row.username,
      realName: row.realName,
      role,
    },
    menus,
    shop,
  };
}

/** 修改密码：校验原密码后更新哈希，并记录操作日志。 */
export async function changePassword(
  userId: number,
  oldPassword: string,
  newPassword: string,
  ip: string | null,
): Promise<void> {
  const [row] = await dbClient.db
    .select({
      passwordHash: schema.sysUser.passwordHash,
      username: schema.sysUser.username,
    })
    .from(schema.sysUser)
    .where(and(eq(schema.sysUser.id, userId), eq(schema.sysUser.isDeleted, 0)))
    .limit(1);

  if (!row) {
    throw new HttpError(404, '账号不存在');
  }
  const matched = await bcrypt.compare(oldPassword, row.passwordHash);
  if (!matched) {
    throw new HttpError(400, '原密码不正确');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await dbClient.db
    .update(schema.sysUser)
    .set({ passwordHash: hash })
    .where(eq(schema.sysUser.id, userId));

  await writeOperationLog({
    userId,
    username: row.username,
    action: 'PASSWORD_CHANGE',
    target: row.username,
    detail: '修改登录密码',
    ip,
  });
}
