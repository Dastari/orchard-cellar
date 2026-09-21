import {describe,it,expect} from 'vitest';
import {connectedObjectIndex,connectedObjectFrame,connectedObjectFamily,mapObjectConnectionMasks,MANUAL_OBJECT_CONNECTION_TAG,type ConnectedObjectFamily} from './connected-objects.js';
import {createEmptyMapDocument} from './index.js';
import {migrateMapDocumentV2,serializeMapDocumentV3,parseMapDocumentV3,type MapObjectInstance} from './map-document-v3.js';
import {createMapPrefabDocument,type MapPrefabDocumentV2} from './map-prefab.js';

describe('shared object topology',()=>{
 it.each(['hedge','wood_fence','white_fence','wood_small_fence','stone_fence','stone_large_fence'] as const)('resolves every %s cardinal mask with native unique frames',family=>{
  const origin={tileX:3,tileY:3,elevation:1,space:0,family};
  for(let mask=0;mask<16;mask++){
   const neighbors=[[0,-1],[1,0],[0,1],[-1,0]].flatMap(([x,y],i)=>mask&(1<<i)?[{...origin,tileX:3+x!,tileY:3+y!}]:[]);
   expect(connectedObjectIndex([origin,...neighbors])(origin)).toBe(mask);
  }
  expect(new Set(Array.from({length:16},(_,i)=>connectedObjectFrame(family,i))).size).toBe(16);
  expect(connectedObjectFrame(family,6)).toBe(5); // southeast elbow, native x16/y16
  expect(connectedObjectFrame(family,10)).toBe(2); // east/west straight
 });
 it('isolates spaces, materials and elevations',()=>{
  const cell={tileX:1,tileY:1,elevation:0,space:0,family:'hedge' as ConnectedObjectFamily};
  const other={...cell,tileX:2};
  expect(connectedObjectIndex([cell,{...other,space:1},{...other,elevation:1},{...other,family:'wood_fence'}])(cell)).toBe(0);
  expect(connectedObjectFamily('prop_cf_house')).toBeNull();
 });
 it('rejoins after removal and persists manual author overrides across export',()=>{
  const prefab:MapPrefabDocumentV2={...createMapPrefabDocument({id:'fence',title:'Fence'}),placements:[{id:'visual',assetId:1,elevation:0,assetName:'prop_cf_fence_horizontal',tileX:0,tileY:0,layer:'object',quarterTurns:0,flipX:false,visual:{kind:'variant',name:'base',frameIndex:0}}]};
  const object=(id:string,tileX:number):MapObjectInstance=>({id,prefabId:'fence',prefabRevision:0,tileX,tileY:1,elevation:0,layer:'objects',quarterTurns:0,flipX:false,enabled:true});
  const document={...migrateMapDocumentV2(createEmptyMapDocument({id:'joins',title:'Joins',width:8,height:8})),prefabs:[prefab],objects:[object('a',1),object('b',2),object('c',3)]};
  expect(mapObjectConnectionMasks(document).get('b')?.mask).toBe(10);
  expect(mapObjectConnectionMasks({...document,objects:document.objects.slice(0,2)}).get('b')?.mask).toBe(8);
  const manual={...prefab,id:'manual',tags:[MANUAL_OBJECT_CONNECTION_TAG]};
  const restored=parseMapDocumentV3(serializeMapDocumentV3({...document,prefabs:[prefab,manual],objects:[object('a',1),{...object('b',2),prefabId:'manual'}]}));
  expect(mapObjectConnectionMasks(restored).has('b')).toBe(false);
  expect(mapObjectConnectionMasks(restored).get('a')?.mask).toBe(2);
 });
});
