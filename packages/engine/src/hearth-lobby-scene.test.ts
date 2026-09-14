import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,HEARTH_LOBBY_TORCHES} from '@orchard/sim';
import {enqueueHearthLobbyFurniture,hearthLobbyPointLights} from './hearth-lobby-scene.js';
import type {OverworldArt} from './overworld-art.js';
import type {WorldDepthItem} from './renderer.js';

describe('lobby permanent lighting',()=>{
  it('attaches every flame to the same foot and depth anchor as its native fixture',()=>{
    const queue:WorldDepthItem[]=[];
    // Deferred draw closures let the geometry contract run without a browser.
    enqueueHearthLobbyFurniture({} as CanvasRenderingContext2D,{} as OverworldArt,bootstrapContentRegistry(),0,0,3,
      (_x,_y,item)=>queue.push(item));
    const lights=hearthLobbyPointLights(120n);
    expect(lights).toHaveLength(HEARTH_LOBBY_TORCHES.length);
    HEARTH_LOBBY_TORCHES.forEach((torch,index)=>{
      const light=lights[index]!;
      const sprite=queue.find(item=>item.tie===`hearth-lobby:torch:${torch.id}`)!;
      expect(light.worldX).toBe(torch.tileX*16+8);
      expect(light.receiverDirectionWorldY).toBe(sprite.footY);
      expect(light.worldY).toBe(sprite.footY-15);
      expect(light.profile).toBe('flame');
      expect(light.radiusTiles).toBeGreaterThan(0);
    });
  });
  it('keeps flame sampling deterministic across reconnects and large authority ticks',()=>{
    for(const tick of [0n,120n,9_007_199_254_740_999n]){
      const lights=hearthLobbyPointLights(tick);
      expect(lights).toEqual(hearthLobbyPointLights(tick));
      for(const light of lights){
        expect(Number.isFinite(light.worldY)).toBe(true);
        expect(light.strengthPerMille).toBeGreaterThanOrEqual(970);
        expect(light.strengthPerMille).toBeLessThanOrEqual(1030);
      }
    }
  });
  it('renders nothing when an authored lobby object edge is unavailable',()=>{
    const base=bootstrapContentRegistry(),objects=new Map(base.objects);
    objects.delete('object:standing_torch');
    const registry={...base,objects};
    const queue:WorldDepthItem[]=[];
    enqueueHearthLobbyFurniture({} as CanvasRenderingContext2D,{} as OverworldArt,registry,0,0,3,
      (_x,_y,item)=>queue.push(item));
    expect(queue).toEqual([]);
    expect(hearthLobbyPointLights(120n,registry)).toEqual([]);
  });
});
