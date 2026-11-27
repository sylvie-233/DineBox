/**
 * 轻量报表服务：营收、趋势、时段分布、菜品排行、支付构成、退菜与滞销。
 *
 * 口径：
 * - 营收 / 订单数 / 客单价 / 支付构成按「已结清订单的 settled_at」统计；
 * - 退菜按「明细 returned_at」统计，退菜率 = 退菜金额 ÷ 营收；
 * - 「营收趋势」使用独立 7 / 30 日窗口，不随页面级今日 / 近 7 日口径联动。
 *
 * 所有聚合 SQL 位于 `src/sql/report.sql.ts`。
 */
import type {
  DishRankRow,
  HourPoint,
  PaymentRow,
  PayMethod,
  ReportData,
  ReportOverview,
  ReportRange,
  ReturnStatRow,
  SlowDishRow,
  TrendPoint,
} from '@dinebox/types';
import { lastNDates, round2 } from '@dinebox/utils';

import { dbClient } from '../../db/index.js';
import { toNumber } from '../../sql/shared.js';
import {
  hourlyQuery,
  paymentsQuery,
  peakHourQuery,
  rankingQuery,
  returnAmountQuery,
  returnsQuery,
  revenueQuery,
  slowMoversQuery,
  trendQuery,
} from '../../sql/report.sql.js';

interface RevenueRow {
  revenue: number;
  orderCount: number;
}

interface ReturnAmountRow {
  amount: number;
}

interface HourRow {
  hour: number;
  revenue: number;
  orderCount: number;
}

interface TrendRow {
  date: string;
  revenue: number;
  orderCount: number;
}

interface RankRow {
  dishName: string;
  specText: string;
  qty: number;
  amount: number;
}

interface PaymentDbRow {
  payMethod: PayMethod;
  count: number;
  amount: number;
}

interface ReturnDbRow {
  dishName: string;
  reason: string;
  qty: number;
  itemAmount: number;
}

interface SlowRow {
  dishName: string;
  categoryName: string;
  qty: number;
}

interface RangeBounds {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function boundsFor(range: ReportRange): RangeBounds {
  const now = new Date();
  const today = dateString(now);
  if (range === 'today') {
    const yesterday = new Date(now.getTime());
    yesterday.setDate(now.getDate() - 1);
    const prev = dateString(yesterday);
    return {
      from: `${today} 00:00:00`,
      to: `${today} 23:59:59`,
      prevFrom: `${prev} 00:00:00`,
      prevTo: `${prev} 23:59:59`,
    };
  }
  const start = new Date(now.getTime());
  start.setDate(now.getDate() - 6);
  const prevEnd = new Date(start.getTime());
  prevEnd.setDate(start.getDate() - 1);
  const prevStart = new Date(prevEnd.getTime());
  prevStart.setDate(prevEnd.getDate() - 6);
  return {
    from: `${dateString(start)} 00:00:00`,
    to: `${today} 23:59:59`,
    prevFrom: `${dateString(prevStart)} 00:00:00`,
    prevTo: `${dateString(prevEnd)} 23:59:59`,
  };
}

async function revenueOf(from: string, to: string): Promise<RevenueRow> {
  const query = revenueQuery(from, to);
  const row = await dbClient.queryOne<RevenueRow>(query.sql, query.params);
  return {
    revenue: round2(toNumber(row?.revenue)),
    orderCount: Number(row?.orderCount ?? 0),
  };
}

async function returnAmountOf(from: string, to: string): Promise<number> {
  const query = returnAmountQuery(from, to);
  const row = await dbClient.queryOne<ReturnAmountRow>(query.sql, query.params);
  return round2(toNumber(row?.amount));
}

function delta(current: number, previous: number): number | null {
  if (previous <= 0) {
    return null;
  }
  return round2(((current - previous) / previous) * 100);
}

function rate(returnAmount: number, revenue: number): number {
  return revenue > 0 ? round2(returnAmount / revenue) : 0;
}

async function loadOverview(bounds: RangeBounds): Promise<ReportOverview> {
  const peakQuery = peakHourQuery(bounds.from, bounds.to);
  const [current, previous, currentReturn, previousReturn, peak] = await Promise.all([
    revenueOf(bounds.from, bounds.to),
    revenueOf(bounds.prevFrom, bounds.prevTo),
    returnAmountOf(bounds.from, bounds.to),
    returnAmountOf(bounds.prevFrom, bounds.prevTo),
    dbClient.queryOne<{ hour: number }>(peakQuery.sql, peakQuery.params),
  ]);

  const currentAvg = current.orderCount > 0 ? round2(current.revenue / current.orderCount) : 0;
  const previousAvg = previous.orderCount > 0 ? round2(previous.revenue / previous.orderCount) : 0;
  const currentRate = rate(currentReturn, current.revenue);
  const previousRate = rate(previousReturn, previous.revenue);

  return {
    revenue: current.revenue,
    orderCount: current.orderCount,
    avgOrder: currentAvg,
    returnAmount: currentReturn,
    returnRate: currentRate,
    peakHour: peak ? `${pad(peak.hour)}:00 - ${pad((peak.hour + 1) % 24)}:00` : '—',
    revenueDelta: delta(current.revenue, previous.revenue),
    orderDelta: delta(current.orderCount, previous.orderCount),
    avgDelta: delta(currentAvg, previousAvg),
    returnRateDelta: delta(currentRate, previousRate),
  };
}

async function loadHourly(bounds: RangeBounds): Promise<HourPoint[]> {
  const query = hourlyQuery(bounds.from, bounds.to);
  const rows = await dbClient.query<HourRow>(query.sql, query.params);
  const map = new Map(rows.map((row) => [Number(row.hour), row]));
  return Array.from({ length: 24 }, (_, hour) => {
    const row = map.get(hour);
    return {
      hour,
      label: `${pad(hour)}:00`,
      revenue: round2(toNumber(row?.revenue)),
      orderCount: Number(row?.orderCount ?? 0),
    };
  });
}

async function loadTrend(days: 7 | 30): Promise<TrendPoint[]> {
  const dates = lastNDates(days);
  const query = trendQuery(days);
  const rows = await dbClient.query<TrendRow>(query.sql, query.params);
  const map = new Map(rows.map((row) => [row.date, row]));
  return dates.map((date) => {
    const row = map.get(date);
    return {
      date,
      label: date.slice(5),
      revenue: round2(toNumber(row?.revenue)),
      orderCount: Number(row?.orderCount ?? 0),
    };
  });
}

async function loadRanking(bounds: RangeBounds): Promise<DishRankRow[]> {
  const query = rankingQuery(bounds.from, bounds.to);
  const rows = await dbClient.query<RankRow>(query.sql, query.params);
  return rows.map((row) => ({
    dishName: row.dishName,
    specText: row.specText,
    qty: Number(row.qty),
    amount: round2(toNumber(row.amount)),
  }));
}

async function loadPayments(bounds: RangeBounds): Promise<PaymentRow[]> {
  const query = paymentsQuery(bounds.from, bounds.to);
  const rows = await dbClient.query<PaymentDbRow>(query.sql, query.params);
  const total = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
  return rows.map((row) => ({
    payMethod: row.payMethod,
    count: Number(row.count),
    amount: round2(toNumber(row.amount)),
    ratio: total > 0 ? round2(toNumber(row.amount) / total) : 0,
  }));
}

async function loadReturns(bounds: RangeBounds): Promise<ReturnStatRow[]> {
  const query = returnsQuery(bounds.from, bounds.to);
  const rows = await dbClient.query<ReturnDbRow>(query.sql, query.params);

  const map = new Map<
    string,
    { count: number; amount: number; reasons: Map<string, number> }
  >();
  for (const row of rows) {
    const entry = map.get(row.dishName) ?? {
      count: 0,
      amount: 0,
      reasons: new Map<string, number>(),
    };
    entry.count += 1;
    entry.amount = round2(entry.amount + toNumber(row.itemAmount));
    const reason = row.reason.trim() || '未填写原因';
    entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + 1);
    map.set(row.dishName, entry);
  }

  return [...map.entries()]
    .map(([dishName, entry]) => {
      const topReason =
        [...entry.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return { dishName, count: entry.count, amount: entry.amount, topReason };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

async function loadSlowMovers(): Promise<SlowDishRow[]> {
  const query = slowMoversQuery();
  const rows = await dbClient.query<SlowRow>(query.sql, query.params);
  return rows.map((row) => ({
    dishName: row.dishName,
    categoryName: row.categoryName,
    qty: Number(row.qty),
  }));
}

/** 报表页一次性聚合。 */
export async function getReport(range: ReportRange, trendRange: 7 | 30): Promise<ReportData> {
  const bounds = boundsFor(range);
  const [overview, hourly, trend, ranking, payments, returns, slowMovers] = await Promise.all([
    loadOverview(bounds),
    loadHourly(bounds),
    loadTrend(trendRange),
    loadRanking(bounds),
    loadPayments(bounds),
    loadReturns(bounds),
    loadSlowMovers(),
  ]);

  return {
    range,
    trendRange,
    from: bounds.from.slice(0, 10),
    to: bounds.to.slice(0, 10),
    overview,
    hourly,
    trend,
    ranking,
    payments,
    returns,
    slowMovers,
  };
}
