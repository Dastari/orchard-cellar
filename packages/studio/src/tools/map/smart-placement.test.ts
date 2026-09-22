import {describe,it,expect} from 'vitest';
import {createEmptyMapDocument,createMapPrefabDocument,migrateMapDocumentV2,serializeMapDocumentV3,mapObjectConnectionMasks} from '@orchard/sim';
import {StudioSelectionBus,StudioInspectorKernel,StudioValidationPanel,StudioNotifications} from '../../shell/index.js';
import {MapEditorController} from './editor-controller.js';
import {MapEditorModel} from './model.js';
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
