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

/** The cell index of world tile (tileX, tileY) in a collision map, or -1 when
 * the tile is outside the map (or outside a windowed map's origin rectangle).
 * The single place CollisionMap cell arrays are addressed from world tiles. */
export function collisionCellIndex(map: Pick<CollisionMap, 'width' | 'height' | 'originX' | 'originY'>, tileX: number, tileY: number): number {
  const x = tileX - (map.originX ?? 0), y = tileY - (map.originY ?? 0);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return -1;
  return y * map.width + x;
}

/** Flat (plane-independent) terrain blocking at a world tile; outside the map
 * or a window is blocked. */
export function collisionTileIsBlocked(map: CollisionMap, tileX: number, tileY: number): boolean {
  const index = collisionCellIndex(map, tileX, tileY);
  return index < 0 || (map.blocked[index] ?? 1) !== 0;
}

/** Resolves both ordinary terrain and blockers belonging to one elevation.
 * Callers must pass the actor's physical plane rather than infer it for each
 * sampled corner: a hitbox may intentionally overlap projected art belonging
 * to another logical terrain coordinate. */
export function collisionTileIsBlockedAtPlane(
  map: CollisionMap,
  tileX: number,
  tileY: number,
  elevation: number,
): boolean {
  if (collisionTileIsBlocked(map, tileX, tileY)) return true;
  if (map.terrainPlaneBlocked === undefined) return false;
  const stride = map.width * map.height;
  const planeIndex = elevation - (map.terrainMinimumElevation ?? 0);
  if (planeIndex < 0 || planeIndex * stride >= map.terrainPlaneBlocked.length) return false;
  return map.terrainPlaneBlocked[planeIndex * stride + collisionCellIndex(map, tileX, tileY)] === 1;
}

function tileIsHorseJumpableTerrain(map: CollisionMap, tileX: number, tileY: number): boolean {
  const index = collisionCellIndex(map, tileX, tileY);
  if (index < 0) return false;
  return (map.horseJumpableTerrain?.[index] ?? 0) !== 0;
}

export function positionCollidesTerrain(position: Vec2Fixed, map: CollisionMap): boolean {
  const { left, right, top, bottom } = playerHitboxBounds(position);
  const tileLeft = Math.floor(left / TILE_SIZE_FIXED);
  const tileRight = Math.floor(right / TILE_SIZE_FIXED);
  const tileTop = Math.floor(top / TILE_SIZE_FIXED);
  const tileBottom = Math.floor(bottom / TILE_SIZE_FIXED);

  const elevation = terrainPlaneAtPosition(position, map);
  const tileCollision = (
    collisionTileIsBlockedAtPlane(map, tileLeft, tileTop, elevation) ||
    collisionTileIsBlockedAtPlane(map, tileRight, tileTop, elevation) ||
    collisionTileIsBlockedAtPlane(map, tileLeft, tileBottom, elevation) ||
    collisionTileIsBlockedAtPlane(map, tileRight, tileBottom, elevation)
  );
  return tileCollision;
}

function terrainCollisionOverlapArea(position: Vec2Fixed, map: CollisionMap): number {
  const { left, right, top, bottom } = playerHitboxBounds(position);
  const tileLeft = Math.floor(left / TILE_SIZE_FIXED);
  const tileRight = Math.floor(right / TILE_SIZE_FIXED);
  const tileTop = Math.floor(top / TILE_SIZE_FIXED);
  const tileBottom = Math.floor(bottom / TILE_SIZE_FIXED);
  const elevation = terrainPlaneAtPosition(position, map);
  let area = 0;
  for (let tileY = tileTop; tileY <= tileBottom; tileY += 1) {
    for (let tileX = tileLeft; tileX <= tileRight; tileX += 1) {
      if (!collisionTileIsBlockedAtPlane(map, tileX, tileY, elevation)) continue;
      const overlapWidth = Math.min(right, (tileX + 1) * TILE_SIZE_FIXED - 1)
        - Math.max(left, tileX * TILE_SIZE_FIXED) + 1;
      const overlapHeight = Math.min(bottom, (tileY + 1) * TILE_SIZE_FIXED - 1)
        - Math.max(top, tileY * TILE_SIZE_FIXED) + 1;
      if (overlapWidth > 0 && overlapHeight > 0) area += overlapWidth * overlapHeight;
    }
  }
  return area;
}

function positionCollidesObstacle(position: Vec2Fixed, map: CollisionMap): boolean {
  const { left, right, top, bottom } = playerHitboxBounds(position);
  return map.obstacles?.some((obstacle) => (
    left <= obstacle.right && right >= obstacle.left && top <= obstacle.bottom && bottom >= obstacle.top
  )) ?? false;
}

function obstacleMovementAllowed(from: Vec2Fixed, to: Vec2Fixed, map: CollisionMap): boolean {
  const before = playerHitboxBounds(from);
  const after = playerHitboxBounds(to);
  let stillEmbedded = false;
  let escaping = false;
  for (const obstacle of map.obstacles ?? []) {
    // Minimum axis displacement needed to separate the two closed rectangles.
    // Unlike intersection area, this decreases even when the entire foot box
    // is contained inside a newly solid object.
    const beforeDepth = Math.max(0, Math.min(
      before.right - obstacle.left + 1, obstacle.right - before.left + 1,
      before.bottom - obstacle.top + 1, obstacle.bottom - before.top + 1,
    ));
    const afterDepth = Math.max(0, Math.min(
      after.right - obstacle.left + 1, obstacle.right - after.left + 1,
      after.bottom - obstacle.top + 1, obstacle.bottom - after.top + 1,
    ));
    // Never enter another object or trade deeper overlap with one obstacle
    // for reduced overlap with another.
    if (afterDepth > beforeDepth) return false;
    if (afterDepth > 0) stillEmbedded = true;
    if (afterDepth < beforeDepth) escaping = true;
  }
  return !stillEmbedded || escaping;
}

export const PLAYER_JUMP_DURATION_TICKS = 10;

/** Finds a safe landing for an on-foot jump. Water/gap traversal is limited to
 * terrain explicitly marked jumpable, while cliff traversal is limited by the
 * elevation delta unlocked in the Explorer tree. Ordinary open ground never
 * becomes a teleport shortcut. */
export function findPlayerJumpLanding(
  player: Vec2Fixed,
  facing: Direction,
  map: CollisionMap,
  maximumGapTiles: number,
  maximumCliffLevels: number,
): Vec2Fixed | null {
  const horizontal = facing.includes('Left') || facing === 'left' ? -1
    : facing.includes('Right') || facing === 'right' ? 1 : 0;
  const vertical = facing.includes('up') || facing === 'up' ? -1
    : facing.includes('down') || facing === 'down' ? 1 : 0;
  if (horizontal === 0 && vertical === 0) return null;
  const gapLimit = Math.max(0, Math.min(3, Math.floor(maximumGapTiles)));
  const cliffLimit = Math.max(0, Math.min(3, Math.floor(maximumCliffLevels)));
  const startPlane = terrainPlaneAtPosition(player, map);
  let blockedTiles = 0;
  let gapOnly = true;
  const maximumSamples = Math.max(gapLimit + 1, cliffLimit + 2);
  for (let distance = 1; distance <= maximumSamples; distance += 1) {
    const candidate = {
      x: player.x + horizontal * TILE_SIZE_FIXED * distance,
      y: player.y + vertical * TILE_SIZE_FIXED * distance,
    };
    if (positionCollidesObstacle(candidate, map)) return null;
    if (positionCollidesTerrain(candidate, map)) {
      blockedTiles += 1;
      if (!positionCollidesOnlyHorseJumpableTerrain(candidate, map)) gapOnly = false;
      if ((gapOnly && blockedTiles > gapLimit) || (!gapOnly && cliffLimit === 0)) return null;
      continue;
    }
    const planeDelta = Math.abs(terrainPlaneAtPosition(candidate, map) - startPlane);
    if (blockedTiles > 0 && gapOnly && blockedTiles <= gapLimit && planeDelta === 0) return candidate;
    if (planeDelta > 0 && planeDelta <= cliffLimit) return candidate;
    // Open ground immediately ahead is not something jumping should skip.
    return null;
  }
  return null;
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
  const elevation = terrainPlaneAtPosition(position, map);
  let touchesBlockedTerrain = false;
  for (const [tileX, tileY] of corners) {
    if (!collisionTileIsBlockedAtPlane(map, tileX, tileY, elevation)) continue;
    touchesBlockedTerrain = true;
    // Elevation-specific cliff geometry is never a horse-jump shortcut.
    if (!collisionTileIsBlocked(map, tileX, tileY)) return false;
    if (!tileIsHorseJumpableTerrain(map, tileX, tileY)) return false;
  }
  return touchesBlockedTerrain;
}

export function positionCollides(position: Vec2Fixed, map: CollisionMap): boolean {
  if (positionCollidesTerrain(position, map)) return true;
  return positionCollidesObstacle(position, map);
}

function movementCrossesBlockedElevation(
  from: Vec2Fixed,
  to: Vec2Fixed,
  map: CollisionMap,
): boolean {
  if (map.fixedTerrainPlane !== undefined) return false;
  // Legacy maps expose height for rendering but still encode their authored
  // ramps in `blocked`. New/generated/editor maps opt into strict contour
  // validation by supplying the transition channel; an empty list therefore
  // deliberately means that no height crossing is allowed.
  if (map.elevations === undefined || map.terrainTransitions === undefined) return false;
  const elevations = map.elevations;
  const transitions = map.terrainTransitions;
  const fromTileX = Math.floor(from.x / TILE_SIZE_FIXED);
  const fromTileY = Math.floor((from.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED);
  const toTileX = Math.floor(to.x / TILE_SIZE_FIXED);
  const toTileY = Math.floor((to.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED);
  if ((fromTileX !== toTileX || fromTileY !== toTileY) && !terrainWalkingStepAllowed(
    elevations,
    map.width,
    map.height,
    transitions,
    fromTileX,
    fromTileY,
    toTileX,
    toTileY,
    map.originX,
    map.originY,
  )) return true;

  const footprintViolations = (position: Vec2Fixed): number => {
    const { left, right, bottom } = playerHitboxBounds(position);
    const centerTileX = Math.floor(position.x / TILE_SIZE_FIXED);
    const contactTileY = Math.floor(bottom / TILE_SIZE_FIXED);
    let violations = 0;
    for (const [bit, sampleX] of [[1, left], [2, right]] as const) {
      const sampleTileX = Math.floor(sampleX / TILE_SIZE_FIXED);
      if (sampleTileX === centerTileX) continue;
      if (!terrainWalkingStepAllowed(
        elevations,
        map.width,
        map.height,
        transitions,
        centerTileX,
        contactTileY,
        sampleTileX,
        contactTileY,
        map.originX,
        map.originY,
      )) violations |= bit;
    }
    return violations;
  };

  const toViolations = footprintViolations(to);
  if (toViolations === 0) return false;
  const fromViolations = footprintViolations(from);
  if (fromViolations === 0) return true;
  // A live player may already straddle a contour from the previous centre-only
  // guard. Permit only the horizontal direction that removes that overlap;
  // continued pressure into the boundary (including sprint) remains blocked.
  const escapingLeftEdge = (fromViolations & 1) !== 0 && to.x > from.x;
  const escapingRightEdge = (fromViolations & 2) !== 0 && to.x < from.x;
  return !(escapingLeftEdge || escapingRightEdge);
}

/** Resolves an actor's terrain plane from its physical ground-contact point.
 * This is deliberately position-derived: teleports, respawns, and ordinary
 * walking all land on the same height without relying on transition history. */
export function terrainPlaneAtPosition(position: Vec2Fixed, map: CollisionMap): number {
  if (map.fixedTerrainPlane !== undefined) return map.fixedTerrainPlane;
  if (map.elevations === undefined) return 0;
  return terrainElevationAt(
    map.elevations,
    map.width,
    map.height,
    Math.floor(position.x / TILE_SIZE_FIXED) - (map.originX ?? 0),
    Math.floor((position.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED) - (map.originY ?? 0),
  );
}

/** Shared actor-plane guard. Every grounded mover must use this instead of a
 * destination-only collision check so contour edges block at its current
 * height while lower-plane actors remain free behind projected wall art. */
export function movementPositionAllowed(from: Vec2Fixed, to: Vec2Fixed, map: CollisionMap): boolean {
  if (movementCrossesBlockedElevation(from, to, map) || !obstacleMovementAllowed(from, to, map)) return false;
  const destinationOverlap = terrainCollisionOverlapArea(to, map);
  if (destinationOverlap === 0) return true;
  // Schema/map revisions can make a persisted actor's current position newly
  // solid. Let that actor move only when each substep strictly reduces the
  // overlap, so recovery is possible without permitting traversal through it.
  return destinationOverlap < terrainCollisionOverlapArea(from, map);
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
