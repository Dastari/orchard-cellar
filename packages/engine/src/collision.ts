import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  TOPSIDE_SPACE_ID,
  generateSurvivalDecorations,
  survivalBiomeBlocksTraversal,
  survivalDecorationObstacle,
  survivalFishermanDockWalkableAt,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  survivalTerrainPlaneCollisionBytes,
  runtimePlaceableBlocksMovement,
  runtimeHomesteadBuildDefinition,
  homesteadBuildFootprintTiles,
  type CollisionMap,
  type ContentRegistry,
  type MovementMedium,
} from '@orchard/sim';
import { terrainFixedPlane, terrainMinimumElevation, type TerrainArray } from './terrain.js';

export interface CollisionWorldResource {
  readonly id: bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export interface CollisionWorldChest {
  readonly tileX: number;
  readonly tileY: number;
  readonly carriedBy?: unknown;
}

export interface CollisionWorldPlaceable {
  readonly kind: string;
  readonly definitionId?: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly open: boolean;
  readonly lit?: boolean;
  readonly stateJson?: string;
  readonly carriedBy?: unknown;
}

const cellarBoundaryCollisionCache = new WeakMap<TerrainArray, readonly boolean[]>();

/** Uncut cellar rock is height-owned terrain rather than an absolute blocker.
 * Only the finite 1024x1024 world edge belongs in the legacy flat channel. */
function cellarBoundaryCollision(terrain: TerrainArray): readonly boolean[] {
  let blocked = cellarBoundaryCollisionCache.get(terrain);
  if (blocked !== undefined) return blocked;
  blocked = Array.from({ length: terrain.width * terrain.height }, (_, index) => {
    const tileX = index % terrain.width;
    const tileY = Math.floor(index / terrain.width);
    return tileX === 0 || tileY === 0 || tileX === terrain.width - 1 || tileY === terrain.height - 1;
  });
  cellarBoundaryCollisionCache.set(terrain, blocked);
  return blocked;
}

export type PreparedClientTerrainCollision = Omit<CollisionMap, 'obstacles'>;

/** Reuses explicitly prepared terrain when supplied; live obstacles are always rebuilt. */
export function createClientCollisionMap(
  terrain: TerrainArray,
  resources: Iterable<CollisionWorldResource>,
  chests: Iterable<CollisionWorldChest> = [],
  medium: MovementMedium = 'ground',
  placeables: Iterable<CollisionWorldPlaceable> = [],
  generatedSuppressions: ReadonlySet<string> = new Set<string>(),
  authoredDockWalkableTiles?: readonly { readonly tileX: number; readonly tileY: number }[],
  contentRegistry?: ContentRegistry,
  preparedTerrain?: PreparedClientTerrainCollision,
): CollisionMap {
  const obstacles = [];
  for (const resource of medium === 'ground' ? resources : []) {
    if (generatedSuppressions.has(`resource-${resource.id}`)) continue;
    if (!resource.depleted && survivalResourceBlocksMovement(resource.kind)) {
      obstacles.push(survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY));
    }
  }
  for (const chest of medium === 'ground' ? chests : []) if (chest.carriedBy === undefined) obstacles.push({
    left: chest.tileX * TILE_SIZE_FIXED,
    top: chest.tileY * TILE_SIZE_FIXED,
    right: (chest.tileX + 1) * TILE_SIZE_FIXED - 1,
    bottom: (chest.tileY + 1) * TILE_SIZE_FIXED - 1,
  });
  for (const placeable of medium === 'ground' ? placeables : []) {
    if (placeable.carriedBy !== undefined) continue;
    if (contentRegistry === undefined) continue;
    const reference = { kind: placeable.kind, definitionId: placeable.definitionId };
    if (!runtimePlaceableBlocksMovement(contentRegistry, placeable)) continue;
    for (const tile of homesteadBuildFootprintTiles(
      runtimeHomesteadBuildDefinition(contentRegistry, reference) ?? { footprint: { width: 1, height: 1 } },
      placeable.tileX,
      placeable.tileY,
    )) obstacles.push({
      left: tile.tileX * TILE_SIZE_FIXED,
      top: tile.tileY * TILE_SIZE_FIXED,
      right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  if (terrain.spaceId === TOPSIDE_SPACE_ID) {
    for (const decoration of generateSurvivalDecorations(terrain.seed)) {
      if (generatedSuppressions.has(String(decoration.id))
        || generatedSuppressions.has(`decoration-${decoration.id}`)
        || generatedSuppressions.has(`decoration:${decoration.id}`)) continue;
      const obstacle = survivalDecorationObstacle(decoration, medium);
      if (obstacle !== null) obstacles.push(obstacle);
    }
  }
  return {
    ...(preparedTerrain ?? prepareClientTerrainCollision(terrain, medium, authoredDockWalkableTiles)),
    obstacles,
  };
}

/** A caller may retain this projection only while its terrain and dock inputs
 * are unchanged. Generic/editor callers receive a fresh projection by default. */
export function prepareClientTerrainCollision(
  terrain: TerrainArray,
  medium: MovementMedium = 'ground',
  authoredDockWalkableTiles?: readonly { readonly tileX: number; readonly tileY: number }[],
): PreparedClientTerrainCollision {
  const fixedTerrainPlane = terrainFixedPlane(terrain);
  const terrainBlocked = medium === 'ground'
    ? fixedTerrainPlane !== undefined
      ? cellarBoundaryCollision(terrain)
      : terrain.blocked
    : Array.from(terrain.biomes, (biome) => (
      survivalBiomeBlocksTraversal(SURVIVAL_BIOMES[biome] ?? 'water', medium)
    ));
  let blocked = terrainBlocked;
  if (medium === 'ground' && terrain.spaceId === TOPSIDE_SPACE_ID) {
    let authoredDockCorrection: boolean[] | null = null;
    const configuredDockTiles = authoredDockWalkableTiles === undefined ? null
      : new Set(authoredDockWalkableTiles.map((tile) => `${tile.tileX}:${tile.tileY}`));
    for (let index = 0; index < terrainBlocked.length; index += 1) {
      if (!terrainBlocked[index]
        || !(configuredDockTiles?.has(`${index % terrain.width}:${Math.floor(index / terrain.width)}`)
          ?? survivalFishermanDockWalkableAt(index % terrain.width, Math.floor(index / terrain.width)))) continue;
      authoredDockCorrection ??= Array.from(terrainBlocked);
      authoredDockCorrection[index] = false;
    }
    blocked = authoredDockCorrection ?? terrainBlocked;
  }
  return {
    width: terrain.width,
    height: terrain.height,
    blocked,
    ...(medium === 'ground' ? { elevations: terrain.elevations } : {}),
    ...(medium === 'ground' && fixedTerrainPlane !== undefined
      ? { fixedTerrainPlane }
      : {}),
    ...(medium === 'ground'
      ? terrain.spaceId === TOPSIDE_SPACE_ID
        ? { terrainPlaneBlocked: terrain.terrainPlaneBlocked
          ?? survivalTerrainPlaneCollisionBytes(terrain.seed) }
        : terrain.terrainPlaneBlocked === undefined
          ? {}
          : { terrainPlaneBlocked: terrain.terrainPlaneBlocked }
      : {}),
    ...(medium === 'ground' && terrain.terrainTransitions !== undefined
      ? { terrainTransitions: terrain.terrainTransitions }
      : {}),
    ...(medium === 'ground' ? { terrainMinimumElevation: terrainMinimumElevation(terrain) } : {}),
    ...(medium === 'ground' ? { horseJumpableTerrain: terrain.horseJumpableTerrain } : {}),
  };
}
