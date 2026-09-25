import { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { chunkBlobPath, chunkKey, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import type { WorldChunkManifest } from '@orchard/sim/world-chunk';
import type { ChunkBlobCache } from './chunk-shadow-cache.js';

export class ChunkShadowLoader {
  readonly store: BoundedChunkTerrainStore;
  #generation = 0;
  #disposed = false;
  readonly #inflight = new Map<string, Promise<void>>();
  /** Called after each install (chunk mode `on`: the first serve waits only for the spawn ring, S4f). */
  onInstall: (() => void) | undefined;
  constructor(manifest: WorldChunkManifest, readonly fetchBlob: (path: string, maxBytes: number) => Promise<Uint8Array>, readonly cache?: ChunkBlobCache) {
    this.store = new BoundedChunkTerrainStore(manifest);
  }
  dispose(): void { this.#disposed = true; this.#generation++; }
  /** `nearestFirst` (chunk mode `on`, S4f) fetches the view's centre chunks, then outwards;
   * otherwise the manifest order, as before. */
  async updateView(minX: number, minY: number, maxX: number, maxY: number, nearestFirst = false): Promise<void> {
    if (this.#disposed) return;
    this.store.pinView(minX,minY,maxX,maxY); const generation = ++this.#generation;
    const keys = new Set(this.store.pinnedKeys);
    const queue = this.store.manifest.chunks.filter(head => keys.has(chunkKey(head.cx,head.cy)));
    if (nearestFirst) {
      const centreX = (minX + maxX) / 2 / 64 - 0.5, centreY = (minY + maxY) / 2 / 64 - 0.5;
      const distance = (head: { cx: number; cy: number }) => Math.max(Math.abs(head.cx - centreX), Math.abs(head.cy - centreY));
      queue.sort((a, b) => distance(a) - distance(b));
    }
    let cursor = 0;
    // One update at a time is enforced by the controller. A superseded view stops scheduling.
    const worker = async () => {
      while (cursor < queue.length && !this.#disposed && generation === this.#generation) {
        while (this.#inflight.size >= 2) await Promise.race(this.#inflight.values());
        if (this.#disposed || generation !== this.#generation) return;
        const head = queue[cursor++]!;
        if (this.store.chunkAt(head.cx,head.cy)) continue;
        let pending = this.#inflight.get(head.contentHash);
        if (!pending) {
          pending = this.load(head.cx,head.cy,head.contentHash,head.byteLength);
          this.#inflight.set(head.contentHash,pending);
          void pending.finally(() => this.#inflight.delete(head.contentHash)).catch(() => undefined);
        }
        await pending;
      }
    };
    await Promise.all([worker(),worker()]);
  }
  private async load(cx: number,cy: number,hash: string,size: number): Promise<void> {
    let bytes: Uint8Array | undefined;
    try {
      bytes = await this.cache?.get(hash);
      if (bytes) verifyRuntimeChunk(bytes,this.store.manifest,cx,cy);
    } catch { bytes = undefined; try { await this.cache?.delete(hash); } catch { /* optional cache */ } }
    if (!bytes) {
      bytes = await this.fetchBlob(chunkBlobPath(this.store.manifest.spaceId,hash),size);
      verifyRuntimeChunk(bytes,this.store.manifest,cx,cy);
      try { await this.cache?.put(hash,bytes,this.store.manifest.spaceId); } catch { /* verified memory copy remains usable */ }
    }
    if (!this.#disposed && this.store.pinnedKeys.includes(chunkKey(cx,cy))) { this.store.install(bytes,cx,cy); this.onInstall?.(); }
  }
}
/** Stream rather than arrayBuffer: a bad static endpoint cannot allocate an unbounded response. */
export async function fetchChunkBlob(path: string,maxBytes: number): Promise<Uint8Array> {
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15_000);
  try {
    const response = await fetch(path, { cache: 'force-cache', credentials: 'omit', signal: abort.signal });
    if (!response.ok || !response.body) throw new Error(`chunk_fetch_${response.status}`);
    const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        length += next.value.byteLength;
        if (length > maxBytes) throw new Error('chunk_response_too_large');
        parts.push(next.value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part,offset); offset += part.length; }
    return bytes;
  } finally { clearTimeout(timeout); }
}
