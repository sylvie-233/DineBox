/**
 * 门店配置服务：sys_config 为 KV 表，读取时组装为强类型 ShopConfig。
 * 读写都经过缓存失效，保证收银端与顾客端看到同一份门店信息。
 */
import { sql } from 'drizzle-orm';

import type { ShopConfig } from '@dinebox/types';

import { cache } from '../cache/index.js';
import { CACHE_KEYS, invalidateConfigCache } from '../cache/keys.js';
import { dbClient, schema } from '../db/index.js';

const DEFAULTS: Record<string, string> = {
  shop_name: 'DineBox 点餐',
  receipt_title: 'DineBox 点餐 欢迎光临',
  shop_open_time: '10:30',
  shop_close_time: '21:30',
  shop_phone: '',
  round_off_enabled: '1',
  round_off_rule: 'ANGLE',
};

/** 读取原始配置 Map（缓存 15 秒）。 */
export async function getConfigMap(): Promise<Record<string, string>> {
  return cache.remember(CACHE_KEYS.config, 15, async () => {
    const rows = await dbClient.db
      .select({
        configKey: schema.sysConfig.configKey,
        configValue: schema.sysConfig.configValue,
      })
      .from(schema.sysConfig);
    const map: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      map[row.configKey] = row.configValue;
    }
    return map;
  });
}

/** 组装门店配置。 */
export async function getShopConfig(): Promise<ShopConfig> {
  const map = await getConfigMap();
  const rule = map['round_off_rule'];
  return {
    shopName: map['shop_name'] ?? DEFAULTS['shop_name']!,
    receiptTitle: map['receipt_title'] ?? '',
    openTime: map['shop_open_time'] ?? '10:30',
    closeTime: map['shop_close_time'] ?? '21:30',
    phone: map['shop_phone'] ?? '',
    roundOffEnabled: map['round_off_enabled'] === '1',
    roundOffRule: rule === 'ANGLE5' || rule === 'NONE' ? rule : 'ANGLE',
  };
}

/** 批量写入 KV（INSERT ... ON DUPLICATE KEY UPDATE，由 Drizzle 生成）。 */
export async function setConfigs(
  values: Record<string, string>,
  updatedBy: number | null,
): Promise<void> {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return;
  }
  for (const [key, value] of entries) {
    await dbClient.db
      .insert(schema.sysConfig)
      .values({ configKey: key, configValue: value, updatedBy })
      .onDuplicateKeyUpdate({
        set: {
          configValue: sql`VALUES(config_value)`,
          updatedBy: sql`VALUES(updated_by)`,
        },
      });
  }
  await invalidateConfigCache();
}

/** 读取单项配置（不触发额外缓存层）。 */
export async function getConfigValue(key: string): Promise<string | null> {
  const map = await getConfigMap();
  return map[key] ?? null;
}
