/**
 * 局域网打印：使用业内主流的 `node-thermal-printer` 生成 ESC/POS 指令
 * 并通过 TCP 短连接发送到打印机 RAW 9100 端口。
 *
 * 中文处理：设置 EPSON 的 CHINA 字符页并显式发送 `FS &` 进入中文模式，
 * 文本按 GBK 编码（覆盖 GB2312 之外的常用汉字）。ESC/POS 控制指令、
 * 走纸与切纸均由库完成，本层只做错误翻译与业务文本下发。
 */
import iconv from 'iconv-lite';
import {
  BreakLine,
  CharacterSet,
  PrinterTypes,
  ThermalPrinter,
} from 'node-thermal-printer';

import { PrintError, type PrintOptions, type PrintTarget } from './types.js';

/** 把底层网络错误翻译为可写入打印日志的中文原因。 */
function toPrintError(error: unknown): PrintError {
  if (error instanceof PrintError) {
    return error;
  }
  const err = error as NodeJS.ErrnoException;
  const code = err.code ?? '';
  const message = err.message ?? String(error);

  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return new PrintError('CONNECTION_REFUSED', '连接被拒绝：打印机未开机或未监听 9100 端口');
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return new PrintError('TIMEOUT', '连接超时：请检查打印机电源、IP 与网络是否同网段');
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || /unreachable/i.test(message)) {
    return new PrintError('HOST_UNREACHABLE', '网络不可达：请检查打印机 IP 与路由器静态绑定');
  }
  if (code === 'EPIPE' || code === 'ECONNRESET') {
    return new PrintError('WRITE_FAILED', '连接被打印机中断，写入失败');
  }
  return new PrintError('UNKNOWN', message || '打印失败');
}

/**
 * 向打印机发送一段已排版好的文本。
 * @returns 实际下发的文本字节数（用于日志展示）。
 */
export async function printText(
  target: PrintTarget,
  text: string,
  options: PrintOptions = {},
): Promise<number> {
  if (!target.ip || !Number.isInteger(target.port) || target.port <= 0 || target.port > 65535) {
    throw new PrintError('INVALID_TARGET', '打印机地址或端口无效');
  }

  const encoding = options.encoding ?? 'gbk';

  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${target.ip}:${target.port}`,
      width: options.width ?? 32,
      characterSet: CharacterSet.CHINA,
      removeSpecialCharacters: false,
      // 小票已按 32/48 字符宽度排版，禁止库再次折行。
      breakLine: BreakLine.NONE,
      options: { timeout: options.timeoutMs ?? 5000 },
    });

    // FS & 显式进入中文模式，兼容国产 Epson 兼容机。
    if (encoding === 'gbk') {
      printer.append(Buffer.from([0x1c, 0x26]));
    }
    const payload =
      encoding === 'gbk' ? iconv.encode(text, 'gbk') : Buffer.from(text, 'utf8');
    printer.append(payload);

    if (options.cut !== false) {
      printer.cut();
    }

    await printer.execute();
    return payload.length;
  } catch (error) {
    throw toPrintError(error);
  }
}

/** 仅做 TCP 连通性探测（不打印），用于测试打印前的快速检查。 */
export async function checkPrinter(target: PrintTarget, timeoutMs = 3000): Promise<boolean> {
  if (!target.ip || !Number.isInteger(target.port) || target.port <= 0) {
    return false;
  }
  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${target.ip}:${target.port}`,
      options: { timeout: timeoutMs },
    });
    return await printer.isPrinterConnected();
  } catch {
    return false;
  }
}
