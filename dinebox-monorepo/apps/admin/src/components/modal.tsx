'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** 后台弹窗：与原型 `.modal-mask` / `.modal` 样式一致，支持 Esc 关闭与滚动锁定。 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 460,
  closable = true,
  zIndex,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  closable?: boolean;
  zIndex?: number;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && closable) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closable, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="modal-mask show"
      style={zIndex ? { zIndex } : undefined}
      onClick={closable ? onClose : undefined}
      role="presentation"
    >
      <div
        className="modal"
        style={{ width, maxHeight: '88vh' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <div className="t">{title}</div>
          {closable ? (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
