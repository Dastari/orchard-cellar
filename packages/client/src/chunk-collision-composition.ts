import { runtimeActorCollision, traversalSolidGeometry, type CollisionMap, type CollisionObstacle, type ContentRegistry } from '@orchard/sim';
import { composeChunkWindowCollision, type ChunkWindowCollision } from '@orchard/sim/chunk-collision';

/** Topside collision maps in chunk mode `on` (static world S4d). */
export interface ChunkCollisionMaps {
  /** Ground movement collision after the placement traversal projection. */
  readonly world: CollisionMap;
  /** Ground collision before the traversal projection (furniture placement). */
  readonly furniture: CollisionMap;
  readonly boat: CollisionMap;
  readonly projectile: CollisionMap;
}

export interface ChunkCollisionInputs {
  readonly registry: ContentRegistry;
  readonly collision: ChunkWindowCollision;
  /** Live resource, chest and non-furniture placeable boxes: filtered by the
   * suppressed decoration keys with the static base group (finding B). */
  readonly liveBase: readonly CollisionObstacle[];
  /** Hearth furniture boxes, appended after the static composition. */
  readonly furniture: readonly CollisionObstacle[];
  /** Combat targets, surfaces, tents and boundaries (dynamicCollisionOverlays). */
  readonly dynamic: readonly CollisionObstacle[];
  readonly tick: bigint;
  /** The combined projectile plane (WorldStaticProjectionCache.projectile). */
  readonly projectile: (ground: CollisionMap, water: CollisionMap) => CollisionMap;
}

/**
 * The client's chunk-mode composition, composed like the server's chunk runtime
 * (composeChunkIslandCollision in collisionForSpace):
 * - ground: the window's authority channels; the static base records and the
 *   live base boxes, ALL filtered by the suppressed decoration keys (finding B),
 *   then the authored records; then hearth furniture and the dynamic overlays,
 *   which the server appends after it;
 * - water: the authority water channel (the 15 waterfall cells are
 *   boat-enterable, SW-D1) with its base (filtered) and authored records;
 * - then the same placement and projectile traversal projections as legacy.
 *
 * The expensive parts (traversal admission, the combined projectile plane and
 * the shadow comparison) are cached by the identity of the window's static
 * arrays, never by the live boxes, so running this once with no live boxes
 * before a window is served (static world S4f) leaves only the cheap
 * composition for the frame that serves it, with the same result.
 */
export function composeChunkCollisionMaps(inputs: ChunkCollisionInputs): ChunkCollisionMaps {
  const { registry, collision, tick } = inputs;
  const ground = composeChunkWindowCollision(collision, 'ground', inputs.liveBase);
  const furniture: CollisionMap = { ...ground, obstacles: [...(ground.obstacles ?? []), ...inputs.furniture, ...inputs.dynamic] };
  const water = composeChunkWindowCollision(collision, 'water');
  const solidGeometry = traversalSolidGeometry(furniture, water);
  const world = runtimeActorCollision(registry, furniture, { kind: 'placement', medium: 'ground' }, tick, solidGeometry);
  const boat = runtimeActorCollision(registry, water, { kind: 'placement', medium: 'water' }, tick, solidGeometry);
  const projectile = runtimeActorCollision(registry, inputs.projectile(world, boat), { kind: 'projectile' }, tick,
    traversalSolidGeometry(world, boat));
  return { world, furniture, boat, projectile };
}
