import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

type Region = readonly [number, number, number, number];
type RowAnimation = readonly [name: string, row: number];

const rootPath = fileURLToPath(workspaceRoot);
const outputRoot = resolve(rootPath, 'packages/assets/characters');
const propOutputRoot = resolve(rootPath, 'packages/assets/props');
const sourceRoot = resolve(rootPath, 'references');
const paletteCharacters = Object.keys((await loadPalette()).colors);
await mkdir(outputRoot, { recursive: true });
await mkdir(propOutputRoot, { recursive: true });

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

function frameHasPixels(image: DecodedPng, region: Region): boolean {
  const [originX, originY, width, height] = region;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if ((image.rgba[((originY + y) * image.width + originX + x) * 4 + 3] ?? 0) > 0) return true;
  }
  return false;
}

function regionsForRows(
  image: DecodedPng,
  width: number,
  height: number,
  rows: readonly RowAnimation[],
): Readonly<Record<string, readonly Region[]>> {
  const columns = Math.floor(image.width / width);
  return Object.fromEntries(rows.map(([name, row]) => {
    const regions = Array.from({ length: columns }, (_, column) => (
      [column * width, row * height, width, height] as const
    ));
    while (regions.length > 1 && !frameHasPixels(image, regions.at(-1)!)) regions.pop();
    return [name, regions];
  }));
}

async function writeExactAsset(options: {
  readonly name: string;
  readonly source: string;
  readonly size: readonly [number, number];
  readonly anchor: readonly [number, number];
  readonly sourceRegions: Readonly<Record<string, readonly Region[]>>;
  readonly category?: 'characters' | 'props';
  readonly fps?: number;
}): Promise<void> {
  const source = resolve(sourceRoot, options.source);
  const image = decodePng(await readFile(source));
  const nativeFrames = Object.fromEntries(Object.entries(options.sourceRegions).map(([animation, regions]) => [
    animation,
    regions.map(([originX, originY, width, height]) => Array.from({ length: height }, (_, y) => (
      Array.from({ length: width }, (_, x) => nativeHex(image, originX + x, originY + y))
    ))),
  ]));
  const colors = [...new Set(Object.values(nativeFrames).flat(2).flatMap((row) => (
    row.filter((color): color is string => color !== null)
  )))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${options.name} has too many native colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = Object.fromEntries(Object.entries(nativeFrames).map(([animation, animationFrames]) => [
    animation,
    animationFrames.map((pixels) => pixels.map((row) => row.map((color) => (
      color === null ? '.' : characterByColor.get(color) ?? '.'
    )).join(''))),
  ]));
  const animationNames = Object.keys(frames);
  const category = options.category ?? 'characters';
  const asset: AssetSource = {
    name: options.name,
    category,
    size: options.size,
    anchor: options.anchor,
    frames,
    frameKinds: Object.fromEntries(animationNames.map((animation) => [animation, 'animation'])),
    animationFps: Object.fromEntries(animationNames.map((animation) => [animation, options.fps ?? 8])),
    animationLoop: Object.fromEntries(animationNames.map((animation) => [animation, !animation.startsWith('hit')])),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(source),
    sourcePath: relative(rootPath, source).replaceAll('\\', '/'),
    sourceRegions: options.sourceRegions,
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    tags: ['wildlife', 'source.cute_fantasy'],
  };
  const destination = category === 'characters' ? outputRoot : propOutputRoot;
  await writeFile(resolve(destination, `${options.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

const quadrupedRows: readonly RowAnimation[] = [
  ['idle_side', 0], ['idle_down', 1], ['idle_up', 2],
  ['walk_side', 3], ['walk_down', 4], ['walk_up', 5],
  ['action_side', 6], ['action_down', 7], ['action_up', 8],
  ['rest_side', 9], ['lie_down_side', 10], ['sleep_side', 11],
  ['hit_side', 12], ['hit_down', 13], ['hit_up', 14],
];

const birdRows: readonly RowAnimation[] = [
  ['idle_side', 0], ['walk_side', 1], ['forage_side', 2],
  ['action_1_side', 3], ['action_2_side', 4], ['action_3_side', 5],
  ['sleep_side', 6], ['hit_side', 7],
  ['idle_side_alt', 8], ['walk_side_alt', 9], ['forage_side_alt', 10],
  ['action_1_side_alt', 11], ['action_2_side_alt', 12], ['action_3_side_alt', 13],
  ['sleep_side_alt', 14], ['hit_side_alt', 15],
];

const waterBirdRows: readonly RowAnimation[] = [
  ['idle_land', 0], ['walk_land', 1], ['forage_land', 2],
  ['action_1_land', 3], ['action_2_land', 4], ['sleep_land', 5], ['hit_land', 6],
  ['idle_swim', 7], ['paddle_swim', 8], ['swim_side', 9],
  ['idle_land_alt', 10], ['walk_land_alt', 11], ['forage_land_alt', 12],
  ['action_1_land_alt', 13], ['action_2_land_alt', 14], ['sleep_land_alt', 15], ['hit_land_alt', 16],
  ['idle_swim_alt', 17], ['paddle_swim_alt', 18], ['swim_side_alt', 19],
];

const families = [
  { species: 'cow', folder: 'Cute_Fantasy/Animals/Cow', files: Array.from({ length: 9 }, (_, i) => `Cow_${String(i + 1).padStart(2, '0')}.png`), rows: quadrupedRows },
  { species: 'sheep', folder: 'Cute_Fantasy/Animals/Sheep', files: Array.from({ length: 9 }, (_, i) => `Sheep_${String(i + 1).padStart(2, '0')}.png`), rows: quadrupedRows },
  { species: 'pig', folder: 'Cute_Fantasy/Animals/Pig', files: Array.from({ length: 16 }, (_, i) => `Pig_${String(i + 1).padStart(2, '0')}.png`), rows: quadrupedRows },
  { species: 'horse', folder: 'Cute_Fantasy/Animals/Horse', files: Array.from({ length: 5 }, (_, i) => `Horse_${String(i + 1).padStart(2, '0')}.png`), rows: quadrupedRows },
  { species: 'chicken', folder: 'Cute_Fantasy/Animals/Chicken', files: Array.from({ length: 18 }, (_, i) => `Chicken_${String(i + 1).padStart(2, '0')}.png`), rows: birdRows },
  { species: 'rooster', folder: 'Cute_Fantasy/Animals/Chicken', files: ['Rooster.png'], rows: birdRows },
  { species: 'duck', folder: 'Cute_Fantasy/Animals/Duck', files: ['Duck_01.png', 'Duck_02.png', 'Duck_03.png', 'Duck_04.png', 'Duck_in_a_hat.png'], rows: waterBirdRows },
  { species: 'goose', folder: 'Cute_Fantasy/Animals/Goose', files: Array.from({ length: 6 }, (_, i) => `Goose_${String(i + 1).padStart(2, '0')}.png`), rows: birdRows },
  { species: 'swan', folder: 'Cute_Fantasy/Animals/Swan', files: Array.from({ length: 3 }, (_, i) => `Swan_${String(i + 1).padStart(2, '0')}.png`), rows: waterBirdRows },
] as const;

for (const family of families) {
  for (let variant = 0; variant < family.files.length; variant += 1) {
    const source = `${family.folder}/${family.files[variant]}`;
    const image = decodePng(await readFile(resolve(sourceRoot, source)));
    await writeExactAsset({
      name: `wildlife_cf_${family.species}_${String(variant + 1).padStart(2, '0')}`,
      source,
      size: [32, 32],
      anchor: [16, 31],
      sourceRegions: regionsForRows(image, 32, 32, family.rows),
    });
  }
}

const simpleSheets = [
  { name: 'wildlife_cf_frog', folder: 'Cute_Fantasy/Animals/Frog', files: 6, prefix: 'Frog_', padded: true, size: [32, 32] as const, anchor: [16, 31] as const, rows: [['idle_side', 0], ['hop_side', 1], ['action_side', 2], ['hit_side', 3]] as const, category: 'characters' as const },
  { name: 'wildlife_cf_mouse', folder: 'Cute_Fantasy/Animals/Mouse', files: 4, prefix: 'Mouse_', padded: true, size: [32, 32] as const, anchor: [16, 31] as const, rows: [['idle_side', 0], ['walk_side', 1], ['forage_side', 2], ['hit_side', 3]] as const, category: 'characters' as const },
  { name: 'wildlife_cf_camel', folder: 'Cute_Fantasy_Desert/Animals/Camel', files: 3, prefix: 'Camel_', size: [48, 32] as const, anchor: [24, 31] as const, rows: [['idle_side', 0], ['walk_side', 1], ['run_side', 2], ['action_1_side', 3], ['action_2_side', 4], ['rest_side', 5], ['lie_down_side', 6], ['sleep_side', 7], ['hit_side', 8]] as const, category: 'props' as const },
  { name: 'wildlife_cf_scarab', folder: 'Cute_Fantasy_Desert/Animals/Scarab', files: 4, names: ['Scarab_Black.png', 'Scarab_Yellow.png', 'Scarab_Brown.png', 'Scarab_Green.png'], size: [16, 16] as const, anchor: [8, 15] as const, rows: [['walk_side', 0], ['idle_side', 1], ['hit_side', 2]] as const, category: 'props' as const },
  { name: 'wildlife_cf_vulture', folder: 'Cute_Fantasy_Desert/Animals/Vulture', files: 4, prefix: 'Vulture_', size: [48, 48] as const, anchor: [24, 47] as const, rows: [['idle_side', 0], ['walk_side', 1], ['fly_side', 2], ['fly_down', 3], ['fly_up', 4], ['sleep_side', 5], ['hit_side', 6]] as const, category: 'props' as const },
  { name: 'wildlife_cf_snail', folder: 'Cute_Fantasy_ShroomLands/Snails', files: 4, prefix: 'Snail_', size: [32, 32] as const, anchor: [16, 31] as const, rows: [['idle_side', 0], ['idle_down', 1], ['idle_up', 2], ['walk_side', 3], ['walk_down', 4], ['walk_up', 5]] as const, category: 'characters' as const },
] as const;

for (const sheet of simpleSheets) for (let variant = 0; variant < sheet.files; variant += 1) {
  const index = 'padded' in sheet && sheet.padded ? String(variant + 1).padStart(2, '0') : String(variant + 1);
  const filename = 'names' in sheet ? sheet.names[variant]! : `${sheet.prefix}${index}.png`;
  const source = `${sheet.folder}/${filename}`;
  const image = decodePng(await readFile(resolve(sourceRoot, source)));
  await writeExactAsset({
    name: `${sheet.name}_${String(variant + 1).padStart(2, '0')}`,
    source,
    size: sheet.size,
    anchor: sheet.anchor,
    sourceRegions: regionsForRows(image, sheet.size[0], sheet.size[1], sheet.rows),
    category: sheet.category,
  });
}

// Bees and butterflies use native 16px cells rather than the livestock grid.
for (const compact of [
  { name: 'wildlife_cf_bee_01', source: 'Cute_Fantasy/Animals/Bee/Bee_Flying_Animation.png', rows: [['fly_side', 0], ['fly_side_alt', 1]] as const, fps: 12 },
] as const) {
  const image = decodePng(await readFile(resolve(sourceRoot, compact.source)));
  await writeExactAsset({
    name: compact.name, source: compact.source, size: [16, 16], anchor: [8, 15],
    sourceRegions: regionsForRows(image, 16, 16, compact.rows), category: 'props', fps: compact.fps,
  });
}

{
  const source = 'Cute_Fantasy/Animals/Butterfly/Butterfly.png';
  // The sheet is eight colour rows of two 8x8 wing states. It is not four
  // 16x16 frames: interpreting it that way draws four butterflies at once.
  for (let variant = 0; variant < 8; variant += 1) {
    const sourceRegions = {
      flutter: [
        [0, variant * 8, 8, 8],
        [8, variant * 8, 8, 8],
      ] as const,
    };
    await writeExactAsset({
      name: `wildlife_cf_butterfly_${String(variant + 1).padStart(2, '0')}`,
      source,
      size: [8, 8],
      anchor: [4, 7],
      sourceRegions,
      category: 'props',
      fps: 8,
    });
  }
}

// Every capybara action is authored as its own horizontal strip.
const capybaraAnimations = [
  ['idle', 'Idle'], ['look', 'LookAround'], ['submerged', 'LookAround_submerged'],
  ['dive', 'Dive'], ['emerge', 'Emerge'], ['bubbles', 'Bubbles'],
] as const;
for (let variant = 0; variant < 2; variant += 1) for (const [animation, suffix] of capybaraAnimations) {
  const prefix = variant === 0 ? '' : 'Albino_';
  const source = `Cute_Fantasy/Animals/Kapybara/Static/${prefix}Kapybara_${suffix}.png`;
  const image = decodePng(await readFile(resolve(sourceRoot, source)));
  await writeExactAsset({
    name: `wildlife_cf_capybara_${String(variant + 1).padStart(2, '0')}_${animation}`,
    source, size: [32, 32], anchor: [16, 31],
    sourceRegions: regionsForRows(image, 32, 32, [['base', 0]]), fps: animation === 'bubbles' ? 10 : 8,
  });
}

// Preserve horse colour while mounted. These sheets use 64px source cells
// with the horse occupying the centred 32px crop.
const mountedHorseSources = ['Brown', 'White', 'Chocolate', 'Gray', 'Black'] as const;
for (let variant = 0; variant < mountedHorseSources.length; variant += 1) {
  const source = `Cute_Fantasy/Player/Player_Mounts/Horse/Player_Horse_${mountedHorseSources[variant]}.png`;
  const sourceRegions = {
    mount: [
      ...Array.from({ length: 2 }, (_, frame) => [frame * 64 + 16, 16, 32, 32] as const),
      ...Array.from({ length: 2 }, (_, frame) => [frame * 64 + 16, 80, 32, 32] as const),
      ...Array.from({ length: 2 }, (_, frame) => [frame * 64 + 16, 144, 32, 32] as const),
      ...Array.from({ length: 6 }, (_, frame) => [frame * 64 + 16, 208, 32, 32] as const),
      ...Array.from({ length: 6 }, (_, frame) => [frame * 64 + 16, 272, 32, 32] as const),
      ...Array.from({ length: 6 }, (_, frame) => [frame * 64 + 16, 336, 32, 32] as const),
    ],
  };
  await writeExactAsset({
    name: `wildlife_cf_horse_mounted_${String(variant + 1).padStart(2, '0')}`,
    source, size: [32, 32], anchor: [16, 31], sourceRegions,
  });
}

await writeExactAsset({
  name: 'prop_cf_bee_hive', source: 'Cute_Fantasy/Animals/Bee/Bee_Hive.png',
  size: [16, 16], anchor: [8, 15], sourceRegions: { base: [[0, 0, 16, 16]] }, category: 'props', fps: 1,
});
{
  const source = 'Cute_Fantasy/Animals/Bee/Bee_Nest.png';
  const sourceRegions = { base: Array.from({ length: 6 }, (_, frame) => [frame % 2 * 16, Math.floor(frame / 2) * 16, 16, 16] as const) };
  await writeExactAsset({ name: 'prop_cf_bee_nest', source, size: [16, 16], anchor: [8, 15], sourceRegions, category: 'props', fps: 1 });
}

console.log('Extracted all Cute Fantasy wildlife variants, mounted horses, hives, and authored animation rows.');
