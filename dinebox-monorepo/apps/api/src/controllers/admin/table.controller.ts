/** 桌台管理控制器：区域、桌台与实时状态。 */
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { ipOf, operatorOf } from '../helpers.js';
import {
  deleteArea,
  deleteTable,
  listAreas,
  listTables,
  moveArea,
  saveArea,
  saveTable,
} from '../../services/admin/table.service.js';

export async function list(c: AppContext) {
  const [areas, tables] = await Promise.all([listAreas(), listTables()]);
  return success(c, { areas, tables });
}

export async function createArea(c: AppContext, input: { name: string; sort?: number }) {
  const user = operatorOf(c);
  return success(c, await saveArea(input, user, ipOf(c)), '区域已保存', 201);
}

export async function updateArea(
  c: AppContext,
  id: number,
  input: { name: string; sort?: number },
) {
  const user = operatorOf(c);
  return success(c, await saveArea({ ...input, id }, user, ipOf(c)), '区域已保存');
}

export async function removeArea(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deleteArea(id, user, ipOf(c));
  return success(c, null, '区域已删除');
}

export async function moveAreaHandler(c: AppContext, id: number, direction: 'up' | 'down') {
  const user = operatorOf(c);
  await moveArea(id, direction, user, ipOf(c));
  return success(c, null, '排序已更新');
}

export async function createTable(
  c: AppContext,
  input: { name: string; areaId: number; seats?: number | null },
) {
  const user = operatorOf(c);
  return success(c, await saveTable(input, user, ipOf(c)), '桌台已保存', 201);
}

export async function updateTable(
  c: AppContext,
  id: number,
  input: { name: string; areaId: number; seats?: number | null },
) {
  const user = operatorOf(c);
  return success(c, await saveTable({ ...input, id }, user, ipOf(c)), '桌台已保存');
}

export async function removeTable(c: AppContext, id: number) {
  const user = operatorOf(c);
  await deleteTable(id, user, ipOf(c));
  return success(c, null, '桌台已删除');
}
