import {describe,it,expect} from 'vitest';
import {hearthEnemyAttack,hearthEnemyMovement,hearthEnemyStepDistance} from './hearth-enemy-behavior.js';
import {FIXED_UNITS_PER_PIXEL,TILE_SIZE_FIXED} from './state.js';

describe('Cinderwake enemy behavior',()=>{
  it('gives every third pyromancer commitment its own weaker burst pattern',()=>{
    expect([0,1,2,0].map(cycle=>hearthEnemyAttack('cowling_pyromancer',cycle).pattern)).toEqual(['bolt','bolt','burst','bolt']);
    expect(hearthEnemyAttack('cowling_pyromancer',2).damageCenti).toBe(700);
    expect(hearthEnemyAttack('cowling_pyromancer',0).damageCenti).toBe(800);
    expect(hearthEnemyAttack('ember_cowling',2).pattern).toBe('charge');
  });
  it('keeps the mage at casting range and retreats safely from a coincident target',()=>{
    const npc={x:0,y:0};
    expect(hearthEnemyMovement('cowling_pyromancer',npc,{x:4*TILE_SIZE_FIXED,y:0},true)).toMatchObject({activity:'aim',moving:false});
    expect(hearthEnemyMovement('cowling_pyromancer',npc,{x:8*TILE_SIZE_FIXED,y:0},true)).toMatchObject({activity:'alert',moving:true});
    const retreat=hearthEnemyMovement('cowling_pyromancer',npc,npc,true);
    expect(retreat.activity).toBe('retreat');expect(Math.hypot(retreat.target.x,retreat.target.y)).toBe(TILE_SIZE_FIXED);
  });
  it('requires the skull to regain diving distance and allows an orbit interval after recovery',()=>{
    const attack=hearthEnemyAttack('cinder_skull',0);
    expect(attack.minimumRange).toBe(2*TILE_SIZE_FIXED);expect(attack.repositionTicks).toBe(80);
    expect(hearthEnemyMovement('cinder_skull',{x:0,y:0},{x:TILE_SIZE_FIXED,y:0},true).activity).toBe('retreat');
    const orbit=hearthEnemyMovement('cinder_skull',{x:0,y:0},{x:2.7*TILE_SIZE_FIXED,y:0},true);
    expect(orbit.activity).toBe('orbit');expect(orbit.target.x).toBe(0);expect(orbit.target.y).not.toBe(0);
    expect(hearthEnemyMovement('cinder_skull',{x:0,y:0},{x:4*TILE_SIZE_FIXED,y:0},true).activity).toBe('alert');
  });
  it.each([0,1,2])('keeps mage cast %i inside the same three-to-six tile range',cycle=>{
    const attack=hearthEnemyAttack('cowling_pyromancer',cycle);
    for(const [tiles,allowed,activity] of [[2.9,false,'retreat'],[3,true,'aim'],[6,true,'aim'],[6.1,false,'alert']] as const){
      const distance=tiles*TILE_SIZE_FIXED;
      expect(distance>=attack.minimumRange&&distance<=attack.maximumRange).toBe(allowed);
      expect(hearthEnemyMovement('cowling_pyromancer',{x:0,y:0},{x:distance,y:0},true).activity).toBe(activity);
    }
  });
  it('preserves authored average speed and phase across an arbitrarily large server clock',()=>{
    for(const speed of [500,650,1000]){
      const total=Array.from({length:1000},(_,tick)=>hearthEnemyStepDistance(BigInt(tick),speed)).reduce((sum,n)=>sum+n,0);
      expect(total).toBe(FIXED_UNITS_PER_PIXEL*speed);
      expect(hearthEnemyStepDistance(10_000_000_000_000_123n,speed)).toBe(hearthEnemyStepDistance(123n,speed));
    }
  });
});
