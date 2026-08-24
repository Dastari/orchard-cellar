import { describe, expect, it } from 'vitest';
import { advanceTick } from './tick.js';
import { createInitialState, FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type Action, type FarmState } from './state.js';
import { createRng, nextRng } from './rng.js';

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
    expect(state.player.position.x).toBeGreaterThanOrEqual(TILE_SIZE_FIXED + 5 * FIXED_UNITS_PER_PIXEL);
    expect(state.player.moving).toBe(false);
  });

  it('stops at the internal farmhouse obstacle', () => {
    let state = createInitialState(7);
    for (let tick = 1; tick <= 500; tick += 1) {
      state = advanceTick(state, [{ type: 'move', direction: 'right' }], tick);
    }
    expect(state.player.position.x).toBeLessThan(17 * TILE_SIZE_FIXED);
    expect(state.player.moving).toBe(false);
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
});
