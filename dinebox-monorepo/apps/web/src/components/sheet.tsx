'use client';

import type { ReactNode } from 'react';

/** 底部弹层：遮罩 + 上滑面板，与原型 `.mask` / `.sheet` 样式一致。 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  bodyPadding = true,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bodyPadding?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <>
      <div className="mask show" onClick={onClose} role="presentation" />
      <div className="sheet show" role="dialog" aria-modal="true">
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button type="button" className="close-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="sheet-body" style={bodyPadding ? undefined : { padding: 0 }}>
          {children}
        </div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </>
  );
}
