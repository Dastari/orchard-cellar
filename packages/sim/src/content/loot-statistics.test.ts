import { describe, expect, it } from 'vitest';

import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { runtimeTaggedLootTotals } from './loot-statistics.js';

describe('active authored loot statistic projection', () => {
  it('uses semantic tags for arbitrary renamed fish and aggregates their actual drops', () => {
    const base = bootstrapContentRegistry();
    const fish = base.items.get('item:raw_fish')!;
    const moonCarp = { ...fish, id: 'item:moon_carp' as const };
    const registry = { items: new Map([
      ...base.items,
      [moonCarp.id, moonCarp] as const,
    ]) };

    expect(runtimeTaggedLootTotals(registry, [
      { itemKind: 'moon_carp', quantity: 2 },
      { itemKind: 'wood', quantity: 1 },
      { itemKind: 'moon_carp', quantity: 3 },
    ], 'food.fish')).toEqual([{ subjectKind: 'moon_carp', quantity: 5 }]);
  });

  it('fails the whole projection closed for missing, retired, and invalid outputs', () => {
    const base = bootstrapContentRegistry();
    const fish = base.items.get('item:raw_fish')!;
    const retired = { ...fish, retired: true as const };
    const registry = {
      items: new Map([...base.items].map(([id, definition]) => [
        id, id === retired.id ? retired : definition,
      ])),
    };

    expect(runtimeTaggedLootTotals(base, [
      { itemKind: 'raw_fish', quantity: 1 },
      { itemKind: 'missing_fish', quantity: 1 },
    ], 'food.fish')).toBeNull();
    expect(runtimeTaggedLootTotals(registry, [
      { itemKind: 'raw_fish', quantity: 1 },
    ], 'food.fish')).toBeNull();
    expect(runtimeTaggedLootTotals(base, [
      { itemKind: 'raw_fish', quantity: 0 },
    ], 'food.fish')).toBeNull();
  });
});
