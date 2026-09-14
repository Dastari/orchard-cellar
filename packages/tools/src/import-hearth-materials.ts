/** Native Raven material crops for the Cinderwake encounter rewards. Local authoring only. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseItemDefinition, type ItemContentDefinition } from '@orchard/sim';
import { loadPalette } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

const root = resolve(import.meta.dirname, '../../..');
const materialSheet = 'references/art/clockwork-raven/icon-packs/crafting-materials/sheet-16.png';
const jewelSheet = 'references/art/clockwork-raven/icon-packs/gems-jewels/sheet-16-without-outline.png';
const logSheet = 'references/art/clockwork-raven/collections/premium/updates/trees-and-logs/sheets/trees-and-logs-16.png';
const materials = [
  {id:'basalt', name:'Basalt', source:materialSheet, column:2, row:8, sell:8, quality:'common'},
  {id:'ashwood', name:'Ashwood', source:logSheet, column:5, row:1, sell:8, quality:'common'},
  {id:'cinder_ore', name:'Cinder Ore', source:materialSheet, column:0, row:0, sell:30, quality:'uncommon'},
  {id:'emberglass', name:'Emberglass', source:jewelSheet, column:1, row:9, sell:24, quality:'uncommon'},
  {id:'guardian_seal', name:'Guardian Seal', source:jewelSheet, column:6, row:8, sell:0, quality:'legendary'},
] as const;
const crops = materials;
const items = materials.map(material => parseItemDefinition({
  id:`item:${material.id}`, kind:'item', schemaVersion:1, displayName:material.name,
  icon:{asset:`icon_material_${material.id}`}, quality:material.quality, maxStack:99,
  tags:['content.hearth', 'item.material', ...(material.id==='guardian_seal'?['item.guardian_seal', 'trade.unsellable']:[])],
  economy:{buy:null, sell:material.sell}, onUse:[],
}));
const characters = Object.keys((await loadPalette()).colors);
const images = new Map<string, DecodedPng>();
await mkdir(resolve(root, 'packages/assets/ui'), { recursive: true });
for (const crop of crops) {
  let image = images.get(crop.source);
  if (image === undefined) { image = decodePng(await readFile(resolve(root, crop.source))); images.set(crop.source, image); }
  const x = crop.column * 16, y = crop.row * 16;
  if (x < 0 || y < 0 || x + 16 > image.width || y + 16 > image.height) throw new Error(`Invalid crop: ${crop.id}`);
  const pixels = Array.from({length: 16}, (_, dy) => Array.from({length: 16}, (_, dx) => {
    const at = ((y + dy) * image!.width + x + dx) * 4;
    const alpha = image!.rgba[at + 3]!;
    if (alpha === 0) return null;
    return `#${Array.from(image!.rgba.slice(at, at + (alpha === 255 ? 3 : 4))).map(v => v.toString(16).padStart(2,'0')).join('')}`;
  }));
  const colors = [...new Set(pixels.flat().filter((v): v is string => v !== null))].sort();
  if (colors.length === 0 || colors.length > characters.length) throw new Error(`Invalid palette: ${crop.id}`);
  const byColor = new Map(colors.map((color, index) => [color, characters[index]!]));
  const name = `icon_material_${crop.id}`;
  let asset: AssetSource = {
    name, category: 'ui', size: [16,16], anchor: [8,15],
    frames: { base: [pixels.map(row => row.map(color => color === null ? '.' : byColor.get(color)!).join(''))] },
    frameKinds: { base: 'state' }, sourcePaletteMode: 'exact',
    sourcePalette: Object.fromEntries(colors.map(color => [byColor.get(color)!, color])),
    sourcePath: crop.source, importedFrom: basename(crop.source), sourceRegion: [x,y,16,16],
    approved: false, tags: ['ui.icon', 'content.hearth', 'source.clockwork_raven'],
    placement: { layer: 'ui', builderAvailable: false },
  };
  const assetPath = resolve(root, `packages/assets/ui/${name}.sprite.json`);
  try {
    const previous = JSON.parse(await readFile(assetPath, 'utf8')) as AssetSource;
    if (previous.approved && JSON.stringify({ ...previous, approved: false }) === JSON.stringify(asset)) asset = { ...asset, approved: true };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await writeFile(assetPath, `${JSON.stringify(asset,null,2)}\n`);
}
if (process.argv.includes('--assets-only')) {
  console.log('Native icon sources imported; content and lifecycle definitions left intact.');
} else {
  const file = resolve(root, 'packages/assets/content/items.json');
  const existing = JSON.parse(await readFile(file, 'utf8')) as ItemContentDefinition[];
  const ids = new Set(items.map(item => item.id));
  const merged = existing.filter(item => !ids.has(item.id)).concat(items).sort((a,b) => a.id.localeCompare(b.id));
  await writeFile(file, `${JSON.stringify(merged,null,2)}\n`);
  console.log(`Authored ${items.length} volcanic materials and native Raven icons. Not published.`);

}
