import { positionCollides } from './movement.js';
import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type Direction,
  type Vec2Fixed,
} from './state.js';

export const BOAT_MAX_HEALTH = 3;
export const BOAT_FIRST_NPC_ID = 100n;
export const BOAT_LAST_NPC_ID = 9_999n;

export type BoatFacing = Direction;

/** Boats preserve the rider's eight-way travel direction. Rendering and hull
 * bounds deliberately reserve vertical models for exact north/south. */
export function boatFacingForDirection(direction: Direction): BoatFacing {
  return direction;
}

/** Arrows may cross ordinary land and calm water, while terrain that blocks
 * both media (cliffs, borders, and solid projections) remains authoritative. */
export function projectileTraversalCollision(ground: CollisionMap, water: CollisionMap): CollisionMap {
  if (ground.width !== water.width || ground.height !== water.height) throw new Error('collision_map_size_mismatch');
  return {
    ...ground,
    blocked: ground.blocked.map((blocked, index) => blocked && (water.blocked[index] ?? true)),
  };
}

export function boatProjectileBounds(boat: { readonly x: number; readonly y: number; readonly facing: string }) {
  const vertical = boat.facing === 'up' || boat.facing === 'down';
  const halfWidth = (vertical ? 9 : 21) * FIXED_UNITS_PER_PIXEL;
  const halfHeight = (vertical ? 21 : 9) * FIXED_UNITS_PER_PIXEL;
  return {
    left: boat.x - halfWidth,
    right: boat.x + halfWidth,
    top: boat.y - halfHeight,
    bottom: boat.y + halfHeight,
  };
}

/** Finds a dry, collision-free shore position, preferring the side the boat
 * faces and then expanding around it. */
export function findBoatDismountPosition(
  boat: Vec2Fixed,
  facing: BoatFacing,
  ground: CollisionMap,
): Vec2Fixed | null {
  const vectors: Record<BoatFacing, Vec2Fixed> = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    upLeft: { x: -1, y: -1 }, upRight: { x: 1, y: -1 },
    downLeft: { x: -1, y: 1 }, downRight: { x: 1, y: 1 },
  };
  const preferred = vectors[facing];
  const offsets = [
    preferred,
    { x: -preferred.y, y: preferred.x },
    { x: preferred.y, y: -preferred.x },
    { x: -preferred.x, y: -preferred.y },
  ];
  for (let radius = 1; radius <= 3; radius += 1) {
    for (const offset of offsets) {
      const candidate = {
        x: boat.x + offset.x * radius * TILE_SIZE_FIXED,
        y: boat.y + offset.y * radius * TILE_SIZE_FIXED,
      };
      if (!positionCollides(candidate, ground)) return candidate;
    }
  }
  return null;
}
