import useSWR from 'swr';

import type { Order } from '@dinebox/types';
import { ORDER_STATUS_LABELS, PAY_METHOD_LABELS } from '@dinebox/types';
import { formatMoney, shortDateTime } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';

/** 收银台只读订单详情（用于检索已结清 / 已取消订单）。 */
export function OrderDetailModal({
  orderId,
  onClose,
}: {
  orderId: number | null;
  onClose: () => void;
}) {
  const { data: order } = useSWR<Order>(
    orderId ? ['/cashier/orders', orderId] : null,
    () => adminFetch<Order>(`/cashier/orders/${orderId}`),
    { revalidateOnFocus: false },
  );

  return (
    <Modal
      open={orderId !== null}
      title="订单详情"
      onClose={onClose}
      width={480}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      }
    >
      {!order ? (
        <LoadingRows rows={4} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>
                {order.orderNo}
              </div>
              <div className="mini-muted" style={{ marginTop: 3 }}>
                {shortDateTime(order.createdAt)} · {order.tableName} · {order.peopleCount} 人
              </div>
            </div>
            <span
              className={`tag ${
                order.status === 'SETTLED'
                  ? 'ok'
                  : order.status === 'CANCELLED'
                    ? 'cancel'
                    : 'pending'
              }`}
            >
              {order.status === 'PENDING' && order.hungFlag
                ? '挂单'
                : ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            {order.items.map((item) => (
              <div
                className={`oi-row ${item.status === 'RETURNED' ? 'returned' : ''}`}
                key={item.id}
              >
                <div className="oi-name">
                  {item.dishName}
                  <span className="spec">
                    {[item.specText, item.addons.map((a) => `${a.name}×${a.qty}`).join('、')]
                      .filter(Boolean)
                      .join(' · ') || '默认规格'}
                    {item.status === 'RETURNED'
                      ? ` · 已退${item.returnReason ? `（${item.returnReason}）` : ''}`
                      : ''}
                  </span>
                </div>
                <span className="oi-qty">×{item.qty}</span>
                <span className="oi-price num">¥{formatMoney(item.itemAmount)}</span>
              </div>
            ))}
          </div>
          {order.remark ? <div className="info-note">备注：{order.remark}</div> : null}
          <div style={{ marginTop: 12 }}>
            <div className="settle-line">
              <span>菜品合计（退菜已扣）</span>
              <span className="num">¥{formatMoney(order.totalAmount)}</span>
            </div>
            {order.status === 'SETTLED' ? (
              <>
                <div className="settle-line">
                  <span>抹零</span>
                  <span className="num">-¥{formatMoney(order.roundOffAmount)}</span>
                </div>
                <div className="settle-total" style={{ paddingTop: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>实收金额</span>
                  <span className="money num" style={{ fontSize: 22 }}>
                    ¥{formatMoney(order.payableAmount)}
                  </span>
                </div>
                <div className="settle-line" style={{ marginTop: 6 }}>
                  <span>结算方式 / 时间</span>
                  <span>
                    {order.payMethod ? PAY_METHOD_LABELS[order.payMethod] : '—'} ·{' '}
                    {shortDateTime(order.settledAt)}
                  </span>
                </div>
              </>
            ) : (
              <div className="settle-line">
                <span>应收金额</span>
                <span className="num" style={{ color: 'var(--price)', fontWeight: 700 }}>
                  ¥{formatMoney(order.totalAmount)}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
