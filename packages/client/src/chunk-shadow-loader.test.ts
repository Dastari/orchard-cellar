import {expect,it,vi} from 'vitest';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {ChunkShadowLoader,withDatabaseBlobFallback} from './chunk-shadow-loader.js';
import {chunkRuntimeQueries as chunkShadowQueries} from './chunk-runtime-controller.js';
it('discards corrupt persistent data and only installs verified fetched bytes',async()=>{
 const {manifest,blobs}=runtimeChunkFixture(),cache={get:vi.fn(async()=>new Uint8Array([1])),put:vi.fn(async()=>{}),delete:vi.fn(async()=>{})};
 const fetch=vi.fn(async()=>blobs[0]!);const loader=new ChunkShadowLoader(manifest,fetch,cache);
 await loader.updateView(0,0,0,0);expect(cache.delete).toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);expect(loader.store.pinnedReady).toBe(true);
 await loader.updateView(0,0,0,0);expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not install a fetch completing after disposal',async()=>{
 const {manifest,blobs}=runtimeChunkFixture();let release!:(bytes:Uint8Array)=>void;
 const loader=new ChunkShadowLoader(manifest,()=>new Promise(resolve=>{release=resolve;}));const pending=loader.updateView(0,0,0,0);
 await Promise.resolve();await Promise.resolve();loader.dispose();release(blobs[0]!);await pending;expect(loader.store.residentCount).toBe(0);
});
it('regional SQL includes the view plus one ring with signed coordinates',()=>{
 expect(chunkShadowQueries(0n,[-1,-1,64,64])[1]).toContain('cx >= -2 AND cx <= 2');
 expect(()=>chunkShadowQueries(0n,[NaN,0,0,0])).toThrow();
});
it('bounds overlapping-view requests and fails closed on poisoned network data',async()=>{
 const {manifest,blobs}=runtimeChunkFixture([[0,0],[1,0],[2,0],[3,0]]);
 let active=0,peak=0;
 const loader=new ChunkShadowLoader(manifest,async path=>{
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
  return blobs[manifest.chunks.findIndex(h=>path.includes(h.contentHash))]!;
 });
 await Promise.all([loader.updateView(0,0,0,0),loader.updateView(128,0,128,0),loader.updateView(192,0,192,0)]);
 expect(peak).toBeLessThanOrEqual(2);expect(loader.store.hasTile(192,0)).toBe(true);
 const bad=new ChunkShadowLoader(manifest,async()=>new Uint8Array([0]));await expect(bad.updateView(0,0,0,0)).rejects.toThrow();expect(bad.store.residentCount).toBe(0);
});
it('continues through an unavailable optional cache',async()=>{
 const {manifest,blobs}=runtimeChunkFixture();const fail=async()=>{throw new Error('storage_denied');};
 const loader=new ChunkShadowLoader(manifest,async()=>blobs[0]!,{get:fail,put:fail,delete:fail});
 await loader.updateView(0,0,0,0);expect(loader.store.pinnedReady).toBe(true);
});
it('reads a blob the origin does not serve (404 only) from the world database, verified like any other (static world S7b)',async()=>{
 const {manifest,blobs}=runtimeChunkFixture(),head=manifest.chunks[0]!;
 const origin=vi.fn(async():Promise<Uint8Array>=>{throw new Error('chunk_fetch_404');});
 const database=vi.fn(async()=>blobs[0]!);
 const loader=new ChunkShadowLoader(manifest,withDatabaseBlobFallback(origin,manifest,database));
 await loader.updateView(0,0,0,0);expect(loader.store.pinnedReady).toBe(true);
 expect(database).toHaveBeenCalledWith({spaceId:manifest.spaceId,cx:head.cx,cy:head.cy,contentHash:head.contentHash});
 // Other origin failures stay the origin's; the database is not asked.
 const timeout=withDatabaseBlobFallback(async()=>{throw new Error('chunk_fetch_503');},manifest,database);
 await expect(timeout(`/world/${manifest.spaceId}/${head.contentHash}.bin`,head.byteLength)).rejects.toThrow('chunk_fetch_503');
 // A path no head references, or an oversized database answer, is refused.
 await expect(withDatabaseBlobFallback(origin,manifest,database)('/world/0/unknown.bin',head.byteLength)).rejects.toThrow('chunk_fetch_404');
 await expect(withDatabaseBlobFallback(origin,manifest,database)(`/world/${manifest.spaceId}/${head.contentHash}.bin`,1)).rejects.toThrow('chunk_response_too_large');
 expect(database).toHaveBeenCalledTimes(2);
 // Poisoned database bytes fail verification exactly like poisoned served bytes.
 const poisoned=new ChunkShadowLoader(manifest,withDatabaseBlobFallback(origin,manifest,async()=>new Uint8Array(head.byteLength)));
 await poisoned.updateView(0,0,0,0).catch(()=>undefined);expect(poisoned.store.pinnedReady).toBe(false);
 // A database refusal keeps the origin's miss as the error (status and retry), with the refusal as its cause.
 const refused=withDatabaseBlobFallback(origin,manifest,async()=>{throw new Error('chunk_blob_not_published');});
 await expect(refused(`/world/${manifest.spaceId}/${head.contentHash}.bin`,head.byteLength)).rejects.toMatchObject({message:'chunk_fetch_404',cause:new Error('chunk_blob_not_published')});
});
