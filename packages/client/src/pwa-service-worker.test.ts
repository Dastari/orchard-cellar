import { describe, expect, it, vi } from 'vitest';
import { createPwaServiceWorker } from '../pwa-service-worker.js';

interface WorkerFetchEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
  waitUntil(lifetime: Promise<unknown>): void;
}

function workerFetchHandler(options: {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly match: (request: Request) => Promise<Response | undefined>;
  readonly put: (request: Request, response: Response) => Promise<void>;
}): (event: WorkerFetchEvent) => void {
  const listeners = new Map<string, (event: WorkerFetchEvent) => void>();
  const worker = {
    location: { origin: 'https://orchard.test' },
    addEventListener: (name: string, listener: (event: WorkerFetchEvent) => void) => {
      listeners.set(name, listener);
    },
  };
  const cacheStorage = {
    open: async () => ({ match: options.match, put: options.put, addAll: vi.fn() }),
    keys: async () => [],
    delete: async () => true,
  };
  const evaluate = new Function('self', 'caches', 'fetch', 'URL', 'Response',
    createPwaServiceWorker('test-build'));
  evaluate(worker, cacheStorage, options.fetch, URL, Response);
  const listener = listeners.get('fetch');
  if (listener === undefined) throw new Error('worker_fetch_listener_missing');
  return listener;
}

function navigationRequest(path = '/play'): Request {
  const request = new Request(`https://orchard.test${path}`);
  // Node's Request implementation rejects the service-worker-only `navigate`
  // mode at construction time, so expose the browser event shape explicitly.
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

describe('generated PWA service worker', () => {
  it('returns a fresh navigation response without awaiting a stalled cache write', async () => {
    const put = vi.fn((request: RequestInfo, response: Response) => {
      void request;
      void response;
      return new Promise<void>(() => undefined);
    });
    const listener = workerFetchHandler({
      fetch: async () => new Response('game', { status: 200 }),
      match: async () => undefined,
      put,
    });
    let responsePromise: Promise<Response> | undefined;
    const lifetimes: Promise<unknown>[] = [];
    let dispatchActive = true;
    listener({
      request: navigationRequest(),
      respondWith: (response) => { responsePromise = response; },
      waitUntil: (lifetime) => {
        if (!dispatchActive) throw new Error('waitUntil_registered_after_dispatch');
        lifetimes.push(lifetime);
      },
    });
    dispatchActive = false;

    await expect(responsePromise).resolves.toBeInstanceOf(Response);
    await expect(responsePromise?.then(async (response) => await response.text())).resolves.toBe('game');
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[0]).toBe('/index.html');
    expect(lifetimes).toHaveLength(1);
  });

  it('uses the cached app shell when a navigation network request fails', async () => {
    const cached = new Response('offline game', { status: 200 });
    const match = vi.fn(async () => cached);
    const put = vi.fn(async () => undefined);
    const listener = workerFetchHandler({
      fetch: async () => { throw new TypeError('offline'); },
      match,
      put,
    });
    let responsePromise: Promise<Response> | undefined;
    const waitUntil = vi.fn();
    listener({
      request: navigationRequest(),
      respondWith: (response) => { responsePromise = response; },
      waitUntil,
    });

    await expect(responsePromise?.then(async (response) => await response.text()))
      .resolves.toBe('offline game');
    expect(match).toHaveBeenCalledWith('/index.html');
    expect(put).not.toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it('returns a network error response when navigation and app-shell fallback both miss', async () => {
    const listener = workerFetchHandler({
      fetch: async () => { throw new TypeError('offline'); },
      match: async () => undefined,
      put: async () => undefined,
    });
    let responsePromise: Promise<Response> | undefined;
    listener({
      request: navigationRequest(),
      respondWith: (response) => { responsePromise = response; },
      waitUntil: vi.fn(),
    });

    await expect(responsePromise).resolves.toMatchObject({ status: 0, type: 'error' });
  });

  it('returns a fresh static response without awaiting a stalled cache write', async () => {
    const put = vi.fn(() => new Promise<void>(() => undefined));
    const listener = workerFetchHandler({
      fetch: async () => new Response('fresh', { status: 200 }),
      match: async () => undefined,
      put,
    });
    let responsePromise: Promise<Response> | undefined;
    const lifetimes: Promise<unknown>[] = [];
    let dispatchActive = true;
    listener({
      request: new Request('https://orchard.test/generated/atlas_ui_summer.png'),
      respondWith: (response) => { responsePromise = response; },
      waitUntil: (lifetime) => {
        if (!dispatchActive) throw new Error('waitUntil_registered_after_dispatch');
        lifetimes.push(lifetime);
      },
    });
    dispatchActive = false;

    await expect(responsePromise).resolves.toBeInstanceOf(Response);
    await expect(responsePromise?.then(async (response) => await response.text())).resolves.toBe('fresh');
    expect(put).toHaveBeenCalledOnce();
    expect(lifetimes).toHaveLength(1);
  });

  it('serves a cached static response without starting a network request or cache write', async () => {
    const fetch = vi.fn(async () => new Response('network'));
    const put = vi.fn(async () => undefined);
    const listener = workerFetchHandler({
      fetch,
      match: async () => new Response('cached', { status: 200 }),
      put,
    });
    let responsePromise: Promise<Response> | undefined;
    listener({
      request: new Request('https://orchard.test/ui/lucide/map.svg'),
      respondWith: (response) => { responsePromise = response; },
      waitUntil: vi.fn(),
    });

    await expect(responsePromise?.then(async (response) => await response.text())).resolves.toBe('cached');
    expect(fetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('leaves world chunk blobs to the network so IndexedDB stays their only client cache', () => {
    const fetch = vi.fn(async () => new Response('network'));
    const match = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    const listener = workerFetchHandler({ fetch, match, put });
    const respondWith = vi.fn();
    const waitUntil = vi.fn();
    for (const path of [`/world/1/${'a'.repeat(64)}.bin`, `/world/0/${'f'.repeat(64)}.bin`]) {
      listener({ request: new Request(`https://orchard.test${path}`), respondWith, waitUntil });
    }

    expect(respondWith).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
