import { describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED } from './state.js';
import {
  HORSE_DISMOUNT_DISTANCE_FIXED,
  HORSE_JUMP_DURATION_TICKS,
  HORSE_JUMP_MAX_BLOCKED_TILES,
  HORSE_MOUNT_REACH_FIXED,
  HORSE_WANDER_RADIUS_FIXED,
  findHorseDismountPosition,
  findHorseJumpLanding,
  isHorseWithinMountReach,
  mountedHorseFacing,
  npcFacingForDirection,
  stepWanderingNpc,
  type WanderingNpcState,
} from './npc.js';

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

describe('server-authoritative wandering NPCs', () => {
  it('walks deterministically while inside its leash', () => {
    const first = stepWanderingNpc(initial, 1, open);
    const repeated = stepWanderingNpc(initial, 1, open);
    expect(first).toEqual(repeated);
    expect(first.position.x).toBeGreaterThan(initial.position.x);
    expect(first.moving).toBe(true);
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
});

describe('horse mounting rules', () => {
  it('keeps the horse facing independent from a stationary rider aim', () => {
    expect(mountedHorseFacing('right', 'upLeft', false)).toBe('right');
    expect(mountedHorseFacing('right', 'upLeft', true)).toBe('left');
    expect(npcFacingForDirection('downRight')).toBe('right');
  });

  it('uses a circular interaction range', () => {
    expect(isHorseWithinMountReach(home, { x: home.x + HORSE_MOUNT_REACH_FIXED, y: home.y })).toBe(true);
    expect(isHorseWithinMountReach(home, { x: home.x + HORSE_MOUNT_REACH_FIXED + 1, y: home.y })).toBe(false);
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
