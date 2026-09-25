import { WORLD_CHUNK_SIZE, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import { chunkKey, validateRuntimeManifest, verifyRuntimeChunk, sampleChunkCollision, type ChunkCollisionSample } from '@orchard/sim/chunk-runtime';

/** Streaming store: no whole-world arrays, compiler, generator or implicit network. */
export class BoundedChunkTerrainStore {
  readonly manifest: WorldChunkManifest;
  readonly maxChunks: number;
  readonly maxBytes: number;
  readonly #chunks = new Map<string, { chunk: WorldChunk; bytes: number }>();
  #pins = new Set<string>();
  #bytes = 0;
  #installs = 0;
  constructor(manifest: WorldChunkManifest, limits: { maxChunks?: number; maxBytes?: number } = {}) {
    this.manifest = validateRuntimeManifest(manifest);
    this.maxChunks = limits.maxChunks ?? 25; this.maxBytes = limits.maxBytes ?? 16 * 1024 * 1024;
    if (!Number.isSafeInteger(this.maxChunks) || this.maxChunks < 1 || !Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1) throw new Error('invalid_chunk_budget');
  }
  get residentCount(): number { return this.#chunks.size; }
  get residentBytes(): number { return this.#bytes; }
  get pinnedKeys(): readonly string[] { return [...this.#pins]; }
  /** Bumped by every new install (a render window rebuilds when a missing chunk arrives). */
  get installs(): number { return this.#installs; }
  /** The resident chunk, without refreshing its LRU position. */
  peekChunk(cx: number, cy: number): WorldChunk | undefined { return this.#chunks.get(chunkKey(cx, cy))?.chunk; }
  /** Atomic pin change; view is expressed in tile coordinates, plus exactly one ring. */
  pinView(minX: number, minY: number, maxX: number, maxY: number): void {
    if (![minX,minY,maxX,maxY].every(Number.isSafeInteger) || minX > maxX || minY > maxY) throw new Error('invalid_chunk_view');
    const left = Math.floor(minX / WORLD_CHUNK_SIZE) - 1, right = Math.floor(maxX / WORLD_CHUNK_SIZE) + 1;
    const top = Math.floor(minY / WORLD_CHUNK_SIZE) - 1, bottom = Math.floor(maxY / WORLD_CHUNK_SIZE) + 1;
    const heads = this.manifest.chunks.filter(head => head.cx >= left && head.cx <= right && head.cy >= top && head.cy <= bottom);
    if (heads.length > this.maxChunks || heads.reduce((sum, head) => sum + head.byteLength, 0) > this.maxBytes) throw new Error('chunk_pins_exceed_budget');
    this.#pins = new Set(heads.map(head => chunkKey(head.cx, head.cy)));
  }
  chunkAt(cx: number, cy: number): WorldChunk | undefined {
    const key = chunkKey(cx, cy), entry = this.#chunks.get(key);
    if (entry) { this.#chunks.delete(key); this.#chunks.set(key, entry); }
    return entry?.chunk;
  }
  hasTile(x: number, y: number): boolean { return this.chunkAt(Math.floor(x / WORLD_CHUNK_SIZE), Math.floor(y / WORLD_CHUNK_SIZE)) !== undefined; }
  sample(x: number, y: number): ChunkCollisionSample { return sampleChunkCollision(this.chunkAt(Math.floor(x / WORLD_CHUNK_SIZE), Math.floor(y / WORLD_CHUNK_SIZE)), x, y); }
  install(bytes: Uint8Array, cx: number, cy: number): void {
    const chunk = verifyRuntimeChunk(bytes, this.manifest, cx, cy), key = chunkKey(cx, cy);
    if (this.#chunks.has(key)) { this.chunkAt(cx, cy); return; }
    if (bytes.byteLength > this.maxBytes) throw new Error('chunk_exceeds_budget');
    const victims: string[] = []; let count = this.#chunks.size, size = this.#bytes;
    for (const [candidate, entry] of this.#chunks) {
      if (count < this.maxChunks && size + bytes.byteLength <= this.maxBytes) break;
      if (this.#pins.has(candidate)) continue;
      victims.push(candidate); count--; size -= entry.bytes;
    }
    if (count >= this.maxChunks || size + bytes.byteLength > this.maxBytes) throw new Error('chunk_pins_exceed_budget');
    for (const victim of victims) this.#chunks.delete(victim);
    this.#bytes = size + bytes.byteLength; this.#chunks.set(key, { chunk, bytes: bytes.byteLength }); this.#installs++;
  }
  get pinnedReady(): boolean { return [...this.#pins].every(key => this.#chunks.has(key)); }
  get pinnedPackIds(): readonly string[] {
    return [...new Set([...this.#pins].flatMap(key => this.#chunks.get(key)?.chunk.atlasPackIds ?? []))].sort();
  }
}
