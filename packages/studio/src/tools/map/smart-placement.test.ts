import {describe,it,expect} from 'vitest';
import {createEmptyMapDocument,createMapPrefabDocument,migrateMapDocumentV2,serializeMapDocumentV3,mapObjectConnectionMasks,mapObjectCollisionCells,createMapDocumentDelta,applyMapDocumentDelta,parseMapDocumentV3,MANUAL_OBJECT_CONNECTION_TAG} from '@orchard/sim';
import {StudioSelectionBus,StudioInspectorKernel,StudioValidationPanel,StudioNotifications} from '../../shell/index.js';
import {MapEditorController} from './editor-controller.js';
import {MapEditorModel} from './model.js';
import {mapEditorAuthoredObjectFootprint} from './selection-footprint.js';
function fixture(){
 const document=migrateMapDocumentV2(createEmptyMapDocument({id:'smart-test',title:'Smart test',width:16,height:16}));
 const selection=new StudioSelectionBus();const source=JSON.stringify({version:2,baseRevision:0,baseSemanticHash:null,dirty:true,document:serializeMapDocumentV3(document)});
 const model=new MapEditorModel('smart-test',{selection,inspector:new StudioInspectorKernel(),validation:new StudioValidationPanel(),notifications:new StudioNotifications(),live:()=>null},{getItem:()=>source,setItem:()=>{}});
 const controller=new MapEditorController(model);controller.setViewport({x:0,y:0,width:800,height:800});
 const point=(x:number,y:number)=>{const {camera,viewport}=controller.snapshot();return {x:viewport.x+(x*16+8-camera.x)*camera.zoom,y:viewport.y+(y*16+8-camera.y)*camera.zoom};};
 return {model,controller,point};
}
function fence(id:string,assetName:string,width=1){return {...createMapPrefabDocument({id,title:'White fence',width,height:1}),pivot:{tileX:0,tileY:0},placements:[{id:'visual',assetId:1,assetName,tileX:0,tileY:0,elevation:0,layer:'object' as const,quarterTurns:0 as const,flipX:false,visual:{kind:'variant' as const,name:'base',frameIndex:0}}],cells:Array.from({length:width},(_,tileX)=>({id:`cell-${tileX}`,tileX,tileY:0,elevation:0,collisionMask:65535}))};}
describe('Smart and Exact editor placement',()=>{
 it('moves a legacy two-cell fence out of a joined row and back as one cell',()=>{
  const {model,controller,point}=fixture();
  const legacy=fence('legacy-white','prop_cf_fence_white_horizontal',2);
  model.embedPrefab(legacy);
  for(const [id,tileX] of [['left',2],['moving',3],['right',4]] as const)model.apply({kind:'place_object',object:{id,prefabId:legacy.id,prefabRevision:legacy.revision,tileX,tileY:2,elevation:0,layer:'objects',quarterTurns:0,flipX:false,enabled:true}});
  const before=model.document();
  expect(mapEditorAuthoredObjectFootprint(before,before.objects[1]!)).toHaveLength(1);
  controller.selectLayer('objects');controller.selectEditingTool('objects');
  controller.pointerDown(point(3,2),0);controller.pointerMove(point(3,3));controller.pointerUp();
  expect(model.document().objects.find(o=>o.id==='moving')).toMatchObject({tileX:3,tileY:3});
  controller.pointerDown(point(3,3),0);controller.pointerMove(point(3,2));controller.pointerUp();
  const after=model.document(),moved=after.objects.find(o=>o.id==='moving')!;
  expect(moved).toMatchObject({tileX:3,tileY:2});
  expect(mapObjectConnectionMasks(after).get('moving')?.mask).toBe(10);
  expect(after.prefabs.find(p=>p.id===moved.prefabId)).toMatchObject({width:1,height:1,cells:[{tileX:0,tileY:0,collisionMask:65535}]});
  expect(after.objects.filter(o=>o.id!=='moving')).toEqual(before.objects.filter(o=>o.id!=='moving'));
  expect(after.prefabs.find(p=>p.id===legacy.id)).toEqual(legacy);
  const published=parseMapDocumentV3(applyMapDocumentDelta(before,createMapDocumentDelta(before,after)));
  expect(mapObjectCollisionCells(published,published.objects.find(o=>o.id==='moving')!)).toHaveLength(1);
  expect(model.placeObject({...moved,tileX:2})).toBe(false);
  expect(model.document()).toBe(after);
  model.undo();expect(model.document().objects.find(o=>o.id==='moving')?.tileY).toBe(3);
  model.undo();expect(serializeMapDocumentV3(model.document())).toBe(serializeMapDocumentV3(before));
 });
 it.each(['exact','gate','scaled','compound'] as const)('preserves multi-cell %s fence geometry',kind=>{
  const {model}=fixture();
  const source=fence('wide',kind==='gate'?'prop_cf_fence_gate':'prop_cf_fence_white_horizontal',2);
  const prefab={...source,tags:kind==='exact'?[MANUAL_OBJECT_CONNECTION_TAG]:source.tags,
   placements:kind==='compound'?[...source.placements,{...source.placements[0]!,id:'second',tileX:1}]:source.placements};
  model.embedPrefab(prefab);
  const object={id:'piece',prefabId:prefab.id,prefabRevision:prefab.revision,tileX:2,tileY:2,elevation:0,layer:'objects' as const,quarterTurns:0 as const,flipX:false,enabled:true,...(kind==='scaled'?{scale:2 as const}: {})};
  model.apply({kind:'place_object',object});
  expect(mapEditorAuthoredObjectFootprint(model.document(),object).length).toBeGreaterThan(1);
  model.moveObject(object.id,2,3);
  expect(model.document().objects[0]).toMatchObject({prefabId:prefab.id,tileY:3});
  expect(model.document().prefabs).toEqual([prefab]);
 });
 it('lets a legacy joined fence reach the map edge and restores its original prefab on undo',()=>{
  const {model}=fixture(),legacy=fence('wide-edge','prop_cf_fence_white_horizontal',2);
  model.embedPrefab(legacy);
  model.apply({kind:'place_object',object:{id:'edge',prefabId:legacy.id,prefabRevision:legacy.revision,tileX:13,tileY:2,elevation:0,layer:'objects',quarterTurns:0,flipX:false,enabled:true}});
  const before=model.document();model.moveObject('edge',15,2);
  expect(model.document().objects[0]?.tileX).toBe(15);
  expect(mapObjectCollisionCells(model.document(),model.document().objects[0]!)).toHaveLength(1);
  model.undo();expect(model.document()).toBe(before);
 });
 it('draws a continuous one-cell fence and refuses repeated placement or moves onto it',()=>{
  const {model,controller,point}=fixture();controller.setCatalog([fence('wide','prop_cf_fence_white_horizontal',2),fence('joined','prop_cf_join_white_fence')]);
  const choices=controller.allObjectChoices('white');expect(choices).toHaveLength(1);expect(choices[0]!.width).toBe(1);
  controller.selectObjectChoice(choices[0]!.id);controller.pointerDown(point(2,2),0);controller.pointerMove(point(5,2));controller.pointerMove(point(5,4));controller.pointerUp();
  expect(model.document().objects).toHaveLength(6);
  const corner=model.document().objects.find(o=>o.tileX===5&&o.tileY===2)!;
  expect(mapObjectConnectionMasks(model.document()).get(corner.id)?.mask).toBe(12);
  controller.pointerDown(point(2,2),0);controller.pointerUp();expect(model.document().objects).toHaveLength(6);
  const last=model.document().objects.at(-1)!;model.moveObject(last.id,2,2);expect(model.document().objects.at(-1)).toEqual(last);
 });
 it('exposes the authored pieces in Exact mode and persists manual joining',()=>{
  const {model,controller,point}=fixture();controller.setCatalog([fence('wide','prop_cf_fence_white_horizontal',2),fence('joined','prop_cf_join_white_fence')]);
  controller.setAutomaticGeneration(false);expect(controller.allObjectChoices()).toHaveLength(2);
  controller.selectObjectChoice('wide');controller.pointerDown(point(2,2),0);controller.pointerUp();
  expect(mapObjectConnectionMasks(model.document()).size).toBe(0);
  const restored=serializeMapDocumentV3(model.document());expect(restored).toContain('studio.connection.manual');
 });
 it('retains the first live base while combining draft resource edits and undoing',()=>{
  const {model}=fixture();model.editResourceState('42',{growthStage:3,health:3},{growthStage:1,health:1});
  model.editResourceState('42',{growthStage:1,health:1},{growthStage:2,health:2});
  expect(model.document().entityStates?.[0]).toMatchObject({baseState:{growthStage:3,health:3},state:{growthStage:2,health:2}});
  model.undo();expect(model.pendingEntityProperties('42')).toEqual({growthStage:1,health:1});
 });
});

it('rejects placing scenery over a live tree on Canopy, including hidden layers',()=>{
 const {model,controller,point}=fixture();
 const p={...fence('tree','tree_cf_oak_mature'),tags:['trees']};controller.setCatalog([p]);
 controller.setLiveRows({placeables:[],chests:[],homesteads:[],combatTargets:[],surfaces:[],npcs:[],players:[],resources:[{id:42n,spaceId:0,kind:'tree_oak',tileX:3,tileY:3}]});
 controller.selectObjectChoice(p.id);controller.pointerDown(point(3,3),0);controller.pointerUp();expect(model.document().objects).toHaveLength(0);
 controller.pointerDown(point(4,3),0);controller.pointerUp();expect(model.document().objects).toHaveLength(1);
 model.toggleLayer('canopy');const object=model.document().objects[0]!;expect(model.placeObject({...object,tileX:3})).toBe(false);
});
