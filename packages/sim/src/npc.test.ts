import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from './state.js';
import {
  HORSE_DISMOUNT_DISTANCE_FIXED,
  HORSE_JUMP_DURATION_TICKS,
  HORSE_JUMP_MAX_BLOCKED_TILES,
  HORSE_MOUNT_REACH_FIXED,
  HORSE_WANDER_RADIUS_FIXED,
  findHorseDismountPosition,
  findHorseJumpLanding,
  isHorseWithinMountReach,
  isMountWithinReach,
  mountedHorseFacing,
  npcFacingForDirection,
  npcFacingTowardPoint,
  stepFishermanCycle,
  stepWanderingNpc,
  stepNpcTowardPoint,
  type HorseMountAuthorityTuning,
  type MountReachAuthorityTuning,
  type WanderingNpcState,
} from './npc.js';
import type { NpcFishingCycleContentDefinition } from './content/npc-definition.js';

const fishingCycle = {
  kind: 'fishing_cycle',
  castTicks: 20,
  waitTicks: { minimum: 500, maximum: 900, step: 20 },
  reelTicks: 20,
  restTicks: { minimum: 300, maximum: 600, step: 20 },
  initialRestTicks: { minimum: 120, maximum: 240, step: 20 },
  barkChanceOneIn: 5,
  barks: ['A patient test line.', 'A deterministic test catch.'],
} satisfies NpcFishingCycleContentDefinition;

describe('fisherman work cycle', () => {
  it('casts once, waits, reels once, and then rests', () => {
    const initial = stepFishermanCycle(fishingCycle, 7n, 'idle', 0n, 100n);
    expect(initial.activity).toBe('fish_rest');
    expect(initial.nextDecisionTick).toBeGreaterThan(100n);

    const cast = stepFishermanCycle(fishingCycle, 7n, initial.activity, initial.nextDecisionTick, initial.nextDecisionTick);
    expect(cast.activity).toBe('fish_cast');
    const wait = stepFishermanCycle(fishingCycle, 7n, cast.activity, cast.nextDecisionTick, cast.nextDecisionTick);
    expect(wait.activity).toBe('fish_wait');
    expect(wait.nextDecisionTick - cast.nextDecisionTick).toBeGreaterThanOrEqual(25n * 20n);
    const reel = stepFishermanCycle(fishingCycle, 7n, wait.activity, wait.nextDecisionTick, wait.nextDecisionTick);
    expect(reel.activity).toBe('fish_reel');
    const rest = stepFishermanCycle(fishingCycle, 7n, reel.activity, reel.nextDecisionTick, reel.nextDecisionTick);
    expect(rest.activity).toBe('fish_rest');
    expect(rest.nextDecisionTick - reel.nextDecisionTick).toBeGreaterThanOrEqual(15n * 20n);
  });

  it('migrates the legacy fishing activity directly into a visible waiting pose', () => {
    const migrated = stepFishermanCycle(fishingCycle, 7n, 'fish', 10_000n, 100n);
    expect(migrated.activity).toBe('fish_wait');
    expect(migrated.nextDecisionTick).toBeGreaterThanOrEqual(100n + 25n * 20n);
    expect(migrated.nextDecisionTick).toBeLessThanOrEqual(100n + 45n * 20n);
  });

  it('is deterministic and only selects authored occasional remarks', () => {
    const first = stepFishermanCycle(fishingCycle, 7n, 'fish_reel', 0n, 2_000n);
    expect(stepFishermanCycle(fishingCycle, 7n, 'fish_reel', 0n, 2_000n)).toEqual(first);
    if (first.speech !== undefined) expect(fishingCycle.barks).toContain(first.speech);
  });

  it('uses authored phase lengths and bark policy for a renamed fishing NPC', () => {
    const authored = {
      ...fishingCycle,
      castTicks: 37,
      waitTicks: { minimum: 73, maximum: 73, step: 1 },
      reelTicks: 41,
      restTicks: { minimum: 89, maximum: 89, step: 1 },
      initialRestTicks: { minimum: 53, maximum: 53, step: 1 },
      barkChanceOneIn: 1,
      barks: ['Harbour water tells its own stories.'],
    } satisfies NpcFishingCycleContentDefinition;
    expect(stepFishermanCycle(authored, 99n, 'idle', 0n, 100n))
      .toEqual({ activity: 'fish_rest', nextDecisionTick: 153n });
    expect(stepFishermanCycle(authored, 99n, 'fish_rest', 100n, 100n))
      .toEqual({ activity: 'fish_cast', nextDecisionTick: 137n });
    expect(stepFishermanCycle(authored, 99n, 'fish_cast', 100n, 100n))
      .toEqual({ activity: 'fish_wait', nextDecisionTick: 173n });
    expect(stepFishermanCycle(authored, 99n, 'fish_wait', 100n, 100n))
      .toEqual({ activity: 'fish_reel', nextDecisionTick: 141n });
    expect(stepFishermanCycle(authored, 99n, 'fish_reel', 100n, 100n))
      .toEqual({ activity: 'fish_rest', nextDecisionTick: 189n, speech: authored.barks[0] });
  });
});

const open = { width: 32, height: 32, blocked: Array<boolean>(32 * 32).fill(false) };
const home = { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED };
const initial: WanderingNpcState = {
  id: 1n,
  position: home,
  home,
  facing: 'down',
  moving: false,
  wanderDirection: 'right',
  nextDecisionTick: 100,
};
const authoredHorseTuning = {
  reachFixed: 257,
  dismountDistanceFixed: 777,
  jump: { maximumBlockedTiles: 1, maximumApproachTiles: 0, durationTicks: 23 },
  wander: {
    radiusFixed: 1_000,
    speedFixed: 37,
    decisionMinimumTicks: 11,
    decisionJitterTicks: 1,
    blockedRetryTicks: 3,
  },
} satisfies HorseMountAuthorityTuning;

describe('server-authoritative wandering NPCs', () => {
  it('faces the last interaction point without turning arbitrarily at the same point', () => {
    expect(npcFacingTowardPoint(home, { x: home.x + TILE_SIZE_FIXED, y: home.y }, 'down')).toBe('right');
    expect(npcFacingTowardPoint(home, { x: home.x, y: home.y - TILE_SIZE_FIXED }, 'right')).toBe('up');
    expect(npcFacingTowardPoint(home, home, 'left')).toBe('left');
  });

  it('walks deterministically while inside its leash', () => {
    const first = stepWanderingNpc(initial, 1, open);
    const repeated = stepWanderingNpc(initial, 1, open);
    expect(first).toEqual(repeated);
    expect(first.position.x).toBeGreaterThan(initial.position.x);
    expect(first.moving).toBe(true);
  });

  it('uses arbitrary authored speed, leash, decision, and retry tuning', () => {
    const moving = stepWanderingNpc(initial, 1, open, authoredHorseTuning.wander);
    expect(moving.position).toEqual({ x: initial.position.x + 37, y: initial.position.y });
    const deciding = stepWanderingNpc({ ...initial, wanderDirection: null, nextDecisionTick: 0 }, 5, open,
      authoredHorseTuning.wander);
    expect(deciding.nextDecisionTick).toBe(16);
    const blocked = stepWanderingNpc(initial, 1, {
      ...open,
      obstacles: [{ left: home.x + 1, right: home.x + 100, top: home.y - 100, bottom: home.y }],
    }, authoredHorseTuning.wander);
    expect(blocked).toMatchObject({ position: initial.position, moving: false, nextDecisionTick: 4 });
    const outside = stepWanderingNpc({
      ...initial,
      position: { x: home.x + authoredHorseTuning.wander.radiusFixed, y: home.y },
    }, 1, open, authoredHorseTuning.wander);
    expect(outside.position).toEqual({ x: home.x + authoredHorseTuning.wander.radiusFixed, y: home.y });
  });

  it('never crosses the configured wander boundary', () => {
    const edge = {
      ...initial,
      position: { ...home, x: home.x + HORSE_WANDER_RADIUS_FIXED },
    };
    const stepped = stepWanderingNpc(edge, 1, open);
    expect(stepped.position).toEqual(edge.position);
    expect(stepped.wanderDirection).toBeNull();
  });

  it('stops and reconsiders soon when a collision blocks it', () => {
    const stepped = stepWanderingNpc(initial, 1, {
      ...open,
      obstacles: [{ left: home.x + 1, right: home.x + TILE_SIZE_FIXED, top: home.y - TILE_SIZE_FIXED, bottom: home.y }],
    });
    expect(stepped.position).toEqual(initial.position);
    expect(stepped.moving).toBe(false);
    expect(stepped.nextDecisionTick).toBe(9);
  });

  it('keeps grounded NPCs on their current elevation plane away from a ramp', () => {
    const position = {
      x: TILE_SIZE_FIXED - 1,
      y: TILE_SIZE_FIXED / 2 + 6 * FIXED_UNITS_PER_PIXEL,
    };
    const state = { ...initial, position, home: position, wanderDirection: 'right' as const };
    const stepped = stepWanderingNpc(state, 1, {
      width: 2,
      height: 1,
      blocked: [false, false],
      elevations: Uint8Array.from([0, 1]),
      terrainTransitions: [],
    });
    expect(stepped.position).toEqual(position);
    expect(stepped.moving).toBe(false);
  });

  it('can temporarily walk toward an interaction and stops within reach', () => {
    const target = { x: home.x + 4 * TILE_SIZE_FIXED, y: home.y };
    const walking = stepNpcTowardPoint(initial, target, 1, open, TILE_SIZE_FIXED);
    expect(walking.position.x).toBeGreaterThan(initial.position.x);
    expect(walking.facing).toBe('right');
    const arrived = stepNpcTowardPoint({ ...initial, position: { x: target.x - TILE_SIZE_FIXED, y: target.y } }, target, 2, open, TILE_SIZE_FIXED);
    expect(arrived.moving).toBe(false);
    const tuned = stepNpcTowardPoint(initial, target, 1, open, TILE_SIZE_FIXED, authoredHorseTuning.wander);
    expect(tuned.position).toEqual({ x: initial.position.x + 37, y: initial.position.y });
  });
});

describe('horse mounting rules', () => {
  it('keeps the horse facing independent from a stationary rider aim', () => {
    expect(mountedHorseFacing('right', 'upLeft', false)).toBe('right');
    expect(mountedHorseFacing('upLeft', 'downRight', false)).toBe('upLeft');
    expect(mountedHorseFacing('right', 'upLeft', true)).toBe('upLeft');
    expect(mountedHorseFacing('right', 'downRight', true)).toBe('downRight');
    expect(npcFacingForDirection('downRight')).toBe('right');
  });

  it('uses a circular interaction range', () => {
    expect(isHorseWithinMountReach(home, { x: home.x + HORSE_MOUNT_REACH_FIXED, y: home.y })).toBe(true);
    expect(isHorseWithinMountReach(home, { x: home.x + HORSE_MOUNT_REACH_FIXED + 1, y: home.y })).toBe(false);
    expect(isHorseWithinMountReach(home, { x: home.x + 257, y: home.y }, authoredHorseTuning)).toBe(true);
    expect(isHorseWithinMountReach(home, { x: home.x + 258, y: home.y }, authoredHorseTuning)).toBe(false);
  });

  it('places a dismount beside the horse and avoids collisions', () => {
    expect(findHorseDismountPosition(home, 'right', open)).toEqual({
      x: home.x + HORSE_DISMOUNT_DISTANCE_FIXED,
      y: home.y,
    });

    expect(findHorseDismountPosition(home, 'right', {
      ...open,
      obstacles: [{
        left: home.x + HORSE_DISMOUNT_DISTANCE_FIXED - TILE_SIZE_FIXED,
        right: home.x + HORSE_DISMOUNT_DISTANCE_FIXED + TILE_SIZE_FIXED,
        top: home.y - TILE_SIZE_FIXED,
        bottom: home.y,
      }],
    })).toEqual({
      x: home.x - HORSE_DISMOUNT_DISTANCE_FIXED,
      y: home.y,
    });
    expect(findHorseDismountPosition(home, 'up', open, authoredHorseTuning)).toEqual({
      x: home.x,
      y: home.y - 777,
    });
  });

  it('jumps a terrain barrier up to three tiles wide and lands safely', () => {
    const jumpHome = { x: home.x + TILE_SIZE_FIXED / 2, y: home.y };
    const blocked = Array<boolean>(32 * 32).fill(false);
    const horseJumpableTerrain = Array<boolean>(32 * 32).fill(false);
    for (let x = 11; x <= 13; x += 1) blocked[9 * 32 + x] = true;
    for (let x = 11; x <= 13; x += 1) horseJumpableTerrain[9 * 32 + x] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', { ...open, blocked, horseJumpableTerrain })).toEqual({
      x: jumpHome.x + 4 * TILE_SIZE_FIXED,
      y: jumpHome.y,
    });
    expect(HORSE_JUMP_MAX_BLOCKED_TILES).toBe(3);
    expect(HORSE_JUMP_DURATION_TICKS).toBeGreaterThan(0);
  });

  it('uses arbitrary authored approach and barrier limits', () => {
    const jumpHome = { x: home.x + TILE_SIZE_FIXED / 2, y: home.y };
    const blocked = Array<boolean>(32 * 32).fill(false);
    const horseJumpableTerrain = Array<boolean>(32 * 32).fill(false);
    blocked[9 * 32 + 11] = true;
    horseJumpableTerrain[9 * 32 + 11] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', {
      ...open, blocked, horseJumpableTerrain,
    }, authoredHorseTuning)).toEqual({
      x: jumpHome.x + 2 * TILE_SIZE_FIXED,
      y: jumpHome.y,
    });
    const tooWide = [...blocked];
    const tooWideJumpable = [...horseJumpableTerrain];
    tooWide[9 * 32 + 12] = true;
    tooWideJumpable[9 * 32 + 12] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', {
      ...open, blocked: tooWide, horseJumpableTerrain: tooWideJumpable,
    }, authoredHorseTuning)).toBeNull();
    expect(authoredHorseTuning.jump.durationTicks).toBe(23);
  });

  it('rejects four-tile barriers, open-ground teleports, unsafe landings, and tree-only obstacles', () => {
    const jumpHome = { x: home.x + TILE_SIZE_FIXED / 2, y: home.y };
    const wide = Array<boolean>(32 * 32).fill(false);
    const wideJumpable = Array<boolean>(32 * 32).fill(false);
    for (let x = 11; x <= 14; x += 1) wide[9 * 32 + x] = true;
    for (let x = 11; x <= 14; x += 1) wideJumpable[9 * 32 + x] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', {
      ...open,
      blocked: wide,
      horseJumpableTerrain: wideJumpable,
    })).toBeNull();
    expect(findHorseJumpLanding(jumpHome, 'right', open)).toBeNull();

    const river = Array<boolean>(32 * 32).fill(false);
    const riverJumpable = Array<boolean>(32 * 32).fill(false);
    for (let x = 11; x <= 13; x += 1) river[9 * 32 + x] = true;
    for (let x = 11; x <= 13; x += 1) riverJumpable[9 * 32 + x] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', {
      ...open,
      blocked: river,
      horseJumpableTerrain: riverJumpable,
      obstacles: [{
        left: jumpHome.x + 4 * TILE_SIZE_FIXED - TILE_SIZE_FIXED / 2,
        right: jumpHome.x + 4 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        top: jumpHome.y - TILE_SIZE_FIXED,
        bottom: jumpHome.y,
      }],
    })).toBeNull();
    expect(findHorseJumpLanding(jumpHome, 'right', {
      ...open,
      obstacles: [{
        left: jumpHome.x + TILE_SIZE_FIXED / 2,
        right: jumpHome.x + 3 * TILE_SIZE_FIXED / 2,
        top: jumpHome.y - TILE_SIZE_FIXED,
        bottom: jumpHome.y,
      }],
    })).toBeNull();
  });

  it('rejects cliffs and mixed water/cliff barriers', () => {
    const jumpHome = { x: home.x + TILE_SIZE_FIXED / 2, y: home.y };
    const blocked = Array<boolean>(32 * 32).fill(false);
    const horseJumpableTerrain = Array<boolean>(32 * 32).fill(false);
    for (let x = 11; x <= 13; x += 1) blocked[9 * 32 + x] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', { ...open, blocked, horseJumpableTerrain })).toBeNull();

    horseJumpableTerrain[9 * 32 + 11] = true;
    horseJumpableTerrain[9 * 32 + 12] = true;
    expect(findHorseJumpLanding(jumpHome, 'right', { ...open, blocked, horseJumpableTerrain })).toBeNull();
  });
});

describe('authored mount interaction reach', () => {
  it('uses arbitrary boat reach without inheriting horse tuning', () => {
    const boatReach = { reachFixed: 113 } satisfies MountReachAuthorityTuning;
    expect(isMountWithinReach(home, { x: home.x + 113, y: home.y }, boatReach)).toBe(true);
    expect(isMountWithinReach(home, { x: home.x + 114, y: home.y }, boatReach)).toBe(false);
  });
});
