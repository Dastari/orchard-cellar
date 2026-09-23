import { statelessRoll } from './checks.js';

export const OUTDOOR_ENCOUNTER_PARTICIPANT_LIMIT = 64;
export const OUTDOOR_CONTRIBUTION_LIFETIME_TICKS = 600n;
export interface EncounterContribution {
  readonly identity: string;
  readonly damageCenti: number;
  readonly supportCenti: number;
  readonly lastUsefulTick: bigint;
}
export interface EncounterRewardLine {
  readonly itemKind: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly chanceBasisPoints: number;
}
export interface EncounterRewardProfile {
  readonly revision: string;
  readonly combatExperience: number;
  readonly drops: readonly EncounterRewardLine[];
}
export interface EncounterGrant {
  readonly identity: string;
  readonly combatExperience: number;
  readonly items: readonly {readonly itemKind:string;readonly quantity:number}[];
}
export interface EncounterCompletion {
  readonly key: string;
  readonly encounterId: string;
  readonly generation: bigint;
  readonly completedTick: bigint;
  readonly rewardRevision: string;
  readonly grants: readonly EncounterGrant[];
}
/** These fields are persistence data. Reconstructing this object after restart
 * must never create a new generation or re-roll a completion. */
export interface OutdoorEncounterState {
  readonly encounterId: string;
  readonly generation: bigint;
  readonly phase: 'active'|'completed';
  readonly maximumHealthCenti: number;
  readonly reward: EncounterRewardProfile;
  readonly worldSeed: number;
  readonly healthCenti: number;
  readonly contributions: readonly EncounterContribution[];
  readonly completion: EncounterCompletion|null;
  readonly respawnAfterTick: bigint;
}
function wholeNonnegative(value:number):boolean { return Number.isSafeInteger(value)&&value>=0; }
function validateRewardProfile(profile:EncounterRewardProfile):void {
  if(!profile.revision || !wholeNonnegative(profile.combatExperience) || profile.drops.length>16
    ||profile.drops.some(row=>!row.itemKind||!wholeNonnegative(row.minimum)||!wholeNonnegative(row.maximum)
      ||row.minimum>row.maximum||row.maximum>1000||!wholeNonnegative(row.chanceBasisPoints)||row.chanceBasisPoints>10000)) {
    throw new Error('invalid_encounter_rewards');
  }
}
export function newOutdoorEncounter(encounterId:string,maximumHealthCenti:number,reward:EncounterRewardProfile,worldSeed:number,generation=1n):OutdoorEncounterState {
  validateRewardProfile(reward);
  if(!Number.isSafeInteger(worldSeed))throw new Error('invalid_encounter_seed');
  if(!/^[a-z0-9_-]+$/.test(encounterId)||!Number.isSafeInteger(maximumHealthCenti)||maximumHealthCenti<1||generation<1n)throw new Error('invalid_encounter');
  return {encounterId,generation,maximumHealthCenti,reward:{...reward,drops:reward.drops.map(row=>({...row}))},worldSeed,healthCenti:maximumHealthCenti,phase:'active',contributions:[],completion:null,respawnAfterTick:0n};
}
/** Call only with applied damage / useful support verified by authority, never
 * input intentions or client hit notices. Proximity and last hit grant nothing. */
function creditedContribution(state:OutdoorEncounterState,identity:string,damageCenti:number,supportCenti:number,tick:bigint):readonly EncounterContribution[] {
  if(!identity)throw new Error('invalid_encounter_identity');
  if(damageCenti+supportCenti===0)return state.contributions;
  const recent=state.contributions.filter(row=>tick>=row.lastUsefulTick&&tick-row.lastUsefulTick<=OUTDOOR_CONTRIBUTION_LIFETIME_TICKS);
  const existing=recent.find(row=>row.identity===identity);
  const cap=state.maximumHealthCenti;
  const next={identity,damageCenti:Math.min(cap,(existing?.damageCenti??0)+damageCenti),
    supportCenti:Math.min(cap,(existing?.supportCenti??0)+supportCenti),lastUsefulTick:tick};
  return [...recent.filter(row=>row.identity!==identity),next]
    .sort((a,b)=>(b.damageCenti+Math.floor(b.supportCenti/2))-(a.damageCenti+Math.floor(a.supportCenti/2))
      ||a.identity.localeCompare(b.identity))
    .slice(0,OUTDOOR_ENCOUNTER_PARTICIPANT_LIMIT).sort((a,b)=>a.identity.localeCompare(b.identity));
}
export function creditOutdoorSupport(state:OutdoorEncounterState,identity:string,usefulSupportCenti:number,tick:bigint):OutdoorEncounterState {
  if(!wholeNonnegative(usefulSupportCenti)||tick<0n)throw new Error('invalid_encounter_contribution');
  if(state.phase!=='active'||usefulSupportCenti===0)return state;
  return {...state,contributions:creditedContribution(state,identity,0,usefulSupportCenti,tick)};
}
/** Atomic caller persists both returned state and immutable completion before
 * issuing XP or loot. A second killing blow sees completed and returns no grant. */
export function damageOutdoorEncounter(state:OutdoorEncounterState,identity:string|null,damageCenti:number,tick:bigint,
  respawnDelayTicks:bigint):{
    readonly state:OutdoorEncounterState;readonly appliedDamageCenti:number;readonly completion:EncounterCompletion|null;
  } {
  if(!wholeNonnegative(damageCenti)||tick<0n||respawnDelayTicks<1n)throw new Error('invalid_encounter_damage');
  if(state.phase!=='active'||damageCenti===0)return {state,appliedDamageCenti:0,completion:null};
  const {reward,worldSeed}=state;
  const appliedDamageCenti=Math.min(state.healthCenti,damageCenti),healthCenti=state.healthCenti-appliedDamageCenti;
  const contributions=identity===null?state.contributions:creditedContribution(state,identity,appliedDamageCenti,0,tick);
  if(healthCenti>0)return {state:{...state,healthCenti,contributions},appliedDamageCenti,completion:null};
  const threshold=Math.max(100,Math.ceil(state.maximumHealthCenti*0.05));
  const eligible=contributions.filter(row=>tick>=row.lastUsefulTick&&tick-row.lastUsefulTick<=OUTDOOR_CONTRIBUTION_LIFETIME_TICKS
    &&row.damageCenti+Math.floor(row.supportCenti/2)>=threshold);
  const grants=eligible.map(row=>{
    const items=new Map<string,number>();
    for(const [index,drop] of reward.drops.entries()) {
      const seed=[worldSeed,state.encounterId,state.generation,reward.revision,row.identity,index];
      if(statelessRoll([...seed,'chance'],10000)>=drop.chanceBasisPoints)continue;
      const quantity=drop.minimum+statelessRoll([...seed,'quantity'],drop.maximum-drop.minimum+1);
      if(quantity>0)items.set(drop.itemKind,(items.get(drop.itemKind)??0)+quantity);
    }
    return {identity:row.identity,combatExperience:reward.combatExperience,
      items:[...items].map(([itemKind,quantity])=>({itemKind,quantity}))};
  });
  const completion={key:`${state.encounterId}:${state.generation}`,encounterId:state.encounterId,generation:state.generation,
    completedTick:tick,rewardRevision:reward.revision,grants};
  return {state:{...state,phase:'completed',healthCenti:0,contributions,completion,respawnAfterTick:tick+respawnDelayTicks},appliedDamageCenti,completion};
}
/** Leashing an unfinished fight clears credit but preserves its reward seed. */
export function leashOutdoorEncounter(state:OutdoorEncounterState):OutdoorEncounterState {
  return state.phase==='completed'?state:{...state,healthCenti:state.maximumHealthCenti,contributions:[]};
}
/** The caller supplies authoritative presence near the camp, never camera state.
 * Keep old completion/claim rows separately; a new generation cannot replace them. */
export function respawnOutdoorEncounter(state:OutdoorEncounterState,tick:bigint,playersNearby:boolean):OutdoorEncounterState {
  if(state.phase!=='completed'||tick<state.respawnAfterTick||playersNearby)return state;
  return newOutdoorEncounter(state.encounterId,state.maximumHealthCenti,state.reward,state.worldSeed,state.generation+1n);
}

/** Reward JSON is stored at generation start; decoding never consults new content. */
export function parseEncounterRewardProfile(json:string):EncounterRewardProfile {
  const value:unknown=JSON.parse(json);
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_encounter_rewards');
  const row=value as Record<string,unknown>;
  if(typeof row.revision!=='string'||typeof row.combatExperience!=='number'||!Array.isArray(row.drops))throw new Error('invalid_encounter_rewards');
  const drops=row.drops.map((entry:unknown):EncounterRewardLine=>{
    if(entry===null||typeof entry!=='object'||Array.isArray(entry))throw new Error('invalid_encounter_rewards');
    const drop=entry as Record<string,unknown>;
    if(typeof drop.itemKind!=='string'||typeof drop.minimum!=='number'||typeof drop.maximum!=='number'||typeof drop.chanceBasisPoints!=='number')throw new Error('invalid_encounter_rewards');
    return {itemKind:drop.itemKind,minimum:drop.minimum,maximum:drop.maximum,chanceBasisPoints:drop.chanceBasisPoints};
  });
  const profile={revision:row.revision,combatExperience:row.combatExperience,drops};validateRewardProfile(profile);return profile;
}
