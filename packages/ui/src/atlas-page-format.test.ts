import { describe, expect, it } from 'vitest';
import { assertAtlasSchema, atlasPageKey, assertAtlasPageImage, parseCompactAssetRegistry } from './atlas-page-format.js';
import { parseAtlasCategoryManifest } from './assets.js';

describe('bounded-page migration readers', () => {
  it('reads old category/season keys and new asset page identities without mixing them', () => {
    expect(atlasPageKey({ category: 'characters' }, 'summer')).toBe('characters:summer');
    expect(atlasPageKey({ category: 'characters', pageId: 'characters:p029' }, 'winter')).toBe('characters:p029:winter');
    expect(() => atlasPageKey({ category: 'characters', pageId: 'ui:p000' }, 'summer')).toThrow('identity');
    expect(() => atlasPageKey({ category: 'characters', pageId: 'characters:p../x' }, 'summer')).toThrow('identity');
  });
  it('retains legacy index/category/marker/registry versions before writers change', () => {
    for (const [kind, maximum] of [['index', 4], ['category', 3], ['markers', 2], ['registry', 4]] as const) {
      for (let version = 1; version <= maximum; version++) expect(() => assertAtlasSchema(kind, version)).not.toThrow();
      for (const version of [0, maximum + 1, 1.5, '1', null]) expect(() => assertAtlasSchema(kind, version)).toThrow();
    }
    for (const schemaVersion of [1, 2, 3, 4]) {
      const registry = { schemaVersion, revision: 'rev', assets: [{ assetId: 42, name: 'avatar', category: 'characters', ...(schemaVersion === 4 ? { pageId: 'characters:p000' } : {}) }] };
      expect(parseCompactAssetRegistry(JSON.parse(JSON.stringify(registry)))).toEqual(registry);
    }
  });
  it('requires and exposes the registry v4 page identity', () => {
    const asset = { assetId: 42, name: 'avatar', category: 'characters' };
    const registry = { schemaVersion: 4, revision: 'rev', assets: [asset] };
    expect(() => parseCompactAssetRegistry(registry)).toThrow('page identity');
    expect(() => parseCompactAssetRegistry({ ...registry, assets: [{ ...asset, pageId: 'ui:p000' }] })).toThrow('identity');
    expect(parseCompactAssetRegistry({ ...registry, assets: [{ ...asset, pageId: 'characters:p000' }] }).assets[0]?.pageId)
      .toBe('characters:p000');
  });
  it('requires page identity only on new category records and retains all old record fields', () => {
    const legacy = { schemaVersion: 2, revision: 'rev', category: 'characters', assets: { avatar: { category: 'characters', animations: { walk: [{ x: 4, y: 8, width: 16, height: 32 }] } } } };
    expect(parseAtlasCategoryManifest(legacy, 'characters', 'rev')).toEqual(legacy);
    expect(() => parseAtlasCategoryManifest({ ...legacy, schemaVersion: 3 }, 'characters', 'rev')).toThrow('missing atlas page');
    const paged = { ...legacy, schemaVersion: 3, assets: { avatar: { ...legacy.assets.avatar, pageId: 'characters:p000' } } };
    expect(parseAtlasCategoryManifest(JSON.parse(JSON.stringify(paged)), 'characters', 'rev')).toEqual(paged);
  });
  it('rejects decoded pages beyond either bound before publishing LoadedAsset', () => {
    expect(() => assertAtlasPageImage({ naturalWidth: 512, naturalHeight: 2048 })).not.toThrow();
    for (const [naturalWidth, naturalHeight] of [[513, 100], [512, 2049], [0, 16], [512, 52032]]) {
      expect(() => assertAtlasPageImage({ naturalWidth: naturalWidth!, naturalHeight: naturalHeight! })).toThrow('4 MiB');
    }
  });
});
