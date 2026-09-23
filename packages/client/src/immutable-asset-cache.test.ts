import { describe, expect, it, vi } from 'vitest';
import { createPwaServiceWorker } from '../pwa-service-worker.js';
import { IMMUTABLE_ASSET_CACHE_SOURCE } from './immutable-asset-cache-source.js';

function cacheHarness(options: { offline?: boolean; storageUnavailable?: boolean; quota?: boolean } = {}) {
  const entries = new Map<string, Response>();
  const cache = {
    keys: async () => [...entries.keys()].map(url => new Request(url)),
    match: async (key: Request | string) => entries.get(typeof key === 'string' ? key : key.url)?.clone(),
    delete: vi.fn(async (key: Request | string) => entries.delete(typeof key === 'string' ? key : key.url)),
    put: vi.fn(async (key: Request, response: Response) => {
      if (options.quota) throw new Error('quota');
      entries.set(key.url, response.clone());
    }),
  };
  const fetch = vi.fn(async () => {
    if (options.offline) throw new Error('offline');
    return new Response('pixels');
  });
  const storage = { open: async () => {
    if (options.storageUnavailable) throw new Error('disabled');
    return cache;
  } };
  const startWorker = () => new Function('caches', 'fetch', `${IMMUTABLE_ASSET_CACHE_SOURCE}; return { immutableResponse, isImmutableAtlasUrl, IMMUTABLE_CACHE };`)(storage, fetch) as {
    immutableResponse(request: Request): { response: Promise<Response>; lifetime: Promise<void> };
    isImmutableAtlasUrl(url: URL): boolean;
    IMMUTABLE_CACHE: string;
  };
  return { entries, cache, fetch, startWorker };
}
const request = (n = 0) => new Request(`https://orchard.test/generated/atlas-${n.toString(16).padStart(64, '0')}.png`);

describe('persistent immutable atlas cache', () => {
  it('matches only same-content URL shapes without release query strings', () => {
    const worker = cacheHarness().startWorker();
    expect(worker.isImmutableAtlasUrl(new URL(request().url))).toBe(true);
    for (const path of ['/generated/atlas.meta.json', '/generated/atlas_old.png', '/generated/pack-oops.json', new URL(request().url).pathname + '?rev=x']) {
      expect(worker.isImmutableAtlasUrl(new URL(path, 'https://orchard.test'))).toBe(false);
    }
  });
  it('reuses unchanged bodies after a new worker starts', async () => {
    const harness = cacheHarness();
    const first = harness.startWorker().immutableResponse(request());
    expect(await (await first.response).text()).toBe('pixels');
    await first.lifetime;
    const next = harness.startWorker().immutableResponse(request());
    expect(await (await next.response).text()).toBe('pixels');
    await next.lifetime;
    expect(harness.fetch).toHaveBeenCalledOnce();
  });
  it('serializes writes and prunes the oldest entry at the entry budget', async () => {
    const harness = cacheHarness();
    const worker = harness.startWorker();
    const pending = Array.from({ length: 513 }, (_, index) => worker.immutableResponse(request(index)));
    await Promise.all(pending.map(p => p.response));
    await Promise.all(pending.map(p => p.lifetime));
    expect(harness.entries.size).toBe(512);
    expect(harness.entries.has(request().url)).toBe(false);
    expect(harness.entries.has(request(512).url)).toBe(true);
  });
  it('prunes oversized prior inventory using decoded stored body bytes', async () => {
    const harness = cacheHarness();
    harness.entries.set(request(8).url, new Response('old', { headers: { 'x-orchard-stored-bytes': String(64 * 1024 * 1024) } }));
    const next = harness.startWorker().immutableResponse(request());
    await next.response; await next.lifetime;
    expect(harness.entries.size).toBe(1);
    expect(harness.entries.has(request().url)).toBe(true);
  });
  it.each([{ quota: true }, { storageUnavailable: true }])('serves network under storage failure %j', async (options) => {
    const harness = cacheHarness(options);
    const next = harness.startWorker().immutableResponse(request());
    expect(await (await next.response).text()).toBe('pixels');
    await expect(next.lifetime).resolves.toBeUndefined();
  });
  it('propagates a genuine offline miss', async () => {
    const pending = cacheHarness({ offline: true }).startWorker().immutableResponse(request());
    await expect(pending.response).rejects.toThrow('offline');
    await pending.lifetime;
  });
});

describe('worker activation retention', () => {
  it('deletes prior shells while preserving immutable atlas bodies', async () => {
    let activate: ((event: { waitUntil(work: Promise<unknown>): void }) => void) | undefined;
    const cacheStorage = {
      keys: async () => ['orchard-old', 'orchard-new', 'orchard-immutable-atlas-v1', 'unrelated'],
      delete: vi.fn(async (_name: string) => { void _name; return true; }),
    };
    const worker = {
      addEventListener: (name: string, listener: typeof activate) => { if (name === 'activate') activate = listener; },
      clients: { claim: vi.fn(async () => undefined) },
    };
    new Function('self', 'caches', createPwaServiceWorker('new'))(worker, cacheStorage);
    let pending: Promise<unknown> | undefined;
    activate!({ waitUntil: work => { pending = work; } });
    await pending;
    expect(cacheStorage.delete.mock.calls).toEqual([['orchard-old']]);
  });
});
