import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import { resolveResourceHitLoot } from './behaviour/handlers/loot.js';
import { orchardFruitStatus, orchardHarvestResult } from './orchard-harvest.js';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';
import { TILE_SIZE_FIXED } from './state.js';
const registry = bootstrapContentRegistry();
const tree = { kind: 'tree_apple', tileX: 5, tileY: 5, depleted: false, health: 3, growthStage: 3 };

describe('orchard fruit state and source content', () => {
  it('treats old live mature rows as ready and old saplings/stumps as unavailable', () => {
    expect(orchardFruitStatus(tree, 0n)).toBe('ok');
    expect(orchardFruitStatus({ ...tree, growthStage: 1 }, 0n)).toBe('tree_immature');
    expect(orchardFruitStatus({ ...tree, depleted: true }, 0n)).toBe('depleted');
    expect(orchardFruitStatus({ ...tree, health: 0 }, 0n)).toBe('depleted');
    expect(orchardFruitStatus({ ...tree, fruitReadyAtTick: 5n }, 4n)).toBe('fruit_ripening');
    expect(orchardFruitStatus({ ...tree, fruitReadyAtTick: 5n }, 5n)).toBe('ok');
  });
  it('limits picking to authored fruit and normal pickup reach', () => {
    expect(orchardHarvestResult(registry, tree, 5.5 * TILE_SIZE_FIXED, 6.5 * TILE_SIZE_FIXED, 0n)).toBe('ok');
    expect(orchardHarvestResult(registry, tree, 0, 0, 0n)).toBe('out_of_range');
    expect(orchardHarvestResult(registry, { ...tree, kind: 'tree_oak' }, 0, 0, 0n)).toBe('not_gatherable');
  });
  it('authors all four picking outputs while destructive source loot yields only forestry materials', () => {
    for (const fruit of ['apple', 'pear', 'peach', 'cherry']) {
      expect(registry.resources.get(`resource:tree_${fruit}`)?.fruitHarvest)
        .toEqual({ item: `item:${fruit}`, quantity: 2, cooldownTicks: AUTHORITY_TICKS_PER_DAY });
      expect(resolveResourceHitLoot(registry.loots, `tree_${fruit}`, 0, 3))
        .toEqual([{ itemKind: 'wood', quantity: 3 }]);
    }
  });
  it('rejects zero duration, nonfruit, missing and retired harvest references', () => {
    for (const fruitHarvest of [
      { item: 'item:apple', quantity: 2, cooldownTicks: 0 },
      { item: 'item:apple', quantity: 0, cooldownTicks: 18000 },
      { item: 'invalid', quantity: 2, cooldownTicks: 18000 },
      { item: 'item:wood', quantity: 2, cooldownTicks: 18000 },
      { item: 'item:missing_fruit', quantity: 2, cooldownTicks: 18000 },
    ]) {
      const rows = bootstrapContentRows().map(row => row.id === 'resource:tree_apple'
        ? { ...row, json: { ...JSON.parse(row.json as string), fruitHarvest } } : row);
      expect(buildContentRegistry(rows).report.valid).toBe(false);
    }
    const rows = bootstrapContentRows().map(row => row.id === 'item:apple'
      ? { ...row, json: { ...JSON.parse(row.json as string), retired: true } } : row);
    expect(buildContentRegistry(rows).report.valid).toBe(false);
  });
});
