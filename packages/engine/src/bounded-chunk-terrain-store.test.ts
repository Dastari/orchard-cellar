import {expect,it} from 'vitest';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {BoundedChunkTerrainStore} from './bounded-chunk-terrain-store.js';
it('bounds resident chunks, retains ring pins, evicts LRU and exposes missing cells',()=>{
 const {manifest,blobs}=runtimeChunkFixture([[0,0],[1,0],[2,0],[3,0]]),store=new BoundedChunkTerrainStore(manifest,{maxChunks:2});
 store.pinView(0,0,0,0);store.install(blobs[0]!,0,0);store.install(blobs[1]!,1,0);
 expect(store.pinnedReady).toBe(true);expect(store.pinnedPackIds).toEqual(['terrain-core']);
 expect(()=>store.install(blobs[2]!,2,0)).toThrow(/pins/);expect(store.residentCount).toBe(2);
 store.pinView(192,0,192,0);store.install(blobs[2]!,2,0);store.install(blobs[3]!,3,0);
 expect(store.residentCount).toBe(2);expect(store.hasTile(0,0)).toBe(false);expect(store.sample(0,0).solidBlocked).toBe(true);
 expect(store.residentBytes).toBe(blobs[2]!.length+blobs[3]!.length);
});
it('rejects oversized pin sets atomically and does not install corrupt data',()=>{
 const {manifest,blobs}=runtimeChunkFixture([[0,0],[1,0],[2,0]]),store=new BoundedChunkTerrainStore(manifest,{maxChunks:2});
 store.pinView(0,0,0,0);expect(()=>store.pinView(64,0,64,0)).toThrow(/pins/);expect(store.pinnedKeys).toEqual(['0:0','1:0']);
 const bad=blobs[0]!.slice();bad[bad.length-1]=bad[bad.length-1]!^1;expect(()=>store.install(bad,0,0)).toThrow();expect(store.residentCount).toBe(0);
});
