import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type Direction,
  type PlayerState,
  type Vec2Fixed,
} from './state.js';

const CARDINAL_SPEED = FIXED_UNITS_PER_PIXEL;
const DIAGONAL_SPEED = 11;
export const PLAYER_HITBOX_HALF_WIDTH = 4 * FIXED_UNITS_PER_PIXEL;
export const PLAYER_HITBOX_TOP = 6 * FIXED_UNITS_PER_PIXEL;
export const PLAYER_HITBOX_BOTTOM = 0;
// The modular character sheets retain transparent rows below the visible
// shoes. Authority stays at the authored anchor while the physical foot box is
// raised six pixels to overlap the final visible shoe row.
export const PLAYER_HITBOX_FOOT_OFFSET = 6 * FIXED_UNITS_PER_PIXEL;

const DIRECTION_VECTORS: Record<Direction, Vec2Fixed> = {
  up: { x: 0, y: -CARDINAL_SPEED },
  down: { x: 0, y: CARDINAL_SPEED },
  left: { x: -CARDINAL_SPEED, y: 0 },
  right: { x: CARDINAL_SPEED, y: 0 },
  upLeft: { x: -DIAGONAL_SPEED, y: -DIAGONAL_SPEED },
  upRight: { x: DIAGONAL_SPEED, y: -DIAGONAL_SPEED },
  downLeft: { x: -DIAGONAL_SPEED, y: DIAGONAL_SPEED },
  downRight: { x: DIAGONAL_SPEED, y: DIAGONAL_SPEED },
};

function tileIsBlocked(map: CollisionMap, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return true;
  return map.blocked[tileY * map.width + tileX] ?? true;
}

function tileIsHorseJumpableTerrain(map: CollisionMap, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return false;
  return map.horseJumpableTerrain?.[tileY * map.width + tileX] ?? false;
}

export function positionCollidesTerrain(position: Vec2Fixed, map: CollisionMap): boolean {
  const { left, right, top, bottom } = playerHitboxBounds(position);
  const tileLeft = Math.floor(left / TILE_SIZE_FIXED);
  const tileRight = Math.floor(right / TILE_SIZE_FIXED);
  const tileTop = Math.floor(top / TILE_SIZE_FIXED);
  const tileBottom = Math.floor(bottom / TILE_SIZE_FIXED);

  const tileCollision = (
    tileIsBlocked(map, tileLeft, tileTop) ||
    tileIsBlocked(map, tileRight, tileTop) ||
    tileIsBlocked(map, tileLeft, tileBottom) ||
    tileIsBlocked(map, tileRight, tileBottom)
  );
  return tileCollision;
}

/** True only when the hitbox touches blocked tiles explicitly classified as
 * safe for a horse to jump. Missing semantic data deliberately fails closed. */
export function positionCollidesOnlyHorseJumpableTerrain(position: Vec2Fixed, map: CollisionMap): boolean {
  const { left, right, top, bottom } = playerHitboxBounds(position);
  const corners = [
    [Math.floor(left / TILE_SIZE_FIXED), Math.floor(top / TILE_SIZE_FIXED)],
    [Math.floor(right / TILE_SIZE_FIXED), Math.floor(top / TILE_SIZE_FIXED)],
    [Math.floor(left / TILE_SIZE_FIXED), Math.floor(bottom / TILE_SIZE_FIXED)],
    [Math.floor(right / TILE_SIZE_FIXED), Math.floor(bottom / TILE_SIZE_FIXED)],
  ] as const;
  let touchesBlockedTerrain = false;
  for (const [tileX, tileY] of corners) {
    if (!tileIsBlocked(map, tileX, tileY)) continue;
    touchesBlockedTerrain = true;
    if (!tileIsHorseJumpableTerrain(map, tileX, tileY)) return false;
  }
  return touchesBlockedTerrain;
}

export function positionCollides(position: Vec2Fixed, map: CollisionMap): boolean {
  if (positionCollidesTerrain(position, map)) return true;
  const { left, right, top, bottom } = playerHitboxBounds(position);
  return map.obstacles?.some((obstacle) => (
    left <= obstacle.right && right >= obstacle.left && top <= obstacle.bottom && bottom >= obstacle.top
  )) ?? false;
}

export function playerHitboxBounds(position: Vec2Fixed): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  return {
    left: position.x - PLAYER_HITBOX_HALF_WIDTH,
    right: position.x + PLAYER_HITBOX_HALF_WIDTH - 1,
    top: position.y - PLAYER_HITBOX_FOOT_OFFSET - PLAYER_HITBOX_TOP,
    bottom: position.y - PLAYER_HITBOX_FOOT_OFFSET + PLAYER_HITBOX_BOTTOM - 1,
  };
}

function movePlayerStep(player: PlayerState, direction: Direction | null, map: CollisionMap): PlayerState {
  if (direction === null) return { ...player, moving: false };
  const vector = DIRECTION_VECTORS[direction];
  let position = player.position;
  if (vector.x !== 0) {
    const movedX = { x: position.x + vector.x, y: position.y };
    if (!positionCollides(movedX, map)) position = movedX;
  }
  if (vector.y !== 0) {
    const movedY = { x: position.x, y: position.y + vector.y };
    if (!positionCollides(movedY, map)) position = movedY;
  }
  return { position, facing: direction, moving: position !== player.position, location: player.location };
}

/** Repeats the normal collision-safe movement step for speed modifiers. */
export function movePlayerAtSpeed(
  player: PlayerState,
  direction: Direction | null,
  map: CollisionMap,
  speedMultiplier: number,
): PlayerState {
  const steps = Math.max(1, Math.min(4, Math.floor(speedMultiplier)));
  let moved = player;
  for (let step = 0; step < steps; step += 1) moved = movePlayerStep(moved, direction, map);
  return moved;
}

export function movePlayer(player: PlayerState, direction: Direction | null, map: CollisionMap): PlayerState {
  return movePlayerAtSpeed(player, direction, map, 1);
}
