/**
 * 请求上下文类型：登录用户、菜单权限与请求级日志。
 */
import type { Context } from 'hono';

import type { Logger } from '@dinebox/logger';
import type { Role } from '@dinebox/types';

/** 当前请求的登录用户（由鉴权中间件注入）。 */
export interface AuthUser {
  id: number;
  username: string;
  realName: string;
  role: Role;
}

/** Hono 应用环境变量。 */
export interface AppEnv {
  Variables: {
    currentUser?: AuthUser;
    /** 当前角色可访问的菜单编码；管理员为全部菜单。 */
    menuCodes?: string[];
    /** 请求级子日志，由 requestLogger 中间件注入。 */
    logger?: Logger;
  };
}

export type AppContext = Context<AppEnv>;
