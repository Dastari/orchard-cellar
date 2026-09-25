import { expect,it } from 'vitest';
import { runtimeChunkFixture } from './chunk-runtime.fixture.js';
import { validateRuntimeManifest,verifyRuntimeChunk,sampleChunkCollision,chunkBlobPath,assertChunkRuntimeMode,parseChunkRuntimeMode,MISSING_CHUNK_SAMPLE,
  composeAuthorityObstacles,authorityObstacleKey } from './chunk-runtime.js';
import { decodeWorldChunk } from './world-chunk.js';
import { decodeWorldChunk as legacyDecodeWorldChunk } from './world-chunk.schema1-legacy.fixture.js';
it('verifies revision and hash then samples signed interior and halo without traversal policy',()=>{
  const {blobs,manifest}=runtimeChunkFixture([[-1,0]]),chunk=verifyRuntimeChunk(blobs[0]!,manifest,-1,0);
  expect(sampleChunkCollision(chunk,-1,0)).toMatchObject({ready:true,medium:0,solidBlocked:false,legacyWaterBlocked:true});
  expect(sampleChunkCollision(chunk,0,0).ready).toBe(true);
  expect(sampleChunkCollision(chunk,1,0).ready).toBe(false);
  expect(sampleChunkCollision(undefined,0,0)).toMatchObject({ready:false,medium:5,solidBlocked:true});
  expect(()=>verifyRuntimeChunk(blobs[0]!,{...manifest,assetRevision:'other'},-1,0)).toThrow(/revision/);
  const bad=blobs[0]!.slice();bad[bad.length-1]=bad[bad.length-1]!^1;expect(()=>verifyRuntimeChunk(bad,manifest,-1,0)).toThrow(/hash/);
});
it('rejects malformed heads and unknown runtime modes',()=>{
  const {manifest}=runtimeChunkFixture();expect(validateRuntimeManifest(manifest)).toBe(manifest);
  expect(()=>validateRuntimeManifest({...manifest,chunks:[...manifest.chunks,...manifest.chunks]})).toThrow(/head/);
  expect(()=>chunkBlobPath(0,'../../secret')).toThrow();
  for(const bad of ['live','ON','On',' on','shadow ','true','1'])expect(()=>assertChunkRuntimeMode(bad)).toThrow(/mode_invalid/);
  for(const mode of ['off','shadow','on'])expect(()=>assertChunkRuntimeMode(mode)).not.toThrow();
});
it('parses an unset or empty mode as off and never guesses',()=>{
  expect(parseChunkRuntimeMode(undefined)).toBe('off');expect(parseChunkRuntimeMode('')).toBe('off');
  expect(parseChunkRuntimeMode('shadow')).toBe('shadow');expect(parseChunkRuntimeMode('on')).toBe('on');
  expect(()=>parseChunkRuntimeMode('live')).toThrow(/mode_invalid/);
});
it('samples authority channels only when the extension is present',()=>{
  const plain=runtimeChunkFixture([[0,0]]),authority=runtimeChunkFixture([[0,0]],{authority:true});
  expect(sampleChunkCollision(verifyRuntimeChunk(plain.blobs[0]!,plain.manifest,0,0),5,5).authority).toBeUndefined();
  expect(sampleChunkCollision(verifyRuntimeChunk(authority.blobs[0]!,authority.manifest,0,0),5,5)).toMatchObject({ready:true,legacyWaterBlocked:true,
    authority:{groundBlocked:true,groundElevation:-2,groundHorseJumpable:true,waterBlocked:false,combatRegion:2}});
  expect(MISSING_CHUNK_SAMPLE.authority).toBeUndefined();
});
it('keeps deployed schema-1 decoders compatible with authority blobs (extension ignored)',()=>{
  const {blobs,manifest}=runtimeChunkFixture([[-1,0],[0,0]],{authority:true});
  for(const [index,bytes] of blobs.entries()){
    const legacy=legacyDecodeWorldChunk(bytes,manifest.chunks[index]!.contentHash);
    // The deployed shadow/runtime gates only require schema 1 and the medium extension.
    expect(legacy.schema).toBe(1);expect(legacy.mediumSchema).toBe(1);
    expect(legacy.contentHash).toBe(manifest.chunks[index]!.contentHash);
    expect(Object.keys(legacy.arrays)).toEqual(expect.arrayContaining(['medium','solidBlocked','authority.ground.blocked','authority.combatRegion']));
    expect(legacy.records.map(record=>record.kind)).toContain('authority.resource');
    expect(decodeWorldChunk(bytes)).toEqual(legacy);
  }
  expect(sampleChunkCollision(legacyDecodeWorldChunk(blobs[1]!),0,0)).toMatchObject({ready:true,authority:{groundBlocked:true}});
});
it('composes base, live and authored obstacles in server order with suppression',()=>{
  const box=(left:number)=>({left,top:0,right:left+9,bottom:9});
  const rows=[{group:'base' as const,ordinal:0,...box(0),sourceId:'decoration:1'},{group:'base' as const,ordinal:1,...box(10),sourceId:'decoration:2'},
    {group:'authored' as const,ordinal:0,...box(20),sourceId:'landmark:a'}];
  expect(composeAuthorityObstacles(rows,[{medium:'ground',...box(10)},{medium:'water',...box(0)}],'ground',[box(30),box(10)]))
    .toEqual([box(0),box(30),box(20)]);
  expect(authorityObstacleKey(box(10))).toBe('10:0:19:9');
  expect(()=>composeAuthorityObstacles([rows[2]!,rows[0]!],[],'ground')).toThrow(/order/);
  expect(()=>composeAuthorityObstacles([rows[1]!],[],'ground')).toThrow(/order/);
});
