import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUTE_FANTASY_PLAYER_ROWS } from '@orchard/sim';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

const CELL_SIZE = 64;
const CROP_X = 16;
const CROP_Y = 8;
const WIDTH = 32;
const HEIGHT = 40;

const armourParts = [
  ['wearable_cf_plate_helmet', 'Player/Head/Plate_Helmet_1/Plate_Helmet_1_Iron.png', 'slot.head'],
  ['wearable_cf_heavy_plate_helmet', 'Player/Head/Plate_Helmet_2/Heavy_Plate_Helmet_1_Iron.png', 'slot.head'],
  ['wearable_cf_plate_chest', 'Player/Chest/Plate_Chest/Plate_Chest_Iron.png', 'slot.body'],
  ['wearable_cf_plate_legs', 'Player/Legs/Plate_Legs/Plate_Legs_Iron.png', 'slot.legs'],
] as const;

const animationRows = CUTE_FANTASY_PLAYER_ROWS.filter((entry) => entry.sets.some((set) => set === 'wearable'));

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

const rootPath = fileURLToPath(workspaceRoot);
const outputRoot = resolve(rootPath, 'packages/assets/characters');
const sourceRoot = resolve(rootPath, 'references/art/kenmi/cute-fantasy/core');
const paletteCharacters = Object.keys((await loadPalette()).colors);
await mkdir(outputRoot, { recursive: true });

for (const [name, relativeSource, slotTag] of armourParts) {
  const source = resolve(sourceRoot, relativeSource);
  const image = decodePng(await readFile(source));
  if (image.width !== 576 || image.height !== 3584) {
    throw new Error(`${relativeSource} is not a 9x56 modular player sheet`);
  }
  const sourceRegions = Object.fromEntries(animationRows.map((entry) => [
    entry.name,
    Array.from({ length: entry.outputFrameCount }, (_, frame) => [
      frame * CELL_SIZE + CROP_X,
      entry.row * CELL_SIZE + CROP_Y,
      WIDTH,
      HEIGHT,
    ] as const),
  ]));
  const nativeFrames = Object.fromEntries(Object.entries(sourceRegions).map(([animation, regions]) => [
    animation,
    regions.map(([originX, originY]) => Array.from({ length: HEIGHT }, (_, y) => (
      Array.from({ length: WIDTH }, (_, x) => nativeHex(image, originX + x, originY + y))
    ))),
  ]));
  const colors = [...new Set(Object.values(nativeFrames).flat(2).flatMap((row) => (
    row.filter((color): color is string => color !== null)
  )))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${name} has too many native colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = Object.fromEntries(Object.entries(nativeFrames).map(([animation, animationFrames]) => [
    animation,
    animationFrames.map((pixels) => pixels.map((row) => row.map((color) => (
      color === null ? '.' : characterByColor.get(color) ?? '.'
    )).join(''))),
  ]));
  const asset: AssetSource = {
    name,
    category: 'characters',
    size: [WIDTH, HEIGHT],
    anchor: [16, 39],
    frames,
    frameKinds: Object.fromEntries(animationRows.map((entry) => [entry.name, 'animation'])),
    animationFps: Object.fromEntries(animationRows.map((entry) => [entry.name, 10])),
    animationLoop: Object.fromEntries(animationRows.map((entry) => [entry.name, entry.loop])),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(source),
    sourcePath: relative(rootPath, source).replaceAll('\\', '/'),
    sourceRegions,
    tags: ['character.modular', 'character.armour', 'source.cute_fantasy', slotTag],
  };
  await writeFile(resolve(outputRoot, `${name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

interface RavenExample {
  readonly frame: string;
  readonly column: number;
  readonly row: number;
}

async function extractRavenExamples(
  name: string,
  relativeSource: string,
  examples: readonly RavenExample[],
  tags: readonly string[],
): Promise<void> {
  const source = resolve(rootPath, relativeSource);
  const image = decodePng(await readFile(source));
  if (image.width !== 256 || image.height !== 112) {
    throw new Error(`${relativeSource} is not a 16x7 Raven icon grid`);
  }
  const nativeFrames = Object.fromEntries(examples.map(({ frame, column, row }) => [
    frame,
    Array.from({ length: 16 }, (_, y) => (
      Array.from({ length: 16 }, (_, x) => nativeHex(image, column * 16 + x, row * 16 + y))
    )),
  ]));
  const colors = [...new Set(Object.values(nativeFrames).flatMap((rows) => rows.flatMap((row) => (
    row.filter((color): color is string => color !== null)
  ))))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${name} has too many native colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = Object.fromEntries(Object.entries(nativeFrames).map(([frame, rows]) => [
    frame,
    [rows.map((row) => row.map((color) => (
      color === null ? '.' : characterByColor.get(color) ?? '.'
    )).join(''))],
  ]));
  const sourceRegions = Object.fromEntries(examples.map(({ frame, column, row }) => [
    frame, [[column * 16, row * 16, 16, 16] as const],
  ]));
  const asset: AssetSource = {
    name,
    category: 'props',
    size: [16, 16],
    anchor: [8, 15],
    frames,
    frameKinds: Object.fromEntries(examples.map(({ frame }) => [frame, 'state'])),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(source),
    sourcePath: relative(rootPath, source).replaceAll('\\', '/'),
    sourceRegions,
    tags: ['item.armour', 'source.clockwork_raven', 'studio.raven_examples', ...tags],
  };
  await writeFile(
    resolve(rootPath, `packages/assets/props/${name}.sprite.json`),
    `${JSON.stringify(asset, null, 2)}\n`,
  );
}

await Promise.all([
  extractRavenExamples(
    'item_cr_mask_examples',
    'references/art/clockwork-raven/equipment/masks-110/sheet-16-no-outline.png',
    [
      { frame: 'ivory_skull', column: 1, row: 0 },
      { frame: 'bone_visor', column: 2, row: 0 },
      { frame: 'crimson_guard', column: 5, row: 0 },
      { frame: 'azure_demon', column: 7, row: 0 },
      { frame: 'sun_mask', column: 14, row: 0 },
      { frame: 'bronze_face', column: 15, row: 0 },
    ],
    ['item.mask', 'slot.head'],
  ),
  extractRavenExamples(
    'item_cr_chest_core_examples',
    'references/art/clockwork-raven/collections/accessories-armour-free/sheets/accessories-armour-16.png',
    [
      { frame: 'ivory_tunic', column: 0, row: 3 },
      { frame: 'steel_coat', column: 5, row: 3 },
      { frame: 'black_plate', column: 5, row: 4 },
    ],
    ['item.breastplate', 'slot.body'],
  ),
  extractRavenExamples(
    'item_cr_chest_colour_examples',
    'references/art/clockwork-raven/collections/accessories-armour-free/sheets/accessories-armour-16.png',
    [
      { frame: 'crimson_plate', column: 13, row: 4 },
      { frame: 'violet_plate', column: 14, row: 4 },
      { frame: 'verdant_plate', column: 15, row: 4 },
    ],
    ['item.breastplate', 'slot.body'],
  ),
  extractRavenExamples(
    'item_cr_boot_core_examples',
    'references/art/clockwork-raven/collections/accessories-armour-free/sheets/accessories-armour-16.png',
    [
      { frame: 'steel_boots', column: 3, row: 2 },
      { frame: 'black_boots', column: 6, row: 2 },
    ],
    ['item.boots', 'slot.legs'],
  ),
  extractRavenExamples(
    'item_cr_boot_colour_examples',
    'references/art/clockwork-raven/collections/accessories-armour-free/sheets/accessories-armour-16.png',
    [
      { frame: 'green_boots', column: 4, row: 2 },
      { frame: 'violet_boots', column: 5, row: 2 },
      { frame: 'crimson_boots', column: 7, row: 2 },
    ],
    ['item.boots', 'slot.legs'],
  ),
]);

console.log(`Extracted ${armourParts.length} animated armor templates and 17 Raven catalogue examples.`);
