/**
 * Static world S7b-4: the live map head Studio edits, read from the chunk publication instead of the
 * whole-document row. Publications carry the S7a authored document, so the map rebuilds exactly
 * (`rebuildWorldChunkDocument`); the rebuilt head must hash to the manifest's pinned source hash.
 */
import { liveMapHeadSource } from '@orchard/sim';
import { validateRuntimeManifest, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import type { WorldChunkManifest } from '@orchard/sim/world-chunk';
import { manifestCarriesAuthoredDocument, rebuildWorldChunkDocument } from '@orchard/sim/world-chunk-document';

export interface ChunkMapHead { readonly mapId: string; readonly revision: number; readonly contentHash: string; readonly documentJson: string }
export type ChunkMapBlobReader = (head: { readonly spaceId: number; readonly cx: number; readonly cy: number;
  readonly contentHash: string; readonly byteLength: number }, signal?: AbortSignal) => Promise<Uint8Array>;

/** Whether a publication can be read back as a map at all (it carries the authored document). */
export function chunkPublicationCarriesMap(manifestJson: string): boolean {
  try { return manifestCarriesAuthoredDocument(validateRuntimeManifest(JSON.parse(manifestJson))); } catch { return false; }
}

export interface ChunkMapLoadProgress { readonly verifiedChunks: number; readonly totalChunks: number }
/** Retained only for one publication by its owner; corrupt/unverified bytes are never reused. */
export interface ChunkMapLoadState {
  readonly verifiedBlobs: Map<string, Uint8Array>;
  readonly onProgress?: (progress: ChunkMapLoadProgress) => void;
}

/** The map head a chunk publication describes. Every blob is verified against the manifest. */
export async function loadChunkMapHead(mapId: string, manifestJson: string, readBlob: ChunkMapBlobReader, concurrency = 8, signal?: AbortSignal, state?: ChunkMapLoadState): Promise<ChunkMapHead> {
  const manifest: WorldChunkManifest = validateRuntimeManifest(JSON.parse(manifestJson));
  if (!manifestCarriesAuthoredDocument(manifest)) throw new Error('chunk_map_document_missing');
  const blobs = new Map<string, Uint8Array>();
  const heads = [...new Map(manifest.chunks.map(head => [head.contentHash, head])).values()];
  const pending = [...heads];
  const controller = new AbortController();
  const readSignal = signal === undefined ? controller.signal : AbortSignal.any([controller.signal, signal]);
  if (readSignal.aborted) throw new Error('chunk_map_load_cancelled');
  // Recheck retained bytes against this manifest before counting or rebuilding with them.
  for (const head of heads) {
    const bytes = state?.verifiedBlobs.get(head.contentHash);
    if (bytes === undefined) continue;
    try { verifyRuntimeChunk(bytes, manifest, head.cx, head.cy); }
    catch (error: unknown) { state?.verifiedBlobs.delete(head.contentHash); throw error; }
    blobs.set(head.contentHash, bytes);
  }
  const progress = () => state?.onProgress?.({ verifiedChunks: blobs.size, totalChunks: heads.length });
  progress();
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    for (let head = pending.shift(); head !== undefined && !readSignal.aborted; head = pending.shift()) {
      if (blobs.has(head.contentHash)) continue;
      const bytes = await readBlob({ spaceId: manifest.spaceId, cx: head.cx, cy: head.cy, contentHash: head.contentHash, byteLength: head.byteLength }, readSignal);
      if (readSignal.aborted) throw new Error('chunk_map_load_cancelled');
      verifyRuntimeChunk(bytes, manifest, head.cx, head.cy);
      // The reader may retain its buffer; keep our verified snapshot private across retries.
      const retained = state === undefined ? bytes : bytes.slice();
      state?.verifiedBlobs.set(head.contentHash, retained);
      blobs.set(head.contentHash, retained);
      progress();
    }
  })).catch((error: unknown) => { controller.abort(); throw error; });
  if (readSignal.aborted) throw new Error('chunk_map_load_cancelled');
  const document = rebuildWorldChunkDocument(manifest, hash => blobs.get(hash));
  if (document.id !== mapId) throw new Error('chunk_map_id_mismatch');
  const head = liveMapHeadSource(document, manifest.sourceRevision);
  if (head.contentHash !== manifest.sourceHash) throw new Error('chunk_map_head_unverified');
  return { mapId, revision: manifest.sourceRevision, contentHash: head.contentHash, documentJson: head.documentJson };
}
