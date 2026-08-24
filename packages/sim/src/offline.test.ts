import { describe, expect, it } from 'vitest';
import { OFFLINE_CAP_SECONDS } from './balance.js';
import { type OrchardTreeState } from './economy-state.js';
import { applyOffline } from './offline.js';
import { createInitialState, SIM_TICKS_PER_SECOND } from './state.js';
import { TICKS_PER_DAY } from './time.js';

function matureState(tree: Partial<OrchardTreeState> = {}) {
  const state = createInitialState(73);
  const starter = state.economy.trees[0];
  if (!starter) throw new Error('Missing starter tree');
  return {
    ...state,
    economy: {
      ...state.economy,
      trees: [{ ...starter, stage: 'mature' as const, ...tree }],
    },
  };
}

describe('deterministic offline progress', () => {
  it('runs at sixty percent efficiency without charging Vigour', () => {
    const progressed = applyOffline(matureState(), 60);
    expect(progressed.tick).toBe(60 * SIM_TICKS_PER_SECOND);
    expect(progressed.economy.trees[0]?.bufferMicro).toBe(5_760_000);
    expect(progressed.economy.vigour).toBe(0);
    expect(progressed.player.moving).toBe(false);
  });

  it('caps elapsed time at eight hours exactly', () => {
    const state = createInitialState(91);
    const progressed = applyOffline(state, OFFLINE_CAP_SECONDS * 4);
    expect(progressed.tick).toBe(state.tick + OFFLINE_CAP_SECONDS * SIM_TICKS_PER_SECOND);
  });

  it('decays Care at half speed while offline', () => {
    const state = matureState({ care: 3, nextCareDecayTick: TICKS_PER_DAY * 2 });
    const beforeBoundary = applyOffline(state, TICKS_PER_DAY * 4 / SIM_TICKS_PER_SECOND - 1);
    expect(beforeBoundary.economy.trees[0]?.care).toBe(3);

    const atBoundary = applyOffline(state, TICKS_PER_DAY * 4 / SIM_TICKS_PER_SECOND);
    expect(atBoundary.economy.trees[0]?.care).toBe(2);
  });

  it('splits production exactly across a season boundary', () => {
    const summerStart = TICKS_PER_DAY * 7;
    const state = {
      ...matureState({ species: 'fig' }),
      tick: summerStart - 30 * SIM_TICKS_PER_SECOND,
    };
    const progressed = applyOffline(state, 60);
    expect(progressed.economy.trees[0]?.bufferMicro).toBe(20_196_000_000);
  });

  it('honors the press-yard bottleneck while offline', () => {
    const state = createInitialState(22);
    const progressed = applyOffline({
      ...state,
      economy: {
        ...state.economy,
        firstPressRepaired: true,
        presses: [1, 0, 0, 0, 0],
        hopperFruitMicro: 300_000_000,
      },
    }, 3_600);
    expect(progressed.economy.yardMustMicro).toBe(100_000_000);
    expect(progressed.economy.hopperFruitMicro).toBe(100_000_000);
  });

  it('is stable for negative, fractional, and zero elapsed input', () => {
    const state = createInitialState(12);
    expect(applyOffline(state, -10)).toBe(state);
    expect(applyOffline(state, 0.9)).toBe(state);
  });
});
