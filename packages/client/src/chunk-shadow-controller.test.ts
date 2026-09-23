import {expect,it,vi} from 'vitest';
import type {DbConnection} from '@orchard/world-bindings';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {decodeWorldChunk,encodeWorldChunk,worldChunkHash} from '@orchard/sim/world-chunk';
import {ChunkShadowController} from './chunk-shadow-controller.js';

it('waits for regional heads, verifies actual asset bytes and compares diagnostics without changing authority',async()=>{
 const original=runtimeChunkFixture(),assets=new TextEncoder().encode('{"assetPacks":{}}'),assetRevision=worldChunkHash(assets);
 const bytes=encodeWorldChunk({...decodeWorldChunk(original.blobs[0]!),assetRevision}),hash=decodeWorldChunk(bytes).contentHash;
 const manifest={...original.manifest,assetRevision,chunks:[{cx:0,cy:0,byteLength:bytes.length,contentHash:hash}]};
 const callbacks:Array<()=>void>=[];const events={onInsert:(fn:()=>void)=>callbacks.push(fn),onUpdate:(fn:()=>void)=>callbacks.push(fn),onDelete:(fn:()=>void)=>callbacks.push(fn)};
 let published=false;const unsubscribe=vi.fn();let applied=()=>{};
 const builder={onApplied:(fn:()=>void)=>{applied=fn;return builder;},onError:()=>builder,subscribe:()=>{queueMicrotask(()=>applied());return {unsubscribe};}};
 const connection={db:{worldChunkShadow:{...events,spaceId:{find:()=>({revision:1,spaceId:0n,contentHash:'content-1',manifestJson:JSON.stringify(manifest)})}},
  worldChunkHead:{...events,iter:()=>published?[{cx:0,cy:0,spaceId:0n,revision:1,contentHash:hash}]:[]}},subscriptionBuilder:()=>builder} as unknown as DbConnection;
 const fetchMock=vi.fn(async(path:string)=>new Response(Uint8Array.from(path.includes('atlas.packs')?assets:bytes).buffer));vi.stubGlobal('fetch',fetchMock);
 const controller=new ChunkShadowController();const source={mapRevision:3,mapHash:'map-3',contentHash:'content-1'};
 try{
  controller.update(connection,0n,[0,0,0,0],source);await vi.waitFor(()=>expect(controller.status.state).toBe('awaiting_heads'));
  expect(fetchMock).toHaveBeenCalledTimes(1);expect(controller.compare(0,0,false)).toBeUndefined();
  published=true;for(const callback of callbacks)callback();await vi.waitFor(()=>expect(controller.status.state).toBe('shadow'));
  expect(controller.compare(0,0,true)).toMatchObject({ready:true,solidBlocked:false});expect(controller.status.differences).toBe(1);
  controller.update(connection,0n,[0,0,0,0],{...source,contentHash:'changed'});await vi.waitFor(()=>expect(controller.status.state).toBe('source_mismatch'));
  expect(controller.compare(0,0,false)).toBeUndefined();
 }finally{controller.dispose();vi.unstubAllGlobals();}
 expect(unsubscribe).toHaveBeenCalled();
});
