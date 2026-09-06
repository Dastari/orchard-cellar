import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBakedShadow, type ShadowSeasonRemaps } from './assets/baked-shadow.js';
import { assetsRoot, loadAssets, loadPalette, readJson } from './assets/load.js';
import { framesForAsset, resolveColor } from './assets/pixels.js';
import { blendPixel, encodePng, hexToRgba, setPixel } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

/** Review candidates, never annotate source assets automatically. Images contain
 * originals and highlighted compiled spans on light and dark backgrounds. */
export async function shadowInventory(directory: string, category = 'trees'): Promise<void> {
  const [assets, palette, seasons] = await Promise.all([
    loadAssets(), loadPalette(), readJson(new URL('seasons.json', assetsRoot)) as Promise<ShadowSeasonRemaps>,
  ]);
  await mkdir(directory, { recursive: true });
  const candidates = assets.filter((asset) => asset.category === category);
  const font = assets.find((asset) => asset.name === 'font_5x7') as AssetSource & { glyphs: Record<string, [number, number]> };
  const reports = [];
  let page = 0, row = 0;
  const width = 576, rowHeight = 160, height = rowHeight * 6;
  let pixels = new Uint8Array(width * height * 4);
  const beginPage = (): void => {
    pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) setPixel(pixels, width, x, y, hexToRgba('#d9c49a'));
  };
  beginPage();
  const savePage = async (): Promise<void> => {
    await writeFile(resolve(directory, `review-${page + 1}.png`), encodePng(width, height, pixels));
    page++; row = 0; beginPage();
  };
  for (const asset of candidates) {
    const colors = [...new Set(Object.values(asset.sourcePalette ?? {}).map((color) => color.toLowerCase()))]
      .filter((color) => color === '#00000028' || color === '#00000064');
    for (const color of colors) {
      const shadow = compileBakedShadow({ ...asset, bakedShadowColor: color }, palette, seasons)!;
      for (const [group, grids] of Object.entries(framesForAsset(asset))) for (const [index, grid] of grids.entries()) {
        const selection = shadow.frames[group]![index]!;
        const matched = new Set<number>();
        for (let i = 0; i < selection.spans.length; i += 3) {
          const [y, start, length] = selection.spans.slice(i, i + 3) as [number, number, number];
          for (let x = start; x < start + length; x++) matched.add(y * asset.size[0] + x);
        }
        const translucent = new Set<string>();
        const bounds = matched.size === 0 ? null : [
          Math.min(...[...matched].map((p) => p % asset.size[0])), Math.min(...[...matched].map((p) => Math.floor(p / asset.size[0]))),
          Math.max(...[...matched].map((p) => p % asset.size[0])), Math.max(...[...matched].map((p) => Math.floor(p / asset.size[0]))),
        ];
        const label = `${asset.name} ${group}[${index}] ${selection.pixelCount}`.toUpperCase();
        [...label].forEach((ch, offset) => {
          const glyph = font.glyphs[ch];
          if (!glyph) return;
          for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
            if (font.frames['base']![0]![glyph[1] + y]![glyph[0] + x] !== '.') {
              setPixel(pixels, width, 4 + offset * 6 + x, row * rowHeight + 4 + y, hexToRgba('#302c36'));
            }
          }
        });
        for (let panel = 0; panel < 4; panel++) {
          const background = hexToRgba(panel < 2 ? '#d9c49a' : '#302c36');
          const scale = Math.min(2, Math.floor(136 / Math.max(...asset.size)));
          for (let y = 0; y < 144; y++) for (let x = 0; x < 144; x++) setPixel(pixels, width, panel * 144 + x, row * rowHeight + 16 + y, background);
          for (let y = 0; y < asset.size[1]; y++) for (let x = 0; x < asset.size[0]; x++) {
            const rgba = resolveColor(grid[y]![x]!, palette, seasons.summer, asset.markers ?? {}, asset.sourcePalette ?? {});
            if (!matched.has(y * asset.size[0] + x) && rgba[3] > 0 && rgba[3] < 255) {
              translucent.add(`#${rgba.map((c) => c.toString(16).padStart(2, '0')).join('')}`);
            }
            const displayed = panel % 2 === 1 && matched.has(y * asset.size[0] + x) ? hexToRgba('#ff40c0') : rgba;
            for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
              blendPixel(pixels, width, panel * 144 + 4 + x * scale + sx, row * rowHeight + 20 + y * scale + sy, displayed);
            }
          }
        }
        reports.push({ asset: asset.name, group, index, color, pixelCount: selection.pixelCount, bounds,
          otherTranslucentColors: [...translucent].sort(), review: `review-${page + 1}.png`, row });
        if (++row === 6) await savePage();
      }
    }
  }
  if (row > 0) await savePage();
  await writeFile(resolve(directory, 'inventory.json'), `${JSON.stringify(reports, null, 2)}\n`);
  console.log(`Reviewed ${reports.length} candidate frames in ${page} sheets; no source declarations changed.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const directory = process.argv[2];
  if (directory === undefined) throw new Error('Usage: shadow-inventory <output-directory> [category]');
  await shadowInventory(resolve(directory), process.argv[3]);
}
