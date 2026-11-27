'use client';

import type { Order } from '@dinebox/types';

import { Sheet } from './sheet';

/** 下单成功弹窗：展示订单号并提示前往前台结账。 */
export function SuccessSheet({
  open,
  order,
  onViewOrders,
  onContinue,
  onToast,
}: {
  open: boolean;
  order: Order | null;
  onViewOrders: () => void;
  onContinue: () => void;
  onToast: (message: string) => void;
}) {
  const copy = async (): Promise<void> => {
    if (!order) {
      return;
    }
    try {
      await navigator.clipboard.writeText(order.orderNo);
      onToast('订单号已复制');
    } catch {
      onToast(order.orderNo);
    }
  };

  return (
    <Sheet
      open={open}
      title="订单已提交"
      onClose={onContinue}
      footer={
        <>
          <button type="button" className="btn-plain" onClick={onViewOrders}>
            查看订单
          </button>
          <button type="button" className="btn-primary" onClick={onContinue}>
            继续点餐
          </button>
        </>
      }
    >
      <div className="success-card" style={{ paddingTop: 8 }}>
        <svg className="success-icon" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" />
          <path d="M15 27l8 8 15-16" />
        </svg>
        <div className="success-title">下单成功</div>
        <div className="success-sub">
          后厨已收到您的小票，请耐心等待出餐
          <br />
          用餐完毕请<b>前往前台报桌号结账</b>（本单暂不支持线上支付）
        </div>
        <div className="order-no-box">
          <span className="label">订单号</span>
          <span className="no">{order?.orderNo ?? '—'}</span>
          <button type="button" className="copy-btn" onClick={copy}>
            复制
          </button>
        </div>
        <div className="success-steps">
          <div className="step">
            <div className="dot">1</div>
            <div className="txt">后厨制作</div>
          </div>
          <div className="step">
            <div className="dot">2</div>
            <div className="txt">喊号上菜</div>
          </div>
          <div className="step">
            <div className="dot">3</div>
            <div className="txt">前台结账</div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
