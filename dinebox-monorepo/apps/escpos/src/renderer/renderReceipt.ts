/**
 * 小票渲染器：把与设备无关的打印操作排版到打印机点阵画布上。
 *
 * 以 203dpi 点为单位布局（58mm = 384 点 / 80mm = 576 点），再按浏览器
 * 像素比缩放绘制，尽量接近真实热敏小票的字宽、行距与对齐效果。
 */
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

import type {
  BarcodeHri,
  PaperWidth,
  ParsedEscPos,
  PrintBarcodeOp,
  PrintImageOp,
  PrintQrOp,
  PrintStyle,
  TextAlign,
} from '../types';

const MARGIN_X = 10;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 24;
const DEFAULT_LINE_HEIGHT = 30;
const HRI_LINE_HEIGHT = 18;

const FONT_STACK =
  '"Cascadia Mono", "Sarasa Mono SC", "Microsoft YaHei", "Noto Sans Mono CJK SC", monospace';

interface Glyph {
  char: string;
  x: number;
  width: number;
  style: PrintStyle;
}

interface LineBlock {
  kind: 'line';
  y: number;
  height: number;
  align: TextAlign;
  glyphs: Glyph[];
}

interface BarcodeBlock {
  kind: 'barcode';
  y: number;
  height: number;
  align: TextAlign;
  canvas: HTMLCanvasElement | null;
  width: number;
  hri: BarcodeHri;
  data: string;
  hriFont: string;
}

interface QrBlock {
  kind: 'qr';
  y: number;
  height: number;
  align: TextAlign;
  canvas: HTMLCanvasElement | null;
  width: number;
  label: string;
}

interface ImageBlock {
  kind: 'image';
  y: number;
  height: number;
  align: TextAlign;
  canvas: HTMLCanvasElement | null;
  width: number;
  label: string;
}

interface GapBlock {
  kind: 'gap';
  y: number;
  height: number;
}

interface CutBlock {
  kind: 'cut';
  y: number;
  height: number;
  mode: 'full' | 'partial';
}

type Block = LineBlock | BarcodeBlock | QrBlock | ImageBlock | GapBlock | CutBlock;

interface RenderOptions {
  paper: PaperWidth;
  /** 仅用于测试/截图：强制指定缩放。 */
  devicePixelRatio?: number;
}

function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  );
}

function cellMetrics(style: PrintStyle): { width: number; height: number } {
  return style.font === 'B' ? { width: 9, height: 17 } : { width: 12, height: 24 };
}

function alignOffset(align: TextAlign, contentWidth: number, width: number): number {
  if (align === 'center') {
    return Math.max(0, Math.round((contentWidth - width) / 2));
  }
  if (align === 'right') {
    return Math.max(0, contentWidth - width);
  }
  return 0;
}

const BARCODE_FORMATS: Record<string, string> = {
  'UPC-A': 'UPC',
  'UPC-E': 'UPCE',
  EAN13: 'EAN13',
  EAN8: 'EAN8',
  CODE39: 'CODE39',
  ITF: 'ITF',
  CODABAR: 'CODABAR',
  CODE93: 'CODE93',
  CODE128: 'CODE128',
};

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function renderBarcode(op: PrintBarcodeOp): { canvas: HTMLCanvasElement | null; width: number } {
  const format = BARCODE_FORMATS[op.symbology];
  if (!format || !op.data) {
    return { canvas: null, width: 0 };
  }
  try {
    const canvas = createCanvas(2, Math.max(8, op.height));
    JsBarcode(canvas, op.data, {
      format,
      width: Math.max(1, op.width),
      height: Math.max(8, op.height),
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#111111',
    });
    return { canvas, width: canvas.width };
  } catch {
    return { canvas: null, width: 0 };
  }
}

async function renderQr(op: PrintQrOp): Promise<{ canvas: HTMLCanvasElement | null; width: number }> {
  const data = op.data || 'DineBox';
  try {
    const qr = QRCode.create(data, { errorCorrectionLevel: op.errorCorrection });
    const moduleSize = Math.max(1, op.moduleSize);
    const size = (qr.modules.size + 8) * moduleSize;
    const canvas = createCanvas(size, size);
    await QRCode.toCanvas(canvas, data, {
      errorCorrectionLevel: op.errorCorrection,
      margin: 4,
      width: size,
      color: { dark: '#111111', light: '#ffffff' },
    });
    return { canvas, width: size };
  } catch {
    return { canvas: null, width: 0 };
  }
}

function renderImage(op: PrintImageOp): { canvas: HTMLCanvasElement | null; width: number; height: number } {
  try {
    const raw = Uint8Array.from(atob(op.data), (char) => char.charCodeAt(0));
    const rowBytes = Math.ceil(op.width / 8);
    const canvas = createCanvas(op.width, op.height);
    const context = canvas.getContext('2d');
    if (!context) {
      return { canvas: null, width: 0, height: 0 };
    }
    const imageData = context.createImageData(op.width, op.height);
    for (let y = 0; y < op.height; y += 1) {
      for (let x = 0; x < op.width; x += 1) {
        const byte = raw[y * rowBytes + (x >> 3)] ?? 0;
        const black = (byte & (0x80 >> (x & 7))) !== 0;
        const index = (y * op.width + x) * 4;
        const value = black ? 17 : 255;
        imageData.data[index] = value;
        imageData.data[index + 1] = value;
        imageData.data[index + 2] = value;
        imageData.data[index + 3] = 255;
      }
    }
    context.putImageData(imageData, 0, 0);
    const widthScale = op.mode === 1 || op.mode === 3 ? 2 : 1;
    const heightScale = op.mode === 2 || op.mode === 3 ? 2 : 1;
    return { canvas, width: op.width * widthScale, height: op.height * heightScale };
  } catch {
    return { canvas: null, width: 0, height: 0 };
  }
}

class LayoutBuilder {
  private readonly contentWidth: number;
  private readonly blocks: Block[] = [];
  private glyphs: Glyph[] = [];
  private x = 0;
  private lineHeight = DEFAULT_LINE_HEIGHT;
  private lineAlign: TextAlign = 'left';

  constructor(widthDots: number) {
    this.contentWidth = widthDots - MARGIN_X * 2;
  }

  get blocksResult(): Block[] {
    return this.blocks;
  }

  position(): number {
    const last = this.blocks[this.blocks.length - 1];
    return last ? last.y + last.height : 0;
  }

  addOp(op: ParsedEscPos['ops'][number]): Promise<void> | void {
    switch (op.type) {
      case 'text':
        this.addText(op.text, op.style);
        return;
      case 'tab': {
        const { width } = cellMetrics(op.style);
        const columns = Math.max(1, Math.round(this.x / width));
        const next = (Math.floor(columns / 8) + 1) * 8;
        this.addText(' '.repeat(Math.max(1, next - columns)), op.style);
        return;
      }
      case 'newline':
        this.newline();
        return;
      case 'feed':
        if (op.lines > 0) {
          for (let index = 0; index < op.lines; index += 1) {
            this.newline();
          }
        } else if (op.dots) {
          this.finalizeLine();
          this.blocks.push({ kind: 'gap', y: this.position(), height: Math.min(op.dots, 120) });
        }
        return;
      case 'barcode':
        return this.addBarcode(op);
      case 'qr':
        return this.addQr(op);
      case 'image':
        this.addImage(op);
        return;
      case 'cut':
        this.addCut(op.mode);
        return;
      case 'drawer':
        return;
    }
  }

  private addText(text: string, style: PrintStyle): void {
    const { width: cellWidth, height: cellHeight } = cellMetrics(style);
    for (const char of Array.from(text)) {
      if (char === '\n') {
        this.newline();
        continue;
      }
      const width =
        (isWideChar(char) ? 2 : 1) * cellWidth * style.widthScale + style.charSpacing;
      if (this.x > 0 && this.x + width > this.contentWidth) {
        this.finalizeLine();
      }
      if (this.glyphs.length === 0) {
        this.lineAlign = style.align;
      }
      this.glyphs.push({ char, x: this.x, width, style });
      this.x += width;
      this.lineHeight = Math.max(
        this.lineHeight,
        cellHeight * style.heightScale + 6,
        style.lineSpacing,
      );
    }
  }

  private newline(): void {
    if (this.glyphs.length > 0) {
      this.finalizeLine();
      return;
    }
    this.blocks.push({ kind: 'gap', y: this.position(), height: DEFAULT_LINE_HEIGHT });
  }

  private finalizeLine(): void {
    if (this.glyphs.length === 0) {
      return;
    }
    const last = this.glyphs[this.glyphs.length - 1];
    const width = last ? last.x + last.width : 0;
    this.blocks.push({
      kind: 'line',
      y: this.position(),
      height: Math.max(DEFAULT_LINE_HEIGHT, Math.round(this.lineHeight)),
      align: this.lineAlign,
      glyphs: this.glyphs,
    });
    this.glyphs = [];
    this.x = 0;
    this.lineHeight = DEFAULT_LINE_HEIGHT;
    void width;
  }

  private addBarcode(op: PrintBarcodeOp): void {
    this.finalizeLine();
    const { canvas, width } = renderBarcode(op);
    const hriLines = op.hri === 'none' ? 0 : op.hri === 'both' ? 2 : 1;
    const height = (canvas?.height ?? 48) + hriLines * HRI_LINE_HEIGHT + 8;
    this.blocks.push({
      kind: 'barcode',
      y: this.position(),
      height,
      align: op.style.align,
      canvas,
      width: Math.min(width || this.contentWidth, this.contentWidth),
      hri: op.hri,
      data: op.data,
      hriFont: '13px ' + FONT_STACK,
    });
  }

  private async addQr(op: PrintQrOp): Promise<void> {
    this.finalizeLine();
    const { canvas, width } = await renderQr(op);
    const displayWidth = Math.min(width || 120, this.contentWidth);
    const displayHeight = width ? Math.round((displayWidth / width) * (canvas?.height ?? displayWidth)) : 120;
    this.blocks.push({
      kind: 'qr',
      y: this.position(),
      height: displayHeight + 8,
      align: op.style.align,
      canvas,
      width: displayWidth,
      label: op.data,
    });
  }

  private addImage(op: PrintImageOp): void {
    this.finalizeLine();
    const { canvas, width, height } = renderImage(op);
    const displayWidth = Math.min(width || 120, this.contentWidth);
    const scale = width ? displayWidth / width : 1;
    this.blocks.push({
      kind: 'image',
      y: this.position(),
      height: Math.round((height || 60) * scale) + 8,
      align: op.style.align,
      canvas,
      width: displayWidth,
      label: op.data,
    });
  }

  private addCut(mode: 'full' | 'partial'): void {
    this.finalizeLine();
    this.blocks.push({ kind: 'cut', y: this.position(), height: 38, mode });
  }
}

function drawLine(context: CanvasRenderingContext2D, block: LineBlock, contentWidth: number): void {
  const last = block.glyphs[block.glyphs.length - 1];
  const lineWidth = last ? last.x + last.width : 0;
  const offset = MARGIN_X + alignOffset(block.align, contentWidth, lineWidth);
  const baseY = block.y;

  for (const glyph of block.glyphs) {
    const style = glyph.style;
    const { width: cellWidth, height: cellHeight } = cellMetrics(style);
    const textHeight = cellHeight * style.heightScale;
    const textWidth = glyph.width;
    const x = offset + glyph.x;
    const y = baseY + Math.max(0, (block.height - textHeight) / 2);

    if (style.invert) {
      context.fillStyle = '#111111';
      context.fillRect(x, y, textWidth, textHeight);
    }

    if (glyph.char !== ' ') {
      context.save();
      context.translate(x, y);
      context.scale(style.widthScale, style.heightScale);
      context.font = `${style.bold ? '700 ' : ''}${cellHeight}px ${FONT_STACK}`;
      context.textBaseline = 'top';
      context.fillStyle = style.invert ? '#ffffff' : '#111111';
      context.fillText(glyph.char, 0, 0);
      context.restore();
    }

    if (style.underline) {
      context.fillStyle = style.invert ? '#ffffff' : '#111111';
      context.fillRect(x, y + textHeight - 2, textWidth, 2);
    }
    void cellWidth;
  }
}

function drawAlignedCanvas(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, x, y, width, height);
}

export interface RenderResult {
  width: number;
  height: number;
  warnings: string[];
}

export async function renderReceipt(
  canvas: HTMLCanvasElement,
  parsed: ParsedEscPos,
  options: RenderOptions,
): Promise<RenderResult> {
  const widthDots = options.paper === '80' ? 576 : 384;
  const contentWidth = widthDots - MARGIN_X * 2;
  const builder = new LayoutBuilder(widthDots);
  const warnings: string[] = [];

  for (const op of parsed.ops) {
    try {
      await builder.addOp(op);
    } catch (error) {
      warnings.push(
        `渲染操作失败（${op.type}）：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const blocks = builder.blocksResult;
  const totalHeight = Math.max(
    220,
    blocks.reduce((max, block) => Math.max(max, block.y + block.height), 0) + PADDING_TOP + PADDING_BOTTOM,
  );
  const ratio = options.devicePixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(widthDots * ratio);
  canvas.height = Math.round(totalHeight * ratio);
  const context = canvas.getContext('2d');
  if (!context) {
    return { width: widthDots, height: totalHeight, warnings: ['浏览器不支持 Canvas 2D'] };
  }
  context.scale(ratio, ratio);
  context.fillStyle = '#fffefa';
  context.fillRect(0, 0, widthDots, totalHeight);
  context.imageSmoothingEnabled = false;

  const yShift = PADDING_TOP;

  if (blocks.length === 0) {
    context.fillStyle = '#9a9a92';
    context.font = `14px ${FONT_STACK}`;
    context.textAlign = 'center';
    context.fillText('没有可显示的小票内容', widthDots / 2, PADDING_TOP + 40);
    return { width: widthDots, height: totalHeight, warnings };
  }

  for (const block of blocks) {
    const y = block.y + yShift;
    if (block.kind === 'line') {
      drawLine(context, { ...block, y }, contentWidth);
    } else if (block.kind === 'cut') {
      context.save();
      context.strokeStyle = '#bdbdb4';
      context.lineWidth = 1;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(MARGIN_X, y + 18);
      context.lineTo(widthDots - MARGIN_X, y + 18);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#b0b0a6';
      context.font = `12px ${FONT_STACK}`;
      context.textAlign = 'left';
      context.fillText(block.mode === 'full' ? '✂ 全切纸' : '✂ 半切纸', MARGIN_X, y + 8);
      context.restore();
    } else if (block.kind === 'barcode') {
      const x = MARGIN_X + alignOffset(block.align, contentWidth, block.width);
      let cursor = y + 2;
      const hriAbove = block.hri === 'above' || block.hri === 'both';
      const hriBelow = block.hri === 'below' || block.hri === 'both';
      context.fillStyle = '#111111';
      context.font = block.hriFont;
      context.textAlign = 'center';
      if (hriAbove) {
        context.fillText(block.data, x + block.width / 2, cursor);
        cursor += HRI_LINE_HEIGHT;
      }
      if (block.canvas) {
        const height = block.canvas.height;
        drawAlignedCanvas(context, block.canvas, x, cursor, block.width, height);
        cursor += height;
      } else {
        context.fillStyle = '#a33';
        context.font = `12px ${FONT_STACK}`;
        context.textAlign = 'left';
        context.fillText(`条码无法生成：${block.data}`, MARGIN_X, cursor);
        cursor += 20;
      }
      if (hriBelow) {
        context.fillStyle = '#111111';
        context.font = block.hriFont;
        context.textAlign = 'center';
        context.fillText(block.data, x + block.width / 2, cursor + 2);
      }
    } else if (block.kind === 'qr') {
      const x = MARGIN_X + alignOffset(block.align, contentWidth, block.width);
      if (block.canvas) {
        drawAlignedCanvas(context, block.canvas, x, y + 4, block.width, block.height - 8);
      } else {
        context.fillStyle = '#a33';
        context.font = `12px ${FONT_STACK}`;
        context.textAlign = 'left';
        context.fillText('二维码无法生成（数据过长或编码不支持）', MARGIN_X, y + 20);
      }
    } else if (block.kind === 'image') {
      const x = MARGIN_X + alignOffset(block.align, contentWidth, block.width);
      if (block.canvas) {
        drawAlignedCanvas(context, block.canvas, x, y + 4, block.width, block.height - 8);
      }
    }
  }

  return { width: widthDots, height: totalHeight, warnings };
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
