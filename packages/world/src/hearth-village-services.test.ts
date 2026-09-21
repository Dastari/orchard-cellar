import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,HEARTH_INTERIORS,hearthInteriorCollision,positionCollides,TILE_SIZE_FIXED,merchantOffers,itemEconomyDefinition} from '@orchard/sim';
import {authoredNpcRowPlan,authoredNpcProfilePlan} from './behaviour/npc.js';

const registry=bootstrapContentRegistry();
const villagers=[...registry.npcs.values()].filter(npc=>npc.id.startsWith('npc:willow_'));
describe('Willowharbour authored services',()=>{
  it('provides eight service identities and four residents without replacing starter NPCs',()=>{
    expect(villagers).toHaveLength(12);
    expect(villagers.filter(npc=>npc.id.includes('resident_'))).toHaveLength(4);
    expect(new Set(villagers.map(npc=>npc.runtimeId)).size).toBe(12);
    expect(new Set(villagers.map(npc=>npc.runtimeKind)).size).toBe(12);
    const ids=[...registry.npcs.values()].map(npc=>npc.runtimeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(registry.npcs.get('npc:marlow')?.runtimeId).toBe('2');
    expect(registry.npcs.get('npc:fisherman_fin')?.runtimeId).toBe('7');
  });
  it.each(HEARTH_INTERIORS.filter(interior=>villagers.some(npc=>npc.home.spaceId===interior.spaceId)))('$kind has active content geometry and an accessible living service NPC',interior=>{
    const space=registry.spaces.get(`space:willow_${interior.kind.replaceAll('-','_')}`);
    expect(space).toMatchObject({spaceId:interior.spaceId,generator:'village_interior',weather:false,environment:'indoor'});
    const collision=hearthInteriorCollision(interior.spaceId);
    const occupants=villagers.filter(npc=>npc.home.spaceId===interior.spaceId);
    expect(occupants.length).toBeGreaterThan(0);
    for(const npc of occupants){
      const row=authoredNpcRowPlan(npc,20n);
      expect(row.health).toBeGreaterThan(0);expect(positionCollides(row,collision)).toBe(false);
      expect(npc.ai.kind).toBe('stationary');
      const profile=authoredNpcProfilePlan(npc);expect(profile?.dialogueId).toBe(npc.dialogue?.slice(9));
    }
    expect(occupants.some(npc=>npc.home.tileX===interior.service.tileX&&npc.home.tileY===interior.service.tileY)).toBe(true);
    const dx=interior.approach.tileX-interior.service.tileX,dy=interior.approach.tileY-interior.service.tileY;
    expect(dx*dx+dy*dy).toBeLessThan(9);
    expect(positionCollides({x:(interior.approach.tileX+.5)*TILE_SIZE_FIXED,y:(interior.approach.tileY+.5)*TILE_SIZE_FIXED},collision)).toBe(false);
  });
  it('makes each advertised catalogue buyable and connects it to the actual shop frame',()=>{
    for(const npc of villagers){
      const dialogue=registry.dialogues.get(npc.dialogue!);expect(dialogue).toBeDefined();
      if(!npc.shop){expect(dialogue!.nodes.some(node=>node.mode==='shop')).toBe(false);continue;}
      expect(dialogue?.shop).toBe(npc.shop);
      expect(dialogue?.nodes.find(node=>node.id==='shop')).toMatchObject({mode:'shop',frameId:'frame:shop'});
      const offers=merchantOffers(npc.shop.slice(5));expect(offers.length).toBeGreaterThan(0);
      for(const item of offers){
        const economy=itemEconomyDefinition(item);expect(economy?.buyPriceBronze).not.toBeNull();
        expect(economy!.buyPriceBronze!).toBeGreaterThan(economy!.sellPriceBronze);
      }
    }
    const smithOffers=merchantOffers('willow_smith');
    const smithGear=smithOffers.filter(item=>!item.endsWith('_plan'));
    expect(smithOffers).toHaveLength(40);
    expect(smithGear).toHaveLength(8);
    expect(smithGear.every(item=>item.startsWith('hearth_common_'))).toBe(true);
    for(const rarity of ['common','uncommon','rare','epic'])
      expect(smithOffers.filter(item=>item.startsWith(`hearth_${rarity}_`)&&item.endsWith('_plan'))).toHaveLength(8);
    for(const item of merchantOffers('willow_cook')){
      const economy=itemEconomyDefinition(item)!;expect(economy.buyPriceBronze).toBe(economy.sellPriceBronze*2);
    }
  });
});
