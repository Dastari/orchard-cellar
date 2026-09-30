import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it,vi} from 'vitest';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {shadowPublicationRefusalCode,validateShadowBlob,validateShadowPublication} from './chunk-shadow-runtime.js';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('../index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
class SenderError extends Error {}
/** The real index.ts refusal mapping, compiled with this test's SenderError. */
function refusals(){
 const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='withShadowPublicationRefusals');
 if(!fn)throw new Error('withShadowPublicationRefusals');
 const code=ts.transpileModule(`return ${fn.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('shadowPublicationRefusalCode','SenderError',code)(shadowPublicationRefusalCode,SenderError) as <T>(run:()=>T)=>T;
}
function topLevelFunctions(names:readonly string[]):string{
 return names.map(name=>{
  const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  if(!fn)throw new Error(name);
  return fn.getText(source);
 }).join('\n');
}
/** The real reducer (with the real index.ts helpers it calls), compiled against injected dependencies. */
function reducer(name:string,owner:()=>void,extra:Record<string,unknown>={},helpers:readonly string[]=['commitWorldChunkShadow']){
 const statement=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(source)===name));
 if(!statement||!ts.isVariableStatement(statement))throw new Error(name);
 const declaration=statement.declarationList.declarations[0]!;
 const code=ts.transpileModule(`${topLevelFunctions(helpers)}\nreturn ${declaration.initializer!.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const t={array:()=>null,u8:()=>null,string:()=>null,u32:()=>null,u64:()=>null,i32:()=>null};
 const dependencies:Record<string,unknown>={spacetimedb:{reducer:(_schema:unknown,handler:unknown)=>handler,procedure:(_schema:unknown,_returns:unknown,handler:unknown)=>handler},t,requireWorldOwner:owner,validateShadowBlob,validateShadowPublication,
  contentRegistry:()=>({contentHash:'content-1'}),TOPSIDE_SPACE_ID:0,LIVE_ISLAND_MAP_ID:'live-island',SenderError,withShadowPublicationRefusals:refusals(),
  requireLiveMapPublisher:()=>{throw new Error('map_publisher_required');},...extra};
 return new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown,args:unknown)=>void;
}
it('actual staging reducer enforces ownership before writing and deduplicates immutable blobs',()=>{
 const {blobs}=runtimeChunkFixture();let row:unknown=null;const insert=vi.fn((value:unknown)=>{row=value;});
 const ctx={senderAuth:{jwt:null},sender:{toHexString:()=>'a'},db:{membership:{identity:{find:()=>null}},studio_scope_grant:{id:{find:()=>null}},world_chunk_blob:{contentHash:{find:()=>row},insert}}};
 expect(()=>reducer('stageWorldChunkBlob',()=>{throw new Error('owner_required');})(ctx,{bytes:blobs[0]})).toThrow(/owner/);expect(insert).not.toHaveBeenCalled();
 const stage=reducer('stageWorldChunkBlob',()=>{});stage(ctx,{bytes:blobs[0]});stage(ctx,{bytes:blobs[0]});expect(insert).toHaveBeenCalledTimes(1);
 // A known refusal reaches the client as a SenderError code; a decoder fault stays a plain error.
 expect(()=>stage(ctx,{bytes:new Uint8Array(1024*1024+1)})).toThrow(new SenderError('chunk_blob_too_large'));
 let fault:unknown;try{stage(ctx,{bytes:new Uint8Array(16)});}catch(error){fault=error;}
 expect(fault).toBeInstanceOf(Error);expect(fault).not.toBeInstanceOf(SenderError);expect(insert).toHaveBeenCalledTimes(1);
});
it('actual publication checks completeness before replacing public heads',()=>{
 const {manifest,blobs}=runtimeChunkFixture();const inserted:unknown[]=[];const state:{blob?:Uint8Array}={};let shadow:unknown=null;
 const ctx={senderAuth:{jwt:null},sender:'a',db:{membership:{identity:{find:()=>null}},live_map_document:{mapId:{find:()=>({revision:3,contentHash:'map-3'})}},
 world_chunk_blob:{contentHash:{find:()=>state.blob?{bytes:state.blob}:null}},world_chunk_shadow:{spaceId:{find:()=>shadow,update:(r:unknown)=>{shadow=r;}},insert:(r:unknown)=>{shadow=r;}},
 world_chunk_head:{by_space:{filter:()=>[]},id:{delete:vi.fn()},insert:(r:unknown)=>inserted.push(r)}}};
 const publish=reducer('publishWorldChunkShadow',()=>{}),args={manifestJson:JSON.stringify(manifest),mapId:'live-island',contentHash:'content-1',expectedRevision:0};
 expect(()=>publish(ctx,args)).toThrow(new SenderError('chunk_shadow_blob_missing'));expect(inserted).toHaveLength(0);
 state.blob=blobs[0]!;publish(ctx,args);expect(inserted).toHaveLength(1);expect(shadow).toMatchObject({revision:1,spaceId:0n});
 let conflict:unknown;try{publish(ctx,args);}catch(error){conflict=error;}
 expect(conflict).toBeInstanceOf(SenderError);expect((conflict as Error).message).toBe('chunk_shadow_revision_conflict');expect(inserted).toHaveLength(1);
});
it('map publishers with an active map grant stage blobs; everyone else still needs the owner check',()=>{
 const {blobs}=runtimeChunkFixture();const insert=vi.fn();let grant:unknown=null;
 const ctx={senderAuth:{jwt:null},sender:{toHexString:()=>'a'},db:{membership:{identity:{find:()=>null}},studio_scope_grant:{id:{find:()=>grant}},world_chunk_blob:{contentHash:{find:()=>null},insert}}};
 const publisher=vi.fn();
 const stage=reducer('stageWorldChunkBlob',()=>{throw new Error('owner_required');},{requireLiveMapPublisher:publisher});
 expect(()=>stage(ctx,{bytes:blobs[0]})).toThrow(/owner_required/);
 grant={revokedAt:1};expect(()=>stage(ctx,{bytes:blobs[0]})).toThrow(/owner_required/);expect(publisher).not.toHaveBeenCalled();
 grant={};stage(ctx,{bytes:blobs[0]});expect(publisher).toHaveBeenCalledTimes(1);expect(insert).toHaveBeenCalledTimes(1);
});

describe('publishLiveMapWithChunks (static world S7b): map and chunks in one transaction',()=>{
 const {manifest,blobs}=runtimeChunkFixture();
 /** The fixture manifest pins map head 3:map-3; the map starts at 2:map-2 and the publication commits 3:map-3. */
 function world(options:{servable?:'ok'|'incomplete'|'lag';prepared?:'document'|'retry';mapCommits?:{revision:number;contentHash:string}}={}){
  const events:string[]=[];const inserted:unknown[]=[];let map={revision:2,contentHash:'map-2'};let shadow:{revision:number;manifestJson:string;contentHash:string}|null=null;
  const ctx={senderAuth:{jwt:null},sender:{toHexString:()=>'a'},db:{membership:{identity:{find:()=>null}},
   live_map_document:{mapId:{find:()=>map}},world_chunk_blob:{contentHash:{find:()=>({bytes:blobs[0]})}},
   world_chunk_shadow:{spaceId:{find:()=>shadow,update:(r:typeof shadow)=>{shadow=r;}},insert:(r:typeof shadow)=>{shadow=r;}},
   world_chunk_head:{by_space:{filter:()=>[]},id:{delete:vi.fn()},insert:(r:unknown)=>inserted.push(r)}}};
  const servable=options.servable??'ok';
  const dispatcher={
   select:()=>{events.push('select');return servable==='incomplete'?null:{source:'chunks'};},
   status:()=>({lastResolution:servable==='incomplete'?{ok:false,reason:'incomplete',key:'k'}:{ok:true,key:'k',...(servable==='lag'?{lag:['map']}:{})}}),
   release:()=>{events.push('release');},
  };
  const publish=reducer('publishLiveMapWithChunks',()=>{},{
   requireLiveMapPublisher:()=>{events.push('auth');},
   preparedLiveMapPublication:()=>(events.push('prepare'),options.prepared==='retry'?null:{id:'live-island'}),
   commitLiveMapSnapshot:(_ctx:unknown,_document:unknown,_expected:number,_mutation:string,_preserve:boolean,afterHead:()=>void)=>{
    map=options.mapCommits??{revision:3,contentHash:'map-3'};events.push('head');afterHead();events.push('resource-moves');
   },
   chunkAuthorityDispatcher:dispatcher,chunkAuthoritySource:()=>({}),
  },['commitWorldChunkShadow','requireServableChunkPublication']);
  const args={mapId:'live-island',expectedRevision:2,documentJson:'{}',clientMutationId:'m-1',manifestJson:JSON.stringify(manifest),contentHash:'content-1',expectedChunkRevision:0};
  return {ctx,args,publish,events,inserted,shadow:()=>shadow,setShadow:(value:typeof shadow)=>{shadow=value;}};
 }
 const refusal=(run:()=>void):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(SenderError);return (error as Error).message;}throw new Error('expected a refusal');};

 it('commits the chunk heads right after the new map head, then requires the publication to serve, before the island is read',()=>{
  const w=world();w.publish(w.ctx,w.args);
  expect(w.events).toEqual(['auth','prepare','head','select','resource-moves']);
  expect(w.inserted).toHaveLength(1);expect(w.shadow()).toMatchObject({revision:1,contentHash:'content-1',manifestJson:w.args.manifestJson});
 });
 it('refuses (rolling the map back) a manifest not pinned to the head this publication commits, and drops cached runtimes',()=>{
  const w=world({mapCommits:{revision:3,contentHash:'map-3-other'}});
  expect(refusal(()=>w.publish(w.ctx,w.args))).toBe('chunk_shadow_source_conflict');
  expect(w.events).toEqual(['auth','prepare','head','release']);expect(w.inserted).toHaveLength(0);
 });
 it('refuses a chunk revision conflict and a non-topside map',()=>{
  const w=world();expect(refusal(()=>w.publish(w.ctx,{...w.args,expectedChunkRevision:5}))).toBe('chunk_shadow_revision_conflict');
  const other=world();expect(refusal(()=>other.publish(other.ctx,{...other.args,mapId:'cellar'}))).toBe('chunk_shadow_space_not_supported');
  expect(other.events).toEqual(['auth']);
 });
 it('refuses a publication that would not serve, or would serve lagging',()=>{
  const incomplete=world({servable:'incomplete'});
  expect(refusal(()=>incomplete.publish(incomplete.ctx,incomplete.args))).toBe('chunk_publication_unservable:incomplete');
  expect(incomplete.events).toEqual(['auth','prepare','head','select','release']);
  const lag=world({servable:'lag'});expect(refusal(()=>lag.publish(lag.ctx,lag.args))).toBe('chunk_publication_lagging:map');
 });
 it('an identical retry is a no-op; a retry whose chunk half never committed publishes it',()=>{
  const w=world({prepared:'retry'});
  // The map half committed earlier (the head is 3:map-3); the chunk half did not.
  w.ctx.db.live_map_document.mapId.find=()=>({revision:3,contentHash:'map-3'});
  w.publish(w.ctx,w.args);expect(w.inserted).toHaveLength(1);expect(w.shadow()).toMatchObject({revision:1});
  w.publish(w.ctx,{...w.args,expectedChunkRevision:0});expect(w.inserted).toHaveLength(1);
  expect(w.events.filter(event=>event==='head')).toEqual([]);
 });
});

it('readWorldChunkBlob returns only the blob a current head references, to members',()=>{
 const {blobs}=runtimeChunkFixture();const heads=new Map([['0:1:2',{contentHash:'hash-a'}]]);const stored=new Map([['hash-a',{bytes:blobs[0]}]]);
 let member=true;
 const tx={senderAuth:{jwt:null},sender:'a',db:{membership:{identity:{find:()=>null}},world_chunk_head:{id:{find:(id:string)=>heads.get(id)??null}},
  world_chunk_blob:{contentHash:{find:(hash:string)=>stored.get(hash)??null}}}};
 const read=reducer('readWorldChunkBlob',()=>{},{requireAuthorizedSender:()=>{if(!member)throw new SenderError('not_authorized');}},[]) as unknown as
  (ctx:unknown,args:{spaceId:bigint;cx:number;cy:number;contentHash:string})=>unknown;
 const ctx={withTx:<T>(run:(value:typeof tx)=>T)=>run(tx)};
 expect(read(ctx,{spaceId:0n,cx:1,cy:2,contentHash:'hash-a'})).toBe(blobs[0]);
 expect(()=>read(ctx,{spaceId:0n,cx:1,cy:2,contentHash:'hash-b'})).toThrow(new SenderError('chunk_blob_not_published'));
 expect(()=>read(ctx,{spaceId:0n,cx:2,cy:2,contentHash:'hash-a'})).toThrow(new SenderError('chunk_blob_not_published'));
 stored.clear();expect(()=>read(ctx,{spaceId:0n,cx:1,cy:2,contentHash:'hash-a'})).toThrow(new SenderError('chunk_blob_missing'));
 member=false;expect(()=>read(ctx,{spaceId:0n,cx:1,cy:2,contentHash:'hash-a'})).toThrow(/not_authorized/);
});
