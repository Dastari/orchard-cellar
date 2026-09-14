/** Exact native candidate world nodes. No recoloring, activation or publication. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const rockSheet = 'references/art/kenmi/cute-fantasy/volcano/Volcano_Props/Volcano_Rocks.png';
export const HEARTH_RESOURCE_CROPS = [
  { name: 'resource_cf_hearth_basalt', source: rockSheet, rect: [0,112,32,32], anchor: [16,23] },
  { name: 'resource_cf_hearth_cinder', source: rockSheet, rect: [16,16,16,32], anchor: [8,29] },
  { name: 'resource_cf_hearth_emberglass', source: rockSheet, rect: [0,16,16,32], anchor: [8,29] },
  { name: 'resource_cf_hearth_ashwood', source: 'references/art/kenmi/cute-fantasy/desert/Props/Dead_tree.png', rect: [0,0,48,64], anchor: [25,52] },
] as const;
for (const crop of HEARTH_RESOURCE_CROPS) {
  const [x,y,width,height] = crop.rect;
  const path = resolve(root, `packages/assets/props/${crop.name}.sprite.json`);
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> : null;
  execFileSync(resolve(root, 'node_modules/.bin/tsx'), ['packages/tools/src/import-image.ts', crop.source,
    '--size', `${width}x${height}`, '--source-size', `${width}x${height}`, '--crop', `${x},${y}`,
    '--category', 'props', '--name', crop.name], { cwd: root, stdio: 'inherit' });
  const asset = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  asset['anchor'] = crop.anchor;
  asset['bakedShadowColor'] = crop.name.endsWith('_cinder') || crop.name.endsWith('_emberglass') ? '#00000064' : '#00000028';
  asset['sourceRegions'] = { base: [crop.rect] };
  asset['tags'] = ['content.hearth', 'resource.gathering', 'source.cute_fantasy'];
  asset['placement'] = { layer: 'object', footprint: [1,1], blocksMovement: true, builderAvailable: false };
  asset['approved'] = false;
  if (previous?.['approved'] === true && JSON.stringify({ ...previous, approved: false }) === JSON.stringify(asset)) asset['approved'] = true;
  writeFileSync(path, JSON.stringify(asset, null, 2) + '\n');
}
console.log('Four native resource candidates imported. Native footprint and scene review still required.');
