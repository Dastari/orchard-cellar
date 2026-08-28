import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROCEDURAL_TERRAIN_GENERATOR_VERSION,
  proceduralTerrainBiomePreviewRgba,
  sampleProceduralTerrainOverview,
  type ProceduralTerrainFamily,
  type ProceduralTerrainNoiseFields,
  type ProceduralWorldSeed,
  type SemanticTerrainSample,
} from '@orchard/sim';
import { workspaceRoot } from './assets/load.js';
import { encodePng, setPixel } from './assets/png.js';

const MAP_LAYERS = [
  'biome', 'family', 'elevation', 'water',
  'continentalness', 'temperature', 'moisture', 'erosion',
] as const;
type MapLayer = typeof MAP_LAYERS[number];
type Rgba = readonly [number, number, number, number];

const FAMILY_COLORS: Readonly<Record<ProceduralTerrainFamily, Rgba>> = {
  temperate_meadow: [137, 194, 93, 255],
  temperate_woodland: [45, 112, 61, 255],
  temperate_plains: [96, 165, 75, 255],
  temperate_highland: [121, 142, 112, 255],
  snow_highland: [225, 236, 239, 255],
  desert_1: [224, 188, 111, 255],
  desert_2: [203, 151, 76, 255],
  desert_3: [178, 117, 67, 255],
  shroom_green: [62, 137, 91, 255],
  shroom_blue: [70, 99, 158, 255],
  shroom_purple: [137, 74, 157, 255],
  volcanic: [86, 44, 39, 255],
};

const ELEVATION_COLORS: readonly Rgba[] = [
  [77, 139, 70, 255],
  [96, 151, 77, 255],
  [110, 139, 88, 255],
  [115, 116, 104, 255],
  [146, 151, 145, 255],
];

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

function integerOption(name: string, fallback: number): number {
  const source = option(name);
  const value = source === undefined ? fallback : Number(source);
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} must be a safe integer`);
  return value;
}

function positiveIntegerOption(name: string, fallback: number): number {
  const value = integerOption(name, fallback);
  if (value <= 0) throw new Error(`--${name} must be positive`);
  return value;
}

function mapLayer(): MapLayer {
  const source = option('layer') ?? 'biome';
  if (!(MAP_LAYERS as readonly string[]).includes(source)) {
    throw new Error(`--layer must be one of ${MAP_LAYERS.join(', ')}`);
  }
  return source as MapLayer;
}

function seedOption(): ProceduralWorldSeed {
  const source = option('seed') ?? 'orchard-sanctuary-20';
  if (!/^\d+$/u.test(source)) return source;
  const numeric = Number(source);
  if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 0xffff_ffff) {
    throw new Error('--seed must be an unsigned 32-bit integer or legacy text seed');
  }
  return numeric;
}

function waterColor(sample: SemanticTerrainSample): Rgba | null {
  switch (sample.waterKind) {
    case 'ocean': return sample.waterDepth === 2 ? [10, 31, 86, 255] : [22, 69, 137, 255];
    case 'river': return [38, 126, 180, 255];
    case 'lake': return [42, 112, 166, 255];
    case 'pond': return [55, 132, 151, 255];
    case 'waterfall': return [72, 174, 220, 255];
    case 'none': return null;
  }
}

function fieldColor(value: number): Rgba {
  const normalized = Math.max(0, Math.min(1, (value + 32_767) / 65_534));
  const red = Math.round(34 + normalized * 202);
  const green = Math.round(56 + (1 - Math.abs(normalized - 0.5) * 2) * 126);
  const blue = Math.round(210 - normalized * 172);
  return [red, green, blue, 255];
}

function fieldForLayer(fields: ProceduralTerrainNoiseFields, layer: MapLayer): number {
  switch (layer) {
    case 'continentalness': return fields.continentalness;
    case 'temperature': return fields.temperature;
    case 'moisture': return fields.moisture;
    case 'erosion': return fields.erosion;
    default: throw new Error(`Layer ${layer} is not a noise field`);
  }
}

function colorFor(sample: SemanticTerrainSample, layer: MapLayer): Rgba {
  if (layer === 'water') return waterColor(sample) ?? [35, 46, 34, 255];
  if (layer === 'elevation') {
    return waterColor(sample) ?? ELEVATION_COLORS[sample.elevation] ?? ELEVATION_COLORS[0] as Rgba;
  }
  if (layer === 'family') return waterColor(sample) ?? FAMILY_COLORS[sample.terrainFamily];
  if (layer === 'biome') return proceduralTerrainBiomePreviewRgba(sample);
  return fieldColor(fieldForLayer(sample.fields, layer));
}

function countBy<T extends string>(values: readonly T[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

const seed = seedOption();
const generatorVersion = positiveIntegerOption('version', PROCEDURAL_TERRAIN_GENERATOR_VERSION);
const centerX = integerOption('center-x', 0);
const centerY = integerOption('center-y', 0);
const size = positiveIntegerOption('size', 256);
const stepTiles = positiveIntegerOption('step', 16);
const layer = mapLayer();
if (size > 2_048) throw new Error('--size must be at most 2048 pixels');
const minTileX = centerX - Math.floor(size / 2) * stepTiles;
const minTileY = centerY - Math.floor(size / 2) * stepTiles;
const overview = sampleProceduralTerrainOverview({
  seed,
  generatorVersion,
  minTileX,
  minTileY,
  columns: size,
  rows: size,
  stepTiles,
});
const rgba = new Uint8Array(size * size * 4);
for (let index = 0; index < overview.samples.length; index += 1) {
  const sample = overview.samples[index];
  if (sample === undefined) continue;
  setPixel(rgba, size, index % size, Math.floor(index / size), colorFor(sample, layer));
}
const rootPath = fileURLToPath(workspaceRoot);
const outputArgument = option('output') ?? 'packages/assets/review/procedural-seed-map.png';
const outputPath = isAbsolute(outputArgument) ? outputArgument : resolve(rootPath, outputArgument);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, encodePng(size, size, rgba));
const metadataPath = outputPath.replace(/\.png$/i, '') + '.json';
await writeFile(metadataPath, `${JSON.stringify({
  seed,
  normalizedSeed: overview.seed,
  generatorVersion,
  layer,
  centerX,
  centerY,
  minTileX,
  minTileY,
  size,
  stepTiles,
  biomeCounts: countBy(overview.samples.map(({ biome }) => biome)),
  terrainFamilyCounts: countBy(overview.samples.map(({ terrainFamily }) => terrainFamily)),
  waterKindCounts: countBy(overview.samples.map(({ waterKind }) => waterKind)),
}, null, 2)}\n`);
console.log(`Rendered ${layer} seed map to ${outputPath}`);
console.log(`Wrote seed metadata to ${metadataPath}`);
