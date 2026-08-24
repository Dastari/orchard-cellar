import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error('RGBA buffer has the wrong length');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), target + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const cornerDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= cornerDistance ? left : aboveDistance <= cornerDistance ? above : upperLeft;
}

export function decodePng(buffer: Buffer): DecodedPng {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('Importer supports non-interlaced 8-bit RGBA PNGs only');
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (stride + 1);
    const filter = raw[sourceOffset];
    for (let x = 0; x < stride; x += 1) {
      const source = raw[sourceOffset + 1 + x] ?? 0;
      const left = x >= 4 ? rgba[y * stride + x - 4] ?? 0 : 0;
      const above = y > 0 ? rgba[(y - 1) * stride + x] ?? 0 : 0;
      const upperLeft = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4] ?? 0 : 0;
      const value = filter === 0 ? source
        : filter === 1 ? source + left
        : filter === 2 ? source + above
        : filter === 3 ? source + Math.floor((left + above) / 2)
        : filter === 4 ? source + paeth(left, above, upperLeft)
        : Number.NaN;
      if (!Number.isFinite(value)) throw new Error(`Unsupported PNG filter ${filter}`);
      rgba[y * stride + x] = value & 255;
    }
  }
  return { width, height, rgba };
}

export function hexToRgba(hex: string): readonly [number, number, number, number] {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) throw new Error(`Invalid RGB(A) color ${hex}`);
  const rgb = Number.parseInt(hex.slice(1, 7), 16);
  const alpha = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255;
  return [(rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255, alpha];
}

export function setPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= width || y >= rgba.length / (width * 4)) return;
  const offset = (y * width + x) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = color[3];
}

export function blendPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= width || y >= rgba.length / (width * 4)) return;
  const offset = (y * width + x) * 4;
  const sourceAlpha = color[3] / 255;
  const destinationAlpha = (rgba[offset + 3] ?? 0) / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha === 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    const source = color[channel] ?? 0;
    const destination = rgba[offset + channel] ?? 0;
    rgba[offset + channel] = Math.round((source * sourceAlpha + destination * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  }
  rgba[offset + 3] = Math.round(outputAlpha * 255);
}
