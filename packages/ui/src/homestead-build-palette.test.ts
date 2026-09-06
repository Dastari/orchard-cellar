import { bootstrapContentRegistry, homesteadBuildDefinitions } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  HomesteadBuildPalette,
  homesteadBuildPaletteBounds,
  homesteadBuildPaletteCells,
  homesteadUpgradePaletteCells,
} from './homestead-build-palette.js';

describe('homestead build palette layout', () => {
  it('accepts renamed model entries and removes a stale selection after content changes', () => {
    const palette = new HomesteadBuildPalette({} as never, {} as never, {});
    const model = { width: 640, height: 480, counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 0n,
      entries: [{ itemKind: 'moon_shelter', displayName: 'Moon Shelter', layer: 'prefab' as const, iconAnimation: 'moon' }] };
    palette.setModel(model);
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'moon_shelter' });
    palette.setModel({ ...model, entries: [] });
    expect(palette.selection).toEqual({ kind: 'remove' });
    palette.setModel({ ...model, entries: [{ ...model.entries[0]!, itemKind: 'solar_station' }] });
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'solar_station' });
  });

  it('keeps every buildable plus removal inside its panel', () => {
    const registry = bootstrapContentRegistry();
    const model = { width: 640, entries: [...homesteadBuildDefinitions(registry).values()]
      .map((entry) => ({ ...entry, iconAnimation: 'base' })), upgrades: Object.values(registry.compiled.upgrades) };
    const bounds = homesteadBuildPaletteBounds(model);
    const cells = homesteadBuildPaletteCells(bounds, model.entries.length);
    expect(cells).toHaveLength(model.entries.length + 1);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x);
      expect(cell.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    for (const cell of homesteadUpgradePaletteCells(bounds, model)) {
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x);
      expect(cell.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });
});
