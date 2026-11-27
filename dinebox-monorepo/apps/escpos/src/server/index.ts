/**
 * ESC/POS 虚拟打印机 Web 服务。
 *
 * 三路输入：
 *  - RAW TCP（默认 9102，可配 9100）：把商家端打印配置指向本机即可接收真实任务；
 *  - HTTP：POST /api/jobs 接收 application/octet-stream 或 base64 JSON；
 *  - 页面手动输入：HEX、纯文本、.bin 上传与内置示例。
 *
 * 所有输入统一解析成 ParsedEscPos，经 SSE 推给浏览器渲染，不落盘。
 */
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

import { parseEscPos } from '../parser/parser';
import { buildSample, buildTextReceipt, listSamples } from '../parser/samples';
import type {
  EscPosEncoding,
  JobSource,
  ServerInfo,
  TextPrintRequest,
} from '../types';
import { jobStore, MAX_JOB_BYTES } from './jobs';
import { startVirtualPrinter, type TcpPrinterState } from './tcp';

const VERSION = '1.0.0';
const PORT = Number(process.env.ESC_POS_PORT ?? 3200);
// 默认 9102：本项目 RustFS 已占用宿主机 9100，避免本地开发端口冲突。
const TCP_PORT = Number(process.env.ESC_POS_TCP_PORT ?? 9102);
const ADVERTISE_TCP_PORT = Number(process.env.ESC_POS_ADVERTISE_PORT ?? TCP_PORT);
const PUBLIC_HOST = process.env.ESC_POS_PUBLIC_HOST?.trim() ?? '';
const ENCODINGS: EscPosEncoding[] = ['gbk', 'utf8', 'cp437', 'cp850', 'latin1'];
const TEXT_LIMIT = 50_000;

const app = new Hono();

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));

function configureEncoding(value: string | undefined | null): EscPosEncoding {
  return ENCODINGS.includes(value as EscPosEncoding) ? (value as EscPosEncoding) : 'gbk';
}

function lanAddresses(): string[] {
  if (PUBLIC_HOST) {
    return [PUBLIC_HOST];
  }
  const result: string[] = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family !== 'IPv4' || item.internal) {
        continue;
      }
      if (item.address.startsWith('169.254.')) {
        continue;
      }
      result.push(item.address);
    }
  }
  return [...new Set(result)];
}

function serverInfo(tcpState: TcpPrinterState): ServerInfo {
  return {
    version: VERSION,
    httpPort: PORT,
    tcp: {
      port: tcpState.port,
      advertisePort: ADVERTISE_TCP_PORT,
      listening: tcpState.listening,
      error: tcpState.error,
    },
    lanIps: lanAddresses(),
    publicHost: PUBLIC_HOST || null,
    jobs: jobStore.size,
    maxJobBytes: MAX_JOB_BYTES,
  };
}

app.onError((error, c) => {
  console.error('[escpos]', error);
  return c.json({ ok: false, error: error.message }, 500);
});

app.get('/api/health', (c) =>
  c.json({ ok: true, data: { status: 'ok', version: VERSION, jobs: jobStore.size } }),
);

app.get('/api/info', (c) => c.json({ ok: true, data: serverInfo(tcpState) }));

app.get('/api/samples', (c) => c.json({ ok: true, data: listSamples() }));

app.post('/api/samples/:id', (c) => {
  const id = c.req.param('id');
  const bytes = buildSample(id);
  if (!bytes) {
    return c.json({ ok: false, error: '示例不存在' }, 404);
  }
  const summary = jobStore.add(bytes, { source: 'sample', encoding: 'gbk' });
  return c.json({ ok: true, data: summary }, 201);
});

app.get('/api/jobs', (c) => c.json({ ok: true, data: jobStore.list() }));

app.delete('/api/jobs', (c) => {
  jobStore.clear();
  return c.json({ ok: true, data: { cleared: true } });
});

app.get('/api/jobs/:id', (c) => {
  const job = jobStore.get(c.req.param('id'));
  if (!job) {
    return c.json({ ok: false, error: '打印任务不存在' }, 404);
  }
  return c.json({ ok: true, data: job });
});

async function readJobBytes(
  c: Context,
): Promise<{ bytes: Buffer; encoding: EscPosEncoding; source: JobSource }> {
  const encoding = configureEncoding(c.req.query('encoding'));
  const source = c.req.query('source') === 'http' ? 'http' : 'manual';
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await c.req.json().catch(() => null)) as
      | { data?: string; encoding?: string }
      | null;
    if (!body?.data) {
      throw new Error('JSON 请求需要 data 字段（原始字节的 base64）');
    }
    const bytes = Buffer.from(body.data, 'base64');
    return {
      bytes,
      encoding: configureEncoding(body.encoding ?? encoding),
      source,
    };
  }

  const bytes = Buffer.from(await c.req.arrayBuffer());
  return { bytes, encoding, source };
}

app.post('/api/jobs', async (c) => {
  try {
    const { bytes, encoding, source } = await readJobBytes(c);
    const summary = jobStore.add(bytes, { source, encoding });
    return c.json({ ok: true, data: summary }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ ok: false, error: message }, 400);
  }
});

app.post('/api/jobs/text', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as TextPrintRequest | null;
    if (!body?.text?.trim()) {
      return c.json({ ok: false, error: '文本不能为空' }, 400);
    }
    if (body.text.length > TEXT_LIMIT) {
      return c.json({ ok: false, error: `文本超过 ${TEXT_LIMIT} 字符上限` }, 400);
    }
    const encoding = configureEncoding(body.encoding);
    const bytes = buildTextReceipt(body.text, encoding);
    const summary = jobStore.add(bytes, { source: 'text', encoding });
    return c.json({ ok: true, data: summary }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ ok: false, error: message }, 400);
  }
});

app.post('/api/parse', async (c) => {
  try {
    const { bytes, encoding } = await readJobBytes(c);
    const parsed = parseEscPos(bytes, { encoding });
    return c.json({
      ok: true,
      data: { parsed, raw: bytes.toString('base64'), encoding, bytes: bytes.length },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ ok: false, error: message }, 400);
  }
});

app.get('/api/events', (c) => {
  c.header('Cache-Control', 'no-cache');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (stream) => {
    let closed = false;
    const unsubscribe = jobStore.subscribe((summary) => {
      if (closed) {
        return;
      }
      void stream.writeSSE({ event: 'job', data: JSON.stringify(summary) }).catch(() => {
        closed = true;
      });
    });

    stream.onAbort(() => {
      closed = true;
      unsubscribe();
    });

    await stream.writeSSE({
      event: 'hello',
      data: JSON.stringify({ info: serverInfo(tcpState), jobs: jobStore.list() }),
    });

    const heartbeat = setInterval(() => {
      if (closed) {
        return;
      }
      void stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => {
        closed = true;
      });
    }, 15_000);

    while (!closed) {
      await stream.sleep(1_000);
    }
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ---------- 静态资源（生产构建后由本服务直接托管） ----------
const appRoot = process.cwd();
const distDir = path.resolve(appRoot, 'dist');
const indexFile = path.join(distDir, 'index.html');

if (existsSync(indexFile)) {
  app.get('*', serveStatic({ root: distDir }));
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ ok: false, error: '接口不存在' }, 404);
    }
    return c.html(readFileSync(indexFile, 'utf8'));
  });
} else {
  app.get('/', (c) =>
    c.text(
      'ESC/POS 虚拟打印机 API 已启动。开发模式请访问 Vite：http://localhost:3003\n',
    ),
  );
}

const tcpState = startVirtualPrinter(TCP_PORT, (message) => {
  console.log(`[escpos] ${message}`);
});

const server = serve(
  { fetch: app.fetch, port: PORT, hostname: '0.0.0.0' },
  (info) => {
    const lines = [
      '',
      '  ESC/POS 虚拟打印机已启动',
      `  控制台      http://localhost:${PORT}${existsSync(indexFile) ? '' : '（开发模式请用 3003）'}`,
      `  HTTP API    http://localhost:${PORT}/api/health`,
      `  虚拟打印机  tcp://0.0.0.0:${TCP_PORT}${tcpState.listening ? '' : '（端口启动失败）'}`,
      `  局域网地址  ${lanAddresses().join(', ') || '未检测到'}`,
      '',
    ];
    console.log(lines.join('\n'));
    console.log(`[escpos] HTTP server listening on ${info.port}`);
  },
);

function shutdown(): void {
  console.log('\n[escpos] 正在关闭…');
  tcpState.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
