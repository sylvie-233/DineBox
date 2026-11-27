/** 内置示例单据：用真实 ESC/POS 指令拼出字节，供模拟器开箱演示。 */
import iconv from 'iconv-lite';

import type { SampleInfo } from '../types';

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
const LF = 0x0a;

class Builder {
  private chunks: Buffer[] = [];

  raw(...bytes: number[]): this {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  bytes(buffer: Buffer): this {
    this.chunks.push(buffer);
    return this;
  }

  text(value: string): this {
    this.chunks.push(iconv.encode(value, 'gbk'));
    return this;
  }

  line(value = ''): this {
    this.text(value);
    return this.raw(LF);
  }

  init(): this {
    return this.raw(ESC, 0x40).raw(FS, 0x26);
  }

  align(mode: 0 | 1 | 2): this {
    return this.raw(ESC, 0x61, mode);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  underline(on: boolean): this {
    return this.raw(ESC, 0x2d, on ? 1 : 0);
  }

  invert(on: boolean): this {
    return this.raw(GS, 0x42, on ? 1 : 0);
  }

  size(width: number, height: number): this {
    const w = Math.min(8, Math.max(1, width));
    const h = Math.min(8, Math.max(1, height));
    return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  }

  font(font: 'A' | 'B'): this {
    return this.raw(ESC, 0x4d, font === 'B' ? 1 : 0);
  }

  lineSpacing(dots: number): this {
    return this.raw(ESC, 0x33, Math.max(0, Math.min(255, dots)));
  }

  feed(lines: number): this {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(255, lines)));
  }

  cut(mode: 'full' | 'partial' = 'full'): this {
    return this.raw(GS, 0x56, mode === 'full' ? 0 : 1);
  }

  drawer(): this {
    return this.raw(ESC, 0x70, 0, 60, 120);
  }

  barcode(data: string, height = 60, width = 2, hri = 2): this {
    const payload = Buffer.from(data, 'latin1');
    return this.raw(GS, 0x68, height)
      .raw(GS, 0x77, width)
      .raw(GS, 0x48, hri)
      .raw(GS, 0x6b, 73, payload.length)
      .bytes(payload);
  }

  qr(data: string, moduleSize = 4): this {
    const payload = iconv.encode(data, 'gbk');
    const command = (cn: number, fn: number, value: Buffer): this => {
      const length = 2 + value.length;
      this.raw(GS, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, cn, fn);
      this.bytes(value);
      return this;
    };
    command(49, 65, Buffer.from([50])); // Model 2
    command(49, 67, Buffer.from([moduleSize])); // 模块大小
    command(49, 69, Buffer.from([49])); // 纠错 M
    command(49, 80, payload); // 缓存数据
    command(49, 81, Buffer.from([48])); // 打印
    return this;
  }

  raster(width: number, height: number, bitmap: Uint8Array): this {
    const widthBytes = Math.ceil(width / 8);
    this.raw(
      GS,
      0x76,
      0x30,
      0,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    );
    this.bytes(Buffer.from(bitmap));
    return this;
  }

  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

const FONT_5X7: Record<string, string[]> = {
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
};

/** 把 5×7 点阵字放大后打包为 GS v 0 的 1bpp 位图。 */
function logoBitmap(text: string, scale = 4, padding = 4): { width: number; height: number; data: Uint8Array } {
  const chars = Array.from(text.toUpperCase()).filter((char) => FONT_5X7[char]);
  const glyphWidth = 5 * scale;
  const glyphHeight = 7 * scale;
  const gap = 2 * scale;
  const width = padding * 2 + chars.length * glyphWidth + Math.max(0, chars.length - 1) * gap;
  const height = padding * 2 + glyphHeight;
  const widthBytes = Math.ceil(width / 8);
  const data = new Uint8Array(widthBytes * height);

  chars.forEach((char, index) => {
    const glyph = FONT_5X7[char];
    if (!glyph) {
      return;
    }
    const originX = padding + index * (glyphWidth + gap);
    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column += 1) {
        if (row[column] !== '1') {
          continue;
        }
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const x = originX + column * scale + dx;
            const y = padding + rowIndex * scale + dy;
            const target = y * widthBytes + (x >> 3);
            data[target] = (data[target] ?? 0) | (0x80 >> (x & 7));
          }
        }
      }
    });
  });

  return { width, height, data };
}

function now(): string {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function orderNo(): string {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `DB${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function kitchenSlip(): Buffer {
  const builder = new Builder();
  builder
    .init()
    .align(1)
    .size(2, 2)
    .text('【后厨单】')
    .raw(LF)
    .size(1, 1)
    .align(0)
    .line('--------------------------------')
    .bold(true)
    .line('桌号：A-05          人数：4')
    .line(`单号：${orderNo()}`)
    .bold(false)
    .line(`时间：${now()}`)
    .line('--------------------------------')
    .bold(true)
    .line('宫保鸡丁           x1    38.00')
    .bold(false)
    .line('  微辣 · 加花生×1')
    .line('米饭               x4     8.00')
    .line('冰柠檬茶           x2    16.00')
    .line('--------------------------------')
    .bold(true)
    .line('备注：少放辣，先上凉菜')
    .bold(false)
    .line('--------------------------------')
    .align(1)
    .text('请按单出品')
    .raw(LF)
    .feed(3)
    .cut('full');
  return builder.build();
}

function billSlip(): Buffer {
  const no = orderNo();
  const builder = new Builder();
  builder
    .init()
    .align(1)
    .size(2, 2)
    .text('希食堂')
    .raw(LF)
    .size(1, 1)
    .text('DineBox 扫码点餐')
    .raw(LF)
    .align(0)
    .line('--------------------------------')
    .line(`单号：${no}`)
    .line('桌号：A-05          人数：4')
    .line(`时间：${now()}`)
    .line('--------------------------------')
    .line('宫保鸡丁           x1    38.00')
    .line('米饭               x4     8.00')
    .line('冰柠檬茶           x2    16.00')
    .line('--------------------------------')
    .line('合计：                   62.00')
    .line('抹零：                    0.00')
    .bold(true)
    .size(1, 2)
    .line('应收：                   62.00')
    .size(1, 1)
    .bold(false)
    .line('--------------------------------')
    .align(1)
    .barcode(no, 56, 2, 2)
    .raw(LF)
    .qr(`https://dinebox.local/order/${no}`, 4)
    .raw(LF)
    .line('扫码查看订单')
    .feed(3)
    .cut('full');
  return builder.build();
}

function showcaseSlip(): Buffer {
  const logo = logoBitmap('DBX', 4);
  const builder = new Builder();
  builder
    .init()
    .align(1)
    .size(2, 2)
    .text('ESC/POS 指令全览')
    .raw(LF)
    .size(1, 1)
    .line('DineBox 虚拟打印机')
    .raw(LF)
    .raster(logo.width, logo.height, logo.data)
    .raw(LF)
    .align(0)
    .line('--------------------------------')
    .line('对齐：左 / 居中 / 右')
    .align(1)
    .line('这一行居中')
    .align(2)
    .line('这一行右对齐')
    .align(0)
    .bold(true)
    .line('ESC E 加粗文本')
    .bold(false)
    .underline(true)
    .line('ESC - 下划线文本')
    .underline(false)
    .invert(true)
    .line(' GS B 反白打印 ')
    .invert(false)
    .size(2, 1)
    .line('倍宽文本')
    .size(1, 2)
    .line('倍高文本')
    .size(2, 2)
    .line('倍宽倍高')
    .size(1, 1)
    .font('B')
    .line('Font B 小字体：DB202611270001')
    .font('A')
    .lineSpacing(36)
    .line('行距 36 点')
    .lineSpacing(0)
    .line('--------------------------------')
    .align(1)
    .barcode('6901234567892', 52, 2, 2)
    .raw(LF)
    .qr('https://github.com/dinebox', 4)
    .raw(LF)
    .line('二维码 + EAN13 条码')
    .align(0)
    .line('--------------------------------')
    .line('钱箱指令：ESC p')
    .drawer()
    .feed(3)
    .cut('partial')
    .feed(2)
    .cut('full');
  return builder.build();
}

const SAMPLE_BUILDERS: Record<string, { info: SampleInfo; build: () => Buffer }> = {
  kitchen: {
    info: { id: 'kitchen', name: '后厨单', description: '中文、加粗、倍高标题与切纸' },
    build: kitchenSlip,
  },
  bill: {
    info: { id: 'bill', name: '结账单', description: '条码、二维码、金额与切纸' },
    build: billSlip,
  },
  showcase: {
    info: { id: 'showcase', name: '指令全览', description: '对齐、字体、反白、位图、条码、二维码' },
    build: showcaseSlip,
  },
};

export function listSamples(): SampleInfo[] {
  return Object.values(SAMPLE_BUILDERS).map((sample) => sample.info);
}

export function buildSample(id: string): Buffer | null {
  return SAMPLE_BUILDERS[id]?.build() ?? null;
}

/** 把纯文本包装成一张最小 ESC/POS 小票：中文模式 + 文本 + 走纸 + 切纸。 */
export function buildTextReceipt(text: string, encoding: 'gbk' | 'utf8' | 'cp437' | 'cp850' | 'latin1'): Buffer {
  return Buffer.concat([
    Buffer.from([ESC, 0x40, FS, 0x26]),
    iconv.encode(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), encoding),
    Buffer.from([LF, LF, LF]),
    Buffer.from([GS, 0x56, 0x00]),
  ]);
}
