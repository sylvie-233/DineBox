/** ESC/POS 打印目标。 */
export interface PrintTarget {
  ip: string;
  port: number;
}

/** 打印文本编码：中文热敏打印机使用 GBK；部分新机型支持 UTF-8。 */
export type PrintEncoding = 'gbk' | 'utf8';

/** 打印选项。 */
export interface PrintOptions {
  encoding?: PrintEncoding;
  /** 连接与写入超时（毫秒），默认 5000。 */
  timeoutMs?: number;
  /** 小票字符宽度：58mm 约 32，80mm 约 48；默认 32。 */
  width?: number;
  /** 打印完成后切纸，默认 true。 */
  cut?: boolean;
}

/** 模板明细行。 */
export interface PrintItem {
  name: string;
  specText?: string;
  addonText?: string;
  qty: number;
  amount: number;
}

/** 模板渲染数据。 */
export interface PrintPayload {
  title: string;
  table: string;
  orderNo: string;
  time: string;
  note: string;
  people: number | string;
  total: number;
  off: number;
  payable: number;
  items: PrintItem[];
  /** 小票字符宽度：58mm 约 32，80mm 约 48。 */
  width?: number;
}

/** 打印错误码。 */
export type PrintErrorCode =
  | 'INVALID_TARGET'
  | 'TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'HOST_UNREACHABLE'
  | 'WRITE_FAILED'
  | 'UNKNOWN';

/** 打印失败异常：message 为可直接写入打印日志的中文原因。 */
export class PrintError extends Error {
  readonly code: PrintErrorCode;

  constructor(code: PrintErrorCode, message: string) {
    super(message);
    this.name = 'PrintError';
    this.code = code;
  }
}
