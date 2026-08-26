import { describe, expect, it } from 'vitest';
import {
  GROWTH_RATE_BASIS_POINTS,
  advanceGrowthProgressAtSweep,
  growthIncrementAtSweep,
  growthRateBasisPoints,
  growthProgressForElapsedTicks,
  growthStageIndexForProgress,
  preferredBiomeGrowthModifier,
} from './growth.js';

const profile = { maxProgress: 24, stageThresholds: [6, 15, 24] } as const;

describe('generic deterministic growth', () => {
  it('maps persisted progress onto reusable visible stages', () => {
    expect(growthStageIndexForProgress(profile, 0)).toBeNull();
    expect(growthStageIndexForProgress(profile, 6)).toBe(0);
    expect(growthStageIndexForProgress(profile, 15)).toBe(1);
    expect(growthStageIndexForProgress(profile, 24)).toBe(2);
  });

  it('combines positive and negative buffs without allowing reverse growth', () => {
    expect(growthRateBasisPoints({ waterBps: 1_000, fertilizerBps: 3_000, poisonBps: -2_000 })).toBe(12_000);
    expect(growthRateBasisPoints({ poisonBps: -20_000 })).toBe(0);
    expect(growthIncrementAtSweep(20n, 20, { fertilizerBps: GROWTH_RATE_BASIS_POINTS })).toBe(2);
    expect(advanceGrowthProgressAtSweep(23, profile, 20n, 20, { fertilizerBps: 10_000 })).toBe(24);
  });

  it('supports biome preferences as a normal negative modifier', () => {
    expect(preferredBiomeGrowthModifier('meadow', ['meadow', 'forest'])).toBe(0);
    expect(preferredBiomeGrowthModifier('desert', ['meadow', 'forest'])).toBe(-5_000);
  });

  it('derives dense crop progress without scheduled row writes', () => {
    expect(growthProgressForElapsedTicks(0, 12n, 1, profile)).toBe(12);
    expect(growthProgressForElapsedTicks(0, 12n, 1, profile, { biomeBps: -5_000 })).toBe(6);
    expect(growthProgressForElapsedTicks(4, 100n, 1, profile, { fertilizerBps: 10_000 })).toBe(24);
  });

  it('is deterministic and staggers fractional modifiers by instance seed', () => {
    const first = growthIncrementAtSweep(40n, 20, { waterBps: 1_000 }, 17);
    expect(growthIncrementAtSweep(40n, 20, { waterBps: 1_000 }, 17)).toBe(first);
    const total = Array.from({ length: 100 }, (_, index) => growthIncrementAtSweep(
      BigInt((index + 1) * 20), 20, { waterBps: 1_000 }, 17,
    )).reduce((sum, increment) => sum + increment, 0);
    expect(total).toBeGreaterThanOrEqual(109);
    expect(total).toBeLessThanOrEqual(111);
  });
});
