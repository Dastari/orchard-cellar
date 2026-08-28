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
  type CollisionMap,
  type MovementMedium,
} from '@orchard/sim';
import type { WorldChest, WorldPlaceable, WorldResource } from '../net/generated/types.js';
import type { TerrainArray } from './terrain.js';

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
    obstacles.push({
      left: placeable.tileX * TILE_SIZE_FIXED,
      top: placeable.tileY * TILE_SIZE_FIXED,
      right: (placeable.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (placeable.tileY + 1) * TILE_SIZE_FIXED - 1,
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
    blocked: medium === 'ground' ? terrain.blocked : Array.from(terrain.biomes, (biome) => (
      survivalBiomeBlocksTraversal(SURVIVAL_BIOMES[biome] ?? 'water', medium)
    )),
    ...(medium === 'ground' ? { elevations: terrain.elevations } : {}),
    ...(medium === 'ground' && terrain.spaceId === TOPSIDE_SPACE_ID
      ? { terrainPlaneBlocked: survivalTerrainPlaneCollisionBytes(terrain.seed) }
      : {}),
    ...(medium === 'ground' && terrain.terrainTransitions !== undefined
      ? { terrainTransitions: terrain.terrainTransitions }
      : {}),
    ...(medium === 'ground' ? { horseJumpableTerrain: terrain.horseJumpableTerrain } : {}),
    obstacles,
  };
}
