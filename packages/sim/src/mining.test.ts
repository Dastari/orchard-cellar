import { describe, expect, it } from 'vitest';
import {
  MINING_YIELD_WORK,
  miningHitsUntilYield,
  miningNodeArtVariant,
  miningNodeRichnessLabel,
  miningPickaxeTierForItem,
  miningRequiredPickaxeTier,
  miningWorkPerHit,
  mixedNodeStoneChancePercent,
  resolveMiningYield,
} from './mining.js';

describe('repeatable mining loop', () => {
  it('takes four, three, then two hits per payout as Efficient Strikes improves', () => {
    expect([0, 1, 2].map(miningWorkPerHit)).toEqual([3, 4, 6]);
    expect([0, 1, 2].map((rank) => miningHitsUntilYield(0, rank))).toEqual([4, 3, 2]);
    expect(miningHitsUntilYield(MINING_YIELD_WORK - 1, 0)).toBe(1);
  });

  it('reduces mixed-node stone chance without making pure nodes impure', () => {
    expect([0, 1, 2, 3].map(mixedNodeStoneChancePercent)).toEqual([70, 60, 50, 40]);
    expect(resolveMiningYield({
      kind: 'ore_copper', nodeClass: 'pure', richnessRemaining: 6,
      maximumRichness: 6,
      yieldsProduced: 0, producedOre: false,
    }, [1, 2, 'pure'])).toEqual({
      drops: [{ itemKind: 'copper_ore', quantity: 1 }], producedOre: true,
    });
  });

  it('forces the final mixed payout to matching ore after only stone', () => {
    expect(resolveMiningYield({
      kind: 'ore_amethyst', nodeClass: 'mixed', richnessRemaining: 1,
      maximumRichness: 3,
      yieldsProduced: 2, producedOre: false,
    }, [9, 4, 'pity'])).toEqual({
      drops: [{ itemKind: 'amethyst_piece', quantity: 1 }], producedOre: true,
    });
  });

  it('always gives a rock pebble and only adds an ore fragment on its bonus roll', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const result = resolveMiningYield({
        kind: 'rock_large', nodeClass: 'rock', richnessRemaining: 3,
        maximumRichness: 3,
        yieldsProduced: seed, producedOre: false,
      }, [seed, 'rock']);
      expect(result.drops[0]).toEqual({ itemKind: 'pebble', quantity: 1 });
      expect(result.drops).toHaveLength(result.producedOre ? 2 : 1);
    }
  });

  it('gives Mother Lode one fragment on the first payout of a rich pure vein', () => {
    expect(resolveMiningYield({
      kind: 'ore_gold', nodeClass: 'pure', richnessRemaining: 6,
      maximumRichness: 6, yieldsProduced: 0, producedOre: false,
    }, ['mother-lode'], 0, 0, 1).drops).toEqual([
      { itemKind: 'gold_ore', quantity: 1 },
      { itemKind: 'gold_piece', quantity: 1 },
    ]);
  });

  it('maps richness bands to readable labels and shrinking pure art', () => {
    expect([1, 2, 3, 4, 5, 6].map(miningNodeRichnessLabel))
      .toEqual(['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'RICH', 'RICH']);
    expect([6, 4, 2].map((value) => miningNodeArtVariant('pure', value)))
      .toEqual(['pure_large', 'pure_medium', 'pure_small']);
    expect(miningNodeArtVariant('pristine', 1)).toBe('pristine');
  });

  it('keeps surface progression open while reserving deep gems for later pickaxes', () => {
    expect(miningPickaxeTierForItem('pickaxe')).toBe(3);
    expect(miningRequiredPickaxeTier('ore_emerald', 'pristine')).toBe(1);
    expect(miningRequiredPickaxeTier('ore_copper', 'pure')).toBe(1);
    expect(miningRequiredPickaxeTier('ore_gold', 'pure')).toBe(2);
    expect(miningRequiredPickaxeTier('ore_ruby', 'pure')).toBe(3);
  });
});
