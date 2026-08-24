import { describe, expect, it } from 'vitest';
import { stableAssetId } from './asset-id.js';

describe('stableAssetId', () => {
  it('is deterministic, non-zero, and sensitive to the semantic key', () => {
    expect(stableAssetId('tile_cf_grass')).toBe(stableAssetId('tile_cf_grass'));
    expect(stableAssetId('tile_cf_grass')).not.toBe(0);
    expect(stableAssetId('tile_cf_grass')).not.toBe(stableAssetId('tile_cf_path'));
  });
});
