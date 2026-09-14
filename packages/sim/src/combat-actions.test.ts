import {describe,expect,it} from 'vitest';
import {commitEnemyAttack,enemyAttackPhaseAt,enemyAttackSegmentAt,combatPointWithinSegment,dodgeInvulnerable,frontalBlockApplies,resolveHeldBlock} from './combat-actions.js';

describe('committed enemy attack timeline',()=>{
  it('keeps tell, active and recovery disjoint at exact tick boundaries',()=>{
    const attack=commitEnemyAttack('charge',7n,100n,{x:0,y:0},{x:100,y:0},64);
    expect(attack.targetX).toBe(64);
    expect(enemyAttackPhaseAt(attack,111n)).toBe('tell');
    expect(enemyAttackPhaseAt(attack,112n)).toBe('active');
    expect(enemyAttackPhaseAt(attack,119n)).toBe('active');
    expect(enemyAttackPhaseAt(attack,120n)).toBe('recovery');
    expect(enemyAttackPhaseAt(attack,132n)).toBe('complete');
    expect(enemyAttackSegmentAt(attack,112n)).toEqual({from:{x:0,y:0},to:{x:8,y:0}});
    expect(enemyAttackSegmentAt(attack,119n)).toEqual({from:{x:56,y:0},to:{x:64,y:0}});
    expect(enemyAttackSegmentAt(attack,120n)).toBeNull();
  });
  it('damages a pulse only at its frozen landing marker, never throughout the hop',()=>{
    const aim={x:10,y:10};const attack=commitEnemyAttack('pulse',1n,0n,{x:0,y:0},aim,32);
    aim.x=100;
    expect(enemyAttackSegmentAt(attack,10n)).toBeNull();
    expect(enemyAttackSegmentAt(attack,14n)).toEqual({from:{x:10,y:10},to:{x:10,y:10}});
    expect(combatPointWithinSegment({x:14,y:10},{x:10,y:10},{x:10,y:10},4)).toBe(true);
    expect(combatPointWithinSegment({x:15,y:10},{x:10,y:10},{x:10,y:10},4)).toBe(false);
  });
  it('sweeps the full segment so fast attacks do not tunnel through a victim',()=>{
    expect(combatPointWithinSegment({x:40,y:2},{x:0,y:0},{x:80,y:0},3)).toBe(true);
    expect(combatPointWithinSegment({x:40,y:4},{x:0,y:0},{x:80,y:0},3)).toBe(false);
    expect(combatPointWithinSegment({x:NaN,y:0},{x:0,y:0},{x:80,y:0},3)).toBe(false);
  });
});
describe('dodge and held frontal block',()=>{
  it('uses a half-open invulnerability window',()=>{
    expect(dodgeInvulnerable(10n,9n)).toBe(false);
    expect(dodgeInvulnerable(10n,10n)).toBe(true);
    expect(dodgeInvulnerable(10n,13n)).toBe(true);
    expect(dodgeInvulnerable(10n,14n)).toBe(false);
  });
  it('cannot protect the rear or an undefined coincident incoming angle',()=>{
    expect(frontalBlockApplies({x:0,y:0},{x:1,y:0},{x:4,y:2})).toBe(true);
    expect(frontalBlockApplies({x:0,y:0},{x:1,y:0},{x:-1,y:0})).toBe(false);
    expect(frontalBlockApplies({x:0,y:0},{x:1,y:0},{x:0,y:0})).toBe(false);
  });
  it('charges raw-hit Vigour and mitigates health once, with full damage on guard break',()=>{
    expect(resolveHeldBlock(5000,1000,800)).toEqual({vigourCenti:3800,damageCenti:280,guardBroken:false});
    expect(resolveHeldBlock(1199,1000,800)).toEqual({vigourCenti:0,damageCenti:800,guardBroken:true});
    expect(resolveHeldBlock(1200,1000,800)).toEqual({vigourCenti:0,damageCenti:280,guardBroken:false});
    expect(resolveHeldBlock(1200,10,0).damageCenti).toBe(0);
  });
});
