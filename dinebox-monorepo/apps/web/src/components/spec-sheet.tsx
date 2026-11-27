'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Dish } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import {
  addonTotalOf,
  groupSelected,
  specExtraOf,
  type CartAddon,
  type CartLine,
} from '@/lib/cart';
import { DishGlyph } from './dish-glyph';
import { Sheet } from './sheet';

/** 规格与加料选择弹层：逐组必选、加料限选、单价实时联动。 */
export function SpecSheet({
  open,
  dish,
  line,
  onClose,
  onConfirm,
}: {
  open: boolean;
  dish: Dish | null;
  line: CartLine | null;
  onClose: () => void;
  onConfirm: (dish: Dish, optionIds: number[], addons: CartAddon[], qty: number) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!open || !dish) {
      return;
    }
    const optionIds = dish.specs.map((group) => {
      const fromLine = line?.specOptionIds.find((id) =>
        group.options.some((option) => option.id === id),
      );
      return fromLine ?? group.options[0]?.id;
    });
    setSelected(
      optionIds.filter((id): id is number => typeof id === 'number'),
    );
    const addons: Record<number, number> = {};
    for (const addon of line?.addons ?? []) {
      addons[addon.addonId] = addon.qty;
    }
    setAddonQty(addons);
    setQty(line?.qty ?? 1);
  }, [open, dish, line]);

  const addons = useMemo<CartAddon[]>(() => {
    if (!dish) {
      return [];
    }
    return dish.addons
      .filter((addon) => (addonQty[addon.id] ?? 0) > 0)
      .map((addon) => ({
        addonId: addon.id,
        name: addon.name,
        price: addon.price,
        qty: addonQty[addon.id] ?? 0,
      }));
  }, [dish, addonQty]);

  if (!dish) {
    return null;
  }

  const extra = specExtraOf(dish, selected);
  const addonTotal = addonTotalOf(addons);
  const unitPrice = dish.price + extra + addonTotal;

  const setAddon = (id: number, value: number, maxSelect: number): void => {
    const limit = maxSelect > 0 ? maxSelect : 99;
    setAddonQty((previous) => ({
      ...previous,
      [id]: Math.max(0, Math.min(limit, value)),
    }));
  };

  const allGroupsSelected = dish.specs.every((group) => groupSelected(group, selected));

  return (
    <Sheet
      open={open}
      title={line ? '修改规格' : '选择规格'}
      onClose={onClose}
      footer={
        <>
          <div className="price" style={{ fontSize: 20 }}>
            <span className="yen">¥</span>
            {formatMoney(unitPrice)}
          </div>
          <div className="stepper">
            <button
              type="button"
              className={qty <= 1 ? 'minus-off' : ''}
              onClick={() => setQty((value) => Math.max(1, value - 1))}
            >
              −
            </button>
            <div className="num">{qty}</div>
            <button type="button" onClick={() => setQty((value) => Math.min(99, value + 1))}>
              ＋
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!allGroupsSelected}
            onClick={() => onConfirm(dish, selected, addons, qty)}
          >
            {line ? '保存修改' : '加入购物车'}
          </button>
        </>
      }
    >
      <div className="spec-dish">
        <div className="dish-img" style={{ background: '#f4efe9' }}>
          {dish.imageUrl ? (
            <img
              src={dish.imageUrl}
              alt={dish.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <DishGlyph dish={dish} />
          )}
        </div>
        <div>
          <div className="n">{dish.name}</div>
          <div className="p">
            <span className="yen">¥</span>
            {formatMoney(dish.price)}
            <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 6, fontWeight: 400 }}>
              基础价
            </span>
          </div>
        </div>
      </div>

      {dish.specs.map((group) => (
        <div key={group.id}>
          <div className="group-title">
            {group.name}
            <span style={{ marginLeft: 6, color: 'var(--ink-3)' }}>必选</span>
          </div>
          <div className="opt-wrap">
            {group.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`opt ${selected.includes(option.id) ? 'active' : ''}`}
                onClick={() =>
                  setSelected((previous) => [
                    ...previous.filter(
                      (id) => !group.options.some((item) => item.id === id),
                    ),
                    option.id,
                  ])
                }
              >
                {option.name}
                {option.priceDiff !== 0 ? (
                  <span className="plus">
                    {option.priceDiff > 0 ? '+' : '-'}¥{formatMoney(Math.abs(option.priceDiff))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}

      {dish.addons.length > 0 ? (
        <>
          <div className="group-title">
            加料
            <span style={{ marginLeft: 6, color: 'var(--ink-3)' }}>选填</span>
          </div>
          <div className="addon-list">
            {dish.addons.map((addon) => {
              const current = addonQty[addon.id] ?? 0;
              const limit = addon.maxSelect > 0 ? addon.maxSelect : 99;
              return (
                <div
                  key={addon.id}
                  className={`addon-row ${current > 0 ? 'on' : ''}`}
                  onClick={() => {
                    if (addon.maxSelect === 1) {
                      setAddon(addon.id, current > 0 ? 0 : 1, addon.maxSelect);
                    }
                  }}
                  role="presentation"
                >
                  <div>
                    <div className="addon-name">
                      {addon.name}
                      {addon.maxSelect > 0 ? (
                        <span className="addon-limit">限 {addon.maxSelect} 份</span>
                      ) : null}
                    </div>
                    <div className="addon-price">
                      +¥{formatMoney(addon.price)}
                    </div>
                  </div>
                  {addon.maxSelect === 1 ? (
                    <span className="checkbox">{current > 0 ? '✓' : ''}</span>
                  ) : (
                    <div
                      className="addon-stepper"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={current <= 0 ? 'off' : ''}
                        onClick={() => setAddon(addon.id, current - 1, addon.maxSelect)}
                      >
                        −
                      </button>
                      <span className="num">{current}</span>
                      <button
                        type="button"
                        className={current >= limit ? 'off' : ''}
                        onClick={() => setAddon(addon.id, current + 1, addon.maxSelect)}
                      >
                        ＋
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
