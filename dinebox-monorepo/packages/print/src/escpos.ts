/**
 * 小票文本渲染：模板占位符替换、明细等宽排版。
 * ESC/POS 指令与 TCP 发送由 `node-thermal-printer` 负责（见 tcp.ts），
 * 本文件只做业务文本的排版，不拼接任何打印机控制字节。
 */
import type { PrintItem, PrintPayload } from './types.js';

/** 金额展示：保留两位小数。 */
export function money(value: number): string {
  return (Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** 字符显示宽度：CJK / 全角按 2，ASCII 按 1。 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
        ? 2
        : 1;
  }
  return width;
}

/** 按显示宽度截断，超长补省略号。 */
function truncateToWidth(text: string, maxWidth: number): string {
  if (displayWidth(text) <= maxWidth) {
    return text;
  }
  let result = '';
  let width = 0;
  for (const char of text) {
    const charWidth = displayWidth(char);
    if (width + charWidth > maxWidth - 1) {
      break;
    }
    result += char;
    width += charWidth;
  }
  return `${result}…`;
}

/** 右侧补空格到指定显示宽度。 */
function padRight(text: string, width: number): string {
  const padding = width - displayWidth(text);
  return padding > 0 ? `${text}${' '.repeat(padding)}` : text;
}

/** 规格与加料合并为一行说明。 */
function itemMeta(item: PrintItem): string {
  return [item.specText, item.addonText].filter(Boolean).join(' · ');
}

/**
 * 渲染明细为等宽文本行：
 * - 第一行：`菜名 x2` + 右对齐金额；
 * - 第二行（存在规格 / 加料时）：缩进说明。
 */
export function buildItemLines(items: PrintItem[], width = 32): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const amount = money(item.amount);
    const qtySuffix = item.qty > 1 ? ` x${item.qty}` : '';
    const left = truncateToWidth(
      `${item.name}${qtySuffix}`,
      Math.max(8, width - amount.length - 2),
    );
    lines.push(`${padRight(left, width - amount.length)}${amount}`);
    const meta = itemMeta(item);
    if (meta) {
      lines.push(`  ${truncateToWidth(meta, width - 2)}`);
    }
  }
  return lines;
}

/** 分隔线。 */
function hr(width: number): string {
  return '-'.repeat(width);
}

/**
 * 渲染模板：替换 `{title}` / `{table}` / `{order_no}` / `{time}` / `{items}` /
 * `{note}` / `{total}` / `{off}` / `{payable}` / `{people}`。
 * `{items}` 会展开为多行明细；其余未知占位符原样保留，便于模板作者排查。
 */
export function renderTemplate(template: string, payload: PrintPayload): string {
  const width = payload.width ?? 32;
  const replacements: Record<string, string> = {
    '{title}': payload.title || '欢迎光临',
    '{table}': payload.table,
    '{order_no}': payload.orderNo,
    '{time}': payload.time,
    '{note}': payload.note || '无',
    '{total}': money(payload.total),
    '{off}': money(payload.off),
    '{payable}': money(payload.payable),
    '{people}': String(payload.people),
    '{items}': buildItemLines(payload.items, width).join('\n'),
    '{hr}': hr(width),
  };
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  return result.replace(/\r\n/g, '\n');
}

/** 测试页内容。 */
export function renderTestPage(printerName: string, now: string, width = 32): string {
  return [
    '【测试打印】',
    printerName,
    hr(width),
    '打印机连接正常',
    `时间：${now}`,
    hr(width),
  ].join('\n');
}
