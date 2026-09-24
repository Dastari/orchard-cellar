import { describe, expect, it } from 'vitest';
import { cappedEquipmentModifiers, EQUIPMENT_STAT_BUDGETS, equipmentModifierAllowed } from './equipment-budget.js';
import { resolveModifierTarget, type Modifier } from './modifiers.js';
const mod = (target:Modifier['target'],value:number,layer:Modifier['layer']='pctAdd'):Modifier=>({id:`test.${target}`,target,value,layer,source:'equipment'});
describe('equipment-only stat budgets',()=>{
  it('caps additive power/health/absolute critical chance without capping trained skills or boons',()=>{
    const equipment=cappedEquipmentModifiers([
      mod('attackPower',2000),mod('attackPower',2000),mod('maxHealth',1500),mod('maxHealth',1500),
      mod('criticalChance',800,'flat'),mod('criticalChance',800,'flat'),
    ]);
    expect(resolveModifierTarget('attackPower',1000,equipment)).toBe(1300);
    expect(resolveModifierTarget('maxHealth',10000,equipment)).toBe(12000);
    expect(resolveModifierTarget('criticalChance',1000,equipment)).toBe(2000);
    expect(resolveModifierTarget('attackPower',1000,[...equipment,
      {...mod('attackPower',1500),source:'skill'}, {...mod('attackPower',2000),source:'environment'},
    ])).toBe(1650);
  });
  it('clamps computed gear deltas that exceed a single item budget without losing earned ranks', () => {
    expect(equipmentModifierAllowed(mod('toolVigourCost',-4000))).toBe(false);
    expect(resolveModifierTarget('toolVigourCost',10000,cappedEquipmentModifiers([mod('toolVigourCost',-4000)]))).toBe(7000);
    expect(cappedEquipmentModifiers([mod('toolVigourCost',4000),mod('attackPower',-4000)])).toEqual([]);
  });
  it('uses interval/cost signs and rejects movement or multiplicative/override bypasses',()=>{
    const equipment=cappedEquipmentModifiers([
      mod('swingSpeed',-2000),mod('swingSpeed',-2000),mod('toolVigourCost',-2000),mod('toolVigourCost',-2000),
      mod('attackPower',3000,'pctMult'),mod('attackPower',3000,'override'),mod('sprintSpeed',1000),
      mod('criticalChance',1000),mod('armor',Infinity,'flat'),
    ]);
    expect(resolveModifierTarget('swingSpeed',20,equipment)).toBe(15);
    expect(resolveModifierTarget('toolVigourCost',10000,equipment)).toBe(7000);
    expect(resolveModifierTarget('attackPower',1000,equipment)).toBe(1000);
    expect(equipment).toHaveLength(2);
    expect(equipmentModifierAllowed(mod('attackPower',3001))).toBe(false);
    expect(cappedEquipmentModifiers([...equipment].reverse())).toEqual(equipment);
  });
  it('keeps every pre-Gear-D3 rule exactly as it was, with one shared item and loadout range',()=>{
    const legacy={
      attackPower:['pctAdd',0,3000],rangedPower:['pctAdd',0,3000],maxHealth:['pctAdd',0,2000],
      criticalChance:['flat',0,1000],swingSpeed:['pctAdd',-2500,0],toolVigourCost:['pctAdd',-3000,0],
      sprintVigourCost:['pctAdd',-3000,0],maxVigour:['pctAdd',0,4000],armor:['flat',0,350],armorPct:['flat',0,1000],
    } as const;
    for (const [target,[layer,minimum,maximum]] of Object.entries(legacy)) {
      expect(EQUIPMENT_STAT_BUDGETS.find(rule=>rule.key===target)).toEqual({
        key:target,target,layer,minimum,maximum,loadoutMinimum:minimum,loadoutMaximum:maximum,
      });
    }
    const keys=EQUIPMENT_STAT_BUDGETS.map(rule=>`${rule.target}/${rule.layer}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('lets gear grant attributes within +8 per item and +20 per loadout (Gear-D3)',()=>{
    for (const target of ['str','dex','con','int','wis','cha'] as const) {
      expect(equipmentModifierAllowed(mod(target,8,'flat'))).toBe(true);
      expect(equipmentModifierAllowed(mod(target,9,'flat'))).toBe(false);
      expect(equipmentModifierAllowed(mod(target,-1,'flat'))).toBe(false);
      expect(equipmentModifierAllowed(mod(target,500,'pctAdd'))).toBe(false);
      expect(equipmentModifierAllowed(mod(target,500,'pctMult'))).toBe(false);
      expect(equipmentModifierAllowed(mod(target,20,'override'))).toBe(false);
    }
    const equipment=cappedEquipmentModifiers([
      mod('str',8,'flat'),mod('str',8,'flat'),mod('str',8,'flat'),mod('int',3,'flat'),
      mod('dex',-5,'flat'),mod('wis',2000,'pctMult'),mod('con',2000,'pctAdd'),
    ]);
    expect(equipment).toEqual([
      {id:'equipment.budget.int',target:'int',value:3,layer:'flat',source:'equipment'},
      {id:'equipment.budget.str',target:'str',value:20,layer:'flat',source:'equipment'},
    ]);
    expect(resolveModifierTarget('str',10,equipment)).toBe(30);
    expect(resolveModifierTarget('str',15,equipment)).toBe(30);
  });
  it('caps maximum mana, regeneration and flat Health per item and per loadout (Gear-D3)',()=>{
    expect(equipmentModifierAllowed(mod('maxMana',2500))).toBe(true);
    expect(equipmentModifierAllowed(mod('maxMana',2501))).toBe(false);
    expect(equipmentModifierAllowed(mod('maxMana',2500,'flat'))).toBe(false);
    for (const target of ['healthRegen','manaRegen','vigourRegen'] as const) {
      expect(equipmentModifierAllowed(mod(target,150,'flat'))).toBe(true);
      expect(equipmentModifierAllowed(mod(target,151,'flat'))).toBe(false);
      expect(equipmentModifierAllowed(mod(target,-1,'flat'))).toBe(false);
      expect(equipmentModifierAllowed(mod(target,100,'pctAdd'))).toBe(false);
    }
    expect(equipmentModifierAllowed(mod('maxHealth',12000,'flat'))).toBe(true);
    expect(equipmentModifierAllowed(mod('maxHealth',12001,'flat'))).toBe(false);
    const equipment=cappedEquipmentModifiers([
      mod('maxMana',2500),mod('maxMana',2500),
      mod('manaRegen',150,'flat'),mod('manaRegen',150,'flat'),mod('manaRegen',150,'flat'),
      mod('healthRegen',120,'flat'),mod('vigourRegen',-50,'flat'),
    ]);
    expect(equipment).toEqual([
      {id:'equipment.budget.healthRegen',target:'healthRegen',value:120,layer:'flat',source:'equipment'},
      {id:'equipment.budget.manaRegen',target:'manaRegen',value:400,layer:'flat',source:'equipment'},
      {id:'equipment.budget.maxMana',target:'maxMana',value:4000,layer:'pctAdd',source:'equipment'},
    ]);
    expect(resolveModifierTarget('maxMana',10000,equipment)).toBe(14000);
    // Regen still passes through its existing technical soft cap (modifiers.ts).
    expect(resolveModifierTarget('manaRegen',100,equipment)).toBe(499);
  });
  it('keeps flat Health and percent maximum health as separate coexisting buckets',()=>{
    expect(equipmentModifierAllowed(mod('maxHealth',2000))).toBe(true);
    expect(equipmentModifierAllowed(mod('maxHealth',2001))).toBe(false);
    const equipment=cappedEquipmentModifiers([
      mod('maxHealth',12000,'flat'),mod('maxHealth',12000,'flat'),mod('maxHealth',12000,'flat'),
      mod('maxHealth',1500),mod('maxHealth',1500),
    ]);
    expect(equipment).toEqual([
      {id:'equipment.budget.maxHealth',target:'maxHealth',value:2000,layer:'pctAdd',source:'equipment'},
      {id:'equipment.budget.maxHealth.flat',target:'maxHealth',value:30000,layer:'flat',source:'equipment'},
    ]);
    // Flat applies before pctAdd: (10000 + 30000) * 1.2.
    expect(resolveModifierTarget('maxHealth',10000,equipment)).toBe(48000);
  });
});
