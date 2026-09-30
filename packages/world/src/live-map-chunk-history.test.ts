import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalChunkJson } from '@orchard/sim/world-chunk';
import { serializeMapDocumentV3 } from '@orchard/sim';
import { chunkHistoryFixture } from './live-map-chunk-history.fixture.js';
import { chunkHistoryBlobReferences, repinChunkHistoryManifest, verifiedChunkHistoryDocument } from './live-map-chunk-history.js';
import { planChunkStage, CHUNK_STAGE_TTL_MICROS } from './content/chunk-shadow-runtime.js';

describe('S7c chunk manifest history', () => {
  it('verifies compact and pretty legacy documents exactly before their copies can retire', () => {
    const { head, manifestJson, readBlob, document } = chunkHistoryFixture();
    expect(verifiedChunkHistoryDocument(head, manifestJson, readBlob, head.documentJson)).toEqual(document);
    expect(verifiedChunkHistoryDocument(head, manifestJson, readBlob, serializeMapDocumentV3(document))).toEqual(document);
    expect(() => verifiedChunkHistoryDocument(head, manifestJson, readBlob,
      JSON.stringify({ ...document, title: 'Changed' }))).toThrow('legacy_document_mismatch');
  });

  it('refuses wrong history pins, missing or tampered bytes and forged authored metadata', () => {
    const { head, manifest, manifestJson, readBlob, blobs } = chunkHistoryFixture();
    expect(() => verifiedChunkHistoryDocument({ ...head, revision: 8 }, manifestJson, readBlob)).toThrow('head_mismatch');
    expect(() => verifiedChunkHistoryDocument({ ...head, mapId: 'another' }, manifestJson, readBlob)).toThrow('document_mismatch');
    expect(() => verifiedChunkHistoryDocument(head, manifestJson, () => undefined)).toThrow('blob_missing');
    const bytes = [...blobs.values()][0]!.slice(); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    expect(() => verifiedChunkHistoryDocument(head, manifestJson, () => bytes)).toThrow();
    const authored = manifest.metadata['authoredDocument'] as Record<string, unknown>;
    const forged = canonicalChunkJson({ ...manifest, metadata: { ...manifest.metadata,
      authoredDocument: { ...authored, documentSha256: '0'.repeat(64) } } });
    expect(() => verifiedChunkHistoryDocument(head, forged, readBlob)).toThrow('sha256_mismatch');
  });

  it('restores at a new revision with the exact same shared blobs and correct new document hash', () => {
    const { document, manifestJson, manifest, readBlob } = chunkHistoryFixture();
    const repinned = repinChunkHistoryManifest(manifestJson, document, 14);
    const next = JSON.parse(repinned) as typeof manifest;
    expect(next.chunks).toEqual(manifest.chunks);
    expect(next.sourceRevision).toBe(14);
    expect(next.sourceHash).not.toBe(manifest.sourceHash);
    const rebuilt = verifiedChunkHistoryDocument({ mapId: 'live-island', revision: 14, contentHash: next.sourceHash }, repinned, readBlob);
    expect(rebuilt).toEqual({ ...document, revision: 14 });
  });

  it('pins historical shared blobs through staging expiry even after all live heads move', () => {
    const { manifestJson, manifest } = chunkHistoryFixture();
    const hash = manifest.chunks[0]!.contentHash;
    const references = chunkHistoryBlobReferences([manifestJson, manifestJson]);
    expect(references.size).toBe(1);
    const expired = planChunkStage([{ contentHash: hash, stagedAtMicros: 0n, byteLength: 100 },
      { contentHash: 'unreferenced', stagedAtMicros: 0n, byteLength: 100 }], references, CHUNK_STAGE_TTL_MICROS, 1);
    expect(expired.expired).toEqual([{ contentHash: hash, deleteBlob: false }, { contentHash: 'unreferenced', deleteBlob: true }]);
  });

  it('keeps privacy, verified backfill-before-clear and atomic restore enforced at the reducer seams', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/name: 'live_map_document'[^}]*public:\s*true/u);
    const backfill = source.slice(source.indexOf('export const backfillLiveMapChunkHistory'), source.indexOf('export const verifyLiveMapChunkHistory'));
    expect(backfill).toContain('requireWorldOwner');
    expect(backfill.indexOf('verifiedChunkHistoryDocument')).toBeLessThan(backfill.indexOf("documentJson: ''"));
    expect(backfill).toContain('expectedManifestHash');
    expect(backfill).toContain('validateShadowPublication');
    const restore = source.slice(source.indexOf('function commitRestoredLiveMapSnapshot'), source.indexOf('export const readLiveMapPublicationBase'));
    expect(restore).toContain('repinChunkHistoryManifest');
    expect(restore).toContain('requireSameChunkAssetRevision');
    expect(restore).toContain('commitWorldChunkShadow');
    expect(restore).toContain('requireServableChunkPublication');
  });
});
