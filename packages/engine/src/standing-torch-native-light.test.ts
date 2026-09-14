import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {bootstrapContentRegistry,resolveObjectLight} from '@orchard/sim';
import {PLACEABLE_LIGHT_EMITTERS,placeablePointLight} from './light-sources.js';
import {hearthLobbyPointLights} from './hearth-lobby-scene.js';
import {HEARTH_LOBBY_TORCHES} from '@orchard/sim';
it('anchors authored and fallback torch emission in the stable native flame core across every animation frame',()=>{
  const asset=JSON.parse(readFileSync(new URL('../../assets/props/prop_cf_standing_torch.sprite.json',import.meta.url),'utf8')) as {
    anchor:[number,number];frames:Record<string,string[][]>;sourcePalette:Record<string,string>};
  const registry=bootstrapContentRegistry(),component=registry.objects.get('object:standing_torch')!.components.light!;
  const x=asset.anchor[0],y=asset.anchor[1]+component.offsetY!;
  expect(asset.frames['burn']).toHaveLength(8);
  for(const frame of asset.frames['burn']!){expect(['#ffc825','#ffa214']).toContain(asset.sourcePalette[frame[y]![x]!]);}
  expect(PLACEABLE_LIGHT_EMITTERS['standing_torch']!.offsetY).toBe(component.offsetY);
  const torch={id:4n,kind:'standing_torch',tileX:3,tileY:5};
  const authored=placeablePointLight(torch,20n,resolveObjectLight(component,{lit:true}))!;
  const fallback=placeablePointLight(torch,20n)!;
  expect([authored.worldX,authored.worldY,authored.receiverDirectionWorldY]).toEqual([fallback.worldX,fallback.worldY,fallback.receiverDirectionWorldY]);
  const lobby=hearthLobbyPointLights(20n);
  for(const [index,row] of HEARTH_LOBBY_TORCHES.entries())expect(lobby[index]!.worldY).toBe((row.tileY+1)*16+component.offsetY!);
  expect(placeablePointLight(torch,20n,resolveObjectLight(component,{lit:false}))).toBeNull();
});
