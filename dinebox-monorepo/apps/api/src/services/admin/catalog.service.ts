/**
 * 菜品域服务：分类、菜品、规格组/选项、加料。
 * 顾客端菜单缓存 30 秒，后台任何改动即时失效。
 *
 * 约定：单条增删改查使用 Drizzle；多表联查、批量加载与需 FOR UPDATE 的
 * 排序交换 / 菜品事务使用 `src/sql/catalog.sql.ts` 中的参数化 SQL。
 */
import { and, eq, max } from 'drizzle-orm';

import type {
  Addon,
  AdminCatalog,
  Category,
  CategoryWithDishes,
  Dish,
  DishSaveInput,
  SpecGroup,
} from '@dinebox/types';

import { cache } from '../../cache/index.js';
import { CACHE_KEYS, invalidateMenuCache } from '../../cache/keys.js';
import { dbClient, schema } from '../../db/index.js';
import {
  executeOn,
  queryOn,
  queryOneOn,
  type TransactionConnection,
} from '../../db/index.js';
import {
  addonsWithBindingsQuery,
  adminDishesQuery,
  categoryListQuery,
  countCategoryDishesQuery,
  deleteDishAddonsQuery,
  deleteSpecGroupsByDishQuery,
  deleteSpecOptionsByDishQuery,
  dishAddonRowsQuery,
  insertDishAddonQuery,
  insertDishQuery,
  insertSpecGroupQuery,
  insertSpecOptionQuery,
  lockCategoryQuery,
  neighborCategoryQuery,
  publicCategoriesQuery,
  publicDishesQuery,
  selectCategoryNameQuery,
  selectDishNameQuery,
  softDeleteCategoryQuery,
  softDeleteDishQuery,
  specRowsQuery,
  updateCategorySortQuery,
  updateDishQuery,
  validAddonIdsQuery,
} from '../../sql/catalog.sql.js';
import { HttpError } from '../../utils/http.js';
import { storage } from '../storage.service.js';
import { writeOperationLog } from '../audit.service.js';

interface CategoryRow {
  id: number;
  name: string;
  sort: number;
  dishCount?: number;
}

interface DishRow {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string;
  imageFileId: number | null;
  imageKey: string | null;
  price: number;
  sort: number;
  status: 'ON' | 'OFF';
  soldOut: number;
}

interface SpecRow {
  groupId: number;
  dishId: number;
  groupName: string;
  groupSort: number;
  optionId: number | null;
  optionName: string | null;
  priceDiff: number | null;
  optionSort: number | null;
}

interface AddonRow {
  id: number;
  name: string;
  price: number;
  maxSelect: number;
  boundDishCount?: number;
}

interface DishAddonRow {
  dishId: number;
  id: number;
  name: string;
  price: number;
  maxSelect: number;
  sort: number;
}

/** 图片访问 URL：未上传图片返回 null，前端用占位图。 */
function imageUrl(key: string | null): string | null {
  return key ? storage.resolveUrl(key) : null;
}

/** 按菜品 ID 批量加载规格组。 */
async function loadSpecs(dishIds: number[]): Promise<Map<number, SpecGroup[]>> {
  const result = new Map<number, SpecGroup[]>();
  if (dishIds.length === 0) {
    return result;
  }
  const query = specRowsQuery(dishIds);
  const rows = await dbClient.query<SpecRow>(query.sql, query.params);

  const groupMap = new Map<number, SpecGroup>();
  for (const row of rows) {
    let group = groupMap.get(row.groupId);
    if (!group) {
      group = { id: row.groupId, name: row.groupName, sort: row.groupSort, options: [] };
      groupMap.set(row.groupId, group);
      const list = result.get(row.dishId) ?? [];
      list.push(group);
      result.set(row.dishId, list);
    }
    if (row.optionId !== null && row.optionName !== null) {
      group.options.push({
        id: row.optionId,
        name: row.optionName,
        priceDiff: Number(row.priceDiff ?? 0),
        sort: Number(row.optionSort ?? 0),
      });
    }
  }
  return result;
}

/** 按菜品 ID 批量加载可加料。 */
async function loadDishAddons(dishIds: number[]): Promise<Map<number, Addon[]>> {
  const result = new Map<number, Addon[]>();
  if (dishIds.length === 0) {
    return result;
  }
  const query = dishAddonRowsQuery(dishIds);
  const rows = await dbClient.query<DishAddonRow>(query.sql, query.params);
  for (const row of rows) {
    const list = result.get(row.dishId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      price: Number(row.price),
      maxSelect: Number(row.maxSelect),
    });
    result.set(row.dishId, list);
  }
  return result;
}

/** 批量把菜品行组装为 DTO。 */
async function assembleDishes(rows: DishRow[]): Promise<Dish[]> {
  const ids = rows.map((row) => row.id);
  const [specs, addons] = await Promise.all([loadSpecs(ids), loadDishAddons(ids)]);
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    name: row.name,
    description: row.description,
    imageFileId: row.imageFileId,
    imageUrl: imageUrl(row.imageKey),
    price: Number(row.price),
    sort: row.sort,
    status: row.status,
    soldOut: row.soldOut === 1,
    specs: specs.get(row.id) ?? [],
    addons: addons.get(row.id) ?? [],
  }));
}

/** 读取分类列表。 */
export async function listCategories(): Promise<Category[]> {
  const query = categoryListQuery();
  const rows = await dbClient.query<CategoryRow>(query.sql, query.params);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sort: row.sort,
    dishCount: Number(row.dishCount ?? 0),
  }));
}

/** 顾客端菜单：仅上架菜品与启用分类，含规格与加料（缓存 30 秒）。 */
export async function getPublicMenu(): Promise<CategoryWithDishes[]> {
  return cache.remember(CACHE_KEYS.publicMenu, 30, async () => {
    const categoryQuery = publicCategoriesQuery();
    const dishQuery = publicDishesQuery();
    const [categories, rows] = await Promise.all([
      dbClient.query<CategoryRow>(categoryQuery.sql, categoryQuery.params),
      dbClient.query<DishRow>(dishQuery.sql, dishQuery.params),
    ]);
    const dishes = await assembleDishes(rows);
    const grouped = new Map<number, Dish[]>();
    for (const dish of dishes) {
      const list = grouped.get(dish.categoryId) ?? [];
      list.push(dish);
      grouped.set(dish.categoryId, list);
    }
    return categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        sort: category.sort,
        dishes: grouped.get(category.id) ?? [],
      }))
      .filter((category) => category.dishes.length > 0);
  });
}

/** 后台菜品页聚合：全部分类、菜品（含下架/售罄）、加料。 */
export async function getAdminCatalog(): Promise<AdminCatalog> {
  const dishQuery = adminDishesQuery();
  const addonQuery = addonsWithBindingsQuery();
  const [categories, dishRows, addons] = await Promise.all([
    listCategories(),
    dbClient.query<DishRow>(dishQuery.sql, dishQuery.params),
    dbClient.query<AddonRow>(addonQuery.sql, addonQuery.params),
  ]);

  return {
    categories,
    dishes: await assembleDishes(dishRows),
    addons: addons.map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price),
      maxSelect: Number(row.maxSelect),
      boundDishCount: Number(row.boundDishCount ?? 0),
    })),
  };
}

/** 校验分类存在。 */
async function assertCategory(categoryId: number): Promise<void> {
  const [row] = await dbClient.db
    .select({ id: schema.dishCategory.id })
    .from(schema.dishCategory)
    .where(and(eq(schema.dishCategory.id, categoryId), eq(schema.dishCategory.isDeleted, 0)))
    .limit(1);
  if (!row) {
    throw new HttpError(400, '所属分类不存在或已删除');
  }
}

/* ========================= 分类 ========================= */

export async function saveCategory(
  input: { id?: number; name: string; sort?: number },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ id: number }> {
  let id = input.id;
  if (id) {
    const [result] = await dbClient.db
      .update(schema.dishCategory)
      .set({
        catName: input.name,
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
      })
      .where(and(eq(schema.dishCategory.id, id), eq(schema.dishCategory.isDeleted, 0)));
    if (result.affectedRows === 0) {
      throw new HttpError(404, '分类不存在');
    }
  } else {
    let sort = input.sort;
    if (sort === undefined) {
      const [row] = await dbClient.db
        .select({ maxSort: max(schema.dishCategory.sort) })
        .from(schema.dishCategory)
        .where(eq(schema.dishCategory.isDeleted, 0));
      sort = Number(row?.maxSort ?? 0) + 1;
    }
    const [result] = await dbClient.db
      .insert(schema.dishCategory)
      .values({ catName: input.name, sort });
    id = result.insertId;
  }
  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'CATEGORY_SAVE',
    target: input.name,
    detail: input.id ? '编辑分类' : '新增分类',
    ip,
  });
  return { id };
}

export async function deleteCategory(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const query = selectCategoryNameQuery(id);
  const category = await dbClient.queryOne<{ name: string }>(query.sql, query.params);
  if (!category) {
    throw new HttpError(404, '分类不存在');
  }
  const countQuery = countCategoryDishesQuery(id);
  const dishCount = await dbClient.queryOne<{ total: number }>(
    countQuery.sql,
    countQuery.params,
  );
  if (Number(dishCount?.total ?? 0) > 0) {
    throw new HttpError(409, '该分类下还有菜品，请先移动或删除菜品');
  }
  const deleteQuery = softDeleteCategoryQuery(id);
  await dbClient.execute(deleteQuery.sql, deleteQuery.params);
  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'CATEGORY_DELETE',
    target: category.name,
    detail: '删除分类',
    ip,
  });
}

export async function moveCategory(id: number, direction: 'up' | 'down'): Promise<void> {
  await dbClient.transaction(async (conn) => {
    const lock = lockCategoryQuery(id);
    const current = await queryOneOn<{ id: number; sort: number }>(
      conn,
      lock.sql,
      lock.params,
    );
    if (!current) {
      throw new HttpError(404, '分类不存在');
    }
    const neighborQuery = neighborCategoryQuery(current.sort, id, direction);
    const neighbor = await queryOneOn<{ id: number; sort: number }>(
      conn,
      neighborQuery.sql,
      neighborQuery.params,
    );
    if (!neighbor) {
      return;
    }
    const first = updateCategorySortQuery(current.id, neighbor.sort);
    const second = updateCategorySortQuery(neighbor.id, current.sort);
    await executeOn(conn, first.sql, first.params);
    await executeOn(conn, second.sql, second.params);
  });
  await invalidateMenuCache();
}

/* ========================= 菜品 ========================= */

async function insertSpecs(
  conn: TransactionConnection,
  dishId: number,
  specs: DishSaveInput['specs'],
): Promise<void> {
  for (let groupIndex = 0; groupIndex < specs.length; groupIndex += 1) {
    const group = specs[groupIndex]!;
    const groupQuery = insertSpecGroupQuery(dishId, group.name, groupIndex + 1);
    const groupResult = await executeOn(conn, groupQuery.sql, groupQuery.params);
    for (let optionIndex = 0; optionIndex < group.options.length; optionIndex += 1) {
      const option = group.options[optionIndex]!;
      const optionQuery = insertSpecOptionQuery(
        groupResult.insertId,
        option.name,
        option.priceDiff,
        optionIndex + 1,
      );
      await executeOn(conn, optionQuery.sql, optionQuery.params);
    }
  }
}

async function replaceSpecs(
  conn: TransactionConnection,
  dishId: number,
  specs: DishSaveInput['specs'],
): Promise<void> {
  const deleteOptions = deleteSpecOptionsByDishQuery(dishId);
  const deleteGroups = deleteSpecGroupsByDishQuery(dishId);
  await executeOn(conn, deleteOptions.sql, deleteOptions.params);
  await executeOn(conn, deleteGroups.sql, deleteGroups.params);
  await insertSpecs(conn, dishId, specs);
}

async function replaceAddons(
  conn: TransactionConnection,
  dishId: number,
  addonIds: number[],
): Promise<void> {
  const deleteQuery = deleteDishAddonsQuery(dishId);
  await executeOn(conn, deleteQuery.sql, deleteQuery.params);
  const unique = [...new Set(addonIds)];
  if (unique.length === 0) {
    return;
  }
  const validQuery = validAddonIdsQuery(unique);
  const valid = await queryOn<{ id: number }>(conn, validQuery.sql, validQuery.params);
  const validIds = new Set(valid.map((row) => row.id));
  let sort = 0;
  for (const addonId of unique) {
    if (!validIds.has(addonId)) {
      continue;
    }
    sort += 1;
    const insertQuery = insertDishAddonQuery(dishId, addonId, sort);
    await executeOn(conn, insertQuery.sql, insertQuery.params);
  }
}

export async function saveDish(
  input: DishSaveInput & { id?: number },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ id: number }> {
  if (!input.specs) {
    input.specs = [];
  }
  if (!input.addonIds) {
    input.addonIds = [];
  }
  await assertCategory(input.categoryId);

  for (const group of input.specs) {
    for (const option of group.options) {
      if (Number(input.price) + Number(option.priceDiff) < 0) {
        throw new HttpError(400, `规格「${option.name}」的到手价为负数，请检查差价`);
      }
    }
  }

  const id = await dbClient.transaction(async (conn) => {
    let dishId = input.id ?? 0;
    if (dishId) {
      const query = updateDishQuery(dishId, {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? '',
        imageFileId: input.imageFileId,
        price: input.price,
        sort: input.sort ?? 0,
        status: input.status ?? 'ON',
        soldOut: Boolean(input.soldOut),
      });
      const result = await executeOn(conn, query.sql, query.params);
      if (result.affectedRows === 0) {
        throw new HttpError(404, '菜品不存在');
      }
    } else {
      const query = insertDishQuery({
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? '',
        imageFileId: input.imageFileId,
        price: input.price,
        sort: input.sort ?? 0,
        status: input.status ?? 'ON',
        soldOut: Boolean(input.soldOut),
      });
      const result = await executeOn(conn, query.sql, query.params);
      dishId = result.insertId;
    }

    await replaceSpecs(conn, dishId, input.specs);
    await replaceAddons(conn, dishId, input.addonIds);
    return dishId;
  });

  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'DISH_SAVE',
    target: input.name,
    detail: input.id ? '编辑菜品' : '新增菜品',
    ip,
  });
  return { id };
}

export async function deleteDish(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const nameQuery = selectDishNameQuery(id);
  const dish = await dbClient.queryOne<{ name: string }>(nameQuery.sql, nameQuery.params);
  if (!dish) {
    throw new HttpError(404, '菜品不存在');
  }
  await dbClient.transaction(async (conn) => {
    for (const query of [
      deleteSpecOptionsByDishQuery(id),
      deleteSpecGroupsByDishQuery(id),
      deleteDishAddonsQuery(id),
      softDeleteDishQuery(id),
    ]) {
      await executeOn(conn, query.sql, query.params);
    }
  });
  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'DISH_DELETE',
    target: dish.name,
    detail: '删除菜品',
    ip,
  });
}

export async function toggleDish(
  id: number,
  input: { soldOut?: boolean; status?: 'ON' | 'OFF' },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const changes: { soldOut?: number; status?: 'ON' | 'OFF' } = {};
  if (input.soldOut !== undefined) {
    changes.soldOut = input.soldOut ? 1 : 0;
  }
  if (input.status !== undefined) {
    changes.status = input.status;
  }
  if (Object.keys(changes).length === 0) {
    throw new HttpError(400, '没有需要更新的状态');
  }
  const [result] = await dbClient.db
    .update(schema.dish)
    .set(changes)
    .where(and(eq(schema.dish.id, id), eq(schema.dish.isDeleted, 0)));
  if (result.affectedRows === 0) {
    throw new HttpError(404, '菜品不存在');
  }
  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'DISH_SAVE',
    target: `dish#${id}`,
    detail:
      input.soldOut !== undefined
        ? input.soldOut
          ? '标记售罄'
          : '取消售罄'
        : input.status === 'ON'
          ? '上架菜品'
          : '下架菜品',
    ip,
  });
}

/* ========================= 加料 ========================= */

export async function saveAddon(
  input: { id?: number; name: string; price: number; maxSelect: number },
  operator: { id: number; username: string },
  ip: string | null,
): Promise<{ id: number }> {
  let id = input.id;
  if (id) {
    const [result] = await dbClient.db
      .update(schema.addon)
      .set({ addonName: input.name, price: String(input.price), maxSelect: input.maxSelect })
      .where(and(eq(schema.addon.id, id), eq(schema.addon.isDeleted, 0)));
    if (result.affectedRows === 0) {
      throw new HttpError(404, '加料不存在');
    }
  } else {
    const [result] = await dbClient.db.insert(schema.addon).values({
      addonName: input.name,
      price: String(input.price),
      maxSelect: input.maxSelect,
    });
    id = result.insertId;
  }
  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'ADDON_SAVE',
    target: input.name,
    detail: input.id ? '编辑加料' : '新增加料',
    ip,
  });
  return { id };
}

export async function deleteAddon(
  id: number,
  operator: { id: number; username: string },
  ip: string | null,
): Promise<void> {
  const [row] = await dbClient.db
    .select({ name: schema.addon.addonName })
    .from(schema.addon)
    .where(and(eq(schema.addon.id, id), eq(schema.addon.isDeleted, 0)))
    .limit(1);
  if (!row) {
    throw new HttpError(404, '加料不存在');
  }
  await dbClient.db.transaction(async (tx) => {
    await tx.delete(schema.dishAddon).where(eq(schema.dishAddon.addonId, id));
    await tx.update(schema.addon).set({ isDeleted: 1 }).where(eq(schema.addon.id, id));
  });
  await invalidateMenuCache();
  await writeOperationLog({
    userId: operator.id,
    username: operator.username,
    action: 'ADDON_DELETE',
    target: row.name,
    detail: '删除加料并解除菜品绑定',
    ip,
  });
}
