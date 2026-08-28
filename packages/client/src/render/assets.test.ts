import { describe, expect, it } from 'vitest';
import { atlasImageUrl, resolveGeneratedAssetName, resolveGeneratedAssetRequestName, type BuiltAtlasManifest } from './assets.js';

const manifest = {
  schemaVersion: 3,
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

  it('uses the visible placeholder for missing named assets instead of aborting bootstrap', () => {
    const namedManifest = {
      ...manifest,
      assets: { system_missing_asset: {}, tile_cf_grass: {} },
    } as unknown as BuiltAtlasManifest;
    expect(resolveGeneratedAssetRequestName(namedManifest, 'tile_cf_grass')).toBe('tile_cf_grass');
    expect(resolveGeneratedAssetRequestName(namedManifest, 'tile_from_newer_client')).toBe('system_missing_asset');
  });

  it('resolves names from the split runtime category index', () => {
    const splitManifest = {
      ...manifest,
      assets: undefined,
      assetCategories: { system_missing_asset: 'ui', tile_cf_grass: 'tiles' },
    } satisfies BuiltAtlasManifest;
    expect(resolveGeneratedAssetRequestName(splitManifest, 'tile_cf_grass')).toBe('tile_cf_grass');
    expect(resolveGeneratedAssetRequestName(splitManifest, 'unknown_asset')).toBe('system_missing_asset');
  });

  it('cache-busts stable atlas filenames with the content revision', () => {
    expect(atlasImageUrl('atlas_ui_summer.png', 'a/b c')).toBe('/generated/atlas_ui_summer.png?rev=a%2Fb%20c');
  });
});
