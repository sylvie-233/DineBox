import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, Search } from 'lucide-react';

import type {
  CashierOverview,
  CategoryWithDishes,
  LiveTableStatus,
  Order,
  OrderListItem,
  OrderListResult,
  PayMethod,
  TableCard,
} from '@dinebox/types';
import { ORDER_STATUS_LABELS, PAY_METHOD_LABELS } from '@dinebox/types';
import { calcRoundOff, formatMoney, round2, shortDateTime } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/store/confirm';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Pagination } from '@/components/pagination';
import { ModifyModal } from '@/components/cashier/modify-modal';
import { OrderDetailModal } from '@/components/cashier/order-detail-modal';
import { ReturnModal } from '@/components/cashier/return-modal';
import { SettleModal } from '@/components/cashier/settle-modal';

type TableFilter = 'ALL' | LiveTableStatus;

const FILTER_LABELS: Record<TableFilter, string> = {
  ALL: '全部',
  OCCUPIED: '待结算',
  HUNG: '挂单',
  FREE: '空闲',
};

const FILTER_COLORS: Record<TableFilter, string> = {
  ALL: '#17181c',
  OCCUPIED: '#d97706',
  HUNG: '#7c8aa0',
  FREE: '#c8ccd2',
};

const STATUS_LABELS: Record<LiveTableStatus, string> = {
  FREE: '空闲',
  OCCUPIED: '待结算',
  HUNG: '挂单',
};

const RULE_LABELS = {
  ANGLE: '抹到元',
  ANGLE5: '抹到 5 角',
  NONE: '不抹零',
} as const;

function minutesSince(value: string): number {
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

function tableClass(status: LiveTableStatus): string {
  if (status === 'OCCUPIED') return 'busy';
  if (status === 'HUNG') return 'hold';
  return 'idle';
}

/** 收银台：桌台概览、订单检索、改单/退菜/挂单/取消/结算。 */
export function CashierPage() {
  const { shop } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const {
    data: overview,
    error: overviewError,
    isLoading,
    mutate: mutateOverview,
  } = useSWR<CashierOverview>(['/cashier/overview'], () =>
    adminFetch<CashierOverview>('/cashier/overview'),
  );
  const { data: menu } = useSWR<CategoryWithDishes[]>(
    ['/cashier/menu'],
    () => adminFetch<CategoryWithDishes[]>('/cashier/menu'),
    { revalidateOnFocus: false },
  );

  const [filter, setFilter] = useState<TableFilter>('ALL');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [searchKw, setSearchKw] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<OrderListResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('CASH');
  const [roundOff, setRoundOff] = useState(true);

  const { data: selectedOrder, mutate: mutateSelectedOrder } = useSWR<Order>(
    selectedOrderId ? ['/cashier/orders', selectedOrderId] : null,
    () => adminFetch<Order>(`/cashier/orders/${selectedOrderId}`),
    { revalidateOnFocus: false },
  );

  const allTables = useMemo(
    () => (overview?.areas ?? []).flatMap((area) => area.tables),
    [overview?.areas],
  );
  const selectedTable = useMemo(
    () => allTables.find((table) => table.id === selectedTableId) ?? null,
    [allTables, selectedTableId],
  );

  useEffect(() => {
    if (!selectedTableId) {
      if (selectedOrderId !== null) setSelectedOrderId(null);
      return;
    }
    const table = allTables.find((item) => item.id === selectedTableId);
    if (!table) {
      setSelectedTableId(null);
      setSelectedOrderId(null);
      return;
    }
    const ids = table.orders.map((order) => order.id);
    if (selectedOrderId !== null && ids.includes(selectedOrderId)) {
      return;
    }
    setSelectedOrderId(ids[0] ?? null);
  }, [allTables, selectedTableId, selectedOrderId]);

  useEffect(() => {
    setRoundOff(shop?.roundOffEnabled ?? false);
    setPayMethod('CASH');
  }, [selectedOrderId, shop?.roundOffEnabled]);

  if (isLoading && !overview) {
    return (
      <div className="page show">
        <LoadingRows rows={8} />
      </div>
    );
  }
  if (overviewError || !overview) {
    return (
      <div className="page show">
        <div className="card">
          <EmptyState title="收银台加载失败" text={overviewError?.message} />
        </div>
      </div>
    );
  }

  const stats = overview.stats;
  const tables = allTables;
  const counts: Record<TableFilter, number> = {
    ALL: tables.length,
    OCCUPIED: tables.filter((table) => table.status === 'OCCUPIED').length,
    HUNG: tables.filter((table) => table.status === 'HUNG').length,
    FREE: tables.filter((table) => table.status === 'FREE').length,
  };
  const filteredAreas = overview.areas
    .map((area) => ({
      ...area,
      tables: area.tables.filter((table) => filter === 'ALL' || table.status === filter),
    }))
    .filter((area) => area.tables.length > 0);

  const selectedItems = selectedOrder?.items ?? [];
  const normalItems = selectedItems.filter((item) => item.status === 'NORMAL');
  const previewOff =
    selectedOrder && roundOff && shop && shop.roundOffRule !== 'NONE'
      ? calcRoundOff(selectedOrder.totalAmount, shop.roundOffRule)
      : 0;
  const previewPayable = selectedOrder ? round2(selectedOrder.totalAmount - previewOff) : 0;

  const refreshAll = (): void => {
    void mutateOverview();
    if (selectedOrderId) void mutateSelectedOrder();
  };

  const selectTable = (table: TableCard): void => {
    setSelectedTableId(table.id);
    setSelectedOrderId(table.orders[0]?.id ?? null);
  };

  const loadSearch = async (term: string, page: number): Promise<void> => {
    if (!term) {
      setSearchResults(null);
      setActiveKeyword('');
      return;
    }
    setSearching(true);
    try {
      const result = await adminFetch<OrderListResult>(
        `/cashier/search?kw=${encodeURIComponent(term)}&page=${page}&pageSize=8`,
      );
      setSearchResults(result);
      setActiveKeyword(term);
    } catch (error) {
      toast(error instanceof Error ? error.message : '检索失败', 'error');
    } finally {
      setSearching(false);
    }
  };

  const runSearch = (): void => {
    const term = searchKw.trim();
    if (!term) {
      setSearchResults(null);
      setActiveKeyword('');
      return;
    }
    void loadSearch(term, 1);
  };

  const locateOrder = (row: OrderListItem): void => {
    if (row.status !== 'PENDING') {
      setDetailOrderId(row.id);
      return;
    }
    setFilter('ALL');
    setSelectedTableId(row.tableId);
    setSelectedOrderId(row.id);
  };

  const holdOrResume = async (): Promise<void> => {
    if (!selectedOrder) return;
    const hung = selectedOrder.hungFlag;
    const ok = await confirm({
      title: hung ? '恢复待结算？' : '挂单暂存？',
      text: hung
        ? '恢复后订单回到待结算，可继续改单、退菜或结算。'
        : '挂单后订单暂存，桌台保持占用；可从桌台卡片重新选择该单恢复。',
      okText: hung ? '恢复待结算' : '挂单',
      danger: false,
    });
    if (!ok) return;
    try {
      await adminFetch(
        `/cashier/orders/${selectedOrder.id}/${hung ? 'resume' : 'hold'}`,
        { method: 'POST' },
      );
      toast(hung ? '已恢复待结算' : '已挂单', 'success');
      refreshAll();
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const cancelOrder = async (): Promise<void> => {
    if (!selectedOrder) return;
    const ok = await confirm({
      title: '整单取消？',
      text: `桌号 ${selectedOrder.tableName} · 订单 ${selectedOrder.orderNo} · ${selectedOrder.itemCount} 件 · ¥${formatMoney(
        selectedOrder.totalAmount,
      )}\n\n取消后订单标记为已取消，桌台回到空闲；后厨如已收到小票请口头叫停。`,
      okText: '确认取消整单',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/cashier/orders/${selectedOrder.id}/cancel`, { method: 'POST' });
      toast('订单已取消', 'success');
      refreshAll();
    } catch (error) {
      toast(error instanceof Error ? error.message : '取消失败', 'error');
    }
  };

  return (
    <div className="page show">
      <div className="stat-row">
        <div className="stat-card">
          <div className="v num">{stats.todayOrderCount}</div>
          <div className="k">今日订单总数</div>
          <div className="d">
            待结算 <b>{stats.pendingOrderCount}</b> · 挂单 <b>{stats.hungOrderCount}</b>
          </div>
        </div>
        <div className="stat-card">
          <div className="v num">¥{formatMoney(stats.todayRevenue)}</div>
          <div className="k">今日营收汇总（已结清）</div>
          <div className="d">线下收款 · 系统不校验支付结果</div>
        </div>
        <div className="stat-card">
          <div className="v num">
            {stats.occupiedTables}/{stats.totalTables}
          </div>
          <div className="k">占用 / 总桌台</div>
          <div className="d">
            待结算 <b>{counts.OCCUPIED}</b> · 挂单 <b>{counts.HUNG}</b> · 空闲{' '}
            <b>{counts.FREE}</b>
          </div>
        </div>
        <div className="stat-card">
          <div className="v num">¥{formatMoney(stats.averagePerOrder)}</div>
          <div className="k">客单价（已结清均摊）</div>
          <div className="d">用于班次交接与对账参考</div>
        </div>
      </div>

      <div className="cashier-grid">
        <div className="cashier-left">
          <form
            className="search-row"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <input
              value={searchKw}
              placeholder="按桌号 / 订单号检索订单，回车确认"
              onChange={(event) => setSearchKw(event.target.value)}
            />
            <button type="submit" className="btn primary" disabled={searching}>
              <Search size={13} /> {searching ? '检索中…' : '检索'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearchKw('');
                setActiveKeyword('');
                setSearchResults(null);
              }}
            >
              清空
            </button>
          </form>

          {searchResults !== null ? (
            <div className="card search-result">
              <div className="card-title">
                检索结果
                <span className="sub">
                  共 {searchResults.total} 条 · 第 {searchResults.page}/{searchResults.totalPages} 页 ·
                  点击定位待结算订单
                </span>
                <button type="button" className="btn sm" onClick={() => setSearchResults(null)}>
                  收起
                </button>
              </div>
              {searchResults.list.length === 0 ? (
                <div className="page-empty" style={{ padding: '24px 0' }}>
                  没有找到匹配的订单
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>订单号</th>
                      <th>桌号</th>
                      <th>时间</th>
                      <th>金额</th>
                      <th>状态</th>
                      <th style={{ width: 100 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.list.map((row) => (
                      <tr key={row.id} className="rowlink" onClick={() => locateOrder(row)}>
                        <td className="num">{row.orderNo}</td>
                        <td>{row.tableName}</td>
                        <td className="num">{shortDateTime(row.createdAt)}</td>
                        <td className="num">¥{formatMoney(row.totalAmount)}</td>
                        <td>
                          <span
                            className={`tag ${
                              row.status === 'SETTLED'
                                ? 'ok'
                                : row.status === 'CANCELLED'
                                  ? 'cancel'
                                  : 'pending'
                            }`}
                          >
                            {row.status === 'PENDING' && row.hungFlag
                              ? '挂单'
                              : ORDER_STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-text"
                            onClick={(event) => {
                              event.stopPropagation();
                              locateOrder(row);
                            }}
                          >
                            {row.status === 'PENDING' ? '定位' : '详情'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Pagination
                page={searchResults.page}
                totalPages={searchResults.totalPages}
                total={searchResults.total}
                pageSize={searchResults.pageSize}
                onChange={(page) => void loadSearch(activeKeyword, page)}
              />
            </div>
          ) : null}

          <div className="card">
            <div className="card-title">
              桌台概览
              <span className="sub">点击桌台查看 / 结算订单</span>
              <button type="button" className="btn sm" onClick={() => void mutateOverview()}>
                <RefreshCw size={12} /> 刷新
              </button>
            </div>
            <div className="tbl-legend">
              {(Object.keys(FILTER_LABELS) as TableFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`lg-chip ${filter === key ? 'active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  <i style={{ background: FILTER_COLORS[key] }} />
                  {FILTER_LABELS[key]} <b>{counts[key]}</b>
                </button>
              ))}
            </div>

            {filteredAreas.length === 0 ? (
              <EmptyState title="没有符合条件的桌台" text="切换状态筛选或刷新桌台状态" />
            ) : (
              filteredAreas.map((area) => (
                <div key={area.id}>
                  <div className="table-sec-t">
                    {area.name}
                    <span style={{ fontWeight: 400 }}>
                      {area.tables.length} 桌
                    </span>
                  </div>
                  <div className="table-grid">
                    {area.tables.map((table) => {
                      const status = table.status;
                      const firstOrder = table.orders[0];
                      const minutes = firstOrder ? minutesSince(firstOrder.createdAt) : 0;
                      return (
                        <button
                          key={table.id}
                          type="button"
                          className={`table-card ${tableClass(status)} ${
                            selectedTableId === table.id ? 'sel' : ''
                          }`}
                          onClick={() => selectTable(table)}
                        >
                          <span className="tbadge">{STATUS_LABELS[status]}</span>
                          <div className="tno num">{table.name}</div>
                          {status === 'FREE' ? (
                            <>
                              <div className="tst">尚未开台</div>
                              <div className="amount" style={{ color: 'var(--ink-3)' }}>
                                —
                              </div>
                              <div className="tmeta">
                                <span>{table.seats ? `${table.seats} 人桌` : '桌台'}</span>
                                <span>{table.areaName}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="amount num">¥{formatMoney(table.pendingAmount)}</div>
                              <div className="tst">
                                {table.pendingOrderCount} 单未结 ·{' '}
                                {firstOrder ? `${firstOrder.peopleCount} 人` : '—'}
                              </div>
                              <div className="tmeta">
                                <span>开台 {durationText(minutes)}</span>
                                <span>
                                  {table.orders.some((order) => order.hungFlag) ? '含挂单' : '待结算'}
                                </span>
                              </div>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="cashier-right">
          <div className="card" id="orderPanel">
            {!selectedTable ? (
              <div className="empty">
                左侧选择桌台查看未结订单
                <br />
                或通过上方检索定位订单
              </div>
            ) : (
              <>
                <div className="card-title">
                  <span>
                    {selectedTable.name}
                    <span className="sub" style={{ marginLeft: 6 }}>
                      {selectedTable.areaName} · {selectedTable.pendingOrderCount} 单未结
                    </span>
                  </span>
                  <button type="button" className="btn sm" onClick={refreshAll}>
                    <RefreshCw size={12} />
                  </button>
                </div>

                <div className="order-chip-row">
                  {selectedTable.orders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className={`order-chip ${selectedOrderId === order.id ? 'active' : ''}`}
                      onClick={() => setSelectedOrderId(order.id)}
                      title={order.orderNo}
                    >
                      <span className="no">
                        {order.hungFlag ? '挂单 · ' : ''}
                        …{order.orderNo.slice(-6)}
                      </span>
                      <span className="meta">
                        <span>
                          {order.peopleCount} 人 · {order.itemCount} 件
                        </span>
                        <span className="amt num">¥{formatMoney(order.totalAmount)}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {selectedTable.orders.length === 0 ? (
                  <div className="empty">该桌台暂无未结订单</div>
                ) : !selectedOrder ? (
                  <LoadingRows rows={3} />
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div className="num" style={{ fontSize: 14, fontWeight: 700 }}>
                          {selectedOrder.orderNo}
                        </div>
                        <div className="mini-muted" style={{ marginTop: 2 }}>
                          {shortDateTime(selectedOrder.createdAt)} ·{' '}
                          {selectedOrder.peopleCount} 人 · {selectedOrder.itemCount} 件
                        </div>
                      </div>
                      <span
                        className={`tag ${
                          selectedOrder.hungFlag
                            ? 'hold'
                            : selectedOrder.status === 'PENDING'
                              ? 'pending'
                              : selectedOrder.status === 'SETTLED'
                                ? 'ok'
                                : 'cancel'
                        }`}
                      >
                        {selectedOrder.status === 'PENDING' && selectedOrder.hungFlag
                          ? '挂单'
                          : ORDER_STATUS_LABELS[selectedOrder.status]}
                      </span>
                    </div>

                    <div className="order-block order-items items-scroll">
                      {selectedItems.map((item) => (
                        <div
                          className={`oi-row ${item.status === 'RETURNED' ? 'returned' : ''}`}
                          key={item.id}
                        >
                          <div className="oi-name">
                            {item.dishName}
                            <span className="spec">
                              {[
                                item.specText,
                                item.addons.map((a) => `${a.name}×${a.qty}`).join('、'),
                              ]
                                .filter(Boolean)
                                .join(' · ') || '默认规格'}
                              {item.status === 'RETURNED'
                                ? ` · 已退${item.returnReason ? `（${item.returnReason}）` : ''}`
                                : ''}
                            </span>
                          </div>
                          <span className="oi-qty num">×{item.qty}</span>
                          <span className="oi-price num">¥{formatMoney(item.itemAmount)}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 6 }}>
                      备注：{selectedOrder.remark || '无'}
                    </div>

                    <div className="action-row">
                      <button
                        type="button"
                        className="btn sm"
                        disabled={selectedOrder.status !== 'PENDING'}
                        onClick={() => setModifyOpen(true)}
                      >
                        改单
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={selectedOrder.status !== 'PENDING' || normalItems.length === 0}
                        onClick={() => setReturnOpen(true)}
                      >
                        单品退菜
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={selectedOrder.status !== 'PENDING'}
                        onClick={() => void holdOrResume()}
                      >
                        {selectedOrder.hungFlag ? '恢复待结算' : '挂单'}
                      </button>
                      <button
                        type="button"
                        className="btn sm danger"
                        disabled={selectedOrder.status !== 'PENDING'}
                        onClick={() => void cancelOrder()}
                      >
                        整单取消
                      </button>
                    </div>

                    <div style={{ height: 1, background: 'var(--line)', margin: '14px 0' }} />

                    {selectedOrder.hungFlag ? (
                      <>
                        <div className="info-note">
                          订单处于挂单状态，桌台保持占用。恢复为待结算后才能结算。
                        </div>
                        <button
                          type="button"
                          className="btn primary"
                          style={{ width: '100%', marginTop: 12 }}
                          onClick={() => void holdOrResume()}
                        >
                          恢复待结算
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="settle-line">
                          <span>菜品合计（退菜已扣）</span>
                          <span className="num">¥{formatMoney(selectedOrder.totalAmount)}</span>
                        </div>
                        <div className="settle-line">
                          <span>退菜金额</span>
                          <span className="num" style={{ color: 'var(--price)' }}>
                            -¥{formatMoney(selectedOrder.returnAmount)}
                          </span>
                        </div>
                        <div className="roundoff-line">
                          <span>
                            抹零（{shop ? RULE_LABELS[shop.roundOffRule] : '后台开关控制'}）
                            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> 后台开关控制</span>
                          </span>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={roundOff}
                              disabled={
                                !shop?.roundOffEnabled || shop?.roundOffRule === 'NONE'
                              }
                              onChange={(event) => setRoundOff(event.target.checked)}
                            />
                            <span className="track" />
                          </label>
                        </div>
                        <div className="settle-line">
                          <span>优惠抹零</span>
                          <span className="num">-¥{formatMoney(previewOff)}</span>
                        </div>
                        <div className="settle-total">
                          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>应收金额</span>
                          <div className="money num">
                            <span className="yen">¥</span>
                            {formatMoney(previewPayable)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            margin: '4px 0 2px',
                          }}
                        >
                          结算方式（线下收款确认后点击结算）
                        </div>
                        <div className="pay-methods">
                          {(Object.keys(PAY_METHOD_LABELS) as PayMethod[]).map((method) => (
                            <button
                              key={method}
                              type="button"
                              className={`pm ${payMethod === method ? 'active' : ''}`}
                              onClick={() => setPayMethod(method)}
                            >
                              {PAY_METHOD_LABELS[method]}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn-dark"
                          style={{ letterSpacing: 2 }}
                          disabled={selectedOrder.status !== 'PENDING'}
                          onClick={() => setSettleOpen(true)}
                        >
                          确认结算
                        </button>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            textAlign: 'center',
                            marginTop: 8,
                          }}
                        >
                          结算后自动打印顾客结账单（局域网 9100）
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {modifyOpen && selectedOrder ? (
        <ModifyModal
          order={selectedOrder}
          menu={menu}
          onClose={() => setModifyOpen(false)}
          onSaved={refreshAll}
        />
      ) : null}

      {returnOpen && selectedOrder ? (
        <ReturnModal
          order={selectedOrder}
          onClose={() => setReturnOpen(false)}
          onSaved={refreshAll}
        />
      ) : null}

      {settleOpen && selectedOrder && shop ? (
        <SettleModal
          order={selectedOrder}
          shop={shop}
          initialMethod={payMethod}
          initialRoundOff={roundOff}
          onClose={() => setSettleOpen(false)}
          onSettled={() => {
            refreshAll();
            setSelectedOrderId(null);
          }}
        />
      ) : null}

      <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} />
    </div>
  );
}
