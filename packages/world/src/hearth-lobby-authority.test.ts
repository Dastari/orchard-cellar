import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function helper(name:string,dependencies:Record<string,unknown>){
  const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  if(!fn)throw new Error(`missing ${name}`);
  const position=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='combatTargetPositionAtTile')!;
  return new Function(...Object.keys(dependencies),ts.transpileModule(`${position.getText(source)}\n${fn.getText(source)}\nreturn ${name};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)(...Object.values(dependencies));
}
describe('authored lobby authority',()=>{
  it('provisions the real practice target once only when lobby content is active',()=>{
    const rows=new Map<bigint,Record<string,unknown>>();let active=false;
    const ctx={db:{world_clock:{id:{find:()=>({authorityTick:50n})}},world_combat_target:{id:{find:(id:bigint)=>rows.get(id)??null},insert:(row:Record<string,unknown>)=>{rows.set(row.id as bigint,row);}}}};
    const registry=sim.bootstrapContentRegistry();
    const ensure=helper('ensureArcheryTargets',{...sim,SenderError:Error,
      contentRegistry:()=>registry,activeCombatTargetDefinition:(_ctx:unknown,row:{kind:string;definitionId?:string})=>sim.runtimeObjectDefinition(registry,row),
      activeHearthLobbyDefinition:()=>active?sim.activeHearthLobbyDefinition(registry):null,
      chunkAt:(value:number)=>Math.floor(value/(16*sim.TILE_SIZE_FIXED))});
    ensure(ctx);expect(rows.size).toBe(3);expect(rows.has(sim.HEARTH_LOBBY_PRACTICE_TARGET.id)).toBe(false);
    active=true;ensure(ctx);expect(rows.size).toBe(4);
    const target=rows.get(sim.HEARTH_LOBBY_PRACTICE_TARGET.id)!;
    expect(target).toMatchObject({spaceId:sim.HEARTH_LOBBY_SPACE_ID,kind:'archery_target',definitionId:'object:archery_target',healthCenti:10000,regenTick:50n,
      x:20.5*sim.TILE_SIZE_FIXED,y:10*sim.TILE_SIZE_FIXED});
    target.healthCenti=5000;ensure(ctx);expect(rows.size).toBe(4);expect(rows.get(sim.HEARTH_LOBBY_PRACTICE_TARGET.id)?.healthCenti).toBe(5000);
    const retired=[...rows.values()].find(row=>row.id!==sim.HEARTH_LOBBY_PRACTICE_TARGET.id)!;
    retired.definitionId='object:retired_target';retired.healthCenti=4321;
    ensure(ctx);expect(retired.healthCenti).toBe(4321);expect(retired.definitionId).toBe('object:retired_target');
    rows.delete(4294966900n);
    target.spaceId=0;expect(()=>ensure(ctx)).toThrow('hearth_lobby_target_conflict');
    expect(rows.has(4294966900n)).toBe(false);
    expect(rows.get(sim.HEARTH_LOBBY_PRACTICE_TARGET.id)).toBe(target);expect(target.spaceId).toBe(0);
  });
  it('materializes renamed field targets and rejects incomplete claims before any insert',()=>{
    const rows=new Map<bigint,Record<string,unknown>>();
    const base=sim.bootstrapContentRegistry();let registry=base;
    const ctx={db:{world_clock:{id:{find:()=>({authorityTick:75n})}},world_combat_target:{
      id:{find:(id:bigint)=>rows.get(id)??null},insert:(row:Record<string,unknown>)=>{rows.set(row.id as bigint,row);},
    }}};
    const ensure=helper('ensureArcheryTargets',{...sim,SenderError:Error,
      contentRegistry:()=>registry,activeCombatTargetDefinition:(_ctx:unknown,row:{kind:string;definitionId?:string})=>sim.runtimeObjectDefinition(registry,row),
      activeHearthLobbyDefinition:()=>null,chunkAt:(value:number)=>Math.floor(value/(16*sim.TILE_SIZE_FIXED))});
    const target=base.objects.get('object:archery_target')!;
    const renamed=sim.parseObjectDefinition({...target,id:'object:moon_target'});
    const objects=new Map(base.objects);objects.delete(target.id);objects.set(renamed.id,renamed);
    registry={...base,objects};ensure(ctx);
    expect([...rows.values()]).toHaveLength(3);
    expect([...rows.values()].every(row=>row.kind==='moon_target'&&row.definitionId==='object:moon_target')).toBe(true);

    rows.clear();objects.set(renamed.id,{...renamed,retired:true});
    expect(()=>ensure(ctx)).toThrow('archery_target_content_invalid');expect(rows.size).toBe(0);
    objects.set(renamed.id,renamed);
    objects.set('object:duplicate_target',sim.parseObjectDefinition({...renamed,id:'object:duplicate_target'}));
    expect(()=>ensure(ctx)).toThrow('archery_target_content_invalid');expect(rows.size).toBe(0);
  });
  it('rejects carrying the fixed lobby target in actual effect preflight',()=>{
    let body:ts.Statement|undefined;
    const visit=(node:ts.Node)=>{
      if(ts.isIfStatement(node)&&node.expression.getText(source)==="kind === 'carry'")body??=node.thenStatement;
      ts.forEachChild(node,visit);
    };visit(source);if(!body)throw new Error('carry preflight missing');
    const bodyText=body.getText(source);
    const run=(id:bigint)=>{
      const dependencies={isAuthoredHearthLobbyPracticeTargetId:sim.isAuthoredHearthLobbyPracticeTargetId,
        SenderError:Error,
        ctx:{sender:'player'},effect:{carry:{}},target:{kind:'combat_target',ref:{id:id.toString()}},
        actorPosition:()=>({}),requireWorldModificationAuthorized:()=>{},mountedNpcFor:()=>null,
        handsOccupiedFor:()=>false,targetCombat:()=>({id,kind:'archery_target',definitionId:'object:archery_target'}),
        contentRegistry:()=>sim.bootstrapContentRegistry(),runtimeObjectCarry:sim.runtimeObjectCarry,
        combatTargetObjectReference:(row:{kind:string;definitionId:string})=>row};
      return new Function(...Object.keys(dependencies),ts.transpileModule(
        `let plannedTargetIdentityMutation=false;const invoke=()=>${bodyText};invoke();return plannedTargetIdentityMutation;`,
        {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(dependencies));
    };
    expect(()=>run(sim.HEARTH_LOBBY_PRACTICE_TARGET.id)).toThrow('landmark_not_movable');
    expect(run(4294966900n)).toBe(true);
  });
  it('never allocates an authored static space to a homestead or a private run',()=>{
    const dependencies={...sim,SenderError:Error,FIRST_HOMESTEAD_SPACE_ID:65531,DEBUG_SPACE_ID:65534,FIRST_ROGUE_SPACE_ID:50000,LAST_ROGUE_SPACE_ID:50002,
      contentRegistry:()=>({compiled:{spaces:[{spaceId:65532},{spaceId:65533},{spaceId:50000}]}}),
      homesteadForSpace:(_ctx:unknown,id:number)=>id===65531?{}:null,rogueRunForSpace:()=>null};
    expect(()=>helper('nextHomesteadSpaceId',dependencies)({})).toThrow('homestead_capacity_reached');
    expect(helper('nextRogueSpaceId',dependencies)({})).toBe(50001);
  });
  it('keeps the supply frontage clear and inside actual merchant admission reach',()=>{
    const supplier=sim.bootstrapContentRegistry().npcs.get('npc:delve_quartermaster')!;
    const unit=sim.TILE_SIZE_FIXED;
    const npc={x:(supplier.home.tileX+.5)*unit,y:(supplier.home.tileY+.5)*unit};
    const front={x:(sim.HEARTH_LOBBY_POINTS.counter.tileX+.5)*unit,y:(sim.HEARTH_LOBBY_POINTS.counter.tileY+.5)*unit};
    const collision=sim.hearthLobbyCollision(),reachable=helper('npcWithinInteractionReach',sim);
    expect(sim.positionCollides(npc,collision)).toBe(false);
    expect(sim.positionCollides(front,collision)).toBe(false);expect(reachable(front,npc)).toBe(true);
    const nearby={x:front.x+unit/4,y:front.y-unit/4};
    expect(sim.positionCollides(nearby,collision)).toBe(false);expect(reachable(nearby,npc)).toBe(true);
    expect(reachable({...front,y:front.y+unit/4},npc)).toBe(false);
  });
  it('authors the new descent without changing the retired tent or its return portals',()=>{
    const registry=sim.bootstrapContentRegistry();
    const lobby=sim.runtimeSpaceDefinition(registry,sim.HEARTH_LOBBY_SPACE_ID);
    expect(lobby).toMatchObject({sizeTiles:24,generator:'delve_lobby',environment:'underground',weather:false,
      runEntrances:[{id:'cliffside-descent',kind:'roguelike',...sim.HEARTH_LOBBY_POINTS.descent,reachTiles:1.5}]});
    expect(sim.runtimeSpaceDefinition(registry,sim.MARLOW_TENT_SPACE_ID)?.runEntrances).toBeUndefined();
  });
});
