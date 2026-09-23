import { expect,it } from 'vitest';
import { runtimeChunkFixture } from './chunk-runtime.fixture.js';
import { validateRuntimeManifest,verifyRuntimeChunk,sampleChunkCollision,chunkBlobPath,assertChunkRuntimeMode } from './chunk-runtime.js';
it('verifies revision and hash then samples signed interior and halo without traversal policy',()=>{
  const {blobs,manifest}=runtimeChunkFixture([[-1,0]]),chunk=verifyRuntimeChunk(blobs[0]!,manifest,-1,0);
  expect(sampleChunkCollision(chunk,-1,0)).toMatchObject({ready:true,medium:0,solidBlocked:false,legacyWaterBlocked:true});
  expect(sampleChunkCollision(chunk,0,0).ready).toBe(true);
  expect(sampleChunkCollision(chunk,1,0).ready).toBe(false);
  expect(sampleChunkCollision(undefined,0,0)).toMatchObject({ready:false,medium:5,solidBlocked:true});
  expect(()=>verifyRuntimeChunk(blobs[0]!,{...manifest,assetRevision:'other'},-1,0)).toThrow(/revision/);
  const bad=blobs[0]!.slice();bad[bad.length-1]=bad[bad.length-1]!^1;expect(()=>verifyRuntimeChunk(bad,manifest,-1,0)).toThrow(/hash/);
});
it('rejects malformed heads and any attempted live activation',()=>{
  const {manifest}=runtimeChunkFixture();expect(validateRuntimeManifest(manifest)).toBe(manifest);
  expect(()=>validateRuntimeManifest({...manifest,chunks:[...manifest.chunks,...manifest.chunks]})).toThrow(/head/);
  expect(()=>chunkBlobPath(0,'../../secret')).toThrow();
  expect(()=>assertChunkRuntimeMode('live')).toThrow(/not_approved/);
  expect(()=>assertChunkRuntimeMode('shadow')).not.toThrow();
});
