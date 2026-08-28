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
import { CROP_DEFINITIONS } from './crops.js';

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
    expect(ITEM_ECONOMY.homestead_deed.buyPriceBronze).toBe(5 * Number(BRONZE_PER_GOLD));
    expect(TOOL_MERCHANT_OFFERS).toContain('shovel');
    expect(TOOL_MERCHANT_OFFERS).toContain('hammer');
    expect(TOOL_MERCHANT_OFFERS).toContain('torch');
    expect(TOOL_MERCHANT_OFFERS).toContain('lantern');
    expect(TOOL_MERCHANT_OFFERS).toContain('workbench');
    expect(TOOL_MERCHANT_OFFERS).toContain('anvil');
    expect(ITEM_ECONOMY.anvil).toEqual({ buyPriceBronze: 500, sellPriceBronze: 200 });
    expect(commerceTotal(450, 3)).toBe(1_350n);
    expect(commerceTotal(450, 0)).toBeNull();
  });

  it('stocks every crop seed packet at Marlow', () => {
    for (const crop of CROP_DEFINITIONS) {
      expect(TOOL_MERCHANT_OFFERS).toContain(crop.seedItemKind);
      expect(ITEM_ECONOMY[crop.seedItemKind].buyPriceBronze).toBe(crop.seedBuyPriceBronze);
      expect(ITEM_ECONOMY[crop.harvestItemKind].sellPriceBronze).toBe(crop.harvestSellPriceBronze);
    }
  });

  it('06§12 prices every phases 1–3 material and placeable', () => {
    expect(ITEM_ECONOMY.fiber).toEqual({ buyPriceBronze: null, sellPriceBronze: 2 });
    expect(ITEM_ECONOMY.workbench).toEqual({ buyPriceBronze: 120, sellPriceBronze: 48 });
    expect(ITEM_ECONOMY.campfire.sellPriceBronze).toBe(18);
    expect(ITEM_ECONOMY.fence.sellPriceBronze).toBe(4);
    expect(ITEM_ECONOMY.fence_gate.sellPriceBronze).toBe(12);
    expect(ITEM_ECONOMY.sign.sellPriceBronze).toBe(10);
    expect(ITEM_ECONOMY.standing_torch.sellPriceBronze).toBe(20);
  });

  it('pays exactly twice the ore plus one wood fuel opportunity cost for bars', () => {
    expect(ITEM_ECONOMY.iron_bar.sellPriceBronze)
      .toBe(2 * (ITEM_ECONOMY.iron_ore.sellPriceBronze + ITEM_ECONOMY.wood.sellPriceBronze));
    expect(ITEM_ECONOMY.copper_bar.sellPriceBronze)
      .toBe(2 * (ITEM_ECONOMY.copper_ore.sellPriceBronze + ITEM_ECONOMY.wood.sellPriceBronze));
    expect(ITEM_ECONOMY.gold_bar.sellPriceBronze)
      .toBe(2 * (ITEM_ECONOMY.gold_ore.sellPriceBronze + ITEM_ECONOMY.wood.sellPriceBronze));
  });
});
