import type { DishStatus } from './common.js';

/** 规格选项：差价可为负，0 表示不变价。 */
export interface SpecOption {
  id: number;
  name: string;
  priceDiff: number;
  sort: number;
}

/** 规格组：顾客端逐组必选一个。 */
export interface SpecGroup {
  id: number;
  name: string;
  sort: number;
  options: SpecOption[];
}

/** 加料项；maxSelect=0 表示不限。 */
export interface Addon {
  id: number;
  name: string;
  price: number;
  maxSelect: number;
  boundDishCount?: number;
}

/** 菜品（含规格组与可加料）。 */
export interface Dish {
  id: number;
  categoryId: number;
  categoryName?: string;
  name: string;
  description: string;
  imageFileId: number | null;
  imageUrl: string | null;
  price: number;
  sort: number;
  status: DishStatus;
  soldOut: boolean;
  specs: SpecGroup[];
  addons: Addon[];
}

/** 菜品分类。 */
export interface Category {
  id: number;
  name: string;
  sort: number;
  dishCount?: number;
}

/** 分类 + 菜品（顾客端菜单 / 后台聚合）。 */
export interface CategoryWithDishes extends Category {
  dishes: Dish[];
}

/** 后台菜品页聚合数据。 */
export interface AdminCatalog {
  categories: Category[];
  dishes: Dish[];
  addons: Addon[];
}

/** 保存菜品入参。 */
export interface DishSaveInput {
  id?: number;
  name: string;
  description?: string;
  categoryId: number;
  price: number;
  sort?: number;
  status?: DishStatus;
  soldOut?: boolean;
  imageFileId?: number | null;
  specs: Array<{
    name: string;
    options: Array<{ name: string; priceDiff: number }>;
  }>;
  addonIds: number[];
}
