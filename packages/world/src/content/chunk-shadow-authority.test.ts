import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import {runtimeChunkFixture} from '@orchard/sim/chunk-runtime-fixture';
import {validateShadowBlob,validateShadowPublication} from './chunk-shadow-runtime.js';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('../index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function reducer(name:string,owner:()=>void){
 const statement=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(source)===name));
 if(!statement||!ts.isVariableStatement(statement))throw new Error(name);
 const declaration=statement.declarationList.declarations[0]!;
 const code=ts.transpileModule(`return ${declaration.initializer!.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const t={array:()=>null,u8:()=>null,string:()=>null,u32:()=>null};
 return new Function('spacetimedb','t','requireWorldOwner','validateShadowBlob','validateShadowPublication','contentRegistry','TOPSIDE_SPACE_ID','LIVE_ISLAND_MAP_ID','SenderError',code)(
  {reducer:(_schema:unknown,handler:unknown)=>handler},t,owner,validateShadowBlob,validateShadowPublication,()=>({contentHash:'content-1'}),0,'live-island',Error,
 ) as (ctx:unknown,args:unknown)=>void;
}
it('actual staging reducer enforces ownership before writing and deduplicates immutable blobs',()=>{
 const {blobs}=runtimeChunkFixture();let row:unknown=null;const insert=vi.fn((value:unknown)=>{row=value;});
 const ctx={senderAuth:{jwt:null},sender:'a',db:{membership:{identity:{find:()=>null}},world_chunk_blob:{contentHash:{find:()=>row},insert}}};
 expect(()=>reducer('stageWorldChunkBlob',()=>{throw new Error('owner_required');})(ctx,{bytes:blobs[0]})).toThrow(/owner/);expect(insert).not.toHaveBeenCalled();
 const stage=reducer('stageWorldChunkBlob',()=>{});stage(ctx,{bytes:blobs[0]});stage(ctx,{bytes:blobs[0]});expect(insert).toHaveBeenCalledTimes(1);
});
it('actual publication checks completeness before replacing public heads',()=>{
 const {manifest,blobs}=runtimeChunkFixture();const inserted:unknown[]=[];const state:{blob?:Uint8Array}={};let shadow:unknown=null;
 const ctx={senderAuth:{jwt:null},sender:'a',db:{membership:{identity:{find:()=>null}},live_map_document:{mapId:{find:()=>({revision:3,contentHash:'map-3'})}},
 world_chunk_blob:{contentHash:{find:()=>state.blob?{bytes:state.blob}:null}},world_chunk_shadow:{spaceId:{find:()=>shadow,update:(r:unknown)=>{shadow=r;}},insert:(r:unknown)=>{shadow=r;}},
 world_chunk_head:{by_space:{filter:()=>[]},id:{delete:vi.fn()},insert:(r:unknown)=>inserted.push(r)}}};
 const publish=reducer('publishWorldChunkShadow',()=>{}),args={manifestJson:JSON.stringify(manifest),mapId:'live-island',contentHash:'content-1',expectedRevision:0};
 expect(()=>publish(ctx,args)).toThrow(/missing/);expect(inserted).toHaveLength(0);
 state.blob=blobs[0]!;publish(ctx,args);expect(inserted).toHaveLength(1);expect(shadow).toMatchObject({revision:1,spaceId:0n});
 expect(()=>publish(ctx,args)).toThrow(/conflict/);expect(inserted).toHaveLength(1);
});
