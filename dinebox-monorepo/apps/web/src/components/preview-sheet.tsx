'use client';

import { formatMoney } from '@dinebox/utils';

import {
  addonTextOf,
  cartCount,
  cartLineTotal,
  cartTotal,
  type CartLine,
} from '@/lib/cart';
import { Sheet } from './sheet';

/** 订单确认弹层：明细、备注与合计，提交后生成待结算订单。 */
export function PreviewSheet({
  open,
  lines,
  note,
  tags,
  submitting,
  onBack,
  onSubmit,
}: {
  open: boolean;
  lines: CartLine[];
  note: string;
  tags: string[];
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const count = cartCount(lines);
  const total = cartTotal(lines);
  const remark = [...tags, note.trim()].filter(Boolean).join('；');

  return (
    <Sheet
      open={open}
      title="订单确认"
      onClose={onBack}
      footer={
        <>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
              共 <b>{count}</b> 件 · 合计
            </div>
            <div className="price" style={{ fontSize: 22 }}>
              <span className="yen">¥</span>
              {formatMoney(total)}
            </div>
          </div>
          <button
            type="button"
            className="btn-plain"
            style={{ flex: '0 0 auto', padding: '0 16px' }}
            onClick={onBack}
          >
            返回
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || lines.length === 0}
            onClick={onSubmit}
          >
            {submitting ? '提交中…' : '提交订单'}
          </button>
        </>
      }
    >
      <div className="cart-list">
        {lines.map((line) => {
          const addonText = addonTextOf(line.addons);
          return (
            <div className="cart-row" key={line.uid}>
              <div className="cart-info">
                <div className="cart-name">
                  {line.name}
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 6 }}>
                    ×{line.qty}
                  </span>
                </div>
                {line.specText || addonText ? (
                  <div className="cart-spec" style={{ cursor: 'default' }}>
                    {[line.specText, addonText].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
              </div>
              <div className="cart-price">
                <span className="yen">¥</span>
                {formatMoney(cartLineTotal(line))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="note-block">
        <div className="note-label">
          <span>整单备注</span>
        </div>
        <div style={{ fontSize: 12, color: remark ? 'var(--ink)' : 'var(--ink-3)', lineHeight: 1.7 }}>
          {remark || '无备注'}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.8, marginTop: 12 }}>
        提交后后厨将收到小票，本单为待结算订单；用餐完毕请到前台报桌号结账，暂不支持线上支付。
      </div>
    </Sheet>
  );
}
