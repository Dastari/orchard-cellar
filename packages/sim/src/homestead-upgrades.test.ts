import { describe, expect, it } from 'vitest';
import {
  barrelCellarBatchCapacity,
  barrelCellarCureTicks,
  homesteadUpgradeCostBronze,
  richSoilGrowthTicks,
  selectiveSeedHarvestQuantity,
  sprinklerCoversTile,
  estateVintageTier,
} from './homestead-upgrades.js';

describe('homestead upgrades', () => {
  it('uses readable three-step gold ladders', () => {
    expect([0, 1, 2].map((rank) => homesteadUpgradeCostBronze('rich_soil', rank)))
      .toEqual([20_000n, 60_000n, 180_000n]);
  });

  it('reduces crop and barrel durations without mutating stored progress', () => {
    expect(richSoilGrowthTicks(1_000n, 2)).toBe(833n);
    expect(barrelCellarCureTicks(1_000n, 2)).toBe(833n);
  });

  it('makes selective-seed yield deterministic and increases barrel capacity', () => {
    expect(Array.from({ length: 10 }, (_, roll) => selectiveSeedHarvestQuantity(3, 1, roll)))
      .toEqual([4, 4, 4, 3, 3, 3, 3, 3, 3, 3]);
    expect(barrelCellarBatchCapacity(24, 3)).toBe(48);
  });

  it('uses a compact square sprinkler footprint with stable boundaries', () => {
    expect(sprinklerCoversTile(10, 10, 12, 8)).toBe(true);
    expect(sprinklerCoversTile(10, 10, 13, 10)).toBe(false);
  });

  it('trades longer aging for a stronger estate-vintage premium', () => {
    expect(estateVintageTier(0, 600n, 120)).toMatchObject({ label: 'Estate', agingTicks: 600n, sellPriceBronze: 120 });
    expect(estateVintageTier(3, 600n, 120)).toMatchObject({ label: 'Grand Vintage', agingTicks: 1_800n, sellPriceBronze: 960 });
  });
});
