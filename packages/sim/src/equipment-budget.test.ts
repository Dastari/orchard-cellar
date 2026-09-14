import { describe, expect, it } from 'vitest';
import { cappedEquipmentModifiers, equipmentModifierAllowed } from './equipment-budget.js';
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
});
