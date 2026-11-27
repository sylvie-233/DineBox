import type { ReactNode } from 'react';

import { AuthSync } from './auth';
import { ConfirmViewport } from './store/confirm';
import { PromptViewport } from './store/prompt';
import { ToastViewport } from './store/toast';

/** 应用根 Provider：会话同步 + 全局状态渲染层（Zustand 无需 Provider）。 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthSync />
      {children}
      <ToastViewport />
      <ConfirmViewport />
      <PromptViewport />
    </>
  );
}
