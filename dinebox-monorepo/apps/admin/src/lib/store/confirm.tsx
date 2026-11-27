import { AlertTriangle } from 'lucide-react';
import { create } from 'zustand';

import { Modal } from '@/components/modal';

export interface ConfirmOptions {
  title: string;
  text?: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState {
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  settle: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  options: null,
  resolve: null,
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false);
      set({ options, resolve });
    }),
  settle: (value) => {
    get().resolve?.(value);
    set({ options: null, resolve: null });
  },
}));

/** Promise 形式的二次确认，无需 Provider 包裹。 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean> } {
  const confirm = useConfirmStore((state) => state.confirm);
  return { confirm };
}

export function ConfirmViewport() {
  const options = useConfirmStore((state) => state.options);
  const settle = useConfirmStore((state) => state.settle);

  return (
    <Modal
      open={Boolean(options)}
      title={options?.title ?? '确认操作'}
      onClose={() => settle(false)}
      width={400}
      footer={
        <>
          <button type="button" className="btn" onClick={() => settle(false)}>
            {options?.cancelText ?? '取消'}
          </button>
          <button
            type="button"
            className={`btn ${options?.danger === false ? 'primary' : 'danger'}`}
            onClick={() => settle(true)}
          >
            {options?.okText ?? '确定'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: options?.danger === false ? 'var(--primary-weak)' : '#fceaea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AlertTriangle
            size={19}
            color={options?.danger === false ? 'var(--ink-2)' : 'var(--price)'}
          />
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.8,
            color: 'var(--ink-2)',
            whiteSpace: 'pre-line',
          }}
        >
          {options?.text ?? '此操作不可撤销，请确认后再执行。'}
        </p>
      </div>
    </Modal>
  );
}
