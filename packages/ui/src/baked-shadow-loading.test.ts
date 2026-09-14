import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./html-image.js', () => ({ loadHtmlImage: vi.fn(async () => ({ width: 8, height: 8 })) }));
const shadow = { color: '#00000028', frames: { base: [{ width: 2, height: 2, pixelCount: 1, spans: [1, 0, 1] }] } };
const asset = {
  assetId: 1, category: 'trees', anchor: [1, 1], collision: [], tags: [],
  animations: {}, animationMeta: {}, variants: {}, variantMeta: {},
  states: { base: { x: 0, y: 0, width: 2, height: 2, durationTicks: 0 } },
  placement: { layer: 'canopy', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
};
const index = { schemaVersion: 3, revision: 'one', revisionId: 1, placeholderAssetId: 1,
  atlases: { 'trees:summer': 'atlas_trees_summer.png' }, assetsById: { '1': 'tree' }, assetCategories: { tree: 'trees' } };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('shadow metadata through the asset loader', () => {
  it.each([false, true])('loads legacy monolithic metadata with shadows=%s', async (withShadows) => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ...index,
      assets: { tree: { ...asset, ...(withShadows ? { bakedShadow: shadow } : {}) } },
    }) }));
    vi.stubGlobal('fetch', fetch);
    const { loadGeneratedAsset } = await import('./assets.js');
    const loaded = await loadGeneratedAsset('tree');
    expect(loaded.bakedShadow).toEqual(withShadows ? shadow : undefined);
    expect(loaded.anchor).toEqual(asset.anchor);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads category v2 lazily and caches it across asset requests', async () => {
    const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('atlas_trees.meta')
      ? { schemaVersion: 2, revision: 'one', category: 'trees', assets: { tree: { ...asset, bakedShadow: shadow } } } : index }));
    vi.stubGlobal('fetch', fetch);
    const { loadGeneratedAsset } = await import('./assets.js');
    const first = await loadGeneratedAsset('tree');
    const second = await loadGeneratedAsset('tree');
    expect(first.bakedShadow).toEqual(shadow);
    expect(first.bakedShadow).toBe(second.bakedShadow);
    expect(first.image).toBe(second.image);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('/generated/atlas_trees.meta.json?rev=one');
  });

  it('rejects a mismatched category and permits a corrected retry', async () => {
    let revision = 'stale';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('atlas_trees.meta')
      ? { schemaVersion: 2, revision, category: 'trees', assets: { tree: { ...asset, bakedShadow: shadow } } } : index })));
    const { loadGeneratedAsset } = await import('./assets.js');
    await expect(loadGeneratedAsset('tree')).rejects.toThrow('revision');
    revision = 'one';
    await expect(loadGeneratedAsset('tree')).resolves.toMatchObject({ bakedShadow: shadow });
  });
});
