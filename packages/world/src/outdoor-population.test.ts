import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import {Identity} from 'spacetimedb';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function production(dependencies:Record<string,unknown>,actualAttacks=false,boundedCollision=false){
  const names=['npcTraversalActor','attackCommitmentFromRow','clearOutdoorAdds','prepareOutdoorAdds','stepOutdoorSummons','outdoorHostileSegment','outdoorInsideCamp','outdoorMovementAllowed','outdoorRecoveryPosition',
    'disableOutdoorEncounter','spawnOutdoorEncounter','outdoorReturnWaypoint','moveOutdoorNpc','stepOutdoorEncounters','activateOutdoorEncounter',
    ...(actualAttacks?['recoverOutdoorKnockout','stepCommittedRogueAttack']:[]),
    ...(boundedCollision?['outdoorCollisionMap']:[])];
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
type Row=Record<string,unknown>;
function table(primary:string){
  const rows=new Map<string,Row>();
  const key={find:(id:unknown)=>rows.get(String(id))??null,delete:(id:unknown)=>rows.delete(String(id)),
    update:(row:Row)=>{rows.set(String(row[primary]),row);return row;}};
  return {rows,id:key,npcId:key,identity:key,insert:(row:Row)=>{if(key.find(row[primary]))throw new Error('duplicate');return key.update(row);},
    by_encounter:{filter:(id:string)=>[...rows.values()].filter(row=>row.encounterId===id)},
    by_chunk:{filter:(scope:readonly number[])=>[...rows.values()].filter(row=>row.spaceId===scope[0]&&row.chunkX===scope[1]&&row.chunkY===scope[2])},
    by_target:{filter:(id:Identity)=>[...rows.values()].filter(row=>(row.targetIdentity as Identity).isEqual(id))}};
}
function fixture(actualAttacks=false,boundedCollision=false){
  const unit=sim.TILE_SIZE_FIXED,width=832,blocked=Array<boolean>(width*width).fill(false),elevations=Array<number>(width*width).fill(0);
  for(const camp of sim.HEARTH_ENCOUNTERS)for(let y=camp.tileY-camp.radiusTiles-3;y<=camp.tileY+camp.radiusTiles+3;y++)
    for(let x=camp.tileX-camp.radiusTiles-3;x<=camp.tileX+camp.radiusTiles+3;x++)elevations[y*width+x]=camp.elevation;
  const collision={width,height:width,blocked,elevations,obstacles:[]};
  let policy:sim.CombatRegionPolicy|undefined=new sim.CombatRegionPolicy(sim.HEARTH_COMBAT_REGIONS);
  const scopeQueries:unknown[]=[];let collisionBuilds=0;
  const scoped=()=>({by_chunk:{filter:(scope:unknown)=>{scopeQueries.push(scope);return [];}}});
  const db={world_wildlife_profile:table('npcId'),world_resource:scoped(),world_chest:scoped(),world_combat_target:scoped(),outdoor_encounter:table('id'),world_npc:table('id'),outdoor_enemy_profile:table('npcId'),
    outdoor_encounter_contribution:table('id'),enemy_attack:table('npcId'),player_position:table('identity'),
    membership:table('identity'),world_seed:table('id'),world_clock:table('id'),player_stats:table('identity'),player_combat_state:table('identity'),
    inventory_slot:table('id'),player_wallet:table('identity')};
  const sender=Identity.fromString('a'.repeat(64));
  const player={identity:sender,spaceId:sim.TOPSIDE_SPACE_ID,x:676.5*unit,y:203.5*unit};
  db.player_position.insert(player);db.player_stats.insert({identity:sender,healthCenti:500,vigourCenti:0,regenTick:20n});
  db.inventory_slot.insert({id:'keepsake',itemKind:'guardian_seal',quantity:1});db.player_wallet.insert({identity:sender,bronze:99n});
  db.world_clock.insert({id:0,authorityTick:20n});
  const ctx={db,sender,senderAuth:{jwt:{}}};
  const kinds={ember_slime:'slime_small_red',ember_cowling:'cowling',cowling_pyromancer:'cowling_mage',cinder_skull:'flying_skull',caldera_warden:'cowling'};
  const api=production({...sim,SenderError:Error,OUTDOOR_NPC_ID_BASE:8_900_000_000_000n,OUTDOOR_NATIVE_KINDS:kinds,OUTDOOR_NAMES:kinds,OUTDOOR_RETURN_PATHS:new Map(),
    contentRegistry:()=>sim.bootstrapContentRegistry(),compiledLiveIslandRuntime:()=>policy===undefined?null:{combatPolicy:policy},
    waterCollisionForSpace:()=>collision,
    collisionForSpace:()=>{collisionBuilds++;return collision;},outdoorCollisionMap:()=>collision,combatElevationAt:(_collision:unknown,x:number,y:number)=>elevations[Math.floor(y/unit)*width+Math.floor(x/unit)]??-32768,
    chunkAt:(value:number)=>Math.floor(value/(unit*16)),parseNpcFacing:(value:string)=>value,requireAuthorizedSender:()=>{},stepCommittedRogueAttack:()=>true,
    updateWorldNpc:(_ctx:unknown,row:Row)=>db.world_npc.id.update(row),console:{warn:()=>{}},
    advancePlayerStats:()=>db.player_stats.identity.find(sender),resolvedStatsForRow:()=>({maxHealthCenti:10000,maxVigourCenti:10000}),
    resolveDefendedPlayerHit:(_ctx:unknown,_identity:unknown,_tick:unknown,_origin:unknown,damageCenti:number)=>({damageCenti,vigourCenti:0}),
    clearBowCharge:()=>{},cancelFishingCastFor:()=>{},
    teleportPlayer:(_ctx:unknown,row:Row,spaceId:number,x:number,y:number)=>db.player_position.identity.update({...row,spaceId,x,y}),
    combatRecovery:(_ctx:unknown,identity:Identity,tick:bigint,readyTick:bigint)=>db.player_combat_state.identity.update({identity,tick,readyTick}),
  },actualAttacks,boundedCollision);
  return {api,ctx,db,player,unit,collision,scopeQueries,collisionBuilds:()=>collisionBuilds,policy:()=>policy!,removePolicy:()=>{policy=undefined;},restorePolicy:()=>{policy=new sim.CombatRegionPolicy(sim.HEARTH_COMBAT_REGIONS);},
    spawn:()=>api.stepOutdoorEncounters(ctx,20n,[]),camp:(id='cinder-ash-shore')=>db.outdoor_encounter.id.find(id)!,
    tick:(tick:bigint,players:readonly typeof player[]=[player])=>api.stepOutdoorEncounters(ctx,tick,players)};
}
describe('outdoor population authority',()=>{
  it('creates exactly five packs/seven members once and leaves the Warden dormant',()=>{
    const f=fixture();f.spawn();f.tick(40n);
    expect(f.db.outdoor_encounter.rows.size).toBe(5);expect(f.db.world_npc.rows.size).toBe(7);
    expect(f.camp('cinder-caldera-warden').phase).toBe('dormant');
    expect(f.db.outdoor_enemy_profile.rows.size).toBe(7);
    expect(f.camp().maximumHealthCenti).toBe(7200);
  });
  it('gathers resource collision by bounded chunk keys once for a whole population tick',()=>{
    const f=fixture(false,true);f.spawn();
    expect(f.collisionBuilds()).toBe(1);
    expect(f.scopeQueries.length).toBeGreaterThan(0);expect(f.scopeQueries.length).toBeLessThan(400);
    for(const query of f.scopeQueries){
      expect(Array.isArray(query)).toBe(true);expect(query).toHaveLength(3);
      expect((query as number[])[0]).toBe(sim.TOPSIDE_SPACE_ID);
    }
    f.tick(21n,[]);expect(f.collisionBuilds()).toBe(1);
  });
  it('prewarms the beginner pack before a first ferry arrival and keeps it on the shore approach',()=>{
    const f=fixture();f.spawn();
    const arrival=sim.HEARTH_ISLANDS.cinderwake.arrival;
    for(let x=arrival.tileX;x<=676;x++)f.tick(BigInt(40+x-arrival.tileX),[{...f.player,x:(x+.5)*f.unit,y:203.5*f.unit}]);
    expect(f.camp().generation).toBe(1n);expect(f.db.world_npc.id.find(8_900_000_000_000n)).not.toBeNull();
  });
  it('never first-spawns a pack on an arriving player',()=>{
    const f=fixture();f.tick(20n);
    expect(f.db.outdoor_encounter.id.find('cinder-ash-shore')).toBeNull();
    expect(f.db.world_npc.id.find(8_900_000_000_000n)).toBeNull();
  });
  it('refuses missing policy and foreign NPC id collisions without partial pack writes',()=>{
    const f=fixture();f.removePolicy();f.spawn();expect(f.db.world_npc.rows.size).toBe(0);
    const g=fixture();g.db.world_npc.insert({id:8_900_000_000_001n,kind:'foreign'});g.spawn();
    expect(g.db.outdoor_encounter.id.find('cinder-ash-shore')).toBeNull();
    expect(g.db.world_npc.id.find(8_900_000_000_000n)).toBeNull();
    expect(g.db.world_npc.id.find(8_900_000_000_001n)?.kind).toBe('foreign');
  });
  it('stages the first two tells six ticks apart even when engagement starts long after spawning',()=>{
    const f=fixture();f.spawn();
    const second={...f.player,identity:Identity.fromString('b'.repeat(64)),x:680.5*f.unit,y:206.5*f.unit};
    const players=[f.player,second];f.tick(100n,players);
    expect(f.db.enemy_attack.rows.size).toBe(1);
    f.tick(105n,players);expect(f.db.enemy_attack.rows.size).toBe(1);
    f.tick(106n,players);expect(f.db.enemy_attack.rows.size).toBe(2);
  });
  it('persists the mage bolt/bolt/burst cadence at commitment, including the burst damage snapshot',()=>{
    const f=fixture();f.spawn();const npcId=8_900_000_000_032n;
    const player={...f.player,x:725.5*f.unit,y:172.5*f.unit};
    let tick=100n;
    for(const pattern of ['bolt','bolt','burst','bolt']){
      f.tick(tick,[player]);
      const attack=f.db.enemy_attack.npcId.find(npcId)!;
      expect(attack.pattern).toBe(pattern);expect(attack.damageCenti).toBe(pattern==='burst'?700:800);
      const profile=f.db.outdoor_enemy_profile.npcId.find(npcId)!;
      tick=BigInt(String(profile.nextAttackTick));f.db.enemy_attack.npcId.delete(npcId);
    }
  });
  it('requires both a completed cooldown and thirty quiet seconds before advancing generation',()=>{
    const f=fixture();f.spawn();f.db.outdoor_encounter.id.update({...f.camp(),phase:'completed',healthCenti:0,respawnAfterTick:6000n});
    f.tick(6000n);expect(f.camp().generation).toBe(1n);
    f.tick(6580n,[]);expect(f.camp().generation).toBe(1n);
    f.tick(6600n,[]);expect(f.camp().generation).toBe(2n);expect(f.camp().healthCenti).toBe(7200);
  });
  it('clears commitments immediately on policy removal and preserves the generation for inspection',()=>{
    const f=fixture();f.spawn();f.tick(100n);expect(f.db.enemy_attack.rows.size).toBeGreaterThan(0);
    f.removePolicy();f.tick(101n);
    expect(f.db.enemy_attack.rows.size).toBe(0);expect(f.camp().phase).toBe('active');
    expect(f.camp().conflict).toBe('combat_policy_removed');expect(f.camp().generation).toBe(1n);
  });
  it('leashes after eighty targetless ticks and resets the whole pack without rerolling',()=>{
    const f=fixture();f.spawn();f.tick(100n);f.tick(179n,[]);expect(f.camp().phase).toBe('active');
    f.tick(180n,[]);expect(f.camp().phase).toBe('returning');expect(f.db.enemy_attack.rows.size).toBe(0);
    f.db.outdoor_encounter_contribution.insert({id:'credit',encounterId:'cinder-ash-shore',generation:1n});
    f.tick(700n,[]);expect(f.camp().phase).toBe('active');expect(f.camp().generation).toBe(1n);
    expect(f.db.outdoor_encounter_contribution.rows.size).toBe(0);
  });
  it('preserves completed cooldown through a temporary policy conflict and resumes after revalidation',()=>{
    const f=fixture();f.spawn();f.db.outdoor_encounter.id.update({...f.camp(),phase:'completed',healthCenti:0,respawnAfterTick:6000n});
    f.removePolicy();f.tick(40n,[]);expect(f.camp().phase).toBe('completed');
    f.restorePolicy();f.tick(60n,[]);expect(f.camp().conflict).toBe('');
    f.tick(660n,[]);expect(f.camp().generation).toBe(1n);
    f.tick(6000n,[]);expect(f.camp().generation).toBe(2n);
  });
  it('does not immediately leash an old idle pack on its first obstructed approach',()=>{
    const f=fixture();f.spawn();
    for(let y=200;y<=208;y++)for(const x of [677,679])f.collision.blocked[y*832+x]=true;
    f.tick(1000n,[{...f.player,x:678.5*f.unit,y:203.5*f.unit}]);
    expect(f.camp().phase).toBe('active');expect(f.camp().activated).toBe(false);
    expect(f.db.enemy_attack.rows.size).toBe(0);
  });
  it('returns around a wall using a bounded route that temporarily moves away from home',()=>{
    const f=fixture();f.spawn();const definition=sim.HEARTH_ENCOUNTERS[0]!;
    for(let y=200;y<=207;y++)f.collision.blocked[y*832+677]=true;
    let npc={id:8_900_000_000_000n,x:678.5*f.unit,y:206.5*f.unit,homeX:676.5*f.unit,homeY:203.5*f.unit};
    let detoured=false;
    for(let step=0;step<64&&(npc.x!==npc.homeX||npc.y!==npc.homeY);step++){
      const next=f.api.outdoorReturnWaypoint(npc,definition,f.policy(),f.collision) as {x:number;y:number}|null;
      expect(next).not.toBeNull();if(next===null)return;
      expect(f.api.outdoorMovementAllowed(f.policy(),definition,npc,next,f.collision)).toBe(true);
      detoured ||= next.y/f.unit<200||next.y/f.unit>208;
      npc={...npc,...next};
    }
    expect(npc.x).toBe(npc.homeX);expect(npc.y).toBe(npc.homeY);expect(detoured).toBe(true);
  });
  it('recovers a lethal outdoor hit at the dock without touching inventory/currency and ignores a second old-position hit',()=>{
    const f=fixture(true);f.spawn();const definition=sim.HEARTH_ENCOUNTERS[0]!;
    const npc=f.db.world_npc.id.find(8_900_000_000_000n)!;
    const attack={...sim.commitEnemyAttack('burst',1n,100n,{x:Number(npc.x),y:Number(npc.y)},f.player,2*f.unit),
      npcId:npc.id,targetIdentity:f.player.identity,lastProcessedTick:113n,elevation:0,damageCenti:1000,hitIdentities:[],spaceId:0,chunkX:npc.chunkX,chunkY:npc.chunkY};
    f.db.enemy_attack.insert(attack);
    f.api.stepCommittedRogueAttack(f.ctx,npc,attack,114n,f.collision,{players:[f.player],policy:f.policy(),definition});
    const recovered=f.db.player_position.identity.find(f.player.identity)!;
    expect(recovered.x).toBe((sim.HEARTH_ISLANDS.cinderwake.arrival.tileX+.5)*f.unit);
    expect(recovered.y).toBe((sim.HEARTH_ISLANDS.cinderwake.arrival.tileY+.5)*f.unit);
    expect(f.db.player_stats.identity.find(f.player.identity)?.healthCenti).toBe(3500);
    expect(f.db.player_stats.identity.find(f.player.identity)?.vigourCenti).toBe(2500);
    f.api.stepCommittedRogueAttack(f.ctx,npc,{...attack,hitIdentities:[]},114n,f.collision,{players:[f.player],policy:f.policy(),definition});
    expect(f.db.player_stats.identity.find(f.player.identity)?.healthCenti).toBe(3500);
    expect(f.db.inventory_slot.id.find('keepsake')).toMatchObject({itemKind:'guardian_seal',quantity:1});
    expect(f.db.player_wallet.identity.find(f.player.identity)?.bronze).toBe(99n);
  });
  it('keeps a blocked skull dive stationary through its full recovery before repositioning',()=>{
    const f=fixture(true);f.spawn();
    const profile=[...f.db.outdoor_enemy_profile.rows.values()].find(row=>row.enemyKind==='cinder_skull')!;
    const npc=f.db.world_npc.id.find(profile.npcId)!;
    const definition=sim.HEARTH_ENCOUNTERS.find(row=>row.id===profile.encounterId)!;
    const target={...f.player,x:Number(npc.x)+2*f.unit,y:Number(npc.y)};
    const attack={...sim.commitEnemyAttack('dive',1n,100n,{x:Number(npc.x),y:Number(npc.y)},target,3*f.unit),
      npcId:npc.id,targetIdentity:f.player.identity,lastProcessedTick:111n,elevation:definition.elevation,damageCenti:1000,hitIdentities:[],spaceId:0,chunkX:npc.chunkX,chunkY:npc.chunkY};
    f.db.enemy_attack.insert(attack);
    // Block the first active movement, then remove the obstruction: recovery
    // must remain committed even though movement becomes possible next tick.
    const tile=Math.floor(Number(npc.y)/f.unit)*832+Math.floor(Number(npc.x)/f.unit);
    f.collision.blocked[tile]=true;
    f.api.stepCommittedRogueAttack(f.ctx,npc,attack,112n,f.collision,{players:[target],policy:f.policy(),definition});
    f.collision.blocked[tile]=false;
    expect(f.db.enemy_attack.npcId.find(npc.id)).toMatchObject({tellTicks:0,activeTicks:0,startedTick:112n});
    expect(f.db.outdoor_enemy_profile.npcId.find(npc.id)?.nextAttackTick).toBe(204n);
    for(let tick=113n;tick<124n;tick++){
      const current=f.db.world_npc.id.find(npc.id)!;
      f.api.stepCommittedRogueAttack(f.ctx,current,f.db.enemy_attack.npcId.find(npc.id),tick,f.collision,{players:[target],policy:f.policy(),definition});
      expect(f.db.world_npc.id.find(npc.id)).toMatchObject({x:npc.x,y:npc.y,moving:false,wanderDirection:'recovery'});
    }
    expect(f.api.stepCommittedRogueAttack(f.ctx,f.db.world_npc.id.find(npc.id),f.db.enemy_attack.npcId.find(npc.id),124n,f.collision,{players:[target],policy:f.policy(),definition})).toBe(false);
    expect(f.db.enemy_attack.npcId.find(npc.id)).toBeNull();
  });
  it.each([41n,55n,65n])('defers a Warden threshold crossed at tick %s until the committed recovery ends',crossingTick=>{
    const f=fixture(true);f.spawn();const id=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const player={...f.player,x:721.5*f.unit,y:120.5*f.unit};
    f.db.player_position.identity.update(player);f.db.player_stats.identity.update({...f.db.player_stats.identity.find(player.identity),healthCenti:10000});
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});f.tick(40n,[player]);
    const committed={...f.db.enemy_attack.npcId.find(id)};
    expect(committed).toMatchObject({pattern:'charge',tellTicks:14,activeTicks:8,recoveryTicks:16,startedTick:40n});
    for(let tick=41n;tick<78n;tick++){
      if(tick===crossingTick){
        f.db.world_npc.id.update({...f.db.world_npc.id.find(id),health:300});
        f.db.outdoor_encounter.id.update({...f.camp(encounterId),healthCenti:30000});
      }
      f.tick(tick,[player]);
      expect(f.db.outdoor_enemy_profile.npcId.find(id)?.wardenPhase).toBe(1);
      expect(f.db.enemy_attack.npcId.find(id)).toMatchObject({pattern:'charge',startedTick:40n,tellTicks:14,activeTicks:8,recoveryTicks:16});
    }
    f.tick(78n,[player]);
    expect(f.db.outdoor_enemy_profile.npcId.find(id)).toMatchObject({wardenPhase:2,attackCycle:0,phaseCueUntilTick:98n});
    expect(f.db.enemy_attack.npcId.find(id)).toBeNull();
    for(let tick=79n;tick<98n;tick++)f.tick(tick,[player]);
    expect(f.db.world_npc.id.find(id)?.wanderDirection).toBe('phase_2');
    f.tick(98n,[player]);
    expect(f.db.enemy_attack.npcId.find(id)).toMatchObject({pattern:'burst',startedTick:98n,tellTicks:20,activeTicks:1,recoveryTicks:16});
  });
  it('applies a skipped phase directly and preserves the transition cue across a resumed controller',()=>{
    const f=fixture();f.spawn();const id=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const player={...f.player,x:721.5*f.unit,y:119.5*f.unit};f.db.player_position.identity.update(player);
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});
    f.db.world_npc.id.update({...f.db.world_npc.id.find(id),health:149});
    f.db.outdoor_encounter.id.update({...f.camp(encounterId),healthCenti:14900});
    f.tick(40n,[player]);
    expect(f.db.outdoor_enemy_profile.npcId.find(id)).toMatchObject({wardenPhase:3,phaseCueUntilTick:60n});
    f.tick(59n,[player]);expect(f.db.enemy_attack.npcId.find(id)).toBeNull();
    f.tick(60n,[player]);expect(f.db.enemy_attack.npcId.find(id)).toMatchObject({pattern:'charge',tellTicks:14,recoveryTicks:16});
  });
  it('telegraphs two stable add slots, respects spawn grace, and keeps the base health pool unchanged',()=>{
    const f=fixture();f.spawn();const bossId=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const player={...f.player,x:721.5*f.unit,y:119.5*f.unit};f.db.player_position.identity.update(player);
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});
    f.db.world_npc.id.update({...f.db.world_npc.id.find(bossId),health:150});
    f.db.outdoor_encounter.id.update({...f.camp(encounterId),healthCenti:15000});f.tick(40n,[player]);
    const adds=()=>[...f.db.outdoor_enemy_profile.by_encounter.filter(encounterId)].filter(row=>row.role==='add');
    expect(adds().map(row=>row.npcId)).toEqual([bossId+1n,bossId+2n]);
    expect(adds().map(row=>row.summonState)).toEqual(['marking','marking']);
    for(let tick=41n;tick<=59n;tick++)f.tick(tick,[player]);expect(f.db.world_npc.id.find(bossId+1n)).toBeNull();
    f.tick(60n,[player]);expect(adds().map(row=>row.summonState)).toEqual(['spawned','spawned']);
    expect(adds().map(row=>row.nextAttackTick)).toEqual([80n,86n]);
    const positions=adds().map(row=>f.db.world_npc.id.find(row.npcId)!);
    for(let tick=61n;tick<80n;tick++)f.tick(tick,[player]);
    expect(f.camp(encounterId)).toMatchObject({maximumHealthCenti:45000,healthCenti:15000,conflict:''});
    for(const npc of positions)expect(f.db.world_npc.id.find(npc.id)).toMatchObject({x:npc.x,y:npc.y,moving:false});
    f.db.world_npc.id.update({...positions[0]!,health:0});
    f.db.outdoor_enemy_profile.npcId.update({...adds()[0]!,summonState:'dead'});
    f.tick(100n,[player]);expect(f.db.world_npc.id.find(bossId+1n)?.health).toBe(0);
    f.db.world_npc.id.delete(bossId+1n);f.tick(120n,[player]);
    expect(f.camp(encounterId).conflict).toBe('');expect(adds()).toHaveLength(2);
    f.removePolicy();f.tick(121n,[player]);expect(adds()).toHaveLength(0);
    expect(f.db.world_npc.id.find(bossId+2n)).toBeNull();
  });
  it('defers occupied summon pads independently and rechecks occupancy at the end of the mark',()=>{
    const f=fixture();f.spawn();const bossId=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const player={...f.player,x:721.5*f.unit,y:119.5*f.unit};f.db.player_position.identity.update(player);
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});
    f.db.world_npc.id.update({...f.db.world_npc.id.find(bossId),health:150});
    f.db.outdoor_encounter.id.update({...f.camp(encounterId),healthCenti:15000});
    const left={...player,x:715.5*f.unit,y:116.5*f.unit},right={...player,x:727.5*f.unit,y:116.5*f.unit};
    f.tick(40n,[left]);
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+1n)?.summonState).toBe('pending');
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+2n)?.summonState).toBe('marking');
    f.tick(60n,[right]);
    expect(f.db.world_npc.id.find(bossId+2n)).toBeNull();
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+2n)?.summonState).toBe('pending');
    for(let tick=61n;tick<=80n;tick++)f.tick(tick,[player]);expect(f.db.world_npc.id.find(bossId+1n)).not.toBeNull();
    expect(f.db.world_npc.id.find(bossId+2n)).toBeNull();
    for(let tick=81n;tick<=100n;tick++)f.tick(tick,[player]);expect(f.db.world_npc.id.find(bossId+2n)).not.toBeNull();
    expect(f.camp(encounterId).conflict).toBe('');
  });
  it('re-arms a stale summon warning without duplicating already spawned slots',()=>{
    const f=fixture();f.spawn();const bossId=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const player={...f.player,x:721.5*f.unit,y:119.5*f.unit};f.db.player_position.identity.update(player);
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});
    f.db.world_npc.id.update({...f.db.world_npc.id.find(bossId),health:150});
    f.db.outdoor_encounter.id.update({...f.camp(encounterId),healthCenti:15000});f.tick(40n,[player]);
    f.tick(1000n,[player]);
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+1n)).toMatchObject({summonState:'marking',summonTick:1000n});
    expect(f.db.world_npc.id.find(bossId+1n)).toBeNull();
    for(let tick=1001n;tick<1020n;tick++)f.tick(tick,[player]);
    expect(f.db.world_npc.id.find(bossId+1n)).toBeNull();f.tick(1020n,[player]);
    const count=f.db.world_npc.rows.size;
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+1n)).toMatchObject({summonState:'spawned',nextAttackTick:1040n});
    f.tick(1100n,[player]);expect(f.db.world_npc.rows.size).toBe(count);
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+1n)?.summonState).toBe('spawned');
  });
  it('resets the phase and add wave only with a full quiet leash reset, keeping generation and reward identity',()=>{
    const f=fixture();f.spawn();const bossId=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const player={...f.player,x:721.5*f.unit,y:119.5*f.unit};f.db.player_position.identity.update(player);
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});
    f.db.world_npc.id.update({...f.db.world_npc.id.find(bossId),health:150});
    f.db.outdoor_encounter.id.update({...f.camp(encounterId),healthCenti:15000});f.tick(40n,[player]);
    const before=f.camp(encounterId);
    f.db.outdoor_encounter.id.update({...before,phase:'returning',activated:false,lastNearbyTick:40n,returnStartedTick:41n});
    f.tick(100n,[]);
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId+1n)).toBeNull();
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId)?.wardenPhase).toBe(3);
    f.tick(640n,[]);
    expect(f.camp(encounterId)).toMatchObject({phase:'dormant',generation:before.generation,rewardJson:before.rewardJson,healthCenti:45000});
    expect(f.db.outdoor_enemy_profile.npcId.find(bossId)).toMatchObject({wardenPhase:1,attackCycle:0,phaseCueUntilTick:0n});
    expect(f.db.world_npc.id.find(bossId)?.health).toBe(450);
  });
  it('rejects a cached add impact after the boss completion has removed its authority rows',()=>{
    const f=fixture(true);f.spawn();const bossId=8_900_000_000_064n,encounterId='cinder-caldera-warden';
    const boss=f.db.world_npc.id.find(bossId)!,profile=f.db.outdoor_enemy_profile.npcId.find(bossId)!;
    const npc:Row={...boss,id:bossId+1n,health:36};const player={...f.player,x:Number(boss.x),y:Number(boss.y)};
    f.db.world_npc.insert(npc);f.db.outdoor_enemy_profile.insert({...profile,npcId:npc.id,role:'add',summonState:'spawned'});
    f.db.player_position.identity.update(player);
    const attack={...sim.commitEnemyAttack('burst',1n,100n,{x:Number(npc.x),y:Number(npc.y)},player,2*f.unit),
      npcId:npc.id,targetIdentity:player.identity,lastProcessedTick:113n,elevation:3,damageCenti:1000,hitIdentities:[],spaceId:0,chunkX:npc.chunkX,chunkY:npc.chunkY};
    f.db.enemy_attack.insert(attack);f.db.outdoor_encounter.id.update({...f.camp(encounterId),phase:'completed',healthCenti:0});
    f.api.clearOutdoorAdds(f.ctx,encounterId);
    expect(f.api.stepCommittedRogueAttack(f.ctx,npc,attack,114n,f.collision,{players:[player],policy:f.policy(),definition:sim.HEARTH_ENCOUNTERS[4]})).toBe(false);
    expect(f.db.player_stats.identity.find(player.identity)?.healthCenti).toBe(500);
    expect(f.db.enemy_attack.npcId.find(npc.id)).toBeNull();expect(f.db.world_npc.id.find(npc.id)).toBeNull();
  });
  it('requires an in-range Warden interaction, then rejects duplicate activation',()=>{
    const f=fixture();f.spawn();const encounterId='cinder-caldera-warden';
    expect(()=>f.api.activateOutdoorEncounter(f.ctx,{encounterId})).toThrow('encounter_out_of_reach');
    f.db.player_position.identity.update({...f.player,x:721.5*f.unit,y:119.5*f.unit});
    f.api.activateOutdoorEncounter(f.ctx,{encounterId});expect(f.camp(encounterId).phase).toBe('active');
    expect(()=>f.api.activateOutdoorEncounter(f.ctx,{encounterId})).toThrow('encounter_unavailable');
  });
});
