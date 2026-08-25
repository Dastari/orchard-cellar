import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  generateSurvivalDecorations,
  survivalBiomeBlocksTraversal,
  survivalDecorationBlocksTraversal,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  survivalWaterRockObstacle,
  type CollisionMap,
  type MovementMedium,
} from '@orchard/sim';
import type { WorldChest, WorldResource } from '../net/generated/types.js';
import type { TerrainArray } from './terrain.js';

/** Reuses immutable terrain collision and rebuilds only subscribed live trunks. */
export function createClientCollisionMap(
  terrain: TerrainArray,
  resources: Iterable<WorldResource>,
  chests: Iterable<WorldChest> = [],
  medium: MovementMedium = 'ground',
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
    right: (chest.tileX + 1) * TILE_SIZE_FIXED,
    bottom: (chest.tileY + 1) * TILE_SIZE_FIXED,
  });
  if (medium === 'water') {
    for (const decoration of generateSurvivalDecorations(terrain.seed)) {
      if (survivalDecorationBlocksTraversal(decoration.kind, medium)) {
        obstacles.push(survivalWaterRockObstacle(decoration.tileX, decoration.tileY));
      }
    }
  }
  return {
    width: terrain.width,
    height: terrain.height,
    blocked: medium === 'ground' ? terrain.blocked : Array.from(terrain.biomes, (biome) => (
      survivalBiomeBlocksTraversal(SURVIVAL_BIOMES[biome] ?? 'water', medium)
    )),
    ...(medium === 'ground' ? { horseJumpableTerrain: terrain.horseJumpableTerrain } : {}),
    obstacles,
  };
}
