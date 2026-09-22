import {expect,it,vi} from 'vitest';
import {bootstrapContentRegistry} from '@orchard/sim';
import type {LoadedAsset,PixelUi,UiSkin} from '@orchard/ui';
const fixture=vi.hoisted(()=>({asset:(name:string)=>({name,image:{},anchor:[8,16],metadata:{animations:{base:[{x:0,y:0,width:16,height:16,durationTicks:1}]}},season:'summer'})}));
vi.mock('@orchard/ui',async original=>({...await original<typeof import('@orchard/ui')>(),
  loadGeneratedAsset:vi.fn(async(name:string)=>fixture.asset(name)),loadGeneratedAssetRegistry:vi.fn(async()=>({assetsById:{}})),
  createGeneratedContentAssetRequests:()=>({request:async(name:string)=>fixture.asset(name)})}));
import {loadMapEditorArt,authoredResourceVisual,drawAuthoredResourceVisual,
  drawOverworldAvatar,drawOverworldHorse,drawOverworldMerchant,drawOverworldRogueEnemy,
  DEFAULT_PLAYER_APPEARANCE,playerLayersForAppearance,drawOverworldWildlife} from './overworld-art.js';

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

it('loads live player, held-light, mount and enemy dependencies before declaring Studio art ready',async()=>{
  const art=await loadMapEditorArt({} as PixelUi,{} as UiSkin);
  const context={drawImage:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),transform:vi.fn()} as unknown as CanvasRenderingContext2D;
  for(const appearance of [DEFAULT_PLAYER_APPEARANCE,{hairKind:'retired',shirtKind:'retired',pantsKind:'retired',shoesKind:'retired'}]){
    for(const action of [false,true]){
      expect(playerLayersForAppearance(art,appearance,false,action)).toHaveLength(6);
      expect(playerLayersForAppearance(art,appearance,false,action).every(layer=>layer?.metadata!==undefined)).toBe(true);
    }
    for(const held of ['empty','torch','lantern'])for(const moving of [false,true]){
      expect(()=>drawOverworldAvatar(context,art,20,30,'down',moving,0,0,0,1,null,null,appearance,held)).not.toThrow();
    }
  }
  expect(art.rogueEnemies.slime_small_red?.metadata).toBeDefined();
  expect(()=>drawOverworldRogueEnemy(context,art,'slime_small_red','idle',20,30,'down',false,0,0,0,1,false)).not.toThrow();
  expect(()=>drawOverworldHorse(context,art,20,30,'down',false,0,0,0,1,false)).not.toThrow();
  for(const kind of ['merchant','farmer_bob','fisherman_fin']){
    expect(()=>drawOverworldMerchant(context,art,20,30,'down',false,0,0,0,1,kind)).not.toThrow();
  }
  for(const species of ['cow','sheep','pig','chicken','capybara'] as const){
    expect(art.wildlife[species==='capybara'?'capybara_look':species]?.[0]?.metadata).toBeDefined();
    expect(()=>drawOverworldWildlife(context,art,species,0,'idle',20,30,'down',false,0,0,0,1)).not.toThrow();
  }
});
