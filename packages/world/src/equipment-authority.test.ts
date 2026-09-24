import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import {toolSpendResult,sprintIntentSuppressesVigourRegen,nextActionStartedTick,itemDropPosition,settleMovementRun,queueMovementAcknowledgement} from './world-rules.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
/** Execute production functions/reducer callbacks, with only persistence and
 * unrelated world services replaced. No duplicate combat or settlement algorithm. */
function authority(names: readonly string[], dependencies: Record<string, unknown>) {
  const definitions = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn) return fn.getText(source);
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration=statement.declarationList.declarations.find(node=>node.name.getText(source)===name);
      if (!declaration?.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const callback=declaration.initializer.arguments.find(ts.isArrowFunction);
      if (callback) return `const ${name} = ${callback.getText(source)};`;
    }
    throw new Error(`Missing authority ${name}`);
  }).join('\n');
  const javascript=ts.transpileModule(`${definitions}\nreturn {${names.join(',')}};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
  }).outputText;
  return new Function(...Object.keys(dependencies),javascript)(...Object.values(dependencies));
}
// Database-shaped fixtures deliberately retain exact stored metadata.
function table<T extends object = Record<string,unknown>>(initial: T | null = null) {
  let row = initial;
  const index={find:()=>row,update:(next:T)=>{row=next;return row;},delete:()=>{row=null;}};
  return {identity:index,id:index,npcId:index,connectionId:index,insert:index.update};
}
type FixtureIdentity={toHexString:()=>string;isEqual:(other:unknown)=>boolean};
type FixtureInventory=sim.EquippedInventoryEntry & {id:string;identity:FixtureIdentity;durability:number;lit:boolean};
type FixtureAttack=sim.EnemyAttackCommitment & {npcId:bigint;targetIdentity:FixtureIdentity;lastProcessedTick:bigint;
  elevation:number;damageCenti:number;hitIdentities:FixtureIdentity[];spaceId:number;chunkX:number;chunkY:number};
function fixture() {
  const sender:FixtureIdentity={toHexString:()=> 'gear-player',isEqual:(other:unknown)=>other===sender};
  const clock={authorityTick:100n};
  const input=table({direction:'idle',sprinting:false,settleDirection:'idle',updatedAtMicros:0n,sequence:0n,runStartClientTick:0n,
    settleSteps:0,settledSequence:0n,pendingSequence:0n,creditStartedAtMicros:0n,creditedSteps:0n,appliedSteps:0n});
  const inventory=new Map<number,FixtureInventory>([
    [0,{id:'gear-player:0',identity:sender,slot:0,itemKind:'axe',quantity:1,durability:100,lit:true}],
    [33,{id:'gear-player:33',identity:sender,slot:33,itemKind:'hearth_rare_bow',quantity:1,durability:100,lit:true}],
    [35,{id:'gear-player:35',identity:sender,slot:35,itemKind:'hearth_rare_shield',quantity:1,durability:0,lit:true}],
    [1,{id:'gear-player:1',identity:sender,slot:1,itemKind:'arrow',quantity:30,durability:0,lit:true}],
  ]);
  const survival=table({selectedSlot:33});
  const bow=table();
  const stats=table({...sim.BASE_ATTRIBUTES,...sim.createFullVitalState(sim.resolveStats(sim.BASE_ATTRIBUTES),100n),lastSwingTick:0n});
  const position=table({identity:sender,x:sim.TILE_SIZE_FIXED*3,y:sim.TILE_SIZE_FIXED*3,facing:'down',spaceId:0,equippedKind:'hearth_rare_shield',equippedLit:true,actionKind:'none',actionStartedTick:0n});
  const protocol=table({identity:sender,version:sim.CURRENT_INVENTORY_PROTOCOL_VERSION});
  const state={run:false,mounted:false,stale:false,projectiles:[] as Record<string,unknown>[],drops:[] as Record<string,unknown>[]};
  const defenseInputs=new Map<string,{connectionId:{toHexString:()=>string};sequence:bigint}>();
  const defenseInputIndex={find:(id:{toHexString:()=>string})=>defenseInputs.get(id.toHexString())??null,
    update:(row:{connectionId:{toHexString:()=>string};sequence:bigint})=>{defenseInputs.set(row.connectionId.toHexString(),row);return row;}};
  const ctx={sender,connectionId:{toHexString:()=> 'connection'},senderAuth:{jwt:{}},timestamp:{microsSinceUnixEpoch:0n},db:{
    membership:table({}),player_seat:table(),player_defense_input:{connectionId:defenseInputIndex,insert:defenseInputIndex.update},player_combat_state:table(),player_jump_state:table(),inventory_protocol:protocol,player_survival:survival,player_position:position,
    player_stats:stats,player_input:input,bow_charge:bow,world_clock:table(clock),world_seed:table({seed:123}),
    inventory_slot:{id:{find:(id:string)=>inventory.get(Number(id.split(':')[1]))??null,
      update:(row:FixtureInventory)=>{inventory.set(row.slot,row);return row;}},
      by_identity:{filter:()=>inventory.values()}},
    world_projectile:{insert:(row:Record<string,unknown>)=>{const next={...row,id:1n};state.projectiles.push(next);return next;}},
    projectile_charge:table(),enemy_attack:table<FixtureAttack>(),
    rogue_run_member:{by_run:{filter:()=>[{identity:sender}]}},
  }};
  const modifiers=()=>sim.compileEquipmentLoadout({registry:sim.bootstrapContentRegistry(),inventory:[...inventory.values()],
    selectedSlot:survival.identity.find()!.selectedSlot,trainedRanks:{},bowDrawn:bow.identity.find()!==null}).modifiers;
  const containers=()=>({equipment:{slots:Array.from({length:10},(_,index)=>inventory.get(30+index)??null)},
    hotbar:{slots:Array.from({length:10},(_,index)=>inventory.get(index)??null)}});
  const names=['activitySuppressesVigourRegen','advancePlayerStats','previewPlayerStats','resolvedStatsForRow','vitalStateFromRow',
    'clearBowCharge','updateEquippedForIdentity','writeInventorySlot','playerCanAffordSprintStep','spendToolVigour','validateToolVigourSpend',
    'authorityBowChargeMs','applyBowBeginLifecycle','applyBowCancelLifecycle','applyBowFireLifecycle','selectHotbar','dropSelected',
    'projectilePlayerTarget','combatElevationAt','attackCommitmentFromRow','stepCommittedRogueAttack',
    'setInput','requireCombatActionReady','combatRecovery','hasActiveShield','combatDefense','stepPlayerDefense','resolveDefendedPlayerHit',
    'requireInventoryProtocol','requirePersistentInventoryAvailable','loadOpenMenuInventory','inventoryCursorClick','inventoryCursorQuickCraft',
    'inventoryCursorPickupAll','inventoryCursorSwapHotbar','sortMenuContainer','closeCrafting'];
  const api=authority(names,{
    ...sim,settleMovementRun,queueMovementAcknowledgement,toolSpendResult,sprintIntentSuppressesVigourRegen,nextActionStartedTick,itemDropPosition,SenderError:Error,requireAuthorizedSender:()=>{},ensurePlayerStats:()=>stats.identity.find(),
    activePlayerModifiers:modifiers,contentRegistry:sim.bootstrapContentRegistry,
    activeCharacterCombatBalance:()=>sim.runtimeCharacterCombatBalance(sim.bootstrapContentRegistry()),playerSkillRanks:()=>({}),
    collisionForSpace:()=>({width:32,height:32,blocked:Array(1024).fill(false),elevations:Array(1024).fill(0)}),
    inputIsStale:()=>state.stale,mountedNpcFor:()=>state.mounted?{}:null,cancelFishingCastFor:()=>{},
    loadPlayerInventory:()=>({containers:containers()}),storedLit:(_kind:string,lit:boolean)=>lit,
    handsOccupiedFor:()=>false,requireUsableTool:()=>{},spendPlayerHunger:()=>{},recordPlayerStatistic:()=>{},
    rogueRunForIdentity:()=>state.run?{id:1n,phase:'combat',spaceId:0}:null,
    updateWorldNpc:()=>{},finishRogueRun:()=>{state.run=false;},activeItemContainerContent:()=>({maxStackFor:(kind:string)=>sim.runtimeMaxStack(sim.bootstrapContentRegistry(),kind),
      hasTag:(kind:string,tag:string)=>sim.runtimeItemHasTag(sim.bootstrapContentRegistry(),kind,tag)}),
    playerInventoryCursor:()=>null,parseDirection:(value:string)=>value,isUniqueQuestItemKind:()=>false,
    dropWorldItemStack:(_ctx:unknown,drop:Record<string,unknown>)=>state.drops.push(drop),
    chunkAt:()=>0,wearInventoryTool:()=>{},
  });
  return {ctx,api,state,inventory,stats,bow,position,survival,input,clock,protocol,modifiers};
}

describe('equipment authority transitions',()=>{
  it('clamps off-hand reserves when drawing and does not refill them on cancellation',()=>{
    const f=fixture();
    const maximum=sim.resolveStats(sim.BASE_ATTRIBUTES,f.modifiers()).maxVigourCenti;
    f.stats.identity.update({...f.stats.identity.find()!,vigourCenti:maximum});
    f.api.applyBowBeginLifecycle(f.ctx);
    const during=f.stats.identity.find()!.vigourCenti;
    expect(during).toBeLessThan(maximum);
    expect(f.position.identity.find()!.equippedKind).toBe('hearth_rare_bow');
    f.clock.authorityTick+=20n;
    f.api.applyBowCancelLifecycle(f.ctx,500);
    expect(f.bow.identity.find()).toBeNull();
    expect(f.stats.identity.find()!.vigourCenti).toBeLessThan(during);
    expect(f.position.identity.find()!.equippedKind).toBe('hearth_rare_shield');
  });
  it.each(['bow','sprint'] as const)('repeated same-slot selection cannot regenerate Vigour during %s',activity=>{
    const f=fixture();
    f.stats.identity.update({...f.stats.identity.find()!,vigourCenti:2000});
    if(activity==='bow')f.api.applyBowBeginLifecycle(f.ctx);
    else f.input.identity.update({...f.input.identity.find()!,direction:'right',sprinting:true});
    const initial=f.stats.identity.find()!.vigourCenti;
    for(let tick=101n;tick<120n;tick++){
      f.clock.authorityTick=tick;f.api.selectHotbar(f.ctx,{slot:33});
      expect(f.stats.identity.find()!.vigourCenti).toBe(initial);
    }
  });
  it('switching or disconnect cleanup clears a draw and restores the equipped light immediately',()=>{
    for(const mode of ['switch','disconnect']){
      const f=fixture();f.inventory.set(35,{...f.inventory.get(35)!,itemKind:'torch',lit:true});
      f.api.applyBowBeginLifecycle(f.ctx);f.clock.authorityTick+=20n;
      const before=f.stats.identity.find()!.vigourCenti;
      if(mode==='switch')f.api.selectHotbar(f.ctx,{slot:0});
      else {f.api.clearBowCharge(f.ctx,f.ctx.sender);f.api.updateEquippedForIdentity(f.ctx,f.ctx.sender);}
      expect(f.bow.identity.find()).toBeNull();
      expect(f.stats.identity.find()!.vigourCenti).toBeLessThan(before);
      expect(f.stats.identity.find()!.lastSwingTick).toBe(f.clock.authorityTick);
      expect(f.position.identity.find()).toMatchObject({equippedKind:'torch',equippedLit:true});
    }
  });
  it('cancel cost is authoritative, paid once, and still permits an exhausted player to cancel',()=>{
    const f=fixture(); f.api.applyBowBeginLifecycle(f.ctx); f.clock.authorityTick+=20n;
    const before=f.stats.identity.find()!.vigourCenti;
    const balance=sim.runtimeVigourDefinition(sim.bootstrapContentRegistry(),'hearth_rare_bow')!;
    f.api.applyBowCancelLifecycle(f.ctx,0);
    expect(f.stats.identity.find()!.vigourCenti).toBe(before-sim.bowChargeVigourCostCenti(1000,balance.costCenti));
    const settled=f.stats.identity.find(); f.api.clearBowCharge(f.ctx,f.ctx.sender);
    expect(f.stats.identity.find()).toEqual(settled);
    f.clock.authorityTick+=100n; f.api.applyBowBeginLifecycle(f.ctx);
    f.stats.identity.update({...f.stats.identity.find()!,vigourCenti:1});
    expect(()=>f.api.applyBowCancelLifecycle(f.ctx,0)).not.toThrow();
    expect(f.stats.identity.find()!.vigourCenti).toBe(0);
    expect(f.bow.identity.find()).toBeNull();
  });
  it('dropping a drawn Main Hand preserves exact custody and restores the off-hand',()=>{
    const f=fixture();f.api.applyBowBeginLifecycle(f.ctx);f.clock.authorityTick+=20n;
    f.api.dropSelected(f.ctx);
    expect(f.bow.identity.find()).toBeNull();
    expect(f.inventory.get(33)).toMatchObject({itemKind:'empty',quantity:0});
    expect(f.state.drops).toHaveLength(1);
    expect(f.state.drops[0]).toMatchObject({itemKind:'hearth_rare_bow',quantity:1,durability:100,lit:true});
    expect(f.position.identity.find()).toMatchObject({equippedKind:'hearth_rare_shield',actionKind:'drop'});
  });
  it('freezes the launch-time damage and restores off-hand presentation on release',()=>{
    const f=fixture();
    f.api.applyBowBeginLifecycle(f.ctx);f.clock.authorityTick+=20n;
    const modifiers=f.modifiers();
    const attributes=sim.resolveStats(sim.BASE_ATTRIBUTES,modifiers).attributes;
    const expected=sim.resolveCombatDamage({attackKind:'ranged',weaponBaseCenti:1750,scalingAttribute:attributes.dex,
      armorCenti:0,armorPctBasisPoints:0,attackerModifiers:modifiers,
      seedParts:[123,'gear-player',f.clock.authorityTick,1n,'hearth_rare_bow']});
    f.api.applyBowFireLifecycle(f.ctx,64,0,500);
    expect(f.ctx.db.projectile_charge.id.find()).toMatchObject({
      damageCenti:sim.bowChargeScaledDamageCenti(expected.damageCenti,500),critical:expected.critical,
    });
    expect(f.position.identity.find()!.equippedKind).toBe('hearth_rare_shield');
    expect(f.bow.identity.find()).toBeNull();
    expect(f.inventory.get(1)!.quantity).toBe(29);
  });
  it.each([
    ['inventoryCursorClick',{container:'equipment',index:9,button:'left'}],
    ['inventoryCursorQuickCraft',{targetContainers:['equipment'],targetIndexes:[9],mode:'one_each'}],
    ['inventoryCursorPickupAll',{containerOrder:['equipment','backpack']}],
    ['inventoryCursorSwapHotbar',{container:'equipment',index:9,hotbarIndex:0}],
    ['sortMenuContainer',{container:'backpack'}],['closeCrafting',{}],
  ])('rejects %s before any inventory access for a Delve run or obsolete client', (name,request)=>{
    const f=fixture();const before=[...f.inventory.values()];f.state.run=true;
    expect(()=>f.api[name as string](f.ctx,request)).toThrow('descent_inventory_locked');
    f.state.run=false;f.protocol.connectionId.delete();
    expect(()=>f.api[name as string](f.ctx,request)).toThrow('inventory_client_update_required');
    expect([...f.inventory.values()]).toEqual(before);
  });
});


describe('committed Delve attacks through production authority',()=>{
  function setup(pattern:sim.EnemyAttackPattern='bolt') {
    const f=fixture();f.state.run=true;
    const unit=sim.TILE_SIZE_FIXED;
    f.position.identity.update({...f.position.identity.find()!,x:unit*3,y:unit*3});
    const npc={id:1n,x:unit*2,y:unit*3,spaceId:0,health:100,moving:false,wanderDirection:'tell'};
    const commitment=sim.commitEnemyAttack(pattern,100n,100n,npc,{x:unit*3,y:unit*3},unit*6);
    f.ctx.db.enemy_attack.insert({...commitment,npcId:1n,targetIdentity:f.ctx.sender,lastProcessedTick:100n,
      elevation:0,damageCenti:1000,hitIdentities:[],spaceId:0,chunkX:0,chunkY:0});
    const collision={width:32,height:32,blocked:Array(1024).fill(false),elevations:Array(1024).fill(0),
      obstacles:[] as {left:number;right:number;top:number;bottom:number}[]};
    const step=(tick:bigint)=>{
      f.clock.authorityTick=tick;
      const attack=f.ctx.db.enemy_attack.npcId.find();
      return attack===null?false:f.api.stepCommittedRogueAttack(f.ctx,npc,attack,tick,collision);
    };
    return {...f,npc,collision,step};
  }
  it('has a visible tell, damages once per victim across a multi-tick sweep, then recovers',()=>{
    const f=setup();const initial=f.stats.identity.find()!.healthCenti;
    for(let tick=101n;tick<114n;tick++){f.step(tick);expect(f.stats.identity.find()!.healthCenti).toBe(initial);}
    for(let tick=114n;tick<129n;tick++)f.step(tick);
    const hits=f.ctx.db.enemy_attack.npcId.find()!.hitIdentities;
    expect(hits).toHaveLength(1);
    expect(f.stats.identity.find()!.healthCenti).toBeLessThan(initial);
    for(let tick=129n;tick<141n;tick++)f.step(tick);
    expect(f.ctx.db.enemy_attack.npcId.find()!.hitIdentities).toHaveLength(1);
    f.step(141n);expect(f.ctx.db.enemy_attack.npcId.find()).toBeNull();
  });
  it('does not wrap the pulse radius around a thin side wall',()=>{
    const f=setup('pulse'),unit=sim.TILE_SIZE_FIXED;
    f.position.identity.update({...f.position.identity.find()!,x:unit*3.75});
    f.collision.obstacles.push({left:unit*3.3,right:unit*3.4,top:unit*2.5,bottom:unit*3.5});
    const initial=f.stats.identity.find()!.healthCenti;
    for(let tick=101n;tick<=114n;tick++)f.step(tick);
    expect(f.stats.identity.find()!.healthCenti).toBe(initial);
  });
  it.each(['sidestep','wall','elevation','stale'] as const)('does not hit after %s invalidates a commitment',mode=>{
    const f=setup('pulse');const initial=f.stats.identity.find()!.healthCenti;
    if(mode==='sidestep')f.position.identity.update({...f.position.identity.find()!,y:sim.TILE_SIZE_FIXED*5});
    if(mode==='wall')f.collision.blocked[3*32+3]=true;
    if(mode==='elevation')f.collision.elevations[3*32+3]=1;
    if(mode==='stale')f.step(114n);
    else for(let tick=101n;tick<=114n;tick++)f.step(tick);
    expect(f.stats.identity.find()!.healthCenti).toBe(initial);
    if(mode==='stale')expect(f.ctx.db.enemy_attack.npcId.find()).toBeNull();
  });
});


describe('authoritative player defenses',()=>{
  const collision={width:32,height:32,blocked:Array(1024).fill(false),elevations:Array(1024).fill(0),
    obstacles:[] as {left:number;right:number;top:number;bottom:number}[]};
  function request(f:ReturnType<typeof fixture>, action:string,sequence=1n,aimX=1,aimY=0) {
    f.api.combatDefense(f.ctx,{action,sequence,aimX,aimY});
  }
  it('pays one committed dodge, moves exactly six steps, and retains its recovery',()=>{
    const f=fixture(),before=f.stats.identity.find()!.vigourCenti,origin=f.position.identity.find()!.x;
    request(f,'dodge'); request(f,'dodge');
    expect(f.stats.identity.find()!.vigourCenti).toBe(before-sim.DODGE.costCenti);
    for(let tick=101n;tick<=106n;tick++) {
      f.clock.authorityTick=tick;
      const next=f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),tick,collision);
      expect(next).not.toBeNull(); f.position.identity.update(next);
      expect(next.x).toBe(origin+Math.round(Number(tick-100n)/6*sim.TILE_SIZE_FIXED*1.5));
    }
    const target=f.api.projectilePlayerTarget(f.ctx,f.ctx.sender,0);
    expect(target).toMatchObject(sim.playerHitboxBounds(f.position.identity.find()!));
    expect(target.left).toBeGreaterThan(origin);
    f.clock.authorityTick=107n;
    expect(f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),107n,collision)).toBeNull();
    expect(()=>request(f,'dodge',2n)).toThrow('combat_recovery');
    expect(()=>f.api.applyBowBeginLifecycle(f.ctx)).toThrow('combat_recovery');
    f.clock.authorityTick=115n; expect(()=>request(f,'dodge',2n)).not.toThrow();
  });
  it.each(['wall','plane','missed_tick'])('cancels dodge motion on %s without refund or cooldown removal',reason=>{
    const f=fixture(); request(f,'dodge');
    const origin=f.position.identity.find()!;
    const blocked={...collision,obstacles:[...collision.obstacles],elevations:[...collision.elevations]};
    if(reason==='wall')blocked.obstacles.push({left:origin.x+10,right:origin.x+20,top:origin.y-1000,bottom:origin.y+1000});
    if(reason==='plane')blocked.elevations[3*32+3]=1;
    const tick=reason==='missed_tick'?103n:101n;
    const next=f.api.stepPlayerDefense(f.ctx,origin,tick,blocked);
    expect(next?.x??origin.x).toBe(origin.x);
    expect(f.ctx.db.player_combat_state.identity.find()).toMatchObject({kind:'recovery',readyTick:115n});
  });
  it('uses a dedicated guard lease and only the owning connection can release it',()=>{
    const f=fixture();request(f,'block');
    f.ctx.connectionId={toHexString:()=> 'another-tab'};
    request(f,'release',2n);expect(f.ctx.db.player_combat_state.identity.find()!.kind).toBe('block');
    f.ctx.connectionId={toHexString:()=> 'connection'};
    f.ctx.timestamp.microsSinceUnixEpoch=800_000n;
    expect(()=>request(f,'block',2n)).toThrow('defense_lease_expired');
    f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),101n,collision);
    expect(f.ctx.db.player_combat_state.identity.find()!.kind).toBe('recovery');
  });
  it('drains held guard, pays each frontal hit from latest Vigour, then breaks',()=>{
    const f=fixture();request(f,'block');f.clock.authorityTick=101n;
    const before=f.stats.identity.find()!.vigourCenti;
    f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),101n,collision);
    expect(f.stats.identity.find()!.vigourCenti).toBe(before-sim.BLOCK.drainCentiPerTick);
    f.stats.identity.update({...f.stats.identity.find()!,vigourCenti:2000});
    const player=f.position.identity.find()!,source={x:player.x+100,y:player.y};
    const first=f.api.resolveDefendedPlayerHit(f.ctx,f.ctx.sender,101n,source,1000);
    expect(first.vigourCenti).toBe(800);
    f.stats.identity.update({...f.stats.identity.find()!,vigourCenti:first.vigourCenti});
    const second=f.api.resolveDefendedPlayerHit(f.ctx,f.ctx.sender,101n,source,1000);
    expect(second.vigourCenti).toBe(0);expect(second.damageCenti).toBeGreaterThan(first.damageCenti);
    expect(f.ctx.db.player_combat_state.identity.find()).toMatchObject({kind:'recovery',readyTick:113n});
  });
  it('keeps per-connection replay protection after another tab controls the idle character',()=>{
    const f=fixture();request(f,'block',1n);request(f,'release',2n);
    f.ctx.connectionId={toHexString:()=> 'second'};request(f,'block',1n);request(f,'release',2n);
    f.ctx.connectionId={toHexString:()=> 'connection'};request(f,'dodge',1n);
    expect(f.ctx.db.player_combat_state.identity.find()!.kind).toBe('recovery');
  });
  it('cannot bank walking or sprint credit while defense owns movement',()=>{
    const f=fixture();request(f,'dodge');
    f.input.identity.update({...f.input.identity.find()!,direction:'right',sprinting:true,settleDirection:'right!',settleSteps:6});
    f.ctx.timestamp.microsSinceUnixEpoch=100_000n;
    f.api.setInput(f.ctx,{direction:'left',sprinting:true,sequence:1n,clientTick:20n});
    expect(f.input.identity.find()).toMatchObject({settleDirection:'idle',settleSteps:0,runStartClientTick:20n,
      creditedSteps:0n,creditStartedAtMicros:100_000n,settledSequence:1n});
  });
  it('does not drain twice on one tick and turns the avatar toward its frozen guard',()=>{
    const f=fixture();request(f,'block');f.clock.authorityTick=101n;
    const next=f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),101n,collision);
    expect(next.facing).toBe('right');f.position.identity.update(next);
    const after=f.stats.identity.find()!.vigourCenti;
    f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),101n,collision);
    expect(f.stats.identity.find()!.vigourCenti).toBe(after);
    f.state.mounted=true;f.api.stepPlayerDefense(f.ctx,f.position.identity.find(),102n,collision);
    expect(f.ctx.db.player_combat_state.identity.find()!.kind).toBe('recovery');
  });
  it('only blocks the front and only dodges the first four committed ticks',()=>{
    const f=fixture();request(f,'block');const p=f.position.identity.find()!;
    const rear=f.api.resolveDefendedPlayerHit(f.ctx,f.ctx.sender,101n,{x:p.x-100,y:p.y},1000);
    expect(rear.vigourCenti).toBe(f.stats.identity.find()!.vigourCenti);
    request(f,'release',2n);request(f,'dodge',3n);
    for(let tick=101n;tick<105n;tick++)expect(f.api.resolveDefendedPlayerHit(f.ctx,f.ctx.sender,tick,p,1000).damageCenti).toBe(0);
    expect(f.api.resolveDefendedPlayerHit(f.ctx,f.ctx.sender,105n,p,1000).damageCenti).toBeGreaterThan(0);
  });
});
