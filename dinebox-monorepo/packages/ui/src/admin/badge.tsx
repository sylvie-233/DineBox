/**
 * 后台状态徽章：外观由全局类 `.badge` / `.badge-{tone}` 决定。
 */
import type { ReactNode } from 'react';

export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'brand' | 'dark';

/** 状态徽章。 */
export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
