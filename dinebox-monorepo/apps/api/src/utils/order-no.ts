/** 订单号生成：`DB` + 日期 + 自增 ID（补 4 位），如 DB202611270001。 */
import { randomBytes } from 'node:crypto';

import { toDateString } from '@dinebox/utils';

/** 插入前使用的临时订单号（唯一，随后在同一事务内更新为正式单号）。 */
export function temporaryOrderNo(): string {
  return `TMP${randomBytes(10).toString('hex')}`;
}

/** 由订单 ID 与创建时间生成展示单号；ID 超过 9999 时自然变长。 */
export function buildOrderNo(id: number, createdAt = new Date()): string {
  return `DB${toDateString(createdAt).replace(/-/g, '')}${String(id).padStart(4, '0')}`;
}
