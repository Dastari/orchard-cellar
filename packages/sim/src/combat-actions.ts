import { firstProjectileTerrainHit } from './ranged.js';
import type { CollisionMap } from './state.js';
import { AUTHORITY_HZ } from './net-timing.js';

/** Initial Hearth Harbour and Embers tuning (wiki: Systems/Combat), expressed in authority ticks (20 Hz). */
export const DODGE = Object.freeze({costCenti:1800,moveTicks:6,invulnerableTicks:4,recoveryTicks:8,distanceTiles:1.5});
export const BLOCK = Object.freeze({drainCentiPerTick:600/AUTHORITY_HZ,hitBaseCostCenti:400,hitCostBasisPoints:8000,
  damageBasisPoints:3500,breakRecoveryTicks:12});
export const MAX_COMMITTED_ATTACKERS = 3;
export type EnemyAttackPattern = 'pulse' | 'charge' | 'bolt' | 'burst' | 'dive';
export const ENEMY_ATTACK_TIMINGS: Readonly<Record<EnemyAttackPattern,{tellTicks:number;activeTicks:number;recoveryTicks:number}>> = {
  pulse:{tellTicks:10,activeTicks:5,recoveryTicks:10},
  charge:{tellTicks:12,activeTicks:8,recoveryTicks:12},
  bolt:{tellTicks:14,activeTicks:15,recoveryTicks:12},
  burst:{tellTicks:14,activeTicks:1,recoveryTicks:12},
  dive:{tellTicks:12,activeTicks:6,recoveryTicks:12},
};
export interface CombatPoint { readonly x:number; readonly y:number; }
export interface EnemyAttackCommitment {
  readonly sequence:bigint;
  readonly pattern:EnemyAttackPattern;
  readonly startedTick:bigint;
  readonly originX:number;readonly originY:number;
  readonly targetX:number;readonly targetY:number;
  readonly tellTicks:number;readonly activeTicks:number;readonly recoveryTicks:number;
}
export type EnemyAttackPhase='tell'|'active'|'recovery'|'complete';
export function enemyAttackPhaseAt(attack:EnemyAttackCommitment,tick:bigint):EnemyAttackPhase {
  const elapsed=tick-attack.startedTick;
  if(elapsed<BigInt(attack.tellTicks))return 'tell';
  if(elapsed<BigInt(attack.tellTicks+attack.activeTicks))return 'active';
  if(elapsed<BigInt(attack.tellTicks+attack.activeTicks+attack.recoveryTicks))return 'recovery';
  return 'complete';
}
/** Frozen target, bounded reach and immutable timings prevent homing/repeated input. */
export function commitEnemyAttack(pattern:EnemyAttackPattern,sequence:bigint,tick:bigint,
  origin:CombatPoint,target:CombatPoint,maximumDistance:number):EnemyAttackCommitment {
  if(![origin.x,origin.y,target.x,target.y,maximumDistance].every(Number.isFinite)||maximumDistance<=0)throw new Error('invalid_attack_geometry');
  const dx=target.x-origin.x,dy=target.y-origin.y,length=Math.hypot(dx,dy);
  const fraction=length>maximumDistance?maximumDistance/length:1;
  return {...ENEMY_ATTACK_TIMINGS[pattern],pattern,sequence,startedTick:tick,
    originX:Math.round(origin.x),originY:Math.round(origin.y),
    targetX:Math.round(origin.x+dx*fraction),targetY:Math.round(origin.y+dy*fraction)};
}
/** Active swept segment in logical world coordinates; the final pulse occurs
 * only on the landing tick. Collision/policy/elevation remain authority inputs. */
export function enemyAttackSegmentAt(attack:EnemyAttackCommitment,tick:bigint):{from:CombatPoint;to:CombatPoint}|null {
  if(enemyAttackPhaseAt(attack,tick)!=='active')return null;
  const elapsed=Number(tick-attack.startedTick)-attack.tellTicks;
  const target={x:attack.targetX,y:attack.targetY};
  if(attack.pattern==='burst'||attack.pattern==='pulse') {
    return elapsed===attack.activeTicks-1?{from:target,to:target}:null;
  }
  const point=(step:number)=>({x:Math.round(attack.originX+(attack.targetX-attack.originX)*step/attack.activeTicks),
    y:Math.round(attack.originY+(attack.targetY-attack.originY)*step/attack.activeTicks)});
  return {from:point(elapsed),to:point(elapsed+1)};
}
export function combatPointWithinSegment(point:CombatPoint,from:CombatPoint,to:CombatPoint,radius:number):boolean {
  if(![point.x,point.y,from.x,from.y,to.x,to.y,radius].every(Number.isFinite)||radius<0)return false;
  const nearest=closestCombatPointOnSegment(point,from,to);
  return (point.x-nearest.x)**2+(point.y-nearest.y)**2<=radius*radius;
}
export function closestCombatPointOnSegment(point:CombatPoint,from:CombatPoint,to:CombatPoint):CombatPoint {
  const dx=to.x-from.x,dy=to.y-from.y,lengthSquared=dx*dx+dy*dy;
  const t=lengthSquared===0?0:Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/lengthSquared));
  return {x:from.x+t*dx,y:from.y+t*dy};
}

export function dodgeInvulnerable(startedTick:bigint,tick:bigint):boolean {
  return tick>=startedTick&&tick<startedTick+BigInt(DODGE.invulnerableTicks);
}
/** Frontal120° cone, using the source of the incoming hit, never screen projection. */
export function frontalBlockApplies(defender:CombatPoint,facing:CombatPoint,source:CombatPoint):boolean {
  const dx=source.x-defender.x,dy=source.y-defender.y;
  const denominator=Math.hypot(dx,dy)*Math.hypot(facing.x,facing.y);
  return denominator>0&&(dx*facing.x+dy*facing.y)/denominator>=0.5;
}
export function resolveHeldBlock(vigourCenti:number,rawDamageCenti:number,mitigatedDamageCenti:number):{
  readonly vigourCenti:number;readonly damageCenti:number;readonly guardBroken:boolean;
} {
  if(![vigourCenti,rawDamageCenti,mitigatedDamageCenti].every(value=>Number.isSafeInteger(value)&&value>=0))throw new Error('invalid_block_vitals');
  const cost=BLOCK.hitBaseCostCenti+Math.floor(rawDamageCenti*BLOCK.hitCostBasisPoints/10000);
  const guardBroken=vigourCenti<cost;
  return {vigourCenti:Math.max(0,vigourCenti-cost),guardBroken,
    damageCenti:guardBroken?mitigatedDamageCenti:Math.min(mitigatedDamageCenti,Math.max(100,Math.floor(mitigatedDamageCenti*BLOCK.damageBasisPoints/10000)))};
}


/** Enemy ground attacks must respect authored thin obstacles as well as tiles.
 * The player arrow helper checks terrain only, so it cannot be used alone here. */
export function combatSegmentObstructed(from:CombatPoint,to:CombatPoint,collision:CollisionMap):boolean {
  if(firstProjectileTerrainHit(from,to,collision)!==null)return true;
  for(const bounds of collision.obstacles??[]) {
    let entry=0,exit=1;
    for(const [start,delta,minimum,maximum] of [
      [from.x,to.x-from.x,bounds.left,bounds.right],
      [from.y,to.y-from.y,bounds.top,bounds.bottom],
    ] as const){
      if(delta===0){if(start<minimum||start>maximum){entry=2;break;}}
      else{const a=(minimum-start)/delta,b=(maximum-start)/delta;
        entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
      if(entry>exit)break;
    }
    if(entry<=exit)return true;
  }
  return false;
}
