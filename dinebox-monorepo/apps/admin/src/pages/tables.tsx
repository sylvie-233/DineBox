import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import QRCode from 'qrcode';
import { Copy, Download, Plus, RefreshCw, Upload } from 'lucide-react';

import type { DiningArea, DiningTable, LiveTableStatus } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { useConfirm } from '@/lib/store/confirm';
import { usePrompt } from '@/lib/store/prompt';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';

interface TablesData {
  areas: DiningArea[];
  tables: DiningTable[];
}

interface TableFormState {
  id?: number;
  name: string;
  areaId: string;
  seats: string;
}

const STATUS_LABELS: Record<LiveTableStatus, string> = {
  FREE: '空闲',
  OCCUPIED: '待结算',
  HUNG: '挂单',
};

const STATUS_TAGS: Record<LiveTableStatus, string> = {
  FREE: 'tag off',
  OCCUPIED: 'tag pending',
  HUNG: 'tag hold',
};

function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function TablesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { prompt } = usePrompt();
  const { data, error, isLoading, mutate } = useSWR<TablesData>(['/tables'], () =>
    adminFetch<TablesData>('/tables'),
  );

  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [tableForm, setTableForm] = useState<TableFormState | null>(null);
  const [savingTable, setSavingTable] = useState(false);
  const [qrTable, setQrTable] = useState<DiningTable | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkQrs, setBulkQrs] = useState<Array<{ table: DiningTable; dataUrl: string }>>([]);

  const areas = data?.areas ?? [];
  const tables = data?.tables ?? [];
  const visibleTables = useMemo(
    () => (selectedAreaId ? tables.filter((table) => table.areaId === selectedAreaId) : tables),
    [tables, selectedAreaId],
  );

  useEffect(() => {
    if (!qrTable) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrTable.qrLink, {
      margin: 1,
      width: 360,
      color: { dark: '#17181c', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [qrTable]);

  useEffect(() => {
    if (!bulkOpen || tables.length === 0) {
      setBulkQrs([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      tables.map(async (table) => ({
        table,
        dataUrl: await QRCode.toDataURL(table.qrLink, {
          margin: 1,
          width: 240,
          color: { dark: '#17181c', light: '#ffffff' },
        }),
      })),
    ).then((result) => {
      if (!cancelled) setBulkQrs(result);
    });
    return () => {
      cancelled = true;
    };
  }, [bulkOpen, tables]);

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
          <EmptyState title="桌台加载失败" text={error?.message} />
        </div>
      </div>
    );
  }

  const addArea = async (): Promise<void> => {
    const name = await prompt({
      title: '新增区域',
      label: '区域名称',
      placeholder: '如：D区 / 露台',
    });
    if (!name) return;
    try {
      await adminFetch('/tables/areas', { method: 'POST', body: { name } });
      toast('区域已新增', 'success');
      await mutate();
    } catch (areaError) {
      toast(areaError instanceof Error ? areaError.message : '新增失败', 'error');
    }
  };

  const renameArea = async (area: DiningArea): Promise<void> => {
    const name = await prompt({
      title: '重命名区域',
      label: '区域名称',
      defaultValue: area.name,
    });
    if (!name || name === area.name) return;
    try {
      await adminFetch(`/tables/areas/${area.id}`, {
        method: 'PUT',
        body: { name },
      });
      toast('区域已更新', 'success');
      await mutate();
    } catch (areaError) {
      toast(areaError instanceof Error ? areaError.message : '更新失败', 'error');
    }
  };

  const deleteArea = async (area: DiningArea): Promise<void> => {
    const ok = await confirm({
      title: `删除区域「${area.name}」？`,
      text: '区域下必须没有桌台才能删除。删除后不影响历史订单。',
      okText: '删除区域',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/tables/areas/${area.id}`, { method: 'DELETE' });
      toast('区域已删除', 'success');
      if (selectedAreaId === area.id) setSelectedAreaId(null);
      await mutate();
    } catch (areaError) {
      toast(areaError instanceof Error ? areaError.message : '删除失败', 'error');
    }
  };

  const moveArea = async (area: DiningArea, direction: 'up' | 'down'): Promise<void> => {
    try {
      await adminFetch(`/tables/areas/${area.id}/move`, {
        method: 'POST',
        body: { direction },
      });
      await mutate();
    } catch (areaError) {
      toast(areaError instanceof Error ? areaError.message : '排序失败', 'error');
    }
  };

  const openCreateTable = (): void => {
    setTableForm({
      name: '',
      areaId: String(selectedAreaId ?? areas[0]?.id ?? ''),
      seats: '',
    });
  };

  const openEditTable = (table: DiningTable): void => {
    setTableForm({
      id: table.id,
      name: table.name,
      areaId: String(table.areaId),
      seats: table.seats ? String(table.seats) : '',
    });
  };

  const saveTable = async (): Promise<void> => {
    if (!tableForm) return;
    const name = tableForm.name.trim();
    if (!name) {
      toast('请输入桌号', 'error');
      return;
    }
    if (!tableForm.areaId) {
      toast('请选择所属区域', 'error');
      return;
    }
    setSavingTable(true);
    try {
      const body = {
        name,
        areaId: Number(tableForm.areaId),
        seats: tableForm.seats ? Number(tableForm.seats) : null,
      };
      if (tableForm.id) {
        await adminFetch(`/tables/tables/${tableForm.id}`, { method: 'PUT', body });
        toast('桌台已更新', 'success');
      } else {
        await adminFetch('/tables/tables', { method: 'POST', body });
        toast('桌台已新增', 'success');
      }
      setTableForm(null);
      await mutate();
    } catch (tableError) {
      toast(tableError instanceof Error ? tableError.message : '保存失败', 'error');
    } finally {
      setSavingTable(false);
    }
  };

  const deleteTable = async (table: DiningTable): Promise<void> => {
    const ok = await confirm({
      title: `删除桌台「${table.name}」？`,
      text: '有未结算订单的桌台不能删除；历史订单与打印日志不受影响。',
      okText: '删除桌台',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/tables/tables/${table.id}`, { method: 'DELETE' });
      toast('桌台已删除', 'success');
      await mutate();
    } catch (tableError) {
      toast(tableError instanceof Error ? tableError.message : '删除失败', 'error');
    }
  };

  const copyLink = async (table: DiningTable): Promise<void> => {
    try {
      await navigator.clipboard.writeText(table.qrLink);
      toast('点桌链接已复制', 'success');
    } catch {
      toast(table.qrLink);
    }
  };

  const downloadAll = (): void => {
    bulkQrs.forEach((item, index) => {
      window.setTimeout(
        () => downloadDataUrl(item.dataUrl, `DineBox-${item.table.name}-二维码.png`),
        index * 220,
      );
    });
    toast(`开始下载 ${bulkQrs.length} 张二维码`, 'success');
  };

  return (
    <div className="page show">
      <div className="dish-layout">
        <div className="cat-panel">
          <div className="card">
            <div className="card-title">
              桌台区域
              <span className="sub">悬停可编辑 / 排序</span>
              <button type="button" className="btn sm" onClick={() => void addArea()}>
                <Plus size={12} />
              </button>
            </div>
            <button
              type="button"
              className={`cat-item ${selectedAreaId === null ? 'active' : ''}`}
              onClick={() => setSelectedAreaId(null)}
            >
              <span>全部桌台</span>
              <span className="cnt">{tables.length}</span>
            </button>
            {areas.map((area) => (
              <div
                key={area.id}
                className={`cat-item ${selectedAreaId === area.id ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedAreaId(area.id)}
                role="presentation"
              >
                <span>{area.name}</span>
                <span className="cnt">{area.tableCount ?? 0}</span>
                <span className="cops" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="cbtn"
                    title="上移"
                    onClick={() => void moveArea(area, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="cbtn"
                    title="下移"
                    onClick={() => void moveArea(area, 'down')}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="cbtn"
                    title="重命名"
                    onClick={() => void renameArea(area)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="cbtn"
                    title="删除"
                    onClick={() => void deleteArea(area)}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
            <div className="cat-foot num">
              共 <b>{areas.length}</b> 个区域 · <b>{tables.length}</b> 张桌台
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card">
            <div className="card-title">
              <span>
                {selectedAreaId
                  ? areas.find((area) => area.id === selectedAreaId)?.name ?? '桌台'
                  : '全部桌台'}
                <span className="sub" style={{ marginLeft: 6 }}>
                  {visibleTables.length} 张
                </span>
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn sm" onClick={() => void mutate()}>
                  <RefreshCw size={12} /> 刷新
                </button>
                <button type="button" className="btn sm" onClick={() => setBulkOpen(true)}>
                  <Upload size={12} /> 批量生成二维码
                </button>
                <button type="button" className="btn primary sm" onClick={openCreateTable}>
                  ＋ 新增桌台
                </button>
              </span>
            </div>

            {visibleTables.length === 0 ? (
              <EmptyState title="该区域暂无桌台" text="点击右上角「新增桌台」开始配置" />
            ) : (
              <OrderedTableTable
                tables={visibleTables}
                onQr={setQrTable}
                onEdit={openEditTable}
                onDelete={(table) => void deleteTable(table)}
              />
            )}
            <div className="form-hint">
              桌台实时状态由未结订单推导：空闲 / 待结算 / 挂单；点击「二维码」查看或下载单桌点餐码。
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(tableForm)}
        title={tableForm?.id ? '编辑桌台' : '新增桌台'}
        onClose={() => setTableForm(null)}
        width={400}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setTableForm(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={savingTable}
              onClick={() => void saveTable()}
            >
              {savingTable ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {tableForm ? (
          <>
            <div className="field">
              <label>
                桌号 <i className="req">*</i>
              </label>
              <input
                value={tableForm.name}
                placeholder="如：D-02 / 包间-02"
                maxLength={32}
                onChange={(event) =>
                  setTableForm((previous) =>
                    previous ? { ...previous, name: event.target.value } : previous,
                  )
                }
              />
            </div>
            <div className="field">
              <label>
                所属区域 <i className="req">*</i>
              </label>
              <select
                value={tableForm.areaId}
                style={{ width: '100%', height: 40 }}
                onChange={(event) =>
                  setTableForm((previous) =>
                    previous ? { ...previous, areaId: event.target.value } : previous,
                  )
                }
              >
                <option value="">请选择区域</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <div className="form-hint">区域在左侧「桌台区域」中维护；收银台按区域分组展示桌台。</div>
            </div>
            <div className="field">
              <label>容纳人数（选填）</label>
              <input
                type="number"
                min={1}
                max={99}
                value={tableForm.seats}
                placeholder="如 4"
                onChange={(event) =>
                  setTableForm((previous) =>
                    previous ? { ...previous, seats: event.target.value } : previous,
                  )
                }
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(qrTable)}
        title={`点桌二维码 · ${qrTable?.name ?? ''}`}
        onClose={() => setQrTable(null)}
        width={360}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setQrTable(null)}>
              关闭
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => qrTable && void copyLink(qrTable)}
            >
              <Copy size={12} /> 复制链接
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                qrTable &&
                qrDataUrl &&
                downloadDataUrl(qrDataUrl, `DineBox-${qrTable.name}-二维码.png`)
              }
            >
              <Download size={12} /> 下载图片
            </button>
          </>
        }
      >
        {qrTable ? (
          <div style={{ textAlign: 'center' }}>
            {qrDataUrl ? (
              <img className="qr-image" src={qrDataUrl} alt={`${qrTable.name} 二维码`} />
            ) : (
              <div className="qr-image" style={{ background: 'var(--primary-weak)' }} />
            )}
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {qrTable.name} · {qrTable.areaName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              顾客扫码即锁定该桌台，桌号不可手动修改
            </div>
            <div
              className="mono"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '8px 10px',
                marginTop: 12,
                textAlign: 'left',
                wordBreak: 'break-all',
                fontSize: 11,
              }}
            >
              {qrTable.qrLink}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={bulkOpen}
        title="桌台二维码批量生成"
        onClose={() => setBulkOpen(false)}
        width={620}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setBulkOpen(false)}>
              关闭
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={bulkQrs.length === 0}
              onClick={downloadAll}
            >
              <Download size={12} /> 下载全部图片
            </button>
          </>
        }
      >
        <div className="form-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          共 {tables.length} 张桌台二维码。打印桌贴后张贴在桌面，顾客扫码即带桌号进入点餐页；
          手机扫码需把 H5_PUBLIC_URL 配为店内局域网 IP。
        </div>
        {bulkQrs.length === 0 ? (
          <LoadingRows rows={3} />
        ) : (
          <div className="qr-card-grid">
            {bulkQrs.map(({ table, dataUrl }) => (
              <div className="qr-card" key={table.id}>
                <img src={dataUrl} alt={`${table.name} 二维码`} />
                <b className="num" style={{ fontSize: 13 }}>
                  {table.name}
                </b>
                <span className="mini-muted">{table.areaName}</span>
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => {
                    setBulkOpen(false);
                    setQrTable(table);
                  }}
                >
                  查看 / 下载
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function OrderedTableTable({
  tables,
  onQr,
  onEdit,
  onDelete,
}: {
  tables: DiningTable[];
  onQr: (table: DiningTable) => void;
  onEdit: (table: DiningTable) => void;
  onDelete: (table: DiningTable) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>桌号</th>
            <th>所属区域</th>
            <th>状态</th>
            <th>未结订单</th>
            <th>未结金额</th>
            <th>二维码</th>
            <th style={{ width: 160 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={table.id}>
              <td className="num" style={{ fontWeight: 700 }}>
                {table.name}
                {table.seats ? <span className="mini-muted"> · {table.seats} 人</span> : null}
              </td>
              <td>{table.areaName}</td>
              <td>
                <span className={STATUS_TAGS[table.status]}>{STATUS_LABELS[table.status]}</span>
              </td>
              <td className="num">{table.pendingOrderCount}</td>
              <td className="num" style={{ color: 'var(--price)', fontWeight: 600 }}>
                ¥{formatMoney(table.pendingAmount)}
              </td>
              <td>
                <button type="button" className="btn-text" onClick={() => onQr(table)}>
                  二维码
                </button>
              </td>
              <td>
                <div className="inline-actions">
                  <button type="button" className="btn-text" onClick={() => onEdit(table)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    style={{ color: 'var(--price)' }}
                    onClick={() => onDelete(table)}
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
  );
}
