/**
 * 金额与抹零纯函数：全系统金额单位统一为「元」，保留 2 位小数。
 * 数据库使用 DECIMAL(10,2)，前端仅在展示层格式化，不参与金额计算。
 */

/** 四舍五入到 2 位小数，消除浮点误差（如 0.1 + 0.2）。 */
export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** 固定两位小数字符串：`12` → `12.00`。 */
export function moneyFixed(value: number): string {
  return round2(value).toFixed(2);
}

/** 展示金额：整数省略小数、非整数保留两位（去尾零）：`12.00` → `12`，`12.50` → `12.5`。 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0';
  }
  const fixed = round2(Number(value)).toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** 带人民币符号：`¥12.5`。 */
export function formatYuan(value: number | null | undefined): string {
  return `¥${formatMoney(value)}`;
}

/** 抹零规则：ANGLE 抹到元、ANGLE5 抹到 5 角、NONE 不抹。 */
export type RoundOffRule = 'ANGLE' | 'ANGLE5' | 'NONE';

/**
 * 计算抹零金额（不为负）：合计 47.80 在 ANGLE 下抹 0.80，实收 47。
 * 抹零按角 / 元向下取整，确保顾客永远不会被多收。
 */
export function calcRoundOff(total: number, rule: RoundOffRule): number {
  const amount = round2(Math.max(0, Number(total)));
  if (rule === 'NONE') {
    return 0;
  }
  const step = rule === 'ANGLE5' ? 0.5 : 1;
  const payable = round2(Math.floor(round2(amount / step)) * step);
  return round2(amount - payable);
}

/** 应用抹零后的应收金额。 */
export function applyRoundOff(total: number, rule: RoundOffRule): number {
  return round2(Math.max(0, Number(total)) - calcRoundOff(total, rule));
}

/** 百分比：`0.1234` → `12.3%`。 */
export function formatPercent(value: number, digits = 1): string {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}
