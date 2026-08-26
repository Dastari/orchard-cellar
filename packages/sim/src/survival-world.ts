import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type CollisionObstacle,
  type MovementMedium,
} from './state.js';
import {
  raisedTerrainEdgeRoleAt,
  resolveRaisedTerrainContoursAt,
  type RaisedTerrainContourPlan,
  type RaisedTerrainGrid,
  type RaisedTerrainRampRole,
  type RaisedTerrainTileSet,
} from './raised-terrain-autotile.js';
import type { TerrainTransition } from './terrain-elevation.js';
import {
  SURVIVAL_SPAWN_SEARCH_RADIUS_TILES,
  SURVIVAL_TERRAIN_CONTOUR_INSET_TILES,
  SURVIVAL_TERRAIN_MAX_ELEVATION,
  SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES,
} from './balance.js';
import { playerInteractionOrigin } from './movement.js';
import {
  TREE_GROWTH_STAGE_BIG,
  TREE_GROWTH_STAGE_MEDIUM,
  normalizeTreeGrowthStage,
  treeHealthForGrowthStage,
} from './tree-regrowth.js';

/** The original generated island remains a 320x320 deterministic local space.
 * A wide ocean apron surrounds it so later islands can be added without moving
 * or reshaping the current landmass again. */
export const SURVIVAL_ISLAND_SIZE = 320;
export const SURVIVAL_OCEAN_PADDING_TILES = 256;
export const SURVIVAL_ISLAND_OFFSET_TILES = SURVIVAL_OCEAN_PADDING_TILES;
export const SURVIVAL_WORLD_SIZE = SURVIVAL_ISLAND_SIZE + SURVIVAL_OCEAN_PADDING_TILES * 2;
export const SURVIVAL_WORLD_SEED = 0x4f434852;
export const SURVIVAL_WORLD_VERSION = 26;
export const SURVIVAL_CHUNK_TILES = 16;

export const SURVIVAL_TREE_KINDS = [
  'tree_oak', 'tree_birch', 'tree_spruce', 'tree_acacia', 'tree_palm',
  'tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry',
] as const;
export type SurvivalTreeKind = typeof SURVIVAL_TREE_KINDS[number];
export const SURVIVAL_REGROWING_PLANT_KINDS = ['cactus'] as const;
export type SurvivalRegrowingPlantKind = typeof SURVIVAL_REGROWING_PLANT_KINDS[number];
export const SURVIVAL_FRUIT_TREE_KINDS = ['tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry'] as const;
export type SurvivalFruitTreeKind = typeof SURVIVAL_FRUIT_TREE_KINDS[number];

export const SURVIVAL_ORE_KINDS = [
  'ore_iron', 'ore_copper', 'ore_gold', 'ore_emerald',
  'ore_sapphire', 'ore_topaz', 'ore_ruby', 'ore_amethyst',
] as const;
export type SurvivalOreKind = typeof SURVIVAL_ORE_KINDS[number];
export const SURVIVAL_ROCK_KINDS = ['rock_large'] as const;
export type SurvivalRockKind = typeof SURVIVAL_ROCK_KINDS[number];
export const SURVIVAL_GATHERABLE_RESOURCE_KINDS = ['loose_stone', 'fallen_branch'] as const;
export type SurvivalGatherableResourceKind = typeof SURVIVAL_GATHERABLE_RESOURCE_KINDS[number];
export type SurvivalResourceKind = SurvivalTreeKind | SurvivalRegrowingPlantKind | SurvivalOreKind | SurvivalRockKind | SurvivalGatherableResourceKind;
export const ORE_NODE_RESERVE_HITS = 96;
export const ORE_HITS_PER_DROP = 3;
export const ORE_NODES_PER_KIND = 6;
export const ORE_MIN_SPACING_TILES = 12;
export const LARGE_ROCK_STONE_RESERVE = 100;
export const LARGE_ROCK_INITIAL_HEALTH = 250;

export const SURVIVAL_POI_DECORATION_KINDS = [
  'poi_flowers_pink', 'poi_flowers_gold', 'poi_stump', 'poi_fallen_log', 'poi_rock_small',
] as const;
export type SurvivalPoiDecorationKind = typeof SURVIVAL_POI_DECORATION_KINDS[number];
export const SURVIVAL_NATURE_DECORATION_KINDS = [
  'nature_grass', 'nature_flower_grass', 'nature_flower', 'nature_mushroom',
  'nature_lily_pad', 'nature_water_flower', 'nature_cattail', 'nature_water_grass', 'nature_water_rock',
  'nature_fish_shadow', 'nature_desert_grass', 'nature_desert_fern', 'nature_desert_bush',
  'nature_desert_plant', 'nature_desert_rock',
] as const;
export type SurvivalNatureDecorationKind = typeof SURVIVAL_NATURE_DECORATION_KINDS[number];
export const SURVIVAL_CAMP_DECORATION_KINDS = [
  'camp_tent', 'camp_campfire', 'camp_round_stool', 'camp_bench', 'camp_stump_seat',
  'camp_chair', 'camp_pond', 'camp_fishing_rod', 'camp_rock', 'camp_flowers',
] as const;
export type SurvivalCampDecorationKind = typeof SURVIVAL_CAMP_DECORATION_KINDS[number];
export type SurvivalDecorationKind = SurvivalPoiDecorationKind | SurvivalNatureDecorationKind | SurvivalCampDecorationKind;

/** Marlow's authored landmark occupies a naturally clear plains pocket west
 * of the starting area. These coordinates are stable world content, not a
 * player-relative spawn, so later reconnects and editors see the same camp. */
export const MARLOW_CAMP = {
  centerTileX: 336,
  centerTileY: 356,
  homeTileX: 338,
  homeTileY: 358,
  reserveRadiusX: 7,
  reserveRadiusY: 6,
} as const;

export const MARLOW_CAMPFIRE_TILE = {
  tileX: MARLOW_CAMP.centerTileX,
  tileY: MARLOW_CAMP.centerTileY,
} as const;

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
  'dirt_terrace',
  'dirt_ridge',
] as const;
export type SurvivalBiome = typeof SURVIVAL_BIOMES[number];

export const SURVIVAL_CLIFF_ROLES = [
  'none',
  'top_left',
  'top',
  'top_right',
  'left',
  'right',
  'bottom_left',
  'bottom',
  'bottom_right',
  'wall_left',
  'wall',
  'wall_right',
  'lower_wall_left',
  'lower_wall',
  'lower_wall_right',
  'foot_left',
  'foot',
  'foot_right',
  'ramp_top_left',
  'ramp_top_right',
  'ramp_bottom_left',
  'ramp_bottom_right',
] as const;
export type SurvivalCliffRole = typeof SURVIVAL_CLIFF_ROLES[number];

/** Projected cliff feet are visual overlap on the approach tile. Ramps and
 * feet remain walkable; caps, sides, and the actual wall rows stay solid. */
export function survivalCliffRoleBlocksMovement(role: SurvivalCliffRole): boolean {
  return role !== 'none' && !role.startsWith('ramp_') && !role.startsWith('foot');
}

export interface SurvivalPlateauRamp {
  readonly contourLevel: number;
  readonly tileX: number;
  /** Lower/southern row; the paired upper row is `tileY - 1`. */
  readonly tileY: number;
}

/** Stone Cliff 1's topology and collision profile is shared by authority and
 * client. Frame ids remain tileset data; logical elevation never depends on
 * them. */
export const SURVIVAL_RAISED_CLIFF_TILE_SET: RaisedTerrainTileSet = {
  edgeFrames: {
    top_left: 1, top: 2, top_right: 3,
    left: 15, right: 17,
    bottom_left: 29, bottom: 30, bottom_right: 31,
  },
  faceProfiles: {
    tall: {
      rows: [
        { id: 'wall', frames: [43, 44, 45], blocksMovement: true },
        { id: 'lower_wall', frames: [57, 58, 59], blocksMovement: true },
        { id: 'foot', frames: [71, 72, 73], blocksMovement: false },
      ],
    },
  },
  insetFrames: {
    inner_bottom_right: 0,
    inner_bottom_left: 1,
    inner_top_right: 2,
    inner_top_left: 3,
  },
  rampFrames: {
    ramp_top_left: 0,
    ramp_top_right: 1,
    ramp_bottom_left: 2,
    ramp_bottom_right: 3,
  },
};

export const SURVIVAL_DIRT_CLIFF_ROLES = [
  'none',
  'edge',
  'ramp_top_left',
  'ramp_top_right',
  'ramp_bottom_left',
  'ramp_bottom_right',
] as const;
export type SurvivalDirtCliffRole = typeof SURVIVAL_DIRT_CLIFF_ROLES[number];

export interface SurvivalSpawnTile {
  readonly slot: number;
  readonly tileX: number;
  readonly tileY: number;
}

export interface GeneratedSurvivalResource {
  readonly id: number;
  readonly kind: SurvivalResourceKind;
  readonly tileX: number;
  readonly tileY: number;
}

export interface GeneratedSurvivalDecoration {
  readonly id: number;
  readonly kind: SurvivalDecorationKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly variant: number;
  readonly animationOffset: number;
}

export interface SurvivalCampPathTile {
  readonly tileX: number;
  readonly tileY: number;
}

export interface SurvivalResourceCollision {
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export const SURVIVAL_TREE_COLLISION_FOOT_OFFSET = 4 * FIXED_UNITS_PER_PIXEL;

export function survivalTreeObstacle(tileX: number, tileY: number): CollisionObstacle {
  const centerX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  // Use the narrow central trunk rather than the lowest root/shadow pixels so
  // the physical base is visually centred across all tree variants.
  const footY = (tileY + 1) * TILE_SIZE_FIXED - SURVIVAL_TREE_COLLISION_FOOT_OFFSET;
  return {
    left: centerX - 4 * FIXED_UNITS_PER_PIXEL,
    right: centerX + 4 * FIXED_UNITS_PER_PIXEL - 1,
    top: footY - 6 * FIXED_UNITS_PER_PIXEL,
    bottom: footY - 1,
  };
}

export function survivalOreObstacle(tileX: number, tileY: number): CollisionObstacle {
  const centerX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const footY = (tileY + 1) * TILE_SIZE_FIXED;
  return {
    left: centerX - 6 * FIXED_UNITS_PER_PIXEL,
    right: centerX + 6 * FIXED_UNITS_PER_PIXEL - 1,
    top: footY - 8 * FIXED_UNITS_PER_PIXEL,
    bottom: footY - 1,
  };
}

export function survivalResourceObstacle(kind: string, tileX: number, tileY: number): CollisionObstacle {
  return isMineableOreKind(kind) || isBreakableRockKind(kind)
    ? survivalOreObstacle(tileX, tileY)
    : survivalTreeObstacle(tileX, tileY);
}

/** The point on a resource's physical footprint nearest to the player.
 * Tool targeting uses this instead of the authored tile centre so a player
 * pressed against a trunk cannot accidentally aim past it. */
export function survivalResourceTargetPoint(
  playerX: number,
  playerY: number,
  kind: string,
  tileX: number,
  tileY: number,
): { readonly x: number; readonly y: number } {
  const bounds = survivalResourceObstacle(kind, tileX, tileY);
  return {
    x: Math.max(bounds.left, Math.min(bounds.right, playerX)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, playerY)),
  };
}

/** Direction and distance from the player's physical body to the nearest
 * point on a resource footprint. Shared by prediction and authority. */
export function survivalResourceTargetVector(
  playerX: number,
  playerY: number,
  kind: string,
  tileX: number,
  tileY: number,
): { readonly x: number; readonly y: number } {
  const origin = playerInteractionOrigin({ x: playerX, y: playerY });
  const target = survivalResourceTargetPoint(origin.x, origin.y, kind, tileX, tileY);
  return { x: target.x - origin.x, y: target.y - origin.y };
}

export function isGatherableResourceKind(kind: string): kind is SurvivalGatherableResourceKind {
  return (SURVIVAL_GATHERABLE_RESOURCE_KINDS as readonly string[]).includes(kind);
}

export function survivalResourceBlocksMovement(kind: string): boolean {
  return !isGatherableResourceKind(kind);
}

export function isInteractivePoiDecorationKind(kind: string): boolean {
  return kind === 'poi_rock_small' || kind === 'poi_fallen_log';
}

export function survivalMarlowCampReservedAt(tileX: number, tileY: number): boolean {
  return Math.abs(tileX - MARLOW_CAMP.centerTileX) <= MARLOW_CAMP.reserveRadiusX
    && Math.abs(tileY - MARLOW_CAMP.centerTileY) <= MARLOW_CAMP.reserveRadiusY;
}

export function generateMarlowCampDecorations(): readonly GeneratedSurvivalDecoration[] {
  const at = (
    id: number,
    kind: SurvivalDecorationKind,
    offsetX: number,
    offsetY: number,
    variant = 0,
    animationOffset = 0,
  ): GeneratedSurvivalDecoration => ({
    id: 3_000_000_000 + id,
    kind,
    tileX: MARLOW_CAMP.centerTileX + offsetX,
    tileY: MARLOW_CAMP.centerTileY + offsetY,
    variant,
    animationOffset,
  });
  return [
    at(1, 'camp_tent', -4, 1),
    at(2, 'camp_pond', 5, -1),
    at(3, 'camp_fishing_rod', 3, 0),
    at(4, 'camp_campfire', 0, 0, 0, 3),
    at(5, 'camp_bench', 0, -2),
    at(6, 'camp_round_stool', -2, 1),
    at(7, 'camp_stump_seat', 2, 1),
    at(8, 'camp_bench', 0, 2),
    at(9, 'camp_rock', -6, 0),
    at(10, 'camp_rock', 6, 5),
    at(11, 'camp_flowers', -5, 4),
    at(12, 'camp_flowers', 4, 4, 1),
    at(13, 'nature_grass', -6, -3),
    at(14, 'nature_grass', -3, -4),
    at(15, 'nature_grass', 2, -4),
    at(16, 'nature_grass', 6, -3),
    at(17, 'nature_flower_grass', -5, -4),
    at(18, 'nature_flower_grass', 5, -4),
    at(19, 'nature_flower', -6, 2),
    at(20, 'nature_flower', 5, 2, 1),
    at(21, 'nature_grass', -6, 5),
    at(22, 'nature_grass', 5, 5),
  ];
}

/** A two-tile-wide campsite track with a short southern spur. The authored
 * mask deliberately extends beyond the reserved clearing so the path tapers
 * back into the surrounding world rather than ending at an invisible radius. */
const marlowCampPathTiles: readonly SurvivalCampPathTile[] = (() => {
  const tiles: SurvivalCampPathTile[] = [];
  const add = (offsetX: number, offsetY: number): void => {
    tiles.push({
      tileX: MARLOW_CAMP.centerTileX + offsetX,
      tileY: MARLOW_CAMP.centerTileY + offsetY,
    });
  };
  for (let offsetX = -10; offsetX <= 10; offsetX += 1) {
    add(offsetX, 2);
    add(offsetX, 3);
  }
  for (let offsetY = 4; offsetY <= 9; offsetY += 1) {
    add(-2, offsetY);
    add(-1, offsetY);
  }
  return Object.freeze(tiles);
})();

export function generateMarlowCampPathTiles(): readonly SurvivalCampPathTile[] {
  return marlowCampPathTiles;
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

const ISLAND_CENTER = (SURVIVAL_ISLAND_SIZE - 1) / 2;
const ISLAND_RADIUS_X = 145;
const ISLAND_RADIUS_Y = 139;

function islandTile(value: number): number {
  return value - SURVIVAL_ISLAND_OFFSET_TILES;
}

function worldTile(value: number): number {
  return value + SURVIVAL_ISLAND_OFFSET_TILES;
}

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
  tileX = islandTile(tileX);
  tileY = islandTile(tileY);
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_ISLAND_SIZE || tileY >= SURVIVAL_ISLAND_SIZE) {
    return {
      insideIsland: false,
      coastDepth: -1024,
      elevation: 0,
      moisture: 0,
      temperature: 0,
      erosion: 0,
      coastRuggedness: 0,
    };
  }
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

const islandMaskCache = new Map<number, Uint8Array>();

/** Convert the continuous coast field into a stable tile mask. Two light
 * majority passes remove single-cell antennae and diagonal pinholes without
 * erasing the broad coves and headlands supplied by the noise field. */
function islandMaskFor(seed: number): Uint8Array {
  const cached = islandMaskCache.get(seed);
  if (cached) return cached;
  let mask = Uint8Array.from(
    { length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE },
    (_, index) => Number(survivalTerrainSample(
      seed,
      index % SURVIVAL_WORLD_SIZE,
      Math.floor(index / SURVIVAL_WORLD_SIZE),
    ).insideIsland),
  );
  for (let pass = 0; pass < 2; pass += 1) {
    const next = mask.slice();
    for (let tileY = 1; tileY < SURVIVAL_WORLD_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < SURVIVAL_WORLD_SIZE - 1; tileX += 1) {
        const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
        let neighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            neighbors += mask[(tileY + offsetY) * SURVIVAL_WORLD_SIZE + tileX + offsetX] ?? 0;
          }
        }
        next[index] = Number(mask[index] === 1 ? neighbors >= 3 : neighbors >= 6);
      }
    }
    mask = next;
  }
  // The generic majority filter can retain a one-cell spur when three
  // diagonal land neighbours prop it up. Shore autotiles cannot join that
  // topology cleanly (the cell has ocean on three cardinal sides), so trim
  // those antennae in a final orthogonal pass. This keeps broad coves intact
  // while preventing little beach tongues from poking into the ocean.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = mask.slice();
    for (let tileY = 1; tileY < SURVIVAL_WORLD_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < SURVIVAL_WORLD_SIZE - 1; tileX += 1) {
        const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
        const cardinalLand = (mask[index - SURVIVAL_WORLD_SIZE] ?? 0)
          + (mask[index + 1] ?? 0)
          + (mask[index + SURVIVAL_WORLD_SIZE] ?? 0)
          + (mask[index - 1] ?? 0);
        if (mask[index] === 1 && cardinalLand <= 1) next[index] = 0;
        else if (mask[index] === 0 && cardinalLand === 4) next[index] = 1;
      }
    }
    mask = next;
  }
  islandMaskCache.set(seed, mask);
  return mask;
}

export function survivalIslandAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  return islandMaskFor(seed)[tileY * SURVIVAL_WORLD_SIZE + tileX] === 1;
}

function survivalShoreDepthAt(seed: number, tileX: number, tileY: number): number {
  const variation = fractalNoise(seed ^ 0x2e1764bd, islandTile(tileX), islandTile(tileY), 52, 3);
  return 30 + Math.trunc(variation * 28 / 1023);
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

interface PlateauCenter {
  readonly tileX: number;
  readonly tileY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly shapeSeed: number;
}

/** Broad, contained plateaus deliberately avoid the authored lakes, streams,
 * oasis, and coast. Each center owns an independently seeded organic mask. */
function survivalPlateauCenters(seed: number): readonly PlateauCenter[] {
  const shifted = (tileX: number, tileY: number, halfWidth: number, halfHeight: number, index: number): PlateauCenter => ({
    tileX: worldTile(tileX + hash(seed ^ 0x62c731ad, index, 0) % 5 - 2),
    tileY: worldTile(tileY + hash(seed ^ 0x62c731ad, index, 1) % 5 - 2),
    halfWidth: halfWidth + hash(seed ^ 0x62c731ad, index, 2) % 3 - 1,
    halfHeight: halfHeight + hash(seed ^ 0x62c731ad, index, 3) % 3 - 1,
    shapeSeed: hash(seed ^ 0x3a18d6e7, index, 4),
  });
  return [
    shifted(112, 78, 22, 14, 0),
    shifted(215, 145, 24, 16, 1),
    shifted(120, 188, 20, 14, 2),
    shifted(196, 235, 18, 11, 3),
  ];
}

function survivalDirtTerraceCenters(seed: number): readonly PlateauCenter[] {
  const shifted = (tileX: number, tileY: number, halfWidth: number, halfHeight: number, index: number): PlateauCenter => ({
    tileX: worldTile(tileX + hash(seed ^ 0x1d8ac461, index, 0) % 7 - 3),
    tileY: worldTile(tileY + hash(seed ^ 0x1d8ac461, index, 1) % 7 - 3),
    halfWidth: halfWidth + hash(seed ^ 0x1d8ac461, index, 2) % 3 - 1,
    halfHeight: halfHeight + hash(seed ^ 0x1d8ac461, index, 3) % 3 - 1,
    shapeSeed: hash(seed ^ 0x74e2b903, index, 4),
  });
  return [
    shifted(67, 83, 11, 8, 0),
    shifted(187, 67, 13, 8, 1),
    shifted(91, 123, 12, 7, 2),
    shifted(267, 131, 11, 8, 3),
    shifted(171, 171, 10, 7, 4),
    shifted(67, 187, 9, 6, 5),
  ];
}

function ellipseField(
  tileX: number,
  tileY: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): number {
  const dx = (tileX - centerX) / radiusX;
  const dy = (tileY - centerY) / radiusY;
  return 1 - dx * dx - dy * dy;
}

function rawPlateauFieldAt(plateau: PlateauCenter, tileX: number, tileY: number): number {
  const direction = hash(plateau.shapeSeed, 0, 0) % 2 === 0 ? 1 : -1;
  const jitter = (index: number): number => (hash(plateau.shapeSeed, index, 1) % 201 - 100) / 1_000;
  const lobes = [
    [0, 0, 0.7, 0.7],
    [-0.4, -0.22 * direction, 0.52, 0.5],
    [0.38, 0.28 * direction, 0.58, 0.48],
    [-0.16, 0.44 * direction, 0.62, 0.44],
    [0.24, -0.45 * direction, 0.46, 0.4],
  ] as const;
  let field = Number.NEGATIVE_INFINITY;
  lobes.forEach(([offsetX, offsetY, radiusX, radiusY], index) => {
    field = Math.max(field, ellipseField(
      tileX,
      tileY,
      plateau.tileX + (offsetX + jitter(index * 2 + 2)) * plateau.halfWidth,
      plateau.tileY + (offsetY + jitter(index * 2 + 3)) * plateau.halfHeight,
      radiusX * plateau.halfWidth,
      radiusY * plateau.halfHeight,
    ));
  });
  const coveSide = hash(plateau.shapeSeed, 17, 4) % 2 === 0 ? 1 : -1;
  const cove = ellipseField(
    tileX,
    tileY,
    plateau.tileX + coveSide * plateau.halfWidth * 0.88,
    plateau.tileY - direction * plateau.halfHeight * 0.08,
    plateau.halfWidth * 0.32,
    plateau.halfHeight * 0.34,
  );
  const edgeNoise = (fractalNoise(
    plateau.shapeSeed ^ 0x51c76d29,
    islandTile(tileX),
    islandTile(tileY),
    9,
    3,
  ) - 512) / 3_200;
  return field + edgeNoise - Math.max(0, cove) * 1.15;
}

const plateauMaskCache = new Map<number, Uint8Array>();

function buildOrganicFeatureMask(centers: readonly PlateauCenter[]): Uint8Array {
  const worldMask = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
  for (const plateau of centers) {
    const minimumX = Math.max(1, plateau.tileX - plateau.halfWidth - 3);
    const maximumX = Math.min(SURVIVAL_WORLD_SIZE - 2, plateau.tileX + plateau.halfWidth + 3);
    const minimumY = Math.max(1, plateau.tileY - plateau.halfHeight - 3);
    const maximumY = Math.min(SURVIVAL_WORLD_SIZE - 2, plateau.tileY + plateau.halfHeight + 3);
    const width = maximumX - minimumX + 1;
    const height = maximumY - minimumY + 1;
    let local = Uint8Array.from({ length: width * height }, (_, index) => {
      const tileX = minimumX + index % width;
      const tileY = minimumY + Math.floor(index / width);
      return Number(rawPlateauFieldAt(plateau, tileX, tileY) >= 0);
    });
    // Remove single-tile spikes and close pinholes before autotiling. The blob47
    // edge still retains concavities and separate lobes after this light pass.
    for (let pass = 0; pass < 2; pass += 1) {
      const smoothed = new Uint8Array(local.length);
      for (let localY = 1; localY < height - 1; localY += 1) {
        for (let localX = 1; localX < width - 1; localX += 1) {
          let neighbors = 0;
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              if (offsetX === 0 && offsetY === 0) continue;
              neighbors += local[(localY + offsetY) * width + localX + offsetX] ?? 0;
            }
          }
          const index = localY * width + localX;
          smoothed[index] = Number(local[index] === 1 ? neighbors >= 3 : neighbors >= 6);
        }
      }
      local = smoothed;
    }
    const withoutSpurs = local.slice();
    for (let localY = 1; localY < height - 1; localY += 1) {
      for (let localX = 1; localX < width - 1; localX += 1) {
        const index = localY * width + localX;
        if (local[index] !== 1) continue;
        const north = local[index - width] === 1;
        const east = local[index + 1] === 1;
        const south = local[index + width] === 1;
        const west = local[index - 1] === 1;
        if ((!north && !south) || (!east && !west)) withoutSpurs[index] = 0;
      }
    }
    local = withoutSpurs;

    let start = (plateau.tileY - minimumY) * width + plateau.tileX - minimumX;
    if (local[start] !== 1) start = local.findIndex((value) => value === 1);
    if (start < 0) continue;
    const connected = new Uint8Array(local.length);
    const queue = [start];
    connected[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const localX = index % width;
      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (neighbor < 0 || neighbor >= local.length || connected[neighbor] === 1 || local[neighbor] !== 1) continue;
        if (Math.abs(neighbor % width - localX) > 1) continue;
        connected[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    connected.forEach((inside, index) => {
      if (inside !== 1) return;
      const tileX = minimumX + index % width;
      const tileY = minimumY + Math.floor(index / width);
      worldMask[tileY * SURVIVAL_WORLD_SIZE + tileX] = 1;
    });
  }
  return worldMask;
}

function buildSurvivalPlateauMask(seed: number): Uint8Array {
  return buildOrganicFeatureMask(survivalPlateauCenters(seed));
}

function plateauMaskFor(seed: number): Uint8Array {
  const cached = plateauMaskCache.get(seed);
  if (cached) return cached;
  const mask = buildSurvivalPlateauMask(seed);
  plateauMaskCache.set(seed, mask);
  return mask;
}

export const SURVIVAL_MAX_TERRAIN_ELEVATION = SURVIVAL_TERRAIN_MAX_ELEVATION;
const elevationMaskCache = new Map<number, Uint8Array>();

function erodeTerrainMask(source: Uint8Array, passes: number): Uint8Array {
  let current = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let tileY = 1; tileY < SURVIVAL_WORLD_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < SURVIVAL_WORLD_SIZE - 1; tileX += 1) {
        const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
        if (current[index] !== 1) continue;
        let enclosed = true;
        for (let offsetY = -1; offsetY <= 1 && enclosed; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (current[(tileY + offsetY) * SURVIVAL_WORLD_SIZE + tileX + offsetX] !== 1) {
              enclosed = false;
              break;
            }
          }
        }
        if (enclosed) next[index] = 1;
      }
    }
    current = next;
  }
  return current;
}

function retainTerrainComponents(source: Uint8Array, minimumTiles: number): Uint8Array {
  const retained = new Uint8Array(source.length);
  const visited = new Uint8Array(source.length);
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== 1 || visited[start] === 1) continue;
    const component = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const index = component[cursor]!;
      const tileX = index % SURVIVAL_WORLD_SIZE;
      for (const neighbor of [
        index - 1,
        index + 1,
        index - SURVIVAL_WORLD_SIZE,
        index + SURVIVAL_WORLD_SIZE,
      ]) {
        if (neighbor < 0 || neighbor >= source.length || visited[neighbor] === 1
          || source[neighbor] !== 1 || Math.abs(neighbor % SURVIVAL_WORLD_SIZE - tileX) > 1) continue;
        visited[neighbor] = 1;
        component.push(neighbor);
      }
    }
    if (component.length < minimumTiles) continue;
    for (const index of component) retained[index] = 1;
  }
  return retained;
}

/** The live island's organic plateaus become stepped mountains by repeatedly
 * insetting the exact same mask. Every higher level is therefore a strict
 * subset of the level below, matching future editor raise/lower semantics. */
function elevationMaskFor(seed: number): Uint8Array {
  const cached = elevationMaskCache.get(seed);
  if (cached) return cached;
  const elevations = plateauMaskFor(seed).slice();
  let contour = plateauMaskFor(seed);
  for (let level = 2; level <= SURVIVAL_MAX_TERRAIN_ELEVATION; level += 1) {
    contour = retainTerrainComponents(
      erodeTerrainMask(contour, SURVIVAL_TERRAIN_CONTOUR_INSET_TILES),
      SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES,
    );
    contour.forEach((inside, index) => {
      if (inside === 1) elevations[index] = level;
    });
  }
  elevationMaskCache.set(seed, elevations);
  return elevations;
}

const dirtTerraceMaskCache = new Map<number, Uint8Array>();

function dirtTerraceMaskFor(seed: number): Uint8Array {
  const cached = dirtTerraceMaskCache.get(seed);
  if (cached) return cached;
  const mask = buildOrganicFeatureMask(survivalDirtTerraceCenters(seed));
  dirtTerraceMaskCache.set(seed, mask);
  return mask;
}

export function survivalPlateauAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  return plateauMaskFor(seed)[tileY * SURVIVAL_WORLD_SIZE + tileX] === 1;
}

/** Legacy-island adapter for the shared arbitrary integer elevation contract. */
export function survivalTerrainHeightAt(seed: number, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 0;
  return elevationMaskFor(seed)[tileY * SURVIVAL_WORLD_SIZE + tileX] ?? 0;
}

export function survivalDirtTerraceAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  return dirtTerraceMaskFor(seed)[tileY * SURVIVAL_WORLD_SIZE + tileX] === 1;
}

const plateauRampCache = new Map<number, readonly SurvivalPlateauRamp[]>();

function generatedRampForComponent(
  seed: number,
  contourLevel: number,
  component: readonly number[],
  elevations: Uint8Array,
): SurvivalPlateauRamp | null {
  const componentSet = new Set(component);
  const centerX = component.reduce((sum, index) => sum + index % SURVIVAL_WORLD_SIZE, 0) / component.length;
  const maximumY = Math.max(...component.map((index) => Math.floor(index / SURVIVAL_WORLD_SIZE)));
  let selected: { readonly tileX: number; readonly upperTileY: number; readonly score: number } | null = null;
  for (const index of component) {
    const tileX = index % SURVIVAL_WORLD_SIZE;
    const upperTileY = Math.floor(index / SURVIVAL_WORLD_SIZE);
    if (tileX <= 1 || tileX >= SURVIVAL_WORLD_SIZE - 2 || upperTileY >= SURVIVAL_WORLD_SIZE - 2) continue;
    const right = index + 1;
    const lowerLeft = index + SURVIVAL_WORLD_SIZE;
    const lowerRight = lowerLeft + 1;
    const approachLeft = lowerLeft + SURVIVAL_WORLD_SIZE;
    const approachRight = approachLeft + 1;
    if (!componentSet.has(right)
      || elevations[index] !== contourLevel || elevations[right] !== contourLevel
      || elevations[lowerLeft] !== contourLevel - 1 || elevations[lowerRight] !== contourLevel - 1
      || elevations[approachLeft] !== contourLevel - 1 || elevations[approachRight] !== contourLevel - 1) continue;
    const waterFeature = [index, right, lowerLeft, lowerRight, approachLeft, approachRight]
      .some((candidate) => {
        const x = candidate % SURVIVAL_WORLD_SIZE;
        const y = Math.floor(candidate / SURVIVAL_WORLD_SIZE);
        return survivalLakeAt(seed, x, y) || survivalStreamAt(seed, x, y)
          || survivalOasisDistanceSquared(seed, x, y) <= 46;
      });
    if (waterFeature) continue;
    const score = (maximumY - upperTileY) * 100_000
      + Math.round(Math.abs(tileX + 0.5 - centerX) * 1_000)
      + hash(seed ^ Math.imul(contourLevel, 0x45d9f3b), tileX, upperTileY) % 1_000;
    if (selected === null || score < selected.score) selected = { tileX, upperTileY, score };
  }
  return selected === null ? null : {
    contourLevel,
    tileX: selected.tileX,
    tileY: selected.upperTileY + 1,
  };
}

/** One deterministic, two-tile south-facing slope is generated for every
 * connected contour. That keeps each mountain level reachable without making
 * the elevation mask depend on art frame ids. */
export function survivalPlateauRamps(seed: number): readonly SurvivalPlateauRamp[] {
  const cached = plateauRampCache.get(seed);
  if (cached) return cached;
  const elevations = elevationMaskFor(seed);
  const ramps: SurvivalPlateauRamp[] = [];
  for (let contourLevel = 1; contourLevel <= SURVIVAL_MAX_TERRAIN_ELEVATION; contourLevel += 1) {
    const visited = new Uint8Array(elevations.length);
    for (let start = 0; start < elevations.length; start += 1) {
      if (elevations[start]! < contourLevel || visited[start] === 1) continue;
      const component = [start];
      visited[start] = 1;
      for (let cursor = 0; cursor < component.length; cursor += 1) {
        const index = component[cursor]!;
        const tileX = index % SURVIVAL_WORLD_SIZE;
        for (const neighbor of [
          index - 1,
          index + 1,
          index - SURVIVAL_WORLD_SIZE,
          index + SURVIVAL_WORLD_SIZE,
        ]) {
          if (neighbor < 0 || neighbor >= elevations.length || visited[neighbor] === 1
            || elevations[neighbor]! < contourLevel
            || Math.abs(neighbor % SURVIVAL_WORLD_SIZE - tileX) > 1) continue;
          visited[neighbor] = 1;
          component.push(neighbor);
        }
      }
      const ramp = generatedRampForComponent(seed, contourLevel, component, elevations);
      if (ramp !== null) ramps.push(ramp);
    }
  }
  ramps.sort((left, right) => left.contourLevel - right.contourLevel
    || left.tileY - right.tileY || left.tileX - right.tileX);
  plateauRampCache.set(seed, ramps);
  return ramps;
}

export function survivalTerrainTransitions(seed: number): readonly TerrainTransition[] {
  return survivalPlateauRamps(seed).flatMap((ramp) => [0, 1].map((lane): TerrainTransition => ({
    contourLevel: ramp.contourLevel,
    kind: 'slope',
    direction: 'up',
    lowerTileX: ramp.tileX + lane,
    lowerTileY: ramp.tileY,
    upperTileX: ramp.tileX + lane,
    upperTileY: ramp.tileY - 1,
  })));
}

export function survivalDirtTerraceRamps(seed: number): readonly SurvivalPlateauRamp[] {
  void seed;
  return [];
}

function plateauRampRoleAt(
  seed: number,
  contourLevel: number,
  tileX: number,
  tileY: number,
): SurvivalCliffRole {
  for (const ramp of survivalPlateauRamps(seed)) {
    if (ramp.contourLevel !== contourLevel) continue;
    if (tileX === ramp.tileX && tileY === ramp.tileY - 1) return 'ramp_top_left';
    if (tileX === ramp.tileX + 1 && tileY === ramp.tileY - 1) return 'ramp_top_right';
    if (tileX === ramp.tileX && tileY === ramp.tileY) return 'ramp_bottom_left';
    if (tileX === ramp.tileX + 1 && tileY === ramp.tileY) return 'ramp_bottom_right';
  }
  return 'none';
}

export function survivalRaisedTerrainPlansAt(
  seed: number,
  tileX: number,
  tileY: number,
): readonly RaisedTerrainContourPlan[] {
  return resolveRaisedTerrainContoursAt(
    (x, y) => survivalTerrainHeightAt(seed, x, y),
    SURVIVAL_MAX_TERRAIN_ELEVATION,
    SURVIVAL_RAISED_CLIFF_TILE_SET,
    'tall',
    tileX,
    tileY,
    (contourLevel, x, y) => {
      const role = plateauRampRoleAt(seed, contourLevel, x, y);
      return role === 'none' ? null : role as RaisedTerrainRampRole;
    },
  );
}

const raisedTerrainBlockingCache = new Map<number, Uint8Array>();

export function survivalRaisedTerrainBlocksMovementAt(
  seed: number,
  tileX: number,
  tileY: number,
): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  let cache = raisedTerrainBlockingCache.get(seed);
  if (!cache) {
    cache = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    cache.fill(255);
    raisedTerrainBlockingCache.set(seed, cache);
  }
  const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
  if (cache[index] === 255) {
    cache[index] = Number(survivalRaisedTerrainPlansAt(seed, tileX, tileY)
      .some(({ plan }) => plan.blocksMovement));
  }
  return cache[index] === 1;
}

function horizontalRole(
  left: boolean,
  right: boolean,
  roles: readonly [SurvivalCliffRole, SurvivalCliffRole, SurvivalCliffRole],
): SurvivalCliffRole {
  return !left ? roles[0] : !right ? roles[2] : roles[1];
}

function plateauSouthFaceAt(seed: number, tileX: number, tileY: number): boolean {
  if (!survivalPlateauAt(seed, tileX, tileY) || survivalPlateauAt(seed, tileX, tileY + 1)) return false;
  const role = plateauRampRoleAt(seed, 1, tileX, tileY);
  return !role.startsWith('ramp_');
}

const cliffRoleCache = new Map<number, Uint8Array>();
const raisedTerrainGridCache = new Map<number, RaisedTerrainGrid>();

function raisedTerrainGridFor(seed: number): RaisedTerrainGrid {
  let grid = raisedTerrainGridCache.get(seed);
  if (!grid) {
    grid = {
      raisedAt: (tileX, tileY) => survivalPlateauAt(seed, tileX, tileY),
      rampRoleAt: (tileX, tileY) => {
        const role = plateauRampRoleAt(seed, 1, tileX, tileY);
        return role === 'none' ? null : role as RaisedTerrainRampRole;
      },
    };
    raisedTerrainGridCache.set(seed, grid);
  }
  return grid;
}

/** Boundary roles drive collision; blob47 selects the connected authored art. */
function classifySurvivalCliffRoleAt(seed: number, tileX: number, tileY: number): SurvivalCliffRole {
  const ramp = plateauRampRoleAt(seed, 1, tileX, tileY);
  if (ramp !== 'none') return ramp;
  if (survivalPlateauAt(seed, tileX, tileY)) return raisedTerrainEdgeRoleAt(
    raisedTerrainGridFor(seed), tileX, tileY,
  ) ?? 'none';
  if (plateauSouthFaceAt(seed, tileX, tileY - 1)) {
    return horizontalRole(
      plateauSouthFaceAt(seed, tileX - 1, tileY - 1),
      plateauSouthFaceAt(seed, tileX + 1, tileY - 1),
      ['wall_left', 'wall', 'wall_right'],
    );
  }
  if (plateauSouthFaceAt(seed, tileX, tileY - 2)) {
    return horizontalRole(
      plateauSouthFaceAt(seed, tileX - 1, tileY - 2),
      plateauSouthFaceAt(seed, tileX + 1, tileY - 2),
      ['lower_wall_left', 'lower_wall', 'lower_wall_right'],
    );
  }
  if (plateauSouthFaceAt(seed, tileX, tileY - 3)) {
    return horizontalRole(
      plateauSouthFaceAt(seed, tileX - 1, tileY - 3),
      plateauSouthFaceAt(seed, tileX + 1, tileY - 3),
      ['foot_left', 'foot', 'foot_right'],
    );
  }
  return 'none';
}

export function survivalCliffRoleAt(seed: number, tileX: number, tileY: number): SurvivalCliffRole {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'none';
  let roles = cliffRoleCache.get(seed);
  if (!roles) {
    roles = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    roles.fill(255);
    cliffRoleCache.set(seed, roles);
  }
  const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
  const cached = roles[index]!;
  if (cached !== 255) return SURVIVAL_CLIFF_ROLES[cached] ?? 'none';
  const role = classifySurvivalCliffRoleAt(seed, tileX, tileY);
  roles[index] = SURVIVAL_CLIFF_ROLES.indexOf(role);
  return role;
}

export function survivalDirtCliffRoleAt(seed: number, tileX: number, tileY: number): SurvivalDirtCliffRole {
  for (const ramp of survivalDirtTerraceRamps(seed)) {
    if (tileX === ramp.tileX && tileY === ramp.tileY) return 'ramp_top_left';
    if (tileX === ramp.tileX + 1 && tileY === ramp.tileY) return 'ramp_top_right';
    if (tileX === ramp.tileX && tileY === ramp.tileY + 1) return 'ramp_bottom_left';
    if (tileX === ramp.tileX + 1 && tileY === ramp.tileY + 1) return 'ramp_bottom_right';
  }
  if (!survivalDirtTerraceAt(seed, tileX, tileY)) return 'none';
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (!survivalDirtTerraceAt(seed, tileX + offsetX, tileY + offsetY)) return 'edge';
    }
  }
  return 'none';
}

function survivalLakeCenters(seed: number): readonly WaterFeatureCenter[] {
  return [
    { tileX: worldTile(151 + hash(seed ^ 0x19da2351, 1, 0) % 18), tileY: worldTile(47 + hash(seed ^ 0x19da2351, 1, 1) % 14), radius: 11 },
    { tileX: worldTile(235 + hash(seed ^ 0x43c05f19, 2, 0) % 18), tileY: worldTile(91 + hash(seed ^ 0x43c05f19, 2, 1) % 20), radius: 12 },
    { tileX: worldTile(247 + hash(seed ^ 0x0bc91a77, 3, 0) % 16), tileY: worldTile(180 + hash(seed ^ 0x0bc91a77, 3, 1) % 20), radius: 10 },
    { tileX: worldTile(157 + hash(seed ^ 0x51b7df03, 4, 0) % 24), tileY: worldTile(257 + hash(seed ^ 0x51b7df03, 4, 1) % 14), radius: 13 },
    { tileX: worldTile(67 + hash(seed ^ 0x79a12e65, 5, 0) % 20), tileY: worldTile(154 + hash(seed ^ 0x79a12e65, 5, 1) % 26), radius: 9 },
  ];
}

function survivalLakeAt(seed: number, tileX: number, tileY: number): boolean {
  const edgeNoise = fractalNoise(seed ^ 0x2d130d8f, islandTile(tileX), islandTile(tileY), 18, 3) - 512;
  return survivalLakeCenters(seed).some((lake) => {
    const dx = tileX - lake.tileX;
    const dy = tileY - lake.tileY;
    return dx * dx + dy * dy <= lake.radius * lake.radius + Math.trunc(edgeNoise / 12);
  });
}

function survivalWaterfallFirstRow(seed: number): number {
  return worldTile(92 + hash(seed ^ 0x53f58e21, 0, 0) % 17);
}

function rawMainStreamCenterAt(seed: number, tileY: number): number {
  return worldTile(160 + Math.trunc((fractalNoise(
    seed ^ 0x7be621d3,
    0,
    islandTile(tileY),
    42,
    3,
  ) - 512) / 18));
}

export function survivalMainStreamCenterAt(seed: number, tileY: number): number {
  const waterfallRow = survivalWaterfallFirstRow(seed);
  const waterfallCenter = rawMainStreamCenterAt(seed, waterfallRow);
  if (tileY >= waterfallRow && tileY < waterfallRow + 5) return waterfallCenter;
  const downstreamStep = tileY - (waterfallRow + 4);
  if (downstreamStep > 0 && downstreamStep < 13) {
    const blend = smoothFraction(downstreamStep, 13);
    return lerpInteger(waterfallCenter, rawMainStreamCenterAt(seed, tileY), blend, 13);
  }
  return rawMainStreamCenterAt(seed, tileY);
}

function survivalMainStreamAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileY < worldTile(52) || tileY > worldTile(271)) return false;
  const centerX = survivalMainStreamCenterAt(seed, tileY);
  return Math.abs(tileX - centerX) <= 1;
}

function survivalTributaryAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileX < worldTile(160) || tileX > worldTile(254)) return false;
  const centerY = worldTile(110 + Math.trunc((fractalNoise(
    seed ^ 0x32ef6b49,
    islandTile(tileX),
    0,
    38,
    3,
  ) - 512) / 20));
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
      tileX: worldTile(70 + hash(seed ^ 0x66e31a05, 0, 0) % 26),
      tileY: worldTile(218 + hash(seed ^ 0x66e31a05, 0, 1) % 27),
      radius: 5,
    },
    {
      tileX: worldTile(220 + hash(seed ^ 0x24d80bf3, 1, 0) % 25),
      tileY: worldTile(215 + hash(seed ^ 0x24d80bf3, 1, 1) % 24),
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

export function survivalBiomeAt(seed: number, tileX: number, tileY: number): SurvivalBiome {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'water';
  if (tileX < 3 || tileY < 3 || tileX >= SURVIVAL_WORLD_SIZE - 3 || tileY >= SURVIVAL_WORLD_SIZE - 3) return 'water';

  const sample = survivalTerrainSample(seed, tileX, tileY);
  const desert = survivalDesertClimateAt(sample);
  const savanna = survivalSavannaClimateAt(sample);
  if (!survivalIslandAt(seed, tileX, tileY)) return 'water';
  if (sample.coastDepth < survivalShoreDepthAt(seed, tileX, tileY)) {
    // A coast-depth band is not a valid raised-terrain contour. Treat it as
    // shore until a deliberate height contour is resolved through the shared
    // layered cliff utility; selecting cliff frames per noisy beach cell makes
    // disconnected rock dashes and perspective-invalid side walls.
    if (desert) return 'desert_shore';
    return 'beach';
  }

  const oasisDistance = survivalOasisDistanceSquared(seed, tileX, tileY);
  if (oasisDistance <= 22) return 'oasis_water';
  if (oasisDistance <= 46) return 'desert_shore';
  if (oasisDistance <= 128) return 'oasis';

  const freshwater = !desert && (survivalLakeAt(seed, tileX, tileY) || survivalStreamAt(seed, tileX, tileY));
  if (freshwater) return survivalWaterfallAt(seed, tileX, tileY) ? 'waterfall' : 'freshwater';

  const cliffRole = survivalCliffRoleAt(seed, tileX, tileY);
  if (cliffRole.startsWith('ramp_')) return 'highland';
  if (survivalRaisedTerrainBlocksMovementAt(seed, tileX, tileY)) return 'ridge';
  if (survivalTerrainHeightAt(seed, tileX, tileY) > 0) return 'highland';

  const dirtCliffRole = survivalDirtCliffRoleAt(seed, tileX, tileY);
  if (dirtCliffRole.startsWith('ramp_')) return 'dirt_terrace';
  if (dirtCliffRole === 'edge') return 'dirt_ridge';
  if (survivalDirtTerraceAt(seed, tileX, tileY)) return 'dirt_terrace';

  if (desert) {
    if (sample.elevation >= 780 && sample.erosion < 550) return 'desert_ridge';
    return 'desert';
  }
  if (savanna) return 'savanna';

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

/** Shared terrain-medium rule used by authority, prediction, wildlife, and
 * future vehicles. Water traversal includes calm ocean/inland water, but not
 * shore blends or waterfalls; air ignores terrain while remaining in bounds. */
export function survivalBiomeBlocksTraversal(biome: SurvivalBiome, medium: MovementMedium): boolean {
  if (medium === 'air') return false;
  if (medium === 'water') {
    return biome !== 'water' && biome !== 'freshwater' && biome !== 'oasis_water';
  }
  return survivalBiomeBlocksMovement(biome);
}

export function survivalDecorationBlocksTraversal(kind: SurvivalDecorationKind, medium: MovementMedium): boolean {
  if (medium === 'water') return kind === 'nature_water_rock';
  if (medium !== 'ground') return false;
  return kind === 'camp_tent' || kind === 'camp_campfire' || kind === 'camp_round_stool'
    || kind === 'camp_bench' || kind === 'camp_stump_seat' || kind === 'camp_chair'
    || kind === 'camp_pond' || kind === 'camp_rock';
}

/** Water rocks occupy their authored tile for swimmers and watercraft. */
export function survivalWaterRockObstacle(tileX: number, tileY: number): CollisionObstacle {
  return {
    left: tileX * TILE_SIZE_FIXED,
    top: tileY * TILE_SIZE_FIXED,
    right: (tileX + 1) * TILE_SIZE_FIXED - 1,
    bottom: (tileY + 1) * TILE_SIZE_FIXED - 1,
  };
}

/** Campsite sprites use their ground-contact tile as the authored anchor.
 * The tent reserves only its two upper rows, leaving its three entrance tiles
 * walkable. The pond retains a complete 3x3 footprint; small props use one
 * tile. This single rule is shared by server authority and prediction. */
export function survivalDecorationObstacle(
  decoration: Pick<GeneratedSurvivalDecoration, 'kind' | 'tileX' | 'tileY'>,
  medium: MovementMedium,
): CollisionObstacle | null {
  if (!survivalDecorationBlocksTraversal(decoration.kind, medium)) return null;
  if (decoration.kind === 'nature_water_rock') {
    return survivalWaterRockObstacle(decoration.tileX, decoration.tileY);
  }
  const wide = decoration.kind === 'camp_tent' || decoration.kind === 'camp_pond';
  return {
    left: (decoration.tileX - (wide ? 1 : 0)) * TILE_SIZE_FIXED,
    top: (decoration.tileY - (wide ? 2 : 0)) * TILE_SIZE_FIXED,
    right: (decoration.tileX + (wide ? 2 : 1)) * TILE_SIZE_FIXED - 1,
    bottom: (decoration.tileY + (decoration.kind === 'camp_tent' ? 0 : 1)) * TILE_SIZE_FIXED - 1,
  };
}

/** Low, inland water can be cleared by a mounted jump. Ocean edges,
 * waterfalls, and every elevated/cliff biome remain solid. */
export function survivalBiomeAllowsHorseJump(biome: SurvivalBiome): boolean {
  return biome === 'freshwater' || biome === 'oasis_water';
}

export function isChoppableTreeKind(kind: string): boolean {
  return kind === 'tree' || (SURVIVAL_TREE_KINDS as readonly string[]).includes(kind);
}

export function isRegrowingPlantKind(kind: string): boolean {
  return isChoppableTreeKind(kind) || (SURVIVAL_REGROWING_PLANT_KINDS as readonly string[]).includes(kind);
}

export function isAxeHarvestableResourceKind(kind: string): boolean {
  return isRegrowingPlantKind(kind);
}

export function isFruitTreeKind(kind: string): kind is SurvivalFruitTreeKind {
  return (SURVIVAL_FRUIT_TREE_KINDS as readonly string[]).includes(kind);
}

export function isMineableOreKind(kind: string): kind is SurvivalOreKind {
  return (SURVIVAL_ORE_KINDS as readonly string[]).includes(kind);
}

export function isBreakableRockKind(kind: string): kind is SurvivalRockKind {
  return (SURVIVAL_ROCK_KINDS as readonly string[]).includes(kind);
}

export function rawOreItemKindForResource(kind: SurvivalOreKind): string {
  return `${kind.slice('ore_'.length)}_ore`;
}

export function survivalResourceInitialHealth(kind: string, treeGrowthStage = TREE_GROWTH_STAGE_BIG): number {
  if (isMineableOreKind(kind)) return ORE_NODE_RESERVE_HITS;
  if (isBreakableRockKind(kind)) return LARGE_ROCK_INITIAL_HEALTH;
  if (isGatherableResourceKind(kind)) return 1;
  return isRegrowingPlantKind(kind) ? treeHealthForGrowthStage(treeGrowthStage) : 3;
}

export interface SurvivalResourceDrop {
  readonly itemKind: string;
  readonly quantity: number;
}

const FRUIT_ITEM_BY_TREE: Readonly<Record<SurvivalFruitTreeKind, string>> = {
  tree_apple: 'apple',
  tree_pear: 'pear',
  tree_peach: 'peach',
  tree_cherry: 'cherry',
};

/** Returns the authoritative drop produced by this completed hit. Ore veins
 * pay out steadily while retaining a large finite reserve for shared mining. */
export function survivalResourceDropAfterHit(
  kind: string,
  remainingHealth: number,
  treeGrowthStage = TREE_GROWTH_STAGE_BIG,
): SurvivalResourceDrop | null {
  if (isMineableOreKind(kind)) {
    const hitsTaken = ORE_NODE_RESERVE_HITS - remainingHealth;
    return hitsTaken > 0 && hitsTaken % ORE_HITS_PER_DROP === 0
      ? { itemKind: rawOreItemKindForResource(kind), quantity: 1 }
      : null;
  }
  if (isBreakableRockKind(kind)) {
    const hitsTaken = LARGE_ROCK_INITIAL_HEALTH - remainingHealth;
    return hitsTaken > 0 && (hitsTaken % 5 === 2 || hitsTaken % 5 === 0)
      ? { itemKind: 'stone', quantity: 1 }
      : null;
  }
  if (!isRegrowingPlantKind(kind) || remainingHealth !== 0) return null;
  const stage = normalizeTreeGrowthStage(treeGrowthStage);
  if (kind === 'cactus') return { itemKind: 'cactus', quantity: stage };
  return stage === TREE_GROWTH_STAGE_BIG
    ? { itemKind: 'wood', quantity: 3 }
    : stage === TREE_GROWTH_STAGE_MEDIUM
      ? { itemKind: 'wood', quantity: 1 }
      : { itemKind: 'stick', quantity: 1 };
}

/** A felled fruit tree yields normal timber plus its matching authored fruit. */
export function survivalResourceDropsAfterHit(
  kind: string,
  remainingHealth: number,
  treeGrowthStage = TREE_GROWTH_STAGE_BIG,
): readonly SurvivalResourceDrop[] {
  const primary = survivalResourceDropAfterHit(kind, remainingHealth, treeGrowthStage);
  if (primary === null) return [];
  return isFruitTreeKind(kind) && remainingHealth === 0
    && normalizeTreeGrowthStage(treeGrowthStage) === TREE_GROWTH_STAGE_BIG
    ? [primary, { itemKind: FRUIT_ITEM_BY_TREE[kind], quantity: 2 }]
    : [primary];
}

export function survivalGatherableDrop(kind: string): SurvivalResourceDrop | null {
  if (kind === 'loose_stone') return { itemKind: 'stone', quantity: 1 };
  if (kind === 'fallen_branch') return { itemKind: 'wood', quantity: 1 };
  return null;
}

function naturalSpawnTile(slot: number): SurvivalSpawnTile | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 25) return null;
  const originX = worldTile(112 + slot % 5 * 24);
  const originY = worldTile(112 + Math.floor(slot / 5) * 24);
  for (let radius = 0; radius <= 11; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const tileX = originX + offsetX;
        const tileY = originY + offsetY;
        if (!survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY))) {
          return { slot, tileX, tileY };
        }
      }
    }
  }
  return null;
}

let spawnTilesCache: readonly SurvivalSpawnTile[] | null = null;

/** Spawn slots select nearby natural walkable terrain without painting plots or roads. */
export function survivalSpawnTiles(): readonly SurvivalSpawnTile[] {
  if (spawnTilesCache === null) {
    spawnTilesCache = Array.from({ length: 25 }, (_, slot) => naturalSpawnTile(slot)).filter(
      (tile): tile is SurvivalSpawnTile => tile !== null,
    );
  }
  return spawnTilesCache;
}

export function survivalSpawnPosition(slot: number): { readonly x: number; readonly y: number } | null {
  if (!Number.isInteger(slot) || slot < 0) return null;
  const legacySpawns = survivalSpawnTiles();
  let spawn = legacySpawns.find((tile) => tile.slot === slot) ?? null;
  if (spawn === null) {
    const occupied = new Set(legacySpawns.map((tile) => `${tile.tileX},${tile.tileY}`));
    for (let index = legacySpawns.length; index <= slot; index += 1) {
      spawn = findSurvivalSpawnTile(occupied);
      if (spawn === null) return null;
      occupied.add(`${spawn.tileX},${spawn.tileY}`);
    }
  }
  if (!spawn) return null;
  return {
    x: spawn.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: spawn.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
}

/** Finds the next free natural tile without imposing a player-slot ceiling. */
export function findSurvivalSpawnTile(occupiedTiles: ReadonlySet<string>): SurvivalSpawnTile | null {
  for (const legacy of survivalSpawnTiles()) {
    if (!occupiedTiles.has(`${legacy.tileX},${legacy.tileY}`)) return legacy;
  }
  const centerX = worldTile(160);
  const centerY = worldTile(160);
  for (let radius = 0; radius <= SURVIVAL_SPAWN_SEARCH_RADIUS_TILES; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const tileX = centerX + offsetX;
        const tileY = centerY + offsetY;
        if (occupiedTiles.has(`${tileX},${tileY}`)) continue;
        if (survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY))) continue;
        if (generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, tileX, tileY) !== null) continue;
        return { slot: occupiedTiles.size, tileX, tileY };
      }
    }
  }
  return null;
}

export function survivalSpawnProtectedAt(tileX: number, tileY: number): boolean {
  return survivalSpawnTiles().some((spawn) => {
    const dx = tileX - spawn.tileX;
    const dy = tileY - spawn.tileY;
    return dx * dx + dy * dy <= 4;
  });
}

/** Forest-scale noise gives each grove a dominant species while retaining a
 * smaller mix of the other two species inside the same grove. */
export function survivalTreeKindAt(seed: number, tileX: number, tileY: number): SurvivalTreeKind {
  const biome = survivalBiomeAt(seed, tileX, tileY);
  const localX = islandTile(tileX);
  const localY = islandTile(tileY);
  if (biome === 'oasis') return hash(seed ^ 0x442c0197, localX, localY) % 100 < 76 ? 'tree_palm' : 'tree_acacia';
  if (biome === 'desert' || biome === 'desert_shore') return 'tree_acacia';
  if (biome === 'savanna') return hash(seed ^ 0x110d3ac7, localX, localY) % 100 < 72 ? 'tree_acacia' : 'tree_oak';
  let besideRiver = false;
  for (let offsetY = -2; offsetY <= 2 && !besideRiver; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      if (survivalStreamAt(seed, tileX + offsetX, tileY + offsetY)) {
        besideRiver = true;
        break;
      }
    }
  }
  if (besideRiver && hash(seed ^ 0x46525549, localX, localY) % 100 < 10) {
    return SURVIVAL_FRUIT_TREE_KINDS[
      hash(seed ^ 0x46525459, localX, localY) % SURVIVAL_FRUIT_TREE_KINDS.length
    ]!;
  }
  const grove = valueNoise(seed ^ 0x71e4a539, localX, localY, 24);
  const temperateKinds = 3;
  const dominant = Math.min(temperateKinds - 1, Math.floor(grove * temperateKinds / 1024));
  const variation = hash(seed ^ 0x35b17d63, localX, localY) % 100;
  const offset = variation < 68 ? 0 : variation < 86 ? 1 : 2;
  return SURVIVAL_TREE_KINDS[(dominant + offset) % temperateKinds]!;
}

function cliffBiome(biome: SurvivalBiome): boolean {
  return biome === 'ridge' || biome === 'desert_ridge' || biome === 'coastal_cliff';
}

/** True for walkable ground immediately below or alongside authored cliff
 * terrain. This semantic distinction keeps ore placement off elevated tiles. */
type SurvivalBiomeLookup = (tileX: number, tileY: number) => SurvivalBiome;

function survivalOreNearCliffWith(tileX: number, tileY: number, biomeAt: SurvivalBiomeLookup): boolean {
  if (survivalBiomeBlocksMovement(biomeAt(tileX, tileY))) return false;
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (cliffBiome(biomeAt(tileX + offsetX, tileY + offsetY))) return true;
    }
  }
  return false;
}

export function survivalOreNearCliffAt(seed: number, tileX: number, tileY: number): boolean {
  return survivalOreNearCliffWith(tileX, tileY, (x, y) => survivalBiomeAt(seed, x, y));
}

export function survivalOreKindAt(seed: number, tileX: number, tileY: number): SurvivalOreKind {
  return SURVIVAL_ORE_KINDS[
    hash(seed ^ 0x6c8e9cf5, islandTile(tileX), islandTile(tileY)) % SURVIVAL_ORE_KINDS.length
  ]!;
}

/** Keep a broad, readable path through and around every authored ramp. The
 * player hitbox is wider than one tile and resource trunks otherwise turn a
 * visually open two-tile entrance into an invisible collision pinch point. */
function survivalRampApproachAt(seed: number, tileX: number, tileY: number): boolean {
  const nearRamp = (ramp: SurvivalPlateauRamp): boolean => tileX >= ramp.tileX - 1
    && tileX <= ramp.tileX + 2
    && tileY >= ramp.tileY - 2
    && tileY <= ramp.tileY + 4;
  return survivalPlateauRamps(seed).some(nearRamp) || survivalDirtTerraceRamps(seed).some(nearRamp);
}

interface RareOreLayout {
  readonly biomes: readonly SurvivalBiome[];
  readonly biomeAt: SurvivalBiomeLookup;
  readonly ores: readonly GeneratedSurvivalResource[];
  readonly oreById: ReadonlyMap<number, GeneratedSurvivalResource>;
  readonly decorations: readonly GeneratedSurvivalDecoration[];
  readonly decorationTiles: ReadonlySet<number>;
}

const rareOreLayoutCache = new Map<number, RareOreLayout>();

function biomeGridFor(seed: number): readonly SurvivalBiome[] {
  return Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) =>
    survivalBiomeAt(seed, index % SURVIVAL_WORLD_SIZE, Math.floor(index / SURVIVAL_WORLD_SIZE)));
}

function biomeLookupFor(biomes: readonly SurvivalBiome[]): SurvivalBiomeLookup {
  return (tileX, tileY) => tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE
    ? 'water'
    : biomes[tileY * SURVIVAL_WORLD_SIZE + tileX]!;
}

function resourceTileId(tileX: number, tileY: number): number {
  return tileY * SURVIVAL_WORLD_SIZE + tileX + 1;
}

const POI_OFFSETS = [
  [-3, -2], [-2, -3], [-1, -3], [1, -3], [2, -3], [3, -2],
  [3, -1], [3, 1], [3, 2], [2, 3], [1, 3], [-1, 3],
  [-2, 3], [-3, 2], [-3, 1], [-3, -1], [-2, -2], [2, -2],
  [2, 2], [-2, 2], [-2, 0], [2, 0], [0, -2], [0, 2],
] as const;

const NATURE_VARIANT_COUNTS: Readonly<Record<SurvivalNatureDecorationKind, number>> = {
  nature_grass: 3,
  nature_flower_grass: 15,
  nature_flower: 5,
  nature_mushroom: 8,
  nature_lily_pad: 12,
  nature_water_flower: 12,
  nature_cattail: 5,
  nature_water_grass: 2,
  nature_water_rock: 10,
  nature_fish_shadow: 1,
  nature_desert_grass: 3,
  nature_desert_fern: 1,
  nature_desert_bush: 2,
  nature_desert_plant: 3,
  nature_desert_rock: 4,
};

function natureGroundBiome(biome: SurvivalBiome): boolean {
  return biome === 'plains' || biome === 'meadow' || biome === 'forest'
    || biome === 'valley' || biome === 'highland' || biome === 'savanna'
    || biome === 'oasis';
}

function pondWaterBiome(biome: SurvivalBiome): boolean {
  return biome === 'freshwater' || biome === 'oasis_water';
}

function waterSquareAt(tileX: number, tileY: number, radius: number, biomeAt: SurvivalBiomeLookup): boolean {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (!pondWaterBiome(biomeAt(tileX + offsetX, tileY + offsetY))) return false;
    }
  }
  return true;
}

interface FlowerGroveCenter {
  readonly tileX: number;
  readonly tileY: number;
  readonly radius: number;
  readonly score: number;
}

function generateNatureDecorations(
  seed: number,
  biomeAt: SurvivalBiomeLookup,
  resourceExclusionTiles: ReadonlySet<number>,
  initialDecorations: readonly GeneratedSurvivalDecoration[],
): GeneratedSurvivalDecoration[] {
  const decorations: GeneratedSurvivalDecoration[] = [];
  const occupiedTiles = new Set(initialDecorations.map((decoration) => resourceTileId(decoration.tileX, decoration.tileY)));
  const islandMinimum = SURVIVAL_ISLAND_OFFSET_TILES;
  const islandMaximum = islandMinimum + SURVIVAL_ISLAND_SIZE;

  const add = (kind: SurvivalNatureDecorationKind, tileX: number, tileY: number): boolean => {
    const tileId = resourceTileId(tileX, tileY);
    if (occupiedTiles.has(tileId) || resourceExclusionTiles.has(tileId)) return false;
    const localX = islandTile(tileX);
    const localY = islandTile(tileY);
    decorations.push({
      id: 2_000_000_000 + tileId * 16 + SURVIVAL_NATURE_DECORATION_KINDS.indexOf(kind),
      kind,
      tileX,
      tileY,
      variant: hash(seed ^ 0x56415249, localX, localY) % NATURE_VARIANT_COUNTS[kind],
      animationOffset: hash(seed ^ 0x50484153, localX, localY) % 96,
    });
    occupiedTiles.add(tileId);
    return true;
  };
  const validGround = (tileX: number, tileY: number): boolean => {
    if (!natureGroundBiome(biomeAt(tileX, tileY)) || survivalSpawnProtectedAt(tileX, tileY)
      || survivalMarlowCampReservedAt(tileX, tileY)) return false;
    return survivalCliffRoleAt(seed, tileX, tileY) === 'none'
      && survivalDirtCliffRoleAt(seed, tileX, tileY) === 'none'
      && !survivalRampApproachAt(seed, tileX, tileY);
  };
  const validDesertGround = (tileX: number, tileY: number): boolean => {
    const biome = biomeAt(tileX, tileY);
    if (biome !== 'desert' && biome !== 'desert_shore') return false;
    if (survivalSpawnProtectedAt(tileX, tileY) || survivalMarlowCampReservedAt(tileX, tileY)) return false;
    return survivalCliffRoleAt(seed, tileX, tileY) === 'none'
      && survivalDirtCliffRoleAt(seed, tileX, tileY) === 'none'
      && !survivalRampApproachAt(seed, tileX, tileY);
  };

  // Pick well-separated grove centres from independent island cells, then fill
  // each irregular footprint with several authored flower silhouettes.
  const groveCandidates: FlowerGroveCenter[] = [];
  for (let localY = 8; localY < SURVIVAL_ISLAND_SIZE - 8; localY += 14) {
    for (let localX = 8; localX < SURVIVAL_ISLAND_SIZE - 8; localX += 14) {
      const tileX = worldTile(localX + hash(seed ^ 0x47525821, localX, localY) % 10 - 5);
      const tileY = worldTile(localY + hash(seed ^ 0x47525921, localX, localY) % 10 - 5);
      const biome = biomeAt(tileX, tileY);
      if ((biome !== 'meadow' && biome !== 'plains' && biome !== 'valley') || !validGround(tileX, tileY)) continue;
      groveCandidates.push({
        tileX,
        tileY,
        radius: 4 + hash(seed ^ 0x47525221, localX, localY) % 3,
        score: hash(seed ^ 0x47525321, localX, localY),
      });
    }
  }
  groveCandidates.sort((left, right) => left.score - right.score);
  const groves: FlowerGroveCenter[] = [];
  for (const candidate of groveCandidates) {
    if (groves.length >= 18) break;
    if (groves.some((grove) => {
      const dx = grove.tileX - candidate.tileX;
      const dy = grove.tileY - candidate.tileY;
      return dx * dx + dy * dy < 20 * 20;
    })) continue;
    groves.push(candidate);
  }
  for (const grove of groves) {
    for (let offsetY = -grove.radius; offsetY <= grove.radius; offsetY += 1) {
      for (let offsetX = -grove.radius; offsetX <= grove.radius; offsetX += 1) {
        const distanceSquared = offsetX * offsetX + offsetY * offsetY;
        if (distanceSquared > grove.radius * grove.radius) continue;
        const tileX = grove.tileX + offsetX;
        const tileY = grove.tileY + offsetY;
        if (!validGround(tileX, tileY)
          || generatedNaturalSurvivalResourceWith(seed, tileX, tileY, biomeAt, occupiedTiles) !== null) continue;
        const density = 76 - Math.trunc(distanceSquared * 36 / (grove.radius * grove.radius));
        if (hash(seed ^ 0x464c4f57, islandTile(tileX), islandTile(tileY)) % 100 >= density) continue;
        const mixed = hash(seed ^ 0x4d495845, islandTile(tileX), islandTile(tileY)) % 100;
        add(mixed < 72 ? 'nature_flower' : 'nature_flower_grass', tileX, tileY);
      }
    }
  }

  // A minority of tree bases receive one to three small mushroom neighbours.
  const mushroomOffsets = [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [0, -1], [-1, -1], [1, -1]] as const;
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      const tree = generatedNaturalSurvivalResourceWith(seed, tileX, tileY, biomeAt, occupiedTiles);
      if (tree === null || !isChoppableTreeKind(tree.kind)
        || hash(seed ^ 0x4d555348, islandTile(tileX), islandTile(tileY)) % 100 >= 11) continue;
      const count = 1 + hash(seed ^ 0x4d554e4d, islandTile(tileX), islandTile(tileY)) % 3;
      const start = hash(seed ^ 0x4d554f46, islandTile(tileX), islandTile(tileY)) % mushroomOffsets.length;
      let placed = 0;
      for (let attempt = 0; attempt < mushroomOffsets.length && placed < count; attempt += 1) {
        const offset = mushroomOffsets[(start + attempt * 3) % mushroomOffsets.length]!;
        const targetX = tileX + offset[0];
        const targetY = tileY + offset[1];
        if (!validGround(targetX, targetY)
          || generatedNaturalSurvivalResourceWith(seed, targetX, targetY, biomeAt, occupiedTiles) !== null) continue;
        if (add('nature_mushroom', targetX, targetY)) placed += 1;
      }
    }
  }

  // Every pond decoration requires a complete 3x3 water neighbourhood so no
  // authored water base can overlap shoreline blending. Fish require 5x5.
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      if (!pondWaterBiome(biomeAt(tileX, tileY))) continue;
      const localX = islandTile(tileX);
      const localY = islandTile(tileY);
      const roll = hash(seed ^ 0x504f4e44, localX, localY) % 10_000;
      if (!waterSquareAt(tileX, tileY, 1, biomeAt)) continue;
      if (roll < 100) add('nature_lily_pad', tileX, tileY);
      else if (roll < 170) add('nature_water_flower', tileX, tileY);
      else if (roll < 210) add('nature_cattail', tileX, tileY);
      else if (roll < 250) add('nature_water_grass', tileX, tileY);
      else if (roll < 290) add('nature_water_rock', tileX, tileY);
      else if (roll < 360 && waterSquareAt(tileX, tileY, 2, biomeAt)) add('nature_fish_shadow', tileX, tileY);
    }
  }

  // Ambient grass is intentionally common, but remains sparse enough to keep
  // paths and silhouettes readable. Flower grass adds colour outside groves.
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      if (!validGround(tileX, tileY)) continue;
      const biome = biomeAt(tileX, tileY);
      const chance = biome === 'meadow' ? 1_650 : biome === 'forest' ? 1_250
        : biome === 'valley' ? 1_150 : biome === 'plains' ? 1_000
          : biome === 'highland' ? 720 : biome === 'savanna' ? 520 : 360;
      const roll = hash(seed ^ 0x47524153, islandTile(tileX), islandTile(tileY)) % 10_000;
      if (roll < chance) add('nature_grass', tileX, tileY);
      else if (roll < chance + 150) add('nature_flower_grass', tileX, tileY);
    }
  }
  // Desert ground gets its own restrained authored mix. Resource generation
  // runs against these occupied tiles later, so cacti never overlap a decal.
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      if (!validDesertGround(tileX, tileY)) continue;
      const roll = hash(seed ^ 0x44455350, islandTile(tileX), islandTile(tileY)) % 10_000;
      if (roll < 680) add('nature_desert_grass', tileX, tileY);
      else if (roll < 900) add('nature_desert_fern', tileX, tileY);
      else if (roll < 1_080) add('nature_desert_bush', tileX, tileY);
      else if (roll < 1_260) add('nature_desert_plant', tileX, tileY);
      else if (roll < 1_380) add('nature_desert_rock', tileX, tileY);
    }
  }
  return decorations;
}

function buildRareOreLayout(seed: number): RareOreLayout {
  const biomes = biomeGridFor(seed);
  const biomeAt = biomeLookupFor(biomes);
  const ores: GeneratedSurvivalResource[] = [];
  const selectedTiles = new Set<number>();
  const zonesAcross = 3;
  const zonesDown = 2;
  for (let zone = 0; zone < ORE_NODES_PER_KIND; zone += 1) {
    const zoneX = zone % zonesAcross;
    const zoneY = Math.floor(zone / zonesAcross);
    const minimumX = SURVIVAL_ISLAND_OFFSET_TILES
      + Math.floor(zoneX * SURVIVAL_ISLAND_SIZE / zonesAcross);
    const maximumX = SURVIVAL_ISLAND_OFFSET_TILES
      + Math.floor((zoneX + 1) * SURVIVAL_ISLAND_SIZE / zonesAcross);
    const minimumY = SURVIVAL_ISLAND_OFFSET_TILES
      + Math.floor(zoneY * SURVIVAL_ISLAND_SIZE / zonesDown);
    const maximumY = SURVIVAL_ISLAND_OFFSET_TILES
      + Math.floor((zoneY + 1) * SURVIVAL_ISLAND_SIZE / zonesDown);
    for (let order = 0; order < SURVIVAL_ORE_KINDS.length; order += 1) {
      const kindIndex = (order + zone * 3) % SURVIVAL_ORE_KINDS.length;
      const kind = SURVIVAL_ORE_KINDS[kindIndex]!;
      let best: { readonly tileX: number; readonly tileY: number; readonly score: number } | null = null;
      for (let tileY = minimumY; tileY < maximumY; tileY += 1) {
        for (let tileX = minimumX; tileX < maximumX; tileX += 1) {
          const biome = biomeAt(tileX, tileY);
          if (survivalBiomeBlocksMovement(biome) || survivalSpawnProtectedAt(tileX, tileY)
            || survivalMarlowCampReservedAt(tileX, tileY)
            || survivalCliffRoleAt(seed, tileX, tileY) !== 'none'
            || survivalDirtCliffRoleAt(seed, tileX, tileY) !== 'none'
            || survivalRampApproachAt(seed, tileX, tileY)) continue;
          const id = resourceTileId(tileX, tileY);
          if (selectedTiles.has(id) || ores.some((ore) => {
            const dx = ore.tileX - tileX;
            const dy = ore.tileY - tileY;
            return dx * dx + dy * dy < ORE_MIN_SPACING_TILES * ORE_MIN_SPACING_TILES;
          })) continue;
          const score = hash(
            seed ^ Math.imul(kindIndex + 1, 0x1b873593) ^ Math.imul(zone + 1, 0x45d9f3b),
            islandTile(tileX),
            islandTile(tileY),
          );
          if (best === null || score < best.score) best = { tileX, tileY, score };
        }
      }
      if (best === null) throw new Error(`Unable to place ${kind} in ore zone ${zone}`);
      const resource = {
        id: resourceTileId(best.tileX, best.tileY), kind, tileX: best.tileX, tileY: best.tileY,
      } as const;
      ores.push(resource);
      selectedTiles.add(resource.id);
    }
  }

  const decorations: GeneratedSurvivalDecoration[] = [];
  const decorationTiles = new Set<number>();
  for (const ore of ores) {
    const start = hash(
      seed ^ 0x504f4921,
      islandTile(ore.tileX),
      islandTile(ore.tileY),
    ) % POI_OFFSETS.length;
    for (let attempt = 0; attempt < POI_OFFSETS.length && decorations.filter((decor) =>
      Math.floor(decor.id / 10) === ore.id).length < 3; attempt += 1) {
      const offset = POI_OFFSETS[(start + attempt * 5) % POI_OFFSETS.length]!;
      const tileX = ore.tileX + offset[0];
      const tileY = ore.tileY + offset[1];
      const tileId = resourceTileId(tileX, tileY);
      if (survivalBiomeBlocksMovement(biomeAt(tileX, tileY))
        || survivalSpawnProtectedAt(tileX, tileY)
        || survivalRampApproachAt(seed, tileX, tileY)
        || survivalCliffRoleAt(seed, tileX, tileY) !== 'none'
        || survivalDirtCliffRoleAt(seed, tileX, tileY) !== 'none'
        || selectedTiles.has(tileId) || decorationTiles.has(tileId)) continue;
      const localIndex = decorations.filter((decor) => Math.floor(decor.id / 10) === ore.id).length;
      const kind = SURVIVAL_POI_DECORATION_KINDS[
        hash(seed ^ 0x4445434f, islandTile(tileX), islandTile(tileY)) % SURVIVAL_POI_DECORATION_KINDS.length
      ]!;
      decorations.push({
        id: ore.id * 10 + localIndex,
        kind,
        tileX,
        tileY,
        variant: 0,
        animationOffset: hash(seed ^ 0x504f4941, islandTile(tileX), islandTile(tileY)) % 96,
      });
      decorationTiles.add(tileId);
    }
  }
  const campDecorations = generateMarlowCampDecorations();
  decorations.push(...campDecorations);
  for (const decoration of campDecorations) decorationTiles.add(resourceTileId(decoration.tileX, decoration.tileY));
  decorations.push(...generateNatureDecorations(seed, biomeAt, selectedTiles, decorations));
  return {
    biomes,
    biomeAt,
    ores,
    oreById: new Map(ores.map((ore) => [ore.id, ore])),
    decorations,
    decorationTiles,
  };
}

function rareOreLayout(seed: number): RareOreLayout {
  const cached = rareOreLayoutCache.get(seed);
  if (cached) return cached;
  const generated = buildRareOreLayout(seed);
  rareOreLayoutCache.set(seed, generated);
  return generated;
}

export function generateSurvivalDecorations(seed = SURVIVAL_WORLD_SEED): readonly GeneratedSurvivalDecoration[] {
  return rareOreLayout(seed).decorations;
}

function interactiveDecorationResource(decoration: GeneratedSurvivalDecoration): GeneratedSurvivalResource | null {
  const kind = decoration.kind === 'poi_rock_small' ? 'rock_large'
    : decoration.kind === 'poi_fallen_log' ? 'fallen_branch' : null;
  return kind === null ? null : {
    id: 1_000_000_000 + decoration.id,
    kind,
    tileX: decoration.tileX,
    tileY: decoration.tileY,
  };
}

function generatedNaturalSurvivalResourceWith(
  seed: number,
  tileX: number,
  tileY: number,
  biomeAt: SurvivalBiomeLookup,
  decorationTiles: ReadonlySet<number>,
): GeneratedSurvivalResource | null {
  if (survivalSpawnProtectedAt(tileX, tileY)) return null;
  if (survivalMarlowCampReservedAt(tileX, tileY)) return null;
  if (survivalRampApproachAt(seed, tileX, tileY)) return null;
  if (survivalCliffRoleAt(seed, tileX, tileY) !== 'none') return null;
  if (survivalDirtCliffRoleAt(seed, tileX, tileY) !== 'none') return null;
  if (decorationTiles.has(resourceTileId(tileX, tileY))) return null;
  const biome = biomeAt(tileX, tileY);
  if (survivalBiomeBlocksMovement(biome)) return null;
  const localX = islandTile(tileX);
  const localY = islandTile(tileY);
  if (biome === 'desert' || biome === 'desert_shore') {
    const cellSize = 7;
    const cellX = Math.floor(localX / cellSize);
    const cellY = Math.floor(localY / cellSize);
    const cactusX = cellX * cellSize + hash(seed ^ 0x43414358, cellX, cellY) % cellSize;
    const cactusY = cellY * cellSize + hash(seed ^ 0x43414359, cellX, cellY) % cellSize;
    if (localX === cactusX && localY === cactusY) {
      return { id: resourceTileId(tileX, tileY), kind: 'cactus', tileX, tileY };
    }
  }
  const rockChance = biome === 'beach' || biome === 'desert_shore' || biome === 'oasis' ? 0 : 24;
  if (hash(seed ^ 0x524f434b, localX, localY) % 10_000 < rockChance) {
    return { id: resourceTileId(tileX, tileY), kind: 'loose_stone', tileX, tileY };
  }
  const forestDensity = 38 + Math.trunc(valueNoise(seed ^ 0x19cb47e1, localX, localY, 9) * 28 / 1024);
  const chance = biome === 'forest' ? forestDensity
    : biome === 'highland' ? 12
      : biome === 'dirt_terrace' ? 2
      : biome === 'meadow' ? 10
        : biome === 'valley' ? 7
          : biome === 'plains' ? 4
            : biome === 'oasis' ? 19
              : biome === 'desert' ? 5
                : biome === 'desert_shore' ? 2
                  : biome === 'savanna' ? 8
            : 0;
  if (chance === 0 || hash(seed ^ 0x2ec931ad, localX, localY) % 100 >= chance) return null;
  return {
    id: tileY * SURVIVAL_WORLD_SIZE + tileX + 1,
    kind: survivalTreeKindAt(seed, tileX, tileY),
    tileX,
    tileY,
  };
}

export function generatedSurvivalResourceAt(seed: number, tileX: number, tileY: number): GeneratedSurvivalResource | null {
  const layout = rareOreLayout(seed);
  const decoration = layout.decorations.find((candidate) =>
    candidate.tileX === tileX && candidate.tileY === tileY);
  return layout.oreById.get(resourceTileId(tileX, tileY))
    ?? (decoration === undefined ? null : interactiveDecorationResource(decoration))
    ?? generatedNaturalSurvivalResourceWith(seed, tileX, tileY, layout.biomeAt, layout.decorationTiles);
}

export function generateSurvivalResources(seed = SURVIVAL_WORLD_SEED): GeneratedSurvivalResource[] {
  const layout = rareOreLayout(seed);
  const resources: GeneratedSurvivalResource[] = [...layout.ores];
  for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
    for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
      if (layout.oreById.has(resourceTileId(tileX, tileY))) continue;
      const resource = generatedNaturalSurvivalResourceWith(seed, tileX, tileY, layout.biomeAt, layout.decorationTiles);
      if (resource) resources.push(resource);
    }
  }
  for (const decoration of layout.decorations) {
    const resource = interactiveDecorationResource(decoration);
    if (resource !== null) resources.push(resource);
  }
  return resources;
}

export function createSurvivalCollisionMap(
  seed = SURVIVAL_WORLD_SEED,
  resources: readonly SurvivalResourceCollision[] = generateSurvivalResources(seed).map((resource) => ({ ...resource, depleted: false })),
  medium: MovementMedium = 'ground',
): CollisionMap {
  const biomes = Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) => {
    const tileX = index % SURVIVAL_WORLD_SIZE;
    const tileY = Math.floor(index / SURVIVAL_WORLD_SIZE);
    return survivalBiomeAt(seed, tileX, tileY);
  });
  const blocked = biomes.map((biome) => survivalBiomeBlocksTraversal(biome, medium));
  const horseJumpableTerrain = biomes.map(survivalBiomeAllowsHorseJump);
  const obstacles: CollisionObstacle[] = [];
  for (const resource of medium === 'ground' ? resources : []) {
    if (!resource.depleted && resource.tileX >= 0 && resource.tileY >= 0
      && resource.tileX < SURVIVAL_WORLD_SIZE && resource.tileY < SURVIVAL_WORLD_SIZE
      && survivalResourceBlocksMovement(resource.kind)) {
      obstacles.push(survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY));
    }
  }
  for (const decoration of generateSurvivalDecorations(seed)) {
    const obstacle = survivalDecorationObstacle(decoration, medium);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  return {
    width: SURVIVAL_WORLD_SIZE,
    height: SURVIVAL_WORLD_SIZE,
    blocked,
    ...(medium === 'ground' ? {
      elevations: survivalElevationBytes(seed),
      terrainTransitions: survivalTerrainTransitions(seed),
    } : {}),
    ...(medium === 'ground' ? { horseJumpableTerrain } : {}),
    obstacles,
  };
}

export function survivalTerrainBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return Uint8Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) =>
    SURVIVAL_BIOMES.indexOf(survivalBiomeAt(seed, index % SURVIVAL_WORLD_SIZE, Math.floor(index / SURVIVAL_WORLD_SIZE))),
  );
}

export function survivalCliffRoleBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return Uint8Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) =>
    SURVIVAL_CLIFF_ROLES.indexOf(survivalCliffRoleAt(seed, index % SURVIVAL_WORLD_SIZE, Math.floor(index / SURVIVAL_WORLD_SIZE))),
  );
}

export function survivalPlateauBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return plateauMaskFor(seed).slice();
}

export function survivalElevationBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return elevationMaskFor(seed).slice();
}

export function survivalDirtTerraceBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return dirtTerraceMaskFor(seed).slice();
}

export function survivalDirtCliffRoleBytes(seed = SURVIVAL_WORLD_SEED): Uint8Array {
  return Uint8Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) =>
    SURVIVAL_DIRT_CLIFF_ROLES.indexOf(survivalDirtCliffRoleAt(
      seed,
      index % SURVIVAL_WORLD_SIZE,
      Math.floor(index / SURVIVAL_WORLD_SIZE),
    )),
  );
}
