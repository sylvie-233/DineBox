/**
 * ESC/POS 解析器。
 *
 * 设计参考 npos / escpos-tools 的 AST 思路：先按指令表把原始字节切成
 * 「命令 / 文本 / 未知指令」三类 token，再把会改变打印状态的命令翻译成
 * 与设备无关的打印操作（文本、换行、切纸、条码、二维码、位图）。
 *
 * 前端只消费 ParsedEscPos，不直接处理字节；这样 TCP / HTTP / 手动输入
 * 三条入口可以共用同一套解析与渲染逻辑。
 */
import iconv from 'iconv-lite';

import type {
  BarcodeHri,
  EscPosEncoding,
  EscPosToken,
  ParsedEscPos,
  PrintOp,
  PrintStyle,
} from '../types';

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
const LF = 0x0a;
const CR = 0x0d;
const HT = 0x09;
const NUL = 0x00;

const HEX_PREVIEW_BYTES = 48;
const MAX_WARNINGS = 40;

const ALIGNMENTS: Record<number, PrintStyle['align']> = {
  0: 'left',
  1: 'center',
  2: 'right',
  48: 'left',
  49: 'center',
  50: 'right',
};

/** ESC t 代码页映射：仅覆盖常见页面，中文模式默认 GBK。 */
const CODE_PAGES: Record<number, EscPosEncoding> = {
  0: 'cp437',
  1: 'cp437',
  2: 'cp850',
  16: 'latin1',
  17: 'cp437',
  18: 'cp850',
  19: 'cp850',
};

const BARCODE_TYPES: Record<number, string> = {
  0: 'UPC-A',
  1: 'UPC-E',
  2: 'EAN13',
  3: 'EAN8',
  4: 'CODE39',
  5: 'ITF',
  6: 'CODABAR',
  65: 'UPC-A',
  66: 'UPC-E',
  67: 'EAN13',
  68: 'EAN8',
  69: 'CODE39',
  70: 'ITF',
  71: 'CODABAR',
  72: 'CODE93',
  73: 'CODE128',
};

const ECC_LEVELS: Record<number, 'L' | 'M' | 'Q' | 'H'> = {
  48: 'L',
  49: 'M',
  50: 'Q',
  51: 'H',
};

const HRI_POSITIONS: Record<number, BarcodeHri> = {
  0: 'none',
  1: 'above',
  2: 'below',
  3: 'both',
};

export interface ParseOptions {
  encoding?: EscPosEncoding;
}

function defaultStyle(): PrintStyle {
  return {
    align: 'left',
    bold: false,
    underline: false,
    invert: false,
    font: 'A',
    widthScale: 1,
    heightScale: 1,
    lineSpacing: 0,
    charSpacing: 0,
  };
}

function isTextByte(byte: number): boolean {
  return byte >= 0x20 && byte !== 0x7f;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexPreview(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

class EscPosParser {
  private readonly bytes: Uint8Array;
  private readonly options: ParseOptions;
  private index = 0;
  private tokens: EscPosToken[] = [];
  private ops: PrintOp[] = [];
  private warnings: string[] = [];
  private plainText = '';
  private style: PrintStyle = defaultStyle();
  private encoding: EscPosEncoding;
  private barcodeWidth = 2;
  private barcodeHeight = 80;
  private barcodeHri: BarcodeHri = 'none';
  private qrModuleSize = 4;
  private qrErrorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M';
  private qrModel = 2;
  private qrData = '';

  constructor(bytes: Uint8Array, options: ParseOptions = {}) {
    this.bytes = bytes;
    this.options = options;
    this.encoding = options.encoding ?? 'gbk';
  }

  parse(): ParsedEscPos {
    while (this.index < this.bytes.length) {
      const byte = this.byteAt(this.index);
      if (byte === ESC) {
        this.index = this.handleEsc(this.index);
      } else if (byte === GS) {
        this.index = this.handleGs(this.index);
      } else if (byte === FS) {
        this.index = this.handleFs(this.index);
      } else if (byte === LF) {
        this.addToken(this.index, this.index + 1, 'command', 'LF', '换行', '打印并换行');
        this.ops.push({ type: 'newline' });
        this.plainText += '\n';
        this.index += 1;
      } else if (byte === CR) {
        this.addToken(this.index, this.index + 1, 'command', 'CR', '回车', '回车（不换行）');
        this.index += 1;
      } else if (byte === HT) {
        this.addToken(this.index, this.index + 1, 'command', 'HT', '制表符', '移动到下一个制表位');
        this.ops.push({ type: 'tab', style: this.copyStyle() });
        this.plainText += '\t';
        this.index += 1;
      } else if (byte === NUL) {
        this.index += 1;
      } else if (byte < 0x20) {
        this.addToken(
          this.index,
          this.index + 1,
          'unknown',
          `0x${byte.toString(16).padStart(2, '0').toUpperCase()}`,
          '未知控制字符',
          '未识别的控制字节，已跳过',
        );
        this.warn(`偏移 ${this.index}：未识别的控制字节 0x${byte.toString(16)}`);
        this.index += 1;
      } else {
        this.index = this.handleText(this.index);
      }
    }

    const commands = this.tokens.filter((token) => token.kind === 'command').length;
    const texts = this.tokens.filter((token) => token.kind === 'text').length;
    const unknown = this.tokens.filter((token) => token.kind === 'unknown').length;

    return {
      ops: this.ops,
      tokens: this.tokens,
      plainText: this.plainText,
      warnings: this.warnings,
      stats: {
        bytes: this.bytes.length,
        commands,
        texts,
        unknown,
      },
    };
  }

  private byteAt(index: number): number {
    return this.bytes[index] ?? 0;
  }

  private copyStyle(): PrintStyle {
    return { ...this.style };
  }

  private warn(message: string): void {
    if (this.warnings.length < MAX_WARNINGS) {
      this.warnings.push(message);
    }
  }

  private decode(bytes: Uint8Array): string {
    try {
      return iconv.decode(Buffer.from(bytes), this.encoding);
    } catch {
      return Buffer.from(bytes).toString('latin1');
    }
  }

  private addToken(
    start: number,
    end: number,
    kind: EscPosToken['kind'],
    code: string,
    name: string,
    description: string,
    params: number[] = [],
  ): void {
    const raw = this.bytes.subarray(start, Math.min(end, this.bytes.length));
    const preview = raw.subarray(0, HEX_PREVIEW_BYTES);
    this.tokens.push({
      offset: start,
      length: raw.length,
      kind,
      code,
      name,
      description,
      params,
      hex: hexPreview(preview),
      hexTruncated: raw.length > HEX_PREVIEW_BYTES,
    });
  }

  private addTextOp(text: string): void {
    if (!text) {
      return;
    }
    this.ops.push({ type: 'text', text, style: this.copyStyle() });
    this.plainText += text;
  }

  /** 普通文本：连续可打印字节，按当前编码整体解码。 */
  private handleText(start: number): number {
    let end = start;
    while (end < this.bytes.length && isTextByte(this.byteAt(end))) {
      end += 1;
    }
    if (end === start) {
      // 0x7f 等不可打印字符
      this.addToken(
        start,
        start + 1,
        'unknown',
        'DEL',
        '删除字符',
        '不可打印字节，已跳过',
      );
      return start + 1;
    }

    const text = this.decode(this.bytes.subarray(start, end));
    const preview = text.length > 36 ? `${text.slice(0, 36)}…` : text;
    this.addToken(
      start,
      end,
      'text',
      'TEXT',
      '文本',
      `“${preview.replace(/\s+/g, ' ')}”`,
      [],
    );
    if (text.includes('�')) {
      this.warn(`偏移 ${start}：文本包含无法按 ${this.encoding} 解码的字节`);
    }
    this.addTextOp(text);
    return end;
  }

  private resetStyle(): void {
    this.style = defaultStyle();
  }

  private handleEsc(start: number): number {
    const command = this.byteAt(start + 1);
    switch (command) {
      case 0x40: {
        this.resetStyle();
        this.addToken(start, start + 2, 'command', 'ESC @', '初始化', '恢复默认打印状态');
        return start + 2;
      }
      case 0x61: {
        const n = this.byteAt(start + 2);
        this.style.align = ALIGNMENTS[n] ?? 'left';
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC a',
          '对齐方式',
          `设置为${alignLabel(this.style.align)}`,
          [n],
        );
        return start + 3;
      }
      case 0x45: {
        const n = this.byteAt(start + 2);
        this.style.bold = n !== 0;
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC E',
          '加粗',
          n ? '开启加粗' : '关闭加粗',
          [n],
        );
        return start + 3;
      }
      case 0x2d: {
        const n = this.byteAt(start + 2);
        this.style.underline = n !== 0;
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC -',
          '下划线',
          n ? `开启下划线（${n} 点）` : '关闭下划线',
          [n],
        );
        return start + 3;
      }
      case 0x21: {
        const n = this.byteAt(start + 2);
        this.style.font = (n & 0x01) !== 0 ? 'B' : 'A';
        this.style.bold = (n & 0x08) !== 0;
        this.style.heightScale = (n & 0x10) !== 0 ? 2 : 1;
        this.style.widthScale = (n & 0x20) !== 0 ? 2 : 1;
        this.style.underline = (n & 0x80) !== 0;
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC !',
          '打印模式',
          [
            `字体 ${this.style.font}`,
            this.style.bold ? '加粗' : null,
            this.style.heightScale > 1 ? '倍高' : null,
            this.style.widthScale > 1 ? '倍宽' : null,
            this.style.underline ? '下划线' : null,
          ]
            .filter(Boolean)
            .join(' · '),
          [n],
        );
        return start + 3;
      }
      case 0x4d: {
        const n = this.byteAt(start + 2);
        this.style.font = n === 1 || n === 49 ? 'B' : 'A';
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC M',
          '字体',
          `选择字体 ${this.style.font}`,
          [n],
        );
        return start + 3;
      }
      case 0x20: {
        const n = this.byteAt(start + 2);
        this.style.charSpacing = n;
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC SP',
          '字符间距',
          `右侧间距 ${n} 点`,
          [n],
        );
        return start + 3;
      }
      case 0x32: {
        this.style.lineSpacing = 0;
        this.addToken(start, start + 2, 'command', 'ESC 2', '行距', '恢复默认行距');
        return start + 2;
      }
      case 0x33: {
        const n = this.byteAt(start + 2);
        this.style.lineSpacing = n;
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC 3',
          '行距',
          `行距 ${n} 点`,
          [n],
        );
        return start + 3;
      }
      case 0x64: {
        const n = this.byteAt(start + 2);
        this.ops.push({ type: 'feed', lines: n });
        this.plainText += '\n'.repeat(n);
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC d',
          '走纸',
          `走纸 ${n} 行`,
          [n],
        );
        return start + 3;
      }
      case 0x4a: {
        const n = this.byteAt(start + 2);
        this.ops.push({ type: 'feed', lines: 0, dots: n });
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC J',
          '微量走纸',
          `走纸 ${n} 点`,
          [n],
        );
        return start + 3;
      }
      case 0x74: {
        const n = this.byteAt(start + 2);
        const encoding = CODE_PAGES[n];
        if (encoding) {
          this.encoding = encoding;
        }
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC t',
          '选择代码页',
          encoding ? `代码页 ${n} → ${encoding.toUpperCase()}` : `未知代码页 ${n}（保持当前编码）`,
          [n],
        );
        return start + 3;
      }
      case 0x69: {
        this.ops.push({ type: 'cut', mode: 'partial' });
        this.addToken(start, start + 2, 'command', 'ESC i', '半切', '半切纸');
        return start + 2;
      }
      case 0x6d: {
        this.ops.push({ type: 'cut', mode: 'full' });
        this.addToken(start, start + 2, 'command', 'ESC m', '全切', '全切纸');
        return start + 2;
      }
      case 0x70: {
        const pin = this.byteAt(start + 2);
        this.ops.push({ type: 'drawer', pin });
        this.addToken(
          start,
          start + 5,
          'command',
          'ESC p',
          '钱箱',
          `驱动钱箱（引脚 ${pin}）`,
          [pin],
        );
        return start + 5;
      }
      case 0x7b: {
        const n = this.byteAt(start + 2);
        this.addToken(
          start,
          start + 3,
          'command',
          'ESC {',
          '倒置打印',
          n ? '开启倒置打印（未模拟）' : '关闭倒置打印',
          [n],
        );
        return start + 3;
      }
      case 0x2a: {
        return this.handleEscBitImage(start);
      }
      case 0x24:
      case 0x5c: {
        const n = this.byteAt(start + 2) + this.byteAt(start + 3) * 256;
        this.addToken(
          start,
          start + 4,
          'command',
          command === 0x24 ? 'ESC $' : 'ESC \\',
          command === 0x24 ? '绝对定位' : '相对定位',
          `${command === 0x24 ? '移动到' : '相对移动'}第 ${n} 点（布局未模拟）`,
          [n],
        );
        return start + 4;
      }
      case 0x44: {
        let end = start + 2;
        while (end < this.bytes.length && this.byteAt(end) !== NUL) {
          end += 1;
        }
        this.addToken(start, Math.min(end + 1, this.bytes.length), 'command', 'ESC D', '制表位', '设置制表位');
        return Math.min(end + 1, this.bytes.length);
      }
      case 0x3d:
      case 0x3e: {
        this.addToken(start, start + 2, 'command', command === 0x3d ? 'ESC =' : 'ESC >', '选择外设', '选择打印机外设');
        return start + 2;
      }
      case 0x63: {
        const sub = this.byteAt(start + 2);
        const end = sub === 5 ? start + 4 : start + 3;
        this.addToken(start, end, 'command', 'ESC c', '面板按钮', `面板按钮设置（子命令 ${sub}）`, [sub]);
        return end;
      }
      case 0x52: {
        const n = this.byteAt(start + 2);
        this.addToken(start, start + 3, 'command', 'ESC R', '国际字符集', `字符集 ${n}`, [n]);
        return start + 3;
      }
      case 0x56: {
        const n = this.byteAt(start + 2);
        this.addToken(start, start + 3, 'command', 'ESC V', '走纸方向', `旋转/方向设置 ${n}`, [n]);
        return start + 3;
      }
      case 0x28: {
        const length = this.byteAt(start + 3) + this.byteAt(start + 4) * 256;
        const end = clamp(start + 5 + length, start + 5, this.bytes.length);
        this.addToken(
          start,
          end,
          'unknown',
          'ESC (',
          '未知扩展指令',
          `长度 ${length} 字节，已跳过`,
        );
        this.warn(`偏移 ${start}：未识别的 ESC ( 扩展指令，已按长度跳过`);
        return end;
      }
      default: {
        this.addToken(
          start,
          start + 2,
          'unknown',
          `ESC 0x${command.toString(16).padStart(2, '0').toUpperCase()}`,
          '未知 ESC 指令',
          '未识别的 ESC 指令，按 2 字节跳过',
          [command],
        );
        this.warn(`偏移 ${start}：未识别的 ESC 指令 0x${command.toString(16)}`);
        return start + 2;
      }
    }
  }

  private handleEscBitImage(start: number): number {
    const mode = this.byteAt(start + 2);
    const columns = this.byteAt(start + 3) + this.byteAt(start + 4) * 256;
    const bytesPerColumn = mode === 0 || mode === 1 ? 1 : 3;
    const height = bytesPerColumn * 8;
    const dataStart = start + 5;
    const dataLength = columns * bytesPerColumn;
    const end = Math.min(dataStart + dataLength, this.bytes.length);
    if (dataStart + dataLength > this.bytes.length) {
      this.warn(`偏移 ${start}：ESC * 位图数据不完整`);
    }

    const rowBytes = Math.ceil(columns / 8);
    const bitmap = Buffer.alloc(rowBytes * height);
    const data = this.bytes.subarray(dataStart, end);
    for (let column = 0; column < columns; column += 1) {
      for (let byteIndex = 0; byteIndex < bytesPerColumn; byteIndex += 1) {
        const value = data[column * bytesPerColumn + byteIndex] ?? 0;
        for (let bit = 0; bit < 8; bit += 1) {
          if ((value & (0x80 >> bit)) === 0) {
            continue;
          }
          const row = byteIndex * 8 + bit;
          const target = row * rowBytes + (column >> 3);
          bitmap[target] = (bitmap[target] ?? 0) | (0x80 >> (column & 7));
        }
      }
    }

    this.ops.push({
      type: 'image',
      width: columns,
      height,
      mode: 0,
      data: bitmap.toString('base64'),
      style: this.copyStyle(),
    });
    this.addToken(
      start,
      end,
      'command',
      'ESC *',
      '点阵位图',
      `${columns} × ${height} 点（模式 ${mode}）`,
      [mode, columns],
    );
    return end;
  }

  private handleGs(start: number): number {
    const command = this.byteAt(start + 1);
    switch (command) {
      case 0x21: {
        const n = this.byteAt(start + 2);
        this.style.widthScale = ((n >> 4) & 0x0f) + 1;
        this.style.heightScale = (n & 0x0f) + 1;
        this.addToken(
          start,
          start + 3,
          'command',
          'GS !',
          '字符倍宽倍高',
          `${this.style.widthScale} 倍宽 × ${this.style.heightScale} 倍高`,
          [n],
        );
        return start + 3;
      }
      case 0x42: {
        const n = this.byteAt(start + 2);
        this.style.invert = n !== 0;
        this.addToken(
          start,
          start + 3,
          'command',
          'GS B',
          '反白打印',
          n ? '开启黑底白字' : '关闭反白',
          [n],
        );
        return start + 3;
      }
      case 0x56: {
        const mode = this.byteAt(start + 2);
        if (mode === 65 || mode === 66) {
          const n = this.byteAt(start + 3);
          this.ops.push({ type: 'feed', lines: n });
          this.plainText += '\n'.repeat(n);
          this.ops.push({ type: 'cut', mode: mode === 65 ? 'full' : 'partial' });
          this.addToken(
            start,
            start + 4,
            'command',
            'GS V',
            '走纸并切纸',
            `${mode === 65 ? '全切' : '半切'}，先走纸 ${n} 行`,
            [mode, n],
          );
          return start + 4;
        }
        const partial = mode === 1 || mode === 49;
        this.ops.push({ type: 'cut', mode: partial ? 'partial' : 'full' });
        this.addToken(
          start,
          start + 3,
          'command',
          'GS V',
          '切纸',
          partial ? '半切纸' : '全切纸',
          [mode],
        );
        return start + 3;
      }
      case 0x6b: {
        return this.handleBarcode(start);
      }
      case 0x28: {
        return this.handleGsParen(start);
      }
      case 0x76: {
        return this.handleRaster(start);
      }
      case 0x77: {
        const n = clamp(this.byteAt(start + 2), 1, 6);
        this.barcodeWidth = n;
        this.addToken(start, start + 3, 'command', 'GS w', '条码宽度', `条码模块宽度 ${n}`, [n]);
        return start + 3;
      }
      case 0x68: {
        const n = this.byteAt(start + 2);
        this.barcodeHeight = n;
        this.addToken(start, start + 3, 'command', 'GS h', '条码高度', `条码高度 ${n} 点`, [n]);
        return start + 3;
      }
      case 0x48: {
        const n = this.byteAt(start + 2);
        this.barcodeHri = HRI_POSITIONS[n] ?? 'none';
        this.addToken(
          start,
          start + 3,
          'command',
          'GS H',
          '条码 HRI',
          `条码文本位置：${this.barcodeHri}`,
          [n],
        );
        return start + 3;
      }
      case 0x66: {
        const n = this.byteAt(start + 2);
        this.addToken(start, start + 3, 'command', 'GS f', '条码字体', `HRI 字体 ${n}`, [n]);
        return start + 3;
      }
      case 0x4c: {
        const n = this.byteAt(start + 2) + this.byteAt(start + 3) * 256;
        this.addToken(start, start + 4, 'command', 'GS L', '左边距', `左边距 ${n} 点（未模拟）`, [n]);
        return start + 4;
      }
      case 0x57: {
        const n = this.byteAt(start + 2) + this.byteAt(start + 3) * 256;
        this.addToken(
          start,
          start + 4,
          'command',
          'GS W',
          '打印区域宽度',
          `打印区域 ${n} 点（未模拟）`,
          [n],
        );
        return start + 4;
      }
      case 0x72: {
        const n = this.byteAt(start + 2);
        this.addToken(start, start + 3, 'command', 'GS r', '打印颜色', `颜色 ${n}`, [n]);
        return start + 3;
      }
      case 0x61: {
        const n = this.byteAt(start + 2);
        this.addToken(start, start + 3, 'command', 'GS a', '自动状态', `自动状态回传 ${n}`, [n]);
        return start + 3;
      }
      default: {
        this.addToken(
          start,
          start + 2,
          'unknown',
          `GS 0x${command.toString(16).padStart(2, '0').toUpperCase()}`,
          '未知 GS 指令',
          '未识别的 GS 指令，按 2 字节跳过',
          [command],
        );
        this.warn(`偏移 ${start}：未识别的 GS 指令 0x${command.toString(16)}`);
        return start + 2;
      }
    }
  }

  private handleFs(start: number): number {
    const command = this.byteAt(start + 1);
    switch (command) {
      case 0x26: {
        this.addToken(start, start + 2, 'command', 'FS &', '中文模式', '进入中文模式');
        return start + 2;
      }
      case 0x2e: {
        this.addToken(start, start + 2, 'command', 'FS .', '中文模式', '退出中文模式');
        return start + 2;
      }
      case 0x2d: {
        const n = this.byteAt(start + 2);
        this.style.underline = n !== 0;
        this.addToken(
          start,
          start + 3,
          'command',
          'FS -',
          '中文下划线',
          n ? '开启中文字符下划线' : '关闭中文字符下划线',
          [n],
        );
        return start + 3;
      }
      default: {
        this.addToken(
          start,
          start + 2,
          'unknown',
          `FS 0x${command.toString(16).padStart(2, '0').toUpperCase()}`,
          '未知 FS 指令',
          '未识别的 FS 指令，按 2 字节跳过',
          [command],
        );
        return start + 2;
      }
    }
  }

  private handleBarcode(start: number): number {
    const mode = this.byteAt(start + 2);
    let dataStart = start + 3;
    let end = dataStart;
    if (mode <= 6) {
      while (end < this.bytes.length && this.byteAt(end) !== NUL) {
        end += 1;
      }
      dataStart = start + 3;
      end = Math.min(end + 1, this.bytes.length);
    } else if (mode >= 65 && mode <= 73) {
      const length = this.byteAt(start + 3);
      dataStart = start + 4;
      end = Math.min(dataStart + length, this.bytes.length);
    }

    let dataEnd = end;
    if (mode < 65 && this.byteAt(end - 1) === NUL) {
      dataEnd = end - 1;
    }
    const data = this.decode(this.bytes.subarray(dataStart, dataEnd)).replace(/\0+$/, '');
    const symbology = BARCODE_TYPES[mode] ?? `UNKNOWN(${mode})`;
    this.ops.push({
      type: 'barcode',
      symbology,
      data,
      width: this.barcodeWidth,
      height: this.barcodeHeight,
      hri: this.barcodeHri,
      style: this.copyStyle(),
    });
    this.addToken(
      start,
      end,
      'command',
      'GS k',
      '一维条码',
      `${symbology}：${data || '（空数据）'}`,
      [mode, data.length],
    );
    return end;
  }

  private handleGsParen(start: number): number {
    const identifier = this.byteAt(start + 2);
    const length = this.byteAt(start + 3) + this.byteAt(start + 4) * 256;
    const dataStart = start + 5;
    const end = clamp(dataStart + length, dataStart, this.bytes.length);

    if (identifier !== 0x6b) {
      this.addToken(
        start,
        end,
        'unknown',
        `GS ( 0x${identifier.toString(16).padStart(2, '0').toUpperCase()}`,
        '未知 GS ( 扩展指令',
        `长度 ${length} 字节，已跳过`,
      );
      return end;
    }

    const cn = this.byteAt(dataStart);
    const fn = this.byteAt(dataStart + 1);
    const payload = this.bytes.subarray(dataStart + 2, end);
    const value = payload[0] ?? 0;
    let description = `二维码子命令 cn=${cn} fn=${fn}`;

    if (fn === 65) {
      this.qrModel = value;
      description = `二维码型号：${value === 49 ? 'Model 1' : value === 50 ? 'Model 2' : 'Micro QR'}`;
    } else if (fn === 67) {
      this.qrModuleSize = clamp(value, 1, 16);
      description = `二维码模块大小：${this.qrModuleSize}`;
    } else if (fn === 69) {
      this.qrErrorCorrection = ECC_LEVELS[value] ?? 'M';
      description = `二维码纠错级别：${this.qrErrorCorrection}`;
    } else if (fn === 80) {
      this.qrData = this.decode(payload).replace(/\0+$/, '');
      description = `缓存二维码数据：${this.qrData.slice(0, 40)}`;
    } else if (fn === 81) {
      this.ops.push({
        type: 'qr',
        data: this.qrData,
        moduleSize: this.qrModuleSize,
        errorCorrection: this.qrErrorCorrection,
        style: this.copyStyle(),
      });
      description = `打印二维码：${this.qrData.slice(0, 40)}`;
    }

    this.addToken(start, end, 'command', 'GS ( k', '二维码', description, [cn, fn, value]);
    return end;
  }

  private handleRaster(start: number): number {
    // GS v 0 m xL xH yL yH data...
    if (this.byteAt(start + 2) !== 0x30) {
      const sub = this.byteAt(start + 2);
      this.addToken(
        start,
        start + 3,
        'command',
        'GS v',
        '光栅指令',
        `GS v 子命令 ${sub}（未模拟）`,
        [sub],
      );
      return start + 3;
    }

    const mode = this.byteAt(start + 3);
    const widthBytes = this.byteAt(start + 4) + this.byteAt(start + 5) * 256;
    const height = this.byteAt(start + 6) + this.byteAt(start + 7) * 256;
    const dataStart = start + 8;
    const expected = widthBytes * height;
    const end = Math.min(dataStart + expected, this.bytes.length);
    if (dataStart + expected > this.bytes.length) {
      this.warn(`偏移 ${start}：GS v 0 位图数据不完整`);
    }
    const width = widthBytes * 8;
    const raw = this.bytes.subarray(dataStart, end);

    this.ops.push({
      type: 'image',
      width,
      height,
      mode,
      data: Buffer.from(raw).toString('base64'),
      style: this.copyStyle(),
    });
    this.addToken(
      start,
      end,
      'command',
      'GS v 0',
      '光栅位图',
      `${width} × ${height} 点（模式 ${mode}）`,
      [mode, width, height],
    );
    return end;
  }
}

function alignLabel(align: PrintStyle['align']): string {
  if (align === 'center') {
    return '居中';
  }
  if (align === 'right') {
    return '右对齐';
  }
  return '左对齐';
}

/** 解析 ESC/POS 字节，永不抛错；异常会进入 warnings。 */
export function parseEscPos(
  input: Uint8Array | Buffer,
  options: ParseOptions = {},
): ParsedEscPos {
  try {
    return new EscPosParser(input, options).parse();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ops: [],
      tokens: [],
      plainText: '',
      warnings: [`解析失败：${message}`],
      stats: { bytes: input.length, commands: 0, texts: 0, unknown: 0 },
    };
  }
}

/** 提取一条任务在列表中展示的标题与摘要。 */
export function summarizeParsed(
  parsed: ParsedEscPos,
  raw: Uint8Array,
): { title: string; preview: string } {
  const lines = parsed.plainText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0]?.slice(0, 32) || '未命名打印任务';
  const text = parsed.plainText.replace(/\s+/g, ' ').trim();
  const preview = text ? text.slice(0, 120) : `原始 ${raw.length} 字节`;
  return { title, preview };
}
