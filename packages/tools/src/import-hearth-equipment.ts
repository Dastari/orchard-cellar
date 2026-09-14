/** Reproducible native Raven crops and the initial fixed Doc 60 equipment pack.
 * Content JSON remains the runtime source of truth; no item-name mechanics.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseItemDefinition, type ItemContentDefinition, type Modifier } from '@orchard/sim';
import { loadPalette } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

const root = resolve(import.meta.dirname, '../../..');
const raven = 'references/art/clockwork-raven/';
const sources = {
  armor: `${raven}collections/premium/sheets/raven-fantasy-icons-16.png`,
  weapon: `${raven}equipment/weapons-800/sheet-16.png`,
  shield: `${raven}equipment/shields-fantasy-160/sheet-16-no-outline.png`,
  neck: `${raven}equipment/accessories-400/sheet-16.png`,
};
const qualities = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const families = ['Shorehand', 'Hearthforged', 'Ashguard', 'Caldera', "Warden's"] as const;
const armorRows = [416, 418, 422, 420, 424];
const weaponRows = [0, 8, 40, 24, 12];
const shieldCells = [[0, 0], [2, 0], [3, 3], [8, 2], [6, 3]] as const;
const armorSlots = [
  ['head', 'Helm', 3, 20], ['body', 'Cuirass', 1, 40],
  ['hands', 'Gauntlets', 10, 15], ['legs', 'Greaves', 8, 25], ['feet', 'Boots', 7, 20],
] as const;
const necks = [
  ['harvest_pendant', "Grower's Pendant", 'farmcraft', 11, 10],
  ['prospector_pendant', "Prospector's Pendant", 'mining_endurance', 3, 10],
  ['angler_pendant', "Angler's Pendant", 'fishing_endurance', 7, 11],
  ['forester_pendant', "Forester's Pendant", 'woodcutting_endurance', 5, 10],
  ['wayfarer_pendant', "Wayfarer's Pendant", 'measured_stride', 7, 12],
] as const;
interface Crop { readonly id: string; readonly source: string; readonly column: number; readonly row: number }
const crops: Crop[] = [];
const items: ItemContentDefinition[] = [];
function modifier(id: string, target: Modifier['target'], value: number, layer: Modifier['layer'] = 'pctAdd'): Modifier {
  return { id, target, value, layer, source: 'equipment' };
}
function add(item: ItemContentDefinition, source: string, column: number, row: number) {
  items.push(parseItemDefinition(item));
  crops.push({ id: item.id.slice(5), source, column, row });
}
for (const [tier, quality] of qualities.entries()) {
  const family = families[tier]!;
  for (const weapon of ['sword', 'bow'] as const) {
    const id = `hearth_${quality}_${weapon}`;
    const melee = weapon === 'sword';
    add({
      id: `item:${id}`, kind: 'item', schemaVersion: 1,
      displayName: `${family} ${melee ? 'Blade' : 'Bow'}`,
      icon: { asset: `icon_gear_${id}` }, quality, maxStack: 1,
      tags: ['content.hearth', 'item.weapon', `item.${melee ? 'melee' : 'ranged'}_weapon`, 'gear.hand'],
      economy: { buy: tier === 0 ? (melee ? 750 : 700) : null, sell: [150, 200, 300, 400, 500][tier]! },
      combat: { attackKind: melee ? 'melee' : 'ranged', baseDamageCenti: (melee ? [1800,1850,1950,2150,2300] : [1400,1450,1550,1700,1800])[tier]! },
      durability: { max: melee ? 250 : 300, repairMaterial: melee ? 'item:stone' : 'item:wood', repairCost: 5 },
      vigour: { costCenti: melee ? 3600 : 3000, minimumSwingTicks: melee ? 7 : 6 },
      tool: { tier: 0, reachTiles: 1, swingTicks: melee ? 7 : 6 },
      ...(melee ? {} : { ranged: { ammunition: 'item:arrow', projectile: 'arrow' } }),
      equip: { slot: 'hand', avatarAction: melee ? 'swing_sword' : 'ranged_weapon',
        ...(tier >= 2 ? { skillNode: melee ? 'blade_training' : 'archery_basics' } : {}) },
      modifiers: tier === 0 ? [] : [modifier(`${id}.power`, melee ? 'attackPower' : 'rangedPower', [0,200,400,600,1000][tier]!)],
      onUse: [],
    }, sources.weapon, melee ? 7 : 12, weaponRows[tier]! + (melee ? 0 : 2));
  }
  for (const [slot, label, column, armor] of armorSlots) {
    const id = `hearth_${quality}_${slot}`;
    const skillNode = slot === 'body' ? 'battle_conditioning' : slot === 'hands' ? 'blade_training'
      : slot === 'head' ? 'archery_basics' : 'measured_stride';
    add({
      id: `item:${id}`, kind: 'item', schemaVersion: 1, displayName: `${family} ${label}`,
      icon: { asset: `icon_gear_${id}` }, quality, maxStack: 1,
      tags: ['content.hearth', 'item.armor', `gear.${slot}`],
      economy: { buy: tier === 0 ? armor * 12 : null, sell: Math.floor(armor * (tier + 2) * 2) },
      equip: { slot, ...(tier >= 2 ? { skillNode } : {}) },
      modifiers: [modifier(`${id}.armor`, 'armor', armor + tier * 3, 'flat'),
        ...(tier === 0 ? [] : [modifier(`${id}.reserve`, slot === 'body' ? 'maxHealth' : 'maxVigour', [0,200,300,400,600][tier]!)])],
      onUse: [],
    }, sources.armor, column, armorRows[tier]!);
  }
  const id = `hearth_${quality}_shield`;
  add({
    id: `item:${id}`, kind: 'item', schemaVersion: 1, displayName: `${family} Shield`,
    icon: { asset: `icon_gear_${id}` }, quality, maxStack: 1,
    tags: ['content.hearth', 'item.shield', 'gear.off_hand'],
    economy: { buy: tier === 0 ? 350 : null, sell: 70 + tier * 20 },
    equip: { slot: 'off_hand', ...(tier >= 2 ? { skillNode: 'battle_conditioning' } : {}) },
    modifiers: [modifier(`${id}.armor`, 'armor', 20 + tier * 2, 'flat'),
      ...(tier === 0 ? [] : [modifier(`${id}.reserve`, 'maxVigour', 100 + tier * 100)])], onUse: [],
  }, sources.shield, shieldCells[tier]![0], shieldCells[tier]![1]);
}
for (const [suffix, displayName, skillNode, column, row] of necks) {
  const id = `hearth_${suffix}`;
  add({ id: `item:${id}`, kind: 'item', schemaVersion: 1, displayName,
    icon: { asset: `icon_gear_${id}` }, quality: 'rare', maxStack: 1,
    tags: ['content.hearth', 'gear.neck'], economy: { buy: null, sell: 150 },
    equip: { slot: 'neck', skillNode },
    modifiers: [modifier(`${id}.reserve`, 'maxVigour', 500)], onUse: [],
  }, sources.neck, column, row);
}
if (items.length !== 45 || new Set(items.map(item => item.id)).size !== 45) throw new Error('Expected 45 distinct gear definitions');
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
  const name = `icon_gear_${crop.id}`;
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
  const existing = JSON.parse(await readFile(file,'utf8')) as ItemContentDefinition[];
  const ids = new Set<string>(items.map(item => item.id));
  const merged = existing.filter(item => !ids.has(item.id)).map(item => {
    if (item.id === 'item:sword') return {...item, combat: {attackKind: 'melee', baseDamageCenti: 1800}};
    if (item.id === 'item:bow') return {...item, combat: {attackKind: 'ranged', baseDamageCenti: 1400}};
    return item;
  }).concat(items).sort((a,b) => a.id.localeCompare(b.id));
  await writeFile(file, `${JSON.stringify(merged,null,2)}\n`);
  await mkdir(resolve(root, 'output/doc60'), { recursive: true });
  await writeFile(resolve(root, 'output/doc60/equipment-crops.json'), `${JSON.stringify(crops,null,2)}\n`);
  // The item callback remains the sole capability owner. Reuse reviewed sword/bow
  // callbacks, including repair, under each new definition's stable identity.
  const lifecycleFile = resolve(root, 'packages/lifecycle-authoring/source/bootstrap-item-on-use.source.json');
  const lifecycle = JSON.parse(await readFile(lifecycleFile, 'utf8')) as {
    revision: number; handlers: { itemId: string; id: string; [key: string]: unknown }[];
  };
  const before = JSON.stringify(lifecycle.handlers);
  const retained = lifecycle.handlers.filter(handler => !ids.has(handler.itemId));
  for (const item of items.filter(item => item.combat !== undefined)) {
    const originalId = item.combat!.attackKind === 'melee' ? 'item:sword' : 'item:bow';
    const original = retained.find(handler => handler.itemId === originalId);
    if (original === undefined) throw new Error(`Missing reviewed weapon lifecycle ${originalId}`);
    retained.push({...original, itemId: item.id, id: `${item.id}.on_use`});
  }
  lifecycle.handlers = retained.sort((a,b) => a.itemId.localeCompare(b.itemId) || a.id.localeCompare(b.id));
  if (before !== JSON.stringify(lifecycle.handlers)) lifecycle.revision++;
  await writeFile(lifecycleFile, `${JSON.stringify(lifecycle,null,2)}\n`);
  console.log(`Authored ${items.length} fixed equipment definitions and native Raven icons. Not published.`);

}
