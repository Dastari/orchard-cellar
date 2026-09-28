/** Generator-free survival rules (static-world S6): resource and decoration collision
 * footprints and targeting, landmark reservation and role queries, and resource health.
 * They were in `survival-world.ts` next to the island generator; the client needs them
 * without the generator, so they live here and `survival-world.ts` re-exports them. */
import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionObstacle,
  type MovementMedium,
} from './state.js';
import { playerInteractionOrigin } from './movement.js';
import { TREE_GROWTH_STAGE_BIG, treeHealthForGrowthStage } from './tree-regrowth.js';
import { BOOTSTRAP_SPACE_DEFINITIONS, bootstrapLandmarksForGenerator } from './content/bootstrap-spaces.js';
import { BOOTSTRAP_RESOURCE_REGISTRY } from './content/bootstrap-resources.js';
import type { SurvivalBiome } from './survival-biomes.js';
import {
  isBreakableRockKind,
  isMineableOreKind,
  resourceDefinition,
  survivalResourceCatalog,
  type SurvivalGatherableResourceKind,
  type SurvivalResourceKind,
  type SurvivalResourceRegistry,
} from './survival-resource-catalog.js';
import type { GeneratedSurvivalDecoration } from './survival-landmark-decorations.js';
import type { MiningNodeClass } from './mining.js';
import type { SpaceContentDefinition, SpaceLandmarkDefinition, SpaceTileRectangle } from './content/world-definition.js';

export function survivalFishermanDockWalkableAt(tileX: number, tileY: number): boolean {
  return survivalLandmarksGroundWalkableAt(bootstrapIslandLandmarks(), tileX, tileY);
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

export const bootstrapIslandLandmarks = (): readonly SpaceLandmarkDefinition[] => (
  bootstrapLandmarksForGenerator('island')
);

export type SurvivalLandmarkRegistry = Readonly<{
  spaces: ReadonlyMap<string, SpaceContentDefinition>;
}>;

export const BOOTSTRAP_LANDMARK_REGISTRY: SurvivalLandmarkRegistry = Object.freeze({
  spaces: new Map(BOOTSTRAP_SPACE_DEFINITIONS.map((definition) => [definition.id, definition])),
});

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

export interface SurvivalCampPathTile {
  readonly tileX: number;
  readonly tileY: number;
}

/** The unique tiles of the landmarks' authored path areas (optionally only those with `role`). */
export function survivalLandmarkPathTiles(
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
