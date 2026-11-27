/** 桌台域手写 SQL：数量聚合、未结订单推导、收银台统计与排序交换。 */
import type { SqlQuery } from './types.js';

/** 后台区域列表（含桌台数）。 */
export function areaListQuery(): SqlQuery {
  return {
    sql: `SELECT a.id, a.area_name AS name, a.sort,
                 SUM(t.id IS NOT NULL) AS tableCount
            FROM dining_area a
            LEFT JOIN dining_table t ON t.area_id = a.id AND t.is_deleted = 0
           WHERE a.is_deleted = 0
           GROUP BY a.id
           ORDER BY a.sort, a.id`,
    params: [],
  };
}

/** 全部桌台（含区域）。 */
export function tablesWithAreaQuery(): SqlQuery {
  return {
    sql: `SELECT t.id, t.area_id AS areaId, a.area_name AS areaName, t.table_name AS name,
                 t.seats, t.qr_token AS qrToken, t.created_at AS createdAt
            FROM dining_table t
            JOIN dining_area a ON a.id = t.area_id AND a.is_deleted = 0
           WHERE t.is_deleted = 0
           ORDER BY a.sort, a.id, t.table_name`,
    params: [],
  };
}

/** 全部未结订单摘要（用于桌台状态推导）。 */
export function pendingOrdersQuery(): SqlQuery {
  return {
    sql: `SELECT o.id, o.order_no AS orderNo, o.table_id AS tableId,
                 o.total_amount AS totalAmount, o.payable_amount AS payableAmount,
                 o.hung_flag AS hungFlag, o.people_count AS peopleCount,
                 (SELECT COUNT(*) FROM order_item oi
                   WHERE oi.order_id = o.id AND oi.item_status = 'NORMAL') AS itemCount,
                 o.created_at AS createdAt
            FROM orders o
           WHERE o.status = 'PENDING'
           ORDER BY o.created_at ASC, o.id ASC`,
    params: [],
  };
}

/** 按二维码令牌查桌台。 */
export function tableByTokenQuery(token: string): SqlQuery {
  return {
    sql: `SELECT t.id, t.table_name AS name, a.area_name AS areaName, t.seats,
                 t.qr_token AS qrToken, t.session_token AS sessionToken
            FROM dining_table t
            JOIN dining_area a ON a.id = t.area_id AND a.is_deleted = 0
           WHERE t.qr_token = ? AND t.is_deleted = 0
           LIMIT 1`,
    params: [token],
  };
}

/** 收银台今日摘要：订单数、已结清笔数与营收。 */
export function cashierTodayStatsQuery(): SqlQuery {
  return {
    sql: `SELECT
            (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE()) AS todayOrderCount,
            (SELECT COUNT(*) FROM orders
              WHERE status = 'SETTLED' AND DATE(settled_at) = CURDATE()) AS settledCount,
            (SELECT COALESCE(SUM(payable_amount), 0) FROM orders
              WHERE status = 'SETTLED' AND DATE(settled_at) = CURDATE()) AS todayRevenue`,
    params: [],
  };
}

/** 区域排序交换：锁定当前区域。 */
export function lockAreaQuery(id: number): SqlQuery {
  return {
    sql: `SELECT id, sort FROM dining_area WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [id],
  };
}

/** 区域排序交换：查找相邻区域。 */
export function neighborAreaQuery(
  sort: number,
  id: number,
  direction: 'up' | 'down',
): SqlQuery {
  return direction === 'up'
    ? {
        sql: `SELECT id, sort FROM dining_area
               WHERE is_deleted = 0 AND (sort < ? OR (sort = ? AND id < ?))
               ORDER BY sort DESC, id DESC LIMIT 1 FOR UPDATE`,
        params: [sort, sort, id],
      }
    : {
        sql: `SELECT id, sort FROM dining_area
               WHERE is_deleted = 0 AND (sort > ? OR (sort = ? AND id > ?))
               ORDER BY sort ASC, id ASC LIMIT 1 FOR UPDATE`,
        params: [sort, sort, id],
      };
}

export function updateAreaSortQuery(id: number, sort: number): SqlQuery {
  return { sql: `UPDATE dining_area SET sort = ? WHERE id = ?`, params: [sort, id] };
}

/** 下单事务内锁定桌台并读取当前就餐会话。 */
export function lockTableByTokenQuery(token: string): SqlQuery {
  return {
    sql: `SELECT id, table_name AS name, session_token AS sessionToken
            FROM dining_table
           WHERE qr_token = ? AND is_deleted = 0
           LIMIT 1
             FOR UPDATE`,
    params: [token],
  };
}

/** 结账/取消事务内锁定桌台行，保证会话切换与新建订单串行。 */
export function lockTableRowQuery(tableId: number): SqlQuery {
  return {
    sql: `SELECT id, session_token AS sessionToken FROM dining_table WHERE id = ? LIMIT 1 FOR UPDATE`,
    params: [tableId],
  };
}

/** 桌台当前仍有多少待结算订单。 */
export function countPendingTableOrdersQuery(tableId: number): SqlQuery {
  return {
    sql: `SELECT COUNT(*) AS total FROM orders WHERE table_id = ? AND status = 'PENDING'`,
    params: [tableId],
  };
}

export function updateTableSessionQuery(tableId: number, sessionToken: string): SqlQuery {
  return {
    sql: `UPDATE dining_table SET session_token = ? WHERE id = ?`,
    params: [sessionToken, tableId],
  };
}

/** 桌台当前会话下是否已有历史订单（用于空闲桌台首次下单时做会话兜底切换）。 */
export function countSessionOrdersQuery(tableId: number, sessionToken: string): SqlQuery {
  return {
    sql: `SELECT COUNT(*) AS total FROM orders WHERE table_id = ? AND session_token = ?`,
    params: [tableId, sessionToken],
  };
}
