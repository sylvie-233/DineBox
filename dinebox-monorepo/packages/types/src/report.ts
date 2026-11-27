import type { PayMethod, ReportRange } from './common.js';

export interface ReportOverview {
  revenue: number;
  orderCount: number;
  avgOrder: number;
  returnAmount: number;
  returnRate: number;
  peakHour: string;
  /** 对比上一周期（昨日 / 前 7 日）的增减百分比；无基数时为 null。 */
  revenueDelta: number | null;
  orderDelta: number | null;
  avgDelta: number | null;
  returnRateDelta: number | null;
}

export interface HourPoint {
  hour: number;
  label: string;
  revenue: number;
  orderCount: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  revenue: number;
  orderCount: number;
}

export interface DishRankRow {
  dishName: string;
  specText: string;
  qty: number;
  amount: number;
}

export interface PaymentRow {
  payMethod: PayMethod;
  count: number;
  amount: number;
  ratio: number;
}

export interface ReturnStatRow {
  dishName: string;
  count: number;
  amount: number;
  topReason: string;
}

export interface SlowDishRow {
  dishName: string;
  categoryName: string;
  qty: number;
}

/** 报表页一次性返回的数据。 */
export interface ReportData {
  range: ReportRange;
  trendRange: 7 | 30;
  from: string;
  to: string;
  overview: ReportOverview;
  hourly: HourPoint[];
  trend: TrendPoint[];
  ranking: DishRankRow[];
  payments: PaymentRow[];
  returns: ReturnStatRow[];
  slowMovers: SlowDishRow[];
}
