import type { CollisionMap } from '@orchard/sim';
import type { LiveIslandCollisionRuntime } from './chunk-authority-runtime.js';

/**
 * The topside collision composition over a live-island runtime: the runtime's channels over the
 * base, then its static base group and the base's live rows (resources, chests, placeables), all
 * filtered by the runtime's suppressed decoration keys, then the runtime's authored obstacles.
 *
 * The world module composes this over the published chunk runtime (`liveMapCollisionForSpace`);
 * the chunk materializer (Studio, static world S7b) composes it over the compiled island to author
 * and verify every publication, so both run exactly this code.
 */
export function composeLiveIslandCollision(base: CollisionMap, runtime: Pick<LiveIslandCollisionRuntime,
  'ground' | 'water' | 'baseObstacles' | 'suppressedDecorationObstacleKeys'>, medium: 'ground' | 'water'): CollisionMap {
  const authored = medium === 'ground' ? runtime.ground : runtime.water;
  const suppressedObstacleKeys = runtime.suppressedDecorationObstacleKeys[medium];
  // S3-final: the static base group (generated decorations) comes from the publication, ahead of the
  // live rows `base` carries (the island base itself has no obstacles), all filtered by the keys.
  const retainedBaseObstacles = [...runtime.baseObstacles[medium], ...(base.obstacles ?? [])].filter((obstacle) => !suppressedObstacleKeys.has(
    `${obstacle.left}:${obstacle.top}:${obstacle.right}:${obstacle.bottom}`,
  ));
  return {
    ...base,
    ...authored,
    obstacles: [...retainedBaseObstacles, ...(authored.obstacles ?? [])],
  };
}

/** Whether a runtime's map suppresses a generated resource (null: no runtime, nothing suppressed). */
export function runtimeSuppressesGeneratedResource(runtime: Pick<LiveIslandCollisionRuntime, 'generatedSuppressions'> | null,
  resourceId: bigint): boolean {
  return runtime?.generatedSuppressions.has(`resource-${resourceId}`) ?? false;
}
