'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { RotateCcw } from 'lucide-react';

import type {
  Dish,
  Order,
  PublicBootstrap,
  PublicOrderListItem,
} from '@dinebox/types';

import { publicApi } from '@/lib/api';
import {
  addLineToCart,
  createCartLine,
  loadCart,
  saveCart,
  type CartAddon,
  type CartLine,
} from '@/lib/cart';
import { CartSheet } from './cart-sheet';
import { ConfirmSheet } from './confirm-sheet';
import { EntryView } from './entry-view';
import { MenuView } from './menu-view';
import { OrderDetailSheet } from './order-detail-sheet';
import { OrdersView } from './orders-view';
import { PreviewSheet } from './preview-sheet';
import { SpecSheet } from './spec-sheet';
import { SuccessSheet } from './success-sheet';
import { Toast } from './toast';

type SheetKind = 'cart' | 'preview' | 'spec' | 'success' | 'detail' | 'confirm' | null;

function ScanPrompt({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="phone">
      <div className="entry">
        <div className="entry-top">
          <div className="entry-logo">
            <span style={{ fontSize: 28, fontWeight: 900 }}>希</span>
          </div>
          <div className="entry-shop">DineBox 扫码点餐</div>
          <div className="entry-scan">请扫描桌台上的二维码进入点餐</div>
        </div>
        <div className="entry-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
            {message ?? '未识别到桌号，二维码贴纸通常位于桌面或桌角。'}
            <br />
            如二维码损坏或换桌，请联系服务员重新扫码。
          </div>
          {onRetry ? (
            <button
              type="button"
              className="top-order-btn"
              style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={onRetry}
            >
              <RotateCcw size={13} /> 重新加载
            </button>
          ) : null}
        </div>
        <div className="entry-foot">桌号由二维码锁定，请勿使用他人桌台二维码点餐</div>
      </div>
    </div>
  );
}

/** 顾客点餐 H5 根组件：入座 → 点餐 → 购物车 → 下单 → 本桌订单。 */
export function OrderApp() {
  const searchParams = useSearchParams();
  const tableToken = searchParams.get('tk')?.trim() ?? '';

  const { data, error, isLoading, mutate } = useSWR<PublicBootstrap>(
    tableToken ? ['public-bootstrap', tableToken] : null,
    () => publicApi.bootstrap(tableToken),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const {
    data: orders,
    error: ordersError,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useSWR<PublicOrderListItem[]>(
    tableToken ? ['public-orders', tableToken] : null,
    () => publicApi.orders(tableToken),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [entered, setEntered] = useState(false);
  const [people, setPeople] = useState(2);
  const [view, setView] = useState<'menu' | 'orders'>('menu');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [specDish, setSpecDish] = useState<Dish | null>(null);
  const [specLine, setSpecLine] = useState<CartLine | null>(null);
  const [specOrigin, setSpecOrigin] = useState<'cart' | 'other'>('other');
  const [detailOrder, setDetailOrder] = useState<PublicOrderListItem | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToastMessage(null), 2400);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    },
    [],
  );

  // 按桌台恢复购物车，避免刷新页面丢失。
  useEffect(() => {
    if (!tableToken) {
      setCartLoaded(true);
      return;
    }
    setCart(loadCart(tableToken));
    setCartLoaded(true);
  }, [tableToken]);

  useEffect(() => {
    if (cartLoaded && tableToken) {
      saveCart(tableToken, cart);
    }
  }, [cart, cartLoaded, tableToken]);

  useEffect(() => {
    if (data?.shop.shopName) {
      document.title = `${data.shop.shopName} · 扫码点餐`;
    }
  }, [data?.shop.shopName]);

  const dishMap = useMemo(() => {
    const map = new Map<number, Dish>();
    for (const category of data?.categories ?? []) {
      for (const dish of category.dishes) {
        map.set(dish.id, { ...dish, categoryName: category.name });
      }
    }
    return map;
  }, [data?.categories]);

  const addDish = useCallback(
    (dish: Dish) => {
      if (dish.soldOut) {
        showToast('该菜品已售罄');
        return;
      }
      if (dish.specs.length === 0 && dish.addons.length === 0) {
        const line = createCartLine(dish, [], [], 1);
        setCart((previous) => addLineToCart(previous, line));
        showToast(`已加入「${dish.name}」`);
        return;
      }
      setSpecDish(dish);
      setSpecLine(null);
      setSpecOrigin('other');
      setSheet('spec');
    },
    [showToast],
  );

  const editSpec = useCallback(
    (line: CartLine) => {
      const dish = dishMap.get(line.dishId);
      if (!dish) {
        showToast('该菜品已下架，请从购物车移除');
        return;
      }
      setSpecDish(dish);
      setSpecLine(line);
      setSpecOrigin('cart');
      setSheet('spec');
    },
    [dishMap, showToast],
  );

  const confirmSpec = useCallback(
    (dish: Dish, optionIds: number[], addons: CartAddon[], qty: number) => {
      const line = createCartLine(dish, optionIds, addons, qty, specLine?.uid);
      if (specLine) {
        setCart((previous) => previous.map((item) => (item.uid === specLine.uid ? line : item)));
        showToast('规格已更新');
      } else {
        setCart((previous) => addLineToCart(previous, line));
        showToast(`已加入「${dish.name}」`);
      }
      const backToCart = specOrigin === 'cart';
      setSpecDish(null);
      setSpecLine(null);
      setSheet(backToCart ? 'cart' : null);
    },
    [specLine, specOrigin, showToast],
  );

  const changeQty = useCallback((uid: string, qty: number) => {
    setCart((previous) =>
      previous.map((line) =>
        line.uid === uid ? { ...line, qty: Math.max(1, Math.min(99, qty)) } : line,
      ),
    );
  }, []);

  const removeLine = useCallback((uid: string) => {
    setCart((previous) => previous.filter((line) => line.uid !== uid));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
    );
  }, []);

  const openPreview = useCallback(() => {
    if (cart.length === 0) {
      showToast('购物车为空，请先选购菜品');
      return;
    }
    for (const line of cart) {
      const dish = dishMap.get(line.dishId);
      if (!dish) {
        showToast(`「${line.name}」已下架，请从购物车移除`);
        setSheet('cart');
        return;
      }
      if (dish.soldOut) {
        showToast(`「${line.name}」已售罄，请移除后再提交`);
        setSheet('cart');
        return;
      }
    }
    setSheet('preview');
  }, [cart, dishMap, showToast]);

  const submitOrder = useCallback(async () => {
    if (submitting || cart.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      const remark = [...tags, note.trim()].filter(Boolean).join('；').slice(0, 200);
      const order = await publicApi.createOrder({
        tableToken,
        peopleCount: people,
        remark,
        items: cart.map((line) => ({
          dishId: line.dishId,
          qty: line.qty,
          specOptionIds: line.specOptionIds,
          addons: line.addons.map((addon) => ({ addonId: addon.addonId, qty: addon.qty })),
        })),
      });
      setCart([]);
      setNote('');
      setTags([]);
      setSuccessOrder(order);
      setSheet('success');
      showToast('下单成功，请前往前台结账');
      void mutateOrders();
    } catch (submitError) {
      showToast(submitError instanceof Error ? submitError.message : '下单失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [cart, mutateOrders, note, people, showToast, submitting, tableToken, tags]);

  const closeSpec = useCallback(() => {
    const backToCart = specOrigin === 'cart';
    setSpecDish(null);
    setSpecLine(null);
    setSheet(backToCart ? 'cart' : null);
  }, [specOrigin]);

  if (!tableToken) {
    return <ScanPrompt />;
  }

  if (isLoading) {
    return (
      <div className="phone">
        <div className="entry">
          <div className="entry-top">
            <div className="entry-logo">
              <span style={{ fontSize: 24, fontWeight: 900 }}>希</span>
            </div>
            <div className="entry-shop">DineBox 扫码点餐</div>
            <div className="entry-scan">正在加载门店与菜单…</div>
          </div>
          <div className="entry-card" style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
            请稍候
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <ScanPrompt
        message={error instanceof Error ? error.message : '加载失败，请检查网络后重试。'}
        onRetry={() => void mutate()}
      />
    );
  }

  return (
    <div className="phone">
      {!entered ? (
        <EntryView
          shop={data.shop}
          table={data.table}
          people={people}
          onPeopleChange={setPeople}
          onStart={() => setEntered(true)}
        />
      ) : (
        <div className="main-body show">
          {view === 'menu' ? (
            <MenuView
              shop={data.shop}
              table={data.table}
              categories={data.categories}
              people={people}
              cart={cart}
              onAddDish={addDish}
              onOpenCart={() => setSheet('cart')}
              onOpenPreview={openPreview}
              onShowOrders={() => {
                setView('orders');
                void mutateOrders();
              }}
            />
          ) : (
            <OrdersView
              orders={orders}
              loading={ordersLoading}
              error={ordersError instanceof Error ? ordersError : undefined}
              onBack={() => setView('menu')}
              onOpen={(order) => {
                setDetailOrder(order);
                setSheet('detail');
              }}
              onRefresh={() => void mutateOrders()}
            />
          )}
        </div>
      )}

      <CartSheet
        open={sheet === 'cart'}
        lines={cart}
        note={note}
        tags={tags}
        onNote={setNote}
        onToggleTag={toggleTag}
        onQty={changeQty}
        onRemove={removeLine}
        onEditSpec={editSpec}
        onClear={() => setSheet('confirm')}
        onPreview={openPreview}
        onClose={() => setSheet(null)}
      />

      <SpecSheet
        open={sheet === 'spec'}
        dish={specDish}
        line={specLine}
        onClose={closeSpec}
        onConfirm={confirmSpec}
      />

      <PreviewSheet
        open={sheet === 'preview'}
        lines={cart}
        note={note}
        tags={tags}
        submitting={submitting}
        onBack={() => setSheet('cart')}
        onSubmit={() => void submitOrder()}
      />

      <ConfirmSheet
        open={sheet === 'confirm'}
        title="清空购物车？"
        text="清空后将移除所有已选菜品，整单备注也会一并清空。"
        okText="清空"
        danger
        onOk={() => {
          setCart([]);
          setNote('');
          setTags([]);
          setSheet('cart');
          showToast('购物车已清空');
        }}
        onClose={() => setSheet('cart')}
      />

      <SuccessSheet
        open={sheet === 'success'}
        order={successOrder}
        onViewOrders={() => {
          setSheet(null);
          setView('orders');
          void mutateOrders();
        }}
        onContinue={() => {
          setSheet(null);
          setView('menu');
        }}
        onToast={showToast}
      />

      <OrderDetailSheet
        open={sheet === 'detail'}
        order={detailOrder}
        onClose={() => setSheet(null)}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
