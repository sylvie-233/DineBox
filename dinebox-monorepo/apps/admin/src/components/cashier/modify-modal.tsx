import { useMemo, useState } from 'react';

import type {
  CategoryWithDishes,
  Dish,
  ModifyOrderInput,
  Order,
  OrderItem,
} from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { useToast } from '@/lib/store/toast';
import { EmptyState } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { SpecPickerModal, type PickedAddon } from './spec-picker';

interface SpecEdit {
  optionIds: number[];
  addons: PickedAddon[];
}

interface NewItem {
  key: string;
  dish: Dish;
  optionIds: number[];
  addons: PickedAddon[];
  qty: number;
}

type SpecTarget =
  | { kind: 'item'; item: OrderItem; dish: Dish }
  | { kind: 'new'; dish: Dish }
  | null;

function addonText(addons: PickedAddon[]): string {
  return addons
    .filter((addon) => addon.qty > 0)
    .map((addon) => `${addon.name}×${addon.qty}`)
    .join('、');
}

function specNames(dish: Dish, optionIds: number[]): string {
  return dish.specs
    .map((group) => group.options.find((option) => optionIds.includes(option.id))?.name)
    .filter(Boolean)
    .join('/');
}

function initialOptionIds(dish: Dish, item: OrderItem): number[] {
  const names = item.specText.split('/').filter(Boolean);
  return dish.specs
    .map(
      (group) =>
        group.options.find((option) => names.includes(option.name))?.id ??
        group.options[0]?.id,
    )
    .filter((id): id is number => typeof id === 'number');
}

function orderItemAddons(item: OrderItem): PickedAddon[] {
  return item.addons
    .filter((addon) => addon.addonId !== null)
    .map((addon) => ({
      addonId: addon.addonId!,
      name: addon.name,
      price: addon.price,
      qty: addon.qty,
    }));
}

/** 改单：调整已有明细数量/规格、追加菜品、修改备注；保存后自动重打后厨小票。 */
export function ModifyModal({
  order,
  menu,
  onClose,
  onSaved,
}: {
  order: Order;
  menu: CategoryWithDishes[] | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const normalItems = useMemo(
    () => order.items.filter((item) => item.status === 'NORMAL'),
    [order.items],
  );
  const [qtyByItem, setQtyByItem] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const item of normalItems) map[item.id] = item.qty;
    return map;
  });
  const [specEdits, setSpecEdits] = useState<Record<number, SpecEdit>>({});
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [remark, setRemark] = useState(order.remark);
  const [addDishId, setAddDishId] = useState('');
  const [specTarget, setSpecTarget] = useState<SpecTarget>(null);
  const [saving, setSaving] = useState(false);

  const dishes = useMemo(() => {
    const map = new Map<number, Dish>();
    for (const category of menu ?? []) {
      for (const dish of category.dishes) map.set(dish.id, dish);
    }
    return map;
  }, [menu]);
  const allDishes = useMemo(() => [...dishes.values()], [dishes]);

  const openSpecForItem = (item: OrderItem): void => {
    const dish = dishes.get(item.dishId ?? 0);
    if (!dish) {
      toast('该菜品已下架，无法修改规格', 'error');
      return;
    }
    setSpecTarget({ kind: 'item', item, dish });
  };

  const addDish = (): void => {
    const dish = dishes.get(Number(addDishId));
    if (!dish) {
      toast('请选择要加入的菜品', 'error');
      return;
    }
    if (dish.soldOut) {
      toast(`「${dish.name}」已售罄，不能追加`, 'error');
      return;
    }
    if (dish.specs.length > 0 || dish.addons.length > 0) {
      setSpecTarget({ kind: 'new', dish });
      return;
    }
    setNewItems((previous) => [
      ...previous,
      {
        key: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        dish,
        optionIds: [],
        addons: [],
        qty: 1,
      },
    ]);
    setAddDishId('');
  };

  const confirmSpec = (optionIds: number[], addons: PickedAddon[]): void => {
    if (!specTarget) return;
    if (specTarget.kind === 'item') {
      setSpecEdits((previous) => ({
        ...previous,
        [specTarget.item.id]: { optionIds, addons },
      }));
    } else {
      setNewItems((previous) => [
        ...previous,
        {
          key: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          dish: specTarget.dish,
          optionIds,
          addons,
          qty: 1,
        },
      ]);
      setAddDishId('');
    }
    setSpecTarget(null);
  };

  const save = async (): Promise<void> => {
    const items: ModifyOrderInput['items'] = normalItems.map((item) => {
      const edit = specEdits[item.id];
      return {
        itemId: item.id,
        qty: qtyByItem[item.id] ?? item.qty,
        ...(edit
          ? {
              specOptionIds: edit.optionIds,
              addons: edit.addons.map((addon) => ({ addonId: addon.addonId, qty: addon.qty })),
            }
          : {}),
      };
    });
    const newPayload = newItems.map((item) => ({
      dishId: item.dish.id,
      qty: item.qty,
      specOptionIds: item.optionIds,
      addons: item.addons.map((addon) => ({ addonId: addon.addonId, qty: addon.qty })),
    }));

    setSaving(true);
    try {
      await adminFetch(`/cashier/orders/${order.id}/modify`, {
        method: 'POST',
        body: { remark, items, newItems: newPayload },
      });
      toast('改单成功，已重新下发后厨小票', 'success');
      onSaved();
      onClose();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '改单失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open
        title={`改单 · ${order.orderNo}`}
        onClose={onClose}
        width={520}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : '保存改单'}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>
          调整已有菜品数量（退菜请用「单品退菜」）；修改规格会按当前菜品配置重新计价。
        </div>

        <div className="items-scroll">
          {normalItems.length === 0 ? (
            <EmptyState title="没有可修改的正常菜品" />
          ) : (
            normalItems.map((item) => {
              const edit = specEdits[item.id];
              const dish = dishes.get(item.dishId ?? 0);
              const label = edit
                ? [
                    dish ? specNames(dish, edit.optionIds) : item.specText,
                    addonText(edit.addons),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : [item.specText, orderItemAddons(item).map((a) => `${a.name}×${a.qty}`).join('、')]
                    .filter(Boolean)
                    .join(' · ');
              return (
                <div className="oi-row" key={item.id}>
                  <div className="oi-name">
                    {item.dishName}
                    <span className="spec">{label || '默认规格'}</span>
                  </div>
                  <div className="stepper">
                    <button
                      type="button"
                      onClick={() =>
                        setQtyByItem((previous) => ({
                          ...previous,
                          [item.id]: Math.max(1, (previous[item.id] ?? item.qty) - 1),
                        }))
                      }
                    >
                      −
                    </button>
                    <span className="stv num">{qtyByItem[item.id] ?? item.qty}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setQtyByItem((previous) => ({
                          ...previous,
                          [item.id]: Math.min(99, (previous[item.id] ?? item.qty) + 1),
                        }))
                      }
                    >
                      ＋
                    </button>
                  </div>
                  <button type="button" className="btn-text" onClick={() => openSpecForItem(item)}>
                    改规格
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>新增菜品</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={addDishId}
            style={{ flex: 1, height: 38 }}
            onChange={(event) => setAddDishId(event.target.value)}
          >
            <option value="">{menu ? '选择菜品加入订单' : '菜品加载中…'}</option>
            {allDishes
              .filter((dish) => dish.status === 'ON')
              .map((dish) => (
                <option key={dish.id} value={dish.id} disabled={dish.soldOut}>
                  {dish.name} ¥{formatMoney(dish.price)}
                  {dish.soldOut ? '（售罄）' : ''}
                </option>
              ))}
          </select>
          <button type="button" className="btn" onClick={addDish}>
            加入
          </button>
        </div>

        {newItems.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            {newItems.map((item) => (
              <div className="oi-row" key={item.key}>
                <div className="oi-name">
                  {item.dish.name}
                  <span className="spec">
                    {[specNames(item.dish, item.optionIds), addonText(item.addons)]
                      .filter(Boolean)
                      .join(' · ') || '默认规格'}
                  </span>
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() =>
                      setNewItems((previous) =>
                        previous.map((entry) =>
                          entry.key === item.key
                            ? { ...entry, qty: Math.max(1, entry.qty - 1) }
                            : entry,
                        ),
                      )
                    }
                  >
                    −
                  </button>
                  <span className="stv num">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewItems((previous) =>
                        previous.map((entry) =>
                          entry.key === item.key
                            ? { ...entry, qty: Math.min(99, entry.qty + 1) }
                            : entry,
                        ),
                      )
                    }
                  >
                    ＋
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-text"
                  style={{ color: 'var(--price)' }}
                  onClick={() =>
                    setNewItems((previous) => previous.filter((entry) => entry.key !== item.key))
                  }
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="field" style={{ marginTop: 12 }}>
          <label>整单备注</label>
          <textarea
            rows={2}
            value={remark}
            maxLength={200}
            onChange={(event) => setRemark(event.target.value)}
          />
        </div>
      </Modal>

      {specTarget ? (
        <SpecPickerModal
          dish={specTarget.dish}
          initial={
            specTarget.kind === 'item'
              ? {
                  optionIds:
                    specEdits[specTarget.item.id]?.optionIds ??
                    initialOptionIds(specTarget.dish, specTarget.item),
                  addons:
                    specEdits[specTarget.item.id]?.addons ??
                    orderItemAddons(specTarget.item),
                }
              : null
          }
          onClose={() => setSpecTarget(null)}
          onConfirm={confirmSpec}
        />
      ) : null}
    </>
  );
}
