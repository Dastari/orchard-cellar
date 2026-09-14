import {TILE_SIZE_FIXED,FIXED_UNITS_PER_PIXEL} from './state.js';
import {HEARTH_ENEMY_PROFILES,type HearthEnemyProfile} from './hearth-encounters.js';
import type {CombatPoint,EnemyAttackPattern} from './combat-actions.js';

/** Cycle is persisted when the tell commits. Cancellation cannot rewind it. */
export function hearthEnemyAttack(authored:HearthEnemyProfile|string,cycle:number):{
  pattern:EnemyAttackPattern;damageCenti:number;minimumRange:number;maximumRange:number;repositionTicks:number;
} {
  const profile=typeof authored==='string'?HEARTH_ENEMY_PROFILES[authored]:authored;
  if(profile===undefined)throw new Error(`enemy_definition_missing:${authored}`);
  const alternate=profile.behavior.alternateAttack;
  const useAlternate=alternate!==undefined&&cycle%alternate.cycleModulo===alternate.cycle;
  return {pattern:useAlternate?alternate.pattern:profile.pattern,
    damageCenti:useAlternate?alternate.damageCenti:profile.damageCenti,
    minimumRange:profile.behavior.minimumAttackRangeTiles*TILE_SIZE_FIXED,
    maximumRange:profile.rangeTiles*TILE_SIZE_FIXED,repositionTicks:profile.behavior.repositionTicks};
}
/** Exact average relative to the player's one-pixel cardinal step, without
 * floating accumulators or per-NPC clock drift across restart. */
export function hearthEnemyStepDistance(tick:bigint,speedPermille:number):number {
  const phase=Number(tick%1000n),distance=FIXED_UNITS_PER_PIXEL*speedPermille;
  return Math.floor((phase+1)*distance/1000)-Math.floor(phase*distance/1000);
}
export function hearthEnemyMovement(authored:HearthEnemyProfile|string,npc:CombatPoint,target:CombatPoint,clockwise:boolean):{
  readonly target:CombatPoint;readonly activity:'alert'|'aim'|'retreat'|'orbit';readonly moving:boolean;
} {
  const profile=typeof authored==='string'?HEARTH_ENEMY_PROFILES[authored]:authored;
  if(profile===undefined)throw new Error(`enemy_definition_missing:${authored}`);
  const dx=target.x-npc.x,dy=target.y-npc.y,distance=Math.hypot(dx,dy);
  const unitX=distance===0?(clockwise?1:-1):dx/distance,unitY=distance===0?0:dy/distance;
  if(profile.behavior.engine==='kite') {
    if(distance<(profile.behavior.retreatBelowTiles??0)*TILE_SIZE_FIXED)return {target:{x:npc.x-unitX*TILE_SIZE_FIXED,y:npc.y-unitY*TILE_SIZE_FIXED},activity:'retreat',moving:true};
    if(distance<=(profile.behavior.holdWithinTiles??0)*TILE_SIZE_FIXED)return {target:npc,activity:'aim',moving:false};
  }
  if(profile.behavior.engine==='orbit') {
    if(distance<(profile.behavior.retreatBelowTiles??0)*TILE_SIZE_FIXED)return {target:{x:npc.x-unitX*TILE_SIZE_FIXED,y:npc.y-unitY*TILE_SIZE_FIXED},activity:'retreat',moving:true};
    if(distance<=(profile.behavior.orbitWithinTiles??0)*TILE_SIZE_FIXED) {
      const turn=clockwise?1:-1;
      return {target:{x:npc.x-unitY*turn*TILE_SIZE_FIXED,y:npc.y+unitX*turn*TILE_SIZE_FIXED},activity:'orbit',moving:true};
    }
  }
  return {target,activity:'alert',moving:true};
}
