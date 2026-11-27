import { useCallback, useEffect, useMemo } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';

import type { AdminProfile, AuthContextInfo, LoginResult, MenuInfo, ShopConfig } from '@dinebox/types';

import { adminFetch, clearAdminToken, storeAdminToken } from './api';
import { useAuthStore } from './store/auth';

/** 让所有后台列表 / 详情查询失效并重新拉取（写操作成功后调用）。 */
export async function revalidateAdminData(): Promise<void> {
  await globalMutate(
    (key) => Array.isArray(key) || (typeof key === 'string' && key.startsWith('/')),
    undefined,
    { revalidate: true },
  );
}

/** 清空 SWR 缓存，避免切换账号后串用上一会话的数据。 */
async function clearAdminCache(): Promise<void> {
  await globalMutate(() => true, undefined, { revalidate: false });
}

/**
 * 会话同步：首屏从 storage 恢复 token，有 token 无资料时请求 /auth/me；
 * 401 时清空会话与缓存。
 */
export function AuthSync() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const hydrate = useAuthStore((state) => state.hydrate);
  const setContext = useAuthStore((state) => state.setContext);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!initialized) {
      hydrate();
    }
  }, [initialized, hydrate]);

  const { data, error } = useSWR<AuthContextInfo>(
    initialized && token && !user ? ['/auth/me', token] : null,
    () => adminFetch<AuthContextInfo>('/auth/me'),
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    if (data) {
      setContext(data.profile, data.menus, data.shop);
    }
  }, [data, setContext]);

  const failSession = useCallback(() => {
    clearAdminToken();
    clearSession();
    void clearAdminCache();
  }, [clearSession]);

  useEffect(() => {
    if (error) {
      failSession();
    }
  }, [error, failSession]);

  useEffect(() => {
    window.addEventListener('dinebox-admin-unauthorized', failSession);
    return () => window.removeEventListener('dinebox-admin-unauthorized', failSession);
  }, [failSession]);

  return null;
}

export interface AuthValue {
  user: AdminProfile | null;
  token: string | null;
  menus: MenuInfo[];
  shop: ShopConfig | null;
  initialized: boolean;
  loading: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<AdminProfile>;
  logout: () => void;
  refresh: () => Promise<void>;
  revalidateAll: () => Promise<void>;
}

/** 后台登录态与操作；页面无需关心存储细节。 */
export function useAuth(): AuthValue {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const menus = useAuthStore((state) => state.menus);
  const shop = useAuthStore((state) => state.shop);
  const initialized = useAuthStore((state) => state.initialized);
  const setSession = useAuthStore((state) => state.setSession);
  const setContext = useAuthStore((state) => state.setContext);
  const clearSession = useAuthStore((state) => state.clearSession);

  const login = useCallback(
    async (username: string, password: string, remember: boolean) => {
      const result = await adminFetch<LoginResult>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      storeAdminToken(result.token, remember);
      try {
        const context = await adminFetch<AuthContextInfo>('/auth/me');
        await clearAdminCache();
        setSession(result.token, context.profile, context.menus, context.shop);
        return context.profile;
      } catch (error) {
        clearAdminToken();
        throw error;
      }
    },
    [setSession],
  );

  const logout = useCallback(() => {
    clearAdminToken();
    clearSession();
    void clearAdminCache();
  }, [clearSession]);

  const refresh = useCallback(async () => {
    const context = await adminFetch<AuthContextInfo>('/auth/me');
    setContext(context.profile, context.menus, context.shop);
    await revalidateAdminData();
  }, [setContext]);

  return useMemo<AuthValue>(
    () => ({
      user,
      token,
      menus,
      shop,
      initialized,
      loading: initialized && Boolean(token) && !user,
      login,
      logout,
      refresh,
      revalidateAll: revalidateAdminData,
    }),
    [user, token, menus, shop, initialized, login, logout, refresh],
  );
}
