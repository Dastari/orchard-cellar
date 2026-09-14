import {describe,it,expect} from 'vitest';
import {hearthWardenDesiredPhase,hearthWardenAttack,hearthAttackImpactsSeparated} from './hearth-warden.js';
import {commitEnemyAttack} from './combat-actions.js';
describe('Caldera Warden phase contract',()=>{
  it('spaces a slime landing beyond the end of a charge sweep by six ticks',()=>{
    const charge={...commitEnemyAttack('charge',1n,60n,{x:0,y:0},{x:100,y:0},100),...hearthWardenAttack(1,0)};
    const hop=(tick:bigint)=>commitEnemyAttack('pulse',2n,tick,{x:0,y:0},{x:100,y:0},100);
    expect(hearthAttackImpactsSeparated(hop(72n),[charge])).toBe(false);
    expect(hearthAttackImpactsSeparated(hop(73n),[charge])).toBe(true);
    expect(hearthAttackImpactsSeparated(hop(79n),[hop(73n)])).toBe(true);
    expect(hearthAttackImpactsSeparated(hop(78n),[hop(73n)])).toBe(false);
  });
  it.each([[301,1],[300,2],[151,2],[150,3],[0,1]] as const)('maps %i HP to desired phase %i',(health,phase)=>{
    expect(hearthWardenDesiredPhase(1,health,450)).toBe(phase);
  });
  it('skips directly to phase three and never rolls an applied phase backward',()=>{
    expect(hearthWardenDesiredPhase(1,149,450)).toBe(3);
    expect(hearthWardenDesiredPhase(3,450,450)).toBe(3);
    expect(hearthWardenDesiredPhase(2,0,450)).toBe(2);
  });
  it('opens phase two with a vent and phase three with a charge, preserving full recovery',()=>{
    expect([0,1,0,1].map(cycle=>hearthWardenAttack(1,cycle).pattern)).toEqual(['charge','charge','charge','charge']);
    expect([0,1,0,1].map(cycle=>hearthWardenAttack(2,cycle).pattern)).toEqual(['burst','charge','burst','charge']);
    expect([0,1,0,1].map(cycle=>hearthWardenAttack(3,cycle).pattern)).toEqual(['charge','burst','charge','burst']);
    expect(hearthWardenAttack(2,0)).toMatchObject({tellTicks:20,activeTicks:1,recoveryTicks:16,damageCenti:1000});
    expect(hearthWardenAttack(3,0)).toMatchObject({tellTicks:14,activeTicks:8,recoveryTicks:16,damageCenti:1400});
  });
});
