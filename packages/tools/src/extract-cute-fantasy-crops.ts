import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, PixelGrid } from './assets/types.js';

const TILE_SIZE = 16;
const cropKinds = [
  'wheat', 'tomato', 'carrot', 'turnip', 'corn', 'pumpkin', 'parsley', 'cabbage',
  'cucumber', 'hot_pepper', 'red_pepper', 'yellow_pepper', 'green_pepper',
  'watermelon', 'sunflower', 'garlic', 'potato', 'strawberry', 'beetroot',
  'onion', 'leek', 'grape',
] as const;

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

function assetFromRegions(
  image: DecodedPng,
  name: string,
  category: string,
  source: string,
  regions: readonly (readonly [number, number, number, number])[],
  frameKind: 'state' | 'variant',
  tags: readonly string[],
): AssetSource {
  const nativeFrames = regions.map(([originX, originY, width, height]) => Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => nativeHex(image, originX + x, originY + y))
  )));
  const colors = [...new Set(nativeFrames.flat(2).filter((color): color is string => color !== null))].sort();
  const characters = Object.keys(palette.colors);
  if (colors.length > characters.length) throw new Error(`${name} has too many colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, characters[index]!]));
  const frames: readonly PixelGrid[] = nativeFrames.map((pixels) => pixels.map((row) => row.map((color) => (
    color === null ? '.' : characterByColor.get(color) ?? '.'
  )).join('')));
  return {
    name,
    category,
    size: [regions[0]?.[2] ?? TILE_SIZE, regions[0]?.[3] ?? TILE_SIZE],
    anchor: [
      Math.floor((regions[0]?.[2] ?? TILE_SIZE) / 2),
      (regions[0]?.[3] ?? TILE_SIZE) - 1,
    ],
    frames: { base: frames },
    frameKinds: { base: frameKind },
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(source),
    sourcePath: relative(rootPath, resolve(rootPath, source)).replaceAll('\\', '/'),
    sourceRegions: { base: regions },
    tags,
    placement: { layer: category === 'ui' ? 'ui' : 'object', blocksMovement: false, builderAvailable: false },
    ...(category === 'ui' ? { uiSizing: 'fixed' as const } : {}),
  };
}

async function writeAsset(directory: string, asset: AssetSource): Promise<void> {
  const output = resolve(rootPath, 'packages/assets', directory);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, `${asset.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

const rootPath = fileURLToPath(workspaceRoot);
const palette = await loadPalette();
const primarySource = 'references/Cute_Fantasy/Crops/Crops.png';
const companionSource = 'references/Cute_Fantasy/Crops/Crops_2.png';
const primary = decodePng(await readFile(resolve(rootPath, primarySource)));
const companion = decodePng(await readFile(resolve(rootPath, companionSource)));
if (primary.width !== 112 || primary.height !== 704 || companion.width !== 112 || companion.height !== 256) {
  throw new Error('Unexpected Cute Fantasy crop-sheet dimensions');
}

// Crops_2 is an exact licensed duplicate of the final eight groups in Crops.
// Use it for those groups so both authored sources remain represented without
// introducing duplicated gameplay definitions.
for (const [index, kind] of cropKinds.entries()) {
  const useCompanion = index >= 14;
  const image = useCompanion ? companion : primary;
  const source = useCompanion ? companionSource : primarySource;
  const group = useCompanion ? index - 14 : index;
  const groupY = group * 32;
  const itemY = groupY + 16;
  await writeAsset('crops', assetFromRegions(
    image,
    `crop_cf_${kind}`,
    'crops',
    source,
    [2, 3, 4, 5].map((column) => [column * TILE_SIZE, groupY, TILE_SIZE, TILE_SIZE * 2] as const),
    'variant',
    ['crop.growing', `crop.${kind}`, 'growth.four_stage'],
  ));
  await writeAsset('props', assetFromRegions(
    image,
    `sign_cf_crop_${kind}`,
    'props',
    source,
    [[0, itemY, TILE_SIZE, TILE_SIZE]],
    'state',
    ['prop.crop_sign', `crop.${kind}`],
  ));
  await writeAsset('props', assetFromRegions(
    image,
    `item_cf_${kind}_seeds`,
    'props',
    source,
    [[TILE_SIZE, itemY, TILE_SIZE, TILE_SIZE]],
    'state',
    ['item.seed_packet', `seed.${kind}`],
  ));
  await writeAsset('props', assetFromRegions(
    image,
    `item_cf_crop_${kind}`,
    'props',
    source,
    [[6 * TILE_SIZE, itemY, TILE_SIZE, TILE_SIZE]],
    'state',
    ['item.crop', `crop.${kind}`],
  ));
}

const timerSource = 'references/Cute_Fantasy_UI/UI/Loading_Icon.png';
const timer = decodePng(await readFile(resolve(rootPath, timerSource)));
if (timer.width !== 256 || timer.height !== 64) throw new Error('Unexpected Loading_Icon dimensions');
await writeAsset('ui', assetFromRegions(
  timer,
  'ui_cf_crop_timer',
  'ui',
  timerSource,
  Array.from({ length: 16 }, (_, index) => [index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE] as const),
  'variant',
  ['ui.timer', 'ui.crop_growth', 'ui.loading_icon'],
));

console.log('Extracted 22 crop sets, seed packets, signs, produce icons, and the crop timer.');
