/**
 * 系统设置服务：门店信息、抹零开关、账号管理与角色菜单权限。
 *
 * 安全约束：
 * - 不能禁用自己或修改自己的角色；
 * - 至少保留一个启用状态的管理员，避免后台自锁；
 * - 操作日志与系统设置不下放给收银员（接口层同步限制）。
 */
import bcrypt from 'bcryptjs';
import { and, count, eq, ne } from 'drizzle-orm';

import type {
  AdminProfile,
  AdminUserCreateInput,
  AdminUserRow,
  AdminUserUpdateInput,
  MenuInfo,
  Role,
  ShopConfigSaveInput,
  SystemSettings,
} from '@dinebox/types';
import { ROLE_LABELS } from '@dinebox/types';

import { dbClient, schema } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { writeOperationLog } from '../audit.service.js';
import { getShopConfig, setConfigs } from '../config.service.js';

function toUser(row: {
  id: number;
  username: string;
  realName: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}): AdminUserRow {
  return {
    id: row.id,
    username: row.username,
    realName: row.realName,
    role: row.role as Role,
    status: row.status as AdminUserRow['status'],
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

async function listUsers(): Promise<AdminUserRow[]> {
  const rows = await dbClient.db
    .select({
      id: schema.sysUser.id,
      username: schema.sysUser.username,
      realName: schema.sysUser.realName,
      role: schema.sysUser.role,
      status: schema.sysUser.status,
      lastLoginAt: schema.sysUser.lastLoginAt,
      createdAt: schema.sysUser.createdAt,
    })
    .from(schema.sysUser)
    .where(eq(schema.sysUser.isDeleted, 0))
    .orderBy(schema.sysUser.id);
  return rows.map(toUser);
}

async function listMenus(): Promise<MenuInfo[]> {
  const rows = await dbClient.db
    .select({
      id: schema.sysMenu.id,
      menuCode: schema.sysMenu.menuCode,
      menuName: schema.sysMenu.menuName,
      sort: schema.sysMenu.sort,
    })
    .from(schema.sysMenu)
    .where(eq(schema.sysMenu.status, 'ENABLED'))
    .orderBy(schema.sysMenu.sort);
  return rows.map((row) => ({
    id: row.id,
    code: row.menuCode,
    name: row.menuName,
    sort: row.sort,
  })) as MenuInfo[];
}

async function cashierMenuCodes(): Promise<string[]> {
  const rows = await dbClient.db
    .select({ menuCode: schema.sysMenu.menuCode })
    .from(schema.sysRoleMenu)
    .innerJoin(schema.sysMenu, eq(schema.sysMenu.id, schema.sysRoleMenu.menuId))
    .where(
      and(eq(schema.sysRoleMenu.role, 'CASHIER'), eq(schema.sysMenu.status, 'ENABLED')),
    )
    .orderBy(schema.sysMenu.sort);
  return rows.map((row) => row.menuCode);
}

/** 系统设置页聚合数据。 */
export async function getSystemSettings(): Promise<SystemSettings> {
  const [shop, menus, cashierMenus, users] = await Promise.all([
    getShopConfig(),
    listMenus(),
    cashierMenuCodes(),
    listUsers(),
  ]);
  return {
    shop,
    menus,
    roleMenus: {
      ADMIN: menus.map((menu) => menu.code),
      CASHIER: cashierMenus,
    },
    users,
  };
}

/** 保存门店信息与抹零配置。 */
export async function saveShopConfig(
  input: ShopConfigSaveInput,
  operator: AdminProfile,
  ip: string | null,
): Promise<void> {
  await setConfigs(
    {
      shop_name: input.shopName,
      receipt_title: input.receiptTitle,
      shop_open_time: input.openTime,
      shop_close_time: input.closeTime,
      shop_phone: input.phone,
      round_off_enabled: input.roundOffEnabled ? '1' : '0',
      round_off_rule: input.roundOffRule,
    },
    operator.id,
  );
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'CONFIG_UPDATE',
    target: input.shopName,
    detail: `门店设置：营业 ${input.openTime}-${input.closeTime}；抹零${
      input.roundOffEnabled ? `开启（${input.roundOffRule}）` : '关闭'
    }`,
    ip,
  });
}

/* ========================= 账号 ========================= */

export async function createUser(
  input: AdminUserCreateInput,
  operator: AdminProfile,
  ip: string | null,
): Promise<{ id: number }> {
  const [exists] = await dbClient.db
    .select({ id: schema.sysUser.id })
    .from(schema.sysUser)
    .where(eq(schema.sysUser.username, input.username))
    .limit(1);
  if (exists) {
    throw new HttpError(409, '账号已存在，请更换');
  }
  const hash = await bcrypt.hash(input.password, 10);
  const [result] = await dbClient.db.insert(schema.sysUser).values({
    username: input.username,
    passwordHash: hash,
    realName: input.realName ?? '',
    role: input.role,
    status: 'ENABLED',
  });
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'USER_ADD',
    target: input.username,
    detail: `新增${ROLE_LABELS[input.role]}账号`,
    ip,
  });
  return { id: result.insertId };
}

async function countEnabledAdmins(excludeId: number): Promise<number> {
  const [row] = await dbClient.db
    .select({ total: count() })
    .from(schema.sysUser)
    .where(
      and(
        eq(schema.sysUser.role, 'ADMIN'),
        eq(schema.sysUser.status, 'ENABLED'),
        eq(schema.sysUser.isDeleted, 0),
        ne(schema.sysUser.id, excludeId),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function updateUser(
  id: number,
  input: AdminUserUpdateInput,
  operator: AdminProfile,
  ip: string | null,
): Promise<void> {
  const [row] = await dbClient.db
    .select({
      id: schema.sysUser.id,
      username: schema.sysUser.username,
      realName: schema.sysUser.realName,
      role: schema.sysUser.role,
      status: schema.sysUser.status,
    })
    .from(schema.sysUser)
    .where(and(eq(schema.sysUser.id, id), eq(schema.sysUser.isDeleted, 0)))
    .limit(1);
  if (!row) {
    throw new HttpError(404, '账号不存在');
  }
  if (id === operator.id) {
    if (input.status === 'DISABLED') {
      throw new HttpError(400, '不能禁用当前登录账号');
    }
    if (input.role && input.role !== operator.role) {
      throw new HttpError(400, '不能修改当前登录账号的角色');
    }
  }

  const nextRole = (input.role ?? row.role) as Role;
  const nextStatus = input.status ?? row.status;
  const losesAdmin = row.role === 'ADMIN' && (nextRole !== 'ADMIN' || nextStatus !== 'ENABLED');
  if (losesAdmin && (await countEnabledAdmins(id)) === 0) {
    throw new HttpError(409, '至少需要保留一个启用的管理员账号');
  }

  const changes: {
    realName?: string;
    role?: Role;
    status?: 'ENABLED' | 'DISABLED';
    passwordHash?: string;
  } = {};
  if (input.realName !== undefined) changes.realName = input.realName;
  if (input.role !== undefined) changes.role = input.role;
  if (input.status !== undefined) changes.status = input.status;
  if (input.password) {
    changes.passwordHash = await bcrypt.hash(input.password, 10);
  }
  if (Object.keys(changes).length === 0) {
    return;
  }
  await dbClient.db.update(schema.sysUser).set(changes).where(eq(schema.sysUser.id, id));

  const descriptions: string[] = [];
  if (input.realName !== undefined) descriptions.push(`姓名→${input.realName}`);
  if (input.role !== undefined) descriptions.push(`角色→${ROLE_LABELS[input.role]}`);
  if (input.status !== undefined) {
    descriptions.push(input.status === 'ENABLED' ? '启用' : '禁用');
  }
  if (input.password) descriptions.push('重置密码');

  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'USER_UPDATE',
    target: row.username,
    detail: descriptions.join('、'),
    ip,
  });
}

/* ========================= 权限 ========================= */

const CASHIER_ASSIGNABLE = new Set([
  'cashier',
  'dishes',
  'tables',
  'printer',
  'orders',
  'reports',
]);

async function applyCashierMenus(menuCodes: string[]): Promise<void> {
  const menus = await listMenus();
  const codeToId = new Map(menus.map((menu) => [menu.code, menu.id]));
  const ids: number[] = [];
  for (const code of menuCodes) {
    if (!CASHIER_ASSIGNABLE.has(code)) {
      continue;
    }
    const menuId = codeToId.get(code as MenuInfo['code']);
    if (menuId) {
      ids.push(menuId);
    }
  }
  if (ids.length === 0) {
    throw new HttpError(400, '请至少为收银员保留一个菜单');
  }
  const uniqueIds = [...new Set(ids)];
  await dbClient.db.transaction(async (tx) => {
    await tx.delete(schema.sysRoleMenu).where(eq(schema.sysRoleMenu.role, 'CASHIER'));
    await tx.insert(schema.sysRoleMenu).values(
      uniqueIds.map((menuId) => ({ role: 'CASHIER' as const, menuId })),
    );
  });
}

export async function savePermissions(
  cashierMenuCodes: string[],
  operator: AdminProfile,
  ip: string | null,
): Promise<void> {
  await applyCashierMenus(cashierMenuCodes);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PERMISSION_UPDATE',
    target: 'CASHIER',
    detail: `收银员菜单：${cashierMenuCodes.join(',')}`,
    ip,
  });
}

export async function resetPermissions(
  operator: AdminProfile,
  ip: string | null,
): Promise<void> {
  await applyCashierMenus(['cashier']);
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'PERMISSION_RESET',
    target: 'CASHIER',
    detail: '恢复默认：收银员仅见收银台',
    ip,
  });
}
