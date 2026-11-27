import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  FileCode2,
  FileUp,
  FlaskConical,
  HardDriveDownload,
  LoaderCircle,
  Printer,
  Radio,
  RefreshCw,
  ScanLine,
  Server,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, base64ToBytes, formatBytes, hexToBytes } from './lib/api';
import { downloadCanvas, renderReceipt } from './renderer/renderReceipt';
import type {
  EscPosEncoding,
  JobDetail,
  JobSource,
  JobSummary,
  PaperWidth,
  SampleInfo,
  ServerInfo,
} from './types';

type Tab = 'preview' | 'tokens' | 'hex' | 'text';
type InputMode = 'samples' | 'hex' | 'text' | 'upload';

const SOURCE_LABELS: Record<JobSource, string> = {
  tcp: 'TCP',
  http: 'HTTP',
  manual: '手动',
  text: '文本',
  sample: '示例',
};

const ENCODING_LABELS: Record<EscPosEncoding, string> = {
  gbk: 'GBK',
  utf8: 'UTF-8',
  cp437: 'CP437',
  cp850: 'CP850',
  latin1: 'Latin-1',
};

const HEX_LIMIT = 8192;
const TOKEN_LIMIT = 1200;

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('zh-CN', { hour12: false });
}

function isContainerAddress(ip: string): boolean {
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

function sourceClass(source: JobSource): string {
  return `source source-${source}`;
}

function StatusDot({ live }: { live: boolean }) {
  return <span className={`status-dot ${live ? 'is-live' : ''}`} aria-hidden="true" />;
}

function EmptyReceipt({ onSample }: { onSample: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-printer">
        <Printer size={40} strokeWidth={1.5} />
        <span className="empty-pulse" />
      </div>
      <h2>等待打印任务</h2>
      <p>
        把商家端的打印机指向本服务的 TCP 地址，或在左侧发送一单示例。
        收到字节后会立即解析并在这里模拟出纸。
      </p>
      <button type="button" className="btn btn-primary" onClick={onSample}>
        <Zap size={14} /> 打印一张示例小票
      </button>
      <div className="empty-hints">
        <span>
          <Radio size={12} /> RAW TCP
        </span>
        <span>
          <Server size={12} /> HTTP API
        </span>
        <span>
          <ScanLine size={12} /> ESC/POS 解析
        </span>
      </div>
    </div>
  );
}

function HexView({ raw }: { raw: string }) {
  const bytes = useMemo(() => base64ToBytes(raw), [raw]);
  const visible = bytes.subarray(0, HEX_LIMIT);
  const rows = useMemo(() => {
    const result: { offset: string; hex: string; ascii: string }[] = [];
    for (let index = 0; index < visible.length; index += 16) {
      const slice = visible.subarray(index, index + 16);
      const hex = Array.from(slice)
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      const ascii = Array.from(slice)
        .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'))
        .join('');
      result.push({
        offset: index.toString(16).padStart(8, '0').toUpperCase(),
        hex,
        ascii,
      });
    }
    return result;
  }, [visible]);

  return (
    <div className="hex-panel">
      <div className="code-block hex-code">
        {rows.map((row) => (
          <div className="hex-row" key={row.offset}>
            <span className="hex-offset">{row.offset}</span>
            <span className="hex-bytes">{row.hex.padEnd(47, ' ')}</span>
            <span className="hex-ascii">{row.ascii}</span>
          </div>
        ))}
      </div>
      {bytes.length > HEX_LIMIT ? (
        <div className="hint-line">
          仅显示前 {HEX_LIMIT} 字节，共 {formatBytes(bytes.length)}。可下载原始 .bin 查看完整内容。
        </div>
      ) : null}
    </div>
  );
}

function TokenTable({ job, filter }: { job: JobDetail; filter: string }) {
  const keyword = filter.trim().toLowerCase();
  const tokens = useMemo(() => {
    const list = job.parsed.tokens;
    if (!keyword) {
      return list.slice(0, TOKEN_LIMIT);
    }
    return list
      .filter((token) =>
        `${token.code} ${token.name} ${token.description} ${token.hex}`
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, TOKEN_LIMIT);
  }, [job.parsed.tokens, keyword]);

  return (
    <div className="token-panel">
      <table className="token-table">
        <thead>
          <tr>
            <th>偏移</th>
            <th>指令</th>
            <th>说明</th>
            <th>参数</th>
            <th className="num">字节</th>
            <th>HEX</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, index) => (
            <tr
              key={`${token.offset}-${index}`}
              className={token.kind === 'unknown' ? 'is-unknown' : token.kind === 'text' ? 'is-text' : ''}
            >
              <td className="mono muted">{token.offset.toString(16).padStart(6, '0')}</td>
              <td>
                <code className={`code-pill ${token.kind}`}>{token.code}</code>
              </td>
              <td className="desc">{token.description}</td>
              <td className="mono muted">{token.params.length ? token.params.join(', ') : '—'}</td>
              <td className="num mono">{token.length}</td>
              <td className="mono hex-cell">
                {token.hex}
                {token.hexTruncated ? ' …' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tokens.length === 0 ? <div className="table-empty">没有匹配的指令</div> : null}
      {job.parsed.tokens.length > TOKEN_LIMIT && !keyword ? (
        <div className="hint-line">
          仅显示前 {TOKEN_LIMIT} 条，共 {job.parsed.tokens.length} 条。使用筛选缩小范围。
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [autoSelect, setAutoSelect] = useState(true);
  const autoSelectRef = useRef(autoSelect);
  const [tab, setTab] = useState<Tab>('preview');
  const [inputMode, setInputMode] = useState<InputMode>('samples');
  const [encoding, setEncoding] = useState<EscPosEncoding>('gbk');
  const [paper, setPaper] = useState<PaperWidth>(() => {
    const saved = localStorage.getItem('dinebox-escpos-paper');
    return saved === '80' ? '80' : '58';
  });
  const [hex, setHex] = useState('1B 40 1C 26 1B 61 01 1B 21 30 48 65 6C 6C 6F 0A 1B 64 03 1D 56 00');
  const [text, setText] = useState('【测试小票】\n欢迎使用 ESC/POS 虚拟打印机\n------------------------\n这条小票来自纯文本输入\n');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [tokenFilter, setTokenFilter] = useState('');
  const [renderInfo, setRenderInfo] = useState<{ width: number; height: number; warnings: string[] } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    autoSelectRef.current = autoSelect;
  }, [autoSelect]);

  useEffect(() => {
    localStorage.setItem('dinebox-escpos-paper', paper);
  }, [paper]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const showNotice = useCallback((kind: 'ok' | 'error', message: string) => {
    setNotice({ kind, message });
  }, []);

  const selectJob = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setJobLoading(true);
      try {
        const detail = await api.job(id);
        setJob(detail);
        setTab('preview');
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : '读取打印任务失败');
      } finally {
        setJobLoading(false);
      }
    },
    [showNotice],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .info()
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
        }
      })
      .catch(() => undefined);
    api
      .samples()
      .then((data) => {
        if (!cancelled) {
          setSamples(data);
        }
      })
      .catch(() => undefined);
    api
      .jobs()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setJobs(data);
        if (data[0]) {
          void selectJob(data[0].id);
        }
      })
      .catch((error) => showNotice('error', error instanceof Error ? error.message : '读取任务失败'));

    const source = new EventSource('/api/events');
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('hello', (event) => {
      const message = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(message.data) as { info: ServerInfo; jobs: JobSummary[] };
        setInfo(payload.info);
        setJobs(payload.jobs);
        setLive(true);
      } catch {
        // 忽略格式异常
      }
    });
    source.addEventListener('job', (event) => {
      const message = event as MessageEvent<string>;
      try {
        const summary = JSON.parse(message.data) as JobSummary;
        setJobs((previous) => [summary, ...previous.filter((item) => item.id !== summary.id)].slice(0, 50));
        if (autoSelectRef.current) {
          void selectJob(summary.id);
        }
      } catch {
        // 忽略格式异常
      }
    });

    const infoTimer = window.setInterval(() => {
      api
        .info()
        .then((data) => {
          if (!cancelled) {
            setInfo(data);
          }
        })
        .catch(() => undefined);
    }, 15_000);

    return () => {
      cancelled = true;
      source.close();
      window.clearInterval(infoTimer);
    };
  }, [selectJob, showNotice]);

  useEffect(() => {
    if (tab !== 'preview' || !job) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let cancelled = false;
    renderReceipt(canvas, job.parsed, { paper })
      .then((result) => {
        if (!cancelled) {
          setRenderInfo(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRenderInfo({
            width: 0,
            height: 0,
            warnings: [error instanceof Error ? error.message : '小票渲染失败'],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job, paper, tab]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<JobSummary>) => {
      setBusy(label);
      try {
        const summary = await action();
        setJobs((previous) => [summary, ...previous.filter((item) => item.id !== summary.id)].slice(0, 50));
        await selectJob(summary.id);
        showNotice('ok', `${SOURCE_LABELS[summary.source]}任务已发送`);
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : '发送失败');
      } finally {
        setBusy(null);
      }
    },
    [selectJob, showNotice],
  );

  const sendHex = (): void => {
    try {
      const bytes = hexToBytes(hex);
      void runAction('hex', () => api.createJob(bytes, { encoding, source: 'manual' }));
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'HEX 格式错误');
    }
  };

  const sendText = (): void => {
    if (!text.trim()) {
      showNotice('error', '请输入小票文本');
      return;
    }
    void runAction('text', () => api.createText(text, encoding));
  };

  const sendSample = (id = 'kitchen'): void => {
    void runAction(`sample-${id}`, () => api.createSample(id));
  };

  const sendFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }
    void runAction('upload', async () => {
      const buffer = await file.arrayBuffer();
      return api.createJob(new Uint8Array(buffer), { encoding, source: 'manual' });
    });
  };

  const clearJobs = async (): Promise<void> => {
    try {
      await api.clearJobs();
      setJobs([]);
      setJob(null);
      setSelectedId(null);
      showNotice('ok', '任务记录已清空');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : '清空失败');
    }
  };

  const copy = async (value: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      showNotice('ok', `${label}已复制`);
    } catch {
      showNotice('error', '浏览器拒绝了剪贴板访问');
    }
  };

  const downloadPng = (): void => {
    if (!canvasRef.current || !job) {
      return;
    }
    downloadCanvas(canvasRef.current, `escpos-${job.id}.png`);
  };

  const downloadBin = (): void => {
    if (!job) {
      return;
    }
    const bytes = base64ToBytes(job.raw);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `escpos-${job.id}.bin`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tcpAddress = info
    ? `${info.lanIps[0] ?? '127.0.0.1'}:${info.tcp.advertisePort}`
    : '127.0.0.1:9102';

  const allWarnings = [...(job?.parsed.warnings ?? []), ...(renderInfo?.warnings ?? [])];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">希</span>
          <div>
            <h1>ESC/POS 虚拟打印机</h1>
            <p>指令解析 · 热敏小票模拟 · 局域网接入</p>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`connection ${live ? 'is-live' : ''}`}>
            <StatusDot live={live} />
            {live ? '实时连接' : '连接中断'}
          </span>
          <span className="chip">
            <Wifi size={13} /> TCP :{info?.tcp.advertisePort ?? 9102}
          </span>
          <span className="chip">
            <Server size={13} /> HTTP :{info?.httpPort ?? 3200}
          </span>
          {info && !info.tcp.listening ? (
            <span className="chip chip-warn" title={info.tcp.error ?? ''}>
              <WifiOff size={13} /> TCP 未监听
            </span>
          ) : null}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="panel access-panel">
            <div className="panel-title">
              <span>
                <Radio size={14} /> 接入地址
              </span>
              <span className="tag">RAW TCP</span>
            </div>
            <p className="panel-desc">
              在商家端「打印配置」新增打印机，IP 填下面地址，端口 {info?.tcp.advertisePort ?? 9102}，用途任选。
            </p>
            <div className="address-row">
              <code>{tcpAddress}</code>
              <button
                type="button"
                className="icon-btn"
                title="复制 TCP 地址"
                onClick={() => void copy(tcpAddress, 'TCP 地址')}
              >
                <Copy size={14} />
              </button>
            </div>
            {info && !info.publicHost && info.lanIps.every(isContainerAddress) ? (
              <div className="address-warn">
                这是容器内网地址。请在 scripts/.env 设置 ESCPOS_PUBLIC_HOST 为宿主机局域网 IP，
                再执行 manage.ps1 up -Target escpos。
              </div>
            ) : null}
            {info && info.lanIps.length > 1 ? (
              <div className="ip-list">
                {info.lanIps.slice(0, 4).map((ip) => (
                  <button
                    type="button"
                    key={ip}
                    className="ip-chip"
                    onClick={() => void copy(`${ip}:${info.tcp.advertisePort}`, 'TCP 地址')}
                  >
                    {ip}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="access-foot">
              <span>无需驱动与纸张</span>
              <span className="dot-sep" />
              <span>支持 GBK 中文</span>
            </div>
          </section>

          <section className="panel input-panel">
            <div className="panel-title">
              <span>
                <HardDriveDownload size={14} /> 打印输入
              </span>
            </div>
            <div className="segmented">
              {(
                [
                  ['samples', '示例'],
                  ['hex', 'HEX'],
                  ['text', '文本'],
                  ['upload', '文件'],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={inputMode === value ? 'is-active' : ''}
                  onClick={() => setInputMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {inputMode === 'samples' ? (
              <div className="sample-list">
                {samples.map((sample) => (
                  <button
                    type="button"
                    className="sample-card"
                    key={sample.id}
                    disabled={busy !== null}
                    onClick={() => sendSample(sample.id)}
                  >
                    <span className="sample-icon">
                      {sample.id === 'kitchen' ? <FlaskConical size={15} /> : <ScanLine size={15} />}
                    </span>
                    <span className="sample-copy">
                      <strong>{sample.name}</strong>
                      <small>{sample.description}</small>
                    </span>
                    {busy === `sample-${sample.id}` ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                ))}
                {samples.length === 0 ? <div className="hint-line">示例加载中…</div> : null}
              </div>
            ) : null}

            {inputMode === 'hex' ? (
              <div className="input-stack">
                <textarea
                  className="code-input"
                  rows={6}
                  value={hex}
                  spellCheck={false}
                  placeholder="1B 40 1C 26 1B 61 01 ..."
                  onChange={(event) => setHex(event.target.value)}
                />
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={sendHex}>
                  {busy === 'hex' ? <LoaderCircle size={14} className="spin" /> : <Zap size={14} />}
                  解析并打印
                </button>
              </div>
            ) : null}

            {inputMode === 'text' ? (
              <div className="input-stack">
                <textarea
                  className="code-input"
                  rows={6}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={sendText}>
                  {busy === 'text' ? <LoaderCircle size={14} className="spin" /> : <Printer size={14} />}
                  生成小票
                </button>
                <div className="hint-line">服务端会补上初始化、中文模式、走纸与切纸指令。</div>
              </div>
            ) : null}

            {inputMode === 'upload' ? (
              <div className="input-stack">
                <input
                  ref={fileRef}
                  className="hidden-input"
                  type="file"
                  accept=".bin,.prn,.escpos,.dat,application/octet-stream"
                  onChange={(event) => {
                    sendFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="drop-zone"
                  disabled={busy !== null}
                  onClick={() => fileRef.current?.click()}
                >
                  {busy === 'upload' ? (
                    <LoaderCircle size={20} className="spin" />
                  ) : (
                    <FileUp size={20} />
                  )}
                  <strong>选择 ESC/POS 原始文件</strong>
                  <small>.bin / .prn / .escpos，最大 1 MB</small>
                </button>
              </div>
            ) : null}

            <div className="input-foot">
              <label>
                文本编码
                <select
                  value={encoding}
                  onChange={(event) => setEncoding(event.target.value as EscPosEncoding)}
                >
                  {Object.entries(ENCODING_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="hint-inline">TCP 固定按 GBK 解析</span>
            </div>
          </section>

          <section className="panel jobs-panel">
            <div className="panel-title">
              <span>
                <Clipboard size={14} /> 任务记录
                <em>{jobs.length}</em>
              </span>
              <button
                type="button"
                className="icon-btn"
                title="清空任务"
                onClick={() => void clearJobs()}
                disabled={jobs.length === 0}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label className="auto-select">
              <input
                type="checkbox"
                checked={autoSelect}
                onChange={(event) => setAutoSelect(event.target.checked)}
              />
              新任务自动打开
            </label>
            <div className="job-list">
              {jobs.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`job-card ${selectedId === item.id ? 'is-active' : ''}`}
                  onClick={() => void selectJob(item.id)}
                >
                  <span className="job-top">
                    <span className={sourceClass(item.source)}>{SOURCE_LABELS[item.source]}</span>
                    <span className="job-time">{timeLabel(item.createdAt)}</span>
                    {item.unknownCount > 0 ? (
                      <span className="job-warn" title={`${item.unknownCount} 条未知指令`}>
                        <AlertTriangle size={11} />
                      </span>
                    ) : null}
                  </span>
                  <strong className="job-title">{item.title}</strong>
                  <span className="job-meta">
                    {formatBytes(item.bytes)} · {item.commandCount} 指令
                  </span>
                </button>
              ))}
              {jobs.length === 0 ? (
                <div className="job-empty">
                  <Printer size={20} />
                  <span>还没有打印任务</span>
                </div>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="main">
          {job ? (
            <>
              <div className="job-header">
                <div className="job-heading">
                  <span className={sourceClass(job.source)}>{SOURCE_LABELS[job.source]}</span>
                  <h2>{job.title}</h2>
                  <div className="job-sub">
                    <span>{dateLabel(job.createdAt)}</span>
                    <span className="dot-sep" />
                    <span>{formatBytes(job.bytes)}</span>
                    <span className="dot-sep" />
                    <span>{ENCODING_LABELS[job.encoding]}</span>
                    <span className="dot-sep" />
                    <span>{job.parsed.stats.commands} 条指令</span>
                    {job.unknownCount > 0 ? (
                      <>
                        <span className="dot-sep" />
                        <span className="warn-text">{job.unknownCount} 条未知</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="job-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => void selectJob(job.id)}>
                    <RefreshCw size={13} /> 重新解析
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={downloadPng} disabled={tab !== 'preview'}>
                    <Download size={13} /> PNG
                  </button>
                </div>
              </div>

              <div className="view-bar">
                <div className="tabs">
                  {(
                    [
                      ['preview', '小票预览'],
                      ['tokens', `指令解析 (${job.parsed.tokens.length})`],
                      ['hex', 'HEX'],
                      ['text', '纯文本'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={tab === value ? 'is-active' : ''}
                      onClick={() => setTab(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="view-tools">
                  {tab === 'preview' ? (
                    <>
                      <div className="paper-switch" role="group" aria-label="纸张宽度">
                        <button
                          type="button"
                          className={paper === '58' ? 'is-active' : ''}
                          onClick={() => setPaper('58')}
                        >
                          58mm · 32 字
                        </button>
                        <button
                          type="button"
                          className={paper === '80' ? 'is-active' : ''}
                          onClick={() => setPaper('80')}
                        >
                          80mm · 48 字
                        </button>
                      </div>
                      <span className="hint-inline">
                        {renderInfo ? `${renderInfo.width} × ${renderInfo.height} dot` : ''}
                      </span>
                    </>
                  ) : null}
                  {tab === 'hex' ? (
                    <>
                      <button type="button" className="btn btn-ghost" onClick={() => void copy(job.raw, 'Base64')}>
                        <Copy size={13} /> 复制 Base64
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={downloadBin}>
                        <Download size={13} /> .bin
                      </button>
                    </>
                  ) : null}
                  {tab === 'text' ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        void copy(job.parsed.plainText || '', '纯文本')
                      }
                    >
                      <Copy size={13} /> 复制
                    </button>
                  ) : null}
                </div>
              </div>

              {allWarnings.length > 0 ? (
                <div className="warning-bar">
                  <AlertTriangle size={14} />
                  <span>{allWarnings[0]}</span>
                  {allWarnings.length > 1 ? <em>等 {allWarnings.length} 条</em> : null}
                </div>
              ) : null}

              <div className={`view-body ${tab === 'preview' ? 'is-preview' : ''}`}>
                {jobLoading ? (
                  <div className="loading-overlay">
                    <LoaderCircle size={22} className="spin" />
                  </div>
                ) : null}

                {tab === 'preview' ? (
                  <div className="preview-stage">
                    <div className={`paper paper-${paper}`}>
                      <canvas ref={canvasRef} className="receipt-canvas" />
                    </div>
                    <div className="preview-caption">
                      203 dpi 点阵模拟 · 点击右上角 PNG 下载
                    </div>
                  </div>
                ) : null}

                {tab === 'tokens' ? (
                  <div className="table-view">
                    <div className="table-tools">
                      <input
                        type="search"
                        value={tokenFilter}
                        placeholder="筛选指令、说明或 HEX…"
                        onChange={(event) => setTokenFilter(event.target.value)}
                      />
                      <span className="hint-inline">
                        {job.parsed.stats.commands} 命令 / {job.parsed.stats.texts} 文本 /{' '}
                        {job.parsed.stats.unknown} 未知
                      </span>
                    </div>
                    <TokenTable job={job} filter={tokenFilter} />
                  </div>
                ) : null}

                {tab === 'hex' ? <HexView raw={job.raw} /> : null}

                {tab === 'text' ? (
                  <pre className="text-view">{job.parsed.plainText || '（无纯文本内容）'}</pre>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyReceipt onSample={() => sendSample('kitchen')} />
          )}
        </main>
      </div>

      {notice ? (
        <div className={`toast ${notice.kind === 'ok' ? 'is-ok' : 'is-error'}`}>
          {notice.kind === 'ok' ? <Check size={14} /> : <X size={14} />}
          {notice.message}
        </div>
      ) : null}

      <footer className="footer">
        <span>
          <FileCode2 size={12} /> 解析参考 npos / escpos-tools 指令表
        </span>
        <span>
          <Upload size={12} /> RAW TCP · HTTP · SSE
        </span>
        <span>v{info?.version ?? '1.0.0'}</span>
      </footer>
    </div>
  );
}
