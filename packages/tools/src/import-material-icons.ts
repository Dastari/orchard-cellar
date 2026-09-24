/** Import the reviewed crafting-material icons listed in
 * material-icon-imports.json from the licensed Kenmi and Clockwork Raven icon sheets.
 *   npx tsx packages/tools/src/import-material-icons.ts
 * Sources must stay byte-identical (sha256) and crops are exact 16x16 cells. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from './assets/load.js';
import { renderReview } from './render-review.js';

type Entry = { item: string; asset: string; source: string; crop: [number, number, number, number]; sha256: string };
const manifest = JSON.parse(await readFile(new URL('packages/tools/src/material-icon-imports.json', workspaceRoot), 'utf8')) as { imports: Entry[] };
const hashes = new Map<string, string>();
for (const entry of manifest.imports) {
  if (!/^references\/art\/(kenmi\/cute-fantasy\/icons|clockwork-raven\/icon-packs)\//.test(entry.source)) throw new Error(`Not a licensed icon sheet: ${entry.asset}`);
  if (!/^icon_craft_[a-z0-9_]+$/.test(entry.asset)) throw new Error(`Invalid asset name: ${entry.asset}`);
  if (entry.crop[2] !== 16 || entry.crop[3] !== 16 || entry.crop.some((n) => !Number.isInteger(n) || n < 0 || n % 16 !== 0)) throw new Error(`Invalid crop: ${entry.asset}`);
  if (!hashes.has(entry.source)) hashes.set(entry.source, createHash('sha256').update(await readFile(new URL(entry.source, workspaceRoot))).digest('hex'));
  if (hashes.get(entry.source) !== entry.sha256) throw new Error(`Source changed: ${entry.source}`);
}
for (const entry of manifest.imports) {
  const [x, y] = entry.crop;
  execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('packages/tools/src/import-image.ts', workspaceRoot)),
    entry.source, '--size', '16x16', '--crop', `${x},${y}`, '--name', entry.asset, '--category', 'ui'],
  { cwd: fileURLToPath(workspaceRoot), stdio: 'pipe' });
  const output = new URL(`packages/assets/ui/${entry.asset}.sprite.json`, workspaceRoot);
  const asset = JSON.parse(await readFile(output, 'utf8')) as Record<string, unknown>;
  Object.assign(asset, {
    approved: true,
    sourceRegion: entry.crop,
    frameKinds: { base: 'state' },
    tags: ['ui.icon', 'item.material', entry.source.includes('/kenmi/') ? 'source.kenmi' : 'source.clockwork_raven'],
    placement: { layer: 'ui', builderAvailable: false },
  });
  await writeFile(output, `${JSON.stringify(asset, null, 2)}\n`);
  await renderReview(entry.asset);
}
console.log(`Imported ${manifest.imports.length} material icons`);
