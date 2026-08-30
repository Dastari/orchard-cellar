import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  TOPSIDE_SPACE_ID,
  generateSurvivalDecorations,
  survivalBiomeBlocksTraversal,
  survivalDecorationObstacle,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  survivalTerrainPlaneCollisionBytes,
  placeableDefinition,
  homesteadBuildDefinition,
  homesteadBuildFootprintTiles,
  type CollisionMap,
  type MovementMedium,
} from '@orchard/sim';
import type { WorldChest, WorldPlaceable, WorldResource } from '../net/generated/types.js';
import type { TerrainArray } from './terrain.js';

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

/** Reuses immutable terrain collision and rebuilds only subscribed live trunks. */
export function createClientCollisionMap(
  terrain: TerrainArray,
  resources: Iterable<WorldResource>,
  chests: Iterable<WorldChest> = [],
  medium: MovementMedium = 'ground',
  placeables: Iterable<WorldPlaceable> = [],
): CollisionMap {
  const obstacles = [];
  for (const resource of medium === 'ground' ? resources : []) {
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
    const definition = placeableDefinition(placeable.kind);
    if (definition?.blocksMovement !== true || placeable.open) continue;
    for (const tile of homesteadBuildFootprintTiles(
      homesteadBuildDefinition(placeable.kind) ?? { footprint: { width: 1, height: 1 } },
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
      const obstacle = survivalDecorationObstacle(decoration, medium);
      if (obstacle !== null) obstacles.push(obstacle);
    }
  }
  return {
    width: terrain.width,
    height: terrain.height,
    blocked: medium === 'ground'
      ? terrain.generator === 'cellar'
        ? cellarBoundaryCollision(terrain)
        : terrain.blocked
      : Array.from(terrain.biomes, (biome) => (
        survivalBiomeBlocksTraversal(SURVIVAL_BIOMES[biome] ?? 'water', medium)
      )),
    ...(medium === 'ground' ? { elevations: terrain.elevations } : {}),
    ...(medium === 'ground' && terrain.generator === 'cellar'
      ? { fixedTerrainPlane: 0 }
      : {}),
    ...(medium === 'ground'
      ? terrain.spaceId === TOPSIDE_SPACE_ID
        ? { terrainPlaneBlocked: survivalTerrainPlaneCollisionBytes(terrain.seed) }
        : terrain.terrainPlaneBlocked === undefined
          ? {}
          : { terrainPlaneBlocked: terrain.terrainPlaneBlocked }
      : {}),
    ...(medium === 'ground' && terrain.terrainTransitions !== undefined
      ? { terrainTransitions: terrain.terrainTransitions }
      : {}),
    ...(medium === 'ground' ? { horseJumpableTerrain: terrain.horseJumpableTerrain } : {}),
    obstacles,
  };
}
