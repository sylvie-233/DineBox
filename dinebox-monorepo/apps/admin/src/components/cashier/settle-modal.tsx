import { useState } from 'react';

import type { Order, PayMethod, ShopConfig } from '@dinebox/types';
import { PAY_METHOD_LABELS } from '@dinebox/types';
import { calcRoundOff, formatMoney, round2 } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { useToast } from '@/lib/store/toast';
import { Modal } from '@/components/modal';

const METHODS: PayMethod[] = ['CASH', 'WECHAT_QR', 'ALIPAY_QR', 'OTHER'];

const RULE_LABELS: Record<ShopConfig['roundOffRule'], string> = {
  ANGLE: '抹到元',
  ANGLE5: '抹到 5 角',
  NONE: '不抹零',
};

/** 结算确认：线下收款后手动点击，系统不校验支付结果。 */
export function SettleModal({
  order,
  shop,
  initialMethod = 'CASH',
  initialRoundOff,
  onClose,
  onSettled,
}: {
  order: Order;
  shop: ShopConfig;
  initialMethod?: PayMethod;
  initialRoundOff?: boolean;
  onClose: () => void;
  onSettled: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod] = useState<PayMethod>(initialMethod);
  const [roundOff, setRoundOff] = useState(initialRoundOff ?? shop.roundOffEnabled);
  const [saving, setSaving] = useState(false);

  const off = roundOff && shop.roundOffRule !== 'NONE'
    ? calcRoundOff(order.totalAmount, shop.roundOffRule)
    : 0;
  const payable = round2(order.totalAmount - off);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      await adminFetch(`/cashier/orders/${order.id}/settle`, {
        method: 'POST',
        body: { payMethod: method, roundOff },
      });
      toast('结算成功，已自动下发结账单', 'success');
      onSettled();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : '结算失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="确认结算"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? '结算中…' : '已收款，确认结算'}
          </button>
        </>
      }
    >
      <div className="settle-line">
        <span>订单号</span>
        <span className="num">{order.orderNo}</span>
      </div>
      <div className="settle-line">
        <span>桌号</span>
        <span>{order.tableName}</span>
      </div>
      <div className="settle-line">
        <span>菜品合计</span>
        <span className="num">¥{formatMoney(order.totalAmount)}</span>
      </div>
      <div className="settle-line">
        <span>抹零（{RULE_LABELS[shop.roundOffRule]}）</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={roundOff}
            disabled={!shop.roundOffEnabled || shop.roundOffRule === 'NONE'}
            onChange={(event) => setRoundOff(event.target.checked)}
          />
          <span className="track" />
        </label>
      </div>
      <div className="settle-line">
        <span>优惠抹零</span>
        <span className="num">-¥{formatMoney(off)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '10px 0 6px' }}>
        结算方式（线下收款确认后点击结算）
      </div>
      <div className="pay-methods">
        {METHODS.map((item) => (
          <button
            key={item}
            type="button"
            className={`pm ${method === item ? 'active' : ''}`}
            onClick={() => setMethod(item)}
          >
            {PAY_METHOD_LABELS[item]}
          </button>
        ))}
      </div>
      <div className="settle-total">
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>应收金额</span>
        <span className="money num">
          <span className="yen">¥</span>
          {formatMoney(payable)}
        </span>
      </div>
      <div className="info-note">
        请先<b>线下确认已收款</b>（现金当面清点 / 扫静态码到账），系统不校验支付结果。
        确认后订单标记为已结清，并自动打印顾客结账单。
      </div>
    </Modal>
  );
}
