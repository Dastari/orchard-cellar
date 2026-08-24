import { TILE_SIZE_FIXED, createInitialState } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { nearOpenPlot, nearTree, targetScore } from './farm.js';

describe('FarmScene spatial target selection', () => {
  it('requires the target to be inside the facing assist cone', () => {
    const state = createInitialState();
    const positioned = {
      ...state,
      player: { ...state.player, position: { x: 20 * TILE_SIZE_FIXED, y: 20 * TILE_SIZE_FIXED }, facing: 'up' as const },
    };
    expect(targetScore(positioned, 20, 18, 2)).toBeTypeOf('number');
    expect(targetScore(positioned, 20, 22, 2)).toBeUndefined();
  });

  it('chooses the nearest facing tree instead of state insertion order', () => {
    const state = createInitialState();
    const first = state.economy.trees[0];
    if (!first) throw new Error('Missing starter tree');
    const positioned = {
      ...state,
      player: { ...state.player, position: { x: 20 * TILE_SIZE_FIXED, y: 22 * TILE_SIZE_FIXED }, facing: 'up' as const },
      economy: { ...state.economy, trees: [{ ...first, x: 16, y: 18 }, { ...first, id: 2, x: 20, y: 20 }] },
    };
    expect(nearTree(positioned, 5)?.id).toBe(2);
  });

  it('uses Tall Ladders reach and selects the facing open plot', () => {
    const state = createInitialState();
    const positioned = {
      ...state,
      player: { ...state.player, position: { x: 20 * TILE_SIZE_FIXED, y: 21 * TILE_SIZE_FIXED }, facing: 'up' as const },
    };
    expect(nearTree(positioned)).toBeUndefined();
    expect(nearTree({ ...positioned, economy: { ...positioned.economy, upgrades: ['tallLadders'] } })?.id).toBe(1);
    const facingPlot = {
      ...positioned,
      player: { ...positioned.player, position: { x: 20 * TILE_SIZE_FIXED, y: 20 * TILE_SIZE_FIXED }, facing: 'down' as const },
    };
    expect(nearOpenPlot(facingPlot)).toEqual([20, 22]);
  });
});
