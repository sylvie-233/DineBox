'use client';

import type { PublicOrderListItem } from '@dinebox/types';
import { formatDateTime, formatMoney } from '@dinebox/utils';

import { addonTextOf } from '@/lib/cart';
import { Sheet } from './sheet';

function statusText(order: PublicOrderListItem): string {
  if (order.status === 'SETTLED') return '已结清';
  if (order.status === 'CANCELLED') return '已取消';
  return '待结算';
}

/** 顾客端订单详情：含退菜标记、规格/加料与金额。 */
export function OrderDetailSheet({
  open,
  order,
  onClose,
}: {
  open: boolean;
  order: PublicOrderListItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      title="订单详情"
      onClose={onClose}
      footer={
        <>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--ink-2)' }}>
            {order?.status === 'PENDING'
              ? '用餐完毕请到前台报桌号结账'
              : '感谢光临，欢迎再次点餐'}
          </div>
          <button type="button" className="btn-primary" style={{ flex: '0 0 auto', padding: '0 22px' }} onClick={onClose}>
            返回列表
          </button>
        </>
      }
    >
      {order ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 12,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }} className="num">
                {order.orderNo}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
                {formatDateTime(order.createdAt)} · {order.peopleCount} 人
              </div>
            </div>
            <span
              className={`status-chip ${
                order.status === 'SETTLED' ? 'paid' : order.status === 'CANCELLED' ? 'cancel' : 'pending'
              }`}
            >
              {statusText(order)}
            </span>
          </div>

          <div style={{ padding: '8px 0' }}>
            {order.items.map((item) => {
              const addonText = addonTextOf(
                item.addons.map((addon) => ({
                  addonId: addon.addonId ?? 0,
                  name: addon.name,
                  price: addon.price,
                  qty: addon.qty,
                })),
              );
              return (
                <div
                  className={`cart-row ${item.status === 'RETURNED' ? 'returned-row' : ''}`}
                  key={item.id}
                >
                  <div className="cart-info">
                    <div className="cart-name">
                      {item.dishName}
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 6 }}>
                        ×{item.qty}
                      </span>
                      {item.status === 'RETURNED' ? <span className="returned-tag">已退</span> : null}
                    </div>
                    {item.specText || addonText ? (
                      <div className="cart-spec" style={{ cursor: 'default' }}>
                        {[item.specText, addonText].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                    {item.status === 'RETURNED' && item.returnReason ? (
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                        退菜原因：{item.returnReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="cart-price">
                    <span className="yen">¥</span>
                    {formatMoney(item.itemAmount)}
                  </div>
                </div>
              );
            })}
          </div>

          {order.remark ? (
            <div className="note-block" style={{ marginTop: 4 }}>
              <div className="note-label">
                <span>整单备注</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>{order.remark}</div>
            </div>
          ) : null}

          <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', padding: '4px 0' }}>
              <span>菜品合计</span>
              <span className="num">¥{formatMoney(order.totalAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {order.status === 'SETTLED' ? '实收金额' : '待结金额'}
              </span>
              <span className="price" style={{ fontSize: 22 }}>
                <span className="yen">¥</span>
                {formatMoney(order.status === 'SETTLED' ? order.payableAmount : order.totalAmount)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="orders-empty">订单不存在</div>
      )}
    </Sheet>
  );
}
