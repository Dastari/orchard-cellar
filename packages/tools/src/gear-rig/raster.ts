import { readFile, writeFile } from 'node:fs/promises';
import { decodePng, encodePng } from '../assets/png.js';

/** Straight-alpha RGBA pixel buffer with the few operations the gear rig needs. */
export class Raster {
  readonly rgba: Uint8Array;

  constructor(readonly width: number, readonly height: number, rgba?: Uint8Array) {
    this.rgba = rgba ?? new Uint8Array(width * height * 4);
  }

  static async load(path: string): Promise<Raster> {
    const png = decodePng(await readFile(path));
    return new Raster(png.width, png.height, png.rgba);
  }

  async save(path: string): Promise<void> {
    await writeFile(path, encodePng(this.width, this.height, this.rgba));
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.rgba[(y * this.width + x) * 4 + 3]!;
  }

  hex(x: number, y: number): string | null {
    if (this.alpha(x, y) === 0) return null;
    const offset = (y * this.width + x) * 4;
    return `#${[0, 1, 2].map((channel) => this.rgba[offset + channel]!.toString(16).padStart(2, '0')).join('')}`;
  }

  set(x: number, y: number, hex: string, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 4;
    this.rgba[offset] = Number.parseInt(hex.slice(1, 3), 16);
    this.rgba[offset + 1] = Number.parseInt(hex.slice(3, 5), 16);
    this.rgba[offset + 2] = Number.parseInt(hex.slice(5, 7), 16);
    this.rgba[offset + 3] = alpha;
  }

  crop(x: number, y: number, width: number, height: number): Raster {
    const out = new Raster(width, height);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const sx = x + column;
        const sy = y + row;
        if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) continue;
        const from = (sy * this.width + sx) * 4;
        out.rgba.set(this.rgba.subarray(from, from + 4), (row * width + column) * 4);
      }
    }
    return out;
  }

  fill(hex: string): this {
    for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) this.set(x, y, hex);
    return this;
  }

  /** Source-over composite; `flip` mirrors the source horizontally. */
  draw(source: Raster, dx: number, dy: number, flip = false): this {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sx = flip ? source.width - 1 - x : x;
        const from = (y * source.width + sx) * 4;
        const alpha = source.rgba[from + 3]!;
        if (alpha === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        const to = (ty * this.width + tx) * 4;
        const a = alpha / 255;
        const b = this.rgba[to + 3]! / 255;
        const outAlpha = a + b * (1 - a);
        for (let channel = 0; channel < 3; channel += 1) {
          const blended = (source.rgba[from + channel]! * a + this.rgba[to + channel]! * b * (1 - a)) / outAlpha;
          this.rgba[to + channel] = Math.round(blended);
        }
        this.rgba[to + 3] = Math.round(outAlpha * 255);
      }
    }
    return this;
  }

  /** Exact colour substitution; colours missing from the map are kept. */
  recolor(map: ReadonlyMap<string, string>): Raster {
    const out = new Raster(this.width, this.height, this.rgba.slice());
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const color = this.hex(x, y);
        const next = color ? map.get(color) : undefined;
        if (next) out.set(x, y, next, this.alpha(x, y));
      }
    }
    return out;
  }

  scaled(factor: number): Raster {
    const out = new Raster(this.width * factor, this.height * factor);
    for (let y = 0; y < out.height; y += 1) {
      for (let x = 0; x < out.width; x += 1) {
        const from = (Math.floor(y / factor) * this.width + Math.floor(x / factor)) * 4;
        out.rgba.set(this.rgba.subarray(from, from + 4), (y * out.width + x) * 4);
      }
    }
    return out;
  }

  bounds(): { x: number; y: number; width: number; height: number } | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.alpha(x, y) === 0) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }
}
