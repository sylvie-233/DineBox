/** 虚拟打印机：监听 RAW TCP（默认 9100），把收到的字节交给任务仓库解析。 */
import net from 'node:net';

import { jobStore } from './jobs';

export interface TcpPrinterState {
  port: number;
  listening: boolean;
  error: string | null;
  close: () => void;
}

const IDLE_FLUSH_MS = 250;

export function startVirtualPrinter(
  port: number,
  onJob: (message: string) => void,
): TcpPrinterState {
  const state: TcpPrinterState = {
    port,
    listening: false,
    error: null,
    close: () => undefined,
  };

  const server = net.createServer((socket) => {
    let chunks: Buffer[] = [];
    let timer: NodeJS.Timeout | null = null;

    const flush = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (chunks.length === 0) {
        return;
      }
      const data = Buffer.concat(chunks);
      chunks = [];
      try {
        const job = jobStore.add(data, { source: 'tcp', encoding: 'gbk' });
        onJob(`TCP 任务 ${job.id}：${data.length} 字节，${job.commandCount} 条指令`);
      } catch (error) {
        onJob(`TCP 任务解析失败：${error instanceof Error ? error.message : String(error)}`);
      }
    };

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (timer) {
        clearTimeout(timer);
      }
      // 兼容保持连接的发送方：空闲一小段时间即视为一张小票结束
      timer = setTimeout(flush, IDLE_FLUSH_MS);
    });

    socket.on('end', () => {
      flush();
      socket.end();
    });

    socket.on('error', () => {
      flush();
    });

    socket.setTimeout(15_000, () => {
      flush();
      socket.destroy();
    });
  });

  server.on('error', (error) => {
    state.listening = false;
    state.error = error.message;
    onJob(`虚拟打印机 TCP :${port} 启动失败：${error.message}`);
  });

  server.listen(port, '0.0.0.0', () => {
    state.listening = true;
    state.error = null;
    onJob(`虚拟打印机已监听 TCP :${port}`);
  });

  state.close = () => {
    server.close();
    state.listening = false;
  };

  return state;
}
