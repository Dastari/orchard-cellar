import {describe,expect,it,vi} from 'vitest';
import type {DbConnection} from '@orchard/world-bindings';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import type {ChunkRuntimeMode} from '@orchard/sim/chunk-runtime';
import {WORLD_CHUNK_STRIDE,decodeWorldChunk,encodeWorldChunk,worldChunkHash,type WorldChunkManifest} from '@orchard/sim/world-chunk';
import {ChunkRuntimeController,effectiveChunkRuntimeMode,type ChunkRuntimeSource} from './chunk-runtime-controller.js';
import type {ChunkBlobCache} from './chunk-shadow-cache.js';

const assets=new TextEncoder().encode('{"assetPacks":{}}'),assetRevision=worldChunkHash(assets);
const source:ChunkRuntimeSource={mapRevision:3,mapHash:'map-3',contentHash:'content-1'};
const view=[0,0,0,0] as const;

/** One published revision: every chunk solid or open, pinned to the served asset revision. */
function revision(solid:0|1,assetRev=assetRevision,coords:ReadonlyArray<readonly [number,number]>=[[0,0]]){
 const chunks=runtimeChunkFixture(coords).blobs.map(blob=>{
  const base=decodeWorldChunk(blob);
  const bytes=encodeWorldChunk({...base,assetRevision:assetRev,arrays:{...base.arrays,solidBlocked:new Uint8Array(WORLD_CHUNK_STRIDE**2).fill(solid)}});
  const decoded=decodeWorldChunk(bytes);
  return {bytes,head:{cx:decoded.cx,cy:decoded.cy,byteLength:bytes.length,contentHash:decoded.contentHash}};
 });
 const manifest:WorldChunkManifest={...runtimeChunkFixture().manifest,assetRevision:assetRev,chunks:chunks.map(chunk=>chunk.head)};
 return {bytes:chunks[0]!.bytes,hash:chunks[0]!.head.contentHash,chunks,manifest};
}

function harness(options:{authority?:ChunkRuntimeMode|undefined;buildMode?:ChunkRuntimeMode;cache?:ChunkBlobCache|null}={}){
 const callbacks:Array<()=>void>=[];const events={onInsert:(fn:()=>void)=>callbacks.push(fn),onUpdate:(fn:()=>void)=>callbacks.push(fn),onDelete:(fn:()=>void)=>callbacks.push(fn)};
 let shadow:{revision:number;contentHash:string;manifestJson:string}|undefined;let heads:Array<{cx:number;cy:number;spaceId:bigint;revision:number;contentHash:string}>=[];
 const unsubscribe=vi.fn();let applied=()=>{};
 const builder={onApplied:(fn:()=>void)=>{applied=fn;return builder;},onError:()=>builder,subscribe:()=>{queueMicrotask(()=>applied());return {unsubscribe};}};
 const connection={db:{worldChunkShadow:{...events,spaceId:{find:(id:bigint)=>id===0n&&shadow?{...shadow,spaceId:0n}:undefined}},
  worldChunkHead:{...events,iter:()=>heads}},subscriptionBuilder:()=>builder} as unknown as DbConnection;
 const blobs=new Map<string,Uint8Array>(),held=new Map<string,Promise<void>>();const failing=new Set<string>();
 const fetchBlob=vi.fn(async(path:string)=>{
  if(path.includes('atlas.packs')){await held.get('atlas');return assets;}
  const hash=path.split('/').pop()!.replace('.bin','');await held.get(hash);
  if(failing.has(hash))throw new Error('chunk_fetch_404');
  return blobs.get(hash)!;
 });
 const state={authority:options.authority};
 const controller=new ChunkRuntimeController({buildMode:options.buildMode??'on',authority:()=>state.authority,fetchBlob,cache:options.cache===undefined?null:options.cache});
 const fire=()=>{for(const callback of callbacks)callback();};
 return {controller,connection,unsubscribe,fetchBlob,failing,state,fire,
  /** Publishes manifest and heads together (the server's CAS), or only the manifest row. */
  publish(rev:number,published:ReturnType<typeof revision>,{contentHash='content-1',withHeads=true}={}){
   for(const chunk of published.chunks)blobs.set(chunk.head.contentHash,chunk.bytes);
   shadow={revision:rev,contentHash,manifestJson:JSON.stringify(published.manifest)};
   if(withHeads)heads=published.manifest.chunks.map(head=>({cx:head.cx,cy:head.cy,spaceId:0n,revision:rev,contentHash:head.contentHash}));
   fire();
  },
  publishHeads(rev:number,published:ReturnType<typeof revision>){heads=published.manifest.chunks.map(head=>({cx:head.cx,cy:head.cy,spaceId:0n,revision:rev,contentHash:head.contentHash}));fire();},
  hold(hash:string){let release!:()=>void;held.set(hash,new Promise<void>(resolve=>{release=resolve;}));return ()=>{held.delete(hash);release();};},
 };
}

describe('mode selection',()=>{
 it('follows the server authority, capped by the build, and never activates on an unknown authority',()=>{
  expect(effectiveChunkRuntimeMode('off','on')).toBe('off');
  expect(effectiveChunkRuntimeMode('shadow',undefined)).toBe('shadow');expect(effectiveChunkRuntimeMode('shadow','on')).toBe('shadow');
  expect(effectiveChunkRuntimeMode('shadow','off')).toBe('off');
  expect(effectiveChunkRuntimeMode('on',undefined)).toBe('shadow');expect(effectiveChunkRuntimeMode('on','shadow')).toBe('shadow');
  expect(effectiveChunkRuntimeMode('on','on')).toBe('on');expect(effectiveChunkRuntimeMode('on','off')).toBe('off');
 });
 it('runs an `on` build as diagnostics-only shadow while the chunkAuthority seam is unconnected',async()=>{
  const h=harness({authority:undefined}),rev1=revision(0);
  try{
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('shadow'));
   expect(h.controller.status.mode).toBe('shadow');expect(h.controller.store).toBeUndefined();
  }finally{h.controller.dispose();}
 });
});

describe('on mode',()=>{
 it('keeps the old store serving until the next revision is fully pinned, then swaps atomically',async()=>{
  const prune=vi.fn(async()=>{});
  const h=harness({authority:'on',cache:{get:async()=>undefined,put:async()=>{},delete:async()=>{},prune}}),rev1=revision(0),rev2=revision(1);
  try{
   expect(h.controller.store).toBeUndefined();
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));
   const first=h.controller.store!;expect(first.pinnedReady).toBe(true);
   expect(h.controller.sample(5,5)).toMatchObject({ready:true,solidBlocked:false});
   expect(h.controller.status).toMatchObject({servingRevision:'0:1',pendingRevision:null,swaps:1,stale:false});
   expect(prune).toHaveBeenLastCalledWith(0,new Set([rev1.hash]));

   const release=h.hold(rev2.hash);h.publish(2,rev2);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('loading'));
   // Mid-load: the complete previous revision still serves, never the half-loaded one.
   expect(h.controller.store).toBe(first);expect(h.controller.sample(5,5)).toMatchObject({ready:true,solidBlocked:false});
   expect(h.controller.status).toMatchObject({servingRevision:'0:1',pendingRevision:'0:2'});
   release();
   await vi.waitFor(()=>expect(h.controller.status.servingRevision).toBe('0:2'));
   expect(h.controller.status.state).toBe('on');expect(h.controller.store).not.toBe(first);
   expect(h.controller.store!.pinnedReady).toBe(true);expect(h.controller.sample(5,5)).toMatchObject({ready:true,solidBlocked:true});
   expect(h.controller.status).toMatchObject({pendingRevision:null,swaps:2});
   // Cache keeps the current and the previous manifest only.
   expect(prune).toHaveBeenLastCalledWith(0,new Set([rev1.hash,rev2.hash]));
  }finally{h.controller.dispose();}
 });

 it('marks a content, map or asset mismatch stale and keeps following published heads (no lock-out)',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   h.publish(1,rev1,{contentHash:'content-2'});h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('stale'));
   expect(h.controller.status).toMatchObject({stale:true,staleReasons:['content'],staleObservations:1,servingRevision:'0:1'});
   expect(h.controller.store?.pinnedReady).toBe(true);
   h.controller.update(h.connection,0n,view,{...source,mapRevision:4,mapHash:'map-4'});
   await vi.waitFor(()=>expect(h.controller.status.staleReasons).toEqual(['content','map']));
   expect(h.controller.status.staleObservations).toBe(2);expect(h.controller.store?.pinnedReady).toBe(true);
   // A newer published revision is still adopted while stale.
   const rev2=revision(1,'assets-other');h.publish(2,rev2,{contentHash:'content-1'});
   await vi.waitFor(()=>expect(h.controller.status.servingRevision).toBe('0:2'));
   expect(h.controller.status).toMatchObject({state:'stale',staleReasons:['map','asset']});
   h.controller.update(h.connection,0n,view,{...source,mapRevision:3,mapHash:'map-3'});
   const rev3=revision(0);h.publish(3,rev3);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));
   expect(h.controller.status).toMatchObject({stale:false,staleReasons:[],servingRevision:'0:3'});
  }finally{h.controller.dispose();}
 });

 it('gates authority use like the server: superseded, stale content or map, never the atlas (S4d)',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   expect(h.controller.authorityGate(source)).toBe('not_on');
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));
   expect(h.controller.authorityGate(source)).toBeNull();
   expect(h.controller.authorityGate({...source,contentHash:'content-9'})).toBe('stale_content');
   expect(h.controller.authorityGate({...source,mapRevision:4})).toBe('stale_map');
   expect(h.controller.authorityGate({...source,mapHash:'map-9'})).toBe('stale_map');
   // A newer publication loading behind the serving store: the server already reads it.
   const rev2=revision(1),release=h.hold(rev2.hash);h.publish(2,rev2);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('loading'));
   expect(h.controller.authorityGate(source)).toBe('superseded');
   release();
   await vi.waitFor(()=>expect(h.controller.status.servingRevision).toBe('0:2'));
   expect(h.controller.authorityGate(source)).toBeNull();
   // An atlas (asset) mismatch is stale for rendering only; authority is unaffected.
   const rev3=revision(0,'assets-other');h.publish(3,rev3);
   await vi.waitFor(()=>expect(h.controller.status.servingRevision).toBe('0:3'));
   expect(h.controller.status.staleReasons).toEqual(['asset']);
   expect(h.controller.authorityGate(source)).toBeNull();
  }finally{h.controller.dispose();}
  const shadow=harness({authority:'shadow'});
  try{expect(shadow.controller.authorityGate(source)).toBe('not_on');}finally{shadow.controller.dispose();}
 });

 it('keeps serving through heads that lag the manifest and through failing fetches of the next revision',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0),rev2=revision(1);
  try{
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));const first=h.controller.store;
   h.publish(2,rev2,{withHeads:false});
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('awaiting_heads'));
   expect(h.controller.store).toBe(first);expect(h.controller.status.servingRevision).toBe('0:1');
   h.failing.add(rev2.hash);h.publishHeads(2,rev2);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('chunk_fetch_404'));
   expect(h.controller.store).toBe(first);expect(h.controller.sample(5,5)?.ready).toBe(true);
   h.failing.clear();h.fire();
   await vi.waitFor(()=>expect(h.controller.status.servingRevision).toBe('0:2'));
  }finally{h.controller.dispose();}
 });

 it('rolls back to off on the server switch, releasing everything, and comes back when switched on',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));
   h.state.authority='off';h.controller.authorityChanged();
   expect(h.controller.status).toMatchObject({mode:'off',state:'off',readyChunks:0,servingRevision:null});
   expect(h.controller.store).toBeUndefined();expect(h.unsubscribe).toHaveBeenCalled();
   // Table events while off never load anything.
   const calls=h.fetchBlob.mock.calls.length;h.fire();await Promise.resolve();expect(h.fetchBlob.mock.calls.length).toBe(calls);
   h.state.authority='on';h.controller.authorityChanged();
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));expect(h.controller.store?.pinnedReady).toBe(true);
  }finally{h.controller.dispose();}
 });

 it('stays off when rolled back while a revision is still loading',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   const release=h.hold(rev1.hash);h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('loading'));
   h.state.authority='off';h.controller.authorityChanged();release();
   await new Promise(resolve=>setTimeout(resolve,20));
   expect(h.controller.status).toMatchObject({mode:'off',state:'off',servingRevision:null,pendingRevision:null,swaps:0});
   expect(h.controller.store).toBeUndefined();
  }finally{h.controller.dispose();}
 });

 it('re-activates after an off/on flip that raced an in-flight load',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   const release=h.hold(rev1.hash);h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('loading'));
   h.state.authority='off';h.controller.authorityChanged();h.state.authority='on';h.controller.authorityChanged();release();
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));expect(h.controller.store?.pinnedReady).toBe(true);
  }finally{h.controller.dispose();}
 });

 it('swaps in a fully loaded next revision even while the serving revision keeps failing',async()=>{
  const coords=[[0,0],[3,0]] as const,rev1=revision(0,assetRevision,coords),rev2=revision(1,assetRevision,coords),h=harness({authority:'on'});
  try{
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));
   // The serving revision cannot fetch the chunk the view moves onto.
   h.failing.add(rev1.chunks[1]!.head.contentHash);
   const moved=[192,0,192,0] as const;h.controller.update(h.connection,0n,moved,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('chunk_fetch_404'));
   expect(h.controller.status.servingRevision).toBe('0:1');
   h.publish(2,rev2);
   await vi.waitFor(()=>expect(h.controller.status.servingRevision).toBe('0:2'));
   expect(h.controller.status.state).toBe('on');expect(h.controller.sample(192,5)).toMatchObject({ready:true,solidBlocked:true});
  }finally{h.controller.dispose();}
 });

 it('never builds or swaps a buffer for the old space after a space change mid-refresh',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   const release=h.hold('atlas');h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   // The first pass is paused at the asset-revision check; the player changes space.
   await Promise.resolve();await Promise.resolve();
   h.controller.update(h.connection,5n,view,source);release();
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('awaiting_publication'));
   await new Promise(resolve=>setTimeout(resolve,20));
   expect(h.controller.status).toMatchObject({state:'awaiting_publication',swaps:0,servingRevision:null,pendingRevision:null});
   expect(h.controller.store).toBeUndefined();
   expect(h.fetchBlob.mock.calls.some(([path])=>path.includes(rev1.hash))).toBe(false);
  }finally{h.controller.dispose();}
 });

 it('drops buffers of another space and never serves them there',async()=>{
  const h=harness({authority:'on'}),rev1=revision(0);
  try{
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('on'));
   h.controller.update(h.connection,5n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('awaiting_publication'));
   expect(h.controller.store).toBeUndefined();
  }finally{h.controller.dispose();}
 });
});

describe('shadow mode (unchanged)',()=>{
 it('stops on a source mismatch instead of following heads',async()=>{
  const h=harness({buildMode:'shadow'}),rev1=revision(0);
  try{
   h.publish(1,rev1);h.controller.update(h.connection,0n,view,source);
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('shadow'));
   expect(h.controller.store).toBeUndefined();expect(h.controller.compare(5,5,false)).toMatchObject({ready:true});
   h.controller.update(h.connection,0n,view,{...source,contentHash:'changed'});
   await vi.waitFor(()=>expect(h.controller.status.state).toBe('source_mismatch'));
   expect(h.controller.status.stale).toBe(false);expect(h.controller.compare(5,5,false)).toBeUndefined();
  }finally{h.controller.dispose();}
 });
});
