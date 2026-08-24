import { describe, expect, it } from 'vitest';
import { ASSET_REGISTRY_SCHEMA_VERSION, compactRegistryAsset } from '../build-atlas.js';

const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };

describe('compact asset registry v2', () => {
  it('versions and separates animations, variants, and states', () => {
    expect(ASSET_REGISTRY_SCHEMA_VERSION).toBe(2);
    expect(compactRegistryAsset('tile_test', {
      assetId: 7,
      category: 'tiles',
      tags: [],
      placement: { builderAvailable: false },
      animations: { shimmer: [{ ...frame, durationTicks: 10 }] },
      animationMeta: { shimmer: { fps: 6, loop: false } },
      variants: { base: [frame, frame] },
      variantMeta: { base: { topology: 'blob47' } },
      states: { depleted: frame },
    })).toMatchObject({
      animations: { shimmer: { frameCount: 1, fps: 6, loop: false } },
      variants: { base: { frameCount: 2, topology: 'blob47' } },
      states: ['depleted'],
      placement: { builderAvailable: false },
    });
  });
});
