import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {SHADOW_PUBLICATION_REFUSAL_CODES,shadowPublicationRefusalCode,validateShadowBlob,validateShadowPublication,ShadowChunkCollisionCache} from './chunk-shadow-runtime.js';
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

it('names exactly the known refusals of the shadow validators, so only they become SenderError codes',()=>{
 const {manifest,blobs}=runtimeChunkFixture(),input={manifestJson:JSON.stringify(manifest),contentHash:'content-1',expectedRevision:0};
 const current={mapRevision:3,mapHash:'map-3',contentHash:'content-1',shadowRevision:0};
 const code=(run:()=>unknown)=>{try{run();}catch(error){return shadowPublicationRefusalCode(error);}throw new Error('expected a refusal');};
 expect(code(()=>validateShadowPublication(input,{...current,shadowRevision:1},()=>blobs[0]))).toBe('chunk_shadow_revision_conflict');
 expect(code(()=>validateShadowPublication(input,{...current,contentHash:'other'},()=>blobs[0]))).toBe('chunk_shadow_source_conflict');
 expect(code(()=>validateShadowPublication(input,current,()=>undefined))).toBe('chunk_shadow_blob_missing');
 expect(code(()=>validateShadowBlob(new Uint8Array(1024*1024+1)))).toBe('chunk_blob_too_large');
 // Decoder faults, JSON syntax errors, other codes and non-Error throws are not refusals: they stay plain errors.
 expect(code(()=>validateShadowBlob(new Uint8Array(16)))).toBeNull();
 expect(code(()=>validateShadowPublication({...input,manifestJson:'{'},current,()=>blobs[0]))).toBeNull();
 expect(shadowPublicationRefusalCode(new TypeError('chunk_blob_too_large'))).toBeNull();
 expect(shadowPublicationRefusalCode(new Error('owner_required'))).toBeNull();
 expect(shadowPublicationRefusalCode('chunk_blob_too_large')).toBeNull();
 expect([...SHADOW_PUBLICATION_REFUSAL_CODES].every(value=>value.startsWith('chunk_'))).toBe(true);
 // Both publication reducers route their validator through the mapping.
 const index=readFileSync(new URL('../index.ts',import.meta.url),'utf8');
 const reducer=(name:string)=>index.slice(index.indexOf(`export const ${name} = `),index.indexOf('\n});',index.indexOf(`export const ${name} = `)));
 expect(reducer('stageWorldChunkBlob')).toContain('withShadowPublicationRefusals(() => validateShadowBlob(');
 expect(reducer('publishWorldChunkShadow')).toContain('withShadowPublicationRefusals(() => validateShadowPublication(');
 expect(index).toMatch(/if \(code !== null\) throw new SenderError\(code\);\n\s+throw error;/u);
});
