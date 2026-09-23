import { WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, WORLD_CHUNK_VOID, decodeWorldChunk, type WorldChunk, type WorldChunkManifest } from './world-chunk.js';

export const CHUNK_RUNTIME_MAX_BLOB_BYTES = 1024 * 1024;
export const CHUNK_RUNTIME_MAX_HEADS = 4096;
export function chunkKey(cx: number, cy: number): string { return `${cx}:${cy}`; }
export function chunkBlobPath(spaceId: number, hash: string): string {
  if (!Number.isSafeInteger(spaceId) || spaceId < 0 || !/^[a-f0-9]{64}$/u.test(hash)) throw new Error('invalid_chunk_address');
  return `/world/${spaceId}/${hash}.bin`;
}
export function validateRuntimeManifest(raw: unknown): WorldChunkManifest {
  if (raw === null || typeof raw !== 'object') throw new Error('invalid_chunk_manifest');
  const value = raw as WorldChunkManifest;
  if (value.schema !== 1 || value.chunkSize !== WORLD_CHUNK_SIZE || !Number.isSafeInteger(value.spaceId) || value.spaceId < 0
    || !Number.isSafeInteger(value.width) || value.width < 1 || !Number.isSafeInteger(value.height) || value.height < 1
    || value.width * value.height > 16_777_216 || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 0
    || typeof value.sourceHash !== 'string' || !value.sourceHash || typeof value.assetRevision !== 'string' || !value.assetRevision
    || !value.metadata || typeof value.metadata !== 'object' || !Array.isArray(value.chunks)
    || value.chunks.length < 1 || value.chunks.length > CHUNK_RUNTIME_MAX_HEADS) throw new Error('invalid_chunk_manifest');
  const seen = new Set<string>();
  for (const head of value.chunks) {
    if (!head || !Number.isSafeInteger(head.cx) || !Number.isSafeInteger(head.cy)
      || !Number.isSafeInteger(head.byteLength) || head.byteLength < 44 || head.byteLength > CHUNK_RUNTIME_MAX_BLOB_BYTES
      || !/^[a-f0-9]{64}$/u.test(head.contentHash) || seen.has(chunkKey(head.cx, head.cy))) throw new Error('invalid_chunk_head');
    seen.add(chunkKey(head.cx, head.cy));
  }
  return value;
}
export function verifyRuntimeChunk(bytes: Uint8Array, manifest: WorldChunkManifest, cx: number, cy: number): WorldChunk {
  const head = manifest.chunks.find(row => row.cx === cx && row.cy === cy);
  if (!head || bytes.byteLength !== head.byteLength || bytes.byteLength > CHUNK_RUNTIME_MAX_BLOB_BYTES) throw new Error('chunk_size_or_head_mismatch');
  const chunk = decodeWorldChunk(bytes, head.contentHash);
  if (chunk.spaceId !== manifest.spaceId || chunk.cx !== cx || chunk.cy !== cy || chunk.assetRevision !== manifest.assetRevision
    || chunk.mediumSchema !== 1) throw new Error('chunk_revision_mismatch');
  return chunk;
}
export interface ChunkCollisionSample { readonly ready: boolean; readonly elevation: number | null; readonly medium: number; readonly solidBlocked: boolean; readonly legacyGroundBlocked: boolean; readonly legacyWaterBlocked: boolean }
export const MISSING_CHUNK_SAMPLE: ChunkCollisionSample = Object.freeze({ ready: false, elevation: null, medium: WORLD_CHUNK_VOID, solidBlocked: true, legacyGroundBlocked: true, legacyWaterBlocked: true });
/** Chunk-local channels only; traversal abilities and dynamic overlays belong to D6/the caller. */
export function sampleChunkCollision(chunk: WorldChunk | undefined, tileX: number, tileY: number): ChunkCollisionSample {
  if (!chunk || !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) return MISSING_CHUNK_SAMPLE;
  const x = tileX - chunk.cx * WORLD_CHUNK_SIZE + 1, y = tileY - chunk.cy * WORLD_CHUNK_SIZE + 1;
  if (x < 0 || y < 0 || x >= WORLD_CHUNK_STRIDE || y >= WORLD_CHUNK_STRIDE) return MISSING_CHUNK_SAMPLE;
  const index = y * WORLD_CHUNK_STRIDE + x;
  const medium = chunk.arrays['medium']?.[index], solid = chunk.arrays['solidBlocked']?.[index];
  if (medium === undefined || solid === undefined) return MISSING_CHUNK_SAMPLE;
  return { ready: true, elevation: chunk.arrays['elevations']?.[index] ?? null, medium, solidBlocked: solid !== 0,
    legacyGroundBlocked: chunk.arrays['clientGround.blocked']?.[index] !== 0,
    legacyWaterBlocked: chunk.arrays['clientWater.blocked']?.[index] !== 0 };
}
/** Activation is deliberately unavailable until independently reviewed live gates exist. */
export function assertChunkRuntimeMode(mode: string): asserts mode is 'off' | 'shadow' {
  if (mode !== 'off' && mode !== 'shadow') throw new Error('chunk_runtime_activation_not_approved');
}
