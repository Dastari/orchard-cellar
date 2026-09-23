import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPwaServiceWorker } from '../pwa-service-worker.js';

const origin = 'https://orchard.test';
const freshIndex = { schemaVersion: 4, revision: 'new-art', revisionId: 2,
  placeholderAssetId: 0, assetsById: {}, atlases: {}, assetCategories: { hero: 'chars' } };
const freshCategory = { schemaVersion: 3, revision: 'new-art', category: 'chars', assets: {} };

/** Execute the unchanged cache-first worker that can still control a new page.
 * CacheStorage keys include the query; request cache:no-store does not bypass it. */
function oldWorker() {
  const entries = new Map<string, Response>([
    [`${origin}/generated/atlas.meta.json`, Response.json({ ...freshIndex, revision: 'old-art' })],
    [`${origin}/generated/atlas.packs.json`, Response.json({ schemaVersion: 5, revision: 'old-art', assetPacks: {}, packs: {} })],
  ]);
  const network = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/generated/atlas.meta.json') return Response.json(freshIndex);
    if (path === '/generated/atlas_chars.meta.json') return Response.json(freshCategory);
    if (path === '/generated/atlas.packs.json') return Response.json({ ...freshIndex, schemaVersion: 5, assetPacks: {}, packs: {} });
    throw new Error(`Unexpected network request: ${request.url}`);
  });
  type FetchEvent = { request: Request; respondWith(value: Promise<Response>): void; waitUntil(value: Promise<unknown>): void };
  let listener: ((event: FetchEvent) => void) | undefined;
  const self = { location: { origin }, addEventListener: (name: string, callback: (event: FetchEvent) => void) => {
    if (name === 'fetch') listener = callback;
  } };
  const caches = { open: async () => ({
    match: async (request: Request) => entries.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => { entries.set(request.url, response.clone()); },
  }) };
  new Function('self', 'caches', 'fetch', createPwaServiceWorker('still-controlling-old-build'))(self, caches, network);
  const fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    let response: Promise<Response> | undefined;
    const lifetimes: Promise<unknown>[] = [];
    listener!({ request: new Request(new URL(path, origin), init),
      respondWith: value => { response = value; }, waitUntil: value => { lifetimes.push(value); } });
    if (!response) throw new Error('Worker did not handle request');
    const result = await response;
    await Promise.all(lifetimes);
    return result;
  };
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('location', { search: '' });
  return { fetch, entries, network };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('returning player atlas index cache', () => {
  it('reproduces stale index/new uncached category failure even with no-store', async () => {
    vi.stubEnv('VITE_PWA_BUILD_ID', undefined);
    const worker = oldWorker();
    expect(await (await worker.fetch('/generated/atlas.meta.json', { cache: 'no-store' })).json())
      .toMatchObject({ revision: 'old-art' });
    const { loadGeneratedAssetCatalog } = await import('../../ui/src/assets.js');
    await expect(loadGeneratedAssetCatalog()).rejects.toThrow('Generated chars atlas metadata revision does not match index');
  });

  it('loads coherent metadata through the old worker and reuses this build offline', async () => {
    vi.stubEnv('VITE_PWA_BUILD_ID', 'new/build');
    const worker = oldWorker();
    const { loadGeneratedAssetCatalog } = await import('../../ui/src/assets.js');
    await expect(loadGeneratedAssetCatalog()).resolves.toMatchObject({ revision: 'new-art' });
    expect(worker.network.mock.calls.map(([request]) => request.url)).toEqual([
      `${origin}/generated/atlas.meta.json?build=new%2Fbuild`,
      `${origin}/generated/atlas_chars.meta.json?rev=new-art`,
    ]);
    expect(await worker.entries.get(`${origin}/generated/atlas.meta.json`)!.clone().json())
      .toMatchObject({ revision: 'old-art' });
    worker.network.mockImplementation(async () => { throw new Error('offline'); });
    vi.resetModules();
    await expect((await import('../../ui/src/assets.js')).loadGeneratedAssetCatalog()).resolves.toMatchObject({ revision: 'new-art' });
    expect(worker.network).toHaveBeenCalledTimes(2);
  });

  it('versions the opt-in mutable pack index too', async () => {
    vi.stubEnv('VITE_PWA_BUILD_ID', 'new-pack-build');
    const worker = oldWorker();
    vi.stubGlobal('location', { search: '?atlasPacks=1' });
    await expect((await import('../../ui/src/assets.js')).loadGeneratedAssetRegistry()).resolves.toMatchObject({ revision: 'new-art' });
    expect(worker.network.mock.calls.map(([request]) => request.url)).toEqual([
      `${origin}/generated/atlas.packs.json?build=new-pack-build`,
    ]);
  });
});
