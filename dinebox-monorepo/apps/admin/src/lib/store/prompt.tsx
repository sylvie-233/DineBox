import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

import { Modal } from '@/components/modal';

export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  okText?: string;
  /** 返回错误文案则阻止提交。 */
  validate?: (value: string) => string | null;
}

interface PromptState {
  options: PromptOptions | null;
  resolve: ((value: string | null) => void) | null;
  prompt: (options: PromptOptions) => Promise<string | null>;
  settle: (value: string | null) => void;
}

export const usePromptStore = create<PromptState>()((set, get) => ({
  options: null,
  resolve: null,
  prompt: (options) =>
    new Promise<string | null>((resolve) => {
      get().resolve?.(null);
      set({ options, resolve });
    }),
  settle: (value) => {
    get().resolve?.(value);
    set({ options: null, resolve: null });
  },
}));

/** Promise 形式的输入弹窗。 */
export function usePrompt(): { prompt: (options: PromptOptions) => Promise<string | null> } {
  const prompt = usePromptStore((state) => state.prompt);
  return { prompt };
}

export function PromptViewport() {
  const options = usePromptStore((state) => state.options);
  const settle = usePromptStore((state) => state.settle);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (options) {
      setValue(options.defaultValue ?? '');
      setError('');
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 40);
    }
  }, [options]);

  const submit = (): void => {
    const text = value.trim();
    if (!text) {
      setError('请输入内容');
      return;
    }
    const message = options?.validate?.(text) ?? null;
    if (message) {
      setError(message);
      return;
    }
    settle(text);
  };

  return (
    <Modal
      open={Boolean(options)}
      title={options?.title ?? '输入'}
      onClose={() => settle(null)}
      width={380}
      footer={
        <>
          <button type="button" className="btn" onClick={() => settle(null)}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={submit}>
            {options?.okText ?? '确定'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{options?.label ?? '请输入'}</label>
        <input
          ref={inputRef}
          value={value}
          maxLength={64}
          placeholder={options?.placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submit();
            }
          }}
        />
      </div>
      <div className={`form-err ${error ? 'show' : ''}`}>{error}</div>
    </Modal>
  );
}
