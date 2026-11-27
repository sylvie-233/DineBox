import type { CategoryWithDishes } from './catalog.js';
import type { ShopConfig } from './auth.js';

/** 桌台区域。 */
export interface DiningArea {
  id: number;
  name: string;
  sort: number;
  tableCount?: number;
}

/** 桌台（管理视角）。 */
export interface DiningTable {
  id: number;
  areaId: number;
  areaName: string;
  name: string;
  seats: number | null;
  qrToken: string;
  qrLink: string;
  status: LiveTableStatus;
  pendingOrderCount: number;
  pendingAmount: number;
}

import type { LiveTableStatus } from './common.js';

/** 桌台卡片上的未结订单摘要。 */
export interface TableOrderBrief {
  id: number;
  orderNo: string;
  totalAmount: number;
  payableAmount: number;
  hungFlag: boolean;
  peopleCount: number;
  itemCount: number;
  createdAt: string;
}

/** 收银台桌台卡片（含未结订单摘要）。 */
export interface TableCard {
  id: number;
  name: string;
  areaId: number;
  areaName: string;
  seats: number | null;
  status: LiveTableStatus;
  pendingOrderCount: number;
  pendingAmount: number;
  orders: TableOrderBrief[];
}

/** 收银台按区域分组。 */
export interface AreaGroup {
  id: number;
  name: string;
  tables: TableCard[];
}

/** 收银台今日摘要。 */
export interface CashierStats {
  todayOrderCount: number;
  todayRevenue: number;
  pendingOrderCount: number;
  hungOrderCount: number;
  occupiedTables: number;
  totalTables: number;
  averagePerOrder: number;
}

/** 收银台首页数据。 */
export interface CashierOverview {
  stats: CashierStats;
  areas: AreaGroup[];
}

/** 顾客扫码已知桌台。 */
export interface PublicTableInfo {
  id: number;
  name: string;
  areaName: string;
  seats: number | null;
  qrToken: string;
}

/** 顾客端启动数据。 */
export interface PublicBootstrap {
  shop: ShopConfig;
  table: PublicTableInfo;
  categories: CategoryWithDishes[];
}
