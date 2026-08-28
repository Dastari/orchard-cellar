import { describe, expect, it } from 'vitest';
import type { GeneratedAssetCatalog } from '../render/assets.js';
import { buildAssetPalette, filterAssetPalette } from './asset-palette.js';

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
});
