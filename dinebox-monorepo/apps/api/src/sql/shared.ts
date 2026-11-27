/** 参数化 SQL 的小工具：分页计算与 LIKE 转义。 */
import type { PageResult } from '@dinebox/types';

/** 计算分页元信息。 */
export function pageMeta(
  total: number,
  page: number,
  pageSize: number,
): Pick<PageResult<unknown>, 'total' | 'page' | 'pageSize' | 'totalPages'> {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 分页偏移量。 */
export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/** 生成 LIKE 参数并转义通配符，避免用户输入 `%` 扫描全表。 */
export function likeParam(keyword: string): string {
  return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** `IN (?, ?, ?)` 占位符串；空数组调用方需自行短路。 */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** 金额字符串转数字（DECIMAL 列在 mysql2 下可能以字符串返回）。 */
export function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
