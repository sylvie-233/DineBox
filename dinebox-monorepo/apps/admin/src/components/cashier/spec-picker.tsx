import { useMemo, useState } from 'react';

import type { Dish } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { Modal } from '@/components/modal';

export interface PickedAddon {
  addonId: number;
  name: string;
  price: number;
  qty: number;
}

export interface SpecPickInitial {
  optionIds: number[];
  addons: PickedAddon[];
}

/** 改单规格选择：逐组单选 + 加料份数，单价实时联动。 */
export function SpecPickerModal({
  dish,
  initial,
  onClose,
  onConfirm,
}: {
  dish: Dish;
  initial: SpecPickInitial | null;
  onClose: () => void;
  onConfirm: (optionIds: number[], addons: PickedAddon[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>(() =>
    dish.specs
      .map(
        (group) =>
          initial?.optionIds.find((id) => group.options.some((option) => option.id === id)) ??
          group.options[0]?.id,
      )
      .filter((id): id is number => typeof id === 'number'),
  );
  const [addonQty, setAddonQty] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const addon of initial?.addons ?? []) {
      map[addon.addonId] = addon.qty;
    }
    return map;
  });

  const unitPrice = useMemo(() => {
    let extra = 0;
    for (const group of dish.specs) {
      const option = group.options.find((item) => selected.includes(item.id));
      if (option) extra += option.priceDiff;
    }
    for (const addon of dish.addons) {
      extra += addon.price * (addonQty[addon.id] ?? 0);
    }
    return dish.price + extra;
  }, [dish, selected, addonQty]);

  const confirm = (): void => {
    const addons: PickedAddon[] = dish.addons
      .filter((addon) => (addonQty[addon.id] ?? 0) > 0)
      .map((addon) => ({
        addonId: addon.id,
        name: addon.name,
        price: addon.price,
        qty: addonQty[addon.id] ?? 0,
      }));
    onConfirm(selected, addons);
  };

  const setAddon = (id: number, value: number, maxSelect: number): void => {
    const limit = maxSelect > 0 ? maxSelect : 99;
    setAddonQty((previous) => ({
      ...previous,
      [id]: Math.max(0, Math.min(limit, value)),
    }));
  };

  return (
    <Modal
      open
      title={`选择规格 · ${dish.name}`}
      onClose={onClose}
      width={420}
      zIndex={95}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-2)' }}>
            单价{' '}
            <b className="num" style={{ color: 'var(--price)', fontSize: 17 }}>
              ¥{formatMoney(unitPrice)}
            </b>
          </span>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={confirm}>
            确定
          </button>
        </>
      }
    >
      {dish.specs.length === 0 ? (
        <div className="form-hint" style={{ marginTop: 0 }}>
          该菜品没有规格组，可直接确认。
        </div>
      ) : null}
      {dish.specs.map((group) => (
        <div className="spec-pick-group" key={group.id}>
          <div className="gname">
            {group.name}
            <span style={{ marginLeft: 6 }}>必选</span>
          </div>
          <div className="opt-chips">
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
        <div className="spec-pick-group">
          <div className="gname">加料（选填）</div>
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
                    <div className="addon-price">+¥{formatMoney(addon.price)}</div>
                  </div>
                  {addon.maxSelect === 1 ? (
                    <span className="checkbox">{current > 0 ? '✓' : ''}</span>
                  ) : (
                    <div className="addon-stepper" onClick={(event) => event.stopPropagation()}>
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
        </div>
      ) : null}
    </Modal>
  );
}
