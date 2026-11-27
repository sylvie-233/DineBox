import { Suspense } from 'react';

import { OrderApp } from '@/components/order-app';

function LoadingShell() {
  return (
    <div className="phone">
      <div className="entry">
        <div className="entry-top">
          <div className="entry-logo">
            <span className="text-[26px] font-black">希</span>
          </div>
          <div className="entry-shop">DineBox 扫码点餐</div>
          <div className="entry-scan">正在加载菜单…</div>
        </div>
        <div className="entry-card" style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
          请稍候
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <OrderApp />
    </Suspense>
  );
}
