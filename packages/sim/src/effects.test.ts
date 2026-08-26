import { describe, expect, it } from 'vitest';
import { EFFECT_DEFINITIONS, activeEffects, modifiersForEffects, refreshEffect } from './effects.js';
import { resolveStats } from './stats.js';

describe('25§6 effect definitions', () => {
  it('uses the documented durations and refreshes without exceeding max stacks', () => {
    expect(EFFECT_DEFINITIONS.well_rested.durationTicks).toBe(144_000);
    expect(EFFECT_DEFINITIONS.winded.durationTicks).toBe(1_800);
    expect(EFFECT_DEFINITIONS.orchard_tea.durationTicks).toBe(6_000);
    const first = refreshEffect(null, 'orchard_tea', 100n, 7n);
    const refreshed = refreshEffect(first, 'orchard_tea', 200n);
    expect(refreshed).toEqual({
      id: 7n,
      effectKind: 'orchard_tea',
      stacks: 1,
      appliedTick: 200n,
      expiresTick: 6_200n,
    });
  });

  it('filters expiry at every read and compiles live effects into modifiers', () => {
    const rested = refreshEffect(null, 'well_rested', 0n, 1n);
    expect(activeEffects([rested], 143_999n)).toEqual([rested]);
    expect(activeEffects([rested], 144_000n)).toEqual([]);
    expect(resolveStats(undefined, modifiersForEffects([rested], 1n)).vigourRegenCentiPerSecond)
      .toBe(1_000);
  });

  it('applies Orchard Tea through the same attribute pipeline', () => {
    const tea = refreshEffect(null, 'orchard_tea', 0n, 2n);
    const stats = resolveStats(undefined, modifiersForEffects([tea], 1n));
    expect(stats.attributes.con).toBe(12);
    expect(stats.maxVigourCenti).toBe(12_000);
  });
});
