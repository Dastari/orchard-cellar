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
  readonly frames: readonly Region[];
  readonly fps: number;
  readonly transparentTopLeft?: boolean;
  readonly category?: 'props' | 'trees';
  readonly size?: readonly [number, number];
  readonly anchor?: readonly [number, number];
  readonly animation?: string;
  readonly frameKind?: FrameKind;
}

const decorRoot = 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor_Animations';
const waterRoot = `${decorRoot}/Water_Decor_Animations`;
const strip = (count: number, y = 0): readonly Region[] => Array.from(
  { length: count }, (_, frame): Region => [frame * 16, y, 16, 16],
);

const extracts: Extract[] = [];
for (let variant = 1; variant <= 3; variant += 1) {
  extracts.push({
    name: `nature_cf_grass_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Grass_Animations/Grass_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (let variant = 1; variant <= 15; variant += 1) {
  extracts.push({
    name: `nature_cf_flower_grass_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Grass_Animations/Flower_Grass_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (let variant = 1; variant <= 5; variant += 1) {
  // Each sheet has ten colour rows. Stagger the selected rows so a grove mixes
  // both flower silhouettes and palettes rather than repeating one colourway.
  const row = (variant * 2 - 1) % 10;
  extracts.push({
    name: `nature_cf_flower_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Flower_Animations/Not_Potted/Flowers_${variant}_Anim.png`,
    frames: strip(6, row * 16), fps: 4,
  });
}
for (let variant = 1; variant <= 8; variant += 1) {
  const count = variant === 7 ? 8 : 6;
  extracts.push({
    name: `nature_cf_mushroom_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Muschroom_Animations/muschroom_${variant}_Anim.png`,
    frames: strip(count), fps: 3,
  });
}
for (const [colour, sourceColour] of [['green', 'Green'], ['red', 'Red'], ['purple', 'Purple'], ['brown', 'Brown']] as const) {
  for (const sourceVariant of [1, 3, 5]) {
    const variant = (['green', 'red', 'purple', 'brown'] as const).indexOf(colour) * 3
      + Math.floor((sourceVariant - 1) / 2) + 1;
    extracts.push({
      name: `nature_cf_lily_pad_${String(variant).padStart(2, '0')}`,
      source: `${waterRoot}/Water_Plants/Lillypad_${sourceColour}_${sourceVariant}_Anim.png`,
      frames: strip(8), fps: 4,
    });
  }
}
for (let row = 17; row <= 19; row += 1) {
  for (let column = 5; column <= 8; column += 1) {
    const variant = (row - 17) * 4 + column - 4;
    extracts.push({
      name: `nature_cf_water_flower_${String(variant).padStart(2, '0')}`,
      source: 'references/Cute_Fantasy/Outdoor decoration/Outdoor_Decor.png',
      frames: [[column * 16, row * 16, 16, 16]], fps: 1,
    });
  }
}
for (let variant = 1; variant <= 5; variant += 1) {
  extracts.push({
    name: `nature_cf_cattail_${String(variant).padStart(2, '0')}`,
    source: `${waterRoot}/Water_Plants/Cattail_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (let variant = 1; variant <= 2; variant += 1) {
  extracts.push({
    name: `nature_cf_water_grass_${String(variant).padStart(2, '0')}`,
    source: `${waterRoot}/Water_Plants/Water_Grass_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (const [variant, sourceVariant] of [3, 4, 5, 6, 7, 8, 9, 10, 15, 16].entries()) {
  extracts.push({
    name: `nature_cf_water_rock_${String(variant + 1).padStart(2, '0')}`,
    source: `${waterRoot}/Water_Rocks/Rock_${sourceVariant}_Water_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
extracts.push({
  name: 'nature_cf_fish_shadow_01',
  source: 'references/Cute_Fantasy/Tiles/Water/Fish_Animated_Tile.png',
  frames: strip(16), fps: 5, transparentTopLeft: true,
});
extracts.push(
  {
    name: 'nature_cf_ocean_surface_01',
    source: 'references/Cute_Fantasy/Tiles/Water/Water_Middle_Anim_1.png',
    frames: strip(8), fps: 4,
  },
  {
    name: 'nature_cf_ocean_surface_02',
    source: 'references/Cute_Fantasy/Tiles/Water/Water_Middle_Anim_2.png',
    frames: strip(14), fps: 4,
  },
);
for (const [kind, source] of [
  ['apple', 'Apple_Tree.png'],
  ['pear', 'Pear_Tree.png'],
  ['peach', 'Peach_Tree.png'],
  ['cherry', 'Cherry_Tree.png'],
] as const) {
  extracts.push({
    name: `tree_cf_${kind}_fruiting`,
    category: 'trees',
    source: `references/Cute_Fantasy/Crops/${source}`,
    frames: [[0, 0, 32, 64]], fps: 1,
    size: [32, 64], anchor: [16, 53],
    animation: 'base', frameKind: 'state',
  });
}
for (const [kind, column] of [['apple', 1], ['pear', 2], ['peach', 3], ['cherry', 4]] as const) {
  extracts.push({
    name: `item_cf_${kind}`,
    source: 'references/Cute_Fantasy/Crops/Fruit_Trees_Fruit_Objects.png',
    frames: [[column * 16, 0, 16, 16]], fps: 1,
    animation: 'base', frameKind: 'state',
  });
}

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
  const transparentColour = extract.transparentTopLeft ? nativeHex(image, 0, 0) : null;
  const nativeFrames = extract.frames.map(([x, y, width, height]) => Array.from(
    { length: height }, (_, py) => Array.from({ length: width }, (_, px) => {
      const colour = nativeHex(image, x + px, y + py);
      return colour === transparentColour ? null : colour;
    }),
  ));
  const colors = [...new Set(nativeFrames.flatMap((frame) => frame.flatMap((row) =>
    row.filter((color): color is string => color !== null))))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${extract.name} has too many colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = nativeFrames.map((pixels) => pixels.map((row) => row.map((color) =>
    color === null ? '.' : characterByColor.get(color) ?? '.').join('')));
  const animation = extract.animation ?? 'sway';
  const frameKind = extract.frameKind ?? 'animation';
  const asset: AssetSource = {
    name: extract.name,
    category: extract.category ?? 'props',
    size: extract.size ?? [16, 16],
    anchor: extract.anchor ?? [8, 15],
    frames: { [animation]: frames },
    frameKinds: { [animation]: frameKind },
    ...(frameKind === 'animation' ? {
      animationFps: { [animation]: extract.fps },
      animationLoop: { [animation]: true },
    } : {}),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(extract.source),
    sourcePath: relative(rootPath, resolve(rootPath, extract.source)).replaceAll('\\', '/'),
    sourceRegions: { [animation]: extract.frames },
    tags: ['world.nature', 'decor.ambient', extract.name.includes('fish_shadow') ? 'fishing.indicator' : 'decor.animated'],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
  };
  const outputRoot = resolve(rootPath, `packages/assets/${extract.category ?? 'props'}`);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, `${extract.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

console.log(`Extracted ${extracts.length} reviewed nature assets.`);
