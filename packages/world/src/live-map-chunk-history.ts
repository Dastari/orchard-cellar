import { liveMapHeadSource, type MapDocumentV3 } from '@orchard/sim';
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
  if (legacyDocument !== undefined && normalizedMapDocumentSha256(document) !== normalizedMapDocumentSha256(JSON.parse(legacyDocument) as object)) {
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

export interface HistoryDocumentReference {
  readonly revisionId: string; readonly mapId: string; readonly revision: number;
  readonly contentHash: string; readonly documentHash: string;
}

/** Preserve audit metadata and undo identifiers; every removed topside body must resolve exactly first. */
export function retireTopsideAuditDocuments(payloadJson: string,
  resolve: (documentJson: string) => HistoryDocumentReference, verifyIds = true): { readonly payloadJson: string; readonly copies: number } {
  if (payloadJson === '') return { payloadJson, copies: 0 };
  const payload: unknown = JSON.parse(payloadJson);
  let copies = 0;
  const reference = (value: string, hintedTopside = false): HistoryDocumentReference | undefined => {
    const document = JSON.parse(value) as { id?: string };
    if (document.id !== 'live-island') {
      if (hintedTopside) throw new Error('chunk_history_audit_document_mismatch');
      return undefined;
    }
    const result = resolve(value); copies += 1; return result;
  };
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value === null || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (key === 'documentJson' && typeof entry === 'string') {
        const ref = reference(entry, record['mapId'] === 'live-island');
        if (ref !== undefined) {
          if (verifyIds && typeof record['revisionId'] === 'string' && record['revisionId'] !== ref.revisionId) throw new Error('chunk_history_audit_reference_mismatch');
          next['documentReference'] = ref; continue;
        }
      }
      next[key] = visit(entry);
    }
    if (record['path'] === '/mapHead/documentJson') {
      let changed = false;
      for (const side of ['before', 'after']) {
        const snapshot = record[side] as { present?: boolean; value?: unknown } | undefined;
        if (snapshot?.present && typeof snapshot.value === 'string') {
          const ref = reference(snapshot.value);
          if (ref !== undefined) { next[side] = { present: true, value: ref }; changed = true; }
        }
      }
      if (changed) next['path'] = '/mapHead/documentReference';
    }
    return next;
  };
  const result = visit(payload);
  return { payloadJson: copies === 0 ? payloadJson : JSON.stringify(result), copies };
}
