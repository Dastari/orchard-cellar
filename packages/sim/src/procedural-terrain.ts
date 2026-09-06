import { PROCEDURAL_WORLD_CHUNK_TILES } from "./balance.js";
import {
  chunkLocalToTile,
  chunkTileBounds,
  signedTileKey,
} from "./world-coordinates.js";

export const PROCEDURAL_TERRAIN_GENERATOR_VERSION = 7;
export const PROCEDURAL_TERRAIN_HALO_TILES = 4;
/** Highest logical terrain plane emitted by the current semantic generator.
 * Presentation code uses this to keep projected cliff faces inside sampled
 * terrain instead of accidentally composing against an unsampled void. */
/** Preview-generator shaping budget. Published/authored maps still use the
 * wider TERRAIN_ELEVATION_LIMIT; four keeps v1 noise terraces legible. */
export const PROCEDURAL_TERRAIN_MAX_ELEVATION = 4;

export const PROCEDURAL_TERRAIN_BIOMES = [
  "ocean",
  "coast",
  "plains",
  "meadow",
  "woodland",
  "wetland",
  "savanna",
  "desert",
  "highland",
  "cold_highland",
  "mountain",
  "shroomlands",
  "volcanic",
] as const;
export type ProceduralTerrainBiome = (typeof PROCEDURAL_TERRAIN_BIOMES)[number];

export const PROCEDURAL_TERRAIN_SURFACES = [
  "deep_water",
  "water",
  "sand",
  "grass",
  "dry_grass",
  "mud",
  "stone",
  "cold_grass",
  "shroom_grass",
  "volcanic_rock",
] as const;
export type ProceduralTerrainSurface =
  (typeof PROCEDURAL_TERRAIN_SURFACES)[number];

/** A terrain family selects a complete compatible ground/water/cliff role set.
 * Exact atlas frames remain an asset/theme concern rather than generator data. */
export const PROCEDURAL_TERRAIN_FAMILIES = [
  "temperate_meadow",
  "temperate_woodland",
  "temperate_plains",
  "temperate_highland",
  "desert_1",
  "desert_2",
  "desert_3",
  "shroom_green",
  "shroom_blue",
  "shroom_purple",
  "volcanic",
  // Appended so v1 checksum ordinals remain stable.
  "snow_highland",
] as const;
export type ProceduralTerrainFamily =
  (typeof PROCEDURAL_TERRAIN_FAMILIES)[number];

export const PROCEDURAL_SHORE_FAMILIES = [
  "beach",
  "desert_beach_1",
  "desert_beach_2",
  "desert_beach_3",
  "shroomlands",
  "volcanic",
] as const;
export type ProceduralShoreFamily = (typeof PROCEDURAL_SHORE_FAMILIES)[number];

export const PROCEDURAL_CLIFF_FAMILIES = [
  "temperate_stone",
  "desert_cliff_1",
  "desert_cliff_2",
  "desert_cliff_3",
  "shroomlands",
  "volcanic",
] as const;
export type ProceduralCliffFamily = (typeof PROCEDURAL_CLIFF_FAMILIES)[number];

export const PROCEDURAL_WATER_KINDS = [
  "none",
  "ocean",
  "river",
  "lake",
  "pond",
  "waterfall",
] as const;
export type ProceduralWaterKind = (typeof PROCEDURAL_WATER_KINDS)[number];

export const TERRAIN_NEIGHBOR_BITS = {
  north: 1,
  north_east: 2,
  east: 4,
  south_east: 8,
  south: 16,
  south_west: 32,
  west: 64,
  north_west: 128,
} as const;

export type TerrainCardinalDirection = "north" | "east" | "south" | "west";
export type ProceduralWorldSeed = number | string;

export interface ProceduralTerrainNoiseFields {
  /** Quantized signed fields in `[-32767, 32767]` for stable parity/debugging. */
  readonly continentalness: number;
  readonly erosion: number;
  readonly peaksValleys: number;
  readonly temperature: number;
  readonly moisture: number;
  readonly river: number;
  readonly lakeBasin: number;
  readonly pondBasin: number;
  readonly strangeness: number;
  readonly volcanism: number;
}

export interface SemanticTerrainSample {
  readonly tileX: number;
  readonly tileY: number;
  readonly biome: ProceduralTerrainBiome;
  readonly surface: ProceduralTerrainSurface;
  readonly terrainFamily: ProceduralTerrainFamily;
  readonly shoreFamily: ProceduralShoreFamily;
  readonly cliffFamily: ProceduralCliffFamily;
  readonly waterKind: ProceduralWaterKind;
  readonly waterDepth: 0 | 1 | 2;
  readonly elevation: number;
  readonly fields: ProceduralTerrainNoiseFields;
}

export type ProceduralTerrainPreviewRgba = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

/** Shared semantic-map palette. Keep editor overview pixels and generated
 * review maps visually identical without coupling the pure generator to a
 * browser canvas or an asset atlas. */
export const PROCEDURAL_TERRAIN_BIOME_PREVIEW_COLORS: Readonly<
  Record<ProceduralTerrainBiome, ProceduralTerrainPreviewRgba>
> = {
  ocean: [18, 52, 113, 255],
  coast: [226, 206, 132, 255],
  plains: [104, 170, 79, 255],
  meadow: [133, 190, 91, 255],
  woodland: [45, 112, 61, 255],
  wetland: [72, 111, 79, 255],
  savanna: [178, 165, 75, 255],
  desert: [218, 171, 87, 255],
  highland: [98, 137, 91, 255],
  cold_highland: [225, 236, 239, 255],
  mountain: [104, 103, 105, 255],
  shroomlands: [137, 74, 157, 255],
  volcanic: [80, 47, 43, 255],
};

export function proceduralTerrainBiomePreviewRgba(
  sample: Pick<SemanticTerrainSample, "biome" | "waterKind" | "waterDepth">,
): ProceduralTerrainPreviewRgba {
  switch (sample.waterKind) {
    case "ocean":
      return sample.waterDepth === 2 ? [10, 31, 86, 255] : [22, 69, 137, 255];
    case "river":
      return [38, 126, 180, 255];
    case "lake":
      return [42, 112, 166, 255];
    case "pond":
      return [55, 132, 151, 255];
    case "waterfall":
      return [72, 174, 220, 255];
    case "none":
      return PROCEDURAL_TERRAIN_BIOME_PREVIEW_COLORS[sample.biome];
  }
}

export interface TerrainCardinalRelation {
  readonly direction: TerrainCardinalDirection;
  readonly neighborBiome: ProceduralTerrainBiome;
  readonly neighborSurface: ProceduralTerrainSurface;
  readonly neighborTerrainFamily: ProceduralTerrainFamily;
  readonly neighborWaterKind: ProceduralWaterKind;
  readonly elevationDelta: number;
  readonly surfaceChanges: boolean;
  readonly biomeChanges: boolean;
  readonly terrainFamilyChanges: boolean;
  readonly shoreline: boolean;
}

export interface SemanticTerrainAdjacency {
  readonly sameSurfaceMask: number;
  readonly sameBiomeMask: number;
  readonly sameTerrainFamilyMask: number;
  readonly waterMask: number;
  readonly riverMask: number;
  readonly higherElevationMask: number;
  readonly lowerElevationMask: number;
  readonly shorelineMask: number;
  readonly cardinal: readonly TerrainCardinalRelation[];
}

export interface SemanticTerrainCell extends SemanticTerrainSample {
  readonly adjacency: SemanticTerrainAdjacency;
}

export interface SemanticTerrainChunk {
  readonly seed: number;
  readonly generatorVersion: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly minTileX: number;
  readonly minTileY: number;
  readonly width: typeof PROCEDURAL_WORLD_CHUNK_TILES;
  readonly height: typeof PROCEDURAL_WORLD_CHUNK_TILES;
  readonly halo: number;
  readonly apronMinTileX: number;
  readonly apronMinTileY: number;
  readonly apronWidth: number;
  readonly apronHeight: number;
  readonly apron: readonly SemanticTerrainSample[];
  readonly cells: readonly SemanticTerrainCell[];
  readonly checksum: string;
}

export interface TerrainChunkSampleOptions {
  readonly seed: ProceduralWorldSeed;
  readonly generatorVersion?: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly halo?: number;
}

export interface TerrainOverviewOptions {
  readonly seed: ProceduralWorldSeed;
  readonly generatorVersion?: number;
  readonly minTileX: number;
  readonly minTileY: number;
  readonly columns: number;
  readonly rows: number;
  readonly stepTiles: number;
}

export interface TerrainOverview {
  readonly seed: number;
  readonly generatorVersion: number;
  readonly minTileX: number;
  readonly minTileY: number;
  readonly columns: number;
  readonly rows: number;
  readonly stepTiles: number;
  readonly samples: readonly SemanticTerrainSample[];
}

interface FloatTerrainFields {
  readonly continentalness: number;
  readonly erosion: number;
  readonly peaksValleys: number;
  readonly temperature: number;
  readonly moisture: number;
  readonly river: number;
  readonly lakeBasin: number;
  readonly pondBasin: number;
  readonly strangeness: number;
  readonly volcanism: number;
  readonly height: number;
}

interface NeighborDefinition {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly bit: number;
}

const NEIGHBORS: readonly NeighborDefinition[] = [
  { deltaX: 0, deltaY: -1, bit: TERRAIN_NEIGHBOR_BITS.north },
  { deltaX: 1, deltaY: -1, bit: TERRAIN_NEIGHBOR_BITS.north_east },
  { deltaX: 1, deltaY: 0, bit: TERRAIN_NEIGHBOR_BITS.east },
  { deltaX: 1, deltaY: 1, bit: TERRAIN_NEIGHBOR_BITS.south_east },
  { deltaX: 0, deltaY: 1, bit: TERRAIN_NEIGHBOR_BITS.south },
  { deltaX: -1, deltaY: 1, bit: TERRAIN_NEIGHBOR_BITS.south_west },
  { deltaX: -1, deltaY: 0, bit: TERRAIN_NEIGHBOR_BITS.west },
  { deltaX: -1, deltaY: -1, bit: TERRAIN_NEIGHBOR_BITS.north_west },
];

const CARDINAL_NEIGHBORS: readonly (NeighborDefinition & {
  readonly direction: TerrainCardinalDirection;
})[] = [
  {
    direction: "north",
    deltaX: 0,
    deltaY: -1,
    bit: TERRAIN_NEIGHBOR_BITS.north,
  },
  { direction: "east", deltaX: 1, deltaY: 0, bit: TERRAIN_NEIGHBOR_BITS.east },
  {
    direction: "south",
    deltaX: 0,
    deltaY: 1,
    bit: TERRAIN_NEIGHBOR_BITS.south,
  },
  { direction: "west", deltaX: -1, deltaY: 0, bit: TERRAIN_NEIGHBOR_BITS.west },
];

const NOISE_QUANTIZATION = 32_767;
const LEGACY_SEA_LEVEL = -0.08;
const PHASE_A_SEA_LEVEL = 0.18;

function seaLevel(generatorVersion: number): number {
  return generatorVersion >= 7 ? PHASE_A_SEA_LEVEL : LEGACY_SEA_LEVEL;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function requireSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value))
    throw new Error(`${label} must be a safe integer`);
}

function requirePositiveInteger(value: number, label: string): void {
  requireSafeInteger(value, label);
  if (value <= 0) throw new Error(`${label} must be positive`);
}

function avalanche(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function normalizeProceduralWorldSeed(
  seed: ProceduralWorldSeed,
): number {
  if (typeof seed === "number") {
    requireSafeInteger(seed, "seed");
    return avalanche(seed);
  }
  if (seed.length === 0) throw new Error("seed string must not be empty");
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return avalanche(hash);
}

function generatorSeed(seed: number, generatorVersion: number): number {
  // V4-V6 are semantic corrections over V3's reviewed world. Reuse the V3
  // field seed so upgrading changes river presentation only, rather than
  // replacing every continent, biome, elevation, and centreline.
  const fieldVersion = generatorVersion >= 4 && generatorVersion <= 6
    ? 3
    : generatorVersion;
  return avalanche(seed ^ Math.imul(fieldVersion, 0x9e3779b1));
}

function coordinateHash(
  seed: number,
  gridX: number,
  gridY: number,
  salt: number,
): number {
  let hash = avalanche(seed ^ salt);
  hash = avalanche(hash ^ Math.imul(gridX, 0x8da6b343));
  return avalanche(hash ^ Math.imul(gridY, 0xd8163841));
}

function latticeValue(
  seed: number,
  gridX: number,
  gridY: number,
  salt: number,
): number {
  return (coordinateHash(seed, gridX, gridY, salt) / 0xffff_ffff) * 2 - 1;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function interpolate(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function valueNoise(
  seed: number,
  tileX: number,
  tileY: number,
  period: number,
  salt: number,
): number {
  const gridX = Math.floor(tileX / period);
  const gridY = Math.floor(tileY / period);
  const localX = smooth(tileX / period - gridX);
  const localY = smooth(tileY / period - gridY);
  const north = interpolate(
    latticeValue(seed, gridX, gridY, salt),
    latticeValue(seed, gridX + 1, gridY, salt),
    localX,
  );
  const south = interpolate(
    latticeValue(seed, gridX, gridY + 1, salt),
    latticeValue(seed, gridX + 1, gridY + 1, salt),
    localX,
  );
  return interpolate(north, south, localY);
}

function fractalNoise(
  seed: number,
  tileX: number,
  tileY: number,
  periods: readonly number[],
  salt: number,
): number {
  let total = 0;
  let weight = 1;
  let weightTotal = 0;
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    if (period === undefined) continue;
    total +=
      valueNoise(seed, tileX, tileY, period, salt + index * 0x1f123bb5) *
      weight;
    weightTotal += weight;
    weight *= 0.5;
  }
  return total / weightTotal;
}

function quantizeNoise(value: number): number {
  return Math.round(clamp(value, -1, 1) * NOISE_QUANTIZATION);
}

function warpedTerrainPoint(
  seed: number,
  tileX: number,
  tileY: number,
  generatorVersion: number,
): readonly [number, number] {
  const phaseA = generatorVersion >= 7;
  const warpPeriod = phaseA ? 320 : 1_024;
  const warpStrength = phaseA ? 36 : 112;
  const warpX = valueNoise(seed, tileX, tileY, warpPeriod, 0x14c4e7a1) * warpStrength;
  const warpY = valueNoise(seed, tileX, tileY, warpPeriod, 0x39d0f5c7) * warpStrength;
  return [tileX + warpX, tileY + warpY];
}

function riverNoiseAt(seed: number, tileX: number, tileY: number, generatorVersion: number): number {
  const [warpedX, warpedY] = warpedTerrainPoint(seed, tileX, tileY, generatorVersion);
  return fractalNoise(
    seed, warpedX, warpedY,
    generatorVersion >= 7 ? [120, 60, 30] : [384, 192, 96],
    0x4b73a265,
  );
}

function floatTerrainFields(
  seed: number,
  generatorVersion: number,
  tileX: number,
  tileY: number,
): FloatTerrainFields {
  const phaseA = generatorVersion >= 7;
  const [warpedX, warpedY] = warpedTerrainPoint(seed, tileX, tileY, generatorVersion);
  const continentalness = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [640, 320, 160, 80] : [2_048, 1_024, 512, 256],
    0x5c81b117,
  );
  const erosion = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [240, 120, 60] : [768, 384, 192],
    0x238bd911,
  );
  const ridgeSource = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [160, 80, 40] : [512, 256, 128],
    0x6fa920d3,
  );
  const peaksValleys = 1 - Math.abs(ridgeSource) * 2;
  const detail = fractalNoise(seed, tileX, tileY, phaseA ? [48, 24, 12] : [160, 80, 40], 0x31dacf55);
  const rawTemperature = fractalNoise(
    seed,
    tileX,
    tileY,
    phaseA ? [480, 240, 120] : [1_536, 768, 384],
    0x7ec59a3d,
  );
  const latitudeCooling = clamp(Math.abs(tileY) / 32_000, 0, 1) * 0.7;
  const temperature = clamp(rawTemperature - latitudeCooling, -1, 1);
  const moisture = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [320, 160, 80] : [1_024, 512, 256],
    0x19f41e87,
  );
  const river = riverNoiseAt(seed, tileX, tileY, generatorVersion);
  const lakeBasin = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [64, 32, 16] : [192, 96, 48],
    0x25c67fd1,
  );
  const pondBasin = fractalNoise(seed, tileX, tileY, phaseA ? [28, 14, 7] : [56, 28, 14], 0x731ad4b9);
  const strangeness = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [280, 140, 70] : [896, 448, 224],
    0x4e61c29b,
  );
  const volcanism = fractalNoise(
    seed,
    warpedX,
    warpedY,
    phaseA ? [400, 200, 100] : [1_280, 640, 320],
    0x69b2d40f,
  );
  const height = clamp(
    continentalness * 0.78 +
      peaksValleys * 0.22 -
      erosion * 0.14 +
      detail * (phaseA ? 0.16 : 0.09),
    -1,
    1,
  );
  return {
    continentalness,
    erosion,
    peaksValleys,
    temperature,
    moisture,
    river,
    lakeBasin,
    pondBasin,
    strangeness,
    volcanism,
    height,
  };
}

function quantizedFields(
  fields: FloatTerrainFields,
): ProceduralTerrainNoiseFields {
  return {
    continentalness: quantizeNoise(fields.continentalness),
    erosion: quantizeNoise(fields.erosion),
    peaksValleys: quantizeNoise(fields.peaksValleys),
    temperature: quantizeNoise(fields.temperature),
    moisture: quantizeNoise(fields.moisture),
    river: quantizeNoise(fields.river),
    lakeBasin: quantizeNoise(fields.lakeBasin),
    pondBasin: quantizeNoise(fields.pondBasin),
    strangeness: quantizeNoise(fields.strangeness),
    volcanism: quantizeNoise(fields.volcanism),
  };
}

function logicalElevation(height: number, generatorVersion: number): number {
  const sea = seaLevel(generatorVersion);
  const step = generatorVersion >= 7 ? 0.13 : 0.18;
  if (height < sea + step) return 0;
  if (height < sea + step * 2) return 1;
  if (height < sea + step * 3) return 2;
  if (height < sea + step * 4) return 3;
  return PROCEDURAL_TERRAIN_MAX_ELEVATION;
}

function inlandWaterKind(
  fields: FloatTerrainFields,
  elevation: number,
  generatorVersion: number,
  minimumWidthRiver: boolean,
): ProceduralWaterKind {
  const sea = seaLevel(generatorVersion);
  const inland = fields.height >= sea + (generatorVersion >= 7 ? 0 : 0.055);
  if (!inland || elevation > (generatorVersion >= 7 ? 4 : 2)) return "none";
  const lake =
    fields.lakeBasin > (generatorVersion >= 7 ? 0.54 : 0.48)
    && fields.moisture > -0.2 && fields.erosion > -0.45;
  if (lake) return "lake";
  // V1's field threshold produced channels around 14–15 walk tiles wide in
  // ordinary editor views. V2 keeps the same continuous scalar-field path but
  // narrows minor rivers to a 2–3 tile gameplay scale. Keep the legacy branch
  // so already-pinned generator documents remain byte reproducible.
  const river =
    generatorVersion >= 3
      ? minimumWidthRiver
      : Math.abs(fields.river) <
        (generatorVersion <= 1
          ? 0.022 + clamp((fields.moisture + 1) * 0.006, 0, 0.012)
          : 0.0024 + clamp((fields.moisture + 1) * 0.0004, 0, 0.0008));
  if (river && (generatorVersion >= 7 || fields.moisture > -0.55)) return "river";
  const pond =
    fields.pondBasin > (generatorVersion >= 7 ? 0.62 : 0.69) &&
    fields.moisture > -0.05 &&
    fields.height < sea + (generatorVersion >= 7 ? 0.65 : 0.38);
  return pond ? "pond" : "none";
}

export const PROCEDURAL_BIOME_TABLE = [
  ['plains', 'meadow', 'woodland', 'woodland', 'wetland'],
  ['plains', 'meadow', 'meadow', 'woodland', 'wetland'],
  ['plains', 'meadow', 'woodland', 'woodland', 'wetland'],
  ['savanna', 'savanna', 'meadow', 'woodland', 'wetland'],
  ['desert', 'savanna', 'savanna', 'woodland', 'wetland'],
] as const satisfies readonly (readonly ProceduralTerrainBiome[])[];

// Empirical quintiles from five disjoint 384x384 v7 windows using the
// orchard-sanctuary-20 review seed. The octave sum is strongly centre-heavy,
// so uniform [-1, 1] bins made the outer table rows/columns effectively
// unreachable (and eliminated desert entirely).
export const V7_TEMPERATURE_QUANTILE_EDGES = [-0.19, -0.05, 0.06, 0.28] as const;
export const V7_MOISTURE_QUANTILE_EDGES = [-0.21, -0.07, 0, 0.09] as const;
const V7_TABLE_BIOMES = new Set<ProceduralTerrainBiome>(PROCEDURAL_BIOME_TABLE.flat());

function quantileBin(value: number, edges: readonly number[]): number {
  const index = edges.findIndex((edge) => value < edge);
  return index < 0 ? edges.length : index;
}

function v7TableBiome(fields: FloatTerrainFields): ProceduralTerrainBiome {
  return PROCEDURAL_BIOME_TABLE[
    quantileBin(fields.temperature, V7_TEMPERATURE_QUANTILE_EDGES)
  ]![quantileBin(fields.moisture, V7_MOISTURE_QUANTILE_EDGES)]!;
}

function regularizedV7TableBiome(
  tileX: number,
  tileY: number,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields,
): ProceduralTerrainBiome {
  const current = v7TableBiome(fieldsAt(tileX, tileY));
  const counts = new Map<ProceduralTerrainBiome, number>();
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const candidate = v7TableBiome(fieldsAt(tileX + offsetX, tileY + offsetY));
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
  }
  // A cell must have at least two same-biome neighbours in its 3x3 region.
  // Otherwise use the local modal region. This is a bounded, coordinate-pure
  // minimum-region pass; unlike an iterative flood fill it cannot vary by
  // chunk entry point.
  if ((counts.get(current) ?? 0) >= 3) return current;
  let replacement = current;
  let replacementCount = 0;
  for (const [candidate, count] of counts) {
    if (count > replacementCount) {
      replacement = candidate;
      replacementCount = count;
    }
  }
  return replacement;
}

type V7SpecialBiome = 'shroomlands' | 'volcanic';

function v7SpecialBiome(
  fields: FloatTerrainFields,
  elevation: number,
): V7SpecialBiome | null {
  if (fields.volcanism > 0.66 && elevation >= 1 && fields.peaksValleys > 0.1) {
    return 'volcanic';
  }
  if (fields.strangeness > 0.67 && fields.moisture > 0.08 && fields.temperature > -0.5) {
    return 'shroomlands';
  }
  return null;
}

function legalV7BiomePair(
  left: ProceduralTerrainBiome,
  right: ProceduralTerrainBiome,
): boolean {
  const pair = [left, right].sort().join(':');
  return pair !== 'desert:wetland'
    && pair !== 'desert:shroomlands'
    && pair !== 'volcanic:wetland';
}

function supportedV7SpecialBiome(
  special: V7SpecialBiome,
  tileX: number,
  tileY: number,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields,
): boolean {
  let support = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const candidateFields = fieldsAt(tileX + offsetX, tileY + offsetY);
      const candidateElevation = logicalElevation(candidateFields.height, 7);
      if (v7SpecialBiome(candidateFields, candidateElevation) === special) support += 1;
    }
  }
  if (support < 3) return false;

  // Specials are an overlay on the quantized table. Check the regularized
  // table under the cell and all four neighbours so the if-chain cannot
  // introduce an adjacency that the table itself forbids.
  return [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]].every(([offsetX, offsetY]) => (
    legalV7BiomePair(
      special,
      regularizedV7TableBiome(tileX + offsetX!, tileY + offsetY!, fieldsAt),
    )
  ));
}

function v7OceanAt(
  tileX: number,
  tileY: number,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields,
): boolean {
  const sea = seaLevel(7);
  return [-1, 0, 1].some((offsetY) => [-1, 0, 1].some((offsetX) => (
    fieldsAt(tileX + offsetX, tileY + offsetY).height < sea
  )));
}

function v7CoastAt(
  tileX: number,
  tileY: number,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields,
): boolean {
  if (v7OceanAt(tileX, tileY, fieldsAt)) return false;
  const fields = fieldsAt(tileX, tileY);
  const gradientX = (
    fieldsAt(tileX + 1, tileY).height - fieldsAt(tileX - 1, tileY).height
  ) / 2;
  const gradientY = (
    fieldsAt(tileX, tileY + 1).height - fieldsAt(tileX, tileY - 1).height
  ) / 2;
  const gradient = Math.max(0.000_001, Math.hypot(gradientX, gradientY));
  if ((fields.height - seaLevel(7)) / gradient > 3.5) return false;
  for (let offsetY = -3; offsetY <= 3; offsetY += 1) {
    for (let offsetX = -3 + Math.abs(offsetY); offsetX <= 3 - Math.abs(offsetY); offsetX += 1) {
      if (fieldsAt(tileX + offsetX, tileY + offsetY).height < seaLevel(7)) return true;
    }
  }
  return false;
}

function visibleV7BiomeCandidate(
  tileX: number,
  tileY: number,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields,
): ProceduralTerrainBiome {
  if (v7OceanAt(tileX, tileY, fieldsAt)) return 'ocean';
  if (v7CoastAt(tileX, tileY, fieldsAt)) return 'coast';
  const fields = fieldsAt(tileX, tileY);
  const elevation = logicalElevation(fields.height, 7);
  const special = v7SpecialBiome(fields, elevation);
  if (special) return special;
  if (elevation >= 4 || (elevation >= 3 && fields.temperature < -0.35)) return 'cold_highland';
  if (elevation >= 3) return 'mountain';
  if (elevation >= 2) return 'highland';
  return regularizedV7TableBiome(tileX, tileY, fieldsAt);
}

function visibleRegionV7TableBiome(
  tileX: number,
  tileY: number,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields,
): ProceduralTerrainBiome {
  const current = regularizedV7TableBiome(tileX, tileY, fieldsAt);
  const counts = new Map<ProceduralTerrainBiome, number>();
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const candidate = visibleV7BiomeCandidate(tileX + offsetX, tileY + offsetY, fieldsAt);
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
  }
  // Coast/elevation masks can clip an otherwise healthy underlying table
  // region down to one visible cell. Keep the cell only when it has a visible
  // same-biome peer; otherwise join the most common legal neighbouring region.
  if ((counts.get(current) ?? 0) > 0) return current;
  let replacement: ProceduralTerrainBiome = current;
  let replacementCount = 0;
  for (const [candidate, count] of counts) {
    if ((candidate === 'ocean' || candidate === 'coast' || V7_TABLE_BIOMES.has(candidate))
      && legalV7BiomePair(current, candidate)
      && count > replacementCount) {
      replacement = candidate === 'ocean' ? 'coast' : candidate;
      replacementCount = count;
    }
  }
  return replacement;
}

function landBiome(
  fields: FloatTerrainFields,
  elevation: number,
  generatorVersion: number,
  coast: boolean,
  tileX = 0,
  tileY = 0,
  fieldsAt: (tileX: number, tileY: number) => FloatTerrainFields = () => fields,
): ProceduralTerrainBiome {
  if (coast) return "coast";
  if (generatorVersion >= 7) {
    const special = v7SpecialBiome(fields, elevation);
    if (special && supportedV7SpecialBiome(special, tileX, tileY, fieldsAt)) return special;
  } else {
    if (fields.volcanism > 0.66 && elevation >= 1 && fields.peaksValleys > 0.1)
      return "volcanic";
    if (
      fields.strangeness > 0.67 &&
      fields.moisture > 0.08 &&
      fields.temperature > -0.5
    ) {
      return "shroomlands";
    }
  }
  if (elevation >= 4 || (elevation >= 3 && fields.temperature < -0.35))
    return "cold_highland";
  if (elevation >= 3) return "mountain";
  if (elevation >= 2) return "highland";
  if (generatorVersion >= 7) {
    return visibleRegionV7TableBiome(tileX, tileY, fieldsAt);
  }
  if (fields.moisture > 0.52 && elevation === 0) return "wetland";
  if (fields.temperature > 0.34 && fields.moisture < -0.18) return "desert";
  if (fields.temperature > 0.2 && fields.moisture < 0.08) return "savanna";
  if (fields.moisture > 0.18) return "woodland";
  if (fields.moisture > -0.04) return "meadow";
  return "plains";
}

function surfaceForBiome(
  biome: ProceduralTerrainBiome,
  waterKind: ProceduralWaterKind,
  deepOcean: boolean,
): ProceduralTerrainSurface {
  if (waterKind !== "none") return deepOcean ? "deep_water" : "water";
  switch (biome) {
    case "ocean":
      return deepOcean ? "deep_water" : "water";
    case "coast":
    case "desert":
      return "sand";
    case "savanna":
      return "dry_grass";
    case "wetland":
      return "mud";
    case "mountain":
      return "stone";
    case "cold_highland":
      return "cold_grass";
    case "shroomlands":
      return "shroom_grass";
    case "volcanic":
      return "volcanic_rock";
    case "plains":
    case "meadow":
    case "woodland":
    case "highland":
      return "grass";
  }
}

function desertVariant(fields: FloatTerrainFields): 1 | 2 | 3 {
  if (fields.erosion < -0.2) return 1;
  if (fields.peaksValleys > 0.25) return 3;
  return 2;
}

function shroomVariant(fields: FloatTerrainFields): ProceduralTerrainFamily {
  if (fields.pondBasin < -0.2) return "shroom_blue";
  if (fields.pondBasin > 0.2) return "shroom_purple";
  return "shroom_green";
}

function temperateFamily(
  biome: ProceduralTerrainBiome,
  fields: FloatTerrainFields,
  elevation: number,
  generatorVersion: number,
): ProceduralTerrainFamily {
  if (generatorVersion >= 2 && biome === "cold_highland")
    return "snow_highland";
  if (
    elevation >= 2 ||
    fields.temperature < -0.3 ||
    fields.moisture < -0.48 ||
    biome === "highland" ||
    biome === "cold_highland" ||
    biome === "mountain"
  ) {
    return "temperate_highland";
  }
  if (biome === "woodland" || biome === "wetland" || fields.moisture > 0.3) {
    return "temperate_woodland";
  }
  if (biome === "meadow" || fields.moisture > 0.02) return "temperate_meadow";
  return "temperate_plains";
}

function terrainFamilyFor(
  biome: ProceduralTerrainBiome,
  fields: FloatTerrainFields,
  elevation: number,
  generatorVersion: number,
): ProceduralTerrainFamily {
  if (biome === "volcanic") return "volcanic";
  if (biome === "shroomlands") return shroomVariant(fields);
  if (biome === "desert") return `desert_${desertVariant(fields)}`;
  return temperateFamily(biome, fields, elevation, generatorVersion);
}

function shoreFamilyFor(
  biome: ProceduralTerrainBiome,
  fields: FloatTerrainFields,
): ProceduralShoreFamily {
  if (biome === "volcanic") return "volcanic";
  if (biome === "shroomlands") return "shroomlands";
  if (biome === "desert") return `desert_beach_${desertVariant(fields)}`;
  return "beach";
}

function cliffFamilyFor(
  biome: ProceduralTerrainBiome,
  fields: FloatTerrainFields,
): ProceduralCliffFamily {
  if (biome === "volcanic") return "volcanic";
  if (biome === "shroomlands") return "shroomlands";
  if (biome === "desert") return `desert_cliff_${desertVariant(fields)}`;
  return "temperate_stone";
}

function sampleBaseWithGeneratorSeed(
  seed: number,
  generatorVersion: number,
  tileX: number,
  tileY: number,
  fieldsAt: (
    tileX: number,
    tileY: number,
  ) => FloatTerrainFields = (x, y) => floatTerrainFields(seed, generatorVersion, x, y),
): SemanticTerrainSample {
  const sea = seaLevel(generatorVersion);
  const fields = fieldsAt(tileX, tileY);
  let ocean = fields.height < sea;
  if (generatorVersion >= 7) ocean = v7OceanAt(tileX, tileY, fieldsAt);
  const elevation = ocean ? 0 : logicalElevation(fields.height, generatorVersion);
  // V3 measures the signed scalar field in tile space. A raw field threshold
  // has a screen-space width proportional to the local gradient, so diagonal
  // bends could collapse to a single tile. Dividing by that gradient gives a
  // stable approximate distance from the river centreline. V4 expands the
  // half-width beyond sqrt(2), preventing a diagonal raster turn from pinching
  // to bank art with no readable water core while retaining V3 byte-for-byte.
  let minimumWidthRiver = false;
  if (!ocean && elevation <= (generatorVersion >= 7 ? 4 : 2) && generatorVersion >= 3) {
    const gradientX =
      (fieldsAt(tileX + 1, tileY).river -
        fieldsAt(tileX - 1, tileY).river) /
      2;
    const gradientY =
      (fieldsAt(tileX, tileY + 1).river -
        fieldsAt(tileX, tileY - 1).river) /
      2;
    const gradient = Math.max(0.000_001, Math.hypot(gradientX, gradientY));
    const halfWidthTiles = generatorVersion >= 4 ? 1.45 : 1.1;
    minimumWidthRiver = Math.abs(fields.river) / gradient <= halfWidthTiles;
  }
  let waterKind = ocean
    ? "ocean"
    : inlandWaterKind(fields, elevation, generatorVersion, minimumWidthRiver);
  if (!ocean && generatorVersion >= 7) {
    // Grow each raw still-water candidate as a 3x3 stamp. Every emitted cell
    // therefore owns at least two cardinal peers from the same stamp, unlike
    // iterative thinning which can leave the final pair of a peeled tendril.
    // Ocean has precedence but is itself water, so coastal clipping cannot
    // violate the same minimum-width invariant.
    let nearLake = false;
    let nearPond = false;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const candidate = fieldsAt(tileX + offsetX, tileY + offsetY);
        const candidateElevation = candidate.height < sea
          ? 0 : logicalElevation(candidate.height, generatorVersion);
        const kind = inlandWaterKind(
          candidate, candidateElevation, generatorVersion, false,
        );
        nearLake ||= kind === 'lake';
        nearPond ||= kind === 'pond';
      }
    }
    if (nearLake) waterKind = 'lake';
    else if (nearPond) waterKind = 'pond';
  }
  let coast = !ocean && fields.height < sea + 0.07;
  if (!ocean && generatorVersion >= 7) {
    // The gradient ratio is the primary width rule; v7CoastAt's exact bounded
    // check closes rare saddle/near-zero-gradient cases beyond the authored
    // four-tile band.
    coast = v7CoastAt(tileX, tileY, fieldsAt);
  }
  const biome: ProceduralTerrainBiome = ocean
    ? "ocean"
    : landBiome(fields, elevation, generatorVersion, coast, tileX, tileY, fieldsAt);
  const deepOcean = ocean && fields.height < sea - (generatorVersion >= 7 ? 0.22 : 0.32);
  const waterDepth: 0 | 1 | 2 = deepOcean ? 2 : waterKind === "none" ? 0 : 1;
  return {
    tileX,
    tileY,
    biome,
    surface: surfaceForBiome(biome, waterKind, deepOcean),
    terrainFamily: terrainFamilyFor(biome, fields, elevation, generatorVersion),
    shoreFamily: shoreFamilyFor(biome, fields),
    cliffFamily: cliffFamilyFor(biome, fields),
    waterKind,
    waterDepth,
    elevation,
    fields: quantizedFields(fields),
  };
}

/** A one-level south-facing cliff projects as four authored rows: cap, two
 * physical wall rows, and a cosmetic ground-contact row. V5 turns a river
 * crossing that drop into the matching four-row waterfall strip. Looking for
 * the crossing in a small deterministic neighbourhood also follows diagonal
 * river centre-lines without making generation depend on chunk order. */
type ProceduralBaseSampleAt = (
  tileX: number,
  tileY: number,
) => SemanticTerrainSample;

// A 1024² step-one review previously retained every heavyweight field and
// semantic sample (over 1 GB at process peak). 64 rows of a 1024-wide scan
// exceed every current bounded neighbourhood while placing a hard ceiling on
// both memos. Replacing the Map, rather than clearing its entries in place,
// also lets V8 reclaim the old backing store; recomputation remains pure and
// deterministic.
const PROCEDURAL_SAMPLE_MEMO_LIMIT = 65_536;

function boundedMemoSet<T>(cache: Map<string, T>, key: string, value: T): Map<string, T> {
  const target = cache.size >= PROCEDURAL_SAMPLE_MEMO_LIMIT
    ? new Map<string, T>()
    : cache;
  target.set(key, value);
  return target;
}

function cachedBaseSampleAt(
  seed: number,
  generatorVersion: number,
): ProceduralBaseSampleAt {
  let cache = new Map<string, SemanticTerrainSample>();
  // V7 samples several neighbouring fields for ocean dilation, normalized
  // beach distance, and minimum-width water stamps. Dense maps previously
  // recomputed the same expensive fractal fields dozens of times per cell.
  // Keep this cache scoped to one sampling operation so output and lifetime
  // remain deterministic while adjacent lookups share the exact field value.
  let fields = new Map<string, FloatTerrainFields>();
  const fieldsAt = (tileX: number, tileY: number): FloatTerrainFields => {
    const key = signedTileKey(tileX, tileY);
    const cached = fields.get(key);
    if (cached !== undefined) return cached;
    const resolved = floatTerrainFields(seed, generatorVersion, tileX, tileY);
    fields = boundedMemoSet(fields, key, resolved);
    return resolved;
  };
  return (tileX, tileY) => {
    const key = signedTileKey(tileX, tileY);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const sample = sampleBaseWithGeneratorSeed(
      seed,
      generatorVersion,
      tileX,
      tileY,
      fieldsAt,
    );
    cache = boundedMemoSet(cache, key, sample);
    return sample;
  };
}

function proceduralWaterfallAtV5(
  generatorVersion: number,
  tileX: number,
  tileY: number,
  baseSampleAt: ProceduralBaseSampleAt,
): boolean {
  if (generatorVersion < 5) return false;
  const sample = baseSampleAt(tileX, tileY);
  if (sample.waterKind !== "river") return false;
  for (let crossingY = tileY - 3; crossingY <= tileY; crossingY += 1) {
    for (let crossingX = tileX - 1; crossingX <= tileX + 1; crossingX += 1) {
      const upper = baseSampleAt(crossingX, crossingY);
      const lower = baseSampleAt(crossingX, crossingY + 1);
      if (
        upper.waterKind === "river" &&
        lower.waterKind === "river" &&
        upper.elevation > lower.elevation
      ) return true;
    }
  }
  return false;
}

interface ProceduralWaterfallAnchor {
  readonly centerX: number;
  readonly crestY: number;
  readonly upperElevation: number;
  readonly lowerElevation: number;
  readonly upstreamCenterX: number;
  readonly upstreamApproachRows: number;
  readonly downstreamCenterX: number;
  readonly downstreamApproachRows: number;
}

interface ProceduralWaterfallRepair extends ProceduralWaterfallAnchor {
  readonly centerAtRow: number;
  readonly rowOffset: number;
}

const WATERFALL_HALF_WIDTH = 1;
const WATERFALL_VISIBLE_ROWS = 4;
const WATERFALL_MIN_APPROACH_ROWS = 3;
const WATERFALL_MAX_APPROACH_ROWS = 16;
const WATERFALL_CENTER_SEARCH = 6;
const WATERFALL_REPAIR_RADIUS = 4;
const WATERFALL_REPAIR_FIELD_BAND = 4_096;
const WATERFALL_CLIFF_SHOULDER_TILES = 2;
const V7_RIVER_APRON_RADIUS = 1;

/** Finds the seeded river centre on one row without depending on chunk order.
 * V4 guarantees a readable river core, so the minimum absolute scalar value
 * among nearby river cells is its stable discrete centreline. */
function riverCenterXNear(
  seed: number,
  generatorVersion: number,
  nearX: number,
  tileY: number,
): number | null {
  let bestX: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (
    let tileX = nearX - WATERFALL_CENTER_SEARCH;
    tileX <= nearX + WATERFALL_CENTER_SEARCH;
    tileX += 1
  ) {
    const score = Math.abs(riverNoiseAt(seed, tileX, tileY, generatorVersion));
    if (score < bestScore || (score === bestScore && (bestX === null || tileX < bestX))) {
      bestX = tileX;
      bestScore = score;
    }
  }
  return bestX;
}

interface ProceduralWaterfallConnection {
  readonly centerX: number;
  readonly approachRows: number;
}

/** Follow the unmodified centreline until there are enough rows to connect it
 * to the fixed waterfall with cardinally adjacent cells. Fast diagonal rivers
 * therefore receive a longer approach instead of leaving a gap. */
function waterfallConnection(
  seed: number,
  generatorVersion: number,
  centerX: number,
  crestY: number,
  direction: -1 | 1,
  baseSampleAt: ProceduralBaseSampleAt,
): ProceduralWaterfallConnection {
  let rawCenterX = centerX;
  for (let distance = 1; distance <= WATERFALL_MAX_APPROACH_ROWS + 1; distance += 1) {
    const tileY = direction < 0
      ? crestY - distance
      : crestY + WATERFALL_VISIBLE_ROWS - 1 + distance;
    rawCenterX = riverCenterXNear(seed, generatorVersion, rawCenterX, tileY) ?? rawCenterX;
    const approachRows = distance - 1;
    if (
      approachRows >= WATERFALL_MIN_APPROACH_ROWS &&
      Math.abs(rawCenterX - centerX) <= distance &&
      baseSampleAt(rawCenterX, tileY).waterKind === "river"
    ) {
      return { centerX: rawCenterX, approachRows };
    }
  }
  return {
    // V7's fallback corridor must obey the same one-tile-per-approach-row
    // displacement assumed by its bounded repair scan. The seeded centreline
    // can otherwise drift by WATERFALL_CENTER_SEARCH on every row, allowing a
    // distant anchor to mutate a window which did not include that anchor.
    // Preserve the already-pinned v6 stream byte-for-byte.
    centerX: generatorVersion >= 7
      ? Math.max(
        centerX - WATERFALL_MAX_APPROACH_ROWS,
        Math.min(centerX + WATERFALL_MAX_APPROACH_ROWS, rawCenterX),
      )
      : rawCenterX,
    approachRows: WATERFALL_MAX_APPROACH_ROWS,
  };
}

/** A waterfall anchor is the river centre immediately above a one-level
 * south-facing drop. The lower centre may have moved sideways; the repair
 * deliberately keeps the fall at the upper centre and rejoins it later. */
function proceduralWaterfallAnchorNear(
  seed: number,
  generatorVersion: number,
  nearX: number,
  crestY: number,
  baseSampleAt: ProceduralBaseSampleAt,
): ProceduralWaterfallAnchor | null {
  const centerX = riverCenterXNear(
    seed,
    generatorVersion,
    nearX,
    crestY,
  );
  if (centerX === null) return null;
  const lowerCenterX = riverCenterXNear(
    seed,
    generatorVersion,
    centerX,
    crestY + 1,
  );
  if (lowerCenterX === null) return null;
  const upper = baseSampleAt(centerX, crestY);
  const lower = baseSampleAt(lowerCenterX, crestY + 1);
  if (
    upper.waterKind !== "river" ||
    lower.waterKind !== "river" ||
    upper.elevation - lower.elevation !== 1
  ) return null;
  const upstream = waterfallConnection(
    seed,
    generatorVersion,
    centerX,
    crestY,
    -1,
    baseSampleAt,
  );
  const downstream = waterfallConnection(
    seed,
    generatorVersion,
    centerX,
    crestY,
    1,
    baseSampleAt,
  );
  return {
    centerX,
    crestY,
    upperElevation: upper.elevation,
    lowerElevation: lower.elevation,
    upstreamCenterX: upstream.centerX,
    upstreamApproachRows: upstream.approachRows,
    downstreamCenterX: downstream.centerX,
    downstreamApproachRows: downstream.approachRows,
  };
}

function interpolateInteger(
  start: number,
  end: number,
  numerator: number,
  denominator: number,
): number {
  return Math.round(
    (start * (denominator - numerator) + end * numerator) / denominator,
  );
}

function waterfallCenterAtRow(
  anchor: ProceduralWaterfallAnchor,
  tileY: number,
): number {
  const rowOffset = tileY - anchor.crestY;
  if (rowOffset < 0) {
    return interpolateInteger(
      anchor.upstreamCenterX,
      anchor.centerX,
      rowOffset + anchor.upstreamApproachRows + 1,
      anchor.upstreamApproachRows + 1,
    );
  }
  if (rowOffset < WATERFALL_VISIBLE_ROWS) return anchor.centerX;
  return interpolateInteger(
    anchor.centerX,
    anchor.downstreamCenterX,
    rowOffset - WATERFALL_VISIBLE_ROWS + 1,
    anchor.downstreamApproachRows + 1,
  );
}

/** Resolves the local V6 repair which owns this tile. The bounded search is
 * expressed only in world coordinates, so independently generated chunks
 * discover the same crest and produce byte-identical aprons. */
function proceduralWaterfallRepairAt(
  seed: number,
  generatorVersion: number,
  sample: SemanticTerrainSample,
  baseSampleAt: ProceduralBaseSampleAt,
): ProceduralWaterfallRepair | null {
  if (generatorVersion < 6) return null;
  // Avoid the feature search over the overwhelming majority of the world.
  // The repair never strays more than four cells from the raw centreline.
  if (
    sample.waterKind !== "river" &&
    Math.abs(sample.fields.river) > WATERFALL_REPAIR_FIELD_BAND
  )
    return null;
  let best: ProceduralWaterfallRepair | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (
    let crestY = sample.tileY - (WATERFALL_VISIBLE_ROWS + WATERFALL_MAX_APPROACH_ROWS - 1);
    crestY <= sample.tileY + WATERFALL_MAX_APPROACH_ROWS;
    crestY += 1
  ) {
    const anchor = proceduralWaterfallAnchorNear(
      seed,
      generatorVersion,
      sample.tileX,
      crestY,
      baseSampleAt,
    );
    if (anchor === null) continue;
    const rowOffset = sample.tileY - crestY;
    if (
      rowOffset < -anchor.upstreamApproachRows ||
      rowOffset >= WATERFALL_VISIBLE_ROWS + anchor.downstreamApproachRows
    ) continue;
    const centerAtRow = waterfallCenterAtRow(anchor, sample.tileY);
    const horizontalDistance = Math.abs(sample.tileX - centerAtRow);
    if (horizontalDistance > WATERFALL_REPAIR_RADIUS) continue;
    const distance = horizontalDistance + Math.abs(rowOffset - 1.5) / 16;
    if (distance >= bestDistance) continue;
    best = { ...anchor, centerAtRow, rowOffset };
    bestDistance = distance;
  }
  return best;
}

function sampleWithV6WaterfallRepair(
  sample: SemanticTerrainSample,
  repair: ProceduralWaterfallRepair,
  generatorVersion: number,
): SemanticTerrainSample {
  const inChannel =
    Math.abs(sample.tileX - repair.centerAtRow) <= WATERFALL_HALF_WIDTH;
  // The contour compositor reads a 3x3 elevation neighbourhood. Flatten one
  // dry shoulder row on both sides of the visible fall as well as the four
  // authored waterfall rows. Without those aprons a diagonal raw contour can
  // reach the crest as an inset corner, leaving the middle waterfall column
  // with no face plan, or rise again immediately below the foot. The result
  // is a green hole through the fall even though all three semantic water
  // cells are present.
  const inFlatCliffSpan =
    repair.rowOffset >= -1 &&
    repair.rowOffset <= WATERFALL_VISIBLE_ROWS &&
    Math.abs(sample.tileX - repair.centerX) <=
      WATERFALL_HALF_WIDTH + WATERFALL_CLIFF_SHOULDER_TILES;
  const repairedElevation = repair.rowOffset <= 0
    ? repair.upperElevation
    : repair.lowerElevation;
  if (inChannel) {
    const waterfall =
      repair.rowOffset >= 0 && repair.rowOffset < WATERFALL_VISIBLE_ROWS;
    return {
      ...sample,
      surface: "water",
      waterKind: waterfall ? "waterfall" : "river",
      waterDepth: 1,
      elevation: repairedElevation,
    };
  }
  if (inFlatCliffSpan) {
    const waterKind = sample.waterKind === "river" && generatorVersion < 7
      ? "none" : sample.waterKind;
    return {
      ...sample,
      surface: surfaceForBiome(sample.biome, waterKind, false),
      waterKind,
      waterDepth: waterKind === "none" ? 0 : sample.waterDepth,
      elevation: repairedElevation,
    };
  }
  // Remove the diagonal seed-river remnant inside the repaired corridor. The
  // ordinary adjacency pass then grows banks around the straightened channel.
  if (sample.waterKind !== "river" || generatorVersion >= 7) return sample;
  return {
    ...sample,
    surface: surfaceForBiome(sample.biome, "none", false),
    waterKind: "none",
    waterDepth: 0,
  };
}

/** Build all V6 repairs which can affect one contiguous sampling window. This
 * converts the expensive per-cell crest search into one bounded feature pass
 * for chunk generation while retaining identical world-coordinate semantics. */
function proceduralWaterfallRepairsForBounds(
  seed: number,
  generatorVersion: number,
  minTileX: number,
  minTileY: number,
  width: number,
  height: number,
  baseSampleAt: ProceduralBaseSampleAt,
): ReadonlyMap<string, ProceduralWaterfallRepair> {
  const repairs = new Map<string, {
    readonly repair: ProceduralWaterfallRepair;
    readonly distance: number;
  }>();
  if (generatorVersion < 6) return new Map();
  const maxTileX = minTileX + width;
  const maxTileY = minTileY + height;
  const horizontalMargin =
    WATERFALL_CENTER_SEARCH +
    WATERFALL_REPAIR_RADIUS +
    WATERFALL_MAX_APPROACH_ROWS;
  const minimumCrestY =
    minTileY - (WATERFALL_VISIBLE_ROWS + WATERFALL_MAX_APPROACH_ROWS - 1);
  const maximumCrestY = maxTileY + WATERFALL_MAX_APPROACH_ROWS;
  const anchors = new Map<string, ProceduralWaterfallAnchor>();
  for (let crestY = minimumCrestY; crestY < maximumCrestY; crestY += 1) {
    for (
      let candidateX = minTileX - horizontalMargin;
      candidateX < maxTileX + horizontalMargin;
      candidateX += 1
    ) {
      if (baseSampleAt(candidateX, crestY).waterKind !== "river") continue;
      const centerX = riverCenterXNear(seed, generatorVersion, candidateX, crestY);
      if (centerX !== candidateX) continue;
      const anchor = proceduralWaterfallAnchorNear(
        seed,
        generatorVersion,
        centerX,
        crestY,
        baseSampleAt,
      );
      if (anchor !== null) anchors.set(signedTileKey(centerX, crestY), anchor);
    }
  }
  for (const anchor of anchors.values()) {
    for (
      let rowOffset = -anchor.upstreamApproachRows;
      rowOffset < WATERFALL_VISIBLE_ROWS + anchor.downstreamApproachRows;
      rowOffset += 1
    ) {
      const tileY = anchor.crestY + rowOffset;
      if (tileY < minTileY || tileY >= maxTileY) continue;
      const centerAtRow = waterfallCenterAtRow(anchor, tileY);
      for (
        let tileX = centerAtRow - WATERFALL_REPAIR_RADIUS;
        tileX <= centerAtRow + WATERFALL_REPAIR_RADIUS;
        tileX += 1
      ) {
        if (tileX < minTileX || tileX >= maxTileX) continue;
        const horizontalDistance = Math.abs(tileX - centerAtRow);
        const distance = horizontalDistance + Math.abs(rowOffset - 1.5) / 16;
        const key = signedTileKey(tileX, tileY);
        const previous = repairs.get(key);
        if (previous !== undefined && previous.distance <= distance) continue;
        repairs.set(key, {
          repair: { ...anchor, centerAtRow, rowOffset },
          distance,
        });
      }
    }
  }
  return new Map(
    [...repairs].map(([key, { repair }]) => [key, repair]),
  );
}

const coordinateWaterfallRepairCache = new Map<
  string,
  ReadonlyMap<string, ProceduralWaterfallRepair>
>();
const COORDINATE_WATERFALL_REPAIR_CACHE_LIMIT = 64;

function cachedCoordinateWaterfallRepairs(
  seed: number,
  generatorVersion: number,
  tileX: number,
  tileY: number,
  baseSampleAt: ProceduralBaseSampleAt,
): ReadonlyMap<string, ProceduralWaterfallRepair> {
  const chunkX = Math.floor(tileX / PROCEDURAL_WORLD_CHUNK_TILES);
  const chunkY = Math.floor(tileY / PROCEDURAL_WORLD_CHUNK_TILES);
  const key = `${seed}:${generatorVersion}:${chunkX},${chunkY}`;
  const cached = coordinateWaterfallRepairCache.get(key);
  if (cached !== undefined) {
    coordinateWaterfallRepairCache.delete(key);
    coordinateWaterfallRepairCache.set(key, cached);
    return cached;
  }
  const neighborMargin = generatorVersion >= 7 ? V7_RIVER_APRON_RADIUS : 0;
  const repairs = proceduralWaterfallRepairsForBounds(
    seed,
    generatorVersion,
    chunkX * PROCEDURAL_WORLD_CHUNK_TILES - neighborMargin,
    chunkY * PROCEDURAL_WORLD_CHUNK_TILES - neighborMargin,
    PROCEDURAL_WORLD_CHUNK_TILES + neighborMargin * 2,
    PROCEDURAL_WORLD_CHUNK_TILES + neighborMargin * 2,
    baseSampleAt,
  );
  coordinateWaterfallRepairCache.set(key, repairs);
  if (coordinateWaterfallRepairCache.size > COORDINATE_WATERFALL_REPAIR_CACHE_LIMIT) {
    const oldest = coordinateWaterfallRepairCache.keys().next().value;
    if (oldest !== undefined) coordinateWaterfallRepairCache.delete(oldest);
  }
  return repairs;
}

function sampleWithGeneratorSeed(
  seed: number,
  generatorVersion: number,
  tileX: number,
  tileY: number,
  baseSampleAt = cachedBaseSampleAt(seed, generatorVersion),
  repairsByCoordinate?: ReadonlyMap<string, ProceduralWaterfallRepair>,
): SemanticTerrainSample {
  const sample = baseSampleAt(tileX, tileY);
  if (generatorVersion === 5) {
    if (!proceduralWaterfallAtV5(
      generatorVersion,
      tileX,
      tileY,
      baseSampleAt,
    ))
      return sample;
    return { ...sample, waterKind: "waterfall" };
  }
  const directSampleAt = (x: number, y: number): SemanticTerrainSample => {
    const direct = baseSampleAt(x, y);
    const repair = repairsByCoordinate === undefined
      ? proceduralWaterfallRepairAt(seed, generatorVersion, direct, baseSampleAt)
      : repairsByCoordinate.get(signedTileKey(x, y)) ?? null;
    return repair === null ? direct : sampleWithV6WaterfallRepair(direct, repair, generatorVersion);
  };
  const resolved = directSampleAt(tileX, tileY);
  if (generatorVersion < 7 || resolved.waterKind !== 'none'
    || Math.abs(resolved.fields.river) > 8_000) return resolved;
  // Stamp a one-cell apron around the final repaired river, not around the
  // pre-repair scalar. A union of 3x3 stamps cannot contain a water cell with
  // fewer than two cardinal peers, even at a diagonal endpoint.
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    if (offsetX === 0 && offsetY === 0) continue;
    if (directSampleAt(tileX + offsetX, tileY + offsetY).waterKind !== 'river') continue;
    return {
      ...resolved,
      surface: 'water',
      waterKind: 'river',
      waterDepth: 1,
    };
  }
  return resolved;
}

export function sampleProceduralTerrainAt(
  seed: ProceduralWorldSeed,
  generatorVersion: number,
  tileX: number,
  tileY: number,
): SemanticTerrainSample {
  requirePositiveInteger(generatorVersion, "generatorVersion");
  requireSafeInteger(tileX, "tileX");
  requireSafeInteger(tileY, "tileY");
  const normalizedSeed = normalizeProceduralWorldSeed(seed);
  const seededGenerator = generatorSeed(normalizedSeed, generatorVersion);
  const baseSampleAt = cachedBaseSampleAt(seededGenerator, generatorVersion);
  const repairsByCoordinate =
    generatorVersion >= 6
      ? cachedCoordinateWaterfallRepairs(
          seededGenerator,
          generatorVersion,
          tileX,
          tileY,
          baseSampleAt,
        )
      : undefined;
  return sampleWithGeneratorSeed(
    seededGenerator,
    generatorVersion,
    tileX,
    tileY,
    baseSampleAt,
    repairsByCoordinate,
  );
}

function water(sample: SemanticTerrainSample): boolean {
  return sample.waterKind !== "none";
}

function adjacencyFor(
  sample: SemanticTerrainSample,
  sampleAt: (tileX: number, tileY: number) => SemanticTerrainSample,
): SemanticTerrainAdjacency {
  let sameSurfaceMask = 0;
  let sameBiomeMask = 0;
  let sameTerrainFamilyMask = 0;
  let waterMask = 0;
  let riverMask = 0;
  let higherElevationMask = 0;
  let lowerElevationMask = 0;
  let shorelineMask = 0;
  for (const neighbor of NEIGHBORS) {
    const adjacent = sampleAt(
      sample.tileX + neighbor.deltaX,
      sample.tileY + neighbor.deltaY,
    );
    if (adjacent.surface === sample.surface) sameSurfaceMask |= neighbor.bit;
    if (adjacent.biome === sample.biome) sameBiomeMask |= neighbor.bit;
    if (adjacent.terrainFamily === sample.terrainFamily)
      sameTerrainFamilyMask |= neighbor.bit;
    if (water(adjacent)) waterMask |= neighbor.bit;
    if (adjacent.waterKind === "river" || adjacent.waterKind === "waterfall")
      riverMask |= neighbor.bit;
    if (adjacent.elevation > sample.elevation)
      higherElevationMask |= neighbor.bit;
    if (adjacent.elevation < sample.elevation)
      lowerElevationMask |= neighbor.bit;
    if (water(adjacent) !== water(sample)) shorelineMask |= neighbor.bit;
  }
  const cardinal = CARDINAL_NEIGHBORS.map<TerrainCardinalRelation>(
    (neighbor) => {
      const adjacent = sampleAt(
        sample.tileX + neighbor.deltaX,
        sample.tileY + neighbor.deltaY,
      );
      return {
        direction: neighbor.direction,
        neighborBiome: adjacent.biome,
        neighborSurface: adjacent.surface,
        neighborTerrainFamily: adjacent.terrainFamily,
        neighborWaterKind: adjacent.waterKind,
        elevationDelta: adjacent.elevation - sample.elevation,
        surfaceChanges: adjacent.surface !== sample.surface,
        biomeChanges: adjacent.biome !== sample.biome,
        terrainFamilyChanges: adjacent.terrainFamily !== sample.terrainFamily,
        shoreline: water(adjacent) !== water(sample),
      };
    },
  );
  return {
    sameSurfaceMask,
    sameBiomeMask,
    sameTerrainFamilyMask,
    waterMask,
    riverMask,
    higherElevationMask,
    lowerElevationMask,
    shorelineMask,
    cardinal,
  };
}

function checksumChunk(cells: readonly SemanticTerrainCell[]): string {
  let hash = 0x811c9dc5;
  const add = (value: number): void => {
    hash ^= value >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const cell of cells) {
    add(cell.tileX);
    add(cell.tileY);
    add(PROCEDURAL_TERRAIN_BIOMES.indexOf(cell.biome));
    add(PROCEDURAL_TERRAIN_SURFACES.indexOf(cell.surface));
    add(PROCEDURAL_TERRAIN_FAMILIES.indexOf(cell.terrainFamily));
    add(PROCEDURAL_SHORE_FAMILIES.indexOf(cell.shoreFamily));
    add(PROCEDURAL_CLIFF_FAMILIES.indexOf(cell.cliffFamily));
    add(PROCEDURAL_WATER_KINDS.indexOf(cell.waterKind));
    add(cell.elevation);
    add(cell.fields.continentalness);
    add(cell.fields.erosion);
    add(cell.fields.peaksValleys);
    add(cell.fields.temperature);
    add(cell.fields.moisture);
    add(cell.fields.river);
    add(cell.fields.lakeBasin);
    add(cell.fields.pondBasin);
    add(cell.fields.strangeness);
    add(cell.fields.volcanism);
    add(cell.adjacency.sameSurfaceMask);
    add(cell.adjacency.sameBiomeMask);
    add(cell.adjacency.sameTerrainFamilyMask);
    add(cell.adjacency.waterMask);
    add(cell.adjacency.riverMask);
    add(cell.adjacency.higherElevationMask);
    add(cell.adjacency.lowerElevationMask);
    add(cell.adjacency.shorelineMask);
  }
  return hash.toString(16).padStart(8, "0");
}

export function sampleProceduralTerrainChunk(
  options: TerrainChunkSampleOptions,
): SemanticTerrainChunk {
  requireSafeInteger(options.chunkX, "chunkX");
  requireSafeInteger(options.chunkY, "chunkY");
  const generatorVersion =
    options.generatorVersion ?? PROCEDURAL_TERRAIN_GENERATOR_VERSION;
  requirePositiveInteger(generatorVersion, "generatorVersion");
  const halo = options.halo ?? PROCEDURAL_TERRAIN_HALO_TILES;
  requirePositiveInteger(halo, "halo");
  const normalizedSeed = normalizeProceduralWorldSeed(options.seed);
  const seededGenerator = generatorSeed(normalizedSeed, generatorVersion);
  const bounds = chunkTileBounds(options.chunkX, options.chunkY);
  const apronMinTileX = bounds.minTileX - halo;
  const apronMinTileY = bounds.minTileY - halo;
  const apronWidth = PROCEDURAL_WORLD_CHUNK_TILES + halo * 2;
  const apronHeight = PROCEDURAL_WORLD_CHUNK_TILES + halo * 2;
  const apron: SemanticTerrainSample[] = [];
  const byCoordinate = new Map<string, SemanticTerrainSample>();
  const baseSampleAt = cachedBaseSampleAt(seededGenerator, generatorVersion);
  // V7's final river apron asks about the eight neighbouring repaired cells.
  // Include that exact predicate domain in the bulk repair map; otherwise a
  // neighbour just outside this caller's output bounds silently resolves as
  // unrepaired and point/chunk/overview entry paths disagree.
  const repairNeighborMargin = generatorVersion >= 7 ? V7_RIVER_APRON_RADIUS : 0;
  const repairsByCoordinate = proceduralWaterfallRepairsForBounds(
    seededGenerator,
    generatorVersion,
    apronMinTileX - repairNeighborMargin,
    apronMinTileY - repairNeighborMargin,
    apronWidth + repairNeighborMargin * 2,
    apronHeight + repairNeighborMargin * 2,
    baseSampleAt,
  );
  for (let localY = 0; localY < apronHeight; localY += 1) {
    for (let localX = 0; localX < apronWidth; localX += 1) {
      const tileX = apronMinTileX + localX;
      const tileY = apronMinTileY + localY;
      const sample = sampleWithGeneratorSeed(
        seededGenerator,
        generatorVersion,
        tileX,
        tileY,
        baseSampleAt,
        repairsByCoordinate,
      );
      apron.push(sample);
      byCoordinate.set(signedTileKey(tileX, tileY), sample);
    }
  }
  const sampleAt = (tileX: number, tileY: number): SemanticTerrainSample => {
    const cached = byCoordinate.get(signedTileKey(tileX, tileY));
    if (cached === undefined) {
      throw new Error(
        `Terrain sample ${tileX},${tileY} falls outside the chunk apron`,
      );
    }
    return cached;
  };
  const cells: SemanticTerrainCell[] = [];
  for (let localY = 0; localY < PROCEDURAL_WORLD_CHUNK_TILES; localY += 1) {
    for (let localX = 0; localX < PROCEDURAL_WORLD_CHUNK_TILES; localX += 1) {
      const tileX = chunkLocalToTile(options.chunkX, localX);
      const tileY = chunkLocalToTile(options.chunkY, localY);
      const sample = sampleAt(tileX, tileY);
      cells.push({ ...sample, adjacency: adjacencyFor(sample, sampleAt) });
    }
  }
  return {
    seed: normalizedSeed,
    generatorVersion,
    chunkX: options.chunkX,
    chunkY: options.chunkY,
    minTileX: bounds.minTileX,
    minTileY: bounds.minTileY,
    width: PROCEDURAL_WORLD_CHUNK_TILES,
    height: PROCEDURAL_WORLD_CHUNK_TILES,
    halo,
    apronMinTileX,
    apronMinTileY,
    apronWidth,
    apronHeight,
    apron,
    cells,
    checksum: checksumChunk(cells),
  };
}

export function proceduralTerrainCellAt(
  chunk: SemanticTerrainChunk,
  localX: number,
  localY: number,
): SemanticTerrainCell {
  requireSafeInteger(localX, "localX");
  requireSafeInteger(localY, "localY");
  if (
    localX < 0 ||
    localX >= chunk.width ||
    localY < 0 ||
    localY >= chunk.height
  ) {
    throw new Error("local terrain coordinate falls outside the chunk payload");
  }
  const cell = chunk.cells[localY * chunk.width + localX];
  if (cell === undefined) throw new Error("chunk payload is incomplete");
  return cell;
}

export function proceduralTerrainApronSampleAt(
  chunk: SemanticTerrainChunk,
  tileX: number,
  tileY: number,
): SemanticTerrainSample | null {
  requireSafeInteger(tileX, "tileX");
  requireSafeInteger(tileY, "tileY");
  const localX = tileX - chunk.apronMinTileX;
  const localY = tileY - chunk.apronMinTileY;
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= chunk.apronWidth ||
    localY >= chunk.apronHeight
  ) {
    return null;
  }
  return chunk.apron[localY * chunk.apronWidth + localX] ?? null;
}

export function sampleProceduralTerrainOverview(
  options: TerrainOverviewOptions,
): TerrainOverview {
  requireSafeInteger(options.minTileX, "minTileX");
  requireSafeInteger(options.minTileY, "minTileY");
  requirePositiveInteger(options.columns, "columns");
  requirePositiveInteger(options.rows, "rows");
  requirePositiveInteger(options.stepTiles, "stepTiles");
  const generatorVersion =
    options.generatorVersion ?? PROCEDURAL_TERRAIN_GENERATOR_VERSION;
  requirePositiveInteger(generatorVersion, "generatorVersion");
  const normalizedSeed = normalizeProceduralWorldSeed(options.seed);
  const seededGenerator = generatorSeed(normalizedSeed, generatorVersion);
  const samples: SemanticTerrainSample[] = [];
  const baseSampleAt = cachedBaseSampleAt(seededGenerator, generatorVersion);
  // A waterfall is at most a few tiles wide and cannot survive a multi-tile
  // overview pixel. Keep distant seed-map sampling on the unchanged macro
  // fields; step-one overviews still receive exact V6 repaired semantics.
  const repairsByCoordinate = generatorVersion >= 6 && options.stepTiles === 1
    ? proceduralWaterfallRepairsForBounds(
        seededGenerator,
        generatorVersion,
        options.minTileX - (generatorVersion >= 7 ? V7_RIVER_APRON_RADIUS : 0),
        options.minTileY - (generatorVersion >= 7 ? V7_RIVER_APRON_RADIUS : 0),
        options.columns + (generatorVersion >= 7 ? V7_RIVER_APRON_RADIUS * 2 : 0),
        options.rows + (generatorVersion >= 7 ? V7_RIVER_APRON_RADIUS * 2 : 0),
        baseSampleAt,
      )
    : undefined;
  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const tileX = options.minTileX + column * options.stepTiles;
      const tileY = options.minTileY + row * options.stepTiles;
      samples.push(
        generatorVersion >= 6 && options.stepTiles > 1
          ? baseSampleAt(tileX, tileY)
          : sampleWithGeneratorSeed(
              seededGenerator,
              generatorVersion,
              tileX,
              tileY,
              baseSampleAt,
              repairsByCoordinate,
            ),
      );
    }
  }
  return {
    seed: normalizedSeed,
    generatorVersion,
    minTileX: options.minTileX,
    minTileY: options.minTileY,
    columns: options.columns,
    rows: options.rows,
    stepTiles: options.stepTiles,
    samples,
  };
}
