import {planLiveMapResourceMoves} from './live-map-resource-placement.js';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='commitLiveMapSnapshot');
if(fn===undefined)throw new Error('map commit implementation missing');
const javascript=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture(blocked = false){
  const landmarks=sim.activeSurvivalLandmarks(sim.bootstrapContentRegistry(),sim.TOPSIDE_SPACE_ID);
  const initial={...sim.createLiveIslandMapDocument({landmarks}),combatRegions:sim.HEARTH_COMBAT_REGIONS};
  let row={mapId:initial.id,revision:1,documentJson:sim.serializeMapDocumentV3(initial),contentHash:sim.mapDocumentV3Hash(initial),clientMutationId:'initial'};
  const history:unknown[]=[];
  const tree={id:42n,kind:'tree_oak',definitionId:'resource:tree_oak',tileX:3,tileY:4,chunkX:0,chunkY:0,spaceId:0,health:7,regrowthProgress:35,depleted:false};
  const resources=new Map([[tree.id,tree]]);
  const resourceWrites:typeof tree[]=[];
  const ctx={sender:{},timestamp:{},db:{
    world_resource:{id:{find:(id:bigint)=>resources.get(id)??null,update:(next:typeof tree)=>{resourceWrites.push(next);resources.set(next.id,next);}},by_chunk:{filter:()=>resources.values()}},
    world_chest:{by_chunk:{filter:()=>[]}},world_combat_target:{by_chunk:{filter:()=>[]}},
    live_map_document:{mapId:{find:()=>row,update:(next:typeof row)=>{row=next;}}},
    world_placeable:{by_placer:{filter:()=>[]}},world_environment:{id:{find:()=>null}},
    live_map_revision:{insert:(next:unknown)=>history.push(next)}}};
  const dependencies={...sim,planLiveMapResourceMoves,SenderError:Error,activeTopsideLandmarks:()=>landmarks,insertLegacyAdminAudit:()=>{},settleTownStreetlamps:()=>{},
    contentRegistry:()=>sim.bootstrapContentRegistry(),
    runtimeResourceDefinition:()=>({visual:{kind:'tree'}}),
    collisionForSpace:()=>({width:832,height:832,blocked:new Uint8Array(832*832).fill(blocked?1:0)}),
    tileOverlapsAnyPlayer:()=>false};
  const commit=new Function(...Object.keys(dependencies),`${javascript};return commitLiveMapSnapshot;`)(...Object.values(dependencies));
  return {ctx,initial,history,current:()=>row,commit,resources,resourceWrites,tree};
}
describe('combat policy custody across map publication',()=>{
  it('preserves policy omitted by an older editor and retries that mutation idempotently',()=>{
    const f=fixture();const edited={...sim.createLiveIslandMapDocument(),title:'Edited by older Studio'};
    f.commit(f.ctx,edited,1,'older-editor');
    expect(sim.parseMapDocumentV3(f.current().documentJson).combatRegions).toHaveLength(3);
    expect(f.current().contentHash).toBe(sim.mapDocumentV3Hash(
      sim.parseMapDocumentV3(f.current().documentJson),
    ));
    expect(f.current().documentJson).not.toContain('\n');
    const committedHash=f.current().contentHash;
    f.commit(f.ctx,edited,1,'older-editor');
    expect(f.history).toHaveLength(1);expect(f.current().revision).toBe(2);
    expect(f.current().contentHash).toBe(committedHash);
  });
  it('allows an explicit empty policy and intentional historical restore',()=>{
    const cleared=fixture();cleared.commit(cleared.ctx,{...cleared.initial,combatRegions:[]},1,'explicit-empty');
    expect(sim.parseMapDocumentV3(cleared.current().documentJson).combatRegions).toEqual([]);
    const restored=fixture();restored.commit(restored.ctx,sim.createLiveIslandMapDocument(),1,'restore',false);
    expect(sim.parseMapDocumentV3(restored.current().documentJson).combatRegions).toBeUndefined();
  });
});

it('commits tree placement with map history, preserves harvest state, retries, and restores origin',()=>{
 const f=fixture();
 const moved={...f.initial,resourcePlacements:[{id:'42',originTileX:3,originTileY:4,tileX:40,tileY:41}]};
 f.commit(f.ctx,moved,1,'tree-move');
 expect(f.resources.get(42n)).toEqual({...f.tree,tileX:40,tileY:41,chunkX:2,chunkY:2});
 expect(sim.parseMapDocumentV3(f.current().documentJson).resourcePlacements).toEqual(moved.resourcePlacements);
 f.commit(f.ctx,moved,1,'tree-move');
 expect(f.resourceWrites).toHaveLength(1);expect(f.history).toHaveLength(1);
 f.commit(f.ctx,f.initial,2,'tree-restore',false);
 expect(f.resources.get(42n)).toEqual(f.tree);
 expect(f.history).toHaveLength(2);
});
it('rejects blocked tree destinations before applying any resource position',()=>{
 const f=fixture(true);
 const moved={...f.initial,resourcePlacements:[{id:'42',originTileX:3,originTileY:4,tileX:40,tileY:41}]};
 expect(()=>f.commit(f.ctx,moved,1,'tree-blocked')).toThrow('destination_blocked');
 expect(f.resourceWrites).toEqual([]);expect(f.history).toEqual([]);
 expect(f.resources.get(42n)).toEqual(f.tree);
});
