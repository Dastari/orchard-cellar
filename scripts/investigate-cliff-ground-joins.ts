/** Reproduce the wiki investigation: npx tsx scripts/investigate-cliff-ground-joins.ts [output-directory]
 * Native pixels replay actual GroundChunkCache/depth-queue draw plans. No AI art,
 * decorative overlays, alternative autotiler, or live world edits are involved.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { loadAssets, loadPalette } from '../packages/tools/src/assets/load.js';
import { framesForAsset, resolveColor } from '../packages/tools/src/assets/pixels.js';
import { cliffFixtures, fixturePlan, probeFixture, sixLevelVolcano, walkFixture } from './cliff-ground-join-fixtures.js';
import { planTerrain, type TerrainPlanAtlasAsset, type TerrainPlanInput } from './terrain-plan.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] ?? resolve(root, 'output/cliff-ground-investigation-20261001'));
const assets = await loadAssets();
const palette = await loadPalette();
const byId = new Map(assets.map((asset) => [asset.name, asset]));
const atlas: Record<string, TerrainPlanAtlasAsset> = Object.fromEntries(assets.map((asset) => [asset.name, {
  anchor: [asset.anchor[0], asset.anchor[1]] as [number, number],
  variants: Object.fromEntries(Object.entries(framesForAsset(asset)).map(([group, frames]) => [group, frames.map(() => ({ width: asset.size[0], height: asset.size[1] }))])),
}]));
const frames = new Map<string, Canvas>();
function nativeFrame(id: string, index: number): Canvas {
  const key = `${id}:${index}`;
  const cached = frames.get(key); if (cached) return cached;
  const asset = byId.get(id);
  if (!asset) throw new Error(`Missing native asset ${id}`);
  const grid = framesForAsset(asset).base?.[index];
  if (!grid) throw new Error(`Missing native frame ${key}`);
  const frame = createCanvas(...asset.size);
  const context = frame.getContext('2d');
  const pixels = context.createImageData(...asset.size);
  grid.forEach((row, y) => [...row].forEach((character, x) => pixels.data.set(
    resolveColor(character, palette, {}, asset.markers ?? {}, asset.sourcePalette ?? {}), (y * asset.size[0] + x) * 4,
  )));
  context.putImageData(pixels, 0, 0); frames.set(key, frame); return frame;
}

function render(input: TerrainPlanInput, title: string, scale = 3) {
  const draws = planTerrain(input);
  const minY = Math.min(0, ...draws.map((draw) => draw.y));
  const native = createCanvas(input.width * 16, input.height * 16 - minY);
  const context = native.getContext('2d');
  context.fillStyle = '#243039'; context.fillRect(0, 0, native.width, native.height);
  context.imageSmoothingEnabled = false;
  for (const draw of draws) {
    context.save();
    if (draw.clip) {
      context.beginPath(); context.rect(draw.clip.x, draw.clip.y - minY, draw.clip.w, draw.clip.h); context.clip();
    }
    context.drawImage(nativeFrame(draw.assetId, draw.frame), draw.x, draw.y - minY, draw.w, draw.h);
    context.restore();
  }
  const image = createCanvas(native.width * scale, native.height * scale + 40);
  const destination = image.getContext('2d'); destination.imageSmoothingEnabled = false;
  destination.fillStyle = '#172029'; destination.fillRect(0, 0, image.width, image.height);
  destination.fillStyle = '#edf4ed'; destination.font = '16px monospace'; destination.fillText(title, 12, 26);
  destination.drawImage(native, 0, 40, native.width * scale, native.height * scale);
  return { image, draws };
}

await mkdir(output, { recursive: true });
const fixtures = cliffFixtures();
const evidence = fixtures.map((fixture) => {
  const plan = fixturePlan(fixture, atlas);
  const { image, draws } = render(plan, fixture.title);
  return { fixture, image, draws, probe: probeFixture(fixture) };
});
for (const { fixture, image } of evidence) await writeFile(resolve(output, `${fixture.id}.png`), image.toBuffer('image/png'));
const sheet = createCanvas(3 * evidence[0]!.image.width, 3 * evidence[0]!.image.height);
const sheetContext = sheet.getContext('2d');
sheetContext.fillStyle = '#172029'; sheetContext.fillRect(0, 0, sheet.width, sheet.height);
for (const [index, { image }] of evidence.entries()) sheetContext.drawImage(image, index % 3 * image.width, Math.floor(index / 3) * image.height);
await writeFile(resolve(output, 'current-engine-banks.png'), sheet.toBuffer('image/png'));
const volcano = render(sixLevelVolcano(atlas), 'Current engine: six volcanic terraces (terrain only)', 1);
await writeFile(resolve(output, 'six-level-volcano.png'), volcano.image.toBuffer('image/png'));
const result = {
  renderer: 'actual GroundChunkCache + enqueueRaisedTerrainDepth + sortWorldDepthItems; native source pixels',
  fixtures: evidence.map(({ probe, draws }) => ({ ...probe, drawCount: draws.length,
    bankDrawCount: draws.filter((draw) => draw.assetId.includes('ramp_bank')).length })),
  lateralBankEntryAllowed: walkFixture(fixtures[1]!, [5, 8], [6, 8]),
  sixLevelVolcano: { drawCount: volcano.draws.length, maxElevation: 6, playableRouteProven: false },
  limitations: ['synthetic local fixtures, not a full island reconstruction', 'no natural slope/taper implementation', 'no live server or world publication'],
};
await writeFile(resolve(output, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, ...result }, null, 2));
