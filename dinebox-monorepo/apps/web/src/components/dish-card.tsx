'use client';

import type { ReactNode } from 'react';

import type { Dish } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { DishGlyph } from './dish-glyph';

/** 关键词高亮：命中部分使用价格红。 */
function highlight(text: string, keyword: string): ReactNode {
  const term = keyword.trim();
  if (!term) {
    return text;
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={index} className="kw-mark">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

const TINTS = ['#f6efe8', '#f5f1ea', '#f2f0eb', '#f4efe9', '#eef1ec', '#f3f0e8'];

/** 菜品卡片：菜单与搜索结果共用。 */
export function DishCard({
  dish,
  tintIndex,
  cartQty,
  keyword = '',
  categoryName,
  onAdd,
}: {
  dish: Dish;
  tintIndex: number;
  cartQty: number;
  keyword?: string;
  categoryName?: string;
  onAdd: (dish: Dish) => void;
}) {
  const hasChoices = dish.specs.length > 0 || dish.addons.length > 0;
  const startPrice = dish.specs.length > 0 ? '起' : '';
  const tags = [
    ...dish.specs.slice(0, 2).map((group) => group.name),
    ...(dish.addons.length > 0 ? [`${dish.addons.length} 种加料`] : []),
  ];

  return (
    <div className={`dish-card ${dish.soldOut ? 'sold' : ''}`}>
      <div
        className="dish-img"
        style={{ background: TINTS[tintIndex % TINTS.length] }}
      >
        {dish.imageUrl ? (
          <img
            src={dish.imageUrl}
            alt={dish.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <DishGlyph dish={{ ...dish, categoryName: categoryName ?? dish.categoryName }} />
        )}
        {dish.soldOut ? (
          <div className="sold-tag">
            <span>售罄</span>
          </div>
        ) : null}
      </div>

      <div className="dish-info">
        <div className="dish-name">{highlight(dish.name, keyword)}</div>
        <div className="dish-desc">{highlight(dish.description || '点击查看详情', keyword)}</div>
        {tags.length > 0 ? (
          <div className="dish-tags">
            {tags.map((tag) => (
              <span key={tag} className="mini-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="dish-bottom">
          <div>
            <span className="price">
              <span className="yen">¥</span>
              {formatMoney(dish.price)}
            </span>
            {startPrice ? (
              <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 3 }}>
                {startPrice}
              </span>
            ) : null}
            {cartQty > 0 ? (
              <span className="dish-qty">已选 {cartQty}</span>
            ) : null}
          </div>
          {hasChoices ? (
            <button
              type="button"
              className="spec-btn"
              disabled={dish.soldOut}
              onClick={() => onAdd(dish)}
            >
              选规格
            </button>
          ) : (
            <button
              type="button"
              className="add-btn"
              disabled={dish.soldOut}
              aria-label={`添加 ${dish.name}`}
              onClick={() => onAdd(dish)}
            >
              ＋
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
