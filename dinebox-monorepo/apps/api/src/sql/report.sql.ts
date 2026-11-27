/** 报表域手写 SQL：营收、时段、趋势、排行、支付构成、退菜与滞销。 */
import type { SqlQuery } from './types.js';

export function revenueQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT COALESCE(SUM(payable_amount), 0) AS revenue, COUNT(*) AS orderCount
            FROM orders
           WHERE status = 'SETTLED' AND settled_at BETWEEN ? AND ?`,
    params: [from, to],
  };
}

export function returnAmountQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT COALESCE(SUM(unit_price * qty), 0) AS amount
            FROM order_item
           WHERE item_status = 'RETURNED' AND returned_at BETWEEN ? AND ?`,
    params: [from, to],
  };
}

export function peakHourQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT HOUR(settled_at) AS hour
            FROM orders
           WHERE status = 'SETTLED' AND settled_at BETWEEN ? AND ?
           GROUP BY HOUR(settled_at)
           ORDER BY COUNT(*) DESC, SUM(payable_amount) DESC
           LIMIT 1`,
    params: [from, to],
  };
}

export function hourlyQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT HOUR(settled_at) AS hour, COALESCE(SUM(payable_amount), 0) AS revenue,
                 COUNT(*) AS orderCount
            FROM orders
           WHERE status = 'SETTLED' AND settled_at BETWEEN ? AND ?
           GROUP BY HOUR(settled_at)
           ORDER BY hour`,
    params: [from, to],
  };
}

export function trendQuery(days: number): SqlQuery {
  return {
    sql: `SELECT DATE(settled_at) AS date, COALESCE(SUM(payable_amount), 0) AS revenue,
                 COUNT(*) AS orderCount
            FROM orders
           WHERE status = 'SETTLED'
             AND settled_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(settled_at)
           ORDER BY date`,
    params: [days - 1],
  };
}

export function rankingQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT oi.dish_name AS dishName, oi.spec_text AS specText,
                 SUM(oi.qty) AS qty, COALESCE(SUM(oi.item_amount), 0) AS amount
            FROM order_item oi
            JOIN orders o ON o.id = oi.order_id
           WHERE o.status = 'SETTLED'
             AND oi.item_status = 'NORMAL'
             AND o.settled_at BETWEEN ? AND ?
             AND oi.dish_name NOT IN ('白米饭', '米饭')
           GROUP BY oi.dish_name, oi.spec_text
           ORDER BY qty DESC, amount DESC
           LIMIT 8`,
    params: [from, to],
  };
}

export function paymentsQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT pay_method AS payMethod, COUNT(*) AS count,
                 COALESCE(SUM(payable_amount), 0) AS amount
            FROM orders
           WHERE status = 'SETTLED' AND settled_at BETWEEN ? AND ?
           GROUP BY pay_method
           ORDER BY amount DESC`,
    params: [from, to],
  };
}

export function returnsQuery(from: string, to: string): SqlQuery {
  return {
    sql: `SELECT dish_name AS dishName, return_reason AS reason, qty,
                 item_amount AS itemAmount
            FROM order_item
           WHERE item_status = 'RETURNED' AND returned_at BETWEEN ? AND ?`,
    params: [from, to],
  };
}

export function slowMoversQuery(): SqlQuery {
  return {
    sql: `SELECT d.dish_name AS dishName, c.cat_name AS categoryName,
                 COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.qty ELSE 0 END), 0) AS qty
            FROM dish d
            JOIN dish_category c ON c.id = d.category_id AND c.is_deleted = 0
            LEFT JOIN order_item oi ON oi.dish_id = d.id AND oi.item_status = 'NORMAL'
            LEFT JOIN orders o ON o.id = oi.order_id
                 AND o.status = 'SETTLED'
                 AND o.settled_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
           WHERE d.is_deleted = 0 AND d.status = 'ON'
           GROUP BY d.id
           ORDER BY qty ASC, d.id ASC
           LIMIT 6`,
    params: [],
  };
}
