import { describe, expect, it } from 'vitest';
import { resolveGeneratedAssetName, type BuiltAtlasManifest } from './assets.js';

const manifest = {
  schemaVersion: 2,
  revision: 'test',
  revisionId: 1,
  placeholderAssetId: 0,
  atlases: {},
  assets: {},
  assetsById: { '0': 'system_missing_asset', '42': 'tile_cf_grass' },
} satisfies BuiltAtlasManifest;

describe('resolveGeneratedAssetName', () => {
  it('resolves known ids', () => {
    expect(resolveGeneratedAssetName(manifest, 42)).toBe('tile_cf_grass');
  });

  it('uses the visible placeholder for unknown/newer ids', () => {
    expect(resolveGeneratedAssetName(manifest, 999_999)).toBe('system_missing_asset');
  });
});
