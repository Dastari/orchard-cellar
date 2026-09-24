import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, MAIN_HAND_INVENTORY_SLOT } from '@orchard/sim';
import { equipmentDescriptionLines } from './equipment-description.js';
const registry=bootstrapContentRegistry();
describe('equipment inspection',()=>{
  it('previews exact weapon power and effective ranks without mutating custody or training',()=>{
    const inventory=[{slot:MAIN_HAND_INVENTORY_SLOT,itemKind:'hearth_rare_sword',quantity:1,durability:125},
      {slot:36,itemKind:'hearth_legendary_hands',quantity:1}];
    const ranks={blade_training:5};
    const before=JSON.stringify({inventory,ranks});
    const lines=equipmentDescriptionLines(registry,'hearth_legendary_sword',inventory,0,ranks,['blade_training'])!;
    expect(lines).toContain('BASE DAMAGE 24 (CURRENT 20.5)');
    expect(lines).toContain('+10% MELEE POWER');
    expect(lines).toContain('5 TRAINED + 2 GEAR = 7 EFFECTIVE (MAX 7)');
    expect(lines).toContain('BONUSES APPLY WHEN EQUIPPED AND SELECTED');
    expect(JSON.stringify({inventory,ranks})).toBe(before);
  });
  it('explains untrained skills and uses honest shared appearance wording',()=>{
    const lines=equipmentDescriptionLines(registry,'hearth_legendary_body',[],0,{})!;
    expect(lines).toContain('INACTIVE: TRAIN THIS SKILL FIRST');
    expect(lines).toContain('APPEARANCE: STANDARD OUTFIT');
    expect(lines).toContain('+0.52 ARMOR');
    expect(equipmentDescriptionLines(registry,'wood',[],0,{})).toBeNull();
  });
});
