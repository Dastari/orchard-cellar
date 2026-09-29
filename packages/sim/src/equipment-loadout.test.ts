import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { compileEquipmentLoadout, MAIN_HAND_EQUIPMENT_INDEX, MAIN_HAND_INVENTORY_SLOT, skillEffectContextForItem } from './equipment-loadout.js';
import { resolveModifierTarget } from './modifiers.js';
const registry = bootstrapContentRegistry();
const sword = {container:'equipment',index:MAIN_HAND_EQUIPMENT_INDEX,itemKind:'hearth_legendary_sword',quantity:1,durability:250};
const hands = {container:'equipment',index:6,itemKind:'hearth_legendary_hands',quantity:1};
const shield = {container:'equipment',index:5,itemKind:'hearth_legendary_shield',quantity:1};
const base = {skillPriority:['blade_training'],registry,inventory:[sword,hands,shield],selectedSlot:MAIN_HAND_INVENTORY_SLOT,trainedRanks:{blade_training:5,battle_conditioning:4}};
describe('effective equipment loadout',()=>{
  it('applies active weapon and two bonus ranks once, and suppresses weapon contributions when selecting another tool',()=>{
    const armed=compileEquipmentLoadout(base);
    expect(armed.skills.effective.blade_training).toBe(7);
    expect(resolveModifierTarget('attackPower',1000,armed.modifiers)).toBe(1310);
    const tool=compileEquipmentLoadout({...base,selectedSlot:0});
    expect(tool.skills.effective.blade_training).toBe(6);
    expect(resolveModifierTarget('attackPower',1000,tool.modifiers)).toBe(1180);
    expect(resolveModifierTarget('toolVigourCost',10000,tool.modifiers)).toBe(10000);
    expect(resolveModifierTarget('toolVigourCost',10000,armed.modifiers)).toBe(8000);
  });
  it('rejects hotbar/backpack copies, duplicate slots and broken weapon benefits',()=>{
    const hidden=compileEquipmentLoadout({...base,inventory:[{...sword,container:'hotbar',index:0},{...sword,container:'backpack',index:2}],selectedSlot:0});
    expect(hidden.skills.grantedRanks).toBe(0);
    expect(resolveModifierTarget('attackPower',1000,hidden.modifiers)).toBe(1150);
    const broken=compileEquipmentLoadout({...base,inventory:[{...sword,durability:0}]});
    expect(broken.skills.grantedRanks).toBe(0);
    const duplicates=compileEquipmentLoadout({...base,inventory:[sword,sword]});
    expect(duplicates.skills.grantedRanks).toBe(0);
  });
  it('suppresses shield stat and rank benefits only while a bow is drawn',()=>{
    const bow={...sword,itemKind:'hearth_legendary_bow'};
    const ready=compileEquipmentLoadout({...base,inventory:[bow,shield]});
    const drawn=compileEquipmentLoadout({...base,inventory:[bow,shield],bowDrawn:true});
    expect(ready.skills.effective.battle_conditioning).toBe(5);
    expect(drawn.skills.effective.battle_conditioning).toBe(4);
    expect(resolveModifierTarget('armor',0,ready.modifiers)).toBe(28);
    expect(resolveModifierTarget('armor',0,drawn.modifiers)).toBe(0);
  });
  it('applies specialist ranks only to their matching tool and keeps respec independent',()=>{
    const inventory=[{container:'equipment',index:0,itemKind:'hearth_prospector_pendant',quantity:1}];
    const trainedRanks=Object.fromEntries([...registry.skillTrees.values()].flatMap(tree=>tree.nodes).map(node=>[node.id,node.maxRank]));
    // A rare pendant helps a trained node below cap without unlocking anything.
    trainedRanks['mining_endurance']=1;
    const mining=compileEquipmentLoadout({...base,inventory,trainedRanks,context:'mining'});
    const fishing=compileEquipmentLoadout({...base,inventory,trainedRanks,context:'fishing'});
    expect(mining.skills.effective.mining_endurance).toBe(2);
    expect(mining.modifiers.filter(mod=>mod.target==='toolVigourCost').map(mod=>mod.value).reduce((a,b)=>a+b,0)).toBe(-1000);
    expect(fishing.modifiers.some(mod=>mod.id.includes('mining_endurance'))).toBe(false);
    expect(compileEquipmentLoadout({...base,inventory,trainedRanks:{}}).skills.grantedRanks).toBe(0);
    expect(trainedRanks.mining_endurance).toBe(1);
  });
  it('reads equipment by container and index, never by a global slot, so a backpack of any size moves nothing (Uncapped Storage step 5)',()=>{
    const armed=compileEquipmentLoadout(base);
    // Backpack cells at any index, including those whose legacy global slot would have been an equipment slot, add
    // nothing; the equipment cells keep their loadout.
    const bigBag=compileEquipmentLoadout({...base,inventory:[sword,hands,shield,
      {...hands,container:'backpack',index:26},{...shield,container:'backpack',index:25},{...sword,container:'backpack',index:300}]});
    expect(bigBag.modifiers).toEqual(armed.modifiers);
    expect(bigBag.skills).toEqual(armed.skills);
    // Only the equipment container counts: the same items in the crafting grid or the stash give nothing.
    const elsewhere=compileEquipmentLoadout({...base,inventory:[{...hands,container:'crafting'},{...shield,container:'stash'}]});
    expect(resolveModifierTarget('armor',0,elsewhere.modifiers)).toBe(0);
    // The Main Hand selected-slot value names the equipment cell; a hotbar selection takes the hotbar cell's context.
    const pick={container:'hotbar',index:2,itemKind:'iron_pickaxe',quantity:1,durability:100};
    const mining=compileEquipmentLoadout({...base,inventory:[pick],trainedRanks:{mining_endurance:1},selectedSlot:2});
    const unselected=compileEquipmentLoadout({...base,inventory:[pick],trainedRanks:{mining_endurance:1},selectedSlot:3});
    expect(mining.modifiers.some(mod=>mod.id.startsWith('skill.mining_endurance'))).toBe(true);
    expect(unselected.modifiers.some(mod=>mod.id.startsWith('skill.mining_endurance'))).toBe(false);
    // Equipment modifier ids name the equipment index.
    expect(armed.modifiers.map(mod=>mod.id).filter(id=>/^equipment\.[0-9]/u.test(id)).every(id=>/^equipment\.[0-9]\./u.test(id))).toBe(true);
  });
  it('does not let retired item metadata select an equipment skill context',()=>{
    const source=registry.items.get('item:iron_pickaxe')!;
    const retired={...registry,items:new Map(registry.items).set(source.id,{...source,retired:true as const})};
    expect(skillEffectContextForItem(retired,'iron_pickaxe')).toBe('global');
  });
});
