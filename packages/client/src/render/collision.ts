import { survivalTreeObstacle, type CollisionMap } from '@orchard/sim';
import type { WorldResource } from '../net/generated/types.js';
import type { TerrainArray } from './terrain.js';

/** Reuses immutable terrain collision and rebuilds only subscribed live trunks. */
export function createClientCollisionMap(
  terrain: TerrainArray,
  resources: Iterable<WorldResource>,
): CollisionMap {
  const obstacles = [];
  for (const resource of resources) {
    if (!resource.depleted) obstacles.push(survivalTreeObstacle(resource.tileX, resource.tileY));
  }
  return {
    width: terrain.width,
    height: terrain.height,
    blocked: terrain.blocked,
    obstacles,
  };
}
