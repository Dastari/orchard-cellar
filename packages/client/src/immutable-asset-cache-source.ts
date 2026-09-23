/** Worker-local persistent cache. Only byte-addressed atlas/pack URLs qualify. */
export const IMMUTABLE_ASSET_CACHE_SOURCE = `
const IMMUTABLE_CACHE = 'orchard-immutable-atlas-v1';
const IMMUTABLE_MAX_BYTES = 64 * 1024 * 1024;
const IMMUTABLE_MAX_ENTRIES = 512;
let immutableWrites = Promise.resolve();
let immutableInventory;
function isImmutableAtlasUrl(url) {
  return !url.search && /^\\/generated\\/(?:atlas-[a-f0-9]{64}\\.png|pack-[a-f0-9]{64}\\.json)$/.test(url.pathname);
}
async function immutableInventoryFor(cache) {
  if (!immutableInventory) {
    immutableInventory = new Map();
    for (const key of await cache.keys()) {
      const stored = await cache.match(key);
      const bytes = Number(stored?.headers.get('x-orchard-stored-bytes'));
      if (!Number.isSafeInteger(bytes) || bytes <= 0) await cache.delete(key);
      else immutableInventory.set(key.url, bytes);
    }
  }
  return immutableInventory;
}
async function storeImmutable(cache, request, response) {
  const inventory = await immutableInventoryFor(cache);
  const body = await response.arrayBuffer();
  if (body.byteLength > IMMUTABLE_MAX_BYTES) return;
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.set('x-orchard-stored-bytes', String(body.byteLength));
  // FIFO bounds persistent storage across releases, with deterministic pruning.
  inventory.delete(request.url);
  inventory.set(request.url, body.byteLength);
  let total = [...inventory.values()].reduce((sum, bytes) => sum + bytes, 0);
  for (const [url, bytes] of inventory) {
    if (inventory.size <= IMMUTABLE_MAX_ENTRIES && total <= IMMUTABLE_MAX_BYTES) break;
    await cache.delete(url);
    inventory.delete(url);
    total -= bytes;
  }
  try {
    await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
  } catch {
    inventory.delete(request.url);
    // Storage pressure is not a network failure. Evict one older entry so a
    // later request has room, without clearing other releases' whole cache.
    const oldest = inventory.keys().next().value;
    if (oldest) { await cache.delete(oldest); inventory.delete(oldest); }
  }
}
function immutableResponse(request) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  const lifetime = (async () => {
    let cache;
    try {
      cache = await caches.open(IMMUTABLE_CACHE);
      const cached = await cache.match(request);
      if (cached) { resolveResponse(cached); return; }
    } catch { /* CacheStorage may be unavailable; network is still usable. */ }
    try {
      const fresh = await fetch(request);
      const copy = fresh.ok && fresh.status === 200 && cache ? fresh.clone() : null;
      resolveResponse(fresh);
      if (copy) {
        immutableWrites = immutableWrites.then(() => storeImmutable(cache, request, copy)).catch(() => { immutableInventory = undefined; });
        await immutableWrites;
      }
    } catch (error) { rejectResponse(error); }
  })();
  return { response, lifetime };
}
`;
