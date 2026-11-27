'use client';

import { ChevronLeft, ClipboardList, RefreshCw } from 'lucide-react';

import type { PublicOrderListItem } from '@dinebox/types';
import { formatMoney, shortDateTime } from '@dinebox/utils';

function statusLabel(order: PublicOrderListItem): string {
  if (order.status === 'SETTLED') return '已结清';
  if (order.status === 'CANCELLED') return '已取消';
  return '待结算';
}

function statusClass(order: PublicOrderListItem): string {
  if (order.status === 'SETTLED') return 'paid';
  if (order.status === 'CANCELLED') return 'cancel';
  return 'pending';
}

/** 我的订单列表（按桌台维度，含未结与近 7 天订单）。 */
export function OrdersView({
  orders,
  loading,
  error,
  onBack,
  onOpen,
  onRefresh,
}: {
  orders: PublicOrderListItem[] | undefined;
  loading: boolean;
  error: Error | undefined;
  onBack: () => void;
  onOpen: (order: PublicOrderListItem) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="view show" id="ordersView">
      <div className="topbar">
        <div className="shop-row">
          <button type="button" className="back-btn" onClick={onBack} aria-label="返回菜单">
            <ChevronLeft size={18} />
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>我的订单</div>
          <button
            type="button"
            className="top-order-btn"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={onRefresh}
          >
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      <div className="orders-body">
        {loading ? (
          <div className="orders-empty">正在加载订单…</div>
        ) : error ? (
          <div className="orders-empty">
            <ClipboardList size={44} />
            <div>{error.message}</div>
            <button type="button" className="top-order-btn" style={{ marginTop: 14 }} onClick={onRefresh}>
              重新加载
            </button>
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="orders-empty">
            <ClipboardList size={44} />
            <div>还没有订单</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>返回菜单挑选喜欢的菜品吧</div>
          </div>
        ) : (
          orders.map((order) => {
            const normalItems = order.items.filter((item) => item.status === 'NORMAL');
            const summary = normalItems
              .slice(0, 2)
              .map((item) => `${item.dishName}×${item.qty}`)
              .join('、');
            return (
              <button
                type="button"
                className="order-card"
                key={order.id}
                onClick={() => onOpen(order)}
              >
                <div className="order-card-head">
                  <div>
                    <div className="order-card-no">{order.orderNo}</div>
                    <div className="order-card-time">
                      {shortDateTime(order.createdAt)} · {order.peopleCount} 人
                    </div>
                  </div>
                  <span className={`status-chip ${statusClass(order)}`}>{statusLabel(order)}</span>
                </div>
                <div className="order-card-items">
                  {summary || '已无正常菜品'}
                  {order.itemCount > normalItems.slice(0, 2).reduce((sum, item) => sum + item.qty, 0)
                    ? ` 等 ${order.itemCount} 件`
                    : ''}
                </div>
                <div className="order-card-foot">
                  <span className="order-card-more">查看详情 ›</span>
                  <span className="price" style={{ fontSize: 16 }}>
                    <span className="yen">¥</span>
                    {formatMoney(order.status === 'SETTLED' ? order.payableAmount : order.totalAmount)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
