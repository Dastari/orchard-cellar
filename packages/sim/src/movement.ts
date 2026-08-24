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
export const PLAYER_HITBOX_TOP = 3 * FIXED_UNITS_PER_PIXEL;
export const PLAYER_HITBOX_BOTTOM = 3 * FIXED_UNITS_PER_PIXEL;

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

export function positionCollides(position: Vec2Fixed, map: CollisionMap): boolean {
  const { left, right, top, bottom } = playerHitboxBounds(position);
  const tileLeft = Math.floor(left / TILE_SIZE_FIXED);
  const tileRight = Math.floor(right / TILE_SIZE_FIXED);
  const tileTop = Math.floor(top / TILE_SIZE_FIXED);
  const tileBottom = Math.floor(bottom / TILE_SIZE_FIXED);

  return (
    tileIsBlocked(map, tileLeft, tileTop) ||
    tileIsBlocked(map, tileRight, tileTop) ||
    tileIsBlocked(map, tileLeft, tileBottom) ||
    tileIsBlocked(map, tileRight, tileBottom)
  );
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
    top: position.y - PLAYER_HITBOX_TOP,
    bottom: position.y + PLAYER_HITBOX_BOTTOM - 1,
  };
}

export function movePlayer(player: PlayerState, direction: Direction | null, map: CollisionMap): PlayerState {
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
