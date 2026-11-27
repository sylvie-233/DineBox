import { useMemo, useState } from 'react';

import type { Order } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { useToast } from '@/lib/store/toast';
import { Modal } from '@/components/modal';

const QUICK_REASONS = ['顾客误点', '出餐太慢', '口感问题', '上错菜品', '食材售罄'];

/** 单品退菜：勾选明细、快捷原因、金额合计。 */
export function ReturnModal({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const normalItems = useMemo(
    () => order.items.filter((item) => item.status === 'NORMAL'),
    [order.items],
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = normalItems
    .filter((item) => selected.includes(item.id))
    .reduce((sum, item) => sum + item.itemAmount, 0);

  const toggle = (id: number): void => {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  };

  const submit = async (): Promise<void> => {
    if (selected.length === 0) {
      toast('请选择要退的菜品', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminFetch(`/cashier/orders/${order.id}/return`, {
        method: 'POST',
        body: { itemIds: selected, reason: reason.trim() },
      });
      toast('退菜成功，订单合计已重新计算', 'success');
      onSaved();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : '退菜失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`单品退菜 · ${order.orderNo}`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={saving || selected.length === 0}
            onClick={() => void submit()}
          >
            {saving ? '提交中…' : `确认退菜（${selected.length} 项）`}
          </button>
        </>
      }
    >
      {normalItems.length === 0 ? (
        <div className="page-empty">没有可退的正常菜品</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
            选择要退的菜品（可多选）；已退菜品不能重复退。
          </div>
          <div className="opt-chips">
            {normalItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`opt ${selected.includes(item.id) ? 'active' : ''}`}
                style={{ height: 'auto', padding: '8px 12px', textAlign: 'left' }}
                onClick={() => toggle(item.id)}
              >
                <div>
                  {item.dishName} ×{item.qty}
                </div>
                <div style={{ fontSize: 10, opacity: 0.72, marginTop: 2 }}>
                  {item.specText || '默认规格'} · ¥{formatMoney(item.itemAmount)}
                </div>
              </button>
            ))}
          </div>
          <div className="settle-line" style={{ padding: '8px 0', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>退菜金额合计</span>
            <span className="num" style={{ fontWeight: 700, color: 'var(--price)' }}>
              ¥{formatMoney(amount)}
            </span>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label>退菜原因（选填）</label>
            <div className="opt-chips" style={{ marginBottom: 8 }}>
              {QUICK_REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`opt ${reason === item ? 'active' : ''}`}
                  onClick={() => setReason(reason === item ? '' : item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              maxLength={100}
              value={reason}
              placeholder="如：顾客不吃辣 / 上错菜 / 口感问题"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
