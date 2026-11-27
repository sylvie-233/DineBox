import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Plus, RefreshCw, RotateCcw } from 'lucide-react';

import type {
  PrintLogPage,
  PrintLogQuery,
  PrintLogRow,
  PrintTemplate,
  Printer,
  PrinterPurpose,
  PrinterSaveInput,
} from '@dinebox/types';
import {
  PRINT_DOC_LABELS,
  PRINT_TEMPLATE_VARS,
  PRINTER_PURPOSE_LABELS,
} from '@dinebox/types';
import { formatDateTime } from '@dinebox/utils';

import { adminFetch, buildQuery } from '@/lib/api';
import { useConfirm } from '@/lib/store/confirm';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { Pagination } from '@/components/pagination';

type PrintTab = 'printers' | 'templates' | 'logs';

interface PrinterFormState {
  id?: number;
  name: string;
  ip: string;
  port: string;
  purpose: PrinterPurpose;
}

const LOG_PAGE_SIZE = 10;

const IP_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

export function PrintersPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [tab, setTab] = useState<PrintTab>('printers');

  const { data: printers, mutate: mutatePrinters } = useSWR<Printer[]>(
    ['/printers'],
    () => adminFetch<Printer[]>('/printers'),
    { revalidateOnFocus: false },
  );
  const { data: templates, mutate: mutateTemplates } = useSWR<{
    KITCHEN: PrintTemplate;
    BILL: PrintTemplate;
  }>(['/printers/templates'], () =>
    adminFetch<{ KITCHEN: PrintTemplate; BILL: PrintTemplate }>('/printers/templates'),
  {
    revalidateOnFocus: false,
  });

  const [printerForm, setPrinterForm] = useState<PrinterFormState | null>(null);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const [kitchenContent, setKitchenContent] = useState('');
  const [billContent, setBillContent] = useState('');
  const kitchenRef = useRef<HTMLTextAreaElement>(null);
  const billRef = useRef<HTMLTextAreaElement>(null);

  const [logKw, setLogKw] = useState('');
  const [logDocType, setLogDocType] = useState('');
  const [logPrinterId, setLogPrinterId] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logDetail, setLogDetail] = useState<PrintLogRow | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const logQueryParams: PrintLogQuery = useMemo(
    () => ({
      kw: logKw.trim() || undefined,
      docType: (logDocType || undefined) as PrintLogQuery['docType'],
      printerId: logPrinterId ? Number(logPrinterId) : undefined,
      status: (logStatus || undefined) as PrintLogQuery['status'],
      page: logPage,
      pageSize: LOG_PAGE_SIZE,
    }),
    [logKw, logDocType, logPrinterId, logStatus, logPage],
  );

  const logQuery = buildQuery({
    kw: logQueryParams.kw,
    docType: logQueryParams.docType,
    printerId: logQueryParams.printerId,
    status: logQueryParams.status,
    page: logQueryParams.page,
    pageSize: logQueryParams.pageSize,
  });

  const { data: logs, isLoading: logsLoading, mutate: mutateLogs } = useSWR<PrintLogPage>(
    ['/printers/logs', logQuery],
    () => adminFetch<PrintLogPage>(`/printers/logs${logQuery}`),
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  useEffect(() => {
    if (templates) {
      setKitchenContent(templates.KITCHEN.content);
      setBillContent(templates.BILL.content);
    }
  }, [templates]);

  useEffect(() => {
    setLogPage(1);
  }, [logKw, logDocType, logPrinterId, logStatus]);

  const openCreatePrinter = (): void => {
    setPrinterForm({ name: '', ip: '', port: '9100', purpose: 'KITCHEN' });
  };

  const openEditPrinter = (printer: Printer): void => {
    setPrinterForm({
      id: printer.id,
      name: printer.name,
      ip: printer.ip,
      port: String(printer.port),
      purpose: printer.purpose,
    });
  };

  const savePrinter = async (): Promise<void> => {
    if (!printerForm) return;
    const name = printerForm.name.trim();
    const ip = printerForm.ip.trim();
    const port = Number(printerForm.port || 9100);
    if (!name) {
      toast('请输入打印机名称', 'error');
      return;
    }
    if (!IP_PATTERN.test(ip)) {
      toast('请输入合法的内网 IPv4 地址', 'error');
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast('端口需在 1-65535 之间', 'error');
      return;
    }
    const payload: PrinterSaveInput = {
      name,
      ip,
      port,
      purpose: printerForm.purpose,
    };
    setSavingPrinter(true);
    try {
      if (printerForm.id) {
        await adminFetch(`/printers/${printerForm.id}`, { method: 'PUT', body: payload });
        toast('打印机已更新', 'success');
      } else {
        await adminFetch('/printers', { method: 'POST', body: payload });
        toast('打印机已添加，状态默认为离线，请点击「测试」验证连通性', 'success');
      }
      setPrinterForm(null);
      await mutatePrinters();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    } finally {
      setSavingPrinter(false);
    }
  };

  const testPrinter = async (printer: Printer): Promise<void> => {
    setTestingId(printer.id);
    try {
      const result = await adminFetch<{ ok: boolean; message: string }>(
        `/printers/${printer.id}/test`,
        { method: 'POST' },
      );
      toast(result.message, result.ok ? 'success' : 'error');
      await Promise.all([mutatePrinters(), mutateLogs()]);
    } catch (testError) {
      toast(testError instanceof Error ? testError.message : '测试失败', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const deletePrinter = async (printer: Printer): Promise<void> => {
    const ok = await confirm({
      title: `删除打印机「${printer.name}」？`,
      text: '删除后该打印机不再接收单据，历史打印日志仍保留。',
      okText: '删除打印机',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/printers/${printer.id}`, { method: 'DELETE' });
      toast('打印机已删除', 'success');
      await mutatePrinters();
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '删除失败', 'error');
    }
  };

  const saveTemplate = async (type: 'KITCHEN' | 'BILL'): Promise<void> => {
    const content = type === 'KITCHEN' ? kitchenContent : billContent;
    if (!content.trim()) {
      toast('模板内容不能为空', 'error');
      return;
    }
    try {
      await adminFetch(`/printers/templates/${type}`, {
        method: 'PUT',
        body: { content },
      });
      toast(`${PRINT_DOC_LABELS[type]}模板已保存，下次打印生效`, 'success');
      await mutateTemplates();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    }
  };

  const resetTemplate = async (type: 'KITCHEN' | 'BILL'): Promise<void> => {
    const ok = await confirm({
      title: `恢复默认${PRINT_DOC_LABELS[type]}模板？`,
      text: '当前编辑内容会被默认模板覆盖，保存后下次打印生效。',
      okText: '恢复默认',
      danger: false,
    });
    if (!ok) return;
    try {
      await adminFetch(`/printers/templates/${type}/reset`, { method: 'POST' });
      toast('已恢复默认模板', 'success');
      await mutateTemplates();
    } catch (resetError) {
      toast(resetError instanceof Error ? resetError.message : '操作失败', 'error');
    }
  };

  const insertVar = (type: 'KITCHEN' | 'BILL', variable: string): void => {
    const ref = type === 'KITCHEN' ? kitchenRef : billRef;
    const value = type === 'KITCHEN' ? kitchenContent : billContent;
    const textarea = ref.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${variable}${value.slice(end)}`;
    if (type === 'KITCHEN') setKitchenContent(next);
    else setBillContent(next);
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const retryLog = async (row: PrintLogRow): Promise<void> => {
    setRetryingId(row.id);
    try {
      const result = await adminFetch<{ ok: boolean; message: string }>(
        `/printers/logs/${row.id}/retry`,
        { method: 'POST' },
      );
      toast(result.message, result.ok ? 'success' : 'error');
      setLogDetail(null);
      await Promise.all([mutateLogs(), mutatePrinters()]);
    } catch (retryError) {
      toast(retryError instanceof Error ? retryError.message : '重打失败', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const deleteLog = async (row: PrintLogRow): Promise<void> => {
    const ok = await confirm({
      title: '删除该打印日志？',
      text: '仅清除日志记录，不影响订单与打印机配置。',
      okText: '删除日志',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/printers/logs/${row.id}`, { method: 'DELETE' });
      toast('日志已删除', 'success');
      setLogDetail(null);
      await mutateLogs();
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '删除失败', 'error');
    }
  };

  const printerList = printers ?? [];
  const onlineCount = printerList.filter((printer) => printer.status === 'ONLINE').length;

  return (
    <div className="page show">
      <div className="seg" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={tab === 'printers' ? 'active' : ''}
          onClick={() => setTab('printers')}
        >
          打印机（{printerList.length}）
        </button>
        <button
          type="button"
          className={tab === 'templates' ? 'active' : ''}
          onClick={() => setTab('templates')}
        >
          小票模板
        </button>
        <button
          type="button"
          className={tab === 'logs' ? 'active' : ''}
          onClick={() => setTab('logs')}
        >
          打印日志
        </button>
      </div>

      {tab === 'printers' ? (
        <div className="card">
          <div className="card-title">
            打印机列表
            <span className="sub">
              局域网 RAW TCP 9100 · ESC/POS · 在线 {onlineCount}/{printerList.length}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn sm" onClick={() => void mutatePrinters()}>
                <RefreshCw size={12} /> 刷新
              </button>
              <button type="button" className="btn primary sm" onClick={openCreatePrinter}>
                <Plus size={12} /> 添加打印机
              </button>
            </span>
          </div>
          {printerList.length === 0 ? (
            <EmptyState
              title="还没有配置打印机"
              text="添加后厨小票机与前台结账单打印机，填写内网静态 IP 与端口 9100"
            />
          ) : (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>打印机名称</th>
                    <th>内网地址</th>
                    <th>用途</th>
                    <th>状态</th>
                    <th>最近测试</th>
                    <th style={{ width: 190 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {printerList.map((printer) => (
                    <tr key={printer.id}>
                      <td style={{ fontWeight: 600 }}>{printer.name}</td>
                      <td className="num">
                        {printer.ip}:{printer.port}
                      </td>
                      <td>{PRINTER_PURPOSE_LABELS[printer.purpose]}</td>
                      <td>
                        <span
                          className={`badge ${
                            printer.status === 'ONLINE' ? 'badge-green' : 'badge-gray'
                          }`}
                        >
                          {printer.status === 'ONLINE' ? '在线' : '离线'}
                        </span>
                      </td>
                      <td className="num mini-muted">{formatDateTime(printer.lastTestAt)}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="btn-text"
                            disabled={testingId === printer.id}
                            onClick={() => void testPrinter(printer)}
                          >
                            {testingId === printer.id ? '测试中…' : '测试'}
                          </button>
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() => openEditPrinter(printer)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btn-text"
                            style={{ color: 'var(--price)' }}
                            onClick={() => void deletePrinter(printer)}
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
          )}
          <div className="form-hint">
            提示：新添加的打印机默认离线。请与门店主机接入同一网段并绑定静态 IP 后，点击「测试」验证连通性；
            同一用途建议仅设一台。打印机离线不影响下单与结算，失败记录可在打印日志中重试。
          </div>
        </div>
      ) : null}

      {tab === 'templates' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              后厨小票模板（ESC/POS）
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn sm" onClick={() => void resetTemplate('KITCHEN')}>
                  <RotateCcw size={12} /> 恢复默认
                </button>
                <button type="button" className="btn primary sm" onClick={() => void saveTemplate('KITCHEN')}>
                  保存
                </button>
              </span>
            </div>
            <div className="tpl-vars">
              {PRINT_TEMPLATE_VARS.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  className="tpl-var"
                  onClick={() => insertVar('KITCHEN', variable)}
                >
                  {variable}
                </button>
              ))}
            </div>
            <div className="field">
              <textarea
                ref={kitchenRef}
                rows={10}
                className="mono"
                value={kitchenContent}
                onChange={(event) => setKitchenContent(event.target.value)}
              />
            </div>
            <div className="form-hint">
              点击变量插入到光标处；保存后下次打印按新模板渲染。后厨小票建议保留 {'{table}'} 与 {'{note}'}，便于出品核对。
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              结账单模板（ESC/POS）
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn sm" onClick={() => void resetTemplate('BILL')}>
                  <RotateCcw size={12} /> 恢复默认
                </button>
                <button type="button" className="btn primary sm" onClick={() => void saveTemplate('BILL')}>
                  保存
                </button>
              </span>
            </div>
            <div className="tpl-vars">
              {PRINT_TEMPLATE_VARS.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  className="tpl-var"
                  onClick={() => insertVar('BILL', variable)}
                >
                  {variable}
                </button>
              ))}
            </div>
            <div className="field">
              <textarea
                ref={billRef}
                rows={10}
                className="mono"
                value={billContent}
                onChange={(event) => setBillContent(event.target.value)}
              />
            </div>
            <div className="form-hint">
              结账单建议保留 {'{total}'} / {'{off}'} / {'{payable}'}，确保金额口径与收银结算一致。
            </div>
          </div>
        </>
      ) : null}

      {tab === 'logs' ? (
        <div className="card">
          <div className="card-title">
            打印日志
            <span className="sub">失败记录醒目标红，可重打或删除（仅清日志不动订单）</span>
            <button type="button" className="btn sm" onClick={() => void mutateLogs()}>
              <RefreshCw size={12} /> 刷新
            </button>
          </div>
          <div className="filter-bar">
            <input
              className="fb-kw"
              value={logKw}
              placeholder="搜索订单号 / 打印机"
              onChange={(event) => setLogKw(event.target.value)}
            />
            <select
              className="fb-dim"
              value={logDocType}
              onChange={(event) => setLogDocType(event.target.value)}
            >
              <option value="">全部单据</option>
              <option value="KITCHEN">后厨小票</option>
              <option value="BILL">顾客结账单</option>
              <option value="TEST">测试页</option>
            </select>
            <select
              className="fb-dim"
              value={logPrinterId}
              onChange={(event) => setLogPrinterId(event.target.value)}
            >
              <option value="">全部打印机</option>
              {printerList.map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {printer.name}
                </option>
              ))}
            </select>
            <select
              className="fb-dim"
              value={logStatus}
              onChange={(event) => setLogStatus(event.target.value)}
            >
              <option value="">全部状态</option>
              <option value="SUCCESS">成功</option>
              <option value="FAIL">失败</option>
            </select>
            <div className="fb-act">
              <span className="fb-count">
                共 <b>{logs?.total ?? 0}</b> 条
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setLogKw('');
                  setLogDocType('');
                  setLogPrinterId('');
                  setLogStatus('');
                }}
              >
                重置
              </button>
            </div>
          </div>

          {logsLoading ? (
            <LoadingRows rows={6} />
          ) : !logs || logs.list.length === 0 ? (
            <EmptyState title="无符合条件的打印记录" text="调整筛选条件后再试" />
          ) : (
            <>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>订单号</th>
                      <th>打印机</th>
                      <th>单据类型</th>
                      <th>状态</th>
                      <th>失败原因</th>
                      <th style={{ width: 160 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.list.map((row) => (
                      <tr key={row.id}>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="num">{row.orderNo || '—'}</td>
                        <td>{row.printerName}</td>
                        <td>{PRINT_DOC_LABELS[row.docType]}</td>
                        <td>
                          <span
                            className={`badge ${row.status === 'SUCCESS' ? 'badge-green' : 'badge-red'}`}
                          >
                            {row.status === 'SUCCESS' ? '成功' : '失败'}
                          </span>
                        </td>
                        <td
                          title={row.failReason}
                          style={{
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: row.status === 'FAIL' ? 'var(--price)' : 'var(--ink-3)',
                            fontSize: 12,
                          }}
                        >
                          {row.failReason || '—'}
                        </td>
                        <td>
                          <div className="inline-actions">
                            <button type="button" className="btn-text" onClick={() => setLogDetail(row)}>
                              详情
                            </button>
                            <button
                              type="button"
                              className="btn-text"
                              disabled={retryingId === row.id}
                              onClick={() => void retryLog(row)}
                            >
                              {retryingId === row.id ? '重打中…' : '重打'}
                            </button>
                            <button
                              type="button"
                              className="btn-text"
                              style={{ color: 'var(--price)' }}
                              onClick={() => void deleteLog(row)}
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
                page={logs.page}
                totalPages={logs.totalPages}
                total={logs.total}
                pageSize={logs.pageSize}
                onChange={setLogPage}
              />
            </>
          )}
        </div>
      ) : null}

      <Modal
        open={Boolean(printerForm)}
        title={printerForm?.id ? '编辑打印机' : '添加打印机'}
        onClose={() => setPrinterForm(null)}
        width={430}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPrinterForm(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={savingPrinter}
              onClick={() => void savePrinter()}
            >
              {savingPrinter ? '保存中…' : '保存打印机'}
            </button>
          </>
        }
      >
        {printerForm ? (
          <>
            <div className="field">
              <label>
                打印机名称 <i className="req">*</i>
              </label>
              <input
                value={printerForm.name}
                placeholder="如：后厨打印机 / 前台打印机"
                onChange={(event) =>
                  setPrinterForm((previous) =>
                    previous ? { ...previous, name: event.target.value } : previous,
                  )
                }
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1.5 }}>
                <label>
                  内网 IP <i className="req">*</i>
                </label>
                <input
                  value={printerForm.ip}
                  placeholder="192.168.1.54"
                  onChange={(event) =>
                    setPrinterForm((previous) =>
                      previous ? { ...previous, ip: event.target.value } : previous,
                    )
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>端口</label>
                <input
                  type="number"
                  value={printerForm.port}
                  onChange={(event) =>
                    setPrinterForm((previous) =>
                      previous ? { ...previous, port: event.target.value } : previous,
                    )
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>
                用途 <i className="req">*</i>
              </label>
              <select
                value={printerForm.purpose}
                style={{ width: '100%', height: 40 }}
                onChange={(event) =>
                  setPrinterForm((previous) =>
                    previous
                      ? { ...previous, purpose: event.target.value as PrinterPurpose }
                      : previous,
                  )
                }
              >
                <option value="KITCHEN">后厨小票</option>
                <option value="BILL">顾客结账单</option>
                <option value="ALL">后厨小票 + 结账单</option>
              </select>
            </div>
            <div className="form-hint">
              要求打印机支持 RAW TCP 9100 / ESC-POS，并与门店主机同网段；路由器需绑定静态 IP，
              防止 IP 变动导致打印失效。新打印机保存后默认离线，请点击「测试」验证。
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(logDetail)}
        title="打印日志详情"
        onClose={() => setLogDetail(null)}
        width={430}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setLogDetail(null)}>
              关闭
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => logDetail && void retryLog(logDetail)}
            >
              <RotateCcw size={12} /> 重打单据
            </button>
          </>
        }
      >
        {logDetail ? (
          <div>
            {[
              ['日志编号', `#${logDetail.id}`],
              ['打印时间', logDetail.createdAt],
              ['订单号', logDetail.orderNo || '测试打印'],
              ['打印机', `${logDetail.printerName}（${logDetail.printerIp}:${logDetail.printerPort}）`],
              ['单据类型', PRINT_DOC_LABELS[logDetail.docType]],
              ['打印状态', logDetail.status === 'SUCCESS' ? '成功' : '失败'],
              ['失败原因', logDetail.failReason || '—'],
              ['触发人', logDetail.printedByName],
              ['累计重打', `${logDetail.retryCount} 次`],
            ].map(([label, value]) => (
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
                <span style={{ width: 76, color: 'var(--ink-3)', fontSize: 12, flexShrink: 0 }}>
                  {label}
                </span>
                <span
                  style={{
                    flex: 1,
                    wordBreak: 'break-all',
                    lineHeight: 1.7,
                    color:
                      label === '打印状态' && logDetail.status === 'FAIL'
                        ? 'var(--price)'
                        : undefined,
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
