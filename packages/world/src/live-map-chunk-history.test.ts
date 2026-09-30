import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { canonicalChunkJson } from '@orchard/sim/world-chunk';
import { serializeMapDocumentV3 } from '@orchard/sim';
import { chunkHistoryFixture } from './live-map-chunk-history.fixture.js';
import { chunkHistoryBlobReferences, repinChunkHistoryManifest, retireTopsideAuditDocuments, verifiedChunkHistoryDocument } from './live-map-chunk-history.js';
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


describe('retiring old topside restore audit copies', () => {
  it('verifies inverse and diff bodies before removing either, preserving the usable stable inverse', () => {
    const publication = chunkHistoryFixture();
    const reference = {revisionId:'42',mapId:'live-island',revision:7,contentHash:publication.head.contentHash,documentHash:'exact'};
    const payload = JSON.stringify({ schemaVersion:1, reason:'Original reason', inverse:{operation:'restore_map',args:{revisionId:'42',documentJson:publication.head.documentJson}},
      changes:[{path:'/mapHead/documentJson',before:{present:true,value:publication.head.documentJson},after:{present:true,value:publication.head.documentJson}}] });
    const resolve=(body:string)=>{verifiedChunkHistoryDocument(publication.head,publication.manifestJson,publication.readBlob,body);return reference;};
    const retired=retireTopsideAuditDocuments(payload,resolve);
    expect(retired.copies).toBe(3);expect(retired.payloadJson).not.toContain('documentJson');
    expect(JSON.parse(retired.payloadJson)).toMatchObject({schemaVersion:1,reason:'Original reason',inverse:{operation:'restore_map',args:{revisionId:'42',documentReference:reference}}});
    let persisted=payload;
    expect(()=>{persisted=retireTopsideAuditDocuments(payload,()=>{throw new Error('chunk_history_audit_orphan');}).payloadJson;}).toThrow('orphan');
    expect(persisted).toBe(payload);
    expect(()=>retireTopsideAuditDocuments(payload,()=>({...reference,revisionId:'99'}))).toThrow('reference_mismatch');
    const wrongPayload=JSON.parse(payload);
    wrongPayload.inverse.args.documentJson=JSON.stringify({...publication.document,title:'Mismatch'});
    const wrong=JSON.stringify(wrongPayload);
    expect(()=>retireTopsideAuditDocuments(wrong,resolve)).toThrow();
  });
  it('leaves other spaces and already retired metadata byte-for-byte unchanged',()=>{
    const payload=JSON.stringify({inverse:{operation:'restore_map',args:{revisionId:'42',mapId:'other-space',documentJson:JSON.stringify({id:'other-space',revision:7})}}});
    expect(retireTopsideAuditDocuments(payload,()=>{throw new Error('out_of_scope');})).toEqual({payloadJson:payload,copies:0});
    const wrongTopside=payload.replace('\"mapId\":\"other-space\"','\"mapId\":\"live-island\"');
    expect(()=>retireTopsideAuditDocuments(wrongTopside,()=>{throw new Error('unexpected');})).toThrow('document_mismatch');
    expect(()=>retireTopsideAuditDocuments(wrongTopside,()=>{throw new Error('unexpected');},false)).toThrow('document_mismatch');
  });
});


it('the actual retirement reducer preserves every old payload on a preview mismatch, then updates audit metadata and deletes only verified obsolete topside receipts',()=>{
  const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
  const from=source.indexOf('export const retireLiveMapAuditDocuments');
  const body=source.slice(source.indexOf('ctx => {',from)+8,source.indexOf('\n});',from));
  const publication=chunkHistoryFixture();
  const oldPayload=JSON.stringify({inverse:{operation:'restore_map',args:{revisionId:'42',documentJson:publication.head.documentJson}},changes:[]});
  const audit={id:12n,actor:'original-owner',occurredAtMicros:123n,payload:oldPayload};
  const update=vi.fn();const remove=vi.fn();
  let malformed=true;
  const retired=(_ctx:unknown,payload:string)=>retireTopsideAuditDocuments(payload,documentJson=>{
    verifiedChunkHistoryDocument(publication.head,publication.manifestJson,publication.readBlob,documentJson);
    return {revisionId:'42',mapId:'live-island',revision:7,contentHash:publication.head.contentHash,documentHash:'exact'};
  });
  const execute=new Function('requireWorldOwner','retiredTopsideAuditPayload',`return ctx=>{${body}}`)(()=>{},retired);
  const context={sender:'owner',senderAuth:{jwt:{}},db:{membership:{identity:{find:()=>({})}},world_admin_audit:{by_operation:{filter:()=>[audit]},id:{update}},
    admin_mutation_preview:{iter:()=>[{id:'old-topside',operation:'restore_map',previewJson:malformed?oldPayload.replace('"42"','"99"'):oldPayload},
      {id:'other-operation',operation:'set_time',previewJson:oldPayload},
      {id:'other-space',operation:'restore_map',previewJson:JSON.stringify({documentJson:JSON.stringify({id:'other-space'})})}],id:{delete:remove}}}};
  // A retained topside body whose verified history id disagrees fails before any audit or preview write.
  expect(()=>execute(context)).toThrow('reference_mismatch');expect(update).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(audit.payload).toBe(oldPayload);
  malformed=false;execute(context);expect(update).toHaveBeenCalledWith(expect.objectContaining({id:12n,actor:'original-owner',occurredAtMicros:123n}));
  expect(JSON.parse(update.mock.calls[0]![0].payload).inverse.args.revisionId).toBe('42');expect(remove).toHaveBeenCalledExactlyOnceWith('old-topside');
});
