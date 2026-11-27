import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

let sequence = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  items: [],
  push: (message, type = 'info') => {
    sequence += 1;
    const id = sequence;
    set((state) => ({ items: [...state.items.slice(-2), { id, message, type }] }));
    window.setTimeout(() => get().dismiss(id), 2800);
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

/** 非 React 场景直接调用。 */
export function toast(message: string, type: ToastType = 'info'): void {
  useToastStore.getState().push(message, type);
}

/** 组件内调用。 */
export function useToast(): { toast: (message: string, type?: ToastType) => void } {
  return { toast };
}

export function ToastViewport() {
  const items = useToastStore((state) => state.items);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 18,
        left: 0,
        right: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
        padding: '0 16px',
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '90vw',
            background: 'rgba(23,24,28,.94)',
            color: '#fff',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 13,
            boxShadow: '0 12px 36px rgba(0,0,0,.22)',
            animation: 'fadeUp .22s var(--ease)',
          }}
        >
          {item.type === 'success' ? (
            <CheckCircle2 size={16} color="#4ade80" />
          ) : item.type === 'error' ? (
            <XCircle size={16} color="#ff7b72" />
          ) : (
            <Info size={16} color="#7cc4ff" />
          )}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
