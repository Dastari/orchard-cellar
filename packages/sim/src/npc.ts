import {
  movementPositionAllowed,
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
import { statelessRoll } from './checks.js';
import type {
  NpcFishingCycleContentDefinition,
  NpcHorseMountContentDefinition,
  NpcMountContentDefinition,
} from './content/npc-definition.js';

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

export const HORSE_WANDER_RADIUS_FIXED = 3 * TILE_SIZE_FIXED;
export const HORSE_WANDER_SPEED_FIXED = Math.floor(FIXED_UNITS_PER_PIXEL / 2);
export const HORSE_MOUNT_REACH_FIXED = 2 * TILE_SIZE_FIXED;
export const HORSE_DISMOUNT_DISTANCE_FIXED = 18 * FIXED_UNITS_PER_PIXEL;
export const HORSE_JUMP_MAX_BLOCKED_TILES = 3;
export const HORSE_JUMP_MAX_APPROACH_TILES = 1;
export const HORSE_JUMP_DURATION_TICKS = 10;
export const NPC_INTERACTION_REACH_FIXED = Math.floor(TILE_SIZE_FIXED * 1.5);

/** Narrow authority view accepted by pure horse helpers. Parsed authored horse
 * mounts structurally satisfy this contract without adapters or conversion. */
export type HorseMountAuthorityTuning = Pick<
  NpcHorseMountContentDefinition,
  'reachFixed' | 'dismountDistanceFixed' | 'jump' | 'wander'
>;

/** Common authored interaction policy shared by every mount adapter. */
export type MountReachAuthorityTuning = Pick<NpcMountContentDefinition, 'reachFixed'>;

/** Compatibility only for callers not yet connected to the active registry. */
const LEGACY_HORSE_MOUNT_TUNING = Object.freeze({
  reachFixed: HORSE_MOUNT_REACH_FIXED,
  dismountDistanceFixed: HORSE_DISMOUNT_DISTANCE_FIXED,
  jump: Object.freeze({
    maximumBlockedTiles: HORSE_JUMP_MAX_BLOCKED_TILES,
    maximumApproachTiles: HORSE_JUMP_MAX_APPROACH_TILES,
    durationTicks: HORSE_JUMP_DURATION_TICKS,
  }),
  wander: Object.freeze({
    radiusFixed: HORSE_WANDER_RADIUS_FIXED,
    speedFixed: HORSE_WANDER_SPEED_FIXED,
    decisionMinimumTicks: 30,
    decisionJitterTicks: 71,
    blockedRetryTicks: 8,
  }),
} as const satisfies HorseMountAuthorityTuning);

export type FishermanActivity = 'fish_cast' | 'fish_wait' | 'fish_reel' | 'fish_rest';

export interface FishermanCycleStep {
  readonly activity: FishermanActivity;
  readonly nextDecisionTick: bigint;
  readonly speech?: string;
}

function fishermanDurationTicks(
  id: bigint,
  authorityTick: bigint,
  label: string,
  range: { readonly minimum: number; readonly maximum: number; readonly step: number },
): bigint {
  const steps = (range.maximum - range.minimum) / range.step;
  const ticks = range.minimum + range.step * statelessRoll(
    [id, authorityTick, `fisherman.${label}`],
    steps + 1,
  );
  return BigInt(ticks);
}

function fishermanActivity(value: string): FishermanActivity | null {
  return value === 'fish_cast' || value === 'fish_wait'
    || value === 'fish_reel' || value === 'fish_rest' ? value : null;
}

/** Advances Fin's low-frequency fishing routine only when its persisted
 * deadline is reached. Most of the cycle is spent waiting or resting, so the
 * authored cast and reel actions play once instead of looping continuously. */
export function stepFishermanCycle(
  definition: NpcFishingCycleContentDefinition,
  id: bigint,
  activityValue: string,
  nextDecisionTick: bigint,
  authorityTick: bigint,
): FishermanCycleStep {
  const activity = fishermanActivity(activityValue);
  if (activityValue === 'fish') {
    return {
      activity: 'fish_wait',
      nextDecisionTick: authorityTick + fishermanDurationTicks(id, authorityTick, 'legacy_wait', definition.waitTicks),
    };
  }
  if (activity === null) {
    return {
      activity: 'fish_rest',
      nextDecisionTick: authorityTick + fishermanDurationTicks(id, authorityTick, 'initial_rest', definition.initialRestTicks),
    };
  }
  if (activity === 'fish_rest'
    && nextDecisionTick - authorityTick > BigInt(definition.restTicks.maximum)) {
    return {
      activity,
      nextDecisionTick: authorityTick + fishermanDurationTicks(id, authorityTick, 'rest_clamp', definition.restTicks),
    };
  }
  if (authorityTick < nextDecisionTick) return { activity, nextDecisionTick };

  if (activity === 'fish_rest') {
    return { activity: 'fish_cast', nextDecisionTick: authorityTick + BigInt(definition.castTicks) };
  }
  if (activity === 'fish_cast') {
    return {
      activity: 'fish_wait',
      nextDecisionTick: authorityTick + fishermanDurationTicks(id, authorityTick, 'wait', definition.waitTicks),
    };
  }
  if (activity === 'fish_wait') {
    return { activity: 'fish_reel', nextDecisionTick: authorityTick + BigInt(definition.reelTicks) };
  }

  const next: FishermanCycleStep = {
    activity: 'fish_rest',
    nextDecisionTick: authorityTick + fishermanDurationTicks(id, authorityTick, 'rest', definition.restTicks),
  };
  // Roughly one remark every five completed cycles: noticeable to visitors,
  // but uncommon enough not to turn the dock into a repeating chat feed.
  if (statelessRoll([id, authorityTick, 'fisherman.remark.chance'], definition.barkChanceOneIn) !== 0
    || definition.barks.length === 0) return next;
  return {
    ...next,
    speech: definition.barks[
      statelessRoll([id, authorityTick, 'fisherman.remark.choice'], definition.barks.length)
    ]!,
  };
}

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

/** Chooses the cardinal direction an NPC should use to face a world point.
 * Keeping the current facing for coincident points prevents arbitrary turns. */
export function npcFacingTowardPoint(
  origin: Vec2Fixed,
  target: Vec2Fixed,
  current: NpcFacing,
): NpcFacing {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** A mounted rider may aim independently while stopped. The horse adopts the
 * rider's facing only when movement gives it a new travel direction. */
export function mountedHorseFacing(
  currentHorseFacing: Direction,
  riderFacing: Direction,
  riderMoving: boolean,
): Direction {
  return riderMoving ? riderFacing : currentHorseFacing;
}

const DIRECTION_VECTORS: Record<NpcFacing, Vec2Fixed> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function directionVector(direction: NpcFacing, speedFixed: number): Vec2Fixed {
  const unit = DIRECTION_VECTORS[direction];
  return { x: unit.x * speedFixed, y: unit.y * speedFixed };
}

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

function insideWanderArea(position: Vec2Fixed, home: Vec2Fixed, radiusFixed: number): boolean {
  return Math.abs(position.x - home.x) <= radiusFixed
    && Math.abs(position.y - home.y) <= radiusFixed;
}

/** Advances one server authority tick. Decisions are derived only from stable state. */
export function stepWanderingNpc(
  state: WanderingNpcState,
  authorityTick: number,
  collision: CollisionMap,
  tuning: HorseMountAuthorityTuning['wander'] = LEGACY_HORSE_MOUNT_TUNING.wander,
): WanderingNpcState {
  let direction = state.wanderDirection;
  let nextDecisionTick = state.nextDecisionTick;

  if (authorityTick >= state.nextDecisionTick) {
    const outsideLeash = !insideWanderArea(state.position, state.home, tuning.radiusFixed);
    const decision = hashDecision(state.id, authorityTick);
    direction = outsideLeash
      ? directionTowardHome(state)
      : WANDER_CHOICES[decision % WANDER_CHOICES.length] ?? null;
    nextDecisionTick = authorityTick + tuning.decisionMinimumTicks
      + (decision % tuning.decisionJitterTicks);
  }

  if (direction === null) {
    return { ...state, moving: false, wanderDirection: null, nextDecisionTick };
  }

  const vector = directionVector(direction, tuning.speedFixed);
  const candidate = {
    x: state.position.x + vector.x,
    y: state.position.y + vector.y,
  };
  if (!insideWanderArea(candidate, state.home, tuning.radiusFixed)
    || !movementPositionAllowed(state.position, candidate, collision)) {
    return {
      ...state,
      facing: direction,
      moving: false,
      wanderDirection: null,
      nextDecisionTick: Math.min(nextDecisionTick, authorityTick + tuning.blockedRetryTicks),
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
  tuning: Pick<HorseMountAuthorityTuning['wander'], 'speedFixed' | 'blockedRetryTicks'>
    = LEGACY_HORSE_MOUNT_TUNING.wander,
): WanderingNpcState {
  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  if (dx * dx + dy * dy <= reach * reach) {
    const facing = npcFacingTowardPoint(state.position, target, state.facing);
    return { ...state, facing, moving: false, wanderDirection: null, nextDecisionTick: authorityTick + 20 };
  }
  const horizontal: NpcFacing = dx < 0 ? 'left' : 'right';
  const vertical: NpcFacing = dy < 0 ? 'up' : 'down';
  const directions = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
  for (const direction of directions) {
    const vector = directionVector(direction, tuning.speedFixed);
    const candidate = { x: state.position.x + vector.x, y: state.position.y + vector.y };
    if (!movementPositionAllowed(state.position, candidate, collision)) continue;
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
    nextDecisionTick: authorityTick + tuning.blockedRetryTicks,
  };
}

export function isHorseWithinMountReach(
  player: Vec2Fixed,
  horse: Vec2Fixed,
  tuning: Pick<HorseMountAuthorityTuning, 'reachFixed'> = LEGACY_HORSE_MOUNT_TUNING,
): boolean {
  return isMountWithinReach(player, horse, tuning);
}

/** Tests a resolved mount using its authored reach. This intentionally has no
 * fallback: active-registry consumers must pass the narrowed mount definition. */
export function isMountWithinReach(
  player: Vec2Fixed,
  mount: Vec2Fixed,
  tuning: MountReachAuthorityTuning,
): boolean {
  const dx = player.x - mount.x;
  const dy = player.y - mount.y;
  return dx * dx + dy * dy <= tuning.reachFixed * tuning.reachFixed;
}

/** Chooses a safe landing point beside the horse, preferring the facing side. */
export function findHorseDismountPosition(
  horse: Vec2Fixed,
  facing: NpcFacing,
  collision: CollisionMap,
  tuning: Pick<HorseMountAuthorityTuning, 'dismountDistanceFixed'> = LEGACY_HORSE_MOUNT_TUNING,
): Vec2Fixed | null {
  const distance = tuning.dismountDistanceFixed;
  const offsets: Record<NpcFacing, Vec2Fixed> = {
    up: { x: 0, y: -distance },
    down: { x: 0, y: distance },
    left: { x: -distance, y: 0 },
    right: { x: distance, y: 0 },
  };
  const order: readonly NpcFacing[] = [facing, 'left', 'right', 'down', 'up'];
  const visited = new Set<NpcFacing>();
  for (const direction of order) {
    if (visited.has(direction)) continue;
    visited.add(direction);
    const offset = offsets[direction];
    const candidate = { x: horse.x + offset.x, y: horse.y + offset.y };
    if (movementPositionAllowed(horse, candidate, collision)) return candidate;
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
  tuning: Pick<HorseMountAuthorityTuning, 'jump'> = LEGACY_HORSE_MOUNT_TUNING,
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
  const maximumSamples = tuning.jump.maximumApproachTiles + tuning.jump.maximumBlockedTiles + 1;
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
      if (clearApproachTiles > tuning.jump.maximumApproachTiles) return null;
      continue;
    }
    if (terrainBlocked) {
      if (!positionCollidesOnlyHorseJumpableTerrain(candidate, collision)) return null;
      blockedTiles += 1;
      if (blockedTiles > tuning.jump.maximumBlockedTiles) return null;
      continue;
    }
    return positionCollides(candidate, collision) ? null : candidate;
  }
  return null;
}
