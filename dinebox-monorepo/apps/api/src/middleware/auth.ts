/**
 * 登录鉴权与角色权限：
 * - `authenticate` 解析 Bearer JWT 并回查账号状态与菜单权限；
 * - `requireAdmin` 仅管理员；
 * - `requireMenu` 管理员放行，收银员需角色菜单中配置了该菜单。
 *
 * 最终权限以接口鉴权为准，前端菜单隐藏只是体验层过滤。
 */
import { createMiddleware } from 'hono/factory';
import { and, eq } from 'drizzle-orm';

import type { Role } from '@dinebox/types';

import { dbClient, schema } from '../db/index.js';
import type { AppEnv, AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { verifyToken } from '../utils/jwt.js';

/** 回查账号与菜单权限：停用 / 删除后 token 立即失效。 */
export async function loadUser(
  userId: number,
): Promise<{ user: AuthUser; menuCodes: string[] } | null> {
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
    return null;
  }

  const menus =
    row.role === 'ADMIN'
      ? await dbClient.db
          .select({ menuCode: schema.sysMenu.menuCode })
          .from(schema.sysMenu)
          .where(eq(schema.sysMenu.status, 'ENABLED'))
          .orderBy(schema.sysMenu.sort)
      : await dbClient.db
          .select({ menuCode: schema.sysMenu.menuCode })
          .from(schema.sysRoleMenu)
          .innerJoin(schema.sysMenu, eq(schema.sysMenu.id, schema.sysRoleMenu.menuId))
          .where(
            and(
              eq(schema.sysRoleMenu.role, 'CASHIER'),
              eq(schema.sysMenu.status, 'ENABLED'),
            ),
          )
          .orderBy(schema.sysMenu.sort);

  return {
    user: {
      id: row.id,
      username: row.username,
      realName: row.realName,
      role: row.role as Role,
    },
    menuCodes: menus.map((item) => item.menuCode),
  };
}

/** 从 Authorization 头解析 Bearer token。 */
export function readBearer(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

/** 强制登录。 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const token = readBearer(c.req.header('authorization'));
  if (!token) {
    throw new HttpError(401, '未登录或登录已过期');
  }

  const payload = await verifyToken(token);
  if (!payload) {
    throw new HttpError(401, '登录状态已失效，请重新登录');
  }

  const result = await loadUser(payload.userId);
  if (!result) {
    throw new HttpError(401, '账号不存在、已停用或已被删除');
  }

  c.set('currentUser', result.user);
  c.set('menuCodes', result.menuCodes);
  await next();
});

/** 管理员限定。 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  if (user.role !== 'ADMIN') {
    throw new HttpError(403, '仅管理员可执行此操作');
  }
  await next();
});

/** 菜单权限：收银员需在角色菜单权限中获配该菜单；管理员固定全量。 */
export function requireMenu(menuCode: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('currentUser');
    if (!user) {
      throw new HttpError(401, '未登录或登录已过期');
    }
    if (user.role === 'ADMIN') {
      await next();
      return;
    }
    const allowed = c.get('menuCodes') ?? [];
    if (!allowed.includes(menuCode)) {
      throw new HttpError(403, '当前账号没有该功能权限，请联系管理员开通');
    }
    await next();
  });
}

/** 读取当前用户；未登录返回 undefined。 */
export function getCurrentUser(c: {
  get: (key: 'currentUser') => AuthUser | undefined;
}): AuthUser | undefined {
  return c.get('currentUser');
}
