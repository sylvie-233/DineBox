import type {
  PrintDocType,
  PrinterPurpose,
  PrinterStatus,
  PrintStatus,
} from './common.js';
import type { PageResult } from './common.js';

/** 打印机配置，IP 为内网静态地址。 */
export interface Printer {
  id: number;
  name: string;
  ip: string;
  port: number;
  purpose: PrinterPurpose;
  status: PrinterStatus;
  lastTestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 保存打印机入参。 */
export interface PrinterSaveInput {
  id?: number;
  name: string;
  ip: string;
  port?: number;
  purpose: PrinterPurpose;
}

/** ESC/POS 模板。 */
export interface PrintTemplate {
  type: 'KITCHEN' | 'BILL';
  content: string;
  updatedAt: string | null;
}

/** 打印日志行。 */
export interface PrintLogRow {
  id: number;
  orderId: number | null;
  orderNo: string;
  printerId: number;
  printerName: string;
  printerIp: string;
  printerPort: number;
  docType: PrintDocType;
  status: PrintStatus;
  failReason: string;
  retryCount: number;
  printedByName: string;
  createdAt: string;
}

/** 打印日志筛选。 */
export interface PrintLogQuery {
  kw?: string;
  docType?: PrintDocType;
  printerId?: number;
  status?: PrintStatus;
  page?: number;
  pageSize?: number;
}

/** 打印日志分页结果。 */
export type PrintLogPage = PageResult<PrintLogRow>;

/** 测试打印结果。 */
export interface PrinterTestResult {
  ok: boolean;
  message: string;
  logId: number;
}
