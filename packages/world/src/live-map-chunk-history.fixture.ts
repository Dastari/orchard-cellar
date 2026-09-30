import { createEmptyMapDocument, liveMapHeadSource, migrateMapDocumentV2, serializeMapDocumentV3, type MapDocumentV3 } from '@orchard/sim';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, WORLD_CHUNK_STRIDE, type ChunkJson, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import { WORLD_CHUNK_DOCUMENT_METADATA_KEYS, worldChunkAuthoredDocument, worldChunkDocumentCellsByChunk } from '@orchard/sim/world-chunk-document';

/** Tiny authored publication. Real codec and exact document metadata; no generator/compiler work. */
export function chunkHistoryFixture(revision = 7) {
  const head = liveMapHeadSource({ ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'live-island', title: 'Archive', width: 64, height: 64 })),
    landmarks: [], cells: { '1,2': { elevation: 1, collision: 'force_block' } } }, revision);
  const document: MapDocumentV3 = head.document;
  const normalized = JSON.parse(serializeMapDocumentV3(document)) as Record<string, ChunkJson> & { cells: Record<string, Record<string, ChunkJson>> };
  const semanticHash = liveMapHeadSource(document, 0).contentHash;
  const bytes = encodeWorldChunk({ schema: 1, mediumSchema: 1, spaceId: 0, cx: 0, cy: 0, assetRevision: 'assets',
    arrays: { biomes: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2) }, records: [], assetIds: [], atlasPackIds: [],
    documentSchema: 1, documentCells: worldChunkDocumentCellsByChunk(normalized.cells, 64, 64).get('0:0')! });
  const contentHash = decodeWorldChunk(bytes).contentHash;
  const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 0, width: 64, height: 64,
    assetRevision: 'assets', sourceRevision: revision, sourceHash: head.contentHash, chunks: [{ cx: 0, cy: 0, contentHash, byteLength: bytes.byteLength }],
    metadata: { biomePalette: ['grass'], document: Object.fromEntries(WORLD_CHUNK_DOCUMENT_METADATA_KEYS
      .filter(key => normalized[key] !== undefined).map(key => [key, normalized[key]!])), authoredDocument: worldChunkAuthoredDocument(normalized, semanticHash) as unknown as ChunkJson } };
  const blobs = new Map([[contentHash, bytes]]);
  return { document, head: { mapId: document.id, ...head, revision }, manifest,
    manifestJson: canonicalChunkJson(manifest), blobs, readBlob: (hash: string) => blobs.get(hash) };
}
