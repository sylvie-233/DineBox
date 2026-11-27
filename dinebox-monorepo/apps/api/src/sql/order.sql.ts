/**
 * 订单域手写 SQL：订单头/明细/加料的批量加载，事务内锁定与状态流转，
 * 列表筛选、汇总、顾客端订单与菜品计价快照查询。
 * 单条日志类的简单写入在服务层使用 Drizzle。
 */
import type { OrderListQuery } from '@dinebox/types';
import { resolveDateRange } from '@dinebox/utils';

import { likeParam, placeholders } from './shared.js';
import type { SqlQuery } from './types.js';

/** 订单头 + 桌台/区域联查的公共 SELECT。 */
export const ORDER_HEADER_SELECT = `SELECT o.id, o.order_no AS orderNo, o.table_id AS tableId,
        t.table_name AS tableName, a.area_name AS areaName,
        o.people_count AS peopleCount, o.status, o.hung_flag AS hungFlag,
        o.total_amount AS totalAmount, o.round_off_amount AS roundOffAmount,
        o.payable_amount AS payableAmount, o.remark, o.pay_method AS payMethod,
        o.settled_by AS settledBy, o.settled_at AS settledAt, o.cancelled_at AS cancelledAt,
        o.created_at AS createdAt
   FROM orders o
   JOIN dining_table t ON t.id = o.table_id
   JOIN dining_area a ON a.id = t.area_id`;

export function orderHeadersByIdsQuery(ids: number[]): SqlQuery {
  return {
    sql: `${ORDER_HEADER_SELECT} WHERE o.id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

export function orderItemsByOrderIdsQuery(orderIds: number[]): SqlQuery {
  return {
    sql: `SELECT id, order_id AS orderId, dish_id AS dishId, dish_name AS dishName,
                 spec_text AS specText, spec_extra_price AS specExtraPrice,
                 unit_price AS unitPrice, qty, item_amount AS itemAmount,
                 item_status AS status, return_reason AS returnReason, returned_at AS returnedAt
            FROM order_item
           WHERE order_id IN (${placeholders(orderIds.length)})
           ORDER BY id`,
    params: orderIds,
  };
}

export function orderAddonsByItemIdsQuery(itemIds: number[]): SqlQuery {
  return {
    sql: `SELECT id, item_id AS itemId, addon_id AS addonId, addon_name AS name,
                 addon_price AS price, qty
            FROM order_item_addon
           WHERE item_id IN (${placeholders(itemIds.length)})
           ORDER BY id`,
    params: itemIds,
  };
}

export function lockOrderQuery(id: number): SqlQuery {
  return {
    sql: `SELECT id, order_no AS orderNo, status, hung_flag AS hungFlag,
                 total_amount AS totalAmount, remark, table_id AS tableId
            FROM orders WHERE id = ? FOR UPDATE`,
    params: [id],
  };
}

export function sumNormalItemsQuery(orderId: number): SqlQuery {
  return {
    sql: `SELECT COALESCE(SUM(item_amount), 0) AS total
            FROM order_item WHERE order_id = ? AND item_status = 'NORMAL'`,
    params: [orderId],
  };
}

export function recalcOrderTotalQuery(orderId: number, total: number): SqlQuery {
  return {
    sql: `UPDATE orders
             SET total_amount = ?, payable_amount = GREATEST(? - round_off_amount, 0)
           WHERE id = ?`,
    params: [total, total, orderId],
  };
}

/* ========================= 计价快照 ========================= */

export function dishPricingQuery(dishIds: number[]): SqlQuery {
  return {
    sql: `SELECT d.id, d.dish_name AS name, d.price, d.status, d.sold_out AS soldOut,
                 c.status AS categoryStatus
            FROM dish d
            JOIN dish_category c ON c.id = d.category_id AND c.is_deleted = 0
           WHERE d.id IN (${placeholders(dishIds.length)}) AND d.is_deleted = 0`,
    params: dishIds,
  };
}

export function specPricingQuery(dishIds: number[]): SqlQuery {
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

export function boundAddonPricingQuery(dishIds: number[]): SqlQuery {
  return {
    sql: `SELECT da.dish_id AS dishId, a.id AS addonId, a.addon_name AS name,
                 a.price, a.max_select AS maxSelect
            FROM dish_addon da
            JOIN addon a ON a.id = da.addon_id AND a.is_deleted = 0
           WHERE da.dish_id IN (${placeholders(dishIds.length)})
           ORDER BY da.sort, a.id`,
    params: dishIds,
  };
}

/* ========================= 下单 / 改单 ========================= */

export function insertOrderQuery(input: {
  temporaryNo: string;
  tableId: number;
  peopleCount: number;
  remark: string;
  sessionToken: string;
}): SqlQuery {
  return {
    sql: `INSERT INTO orders (order_no, table_id, people_count, status, remark, session_token)
          VALUES (?, ?, ?, 'PENDING', ?, ?)`,
    params: [
      input.temporaryNo,
      input.tableId,
      input.peopleCount,
      input.remark,
      input.sessionToken,
    ],
  };
}

export function updateOrderNoQuery(id: number, orderNo: string): SqlQuery {
  return { sql: `UPDATE orders SET order_no = ? WHERE id = ?`, params: [orderNo, id] };
}

export function insertOrderItemQuery(
  orderId: number,
  snapshot: {
    dishId: number;
    dishName: string;
    specText: string;
    specExtraPrice: number;
    unitPrice: number;
    qty: number;
    itemAmount: number;
  },
): SqlQuery {
  return {
    sql: `INSERT INTO order_item
            (order_id, dish_id, dish_name, spec_text, spec_extra_price, unit_price, qty, item_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      orderId,
      snapshot.dishId,
      snapshot.dishName,
      snapshot.specText,
      snapshot.specExtraPrice,
      snapshot.unitPrice,
      snapshot.qty,
      snapshot.itemAmount,
    ],
  };
}

export function insertOrderItemAddonQuery(
  itemId: number,
  addon: { addonId: number; name: string; price: number; qty: number },
): SqlQuery {
  return {
    sql: `INSERT INTO order_item_addon (item_id, addon_id, addon_name, addon_price, qty)
          VALUES (?, ?, ?, ?, ?)`,
    params: [itemId, addon.addonId, addon.name, addon.price, addon.qty],
  };
}

export function orderExistingItemsQuery(orderId: number): SqlQuery {
  return {
    sql: `SELECT id, dish_id AS dishId, dish_name AS dishName, qty,
                 unit_price AS unitPrice, item_status AS status
            FROM order_item WHERE order_id = ? FOR UPDATE`,
    params: [orderId],
  };
}

export function updateItemQtyOnlyQuery(itemId: number, qty: number, amount: number): SqlQuery {
  return {
    sql: `UPDATE order_item SET qty = ?, item_amount = ? WHERE id = ?`,
    params: [qty, amount, itemId],
  };
}

export function updateItemSnapshotQuery(
  itemId: number,
  snapshot: {
    specText: string;
    specExtraPrice: number;
    unitPrice: number;
    qty: number;
    itemAmount: number;
  },
): SqlQuery {
  return {
    sql: `UPDATE order_item
             SET spec_text = ?, spec_extra_price = ?, unit_price = ?, qty = ?, item_amount = ?
           WHERE id = ?`,
    params: [
      snapshot.specText,
      snapshot.specExtraPrice,
      snapshot.unitPrice,
      snapshot.qty,
      snapshot.itemAmount,
      itemId,
    ],
  };
}

export function deleteItemAddonsQuery(itemId: number): SqlQuery {
  return { sql: `DELETE FROM order_item_addon WHERE item_id = ?`, params: [itemId] };
}

export function updateOrderRemarkQuery(id: number, remark: string): SqlQuery {
  return { sql: `UPDATE orders SET remark = ? WHERE id = ?`, params: [remark, id] };
}

export function returnableItemsQuery(orderId: number, itemIds: number[]): SqlQuery {
  return {
    sql: `SELECT id, dish_name AS dishName, item_amount AS itemAmount, item_status AS status
            FROM order_item
           WHERE order_id = ? AND id IN (${placeholders(itemIds.length)})
           FOR UPDATE`,
    params: [orderId, ...itemIds],
  };
}

export function markItemReturnedQuery(
  itemId: number,
  reason: string,
  operatorId: number,
): SqlQuery {
  return {
    sql: `UPDATE order_item
             SET item_status = 'RETURNED', return_reason = ?, returned_at = NOW(), returned_by = ?
           WHERE id = ?`,
    params: [reason, operatorId, itemId],
  };
}

export function setHungQuery(id: number, hung: boolean): SqlQuery {
  return { sql: `UPDATE orders SET hung_flag = ? WHERE id = ?`, params: [hung ? 1 : 0, id] };
}

export function cancelOrderQuery(id: number): SqlQuery {
  return {
    sql: `UPDATE orders SET status = 'CANCELLED', cancelled_at = NOW(), hung_flag = 0 WHERE id = ?`,
    params: [id],
  };
}

export function settleOrderQuery(input: {
  id: number;
  total: number;
  off: number;
  payable: number;
  payMethod: string;
  operatorId: number;
}): SqlQuery {
  return {
    sql: `UPDATE orders
             SET status = 'SETTLED', total_amount = ?, round_off_amount = ?, payable_amount = ?,
                 pay_method = ?, settled_by = ?, settled_at = NOW(), hung_flag = 0
           WHERE id = ?`,
    params: [input.total, input.off, input.payable, input.payMethod, input.operatorId, input.id],
  };
}

/* ========================= 列表 / 顾客端 ========================= */

export function buildOrderWhere(query: OrderListQuery): { where: string; params: unknown[] } {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (query.kw) {
    const like = likeParam(query.kw);
    where.push('(o.order_no LIKE ? OR t.table_name LIKE ?)');
    params.push(like, like);
  }
  const range = resolveDateRange(query.range, query.from, query.to);
  if (range) {
    where.push('o.created_at BETWEEN ? AND ?');
    params.push(range.from, range.to);
  }
  if (query.tableId) {
    where.push('o.table_id = ?');
    params.push(query.tableId);
  }
  if (query.status === 'PENDING') {
    where.push(`o.status = 'PENDING' AND o.hung_flag = 0`);
  } else if (query.status === 'HUNG') {
    where.push(`o.status = 'PENDING' AND o.hung_flag = 1`);
  } else if (query.status) {
    where.push('o.status = ?');
    params.push(query.status);
  }
  return { where: where.join(' AND '), params };
}

export function orderListQuery(
  query: OrderListQuery,
  pageSize: number,
  offset: number,
): SqlQuery {
  const { where, params } = buildOrderWhere(query);
  return {
    sql: `SELECT o.id, o.order_no AS orderNo, o.table_id AS tableId, t.table_name AS tableName,
                 a.area_name AS areaName, o.people_count AS peopleCount, o.status,
                 o.hung_flag AS hungFlag, o.total_amount AS totalAmount,
                 o.round_off_amount AS roundOffAmount, o.payable_amount AS payableAmount,
                 o.pay_method AS payMethod,
                 (SELECT COALESCE(SUM(oi.qty), 0) FROM order_item oi
                   WHERE oi.order_id = o.id AND oi.item_status = 'NORMAL') AS itemCount,
                 o.remark, o.settled_at AS settledAt, o.cancelled_at AS cancelledAt,
                 o.created_at AS createdAt
            FROM orders o
            JOIN dining_table t ON t.id = o.table_id
            JOIN dining_area a ON a.id = t.area_id
           WHERE ${where}
           ORDER BY o.id DESC
           LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  };
}

export function orderSummaryQuery(query: OrderListQuery): SqlQuery {
  const { where, params } = buildOrderWhere(query);
  return {
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(o.total_amount), 0) AS totalAmount,
                 COALESCE(SUM(o.payable_amount), 0) AS payableAmount
            FROM orders o
            JOIN dining_table t ON t.id = o.table_id
           WHERE ${where}`,
    params,
  };
}

export function orderCountQuery(query: OrderListQuery): SqlQuery {
  const { where, params } = buildOrderWhere(query);
  return {
    sql: `SELECT COUNT(*) AS total
            FROM orders o
            JOIN dining_table t ON t.id = o.table_id
           WHERE ${where}`,
    params,
  };
}

export function tableOptionsQuery(): SqlQuery {
  return {
    sql: `SELECT t.id, t.table_name AS name, a.area_name AS areaName
            FROM dining_table t
            JOIN dining_area a ON a.id = t.area_id AND a.is_deleted = 0
           WHERE t.is_deleted = 0
           ORDER BY a.sort, a.id, t.table_name`,
    params: [],
  };
}

export function publicOrderIdsQuery(tableId: number, sessionToken: string): SqlQuery {
  return {
    sql: `SELECT id FROM orders
           WHERE table_id = ? AND session_token = ?
           ORDER BY id DESC
           LIMIT 50`,
    params: [tableId, sessionToken],
  };
}

export function orderByNoAndTableQuery(
  orderNo: string,
  tableId: number,
  sessionToken: string,
): SqlQuery {
  return {
    sql: `SELECT id FROM orders WHERE order_no = ? AND table_id = ? AND session_token = ? LIMIT 1`,
    params: [orderNo, tableId, sessionToken],
  };
}
