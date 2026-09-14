import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

type SkillIconCrop = {
  readonly nodeId: string;
  readonly source: string;
  readonly column: number;
  readonly row: number;
} | {
  readonly nodeId: string;
  readonly asset: string;
  readonly animation?: string;
};

const sources = {
  warrior: 'references/art/clockwork-raven/collections/premium/updates/skills/warrior/sheets/warrior-skills-16.png',
  rogue: 'references/art/clockwork-raven/collections/premium/updates/skills/rogue/sheets/rogue-skills-16.png',
  spells: 'references/art/clockwork-raven/magic/skills-spells-400/sheet-16.png',
  attributes: 'references/art/clockwork-raven/ui/attributes-menu-states-240/sheet-16-no-outline.png',
  farming: 'references/art/clockwork-raven/icon-packs/farming-food-beverages/sheet-16-no-outline.png',
  tools: 'references/art/clockwork-raven/icon-packs/general-items-tools/sheet-16-classic.png',
  places: 'references/art/clockwork-raven/icon-packs/places-seasons/sheet-16-without-outline.png',
  trees: 'references/art/clockwork-raven/collections/premium/updates/trees-and-logs/sheets/trees-and-logs-16.png',
  accessories: 'references/art/clockwork-raven/equipment/accessories-400/sheet-16.png',
  materials: 'references/art/clockwork-raven/icon-packs/crafting-materials/sheet-16.png',
  treasure: 'references/art/clockwork-raven/icon-packs/treasure-currency-gems-loot/sheet-16.png',
  animals: 'references/art/clockwork-raven/icon-packs/pets-animals/sheet-16.png',
  fishing: 'references/art/clockwork-raven/icon-packs/fishing-sea/sheet-16.png',
} as const;

const crops: readonly SkillIconCrop[] = [
  // Explorer — journeys, awareness, navigation, storage, and mining.
  { nodeId: 'explorer_root', source: sources.places, column: 4, row: 0 },
  { nodeId: 'trailblazer', source: sources.spells, column: 9, row: 17 },
  { nodeId: 'measured_stride', source: sources.warrior, column: 7, row: 8 },
  { nodeId: 'keen_senses', source: sources.attributes, column: 3, row: 6 },
  { nodeId: 'pathfinder', source: sources.places, column: 15, row: 1 },
  { nodeId: 'surefooted', source: sources.accessories, column: 0, row: 15 },
  { nodeId: 'cliff_climber', source: sources.tools, column: 0, row: 8 },
  { nodeId: 'second_wind', source: sources.attributes, column: 15, row: 0 },
  { nodeId: 'night_eyes', source: sources.attributes, column: 3, row: 7 },
  { nodeId: 'cave_whisperer', source: sources.places, column: 3, row: 1 },
  { nodeId: 'field_notes', source: sources.tools, column: 10, row: 4 },
  { nodeId: 'steeplechase', source: sources.animals, column: 8, row: 2 },
  { nodeId: 'horizon_chaser', source: sources.places, column: 12, row: 1 },
  { nodeId: 'cartographer', source: sources.attributes, column: 7, row: 12 },
  { nodeId: 'deep_pockets', source: sources.tools, column: 10, row: 5 },
  { nodeId: 'prospector', source: sources.tools, column: 6, row: 9 },
  { nodeId: 'efficient_strikes', source: sources.tools, column: 13, row: 9 },
  { nodeId: 'ore_dressing', source: sources.materials, column: 9, row: 2 },
  { nodeId: 'rockhound', source: sources.materials, column: 2, row: 8 },
  { nodeId: 'mother_lode', source: sources.treasure, column: 7, row: 0 },
  // Discovery uses retained plain native awareness, cave and navigation art.
  { nodeId: 'ore_sense', source: sources.attributes, column: 3, row: 6 },
  { nodeId: 'deep_ore_sense', source: sources.places, column: 3, row: 1 },
  { nodeId: 'ore_identification', source: sources.attributes, column: 3, row: 7 },
  { nodeId: 'ore_mapping', source: sources.attributes, column: 7, row: 12 },
  { nodeId: 'fishing_mapping', source: sources.tools, column: 10, row: 4 },

  // Combat — readiness, ranged techniques, blade techniques, and defence.
  { nodeId: 'combat_root', source: sources.warrior, column: 0, row: 5 },
  { nodeId: 'archery_basics', source: sources.rogue, column: 10, row: 12 },
  { nodeId: 'blade_training', source: sources.warrior, column: 1, row: 4 },
  { nodeId: 'battle_conditioning', source: sources.warrior, column: 11, row: 5 },
  { nodeId: 'steady_draw', source: sources.rogue, column: 13, row: 13 },
  { nodeId: 'critical_eye', source: sources.rogue, column: 7, row: 12 },
  { nodeId: 'quick_recovery', source: sources.warrior, column: 3, row: 4 },
  { nodeId: 'power_swing', source: sources.warrior, column: 4, row: 4 },
  { nodeId: 'shield_discipline', source: sources.warrior, column: 10, row: 5 },
  { nodeId: 'battle_hardened', source: sources.warrior, column: 13, row: 5 },
  { nodeId: 'piercing_shot', source: sources.rogue, column: 11, row: 13 },
  { nodeId: 'multishot', source: sources.rogue, column: 7, row: 13 },
  { nodeId: 'blade_dancer', source: sources.warrior, column: 12, row: 5 },
  { nodeId: 'perfect_volley', source: sources.rogue, column: 12, row: 13 },

  // Farming — cultivation, harvests, stations, orchards, and automation.
  { nodeId: 'farming_root', source: sources.farming, column: 7, row: 4 },
  { nodeId: 'green_thumb', source: sources.farming, column: 10, row: 1 },
  { nodeId: 'tender_hand', source: sources.attributes, column: 5, row: 2 },
  { nodeId: 'farmcraft', asset: 'props/item_cf_apple' },
  { nodeId: 'seed_saver', source: sources.farming, column: 3, row: 4 },
  { nodeId: 'bountiful_harvest', source: sources.farming, column: 9, row: 6 },
  { nodeId: 'soil_whisperer', source: sources.spells, column: 6, row: 12 },
  { nodeId: 'grafting', source: sources.trees, column: 3, row: 0 },
  { nodeId: 'barreling', source: sources.farming, column: 10, row: 13 },
  { nodeId: 'beekeeping', source: sources.farming, column: 6, row: 6 },
  { nodeId: 'sprinkler_engineering', source: sources.spells, column: 6, row: 4 },
  { nodeId: 'greenhouse_charter', source: sources.places, column: 0, row: 0 },
  { nodeId: 'master_grower', source: sources.farming, column: 10, row: 10 },
  { nodeId: 'harvest_festival', source: sources.farming, column: 0, row: 12 },

  // Rural specializations — each node receives a distinct licensed native
  // frame so branches remain recognizable at the skill tree's compact scale.
  { nodeId: 'mining_endurance', asset: 'props/prop_cf_anvil', animation: 'animate' },
  { nodeId: 'fishing_endurance', asset: 'props/item_cf_fishing_rod' },
  { nodeId: 'seasoned_angler', source: sources.fishing, column: 0, row: 5 },
  { nodeId: 'master_angler', source: sources.fishing, column: 7, row: 5 },
  { nodeId: 'woodcutting_endurance', source: sources.trees, column: 0, row: 1 },
  { nodeId: 'timber_sense', source: sources.trees, column: 9, row: 0 },
  { nodeId: 'master_forester', source: sources.trees, column: 2, row: 0 },
  { nodeId: 'animal_bond', source: sources.animals, column: 3, row: 0 },
  { nodeId: 'stable_hand', source: sources.animals, column: 8, row: 1 },
  { nodeId: 'animal_friend', source: sources.animals, column: 4, row: 1 },
  { nodeId: 'herd_keeper', source: sources.animals, column: 2, row: 0 },
  { nodeId: 'hive_keeper', source: sources.farming, column: 7, row: 6 },
] as const;

const duplicateNode = crops.find(
  (crop, index) => crops.findIndex((candidate) => candidate.nodeId === crop.nodeId) !== index,
);
if (duplicateNode !== undefined) throw new Error(`Duplicate skill icon mapping for ${duplicateNode.nodeId}`);

const skillNodeIds = new Set(SKILL_NODE_DEFINITIONS.map((node) => node.id));
const mappedNodeIds = new Set(crops.map((crop) => crop.nodeId));
const missingNodeIds = SKILL_NODE_DEFINITIONS
  .map((node) => node.id)
  .filter((nodeId) => !mappedNodeIds.has(nodeId));
const unknownNodeIds = crops
  .map((crop) => crop.nodeId)
  .filter((nodeId) => !skillNodeIds.has(nodeId));
if (missingNodeIds.length > 0 || unknownNodeIds.length > 0) {
  throw new Error([
    missingNodeIds.length > 0 ? `Missing skill icon mappings: ${missingNodeIds.join(', ')}` : '',
    unknownNodeIds.length > 0 ? `Unknown skill icon mappings: ${unknownNodeIds.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
}

// An explicit subset permits additive imports without rewriting earlier
// reviewed descriptors. No arguments retains the complete reproducible export.
const requestedNodes = new Set(process.argv.slice(2));
for (const id of requestedNodes) {
  if (!mappedNodeIds.has(id)) throw new Error(`Unknown requested skill icon: ${id}`);
}
const selectedCrops = requestedNodes.size === 0 ? crops
  : crops.filter((crop) => requestedNodes.has(crop.nodeId));

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

const root = fileURLToPath(workspaceRoot);
const outputRoot = resolve(root, 'packages/assets/ui');
const paletteCharacters = Object.keys((await loadPalette()).colors);
const images = new Map<string, DecodedPng>();
await mkdir(outputRoot, { recursive: true });

for (const crop of selectedCrops) {
  // Reuse the exact normal inventory artwork where a skill represents an item.
  // Export a static UI frame, without carrying object/animation behaviour over.
  if ('asset' in crop) {
    const original = JSON.parse(await readFile(resolve(root, `packages/assets/${crop.asset}.sprite.json`), 'utf8')) as AssetSource;
    const animation = crop.animation ?? 'base';
    const pixels = original.frames[animation]?.[0];
    if (original.size[0] !== 16 || original.size[1] !== 16 || pixels === undefined) {
      throw new Error(`Missing native 16px skill artwork: ${crop.asset}:${animation}`);
    }
    const name = `icon_skill_${crop.nodeId}`;
    const sourceRegion = original.sourceRegions?.[animation]?.[0] ?? original.sourceRegion;
    const asset: AssetSource = {
      name, category: 'ui', size: [16, 16], anchor: [8, 15],
      frames: { base: [pixels] }, frameKinds: { base: 'state' },
      ...(original.sourcePalette === undefined ? {} : { sourcePalette: original.sourcePalette }),
      ...(original.sourcePaletteMode === undefined ? {} : { sourcePaletteMode: original.sourcePaletteMode }),
      ...(original.sourcePath === undefined ? {} : { sourcePath: original.sourcePath }),
      ...(original.importedFrom === undefined ? {} : { importedFrom: original.importedFrom }),
      ...(sourceRegion === undefined ? {} : { sourceRegion }),
      ...(original.lintAllow === undefined ? {} : { lintAllow: original.lintAllow }),
      approved: true,
      tags: ['ui.icon', 'ui.skill', `skill.${crop.nodeId}`, `source.asset.${original.name}`],
      placement: { layer: 'ui', builderAvailable: false },
    };
    await writeFile(resolve(outputRoot, `${name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
    continue;
  }
  let image = images.get(crop.source);
  if (image === undefined) {
    image = decodePng(await readFile(resolve(root, crop.source)));
    if (image.width % 16 !== 0 || image.height % 16 !== 0) {
      throw new Error(`${crop.source} is not a native 16px icon grid`);
    }
    images.set(crop.source, image);
  }
  const originX = crop.column * 16;
  const originY = crop.row * 16;
  if (originX + 16 > image.width || originY + 16 > image.height) {
    throw new Error(`${crop.nodeId} selects a cell outside ${crop.source}`);
  }
  const pixels = Array.from({ length: 16 }, (_, y) => Array.from(
    { length: 16 },
    (_, x) => nativeHex(image!, originX + x, originY + y),
  ));
  const colors = [...new Set(pixels.flat().filter((color): color is string => color !== null))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${crop.nodeId} uses too many native colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const name = `icon_skill_${crop.nodeId}`;
  const asset: AssetSource = {
    name,
    category: 'ui',
    size: [16, 16],
    anchor: [8, 15],
    frames: {
      base: [pixels.map((row) => row.map((color) => (
        color === null ? '.' : characterByColor.get(color) ?? '.'
      )).join(''))],
    },
    frameKinds: { base: 'state' },
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(crop.source),
    sourcePath: crop.source,
    sourceRegion: [originX, originY, 16, 16],
    tags: ['ui.icon', 'ui.skill', `skill.${crop.nodeId}`, 'source.clockwork_raven'],
    placement: { layer: 'ui', builderAvailable: false },
  };
  await writeFile(resolve(outputRoot, `${name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

console.log(`Extracted ${selectedCrops.length} native skill icons from source sheets and existing item artwork.`);
