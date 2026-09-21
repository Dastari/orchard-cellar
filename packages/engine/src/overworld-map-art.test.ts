import {expect,it,vi} from 'vitest';
import {bootstrapContentRegistry} from '@orchard/sim';
import type {LoadedAsset,PixelUi,UiSkin} from '@orchard/ui';
const fixture=vi.hoisted(()=>({asset:(name:string)=>({name,image:{},anchor:[8,16],metadata:{animations:{base:[{x:0,y:0,width:16,height:16,durationTicks:1}]}},season:'summer'})}));
vi.mock('@orchard/ui',async original=>({...await original<typeof import('@orchard/ui')>(),
  loadGeneratedAsset:vi.fn(async(name:string)=>fixture.asset(name)),loadGeneratedAssetRegistry:vi.fn(async()=>({assetsById:{}})),
  createGeneratedContentAssetRequests:()=>({request:async(name:string)=>fixture.asset(name)})}));
import {loadMapEditorArt,authoredResourceVisual,drawAuthoredResourceVisual} from './overworld-art.js';

it('loads the actual Studio resource art bank for every growth and depletion state',async()=>{
  const registry=bootstrapContentRegistry();const art=await loadMapEditorArt({} as PixelUi,{} as UiSkin,registry);
  const context={drawImage:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),transform:vi.fn()} as unknown as CanvasRenderingContext2D;
  let rendered=0;
  for(const definition of registry.resources.values())for(const state of ['mature','small','medium','depleted_small','depleted_medium','depleted'] as const){
    const visual=authoredResourceVisual(art,definition.visual,state);
    if(visual===null)continue;
    expect(visual.asset,`${definition.id} ${state}`).toBeDefined();
    expect((visual.asset as LoadedAsset).metadata).toBeDefined();
    expect(()=>drawAuthoredResourceVisual(context,art,definition.visual,state,20,30,0,0,1)).not.toThrow();rendered++;
  }
  expect(rendered).toBeGreaterThan(40);expect(context.drawImage).toHaveBeenCalled();
});
