/** Optional persistent cache. Failure never prevents a verified network fetch. */
export interface ChunkBlobCache {
  get(hash: string): Promise<Uint8Array | undefined>;
  put(hash: string, bytes: Uint8Array): Promise<void>;
  delete(hash: string): Promise<void>;
}
interface StoredBlob { hash: string; bytes: ArrayBuffer; touched: number }
export class IndexedDbChunkCache implements ChunkBlobCache {
  readonly #database: Promise<IDBDatabase>;
  constructor(factory: IDBFactory, readonly maxBytes = 64 * 1024 * 1024, readonly maxEntries = 256) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error('invalid_persistent_chunk_budget');
    this.#database = new Promise((resolve, reject) => {
      const request = factory.open('orchard-world-chunks-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('blobs', { keyPath: 'hash' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('chunk_cache_blocked'));
    });
    void this.#database.catch(() => undefined);
  }
  async get(hash: string): Promise<Uint8Array | undefined> {
    const db = await this.#database;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('blobs', 'readwrite'), store = transaction.objectStore('blobs');
      const request = store.get(hash); let result: Uint8Array | undefined;
      request.onsuccess = () => {
        const row = request.result as StoredBlob | undefined;
        if (row) { result = new Uint8Array(row.bytes); store.put({ ...row, touched: Date.now() }); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  }
  async put(hash: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > this.maxBytes) return;
    const db = await this.#database;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('blobs', 'readwrite'), store = transaction.objectStore('blobs');
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = (request.result as StoredBlob[]).filter(row => row.hash !== hash).sort((a,b) => a.touched - b.touched);
        let size = rows.reduce((sum,row) => sum + row.bytes.byteLength, bytes.byteLength), count = rows.length + 1;
        for (const row of rows) {
          if (size <= this.maxBytes && count <= this.maxEntries) break;
          store.delete(row.hash); size -= row.bytes.byteLength; count--;
        }
        store.put({ hash, bytes: Uint8Array.from(bytes).buffer, touched: Date.now() } satisfies StoredBlob);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  }
  async delete(hash: string): Promise<void> {
    const db = await this.#database;
    await new Promise<void>((resolve,reject) => {
      const transaction = db.transaction('blobs','readwrite'); transaction.objectStore('blobs').delete(hash);
      transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  }
}
