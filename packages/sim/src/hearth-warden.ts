import {TILE_SIZE_FIXED} from './state.js';
import type {EnemyAttackPattern,EnemyAttackCommitment} from './combat-actions.js';
export type HearthWardenPhase=1|2|3;
export const WARDEN_PHASE_CUE_TICKS=20;
/** Pulses only damage on their final active tick; charges sweep throughout. */
export function hearthAttackImpactsSeparated(candidate:EnemyAttackCommitment,others:readonly EnemyAttackCommitment[],gapTicks=6):boolean {
  const window=(attack:EnemyAttackCommitment)=>{
    const end=attack.startedTick+BigInt(attack.tellTicks+attack.activeTicks-1);
    return {start:attack.pattern==='burst'||attack.pattern==='pulse'?end:attack.startedTick+BigInt(attack.tellTicks),end};
  };
  const next=window(candidate);
  return others.filter(attack=>attack.activeTicks>0).every(attack=>{
    const previous=window(attack),gap=BigInt(gapTicks);
    return next.start>=previous.end+gap||previous.start>=next.end+gap;
  });
}
/** Desired phase follows HP; applied phase persists until a safe boundary.
 * Death never requests a transition or summon instead of completion. */
export function hearthWardenDesiredPhase(applied:HearthWardenPhase,health:number,maximumHealth:number):HearthWardenPhase {
  if(health<=0||maximumHealth<=0)return applied;
  const desired=health*3<=maximumHealth?3:health*3<=maximumHealth*2?2:1;
  return Math.max(applied,desired) as HearthWardenPhase;
}
/** Cycle resets at phase entry: vent opens phase two, charge phase three. */
export function hearthWardenAttack(phase:HearthWardenPhase,cycle:number):{
  pattern:EnemyAttackPattern;damageCenti:number;minimumRange:number;maximumRange:number;repositionTicks:number;
  tellTicks:number;activeTicks:number;recoveryTicks:number;
} {
  const vent=phase===2?cycle%2===0:phase===3&&cycle%2===1;
  return {pattern:vent?'burst':'charge',damageCenti:vent?1000:1400,minimumRange:0,
    maximumRange:(vent?7:5)*TILE_SIZE_FIXED,repositionTicks:0,
    tellTicks:vent?20:14,activeTicks:vent?1:8,recoveryTicks:16};
}
