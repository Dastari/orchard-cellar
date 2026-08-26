import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type Direction,
  type PlayerState,
  type Vec2Fixed,
} from './state.js';
import { terrainElevationAt, terrainWalkingStepAllowed } from './terrain-elevation.js';

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

function movementCrossesBlockedElevation(
  from: Vec2Fixed,
  to: Vec2Fixed,
  map: CollisionMap,
): boolean {
  // Legacy maps expose height for rendering but still encode their authored
  // ramps in `blocked`. New/generated/editor maps opt into strict contour
  // validation by supplying the transition channel; an empty list therefore
  // deliberately means that no height crossing is allowed.
  if (map.elevations === undefined || map.terrainTransitions === undefined) return false;
  const fromTileX = Math.floor(from.x / TILE_SIZE_FIXED);
  const fromTileY = Math.floor((from.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED);
  const toTileX = Math.floor(to.x / TILE_SIZE_FIXED);
  const toTileY = Math.floor((to.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED);
  if (fromTileX === toTileX && fromTileY === toTileY) return false;
  return !terrainWalkingStepAllowed(
    map.elevations,
    map.width,
    map.height,
    map.terrainTransitions,
    fromTileX,
    fromTileY,
    toTileX,
    toTileY,
  );
}

/** Resolves an actor's terrain plane from its physical ground-contact point.
 * This is deliberately position-derived: teleports, respawns, and ordinary
 * walking all land on the same height without relying on transition history. */
export function terrainPlaneAtPosition(position: Vec2Fixed, map: CollisionMap): number {
  if (map.elevations === undefined) return 0;
  return terrainElevationAt(
    map.elevations,
    map.width,
    map.height,
    Math.floor(position.x / TILE_SIZE_FIXED),
    Math.floor((position.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED),
  );
}

/** Shared actor-plane guard. Every grounded mover must use this instead of a
 * destination-only collision check so contour edges block at its current
 * height while lower-plane actors remain free behind projected wall art. */
export function movementPositionAllowed(from: Vec2Fixed, to: Vec2Fixed, map: CollisionMap): boolean {
  return !movementCrossesBlockedElevation(from, to, map) && !positionCollides(to, map);
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

/** Stable origin for interactions aimed from the player's physical body.
 * Authority positions are anchored below the visible feet, which makes that
 * raw anchor unsuitable for deciding whether a target is north or south. */
export function playerInteractionOrigin(position: Vec2Fixed): Vec2Fixed {
  return {
    x: position.x,
    y: position.y - PLAYER_HITBOX_FOOT_OFFSET
      - (PLAYER_HITBOX_TOP - PLAYER_HITBOX_BOTTOM) / 2,
  };
}

function movePlayerStep(player: PlayerState, direction: Direction | null, map: CollisionMap): PlayerState {
  if (direction === null) return { ...player, moving: false };
  const vector = DIRECTION_VECTORS[direction];
  let position = player.position;
  if (vector.x !== 0) {
    const movedX = { x: position.x + vector.x, y: position.y };
    if (movementPositionAllowed(position, movedX, map)) position = movedX;
  }
  if (vector.y !== 0) {
    const movedY = { x: position.x, y: position.y + vector.y };
    if (movementPositionAllowed(position, movedY, map)) position = movedY;
  }
  return { position, facing: direction, moving: position !== player.position, location: player.location };
}

/** Applies an integer per-mille movement scale without rounding 1.5x down to a
 * whole repeated step. Fixed-point coordinates keep cardinal sprint speed exact
 * and both client prediction and authority call this same solver. */
export function movePlayerAtSpeedPermille(
  player: PlayerState,
  direction: Direction | null,
  map: CollisionMap,
  speedPermille: number,
): PlayerState {
  if (direction === null) return { ...player, moving: false };
  const scale = Math.max(1_000, Math.min(4_000, Math.floor(speedPermille)));
  const base = DIRECTION_VECTORS[direction];
  const vector = {
    x: Math.round(base.x * scale / 1_000),
    y: Math.round(base.y * scale / 1_000),
  };
  let position = player.position;
  let remainingX = vector.x;
  let remainingY = vector.y;
  const maximumSubstep = Math.max(Math.abs(base.x), Math.abs(base.y));
  while (remainingX !== 0 || remainingY !== 0) {
    const stepX = Math.sign(remainingX) * Math.min(Math.abs(remainingX), maximumSubstep);
    const stepY = Math.sign(remainingY) * Math.min(Math.abs(remainingY), maximumSubstep);
    if (stepX !== 0) {
      const movedX = { x: position.x + stepX, y: position.y };
      if (movementPositionAllowed(position, movedX, map)) position = movedX;
    }
    if (stepY !== 0) {
      const movedY = { x: position.x, y: position.y + stepY };
      if (movementPositionAllowed(position, movedY, map)) position = movedY;
    }
    remainingX -= stepX;
    remainingY -= stepY;
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
