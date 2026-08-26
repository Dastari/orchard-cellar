import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, FrameKind } from './assets/types.js';

type Region = readonly [number, number, number, number];

interface Extract {
  readonly name: string;
  readonly source: string;
  readonly size: readonly [number, number];
  readonly anchor: readonly [number, number];
  readonly groups: Readonly<Record<string, readonly Region[]>>;
  readonly frameKinds: Readonly<Record<string, FrameKind>>;
  readonly animationFps?: Readonly<Record<string, number>>;
  readonly animationLoop?: Readonly<Record<string, boolean>>;
  readonly tags: readonly string[];
  readonly placement: NonNullable<AssetSource['placement']>;
}

const resources = 'references/Cute_Fantasy/Icons/Outline/Resources_Icons_Outline.png';
const food = 'references/Cute_Fantasy/Icons/Outline/Food_Icons_Outline.png';
const tables = 'references/Cute_Fantasy/Buildings/House_Decor/Tables.png';
const signs = 'references/Cute_Fantasy/Outdoor decoration/Signs.png';
const gate = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Fence_Big_Gate.png';
const torch = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Torch_Anim.png';

const itemPlacement: NonNullable<AssetSource['placement']> = {
  layer: 'object', blocksMovement: false, builderAvailable: false,
};

const extracts: readonly Extract[] = [
  {
    name: 'item_cf_fiber', source: resources, size: [16, 16], anchor: [8, 15],
    groups: { base: [[16, 64, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.resource', 'material.fiber'], placement: itemPlacement,
  },
  {
    name: 'item_cf_backpack', source: resources, size: [16, 16], anchor: [8, 15],
    groups: { base: [[64, 64, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.equipment', 'equipment.back'], placement: itemPlacement,
  },
  {
    name: 'item_cf_grape', source: food, size: [16, 16], anchor: [8, 15],
    groups: { base: [[0, 80, 16, 16]] }, frameKinds: { base: 'state' },
    tags: ['item.fruit', 'fruit.grape'], placement: itemPlacement,
  },
  {
    name: 'prop_cf_workbench', source: tables, size: [32, 48], anchor: [16, 47],
    groups: { base: [[72, 16, 32, 48]] }, frameKinds: { base: 'state' },
    tags: ['world.placeable', 'station.workbench'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
  },
  {
    name: 'prop_cf_sign', source: signs, size: [16, 32], anchor: [8, 31],
    groups: { base: [[0, 0, 16, 32]] }, frameKinds: { base: 'state' },
    tags: ['world.placeable', 'decor.sign'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
  },
  {
    name: 'prop_cf_fence_gate', source: gate, size: [48, 32], anchor: [24, 31],
    groups: { closed: [[0, 0, 48, 32]], open: [[144, 0, 48, 32]] },
    frameKinds: { closed: 'state', open: 'state' },
    tags: ['world.placeable', 'build.fence', 'interaction.openable'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
  },
  {
    name: 'prop_cf_standing_torch', source: torch, size: [16, 32], anchor: [8, 31],
    groups: { burn: Array.from({ length: 8 }, (_, frame): Region => [frame * 16, 0, 16, 32]) },
    frameKinds: { burn: 'animation' }, animationFps: { burn: 8 }, animationLoop: { burn: true },
    tags: ['world.placeable', 'emits.light', 'light.flame'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
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
      Array.from({ length: width }, (_, px) => nativeHex(image, x + px, y + py)))),
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
  const asset: AssetSource = {
    name: extract.name,
    category: 'props',
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
    sourceRegions: Object.fromEntries(Object.entries(extract.groups)),
    tags: extract.tags,
    placement: extract.placement,
  };
  const outputRoot = resolve(rootPath, 'packages/assets/props');
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, `${extract.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

console.log(`Extracted ${extracts.length} reviewed crafting assets.`);
