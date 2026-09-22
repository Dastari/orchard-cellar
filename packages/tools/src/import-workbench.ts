/** Convert the retained AI source to the game's 32px, two-tile sprite grid.
 * Run: npx tsx packages/tools/src/import-workbench.ts */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/png.js';

const directory = new URL('../../assets/props/', import.meta.url);
const source = decodePng(await readFile(new URL('../../../art/custom/workbench/workbench-ai-source.png', import.meta.url)));
const palette = ['#3f2832', '#59313b', '#704238', '#854a39', '#99553e', '#ad6142',
  '#bf6f4a', '#ce834d', '#de9354', '#eaa55f', '#eeb57c', '#f6ca9f', '#fbdbbc',
  '#28333e', '#394650', '#4b5961', '#65747b', '#809399', '#94a9ad', '#b2c4c4'];
const symbols = '0123456789ABCDEFGHIJ';
const colors = palette.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
let left = source.width, right = 0, top = source.height, bottom = 0;
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  if (source.rgba[(y * source.width + x) * 4 + 3]! < 128) continue;
  left = Math.min(left, x); right = Math.max(right, x);
  top = Math.min(top, y); bottom = Math.max(bottom, y);
}
if (left > right || top > bottom) throw new Error('Workbench source has no opaque pixels');
const width = 32, height = Math.round((bottom - top + 1) * width / (right - left + 1));
if (height > 32) throw new Error('Workbench source is too tall');
const rows = Array.from({ length: 32 }, () => '.'.repeat(width));
for (let y = 0; y < height; y++) {
  let row = '';
  for (let x = 0; x < width; x++) {
    const sx = Math.min(right, left + Math.floor((x + 0.5) * (right - left + 1) / width));
    const sy = Math.min(bottom, top + Math.floor((y + 0.5) * (bottom - top + 1) / height));
    const offset = (sy * source.width + sx) * 4;
    if (source.rgba[offset + 3]! < 128) { row += '.'; continue; }
    let nearest = 0, distance = Infinity;
    for (const [index, color] of colors.entries()) {
      const delta = color.reduce((sum, channel, c) => sum + (channel - source.rgba[offset + c]!) ** 2, 0);
      if (delta < distance) { distance = delta; nearest = index; }
    }
    row += symbols[nearest];
  }
  rows[32 - height + y] = row;
}
const sprite = {
  name: 'prop_cf_workbench', category: 'props', size: [32, 32], anchor: [8, 31],
  frames: { base: [rows] }, frameKinds: { base: 'state' },
  sourcePalette: Object.fromEntries(palette.flatMap((color, index) =>
    rows.some(row => row.includes(symbols[index]!)) ? [[symbols[index], color]] : [])),
  sourcePaletteMode: 'exact', approved: true,
  importedFrom: 'workbench-ai-source.png',
  sourcePath: 'art/custom/workbench/workbench-ai-source.png',
  tags: ['world.placeable', 'station.workbench'],
  placement: { layer: 'object', footprint: [2, 1], blocksMovement: true, builderAvailable: false },
};
const target = new URL('prop_cf_workbench.sprite.json', directory);
await writeFile(target, `${JSON.stringify(sprite, null, 2)}\n`);
console.log(`Imported workbench sprite: ${fileURLToPath(target)}`);
