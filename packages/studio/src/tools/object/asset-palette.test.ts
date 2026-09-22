import { describe, expect, it } from 'vitest';
import type { GeneratedAssetCatalog } from '@orchard/ui/studio';
import { buildAssetPalette, displayAssetPaletteItemName, filterAssetPalette } from './asset-palette.js';

const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };
const catalog: GeneratedAssetCatalog = {
  schemaVersion: 1,
  revision: 'r1',
  revisionId: 1,
  placeholderAssetId: 0,
  assetsById: { '11': 'prop_cf_camp_tent', '12': 'tile_cf_path' },
  assets: {
    prop_cf_camp_tent: {
      assetId: 11, category: 'props', anchor: [24, 95], collision: [],
      animations: {}, animationMeta: {}, variants: {}, variantMeta: {},
      states: { base: { ...frame, width: 48, height: 96 } },
      tags: ['camp.tent', 'world.landmark'],
      placement: { layer: 'object', footprint: [3, 3], blocksMovement: true, builderAvailable: false },
    },
    tile_cf_path: {
      assetId: 12, category: 'tiles', anchor: [8, 15], collision: [],
      animations: { ripple: [{ ...frame, durationTicks: 4 }, { ...frame, x: 16, durationTicks: 4 }] },
      animationMeta: { ripple: { fps: 6, loop: true } },
      variants: { base: [frame, { ...frame, x: 32 }] }, variantMeta: {}, states: {},
      tags: ['terrain.path', 'review.approved'],
      placement: { layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: true },
    },
    ui_cf_button: {
      assetId: 13, category: 'ui', anchor: [0, 0], collision: [],
      animations: {}, animationMeta: {}, variants: {}, variantMeta: {}, states: { base: frame },
      tags: ['kind.ui'],
      placement: { layer: 'ui', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    },
  },
};

describe('asset authoring palette', () => {
  it('exposes static variants individually and animations semantically', () => {
    const entries = buildAssetPalette(catalog);
    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.assetName === 'tile_cf_path').map((entry) => entry.visual))
      .toEqual([
        { kind: 'animation', name: 'ripple', frameIndex: 0 },
        { kind: 'variant', name: 'base', frameIndex: 0 },
        { kind: 'variant', name: 'base', frameIndex: 1 },
      ]);
  });

  it('searches semantic tags and filters categories without exposing UI chrome', () => {
    const entries = buildAssetPalette(catalog);
    expect(filterAssetPalette(entries, { search: 'camp landmark' }).map((entry) => entry.assetName))
      .toEqual(['prop_cf_camp_tent']);
    expect(filterAssetPalette(entries, { category: 'tiles' })).toHaveLength(3);
    expect(filterAssetPalette(entries, { builderAvailableOnly: true })).toHaveLength(3);
    expect(entries.some((entry) => entry.assetName === 'ui_cf_button')).toBe(false);
  });

  it('retains distinct semantic groups even when their preview rectangles match', () => {
    const source = catalog.assets.tile_cf_path!;
    const entries = buildAssetPalette({ ...catalog, assets: { tile_cf_path: { ...source,
      states: { dry: frame, wet: frame },
      variants: { base: [frame], curb_corner_top_left: [frame], autumn: [frame] },
    } } });
    expect(entries.map(entry => entry.visual.name)).toEqual(['ripple', 'dry', 'wet', 'autumn', 'base', 'curb_corner_top_left']);
    expect(filterAssetPalette(entries, { search: 'curb corner top left' })).toHaveLength(1);
    expect(new Set(entries.map(entry => entry.key)).size).toBe(entries.length);
    expect(new Set(entries.map(displayAssetPaletteItemName)).size).toBe(entries.length);
  });

  it('enumerates every authored mask, edge and corner instead of only a family preview', () => {
    const source = catalog.assets.tile_cf_path!;
    const entries = buildAssetPalette({ ...catalog, assets: { tile_cf_path: { ...source,
      animations: {}, animationMeta: {}, states: {},
      variants: {
        base: Array.from({ length: 47 }, (_, index) => ({ ...frame, x: index * 16 })),
        curb_corner_top_left: [{ ...frame, y: 16 }],
        edge_top: [{ ...frame, y: 32 }],
      },
      variantMeta: { base: { topology: 'blob47' } },
    } } });
    expect(entries).toHaveLength(49);
    expect(entries.filter(entry => entry.visual.name === 'base').map(entry => entry.visual.frameIndex))
      .toEqual(Array.from({ length: 47 }, (_, index) => index));
    expect(filterAssetPalette(entries, { search: 'corner' })).toHaveLength(1);
    expect(filterAssetPalette(entries, { search: 'edge top' })).toHaveLength(1);
  });
});
