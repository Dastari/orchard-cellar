import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,createLiveIslandMapDocument,parseMapDocumentV3,createMapDocumentDelta,applyMapDocumentDelta,type MapEntityStateEdit} from '@orchard/sim';
import {planLiveMapEntityStates} from './live-map-entity-state.js';
const base=createLiveIslandMapDocument();
const definition=[...bootstrapContentRegistry().resources.values()].find(d=>d.runtimeKind==='tree_oak')!;
const row={id:42n,spaceId:0,health:3,depleted:false,growthStage:3};
const edit:MapEntityStateEdit={id:'resource:42',entityKind:'resource',entityId:'42',baseState:{health:3,growthStage:3},state:{health:1,growthStage:1}};
describe('resource state publication',()=>{
 it('compares live values, commits only changed records, and lets normal game growth continue',()=>{
  const next={...base,entityStates:[edit]};
  expect(planLiveMapEntityStates(base,next,()=>row,()=>definition)).toEqual([{id:42n,state:edit.state}]);
  expect(planLiveMapEntityStates(next,{...next,title:'Unrelated edit'},()=>({...row,health:2,growthStage:2}),()=>definition)).toEqual([]);
  expect(()=>planLiveMapEntityStates(base,next,()=>({...row,health:2}),()=>definition)).toThrow('conflict');
  expect(planLiveMapEntityStates(next,base,()=>({...row,...edit.state}),()=>definition)).toEqual([{id:42n,state:edit.baseState}]);
 });
 it('rejects unsupported keys, inconsistent depletion and out-of-range stages',()=>{
  for(const state of [{health:0},{growthStage:4},{unknown:true}])expect(()=>planLiveMapEntityStates(base,{...base,entityStates:[{...edit,baseState:{health:3},state}]},()=>row,()=>definition)).toThrow();
 });
 it('round trips a small map delta with typed resource state',()=>{
  const next={...base,entityStates:[edit]};
  const delta=createMapDocumentDelta(base,next);
  expect(JSON.stringify(delta).length).toBeLessThan(2000);
  expect(parseMapDocumentV3(applyMapDocumentDelta(base,delta)).entityStates).toEqual([edit]);
 });
});
