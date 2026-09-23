import {describe,it,expect} from 'vitest';
import {newOutdoorEncounter,damageOutdoorEncounter,creditOutdoorSupport,leashOutdoorEncounter,respawnOutdoorEncounter,type EncounterRewardProfile} from './outdoor-encounters.js';
const reward:EncounterRewardProfile={revision:'shore-v1',combatExperience:20,drops:[
  {itemKind:'stone',minimum:2,maximum:4,chanceBasisPoints:10000},
  {itemKind:'iron_ore',minimum:1,maximum:1,chanceBasisPoints:0},
]};
const damage=(state:ReturnType<typeof newOutdoorEncounter>,identity:string,amount:number,tick=100n)=>damageOutdoorEncounter(state,identity,amount,tick,1200n);
describe('persistent outdoor encounter lifecycle',()=>{
  it('credits actual damage and useful support, excludes last-hit stealing and proximity',()=>{
    let state=newOutdoorEncounter('shore-slimes',10000,reward,123);
    state=damage(state,'fighter',9500).state;
    state=creditOutdoorSupport(state,'healer',1000,100n);
    state=creditOutdoorSupport(state,'spectator',0,100n);
    state=damage(state,'fighter',499).state;
    const kill=damage(state,'last-hit',50000);
    expect(kill.appliedDamageCenti).toBe(1);
    expect(kill.completion!.grants.map(row=>row.identity)).toEqual(['fighter','healer']);
    expect(kill.state.contributions.find(row=>row.identity==='last-hit')!.damageCenti).toBe(1);
  });
  it('emits one immutable completion per generation despite a second killing blow',()=>{
    const kill=damage(newOutdoorEncounter('camp',1000,reward,123),'fighter',2000);
    const duplicate=damage(kill.state,'other',2000,101n);
    expect(duplicate.completion).toBeNull();expect(duplicate.appliedDamageCenti).toBe(0);
    expect(duplicate.state).toBe(kill.state);
    expect(kill.completion!.key).toBe('camp:1');
  });
  it('identical committed inputs produce identical rewards; guaranteed and impossible drops are exact',()=>{
    for(let generation=1n;generation<=50n;generation++){
      const state=newOutdoorEncounter('camp',1000,reward,123,generation);
      const first=damage(state,'fighter',1000),replayed=damage({...state,contributions:[...state.contributions]},'fighter',1000);
      expect(replayed.completion).toEqual(first.completion);
      const items=first.completion!.grants[0]!.items;
      expect(items).toHaveLength(1);expect(items[0]!.itemKind).toBe('stone');
      expect(items[0]!.quantity).toBeGreaterThanOrEqual(2);expect(items[0]!.quantity).toBeLessThanOrEqual(4);
    }
  });
  it('freezes reward inputs at generation start instead of sampling changed content at the killing blow',()=>{
    const mutable={...reward,drops:reward.drops.map(row=>({...row}))};
    const state=newOutdoorEncounter('camp',1000,mutable,123);
    mutable.combatExperience=999;mutable.drops[0]!.minimum=900;
    const kill=damage(state,'fighter',1000);
    expect(kill.completion!.grants[0]!.combatExperience).toBe(20);
    expect(kill.completion!.grants[0]!.items[0]!.quantity).toBeLessThanOrEqual(4);
  });
  it('leash clears unfinished contribution without changing reward generation and never resets a completed kill',()=>{
    const hit=damage(newOutdoorEncounter('camp',1000,reward,123),'old-fighter',400);
    const reset=leashOutdoorEncounter(hit.state);
    expect(reset).toMatchObject({generation:1n,healthCenti:1000,contributions:[]});
    const kill=damage(reset,'new-fighter',1000);
    expect(kill.completion!.grants.map(row=>row.identity)).toEqual(['new-fighter']);
    expect(leashOutdoorEncounter(kill.state)).toBe(kill.state);
  });
  it('respawns only after cooldown with no authoritative players near the camp',()=>{
    const dead=damage(newOutdoorEncounter('camp',1000,reward,123),'fighter',1000).state;
    expect(respawnOutdoorEncounter(dead,1299n,false)).toBe(dead);
    expect(respawnOutdoorEncounter(dead,1300n,true)).toBe(dead);
    const next=respawnOutdoorEncounter(dead,1300n,false);
    expect(next).toMatchObject({generation:2n,phase:'active',healthCenti:1000,completion:null});
    expect(dead.completion!.key).toBe('camp:1');
  });
  it('does not let a full set of negligible recent contributions exclude substantial new damage',()=>{
    let state=newOutdoorEncounter('camp',100000,reward,123);
    for(let index=0;index<64;index++)state=creditOutdoorSupport(state,`tiny-${index}`,1,100n);
    const kill=damage(state,'fighter',100000,101n);
    expect(kill.completion!.grants.map(row=>row.identity)).toEqual(['fighter']);
    expect(kill.state.contributions).toHaveLength(64);
  });
  it('bounds contribution rows and ignores expired support',()=>{
    let state=newOutdoorEncounter('camp',100000,reward,123);
    for(let i=0;i<80;i++)state=creditOutdoorSupport(state,`support-${String(i).padStart(2,'0')}`,10000,1n);
    expect(state.contributions).toHaveLength(64);
    const kill=damage(state,'fighter',100000,1000n);
    expect(kill.completion!.grants.map(row=>row.identity)).toEqual(['fighter']);
  });
});

it('environmental damage completes health without inventing a contributor', () => {
  const initial = newOutdoorEncounter('hazard', 1000, reward, 1);
  const result = damageOutdoorEncounter(initial, null, 1000, 100n, 1200n);
  expect(result.state.healthCenti).toBe(0);
  expect(result.state.contributions).toEqual([]);
  expect(result.completion?.grants).toEqual([]);
});
