import { survivalTreeObstacle, type CollisionMap } from '@orchard/sim';
import type { WorldResource } from '../net/generated/types.js';
import type { TerrainArray } from './terrain.js';

/** Reuses immutable terrain collision and rebuilds only subscribed live trunks. */
export function createClientCollisionMap(
  terrain: TerrainArray,
  resources: readonly WorldResource[],
): CollisionMap {
  return {
    width: terrain.width,
    height: terrain.height,
    blocked: terrain.blocked,
    obstacles: resources
      .filter((resource) => !resource.depleted)
      .map((resource) => survivalTreeObstacle(resource.tileX, resource.tileY)),
  };
}
