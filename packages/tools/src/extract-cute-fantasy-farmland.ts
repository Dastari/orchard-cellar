import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

const TILE_SIZE = 16;
const SHEET_COLUMNS = 7;
const SHEET_ROWS = 8;
const sources = [
  ['tile_cf_farmland', 'references/Cute_Fantasy/Tiles/FarmLand/FarmLand_Tile.png'],
  ['tile_cf_farmland_wet', 'references/Cute_Fantasy/Tiles/FarmLand/FarmLand_Wet_Tile.png'],
] as const;

function pixel(image: DecodedPng, x: number, y: number): readonly [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [
    image.rgba[offset] ?? 0,
    image.rgba[offset + 1] ?? 0,
    image.rgba[offset + 2] ?? 0,
    image.rgba[offset + 3] ?? 0,
  ];
}

function colorKey(color: readonly number[]): string { return color.join(','); }

function eligibleDiagonalCount(cardinals: number): number {
  const north = (cardinals & 1) !== 0;
  const east = (cardinals & 2) !== 0;
  const south = (cardinals & 4) !== 0;
  const west = (cardinals & 8) !== 0;
  return Number(north && east) + Number(east && south) + Number(south && west) + Number(west && north);
}

function canonicalBlob47Index(cardinals: number, diagonalChoice: number): number {
  let index = diagonalChoice;
  for (let previous = 0; previous < cardinals; previous += 1) {
    index += 1 << eligibleDiagonalCount(previous);
  }
  return index;
}

/** Locate the licensed sheet cells by their actual topology. This avoids
 * coupling runtime frame numbers to the artist's non-canonical 7x8 layout. */
function canonicalSourceRegions(image: DecodedPng): readonly (readonly [number, number, number, number])[] {
  if (image.width !== SHEET_COLUMNS * TILE_SIZE || image.height !== SHEET_ROWS * TILE_SIZE) {
    throw new Error(`Expected a ${SHEET_COLUMNS * TILE_SIZE}x${SHEET_ROWS * TILE_SIZE} farmland sheet`);
  }
  const soilColor = colorKey(pixel(image, 8, 8));
  const soilAt = (gridX: number, gridY: number, x: number, y: number): boolean => (
    colorKey(pixel(image, gridX * TILE_SIZE + x, gridY * TILE_SIZE + y)) === soilColor
  );
  const majority = (values: readonly boolean[]): boolean => values.filter(Boolean).length >= Math.ceil(values.length / 2);
  const regions = new Map<number, readonly [number, number, number, number]>();

  for (let gridY = 0; gridY < SHEET_ROWS; gridY += 1) {
    for (let gridX = 0; gridX < SHEET_COLUMNS; gridX += 1) {
      if (!soilAt(gridX, gridY, 8, 8)) continue;
      const north = majority([6, 7, 8, 9].map((x) => soilAt(gridX, gridY, x, 0)));
      const east = majority([6, 7, 8, 9].map((y) => soilAt(gridX, gridY, 15, y)));
      const south = majority([6, 7, 8, 9].map((x) => soilAt(gridX, gridY, x, 15)));
      const west = majority([6, 7, 8, 9].map((y) => soilAt(gridX, gridY, 0, y)));
      const cardinals = Number(north) | (Number(east) << 1) | (Number(south) << 2) | (Number(west) << 3);
      const quadrantSoil = ([[0, 0], [8, 0], [8, 8], [0, 8]] as const).map(([startX, startY]) => {
        let count = 0;
        for (let y = startY; y < startY + 8; y += 1) {
          for (let x = startX; x < startX + 8; x += 1) count += Number(soilAt(gridX, gridY, x, y));
        }
        return count;
      });
      // A connected diagonal completely fills its 8x8 corner quadrant. The
      // authored inner-corner variants leave at least four pixels cut away.
      const diagonals = [quadrantSoil[1]! >= 60, quadrantSoil[2]! >= 60, quadrantSoil[3]! >= 60, quadrantSoil[0]! >= 60];
      const eligible = [north && east, east && south, south && west, west && north];
      let diagonalChoice = 0;
      let choiceBit = 0;
      for (let diagonal = 0; diagonal < eligible.length; diagonal += 1) {
        if (!eligible[diagonal]) continue;
        if (diagonals[diagonal]) diagonalChoice |= 1 << choiceBit;
        choiceBit += 1;
      }
      const canonical = canonicalBlob47Index(cardinals, diagonalChoice);
      if (regions.has(canonical)) throw new Error(`Duplicate farmland topology ${canonical}`);
      regions.set(canonical, [gridX * TILE_SIZE, gridY * TILE_SIZE, TILE_SIZE, TILE_SIZE]);
    }
  }
  if (regions.size !== 47) throw new Error(`Expected all 47 farmland topologies, found ${regions.size}`);
  return Array.from({ length: 47 }, (_, index) => regions.get(index)!);
}

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const [red, green, blue, alpha] = pixel(image, x, y);
  if (alpha === 0) return null;
  const rgb = [red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

const rootPath = fileURLToPath(workspaceRoot);
const outputRoot = resolve(rootPath, 'packages/assets/tiles');
const palette = await loadPalette();
const paletteCharacters = Object.keys(palette.colors);
for (const [name, source] of sources) {
  const image = decodePng(await readFile(resolve(rootPath, source)));
  const regions = canonicalSourceRegions(image);
  const nativeFrames = regions.map(([originX, originY]) => Array.from({ length: TILE_SIZE }, (_, y) => (
    Array.from({ length: TILE_SIZE }, (_, x) => nativeHex(image, originX + x, originY + y))
  )));
  const colors = [...new Set(nativeFrames.flat(2).filter((color): color is string => color !== null))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${name} has too many colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = nativeFrames.map((pixels) => pixels.map((row) => row.map((color) => (
    color === null ? '.' : characterByColor.get(color) ?? '.'
  )).join('')));
  const asset: AssetSource = {
    name,
    category: 'tiles',
    size: [TILE_SIZE, TILE_SIZE],
    anchor: [8, 15],
    frames: { base: frames },
    frameKinds: { base: 'variant' },
    variantTopologies: { base: 'blob47' },
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(source),
    sourcePath: relative(rootPath, resolve(rootPath, source)).replaceAll('\\', '/'),
    sourceRegions: { base: regions },
    tags: ['terrain.farmland', name.endsWith('_wet') ? 'soil.wet' : 'soil.dry', 'topology.blob47'],
    placement: { layer: 'ground', blocksMovement: false, builderAvailable: false },
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, `${name}.tile.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

// The transparent companion to the grass/path blob sheet has exactly the
// authored fringe needed around farmland, but its brown cliff ramp obscures
// the farm sheet's light inner path. Reuse its canonical frames with a farming
// palette: green, dark-green outline, light path, then a soft soil shadow.
const grassBlendSourcePath = resolve(outputRoot, 'tile_cf_grass_dirt_cliff_edge.tile.json');
const grassBlendSource = JSON.parse(await readFile(grassBlendSourcePath, 'utf8')) as AssetSource;
const grassBlend: AssetSource = {
  ...grassBlendSource,
  name: 'tile_cf_farmland_grass_inset',
  sourcePalette: {
    '0': '#3e8948',
    '1': '#265c42',
    '2': '#e4a672',
    '3': '#00000028',
    '4': '#e4a672',
  },
  tags: ['terrain.farmland', 'transition.grass_inset', 'topology.blob47'],
  placement: { layer: 'ground', blocksMovement: false, builderAvailable: false },
};
await writeFile(
  resolve(outputRoot, `${grassBlend.name}.tile.json`),
  `${JSON.stringify(grassBlend, null, 2)}\n`,
);

const savannaGrassBlend: AssetSource = {
  ...grassBlendSource,
  name: 'tile_cf_savanna_grass_inset',
  sourcePalette: {
    '0': '#3e8948',
    '1': '#265c42',
    '2': '#7d8542',
    '3': '#00000028',
    '4': '#7d8542',
  },
  tags: ['terrain.savanna', 'transition.grass_inset', 'topology.blob47'],
  placement: { layer: 'ground', blocksMovement: false, builderAvailable: false },
};
await writeFile(
  resolve(outputRoot, `${savannaGrassBlend.name}.tile.json`),
  `${JSON.stringify(savannaGrassBlend, null, 2)}\n`,
);

console.log('Extracted canonical dry, wet, grass-inset, and savanna-inset Cute Fantasy tiles.');
