import {expect,it,vi} from 'vitest';
import {enqueueGameplayDecorations} from './gameplay-painter-decorations.js';
import {mapObjectPointLights} from '@orchard/engine/map-object-presentation';
import {TOPSIDE_SPACE_ID} from '@orchard/sim';
import type {PointLight} from '@orchard/engine/lighting';
vi.mock('@orchard/engine/map-object-presentation',()=>({mapObjectPointLights:vi.fn()}));
it('collects offscreen map-light influence with contact projection only on the active visible topside',()=>{
  const source={worldX:110,worldY:50,radiusTiles:2,color:{r:255,g:196,b:120},terrainContactX:95,receiverDirectionWorldY:70};
  vi.mocked(mapObjectPointLights).mockReturnValue([source,{...source,worldX:200}]);
  const lights:PointLight[]=[],projectedLight=vi.fn((light:PointLight)=>light);
  const input={dynamicLighting:true,debugEntitiesHidden:false,
    activeSpaceDefinition:{spaceId:Number(TOPSIDE_SPACE_ID),generator:'debug_flat'},
    snapshot:{content:{registry:{}},placeables:[],homesteads:[],clock:{authorityTick:42n}},topsideMapRecords:null,
    pointLights:lights,projectedLight,topsideDecorations:()=>[],
    visible:{left:0,top:0,right:100,bottom:100},lightVisible:{left:0,top:0,right:100,bottom:100}};
  const render=()=>enqueueGameplayDecorations(input as unknown as Parameters<typeof enqueueGameplayDecorations>[0]);
  render();expect(lights).toEqual([source]);expect(projectedLight).toHaveBeenCalledWith(source,70,95);
  for(const state of ['interior','hidden','lighting-off'] as const){
    lights.length=0;vi.mocked(mapObjectPointLights).mockClear();
    input.activeSpaceDefinition.spaceId=state==='interior'?30000:TOPSIDE_SPACE_ID;
    input.debugEntitiesHidden=state==='hidden';input.dynamicLighting=state!=='lighting-off';
    render();expect(lights,state).toEqual([]);expect(mapObjectPointLights,state).not.toHaveBeenCalled();
  }
});
