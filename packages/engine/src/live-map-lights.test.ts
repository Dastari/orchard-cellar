import {expect,it,vi} from 'vitest';
import {bootstrapContentRegistry,createLiveIslandMapDocument,createMapPrefabDocument,type MapObjectInstance} from '@orchard/sim';
import {liveMapObjectPointLights,preloadLiveMapObjectAssets} from './live-map-runtime.js';
import {projectPointLightToTerrain} from './light-projection.js';
import type {TerrainArray} from './terrain.js';
vi.mock('@orchard/ui',async importOriginal=>({...await importOriginal<typeof import('@orchard/ui')>(),
  loadGeneratedAsset:async()=>({metadata:{image:'fixture.png',animations:{burn:[{x:0,y:0,width:16,height:32,durationTicks:1}],base:[{x:0,y:0,width:16,height:48,durationTicks:1}]},states:{}},anchor:[8,31]})}));
vi.mock('./terrain.js',async importOriginal=>({...await importOriginal<typeof import('./terrain.js')>(),
  terrainElevationAtWorldFoot:(_terrain:unknown,x:number)=>x<180?2:0}));
const registry=bootstrapContentRegistry();
function fixture(turn:0|1|2|3=0){
  const prefab={...createMapPrefabDocument({id:'light-fixture',title:'Light fixture'}),placements:[{
    id:'visual',assetId:1,assetName:'prop_cf_standing_torch',visual:{kind:'animation' as const,name:'burn',frameIndex:0},
    tileX:0,tileY:0,elevation:0,layer:'object' as const,quarterTurns:0 as const,flipX:false}]};
  const object:MapObjectInstance={id:'torch',prefabId:prefab.id,prefabRevision:prefab.revision,tileX:10,tileY:10,
    elevation:0,layer:'objects',quarterTurns:turn,flipX:false,scale:2,enabled:true};
  return {...createLiveIslandMapDocument(),prefabs:[prefab],objects:[object]};
}
it('requires loaded, enabled native lit visuals and current live content',async()=>{
  const document=fixture();
  expect(liveMapObjectPointLights(document,registry,0n)).toEqual([]);
  await preloadLiveMapObjectAssets(document);
  expect(liveMapObjectPointLights(document,registry,0n)).toHaveLength(1);
  expect(liveMapObjectPointLights(null,registry,0n)).toEqual([]);
  expect(liveMapObjectPointLights({...document,objects:[{...document.objects[0]!,enabled:false}]},registry,0n)).toEqual([]);
  expect(liveMapObjectPointLights({...document,prefabs:[]},registry,0n)).toEqual([]);
  const off={...document,prefabs:[{...document.prefabs[0]!,placements:[{...document.prefabs[0]!.placements[0]!,visual:{kind:'state' as const,name:'off',frameIndex:0}}]}]};
  expect(liveMapObjectPointLights(off,registry,0n)).toEqual([]);
  const objects=new Map(registry.objects),definition=objects.get('object:standing_torch')!;
  objects.set(definition.id,{...definition,retired:true});
  expect(liveMapObjectPointLights(document,{...registry,objects},0n)).toEqual([]);
  objects.set(definition.id,{...definition,components:{...definition.components,sprite:{asset:'different-native-asset'}}});
  expect(liveMapObjectPointLights(document,{...registry,objects},0n)).toEqual([]);
  objects.set(definition.id,{...definition,components:{...definition.components,light:{...definition.components.light!,when:{state:'lit',equals:false}}}});
  expect(liveMapObjectPointLights(document,{...registry,objects},0n)).toEqual([]);
});
it('projects rotated scaled emitters from their physical contact on a plane boundary',async()=>{
  for(const turn of [1,3] as const){
    const document=fixture(turn);await preloadLiveMapObjectAssets(document);
    const light=liveMapObjectPointLights(document,registry,123n)[0]!;
    const offset=registry.objects.get('object:standing_torch')!.components.light!.offsetY!;
    expect(light.worldX).toBe(168+(turn===1?-1:1)*offset*2);
    expect(light.worldY).toBe(176);expect(light.terrainContactX).toBe(168);
    const sample=vi.fn((x:number)=>x<180?32:0);
    const projected=projectPointLightToTerrain(light,{} as TerrainArray,sample,light.receiverDirectionWorldY,light.terrainContactX);
    expect(sample).toHaveBeenCalledWith(168,176);
    expect(projected.elevationLayer).toBe(2);expect(projected.worldY).toBe(144);
    expect(projected.worldX).toBe(light.worldX);
  }
});
it('combines placement rotation, parent mirror and scale without changing flicker on reorder',async()=>{
  const document=fixture(1),prefab=document.prefabs[0]!;
  const transformed={...document,prefabs:[{...prefab,placements:[{...prefab.placements[0]!,tileX:2,tileY:1,quarterTurns:1 as const,flipX:true}]}],objects:[{...document.objects[0]!,flipX:true}]};
  await preloadLiveMapObjectAssets(transformed);
  const light=liveMapObjectPointLights(transformed,registry,93n)[0]!;
  const offset=registry.objects.get('object:standing_torch')!.components.light!.offsetY!;
  expect([light.worldX,light.worldY,light.terrainContactX,light.receiverDirectionWorldY]).toEqual([136,112+offset*2,136,112]);
  const other={...transformed.objects[0]!,id:'other',tileX:20};
  expect(liveMapObjectPointLights({...transformed,objects:[other,...transformed.objects]},registry,93n)[1]).toEqual(light);
});

it('lights the native streetlamp from its lantern and rejects mismatched or retired fixtures',async()=>{
  const base=fixture();
  const document={...base,prefabs:[{...base.prefabs[0]!,placements:[{
    ...base.prefabs[0]!.placements[0]!,assetName:'prop_cf_hearth_streetlamp',
    visual:{kind:'animation' as const,name:'base',frameIndex:0},
  }]}]};
  await preloadLiveMapObjectAssets(document);
  const lights=liveMapObjectPointLights(document,registry,0n);
  expect(lights).toHaveLength(1);
  expect(lights[0]).toMatchObject({worldX:168,worldY:102,radiusTiles:5,receiverDirectionWorldY:176});
  const objects=new Map(registry.objects),definition=objects.get('object:hearth_streetlamp')!;
  objects.set(definition.id,{...definition,retired:true});
  expect(liveMapObjectPointLights(document,{...registry,objects},0n)).toEqual([]);
});
