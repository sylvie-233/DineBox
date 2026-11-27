import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Download, RefreshCw } from 'lucide-react';

import type { Order, OrderListQuery, OrderListResult, PayMethod } from '@dinebox/types';
import { ORDER_STATUS_LABELS, PAY_METHOD_LABELS } from '@dinebox/types';
import { addDays, formatMoney, shortDateTime, todayString, toDateString } from '@dinebox/utils';

import { adminDownload, adminFetch, buildQuery } from '@/lib/api';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { Pagination } from '@/components/pagination';

interface FlatTable {
  id: number;
  name: string;
  areaName: string;
}

const PAGE_SIZE = 10;

function statusTag(order: OrderListResult['list'][number]): { className: string; label: string } {
  if (order.status === 'PENDING') {
    return order.hungFlag
      ? { className: 'tag hold', label: '挂单' }
      : { className: 'tag pending', label: '待结算' };
  }
  if (order.status === 'SETTLED') {
    return { className: 'tag ok', label: '已结清' };
  }
  return { className: 'tag cancel', label: '已取消' };
}

function OrderDetailContent({ order }: { order: Order }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>
            {order.orderNo}
          </div>
          <div className="mini-muted" style={{ marginTop: 3 }}>
            {shortDateTime(order.createdAt)} · {order.tableName} · {order.peopleCount} 人 ·
            {order.areaName}
          </div>
        </div>
        <span
          className={`tag ${
            order.status === 'SETTLED' ? 'ok' : order.status === 'CANCELLED' ? 'cancel' : 'pending'
          }`}
        >
          {order.status === 'PENDING' && order.hungFlag ? '挂单' : ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <div style={{ marginTop: 12 }}>
        {order.items.map((item) => {
          const addonText = item.addons
            .map((addon) => `${addon.name}×${addon.qty}`)
            .join('、');
          return (
            <div
              key={item.id}
              className={`oi-row ${item.status === 'RETURNED' ? 'returned' : ''}`}
            >
              <div className="oi-name">
                {item.dishName}
                <span className="spec">
                  {[item.specText, addonText].filter(Boolean).join(' · ') || '默认规格'}
                  {item.status === 'RETURNED'
                    ? ` · 已退${item.returnReason ? `（${item.returnReason}）` : ''}`
                    : ''}
                </span>
              </div>
              <span className="oi-qty">×{item.qty}</span>
              <span className="oi-price num">¥{formatMoney(item.itemAmount)}</span>
            </div>
          );
        })}
      </div>

      {order.remark ? (
        <div className="info-note">备注：{order.remark}</div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div className="settle-line">
          <span>菜品合计（退菜已扣）</span>
          <span className="num">¥{formatMoney(order.totalAmount)}</span>
        </div>
        {order.status === 'SETTLED' ? (
          <>
            <div className="settle-line">
              <span>抹零</span>
              <span className="num">-¥{formatMoney(order.roundOffAmount)}</span>
            </div>
            <div className="settle-total" style={{ paddingTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>实收金额</span>
              <span className="money num" style={{ fontSize: 22 }}>
                ¥{formatMoney(order.payableAmount)}
              </span>
            </div>
            <div className="settle-line" style={{ marginTop: 6 }}>
              <span>结算方式 / 时间</span>
              <span>
                {order.payMethod ? PAY_METHOD_LABELS[order.payMethod as PayMethod] : '—'} ·{' '}
                {shortDateTime(order.settledAt)}
              </span>
            </div>
          </>
        ) : (
          <div className="settle-line">
            <span>应收金额</span>
            <span className="num" style={{ fontWeight: 700, color: 'var(--price)' }}>
              ¥{formatMoney(order.totalAmount)}
            </span>
          </div>
        )}
        {order.returnAmount > 0 ? (
          <div className="settle-line">
            <span>退菜金额</span>
            <span className="num" style={{ color: 'var(--price)' }}>
              -¥{formatMoney(order.returnAmount)}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** 订单流水：筛选、详情与 Excel 导出。 */
export function OrdersPage() {
  const { toast } = useToast();
  const [kw, setKw] = useState('');
  const [range, setRange] = useState<'all' | 'today' | '7d' | 'custom'>('7d');
  const [from, setFrom] = useState(toDateString(addDays(new Date(), -6)));
  const [to, setTo] = useState(todayString());
  const [tableId, setTableId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const queryParams: OrderListQuery = useMemo(
    () => ({
      kw: kw.trim() || undefined,
      range,
      from: range === 'custom' ? from : undefined,
      to: range === 'custom' ? to : undefined,
      tableId: tableId ? Number(tableId) : undefined,
      status: (status || undefined) as OrderListQuery['status'],
      page,
      pageSize: PAGE_SIZE,
    }),
    [kw, range, from, to, tableId, status, page],
  );

  const queryString = buildQuery({
    kw: queryParams.kw,
    range: queryParams.range,
    from: queryParams.from,
    to: queryParams.to,
    tableId: queryParams.tableId,
    status: queryParams.status,
    page: queryParams.page,
    pageSize: queryParams.pageSize,
  });

  const { data, error, isLoading, mutate } = useSWR<OrderListResult>(
    ['/orders', queryString],
    () => adminFetch<OrderListResult>(`/orders${queryString}`),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const { data: tables } = useSWR<FlatTable[]>(['/orders/tables'], () =>
    adminFetch<FlatTable[]>('/orders/tables'),
  );
  const { data: detail } = useSWR<Order>(
    detailId ? ['/orders/detail', detailId] : null,
    () => adminFetch<Order>(`/orders/${detailId}`),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    setPage(1);
  }, [kw, range, from, to, tableId, status]);

  const reset = (): void => {
    setKw('');
    setRange('7d');
    setFrom(toDateString(addDays(new Date(), -6)));
    setTo(todayString());
    setTableId('');
    setStatus('');
    setPage(1);
  };

  const exportExcel = async (): Promise<void> => {
    setExporting(true);
    try {
      const ok = await adminDownload(
        `/orders/export${queryString.replace(/&page=[^&]*/, '').replace(/&pageSize=[^&]*/, '')}`,
        'DineBox订单流水.xlsx',
      );
      if (ok) toast('已导出当前筛选结果', 'success');
    } catch (exportError) {
      toast(exportError instanceof Error ? exportError.message : '导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="page show">
      <div className="card">
        <div className="card-title">
          历史订单
          <span className="sub">按结算状态与时间对账，导出 Excel 留档</span>
          <button type="button" className="btn sm" onClick={() => void mutate()}>
            <RefreshCw size={12} /> 刷新
          </button>
        </div>

        <div className="filter-bar">
          <input
            className="fb-kw"
            value={kw}
            placeholder="搜索订单号 / 桌号"
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <input
                type="date"
                className="fb-date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
              <i style={{ fontStyle: 'normal', fontSize: 12, color: 'var(--ink-3)' }}>至</i>
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
            value={tableId}
            onChange={(event) => setTableId(event.target.value)}
          >
            <option value="">全部桌台</option>
            {(tables ?? []).map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}（{table.areaName}）
              </option>
            ))}
          </select>
          <select
            className="fb-dim"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="PENDING">待结算</option>
            <option value="HUNG">挂单</option>
            <option value="SETTLED">已结清</option>
            <option value="CANCELLED">已取消</option>
          </select>
          <div className="fb-act">
            <span className="fb-count">
              共 <b>{summary?.count ?? 0}</b> 条 · 合计{' '}
              <b>¥{formatMoney(summary?.totalAmount ?? 0)}</b> · 应收{' '}
              <b>¥{formatMoney(summary?.payableAmount ?? 0)}</b>
            </span>
            <button type="button" className="btn sm" onClick={reset}>
              重置
            </button>
            <button
              type="button"
              className="btn sm primary"
              disabled={exporting}
              onClick={() => void exportExcel()}
            >
              <Download size={12} /> {exporting ? '导出中…' : '导出 Excel'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingRows rows={6} />
        ) : error ? (
          <EmptyState title="加载失败" text={error.message} />
        ) : !data || data.list.length === 0 ? (
          <EmptyState title="无符合条件的订单" text="调整筛选条件后再试" />
        ) : (
          <>
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>桌号</th>
                    <th>下单时间</th>
                    <th>件数</th>
                    <th>菜品合计</th>
                    <th>应收 / 实收</th>
                    <th>状态</th>
                    <th style={{ width: 90 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.list.map((order) => {
                    const tag = statusTag(order);
                    return (
                      <tr key={order.id}>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {order.orderNo}
                        </td>
                        <td>
                          {order.tableName}
                          <span className="mini-muted"> · {order.areaName}</span>
                        </td>
                        <td className="num">{shortDateTime(order.createdAt)}</td>
                        <td className="num">{order.itemCount}</td>
                        <td className="num">¥{formatMoney(order.totalAmount)}</td>
                        <td className="num" style={{ color: 'var(--price)', fontWeight: 600 }}>
                          ¥
                          {formatMoney(
                            order.status === 'SETTLED' ? order.payableAmount : order.totalAmount,
                          )}
                        </td>
                        <td>
                          <span className={tag.className}>{tag.label}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() => setDetailId(order.id)}
                          >
                            详情
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
        title="订单详情"
        onClose={() => setDetailId(null)}
        width={480}
        footer={
          <button type="button" className="btn" onClick={() => setDetailId(null)}>
            关闭
          </button>
        }
      >
        {detail ? <OrderDetailContent order={detail} /> : <LoadingRows rows={4} />}
      </Modal>
    </div>
  );
}
