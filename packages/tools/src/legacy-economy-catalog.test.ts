import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGACY_ECONOMY_CATALOG as catalog } from './legacy-economy-catalog.js';

describe('legacy pace-simulator authoring catalog', () => {
  it('preserves every canonical id, cost, rate and authored scalar', () => {
    expect(catalog.trees.map(({ id }) => id)).toEqual([
      'seedlingApple', 'orchardApple', 'pear', 'quince', 'plum', 'fig', 'cherry',
      'heritageGrafts', 'frostMedlar', 'valeMedlar',
    ]);
    expect(catalog.trees.map(({ saplingCost }) => saplingCost)).toEqual([
      15, 120, 900, 6_500, 48_000, 360_000, 2_800_000, 22_000_000, 170_000_000, 1_300_000_000,
    ]);
    expect(catalog.presses.map(({ cost }) => cost)).toEqual([25, 180, 1_400, 12_000, 100_000]);
    expect(catalog.casks.map(({ ratePerSecond }) => ratePerSecond)).toEqual([0.2, 1.2, 7, 40, 240]);
    expect(catalog.upgrades).toHaveLength(11);
    expect(catalog.plotClearings.map(({ plots }) => plots)).toEqual([15, 30, 60, 90, 120]);
    expect(catalog.orchardPlots).toHaveLength(120);
    expect(catalog).toMatchObject({ treeCostGrowth: 1.18, pressCostGrowth: 1.35,
      caskCostGrowth: 1.35, offlineCapSeconds: 28_800, offlineEfficiency: 0.6, offlineChunks: 60 });
  });

  it('keeps authored catalogs and canonical ids out of the simulation runtime', () => {
    const sim = (file: string): string => readFileSync(new URL(`../../sim/src/${file}`, import.meta.url), 'utf8');
    const balance = sim('balance.ts');
    for (const retired of ['TREE_BALANCE', 'PRESS_BALANCE', 'CASK_BALANCE', 'WORKBENCH_UPGRADES',
      'PLOT_CLEARINGS', 'TOOL_VIGOUR_BALANCE', 'TOOL_DURABILITY_BALANCE']) {
      expect(balance).not.toContain(retired);
    }
    const runtime = [sim('economy.ts'), sim('economy-state.ts'), sim('offline.ts'),
      sim('prestige.ts'), sim('state.ts'), sim('tick.ts')].join('\n');
    for (const canonicalId of ['seedlingApple', 'pruningShears', 'irrigation', 'beeBoost',
      'copperPipe', 'corkBench']) expect(runtime).not.toContain(canonicalId);
  });
});
