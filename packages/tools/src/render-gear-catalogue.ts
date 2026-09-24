/**
 * Gear catalogue samples: item cards (WoW-style tooltip + paper doll), rarity
 * ladders, legendary showcase outfits, and the generated catalogue listing.
 *
 *   npm run render:gear-catalogue -w @orchard/tools
 *
 * Reads licensed sheets under references/ and writes PNGs plus catalogue.md to
 * output/gear-rig/ (git-ignored). No runtime assets are produced.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from './assets/load.js';
import { catalogueMarkdown } from './gear-rig/catalogue-md.js';
import { rarity, type RarityId } from './gear-rig/catalogue.js';
import { Doll, VIEWS, type FrameRef, type Loadout } from './gear-rig/doll.js';
import { IconLibrary } from './gear-rig/icons.js';
import { buildItem, type Item, type ItemSpec } from './gear-rig/items.js';
import { Raster } from './gear-rig/raster.js';
import { drawText, loadFont, loadSprite } from './gear-rig/sprites.js';
import { renderTooltip, type TooltipAssets } from './gear-rig/tooltip.js';

const root = fileURLToPath(workspaceRoot);
const outDir = resolve(root, 'output/gear-rig');
await mkdir(outDir, { recursive: true });

const [doll, library, font, gold, silver, bronze] = await Promise.all([
  Doll.load(resolve(root, 'references/art/kenmi/cute-fantasy/core/Player')),
  IconLibrary.load(resolve(root, 'references/art/kenmi/cute-fantasy/icons')),
  loadFont('fonts/font_5x7.sprite.json'),
  loadSprite('ui/ui_cf_coin_gold.sprite.json'),
  loadSprite('ui/ui_cf_coin_silver.sprite.json'),
  loadSprite('ui/ui_cf_coin_bronze.sprite.json'),
]);
const tooltipAssets: TooltipAssets = { font, coinGold: gold.image, coinSilver: silver.image, coinBronze: bronze.image };
const build = (spec: ItemSpec): Item => buildItem(spec, library);

const GRASS = '#5f8a4c';
const BACKDROP = '#2b3140';
const DOLL_CROP = { x: 14, y: 8, width: 36, height: 38 } as const;

async function dollStrip(loadout: Loadout, views: readonly FrameRef[] = [VIEWS.idle_down, VIEWS.idle_right, VIEWS.idle_up]): Promise<Raster> {
  const strip = new Raster(views.length * DOLL_CROP.width, DOLL_CROP.height).fill(GRASS);
  for (const [index, view] of views.entries()) {
    const cell = await doll.compose(loadout, view);
    strip.draw(cell.crop(DOLL_CROP.x, DOLL_CROP.y, DOLL_CROP.width, DOLL_CROP.height), index * DOLL_CROP.width, 0);
  }
  return strip;
}

// ---------------------------------------------------------------------------
// 1. Item cards

const EXAMPLES: readonly ItemSpec[] = [
  { base: 'arming_sword', material: 'iron', rarity: 'poor' },
  { base: 'arming_sword', material: 'bronze', rarity: 'common' },
  { base: 'dungarees', material: 'homespun', rarity: 'common' },
  { base: 'sallet', material: 'iron', rarity: 'common' },
  { base: 'longsword', material: 'steel', rarity: 'uncommon', suffix: 'fortitude' },
  { base: 'flannel', material: 'wool', rarity: 'uncommon', prefix: 'stalwart' },
  { base: 'roundshield', material: 'iron', rarity: 'uncommon', prefix: 'warded' },
  { base: 'breeches', material: 'dyed', rarity: 'uncommon', suffix: 'wanderer' },
  { base: 'bulwark', material: 'blackiron', rarity: 'rare', prefix: 'radiant', suffix: 'ages' },
  { base: 'greathelm', material: 'steel', rarity: 'rare', prefix: 'stalwart', suffix: 'veteran' },
  { base: 'staff', material: 'aquamarine', rarity: 'rare', prefix: 'serene', suffix: 'arcana' },
  { base: 'pickaxe', material: 'steel', rarity: 'rare', prefix: 'tireless', suffix: 'deep' },
  { base: 'shortbow', material: 'yew', rarity: 'rare', prefix: 'deadeye', suffix: 'hunt' },
  { base: 'vestments', material: 'silk', rarity: 'rare', prefix: 'radiant', suffix: 'ages' },
  { base: 'greathelm', material: 'steel', rarity: 'epic', lineage: 'dawnsworn' },
  { base: 'warhelm', material: 'blackiron', rarity: 'epic', lineage: 'duskwarden' },
  { base: 'cuirass', material: 'frostforged', rarity: 'epic', lineage: 'stormforged' },
  { base: 'heater', material: 'gilded', rarity: 'epic', lineage: 'kingsguard' },
  { base: 'rod', material: 'amethyst', rarity: 'epic', lineage: 'starweaver' },
  { base: 'halberd', material: 'verdant', rarity: 'epic', lineage: 'wildroot' },
  { base: '', material: '', rarity: 'legendary', legendary: 'bonecrippler' },
  { base: '', material: '', rarity: 'legendary', legendary: 'emberwake' },
  { base: '', material: '', rarity: 'legendary', legendary: 'frostwhisper' },
  { base: '', material: '', rarity: 'legendary', legendary: 'rootsinger' },
  { base: '', material: '', rarity: 'legendary', legendary: 'hollowmoon' },
  { base: '', material: '', rarity: 'legendary', legendary: 'orchardkeeper' },
  { base: '', material: '', rarity: 'legendary', legendary: 'kingsbulwark' },
  { base: '', material: '', rarity: 'legendary', legendary: 'starfall' },
  { base: '', material: '', rarity: 'legendary', legendary: 'harvest_crown' },
  { base: '', material: '', rarity: 'legendary', legendary: 'dawnbreaker' },
  { base: '', material: '', rarity: 'legendary', legendary: 'wyrmscale' },
  { base: '', material: '', rarity: 'legendary', legendary: 'cellarmaster' },
];

async function card(item: Item): Promise<Raster> {
  const tooltip = renderTooltip(item, tooltipAssets);
  const hasDoll = Object.keys(item.doll).length > 0;
  const strip = hasDoll ? await dollStrip(item.doll) : null;
  const width = tooltip.width + (strip ? strip.width + 6 : 0);
  const height = Math.max(tooltip.height, strip?.height ?? 0);
  const out = new Raster(width, height);
  out.draw(tooltip, 0, 0);
  if (strip) out.draw(strip, tooltip.width + 6, 0);
  return out;
}

async function cardSheet(items: readonly Item[], file: string, columns = 2): Promise<void> {
  const cards = await Promise.all(items.map(card));
  const cellWidth = Math.max(...cards.map((entry) => entry.width)) + 10;
  const rowHeights: number[] = [];
  for (let index = 0; index < cards.length; index += columns) {
    rowHeights.push(Math.max(...cards.slice(index, index + columns).map((entry) => entry.height)) + 10);
  }
  const sheet = new Raster(columns * cellWidth + 10, rowHeights.reduce((sum, value) => sum + value, 0) + 10).fill(BACKDROP);
  let y = 10;
  rowHeights.forEach((rowHeight, rowIndex) => {
    cards.slice(rowIndex * columns, rowIndex * columns + columns).forEach((entry, column) => {
      sheet.draw(entry, 10 + column * cellWidth, y);
    });
    y += rowHeight;
  });
  await sheet.scaled(3).save(resolve(outDir, file));
}

const items = EXAMPLES.map(build);
const byRarity = (ids: RarityId[]): Item[] => items.filter((item) => ids.includes(item.rarity));
await cardSheet(byRarity(['poor', 'common', 'uncommon']), 'cards-common-uncommon.png');
await cardSheet(byRarity(['rare']), 'cards-rare.png');
await cardSheet(byRarity(['epic']), 'cards-epic.png');
await cardSheet(byRarity(['legendary']), 'cards-legendary.png');

// ---------------------------------------------------------------------------
// 2. Rarity ladders: one family from poor to legendary

const LADDERS: { label: string; specs: ItemSpec[] }[] = [
  {
    label: 'Swords',
    specs: [
      { base: 'arming_sword', material: 'iron', rarity: 'poor' },
      { base: 'arming_sword', material: 'bronze', rarity: 'common' },
      { base: 'arming_sword', material: 'steel', rarity: 'uncommon', suffix: 'fortitude' },
      { base: 'longsword', material: 'blackiron', rarity: 'rare', prefix: 'keen', suffix: 'blade' },
      { base: 'longsword', material: 'bloodsteel', rarity: 'epic', lineage: 'duskwarden' },
      { base: '', material: '', rarity: 'legendary', legendary: 'emberwake' },
    ],
  },
  {
    label: 'Helms',
    specs: [
      { base: 'sallet', material: 'iron', rarity: 'poor' },
      { base: 'sallet', material: 'iron', rarity: 'common' },
      { base: 'greathelm', material: 'steel', rarity: 'uncommon', prefix: 'stalwart' },
      { base: 'greathelm', material: 'blackiron', rarity: 'rare', prefix: 'mighty', suffix: 'veteran' },
      { base: 'greathelm', material: 'steel', rarity: 'epic', lineage: 'dawnsworn' },
      { base: '', material: '', rarity: 'legendary', legendary: 'dawnbreaker' },
    ],
  },
  {
    label: 'Shields',
    specs: [
      { base: 'buckler', material: 'bronze', rarity: 'poor' },
      { base: 'roundshield', material: 'bronze', rarity: 'common' },
      { base: 'kite_shield', material: 'iron', rarity: 'uncommon', prefix: 'warded' },
      { base: 'bulwark', material: 'blackiron', rarity: 'rare', prefix: 'radiant', suffix: 'ages' },
      { base: 'heater', material: 'gilded', rarity: 'epic', lineage: 'kingsguard' },
      { base: '', material: '', rarity: 'legendary', legendary: 'orchardkeeper' },
    ],
  },
  {
    label: 'Staffs',
    specs: [
      { base: 'staff', material: 'quartz', rarity: 'poor' },
      { base: 'staff', material: 'quartz', rarity: 'common' },
      { base: 'rod', material: 'amber', rarity: 'uncommon', suffix: 'ages' },
      { base: 'staff', material: 'aquamarine', rarity: 'rare', prefix: 'serene', suffix: 'arcana' },
      { base: 'sceptre', material: 'ruby', rarity: 'epic', lineage: 'starweaver' },
      { base: '', material: '', rarity: 'legendary', legendary: 'hollowmoon' },
    ],
  },
  {
    label: 'Chest',
    specs: [
      { base: 'shirt', material: 'linen', rarity: 'poor' },
      { base: 'tunic', material: 'homespun', rarity: 'common' },
      { base: 'jerkin', material: 'tanned', rarity: 'uncommon', suffix: 'wanderer' },
      { base: 'breastplate', material: 'steel', rarity: 'rare', prefix: 'stalwart', suffix: 'bulwark' },
      { base: 'cuirass', material: 'frostforged', rarity: 'epic', lineage: 'stormforged' },
      { base: '', material: '', rarity: 'legendary', legendary: 'wyrmscale' },
    ],
  },
];

{
  const cellWidth = 76;
  const rowHeight = 72;
  const labelWidth = 34;
  const sheet = new Raster(labelWidth + 6 * cellWidth, 12 + LADDERS.length * rowHeight).fill(BACKDROP);
  const names: RarityId[] = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
  names.forEach((id, index) => drawText(sheet, font, rarity(id).name, labelWidth + index * cellWidth + 4, 3, rarity(id).color));
  for (const [rowIndex, ladder] of LADDERS.entries()) {
    const y = 12 + rowIndex * rowHeight;
    drawText(sheet, font, ladder.label, 3, y + 20, '#f4f1e8');
    for (const [column, spec] of ladder.specs.entries()) {
      const item = build(spec);
      const x = labelWidth + column * cellWidth;
      const box = new Raster(cellWidth - 4, rowHeight - 24).fill(GRASS);
      const view = await doll.compose(item.doll, VIEWS.idle_down);
      box.draw(view.crop(16, 12, 36, 34), 30, 7);
      box.draw(item.icon, 2, 4);
      sheet.draw(box, x, y);
      // Two lines of name under each cell; longer names are shortened with an ellipsis.
      const words = item.name.split(' ');
      const lines: string[] = [''];
      for (const word of words) {
        const candidate = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
        if (candidate.length > 12 && lines.at(-1)) lines.push(word);
        else lines[lines.length - 1] = candidate;
      }
      const shown = lines.slice(0, 2).map((line, index) => (index === 1 && lines.length > 2) || line.length > 12 ? `${line.slice(0, 11)}.` : line);
      shown.forEach((line, index) => drawText(sheet, font, line, x + 1, y + rowHeight - 22 + index * 9, rarity(item.rarity).color));
    }
  }
  await sheet.scaled(4).save(resolve(outDir, 'rarity-ladders.png'));
}

// ---------------------------------------------------------------------------
// 3. Showcase outfits built entirely from catalogue items

const merge = (...parts: ItemSpec[]): Loadout => Object.assign({}, ...parts.map((spec) => build(spec).doll));
const SHOWCASE: { label: string; loadout: Loadout }[] = [
  {
    label: 'Dawnsworn paladin',
    loadout: merge(
      { base: '', material: '', rarity: 'legendary', legendary: 'dawnbreaker' },
      { base: 'cuirass', material: 'steel', rarity: 'epic', lineage: 'dawnsworn' },
      { base: 'greaves', material: 'steel', rarity: 'epic', lineage: 'dawnsworn' },
      { base: 'gauntlets', material: 'gilded', rarity: 'rare', prefix: 'mighty', suffix: 'fortitude' },
      { base: '', material: '', rarity: 'legendary', legendary: 'emberwake' },
      { base: '', material: '', rarity: 'legendary', legendary: 'kingsbulwark' },
    ),
  },
  {
    label: 'Duskwarden',
    loadout: merge(
      { base: 'warhelm', material: 'blackiron', rarity: 'epic', lineage: 'duskwarden' },
      { base: 'cuirass', material: 'blackiron', rarity: 'epic', lineage: 'duskwarden' },
      { base: 'tassets', material: 'blackiron', rarity: 'epic', lineage: 'duskwarden' },
      { base: '', material: '', rarity: 'legendary', legendary: 'bonecrippler' },
    ),
  },
  {
    label: 'Stormforged knight',
    loadout: merge(
      { base: 'winged_helm', material: 'frostforged', rarity: 'epic', lineage: 'stormforged' },
      { base: 'cuirass', material: 'frostforged', rarity: 'epic', lineage: 'stormforged' },
      { base: 'greaves', material: 'frostforged', rarity: 'epic', lineage: 'stormforged' },
      { base: 'gauntlets', material: 'steel', rarity: 'rare', prefix: 'nimble', suffix: 'swiftness' },
      { base: '', material: '', rarity: 'legendary', legendary: 'frostwhisper' },
      { base: 'heater', material: 'frostforged', rarity: 'epic', lineage: 'stormforged' },
    ),
  },
  {
    label: 'Wildroot warden',
    loadout: merge(
      { base: 'greathelm', material: 'verdant', rarity: 'epic', lineage: 'wildroot' },
      { base: 'breastplate', material: 'verdant', rarity: 'epic', lineage: 'wildroot' },
      { base: 'dungarees', material: 'wool', rarity: 'rare', prefix: 'serene', suffix: 'orchard' },
      { base: '', material: '', rarity: 'legendary', legendary: 'rootsinger' },
    ),
  },
  {
    label: 'Starweaver magus',
    loadout: merge(
      { base: 'vestments', material: 'silk', rarity: 'epic', lineage: 'starweaver' },
      { base: 'breeches', material: 'moonweave', rarity: 'rare', prefix: 'radiant', suffix: 'arcana' },
      { base: '', material: '', rarity: 'legendary', legendary: 'hollowmoon' },
    ),
  },
  {
    label: 'The Harvest King',
    loadout: merge(
      { base: '', material: '', rarity: 'legendary', legendary: 'harvest_crown' },
      { base: 'vestments', material: 'velvet', rarity: 'epic', lineage: 'kingsguard' },
      { base: 'breeches', material: 'velvet', rarity: 'rare', prefix: 'gallant', suffix: 'orchard' },
      { base: '', material: '', rarity: 'legendary', legendary: 'cellarmaster' },
    ),
  },
  {
    label: 'Starfall ranger',
    loadout: merge(
      { base: 'jerkin', material: 'drakehide', rarity: 'epic', lineage: 'stormforged' },
      { base: 'leggings', material: 'hardened', rarity: 'rare', prefix: 'nimble', suffix: 'stride' },
      { base: 'gloves', material: 'tanned', rarity: 'uncommon', prefix: 'nimble' },
      { base: '', material: '', rarity: 'legendary', legendary: 'starfall' },
    ),
  },
];

{
  const views = [VIEWS.idle_down, VIEWS.walk_down, VIEWS.idle_right, VIEWS.idle_left, VIEWS.idle_up];
  const labelHeight = 10;
  const sheet = new Raster(10 + views.length * DOLL_CROP.width + 10, SHOWCASE.length * (DOLL_CROP.height + labelHeight + 4) + 6).fill(BACKDROP);
  for (const [index, entry] of SHOWCASE.entries()) {
    const y = 4 + index * (DOLL_CROP.height + labelHeight + 4);
    drawText(sheet, font, entry.label, 10, y, rarity('legendary').color);
    sheet.draw(await dollStrip(entry.loadout, views), 10, y + labelHeight);
  }
  await sheet.scaled(4).save(resolve(outDir, 'showcase-outfits.png'));
  const lineup = new Raster(SHOWCASE.length * 30 + 4, 38).fill(GRASS);
  for (const [index, entry] of SHOWCASE.entries()) {
    lineup.draw((await doll.compose(entry.loadout, VIEWS.idle_down)).crop(17, 8, 30, 36), 2 + index * 30, 1);
  }
  await lineup.scaled(3).save(resolve(outDir, 'showcase-ingame-3x.png'));
}

// ---------------------------------------------------------------------------
// 4. Catalogue listing

await writeFile(resolve(outDir, 'catalogue.md'), catalogueMarkdown(library, items));
console.log(`Wrote gear catalogue samples to ${outDir}`);
