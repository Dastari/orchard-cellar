// v1.0.0 — Reproduce the doc 63 station-art review from committed text grids.
import process from 'node:process';
import console from 'node:console';
import { createCanvas } from '@napi-rs/canvas';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(root, process.argv[2] ?? 'output/food-alchemy-station-art');
const world = ['alchemy_bench', 'copper_still', 'kitchen_cauldron', 'bread_oven', 'varietal_press', 'alchemy_cask', 'apiary', 'wild_hive'].map(n => `prop_${n}`);
const icons = ['alchemy', 'still', 'cauldron', 'oven', 'varietal_press', 'alchemy_cask', 'apiary'].map(n => `icon_alchemy_${n}`);
const neighbors = ['prop_basket_press', 'prop_oak_barrel', 'prop_cf_furnace'];
const palette = JSON.parse(await readFile(path.join(root, 'packages/assets/palette.json'), 'utf8')).colors;
const assets = Object.fromEntries(await Promise.all([...world, ...icons, ...neighbors].map(async name => [name, JSON.parse(await readFile(path.join(root, `packages/assets/${name.startsWith('icon') ? 'ui' : 'props'}/${name}.sprite.json`), 'utf8'))])));
function grid(ctx, a, frame, x, y, scale) {
  for (let py = 0; py < a.size[1]; py++) for (let px = 0; px < a.size[0]; px++) {
    const c = frame[py][px]; if (c === '.') continue;
    ctx.fillStyle = a.sourcePalette?.[c] ?? palette[c];
    ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
  }
}
function canvas(w, h) {
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#f2e3c2'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b1d0e'; ctx.font = '14px monospace';
  return [c, ctx];
}
await mkdir(output, { recursive: true });
const [contact, ctx] = canvas(1120, 1050);
for (let i = 0; i < world.length; i++) {
  const a = assets[world[i]], x = 12 + (i % 4) * 280, y = 14 + Math.floor(i / 4) * 345;
  ctx.fillStyle = '#2b1d0e'; ctx.fillText(a.name.replace('prop_', ''), x, y + 14);
  grid(ctx, a, Object.values(a.frames)[0][0], x, y + 24, 6);
  grid(ctx, a, Object.values(a.frames)[0][0], x + 208, y + 25, 1);
}
for (let i = 0; i < icons.length; i++) {
  const a = assets[icons[i]], x = 12 + i * 158, y = 735;
  ctx.fillStyle = '#2b1d0e'; ctx.font = '12px monospace';
  ctx.fillText(a.name.replace('icon_alchemy_', ''), x, y);
  grid(ctx, a, a.frames.base[0], x, y + 16, 8);
  grid(ctx, a, a.frames.base[0], x, y + 160, 1);
}
ctx.font = '14px monospace'; ctx.fillStyle = '#2b1d0e'; ctx.fillText('Approved neighbours: basket press / oak barrel / furnace', 12, 950);
for (let i = 0; i < neighbors.length; i++) {
  const a = assets[neighbors[i]]; grid(ctx, a, Object.values(a.frames)[0][0], 580 + i * 170, 910, 4);
}
await writeFile(path.join(output, 'contact.png'), contact.toBuffer('image/png'));
for (const name of world) {
  const a = assets[name], frames = Object.entries(a.frames).flatMap(([state, fs]) => fs.map((f, i) => [state, i, f]));
  const [sheet, s] = canvas(Math.max(900, frames.length * (a.size[0] * 4 + 12)), 680);
  s.fillText(`${name} — 8× / 1× / night backdrop; all states at 4×`, 12, 20);
  grid(s, a, frames[0][2], 12, 40, 8); grid(s, a, frames[0][2], 300, 40, 1);
  s.fillStyle = '#232338'; s.fillRect(360, 40, a.size[0] * 4 + 16, a.size[1] * 4 + 16);
  grid(s, a, frames[0][2], 368, 48, 4);
  for (let n = 0; n < neighbors.length; n++) {
    const ref = assets[neighbors[n]]; grid(s, ref, Object.values(ref.frames)[0][0], 550 + n * 116, 70, 3);
  }
  frames.forEach(([state, i, f], n) => {
    const x = 12 + n * (a.size[0] * 4 + 12); s.fillStyle = '#2b1d0e'; s.font = '11px monospace';
    s.fillText(`${state} ${i}`, x, 460); grid(s, a, f, x, 474, 4);
  });
  await writeFile(path.join(output, `${name}.png`), sheet.toBuffer('image/png'));
}
console.log(`Rendered contact and eight complete state reviews to ${output}`);
