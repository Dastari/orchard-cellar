import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { chunkDecorationAssetIds, chunkResourceAssetIds, chunkTerrainAssetIds } from './world-chunk-assets.js';

describe('offline chunk asset dependency resolution', () => {
  const registry = bootstrapContentRegistry();
  it('uses loader variants rather than treating semantic aliases as atlas names', () => {
    expect(chunkDecorationAssetIds('nature_flower', 8, registry)).toEqual(['nature_cf_flower_04']);
    expect(chunkDecorationAssetIds('farm_cow', 11, registry)).toEqual(['wildlife_cf_cow_03']);
    expect(chunkDecorationAssetIds('farm_fence', 0, registry)).toEqual(['prop_cf_willow_boundary_wood_large_connected']);
    expect(chunkDecorationAssetIds('fisher_fixed_line', 0, registry)).toEqual(['prop_cf_camp_fishing_rod']);
    expect(() => chunkDecorationAssetIds('unknown', 0, registry)).toThrow(/Unmapped/u);
  });
  it('covers all bootstrap resource visuals and state aliases', () => {
    for (const resource of registry.resources.values()) {
      const assets = chunkResourceAssetIds(resource.visual);
      expect(assets.length, resource.id).toBeGreaterThan(0);
      expect(assets.every(asset => !/^ore_|^tree_oak$|^nature_/u.test(asset) || asset.startsWith('nature_cf_')), resource.id).toBe(true);
    }
    const ore = [...registry.resources.values()].find(resource => resource.runtimeKind === 'ore_gold')!;
    expect(chunkResourceAssetIds(ore.visual)).toContain('resource_cf_ore_gold');
    expect(chunkResourceAssetIds(ore.visual)).toContain('resource_cf_ore_gold_pristine');
    expect(chunkTerrainAssetIds()).toContain('tile_cf_freshwater_inset');
  });
});
