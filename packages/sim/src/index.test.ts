import { describe, expect, it } from 'vitest';
import { advanceTick } from './tick.js';
import { createEstateCollisionMap, createInitialState, FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type Action, type FarmState } from './state.js';
import { createRng, nextRng } from './rng.js';
import { calendarAtTick, nextDayTick, TICKS_PER_DAY } from './time.js';

function replay(seed: number, actions: readonly Action[]): FarmState {
  let state = createInitialState(seed);
  for (let tick = 1; tick <= 600; tick += 1) {
    state = advanceTick(state, [actions[tick % actions.length] ?? { type: 'move', direction: null }], tick);
  }
  return state;
}

describe('deterministic simulation', () => {
  it('02 golden rule: seed and action replay produces identical state', () => {
    const actions: Action[] = [
      { type: 'move', direction: 'right' },
      { type: 'move', direction: 'downRight' },
      { type: 'move', direction: 'up' },
      { type: 'move', direction: null },
    ];
    expect(replay(42, actions)).toEqual(replay(42, actions));
  });

  it('stops the avatar at blocked map tiles', () => {
    let state = createInitialState(7);
    for (let tick = 1; tick <= 5000; tick += 1) {
      state = advanceTick(state, [{ type: 'move', direction: 'left' }], tick);
    }
    expect(state.player.position.x).toBeGreaterThanOrEqual(TILE_SIZE_FIXED + 4 * FIXED_UNITS_PER_PIXEL);
    expect(state.player.moving).toBe(false);
  }, 10_000);

  it('stops at an internal orchard obstacle', () => {
    let state = createInitialState(7);
    state = {
      ...state,
      player: { ...state.player, position: { x: 20 * TILE_SIZE_FIXED, y: 15 * TILE_SIZE_FIXED } },
    };
    for (let tick = 1; tick <= 250; tick += 1) {
      state = advanceTick(state, [{ type: 'move', direction: 'down' }], tick);
    }
    expect(state.player.position.y).toBeLessThan(17 * TILE_SIZE_FIXED);
    expect(state.player.moving).toBe(false);
  });

  it('blocks exactly the authored orchard tree columns', () => {
    const collision = createEstateCollisionMap([{ x: 20, y: 17 }]);
    const blockedAt = (x: number, y: number): boolean => collision.blocked[y * collision.width + x] ?? false;
    expect(blockedAt(8, 17)).toBe(false);
    expect(blockedAt(12, 17)).toBe(false);
    expect(blockedAt(16, 17)).toBe(false);
    expect(blockedAt(20, 17)).toBe(true);
  });

  it('matches the authored estate lakes, fences, and building footprints', () => {
    const collision = createEstateCollisionMap();
    const blockedAt = (x: number, y: number): boolean => collision.blocked[y * collision.width + x] ?? false;
    expect(blockedAt(40, 36)).toBe(true);
    expect(blockedAt(41, 46)).toBe(true);
    expect(blockedAt(7, 20)).toBe(true);
    expect(blockedAt(39, 12)).toBe(true);
    expect(blockedAt(50, 38)).toBe(true);
    expect(blockedAt(58, 38)).toBe(true);
    expect(blockedAt(33, 20)).toBe(false);
  });

  it('moves diagonally without cardinal speed inflation', () => {
    const state = createInitialState(7);
    const next = advanceTick(state, [{ type: 'move', direction: 'downRight' }], 1);
    expect(next.player.position.x - state.player.position.x).toBe(11);
    expect(next.player.position.y - state.player.position.y).toBe(11);
  });

  it('xoshiro128** emits a stable sequence and next state', () => {
    let rng = createRng(42);
    const values: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const result = nextRng(rng);
      values.push(result.value);
      rng = result.state;
    }
    expect(values).toEqual([1962818870, 1222316584, 3741832822, 3850430075]);
    expect(rng).toEqual(nextRng(nextRng(nextRng(nextRng(createRng(42)).state).state).state).state);
  });

  it('maps the 15-minute day and seven-day seasons at exact boundaries', () => {
    expect(calendarAtTick(0)).toMatchObject({ season: 'spring', dayOfSeason: 1, year: 1, hour: 6, minute: 0 });
    expect(calendarAtTick(Math.floor(TICKS_PER_DAY * 0.75))).toMatchObject({ hour: 0, minute: 0 });
    expect(calendarAtTick(TICKS_PER_DAY - 1)).toMatchObject({ season: 'spring', dayOfSeason: 1, hour: 5, minute: 59 });
    expect(calendarAtTick(TICKS_PER_DAY * 7)).toMatchObject({ season: 'summer', dayOfSeason: 1, year: 1 });
    expect(calendarAtTick(TICKS_PER_DAY * 28)).toMatchObject({ season: 'spring', dayOfSeason: 1, year: 2 });
    expect(nextDayTick(TICKS_PER_DAY + 9)).toBe(TICKS_PER_DAY * 2);
  });

  it('transitions between estate and cellar collision spaces', () => {
    const estate = createInitialState(7);
    const cellar = advanceTick(estate, [{ type: 'transition', location: 'cellar' }], 1);
    expect(cellar.player.location).toBe('cellar');
    expect(cellar.collision.width).toBe(40);
    const returned = advanceTick(cellar, [{ type: 'transition', location: 'estate' }], 2);
    expect(returned.player.location).toBe('estate');
    expect(returned.collision.width).toBe(64);
  });
});
