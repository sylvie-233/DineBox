/**
 * 购物车模型：金额计算、规格文本与 sessionStorage 持久化。
 * 金额单位统一为元，计算使用 round2 避免浮点误差。
 */
import type { Dish, SpecGroup } from '@dinebox/types';
import { round2 } from '@dinebox/utils';

export interface CartAddon {
  addonId: number;
  name: string;
  price: number;
  qty: number;
}

/** 购物车行：保存规格选项 ID 与加料快照，提交时再由后端按最新数据校验计价。 */
export interface CartLine {
  uid: string;
  dishId: number;
  name: string;
  imageUrl: string | null;
  specOptionIds: number[];
  specText: string;
  addons: CartAddon[];
  unitPrice: number;
  qty: number;
}

export function cartLineTotal(line: CartLine): number {
  return round2(line.unitPrice * line.qty);
}

export function cartTotal(lines: CartLine[]): number {
  return round2(lines.reduce((sum, line) => sum + cartLineTotal(line), 0));
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

/** 默认规格：每组第一个选项。 */
export function defaultSpecIds(dish: Dish): number[] {
  return dish.specs.map((group) => group.options[0]?.id).filter((id): id is number => Boolean(id));
}

/** 规格文本：按组顺序取所选选项名，如「小份/微辣」。 */
export function specTextOf(dish: Dish, optionIds: number[]): string {
  const names: string[] = [];
  for (const group of dish.specs) {
    const chosen = group.options.find((option) => optionIds.includes(option.id));
    if (chosen) {
      names.push(chosen.name);
    }
  }
  return names.join('/');
}

/** 规格差价合计。 */
export function specExtraOf(dish: Dish, optionIds: number[]): number {
  let extra = 0;
  for (const group of dish.specs) {
    const chosen = group.options.find((option) => optionIds.includes(option.id));
    if (chosen) {
      extra += chosen.priceDiff;
    }
  }
  return round2(extra);
}

/** 加料合计。 */
export function addonTotalOf(addons: CartAddon[]): number {
  return round2(addons.reduce((sum, addon) => sum + addon.price * addon.qty, 0));
}

/** 单价 = 菜品基础价 + 规格差价 + 加料合计。 */
export function unitPriceOf(dish: Dish, optionIds: number[], addons: CartAddon[]): number {
  return round2(dish.price + specExtraOf(dish, optionIds) + addonTotalOf(addons));
}

/** 加料文本：加蛋×2、加宽粉。 */
export function addonTextOf(addons: CartAddon[]): string {
  return addons
    .filter((addon) => addon.qty > 0)
    .map((addon) => `${addon.name}${addon.qty > 1 ? `×${addon.qty}` : ''}`)
    .join('、');
}

/** 生成购物车行。 */
export function createCartLine(
  dish: Dish,
  optionIds: number[],
  addons: CartAddon[],
  qty: number,
  uid?: string,
): CartLine {
  const cleanAddons = addons.filter((addon) => addon.qty > 0);
  return {
    uid: uid ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dishId: dish.id,
    name: dish.name,
    imageUrl: dish.imageUrl,
    specOptionIds: optionIds,
    specText: specTextOf(dish, optionIds),
    addons: cleanAddons,
    unitPrice: unitPriceOf(dish, optionIds, cleanAddons),
    qty,
  };
}

/** 合并同一菜品 + 同规格 + 同加料的行。 */
export function addLineToCart(lines: CartLine[], line: CartLine): CartLine[] {
  const signature = (item: CartLine): string =>
    [
      item.dishId,
      [...item.specOptionIds].sort().join(','),
      item.addons
        .map((addon) => `${addon.addonId}:${addon.qty}`)
        .sort()
        .join(','),
    ].join('|');
  const target = signature(line);
  const existing = lines.find((item) => signature(item) === target);
  if (existing) {
    return lines.map((item) =>
      item.uid === existing.uid ? { ...item, qty: item.qty + line.qty } : item,
    );
  }
  return [...lines, line];
}

/** 购物车持久化键：按桌台隔离，避免换桌后串单。 */
function storageKey(tableToken: string): string {
  return `dinebox_cart_${tableToken}`;
}

/** 读取购物车；损坏数据按空购物车处理。 */
export function loadCart(tableToken: string): CartLine[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey(tableToken));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (line) =>
        line &&
        typeof line.dishId === 'number' &&
        typeof line.name === 'string' &&
        typeof line.unitPrice === 'number' &&
        typeof line.qty === 'number' &&
        Array.isArray(line.specOptionIds) &&
        Array.isArray(line.addons),
    );
  } catch {
    return [];
  }
}

/** 保存购物车。 */
export function saveCart(tableToken: string, lines: CartLine[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(storageKey(tableToken), JSON.stringify(lines));
  } catch {
    // 存储配额不足时静默忽略。
  }
}

/** 备注快捷标签。 */
export const QUICK_NOTES = ['少辣', '不要辣', '不要葱', '不要香菜', '多放醋', '儿童餐具', '打包带走'];

/** 判断某规格组是否已被选中（用于校验）。 */
export function groupSelected(group: SpecGroup, optionIds: number[]): boolean {
  return group.options.some((option) => optionIds.includes(option.id));
}
