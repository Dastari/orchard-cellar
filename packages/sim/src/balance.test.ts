import { describe, expect, it } from 'vitest';
import {
  AUTUMN_CHAIN_CAP,
  AUTUMN_CHAIN_STEP,
  AUTUMN_CHAIN_WINDOW_SECONDS,
  AUTUMN_VIGOUR_MULTIPLIER,
  BOTTLE_VALUE,
  CARE_MULTIPLIERS,
  CASK_BALANCE,
  CASK_COST_GROWTH,
  CELLAR_DIG_COSTS,
  FEATURED_SEASON_MULTIPLIER,
  FIRST_PRESS_REPAIR_FRUIT,
  OFFLINE_CAP_SECONDS,
  OFFLINE_CHUNKS,
  OFFLINE_EFFICIENCY,
  OFF_SEASON_MULTIPLIER,
  POMACE_YIELD,
  MULCH_POMACE_COST,
  PLOT_CLEARINGS,
  PRESS_BALANCE,
  PRESS_COST_GROWTH,
  PRESS_MUST_YIELD,
  SPRING_GROWTH_MULTIPLIER,
  TREE_BALANCE,
  TREE_BUFFER_SECONDS,
  TREE_COST_GROWTH,
  VIGOUR_BURST_POWER,
  VIGOUR_CHARGE_PER_SECOND,
  VIGOUR_PARTIAL_SECONDS,
  WINTER_AGING_MULTIPLIER,
  WORKBENCH_UPGRADES,
  YARD_MUST_CAPACITY,
  YOUNG_PRODUCTION_MULTIPLIER,
  equipmentMilestoneMultiplier,
  lineageSeeds,
  repeatCost,
  successionHeirlooms,
  treeMilestoneMultiplier,
  vintageTerroir,
} from './balance.js';

describe('06 golden balance tables', () => {
  it('06§2 tree table and growth rules', () => {
    expect(TREE_BALANCE.map(({ saplingCost }) => saplingCost)).toEqual([15, 120, 900, 6_500, 48_000, 360_000, 2_800_000, 22_000_000, 170_000_000, 1_300_000_000]);
    expect(TREE_BALANCE.map(({ fruitPerSecond }) => fruitPerSecond)).toEqual([0.1, 0.6, 3.2, 15, 70, 330, 1_600, 7_500, 36_000, 170_000]);
    expect(TREE_COST_GROWTH).toBe(1.18);
    expect(repeatCost(120, 1, TREE_COST_GROWTH)).toBe(142);
    expect(TREE_BUFFER_SECONDS).toBe(14_400);
    expect(YOUNG_PRODUCTION_MULTIPLIER).toBe(0.25);
    expect(SPRING_GROWTH_MULTIPLIER).toBe(2);
    expect(FEATURED_SEASON_MULTIPLIER).toBe(1.6);
    expect(OFF_SEASON_MULTIPLIER).toBe(0.85);
    expect([4, 5, 10, 15, 25].map(treeMilestoneMultiplier)).toEqual([1, 2, 4, 8, 24]);
  });

  it('06§2 press table, yields, and milestones', () => {
    expect(PRESS_BALANCE.map(({ cost }) => cost)).toEqual([25, 180, 1_400, 12_000, 100_000]);
    expect(PRESS_BALANCE.map(({ ratePerSecond }) => ratePerSecond)).toEqual([0.5, 3, 18, 120, 900]);
    expect(PRESS_BALANCE.map(({ pads }) => pads)).toEqual([1, 1, 1, 1, 2]);
    expect(FIRST_PRESS_REPAIR_FRUIT).toBe(50);
    expect(PRESS_COST_GROWTH).toBe(1.35);
    expect(PRESS_MUST_YIELD).toBe(0.5);
    expect(POMACE_YIELD).toBe(0.15);
    expect(YARD_MUST_CAPACITY).toBe(100);
    expect([2, 3, 6, 10].map(equipmentMilestoneMultiplier)).toEqual([1, 2, 4, 12]);
  });

  it('06§2 cask table, bottle value, and digs', () => {
    expect(CASK_BALANCE.map(({ cost }) => cost)).toEqual([40, 300, 2_400, 20_000, 170_000]);
    expect(CASK_BALANCE.map(({ ratePerSecond }) => ratePerSecond)).toEqual([0.2, 1.2, 7, 40, 240]);
    expect(CASK_COST_GROWTH).toBe(1.35);
    expect(BOTTLE_VALUE).toBe(0.1);
    expect(CELLAR_DIG_COSTS).toEqual([0, 500, 25_000]);
  });

  it('06§3 Care, Vigour, and seasonal mechanics', () => {
    expect(CARE_MULTIPLIERS).toEqual([1, 1.25, 1.5, 2]);
    expect(VIGOUR_CHARGE_PER_SECOND).toBe(0.04);
    expect(AUTUMN_VIGOUR_MULTIPLIER).toBe(4);
    expect(VIGOUR_PARTIAL_SECONDS).toEqual([2, 5, 9, 15]);
    expect(VIGOUR_BURST_POWER).toBe(2);
    expect(AUTUMN_CHAIN_WINDOW_SECONDS).toBe(8);
    expect(AUTUMN_CHAIN_STEP).toBe(0.1);
    expect(AUTUMN_CHAIN_CAP).toBe(2);
    expect(WINTER_AGING_MULTIPLIER).toBe(1.6);
  });

  it('06§2 workbench, yard, cellar, mulch, and plot upgrades', () => {
    expect(WORKBENCH_UPGRADES.map(({ cost }) => cost)).toEqual([75, 450, 3_000, 20_000, 140_000, 75, 500, 4_000, 250, 1_800, 13_000]);
    expect(WORKBENCH_UPGRADES.slice(0, 5).map(({ currency }) => currency)).toEqual(['fruit', 'fruit', 'fruit', 'fruit', 'fruit']);
    expect(WORKBENCH_UPGRADES.slice(5, 8).map(({ currency }) => currency)).toEqual(['pomace', 'pomace', 'pomace']);
    expect(WORKBENCH_UPGRADES.slice(8).map(({ effect }) => effect)).toEqual([0.15, 0.25, 0.4]);
    expect(PLOT_CLEARINGS).toEqual([
      { plots: 15, fruitCost: 0 }, { plots: 30, fruitCost: 2_000 }, { plots: 60, fruitCost: 16_000 },
      { plots: 90, fruitCost: 130_000 }, { plots: 120, fruitCost: 1_000_000 },
    ]);
    expect(MULCH_POMACE_COST).toBe(5);
  });

  it('06§4 prestige formulas quote the table', () => {
    expect(vintageTerroir(99)).toBe(0);
    expect(vintageTerroir(250)).toBe(9);
    expect(successionHeirlooms(500, 0)).toBe(1);
    expect(successionHeirlooms(2_000, 1)).toBe(1);
    expect(lineageSeeds(20, 0)).toBe(1);
    expect(lineageSeeds(80, 1)).toBe(1);
  });

  it('06§8 offline defaults', () => {
    expect(OFFLINE_CAP_SECONDS).toBe(28_800);
    expect(OFFLINE_EFFICIENCY).toBe(0.6);
    expect(OFFLINE_CHUNKS).toBe(60);
  });
});
