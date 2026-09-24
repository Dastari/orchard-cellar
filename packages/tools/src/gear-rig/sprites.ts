import { readFile } from 'node:fs/promises';
import { loadPalette, assetsRoot } from '../assets/load.js';
import { resolveColor } from '../assets/pixels.js';
import type { AssetSource } from '../assets/types.js';
import { Raster } from './raster.js';

/** Rasterise frame `index` of `frame` from a committed text-grid sprite asset. */
export async function loadSprite(path: string, frame = 'base', index = 0): Promise<{ asset: AssetSource; image: Raster }> {
  const asset = JSON.parse(await readFile(new URL(path, assetsRoot), 'utf8')) as AssetSource;
  const palette = await loadPalette();
  const grid = asset.frames[frame]?.[index];
  if (!grid) throw new Error(`${path} has no ${frame}[${index}]`);
  const image = new Raster(grid[0]!.length, grid.length);
  grid.forEach((row, y) => {
    [...row].forEach((character, x) => {
      const [r, g, b, a] = resolveColor(character, palette, {}, {}, asset.sourcePalette ?? {});
      if (a === 0) return;
      const offset = (y * image.width + x) * 4;
      image.rgba[offset] = r;
      image.rgba[offset + 1] = g;
      image.rgba[offset + 2] = b;
      image.rgba[offset + 3] = a;
    });
  });
  return { asset, image };
}

/** Draw a nine-slice sprite (`slice` = [left, top, right, bottom]) stretched to size by tiling edges. */
export function nineSlice(source: Raster, slice: readonly [number, number, number, number], width: number, height: number): Raster {
  const [left, top, right, bottom] = slice;
  const out = new Raster(width, height);
  const midW = source.width - left - right;
  const midH = source.height - top - bottom;
  const sample = (x: number, y: number): number => {
    const sx = x < left ? x : x >= width - right ? source.width - (width - x) : left + ((x - left) % midW);
    const sy = y < top ? y : y >= height - bottom ? source.height - (height - y) : top + ((y - top) % midH);
    return (sy * source.width + sx) * 4;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = sample(x, y);
      out.rgba.set(source.rgba.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return out;
}

export interface BitmapFont {
  readonly glyphs: Readonly<Record<string, readonly [number, number, number, number]>>;
  readonly atlas: Raster;
  readonly glyphHeight: number;
  readonly advance: number;
}

export async function loadFont(path: string): Promise<BitmapFont> {
  const { asset, image } = await loadSprite(path);
  const meta = asset as unknown as { glyphs: BitmapFont['glyphs']; glyphSize: [number, number]; cellSize: [number, number] };
  return { glyphs: meta.glyphs, atlas: image, glyphHeight: meta.glyphSize[1], advance: meta.cellSize[0] };
}

export function textWidth(font: BitmapFont, text: string): number {
  return Math.max(0, [...text].length * font.advance - 1);
}

/** Draw tinted text; the font atlas is a mask, as in the game's pixel UI. */
export function drawText(target: Raster, font: BitmapFont, text: string, x: number, y: number, hex: string): number {
  let cursor = x;
  for (const character of text) {
    const glyph = font.glyphs[character] ?? font.glyphs['?'];
    if (glyph) {
      const [gx, gy, gw, gh] = glyph;
      for (let row = 0; row < gh; row += 1) {
        for (let column = 0; column < gw; column += 1) {
          if (font.atlas.alpha(gx + column, gy + row) > 0) target.set(cursor + column, y + row, hex);
        }
      }
    }
    cursor += font.advance;
  }
  return cursor - x;
}
