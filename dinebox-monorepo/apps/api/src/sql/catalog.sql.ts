/**
 * 菜品域手写 SQL：聚合、多表联查、批量加载与排序交换。
 * 单条增删改查优先使用 Drizzle（见 catalog.service）；本文件只保留
 * Drizzle 表达成本高或需要 FOR UPDATE 的语句。
 */
import { placeholders } from './shared.js';
import type { SqlQuery } from './types.js';

/** 后台分类列表（含菜品数）。 */
export function categoryListQuery(): SqlQuery {
  return {
    sql: `SELECT c.id, c.cat_name AS name, c.sort,
                 SUM(d.id IS NOT NULL) AS dishCount
            FROM dish_category c
            LEFT JOIN dish d ON d.category_id = c.id AND d.is_deleted = 0
           WHERE c.is_deleted = 0
           GROUP BY c.id
           ORDER BY c.sort, c.id`,
    params: [],
  };
}

/** 顾客端分类（仅启用）。 */
export function publicCategoriesQuery(): SqlQuery {
  return {
    sql: `SELECT id, cat_name AS name, sort
            FROM dish_category
           WHERE is_deleted = 0 AND status = 'ENABLED'
           ORDER BY sort, id`,
    params: [],
  };
}

/** 顾客端在售菜品。 */
export function publicDishesQuery(): SqlQuery {
  return {
    sql: `SELECT d.id, d.category_id AS categoryId, c.cat_name AS categoryName,
                 d.dish_name AS name, d.description, d.image_file_id AS imageFileId,
                 f.file_path AS imageKey, d.price, d.sort, d.status, d.sold_out AS soldOut
            FROM dish d
            JOIN dish_category c ON c.id = d.category_id AND c.is_deleted = 0 AND c.status = 'ENABLED'
            LEFT JOIN sys_file f ON f.id = d.image_file_id
           WHERE d.is_deleted = 0 AND d.status = 'ON'
           ORDER BY d.sort, d.id`,
    params: [],
  };
}

/** 后台菜品列表（含下架/售罄）。 */
export function adminDishesQuery(): SqlQuery {
  return {
    sql: `SELECT d.id, d.category_id AS categoryId, c.cat_name AS categoryName,
                 d.dish_name AS name, d.description, d.image_file_id AS imageFileId,
                 f.file_path AS imageKey, d.price, d.sort, d.status, d.sold_out AS soldOut
            FROM dish d
            JOIN dish_category c ON c.id = d.category_id
            LEFT JOIN sys_file f ON f.id = d.image_file_id
           WHERE d.is_deleted = 0 AND c.is_deleted = 0
           ORDER BY d.sort, d.id`,
    params: [],
  };
}

/** 加料列表（含绑定菜品数）。 */
export function addonsWithBindingsQuery(): SqlQuery {
  return {
    sql: `SELECT a.id, a.addon_name AS name, a.price, a.max_select AS maxSelect,
                 SUM(d.id IS NOT NULL) AS boundDishCount
            FROM addon a
            LEFT JOIN dish_addon da ON da.addon_id = a.id
            LEFT JOIN dish d ON d.id = da.dish_id AND d.is_deleted = 0
           WHERE a.is_deleted = 0
           GROUP BY a.id
           ORDER BY a.id`,
    params: [],
  };
}

/** 批量加载菜品规格组与选项。 */
export function specRowsQuery(dishIds: number[]): SqlQuery {
  return {
    sql: `SELECT g.id AS groupId, g.dish_id AS dishId, g.group_name AS groupName, g.sort AS groupSort,
                 o.id AS optionId, o.option_name AS optionName, o.price_diff AS priceDiff, o.sort AS optionSort
            FROM dish_spec_group g
            LEFT JOIN dish_spec_option o ON o.group_id = g.id
           WHERE g.dish_id IN (${placeholders(dishIds.length)})
           ORDER BY g.sort, g.id, o.sort, o.id`,
    params: dishIds,
  };
}

/** 批量加载菜品可加料。 */
export function dishAddonRowsQuery(dishIds: number[]): SqlQuery {
  return {
    sql: `SELECT da.dish_id AS dishId, a.id, a.addon_name AS name, a.price,
                 a.max_select AS maxSelect, da.sort
            FROM dish_addon da
            JOIN addon a ON a.id = da.addon_id AND a.is_deleted = 0
           WHERE da.dish_id IN (${placeholders(dishIds.length)})
           ORDER BY da.sort, a.id`,
    params: dishIds,
  };
}

/** 分类排序交换：锁定当前分类。 */
export function lockCategoryQuery(id: number): SqlQuery {
  return {
    sql: `SELECT id, sort FROM dish_category WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [id],
  };
}

/** 分类排序交换：查找相邻分类。 */
export function neighborCategoryQuery(
  sort: number,
  id: number,
  direction: 'up' | 'down',
): SqlQuery {
  return direction === 'up'
    ? {
        sql: `SELECT id, sort FROM dish_category
               WHERE is_deleted = 0 AND (sort < ? OR (sort = ? AND id < ?))
               ORDER BY sort DESC, id DESC LIMIT 1 FOR UPDATE`,
        params: [sort, sort, id],
      }
    : {
        sql: `SELECT id, sort FROM dish_category
               WHERE is_deleted = 0 AND (sort > ? OR (sort = ? AND id > ?))
               ORDER BY sort ASC, id ASC LIMIT 1 FOR UPDATE`,
        params: [sort, sort, id],
      };
}

/** 更新分类排序值。 */
export function updateCategorySortQuery(id: number, sort: number): SqlQuery {
  return { sql: `UPDATE dish_category SET sort = ? WHERE id = ?`, params: [sort, id] };
}

/** 新增菜品。 */
export function insertDishQuery(input: {
  categoryId: number;
  name: string;
  description: string;
  imageFileId?: number | null;
  price: number;
  sort: number;
  status: 'ON' | 'OFF';
  soldOut: boolean;
}): SqlQuery {
  return {
    sql: `INSERT INTO dish
            (category_id, dish_name, description, image_file_id, price, sort, status, sold_out)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      input.categoryId,
      input.name,
      input.description,
      input.imageFileId ?? null,
      input.price,
      input.sort,
      input.status,
      input.soldOut ? 1 : 0,
    ],
  };
}

/** 更新菜品。 */
export function updateDishQuery(
  id: number,
  input: {
    categoryId: number;
    name: string;
    description: string;
    imageFileId?: number | null;
    price: number;
    sort: number;
    status: 'ON' | 'OFF';
    soldOut: boolean;
  },
): SqlQuery {
  return {
    sql: `UPDATE dish
             SET category_id = ?, dish_name = ?, description = ?, image_file_id = ?,
                 price = ?, sort = ?, status = ?, sold_out = ?
           WHERE id = ? AND is_deleted = 0`,
    params: [
      input.categoryId,
      input.name,
      input.description,
      input.imageFileId ?? null,
      input.price,
      input.sort,
      input.status,
      input.soldOut ? 1 : 0,
      id,
    ],
  };
}

export function selectDishNameQuery(id: number): SqlQuery {
  return {
    sql: `SELECT dish_name AS name FROM dish WHERE id = ? AND is_deleted = 0`,
    params: [id],
  };
}

export function selectCategoryNameQuery(id: number): SqlQuery {
  return {
    sql: `SELECT cat_name AS name FROM dish_category WHERE id = ? AND is_deleted = 0`,
    params: [id],
  };
}

export function countCategoryDishesQuery(id: number): SqlQuery {
  return {
    sql: `SELECT COUNT(*) AS total FROM dish WHERE category_id = ? AND is_deleted = 0`,
    params: [id],
  };
}

export function softDeleteCategoryQuery(id: number): SqlQuery {
  return { sql: `UPDATE dish_category SET is_deleted = 1 WHERE id = ?`, params: [id] };
}

/** 删除菜品前清理规格选项（跨表 JOIN 删除）。 */
export function deleteSpecOptionsByDishQuery(dishId: number): SqlQuery {
  return {
    sql: `DELETE o FROM dish_spec_option o
            JOIN dish_spec_group g ON g.id = o.group_id
           WHERE g.dish_id = ?`,
    params: [dishId],
  };
}

export function deleteSpecGroupsByDishQuery(dishId: number): SqlQuery {
  return { sql: `DELETE FROM dish_spec_group WHERE dish_id = ?`, params: [dishId] };
}

export function deleteDishAddonsQuery(dishId: number): SqlQuery {
  return { sql: `DELETE FROM dish_addon WHERE dish_id = ?`, params: [dishId] };
}

export function softDeleteDishQuery(id: number): SqlQuery {
  return { sql: `UPDATE dish SET is_deleted = 1 WHERE id = ?`, params: [id] };
}

export function insertSpecGroupQuery(dishId: number, name: string, sort: number): SqlQuery {
  return {
    sql: `INSERT INTO dish_spec_group (dish_id, group_name, sort) VALUES (?, ?, ?)`,
    params: [dishId, name, sort],
  };
}

export function insertSpecOptionQuery(
  groupId: number,
  name: string,
  priceDiff: number,
  sort: number,
): SqlQuery {
  return {
    sql: `INSERT INTO dish_spec_option (group_id, option_name, price_diff, sort) VALUES (?, ?, ?, ?)`,
    params: [groupId, name, priceDiff, sort],
  };
}

/** 校验加料 ID 中哪些仍然有效。 */
export function validAddonIdsQuery(ids: number[]): SqlQuery {
  return {
    sql: `SELECT id FROM addon WHERE is_deleted = 0 AND id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

export function insertDishAddonQuery(dishId: number, addonId: number, sort: number): SqlQuery {
  return {
    sql: `INSERT INTO dish_addon (dish_id, addon_id, sort) VALUES (?, ?, ?)`,
    params: [dishId, addonId, sort],
  };
}
