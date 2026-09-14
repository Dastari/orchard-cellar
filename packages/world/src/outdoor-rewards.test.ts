import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import {Identity} from 'spacetimedb';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function production(dependencies:Record<string,unknown>,names:readonly string[]=['clearOutdoorAdds','outdoorInsideCamp','combatElevationAt','outdoorEnemyDamageAllowed','damageOutdoorEnemy','outdoorProjectileSegmentAllowed','persistOutdoorEncounterDamage','claimOutdoorReward','insertEscrowStacksIntoInventory','tradeStack','storedStack']){
  const definitions=names.map(name=>{
    const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(fn)return fn.getText(source);
    for(const node of source.statements){
      if(!ts.isVariableStatement(node))continue;
      const declaration=node.declarationList.declarations.find(row=>row.name.getText(source)===name);
      if(!declaration?.initializer||!ts.isCallExpression(declaration.initializer))continue;
      const callback=declaration.initializer.arguments.find(ts.isArrowFunction);
      if(callback)return `const ${name}=${callback.getText(source)};`;
    }
    throw new Error(`missing production function:${name}`);
  }).join('\n');
  return new Function(...Object.keys(dependencies),ts.transpileModule(`${definitions}\nreturn {${names.join(',')}};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
  }).outputText)(...Object.values(dependencies));
}
function records<T extends {id:string}>(){
  const rows=new Map<string,T>();const id={find:(key:string)=>rows.get(key)??null,
    update:(row:T)=>{rows.set(row.id,row);return row;},delete:(key:string)=>rows.delete(key)};
  return {rows,id,insert:(row:T)=>{if(rows.has(row.id))throw new Error('duplicate');return id.update(row);}};
}
function scheduledAmbientNpcPass(ctx:unknown,occupiedNpcs:readonly unknown[]):void {
  let loop:ts.ForOfStatement|undefined;
  const visit=(node:ts.Node):void=>{
    if(ts.isForOfStatement(node)&&node.expression.getText(source)==='occupiedNpcs')loop=node;
    ts.forEachChild(node,visit);
  };
  visit(source);if(loop===undefined)throw new Error('scheduled ambient NPC loop missing');
  const code=ts.transpileModule(loop.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  new Function('ctx','occupiedNpcs','collisionBySpace',code)(ctx,occupiedNpcs,{get:()=>{throw new Error('deleted add reached ambient NPC processing');}});
}
function fixture(contentMode:'active'|'missing'|'retired'='active'){
  const sender=Identity.fromString('a'.repeat(64)),other=Identity.fromString('b'.repeat(64));
  const encounters=records<{id:string;generation:bigint;phase:string;maximumHealthCenti:number;healthCenti:number;
    worldSeed:number;rewardJson:string;respawnAfterTick:bigint;respawnDelayTicks:bigint}>();
  const contributions=records<{id:string;identity:Identity;encounterId:string;generation:bigint;damageCenti:number;supportCenti:number;lastUsefulTick:bigint}>();
  const completions=records<{id:string;encounterId:string;generation:bigint;completedTick:bigint;rewardRevision:string}>();
  const claims=records<{id:string;identity:Identity;completionId:string;itemsJson:string;combatExperience:number;claimed:boolean;claimedTick:bigint}>();
  encounters.insert({id:'camp',generation:1n,phase:'active',maximumHealthCenti:1000,healthCenti:1000,worldSeed:123,
    rewardJson:JSON.stringify({revision:'test-v1',combatExperience:24,drops:[{itemKind:'stone',minimum:2,maximum:2,chanceBasisPoints:10000}]}),
    respawnAfterTick:0n,respawnDelayTicks:6000n});
  const statistics:Array<{identity:string;kind:string;value:bigint;subject:string}>=[];
  const xp=new Map<string,bigint>();let locked=false;let recoveryAvailable=true;
  type Npc={id:bigint;kind:string;spaceId:number;health:number;x:number;y:number;moving:boolean;wanderDirection:string;authorityTick:bigint;lastHitCritical:boolean};
  const npcs=new Map<bigint,Npc>();
  const profiles=new Map<bigint,{npcId:bigint;encounterId:string;generation:bigint;enemyKind:string;role?:string;summonState?:string}>();
  const unit=sim.TILE_SIZE_FIXED;
  const player={spaceId:sim.TOPSIDE_SPACE_ID,x:unit*3,y:unit*4};
  const collision={width:32,height:32,blocked:Array(1024).fill(false),elevations:Array(1024).fill(0),obstacles:[]};
  const policy=new sim.CombatRegionPolicy([{id:'island',spaceId:sim.TOPSIDE_SPACE_ID,minX:0,minY:0,maxX:31,maxY:31,policy:'hostile'}]);

  let containers:Readonly<Record<string,sim.ContainerSnapshot>>=Object.fromEntries(['hotbar','backpack','equipment','crafting'].map(id=>[id,{id,capacity:1,slots:[null]}]));
  const ctx={sender,senderAuth:{jwt:{}},db:{membership:{identity:{find:()=>({})}},
    outdoor_encounter:encounters,outdoor_encounter_contribution:{...contributions,by_encounter:{filter:(id:string)=>[...contributions.rows.values()].filter(row=>row.encounterId===id)}},
    outdoor_encounter_completion:completions,outdoor_reward_claim:claims,
    world_npc:{id:{find:(id:bigint)=>npcs.get(id)??null,delete:(id:bigint)=>npcs.delete(id)}},
    outdoor_enemy_profile:{by_encounter:{filter:(id:string)=>[...profiles.values()].filter(row=>row.encounterId===id)},npcId:{find:(id:bigint)=>profiles.get(id)??null,delete:(id:bigint)=>profiles.delete(id),update:(row:NonNullable<ReturnType<typeof profiles.get>>)=>profiles.set(row.npcId,row)}},player_position:{identity:{find:()=>player}},
    enemy_attack:{npcId:{delete:()=>{}}},world_clock:{id:{find:()=>({authorityTick:101n})}}}};
  const campDefinition={id:'encounter:test_camp',kind:'encounter',schemaVersion:1,
      runtimeId:'camp',runtimeIndex:99,tileX:4,tileY:4,radiusTiles:6,elevation:0,activation:'proximity',
      respawnDelayTicks:6000,roles:[],members:[{enemy:'enemy:ember_slime',tileX:4,tileY:4}],
      reward:{revision:'test-v1',combatExperience:24,drops:[{item:'item:stone',minimum:2,maximum:2,chanceBasisPoints:10000}]},
      ...(contentMode==='retired'?{retired:true,replacement:'encounter:cinder_ash_shore'}:{})};
  const registry=sim.buildContentRegistry([...sim.bootstrapContentRows(),
    ...(contentMode==='missing'?[]:[{id:campDefinition.id,kind:campDefinition.kind,json:campDefinition}])]).registry;
  const api=production({...sim,Identity,SenderError:Error,OUTDOOR_RETURN_PATHS:new Map(),HEARTH_ENCOUNTERS:[{id:'camp',tileX:4,tileY:4,radiusTiles:6,elevation:0}],
    compiledLiveIslandRuntime:()=>({combatPolicy:policy}),collisionForSpace:()=>collision,outdoorCollisionMap:()=>collision,outdoorRecoveryPosition:()=>recoveryAvailable?{x:0,y:0}:null,
    updateWorldNpc:(_ctx:unknown,npc:Npc)=>npcs.set(npc.id,npc),recordPlayerStatistic:(_ctx:unknown,identity:Identity,kind:string,value:bigint,_tick:bigint,subject:string)=>statistics.push({identity:identity.toHexString(),kind,value,subject}),requireAuthorizedSender:()=>{},
    requirePersistentInventoryAvailable:()=>{if(locked)throw new Error('descent_inventory_locked');},contentRegistry:()=>registry,
    grantSkillExperience:(_ctx:unknown,identity:Identity,_track:string,amount:bigint)=>xp.set(identity.toHexString(),(xp.get(identity.toHexString())??0n)+amount),
    loadPlayerInventory:()=>({containers,rowBySlot:new Map()}),activeItemContainerContent:()=>sim.itemContainerContentResolver(registry),
    writePlayerInventory:(_ctx:unknown,_rows:unknown,_old:unknown,next:typeof containers)=>{containers=next;},
    updateEquippedForIdentity:()=>{},stashOverflow:()=>{throw new Error('unexpected_overflow');},
  });
  return {ctx,api,statistics,sender,other,encounters,contributions,completions,claims,xp,player,collision,npcs,profiles,
    spawn:(id:bigint,health:number)=>{
      const npc:Npc={id,kind:'slime_small_red',spaceId:sim.TOPSIDE_SPACE_ID,health,x:unit*4,y:unit*4,
        moving:false,wanderDirection:'idle',authorityTick:100n,lastHitCritical:false};
      npcs.set(id,npc);profiles.set(id,{npcId:id,encounterId:'camp',generation:1n,enemyKind:'ember_slime'});return npc;
    },
    blockRecovery:()=>{recoveryAvailable=false;},lock:()=>{locked=true;},inventory:()=>containers,fill:()=>{containers={...containers,
      hotbar:{id:'hotbar',capacity:1,slots:[{itemKind:'wood',quantity:99}]},backpack:{id:'backpack',capacity:1,slots:[{itemKind:'wood',quantity:99}]}};},
    empty:()=>{containers={...containers,hotbar:{id:'hotbar',capacity:1,slots:[null]}};}};
}
describe('outdoor completion and reserved item authority',()=>{
  it.each(['missing','retired'] as const)('fails closed before combat or reward writes when encounter content is %s',contentMode=>{
    const f=fixture(contentMode),npc=f.spawn(1n,10);
    expect(f.api.damageOutdoorEnemy(f.ctx,npc,f.sender,1000,false,101n)).toBe(0);
    expect(f.npcs.get(npc.id)?.health).toBe(10);
    expect(f.encounters.id.find('camp')).toMatchObject({healthCenti:1000,phase:'active'});
    expect(f.contributions.rows.size).toBe(0);expect(f.completions.rows.size).toBe(0);expect(f.claims.rows.size).toBe(0);
  });
  it('credits each eligible participant from authored completion statistics once even with full bags',()=>{
    const f=fixture();f.fill();
    f.encounters.insert({...f.encounters.id.find('camp')!,id:'cinder-ash-shore'});
    f.api.persistOutdoorEncounterDamage(f.ctx,'cinder-ash-shore',f.sender,500,100n);
    expect(f.statistics).toEqual([]);
    f.api.persistOutdoorEncounterDamage(f.ctx,'cinder-ash-shore',f.other,500,101n);
    expect(f.statistics).toEqual([f.sender,f.other].map(identity=>({identity:identity.toHexString(),kind:'quest_actions',value:1n,subject:'hearth_ash_shore_cleared'})));
    f.api.persistOutdoorEncounterDamage(f.ctx,'cinder-ash-shore',f.sender,500,102n);
    expect(f.statistics).toHaveLength(2);
    const claim=[...f.claims.rows.values()].find(row=>row.identity.isEqual(f.sender))!;
    expect(()=>f.api.claimOutdoorReward(f.ctx,{claimId:claim.id})).toThrow('inventory_full');
    expect(f.statistics).toHaveLength(2);expect(f.claims.id.find(claim.id)!.claimed).toBe(false);
    f.empty();f.api.claimOutdoorReward(f.ctx,{claimId:claim.id});f.api.claimOutdoorReward(f.ctx,{claimId:claim.id});
    expect(f.statistics).toHaveLength(2);
  });
  it('does not award introductory clear credit for another camp or an ineligible contributor',()=>{
    const f=fixture();f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);expect(f.statistics).toEqual([]);
    f.encounters.insert({...f.encounters.id.find('camp')!,id:'cinder-ash-shore',phase:'active',healthCenti:1000});
    f.api.persistOutdoorEncounterDamage(f.ctx,'cinder-ash-shore',f.sender,1,100n);
    f.api.persistOutdoorEncounterDamage(f.ctx,'cinder-ash-shore',f.other,999,101n);
    expect(f.statistics.map(row=>row.identity)).toEqual([f.other.toHexString()]);
  });
  it('keeps add damage outside completion credit and cleans surviving adds on the final base death',()=>{
    const f=fixture(),boss=f.spawn(1n,10),add=f.spawn(2n,36),survivor=f.spawn(3n,36);
    f.profiles.set(add.id,{...f.profiles.get(add.id)!,role:'add',summonState:'spawned'});
    f.profiles.set(survivor.id,{...f.profiles.get(survivor.id)!,role:'add',summonState:'spawned'});
    expect(f.api.damageOutdoorEnemy(f.ctx,add,f.sender,3600,false,101n)).toBe(36);
    expect(f.encounters.id.find('camp')?.healthCenti).toBe(1000);
    expect(f.contributions.rows.size).toBe(0);expect(f.xp.size).toBe(0);expect(f.claims.rows.size).toBe(0);
    expect(f.profiles.get(add.id)?.summonState).toBe('dead');
    f.api.damageOutdoorEnemy(f.ctx,boss,f.sender,1000,false,102n);
    expect(f.completions.rows.size).toBe(1);expect(f.claims.rows.size).toBe(1);expect(f.xp.get(f.sender.toHexString())).toBe(24n);
    expect(f.npcs.has(survivor.id)).toBe(false);expect(f.profiles.has(add.id)).toBe(false);expect(f.profiles.has(survivor.id)).toBe(false);
    // Run the real scheduled ambient loop over its pre-projectile snapshots.
    // Removed profiles must not make dead adds fall back to generic NPC updates.
    scheduledAmbientNpcPass(f.ctx,[add,survivor]);
    expect(f.api.damageOutdoorEnemy(f.ctx,survivor,f.sender,3600,false,102n)).toBe(0);
    expect(f.claims.rows.size).toBe(1);
  });
  it('moves outdoor combat metadata across regional boundaries with its NPC without redundant writes',()=>{
    const api=production({},['updateWorldNpc']);
    let profile={npcId:1n,encounterId:'camp',generation:1n,enemyKind:'ember_slime',chunkX:2,chunkY:3,spaceId:0};
    const writes:typeof profile[]=[];
    const ctx={db:{world_npc:{id:{update:()=>{}}},
      world_wildlife_profile:{npcId:{find:()=>null}},rogue_enemy_profile:{npcId:{find:()=>null}},
      outdoor_enemy_profile:{npcId:{find:()=>profile,update:(row:typeof profile)=>{profile=row;writes.push(row);}}}}};
    api.updateWorldNpc(ctx,{id:1n,chunkX:2,chunkY:3,spaceId:0});
    expect(writes).toHaveLength(0);
    api.updateWorldNpc(ctx,{id:1n,chunkX:3,chunkY:4,spaceId:0});
    expect(profile).toMatchObject({chunkX:3,chunkY:4,spaceId:0,encounterId:'camp',generation:1n});
    api.updateWorldNpc(ctx,{id:1n,chunkX:3,chunkY:4,spaceId:0});
    expect(writes).toHaveLength(1);
    api.updateWorldNpc(ctx,{id:1n,chunkX:3,chunkY:4,spaceId:7});
    expect(profile.spaceId).toBe(7);expect(writes).toHaveLength(2);
  });
  it('suspends outgoing camp damage when the dock cannot accept a knockout',()=>{
    const f=fixture(),npc=f.spawn(1n,10);f.blockRecovery();
    expect(f.api.damageOutdoorEnemy(f.ctx,npc,f.sender,1000,false,101n)).toBe(0);
    expect(f.npcs.get(1n)?.health).toBe(10);expect(f.claims.rows.size).toBe(0);
  });
  it('rejects damage outside the authored camp even if both participants remain on hostile terrain',()=>{
    const f=fixture(),npc={...f.spawn(1n,10),x:20*sim.TILE_SIZE_FIXED};f.player.x=npc.x;
    expect(f.api.damageOutdoorEnemy(f.ctx,npc,f.sender,1000,false,101n)).toBe(0);
    expect(f.claims.rows.size).toBe(0);
  });
  it('expires a projectile crossing the dock boundary, while preserving ordinary peaceful-world arrows',()=>{
    const f=fixture(),unit=sim.TILE_SIZE_FIXED,spaceId=sim.TOPSIDE_SPACE_ID;
    const policy=new sim.CombatRegionPolicy([{id:'island',spaceId,minX:0,minY:0,maxX:31,maxY:31,policy:'hostile'},
      {id:'dock',parentId:'island',spaceId,minX:8,minY:8,maxX:10,maxY:10,policy:'sanctuary'}]);
    const point=(x:number,y:number)=>({x:x*unit,y:y*unit});
    expect(f.api.outdoorProjectileSegmentAllowed(policy,spaceId,point(7,9),point(12,9))).toBe(false);
    expect(f.api.outdoorProjectileSegmentAllowed(policy,spaceId,point(9,9),point(12,9))).toBe(false);
    expect(f.api.outdoorProjectileSegmentAllowed(policy,spaceId,point(7,7),point(12,7))).toBe(true);
    expect(f.api.outdoorProjectileSegmentAllowed(undefined,spaceId,point(7,9),point(12,9))).toBe(true);
  });
  it('conserves whole-NPC HP through centi-health credit and rewards only a full two-member pack',()=>{
    const f=fixture(),first=f.spawn(1n,6),second=f.spawn(2n,4);
    expect(f.api.damageOutdoorEnemy(f.ctx,first,f.sender,9999,false,100n)).toBe(6);
    expect(f.encounters.id.find('camp')!.healthCenti).toBe(400);expect(f.claims.rows.size).toBe(0);
    expect(f.npcs.get(1n)!.health).toBe(0);
    expect(f.api.damageOutdoorEnemy(f.ctx,f.npcs.get(1n),f.sender,9999,false,100n)).toBe(0);
    expect(f.api.damageOutdoorEnemy(f.ctx,second,f.sender,9999,false,101n)).toBe(4);
    expect(f.encounters.id.find('camp')!.healthCenti).toBe(0);expect(f.claims.rows.size).toBe(1);
    expect([...f.contributions.rows.values()][0]!.damageCenti).toBe(1000);
  });
  it('rejects a stale member generation and an incompatible elevation before touching health or rewards',()=>{
    const f=fixture(),npc=f.spawn(1n,10);
    f.profiles.set(1n,{...f.profiles.get(1n)!,generation:2n});
    expect(f.api.damageOutdoorEnemy(f.ctx,npc,f.sender,1000,false,100n)).toBe(0);
    f.profiles.set(1n,{...f.profiles.get(1n)!,generation:1n});f.collision.elevations[4*32+4]=1;
    expect(f.api.damageOutdoorEnemy(f.ctx,npc,f.sender,1000,false,100n)).toBe(0);
    expect(f.encounters.id.find('camp')!.healthCenti).toBe(1000);expect(f.claims.rows.size).toBe(0);
  });
  it('commits one XP receipt and one stored item entitlement despite repeated killing blows',()=>{
    const f=fixture();f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);
    f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.other,1000,101n);
    expect(f.completions.rows.size).toBe(1);expect(f.claims.rows.size).toBe(1);
    expect(f.xp.get(f.sender.toHexString())).toBe(24n);expect(f.xp.has(f.other.toHexString())).toBe(false);
    const claim=[...f.claims.rows.values()][0]!;expect(JSON.parse(claim.itemsJson)).toEqual([{itemKind:'stone',quantity:2}]);
    f.api.claimOutdoorReward(f.ctx,{claimId:claim.id});f.api.claimOutdoorReward(f.ctx,{claimId:claim.id});
    expect(f.inventory().hotbar!.slots[0]).toMatchObject({itemKind:'stone',quantity:2});
    expect(f.xp.get(f.sender.toHexString())).toBe(24n);expect(f.claims.id.find(claim.id)!.claimed).toBe(true);
  });
  it('keeps an older unclaimed entitlement when the next generation completes',()=>{
    const f=fixture();f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);
    const first=[...f.claims.rows.values()][0]!;
    const old=f.encounters.id.find('camp')!;
    f.encounters.id.update({...old,generation:2n,phase:'active',healthCenti:1000});
    f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,7000n);
    expect(f.claims.rows.size).toBe(2);expect(f.completions.rows.size).toBe(2);expect(f.xp.get(f.sender.toHexString())).toBe(48n);
    expect(f.claims.id.find(first.id)).toEqual(first);
    f.api.claimOutdoorReward(f.ctx,{claimId:first.id});
    const second=[...f.claims.rows.values()].find(row=>row.completionId==='camp:2')!;
    f.api.claimOutdoorReward(f.ctx,{claimId:second.id});
    expect(f.inventory().hotbar!.slots[0]).toMatchObject({itemKind:'stone',quantity:4});
  });
  it('fails closed if an incomplete encounter is restored beside an existing completion key',()=>{
    const f=fixture();f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);
    f.encounters.id.update({...f.encounters.id.find('camp')!,phase:'active',healthCenti:1000});
    expect(()=>f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,101n)).toThrow('encounter_completion_conflict');
    expect(f.xp.get(f.sender.toHexString())).toBe(24n);expect(f.claims.rows.size).toBe(1);
  });
  it.each([
    ['stone',100,1,[99,1]],['stone',75,2,[99,51]],['sword',2,1,[1,1]],
  ] as const)('splits %s rewards into valid source stacks before atomic insertion', (itemKind,quantity,lines,expected)=>{
    const f=fixture(),camp=f.encounters.id.find('camp')!;
    f.encounters.id.update({...camp,rewardJson:JSON.stringify({revision:'large-test',combatExperience:24,
      drops:Array.from({length:lines},()=>({itemKind,minimum:quantity,maximum:quantity,chanceBasisPoints:10000}))})});
    f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);
    const claim=[...f.claims.rows.values()][0]!;f.api.claimOutdoorReward(f.ctx,{claimId:claim.id});
    const stacks=[f.inventory().hotbar!.slots[0],f.inventory().backpack!.slots[0]];
    expect(stacks.map(row=>row?.quantity)).toEqual(expected);expect(stacks.every(row=>row?.itemKind===itemKind)).toBe(true);
    if(itemKind==='sword')expect(stacks.every(row=>(row?.durability??0)>0)).toBe(true);
  });
  it('full inventory keeps the stored grant unchanged and permits a later exact retry',()=>{
    const f=fixture();f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);
    const claim=[...f.claims.rows.values()][0]!;f.fill();const before=f.inventory();
    expect(()=>f.api.claimOutdoorReward(f.ctx,{claimId:claim.id})).toThrow('reward_inventory_full');
    expect(f.inventory()).toEqual(before);expect(f.claims.id.find(claim.id)).toEqual(claim);
    f.empty();f.api.claimOutdoorReward(f.ctx,{claimId:claim.id});
    expect(f.inventory().hotbar!.slots[0]).toMatchObject({itemKind:'stone',quantity:2});
  });
  it('rejects another identity and a Delve-locked inventory without changing custody',()=>{
    const f=fixture();f.api.persistOutdoorEncounterDamage(f.ctx,'camp',f.sender,1000,100n);
    const claim=[...f.claims.rows.values()][0]!;f.ctx.sender=f.other;
    expect(()=>f.api.claimOutdoorReward(f.ctx,{claimId:claim.id})).toThrow('reward_not_found');
    f.ctx.sender=f.sender;f.lock();expect(()=>f.api.claimOutdoorReward(f.ctx,{claimId:claim.id})).toThrow('descent_inventory_locked');
    expect(f.claims.id.find(claim.id)).toEqual(claim);
  });
});
