import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from './assets/load.js';
import { importPremiumIcon } from './assets/premium-icon-import.js';
import { renderReview } from './render-review.js';

type Entry = { item: string; asset: string; source: string; crop: [number, number, number, number]; sha256: string; group: string; reviewStatus: string };
const manifest = JSON.parse(await readFile(new URL('docs/food-alchemy-p0/icon-imports.json', workspaceRoot), 'utf8')) as { imports: Entry[] };
const reviewed = process.argv.includes('--reviewed');
const sources = new Set<string>();
// Validate the complete intake before writing any assets.
for (const entry of manifest.imports) {
  const source = new URL(entry.source, workspaceRoot);
  if (!source.href.startsWith(new URL('references/art/', workspaceRoot).href)) throw new Error(`Not a licensed reference: ${entry.asset}`);
  if (!/^icon_(food|alchemy|animal)_[a-z0-9_]+$/.test(entry.asset)) throw new Error(`Invalid asset name: ${entry.asset}`);
  if (entry.crop[2] !== 16 || entry.crop[3] !== 16 || entry.crop.some(n => !Number.isInteger(n) || n < 0)) throw new Error(`Invalid crop: ${entry.asset}`);
  if (!sources.has(entry.source)) {
    const hash = createHash('sha256').update(await readFile(source)).digest('hex');
    if (hash !== entry.sha256) throw new Error(`Source changed: ${entry.source}`);
    sources.add(entry.source);
  }
}
for (const entry of manifest.imports) {
  if (entry.reviewStatus !== 'native_import_reviewed') continue;
  const [x, y] = entry.crop;
  if (entry.source.includes('/kenmi/cute-fantasy/')) {
    execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('packages/tools/src/import-image.ts', workspaceRoot)),
      entry.source, '--size', '16x16', '--crop', `${x},${y}`, '--name', entry.asset, '--category', 'ui'],
    { cwd: fileURLToPath(workspaceRoot), stdio: 'pipe' });
  } else {
    // Existing native cell importer also supports owner-licensed Raven art. Never use
    // import-image's palette-snapped fallback for these four approved herb cells.
    await importPremiumIcon(entry.asset, entry.source, x / 16, y / 16, ['item.ingredient']);
  }
  const output = new URL(`packages/assets/ui/${entry.asset}.sprite.json`, workspaceRoot);
  const asset = JSON.parse(await readFile(output, 'utf8')) as Record<string, unknown>;
  Object.assign(asset, {
    approved: reviewed && entry.reviewStatus === 'native_import_reviewed',
    sourceRegion: entry.crop,
    frameKinds: { base: 'state' },
    tags: ['ui.icon', `item.${entry.group}`, 'feature.food_alchemy', entry.source.includes('/kenmi/') ? 'source.kenmi' : 'source.clockwork_raven'],
    placement: { layer: 'ui', builderAvailable: false },
  });
  await writeFile(output, `${JSON.stringify(asset, null, 2)}\n`);
  await renderReview(entry.asset);
}
console.log(`Imported and rendered ${manifest.imports.filter(e => e.reviewStatus === 'native_import_reviewed').length} exact native icons; approved=${reviewed}; held mappings skipped`);
