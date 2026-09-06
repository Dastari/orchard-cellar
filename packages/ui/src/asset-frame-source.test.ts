import { describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from './assets.js';
import { AssetFrameSourceCache } from './asset-frame-source.js';

const frame = { x: 8, y: 16, width: 4, height: 4, durationTicks: 0 };
function asset(image = {} as CanvasImageSource): LoadedAsset {
  return { assetId: 1, name: 'tree', image, anchor: [2, 3], collision: [], tags: [], atlasRevision: 1,
    placement: { layer: 'canopy', footprint: [1, 1], blocksMovement: true, builderAvailable: false },
    metadata: { image: 'atlas.png', animations: {}, states: { base: frame } },
    bakedShadow: { color: '#00000028', frames: { base: [{ width: 4, height: 4, pixelCount: 2, spans: [3, 1, 2] }] } } };
}
function factory() {
  const contexts: { drawImage: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn>; imageSmoothingEnabled: boolean }[] = [];
  const surfaces: HTMLCanvasElement[] = [];
  const create = vi.fn(() => {
    const context = { drawImage: vi.fn(), clearRect: vi.fn(), imageSmoothingEnabled: true };
    contexts.push(context);
    const surface = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    surfaces.push(surface); return surface;
  });
  return { create, contexts, surfaces };
}

describe('bounded original/filtered frame sources', () => {
  it('bounds tiny-frame surface count as well as bytes and keeps recently drawn frames resident', () => {
    const f = factory(), cache = new AssetFrameSourceCache(4096, f.create, undefined, 2);
    const a = asset(), b = asset(), c = asset();
    cache.beginFrame(); const first = cache.sourceForDraw(a, frame, 'omit-baked-shadow');
    cache.sourceForDraw(b, frame, 'omit-baked-shadow');
    cache.beginFrame(); cache.sourceForDraw(a, frame, 'omit-baked-shadow');
    cache.sourceForDraw(c, frame, 'omit-baked-shadow');
    expect(cache.surfaces).toBe(2); expect(cache.bytes).toBe(128);
    expect(cache.source(a, frame, 'omit-baked-shadow')).toBe(first);
    expect(cache.source(b, frame, 'omit-baked-shadow')).toBeNull();
    for (let i = 0; i < 1000; i++) {
      cache.beginFrame(); cache.sourceForDraw(asset(), frame, 'omit-baked-shadow');
      expect(cache.surfaces).toBe(2);
    }
    cache.reset(); expect(cache.surfaces).toBe(0);
  });
  it('streams new frames immediately, preserves current draws, and evicts older frames within budget', () => {
    const f = factory(), cache = new AssetFrameSourceCache(128, f.create), a = asset(), b = asset(), c = asset();
    cache.beginFrame();
    const first = cache.sourceForDraw(a, frame, 'omit-baked-shadow');
    cache.sourceForDraw(b, frame, 'omit-baked-shadow');
    cache.beginFrame();
    expect(cache.sourceForDraw(a, frame, 'omit-baked-shadow')).toBe(first);
    const next = cache.sourceForDraw(c, frame, 'omit-baked-shadow');
    expect(next.image).not.toBe(c.image); expect(cache.bytes).toBe(128);
    expect(cache.source(b, frame, 'omit-baked-shadow')).toBeNull();
    expect((first.image as HTMLCanvasElement).width).toBe(4);
    expect(cache.evictions).toBe(1);
    expect(() => cache.sourceForDraw(b, frame, 'omit-baked-shadow')).toThrow('world_asset_frame_budget_exceeded');
    expect((next.image as HTMLCanvasElement).width).toBe(4);
    cache.beginFrame();
    expect(cache.sourceForDraw(b, frame, 'omit-baked-shadow')?.image).not.toBe(b.image);
    expect(cache.bytes).toBe(128); cache.reset(); expect(cache.bytes).toBe(0);
  });

  it('does no preparation for originals and reports real allocation failure without serving baked pixels', () => {
    const create = vi.fn(() => { throw new Error('allocation failed'); });
    const cache = new AssetFrameSourceCache(64, create), tree = asset();
    cache.beginFrame();
    expect(cache.sourceForDraw(tree, frame, 'original').image).toBe(tree.image);
    expect(create).not.toHaveBeenCalled();
    expect(() => cache.sourceForDraw(tree, frame, 'omit-baked-shadow')).toThrow('world_asset_frame_surface_unavailable');
    expect(cache.bytes).toBe(0);
  });

  it('keeps originals immutable and prepares only exact spans; resident draws reuse descriptors', async () => {
    const f = factory(), cache = new AssetFrameSourceCache(64, f.create), tree = asset();
    const original = cache.source(tree, frame, 'original');
    expect(f.create).not.toHaveBeenCalled();
    expect(cache.source(tree, frame, 'omit-baked-shadow')).toBeNull();
    expect(await cache.prepareVisible([{ asset: tree, frame }])).toBe('ready');
    expect(f.contexts[0]!.drawImage).toHaveBeenCalledExactlyOnceWith(tree.image, 8, 16, 4, 4, 0, 0, 4, 4);
    expect(f.contexts[0]!.clearRect).toHaveBeenCalledExactlyOnceWith(1, 3, 2, 1);
    const filtered = cache.source(tree, frame, 'omit-baked-shadow');
    for (let i = 0; i < 1000; i++) expect(cache.source(tree, frame, 'omit-baked-shadow')).toBe(filtered);
    expect(cache.source(tree, frame, 'original')).toBe(original);
    expect(original?.image).toBe(tree.image);
    expect(cache.bytes).toBe(64);
    expect(cache.builds).toBe(1);
    expect(f.create).toHaveBeenCalledOnce();
    cache.reset();
    expect(cache.bytes).toBe(0); expect(f.surfaces[0]!.width).toBe(0);
    expect(cache.source(tree, frame, 'omit-baked-shadow')).toBeNull();
  });

  it('separates image, recolour, revision, metadata identity and reuses rectangle aliases', async () => {
    const f = factory(), cache = new AssetFrameSourceCache(1024, f.create), tree = asset();
    const alias = { ...frame };
    const recolored = { ...tree, image: {} as CanvasImageSource };
    const revision = { ...tree, atlasRevision: 2 };
    const metadata = { ...tree, bakedShadow: { ...tree.bakedShadow! } };
    await cache.prepareVisible([tree, recolored, revision, metadata].map((asset) => ({ asset, frame })));
    expect(cache.builds).toBe(4);
    expect(cache.source(tree, alias, 'omit-baked-shadow')).toBe(cache.source(tree, frame, 'omit-baked-shadow'));
    expect(cache.source(recolored, frame, 'omit-baked-shadow')).not.toBe(cache.source(tree, frame, 'omit-baked-shadow'));
  });

  it('returns original for undeclared/empty frames without a surface', async () => {
    const f = factory(), cache = new AssetFrameSourceCache(0, f.create);
    const tree = { ...asset(), bakedShadow: undefined };
    const empty = { ...asset(), bakedShadow: { color: '#00000028', frames: { base: [{ width: 4, height: 4, pixelCount: 0, spans: [] }] } } };
    for (const item of [tree, empty]) {
      expect(await cache.prepareVisible([{ asset: item, frame }])).toBe('ready');
      expect(cache.source(item, frame, 'omit-baked-shadow')).toBe(cache.source(item, frame, 'original'));
    }
    expect(f.create).not.toHaveBeenCalled();
  });

  it('rejects oversized visible sets before allocation and evicts only unpinned frames', async () => {
    const f = factory(), cache = new AssetFrameSourceCache(64, f.create), a = asset(), b = asset();
    expect(await cache.prepareVisible([{ asset: a, frame }, { asset: b, frame }])).toBe('budget-exceeded');
    expect(cache.builds).toBe(0);
    await cache.prepareVisible([{ asset: a, frame }]);
    await cache.prepareVisible([{ asset: b, frame }]);
    expect(cache.evictions).toBe(1);
    expect(cache.source(a, frame, 'omit-baked-shadow')).toBeNull();
    expect(cache.source(b, frame, 'omit-baked-shadow')).not.toBeNull();
    expect(cache.bytes).toBe(64);
  });

  it('cancels yielded work on reset without resurrecting released surfaces', async () => {
    const f = factory(); let resume: () => void = () => {};
    const cache = new AssetFrameSourceCache(1024, f.create, () => new Promise<void>((resolve) => { resume = resolve; }));
    const requests = Array.from({ length: 10 }, () => ({ asset: asset(), frame }));
    const pending = cache.prepareVisible(requests);
    expect(cache.builds).toBeLessThan(10);
    cache.reset(); resume();
    expect(await pending).toBe('cancelled');
    expect(cache.surfaces).toBe(0); expect(cache.bytes).toBe(0);
    expect(f.surfaces.every((surface) => surface.width === 0)).toBe(true);
  });

  it('reports preparation failures instead of showing baked pixels as a filtered frame', async () => {
    const cache = new AssetFrameSourceCache(64, () => { throw new Error('allocation failed'); });
    const tree = asset();
    expect(await cache.prepareVisible([{ asset: tree, frame }])).toBe('surface-unavailable');
    expect(cache.source(tree, frame, 'omit-baked-shadow')).toBeNull();
    expect(cache.bytes).toBe(0);
  });
});
