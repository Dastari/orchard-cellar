import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';

const packListeners: ((ids: readonly string[]) => void)[] = [];
const assetPacks: Record<string, string> = { tree_cf_oak_mature: 'trees-oak', prop_cf_chest: 'props-chest' };
vi.mock('@orchard/ui', () => ({
  loadGeneratedAsset: vi.fn(),
  onAtlasPacksLoaded: (listener: (ids: readonly string[]) => void) => { packListeners.push(listener); return () => undefined; },
  atlasPackIdForAsset: (name: string) => assetPacks[name],
}));

function asset(name: string): LoadedAsset {
  return { name, assetId: 1, image: {} as CanvasImageSource, anchor: [0, 0], collision: [], tags: [],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false }, atlasRevision: 1,
    metadata: { image: 'x', animations: {}, variants: {}, states: {} } };
}

beforeEach(() => { vi.resetModules(); packListeners.length = 0; });

describe('lazy art (static world S6)', () => {
  it('reads as a transparent stand-in that answers every frame lookup, then as the sprite', async () => {
    const lazy = await import('./lazy-art.js');
    const requested: string[] = [];
    let resolve!: (value: LoadedAsset) => void;
    lazy.setLazyArtLoaderForTests(name => { requested.push(name); return new Promise(done => { resolve = done; }); });
    const art: { treeOak?: LoadedAsset } = {};
    lazy.defineLazyAsset(art, 'treeOak', 'tree_cf_oak_mature');
    expect(requested).toEqual([]); // nothing loads before it is needed
    const standIn = art.treeOak!;
    expect(lazy.isLoadingArt(standIn)).toBe(true);
    expect(standIn.metadata.animations['walk_down']).toHaveLength(1);
    expect(standIn.metadata.variants?.['v7']?.[0]).toMatchObject({ width: 1, height: 1 });
    expect(standIn.metadata.states?.['base']).toMatchObject({ width: 1, height: 1 });
    expect('anything' in standIn.metadata.animations).toBe(true);
    const reads = lazy.lazyArtStandInReads(), generation = lazy.lazyArtReadyGeneration();
    void art.treeOak;
    expect(requested).toEqual(['tree_cf_oak_mature']); // one request however often it is read
    expect(lazy.lazyArtStandInReads()).toBe(reads + 1);
    resolve(asset('tree_cf_oak_mature'));
    await vi.waitFor(() => expect(art.treeOak!.name).toBe('tree_cf_oak_mature'));
    expect(lazy.lazyArtReadyGeneration()).toBe(generation + 1);
    expect(lazy.pendingLazyArtCount()).toBe(0);
  });

  it('shares one slot per asset across aliases, lists and records', async () => {
    const lazy = await import('./lazy-art.js');
    const requested: string[] = [];
    lazy.setLazyArtLoaderForTests(async name => { requested.push(name); return asset(name); });
    const record = lazy.lazyAssetRecord({ tile_cf_cave_wall: 'tile_cf_cave_wall', caveWall: 'tile_cf_cave_wall' });
    const list = lazy.lazyAssetList(['nature_cf_rock_01', 'nature_cf_rock_02']);
    expect(Object.keys(record)).toEqual(['tile_cf_cave_wall', 'caveWall']);
    expect(list).toHaveLength(2);
    void record['tile_cf_cave_wall']; void record['caveWall']; void list[1];
    await vi.waitFor(() => expect(record['caveWall']!.name).toBe('tile_cf_cave_wall'));
    expect(record['caveWall']).toBe(record['tile_cf_cave_wall']);
    expect(requested).toEqual(['tile_cf_cave_wall', 'nature_cf_rock_02']);
    expect(lazy.isLoadingArt(list[0])).toBe(true);
  });

  it('warms the assets of a pack the chunk runtime prefetched, before anything draws them', async () => {
    const lazy = await import('./lazy-art.js');
    const requested: string[] = [];
    lazy.setLazyArtLoaderForTests(async name => { requested.push(name); return asset(name); });
    const art: Record<string, LoadedAsset> = {};
    lazy.defineLazyAsset(art, 'treeOak', 'tree_cf_oak_mature');
    lazy.defineLazyAsset(art, 'chest', 'prop_cf_chest');
    expect(packListeners).toHaveLength(1);
    packListeners[0]!(['trees-oak']);
    expect(requested).toEqual(['tree_cf_oak_mature']);
    await vi.waitFor(() => expect(lazy.isLoadingArt(art['treeOak'])).toBe(false));
    expect(lazy.pendingLazyArtCount()).toBe(1);
  });

  it('stays the stand-in after a failed load, and retries on a later read', async () => {
    const lazy = await import('./lazy-art.js');
    let attempts = 0;
    lazy.setLazyArtLoaderForTests(async name => { attempts += 1; if (attempts === 1) throw new Error('offline'); return asset(name); });
    const art: Record<string, LoadedAsset> = {};
    lazy.defineLazyAsset(art, 'chest', 'prop_cf_chest');
    void art['chest'];
    await vi.waitFor(() => expect(attempts).toBe(1));
    await Promise.resolve();
    expect(lazy.isLoadingArt(art['chest'])).toBe(true);
    await vi.waitFor(() => expect(art['chest']!.name).toBe('prop_cf_chest'));
    expect(attempts).toBe(2);
  });
});
