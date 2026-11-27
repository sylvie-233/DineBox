import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, RotateCcw } from 'lucide-react';

import type {
  AuditLogRow,
  AuditOptions,
  AuditPage as AuditPageResult,
  AuditQuery,
} from '@dinebox/types';
import { addDays, shortDateTime, toDateString, todayString } from '@dinebox/utils';

import { adminFetch, buildQuery } from '@/lib/api';
import { useConfirm } from '@/lib/store/confirm';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { Pagination } from '@/components/pagination';

const PAGE_SIZE = 10;

function actionTone(action: string): string {
  if (action.startsWith('ORDER_SETTLE')) return 'badge-green';
  if (action.startsWith('ITEM_RETURN') || action.startsWith('ORDER_CANCEL') || action.startsWith('AUDIT_DELETE')) {
    return 'badge-red';
  }
  if (action.startsWith('ORDER_HUNG') || action.startsWith('ORDER_RESUME')) return 'badge-amber';
  if (action.startsWith('LOGIN') || action.startsWith('LOGOUT') || action.startsWith('PRINTER')) {
    return 'badge-blue';
  }
  return 'badge-gray';
}

function DetailRows({ log }: { log: AuditLogRow }) {
  const rows: Array<[string, string]> = [
    ['日志编号', `#${log.id}`],
    ['操作时间', log.createdAt],
    ['操作人', log.username || '顾客/系统'],
    ['操作类型', log.actionLabel],
    ['操作对象', log.target || '—'],
    ['来源 IP', log.ip || '—'],
    ['详情', log.detail || '—'],
  ];
  return (
    <div>
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: 'flex',
            gap: 12,
            padding: '8px 0',
            borderBottom: '1px dashed var(--line)',
            fontSize: 13,
          }}
        >
          <span style={{ width: 76, flexShrink: 0, color: 'var(--ink-3)', fontSize: 12 }}>
            {label}
          </span>
          <span style={{ flex: 1, wordBreak: 'break-all', lineHeight: 1.7 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** 操作日志：全量留痕查询、详情与删除（仅管理员）。 */
export function AuditPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [kw, setKw] = useState('');
  const [range, setRange] = useState<'all' | 'today' | '7d' | 'custom'>('7d');
  const [from, setFrom] = useState(toDateString(addDays(new Date(), -6)));
  const [to, setTo] = useState(todayString());
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);

  const queryParams: AuditQuery = useMemo(
    () => ({
      kw: kw.trim() || undefined,
      range,
      from: range === 'custom' ? from : undefined,
      to: range === 'custom' ? to : undefined,
      action: action || undefined,
      userId: userId ? Number(userId) : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [kw, range, from, to, action, userId, page],
  );

  const query = buildQuery({
    kw: queryParams.kw,
    range: queryParams.range,
    from: queryParams.from,
    to: queryParams.to,
    action: queryParams.action,
    userId: queryParams.userId,
    page: queryParams.page,
    pageSize: queryParams.pageSize,
  });

  const { data, error, isLoading, mutate } = useSWR<AuditPageResult>(
    ['/audit', query],
    () => adminFetch<AuditPageResult>(`/audit${query}`),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const { data: options } = useSWR<AuditOptions>(['/audit/options'], () =>
    adminFetch<AuditOptions>('/audit/options'),
  );
  const { data: detail } = useSWR<AuditLogRow>(
    detailId ? ['/audit/detail', detailId] : null,
    () => adminFetch<AuditLogRow>(`/audit/${detailId}`),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    setPage(1);
  }, [kw, range, from, to, action, userId]);

  const reset = (): void => {
    setKw('');
    setRange('7d');
    setFrom(toDateString(addDays(new Date(), -6)));
    setTo(todayString());
    setAction('');
    setUserId('');
    setPage(1);
  };

  const remove = async (id: number): Promise<void> => {
    const ok = await confirm({
      title: '删除该操作日志？',
      text: '仅清除留痕记录，不影响订单与业务数据。审计记录建议优先归档而非删除。',
      okText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/audit/${id}`, { method: 'DELETE' });
      toast('日志已删除', 'success');
      setDetailId(null);
      void mutate();
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '删除失败', 'error');
    }
  };

  return (
    <div className="page show">
      <div className="card">
        <div className="card-title">
          操作日志
          <span className="sub">登录、订单操作、打印与配置变更全量留痕，仅管理员可查</span>
          <button type="button" className="btn sm" onClick={() => void mutate()}>
            <RefreshCw size={12} /> 刷新
          </button>
        </div>

        <div className="filter-bar">
          <input
            className="fb-kw"
            value={kw}
            placeholder="搜索单号 / 对象 / 详情"
            onChange={(event) => setKw(event.target.value)}
          />
          <select
            className="fb-dt"
            value={range}
            onChange={(event) => setRange(event.target.value as typeof range)}
          >
            <option value="all">全部时间</option>
            <option value="today">今日</option>
            <option value="7d">近 7 日</option>
            <option value="custom">自定义区间</option>
          </select>
          {range === 'custom' ? (
            <span className="fb-range">
              <input
                type="date"
                className="fb-date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
              <i>至</i>
              <input
                type="date"
                className="fb-date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </span>
          ) : null}
          <select
            className="fb-dim"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="">全部类型</option>
            {(options?.actions ?? []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="fb-dim"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">全部操作人</option>
            {(options?.users ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <div className="fb-act">
            <span className="fb-count">
              共 <b>{data?.summary.count ?? 0}</b> 条 · 操作人 <b>{data?.summary.operators ?? 0}</b> 位
            </span>
            <button type="button" className="btn sm" onClick={reset}>
              <RotateCcw size={13} /> 重置
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingRows rows={6} />
        ) : error ? (
          <EmptyState title="加载失败" text={error.message} />
        ) : !data || data.list.length === 0 ? (
          <EmptyState title="无符合条件的记录" text="调整筛选条件后再试" />
        ) : (
          <>
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作人</th>
                    <th>操作类型</th>
                    <th>操作对象</th>
                    <th>详情</th>
                    <th>IP</th>
                    <th style={{ width: 112 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.list.map((log) => (
                    <tr key={log.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {shortDateTime(log.createdAt)}
                      </td>
                      <td>{log.username || '—'}</td>
                      <td>
                        <span className={`badge ${actionTone(log.action)}`}>{log.actionLabel}</span>
                      </td>
                      <td className="num" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.target || '—'}
                      </td>
                      <td
                        title={log.detail}
                        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {log.detail || '—'}
                      </td>
                      <td className="num mini-muted">{log.ip || '—'}</td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className="btn-text" onClick={() => setDetailId(log.id)}>
                            详情
                          </button>
                          <button
                            type="button"
                            className="btn-text danger"
                            onClick={() => void remove(log.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              onChange={setPage}
            />
          </>
        )}
      </div>

      <Modal
        open={detailId !== null}
        title="操作日志详情"
        onClose={() => setDetailId(null)}
        width={440}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDetailId(null)}>
              关闭
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => detailId && void remove(detailId)}
            >
              删除该记录
            </button>
          </>
        }
      >
        {detail ? <DetailRows log={detail} /> : <LoadingRows rows={4} />}
      </Modal>
    </div>
  );
}
