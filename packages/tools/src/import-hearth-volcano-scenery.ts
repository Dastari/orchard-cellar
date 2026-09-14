/** Exact native Cinderwake scenery candidates. No map placement or publication. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from './assets/png.js';
const root = resolve(import.meta.dirname, '../../..');
const base = 'references/art/kenmi/cute-fantasy/volcano/';
const crops = [
  { name: 'prop_cf_cinder_blossom_small', sheet: 'Volcano_Props/Volcano_Plants.png', rect: [0,0,32,48], category: 'props', footprint: [1,1], solid: true },
  { name: 'prop_cf_cinder_blossom_large', sheet: 'Volcano_Props/Volcano_Plants.png', rect: [32,0,48,48], category: 'props', footprint: [1,1], solid: true },
  { name: 'prop_cf_cinder_violet_plant', sheet: 'Volcano_Props/Volcano_Plants.png', rect: [32,80,16,16], category: 'props', footprint: [1,1], solid: false },
  { name: 'prop_cf_cinder_column_cluster', sheet: 'Volcano_Props/Volcano_Rocks.png', rect: [16,80,32,32], category: 'props', footprint: [2,1], solid: true },
  { name: 'prop_cf_cinder_broad_pillar', sheet: 'Volcano_Props/Volcano_Rocks.png', rect: [64,112,32,32], category: 'props', footprint: [2,1], solid: true },
  { name: 'building_cf_cinder_tower', sheet: 'Buildings/Volcano_Tower.png', rect: [0,0,96,144], category: 'buildings', footprint: [6,2], solid: true },
] as const;
for (const crop of crops) {
  const [x,y,width,height] = crop.rect, sourcePath = base + crop.sheet;
  const file = resolve(root, `packages/assets/${crop.category}/${crop.name}.sprite.json`);
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> : null;
  const source = decodePng(readFileSync(resolve(root, sourcePath)));
  let contactY = -1; const contacts: number[] = [];
  const shadows = new Set<string>();
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    const at = ((y + dy) * source.width + x + dx) * 4, alpha = source.rgba[at + 3]!;
    if (alpha === 255) { if (dy > contactY) { contactY = dy; contacts.length = 0; } contacts.push(dx); }
    else if (alpha > 0) shadows.add('#' + [...source.rgba.slice(at, at + 4)].map(v => v.toString(16).padStart(2,'0')).join(''));
  }
  if (contactY < 0 || shadows.size > 1) throw new Error(`Unreviewed contact/shadow convention: ${crop.name}`);
  const anchor = [Math.round(contacts.reduce((sum, value) => sum + value, 0) / contacts.length), contactY];
  execFileSync(resolve(root, 'node_modules/.bin/tsx'), ['packages/tools/src/import-image.ts', sourcePath,
    '--size', `${width}x${height}`, '--source-size', `${width}x${height}`, '--crop', `${x},${y}`,
    '--category', crop.category, '--name', crop.name], { cwd: root, stdio: 'inherit' });
  const asset = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  asset['anchor'] = anchor; asset['sourceRegions'] = { base: [crop.rect] };
  asset['frameKinds'] = { base: 'state' };
  if (shadows.size === 1) asset['bakedShadowColor'] = [...shadows][0];
  asset['tags'] = ['content.hearth', 'scenery.cinderwake', 'source.cute_fantasy'];
  asset['placement'] = { layer: 'object', footprint: crop.footprint, blocksMovement: crop.solid, builderAvailable: false };
  asset['approved'] = false;
  if (previous?.['approved'] === true && JSON.stringify({ ...previous, approved: false }) === JSON.stringify(asset)) asset['approved'] = true;
  writeFileSync(file, JSON.stringify(asset, null, 2) + '\n');
  console.log(`${crop.name}: contact ${anchor.join(',')}; shadow ${[...shadows].join(',') || 'none'}`);
}
