import { ChevronLeft, ChevronRight } from 'lucide-react';

import { buildPageItems } from '@dinebox/ui';

/** 通用分页条：页码窗口 + 总数信息，与原型 `.pager` 样式一致。 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
  unit = '条',
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  unit?: string;
}) {
  const pages = buildPageItems(page, totalPages);
  return (
    <div className="pager">
      <span className="pg-info">
        共 <b>{total}</b> {unit} · 第 <b>{page}</b> / {Math.max(1, totalPages)} 页
        <span style={{ marginLeft: 6 }}>（每页 {pageSize}）</span>
      </span>
      {totalPages > 1 ? (
        <div className="pg-btns">
          <button
            type="button"
            className="pg-btn"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label="上一页"
          >
            <ChevronLeft size={13} />
          </button>
          {pages.map((value, index) =>
            value === '...' ? (
              <span key={`e-${index}`} className="pg-dots">
                …
              </span>
            ) : (
              <button
                key={value}
                type="button"
                className={`pg-btn ${value === page ? 'active' : ''}`}
                onClick={() => onChange(value)}
              >
                {value}
              </button>
            ),
          )}
          <button
            type="button"
            className="pg-btn"
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
            aria-label="下一页"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
