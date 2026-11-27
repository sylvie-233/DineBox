'use client';

import { Sheet } from './sheet';

/** 通用确认弹层（清空购物车等）。 */
export function ConfirmSheet({
  open,
  title,
  text,
  okText = '确认',
  danger = false,
  onOk,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  okText?: string;
  danger?: boolean;
  onOk: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-plain" style={{ flex: 1 }} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, background: danger ? 'var(--price)' : undefined }}
            onClick={onOk}
          >
            {okText}
          </button>
        </>
      }
    >
      <div
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.8,
          padding: '4px 0 10px',
        }}
      >
        {text}
      </div>
    </Sheet>
  );
}
