import {describe,it,expect} from 'vitest';
import {createEmptyMapDocument,createMapPrefabDocument,migrateMapDocumentV2,createMapDocumentDelta,applyMapDocumentDelta,parseMapDocumentV3,serializeMapDocumentV3,serializeMapDocumentV3ForTransport,type MapPrefabDocumentV2,type MapObjectInstance} from './index.js';
import {parseObjectPresentation,resolveObjectAppearance} from './object-presentation.js';
import {smartObjectPresentationPrefabs} from './smart-object-prefabs.js';
import {smartConnectedObjectPrefabs,mapObjectConnectionMasks} from './connected-objects.js';
import {mapObjectPlacementConflict,mapObjectOccupiedCells} from './map-object-occupancy.js';
const prefab=(name:string,id=1,width=1):MapPrefabDocumentV2=>({...createMapPrefabDocument({id:`asset-${id}`,title:name,width,height:1}),pivot:{tileX:0,tileY:0},cells:Array.from({length:width},(_,tileX)=>({id:`cell-${tileX}`,tileX,tileY:0,elevation:0,collisionMask:0})),placements:[{id:'visual',assetId:id,assetName:name,tileX:0,tileY:0,elevation:0,layer:'object',quarterTurns:0,flipX:false,visual:{kind:'variant',name:'base',frameIndex:0}}]});
const base=migrateMapDocumentV2(createEmptyMapDocument({id:'state-test',title:'States',width:8,height:8}));
const object=(id:string,prefabId:string,x=2,layer:MapObjectInstance['layer']='objects'):MapObjectInstance=>({id,prefabId,prefabRevision:0,tileX:x,tileY:2,elevation:0,layer,enabled:true,quarterTurns:0,flipX:false});
describe('shared object appearance',()=>{
 it('persists growth, resolves the same appearance without an editor, and rejects unsupported state',()=>{
  const family=smartObjectPresentationPrefabs(['mature','sapling','young','stump'].map((suffix,i)=>prefab(`tree_oak_${suffix}`,i+1)))[0]!;
  expect(parseObjectPresentation(family.presentation,['visual'])).toEqual(family.presentation);
  const tree={...object('oak',family.id),state:{growthStage:1,depleted:false}};
  const restored=parseMapDocumentV3(serializeMapDocumentV3({...base,prefabs:[family],objects:[tree]}));
  const source={...base,prefabs:[family],objects:[tree]};
  expect(serializeMapDocumentV3(restored)).toBe(serializeMapDocumentV3(source));
  expect(applyMapDocumentDelta(base,createMapDocumentDelta(base,source))).toBe(serializeMapDocumentV3ForTransport(source));
  expect(resolveObjectAppearance(family.placements[0]!,family.presentation,restored.objects[0]!.state).placement.assetName).toBe('tree_oak_sapling');
  expect(resolveObjectAppearance(family.placements[0]!,family.presentation,{growthStage:2,depleted:true}).placement.assetName).toBe('tree_oak_stump');
  expect(()=>parseMapDocumentV3(serializeMapDocumentV3({...base,prefabs:[family],objects:[{...tree,state:{growthStage:4}}]}))).toThrow();
 });
 it('supports a growing family without a depleted visual and arbitrary enum appearances',()=>{
  const tree=smartObjectPresentationPrefabs(['mature','sapling','young'].map((suffix,i)=>prefab(`tree_birch_${suffix}`,i+1)))[0]!;
  expect(()=>parseObjectPresentation(tree.presentation,['visual'])).not.toThrow();
  expect(resolveObjectAppearance(tree.placements[0]!,tree.presentation,{growthStage:1}).placement.assetName).toBe('tree_birch_sapling');
  const a=prefab('crop_carrot'),b={...a,id:'asset-2',placements:[{...a.placements[0]!,visual:{kind:'variant' as const,name:'grown',frameIndex:1}}]};
  const crop=smartObjectPresentationPrefabs([a,b])[0]!;
  expect(Object.keys(crop.presentation!.properties)).toEqual(['appearance']);
  expect(()=>parseObjectPresentation(crop.presentation,['visual'])).not.toThrow();
 });
 it('leaves legacy documents free of state fields',()=>{
  const restored=parseMapDocumentV3(serializeMapDocumentV3(base));
  expect(restored.entityStates).toBeUndefined();
  expect(serializeMapDocumentV3(restored)).toBe(serializeMapDocumentV3(base));
 });
});
describe('smart placement occupancy',()=>{
 it('collapses wide fence art to one semantic cell and joins adjacent corners',()=>{
  const wide=prefab('prop_cf_fence_white_horizontal',1,2),canonical=prefab('prop_cf_join_white_fence',2);
  const smart=smartConnectedObjectPrefabs([wide,canonical]);expect(smart).toHaveLength(1);
  const fence=smart[0]!,a=object('a',fence.id),b={...a,id:'b',tileX:3},c={...b,id:'c',tileY:3};
  const document={...base,prefabs:[fence],objects:[a,b,c]};
  expect(mapObjectOccupiedCells(document,a)).toHaveLength(1);
  expect(mapObjectConnectionMasks(document).get('b')?.mask).toBe(12);
  expect(mapObjectPlacementConflict({...document,objects:[a]},b)).toBeNull();
  expect(mapObjectConnectionMasks({...document,objects:[a,{...b,layer:'canopy'}]}).get('a')?.mask).toBe(0);
 });
 it('rejects overlap of decorative multi-cell objects only on the same layer/height',()=>{
  const p=prefab('table',1,2),a=object('a',p.id),b=object('b',p.id,3);
  const document={...base,prefabs:[p],objects:[a]};
  expect(mapObjectPlacementConflict(document,b)).toBe('a');
  expect(mapObjectPlacementConflict(document,{...b,layer:'canopy'})).toBeNull();
  expect(mapObjectPlacementConflict(document,{...b,elevation:1})).toBeNull();
  expect(mapObjectPlacementConflict(document,{...a,tileX:4})).toBeNull();
  expect(mapObjectPlacementConflict(document,{...b,tileX:7})).toBe('outside-map');
  expect(()=>parseMapDocumentV3(serializeMapDocumentV3({...document,objects:[a,b]}))).not.toThrow();
 });
});
