import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type CollisionMap, type CollisionObstacle } from './state.js';

export const SURVIVAL_WORLD_SIZE = 192;
export const SURVIVAL_WORLD_SEED = 0x4f434852;
export const SURVIVAL_WORLD_VERSION = 3;
export const SURVIVAL_CHUNK_TILES = 16;

export type SurvivalBiome =
  | 'water'
  | 'beach'
  | 'plains'
  | 'meadow'
  | 'forest'
  | 'valley'
  | 'highland'
  | 'ridge';

export interface SurvivalClearing {
  readonly slot: number;
  readonly tileX: number;
  readonly tileY: number;
}

export interface GeneratedSurvivalResource {
  readonly id: number;
  readonly kind: 'tree';
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

function valueNoise(seed: number, x: number, y: number, scale: number): number {
  const gridX = Math.floor(x / scale);
  const gridY = Math.floor(y / scale);
  const offsetX = x - gridX * scale;
  const offsetY = y - gridY * scale;
  const north = lerpInteger(hash(seed, gridX, gridY) & 1023, hash(seed, gridX + 1, gridY) & 1023, offsetX, scale);
  const south = lerpInteger(hash(seed, gridX, gridY + 1) & 1023, hash(seed, gridX + 1, gridY + 1) & 1023, offsetX, scale);
  return lerpInteger(north, south, offsetY, scale);
}

export function survivalClearings(): readonly SurvivalClearing[] {
  return Array.from({ length: 25 }, (_, slot) => ({
    slot,
    tileX: 48 + slot % 5 * 24,
    tileY: 48 + Math.floor(slot / 5) * 24,
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
  const first = 48;
  const last = 144;
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
  if (survivalTrailAt(tileX, tileY)) return 'plains';
  if (tileX < 3 || tileY < 3 || tileX >= SURVIVAL_WORLD_SIZE - 3 || tileY >= SURVIVAL_WORLD_SIZE - 3) return 'water';

  const doubledX = tileX * 2 - (SURVIVAL_WORLD_SIZE - 1);
  const doubledY = tileY * 2 - (SURVIVAL_WORLD_SIZE - 1);
  const coastNoise = valueNoise(seed ^ 0x63a9f12b, tileX, tileY, 32) - 512;
  const radius = 164 + Math.trunc(coastNoise / 10);
  const radiusSquared = radius * radius;
  const distanceSquared = doubledX * doubledX + doubledY * doubledY;
  if (distanceSquared >= radiusSquared) return 'water';
  const coastDepth = radiusSquared - distanceSquared;
  if (coastDepth < radius * 12) return 'beach';

  const interior = Math.min(320, Math.trunc(coastDepth / Math.max(1, radius * 2)));
  const elevation = valueNoise(seed ^ 0x18bd45c7, tileX, tileY, 36)
    + Math.trunc(valueNoise(seed ^ 0x72e41a9d, tileX, tileY, 13) / 2)
    + interior;
  const moisture = valueNoise(seed ^ 0x4a913cb7, tileX, tileY, 27)
    + Math.trunc(valueNoise(seed ^ 0x0d62e7f1, tileX, tileY, 11) / 3);

  if (elevation >= 1300) return 'ridge';
  if (elevation >= 1110) return 'highland';
  if (elevation <= 520) return 'valley';
  if (moisture >= 860) return 'forest';
  if (moisture >= 620) return 'meadow';
  return 'plains';
}

export function survivalBiomeBlocksMovement(biome: SurvivalBiome): boolean {
  return biome === 'water' || biome === 'ridge';
}

export function generatedSurvivalResourceAt(seed: number, tileX: number, tileY: number): GeneratedSurvivalResource | null {
  if (survivalClearingAt(tileX, tileY) || survivalTrailAt(tileX, tileY)) return null;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  const chance = biome === 'forest' ? 22 : biome === 'meadow' ? 6 : biome === 'highland' ? 4 : biome === 'plains' ? 2 : 0;
  if (chance === 0 || hash(seed ^ 0x2ec931ad, tileX, tileY) % 100 >= chance) return null;
  return {
    id: tileY * SURVIVAL_WORLD_SIZE + tileX + 1,
    kind: 'tree',
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
  const biomes: readonly SurvivalBiome[] = ['water', 'beach', 'plains', 'meadow', 'forest', 'valley', 'highland', 'ridge'];
  return Uint8Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) =>
    biomes.indexOf(survivalBiomeAt(seed, index % SURVIVAL_WORLD_SIZE, Math.floor(index / SURVIVAL_WORLD_SIZE))),
  );
}
