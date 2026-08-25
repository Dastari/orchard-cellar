import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

const CELL_SIZE = 64;
const CROP_X = 16;
const CROP_Y = 8;
const WIDTH = 32;
const HEIGHT = 40;
const FRAME_COUNT = 6;

const parts = [
  ['action_cf_base', 'Player/Player_Base/Player_Base_animations.png'],
  ['action_cf_hands', 'Player/Hands/Hands_1_Bare.png'],
  ['action_cf_hair_1_brown', 'Player/Head/Hair_1/Hair_1_Brown.png'],
  ['action_cf_hair_2_black', 'Player/Head/Hair_2/Hair_2_Black.png'],
  ['action_cf_hair_3_blonde', 'Player/Head/Hair_3/Hair_3_Blonde.png'],
  ['action_cf_hair_4_ginger', 'Player/Head/Hair_4/Hair_4_Ginger.png'],
  ['action_cf_hair_5_grey', 'Player/Head/Hair_5/Hair_5_Grey.png'],
  ['action_cf_hair_6_brown', 'Player/Head/Hair_6/Hair_6_Brown.png'],
  ['action_cf_shirt_farmer_green', 'Player/Chest/Farmer_Shirt/Farmer_Shirt_1_Green.png'],
  ['action_cf_shirt_farmer_blue', 'Player/Chest/Farmer_Shirt/Farmer_Shirt_1_Blue.png'],
  ['action_cf_shirt_farmer_orange', 'Player/Chest/Farmer_Shirt/Farmer_Shirt_1_Orange.png'],
  ['action_cf_shirt_farmer_purple', 'Player/Chest/Farmer_Shirt/Farmer_Shirt_1_Purple.png'],
  ['action_cf_shirt_farmer_red', 'Player/Chest/Farmer_Shirt/Farmer_Shirt_1_Red.png'],
  ['action_cf_shirt_farmer_white_brown', 'Player/Chest/Farmer_Shirt/Farmer_Shirt_1_White_and_Brown.png'],
  ['action_cf_pants_farmer_white_brown', 'Player/Legs/Farmer_Pants/Farmer_Pants_1_White_and_Brown.png'],
  ['action_cf_pants_farmer_black', 'Player/Legs/Farmer_Pants/Farmer_Pants_1_Black.png'],
  ['action_cf_pants_farmer_blue', 'Player/Legs/Farmer_Pants/Farmer_Pants_1_Blue.png'],
  ['action_cf_pants_farmer_green', 'Player/Legs/Farmer_Pants/Farmer_Pants_1_Green.png'],
  ['action_cf_pants_farmer_red', 'Player/Legs/Farmer_Pants/Farmer_Pants_1_Red.png'],
  ['action_cf_shoes_brown', 'Player/Feet/Shoes_1_Brown.png'],
  ['action_cf_shoes_black', 'Player/Feet/Shoes_1_Black.png'],
  ['action_cf_shoes_blue', 'Player/Feet/Shoes_1_Blue.png'],
  ['action_cf_shoes_green', 'Player/Feet/Shoes_1_Green.png'],
  ['action_cf_shoes_red', 'Player/Feet/Shoes_1_Red.png'],
] as const;

const animationRows = [
  ['ranged_weapon_down', 29], ['ranged_weapon_right', 30], ['ranged_weapon_up', 31],
  ['swing_axe_down', 32], ['swing_axe_right', 33], ['swing_axe_up', 34],
  ['swing_pickaxe_down', 35], ['swing_pickaxe_right', 36], ['swing_pickaxe_up', 37],
  ['swing_hoe_down', 38], ['swing_hoe_right', 39], ['swing_hoe_up', 40],
  ['water_down', 41], ['water_right', 42], ['water_up', 43],
] as const;

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
const sourceRoot = resolve(rootPath, 'references/Cute_Fantasy');
const paletteCharacters = Object.keys((await loadPalette()).colors);
await mkdir(outputRoot, { recursive: true });

for (const [name, relativeSource] of parts) {
  const source = resolve(sourceRoot, relativeSource);
  const image = decodePng(await readFile(source));
  if (image.width !== 576 || image.height !== 3584) throw new Error(`${relativeSource} is not a 9x56 player sheet`);
  const sourceRegions = Object.fromEntries(animationRows.map(([animation, row]) => [
    animation,
    Array.from({ length: FRAME_COUNT }, (_, frame) => [
      frame * CELL_SIZE + CROP_X,
      row * CELL_SIZE + CROP_Y,
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
  const animationNames = Object.keys(frames);
  const asset: AssetSource = {
    name,
    category: 'characters',
    size: [WIDTH, HEIGHT],
    anchor: [16, 39],
    frames,
    frameKinds: Object.fromEntries(animationNames.map((animation) => [animation, 'animation'])),
    animationFps: Object.fromEntries(animationNames.map((animation) => [animation, 10])),
    animationLoop: Object.fromEntries(animationNames.map((animation) => [animation, false])),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(source),
    sourcePath: relative(rootPath, source).replaceAll('\\', '/'),
    sourceRegions,
    tags: ['character.modular', 'character.action', 'source.cute_fantasy'],
  };
  await writeFile(resolve(outputRoot, `${name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

console.log(`Extracted ${parts.length} modular character action layers from canonical rows 29-43.`);
