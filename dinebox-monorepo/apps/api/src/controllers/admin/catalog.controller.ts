/** 菜品管理控制器：分类、菜品、规格与加料。 */
import type { DishSaveInput } from '@dinebox/types';

import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import {
  deleteAddon,
  deleteCategory,
  deleteDish,
  getAdminCatalog,
  moveCategory,
  saveAddon,
  saveCategory,
  saveDish,
  toggleDish,
} from '../../services/admin/catalog.service.js';

export async function catalog(c: AppContext) {
  return success(c, await getAdminCatalog());
}

export async function createCategory(
  c: AppContext,
  input: { name: string; sort?: number },
) {
  const user = operatorOf(c);
  return success(c, await saveCategory(input, user, ipOf(c)), '分类已保存', 201);
}

export async function updateCategory(
  c: AppContext,
  id: number,
  input: { name: string; sort?: number },
) {
  const user = operatorOf(c);
  return success(c, await saveCategory({ ...input, id }, user, ipOf(c)), '分类已保存');
}

export async function removeCategory(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deleteCategory(id, user, ipOf(c));
  return success(c, null, '分类已删除');
}

export async function moveCategoryHandler(
  c: AppContext,
  id: number,
  direction: 'up' | 'down',
) {
  await moveCategory(id, direction);
  return success(c, null, '排序已更新');
}

export async function createDish(c: AppContext, input: DishSaveInput) {
  const user = operatorOf(c);
  return success(c, await saveDish(input, user, ipOf(c)), '菜品已保存', 201);
}

export async function updateDish(c: AppContext, id: number, input: DishSaveInput) {
  const user = operatorOf(c);
  return success(c, await saveDish({ ...input, id }, user, ipOf(c)), '菜品已保存');
}

export async function removeDish(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deleteDish(id, user, ipOf(c));
  return success(c, null, '菜品已删除');
}

export async function toggleDishHandler(
  c: AppContext,
  id: number,
  input: { soldOut?: boolean; status?: 'ON' | 'OFF' },
) {
  const user = operatorOf(c);
  await toggleDish(id, input, user, ipOf(c));
  return success(c, null, '状态已更新');
}

export async function createAddon(
  c: AppContext,
  input: { name: string; price: number; maxSelect: number },
) {
  const user = operatorOf(c);
  return success(c, await saveAddon(input, user, ipOf(c)), '加料已保存', 201);
}

export async function updateAddon(
  c: AppContext,
  id: number,
  input: { name: string; price: number; maxSelect: number },
) {
  const user = operatorOf(c);
  return success(c, await saveAddon({ ...input, id }, user, ipOf(c)), '加料已保存');
}

export async function removeAddon(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deleteAddon(id, user, ipOf(c));
  return success(c, null, '加料已删除');
}
