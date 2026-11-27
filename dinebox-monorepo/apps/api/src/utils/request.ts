/**
 * 请求辅助：来源 IP 与当前登录用户 ID。
 */
import { getConnInfo } from '@hono/node-server/conninfo';

import type { AppContext } from '../types/context.js';

/** 客户端来源 IP：优先反向代理头，缺失时回退到 TCP 直连地址。 */
export function getRequestIp(c: AppContext): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || undefined;
  }
  const direct = c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip');
  if (direct) {
    return direct;
  }
  try {
    const info = getConnInfo(c as never);
    return info.remote.address ?? undefined;
  } catch {
    return undefined;
  }
}

/** 当前登录用户 ID；公开接口返回 null。 */
export function currentUserId(c: AppContext): number | null {
  return c.get('currentUser')?.id ?? null;
}
