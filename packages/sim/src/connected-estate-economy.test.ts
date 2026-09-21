import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { hearthResidenceExpansionQuote } from './hearth-residence-expansion.js';
import { estateVintageTier } from './homestead-upgrades.js';

describe('live estate economy: doc 06 housing amendment', () => {
  it('preserves bottle income while making expansions substantial goals', () => {
    const registry = bootstrapContentRegistry();
    const bottle = registry.items.get('item:bottles')!;
    expect(bottle.economy.sell).toBe(5000);
    expect([0, 1, 2, 3].map(rank => estateVintageTier(rank, 36000n, bottle.economy.sell).sellPriceBronze))
      .toEqual([5000, 10000, 20000, 40000]);
    expect(hearthResidenceExpansionQuote(0)).toEqual({rank: 1, name: 'East room', costBronze: 60000n});
    expect(hearthResidenceExpansionQuote(1)).toEqual({rank: 2, name: 'South room', costBronze: 180000n});
    expect(hearthResidenceExpansionQuote(0)!.costBronze + hearthResidenceExpansionQuote(1)!.costBronze).toBe(240000n);
    expect(hearthResidenceExpansionQuote(2)).toBeNull();
    const quest = registry.quests.get('quest:marlow_first_bottle')!;
    expect(quest.rewards.bronze).toBe(50000);
    expect(BigInt(quest.rewards.bronze + bottle.economy.sell)).toBeLessThan(hearthResidenceExpansionQuote(0)!.costBronze);
    expect(BigInt(quest.rewards.bronze + 2 * bottle.economy.sell)).toBe(hearthResidenceExpansionQuote(0)!.costBronze);
  });
});
