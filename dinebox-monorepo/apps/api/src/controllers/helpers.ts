/** 控制器共用辅助：当前操作人、来源 IP。 */
import type { AdminProfile } from '@dinebox/types';

import type { AppContext } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { getRequestIp } from '../utils/request.js';

/** 当前登录操作人；未登录时抛 401。 */
export function operatorOf(c: AppContext): AdminProfile {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  return {
    id: user.id,
    username: user.username,
    realName: user.realName,
    role: user.role,
  };
}

/** 来源 IP。 */
export function ipOf(c: AppContext): string | null {
  return getRequestIp(c) ?? null;
}
