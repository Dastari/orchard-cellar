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
