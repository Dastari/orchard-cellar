const STATIC_PATH_PREFIXES = ['/assets/', '/generated/', '/music/', '/pwa/', '/ui/'];

/** Generate a revisioned worker as part of every production build. Keeping the
 * revision in the emitted source makes the browser discover every deployment,
 * even while package.json remains on the same development version. */
export function createPwaServiceWorker(buildId: string): string {
  return `const CACHE_NAME = ${JSON.stringify(`orchard-${buildId}`)};
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa/icons/apple-192.png', '/pwa/icons/apple-512.png'];
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

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('/index.html')) || Response.error();
  }
}

async function staticResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.status === 200) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staticResponse(request));
  }
});
`;
}
