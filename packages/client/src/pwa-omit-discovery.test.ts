import { describe, expect, it, vi } from 'vitest';
import { createPwaServiceWorker } from '../pwa-service-worker.js';

interface FetchEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
  waitUntil(lifetime: Promise<unknown>): void;
}
describe('omit page service-worker discovery', () => {
  it('discovers normal and omit pages through the existing generated prefix and preserves revisions', async () => {
    let handler: ((event: FetchEvent) => void) | undefined;
    const entries = new Map<string, Response>();
    const fetch = vi.fn(async (request: Request) => new Response(request.url));
    const worker = { location: { origin: 'https://orchard.test' },
      addEventListener: (name: string, listener: (event: FetchEvent) => void) => { if (name === 'fetch') handler = listener; } };
    const caches = { open: async () => ({
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => { entries.set(request.url, response); },
    }) };
    new Function('self', 'caches', 'fetch', 'URL', 'Response', createPwaServiceWorker('omit-test'))(worker, caches, fetch, URL, Response);
    const paths = ['/generated/atlas_trees_p000_summer.png?rev=a',
      '/generated/atlas_trees_p000_summer.omit.png?rev=a', '/generated/atlas_trees_p000_summer.omit.png?rev=b'];
    for (let pass = 0; pass < 2; pass++) for (const path of paths) {
      const request = new Request(`https://orchard.test${path}`);
      let response: Promise<Response> | undefined;
      const lifetimes: Promise<unknown>[] = [];
      handler!({ request, respondWith: value => { response = value; }, waitUntil: value => { lifetimes.push(value); } });
      expect(response).toBeDefined();
      expect(await (await response!).text()).toBe(request.url);
      await Promise.all(lifetimes);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
    expect([...entries.keys()]).toEqual(paths.map(path => `https://orchard.test${path}`));
  });
});
