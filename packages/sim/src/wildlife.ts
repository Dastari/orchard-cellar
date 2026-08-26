import { positionCollides } from './movement.js';
import {
  generateSurvivalDecorations,
  generateSurvivalResources,
  survivalBiomeAt,
  survivalBiomeBlocksMovement,
  survivalDecorationBlocksTraversal,
  survivalSpawnProtectedAt,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  type SurvivalBiome,
} from './survival-world.js';
import { authorityDayProgress } from './time.js';
import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type MovementMedium,
  type Vec2Fixed,
} from './state.js';
import type { NpcFacing } from './npc.js';

export const WILDLIFE_GENERATION_VERSION = 4;
export const WILDLIFE_FIRST_NPC_ID = 10_000;
export const WILDLIFE_ACTIVE_RADIUS_CHUNKS = 3;

export const WILDLIFE_SPECIES = [
  'horse', 'cow', 'sheep', 'pig', 'chicken', 'rooster',
  'duck', 'goose', 'swan', 'frog', 'mouse', 'butterfly', 'bee',
  'capybara', 'camel', 'scarab', 'vulture', 'snail',
] as const;
export type WildlifeSpecies = typeof WILDLIFE_SPECIES[number];

export const WILDLIFE_HABITATS = [
  'pasture', 'farmyard', 'freshwater', 'lakeshore', 'wetland',
  'woodland', 'meadow_air', 'hive_air', 'desert',
] as const;
export type WildlifeHabitat = typeof WILDLIFE_HABITATS[number];

export type WildlifeLocomotion = 'walk' | 'swim' | 'hop' | 'flutter';

export interface WildlifeSpeciesDefinition {
  readonly habitat: WildlifeHabitat;
  readonly variants: number;
  readonly speedFixed: number;
  readonly wanderRadiusTiles: number;
  readonly locomotion: WildlifeLocomotion;
  readonly sleepsAtNight: boolean;
  readonly canGraze: boolean;
  readonly ignoresObstacles: boolean;
}

const HALF_PIXEL = Math.max(1, Math.floor(FIXED_UNITS_PER_PIXEL / 2));

export const WILDLIFE_DEFINITIONS: Readonly<Record<WildlifeSpecies, WildlifeSpeciesDefinition>> = {
  horse: { habitat: 'pasture', variants: 5, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  cow: { habitat: 'pasture', variants: 9, speedFixed: HALF_PIXEL, wanderRadiusTiles: 4, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  sheep: { habitat: 'pasture', variants: 9, speedFixed: HALF_PIXEL, wanderRadiusTiles: 4, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  pig: { habitat: 'pasture', variants: 16, speedFixed: HALF_PIXEL, wanderRadiusTiles: 4, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  chicken: { habitat: 'farmyard', variants: 18, speedFixed: HALF_PIXEL, wanderRadiusTiles: 4, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  rooster: { habitat: 'farmyard', variants: 1, speedFixed: HALF_PIXEL, wanderRadiusTiles: 4, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  duck: { habitat: 'freshwater', variants: 5, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'swim', sleepsAtNight: true, canGraze: false, ignoresObstacles: false },
  goose: { habitat: 'freshwater', variants: 6, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'swim', sleepsAtNight: true, canGraze: false, ignoresObstacles: false },
  swan: { habitat: 'freshwater', variants: 3, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'swim', sleepsAtNight: true, canGraze: false, ignoresObstacles: false },
  frog: { habitat: 'lakeshore', variants: 6, speedFixed: FIXED_UNITS_PER_PIXEL, wanderRadiusTiles: 3, locomotion: 'hop', sleepsAtNight: false, canGraze: false, ignoresObstacles: false },
  mouse: { habitat: 'woodland', variants: 4, speedFixed: FIXED_UNITS_PER_PIXEL, wanderRadiusTiles: 3, locomotion: 'walk', sleepsAtNight: false, canGraze: true, ignoresObstacles: false },
  butterfly: { habitat: 'meadow_air', variants: 8, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'flutter', sleepsAtNight: false, canGraze: false, ignoresObstacles: true },
  bee: { habitat: 'hive_air', variants: 1, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'flutter', sleepsAtNight: true, canGraze: false, ignoresObstacles: true },
  capybara: { habitat: 'freshwater', variants: 2, speedFixed: HALF_PIXEL, wanderRadiusTiles: 4, locomotion: 'swim', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  camel: { habitat: 'desert', variants: 3, speedFixed: HALF_PIXEL, wanderRadiusTiles: 5, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
  scarab: { habitat: 'desert', variants: 4, speedFixed: HALF_PIXEL, wanderRadiusTiles: 3, locomotion: 'walk', sleepsAtNight: false, canGraze: true, ignoresObstacles: false },
  vulture: { habitat: 'desert', variants: 4, speedFixed: HALF_PIXEL, wanderRadiusTiles: 6, locomotion: 'flutter', sleepsAtNight: true, canGraze: false, ignoresObstacles: true },
  snail: { habitat: 'woodland', variants: 4, speedFixed: Math.max(1, Math.floor(FIXED_UNITS_PER_PIXEL / 8)), wanderRadiusTiles: 2, locomotion: 'walk', sleepsAtNight: true, canGraze: true, ignoresObstacles: false },
};

export interface GeneratedWildlife {
  readonly id: number;
  readonly species: WildlifeSpecies;
  readonly variant: number;
  readonly packId: number;
  readonly habitat: WildlifeHabitat;
  readonly tileX: number;
  readonly tileY: number;
  readonly homeTileX: number;
  readonly homeTileY: number;
}

export interface GeneratedWildlifeHive {
  readonly id: number;
  readonly kind: 'hive' | 'nest';
  readonly variant: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly beeCount: number;
}

interface WildlifeLayout {
  readonly wildlife: readonly GeneratedWildlife[];
  readonly hives: readonly GeneratedWildlifeHive[];
}

interface SpawnPlan {
  readonly species: WildlifeSpecies;
  readonly packCount: number;
  readonly packSize: number;
  readonly minimumPackSpacing: number;
}

const PACK_PLANS: readonly SpawnPlan[] = [
  { species: 'cow', packCount: 6, packSize: 3, minimumPackSpacing: 26 },
  { species: 'sheep', packCount: 6, packSize: 4, minimumPackSpacing: 24 },
  { species: 'pig', packCount: 8, packSize: 4, minimumPackSpacing: 20 },
  { species: 'chicken', packCount: 6, packSize: 6, minimumPackSpacing: 22 },
  { species: 'duck', packCount: 3, packSize: 2, minimumPackSpacing: 18 },
  { species: 'goose', packCount: 1, packSize: 2, minimumPackSpacing: 24 },
  { species: 'swan', packCount: 1, packSize: 2, minimumPackSpacing: 24 },
  { species: 'frog', packCount: 4, packSize: 2, minimumPackSpacing: 22 },
  { species: 'mouse', packCount: 6, packSize: 3, minimumPackSpacing: 18 },
  { species: 'butterfly', packCount: 8, packSize: 3, minimumPackSpacing: 18 },
  { species: 'capybara', packCount: 2, packSize: 1, minimumPackSpacing: 24 },
  { species: 'camel', packCount: 4, packSize: 3, minimumPackSpacing: 28 },
  { species: 'scarab', packCount: 4, packSize: 4, minimumPackSpacing: 20 },
  { species: 'vulture', packCount: 4, packSize: 2, minimumPackSpacing: 28 },
  { species: 'snail', packCount: 8, packSize: 2, minimumPackSpacing: 14 },
];

const layoutCache = new Map<number, WildlifeLayout>();

function wildlifeHash(seed: number, x: number, y: number, salt = 0): number {
  let value = seed ^ salt ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function inlandWater(biome: SurvivalBiome): boolean {
  return biome === 'freshwater' || biome === 'oasis_water';
}

/** Aquatic cells are up to 32px wide, so a center water tile alone is not
 * enough. A two-tile ring admits only water bodies larger than 3x3 and keeps
 * the whole authored body away from the shore blend. */
function inlandWaterClearance(seed: number, tileX: number, tileY: number): boolean {
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      if (!inlandWater(survivalBiomeAt(seed, tileX + offsetX, tileY + offsetY))) return false;
    }
  }
  return true;
}

function besideInlandWater(seed: number, tileX: number, tileY: number): boolean {
  if (survivalBiomeBlocksMovement(survivalBiomeAt(seed, tileX, tileY))) return false;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (inlandWater(survivalBiomeAt(seed, tileX + offsetX, tileY + offsetY))) return true;
    }
  }
  return false;
}

export function wildlifeHabitatAllowsTile(
  habitat: WildlifeHabitat,
  seed: number,
  tileX: number,
  tileY: number,
): boolean {
  if (tileX < 4 || tileY < 4 || tileX >= SURVIVAL_WORLD_SIZE - 4 || tileY >= SURVIVAL_WORLD_SIZE - 4) return false;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  switch (habitat) {
    case 'pasture': return biome === 'plains' || biome === 'meadow' || biome === 'valley' || biome === 'savanna' || biome === 'highland';
    case 'farmyard': return biome === 'plains' || biome === 'meadow' || biome === 'valley' || biome === 'savanna';
    case 'freshwater': return inlandWater(biome) && inlandWaterClearance(seed, tileX, tileY);
    case 'lakeshore': return besideInlandWater(seed, tileX, tileY);
    case 'wetland': return inlandWater(biome) || besideInlandWater(seed, tileX, tileY);
    case 'woodland': return biome === 'forest' || biome === 'meadow' || biome === 'valley';
    case 'meadow_air': return biome === 'meadow' || biome === 'valley' || biome === 'plains' || biome === 'forest';
    case 'hive_air': return biome === 'meadow' || biome === 'valley' || biome === 'forest';
    case 'desert': return biome === 'desert' || biome === 'desert_shore' || biome === 'oasis' || biome === 'savanna';
  }
}

function tileKey(tileX: number, tileY: number): number {
  return tileY * SURVIVAL_WORLD_SIZE + tileX;
}

function squaredTileDistance(left: readonly [number, number], right: readonly [number, number]): number {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  return dx * dx + dy * dy;
}

function candidateTiles(
  habitat: WildlifeHabitat,
  seed: number,
  blockedTiles: ReadonlySet<number>,
): readonly (readonly [number, number])[] {
  const candidates: (readonly [number, number])[] = [];
  for (let tileY = 4; tileY < SURVIVAL_WORLD_SIZE - 4; tileY += 1) {
    for (let tileX = 4; tileX < SURVIVAL_WORLD_SIZE - 4; tileX += 1) {
      if (survivalSpawnProtectedAt(tileX, tileY) || blockedTiles.has(tileKey(tileX, tileY))) continue;
      if (wildlifeHabitatAllowsTile(habitat, seed, tileX, tileY)) candidates.push([tileX, tileY]);
    }
  }
  return candidates;
}

function chooseCenters(
  candidates: readonly (readonly [number, number])[],
  count: number,
  minimumSpacing: number,
  seed: number,
  salt: number,
  allCenters: readonly (readonly [number, number])[],
  minimumOtherSpacing = 12,
): readonly (readonly [number, number])[] {
  const selected: (readonly [number, number])[] = [];
  for (let index = 0; index < count; index += 1) {
    let best: readonly [number, number] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (selected.some((center) => squaredTileDistance(center, candidate) < minimumSpacing * minimumSpacing)) continue;
      if (allCenters.some((center) => squaredTileDistance(center, candidate) < minimumOtherSpacing * minimumOtherSpacing)) continue;
      const score = wildlifeHash(seed, candidate[0], candidate[1], salt ^ Math.imul(index + 1, 0x6c8e9cf5));
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    if (best === null) throw new Error(`Unable to place wildlife center ${salt}:${index}`);
    selected.push(best);
  }
  return selected;
}

function nearbyOffsets(radius: number, seed: number): readonly (readonly [number, number])[] {
  const offsets: (readonly [number, number])[] = [];
  for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) {
    if (x * x + y * y <= radius * radius) offsets.push([x, y]);
  }
  return offsets.sort((left, right) => {
    const leftDistance = left[0] * left[0] + left[1] * left[1];
    const rightDistance = right[0] * right[0] + right[1] * right[1];
    return leftDistance - rightDistance
      || wildlifeHash(seed, left[0] + radius, left[1] + radius) - wildlifeHash(seed, right[0] + radius, right[1] + radius);
  });
}

function placePackMember(
  center: readonly [number, number],
  habitat: WildlifeHabitat,
  seed: number,
  occupied: Set<number>,
  member: number,
  orderingSalt = 0,
): readonly [number, number] {
  const offsets = nearbyOffsets(10, seed ^ orderingSalt ^ Math.imul(member + 1, 0x45d9f3b));
  for (const offset of offsets) {
    const tileX = center[0] + offset[0];
    const tileY = center[1] + offset[1];
    const key = tileKey(tileX, tileY);
    if (!occupied.has(key) && wildlifeHabitatAllowsTile(habitat, seed, tileX, tileY)) {
      occupied.add(key);
      return [tileX, tileY];
    }
  }
  throw new Error(`Unable to place wildlife pack member at ${center.join(',')}`);
}

function buildWildlifeLayout(seed: number): WildlifeLayout {
  const blockedTiles = new Set(generateSurvivalResources(seed).map((resource) => tileKey(resource.tileX, resource.tileY)));
  for (const decoration of generateSurvivalDecorations(seed)) {
    if (survivalDecorationBlocksTraversal(decoration.kind, 'water')) {
      blockedTiles.add(tileKey(decoration.tileX, decoration.tileY));
    }
  }
  const candidatesByHabitat = new Map<WildlifeHabitat, readonly (readonly [number, number])[]>();
  const candidates = (habitat: WildlifeHabitat): readonly (readonly [number, number])[] => {
    const existing = candidatesByHabitat.get(habitat);
    if (existing !== undefined) return existing;
    const generated = candidateTiles(habitat, seed, blockedTiles);
    candidatesByHabitat.set(habitat, generated);
    return generated;
  };
  const occupied = new Set(blockedTiles);
  const allCenters: (readonly [number, number])[] = [];
  const wildlife: GeneratedWildlife[] = [];
  let nextNpcId = WILDLIFE_FIRST_NPC_ID;
  let nextPackId = 1;
  const variantCursor = new Map<WildlifeSpecies, number>();
  const nextVariant = (species: WildlifeSpecies): number => {
    const cursor = variantCursor.get(species) ?? 0;
    variantCursor.set(species, cursor + 1);
    return cursor % WILDLIFE_DEFINITIONS[species].variants;
  };

  // Horses are intentionally solitary. The starter horse remains a separate,
  // named authored spawn owned by the world module.
  const horseDefinition = WILDLIFE_DEFINITIONS.horse;
  const horseCenters = chooseCenters(candidates(horseDefinition.habitat), 14, 18, seed, 0x484f5253, allCenters);
  for (const center of horseCenters) {
    allCenters.push(center);
    occupied.add(tileKey(center[0], center[1]));
    wildlife.push({
      id: nextNpcId++, species: 'horse', variant: nextVariant('horse'),
      packId: 0, habitat: horseDefinition.habitat,
      tileX: center[0], tileY: center[1], homeTileX: center[0], homeTileY: center[1],
    });
  }

  for (const plan of PACK_PLANS) {
    const definition = WILDLIFE_DEFINITIONS[plan.species];
    const centers = chooseCenters(
      candidates(definition.habitat), plan.packCount, plan.minimumPackSpacing,
      seed, wildlifeHash(seed, plan.species.length, plan.packSize, 0x5041434b), allCenters,
      definition.habitat === 'freshwater' ? 4 : 12,
    );
    for (const center of centers) {
      allCenters.push(center);
      const packId = nextPackId++;
      for (let member = 0; member < plan.packSize; member += 1) {
        const position = placePackMember(center, definition.habitat, seed, occupied, member, packId);
        const chickenRooster = plan.species === 'chicken' && member === plan.packSize - 1;
        const species: WildlifeSpecies = chickenRooster ? 'rooster' : plan.species;
        wildlife.push({
          id: nextNpcId++, species,
          variant: nextVariant(species),
          packId, habitat: definition.habitat,
          tileX: position[0], tileY: position[1], homeTileX: center[0], homeTileY: center[1],
        });
      }
    }
  }

  const hiveDefinition = WILDLIFE_DEFINITIONS.bee;
  const hiveCenters = chooseCenters(candidates(hiveDefinition.habitat), 8, 24, seed, 0x48495645, allCenters);
  const hives: GeneratedWildlifeHive[] = [];
  for (let hiveIndex = 0; hiveIndex < hiveCenters.length; hiveIndex += 1) {
    const center = hiveCenters[hiveIndex]!;
    allCenters.push(center);
    const hiveId = hiveIndex + 1;
    const kind = hiveIndex % 2 === 0 ? 'hive' : 'nest';
    hives.push({
      id: hiveId,
      kind,
      variant: kind === 'nest' ? wildlifeHash(seed, center[0], center[1], 0x4e455354) % 6 : 0,
      tileX: center[0], tileY: center[1], beeCount: 5,
    });
    occupied.add(tileKey(center[0], center[1]));
    const packId = nextPackId++;
    for (let bee = 0; bee < 5; bee += 1) {
      const position = placePackMember(center, hiveDefinition.habitat, seed, occupied, bee + 1, packId);
      wildlife.push({
        id: nextNpcId++, species: 'bee', variant: nextVariant('bee'), packId,
        habitat: hiveDefinition.habitat,
        tileX: position[0], tileY: position[1], homeTileX: center[0], homeTileY: center[1],
      });
    }
  }

  return { wildlife, hives };
}

function wildlifeLayout(seed: number): WildlifeLayout {
  const existing = layoutCache.get(seed);
  if (existing !== undefined) return existing;
  const layout = buildWildlifeLayout(seed);
  layoutCache.set(seed, layout);
  return layout;
}

export function generateSurvivalWildlife(seed = SURVIVAL_WORLD_SEED): readonly GeneratedWildlife[] {
  return wildlifeLayout(seed).wildlife;
}

export function generateSurvivalWildlifeHives(seed = SURVIVAL_WORLD_SEED): readonly GeneratedWildlifeHive[] {
  return wildlifeLayout(seed).hives;
}

export function wildlifePosition(tileX: number, tileY: number): Vec2Fixed {
  return {
    x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
}

export function isWildlifeSpecies(value: string): value is WildlifeSpecies {
  return (WILDLIFE_SPECIES as readonly string[]).includes(value);
}

export function wildlifeMovementMedium(species: WildlifeSpecies): MovementMedium {
  const locomotion = WILDLIFE_DEFINITIONS[species].locomotion;
  if (locomotion === 'swim') return 'water';
  if (locomotion === 'flutter') return 'air';
  return 'ground';
}

export interface AmbientWildlifeState {
  readonly id: bigint;
  readonly position: Vec2Fixed;
  readonly home: Vec2Fixed;
  readonly facing: NpcFacing;
  readonly moving: boolean;
  /** A cardinal direction while travelling; otherwise the current idle action. */
  readonly activity: string;
  readonly nextDecisionTick: number;
}

const MOVEMENT_DIRECTIONS = [
  'up', 'down', 'left', 'right', 'up_left', 'up_right', 'down_left', 'down_right',
] as const;
type WildlifeMovementDirection = typeof MOVEMENT_DIRECTIONS[number];
const DIRECTION_VECTORS: Readonly<Record<WildlifeMovementDirection, readonly [number, number]>> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  up_left: [-1, -1], up_right: [1, -1], down_left: [-1, 1], down_right: [1, 1],
};

function activityDirection(activity: string): WildlifeMovementDirection | null {
  return (MOVEMENT_DIRECTIONS as readonly string[]).includes(activity)
    ? activity as WildlifeMovementDirection
    : null;
}

function directionHome(state: AmbientWildlifeState): WildlifeMovementDirection {
  const dx = state.home.x - state.position.x;
  const dy = state.home.y - state.position.y;
  const diagonalThreshold = TILE_SIZE_FIXED / 2;
  if (Math.abs(dx) > diagonalThreshold && Math.abs(dy) > diagonalThreshold) {
    if (dy < 0) return dx < 0 ? 'up_left' : 'up_right';
    return dx < 0 ? 'down_left' : 'down_right';
  }
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

function facingForMovement(direction: WildlifeMovementDirection): NpcFacing {
  if (direction.endsWith('left')) return 'left';
  if (direction.endsWith('right')) return 'right';
  return direction as NpcFacing;
}

function insideLeash(position: Vec2Fixed, home: Vec2Fixed, radius: number): boolean {
  const dx = position.x - home.x;
  const dy = position.y - home.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function wildlifeSleepingAtTick(species: WildlifeSpecies, calendarTick: bigint): boolean {
  if (!WILDLIFE_DEFINITIONS[species].sleepsAtNight) return false;
  const progress = authorityDayProgress(calendarTick);
  return progress < 0.08 || progress > 0.82;
}

export function wildlifeActivityNearPlayers(
  chunkX: number,
  chunkY: number,
  playerChunks: readonly (readonly [number, number])[],
  radius = WILDLIFE_ACTIVE_RADIUS_CHUNKS,
): boolean {
  return playerChunks.some(([playerChunkX, playerChunkY]) => (
    Math.abs(playerChunkX - chunkX) <= radius && Math.abs(playerChunkY - chunkY) <= radius
  ));
}

export interface StepAmbientWildlifeOptions {
  readonly species: WildlifeSpecies;
  readonly seed?: number;
  readonly authorityTick: number;
  readonly calendarTick: bigint;
  readonly collision: CollisionMap;
}

/**
 * Advances only an activated animal. The caller can leave distant rows dormant;
 * decisions are hash-derived from durable state, so reactivation is deterministic
 * and does not require one scheduled reducer per animal.
 */
export function stepAmbientWildlife(
  state: AmbientWildlifeState,
  options: StepAmbientWildlifeOptions,
): AmbientWildlifeState {
  const definition = WILDLIFE_DEFINITIONS[options.species];
  const seed = options.seed ?? SURVIVAL_WORLD_SEED;
  const radius = definition.wanderRadiusTiles * TILE_SIZE_FIXED;
  const asleep = wildlifeSleepingAtTick(options.species, options.calendarTick);
  const homeDistance = Math.max(
    Math.abs(state.home.x - state.position.x),
    Math.abs(state.home.y - state.position.y),
  );
  const beeReturningToHive = options.species === 'bee'
    && asleep
    && homeDistance > definition.speedFixed;
  const currentTileX = Math.floor(state.position.x / TILE_SIZE_FIXED);
  const currentTileY = Math.floor(state.position.y / TILE_SIZE_FIXED);
  const currentHabitatAllowed = wildlifeHabitatAllowsTile(
    definition.habitat, seed, currentTileX, currentTileY,
  );
  if (!currentHabitatAllowed && definition.locomotion !== 'flutter') {
    const homeTileX = Math.floor(state.home.x / TILE_SIZE_FIXED);
    const homeTileY = Math.floor(state.home.y / TILE_SIZE_FIXED);
    if (wildlifeHabitatAllowsTile(definition.habitat, seed, homeTileX, homeTileY)) {
      return {
        ...state,
        position: state.home,
        moving: false,
        activity: 'rest',
        nextDecisionTick: options.authorityTick + 40,
      };
    }
  }
  if (asleep && !beeReturningToHive && currentHabitatAllowed) {
    return {
      ...state,
      position: options.species === 'bee' ? state.home : state.position,
      moving: false,
      activity: options.species === 'bee' ? 'inside_hive' : 'sleep',
      nextDecisionTick: Math.max(state.nextDecisionTick, options.authorityTick + 120),
    };
  }

  let direction = beeReturningToHive ? directionHome(state) : activityDirection(state.activity);
  let nextDecisionTick = state.nextDecisionTick;
  const outsideLeash = !insideLeash(state.position, state.home, radius);
  const returningHome = outsideLeash || beeReturningToHive || !currentHabitatAllowed;
  if (options.authorityTick >= state.nextDecisionTick || beeReturningToHive || !currentHabitatAllowed) {
    const decision = wildlifeHash(Number(state.id & 0xffff_ffffn), options.authorityTick, options.species.length, seed);
    // Airborne wildlife may cross blocked terrain (and briefly cross water),
    // but it cannot choose an idle/landing state until it reaches dry habitat.
    if (returningHome) direction = directionHome(state);
    else if (options.species === 'bee' && state.activity === 'inside_hive') {
      direction = MOVEMENT_DIRECTIONS[decision % MOVEMENT_DIRECTIONS.length] ?? 'right';
      nextDecisionTick = options.authorityTick + 40 + decision % 80;
    }
    else {
      // Long rests and short walks make the island feel inhabited without
      // every animal continuously bobbing. Diagonals prevent grid-like paths.
      const shouldRest = decision % 10 < 6;
      if (shouldRest) {
        if (options.species === 'bee') {
          if (homeDistance <= TILE_SIZE_FIXED) {
            return {
              ...state,
              position: state.home,
              moving: false,
              activity: 'inside_hive',
              nextDecisionTick: options.authorityTick + 120 + decision % 240,
            };
          }
          direction = directionHome(state);
          nextDecisionTick = options.authorityTick + 30;
        } else {
          const activity = definition.canGraze && decision % 4 === 0 ? 'graze' : 'rest';
          return {
            ...state,
            moving: false,
            activity,
            nextDecisionTick: options.authorityTick + 90 + decision % 210,
          };
        }
      } else {
        direction = MOVEMENT_DIRECTIONS[decision % MOVEMENT_DIRECTIONS.length] ?? 'right';
        nextDecisionTick = options.authorityTick + 30 + decision % 90;
      }
      if (direction === null) {
        return {
          ...state,
          moving: false,
          activity: 'rest',
          nextDecisionTick: options.authorityTick + 90,
        };
      }
    }
  }

  if (direction === null) return { ...state, moving: false, nextDecisionTick };
  const vector = DIRECTION_VECTORS[direction];
  const diagonal = vector[0] !== 0 && vector[1] !== 0;
  const step = diagonal
    ? Math.max(1, Math.floor(definition.speedFixed * Math.SQRT1_2))
    : definition.speedFixed;
  const candidate = {
    x: state.position.x + vector[0] * step,
    y: state.position.y + vector[1] * step,
  };
  const tileX = Math.floor(candidate.x / TILE_SIZE_FIXED);
  const tileY = Math.floor(candidate.y / TILE_SIZE_FIXED);
  const habitatAllowed = wildlifeHabitatAllowsTile(definition.habitat, seed, tileX, tileY);
  const airborneTraversalAllowed = definition.locomotion === 'flutter'
    && tileX >= 0 && tileY >= 0 && tileX < SURVIVAL_WORLD_SIZE && tileY < SURVIVAL_WORLD_SIZE;
  const collides = !definition.ignoresObstacles && positionCollides(candidate, options.collision);
  const candidateHomeDistance = Math.max(
    Math.abs(state.home.x - candidate.x),
    Math.abs(state.home.y - candidate.y),
  );
  const allowedToRecover = definition.locomotion === 'flutter'
    && returningHome && candidateHomeDistance < homeDistance;
  if ((!insideLeash(candidate, state.home, radius) && !allowedToRecover)
    || (!habitatAllowed && !airborneTraversalAllowed) || collides) {
    return {
      ...state,
      facing: facingForMovement(direction),
      moving: false,
      activity: 'rest',
      nextDecisionTick: Math.min(nextDecisionTick, options.authorityTick + 8),
    };
  }
  return {
    ...state,
    position: candidate,
    facing: facingForMovement(direction),
    moving: true,
    activity: direction,
    nextDecisionTick,
  };
}

export function hiveProducesHoneyAtTick(calendarTick: bigint): boolean {
  const progress = authorityDayProgress(calendarTick);
  return progress >= 0.12 && progress <= 0.72;
}
