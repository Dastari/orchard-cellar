import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, FrameKind } from './assets/types.js';

type Region = readonly [number, number, number, number];

interface Extract {
  readonly name: string;
  readonly category: 'props' | 'characters';
  readonly source: string;
  readonly size: readonly [number, number];
  readonly anchor: readonly [number, number];
  readonly groups: Readonly<Record<string, readonly Region[]>>;
  readonly frameKinds: Readonly<Record<string, FrameKind>>;
  readonly animationFps?: Readonly<Record<string, number>>;
  readonly animationLoop?: Readonly<Record<string, boolean>>;
  readonly tags: readonly string[];
  readonly placement?: AssetSource['placement'];
  readonly transformPixel?: (color: string | null, x: number, y: number, group: string) => string | null;
}

const oreSource = 'references/Cute_Fantasy/Outdoor decoration/Ores.png';
const toolSource = 'references/Cute_Fantasy/Player/Tools/Iron/Iron_Tools.png';
const swordSource = 'references/Cute_Fantasy/Player/Tools/Iron/Iron_Sword.png';
const bowSource = 'references/Cute_Fantasy/Player/Tools/Bow/Wooden_Bow.png';
const arrowSource = 'references/Cute_Fantasy_Dungeons/Objects/Crossbow_Bolt.png';
const resourceIconsSource = 'references/Cute_Fantasy/Icons/Outline/Resources_Icons_Outline.png';
const outdoorDecorSource = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor.png';
const rockAnimationSource = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor_Animations/Rock_Animations/Rock_1_Anim.png';
const campDecorSource = 'references/Cute_Fantasy/Outdoor decoration/Camp_Decor.png';
const campfireSource = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Campfire_Anim.png';
const cookingFireSource = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Fireplace_Anim.png';
const campCookingFireSource = 'references/Cute_Fantasy_MilitaryCamp/Campfire_Pot_Anim.png';
const tentSource = 'references/Cute_Fantasy/Buildings/Buildings/Tent/Tent_Small.png';
const portableLightSource = 'references/Cute_Fantasy/Other/Lantern_Torch.png';
const oreTypes = ['iron', 'copper', 'gold', 'emerald', 'sapphire', 'topaz', 'ruby', 'amethyst'] as const;
const toolFrames = (y: number): readonly Region[] => Array.from(
  { length: 6 }, (_, frame): Region => [frame * 64, y, 64, 64],
);
const swordFrames = (y: number): readonly Region[] => Array.from(
  { length: 4 }, (_, frame): Region => [frame * 64, y, 64, 64],
);

const extracts: readonly Extract[] = [
  {
    name: 'item_cf_torch', category: 'props', source: portableLightSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[0, 0, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.tool', 'item.light', 'light.torch'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'item_cf_lantern', category: 'props', source: portableLightSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[0, 16, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.tool', 'item.light', 'light.lantern'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'prop_cf_camp_tent', category: 'props', source: tentSource,
    size: [48, 96], anchor: [24, 95], groups: { base: [[0, 0, 48, 96]] }, frameKinds: { base: 'state' },
    tags: ['world.landmark', 'camp.tent', 'decor.permanent'],
    placement: { layer: 'object', footprint: [3, 3], blocksMovement: true, builderAvailable: false },
  },
  {
    name: 'prop_cf_campfire', category: 'props', source: campfireSource,
    size: [16, 32], anchor: [8, 31],
    groups: {
      burn: Array.from({ length: 8 }, (_, frame): Region => [frame * 16, 0, 16, 32]),
      off: [[0, 0, 16, 32]],
    },
    frameKinds: { burn: 'animation', off: 'state' }, animationFps: { burn: 8 }, animationLoop: { burn: true },
    transformPixel: (color, _x, y, group) => {
      if (group !== 'off') return color;
      if (!['#ed7614', '#ffa214', '#ffc825'].includes(color ?? '')) return color;
      if (y < 20) return null;
      return color === '#ed7614' ? '#391f21'
        : color === '#ffa214' ? '#743f39'
          : '#91533b';
    },
    tags: ['world.landmark', 'station.cooking', 'decor.animated', 'emits.light'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
  },
  {
    name: 'prop_cf_cooking_fire', category: 'props', source: cookingFireSource,
    size: [32, 32], anchor: [16, 31],
    groups: {
      burn: Array.from({ length: 8 }, (_, frame): Region => [frame * 32, 0, 32, 32]),
      off: [[0, 0, 32, 32]],
    },
    frameKinds: { burn: 'animation', off: 'state' }, animationFps: { burn: 8 }, animationLoop: { burn: true },
    transformPixel: (color, _x, _y, group) => {
      if (group !== 'off') return color;
      if (!['#ed7614', '#ffa214', '#ffc825'].includes(color ?? '')) return color;
      return color === '#ed7614' ? '#391f21'
        : color === '#ffa214' ? '#743f39'
          : '#91533b';
    },
    tags: ['world.landmark', 'station.cooking', 'container.cooking_fire', 'decor.animated', 'emits.light'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
  },
  {
    name: 'prop_cf_camp_cooking_fire', category: 'props', source: campCookingFireSource,
    size: [48, 32], anchor: [24, 31],
    groups: {
      burn: Array.from({ length: 5 }, (_, frame): Region => [frame * 48, 0, 48, 32]),
      off: [[0, 0, 48, 32]],
    },
    frameKinds: { burn: 'animation', off: 'state' }, animationFps: { burn: 8 }, animationLoop: { burn: true },
    transformPixel: (color, _x, _y, group) => {
      if (group !== 'off') return color;
      if (!['#ed7614', '#ffa214', '#ffc825'].includes(color ?? '')) return color;
      return color === '#ed7614' ? '#391f21'
        : color === '#ffa214' ? '#743f39'
          : '#91533b';
    },
    tags: ['world.landmark', 'station.cooking', 'container.cooking_fire', 'camp.military', 'decor.animated', 'emits.light'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
  },
  ...([
    ['prop_cf_camp_round_stool', 0, 'camp.seat'],
    ['prop_cf_camp_bench', 16, 'camp.seat'],
    ['prop_cf_camp_stump_seat', 32, 'camp.seat'],
    ['prop_cf_camp_chair', 48, 'camp.seat'],
    ['prop_cf_camp_fishing_rod', 64, 'camp.fishing'],
  ] as const).map(([name, x, tag]): Extract => ({
    name, category: 'props', source: campDecorSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[x, 0, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['world.landmark', tag, 'decor.permanent'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: tag === 'camp.seat', builderAvailable: false },
  })),
  {
    name: 'item_cf_arrow', category: 'props', source: arrowSource,
    size: [16, 16], anchor: [8, 8], groups: { base: [[0, 0, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.ammunition', 'projectile.arrow'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'item_cf_stick', category: 'props', source: resourceIconsSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[32, 64, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.resource', 'material.wood', 'item.crafted'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  ...oreTypes.flatMap((kind, row): readonly Extract[] => {
    const metal = row < 3;
    const nodeVariants = [
      ['', 0, 'mixed'],
      ['_pure_large', 16, 'pure.large'],
      ['_pure_medium', 32, 'pure.medium'],
      ['_pure_small', 48, 'pure.small'],
      ['_pristine', 64, 'pristine'],
    ] as const;
    const nodes: readonly Extract[] = nodeVariants.map(([suffix, x, quality]) => ({
      name: `resource_cf_ore_${kind}${suffix}`, category: 'props', source: oreSource,
      size: [16, 16], anchor: [8, 15], groups: { base: [[x, row * 16, 16, 16]] },
      frameKinds: { base: 'state' },
      tags: ['resource.mineable', 'resource.ore', `ore.${kind}`, `ore.node.${quality}`],
      placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
    }));
    const oreChunk: Extract = {
      name: `item_cf_${kind}_ore`,
      category: 'props',
      source: metal ? resourceIconsSource : oreSource,
      size: [16, 16],
      anchor: [8, 15],
      groups: { base: [[metal ? 16 : 96, row * 16, 16, 16]] },
      frameKinds: { base: 'state' },
      tags: ['item.resource', 'material.ore', 'material.raw', `ore.${kind}`],
      placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
    };
    const piece: Extract = {
      name: `item_cf_${kind}_piece`, category: 'props', source: metal ? resourceIconsSource : oreSource,
      size: [16, 16], anchor: [8, 15],
      groups: { base: [[metal ? 0 : 80, row * 16, 16, 16]] }, frameKinds: { base: 'state' },
      tags: ['item.resource', 'material.ore_piece', 'material.raw', `ore.${kind}`],
      placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
    };
    const finished: Extract = {
      name: `item_cf_${kind}_${metal ? 'bar' : 'gem'}`, category: 'props',
      source: metal ? resourceIconsSource : oreSource,
      size: [16, 16], anchor: [8, 15],
      groups: { base: [[metal ? 32 : 112, row * 16, 16, 16]] }, frameKinds: { base: 'state' },
      tags: metal
        ? ['item.resource', 'material.metal', 'material.bar', `metal.${kind}`]
        : ['item.resource', 'material.gem', 'item.refined', `gem.${kind}`],
      placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
    };
    return [...nodes, oreChunk, piece, finished];
  }),
  {
    name: 'resource_cf_rock_stone', category: 'props', source: rockAnimationSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[0, 0, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['resource.mineable', 'resource.rock', 'material.stone'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
  },
  {
    name: 'item_cf_pebble', category: 'props', source: outdoorDecorSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[0, 80, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.resource', 'material.stone', 'material.raw'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'item_cf_stone', category: 'props', source: resourceIconsSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[0, 80, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.resource', 'material.stone', 'item.crafted'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'prop_cf_poi_stump', category: 'props', source: outdoorDecorSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[16, 96, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['world.poi', 'decor.stump', 'decor.permanent'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'prop_cf_poi_fallen_log', category: 'props', source: outdoorDecorSource,
    size: [32, 16], anchor: [16, 15], groups: { base: [[0, 112, 32, 16]] }, frameKinds: { base: 'state' },
    tags: ['world.poi', 'decor.log', 'decor.permanent'],
    placement: { layer: 'object', footprint: [2, 1], blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'prop_cf_poi_rock_small', category: 'props', source: outdoorDecorSource,
    size: [16, 16], anchor: [8, 15], groups: { base: [[96, 112, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['world.poi', 'decor.rock', 'decor.permanent'],
    placement: { layer: 'object', blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'tool_cf_wooden_bow_action',
    category: 'characters',
    source: bowSource,
    size: [64, 64],
    anchor: [32, 47],
    groups: {
      ranged_weapon_down: toolFrames(0),
      ranged_weapon_right: toolFrames(64),
      ranged_weapon_up: toolFrames(128),
    },
    frameKinds: {
      ranged_weapon_down: 'animation',
      ranged_weapon_right: 'animation',
      ranged_weapon_up: 'animation',
    },
    animationFps: { ranged_weapon_down: 10, ranged_weapon_right: 10, ranged_weapon_up: 10 },
    animationLoop: { ranged_weapon_down: false, ranged_weapon_right: false, ranged_weapon_up: false },
    tags: ['character.tool', 'tool.bow', 'action.ranged_weapon'],
  },
  {
    name: 'tool_cf_iron_axe_action',
    category: 'characters',
    source: toolSource,
    size: [64, 64],
    anchor: [32, 47],
    groups: {
      axe_down: toolFrames(0),
      axe_right: toolFrames(64),
      axe_up: toolFrames(128),
    },
    frameKinds: { axe_down: 'animation', axe_right: 'animation', axe_up: 'animation' },
    animationFps: { axe_down: 10, axe_right: 10, axe_up: 10 },
    animationLoop: { axe_down: false, axe_right: false, axe_up: false },
    tags: ['character.tool', 'tool.axe', 'action.swing'],
  },
  {
    name: 'tool_cf_iron_sword_action',
    category: 'characters',
    source: swordSource,
    size: [64, 64],
    anchor: [32, 47],
    groups: {
      swing_sword_down: swordFrames(0),
      swing_sword_right: swordFrames(3 * 64),
      swing_sword_up: swordFrames(6 * 64),
    },
    frameKinds: {
      swing_sword_down: 'animation',
      swing_sword_right: 'animation',
      swing_sword_up: 'animation',
    },
    animationFps: { swing_sword_down: 10, swing_sword_right: 10, swing_sword_up: 10 },
    animationLoop: { swing_sword_down: false, swing_sword_right: false, swing_sword_up: false },
    tags: ['character.tool', 'tool.sword', 'action.swing'],
  },
  {
    name: 'tool_cf_iron_pickaxe_action',
    category: 'characters',
    source: toolSource,
    size: [64, 64],
    anchor: [32, 47],
    groups: {
      swing_pickaxe_down: toolFrames(192),
      swing_pickaxe_right: toolFrames(256),
      swing_pickaxe_up: toolFrames(320),
    },
    frameKinds: {
      swing_pickaxe_down: 'animation',
      swing_pickaxe_right: 'animation',
      swing_pickaxe_up: 'animation',
    },
    animationFps: {
      swing_pickaxe_down: 10,
      swing_pickaxe_right: 10,
      swing_pickaxe_up: 10,
    },
    animationLoop: {
      swing_pickaxe_down: false,
      swing_pickaxe_right: false,
      swing_pickaxe_up: false,
    },
    tags: ['character.tool', 'tool.pickaxe', 'action.swing'],
  },
  {
    name: 'tool_cf_iron_hoe_action',
    category: 'characters',
    source: toolSource,
    size: [64, 64],
    anchor: [32, 47],
    groups: {
      swing_hoe_down: toolFrames(384),
      swing_hoe_right: toolFrames(448),
      swing_hoe_up: toolFrames(512),
    },
    frameKinds: {
      swing_hoe_down: 'animation',
      swing_hoe_right: 'animation',
      swing_hoe_up: 'animation',
    },
    animationFps: { swing_hoe_down: 10, swing_hoe_right: 10, swing_hoe_up: 10 },
    animationLoop: { swing_hoe_down: false, swing_hoe_right: false, swing_hoe_up: false },
    tags: ['character.tool', 'tool.hoe', 'action.swing'],
  },
  {
    name: 'tool_cf_watering_can_action',
    category: 'characters',
    source: toolSource,
    size: [64, 64],
    anchor: [32, 47],
    groups: {
      water_down: toolFrames(576),
      water_right: toolFrames(640),
      water_up: toolFrames(704),
    },
    frameKinds: {
      water_down: 'animation',
      water_right: 'animation',
      water_up: 'animation',
    },
    animationFps: { water_down: 10, water_right: 10, water_up: 10 },
    animationLoop: { water_down: false, water_right: false, water_up: false },
    tags: ['character.tool', 'tool.watering_can', 'action.water'],
  },
];

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

const rootPath = fileURLToPath(workspaceRoot);
const palette = await loadPalette();
const paletteCharacters = Object.keys(palette.colors);
const images = new Map<string, DecodedPng>();
for (const source of new Set(extracts.map((extract) => extract.source))) {
  images.set(source, decodePng(await readFile(resolve(rootPath, source))));
}

for (const extract of extracts) {
  const image = images.get(extract.source)!;
  const nativeFrames = Object.fromEntries(Object.entries(extract.groups).map(([group, regions]) => [
    group,
    regions.map(([x, y, width, height]) => Array.from({ length: height }, (_, py) =>
      Array.from({ length: width }, (_, px) => {
        const color = nativeHex(image, x + px, y + py);
        return extract.transformPixel === undefined
          ? color
          : extract.transformPixel(color, px, py, group);
      }))),
  ]));
  const colors = [...new Set(Object.values(nativeFrames).flat(2).flatMap((row) =>
    row.filter((color): color is string => color !== null)))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${extract.name} has too many colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = Object.fromEntries(Object.entries(nativeFrames).map(([group, groupFrames]) => [
    group,
    groupFrames.map((pixels) => pixels.map((row) => row.map((color) =>
      color === null ? '.' : characterByColor.get(color) ?? '.').join(''))),
  ]));
  const sourceRegions = Object.fromEntries(Object.entries(extract.groups));
  const asset: AssetSource = {
    name: extract.name,
    category: extract.category,
    size: extract.size,
    anchor: extract.anchor,
    frames,
    frameKinds: extract.frameKinds,
    ...(extract.animationFps ? { animationFps: extract.animationFps } : {}),
    ...(extract.animationLoop ? { animationLoop: extract.animationLoop } : {}),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(extract.source),
    sourcePath: relative(rootPath, resolve(rootPath, extract.source)).replaceAll('\\', '/'),
    sourceRegions,
    tags: extract.tags,
    ...(extract.placement ? { placement: extract.placement } : {}),
  };
  const outputRoot = resolve(rootPath, `packages/assets/${extract.category}`);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, `${extract.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

console.log(`Extracted ${extracts.length} reviewed ore, decoration, and tool assets.`);
