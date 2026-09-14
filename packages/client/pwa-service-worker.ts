const STATIC_PATH_PREFIXES = ['/assets/', '/generated/', '/music/', '/pwa/', '/ui/'];

/** Generate a revisioned worker as part of every production build. Keeping the
 * revision in the emitted source makes the browser discover every deployment,
 * even while package.json remains on the same development version. */
export function createPwaServiceWorker(buildId: string): string {
  return `const CACHE_NAME = ${JSON.stringify(`orchard-${buildId}`)};
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa/icons/apple-192.png', '/pwa/icons/apple-512.png', '/ui/island-background.png'];
const STATIC_PATH_PREFIXES = ${JSON.stringify(STATIC_PATH_PREFIXES)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('orchard-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function navigationResponse(request) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const lifetime = (async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(request);
        const cacheCopy = fresh.ok ? fresh.clone() : null;
        // Navigation is startup-critical. Release a valid network response
        // before CacheStorage I/O, while waitUntil keeps the best-effort shell
        // refresh alive independently of respondWith.
        resolveResponse(fresh);
        if (cacheCopy) await cache.put('/index.html', cacheCopy).catch(() => undefined);
      } catch {
        resolveResponse((await cache.match('/index.html')) || Response.error());
      }
    } catch (error) {
      rejectResponse(error);
    }
  })();
  return { response, lifetime };
}

function staticResponse(request) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const lifetime = (async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        resolveResponse(cached);
        return;
      }
      const fresh = await fetch(request);
      const cacheCopy = fresh.ok && fresh.status === 200 ? fresh.clone() : null;
      // Release the network response before starting CacheStorage I/O. Cache
      // persistence remains protected by the event lifetime registered below.
      resolveResponse(fresh);
      if (cacheCopy) await cache.put(request, cacheCopy).catch(() => undefined);
    } catch (error) {
      rejectResponse(error);
    }
  })();
  return { response, lifetime };
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    const pending = navigationResponse(request);
    event.respondWith(pending.response);
    event.waitUntil(pending.lifetime);
    return;
  }
  if (STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    const pending = staticResponse(request);
    event.respondWith(pending.response);
    event.waitUntil(pending.lifetime);
  }
});
`;
}
