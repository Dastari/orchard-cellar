import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { fruitSeedChanceBps, fruitSeedDrop, fruitTreeForSeed, isPlantedFruitTreeId, plantedFruitTreeId } from './fruit-seeds.js';
import { farmingSkillEffects } from './skill-effects.js';
import { runtimeSkillPurchaseRejection, skillExperienceForLevel } from './skill-trees.js';
import { statelessRoll } from './checks.js';
import { TREE_REGROWTH_SMALL_PROGRESS, TREE_REGROWTH_SWEEP_TICKS, treeRegrowthProgressAtSweep, treeGrowthStageForProgress } from './tree-regrowth.js';

const registry = bootstrapContentRegistry();
const fruits = ['apple', 'pear', 'peach', 'cherry'];
const drops = [{ itemKind: 'wood', quantity: 3 }, { itemKind: 'apple', quantity: 2 }];

describe('orchard seed harvest loop', () => {
  it('maps all four fruit seeds to the matching live growing tree', () => {
    for (const fruit of fruits) {
      expect(fruitTreeForSeed(registry, `${fruit}_seed`)).toMatchObject({ runtimeKind: `tree_${fruit}`, seedItem: `item:${fruit}_seed` });
    }
    expect(fruitTreeForSeed(registry, 'apple')).toBeNull();
    expect(fruitTreeForSeed(registry, 'strawberry_seeds')).toBeNull();
    expect(fruitTreeForSeed(registry, 'missing')).toBeNull();
  });
  it('unlocks at level three after Green Thumb, and caps at three ranks', () => {
    const state = { experience: skillExperienceForLevel(3), spentPoints: 0, bonusPoints: 10, ranks: { green_thumb: 1 } };
    expect(runtimeSkillPurchaseRejection(registry, 'orchard_seed_saver', state)).toBeNull();
    expect(runtimeSkillPurchaseRejection(registry, 'orchard_seed_saver', { ...state, ranks: {} })).not.toBeNull();
    expect(runtimeSkillPurchaseRejection(registry, 'orchard_seed_saver', { ...state, experience: 0n })).not.toBeNull();
    expect(runtimeSkillPurchaseRejection(registry, 'orchard_seed_saver', { ...state, ranks: { ...state.ranks, orchard_seed_saver: 3 } })).not.toBeNull();
    expect(farmingSkillEffects(registry, { orchard_seed_saver: 3 }).orchardSeedSaver).toBe(0);
    expect(farmingSkillEffects(registry, { green_thumb: 1, orchard_seed_saver: 3 }).orchardSeedSaver).toBe(3);
    const trees = new Map(registry.skillTrees);
    const farming = trees.get('skill_tree:farming')!;
    trees.set(farming.id, { ...farming, nodes: farming.nodes.map(node => node.id === 'orchard_seed_saver' ? { ...node, id: 'renamed_seed_skill' } : node) });
    expect(farmingSkillEffects({ ...registry, skillTrees: trees }, { green_thumb: 1, renamed_seed_skill: 3 }).orchardSeedSaver).toBe(3);
  });
  it('uses one independent 5/15/25/35 percent roll, retaining primary loot', () => {
    expect([0, 1, 2, 3, 99, -1, NaN, 1.5].map(fruitSeedChanceBps)).toEqual([500, 1500, 2500, 3500, 3500, 500, 500, 500]);
    const counts = [0, 0, 0, 0];
    for (let ordinal = 0; ordinal < 10_000; ordinal++) {
      const parts = [42, 17n, ordinal];
      for (let rank = 0; rank <= 3; rank++) {
        const found = fruitSeedDrop(registry, { kind: 'tree_apple' }, drops, rank, parts);
        expect(found !== null).toBe(statelessRoll([...parts, 'orchard.seed'], 10_000) < fruitSeedChanceBps(rank));
        if (found !== null) { counts[rank]!++; expect(found).toEqual({ itemKind: 'apple_seed', quantity: 1 }); }
      }
    }
    for (let rank = 0; rank <= 3; rank++) expect(Math.abs(counts[rank]! - fruitSeedChanceBps(rank))).toBeLessThan(150);
    expect(drops).toEqual([{ itemKind: 'wood', quantity: 3 }, { itemKind: 'apple', quantity: 2 }]);
  });
  it('is stable on retries, grants only matching seeds and excludes non-fruit/retired content', () => {
    for (const fruit of fruits) {
      const loot = [{ itemKind: fruit, quantity: 2 }];
      let winner = 0;
      while (fruitSeedDrop(registry, { kind: `tree_${fruit}` }, loot, 3, [winner]) === null) winner++;
      const result = fruitSeedDrop(registry, { kind: `tree_${fruit}` }, loot, 3, [winner]);
      expect(result).toEqual({ itemKind: `${fruit}_seed`, quantity: 1 });
      expect(fruitSeedDrop(registry, { kind: `tree_${fruit}` }, loot, 3, [winner])).toEqual(result);
      const items = new Map(registry.items); const seed = items.get(`item:${fruit}_seed`)!;
      items.set(seed.id, { ...seed, retired: true });
      expect(fruitSeedDrop({ ...registry, items }, { kind: `tree_${fruit}` }, loot, 3, [winner])).toBeNull();
      const resources = new Map(registry.resources); const tree = resources.get(`resource:tree_${fruit}`)!;
      resources.set(tree.id, { ...tree, retired: true });
      expect(fruitTreeForSeed({ ...registry, resources }, `${fruit}_seed`)).toBeNull();
      resources.set('resource:duplicate', { ...tree, id: 'resource:duplicate' });
      expect(fruitTreeForSeed({ ...registry, resources }, `${fruit}_seed`)).not.toBeNull();
      resources.set(tree.id, tree);
      expect(fruitTreeForSeed({ ...registry, resources }, `${fruit}_seed`)).toBeNull();
    }
    expect(fruitSeedDrop(registry, { kind: 'tree_apple' }, [{ itemKind: 'wood', quantity: 3 }], 3, [1])).toBeNull();
    expect(fruitSeedDrop(registry, { kind: 'tree_oak' }, drops, 3, [1])).toBeNull();
    expect(fruitSeedDrop(registry, { kind: 'tree_apple' }, [{ itemKind: 'apple', quantity: 0 }], 3, [1])).toBeNull();
  });
  it('allocates distinct safe IDs across signed tiles and spaces; planted saplings mature', () => {
    const ids = new Set<bigint>();
    for (const space of [0, 1, 65535]) for (const x of [-32768, -1, 0, 32767]) for (const y of [-32768, -1, 0, 32767]) {
      const id = plantedFruitTreeId(space, x, y);
      expect(isPlantedFruitTreeId(id)).toBe(true); expect(Number.isSafeInteger(Number(id))).toBe(true); ids.add(id);
    }
    expect(ids.size).toBe(48);
    expect(isPlantedFruitTreeId(1n << 63n)).toBe(false); expect(isPlantedFruitTreeId(1n)).toBe(false);
    let progress = TREE_REGROWTH_SMALL_PROGRESS;
    expect(treeGrowthStageForProgress(progress)).toBe(1);
    for (let sweep = 1; sweep <= 18; sweep++) progress = treeRegrowthProgressAtSweep(progress, BigInt(sweep * TREE_REGROWTH_SWEEP_TICKS), false);
    expect(treeGrowthStageForProgress(progress)).toBe(3);
  });
});
