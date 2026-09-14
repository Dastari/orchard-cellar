import {describe,expect,it} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {hearthLegendaryRecipeOffer,hearthRecipeExchangeNpcForRuntimeId,planHearthSealExchange} from './hearth-seal-exchange.js';
import type {NpcContentDefinition} from './content/npc-definition.js';

const registry=bootstrapContentRegistry();

describe('authored recipe exchange',()=>{
  it('projects the reviewed exchange without deriving capability from identifier prefixes',()=>{
    const npc=registry.npcs.get('npc:willow_archivist')!;
    expect(npc.commerce?.recipeExchange?.recipes).toHaveLength(8);
    expect(hearthRecipeExchangeNpcForRuntimeId(registry,npc.runtimeId)?.id).toBe(npc.id);
    expect(hearthLegendaryRecipeOffer(registry,npc.id,'hearth_legendary_sword')).toMatchObject({
      seals:3,paymentItemKind:'guardian_seal',itemKind:'hearth_legendary_sword',
    });
  });

  it('follows arbitrary authored NPC, payment, recipe and output identities',()=>{
    const sourceNpc=registry.npcs.get('npc:willow_archivist')!;
    const sourcePayment=registry.items.get('item:guardian_seal')!;
    const sourceOutput=registry.items.get('item:hearth_legendary_sword')!;
    const sourceRecipe=registry.recipes.get('recipe:hearth_legendary_sword')!;
    const items=new Map(registry.items),recipes=new Map(registry.recipes);
    const npcs=new Map<string,NpcContentDefinition>();
    for(const [id,npc] of registry.npcs){const {commerce,...withoutCommerce}=npc;void commerce;npcs.set(id,withoutCommerce);}
    items.set('item:ward_token',{...sourcePayment,id:'item:ward_token'});
    items.set('item:relic_blade',{...sourceOutput,id:'item:relic_blade',displayName:'Relic Blade'});
    recipes.set('recipe:forgotten_pattern',{...sourceRecipe,id:'recipe:forgotten_pattern',output:{item:'item:relic_blade',count:1}});
    npcs.set('npc:keeper_of_marks',{...sourceNpc,id:'npc:keeper_of_marks',runtimeId:'99002',commerce:{recipeExchange:{
      payment:{item:'item:ward_token',count:2},recipes:['recipe:forgotten_pattern'],
    }}});
    const authored={...registry,items,recipes,npcs};
    expect(hearthRecipeExchangeNpcForRuntimeId(authored,'99002')?.id).toBe('npc:keeper_of_marks');
    expect(hearthLegendaryRecipeOffer(authored,'npc:keeper_of_marks','forgotten_pattern')).toMatchObject({
      itemKind:'relic_blade',title:'Relic Blade',seals:2,paymentItemKind:'ward_token',
    });
    const result=planHearthSealExchange({registry:authored,npcId:'npc:keeper_of_marks',recipeId:'forgotten_pattern',
      alreadyKnown:false,expectedContentHash:authored.contentHash,expectedSeals:2,containers:{
        hotbar:{id:'hotbar',capacity:1,slots:[{itemKind:'ward_token',quantity:1}]},
        backpack:{id:'backpack',capacity:1,slots:[{itemKind:'ward_token',quantity:2}]},
      }});
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.containers.hotbar?.slots[0]).toBeNull();
    expect(result.containers.backpack?.slots[0]).toMatchObject({itemKind:'ward_token',quantity:1});
  });
});
