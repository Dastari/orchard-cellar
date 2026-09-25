/**
 * Optional persistent chunk blob cache. Failure never prevents a verified network
 * fetch: every method resolves (a failed read is a miss, a failed write is dropped),
 * and without IndexedDB the runtime simply keeps its verified chunks in memory.
 */
export interface ChunkBlobCache {
  get(hash: string): Promise<Uint8Array | undefined>;
  put(hash: string, bytes: Uint8Array, spaceId?: number): Promise<void>;
  delete(hash: string): Promise<void>;
  /** Removes every entry of `spaceId` whose hash is not in `keep` (current plus previous manifest). */
  prune?(spaceId: number, keep: ReadonlySet<string>): Promise<void>;
}

export const CHUNK_CACHE_DATABASE = 'orchard-world-chunks-v2';
/** v1 kept blobs and LRU times in one store, so eviction had to getAll() every blob. */
const LEGACY_CHUNK_CACHE_DATABASE = 'orchard-world-chunks-v1';
export const CHUNK_CACHE_MAX_BYTES = 64 * 1024 * 1024;
export const CHUNK_CACHE_MAX_ENTRIES = 256;

/** Small metadata row: eviction and pruning walk these with cursors and never load blobs. */
interface ChunkBlobMeta { hash: string; spaceId: number; byteLength: number; touched: number }
interface ChunkBlobRow { hash: string; bytes: ArrayBuffer }

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('chunk_cache_aborted'));
  });
}

export class IndexedDbChunkCache implements ChunkBlobCache {
  readonly #database: Promise<IDBDatabase | undefined>;
  #closed = false;
  #lastTouch = 0;
  /** Operations that fell back to a miss or a dropped write. */
  failures = 0;
  constructor(factory: IDBFactory, readonly maxBytes = CHUNK_CACHE_MAX_BYTES, readonly maxEntries = CHUNK_CACHE_MAX_ENTRIES) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error('invalid_persistent_chunk_budget');
    this.#database = new Promise(resolve => {
      let settled = false;
      const settle = (database: IDBDatabase | undefined) => {
        if (settled) { database?.close(); return; }
        settled = true;
        if (database && this.#closed) { database.close(); resolve(undefined); return; }
        if (!database) this.failures++;
        resolve(database);
      };
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(CHUNK_CACHE_DATABASE, 1);
      } catch { settle(undefined); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('blobs', { keyPath: 'hash' });
        database.createObjectStore('meta', { keyPath: 'hash' }).createIndex('touched', 'touched');
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        settle(request.result);
      };
      request.onerror = () => settle(undefined);
      // Another tab holds an older schema open: run memory-only rather than wait.
      request.onblocked = () => settle(undefined);
    });
    try {
      const legacy = factory.deleteDatabase(LEGACY_CHUNK_CACHE_DATABASE);
      legacy.onerror = legacy.onblocked = () => undefined;
    } catch { /* best effort */ }
  }
  close(): void {
    this.#closed = true;
    void this.#database.then(database => database?.close());
  }
  #touch(): number {
    this.#lastTouch = Math.max(Date.now(), this.#lastTouch + 1);
    return this.#lastTouch;
  }
  async #open(): Promise<IDBDatabase | undefined> {
    const database = await this.#database;
    return this.#closed ? undefined : database;
  }
  async get(hash: string): Promise<Uint8Array | undefined> {
    const database = await this.#open();
    if (!database) return undefined;
    try {
      const transaction = database.transaction(['blobs', 'meta'], 'readwrite');
      const blobs = transaction.objectStore('blobs'), meta = transaction.objectStore('meta');
      let result: Uint8Array | undefined;
      const blobRequest = blobs.get(hash), metaRequest = meta.get(hash);
      metaRequest.onsuccess = () => {
        const row = blobRequest.result as ChunkBlobRow | undefined, info = metaRequest.result as ChunkBlobMeta | undefined;
        if (!row && !info) return;
        if (!row || !info || row.bytes.byteLength !== info.byteLength) { blobs.delete(hash); meta.delete(hash); return; }
        result = new Uint8Array(row.bytes);
        meta.put({ ...info, touched: this.#touch() } satisfies ChunkBlobMeta);
      };
      await completion(transaction);
      return result;
    } catch { this.failures++; return undefined; }
  }
  async put(hash: string, bytes: Uint8Array, spaceId = 0): Promise<void> {
    if (bytes.byteLength > this.maxBytes) return;
    const database = await this.#open();
    if (!database) return;
    const owned = Uint8Array.from(bytes).buffer;
    try {
      const transaction = database.transaction(['blobs', 'meta'], 'readwrite');
      const blobs = transaction.objectStore('blobs'), meta = transaction.objectStore('meta');
      // Oldest first; only metadata rows are visited.
      const older: ChunkBlobMeta[] = [];
      let count = 1, size = owned.byteLength;
      const cursorRequest = meta.index('touched').openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const row = cursor.value as ChunkBlobMeta;
          if (row.hash !== hash) { older.push(row); count++; size += row.byteLength; }
          cursor.continue();
          return;
        }
        for (const row of older) {
          if (size <= this.maxBytes && count <= this.maxEntries) break;
          blobs.delete(row.hash); meta.delete(row.hash); size -= row.byteLength; count--;
        }
        blobs.put({ hash, bytes: owned } satisfies ChunkBlobRow);
        meta.put({ hash, spaceId, byteLength: owned.byteLength, touched: this.#touch() } satisfies ChunkBlobMeta);
      };
      await completion(transaction);
    } catch { this.failures++; }
  }
  async delete(hash: string): Promise<void> {
    const database = await this.#open();
    if (!database) return;
    try {
      const transaction = database.transaction(['blobs', 'meta'], 'readwrite');
      transaction.objectStore('blobs').delete(hash); transaction.objectStore('meta').delete(hash);
      await completion(transaction);
    } catch { this.failures++; }
  }
  async prune(spaceId: number, keep: ReadonlySet<string>): Promise<void> {
    const database = await this.#open();
    if (!database) return;
    try {
      const transaction = database.transaction(['blobs', 'meta'], 'readwrite');
      const blobs = transaction.objectStore('blobs'), meta = transaction.objectStore('meta');
      const indexed = new Set<string>();
      const metaCursor = meta.openCursor();
      metaCursor.onsuccess = () => {
        const cursor = metaCursor.result;
        if (cursor) {
          const row = cursor.value as ChunkBlobMeta;
          if (row.spaceId === spaceId && !keep.has(row.hash)) { cursor.delete(); blobs.delete(row.hash); }
          else indexed.add(row.hash);
          cursor.continue();
          return;
        }
        // Keys only: sweep any blob that lost its metadata row.
        const blobKeys = blobs.openKeyCursor();
        blobKeys.onsuccess = () => {
          const keyCursor = blobKeys.result;
          if (!keyCursor) return;
          if (!indexed.has(String(keyCursor.primaryKey))) blobs.delete(keyCursor.primaryKey);
          keyCursor.continue();
        };
      };
      await completion(transaction);
    } catch { this.failures++; }
  }
}

/** The browser cache, or undefined (memory only) when IndexedDB is missing or denied. */
export function browserChunkBlobCache(): IndexedDbChunkCache | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : new IndexedDbChunkCache(indexedDB);
  } catch { return undefined; }
}
