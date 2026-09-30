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

/** The map head a chunk publication describes. Every blob is verified against the manifest. */
export async function loadChunkMapHead(mapId: string, manifestJson: string, readBlob: ChunkMapBlobReader, concurrency = 8, signal?: AbortSignal): Promise<ChunkMapHead> {
  const manifest: WorldChunkManifest = validateRuntimeManifest(JSON.parse(manifestJson));
  if (!manifestCarriesAuthoredDocument(manifest)) throw new Error('chunk_map_document_missing');
  const blobs = new Map<string, Uint8Array>();
  const pending = [...new Map(manifest.chunks.map(head => [head.contentHash, head])).values()];
  const controller = new AbortController();
  const readSignal = signal === undefined ? controller.signal : AbortSignal.any([controller.signal, signal]);
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    for (let head = pending.shift(); head !== undefined && !readSignal.aborted; head = pending.shift()) {
      const bytes = await readBlob({ spaceId: manifest.spaceId, cx: head.cx, cy: head.cy, contentHash: head.contentHash, byteLength: head.byteLength }, readSignal);
      verifyRuntimeChunk(bytes, manifest, head.cx, head.cy);
      blobs.set(head.contentHash, bytes);
    }
  })).catch((error: unknown) => { controller.abort(); throw error; });
  if (readSignal.aborted) throw new Error('chunk_map_load_cancelled');
  const document = rebuildWorldChunkDocument(manifest, hash => blobs.get(hash));
  if (document.id !== mapId) throw new Error('chunk_map_id_mismatch');
  const head = liveMapHeadSource(document, manifest.sourceRevision);
  if (head.contentHash !== manifest.sourceHash) throw new Error('chunk_map_head_unverified');
  return { mapId, revision: manifest.sourceRevision, contentHash: head.contentHash, documentJson: head.documentJson };
}
