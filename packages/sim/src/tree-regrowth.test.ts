import { describe, expect, it } from 'vitest';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';
import {
  TREE_REGROWTH_PROGRESS_MAX,
  TREE_REGROWTH_SWEEP_TICKS,
  treeGrowthStageForProgress,
  treeGrowthStageName,
  treeHealthForGrowthStage,
  treeRegrowthProgressAtSweep,
} from './tree-regrowth.js';

describe('tree regrowth', () => {
  it('takes exactly one authoritative game day without rain', () => {
    expect(TREE_REGROWTH_SWEEP_TICKS * TREE_REGROWTH_PROGRESS_MAX).toBe(AUTHORITY_TICKS_PER_DAY);
    let progress = 0;
    for (let sweep = 1; sweep <= TREE_REGROWTH_PROGRESS_MAX; sweep += 1) {
      progress = treeRegrowthProgressAtSweep(
        progress,
        BigInt(sweep * TREE_REGROWTH_SWEEP_TICKS),
        false,
      );
    }
    expect(progress).toBe(TREE_REGROWTH_PROGRESS_MAX);
  });

  it('moves through stump time, then independently choppable small, medium, and big phases', () => {
    expect(treeGrowthStageForProgress(0)).toBeNull();
    expect(treeGrowthStageForProgress(6)).toBe(1);
    expect(treeGrowthStageForProgress(15)).toBe(2);
    expect(treeGrowthStageForProgress(24)).toBe(3);
    expect(treeGrowthStageName(1)).toBe('small');
    expect(treeGrowthStageName(2)).toBe('medium');
    expect(treeGrowthStageName(3)).toBe('big');
    expect([1, 2, 3].map(treeHealthForGrowthStage)).toEqual([1, 2, 3]);
  });

  it('adds only an occasional deterministic and bounded rain bonus', () => {
    let ordinary = 0;
    let rainy = 0;
    for (let sweep = 1; sweep <= 20; sweep += 1) {
      const tick = BigInt(sweep * TREE_REGROWTH_SWEEP_TICKS);
      ordinary = treeRegrowthProgressAtSweep(ordinary, tick, false, 41);
      rainy = treeRegrowthProgressAtSweep(rainy, tick, true, 41);
    }
    expect(ordinary).toBe(20);
    expect(rainy).toBeGreaterThan(ordinary);
    expect(rainy).toBeLessThanOrEqual(22);
    expect(treeRegrowthProgressAtSweep(24, 10n * BigInt(TREE_REGROWTH_SWEEP_TICKS), true)).toBe(24);
  });
});
