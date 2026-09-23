import {expect,it,vi} from 'vitest';
import {bootstrapContentRegistry,createLiveIslandMapDocument,createMapPrefabDocument,FIXED_UNITS_PER_PIXEL as U,type MapObjectInstance} from '@orchard/sim';
import {clearLiveMapShadowCaches,liveMapObjectLightOccluders,liveMapObjectLightFrameKey,preloadLiveMapObjectAssets} from './live-map-runtime.js';
import type {TerrainArray} from './terrain.js';
const frames=[{x:0,y:0,width:16,height:32,durationTicks:1},{x:16,y:0,width:16,height:32,durationTicks:1}];
const masks=vi.hoisted(()=>[new Uint8Array(512).fill(1),new Uint8Array(512).fill(1)]);
vi.mock('@orchard/ui',async original=>({...await original<typeof import('@orchard/ui')>(),loadGeneratedAsset:async()=>({
  metadata:{image:'fixture.png',animations:{sway:frames},states:{base:frames[0]}},anchor:[8,31]})}));
vi.mock('./light-occlusion.js',async original=>({...await original<typeof import('./light-occlusion.js')>(),
  createFrameLightOccluder:(_asset:unknown,frame:{x:number})=>({left:-8,top:-31,width:16,height:32,opaque:masks[frame.x===0?0:1]!})}));
vi.mock('./terrain.js',async original=>({...await original<typeof import('./terrain.js')>(),
  terrainElevationAtWorldFoot:()=>2,terrainProjectedDepthAtFoot:()=>32,terrainProjectedElevationAtFoot:()=>2}));
const terrain={} as TerrainArray;
const baseRegistry=bootstrapContentRegistry();
const registry={...baseRegistry,objects:new Map([...baseRegistry.objects, ['object:shadow_fixture', {
  id:'object:shadow_fixture' as const,kind:'object' as const,schemaVersion:1 as const,displayName:'Authored column',components:{
    sprite:{asset:'canopy_shadow_fixture'},lighting:{receivesGlobal:true,castsShadow:'column' as const},
  },
}]])};
function fixture(){
  const prefab={...createMapPrefabDocument({id:'shadow-tree',title:'Tree'}),cells:[{id:'base',tileX:0,tileY:0,elevation:0,collisionMask:0x0660}],placements:[{
    id:'visual',assetId:1,assetName:'canopy_shadow_fixture',tileX:0,tileY:0,elevation:0,layer:'canopy' as const,
    quarterTurns:0 as const,flipX:false,visual:{kind:'state' as const,name:'base',frameIndex:0}}]};
  const object:MapObjectInstance={id:'tree',prefabId:prefab.id,prefabRevision:prefab.revision,tileX:10,tileY:10,elevation:0,
    layer:'canopy',quarterTurns:0,flipX:false,scale:1,enabled:true};
  return {...createLiveIslandMapDocument(),prefabs:[prefab],objects:[object]};
}
it('collects a loaded native tree with exact projected base, receiver plane and painter identity',async()=>{
  const document=fixture();
  expect(liveMapObjectLightOccluders(document,terrain,registry,0)).toEqual([]);
  const before=liveMapObjectLightFrameKey(document,registry,0);
  await preloadLiveMapObjectAssets(document);
  expect(liveMapObjectLightFrameKey(document,registry,0)).not.toBe(before);
  const [tree]=liveMapObjectLightOccluders(document,terrain,registry,0);
  expect(tree).toMatchObject({footX:168,footY:144,elevationLayer:2,contactEnabled:true,shadowMode:'column',
    receiver:{left:160,top:113,elevationLayer:2},
    obstacle:{left:164*U,top:132*U,right:172*U-1,bottom:140*U-1},
    painterOrder:{footY:144,elevationLayer:2,depthPhase:'entity'}});
  expect(tree!.receiver!.opaque).toBe(masks[0]);
  expect(tree!.painterOrder!.tie).toContain('object:tree:visual');
  expect(liveMapObjectLightOccluders({...document,objects:[{...document.objects[0]!,enabled:false}]},terrain,registry,0)).toEqual([]);
  expect(liveMapObjectLightOccluders({...document,objects:[{...document.objects[0]!,layer:'ground'}]},terrain,registry,0)).toEqual([]);
});
it('keeps a baseless animated silhouette, disables contact and tracks the exact selected frame',async()=>{
  const document=fixture();
  const animated={...document,prefabs:[{...document.prefabs[0]!,cells:[],placements:[{...document.prefabs[0]!.placements[0]!,
    visual:{kind:'animation' as const,name:'sway',frameIndex:0}}]}]};
  await preloadLiveMapObjectAssets(animated);
  const first=liveMapObjectLightOccluders(animated,terrain,registry,0)[0]!;
  const second=liveMapObjectLightOccluders(animated,terrain,registry,200)[0]!;
  expect(first.shadowMode).toBe('silhouette');expect(first.contactEnabled).toBe(false);
  expect(first.receiver!.opaque).toBe(masks[0]);expect(second.receiver!.opaque).toBe(masks[1]);
  expect(liveMapObjectLightFrameKey(animated,registry,0)).toBe(liveMapObjectLightFrameKey(animated,registry,100));
  expect(liveMapObjectLightFrameKey(animated,registry,0)).not.toBe(liveMapObjectLightFrameKey(animated,registry,200));
});
it('uses the current bound lamp collision policy, including retired and rebound definitions',async()=>{
  const document=fixture();
  const lamp={...document,prefabs:[{...document.prefabs[0]!,placements:[{...document.prefabs[0]!.placements[0]!,assetName:'prop_cf_furniture_rustic_standing_lamp'}]}]};
  await preloadLiveMapObjectAssets(lamp);
  expect(liveMapObjectLightOccluders(lamp,terrain,registry,0)).toEqual([]);
  const original=registry.objects.get('object:furniture_rustic_standing_lamp')!;
  for(const changed of [null,{...original,retired:true},
    {...original,components:{...original.components,sprite:{...original.components.sprite!,asset:'another_asset'}}},
    {...original,components:{...original.components,collision:{...original.components.collision!,occludesLight:true}}}]){
    const objects=new Map(registry.objects);
    if(changed)objects.set(original.id,changed);else objects.delete(original.id);
    expect(liveMapObjectLightOccluders(lamp,terrain,{...registry,objects},0)).toHaveLength(1);
  }
});
it('retains static object casters across animated neighbours and invalidates terrain/content/document changes',async()=>{
  const base=fixture();
  const animatedPrefab={...base.prefabs[0]!,id:'animated-neighbour',placements:[{...base.prefabs[0]!.placements[0]!,
    visual:{kind:'animation' as const,name:'sway',frameIndex:0}}]};
  const document={...base,prefabs:[...base.prefabs,animatedPrefab],objects:[...base.objects,
    {...base.objects[0]!,id:'animated',prefabId:animatedPrefab.id,tileX:20}]};
  await preloadLiveMapObjectAssets(document);
  const first=liveMapObjectLightOccluders(document,terrain,registry,0);
  const next=liveMapObjectLightOccluders(document,terrain,registry,200);
  expect(next[0]).toBe(first[0]);expect(next[1]).not.toBe(first[1]);
  expect(liveMapObjectLightOccluders(document,terrain,registry,200)[1]).toBe(next[1]);
  clearLiveMapShadowCaches();
  expect(liveMapObjectLightOccluders(document,terrain,registry,200)[0]).not.toBe(next[0]);
  const movedTerrain={...terrain,version:2};
  expect(liveMapObjectLightOccluders(document,movedTerrain,registry,200)[0]).not.toBe(next[0]);
  const beforeContent=liveMapObjectLightOccluders(document,terrain,registry,200)[0];
  expect(liveMapObjectLightOccluders(document,terrain,{...registry},200)[0]).not.toBe(beforeContent);
  const moved={...document,objects:[{...document.objects[0]!,tileX:30},document.objects[1]!]};
  expect(liveMapObjectLightOccluders(moved,terrain,registry,200)[0]!.footX).toBe(488);
});
