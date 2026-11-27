'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ShoppingCart } from 'lucide-react';

import type { CategoryWithDishes, Dish, PublicTableInfo, ShopConfig } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { cartCount, cartTotal, type CartLine } from '@/lib/cart';
import { DishCard } from './dish-card';

const HOT_WORDS = ['水煮牛肉', '红烧肉', '小龙虾', '水饺', '柠檬茶', '炒饭', '汤', '辣'];

/** 点餐主视图：门店条、桌号、分类导航、菜品列表、搜索与购物车栏。 */
export function MenuView({
  shop,
  table,
  categories,
  people,
  cart,
  onAddDish,
  onOpenCart,
  onOpenPreview,
  onShowOrders,
}: {
  shop: ShopConfig;
  table: PublicTableInfo;
  categories: CategoryWithDishes[];
  people: number;
  cart: CartLine[];
  onAddDish: (dish: Dish) => void;
  onOpenCart: () => void;
  onOpenPreview: () => void;
  onShowOrders: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeCat, setActiveCat] = useState<number | null>(categories[0]?.id ?? null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  const allDishes = useMemo(
    () => categories.flatMap((category) => category.dishes.map((dish) => ({ dish, category }))),
    [categories],
  );
  const tintByCategory = useMemo(
    () => new Map(categories.map((category, index) => [category.id, index])),
    [categories],
  );
  const dishCategory = useMemo(
    () => new Map(allDishes.map((entry) => [entry.dish.id, entry.category.id])),
    [allDishes],
  );
  const qtyByDish = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of cart) {
      map.set(line.dishId, (map.get(line.dishId) ?? 0) + line.qty);
    }
    return map;
  }, [cart]);
  const catQty = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of cart) {
      const categoryId = dishCategory.get(line.dishId);
      if (categoryId) {
        map.set(categoryId, (map.get(categoryId) ?? 0) + line.qty);
      }
    }
    return map;
  }, [cart, dishCategory]);

  const total = cartTotal(cart);
  const count = cartCount(cart);

  const results = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (!term) {
      return [];
    }
    return allDishes.filter(({ dish, category }) =>
      [dish.name, dish.description, category.name]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [allDishes, keyword]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const onScroll = (): void => {
      const panelTop = panel.getBoundingClientRect().top;
      let current = categories[0]?.id ?? null;
      for (const category of categories) {
        const element = sectionRefs.current[category.id];
        if (!element) {
          continue;
        }
        if (element.getBoundingClientRect().top - panelTop <= 64) {
          current = category.id;
        }
      }
      setActiveCat(current);
    };
    panel.addEventListener('scroll', onScroll, { passive: true });
    return () => panel.removeEventListener('scroll', onScroll);
  }, [categories]);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [searchOpen]);

  const jumpTo = (categoryId: number): void => {
    const panel = panelRef.current;
    const element = sectionRefs.current[categoryId];
    if (!panel || !element) {
      return;
    }
    setActiveCat(categoryId);
    const top =
      panel.scrollTop + element.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    panel.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
  };

  const openSearch = (): void => {
    setKeyword('');
    setSearchOpen(true);
  };

  const addFromSearch = (dish: Dish): void => {
    onAddDish(dish);
  };

  return (
    <div className="view show" id="menuView">
      <div className="topbar">
        <div className="shop-row">
          <div className="shop-logo" style={{ fontSize: 20, fontWeight: 900 }}>希</div>
          <div>
            <div className="shop-name">{shop.shopName}</div>
            <div className="shop-sub">
              营业中 {shop.openTime} - {shop.closeTime} ｜ 扫码点餐
            </div>
          </div>
          <button type="button" className="top-order-btn" onClick={onShowOrders}>
            我的订单
          </button>
        </div>
        <div className="notice">
          <span>
            本店支持扫码点餐，下单后请到前台结账；菜品图片仅供参考，口味需求请在备注中说明。
          </span>
        </div>
        <button type="button" className="search-bar" onClick={openSearch} aria-label="搜索菜品">
          <Search size={15} />
          <span className="ph">搜索菜品，如“水煮牛肉”</span>
        </button>
      </div>

      <div className="table-bar">
        <div className="table-tag">{table.name}</div>
        <div className="table-text">
          <span>{people} 人</span> · 桌号已由桌台二维码锁定
          <br />
          如换桌或贴错码，请联系服务员重新扫码
        </div>
      </div>

      <div className="main">
        <div className="cat-nav">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`cat-item ${activeCat === category.id ? 'active' : ''}`}
              onClick={() => jumpTo(category.id)}
            >
              {category.name}
              {(catQty.get(category.id) ?? 0) > 0 ? (
                <span className="badge">{catQty.get(category.id)}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="dish-panel" ref={panelRef}>
          {categories.map((category) => (
            <div
              key={category.id}
              ref={(element) => {
                sectionRefs.current[category.id] = element;
              }}
            >
              <div className="sec-title">{category.name}</div>
              {category.dishes.map((dish) => (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  tintIndex={tintByCategory.get(category.id) ?? 0}
                  cartQty={qtyByDish.get(dish.id) ?? 0}
                  categoryName={category.name}
                  onAdd={onAddDish}
                />
              ))}
            </div>
          ))}
          {categories.length === 0 ? (
            <div className="empty-cart" style={{ paddingTop: 60 }}>
              菜单准备中，请稍后再试
            </div>
          ) : null}
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', padding: '18px 0' }}>
            — 已经到底啦 —
          </div>
        </div>
      </div>

      <div className="cart-bar">
        <button
          type="button"
          className="cart-icon-wrap"
          onClick={onOpenCart}
          aria-label="打开购物车"
        >
          <ShoppingCart size={20} />
          {count > 0 ? <div className="cart-badge">{count > 99 ? '99+' : count}</div> : null}
        </button>
        <div className="cart-total">
          <div className="money">
            <span className="yen">¥</span>
            {formatMoney(total)}
          </div>
          <div className="hint">{count > 0 ? `共 ${count} 件` : '未选购商品'}</div>
        </div>
        <button
          type="button"
          className="submit-btn"
          disabled={count === 0}
          onClick={onOpenPreview}
        >
          提交订单
        </button>
      </div>

      {searchOpen ? (
        <div className="search-view show">
          <div className="search-head">
            <div className="search-input-wrap">
              <Search size={15} />
              <input
                ref={searchInputRef}
                className="search-input"
                value={keyword}
                placeholder="搜索菜品名称、描述、分类"
                onChange={(event) => setKeyword(event.target.value)}
              />
              {keyword ? (
                <button
                  type="button"
                  className="search-clear show"
                  onClick={() => setKeyword('')}
                  aria-label="清空"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <button type="button" className="search-cancel" onClick={() => setSearchOpen(false)}>
              取消
            </button>
          </div>

          <div className="search-body">
            {!keyword.trim() ? (
              <>
                <div className="search-sec-label">热门搜索</div>
                <div className="hot-chips">
                  {HOT_WORDS.map((word) => (
                    <button
                      key={word}
                      type="button"
                      className="hot-chip"
                      onClick={() => setKeyword(word)}
                    >
                      {word}
                    </button>
                  ))}
                </div>
                <div className="search-sec-label" style={{ marginTop: 24 }}>
                  全部菜品
                </div>
                {allDishes.slice(0, 6).map(({ dish, category }) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    tintIndex={tintByCategory.get(category.id) ?? 0}
                    cartQty={qtyByDish.get(dish.id) ?? 0}
                    categoryName={category.name}
                    onAdd={addFromSearch}
                  />
                ))}
              </>
            ) : (
              <>
                <div className="search-count">
                  找到 {results.length} 个与“{keyword.trim()}”相关的菜品
                </div>
                {results.map(({ dish, category }) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    tintIndex={tintByCategory.get(category.id) ?? 0}
                    cartQty={qtyByDish.get(dish.id) ?? 0}
                    categoryName={category.name}
                    keyword={keyword}
                    onAdd={addFromSearch}
                  />
                ))}
                {results.length === 0 ? (
                  <div className="search-empty">
                    <Search size={44} style={{ opacity: 0.2, marginBottom: 10 }} />
                    <div>没有找到相关菜品</div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>换个关键词试试，或直接浏览分类菜单</div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
