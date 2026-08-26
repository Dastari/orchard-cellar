import { describe, expect, it } from 'vitest';
import {
  BRONZE_PER_GOLD,
  ITEM_ECONOMY,
  TOOL_MERCHANT_OFFERS,
  bronzeFromCoinPurse,
  coinPurseFromBronze,
  commerceTotal,
  economyCatalogIsExhaustive,
} from './commerce.js';

describe('coin currency and item economy', () => {
  it('normalizes a bronze balance into gold, silver, and bronze coins', () => {
    const balance = 3n * BRONZE_PER_GOLD + 42n * 100n + 17n;
    const purse = coinPurseFromBronze(balance);
    expect(purse).toEqual({ gold: 3n, silver: 42, bronze: 17 });
    expect(bronzeFromCoinPurse(purse)).toBe(balance);
  });

  it('prices every item recognized by inventory rules', () => {
    expect(economyCatalogIsExhaustive()).toBe(true);
    for (const value of Object.values(ITEM_ECONOMY)) {
      expect(value.sellPriceBronze).toBeGreaterThan(0);
      if (value.buyPriceBronze !== null) expect(value.buyPriceBronze).toBeGreaterThan(value.sellPriceBronze);
    }
  });

  it('stocks all current tools and computes exact integer totals', () => {
    expect(TOOL_MERCHANT_OFFERS).toContain('shovel');
    expect(TOOL_MERCHANT_OFFERS).toContain('hammer');
    expect(TOOL_MERCHANT_OFFERS).toContain('torch');
    expect(TOOL_MERCHANT_OFFERS).toContain('lantern');
    expect(commerceTotal(450, 3)).toBe(1_350n);
    expect(commerceTotal(450, 0)).toBeNull();
  });
});
