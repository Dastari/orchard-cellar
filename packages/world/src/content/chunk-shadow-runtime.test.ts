import {expect,it} from 'vitest';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {validateShadowPublication,ShadowChunkCollisionCache} from './chunk-shadow-runtime.js';
it('publishes only complete verified data at the exact map/content/CAS revision',()=>{
 const {manifest,blobs}=runtimeChunkFixture(),input={manifestJson:JSON.stringify(manifest),contentHash:'content-1',expectedRevision:0};
 const current={mapRevision:3,mapHash:'map-3',contentHash:'content-1',shadowRevision:0};
 expect(validateShadowPublication(input,current,()=>blobs[0])).toEqual(manifest);
 expect(()=>validateShadowPublication(input,{...current,shadowRevision:1},()=>blobs[0])).toThrow(/revision_conflict/);
 expect(()=>validateShadowPublication(input,{...current,contentHash:'other'},()=>blobs[0])).toThrow(/source_conflict/);
 expect(()=>validateShadowPublication(input,current,()=>undefined)).toThrow(/missing/);
});
it('server samples only one verified chunk; absent data stays blocked',()=>{
 const {manifest,blobs}=runtimeChunkFixture(),cache=new ShadowChunkCollisionCache(1);
 expect(cache.sample(undefined,0,0,()=>undefined).ready).toBe(false);
 expect(cache.sample(manifest.chunks[0]!.contentHash,0,0,()=>blobs[0])).toMatchObject({ready:true,solidBlocked:false});
 expect(()=>cache.sample('0'.repeat(64),0,0,()=>blobs[0])).toThrow(/hash/);
});
