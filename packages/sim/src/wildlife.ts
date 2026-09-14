import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { runtimeCreatureDefinition } from './content/runtime.js';
import type { ContentRegistry } from './content/registry.js';
import type { CreatureContentDefinition } from './content/world-definition.js';
import { movementPositionAllowed } from './movement.js';
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
import { authorityDayProgress, dayProgressAtClockTime } from './time.js';
import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type MovementMedium,
  type Vec2Fixed,
} from './state.js';
import type { NpcFacing } from './npc.js';

// Terrain v26 adds nested ridge rows; regenerate ambient homes so no durable
// animal or hive remains inside a newly raised contour wall.
export const WILDLIFE_GENERATION_VERSION = 5;
export const WILDLIFE_FIRST_NPC_ID = 10_000;
export const WILDLIFE_ACTIVE_RADIUS_CHUNKS = 3;

export const WILDLIFE_SPECIES = [
  'horse', 'cow', 'sheep', 'pig', 'chicken', 'rooster',
  'duck', 'goose', 'swan', 'frog', 'mouse', 'butterfly', 'bee',
  'capybara', 'camel', 'scarab', 'vulture', 'snail',
] as const;
export type WildlifeSpecies = typeof WILDLIFE_SPECIES[number];

/** Species that are ordinarily fed hay when kept as farm livestock. This is
 * deliberately narrower than `canGraze`: pigs, poultry, mice, and snails may
 * forage, but should not perform the authored hay-bale routine. */

export const WILDLIFE_HABITATS = [
  'pasture', 'farmyard', 'freshwater', 'lakeshore', 'wetland',
  'woodland', 'meadow_air', 'hive_air', 'desert',
] as const;
export type WildlifeHabitat = typeof WILDLIFE_HABITATS[number];

export type WildlifeLocomotion = 'walk' | 'swim' | 'hop' | 'flutter';

export interface WildlifeSpeciesDefinition {
  readonly id: CreatureContentDefinition['id'];
  readonly species: string;
  readonly habitat: WildlifeHabitat;
  readonly variants: number;
  readonly speedFixed: number;
  readonly wanderRadiusTiles: number;
  readonly locomotion: WildlifeLocomotion;
  readonly sleepsAtNight: boolean;
  readonly canGraze: boolean;
  readonly ignoresObstacles: boolean;
  readonly behavior?: CreatureContentDefinition['behavior'];
  readonly combat: CreatureContentDefinition['combat'];
  readonly panic: CreatureContentDefinition['panic'];
  readonly hayFeeding?: CreatureContentDefinition['hayFeeding'];
}

const BOOTSTRAP_WILDLIFE = BOOTSTRAP_COMPILED_CONTENT;
export const WILDLIFE_DEFINITIONS: Readonly<Record<WildlifeSpecies, WildlifeSpeciesDefinition>> = Object.freeze(
  Object.fromEntries(WILDLIFE_SPECIES.map((species) => {
    const definition = BOOTSTRAP_WILDLIFE.creatures[species];
    if (definition === undefined) throw new Error(`bootstrap_creature_missing:${species}`);
    return [species, definition] as const;
  })) as unknown as Record<WildlifeSpecies, WildlifeSpeciesDefinition>,
);

/** Bootstrap-only compatibility values for callers awaiting active-registry
 * injection. Canonical values are authored on every creature definition. */
export const WILDLIFE_PANIC_DURATION_TICKS = WILDLIFE_DEFINITIONS.cow.panic.durationTicks;
export const WILDLIFE_PANIC_RADIUS_FIXED = WILDLIFE_DEFINITIONS.cow.panic.radiusFixed;
export const WILDLIFE_KNOCKBACK_FIXED = WILDLIFE_DEFINITIONS.cow.panic.knockbackFixed;
export const HAY_EATING_WILDLIFE_SPECIES = Object.freeze(WILDLIFE_SPECIES.filter(
  (species) => WILDLIFE_DEFINITIONS[species].hayFeeding !== undefined,
));

export function wildlifeEatsHay(species: WildlifeSpecies): boolean {
  return WILDLIFE_DEFINITIONS[species].hayFeeding !== undefined;
}

export function runtimeWildlifeDefinition(
  registry: ContentRegistry,
  species: string,
): CreatureContentDefinition | null {
  return runtimeCreatureDefinition(registry, species);
}

export function runtimeWildlifeEatsHay(registry: ContentRegistry, species: string): boolean {
  return runtimeCreatureDefinition(registry, species)?.hayFeeding !== undefined;
}

export function runtimeWildlifePanicGroup(registry: ContentRegistry, species: string): string | null {
  return runtimeCreatureDefinition(registry, species)?.panic.group ?? null;
}

export function runtimeWildlifeUsesHive(registry: ContentRegistry, species: string): boolean {
  return runtimeCreatureDefinition(registry, species)?.behavior?.hiveReturn === true;
}

export function runtimeWildlifeMovementMedium(
  registry: ContentRegistry,
  species: string,
): MovementMedium | null {
  const definition = runtimeCreatureDefinition(registry, species);
  if (definition === null) return null;
  if (definition.locomotion === 'swim') return 'water';
  if (definition.locomotion === 'flutter') return 'air';
  return 'ground';
}

export interface GeneratedWildlife {
  readonly id: number;
  readonly species: string;
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

export interface WildlifeSpawnPlan {
  readonly species: string;
  readonly packCount: number;
  readonly packSize: number;
  readonly minimumPackSpacing: number;
}

const BOOTSTRAP_SPAWNS_BY_SPECIES = new Map(
  BOOTSTRAP_WILDLIFE.spawns.map((plan) => [plan.species, plan] as const),
);
export const WILDLIFE_SPAWN_PLANS: readonly WildlifeSpawnPlan[] = Object.freeze(
  WILDLIFE_SPECIES.flatMap((species) => {
    const plan = BOOTSTRAP_SPAWNS_BY_SPECIES.get(species);
    return plan === undefined ? [] : [plan];
  }),
);

export function runtimeWildlifeSpawnPlans(registry: ContentRegistry): readonly WildlifeSpawnPlan[] {
  const creatures = new Map([...registry.creatures.values()]
    .filter((definition) => definition.retired !== true)
    .map((definition) => [definition.id, definition] as const));
  return [...registry.spawns.values()].filter((definition) => (
    definition.retired !== true && definition.strategy === 'packs'
    && definition.packCount !== undefined && definition.packSize !== undefined
    && definition.minimumPackSpacing !== undefined
  )).flatMap((definition) => {
    const creature = creatures.get(definition.target as CreatureContentDefinition['id']);
    if (creature === undefined) return [];
    return [{ species: creature.species, packCount: definition.packCount!, packSize: definition.packSize!,
      minimumPackSpacing: definition.minimumPackSpacing! }];
  }).sort((left, right) => {
    const leftIndex = WILDLIFE_SPECIES.indexOf(left.species as WildlifeSpecies);
    const rightIndex = WILDLIFE_SPECIES.indexOf(right.species as WildlifeSpecies);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
      - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
      || left.species.localeCompare(right.species);
  });
}

const layoutCache = new Map<number, WildlifeLayout>();
const runtimeLayoutCache = new Map<string, WildlifeLayout>();

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

function buildWildlifeLayout(
  seed: number,
  definitions: ReadonlyMap<string, WildlifeSpeciesDefinition>,
  spawnPlans: readonly WildlifeSpawnPlan[],
  registry?: ContentRegistry,
): WildlifeLayout {
  const blockedTiles = new Set(generateSurvivalResources(seed, registry)
    .map((resource) => tileKey(resource.tileX, resource.tileY)));
  for (const decoration of generateSurvivalDecorations(seed, registry)) {
    if (survivalDecorationBlocksTraversal(decoration.kind, 'water', registry)) {
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
  const definitionsById = new Map([...definitions.values()].map((definition) => [definition.id, definition] as const));
  let nextNpcId = WILDLIFE_FIRST_NPC_ID;
  let nextPackId = 1;
  const variantCursor = new Map<string, number>();
  const nextVariant = (species: string): number => {
    const cursor = variantCursor.get(species) ?? 0;
    variantCursor.set(species, cursor + 1);
    const definition = definitions.get(species);
    if (definition === undefined) return 0;
    return cursor % definition.variants;
  };

  // Horses are intentionally solitary. The starter horse remains a separate,
  // named authored spawn owned by the world module.
  const horseDefinition = definitions.get('horse');
  if (horseDefinition !== undefined) {
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
  }

  for (const plan of spawnPlans) {
    const definition = definitions.get(plan.species);
    if (definition === undefined) continue;
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
        const trailingDefinitionId = definition.behavior?.trailingPackMember;
        const trailingDefinition = trailingDefinitionId === undefined ? undefined
          : definitionsById.get(trailingDefinitionId);
        const species = member === plan.packSize - 1 && trailingDefinition !== undefined
          ? trailingDefinition.species : plan.species;
        wildlife.push({
          id: nextNpcId++, species,
          variant: nextVariant(species),
          packId, habitat: definition.habitat,
          tileX: position[0], tileY: position[1], homeTileX: center[0], homeTileY: center[1],
        });
      }
    }
  }

  const hives: GeneratedWildlifeHive[] = [];
  const hiveDefinitions = [...definitions.values()].filter((definition) => definition.behavior?.hiveReturn === true);
  const hiveDefinition = hiveDefinitions.length === 1 ? hiveDefinitions[0] : undefined;
  const hiveCenters = hiveDefinition === undefined ? []
    : chooseCenters(candidates(hiveDefinition.habitat), 8, 24, seed, 0x48495645, allCenters);
  for (let hiveIndex = 0; hiveIndex < hiveCenters.length && hiveDefinition !== undefined; hiveIndex += 1) {
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
        id: nextNpcId++, species: hiveDefinition.species, variant: nextVariant(hiveDefinition.species), packId,
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
  const layout = buildWildlifeLayout(seed, new Map(Object.entries(WILDLIFE_DEFINITIONS)), WILDLIFE_SPAWN_PLANS);
  layoutCache.set(seed, layout);
  return layout;
}

export function generateSurvivalWildlife(seed = SURVIVAL_WORLD_SEED): readonly GeneratedWildlife[] {
  return wildlifeLayout(seed).wildlife;
}

export function generateSurvivalWildlifeHives(seed = SURVIVAL_WORLD_SEED): readonly GeneratedWildlifeHive[] {
  return wildlifeLayout(seed).hives;
}

function activeWildlifeDefinitions(
  registry: ContentRegistry,
): ReadonlyMap<string, WildlifeSpeciesDefinition> {
  return new Map([...registry.creatures.values()].filter((definition) => (
    definition.retired !== true
  )).map((definition) => [definition.species, definition] as const));
}

function runtimeWildlifeLayout(registry: ContentRegistry, seed: number): WildlifeLayout {
  const key = `${registry.contentHash}:${seed}`;
  const existing = runtimeLayoutCache.get(key);
  if (existing !== undefined) return existing;
  const layout = buildWildlifeLayout(
    seed, activeWildlifeDefinitions(registry), runtimeWildlifeSpawnPlans(registry), registry,
  );
  runtimeLayoutCache.set(key, layout);
  return layout;
}

export function generateSurvivalWildlifeForRegistry(
  registry: ContentRegistry,
  seed = SURVIVAL_WORLD_SEED,
): readonly GeneratedWildlife[] {
  return runtimeWildlifeLayout(registry, seed).wildlife;
}

export function generateSurvivalWildlifeHivesForRegistry(
  registry: ContentRegistry,
  seed = SURVIVAL_WORLD_SEED,
): readonly GeneratedWildlifeHive[] {
  return runtimeWildlifeLayout(registry, seed).hives;
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

/** Roosters and chickens share alarm calls; other authored species currently
 * panic with their exact species only. */
export function wildlifePanicGroup(species: WildlifeSpecies): string {
  return WILDLIFE_DEFINITIONS[species].panic.group;
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

function panicDirections(
  state: Pick<AmbientWildlifeState, 'id' | 'position'>,
  threat: Vec2Fixed,
  authorityTick: number,
): readonly WildlifeMovementDirection[] {
  let awayX = state.position.x - threat.x;
  let awayY = state.position.y - threat.y;
  if (awayX === 0 && awayY === 0) {
    const fallback = wildlifeHash(Number(state.id & 0xffff_ffffn), authorityTick, 0x50414e49);
    const direction = MOVEMENT_DIRECTIONS[fallback % MOVEMENT_DIRECTIONS.length] ?? 'right';
    const vector = DIRECTION_VECTORS[direction];
    awayX = vector[0];
    awayY = vector[1];
  }
  const tieSalt = wildlifeHash(Number(state.id & 0xffff_ffffn), authorityTick, 0x464c4545);
  return [...MOVEMENT_DIRECTIONS].sort((left, right) => {
    const leftVector = DIRECTION_VECTORS[left];
    const rightVector = DIRECTION_VECTORS[right];
    const leftLength = leftVector[0] !== 0 && leftVector[1] !== 0 ? Math.SQRT2 : 1;
    const rightLength = rightVector[0] !== 0 && rightVector[1] !== 0 ? Math.SQRT2 : 1;
    const leftScore = (leftVector[0] * awayX + leftVector[1] * awayY) / leftLength;
    const rightScore = (rightVector[0] * awayX + rightVector[1] * awayY) / rightLength;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return wildlifeHash(tieSalt, MOVEMENT_DIRECTIONS.indexOf(left), 0)
      - wildlifeHash(tieSalt, MOVEMENT_DIRECTIONS.indexOf(right), 0);
  });
}

function wildlifeStepCandidate(
  position: Vec2Fixed,
  direction: WildlifeMovementDirection,
  speedFixed: number,
): Vec2Fixed {
  const vector = DIRECTION_VECTORS[direction];
  const diagonal = vector[0] !== 0 && vector[1] !== 0;
  const step = diagonal ? Math.max(1, Math.floor(speedFixed * Math.SQRT1_2)) : speedFixed;
  return { x: position.x + vector[0] * step, y: position.y + vector[1] * step };
}

function wildlifeCandidateAllowed(
  position: Vec2Fixed,
  candidate: Vec2Fixed,
  definition: WildlifeSpeciesDefinition,
  collision: CollisionMap,
  seed: number,
): boolean {
  const tileX = Math.floor(candidate.x / TILE_SIZE_FIXED);
  const tileY = Math.floor(candidate.y / TILE_SIZE_FIXED);
  const airborneTraversalAllowed = definition.locomotion === 'flutter'
    && tileX >= 0 && tileY >= 0 && tileX < SURVIVAL_WORLD_SIZE && tileY < SURVIVAL_WORLD_SIZE;
  if (!wildlifeHabitatAllowsTile(definition.habitat, seed, tileX, tileY)
    && !airborneTraversalAllowed) return false;
  return definition.ignoresObstacles || movementPositionAllowed(position, candidate, collision);
}

export interface StepPanickedWildlifeOptions {
  readonly species: string;
  readonly authorityTick: number;
  readonly collision: CollisionMap;
  readonly threat: Vec2Fixed;
  readonly seed?: number;
}

/** Panic deliberately ignores the home leash. Once it expires, the ambient
 * walker sees the animal outside its leash and guides it home naturally. */
export function stepPanickedWildlife(
  state: AmbientWildlifeState,
  options: StepPanickedWildlifeOptions & { readonly species: WildlifeSpecies },
): AmbientWildlifeState {
  return stepPanickedWildlifeWithDefinition(state, options, WILDLIFE_DEFINITIONS[options.species]);
}

function stepPanickedWildlifeWithDefinition(
  state: AmbientWildlifeState,
  options: StepPanickedWildlifeOptions,
  definition: WildlifeSpeciesDefinition,
): AmbientWildlifeState {
  const seed = options.seed ?? SURVIVAL_WORLD_SEED;
  const speed = Math.max(1, Math.floor(
    definition.speedFixed * definition.panic.speedMultiplierPermille / 1_000,
  ));
  const directions = panicDirections(state, options.threat, options.authorityTick);
  for (const direction of directions) {
    const candidate = wildlifeStepCandidate(state.position, direction, speed);
    if (!wildlifeCandidateAllowed(state.position, candidate, definition, options.collision, seed)) continue;
    return {
      ...state,
      position: candidate,
      facing: facingForMovement(direction),
      moving: true,
      activity: 'panic',
    };
  }
  return {
    ...state,
    facing: facingForMovement(directions[0] ?? 'right'),
    moving: false,
    activity: 'panic',
  };
}

export function runtimeStepPanickedWildlife(
  registry: ContentRegistry,
  state: AmbientWildlifeState,
  options: StepPanickedWildlifeOptions,
): AmbientWildlifeState | null {
  const definition = runtimeCreatureDefinition(registry, options.species);
  return definition === null ? null : stepPanickedWildlifeWithDefinition(state, options, definition);
}

export interface KnockbackWildlifeOptions {
  readonly species: string;
  readonly collision: CollisionMap;
  readonly threat: Vec2Fixed;
  readonly seed?: number;
}

/** Resolves hit displacement in one-pixel collision-safe substeps so melee and
 * arrows cannot push animals through terrain or authored obstacles. */
export function knockbackWildlife(
  position: Vec2Fixed,
  options: KnockbackWildlifeOptions & { readonly species: WildlifeSpecies },
): Vec2Fixed {
  return knockbackWildlifeWithDefinition(position, options, WILDLIFE_DEFINITIONS[options.species]);
}

function knockbackWildlifeWithDefinition(
  position: Vec2Fixed,
  options: KnockbackWildlifeOptions,
  definition: WildlifeSpeciesDefinition,
): Vec2Fixed {
  const seed = options.seed ?? SURVIVAL_WORLD_SEED;
  let moved = position;
  const state = { id: 0n, position };
  const directions = panicDirections(state, options.threat, 0);
  for (let distance = 0; distance < definition.panic.knockbackFixed; distance += FIXED_UNITS_PER_PIXEL) {
    let next = moved;
    for (const direction of directions) {
      const candidate = wildlifeStepCandidate(moved, direction, FIXED_UNITS_PER_PIXEL);
      if (!wildlifeCandidateAllowed(moved, candidate, definition, options.collision, seed)) continue;
      next = candidate;
      break;
    }
    if (next === moved) break;
    moved = next;
  }
  return moved;
}

export function runtimeKnockbackWildlife(
  registry: ContentRegistry,
  position: Vec2Fixed,
  options: KnockbackWildlifeOptions,
): Vec2Fixed | null {
  const definition = runtimeCreatureDefinition(registry, options.species);
  return definition === null ? null : knockbackWildlifeWithDefinition(position, options, definition);
}

function insideLeash(position: Vec2Fixed, home: Vec2Fixed, radius: number): boolean {
  const dx = position.x - home.x;
  const dy = position.y - home.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function wildlifeSleepingAtTick(species: WildlifeSpecies, calendarTick: bigint): boolean {
  return wildlifeSleepingForDefinition(WILDLIFE_DEFINITIONS[species], calendarTick);
}

function wildlifeSleepingForDefinition(definition: WildlifeSpeciesDefinition, calendarTick: bigint): boolean {
  if (!definition.sleepsAtNight) return false;
  const progress = authorityDayProgress(calendarTick);
  return progress < dayProgressAtClockTime(7, 36) || progress > dayProgressAtClockTime(22, 24);
}

export function runtimeWildlifeSleepingAtTick(
  registry: ContentRegistry,
  species: string,
  calendarTick: bigint,
): boolean | null {
  const definition = runtimeCreatureDefinition(registry, species);
  return definition === null ? null : wildlifeSleepingForDefinition(definition, calendarTick);
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
  readonly species: string;
  readonly seed?: number;
  readonly authorityTick: number;
  readonly calendarTick: bigint;
  readonly collision: CollisionMap;
  /** Immutable scenery targets supplied only for authored farm livestock. */
  readonly hayTargets?: readonly Vec2Fixed[];
}

export const WILDLIFE_SEEK_HAY_ACTIVITY = 'seek_hay';
export const WILDLIFE_EAT_HAY_ACTIVITY = 'eat_hay';
export const WILDLIFE_RETURN_HOME_ACTIVITY = 'return_home';
function closestHayTarget(position: Vec2Fixed, targets: readonly Vec2Fixed[]): Vec2Fixed | null {
  let closest: Vec2Fixed | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = dx * dx + dy * dy;
    if (distance >= closestDistance) continue;
    closest = target;
    closestDistance = distance;
  }
  return closest;
}

function targetWithinReach(position: Vec2Fixed, target: Vec2Fixed, reach: number): boolean {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  return dx * dx + dy * dy <= reach * reach;
}

function directionsTowardTarget(
  state: Pick<AmbientWildlifeState, 'id' | 'position'>,
  target: Vec2Fixed,
  authorityTick: number,
): readonly WildlifeMovementDirection[] {
  const towardX = target.x - state.position.x;
  const towardY = target.y - state.position.y;
  const tieSalt = wildlifeHash(Number(state.id & 0xffff_ffffn), authorityTick, 0x484159);
  return [...MOVEMENT_DIRECTIONS].sort((left, right) => {
    const leftVector = DIRECTION_VECTORS[left];
    const rightVector = DIRECTION_VECTORS[right];
    const leftLength = leftVector[0] !== 0 && leftVector[1] !== 0 ? Math.SQRT2 : 1;
    const rightLength = rightVector[0] !== 0 && rightVector[1] !== 0 ? Math.SQRT2 : 1;
    const leftScore = (leftVector[0] * towardX + leftVector[1] * towardY) / leftLength;
    const rightScore = (rightVector[0] * towardX + rightVector[1] * towardY) / rightLength;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return wildlifeHash(tieSalt, MOVEMENT_DIRECTIONS.indexOf(left), 0)
      - wildlifeHash(tieSalt, MOVEMENT_DIRECTIONS.indexOf(right), 0);
  });
}

function stepWildlifeToward(
  state: AmbientWildlifeState,
  target: Vec2Fixed,
  activity: string,
  options: StepAmbientWildlifeOptions,
  seed: number,
  definition: WildlifeSpeciesDefinition,
): AmbientWildlifeState | null {
  const speed = definition.speedFixed;
  for (const direction of directionsTowardTarget(state, target, options.authorityTick)) {
    const candidate = wildlifeStepCandidate(state.position, direction, speed);
    if (!wildlifeCandidateAllowed(state.position, candidate, definition, options.collision, seed)) continue;
    return {
      ...state,
      position: candidate,
      facing: facingForMovement(direction),
      moving: true,
      activity,
    };
  }
  return null;
}

/**
 * Advances only an activated animal. The caller can leave distant rows dormant;
 * decisions are hash-derived from durable state, so reactivation is deterministic
 * and does not require one scheduled reducer per animal.
 */
export function stepAmbientWildlife(
  state: AmbientWildlifeState,
  options: StepAmbientWildlifeOptions & { readonly species: WildlifeSpecies },
): AmbientWildlifeState {
  return stepAmbientWildlifeWithDefinition(state, options, WILDLIFE_DEFINITIONS[options.species]);
}

function stepAmbientWildlifeWithDefinition(
  state: AmbientWildlifeState,
  options: StepAmbientWildlifeOptions,
  definition: WildlifeSpeciesDefinition,
): AmbientWildlifeState {
  const seed = options.seed ?? SURVIVAL_WORLD_SEED;
  const radius = definition.wanderRadiusTiles * TILE_SIZE_FIXED;
  const asleep = wildlifeSleepingForDefinition(definition, options.calendarTick);
  const homeDistance = Math.max(
    Math.abs(state.home.x - state.position.x),
    Math.abs(state.home.y - state.position.y),
  );
  const returnsToHive = definition.behavior?.hiveReturn === true;
  const returningToHive = returnsToHive
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
  const hayPolicy = definition.hayFeeding;
  const hayTargets = hayPolicy === undefined ? [] : options.hayTargets ?? [];
  if (state.activity === WILDLIFE_EAT_HAY_ACTIVITY) {
    if (options.authorityTick < state.nextDecisionTick) {
      return { ...state, moving: false, activity: WILDLIFE_EAT_HAY_ACTIVITY };
    }
    return {
      ...state,
      moving: false,
      activity: WILDLIFE_RETURN_HOME_ACTIVITY,
      nextDecisionTick: options.authorityTick + (hayPolicy?.journeyTicks ?? 1),
    };
  }
  if (state.activity === WILDLIFE_RETURN_HOME_ACTIVITY) {
    if (targetWithinReach(state.position, state.home, definition.speedFixed)) {
      return {
        ...state,
        position: state.home,
        moving: false,
        activity: 'rest',
        nextDecisionTick: options.authorityTick + 90,
      };
    }
    const returning = stepWildlifeToward(
      state, state.home, WILDLIFE_RETURN_HOME_ACTIVITY, options, seed, definition,
    );
    return returning ?? {
      ...state,
      moving: false,
      activity: 'rest',
      nextDecisionTick: options.authorityTick + 20,
    };
  }
  if (state.activity === WILDLIFE_SEEK_HAY_ACTIVITY) {
    const hay = closestHayTarget(state.position, hayTargets);
    if (hay === null || options.authorityTick >= state.nextDecisionTick) {
      return {
        ...state,
        moving: false,
        activity: WILDLIFE_RETURN_HOME_ACTIVITY,
        nextDecisionTick: options.authorityTick + (hayPolicy?.journeyTicks ?? 1),
      };
    }
    if (targetWithinReach(state.position, hay, hayPolicy?.reachFixed ?? 1)) {
      return {
        ...state,
        moving: false,
        activity: WILDLIFE_EAT_HAY_ACTIVITY,
        nextDecisionTick: options.authorityTick + (hayPolicy?.snackTicks ?? 1),
      };
    }
    const seeking = stepWildlifeToward(
      state, hay, WILDLIFE_SEEK_HAY_ACTIVITY, options, seed, definition,
    );
    return seeking ?? {
      ...state,
      moving: false,
      activity: WILDLIFE_RETURN_HOME_ACTIVITY,
      nextDecisionTick: options.authorityTick + (hayPolicy?.journeyTicks ?? 1),
    };
  }

  // A livestock animal already out for a snack completes its return before
  // settling for the night. New hay trips are never selected while asleep.
  if (asleep && !returningToHive && currentHabitatAllowed) {
    return {
      ...state,
      position: returnsToHive ? state.home : state.position,
      moving: false,
      activity: returnsToHive ? 'inside_hive' : 'sleep',
      nextDecisionTick: Math.max(state.nextDecisionTick, options.authorityTick + 120),
    };
  }

  let direction = returningToHive ? directionHome(state) : activityDirection(state.activity);
  let nextDecisionTick = state.nextDecisionTick;
  const outsideLeash = !insideLeash(state.position, state.home, radius);
  const returningHome = outsideLeash || returningToHive || !currentHabitatAllowed;
  if (options.authorityTick >= state.nextDecisionTick || returningToHive || !currentHabitatAllowed) {
    const decision = wildlifeHash(Number(state.id & 0xffff_ffffn), options.authorityTick, options.species.length, seed);
    // Airborne wildlife may cross blocked terrain (and briefly cross water),
    // but it cannot choose an idle/landing state until it reaches dry habitat.
    if (returningHome) direction = directionHome(state);
    else if (returnsToHive && state.activity === 'inside_hive') {
      direction = MOVEMENT_DIRECTIONS[decision % MOVEMENT_DIRECTIONS.length] ?? 'right';
      nextDecisionTick = options.authorityTick + 40 + decision % 80;
    }
    else {
      if (hayPolicy !== undefined && hayTargets.length > 0 && decision % hayPolicy.decisionOneIn === 0) {
        const hay = closestHayTarget(state.position, hayTargets);
        if (hay !== null) {
          const seekingState = {
            ...state,
            activity: WILDLIFE_SEEK_HAY_ACTIVITY,
            nextDecisionTick: options.authorityTick + hayPolicy.journeyTicks,
          };
          if (targetWithinReach(state.position, hay, hayPolicy.reachFixed)) {
            return {
              ...seekingState,
              moving: false,
              activity: WILDLIFE_EAT_HAY_ACTIVITY,
              nextDecisionTick: options.authorityTick + hayPolicy.snackTicks,
            };
          }
          return stepWildlifeToward(
            seekingState, hay, WILDLIFE_SEEK_HAY_ACTIVITY, options, seed, definition,
          ) ?? {
            ...state,
            moving: false,
            activity: 'rest',
            nextDecisionTick: options.authorityTick + 90,
          };
        }
      }
      // Long rests and short walks make the island feel inhabited without
      // every animal continuously bobbing. Diagonals prevent grid-like paths.
      const shouldRest = decision % 10 < 6;
      if (shouldRest) {
        if (returnsToHive) {
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
  const collides = !definition.ignoresObstacles
    && !movementPositionAllowed(state.position, candidate, options.collision);
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

export function runtimeStepAmbientWildlife(
  registry: ContentRegistry,
  state: AmbientWildlifeState,
  options: StepAmbientWildlifeOptions,
): AmbientWildlifeState | null {
  const definition = runtimeCreatureDefinition(registry, options.species);
  return definition === null ? null : stepAmbientWildlifeWithDefinition(state, options, definition);
}

export function hiveProducesHoneyAtTick(calendarTick: bigint): boolean {
  const progress = authorityDayProgress(calendarTick);
  return progress >= dayProgressAtClockTime(8, 24) && progress <= dayProgressAtClockTime(20, 24);
}
