/** ESC/POS 虚拟打印机共享类型：服务端解析结果与前端渲染共用。 */

export type PaperWidth = '58' | '80';
export type EscPosEncoding = 'gbk' | 'utf8' | 'cp437' | 'cp850' | 'latin1';
export type TextAlign = 'left' | 'center' | 'right';

export interface PrintStyle {
  align: TextAlign;
  bold: boolean;
  underline: boolean;
  invert: boolean;
  font: 'A' | 'B';
  widthScale: number;
  heightScale: number;
  /** 行间距（打印机点），0 表示使用默认值。 */
  lineSpacing: number;
  /** 字符间距（打印机点）。 */
  charSpacing: number;
}

export interface PrintTextOp {
  type: 'text';
  text: string;
  style: PrintStyle;
}

export interface PrintNewlineOp {
  type: 'newline';
}

export interface PrintFeedOp {
  type: 'feed';
  lines: number;
  dots?: number;
}

export interface PrintTabOp {
  type: 'tab';
  style: PrintStyle;
}

export interface PrintCutOp {
  type: 'cut';
  mode: 'full' | 'partial';
}

export type BarcodeHri = 'none' | 'above' | 'below' | 'both';

export interface PrintBarcodeOp {
  type: 'barcode';
  symbology: string;
  data: string;
  width: number;
  height: number;
  hri: BarcodeHri;
  style: PrintStyle;
}

export interface PrintQrOp {
  type: 'qr';
  data: string;
  moduleSize: number;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  style: PrintStyle;
}

/** 1bpp 位图：每行按字节对齐，1 表示黑点。 */
export interface PrintImageOp {
  type: 'image';
  width: number;
  height: number;
  mode: number;
  data: string;
  style: PrintStyle;
}

export interface PrintDrawerOp {
  type: 'drawer';
  pin: number;
}

export type PrintOp =
  | PrintTextOp
  | PrintNewlineOp
  | PrintFeedOp
  | PrintTabOp
  | PrintCutOp
  | PrintBarcodeOp
  | PrintQrOp
  | PrintImageOp
  | PrintDrawerOp;

export interface EscPosToken {
  offset: number;
  length: number;
  kind: 'command' | 'text' | 'unknown';
  code: string;
  name: string;
  description: string;
  params: number[];
  /** 预览用十六进制，过长时截断。 */
  hex: string;
  hexTruncated: boolean;
}

export interface ParsedEscPos {
  ops: PrintOp[];
  tokens: EscPosToken[];
  plainText: string;
  warnings: string[];
  stats: {
    bytes: number;
    commands: number;
    texts: number;
    unknown: number;
  };
}

export type JobSource = 'tcp' | 'http' | 'manual' | 'text' | 'sample';

export interface JobSummary {
  id: string;
  source: JobSource;
  createdAt: string;
  bytes: number;
  encoding: EscPosEncoding;
  title: string;
  preview: string;
  commandCount: number;
  textCount: number;
  unknownCount: number;
  warnings: number;
}

export interface JobDetail extends JobSummary {
  parsed: ParsedEscPos;
  /** 原始字节 base64，用于 HEX 视图。 */
  raw: string;
}

export interface ServerInfo {
  version: string;
  httpPort: number;
  tcp: {
    /** 容器/进程内实际监听端口。 */
    port: number;
    /** 对外展示的端口（容器映射后可能是 9102）。 */
    advertisePort: number;
    listening: boolean;
    error: string | null;
  };
  lanIps: string[];
  /** 显式配置的对外主机（容器部署时由 ESC_POS_PUBLIC_HOST 指定）。 */
  publicHost: string | null;
  jobs: number;
  maxJobBytes: number;
}

export interface SampleInfo {
  id: string;
  name: string;
  description: string;
}

export interface ParseRequestBody {
  encoding?: EscPosEncoding;
}

export interface TextPrintRequest {
  text: string;
  encoding?: EscPosEncoding;
}

export interface ApiResult<T> {
  ok: boolean;
  data: T;
  error?: string;
}
