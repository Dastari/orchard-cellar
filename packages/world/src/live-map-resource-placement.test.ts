import {describe,it,expect} from 'vitest';
import {createEmptyMapDocument,migrateMapDocumentV2} from '@orchard/sim';
import {planLiveMapResourceMoves} from './live-map-resource-placement.js';
const base=migrateMapDocumentV2(createEmptyMapDocument({id:'live-island',title:'test',width:20,height:20}));
const row={id:42n,tileX:3,tileY:4,spaceId:0};
const moved={...base,resourcePlacements:[{id:'42',originTileX:3,originTileY:4,tileX:8,tileY:9}]};
describe('atomic live resource movement',()=>{
 it('plans only coordinate updates and restores origin when removed',()=>{
  expect(planLiveMapResourceMoves(base,moved,()=>row,()=>true)).toEqual([{id:42n,tileX:8,tileY:9}]);
  expect(planLiveMapResourceMoves(moved,base,()=>({...row,tileX:8,tileY:9}),()=>true)).toEqual([{id:42n,tileX:3,tileY:4}]);
  expect(planLiveMapResourceMoves(moved,moved,()=>row,()=>true)).toEqual([]);
 });
 it('rejects forged origins, missing/fixed resources and concurrent moves',()=>{
  expect(()=>planLiveMapResourceMoves(base,moved,()=>({...row,tileX:2}),()=>true)).toThrow('origin_conflict');
  expect(()=>planLiveMapResourceMoves(base,moved,()=>null,()=>true)).toThrow('not_movable');
  expect(()=>planLiveMapResourceMoves(base,moved,()=>row,()=>false)).toThrow('not_movable');
  expect(()=>planLiveMapResourceMoves(moved,base,()=>row,()=>true)).toThrow('position_conflict');
 });
});
