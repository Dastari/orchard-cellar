import { liveMapHeadSource, serializeMapDocumentV3, type MapDocumentV3 } from '@orchard/sim';
import { validateRuntimeManifest } from '@orchard/sim/chunk-runtime';
import { canonicalChunkJson, type ChunkJson, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import { normalizedMapDocumentSha256, rebuildWorldChunkDocument, type WorldChunkAuthoredDocument } from '@orchard/sim/world-chunk-document';

export interface ChunkHistoryRevision {
  readonly mapId: string;
  readonly revision: number;
  readonly contentHash: string;
}

/** Every retained history manifest pins its shared blobs, including blobs no live head references. */
export function chunkHistoryBlobReferences(manifests: Iterable<string>): Set<string> {
  const hashes = new Set<string>();
  for (const json of manifests) {
    const manifest = validateRuntimeManifest(JSON.parse(json));
    for (const head of manifest.chunks) hashes.add(head.contentHash);
  }
  return hashes;
}

/** Exact verification before clearing an old history document or accepting a new archive. */
export function verifiedChunkHistoryDocument(revision: ChunkHistoryRevision, manifestJson: string,
  readBlob: (hash: string) => Uint8Array | undefined, legacyDocument?: string): MapDocumentV3 {
  const manifest = validateRuntimeManifest(JSON.parse(manifestJson));
  if (manifest.spaceId !== 0 || manifest.sourceRevision !== revision.revision || manifest.sourceHash !== revision.contentHash) {
    throw new Error('chunk_history_head_mismatch');
  }
  const document = rebuildWorldChunkDocument(manifest, readBlob);
  const head = liveMapHeadSource(document, revision.revision);
  if (document.id !== revision.mapId || document.revision !== revision.revision || head.contentHash !== revision.contentHash) {
    throw new Error('chunk_history_document_mismatch');
  }
  if (legacyDocument !== undefined && serializeMapDocumentV3(document) !== serializeMapDocumentV3(JSON.parse(legacyDocument) as MapDocumentV3)) {
    throw new Error('chunk_history_legacy_document_mismatch');
  }
  return document;
}

/** Restore advances only the map pin. Content-addressed blobs contain no map revision and are shared. */
export function repinChunkHistoryManifest(manifestJson: string, document: MapDocumentV3, nextRevision: number): string {
  const manifest: WorldChunkManifest = validateRuntimeManifest(JSON.parse(manifestJson));
  const next = liveMapHeadSource(document, nextRevision);
  const authored = manifest.metadata['authoredDocument'] as unknown as WorldChunkAuthoredDocument;
  if (authored?.schema !== 1) throw new Error('chunk_history_document_missing');
  const normalized = JSON.parse(next.documentJson) as object;
  return canonicalChunkJson({ ...manifest, sourceRevision: nextRevision, sourceHash: next.contentHash,
    metadata: { ...manifest.metadata, authoredDocument: {
      ...authored, fields: { ...authored.fields, revision: nextRevision }, documentSha256: normalizedMapDocumentSha256(normalized),
    } as unknown as ChunkJson } });
}
