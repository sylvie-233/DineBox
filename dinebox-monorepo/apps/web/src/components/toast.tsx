'use client';

/** 全局轻提示（与原型统一样式）。 */
export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">
      {message ?? ''}
    </div>
  );
}
