import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { resolveMiningLoot, resolveResourceHitLoot } from './behaviour/handlers/loot.js';
import { runtimeToolCanMineResource } from './content/runtime.js';
import { SURVIVAL_ORE_KINDS, SURVIVAL_TREE_KINDS } from './survival-world.js';
const registry = bootstrapContentRegistry();
describe('Hearth gathering catalogue', () => {
  it('allows every current pickaxe to mine the three materials without changing original generator species', () => {
    const pickaxes = [...registry.items.values()].filter(item => item.tool?.specialization === 'mining' && item.tool.mineableResources !== undefined && !item.retired);
    expect(pickaxes).toHaveLength(6);
    for (const item of pickaxes) for (const kind of ['rock_basalt', 'ore_cinder', 'ore_emberglass']) {
      expect(runtimeToolCanMineResource(registry, item.id.slice(5), kind)).toBe(true);
      expect(runtimeToolCanMineResource(registry, 'axe', kind)).toBe(false);
    }
    expect(SURVIVAL_ORE_KINDS).toEqual(['ore_iron','ore_copper','ore_gold','ore_emerald','ore_sapphire','ore_topaz','ore_ruby','ore_amethyst']);
    expect(SURVIVAL_TREE_KINDS).toEqual(['tree_oak','tree_birch','tree_spruce','tree_acacia','tree_palm','tree_apple','tree_pear','tree_peach','tree_cherry']);
  });
  it('pays exactly the named mineral through actual loot resolution, never old mixed-node substitutions or seals', () => {
    for (const [kind, itemKind] of [['rock_basalt','basalt'],['ore_cinder','cinder_ore'],['ore_emberglass','emberglass']] as const) {
      for (const nodeClass of ['rock','mixed','pure','pristine'] as const) for (const rank of [0,3]) for (let seed = 0; seed < 20; seed++) {
        const result = resolveMiningLoot(registry.loots, { kind, nodeClass, richnessRemaining: 2, maximumRichness: 2, yieldsProduced: 0, producedOre: false }, [seed], rank, rank, rank);
        expect(result.drops).toEqual([{ itemKind, quantity: 1 }]);
        expect(result.producedOre).toBe(kind !== 'rock_basalt');
      }
    }
  });
  it('pays three ashwood only on the final hit of a full tree', () => {
    for (const health of [1,2,3]) expect(resolveResourceHitLoot(registry.loots, 'tree_ashwood', health, 3)).toEqual([]);
    for (const growth of [1,2]) expect(resolveResourceHitLoot(registry.loots, 'tree_ashwood', 0, growth)).toEqual([]);
    expect(resolveResourceHitLoot(registry.loots, 'tree_ashwood', 0, 3)).toEqual([{ itemKind: 'ashwood', quantity: 3 }]);
  });
});
