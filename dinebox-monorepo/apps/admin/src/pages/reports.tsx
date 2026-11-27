import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';

import type { HourPoint, PaymentRow, ReportData, ReportRange, TrendPoint } from '@dinebox/types';
import { PAY_METHOD_LABELS } from '@dinebox/types';
import { formatMoney, formatPercent, todayString } from '@dinebox/utils';

import { adminFetch, buildQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EmptyState, LoadingRows } from '@/components/feedback';

function deltaText(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return '持平';
  return `${value > 0 ? '↑' : '↓'} ${Math.abs(value).toFixed(1)}%`;
}

function Delta({
  value,
  invert = false,
}: {
  value: number | null;
  invert?: boolean;
}) {
  if (value === null) return <span className="muted">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span style={{ color: value === 0 ? 'var(--ink-3)' : good ? 'var(--ok)' : 'var(--price)' }}>
      {deltaText(value)}
    </span>
  );
}

function hourRange(open: string, close: string): number[] {
  const parse = (value: string): number => Number(value.split(':')[0] ?? 0);
  const start = Math.max(0, parse(open) - 1);
  const end = Math.min(23, parse(close) + 1);
  if (end >= start) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  return Array.from({ length: 24 }, (_, index) => index);
}

/** 轻量经营报表：经营总览、时段、趋势、排行、结算对账与退菜。 */
export function ReportsPage() {
  const { shop } = useAuth();
  const [range, setRange] = useState<ReportRange>('today');
  const [trendRange, setTrendRange] = useState<7 | 30>(7);
  const [hoveredHour, setHoveredHour] = useState<{
    index: number;
    point: HourPoint;
  } | null>(null);
  const [hoveredTrend, setHoveredTrend] = useState<{
    index: number;
    point: TrendPoint;
  } | null>(null);

  const query = buildQuery({ range, trendRange });
  const { data, error, isLoading, mutate } = useSWR<ReportData>(
    ['/reports', query],
    () => adminFetch<ReportData>(`/reports${query}`),
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  useEffect(() => {
    setHoveredHour(null);
    setHoveredTrend(null);
  }, [data?.from, data?.to, trendRange]);

  const hours = useMemo(
    () => hourRange(shop?.openTime ?? '10:00', shop?.closeTime ?? '22:00'),
    [shop?.openTime, shop?.closeTime],
  );

  const hourly = useMemo(
    () => (data?.hourly ?? []).filter((point) => hours.includes(point.hour)),
    [data?.hourly, hours],
  );
  const hourlyMax = Math.max(1, ...hourly.map((point) => point.revenue));

  const trend = data?.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((point) => point.revenue));
  const rankMax = Math.max(1, ...(data?.ranking ?? []).map((row) => row.qty));
  const paymentTotal = (data?.payments ?? []).reduce((sum, row) => sum + row.amount, 0);

  if (isLoading && !data) {
    return (
      <div className="page show">
        <LoadingRows rows={8} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page show">
        <div className="card">
          <EmptyState title="报表加载失败" text={error?.message} />
        </div>
      </div>
    );
  }

  const overview = data.overview;
  const isToday = data.range === 'today';

  return (
    <div className="page show">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>经营报表</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
            营收均按已结清实收计算 · 当前口径 {data.from} ~ {data.to} · 切换口径后除「营收趋势」外各卡联动
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="seg">
            <button
              type="button"
              className={range === 'today' ? 'active' : ''}
              onClick={() => setRange('today')}
            >
              今日
            </button>
            <button
              type="button"
              className={range === '7d' ? 'active' : ''}
              onClick={() => setRange('7d')}
            >
              近 7 日
            </button>
          </div>
          <button type="button" className="btn sm" onClick={() => void mutate()}>
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          经营总览
          <span className="sub">{isToday ? '对比昨日' : '对比上一个 7 日'}</span>
        </div>
        <div className="stat-row" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="stat-card">
            <div className="v num">¥{formatMoney(overview.revenue)}</div>
            <div className="k">营收（已结清实收）</div>
            <div className="d">
              较上一周期 <Delta value={overview.revenueDelta} />
            </div>
          </div>
          <div className="stat-card">
            <div className="v num">{overview.orderCount} 笔</div>
            <div className="k">已结清订单数</div>
            <div className="d">
              较上一周期 <Delta value={overview.orderDelta} />
            </div>
          </div>
          <div className="stat-card">
            <div className="v num">¥{formatMoney(overview.avgOrder)}</div>
            <div className="k">客单价</div>
            <div className="d">
              较上一周期 <Delta value={overview.avgDelta} />
            </div>
          </div>
          <div className="stat-card">
            <div className="v num">{formatPercent(overview.returnRate)}</div>
            <div className="k">退菜率（退菜金额 ÷ 营收）</div>
            <div className="d">
              退菜 ¥{formatMoney(overview.returnAmount)} ·{' '}
              <Delta value={overview.returnRateDelta} invert />
            </div>
          </div>
          <div className="stat-card">
            <div className="v num" style={{ fontSize: 19 }}>
              {overview.peakHour}
            </div>
            <div className="k">高峰时段（按结账单数）</div>
            <div className="d">排班与备货参考</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div className="card chart-card" style={{ flex: 1.35, minWidth: 0 }}>
          <div className="card-title">
            时段营收分布
            <span className="sub">
              {data.from.slice(5)} ~ {data.to.slice(5)} · 按结账小时 · 悬浮查看明细
            </span>
          </div>
          <div
            className={`bar-row ${hoveredHour ? 'has-hover' : ''}`}
            onMouseLeave={() => setHoveredHour(null)}
          >
            {hoveredHour ? (
              <div
                className="chart-tip"
                style={{
                  left: `${Math.min(
                    92,
                    Math.max(
                      8,
                      ((hoveredHour.index + 0.5) / Math.max(1, hourly.length)) * 100,
                    ),
                  )}%`,
                }}
              >
                <b>
                  {hoveredHour.point.label} -{' '}
                  {String((hoveredHour.point.hour + 1) % 24).padStart(2, '0')}:00
                </b>
                <span>
                  营收 ¥{formatMoney(hoveredHour.point.revenue)} ·{' '}
                  {hoveredHour.point.orderCount} 单
                </span>
              </div>
            ) : null}
            {hourly.map((point, index) => (
              <div
                className={`bar-col ${hoveredHour?.index === index ? 'is-hover' : ''}`}
                key={point.hour}
                tabIndex={0}
                role="img"
                aria-label={`${point.label} 营收 ${formatMoney(point.revenue)} 元，${point.orderCount} 单`}
                onMouseEnter={() => setHoveredHour({ index, point })}
                onFocus={() => setHoveredHour({ index, point })}
                onBlur={() => setHoveredHour(null)}
              >
                <span
                  className="val"
                  style={{
                    visibility:
                      point.revenue === hourlyMax && point.revenue > 0 ? 'visible' : 'hidden',
                  }}
                >
                  ¥{formatMoney(point.revenue)}
                </span>
                <div
                  className="bar"
                  style={{
                    height: `${Math.max(2, (point.revenue / hourlyMax) * 100)}%`,
                    background:
                      point.revenue === hourlyMax && point.revenue > 0
                        ? 'var(--price)'
                        : 'var(--primary)',
                  }}
                />
                <span className="lbl">{point.hour}时</span>
              </div>
            ))}
          </div>
          {hourly.every((point) => point.revenue === 0) ? (
            <div className="mini-muted" style={{ textAlign: 'center', paddingBottom: 8 }}>
              当前口径暂无已结清营收
            </div>
          ) : null}
        </div>

        <div className="card chart-card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span>营收趋势</span>
            <div className="seg">
              <button
                type="button"
                className={trendRange === 7 ? 'active' : ''}
                onClick={() => setTrendRange(7)}
              >
                近 7 日
              </button>
              <button
                type="button"
                className={trendRange === 30 ? 'active' : ''}
                onClick={() => setTrendRange(30)}
              >
                近 30 日
              </button>
            </div>
            <span className="sub" style={{ marginLeft: 'auto' }}>
              独立窗口 · 悬浮查看明细
            </span>
          </div>
          <div
            className={`bar-row ${trendRange === 30 ? 'compact' : ''} ${
              hoveredTrend ? 'has-hover' : ''
            }`}
            onMouseLeave={() => setHoveredTrend(null)}
          >
            {hoveredTrend ? (
              <div
                className="chart-tip"
                style={{
                  left: `${Math.min(
                    92,
                    Math.max(
                      8,
                      ((hoveredTrend.index + 0.5) / Math.max(1, trend.length)) * 100,
                    ),
                  )}%`,
                }}
              >
                <b>{hoveredTrend.point.date}</b>
                <span>
                  营收 ¥{formatMoney(hoveredTrend.point.revenue)} ·{' '}
                  {hoveredTrend.point.orderCount} 单
                </span>
              </div>
            ) : null}
            {trend.map((point, index) => {
              const isToday = point.date === todayString();
              const isMax = point.revenue === trendMax && point.revenue > 0;
              const showLabel =
                trendRange === 7 || index % 5 === 0 || index === trend.length - 1;
              return (
                <div
                  className={`bar-col ${
                    hoveredTrend?.index === index ? 'is-hover' : ''
                  } ${point.revenue === 0 ? 'is-zero' : ''}`}
                  key={point.date}
                  tabIndex={0}
                  role="img"
                  aria-label={`${point.date} 营收 ${formatMoney(point.revenue)} 元，${point.orderCount} 单`}
                  onMouseEnter={() => setHoveredTrend({ index, point })}
                  onFocus={() => setHoveredTrend({ index, point })}
                  onBlur={() => setHoveredTrend(null)}
                >
                  {trendRange === 7 ? (
                    <span
                      className="val"
                      style={{ visibility: isMax || isToday ? 'visible' : 'hidden' }}
                    >
                      {formatMoney(point.revenue)}
                    </span>
                  ) : null}
                  <div
                    className="bar"
                    style={{
                      height: `${Math.max(2, (point.revenue / trendMax) * 100)}%`,
                      background: isToday
                        ? 'var(--price)'
                        : isMax
                          ? 'var(--ink)'
                          : 'var(--primary)',
                    }}
                  />
                  <span className="lbl">{showLabel ? point.label : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', marginTop: 16 }}>
        <div className="card" style={{ flex: 1.25, minWidth: 0 }}>
          <div className="card-title">
            菜品销量排行
            <span className="sub">TOP 8 · 主食不计入排序</span>
          </div>
          {data.ranking.length === 0 ? (
            <EmptyState title="暂无销量数据" />
          ) : (
            data.ranking.map((row, index) => (
              <div className={`rank-row ${index < 3 ? 'top' : ''}`} key={`${row.dishName}-${row.specText}`}>
                <span className="rk">{index + 1}</span>
                <span className="nm">
                  {row.dishName}
                  {row.specText ? <span className="mini-muted"> · {row.specText}</span> : null}
                </span>
                <span className="mini-muted num">{row.qty} 份</span>
                <div className="track">
                  <i style={{ width: `${(row.qty / rankMax) * 100}%` }} />
                </div>
                <span className="num" style={{ width: 62, textAlign: 'right', fontSize: 12 }}>
                  ¥{formatMoney(row.amount)}
                </span>
              </div>
            ))
          )}

          <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            滞销提醒
            <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 11, marginLeft: 6 }}>
              固定近 7 日口径 · 销量垫底可考虑促销或下架
            </span>
          </div>
          {data.slowMovers.map((row, index) => (
            <div className="slow-row" key={row.dishName}>
              <span className="slow-dot">{index + 1}</span>
              <span style={{ flex: 1 }}>{row.dishName}</span>
              <span className="mini-muted">{row.categoryName}</span>
              <span className="num" style={{ width: 54, textAlign: 'right' }}>
                {row.qty} 份
              </span>
            </div>
          ))}
        </div>

        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title">
            结算方式对账
            <span className="sub">
              {data.from.slice(5)} ~ {data.to.slice(5)}
            </span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>结算方式</th>
                <th>笔数</th>
                <th>金额</th>
                <th>占比</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="page-empty" style={{ padding: '28px 0' }}>
                      当前口径暂无结算数据
                    </div>
                  </td>
                </tr>
              ) : (
                data.payments.map((row: PaymentRow) => (
                  <tr key={row.payMethod}>
                    <td>{PAY_METHOD_LABELS[row.payMethod]}</td>
                    <td className="num">{row.count}</td>
                    <td className="num">¥{formatMoney(row.amount)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="bar-track" style={{ width: 70 }}>
                          <i
                            style={{
                              width: `${(row.amount / Math.max(1, paymentTotal)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="num mini-muted">{formatPercent(row.ratio, 0)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data.payments.length > 0 ? (
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700 }}>合计</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {data.payments.reduce((sum, row) => sum + row.count, 0)}
                  </td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--price)' }}>
                    ¥{formatMoney(paymentTotal)}
                  </td>
                  <td className="mini-muted">100%</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          <div className="mini-muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            线下收款金额以实际到账为准，本表用于与营收勾稽核对差异。
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          退菜记录统计
          <span className="sub">
            {data.from.slice(5)} ~ {data.to.slice(5)} · 共 {data.returns.reduce((sum, row) => sum + row.count, 0)} 次
          </span>
        </div>
        {data.returns.length === 0 ? (
          <EmptyState title="当前口径没有退菜记录" />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>菜品</th>
                <th>退菜次数</th>
                <th>退菜金额</th>
                <th>主要原因</th>
              </tr>
            </thead>
            <tbody>
              {data.returns.map((row) => (
                <tr key={row.dishName}>
                  <td>{row.dishName}</td>
                  <td className="num">{row.count}</td>
                  <td className="num" style={{ color: 'var(--price)' }}>
                    ¥{formatMoney(row.amount)}
                  </td>
                  <td>{row.topReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
