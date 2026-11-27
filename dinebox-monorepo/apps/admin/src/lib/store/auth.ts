/** 后台登录态：Zustand 唯一数据源，持久化字符串由 lib/api.ts 负责。 */
import { create } from 'zustand';

import type { AdminProfile, MenuInfo, ShopConfig } from '@dinebox/types';

import { getAdminToken } from '../api';

interface AuthState {
  token: string | null;
  user: AdminProfile | null;
  menus: MenuInfo[];
  shop: ShopConfig | null;
  initialized: boolean;
  hydrate: () => void;
  setSession: (token: string, user: AdminProfile, menus: MenuInfo[], shop: ShopConfig) => void;
  setContext: (user: AdminProfile, menus: MenuInfo[], shop: ShopConfig) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  menus: [],
  shop: null,
  initialized: false,
  hydrate: () => set({ token: getAdminToken(), initialized: true }),
  setSession: (token, user, menus, shop) =>
    set({ token, user, menus, shop, initialized: true }),
  setContext: (user, menus, shop) => set({ user, menus, shop }),
  clearSession: () => set({ token: null, user: null, menus: [], shop: null }),
}));
