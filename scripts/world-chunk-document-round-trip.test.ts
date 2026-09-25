import { beforeAll, describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, parseMapDocumentV3, serializeMapDocumentV3, TOPSIDE_SPACE_ID,
  type ContentRegistry, type MapDocumentV3 } from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { CHUNK_RUNTIME_MAX_BLOB_BYTES, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import { canonicalChunkJson, decodeWorldChunk, type WorldChunk } from '@orchard/sim/world-chunk';
import { decodeWorldChunk as legacyDecodeWorldChunk } from '../packages/sim/src/world-chunk.schema1-legacy.fixture.js';
import { normalizedMapDocumentSemanticHash, rebuildWorldChunkDocument } from '@orchard/sim/world-chunk-document';
import { captureWorldChunkSnapshot, liveDocumentSemanticHash, materializeWorldChunks, verifyWorldChunkParity,
  type MaterializedWorldChunks, type WorldChunkSnapshot } from './materialize-world-chunks.js';
import { authoredRoundTripRow, bootstrapRoundTripRow } from './world-chunk-document.fixture.js';

/** Static-world S7a: the live map document round-trips through the published chunks
 * plus the manifest (the authored-document extension), on the bootstrap island and on
 * an authored document with every cell field, list and history-dependent key order. */
function readerFor(published: MaterializedWorldChunks): (hash: string) => Uint8Array | undefined {
  const blobs = new Map(published.manifest.chunks.map((head, index) => [head.contentHash, published.blobs[index]!]));
  return hash => blobs.get(hash);
}
/** A decoded chunk without the extension's header keys. */
function withoutExtension(chunk: WorldChunk): Omit<WorldChunk, 'contentHash'> {
  const rest: Record<string, unknown> = { ...chunk };
  for (const key of ['contentHash', 'documentSchema', 'documentCells']) delete rest[key];
  return rest as Omit<WorldChunk, 'contentHash'>;
}

describe.each([
  ['bootstrap island', bootstrapRoundTripRow],
  ['authored document', authoredRoundTripRow],
] as const)('authored document round trip: %s', (_name, fixture) => {
  let registry: ContentRegistry;
  let row: LiveMapDocumentRow;
  let snapshot: WorldChunkSnapshot;
  let published: MaterializedWorldChunks;
  let extended: MaterializedWorldChunks;
  let rebuilt: MapDocumentV3;
  beforeAll(() => {
    registry = bootstrapContentRegistry();
    row = fixture(registry);
    snapshot = captureWorldChunkSnapshot(row, registry);
    published = materializeWorldChunks(snapshot, row, registry);
    extended = materializeWorldChunks(snapshot, row, registry, { includeAuthoredDocument: true });
    rebuilt = rebuildWorldChunkDocument(extended.manifest, readerFor(extended));
  }, 180_000);

  it('rebuilds the live document from the chunks plus the manifest with the live semantic hash', () => {
    const live = snapshot.document;
    expect(liveDocumentSemanticHash(rebuilt)).toBe(liveDocumentSemanticHash(live));
    expect(normalizedMapDocumentSemanticHash(rebuilt)).toBe(liveDocumentSemanticHash(live));
    expect(serializeMapDocumentV3(rebuilt)).toBe(serializeMapDocumentV3(live));
    // Studio parses what it loads: the rebuilt document is a parse fixed point of the live one.
    const reparsed = parseMapDocumentV3(serializeMapDocumentV3(rebuilt), activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID));
    expect(liveDocumentSemanticHash(reparsed)).toBe(liveDocumentSemanticHash(live));
    expect(rebuilt).toEqual(live);
    // The materializer's own gate (verifyWorldChunkParity) runs the same round trip.
    verifyWorldChunkParity(snapshot, extended);
  }, 180_000);

  it('changes nothing unless the option is on: the extension is only additive header data', () => {
    expect(() => rebuildWorldChunkDocument(published.manifest, readerFor(published))).toThrow('chunk_document_metadata_missing');
    expect('authoredDocument' in published.manifest.metadata).toBe(false);
    const { authoredDocument, ...metadata } = extended.manifest.metadata;
    expect(authoredDocument).toBeDefined();
    expect(canonicalChunkJson(metadata)).toBe(canonicalChunkJson(published.manifest.metadata));
    for (const [index, bytes] of extended.blobs.entries()) {
      const chunk = decodeWorldChunk(bytes), plain = decodeWorldChunk(published.blobs[index]!);
      expect(chunk.documentSchema).toBe(1);
      expect('documentSchema' in plain || 'documentCells' in plain).toBe(false);
      expect(withoutExtension(chunk)).toEqual(withoutExtension(plain));
    }
  }, 180_000);

  it('stays readable by deployed decoders and within the runtime blob budget', () => {
    for (const [index, bytes] of extended.blobs.entries()) {
      const head = extended.manifest.chunks[index]!;
      expect(bytes.length).toBeLessThan(CHUNK_RUNTIME_MAX_BLOB_BYTES);
      expect(verifyRuntimeChunk(bytes, extended.manifest, head.cx, head.cy).contentHash).toBe(head.contentHash);
      const legacy = legacyDecodeWorldChunk(bytes, head.contentHash);
      const current = decodeWorldChunk(published.blobs[index]!);
      expect(legacy.arrays).toEqual(current.arrays);
      expect(legacy.records).toEqual(current.records);
      expect(legacy.cellParts).toEqual(current.cellParts);
    }
  }, 180_000);

  it('is idempotent: re-materializing the rebuilt document reproduces every chunk byte for byte', () => {
    const again = { ...row, documentJson: serializeMapDocumentV3(rebuilt) };
    const replay = captureWorldChunkSnapshot(again, registry);
    for (const [options, expected] of [[{}, published], [{ includeAuthoredDocument: true }, extended]] as const) {
      const materialized = materializeWorldChunks(replay, again, registry, options);
      expect(canonicalChunkJson(materialized.manifest)).toBe(canonicalChunkJson(expected.manifest));
      expect(materialized.blobs.length).toBe(expected.blobs.length);
      for (const [index, bytes] of materialized.blobs.entries()) expect(Buffer.compare(bytes, expected.blobs[index]!), `chunk ${index}`).toBe(0);
    }
  }, 180_000);
});
