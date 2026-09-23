import { beforeEach, describe, expect, it, vi } from 'vitest';

const hash = 'a'.repeat(64);
const image = { naturalWidth: 16, naturalHeight: 16 };
const record = { assetId: 1, category: 'trees', pageId: 'trees:trees-oak:p000', anchor: [8, 15], collision: [], animations: {}, animationMeta: {}, variants: {}, variantMeta: {}, states: { base: { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 } }, tags: [], placement: { layer: 'canopy', footprint: [1, 1], blocksMovement: false, builderAvailable: false }, markerLayers: {} };
const pack = { schemaVersion: 1, packId: 'trees-oak', assets: { oak: record }, pages: { [record.pageId]: { width: 16, height: 16, decodedBytes: 1024 } }, atlases: { [`${record.pageId}:summer`]: `atlas-${hash}.png` }, omitAtlases: {} };
const index = { schemaVersion: 5, revision: 'release', revisionId: 10, placeholderAssetId: 0, assetsById: { 0: 'missing', 1: 'oak' }, assetPacks: { oak: 'trees-oak', missing: 'ui', unrelated: 'npc-bob' }, packs: { 'trees-oak': `pack-${hash}.json`, 'npc-bob': `pack-${'b'.repeat(64)}.json` } };
vi.mock('./asset-request-queue.js', () => ({ assetRequestQueue: { run: (fn: () => unknown) => fn() } }));
vi.mock('./html-image.js', () => ({ loadHtmlImage: vi.fn(async () => image) }));

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); vi.stubGlobal('location', { search: '?atlasPacks=1' }); });

describe('immutable pack loader', () => {
  it('keeps consolidated delivery as the default without fetching a pack index', async () => {
    vi.stubGlobal('location', { search: '' });
    const legacy = { ...index, schemaVersion: 4, assetPacks: undefined, packs: undefined,
      assets: { oak: record }, atlases: pack.atlases, pages: pack.pages };
    const fetch = vi.fn(async () => new Response(JSON.stringify(legacy)));
    vi.stubGlobal('fetch', fetch);
    const { loadGeneratedAsset } = await import('./assets.js');
    expect((await loadGeneratedAsset('oak')).name).toBe('oak');
    expect(fetch.mock.calls).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith('/generated/atlas.meta.json');
  });

  it('loads only the requested pack, deduplicates requests and omits release query strings', async () => {
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('atlas.packs.json') ? index : pack)));
    vi.stubGlobal('fetch', fetch);
    const { loadGeneratedAsset, atlasPackIdsForAssets, loadAtlasPacks } = await import('./assets.js');
    const [a, b] = await Promise.all([loadGeneratedAsset('oak'), loadGeneratedAsset('oak')]);
    expect(a.metadata.states?.base).toEqual(record.states.base);
    expect(b.image).toBe(a.image);
    expect(await atlasPackIdsForAssets(['oak', 'oak'])).toEqual(['trees-oak']);
    await loadAtlasPacks(['trees-oak']);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/generated/atlas.packs.json', `/generated/pack-${hash}.json`]);
    const { loadHtmlImage } = await import('./html-image.js');
    expect(loadHtmlImage).toHaveBeenCalledWith(`/generated/atlas-${hash}.png`, expect.any(String));
  });
  it('retries failed pack requests, and rejects wrong identity without silently caching it', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('atlas.packs.json')) return new Response(JSON.stringify(index));
      attempts++;
      return new Response(JSON.stringify(attempts === 1 ? { ...pack, packId: 'npc-bob' } : pack));
    }));
    const { loadAtlasPacks } = await import('./assets.js');
    await expect(loadAtlasPacks(['trees-oak'])).rejects.toThrow('Invalid atlas pack');
    await expect(loadAtlasPacks(['trees-oak'])).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    await expect(loadAtlasPacks(['unknown'])).rejects.toThrow('Unknown atlas pack');
  });
  it('keeps complete catalog loading an explicit authoring operation', async () => {
    const onlyOak = { ...index, assetPacks: { oak: 'trees-oak' }, packs: { 'trees-oak': `pack-${hash}.json` } };
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('atlas.packs.json') ? onlyOak : pack)));
    vi.stubGlobal('fetch', fetch);
    const { loadGeneratedAssetCatalog } = await import('./assets.js');
    expect((await loadGeneratedAssetCatalog()).assets.oak).toEqual(record);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
