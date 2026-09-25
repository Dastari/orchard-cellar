import { SURVIVAL_RAISED_CLIFF_TILE_SET } from './survival-tileset.js';
export { SURVIVAL_RAISED_CLIFF_TILE_SET } from './survival-tileset.js';
import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type CollisionObstacle,
  type MovementMedium,
} from './state.js';
import {
  resolveRaisedTerrainContoursAt,
  raisedTerrainProjectionRowsPerLevel,
  type RaisedTerrainContourPlan,
  type RaisedTerrainRampRole,
} from './raised-terrain-autotile.js';
import {
  expandStairRun,
  retainMinimumTerrainFootprint,
  type StairRun,
  type TerrainTransition,
} from './terrain-elevation.js';
import {
  BOOTSTRAP_WORLD_POLICY_BALANCE,
  SURVIVAL_TERRAIN_CONTOUR_INSET_TILES,
  SURVIVAL_TERRAIN_MAX_ELEVATION,
  SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES,
  type WorldPolicyBalanceProfile,
} from './world-policy-balance.js';
import { playerInteractionOrigin } from './movement.js';
import {
  MINING_MAX_RICHNESS,
  type MiningNodeClass,
} from './mining.js';
import {
  FISH_POOL_ACTIVE_CAP,
  FISH_POOL_MAX_RICHNESS,
  FISH_POOL_MIN_RICHNESS,
  FISH_POOL_MIN_SPACING_TILES,
} from './fishing.js';
import {
  TREE_GROWTH_STAGE_BIG,
  treeHealthForGrowthStage,
} from './tree-regrowth.js';
import {
  BOOTSTRAP_SPACE_DEFINITIONS,
  bootstrapLandmarksForGenerator,
} from './content/bootstrap-spaces.js';
import { BOOTSTRAP_RESOURCE_REGISTRY } from './content/bootstrap-resources.js';
import * as survivalDimensions from './survival-dimensions.js';
import {
  SURVIVAL_BIOMES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  survivalBiomeBlocksMovement,
  survivalBiomeBlocksTraversal,
  type SurvivalBiome,
  type SurvivalDirtCliffRole,
} from './survival-biomes.js';
import {
  isBreakableRockKind,
  isChoppableTreeKind,
  isMineableOreKind,
  resourceDefinition,
  survivalResourceCatalog,
  type SurvivalGatherableResourceKind,
  type SurvivalOreKind,
  type SurvivalResourceKind,
  type SurvivalResourceRegistry,
  type SurvivalTreeKind,
} from './survival-resource-catalog.js';
import {
  generateSurvivalLandmarkDecorations,
  type GeneratedSurvivalDecoration,
  type SurvivalAuthoredLandmarkDecoration,
} from './survival-landmark-decorations.js';
import type {
  SpaceDecorationGeneratorDefinition,
  SpaceDecorationPaletteEntry,
  SpaceContentDefinition,
  SpaceLandmarkDefinition,
  SpaceTileRectangle,
} from './content/world-definition.js';

// Module-local copies of the leaf dimensions (static-world S6a). The per-tile
// generator below reads these in its hottest loops. Module transforms that
// rewrite every imported binding into a namespace getter call (Vitest's SSR
// transform) made reading the imported bindings directly cost the whole-map
// generator ~28%; plain local constants keep it as fast as before the split.
// `survival-world-local-dimensions.test.ts` guards this.
const SURVIVAL_ISLAND_OFFSET_TILES = survivalDimensions.SURVIVAL_ISLAND_OFFSET_TILES;
const SURVIVAL_ISLAND_SIZE = survivalDimensions.SURVIVAL_ISLAND_SIZE;
const SURVIVAL_WORLD_SEED = survivalDimensions.SURVIVAL_WORLD_SEED;
const SURVIVAL_WORLD_SIZE = survivalDimensions.SURVIVAL_WORLD_SIZE;

// Generator-free leaves (static-world S6a). Re-exported so every existing
// import from this module keeps working and shares the leaf's one instance.
export * from './survival-dimensions.js';
export * from './survival-biomes.js';
export * from './survival-landmark-decorations.js';
export {
  SURVIVAL_FRUIT_TREE_KINDS,
  SURVIVAL_GATHERABLE_RESOURCE_KINDS,
  SURVIVAL_ORE_KINDS,
  SURVIVAL_REGROWING_PLANT_KINDS,
  SURVIVAL_ROCK_KINDS,
  SURVIVAL_TREE_KINDS,
  isAxeHarvestableResourceKind,
  isBreakableRockKind,
  isChoppableTreeKind,
  isFruitTreeKind,
  isMineableOreKind,
  isRegrowingPlantKind,
  survivalResourceCatalog,
  type MineableOreKind,
  type SurvivalFruitTreeKind,
  type SurvivalGatherableResourceKind,
  type SurvivalOreKind,
  type SurvivalRegrowingPlantKind,
  type SurvivalResourceKind,
  type SurvivalResourceRegistry,
  type SurvivalRockKind,
  type SurvivalTreeKind,
} from './survival-resource-catalog.js';


/** Active surface population. Spawn-site generation deliberately produces
 * many more candidates, of which this WoW-style regional pool activates a
 * spaced subset. */
export const SURFACE_ACTIVE_ORE_NODES = 48;
/** Retained alias for old callers while the fixed per-kind interpretation is gone. */
export const ORE_NODES_PER_KIND = 6;
export const ORE_NODE_RESERVE_HITS = MINING_MAX_RICHNESS;
export const ORE_HITS_PER_DROP = 1;
export const ORE_MIN_SPACING_TILES = 12;
export const ORE_SPAWN_SITE_CELL_TILES = 16;
export const ORE_RESOURCE_ID_BASE = 2_000_000_000;
/** Only these original rotating slots belong to Orchard's surface generator.
 * Authored island nodes must never be relocated through that generator. */
export function legacySurfaceOreSlot(
  resource: { readonly id: bigint; readonly kind: string; readonly spaceId: number },
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): number | null {
  const slot = resource.id - BigInt(ORE_RESOURCE_ID_BASE);
  return resource.spaceId === 0 && slot >= 0n && slot < BigInt(SURFACE_ACTIVE_ORE_NODES)
    && isMineableOreKind(resource.kind, registry) ? Number(slot) : null;
}
export const FISH_POOL_RESOURCE_ID_BASE = 2_100_000_000;
export const LARGE_ROCK_STONE_RESERVE = MINING_MAX_RICHNESS;
export const LARGE_ROCK_INITIAL_HEALTH = MINING_MAX_RICHNESS;


export function survivalFishermanDockWalkableAt(tileX: number, tileY: number): boolean {
  return survivalLandmarksGroundWalkableAt(bootstrapIslandLandmarks(), tileX, tileY);
}


export interface SurvivalPlateauRamp {
  readonly contourLevel: number;
  readonly tileX: number;
  /** Lower/southern row; the paired upper row is `tileY - 1`. */
  readonly tileY: number;
}


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
  readonly nodeClass?: MiningNodeClass;
  readonly richness?: number;
  readonly spawnSiteId?: number;
  readonly activationOrdinal?: number;
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

export function survivalResourceObstacle(
  kind: string,
  tileX: number,
  tileY: number,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): CollisionObstacle {
  return isMineableOreKind(kind, registry) || isBreakableRockKind(kind, registry)
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
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): { readonly x: number; readonly y: number } {
  const bounds = survivalResourceObstacle(kind, tileX, tileY, registry);
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
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): { readonly x: number; readonly y: number } {
  const origin = playerInteractionOrigin({ x: playerX, y: playerY });
  const target = survivalResourceTargetPoint(origin.x, origin.y, kind, tileX, tileY, registry);
  return { x: target.x - origin.x, y: target.y - origin.y };
}

export function isGatherableResourceKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): kind is SurvivalGatherableResourceKind {
  return resourceDefinition(registry, kind)?.interaction.mode === 'gather';
}

export function survivalResourceBlocksMovement(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): boolean {
  return resourceDefinition(registry, kind)?.collision.blocksMovement === true;
}

const bootstrapIslandLandmarks = (): readonly SpaceLandmarkDefinition[] => (
  bootstrapLandmarksForGenerator('island')
);

export type SurvivalLandmarkRegistry = Readonly<{
  spaces: ReadonlyMap<string, SpaceContentDefinition>;
}>;

const BOOTSTRAP_LANDMARK_REGISTRY: SurvivalLandmarkRegistry = Object.freeze({
  spaces: new Map(BOOTSTRAP_SPACE_DEFINITIONS.map((definition) => [definition.id, definition])),
});
const BOOTSTRAP_SURVIVAL_REGISTRY = Object.freeze({
  ...BOOTSTRAP_RESOURCE_REGISTRY,
  ...BOOTSTRAP_LANDMARK_REGISTRY,
});

interface SurvivalDecorationGenerator {
  readonly natureKinds: readonly string[];
  readonly variantCounts: ReadonlyMap<string, number>;
  readonly poiKinds: readonly string[];
  readonly groveWeights: readonly SpaceDecorationPaletteEntry[];
  readonly mushroomKind: string;
  readonly pondWeights: readonly SpaceDecorationPaletteEntry[];
  readonly ambient: SpaceDecorationGeneratorDefinition[5];
  readonly desertWeights: readonly SpaceDecorationPaletteEntry[];
}

const decorationGeneratorCaches = new WeakMap<object, SurvivalDecorationGenerator | null>();

function weightedPaletteValid(
  entries: readonly SpaceDecorationPaletteEntry[],
  kinds: ReadonlySet<string>,
  maximumWeight: number,
  exactWeight = false,
): boolean {
  const seen = new Set<string>();
  let total = 0;
  for (const [kind, weight] of entries) {
    if (!kinds.has(kind) || seen.has(kind) || !Number.isSafeInteger(weight) || weight <= 0) return false;
    seen.add(kind);
    total += weight;
  }
  return exactWeight ? total === maximumWeight : total <= maximumWeight;
}

function activeSurvivalDecorationGenerator(
  registry: SurvivalResourceRegistry,
): SurvivalDecorationGenerator | null {
  const cached = decorationGeneratorCaches.get(registry);
  if (cached !== undefined) return cached;
  const sources = [...(registry.spaces?.values() ?? [])].filter((space) => (
    space.retired !== true && space.generator === 'island' && space.decorationGenerator !== undefined
  ));
  if (sources.length !== 1) {
    decorationGeneratorCaches.set(registry, null);
    return null;
  }
  const source = sources[0]!.decorationGenerator!;
  const [natureVariants, poiKinds, groveWeights, mushroomKind, pondWeights, ambient, desertWeights] = source;
  const natureKinds = natureVariants.map(([kind]) => kind);
  const natureKindSet = new Set(natureKinds);
  const poiKindSet = new Set(poiKinds);
  const valid = natureKinds.length > 0 && natureKinds.length <= 16
    && natureKindSet.size === natureKinds.length
    && natureVariants.every(([, count]) => Number.isSafeInteger(count) && count > 0)
    && poiKinds.length > 0 && poiKindSet.size === poiKinds.length
    && weightedPaletteValid(groveWeights, natureKindSet, 100, true)
    && natureKindSet.has(mushroomKind)
    && weightedPaletteValid(pondWeights, natureKindSet, 10_000)
    && natureKindSet.has(ambient[0]) && natureKindSet.has(ambient[1])
    && ambient[0] !== ambient[1] && ambient[2] > 0 && ambient[2] <= 10_000
    && weightedPaletteValid(desertWeights, natureKindSet, 10_000);
  if (!valid) {
    decorationGeneratorCaches.set(registry, null);
    return null;
  }
  const result = Object.freeze({
    natureKinds: Object.freeze(natureKinds),
    variantCounts: new Map(natureVariants),
    poiKinds,
    groveWeights,
    mushroomKind,
    pondWeights,
    ambient,
    desertWeights,
  });
  decorationGeneratorCaches.set(registry, result);
  return result;
}

function weightedDecorationKind(
  entries: readonly SpaceDecorationPaletteEntry[],
  roll: number,
): string | null {
  let threshold = 0;
  for (const [kind, weight] of entries) {
    threshold += weight;
    if (roll < threshold) return kind;
  }
  return null;
}

/** Resolve landmarks by durable numeric space identity from the caller's
 * active registry. Authored space and landmark IDs are presentation identity,
 * not gameplay capability. */
export function activeSurvivalLandmarks(
  registry: SurvivalLandmarkRegistry,
  spaceId: number,
): readonly SpaceLandmarkDefinition[] {
  for (const space of registry.spaces.values()) {
    if (space.retired !== true && space.spaceId === spaceId) {
      return space.landmarks ?? Object.freeze([]);
    }
  }
  return Object.freeze([]);
}

function survivalLandmarkHasRole(landmark: SpaceLandmarkDefinition, role: string): boolean {
  return landmark.decorations.some((rule) => (
    rule.kind === 'point' && rule.roles?.includes(role) === true
  ));
}

export function survivalLandmarksForRole(
  landmarks: readonly SpaceLandmarkDefinition[],
  role: string,
): readonly SpaceLandmarkDefinition[] {
  return Object.freeze(landmarks.filter((landmark) => survivalLandmarkHasRole(landmark, role)));
}

function tileInRectangle(bounds: SpaceTileRectangle, tileX: number, tileY: number): boolean {
  return tileX >= bounds.minimumTileX && tileX <= bounds.maximumTileX
    && tileY >= bounds.minimumTileY && tileY <= bounds.maximumTileY;
}

/** Generic authored-landmark reservation. Landmark ids and labels are editor
 * identity only and never participate in the algorithm. */
export function survivalLandmarksReservedAt(
  landmarks: readonly SpaceLandmarkDefinition[], tileX: number, tileY: number,
): boolean {
  return landmarks.some(({ bounds }) => tileInRectangle(bounds, tileX, tileY));
}

export function survivalLandmarksGroundWalkableAt(
  landmarks: readonly SpaceLandmarkDefinition[], tileX: number, tileY: number,
): boolean {
  return landmarks.some(({ groundWalkableAreas }) => (
    groundWalkableAreas?.some((area) => tileInRectangle(area, tileX, tileY)) === true
  ));
}

export function survivalLandmarkRolePoints(
  landmarks: readonly SpaceLandmarkDefinition[], role: string,
): readonly { readonly tileX: number; readonly tileY: number; readonly decorationKind: string }[] {
  return Object.freeze(landmarks.flatMap((landmark) => landmark.decorations.flatMap((rule) => (
    rule.kind === 'point' && rule.roles?.includes(role) === true
      ? [{ tileX: rule.tileX, tileY: rule.tileY, decorationKind: rule.decorationKind }]
      : []
  ))));
}

export function survivalLandmarkRoleReservedAt(
  landmarks: readonly SpaceLandmarkDefinition[], role: string, tileX: number, tileY: number,
): boolean {
  return survivalLandmarksReservedAt(survivalLandmarksForRole(landmarks, role), tileX, tileY);
}

export function survivalAuthoredLandmarkReservedAt(tileX: number, tileY: number): boolean {
  return survivalLandmarksReservedAt(bootstrapIslandLandmarks(), tileX, tileY);
}

function generatedLandmarkRows(landmarks: readonly SpaceLandmarkDefinition[]): readonly GeneratedSurvivalDecoration[] {
  return generateSurvivalLandmarkDecorations(landmarks).map(({ id, kind, tileX, tileY, variant, animationOffset, role }) => ({
    id, kind, tileX, tileY, variant, animationOffset,
    ...(role === undefined ? {} : { role }),
  }));
}

export function generateSurvivalLandmarkRoleDecorations(
  landmarks: readonly SpaceLandmarkDefinition[],
  role: string,
): readonly SurvivalAuthoredLandmarkDecoration[] {
  return generateSurvivalLandmarkDecorations(survivalLandmarksForRole(landmarks, role));
}


let authoredLandmarkDecorationCache: readonly SurvivalAuthoredLandmarkDecoration[] | null = null;

/** Fixed, hand-authored world placements. These are deliberately separate
 * from seeded clutter so map documents can persist edits to them. */
export function survivalAuthoredLandmarkDecorations(): readonly SurvivalAuthoredLandmarkDecoration[] {
  authoredLandmarkDecorationCache ??= generateSurvivalLandmarkDecorations(bootstrapIslandLandmarks());
  return authoredLandmarkDecorationCache;
}

const bootstrapAuthoredLandmarkDecorationIds = new Set(
  survivalAuthoredLandmarkDecorations().map((decoration) => decoration.id),
);

export function isSurvivalAuthoredLandmarkDecoration(
  decoration: Pick<GeneratedSurvivalDecoration, 'id'>,
  landmarks?: readonly SpaceLandmarkDefinition[],
): boolean {
  return landmarks === undefined
    ? bootstrapAuthoredLandmarkDecorationIds.has(decoration.id)
    : generateSurvivalLandmarkDecorations(landmarks).some(({ id }) => id === decoration.id);
}

/** A two-tile-wide campsite track with a short southern spur. The authored
 * mask deliberately extends beyond the reserved clearing so the path tapers
 * back into the surrounding world rather than ending at an invisible radius. */
export function generateSurvivalLandmarkPathTiles(
  landmarks: readonly SpaceLandmarkDefinition[],
  role?: string,
): readonly SurvivalCampPathTile[] {
  const tiles: SurvivalCampPathTile[] = [];
  const seen = new Set<string>();
  for (const landmark of role === undefined ? landmarks : survivalLandmarksForRole(landmarks, role)) {
    for (const area of landmark.pathAreas ?? []) {
      for (let tileY = area.minimumTileY; tileY <= area.maximumTileY; tileY += 1) {
        for (let tileX = area.minimumTileX; tileX <= area.maximumTileX; tileX += 1) {
          const key = `${tileX}:${tileY}`;
          if (seen.has(key)) continue;
          seen.add(key);
          tiles.push({ tileX, tileY });
        }
      }
    }
  }
  return Object.freeze(tiles);
}

const marlowCampPathTiles = generateSurvivalLandmarkPathTiles(
  bootstrapIslandLandmarks(), 'automated_campfire',
);

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
    let local: Uint8Array = Uint8Array.from({ length: width * height }, (_, index) => {
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
    local = retainMinimumTerrainFootprint(withoutSpurs, width, height);

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
const islandStairRunCache = new Map<number, readonly StairRun[]>();

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

/** Cut one continuous three-course staircase into a summit. This is an honest
 * generator change: the displaced contour cells are not hidden by mutating
 * unrelated terrain merely to preserve an old aggregate histogram. */
function carveIslandStairRun(seed: number, elevations: Uint8Array): readonly StairRun[] {
  if (SURVIVAL_MAX_TERRAIN_ELEVATION < 2) return [];
  let selected: {
    readonly x: number;
    readonly topY: number;
    readonly approachEndY: number;
    readonly score: number;
  } | null = null;
  for (let topY = 2; topY < SURVIVAL_WORLD_SIZE - SURVIVAL_MAX_TERRAIN_ELEVATION - 2; topY += 1) {
    for (let tileX = 2; tileX < SURVIVAL_WORLD_SIZE - 3; tileX += 1) {
      const topLeft = topY * SURVIVAL_WORLD_SIZE + tileX;
      if (elevations[topLeft] !== SURVIVAL_MAX_TERRAIN_ELEVATION
        || elevations[topLeft + 1] !== SURVIVAL_MAX_TERRAIN_ELEVATION) continue;
      let editDistance = 0;
      let waterFeature = false;
      for (let course = 0; course <= SURVIVAL_MAX_TERRAIN_ELEVATION; course += 1) {
        const targetLevel = SURVIVAL_MAX_TERRAIN_ELEVATION - course;
        const tileY = topY + course;
        for (let lane = 0; lane < 2; lane += 1) {
          editDistance += Math.abs(
            (elevations[tileY * SURVIVAL_WORLD_SIZE + tileX + lane] ?? 0) - targetLevel,
          );
          waterFeature ||= survivalLakeAt(seed, tileX + lane, tileY)
            || survivalStreamAt(seed, tileX + lane, tileY)
            || !survivalIslandAt(seed, tileX + lane, tileY)
            || survivalAuthoredLandmarkReservedAt(tileX + lane, tileY);
        }
      }
      if (waterFeature) continue;
      const footY = topY + SURVIVAL_MAX_TERRAIN_ELEVATION;
      let approachEndY = footY + 1;
      let approachEdits = 0;
      for (; approachEndY < Math.min(SURVIVAL_WORLD_SIZE - 2, footY + 33); approachEndY += 1) {
        let clearDatumRow = true;
        for (let lane = 0; lane < 2; lane += 1) {
          const approachX = tileX + lane;
          const approachIndex = approachEndY * SURVIVAL_WORLD_SIZE + approachX;
          if (!survivalIslandAt(seed, approachX, approachEndY)
            || survivalLakeAt(seed, approachX, approachEndY)
            || survivalStreamAt(seed, approachX, approachEndY)
            || survivalAuthoredLandmarkReservedAt(approachX, approachEndY)) {
            waterFeature = true;
            break;
          }
          if (elevations[approachIndex] !== 0) {
            clearDatumRow = false;
            approachEdits += 1;
          }
        }
        if (waterFeature || clearDatumRow) break;
      }
      if (waterFeature || approachEndY >= Math.min(SURVIVAL_WORLD_SIZE - 2, footY + 33)) continue;
      const score = approachEdits * 1_000_000_000_000
        + (approachEndY - footY) * 1_000_000_000
        + editDistance * 1_000_000
        + hash(seed ^ 0x6f2319ab, tileX, topY);
      if (selected === null || score < selected.score) {
        selected = { x: tileX, topY, approachEndY, score };
      }
    }
  }
  if (selected === null) return [];

  for (let course = 0; course <= SURVIVAL_MAX_TERRAIN_ELEVATION; course += 1) {
    const targetLevel = SURVIVAL_MAX_TERRAIN_ELEVATION - course;
    const row = (selected.topY + course) * SURVIVAL_WORLD_SIZE + selected.x;
    for (let lane = 0; lane < 2; lane += 1) {
      elevations[row + lane] = targetLevel;
    }
  }
  for (let tileY = selected.topY + SURVIVAL_MAX_TERRAIN_ELEVATION + 1;
    tileY < selected.approachEndY; tileY += 1) {
    const row = tileY * SURVIVAL_WORLD_SIZE + selected.x;
    elevations[row] = 0;
    elevations[row + 1] = 0;
  }
  return [{
    x: selected.x,
    y: selected.topY + SURVIVAL_MAX_TERRAIN_ELEVATION,
    direction: 'up',
    fromLevel: 0,
    toLevel: SURVIVAL_MAX_TERRAIN_ELEVATION,
  }];
}

function stairRunHasDatumApproach(run: StairRun, elevations: Uint8Array): boolean {
  const lowerTiles = new Set([run.y * SURVIVAL_WORLD_SIZE + run.x, run.y * SURVIVAL_WORLD_SIZE + run.x + 1]);
  return [...lowerTiles].some((index) => [
    index - 1,
    index + 1,
    index - SURVIVAL_WORLD_SIZE,
    index + SURVIVAL_WORLD_SIZE,
  ].some((neighbor) => !lowerTiles.has(neighbor) && elevations[neighbor] === run.fromLevel));
}

/** The live island's organic plateaus become stepped mountains by repeatedly
 * insetting the exact same mask. Every higher level is therefore a strict
 * subset of the level below except for the authored staircase cut. */
function elevationMaskFor(seed: number): Uint8Array {
  const cached = elevationMaskCache.get(seed);
  if (cached) return cached;
  const elevations = plateauMaskFor(seed).slice();
  let contour = plateauMaskFor(seed);
  for (let level = 2; level <= SURVIVAL_MAX_TERRAIN_ELEVATION; level += 1) {
    contour = retainTerrainComponents(
      retainMinimumTerrainFootprint(
        erodeTerrainMask(contour, SURVIVAL_TERRAIN_CONTOUR_INSET_TILES),
        SURVIVAL_WORLD_SIZE,
        SURVIVAL_WORLD_SIZE,
      ),
      SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES,
    );
    contour.forEach((inside, index) => {
      if (inside === 1) elevations[index] = level;
    });
  }
  islandStairRunCache.set(seed, carveIslandStairRun(seed, elevations));
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
  return survivalTerrainHeightAt(seed, tileX, tileY) > 0;
}

/** Legacy-island adapter for the shared arbitrary integer elevation contract. */
export function survivalTerrainHeightAt(seed: number, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 0;
  return elevationMaskFor(seed)[tileY * SURVIVAL_WORLD_SIZE + tileX] ?? 0;
}

export function survivalStairRuns(seed: number): readonly StairRun[] {
  elevationMaskFor(seed);
  return islandStairRunCache.get(seed) ?? [];
}

export function survivalDirtTerraceAt(seed: number, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  return dirtTerraceMaskFor(seed)[tileY * SURVIVAL_WORLD_SIZE + tileX] === 1;
}

const plateauRampCache = new Map<number, readonly SurvivalPlateauRamp[]>();
const terrainTransitionCache = new Map<number, readonly TerrainTransition[]>();

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
  const stairTransitions = survivalStairRuns(seed)
    .filter((run) => stairRunHasDatumApproach(run, elevations))
    .flatMap(expandStairRun);
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
      if (stairTransitions.some((transition) => (
        transition.contourLevel === contourLevel
        && component.includes(
          transition.upperTileY * SURVIVAL_WORLD_SIZE + transition.upperTileX,
        )
      ))) continue;
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
  const cached = terrainTransitionCache.get(seed);
  if (cached !== undefined) return cached;
  const transitions = survivalPlateauRamps(seed).flatMap((ramp) => [0, 1].map((lane): TerrainTransition => ({
    contourLevel: ramp.contourLevel,
    kind: 'slope',
    direction: 'up',
    lowerTileX: ramp.tileX + lane,
    lowerTileY: ramp.tileY,
    upperTileX: ramp.tileX + lane,
    upperTileY: ramp.tileY - 1,
  })));
  transitions.push(...survivalStairRuns(seed).flatMap(expandStairRun));
  terrainTransitionCache.set(seed, transitions);
  return transitions;
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
): RaisedTerrainRampRole | null {
  for (const ramp of survivalPlateauRamps(seed)) {
    if (ramp.contourLevel !== contourLevel) continue;
    if (tileX === ramp.tileX && tileY === ramp.tileY - 1) return 'ramp_top_left';
    if (tileX === ramp.tileX + 1 && tileY === ramp.tileY - 1) return 'ramp_top_right';
    if (tileX === ramp.tileX && tileY === ramp.tileY) return 'ramp_bottom_left';
    if (tileX === ramp.tileX + 1 && tileY === ramp.tileY) return 'ramp_bottom_right';
  }
  for (const run of survivalStairRuns(seed)) {
    for (const transition of expandStairRun(run)) {
      if (transition.contourLevel !== contourLevel) continue;
      const side = transition.lowerTileX === run.x ? 'left' : 'right';
      if (tileX === transition.upperTileX && tileY === transition.upperTileY) {
        return side === 'left' ? 'ramp_top_left' : 'ramp_top_right';
      }
      if (tileX === transition.lowerTileX && tileY === transition.lowerTileY) {
        return side === 'left' ? 'ramp_bottom_left' : 'ramp_bottom_right';
      }
    }
  }
  return null;
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
      return plateauRampRoleAt(seed, contourLevel, x, y);
    },
  );
}

const raisedTerrainBlockingCache = new Map<number, Uint8Array>();
const raisedTerrainStructuralCache = new Map<number, Uint8Array>();
const raisedTerrainVisualCache = new Map<number, Uint8Array>();
const raisedTerrainPlaneBlockingCache = new Map<number, Uint8Array>();

function raisedTerrainProjectedRows(): number {
  return raisedTerrainProjectionRowsPerLevel(SURVIVAL_RAISED_CLIFF_TILE_SET);
}

/** Plane-specific physical cliff geometry. Face rows are authored south of
 * their contour but rendered north by the elevation projection, so their
 * lower-plane blockers must receive the same projection. Raised actors get a
 * separate cap-edge guard. The cosmetic foot/shadow row and ramps stay open. */
export function survivalTerrainPlaneCollisionBytes(seed: number): Uint8Array {
  const cached = raisedTerrainPlaneBlockingCache.get(seed);
  if (cached !== undefined) return cached;
  const stride = SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE;
  const blocked = new Uint8Array((SURVIVAL_MAX_TERRAIN_ELEVATION + 1) * stride);
  const projectedRows = raisedTerrainProjectedRows();
  const elevations = elevationMaskFor(seed);
  const transitions = survivalTerrainTransitions(seed);
  const rampRoles = new Map<number, RaisedTerrainRampRole>();
  for (const transition of transitions) {
    const offset = transition.contourLevel * stride;
    const paired = transitions.filter((candidate) => (
      candidate !== transition
      && candidate.contourLevel === transition.contourLevel
      && candidate.kind === transition.kind
      && candidate.direction === transition.direction
      && candidate.lowerTileY === transition.lowerTileY
      && candidate.upperTileY === transition.upperTileY
    ));
    const leftLane = paired.some((candidate) => candidate.lowerTileX === transition.lowerTileX + 1);
    rampRoles.set(
      offset + transition.upperTileY * SURVIVAL_WORLD_SIZE + transition.upperTileX,
      leftLane ? 'ramp_top_left' : 'ramp_top_right',
    );
    rampRoles.set(
      offset + transition.lowerTileY * SURVIVAL_WORLD_SIZE + transition.lowerTileX,
      leftLane ? 'ramp_bottom_left' : 'ramp_bottom_right',
    );
  }
  const elevationAt = (x: number, y: number): number => (
    x < 0 || y < 0 || x >= SURVIVAL_WORLD_SIZE || y >= SURVIVAL_WORLD_SIZE
      ? 0
      : elevations[y * SURVIVAL_WORLD_SIZE + x] ?? 0
  );
  for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
    for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
      for (const { contourLevel, plan } of resolveRaisedTerrainContoursAt(
        elevationAt,
        SURVIVAL_MAX_TERRAIN_ELEVATION,
        SURVIVAL_RAISED_CLIFF_TILE_SET,
        'tall',
        tileX,
        tileY,
        (level, x, y) => rampRoles.get(
          level * stride + y * SURVIVAL_WORLD_SIZE + x,
        ) ?? null,
      )) {
        const tileIndex = tileY * SURVIVAL_WORLD_SIZE + tileX;
        if (plan.rampFrame === null && (plan.edgeFrame !== null || plan.insetFrames.length > 0)) {
          blocked[contourLevel * stride + tileIndex] = 1;
        }
        if (!plan.faceLayers.some((face) => face.direct && face.blocksMovement)) continue;
        const projectedTileY = tileY - contourLevel * projectedRows;
        if (projectedTileY < 0) continue;
        blocked[(contourLevel - 1) * stride
          + projectedTileY * SURVIVAL_WORLD_SIZE + tileX] = 1;
      }
    }
  }
  // A ramp is a two-wide doorway through both plane guards. Clear it after
  // resolving neighbouring contour coverage so corner/inset plans cannot
  // accidentally close one lane.
  for (const transition of transitions) {
    for (const [tileX, tileY] of [
      [transition.lowerTileX, transition.lowerTileY],
      [transition.upperTileX, transition.upperTileY],
    ] as const) {
      const tileIndex = tileY * SURVIVAL_WORLD_SIZE + tileX;
      blocked[transition.contourLevel * stride + tileIndex] = 0;
      blocked[(transition.contourLevel - 1) * stride + tileIndex] = 0;
    }
  }
  raisedTerrainPlaneBlockingCache.set(seed, blocked);
  return blocked;
}

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

/** True for every visual cliff row, including the walkable ground-contact
 * trim. This keeps generation/resource exclusion and light classification
 * independent from the one-row-per-level physical wall. */
export function survivalRaisedTerrainStructuralAt(
  seed: number,
  tileX: number,
  tileY: number,
): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  let cache = raisedTerrainStructuralCache.get(seed);
  if (!cache) {
    cache = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    cache.fill(255);
    raisedTerrainStructuralCache.set(seed, cache);
  }
  const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
  if (cache[index] === 255) {
    cache[index] = Number(survivalRaisedTerrainPlansAt(seed, tileX, tileY).some(({ plan }) => (
      plan.edgeRole !== null || plan.faceLayers.some((layer) => layer.direct && layer.blocksLight)
    )));
  }
  return cache[index] === 1;
}

/** Any derived contour pixel, including the cosmetic ground-contact foot and
 * transition caps. Resource/decor generation uses this instead of persisting a
 * second flattened cliff-role field. */
export function survivalRaisedTerrainVisualAt(
  seed: number,
  tileX: number,
  tileY: number,
): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  let cache = raisedTerrainVisualCache.get(seed);
  if (cache === undefined) {
    cache = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    cache.fill(255);
    raisedTerrainVisualCache.set(seed, cache);
  }
  const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
  if (cache[index] === 255) {
    cache[index] = Number(survivalRaisedTerrainPlansAt(seed, tileX, tileY).some(({ plan }) => (
      plan.edgeFrame !== null || plan.faceLayers.some((layer) => layer.direct)
      || plan.insetFrames.length > 0 || plan.rampFrame !== null
    )));
  }
  return cache[index] === 1;
}

function survivalRaisedTerrainTransitionAt(seed: number, tileX: number, tileY: number): boolean {
  return survivalTerrainTransitions(seed).some((transition) => (
    (tileX === transition.lowerTileX && tileY === transition.lowerTileY)
    || (tileX === transition.upperTileX && tileY === transition.upperTileY)
  ));
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

  if (survivalRaisedTerrainTransitionAt(seed, tileX, tileY)) return 'highland';
  if (survivalRaisedTerrainStructuralAt(seed, tileX, tileY)) return 'ridge';
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



/** Coordinate-aware base collision. Raised-cliff structure is represented by
 * the elevation-specific mask so projection never leaves a second blocker at
 * the authored tile. Other ridge kinds retain their ordinary solid tiles. */
export function survivalTerrainBlocksTraversalAt(
  seed: number,
  tileX: number,
  tileY: number,
  medium: MovementMedium,
): boolean {
  if (medium === 'ground' && survivalFishermanDockWalkableAt(tileX, tileY)) return false;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  if (medium === 'ground' && biome === 'ridge' && survivalRaisedTerrainStructuralAt(seed, tileX, tileY)) {
    return false;
  }
  return survivalBiomeBlocksTraversal(biome, medium);
}

type DecorationCollisionFootprint = readonly [left: number, top: number, right: number, bottom: number];

const decorationCollisionCatalogCache = new WeakMap<
  object,
  ReadonlyMap<string, DecorationCollisionFootprint>
>();

function decorationCollisionCatalog(
  registry: SurvivalLandmarkRegistry,
): ReadonlyMap<string, DecorationCollisionFootprint> {
  const cached = decorationCollisionCatalogCache.get(registry);
  if (cached !== undefined) return cached;
  const catalog = new Map<string, DecorationCollisionFootprint>();
  const ambiguous = new Set<string>();
  for (const space of registry.spaces.values()) {
    if (space.retired === true) continue;
    for (const [mediumMask, left, top, right, bottom, ...kinds] of space.decorationCollision ?? []) {
      for (const kind of kinds) for (const [bit, medium] of [[1, 'ground'], [2, 'water']] as const) {
        if ((mediumMask & bit) === 0) continue;
        const key = `${medium}:${kind}`;
        if (ambiguous.has(key)) continue;
        if (catalog.has(key)) {
          catalog.delete(key);
          ambiguous.add(key);
        } else catalog.set(key, [left, top, right, bottom]);
      }
    }
  }
  decorationCollisionCatalogCache.set(registry, catalog);
  return catalog;
}

function survivalDecorationCollisionFootprint(
  kind: string,
  medium: MovementMedium,
  registry?: SurvivalLandmarkRegistry,
): DecorationCollisionFootprint | null {
  if (medium === 'air') return null;
  return decorationCollisionCatalog(registry ?? BOOTSTRAP_LANDMARK_REGISTRY)
    .get(`${medium}:${kind}`) ?? null;
}

export function survivalDecorationBlocksTraversal(
  kind: string,
  medium: MovementMedium,
  registry?: SurvivalLandmarkRegistry,
): boolean {
  return survivalDecorationCollisionFootprint(kind, medium, registry) !== null;
}

/** Resolve one authored sprite-anchor footprint for authority and prediction. */
export function survivalDecorationObstacle(
  decoration: Pick<GeneratedSurvivalDecoration, 'kind' | 'tileX' | 'tileY'>,
  medium: MovementMedium,
  registry?: SurvivalLandmarkRegistry,
): CollisionObstacle | null {
  const footprint = survivalDecorationCollisionFootprint(decoration.kind, medium, registry);
  if (footprint === null) return null;
  const [left, top, right, bottom] = footprint;
  return {
    left: (decoration.tileX + left) * TILE_SIZE_FIXED,
    top: (decoration.tileY + top) * TILE_SIZE_FIXED,
    right: (decoration.tileX + right + 1) * TILE_SIZE_FIXED - 1,
    bottom: (decoration.tileY + bottom + 1) * TILE_SIZE_FIXED - 1,
  };
}

/** Low, inland water can be cleared by a mounted jump. Ocean edges,
 * waterfalls, and every elevated/cliff biome remain solid. */
export function survivalBiomeAllowsHorseJump(biome: SurvivalBiome): boolean {
  return biome === 'freshwater' || biome === 'oasis_water';
}



export function survivalResourceInitialHealth(
  kind: string,
  treeGrowthStage = TREE_GROWTH_STAGE_BIG,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): number {
  const definition = resourceDefinition(registry, kind);
  if (definition === null) return 0;
  return definition.health.followsGrowthStage === true
    ? treeHealthForGrowthStage(treeGrowthStage)
    : definition.health.initial;
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

export function survivalSpawnPosition(
  slot: number,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
  policy: WorldPolicyBalanceProfile = BOOTSTRAP_WORLD_POLICY_BALANCE,
): { readonly x: number; readonly y: number } | null {
  if (!Number.isInteger(slot) || slot < 0) return null;
  const legacySpawns = survivalSpawnTiles();
  let spawn = legacySpawns.find((tile) => tile.slot === slot) ?? null;
  if (spawn === null) {
    const occupied = new Set(legacySpawns.map((tile) => `${tile.tileX},${tile.tileY}`));
    for (let index = legacySpawns.length; index <= slot; index += 1) {
      spawn = findSurvivalSpawnTile(occupied, registry, policy);
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
export function findSurvivalSpawnTile(
  occupiedTiles: ReadonlySet<string>,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
  policy: WorldPolicyBalanceProfile = BOOTSTRAP_WORLD_POLICY_BALANCE,
): SurvivalSpawnTile | null {
  for (const legacy of survivalSpawnTiles()) {
    if (!occupiedTiles.has(`${legacy.tileX},${legacy.tileY}`)) return legacy;
  }
  const centerX = worldTile(160);
  const centerY = worldTile(160);
  for (let radius = 0; radius <= policy.survivalSpawnSearchRadiusTiles; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const tileX = centerX + offsetX;
        const tileY = centerY + offsetY;
        if (occupiedTiles.has(`${tileX},${tileY}`)) continue;
        if (survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY))) continue;
        if (generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, tileX, tileY, registry) !== null) continue;
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
export function survivalTreeKindAt(
  seed: number,
  tileX: number,
  tileY: number,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): SurvivalTreeKind {
  const { treeKinds, fruitTreeKinds } = survivalResourceCatalog(registry);
  const [temperateOak, temperateBirch, temperateSpruce, aridTree, oasisTree] = treeKinds;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  const localX = islandTile(tileX);
  const localY = islandTile(tileY);
  if (biome === 'oasis') return hash(seed ^ 0x442c0197, localX, localY) % 100 < 76 ? oasisTree! : aridTree!;
  if (biome === 'desert' || biome === 'desert_shore') return aridTree!;
  if (biome === 'savanna') return hash(seed ^ 0x110d3ac7, localX, localY) % 100 < 72
    ? aridTree! : temperateOak!;
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
    return fruitTreeKinds[
      hash(seed ^ 0x46525459, localX, localY) % fruitTreeKinds.length
    ]!;
  }
  const grove = valueNoise(seed ^ 0x71e4a539, localX, localY, 24);
  const temperateKinds = [temperateOak!, temperateBirch!, temperateSpruce!];
  const dominant = Math.min(temperateKinds.length - 1, Math.floor(grove * temperateKinds.length / 1024));
  const variation = hash(seed ^ 0x35b17d63, localX, localY) % 100;
  const offset = variation < 68 ? 0 : variation < 86 ? 1 : 2;
  return temperateKinds[(dominant + offset) % temperateKinds.length]!;
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

export function survivalOreKindAt(
  seed: number,
  tileX: number,
  tileY: number,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): SurvivalOreKind {
  const { oreKinds } = survivalResourceCatalog(registry);
  return oreKinds[
    hash(seed ^ 0x6c8e9cf5, islandTile(tileX), islandTile(tileY)) % oreKinds.length
  ]!;
}

export interface SurfaceOreSpawnSite {
  readonly id: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly biome: SurvivalBiome;
  readonly kind: SurvivalOreKind;
  readonly nodeClass: 'mixed' | 'pristine';
  readonly richness: number;
}

export interface FishPoolSpawnSite {
  readonly id: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly richness: number;
}

/** Keep a broad, readable path through and around every authored ramp. The
 * player hitbox is wider than one tile and resource trunks otherwise turn a
 * visually open two-tile entrance into an invisible collision pinch point. */
function survivalRampApproachAt(seed: number, tileX: number, tileY: number): boolean {
  const nearRamp = (ramp: SurvivalPlateauRamp): boolean => tileX >= ramp.tileX - 1
    && tileX <= ramp.tileX + 2
    && tileY >= ramp.tileY - 2
    && tileY <= ramp.tileY + 4;
  const nearStair = (run: StairRun): boolean => tileX >= run.x - 1
    && tileX <= run.x + 2
    && tileY >= run.y - (run.toLevel - run.fromLevel) - 1
    && tileY <= run.y + 4;
  return survivalPlateauRamps(seed).some(nearRamp)
    || survivalStairRuns(seed).some(nearStair)
    || survivalDirtTerraceRamps(seed).some(nearRamp);
}

interface RareOreLayout {
  readonly biomes: readonly SurvivalBiome[];
  readonly biomeAt: SurvivalBiomeLookup;
  readonly spawnSites: readonly SurfaceOreSpawnSite[];
  readonly ores: readonly GeneratedSurvivalResource[];
  readonly oreById: ReadonlyMap<number, GeneratedSurvivalResource>;
  readonly fishPoolSpawnSites: readonly FishPoolSpawnSite[];
  readonly fishPools: readonly GeneratedSurvivalResource[];
  readonly fishPoolByTileId: ReadonlyMap<number, GeneratedSurvivalResource>;
  readonly decorations: readonly GeneratedSurvivalDecoration[];
  readonly decorationTiles: ReadonlySet<number>;
}

const rareOreLayoutCaches = new WeakMap<object, Map<number, RareOreLayout>>();

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

function natureGroundBiome(biome: SurvivalBiome): boolean {
  return biome === 'plains' || biome === 'meadow' || biome === 'forest'
    || biome === 'valley' || biome === 'highland' || biome === 'savanna'
    || biome === 'oasis';
}

export function pondWaterBiome(biome: SurvivalBiome): boolean {
  return biome === 'freshwater' || biome === 'oasis_water';
}

export function waterSquareAt(tileX: number, tileY: number, radius: number, biomeAt: SurvivalBiomeLookup): boolean {
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
  registry: SurvivalResourceRegistry,
): GeneratedSurvivalDecoration[] {
  const generator = activeSurvivalDecorationGenerator(registry);
  if (generator === null) return [];
  const decorations: GeneratedSurvivalDecoration[] = [];
  const occupiedTiles = new Set(initialDecorations.map((decoration) => resourceTileId(decoration.tileX, decoration.tileY)));
  const islandMinimum = SURVIVAL_ISLAND_OFFSET_TILES;
  const islandMaximum = islandMinimum + SURVIVAL_ISLAND_SIZE;

  const add = (kind: string | null, tileX: number, tileY: number): boolean => {
    if (kind === null) return false;
    const ordinal = generator.natureKinds.indexOf(kind);
    const variantCount = generator.variantCounts.get(kind);
    if (ordinal < 0 || variantCount === undefined) return false;
    const tileId = resourceTileId(tileX, tileY);
    if (occupiedTiles.has(tileId) || resourceExclusionTiles.has(tileId)) return false;
    const localX = islandTile(tileX);
    const localY = islandTile(tileY);
    decorations.push({
      id: 2_000_000_000 + tileId * 16 + ordinal,
      kind,
      tileX,
      tileY,
      variant: hash(seed ^ 0x56415249, localX, localY) % variantCount,
      animationOffset: hash(seed ^ 0x50484153, localX, localY) % 96,
    });
    occupiedTiles.add(tileId);
    return true;
  };
  const validGround = (tileX: number, tileY: number): boolean => {
    if (!natureGroundBiome(biomeAt(tileX, tileY)) || survivalSpawnProtectedAt(tileX, tileY)
      || survivalAuthoredLandmarkReservedAt(tileX, tileY)) return false;
    return !survivalRaisedTerrainVisualAt(seed, tileX, tileY)
      && survivalDirtCliffRoleAt(seed, tileX, tileY) === 'none'
      && !survivalRampApproachAt(seed, tileX, tileY);
  };
  const validDesertGround = (tileX: number, tileY: number): boolean => {
    const biome = biomeAt(tileX, tileY);
    if (biome !== 'desert' && biome !== 'desert_shore') return false;
    if (survivalSpawnProtectedAt(tileX, tileY) || survivalAuthoredLandmarkReservedAt(tileX, tileY)) return false;
    return !survivalRaisedTerrainVisualAt(seed, tileX, tileY)
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
          || generatedNaturalSurvivalResourceWith(seed, tileX, tileY, biomeAt, occupiedTiles, registry) !== null) continue;
        const density = 76 - Math.trunc(distanceSquared * 36 / (grove.radius * grove.radius));
        if (hash(seed ^ 0x464c4f57, islandTile(tileX), islandTile(tileY)) % 100 >= density) continue;
        const mixed = hash(seed ^ 0x4d495845, islandTile(tileX), islandTile(tileY)) % 100;
        add(weightedDecorationKind(generator.groveWeights, mixed), tileX, tileY);
      }
    }
  }

  // A minority of tree bases receive one to three small mushroom neighbours.
  const mushroomOffsets = [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [0, -1], [-1, -1], [1, -1]] as const;
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      const tree = generatedNaturalSurvivalResourceWith(seed, tileX, tileY, biomeAt, occupiedTiles, registry);
      if (tree === null || !isChoppableTreeKind(tree.kind, registry)
        || hash(seed ^ 0x4d555348, islandTile(tileX), islandTile(tileY)) % 100 >= 11) continue;
      const count = 1 + hash(seed ^ 0x4d554e4d, islandTile(tileX), islandTile(tileY)) % 3;
      const start = hash(seed ^ 0x4d554f46, islandTile(tileX), islandTile(tileY)) % mushroomOffsets.length;
      let placed = 0;
      for (let attempt = 0; attempt < mushroomOffsets.length && placed < count; attempt += 1) {
        const offset = mushroomOffsets[(start + attempt * 3) % mushroomOffsets.length]!;
        const targetX = tileX + offset[0];
        const targetY = tileY + offset[1];
        if (!validGround(targetX, targetY)
          || generatedNaturalSurvivalResourceWith(seed, targetX, targetY, biomeAt, occupiedTiles, registry) !== null) continue;
        if (add(generator.mushroomKind, targetX, targetY)) placed += 1;
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
      add(weightedDecorationKind(generator.pondWeights, roll), tileX, tileY);
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
      if (roll < chance) add(generator.ambient[0], tileX, tileY);
      else if (roll < chance + generator.ambient[2]) add(generator.ambient[1], tileX, tileY);
    }
  }
  // Desert ground gets its own restrained authored mix. Resource generation
  // runs against these occupied tiles later, so cacti never overlap a decal.
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      if (!validDesertGround(tileX, tileY)) continue;
      const roll = hash(seed ^ 0x44455350, islandTile(tileX), islandTile(tileY)) % 10_000;
      add(weightedDecorationKind(generator.desertWeights, roll), tileX, tileY);
    }
  }
  return decorations;
}

function surfaceMetalKindAt(
  seed: number,
  tileX: number,
  tileY: number,
  biome: SurvivalBiome,
  registry: SurvivalResourceRegistry,
): SurvivalOreKind {
  const [iron, copper, gold] = survivalResourceCatalog(registry).oreKinds;
  const weights: readonly SurvivalOreKind[] = biome === 'highland'
    ? [iron!, iron!, iron!, copper!, copper!, gold!]
    : biome === 'desert' || biome === 'savanna' || biome === 'dirt_terrace'
      ? [copper!, copper!, gold!, gold!, iron!]
      : [iron!, iron!, copper!, copper!, gold!];
  return weights[hash(seed ^ 0x4f524557, islandTile(tileX), islandTile(tileY)) % weights.length]!;
}

function surfaceOreSiteProfile(
  seed: number,
  tileX: number,
  tileY: number,
  biome: SurvivalBiome,
  registry: SurvivalResourceRegistry,
): Pick<SurfaceOreSpawnSite, 'kind' | 'nodeClass' | 'richness'> {
  const roll = hash(seed ^ 0x50555245, islandTile(tileX), islandTile(tileY)) % 10_000;
  if (roll < 100) {
    const gemKinds = survivalResourceCatalog(registry).oreKinds.slice(3);
    const kind = gemKinds[
      hash(seed ^ 0x47454d53, islandTile(tileX), islandTile(tileY)) % gemKinds.length
    ]!;
    return { kind, nodeClass: 'pristine', richness: roll < 15 ? 2 : 1 };
  }
  const kind = surfaceMetalKindAt(seed, tileX, tileY, biome, registry);
  if (roll < 500) return { kind, nodeClass: 'pristine', richness: roll < 180 ? 2 : 1 };
  return {
    kind,
    nodeClass: 'mixed',
    richness: 1 + hash(seed ^ 0x52494348, islandTile(tileX), islandTile(tileY)) % 2,
  };
}

function buildSurfaceOreSpawnSites(
  seed: number,
  biomeAt: SurvivalBiomeLookup,
  registry: SurvivalResourceRegistry,
): readonly SurfaceOreSpawnSite[] {
  const sites: SurfaceOreSpawnSite[] = [];
  const islandMinimum = SURVIVAL_ISLAND_OFFSET_TILES;
  const islandMaximum = SURVIVAL_ISLAND_OFFSET_TILES + SURVIVAL_ISLAND_SIZE;
  for (let cellY = islandMinimum; cellY < islandMaximum; cellY += ORE_SPAWN_SITE_CELL_TILES) {
    for (let cellX = islandMinimum; cellX < islandMaximum; cellX += ORE_SPAWN_SITE_CELL_TILES) {
      let best: { readonly tileX: number; readonly tileY: number; readonly score: number } | null = null;
      for (let tileY = cellY; tileY < Math.min(islandMaximum, cellY + ORE_SPAWN_SITE_CELL_TILES); tileY += 1) {
        for (let tileX = cellX; tileX < Math.min(islandMaximum, cellX + ORE_SPAWN_SITE_CELL_TILES); tileX += 1) {
          const biome = biomeAt(tileX, tileY);
          if (survivalBiomeBlocksMovement(biome) || survivalSpawnProtectedAt(tileX, tileY)
            || survivalAuthoredLandmarkReservedAt(tileX, tileY)
            || survivalRaisedTerrainVisualAt(seed, tileX, tileY)
            || survivalDirtCliffRoleAt(seed, tileX, tileY) !== 'none'
            || survivalRampApproachAt(seed, tileX, tileY)) continue;
          const score = hash(seed ^ 0x53504157, islandTile(tileX), islandTile(tileY));
          if (best === null || score < best.score) best = { tileX, tileY, score };
        }
      }
      if (best === null) continue;
      const biome = biomeAt(best.tileX, best.tileY);
      const profile = surfaceOreSiteProfile(seed, best.tileX, best.tileY, biome, registry);
      sites.push({
        id: resourceTileId(best.tileX, best.tileY),
        tileX: best.tileX,
        tileY: best.tileY,
        biome,
        ...profile,
      });
    }
  }
  return sites;
}

function generatedSurfaceOreResource(
  site: SurfaceOreSpawnSite,
  slot: number,
  activationOrdinal = 0,
): GeneratedSurvivalResource {
  return {
    id: ORE_RESOURCE_ID_BASE + slot,
    kind: site.kind,
    tileX: site.tileX,
    tileY: site.tileY,
    nodeClass: site.nodeClass,
    richness: site.richness,
    spawnSiteId: site.id,
    activationOrdinal,
  };
}

function buildFishPoolSpawnSites(
  seed: number,
  biomeAt: SurvivalBiomeLookup,
): readonly FishPoolSpawnSite[] {
  const sites: FishPoolSpawnSite[] = [];
  const islandMinimum = SURVIVAL_ISLAND_OFFSET_TILES;
  const islandMaximum = SURVIVAL_ISLAND_OFFSET_TILES + SURVIVAL_ISLAND_SIZE;
  for (let tileY = islandMinimum; tileY < islandMaximum; tileY += 1) {
    for (let tileX = islandMinimum; tileX < islandMaximum; tileX += 1) {
      if (!waterSquareAt(tileX, tileY, 2, biomeAt)
        || survivalSpawnProtectedAt(tileX, tileY)
        || survivalAuthoredLandmarkReservedAt(tileX, tileY)) continue;
      sites.push({
        id: resourceTileId(tileX, tileY),
        tileX,
        tileY,
        richness: FISH_POOL_MIN_RICHNESS + hash(
          seed ^ 0x46495348,
          islandTile(tileX),
          islandTile(tileY),
        ) % (FISH_POOL_MAX_RICHNESS - FISH_POOL_MIN_RICHNESS + 1),
      });
    }
  }
  return sites;
}

function generatedFishPoolResource(
  site: FishPoolSpawnSite,
  slot: number,
  registry: SurvivalResourceRegistry,
  activationOrdinal = 0,
): GeneratedSurvivalResource {
  return {
    id: FISH_POOL_RESOURCE_ID_BASE + slot,
    kind: survivalResourceCatalog(registry).fishPoolKind,
    tileX: site.tileX,
    tileY: site.tileY,
    richness: site.richness,
    spawnSiteId: site.id,
    activationOrdinal,
  };
}

function buildRareOreLayout(seed: number, registry: SurvivalResourceRegistry): RareOreLayout {
  const biomes = biomeGridFor(seed);
  const biomeAt = biomeLookupFor(biomes);
  const spawnSites = buildSurfaceOreSpawnSites(seed, biomeAt, registry);
  const candidateFishPoolSpawnSites = buildFishPoolSpawnSites(seed, biomeAt);
  const ores: GeneratedSurvivalResource[] = [];
  const orderedSites = [...spawnSites].sort((left, right) => (
    hash(seed ^ 0x41435449, islandTile(left.tileX), islandTile(left.tileY))
      - hash(seed ^ 0x41435449, islandTile(right.tileX), islandTile(right.tileY))
  ));
  for (const site of orderedSites) {
    if (ores.length >= SURFACE_ACTIVE_ORE_NODES) break;
    if (ores.some((ore) => {
      const dx = ore.tileX - site.tileX;
      const dy = ore.tileY - site.tileY;
      return dx * dx + dy * dy < ORE_MIN_SPACING_TILES * ORE_MIN_SPACING_TILES;
    })) continue;
    ores.push(generatedSurfaceOreResource(site, ores.length));
  }
  if (ores.length < SURFACE_ACTIVE_ORE_NODES) {
    throw new Error(`Unable to activate ${SURFACE_ACTIVE_ORE_NODES} spaced surface ore nodes`);
  }
  const fishPools: GeneratedSurvivalResource[] = [];
  const orderedFishSites = [...candidateFishPoolSpawnSites].sort((left, right) => (
    hash(seed ^ 0x46414354, islandTile(left.tileX), islandTile(left.tileY))
      - hash(seed ^ 0x46414354, islandTile(right.tileX), islandTile(right.tileY))
      || left.id - right.id
  ));
  for (const site of orderedFishSites) {
    if (fishPools.length >= FISH_POOL_ACTIVE_CAP) break;
    if (fishPools.some((pool) => {
      const dx = pool.tileX - site.tileX;
      const dy = pool.tileY - site.tileY;
      return dx * dx + dy * dy < FISH_POOL_MIN_SPACING_TILES * FISH_POOL_MIN_SPACING_TILES;
    })) continue;
    fishPools.push(generatedFishPoolResource(site, fishPools.length, registry));
  }
  if (fishPools.length < FISH_POOL_ACTIVE_CAP) {
    throw new Error(`Unable to activate ${FISH_POOL_ACTIVE_CAP} spaced fish pools`);
  }
  // Every potential geology site stays clear of deterministic dressing, not
  // only the subset active at world creation.
  const selectedTiles = new Set<number>([
    ...spawnSites.map((site) => resourceTileId(site.tileX, site.tileY)),
    ...fishPools.map((pool) => resourceTileId(pool.tileX, pool.tileY)),
  ]);

  const decorations: GeneratedSurvivalDecoration[] = [];
  const decorationTiles = new Set<number>();
  // Small permanent geology landmarks make spawn routes readable even while
  // the active ore has rotated to another pre-generated site.
  const decorationGenerator = activeSurvivalDecorationGenerator(registry);
  if (decorationGenerator !== null) for (const ore of ores) {
    const start = hash(seed ^ 0x504f4921, islandTile(ore.tileX), islandTile(ore.tileY)) % POI_OFFSETS.length;
    for (let attempt = 0; attempt < POI_OFFSETS.length && decorations.filter((decor) =>
      Math.floor(decor.id / 10) === ore.id).length < 3; attempt += 1) {
      const offset = POI_OFFSETS[(start + attempt * 5) % POI_OFFSETS.length]!;
      const tileX = ore.tileX + offset[0];
      const tileY = ore.tileY + offset[1];
      const tileId = resourceTileId(tileX, tileY);
      if (survivalBiomeBlocksMovement(biomeAt(tileX, tileY))
        || survivalSpawnProtectedAt(tileX, tileY)
        || survivalAuthoredLandmarkReservedAt(tileX, tileY)
        || survivalRampApproachAt(seed, tileX, tileY)
        || survivalRaisedTerrainVisualAt(seed, tileX, tileY)
        || survivalDirtCliffRoleAt(seed, tileX, tileY) !== 'none'
        || selectedTiles.has(tileId) || decorationTiles.has(tileId)) continue;
      const localIndex = decorations.filter((decor) => Math.floor(decor.id / 10) === ore.id).length;
      const kind = decorationGenerator.poiKinds[
        hash(seed ^ 0x4445434f, islandTile(tileX), islandTile(tileY)) % decorationGenerator.poiKinds.length
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
  const landmarkDecorations = generatedLandmarkRows(bootstrapIslandLandmarks());
  decorations.push(...landmarkDecorations);
  for (const decoration of landmarkDecorations) decorationTiles.add(resourceTileId(decoration.tileX, decoration.tileY));
  const natureDecorations = generateNatureDecorations(seed, biomeAt, selectedTiles, decorations, registry);
  decorations.push(...natureDecorations);
  const allDecorationTiles = new Set(decorations.map((decoration) => (
    resourceTileId(decoration.tileX, decoration.tileY)
  )));
  const fishPoolSpawnSites = candidateFishPoolSpawnSites.filter((site) => (
    !allDecorationTiles.has(resourceTileId(site.tileX, site.tileY))
  ));
  return {
    biomes,
    biomeAt,
    spawnSites,
    ores,
    oreById: new Map(ores.map((ore) => [resourceTileId(ore.tileX, ore.tileY), ore])),
    fishPoolSpawnSites,
    fishPools,
    fishPoolByTileId: new Map(fishPools.map((pool) => [resourceTileId(pool.tileX, pool.tileY), pool])),
    decorations,
    decorationTiles,
  };
}

function rareOreLayout(seed: number, registry: SurvivalResourceRegistry): RareOreLayout {
  let cache = rareOreLayoutCaches.get(registry);
  if (cache === undefined) {
    cache = new Map();
    rareOreLayoutCaches.set(registry, cache);
  }
  const cached = cache.get(seed);
  if (cached) return cached;
  const generated = buildRareOreLayout(seed, registry);
  cache.set(seed, generated);
  return generated;
}

export function generateSurfaceOreSpawnSites(
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): readonly SurfaceOreSpawnSite[] {
  return rareOreLayout(seed, registry).spawnSites;
}

export function generateFishPoolSpawnSites(
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): readonly FishPoolSpawnSite[] {
  return rareOreLayout(seed, registry).fishPoolSpawnSites;
}

export function fishPoolRespawnCandidates(
  slot: number,
  activationOrdinal: number,
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): readonly FishPoolSpawnSite[] {
  return [...generateFishPoolSpawnSites(seed, registry)].sort((left, right) => {
    const salt = seed ^ Math.imul(slot + 1, 0x27d4eb2d)
      ^ Math.imul(activationOrdinal + 1, 0x165667b1);
    const leftScore = hash(salt, islandTile(left.tileX), islandTile(left.tileY));
    const rightScore = hash(salt, islandTile(right.tileX), islandTile(right.tileY));
    return leftScore - rightScore || left.id - right.id;
  });
}

export function fishPoolResourceAtSite(
  site: FishPoolSpawnSite,
  slot: number,
  activationOrdinal: number,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): GeneratedSurvivalResource {
  return generatedFishPoolResource(site, slot, registry, activationOrdinal);
}

/** Returns every pre-generated site in the deterministic order a depleted
 * population slot should try. Authority applies live-node and player-built
 * occupancy checks before choosing the first candidate. */
export function surfaceOreRespawnCandidates(
  slot: number,
  activationOrdinal: number,
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): readonly SurfaceOreSpawnSite[] {
  return [...generateSurfaceOreSpawnSites(seed, registry)].sort((left, right) => {
    const leftScore = hash(
      seed ^ Math.imul(slot + 1, 0x1b873593) ^ Math.imul(activationOrdinal + 1, 0x45d9f3b),
      islandTile(left.tileX), islandTile(left.tileY),
    );
    const rightScore = hash(
      seed ^ Math.imul(slot + 1, 0x1b873593) ^ Math.imul(activationOrdinal + 1, 0x45d9f3b),
      islandTile(right.tileX), islandTile(right.tileY),
    );
    return leftScore - rightScore || left.id - right.id;
  });
}

export function surfaceOreResourceAtSite(
  site: SurfaceOreSpawnSite,
  slot: number,
  activationOrdinal: number,
): GeneratedSurvivalResource {
  return generatedSurfaceOreResource(site, slot, activationOrdinal);
}

export function generateSurvivalDecorations(
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): readonly GeneratedSurvivalDecoration[] {
  return rareOreLayout(seed, registry).decorations;
}

const proceduralDecorationCaches = new WeakMap<object, Map<number, readonly GeneratedSurvivalDecoration[]>>();

/** Seeded decoration stream with the three editable landmark groups removed. */
export function generateSurvivalProceduralDecorations(
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): readonly GeneratedSurvivalDecoration[] {
  let cache = proceduralDecorationCaches.get(registry);
  if (cache === undefined) {
    cache = new Map();
    proceduralDecorationCaches.set(registry, cache);
  }
  const cached = cache.get(seed);
  if (cached !== undefined) return cached;
  const decorations = Object.freeze(generateSurvivalDecorations(seed, registry)
    .filter((decoration) => !isSurvivalAuthoredLandmarkDecoration(decoration)));
  cache.set(seed, decorations);
  return decorations;
}

export function survivalDecorationResource(
  decoration: Pick<GeneratedSurvivalDecoration, 'id' | 'tileX' | 'tileY'> & { readonly kind: string },
  registry: SurvivalResourceRegistry,
): GeneratedSurvivalResource | null {
  const kind = survivalResourceCatalog(registry).decorationResources.get(decoration.kind) ?? null;
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
  registry: SurvivalResourceRegistry,
): GeneratedSurvivalResource | null {
  if (survivalSpawnProtectedAt(tileX, tileY)) return null;
  if (survivalAuthoredLandmarkReservedAt(tileX, tileY)) return null;
  if (survivalRampApproachAt(seed, tileX, tileY)) return null;
  if (survivalRaisedTerrainVisualAt(seed, tileX, tileY)) return null;
  if (survivalDirtCliffRoleAt(seed, tileX, tileY) !== 'none') return null;
  if (decorationTiles.has(resourceTileId(tileX, tileY))) return null;
  const biome = biomeAt(tileX, tileY);
  if (survivalBiomeBlocksMovement(biome)) return null;
  const localX = islandTile(tileX);
  const localY = islandTile(tileY);
  const catalog = survivalResourceCatalog(registry);
  if (biome === 'desert' || biome === 'desert_shore') {
    const cellSize = 7;
    const cellX = Math.floor(localX / cellSize);
    const cellY = Math.floor(localY / cellSize);
    const cactusX = cellX * cellSize + hash(seed ^ 0x43414358, cellX, cellY) % cellSize;
    const cactusY = cellY * cellSize + hash(seed ^ 0x43414359, cellX, cellY) % cellSize;
    if (localX === cactusX && localY === cactusY) {
      return { id: resourceTileId(tileX, tileY), kind: catalog.cactusKind, tileX, tileY };
    }
  }
  const rockChance = biome === 'beach' || biome === 'desert_shore' || biome === 'oasis' ? 0 : 24;
  if (hash(seed ^ 0x524f434b, localX, localY) % 10_000 < rockChance) {
    return { id: resourceTileId(tileX, tileY), kind: catalog.looseStoneKind, tileX, tileY };
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
    kind: survivalTreeKindAt(seed, tileX, tileY, registry),
    tileX,
    tileY,
  };
}

export function generatedSurvivalResourceAt(
  seed: number,
  tileX: number,
  tileY: number,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): GeneratedSurvivalResource | null {
  const layout = rareOreLayout(seed, registry);
  const decoration = layout.decorations.find((candidate) =>
    candidate.tileX === tileX && candidate.tileY === tileY);
  return layout.oreById.get(resourceTileId(tileX, tileY))
    ?? layout.fishPoolByTileId.get(resourceTileId(tileX, tileY))
    ?? (decoration === undefined ? null : survivalDecorationResource(decoration, registry))
    ?? generatedNaturalSurvivalResourceWith(
      seed, tileX, tileY, layout.biomeAt, layout.decorationTiles, registry,
    );
}

export function generateSurvivalResources(
  seed = SURVIVAL_WORLD_SEED,
  registry: SurvivalResourceRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): GeneratedSurvivalResource[] {
  const layout = rareOreLayout(seed, registry);
  const resources: GeneratedSurvivalResource[] = [...layout.ores, ...layout.fishPools];
  for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
    for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
      if (layout.oreById.has(resourceTileId(tileX, tileY))
        || layout.fishPoolByTileId.has(resourceTileId(tileX, tileY))) continue;
      const resource = generatedNaturalSurvivalResourceWith(
        seed, tileX, tileY, layout.biomeAt, layout.decorationTiles, registry,
      );
      if (resource) resources.push(resource);
    }
  }
  for (const decoration of layout.decorations) {
    const resource = survivalDecorationResource(decoration, registry);
    if (resource !== null) resources.push(resource);
  }
  return resources;
}

export function createSurvivalCollisionMap(
  seed = SURVIVAL_WORLD_SEED,
  resources?: readonly SurvivalResourceCollision[],
  medium: MovementMedium = 'ground',
  registry: SurvivalResourceRegistry & SurvivalLandmarkRegistry = BOOTSTRAP_SURVIVAL_REGISTRY,
): CollisionMap {
  const activeResourceRows = resources ?? generateSurvivalResources(seed, registry)
    .map((resource) => ({ ...resource, depleted: false }));
  const biomes = Array.from({ length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE }, (_, index) => {
    const tileX = index % SURVIVAL_WORLD_SIZE;
    const tileY = Math.floor(index / SURVIVAL_WORLD_SIZE);
    return survivalBiomeAt(seed, tileX, tileY);
  });
  const blocked = biomes.map((_biome, index) => survivalTerrainBlocksTraversalAt(
    seed,
    index % SURVIVAL_WORLD_SIZE,
    Math.floor(index / SURVIVAL_WORLD_SIZE),
    medium,
  ));
  const horseJumpableTerrain = biomes.map(survivalBiomeAllowsHorseJump);
  const obstacles: CollisionObstacle[] = [];
  for (const resource of medium === 'ground' ? activeResourceRows : []) {
    if (!resource.depleted && resource.tileX >= 0 && resource.tileY >= 0
      && resource.tileX < SURVIVAL_WORLD_SIZE && resource.tileY < SURVIVAL_WORLD_SIZE
      && survivalResourceBlocksMovement(resource.kind, registry)) {
      obstacles.push(survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY, registry));
    }
  }
  for (const decoration of generateSurvivalDecorations(seed, registry)) {
    const obstacle = survivalDecorationObstacle(decoration, medium, registry);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  return {
    width: SURVIVAL_WORLD_SIZE,
    height: SURVIVAL_WORLD_SIZE,
    blocked,
    ...(medium === 'ground' ? {
      elevations: survivalElevationBytes(seed),
      terrainMinimumElevation: 0,
      terrainTransitions: survivalTerrainTransitions(seed),
      terrainPlaneBlocked: survivalTerrainPlaneCollisionBytes(seed),
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
