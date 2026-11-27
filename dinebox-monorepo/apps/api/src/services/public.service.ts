/** 顾客端公开数据：门店信息、桌台与菜单启动包。 */
import type { PublicBootstrap, PublicTableInfo } from '@dinebox/types';

import { getShopConfig } from './config.service.js';
import { getPublicMenu } from './admin/catalog.service.js';
import { getTableByToken } from './admin/table.service.js';

/** 扫码进入 H5 的启动数据：门店 + 桌台 + 分类菜品。 */
export async function getBootstrap(tableToken: string): Promise<PublicBootstrap> {
  const [shop, table, categories] = await Promise.all([
    getShopConfig(),
    getTableByToken(tableToken),
    getPublicMenu(),
  ]);
  return { shop, table, categories };
}

/** 仅校验桌台令牌（用于刷新页面时恢复桌号）。 */
export function getTable(tableToken: string): Promise<PublicTableInfo> {
  return getTableByToken(tableToken);
}
