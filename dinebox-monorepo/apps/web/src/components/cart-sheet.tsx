'use client';

import { ShoppingCart, X } from 'lucide-react';

import { formatMoney } from '@dinebox/utils';

import {
  addonTextOf,
  cartLineTotal,
  cartTotal,
  QUICK_NOTES,
  type CartLine,
} from '@/lib/cart';
import { Sheet } from './sheet';

/** 购物车抽屉：改数量、删除、改规格、整单备注与去下单。 */
export function CartSheet({
  open,
  lines,
  note,
  tags,
  onNote,
  onToggleTag,
  onQty,
  onRemove,
  onEditSpec,
  onClear,
  onPreview,
  onClose,
}: {
  open: boolean;
  lines: CartLine[];
  note: string;
  tags: string[];
  onNote: (value: string) => void;
  onToggleTag: (tag: string) => void;
  onQty: (uid: string, qty: number) => void;
  onRemove: (uid: string) => void;
  onEditSpec: (line: CartLine) => void;
  onClear: () => void;
  onPreview: () => void;
  onClose: () => void;
}) {
  const total = cartTotal(lines);

  return (
    <Sheet
      open={open}
      title={
        <>
          购物车
          <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>
            （点击规格可修改）
          </span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <div className="price" style={{ fontSize: 20 }}>
            <span className="yen">¥</span>
            {formatMoney(total)}
          </div>
          <button type="button" className="btn-plain" onClick={onClear} disabled={lines.length === 0}>
            清空
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={lines.length === 0}
            onClick={onPreview}
          >
            选好了，去下单
          </button>
        </>
      }
    >
      {lines.length === 0 ? (
        <div className="empty-cart">
          <ShoppingCart size={44} />
          <div>购物车空空如也</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>先去挑选几道喜欢的菜吧</div>
        </div>
      ) : (
        <div className="cart-list">
          {lines.map((line) => {
            const addonText = addonTextOf(line.addons);
            return (
              <div className="cart-row" key={line.uid}>
                <div className="cart-info">
                  <div className="cart-name">{line.name}</div>
                  <button
                    type="button"
                    className="cart-spec editable"
                    onClick={() => onEditSpec(line)}
                  >
                    {line.specText || '默认'}
                    {addonText ? ` · ${addonText}` : ''}
                  </button>
                </div>
                <div className="cart-right">
                  <div className="cart-price">
                    <span className="yen">¥</span>
                    {formatMoney(cartLineTotal(line))}
                  </div>
                  <div className="stepper" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className={line.qty <= 1 ? 'minus-off' : ''}
                      onClick={() => onQty(line.uid, Math.max(1, line.qty - 1))}
                    >
                      −
                    </button>
                    <div className="num">{line.qty}</div>
                    <button type="button" onClick={() => onQty(line.uid, line.qty + 1)}>
                      ＋
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="cart-del"
                  aria-label={`删除 ${line.name}`}
                  onClick={() => onRemove(line.uid)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="note-block">
        <div className="note-label">
          <span>整单备注</span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>选填</span>
        </div>
        <div className="quick-tags">
          {QUICK_NOTES.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`quick-tag ${tags.includes(tag) ? 'on' : ''}`}
              onClick={() => onToggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <textarea
          className="note-input"
          value={note}
          maxLength={160}
          placeholder="如：少辣、不要葱、儿童餐具 ×1 …"
          onChange={(event) => onNote(event.target.value)}
        />
        <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>
          {note.length}/160
        </div>
      </div>
    </Sheet>
  );
}
