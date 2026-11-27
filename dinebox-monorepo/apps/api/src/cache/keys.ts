/** 缓存键集中定义：写操作后统一失效，避免散落字符串。 */
import { cache } from './index.js';

export const CACHE_KEYS = {
  config: 'config',
  publicMenu: 'public:menu',
} as const;

/** 菜品 / 分类 / 加料 / 桌台变化后失效顾客端菜单缓存。 */
export async function invalidateMenuCache(): Promise<void> {
  await cache.del(CACHE_KEYS.publicMenu);
}

/** 门店配置变化后同时失效配置与菜单缓存。 */
export async function invalidateConfigCache(): Promise<void> {
  await cache.del(CACHE_KEYS.config, CACHE_KEYS.publicMenu);
}
