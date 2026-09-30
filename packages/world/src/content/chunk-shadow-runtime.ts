import { CHUNK_RUNTIME_MAX_BLOB_BYTES, validateRuntimeManifest, verifyRuntimeChunk, sampleChunkCollision, MISSING_CHUNK_SAMPLE } from '@orchard/sim/chunk-runtime';
import { decodeWorldChunk, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';

export function validateShadowPublication(input: { manifestJson: string; contentHash: string; expectedRevision: number },
  current: { mapRevision: number; mapHash: string; contentHash: string; shadowRevision: number },
  readBlob: (hash: string) => Uint8Array | undefined): WorldChunkManifest {
  if (input.manifestJson.length > 1024 * 1024) throw new Error('chunk_manifest_too_large');
  const manifest = validateRuntimeManifest(JSON.parse(input.manifestJson));
  if (input.expectedRevision !== current.shadowRevision) throw new Error('chunk_shadow_revision_conflict');
  if (manifest.sourceRevision !== current.mapRevision || manifest.sourceHash !== current.mapHash || input.contentHash !== current.contentHash) throw new Error('chunk_shadow_source_conflict');
  let total = 0;
  for (const head of manifest.chunks) {
    total += head.byteLength;
    if (total > 128 * 1024 * 1024) throw new Error('chunk_shadow_publication_too_large');
    const bytes = readBlob(head.contentHash);
    if (!bytes) throw new Error('chunk_shadow_blob_missing');
    verifyRuntimeChunk(bytes,manifest,head.cx,head.cy);
  }
  return manifest;
}
/**
 * The refusal codes `validateShadowBlob` and `validateShadowPublication` throw for a
 * caller's bad input or a lost race. The reducers turn exactly these into SenderError,
 * so the client receives the code; anything else (a decoder TypeError, a bug) stays a
 * plain Error.
 */
export const SHADOW_PUBLICATION_REFUSAL_CODES: ReadonlySet<string> = new Set([
  'chunk_blob_too_large', 'chunk_medium_required',
  'chunk_manifest_too_large', 'chunk_shadow_revision_conflict', 'chunk_shadow_source_conflict',
  'chunk_shadow_publication_too_large', 'chunk_shadow_blob_missing',
  'chunk_size_or_head_mismatch', 'chunk_revision_mismatch',
  // validateRuntimeManifest: a malformed manifest or head list in the publication request.
  'invalid_chunk_manifest', 'invalid_chunk_head',
]);

/** The known refusal code of `error`, or null when it is not one. */
export function shadowPublicationRefusalCode(error: unknown): string | null {
  return error instanceof Error && error.constructor === Error && SHADOW_PUBLICATION_REFUSAL_CODES.has(error.message) ? error.message : null;
}

export function validateShadowBlob(bytes: Uint8Array): WorldChunk {
  if (bytes.byteLength > CHUNK_RUNTIME_MAX_BLOB_BYTES) throw new Error('chunk_blob_too_large');
  const chunk = decodeWorldChunk(bytes);
  if (chunk.mediumSchema !== 1) throw new Error('chunk_medium_required');
  return chunk;
}
/** Immutable cache is per module, hard bounded, keyed by the verified content hash. */
export class ShadowChunkCollisionCache {
  readonly #chunks = new Map<string, WorldChunk>();
  constructor(readonly capacity = 25) { if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('invalid_chunk_capacity'); }
  sample(hash: string | undefined, x: number,y: number, readBlob: (hash: string) => Uint8Array | undefined) {
    if (!hash) return MISSING_CHUNK_SAMPLE;
    let chunk = this.#chunks.get(hash);
    if (!chunk) {
      const bytes = readBlob(hash); if (!bytes) return MISSING_CHUNK_SAMPLE;
      chunk = validateShadowBlob(bytes);
      if (chunk.contentHash !== hash) throw new Error('chunk_hash_mismatch');
      if (this.#chunks.size >= this.capacity) this.#chunks.delete(this.#chunks.keys().next().value!);
    } else this.#chunks.delete(hash);
    this.#chunks.set(hash,chunk);
    return sampleChunkCollision(chunk,x,y);
  }
}

/** Static world S7b: blobs a sender staged that no published head references yet. */
export interface ChunkStageRow { readonly contentHash: string; readonly stagedAtMicros: bigint; readonly byteLength: number }
/** Unreferenced bytes one sender may hold staged (a whole-island first publication is about 29 MiB). */
export const CHUNK_STAGE_QUOTA_BYTES = 64 * 1024 * 1024;
/** How long a staged blob may wait for the publication that references it before it is removed. */
export const CHUNK_STAGE_TTL_MICROS = 60n * 60n * 1_000_000n;

/**
 * One sender's stage: which of their earlier stage rows have expired (and whether each blob is removed
 * with it: only when no current head references it), and whether `incomingBytes` more fit the quota.
 */
export function planChunkStage(rows: readonly ChunkStageRow[], referenced: ReadonlySet<string>, nowMicros: bigint, incomingBytes: number): {
  readonly expired: readonly { readonly contentHash: string; readonly deleteBlob: boolean }[];
  readonly allowed: boolean;
} {
  const expired = rows.filter(row => nowMicros - row.stagedAtMicros >= CHUNK_STAGE_TTL_MICROS)
    .map(row => ({ contentHash: row.contentHash, deleteBlob: !referenced.has(row.contentHash) }));
  const expiredHashes = new Set(expired.map(row => row.contentHash));
  const outstanding = rows.filter(row => !expiredHashes.has(row.contentHash) && !referenced.has(row.contentHash))
    .reduce((total, row) => total + row.byteLength, 0);
  return { expired, allowed: outstanding + incomingBytes <= CHUNK_STAGE_QUOTA_BYTES };
}

/** Per module instance, best effort: at most `limit` blob reads per sender per `windowMicros`. */
export class ChunkBlobReadLimiter {
  readonly #windows = new Map<string, { start: bigint; count: number }>();
  constructor(readonly limit = 400, readonly windowMicros = 60n * 1_000_000n, readonly maxSenders = 4096) {}
  take(sender: string, nowMicros: bigint): boolean {
    let window = this.#windows.get(sender);
    if (window === undefined || nowMicros - window.start >= this.windowMicros) {
      if (window === undefined && this.#windows.size >= this.maxSenders) {
        for (const [key, value] of this.#windows) if (nowMicros - value.start >= this.windowMicros) this.#windows.delete(key);
        if (this.#windows.size >= this.maxSenders) this.#windows.delete(this.#windows.keys().next().value!);
      }
      window = { start: nowMicros, count: 0 };
      this.#windows.set(sender, window);
    }
    if (window.count >= this.limit) return false;
    window.count += 1;
    return true;
  }
}
