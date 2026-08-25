import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type CollisionMap, type CollisionObstacle } from './state.js';

export const SURVIVAL_WORLD_SIZE = 320;
export const SURVIVAL_WORLD_SEED = 0x4f434852;
export const SURVIVAL_WORLD_VERSION = 6;
export const SURVIVAL_CHUNK_TILES = 16;
export const SURVIVAL_SETTLEMENT_FIRST_TILE = 112;
export const SURVIVAL_SETTLEMENT_LAST_TILE = 208;

export const SURVIVAL_TREE_KINDS = ['tree_oak', 'tree_birch', 'tree_spruce', 'tree_acacia', 'tree_palm'] as const;
export type SurvivalTreeKind = typeof SURVIVAL_TREE_KINDS[number];

export const SURVIVAL_BIOMES = [
  'water',
  'beach',
  'freshwater',
  'waterfall',
  'plains',
  'meadow',
  'forest',
  'valley',
  'highland',
  'ridge',
  'desert',
  'desert_shore',
  'desert_ridge',
  'oasis',
  'oasis_water',
  'savanna',
  'coastal_cliff',
] as const;
export type SurvivalBiome = typeof SURVIVAL_BIOMES[number];

export interface SurvivalClearing {
  readonly slot: number;
  readonly tileX: number;
  readonly tileY: number;
}

export interface GeneratedSurvivalResource {
  readonly id: number;
  readonly kind: SurvivalTreeKind;
  readonly tileX: number;
  readonly tileY: number;
}

export interface SurvivalResourceCollision {
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export function survivalTreeObstacle(tileX: number, tileY: number): CollisionObstacle {
  const centerX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const footY = (tileY + 1) * TILE_SIZE_FIXED;
  return {
    left: centerX - 4 * FIXED_UNITS_PER_PIXEL,
    right: centerX + 4 * FIXED_UNITS_PER_PIXEL - 1,
    top: footY - 6 * FIXED_UNITS_PER_PIXEL,
    bottom: footY - 1,
  };
}

function hash(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function lerpInteger(left: number, right: number, numerator: number, denominator: number): number {
  return Math.trunc((left * (denominator - numerator) + right * numerator) / denominator);
}

function smoothFraction(numerator: number, denominator: number): number {
  return Math.trunc(numerator * numerator * (3 * denominator - 2 * numerator) / (denominator * denominator));
}

function valueNoise(seed: number, x: number, y: number, scale: number): number {
  const gridX = Math.floor(x / scale);
  const gridY = Math.floor(y / scale);
  const offsetX = x - gridX * scale;
  const offsetY = y - gridY * scale;
  const smoothX = smoothFraction(offsetX, scale);
  const smoothY = smoothFraction(offsetY, scale);
  const north = lerpInteger(hash(seed, gridX, gridY) & 1023, hash(seed, gridX + 1, gridY) & 1023, smoothX, scale);
  const south = lerpInteger(hash(seed, gridX, gridY + 1) & 1023, hash(seed, gridX + 1, gridY + 1) & 1023, smoothX, scale);
  return lerpInteger(north, south, smoothY, scale);
}

function fractalNoise(seed: number, x: number, y: number, scale: number, octaves = 4): number {
  let total = 0;
  let totalWeight = 0;
  let weight = 8;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(seed + Math.imul(octave, 0x9e3779b1), x, y, Math.max(4, scale >> octave)) * weight;
    totalWeight += weight;
    weight = Math.max(1, weight >> 1);
  }
  return Math.trunc(total / totalWeight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export interface SurvivalTerrainSample {
  readonly insideIsland: boolean;
  readonly coastDepth: number;
  readonly elevation: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly erosion: number;
  readonly coastRuggedness: number;
}

const ISLAND_CENTER = (SURVIVAL_WORLD_SIZE - 1) / 2;
const ISLAND_RADIUS_X = 145;
const ISLAND_RADIUS_Y = 139;

function coveCarveAt(seed: number, tileX: number, tileY: number): number {
  let carve = 0;
  for (let index = 0; index < 4; index += 1) {
    const angle = hash(seed ^ 0x54b23ea1, index, 0) % 6283 / 1000;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const centerX = ISLAND_CENTER + cosine * ISLAND_RADIUS_X * 0.86;
    const centerY = ISLAND_CENTER + sine * ISLAND_RADIUS_Y * 0.86;
    const dx = tileX - centerX;
    const dy = tileY - centerY;
    const radial = dx * cosine + dy * sine;
    const tangent = -dx * sine + dy * cosine;
    const radialRadius = 31 + hash(seed ^ 0x54b23ea1, index, 1) % 12;
    const tangentRadius = 14 + hash(seed ^ 0x54b23ea1, index, 2) % 10;
    const inletNoise = (fractalNoise(seed ^ 0x7d8410a3 ^ index, tileX, tileY, 26, 3) - 512) / 1700;
    const distanceSquared = (radial / radialRadius) ** 2 + (tangent / tangentRadius) ** 2 - inletNoise;
    if (distanceSquared < 1) carve = Math.max(carve, Math.trunc((1 - distanceSquared) * 285));
  }
  return carve;
}

export function survivalTerrainSample(seed: number, tileX: number, tileY: number): SurvivalTerrainSample {
  const warpX = Math.trunc((fractalNoise(seed ^ 0x63a9f12b, tileX, tileY, 112, 3) - 512) / 18);
  const warpY = Math.trunc((fractalNoise(seed ^ 0x2c54df19, tileX, tileY, 112, 3) - 512) / 18);
  const warpedX = tileX + warpX;
  const warpedY = tileY + warpY;
  const normalizedX = (warpedX - ISLAND_CENTER) / ISLAND_RADIUS_X;
  const normalizedY = (warpedY - ISLAND_CENTER) / ISLAND_RADIUS_Y;
  const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
  const angle = Math.atan2(normalizedY, normalizedX);
  const phase = (seed & 1023) / 1023 * Math.PI * 2;
  const coastDetail = Math.trunc(
    (fractalNoise(seed ^ 0x1ac43f7d, warpedX, warpedY, 88, 4) - 512) * 0.25
      + (fractalNoise(seed ^ 0x5b21d607, warpedX, warpedY, 34, 3) - 512) * 0.11,
  );
  const headlands = Math.trunc(Math.sin(angle * 3 + phase) * 48 + Math.sin(angle * 7 - phase) * 24);
  const coastDepth = Math.trunc((1 - distance) * 1024) + coastDetail + headlands
    - coveCarveAt(seed, tileX, tileY);
  const continentalness = clamp(coastDepth, 0, 420);
  const erosion = fractalNoise(seed ^ 0x6f20ca17, warpedX, warpedY, 104, 4);
  const broadRelief = fractalNoise(seed ^ 0x18bd45c7, warpedX, warpedY, 144, 4);
  const ridgeField = 1023 - Math.abs(fractalNoise(seed ^ 0x72e41a9d, warpedX, warpedY, 72, 4) - 512) * 2;
  const elevation = Math.trunc(broadRelief * 0.66 + ridgeField * 0.38 + continentalness * 0.72 - erosion * 0.18);
  const moisture = clamp(
    fractalNoise(seed ^ 0x4a913cb7, warpedX, warpedY, 136, 4)
      + Math.trunc((fractalNoise(seed ^ 0x0d62e7f1, warpedX, warpedY, 46, 3) - 512) * 0.3),
    0,
    1023,
  );
  const latitudeWarmth = Math.trunc((tileY - ISLAND_CENTER) * 190 / ISLAND_RADIUS_Y);
  const temperature = clamp(
    620 + latitudeWarmth
      + Math.trunc((fractalNoise(seed ^ 0x348ebc51, warpedX, warpedY, 156, 3) - 512) * 0.45)
      - Math.trunc(elevation / 7),
    0,
    1023,
  );
  return {
    insideIsland: coastDepth > 0,
    coastDepth,
    elevation,
    moisture,
    temperature,
    erosion,
    coastRuggedness: Math.abs(ridgeField - 512) + Math.abs(erosion - 512),
  };
}

function survivalDesertClimateAt(sample: SurvivalTerrainSample): boolean {
  return sample.temperature >= 500 && sample.moisture < 520;
}

function survivalSavannaClimateAt(sample: SurvivalTerrainSample): boolean {
  return sample.temperature >= 475 && sample.moisture < 650;
}

interface WaterFeatureCenter {
  readonly tileX: number;
  readonly tileY: number;
  readonly radius: number;
}

function survivalLakeCenters(seed: number): readonly WaterFeatureCenter[] {
  return [
    { tileX: 151 + hash(seed ^ 0x19da2351, 1, 0) % 18, tileY: 47 + hash(seed ^ 0x19da2351, 1, 1) % 14, radius: 11 },
    { tileX: 235 + hash(seed ^ 0x43c05f19, 2, 0) % 18, tileY: 91 + hash(seed ^ 0x43c05f19, 2, 1) % 20, radius: 12 },
    { tileX: 247 + hash(seed ^ 0x0bc91a77, 3, 0) % 16, tileY: 180 + hash(seed ^ 0x0bc91a77, 3, 1) % 20, radius: 10 },
    { tileX: 157 + hash(seed ^ 0x51b7df03, 4, 0) % 24, tileY: 257 + hash(seed ^ 0x51b7df03, 4, 1) % 14, radius: 13 },
    { tileX: 67 + hash(seed ^ 0x79a12e65, 5, 0) % 20, tileY: 154 + hash(seed ^ 0x79a12e65, 5, 1) % 26, radius: 9 },
  ];
}

function survivalLakeAt(seed: number, tileX: number, tileY: number): boolean {
  const edgeNoise = fractalNoise(seed ^ 0x2d130d8f, tileX, tileY, 18, 3) - 512;
  return survivalLakeCenters(seed).some((lake) => {
    const dx = tileX - lake.tileX;
    const dy = tileY - lake.tileY;
    return dx * dx + dy * dy <= lake.radius * lake.radius + Math.trunc(edgeNoise / 12);
  });
}

function survivalWaterfallFirstRow(seed: number): number {
  return 92 + hash(seed ^ 0x53f58e21, 0, 0) % 17;
}

function mainStreamCenterAt(seed: number, tileY: number): number {
  const waterfallRow = survivalWaterfallFirstRow(seed);
  const sampledY = tileY >= waterfallRow && tileY < waterfallRow + 5 ? waterfallRow : tileY;
  return 160 + Math.trunc((fractalNoise(seed ^ 0x7be621d3, 0, sampledY, 42, 3) - 512) / 18);
}

function survivalMainStreamAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileY < 52 || tileY > 271) return false;
  const centerX = mainStreamCenterAt(seed, tileY);
  return Math.abs(tileX - centerX) <= 1;
}

function survivalTributaryAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileX < 160 || tileX > 254) return false;
  const centerY = 110 + Math.trunc((fractalNoise(seed ^ 0x32ef6b49, tileX, 0, 38, 3) - 512) / 20);
  return Math.abs(tileY - centerY) <= 1;
}

/** A main river and eastern tributary form broad, continuous freshwater corridors. */
export function survivalStreamAt(seed: number, tileX: number, tileY: number): boolean {
  return survivalMainStreamAt(seed, tileX, tileY) || survivalTributaryAt(seed, tileX, tileY);
}

/** The river drops through one authored five-row cliff face before continuing
 * downstream. Keeping the run exactly five rows matches the waterfall sheet. */
export function survivalWaterfallAt(seed: number, tileX: number, tileY: number): boolean {
  const firstRow = survivalWaterfallFirstRow(seed);
  return tileY >= firstRow && tileY < firstRow + 5 && survivalMainStreamAt(seed, tileX, tileY);
}

function survivalOasisCenters(seed: number): readonly WaterFeatureCenter[] {
  return [
    {
      tileX: 70 + hash(seed ^ 0x66e31a05, 0, 0) % 26,
      tileY: 218 + hash(seed ^ 0x66e31a05, 0, 1) % 27,
      radius: 5,
    },
    {
      tileX: 220 + hash(seed ^ 0x24d80bf3, 1, 0) % 25,
      tileY: 215 + hash(seed ^ 0x24d80bf3, 1, 1) % 24,
      radius: 4,
    },
  ];
}

function survivalOasisDistanceSquared(seed: number, tileX: number, tileY: number): number {
  return Math.min(...survivalOasisCenters(seed).map((center) => {
    const dx = tileX - center.tileX;
    const dy = tileY - center.tileY;
    return dx * dx + dy * dy;
  }));
}

export function survivalClearings(): readonly SurvivalClearing[] {
  return Array.from({ length: 25 }, (_, slot) => ({
    slot,
    tileX: SURVIVAL_SETTLEMENT_FIRST_TILE + slot % 5 * 24,
    tileY: SURVIVAL_SETTLEMENT_FIRST_TILE + Math.floor(slot / 5) * 24,
  }));
}

export function survivalClearingAt(tileX: number, tileY: number): SurvivalClearing | null {
  for (const clearing of survivalClearings()) {
    const dx = tileX - clearing.tileX;
    const dy = tileY - clearing.tileY;
    if (dx * dx + dy * dy <= 25) return clearing;
  }
  return null;
}

/** A narrow shared trail network prevents resource clusters from enclosing a spawn. */
export function survivalTrailAt(tileX: number, tileY: number): boolean {
  const first = SURVIVAL_SETTLEMENT_FIRST_TILE;
  const last = SURVIVAL_SETTLEMENT_LAST_TILE;
  if (tileX < first - 1 || tileX > last + 1 || tileY < first - 1 || tileY > last + 1) return false;
  const nearGridLine = (value: number): boolean => {
    const offset = (value - first) % 24;
    return (offset >= -1 && offset <= 1) || offset >= 23;
  };
  return nearGridLine(tileX) || nearGridLine(tileY);
}

export function survivalSpawnPosition(slot: number): { readonly x: number; readonly y: number } | null {
  const clearing = survivalClearings()[slot];
  if (!clearing) return null;
  return {
    x: clearing.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: clearing.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
}

export function survivalBiomeAt(seed: number, tileX: number, tileY: number): SurvivalBiome {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'water';
  if (survivalClearingAt(tileX, tileY)) return 'plains';
  const trail = survivalTrailAt(tileX, tileY);
  if (tileX < 3 || tileY < 3 || tileX >= SURVIVAL_WORLD_SIZE - 3 || tileY >= SURVIVAL_WORLD_SIZE - 3) return 'water';

  const sample = survivalTerrainSample(seed, tileX, tileY);
  const desert = survivalDesertClimateAt(sample);
  const savanna = survivalSavannaClimateAt(sample);
  if (!sample.insideIsland) return 'water';
  if (sample.coastDepth < 42) {
    if (desert) return sample.coastRuggedness >= 610 && !trail ? 'desert_ridge' : 'desert_shore';
    if ((sample.coastRuggedness >= 610 || sample.elevation >= 920) && !trail) return 'coastal_cliff';
    return 'beach';
  }

  const oasisDistance = survivalOasisDistanceSquared(seed, tileX, tileY);
  if (oasisDistance <= 22) return trail ? 'oasis' : 'oasis_water';
  if (oasisDistance <= 46) return 'desert_shore';
  if (oasisDistance <= 128) return 'oasis';

  const freshwater = !desert && (survivalLakeAt(seed, tileX, tileY) || survivalStreamAt(seed, tileX, tileY));
  if (freshwater) return trail ? 'plains' : survivalWaterfallAt(seed, tileX, tileY) ? 'waterfall' : 'freshwater';

  if (desert) {
    if (sample.elevation >= 900 && sample.erosion < 550 && !trail) return 'desert_ridge';
    return 'desert';
  }
  if (savanna) return 'savanna';

  if (sample.elevation >= 940 && sample.erosion < 525) return trail ? 'highland' : 'ridge';
  if (sample.elevation >= 835) return 'highland';
  if (sample.elevation <= 530 && sample.moisture >= 500) return 'valley';
  if (sample.moisture >= 715) return 'forest';
  if (sample.moisture >= 555) return 'meadow';
  return 'plains';
}

export function survivalBiomeBlocksMovement(biome: SurvivalBiome): boolean {
  return biome === 'water'
    || biome === 'freshwater'
    || biome === 'waterfall'
    || biome === 'ridge'
    || biome === 'desert_ridge'
    || biome === 'oasis_water'
    || biome === 'coastal_cliff';
}

export function isChoppableTreeKind(kind: string): boolean {
  return kind === 'tree' || (SURVIVAL_TREE_KINDS as readonly string[]).includes(kind);
}

/** Forest-scale noise gives each grove a dominant species while retaining a
 * smaller mix of the other two species inside the same grove. */
export function survivalTreeKindAt(seed: number, tileX: number, tileY: number): SurvivalTreeKind {
  const biome = survivalBiomeAt(seed, tileX, tileY);
  if (biome === 'oasis') return hash(seed ^ 0x442c0197, tileX, tileY) % 100 < 76 ? 'tree_palm' : 'tree_acacia';
  if (biome === 'desert' || biome === 'desert_shore') return 'tree_acacia';
  if (biome === 'savanna') return hash(seed ^ 0x110d3ac7, tileX, tileY) % 100 < 72 ? 'tree_acacia' : 'tree_oak';
  const grove = valueNoise(seed ^ 0x71e4a539, tileX, tileY, 24);
  const temperateKinds = 3;
  const dominant = Math.min(temperateKinds - 1, Math.floor(grove * temperateKinds / 1024));
  const variation = hash(seed ^ 0x35b17d63, tileX, tileY) % 100;
  const offset = variation < 68 ? 0 : variation < 86 ? 1 : 2;
  return SURVIVAL_TREE_KINDS[(dominant + offset) % temperateKinds]!;
}

export function generatedSurvivalResourceAt(seed: number, tileX: number, tileY: number): GeneratedSurvivalResource | null {
  if (survivalClearingAt(tileX, tileY) || survivalTrailAt(tileX, tileY)) return null;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  const forestDensity = 38 + Math.trunc(valueNoise(seed ^ 0x19cb47e1, tileX, tileY, 9) * 28 / 1024);
  const chance = biome === 'forest' ? forestDensity
    : biome === 'highland' ? 12
      : biome === 'meadow' ? 10
        : biome === 'valley' ? 7
          : biome === 'plains' ? 4
            : biome === 'oasis' ? 19
              : biome === 'desert' ? 5
                : biome === 'desert_shore' ? 2
                  : biome === 'savanna' ? 8
            : 0;
  if (chance === 0 || hash(seed ^ 0x2ec931ad, tileX, tileY) % 100 >= chance) return null;
  return {
    id: tileY * SURVIVAL_WORLD_SIZE + tileX + 1,
    kind: survivalTreeKindAt(seed, tileX, tileY),
    tileX,
    tileY,
  };
}

export function generateSurvivalResources(seed = SURVIVAL_WORLD_SEED): GeneratedSurvivalResource[] {
  const resources: GeneratedSurvivalResource[] = [];
  for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
    for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
      const resource = generatedSurvivalResourceAt(seed, tileX, tileY);
      if (resource) resources.push(resource);
    }
  }
  return resources;
}

export function createSurvivalCollisionMap(
  seed = SURVIVAL_WORLD_SEED,
  resources: readonly SurvivalResourceCollision[] = generateSurvivalResources(seed).map((resource) => ({ ...resource, depleted: false })),
): CollisionMap {
  const blocked = Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) => {
    const tileX = index % SURVIVAL_WORLD_SIZE;
    const tileY = Math.floor(index / SURVIVAL_WORLD_SIZE);
    return survivalBiomeBlocksMovement(survivalBiomeAt(seed, tileX, tileY));
  });
  const obstacles: CollisionObstacle[] = [];
  for (const resource of resources) {
    if (!resource.depleted && resource.tileX >= 0 && resource.tileY >= 0
      && resource.tileX < SURVIVAL_WORLD_SIZE && resource.tileY < SURVIVAL_WORLD_SIZE) {
      obstacles.push(survivalTreeObstacle(resource.tileX, resource.tileY));
    }
  }
  return { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE, blocked, obstacles };
}

export function survivalTerrainBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return Uint8Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) =>
    SURVIVAL_BIOMES.indexOf(survivalBiomeAt(seed, index % SURVIVAL_WORLD_SIZE, Math.floor(index / SURVIVAL_WORLD_SIZE))),
  );
}
