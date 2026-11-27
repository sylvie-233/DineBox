/**
 * 日期区间纯函数：全系统统一「自然日」口径，后端按北京时间字符串处理。
 * 日期参数格式 `YYYY-MM-DD`，SQL 参数使用 `YYYY-MM-DD HH:mm:ss`。
 */

/** 补零。 */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 本地日期 → `YYYY-MM-DD`。 */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 当前日期 `YYYY-MM-DD`。 */
export function todayString(now = new Date()): string {
  return toDateString(now);
}

/** 日期加减天数。 */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** 某天的起始时间字符串（含）。 */
export function startOfDayString(date: string): string {
  return `${date} 00:00:00`;
}

/** 某天的结束时间字符串（含）。 */
export function endOfDayString(date: string): string {
  return `${date} 23:59:59`;
}

/** 日期区间（含首尾），用于 SQL BETWEEN。 */
export interface ResolvedDateRange {
  from: string;
  to: string;
}

/**
 * 解析列表筛选口径：
 * - `today`：今日；
 * - `7d`：近 7 日（含今天）；
 * - `custom`：使用传入的 from/to，反序自动交换；
 * - `all` 或缺省：返回 null（不加时间条件）。
 */
export function resolveDateRange(
  range: 'all' | 'today' | '7d' | 'custom' | undefined,
  from?: string,
  to?: string,
  now = new Date(),
): ResolvedDateRange | null {
  if (!range || range === 'all') {
    return null;
  }
  if (range === 'today') {
    const today = todayString(now);
    return { from: startOfDayString(today), to: endOfDayString(today) };
  }
  if (range === '7d') {
    const end = todayString(now);
    const start = toDateString(addDays(now, -6));
    return { from: startOfDayString(start), to: endOfDayString(end) };
  }
  if (!from && !to) {
    return null;
  }
  let start = from || to;
  let end = to || from;
  if (!start || !end) {
    return null;
  }
  if (start > end) {
    [start, end] = [end, start];
  }
  return { from: startOfDayString(start), to: endOfDayString(end) };
}

/** 近 N 天日期序列（含今天），按时间正序。 */
export function lastNDates(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, index) => {
    return toDateString(addDays(now, index - (days - 1)));
  });
}

/** 星期短名，用于报表横轴。 */
export function weekdayLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()] ?? '';
}

/** `2026-11-27 14:30:00` → `11-27 14:30`。 */
export function shortDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return value.slice(5, 16);
}

/** 当前时间 `YYYY-MM-DD HH:mm:ss`（本地时区）。 */
export function nowString(now = new Date()): string {
  return `${toDateString(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds(),
  )}`;
}
