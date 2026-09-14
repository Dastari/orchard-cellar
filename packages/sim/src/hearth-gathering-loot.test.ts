import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { resolveMiningLoot, resolveMiningRockBonus, resolveResourceHitLoot } from './behaviour/handlers/loot.js';
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
  it('preserves the named primary mineral without mixed-node substitutions or seals', () => {
    for (const [kind, itemKind] of [['rock_basalt','basalt'],['ore_cinder','cinder_ore'],['ore_emberglass','emberglass']] as const) {
      for (const nodeClass of ['rock','mixed','pure','pristine'] as const) for (const rank of [0,3]) for (let seed = 0; seed < 20; seed++) {
        const result = resolveMiningLoot(registry.loots, { kind, nodeClass, richnessRemaining: 2, maximumRichness: 2, yieldsProduced: 0, producedOre: false }, [seed], rank, rank, rank);
        expect(result.drops[0]).toEqual({ itemKind, quantity: 1 });
        if (kind !== 'rock_basalt') expect(result.drops).toHaveLength(1);
        else expect(result.drops.slice(1)).toEqual(resolveMiningRockBonus(registry.loots, [seed], rank));
        expect(result.producedOre).toBe(kind !== 'rock_basalt' || result.drops.length > 1);
      }
    }
  });
  it('adds Mother Lode only to the first payout of rich pure cinder and emberglass veins', () => {
    for (const [kind, itemKind] of [['ore_cinder', 'cinder_ore'], ['ore_emberglass', 'emberglass']]) {
      for (const nodeClass of ['rock', 'mixed', 'pure', 'pristine'] as const) {
        for (const maximumRichness of [4, 5, 6]) for (const yieldsProduced of [0, 1]) for (const rank of [0, 1]) {
          const result = resolveMiningLoot(registry.loots, { kind: kind!, nodeClass, maximumRichness,
            richnessRemaining: maximumRichness - yieldsProduced, yieldsProduced, producedOre: false }, [17], 3, 2, rank);
          const bonus = nodeClass === 'pure' && maximumRichness >= 5 && yieldsProduced === 0 && rank === 1;
          expect(result.drops).toEqual(Array.from({ length: bonus ? 2 : 1 }, () => ({ itemKind, quantity: 1 })));
        }
      }
    }
  });

  it('shares the same monotonic Rockhound roll across ordinary rock, basalt and walls', () => {
    const bonuses = [0, 0, 0];
    for (let seed = 0; seed < 2000; seed++) {
      let previous = 0;
      for (const rank of [0, 1, 2]) {
        const wall = resolveMiningRockBonus(registry.loots, [seed], rank);
        for (const kind of ['rock_large', 'rock_basalt']) {
          const rock = resolveMiningLoot(registry.loots, { kind, nodeClass: 'rock', maximumRichness: 6,
            richnessRemaining: 6, yieldsProduced: 0, producedOre: false }, [seed], 0, rank);
          expect(rock.drops.slice(1)).toEqual(wall);
        }
        expect(wall.length).toBeGreaterThanOrEqual(previous);
        previous = wall.length;
        bonuses[rank]! += wall.length;
      }
    }
    expect(bonuses[0]).toBeGreaterThan(0);
    expect(bonuses[1]).toBeGreaterThan(bonuses[0]!);
    expect(bonuses[2]).toBeGreaterThan(bonuses[1]!);
  });
  it('pays three ashwood only on the final hit of a full tree', () => {
    for (const health of [1,2,3]) expect(resolveResourceHitLoot(registry.loots, 'tree_ashwood', health, 3)).toEqual([]);
    for (const growth of [1,2]) expect(resolveResourceHitLoot(registry.loots, 'tree_ashwood', 0, growth)).toEqual([]);
    expect(resolveResourceHitLoot(registry.loots, 'tree_ashwood', 0, 3)).toEqual([{ itemKind: 'ashwood', quantity: 3 }]);
  });
});
