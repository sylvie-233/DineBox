/** 首屏 / 会话校验加载页。 */
export function LoadingScreen({ text = '正在加载…' }: { text?: string }) {
  return (
    <div className="loading-screen">
      <div className="loading-logo">希</div>
      <span>{text}</span>
    </div>
  );
}

/** 列表空态。 */
export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="page-empty">
      <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>{title}</div>
      {text ? <div>{text}</div> : null}
    </div>
  );
}

/** 行内加载提示。 */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          style={{
            height: 44,
            marginBottom: 8,
            borderRadius: 10,
            background: 'var(--primary-weak)',
            opacity: 0.75,
            animation: 'pulse 1.2s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}
