import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, MAIN_HAND_INVENTORY_SLOT } from '@orchard/sim';
import { equipmentDescriptionLines, equipmentModifierLabel } from './equipment-description.js';
import type { Modifier } from '@orchard/sim';
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
  it('renders each Gear-D3 stat in its own unit and keeps existing lines unchanged',()=>{
    const line=(target:Modifier['target'],value:number,layer:Modifier['layer']='flat')=>
      equipmentModifierLabel({id:'test',target,value,layer,source:'equipment'});
    expect(line('int',3)).toBe('+3 INTELLIGENCE');
    expect(line('str',8)).toBe('+8 STRENGTH');
    expect(line('cha',1)).toBe('+1 CHARISMA');
    expect(line('manaRegen',120)).toBe('+1.2 MANA / SEC');
    expect(line('healthRegen',150)).toBe('+1.5 HEALTH / SEC');
    expect(line('vigourRegen',5)).toBe('+0.05 VIGOUR / SEC');
    expect(line('maxHealth',12000)).toBe('+120 HEALTH');
    expect(line('maxMana',1200,'pctAdd')).toBe('+12% MAX MANA');
    expect(line('maxHealth',1500,'pctAdd')).toBe('+15% MAX HEALTH');
    expect(line('attackPower',1000,'pctAdd')).toBe('+10% MELEE POWER');
    expect(line('swingSpeed',-1500,'pctAdd')).toBe('-15% ATTACK INTERVAL');
    expect(line('criticalChance',300)).toBe('+3 POINTS CRITICAL CHANCE');
    expect(line('armor',52)).toBe('+0.52 ARMOR');
    expect(line('armorPct',400)).toBe('+4% DAMAGE REDUCTION');
  });
  it('renders every authored equipment modifier exactly as the previous centi formatter did',()=>{
    const legacy=(mod:Modifier)=>{
      const unit=mod.target==='criticalChance' ? ' POINTS' : mod.layer==='pctAdd' || mod.target==='armorPct' ? '%' : '';
      return `${mod.value>=0?'+':''}${Number((mod.value/100).toFixed(2))}${unit} ${mod.target}`;
    };
    const mods=[...registry.items.values()].flatMap(item=>item.modifiers??[]);
    expect(mods.length).toBeGreaterThan(0);
    for (const mod of mods) {
      expect(equipmentModifierLabel(mod).split(' ')[0]).toBe(legacy(mod).split(' ')[0]);
    }
  });
});
