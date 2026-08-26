import {
  positionCollides,
  positionCollidesOnlyHorseJumpableTerrain,
  positionCollidesTerrain,
} from './movement.js';
import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  type CollisionMap,
  type Direction,
  type Vec2Fixed,
} from './state.js';

export type NpcFacing = 'up' | 'down' | 'left' | 'right';
export type NpcWanderDirection = NpcFacing | null;

export interface WanderingNpcState {
  readonly id: bigint;
  readonly position: Vec2Fixed;
  readonly home: Vec2Fixed;
  readonly facing: NpcFacing;
  readonly moving: boolean;
  readonly wanderDirection: NpcWanderDirection;
  readonly nextDecisionTick: number;
}

export const STARTER_HORSE_ID = 1n;
export const STARTER_HORSE_NAME = 'Nados Mum';
export const HORSE_WANDER_RADIUS_FIXED = 3 * TILE_SIZE_FIXED;
export const HORSE_WANDER_SPEED_FIXED = Math.floor(FIXED_UNITS_PER_PIXEL / 2);
export const HORSE_MOUNT_REACH_FIXED = 2 * TILE_SIZE_FIXED;
export const HORSE_DISMOUNT_DISTANCE_FIXED = 18 * FIXED_UNITS_PER_PIXEL;
export const HORSE_JUMP_MAX_BLOCKED_TILES = 3;
export const HORSE_JUMP_MAX_APPROACH_TILES = 1;
export const HORSE_JUMP_DURATION_TICKS = 10;
export const NPC_INTERACTION_REACH_FIXED = Math.floor(TILE_SIZE_FIXED * 1.5);

export function npcFacingForDirection(direction: Direction): NpcFacing {
  switch (direction) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return direction;
    case 'upLeft':
    case 'downLeft':
      return 'left';
    case 'upRight':
    case 'downRight':
      return 'right';
  }
}

/** A mounted rider may aim independently while stopped. The horse adopts the
 * rider's facing only when movement gives it a new travel direction. */
export function mountedHorseFacing(
  currentHorseFacing: NpcFacing,
  riderFacing: Direction,
  riderMoving: boolean,
): NpcFacing {
  return riderMoving ? npcFacingForDirection(riderFacing) : currentHorseFacing;
}

const DIRECTION_VECTORS: Record<NpcFacing, Vec2Fixed> = {
  up: { x: 0, y: -HORSE_WANDER_SPEED_FIXED },
  down: { x: 0, y: HORSE_WANDER_SPEED_FIXED },
  left: { x: -HORSE_WANDER_SPEED_FIXED, y: 0 },
  right: { x: HORSE_WANDER_SPEED_FIXED, y: 0 },
};

const WANDER_CHOICES: readonly NpcWanderDirection[] = [null, null, 'up', 'down', 'left', 'right'];

function hashDecision(id: bigint, tick: number): number {
  let value = (Number(id & 0xffff_ffffn) ^ Math.imul(tick | 0, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function directionTowardHome(state: WanderingNpcState): NpcFacing {
  const dx = state.home.x - state.position.x;
  const dy = state.home.y - state.position.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

function insideWanderArea(position: Vec2Fixed, home: Vec2Fixed): boolean {
  return Math.abs(position.x - home.x) <= HORSE_WANDER_RADIUS_FIXED
    && Math.abs(position.y - home.y) <= HORSE_WANDER_RADIUS_FIXED;
}

/** Advances one server authority tick. Decisions are derived only from stable state. */
export function stepWanderingNpc(
  state: WanderingNpcState,
  authorityTick: number,
  collision: CollisionMap,
): WanderingNpcState {
  let direction = state.wanderDirection;
  let nextDecisionTick = state.nextDecisionTick;

  if (authorityTick >= state.nextDecisionTick) {
    const outsideLeash = !insideWanderArea(state.position, state.home);
    const decision = hashDecision(state.id, authorityTick);
    direction = outsideLeash
      ? directionTowardHome(state)
      : WANDER_CHOICES[decision % WANDER_CHOICES.length] ?? null;
    nextDecisionTick = authorityTick + 30 + (decision % 71);
  }

  if (direction === null) {
    return { ...state, moving: false, wanderDirection: null, nextDecisionTick };
  }

  const vector = DIRECTION_VECTORS[direction];
  const candidate = {
    x: state.position.x + vector.x,
    y: state.position.y + vector.y,
  };
  if (!insideWanderArea(candidate, state.home) || positionCollides(candidate, collision)) {
    return {
      ...state,
      facing: direction,
      moving: false,
      wanderDirection: null,
      nextDecisionTick: Math.min(nextDecisionTick, authorityTick + 8),
    };
  }
  return {
    ...state,
    position: candidate,
    facing: direction,
    moving: true,
    wanderDirection: direction,
    nextDecisionTick,
  };
}

/** Temporarily steers a wandering NPC toward a world interaction without
 * teleporting it or replacing its normal home/leash. Cardinal fallbacks let
 * it skirt a simple obstacle while preserving the same collision authority. */
export function stepNpcTowardPoint(
  state: WanderingNpcState,
  target: Vec2Fixed,
  authorityTick: number,
  collision: CollisionMap,
  reach = NPC_INTERACTION_REACH_FIXED,
): WanderingNpcState {
  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  if (dx * dx + dy * dy <= reach * reach) {
    const facing: NpcFacing = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up' : 'down');
    return { ...state, facing, moving: false, wanderDirection: null, nextDecisionTick: authorityTick + 20 };
  }
  const horizontal: NpcFacing = dx < 0 ? 'left' : 'right';
  const vertical: NpcFacing = dy < 0 ? 'up' : 'down';
  const directions = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
  for (const direction of directions) {
    const vector = DIRECTION_VECTORS[direction];
    const candidate = { x: state.position.x + vector.x, y: state.position.y + vector.y };
    if (positionCollides(candidate, collision)) continue;
    return {
      ...state,
      position: candidate,
      facing: direction,
      moving: true,
      wanderDirection: direction,
      nextDecisionTick: authorityTick + 20,
    };
  }
  return {
    ...state,
    moving: false,
    wanderDirection: null,
    nextDecisionTick: authorityTick + 8,
  };
}

export function isHorseWithinMountReach(player: Vec2Fixed, horse: Vec2Fixed): boolean {
  const dx = player.x - horse.x;
  const dy = player.y - horse.y;
  return dx * dx + dy * dy <= HORSE_MOUNT_REACH_FIXED * HORSE_MOUNT_REACH_FIXED;
}

/** Chooses a safe landing point beside the horse, preferring the facing side. */
export function findHorseDismountPosition(
  horse: Vec2Fixed,
  facing: NpcFacing,
  collision: CollisionMap,
): Vec2Fixed | null {
  const offsets: Record<NpcFacing, Vec2Fixed> = {
    up: { x: 0, y: -HORSE_DISMOUNT_DISTANCE_FIXED },
    down: { x: 0, y: HORSE_DISMOUNT_DISTANCE_FIXED },
    left: { x: -HORSE_DISMOUNT_DISTANCE_FIXED, y: 0 },
    right: { x: HORSE_DISMOUNT_DISTANCE_FIXED, y: 0 },
  };
  const order: readonly NpcFacing[] = [facing, 'left', 'right', 'down', 'up'];
  const visited = new Set<NpcFacing>();
  for (const direction of order) {
    if (visited.has(direction)) continue;
    visited.add(direction);
    const offset = offsets[direction];
    const candidate = { x: horse.x + offset.x, y: horse.y + offset.y };
    if (!positionCollides(candidate, collision)) return candidate;
  }
  return null;
}

/**
 * Finds the first safe landing after a contiguous terrain blocker. The horse
 * may have one clear approach tile, cross at most three blocked tiles, and may
 * not use the jump to bypass a resource obstacle or travel over open ground.
 */
export function findHorseJumpLanding(
  horse: Vec2Fixed,
  facing: NpcFacing,
  collision: CollisionMap,
): Vec2Fixed | null {
  const directions: Record<NpcFacing, Vec2Fixed> = {
    up: { x: 0, y: -TILE_SIZE_FIXED },
    down: { x: 0, y: TILE_SIZE_FIXED },
    left: { x: -TILE_SIZE_FIXED, y: 0 },
    right: { x: TILE_SIZE_FIXED, y: 0 },
  };
  const vector = directions[facing];
  let clearApproachTiles = 0;
  let blockedTiles = 0;
  const maximumSamples = HORSE_JUMP_MAX_APPROACH_TILES + HORSE_JUMP_MAX_BLOCKED_TILES + 1;
  for (let distance = 1; distance <= maximumSamples; distance += 1) {
    const candidate = {
      x: horse.x + vector.x * distance,
      y: horse.y + vector.y * distance,
    };
    const terrainBlocked = positionCollidesTerrain(candidate, collision);
    if (blockedTiles === 0) {
      if (terrainBlocked) {
        if (!positionCollidesOnlyHorseJumpableTerrain(candidate, collision)) return null;
        blockedTiles = 1;
        continue;
      }
      // A tree or other sub-tile obstacle is not a jumpable terrain barrier.
      if (positionCollides(candidate, collision)) return null;
      clearApproachTiles += 1;
      if (clearApproachTiles > HORSE_JUMP_MAX_APPROACH_TILES) return null;
      continue;
    }
    if (terrainBlocked) {
      if (!positionCollidesOnlyHorseJumpableTerrain(candidate, collision)) return null;
      blockedTiles += 1;
      if (blockedTiles > HORSE_JUMP_MAX_BLOCKED_TILES) return null;
      continue;
    }
    return positionCollides(candidate, collision) ? null : candidate;
  }
  return null;
}
