import {describe,it,expect,vi} from 'vitest';
import {bootstrapContentRegistry} from '@orchard/sim';
import type {LoadedAsset} from '@orchard/ui';
import {loadAuthoredNpcArt} from './authored-npc-art.js';
import {drawOverworldMerchant,merchantWorldBounds,type OverworldArt} from './overworld-art.js';

describe('single-pose native shopkeepers',()=>{
  it('draws and bounds an authored trader that has idle but no directional clips',async()=>{
    const npc=bootstrapContentRegistry().npcs.get('npc:willow_storekeeper')!;
    const asset={assetId:987654,image:{},anchor:[16,31],metadata:{image:'fixture',animations:{
      idle:[{x:0,y:0,width:32,height:32,durationTicks:1}],
    }}} as unknown as LoadedAsset;
    const art={} as OverworldArt;
    await loadAuthoredNpcArt(art,[npc],async()=>asset);
    const drawImage=vi.fn();
    const context={drawImage,save:vi.fn(),restore:vi.fn(),getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),setTransform:vi.fn()} as unknown as CanvasRenderingContext2D;
    drawOverworldMerchant(context,art,100,100,'down',false,0,0,0,1,npc.runtimeKind);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(merchantWorldBounds(art,100,100,'down',false,0,npc.runtimeKind)).toEqual({left:84,top:69,right:116,bottom:101});
  });

  it('uses fishing-cycle animations for an arbitrarily renamed authored NPC',async()=>{
    const source=bootstrapContentRegistry().npcs.get('npc:fisherman_fin')!;
    const npc={...source,id:'npc:river_sage' as const,runtimeKind:'river_sage'};
    const asset={assetId:987655,image:{},anchor:[16,31],metadata:{image:'fixture',animations:{
      idle:[{x:0,y:0,width:16,height:32,durationTicks:1}],
      cast_down:[{x:32,y:0,width:24,height:32,durationTicks:1}],
    }}} as unknown as LoadedAsset;
    const art={} as OverworldArt;
    await loadAuthoredNpcArt(art,[npc],async()=>asset);
    const drawImage=vi.fn();
    const context={drawImage,save:vi.fn(),restore:vi.fn(),getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),setTransform:vi.fn()} as unknown as CanvasRenderingContext2D;

    drawOverworldMerchant(context,art,100,100,'down',false,0,0,0,1,
      npc.runtimeKind,'fish_cast',true);

    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.calls[0]!.slice(1,5)).toEqual([32,0,24,32]);
    const bounds=merchantWorldBounds(art,100,100,'down',false,0,
      npc.runtimeKind,'fish_cast',true)!;
    expect(bounds.right-bounds.left).toBe(24);
  });
});
