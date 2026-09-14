import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const registry=sim.bootstrapContentRegistry();
const declaration=(name:string)=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(source);
function fixture(){
  const definition=sim.runtimeQuestDefinition(registry,'hearth_willowharbour_arrival')!;
  const pip=BigInt(registry.npcs.get('npc:willow_harbour_guide')!.runtimeId);
  const identity={toHexString:()=> 'player'},position={identity,spaceId:0,x:207.5*sim.TILE_SIZE_FIXED,y:397.5*sim.TILE_SIZE_FIXED};
  const values:Record<string,bigint>={[`quest_npc_talks:${pip}`]:5n};
  const progress:sim.QuestProgressSource={statistic:(kind,subject)=>values[`${kind}:${subject}`]??0n,itemCount:()=>0};
  const key=(identity:string,quest:string,objective?:string)=>[identity,quest,objective].filter(value=>value!==undefined).join(':');
  const quest={questId:definition.id,state:'active',acceptedTick:100n};
  const baselines=new Map(Object.entries(sim.questAcceptBaselines(definition,progress)).map(([objectiveId,value])=>{
    const id=key('player',definition.id,objectiveId);return [id,{id,objectiveId,value}];
  }));
  const presence=new Map<string,{id:string}>();
  const ctx={sender:identity,db:{player_quest:{id:{find:()=>quest.state==='absent'?null:quest},by_identity:{filter:()=>[quest]}},
    player_quest_baseline:{id:{find:(id:string)=>baselines.get(id)??null,update:(row:{id:string;objectiveId:string;value:bigint})=>baselines.set(row.id,row)}},
    player_position:{identity:{find:()=>position}},player_quest_reach_presence:{id:{find:(id:string)=>presence.get(id)??null,
      insert:undefined,delete:(id:string)=>presence.delete(id)},insert:(row:{id:string})=>presence.set(row.id,row)}}};
  const refresh=vi.fn();
  const dependencies={...sim,contentRegistry:()=>registry,playerQuestId:key,playerQuestBaselineId:key,
    questProgressSourceFor:()=>progress,refreshPlayerQuests:refresh,
    recordPlayerStatistic:(_ctx:unknown,_identity:unknown,kind:string,amount:bigint,_tick:bigint,subject:string)=>{
      const id=`${kind}:${subject}`;values[id]=(values[id]??0n)+amount;
    }};
  const code=ts.transpile(declaration('refreshPlayerQuestLocations')+'\n'+declaration('creditQuestAcceptanceAtNpc')+';return creditQuestAcceptanceAtNpc;',{target:ts.ScriptTarget.ES2022});
  const credit=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown,id:string,npc:bigint,tick:bigint)=>void;
  return {ctx,dependencies,rawCredit:credit,pip,quest,position,values,refresh,baselines,definition,progress,
    credit:(npc=pip,tick=100n)=>credit(ctx,definition.id,npc,tick),
    complete:()=>sim.questIsComplete(definition,Object.fromEntries([...baselines.values()].map(row=>[row.objectiveId,row.value])),progress)};
}
describe('admitted NPC quest acceptance',()=>{
  it('credits current Pip conversation and current harbour position without replaying lifetime talks',()=>{
    const f=fixture();expect(f.complete()).toBe(false);f.credit();expect(f.complete()).toBe(true);
    expect(f.values[`quest_npc_talks:${f.pip}`]).toBe(5n);
    expect(f.values[`quest_locations_reached:${f.definition.id}:reach_harbour`]).toBe(1n);
    const before=[...f.baselines.values()];f.credit();expect([...f.baselines.values()]).toEqual(before);
    expect(f.values[`quest_locations_reached:${f.definition.id}:reach_harbour`]).toBe(1n);
  });
  it('does not credit Pip history when acceptance happens at Fin on Orchard',()=>{
    const f=fixture();f.position.x=409*sim.TILE_SIZE_FIXED;f.position.y=317*sim.TILE_SIZE_FIXED;
    f.credit(7n);expect(f.complete()).toBe(false);
    expect(f.values[`quest_locations_reached:${f.definition.id}:reach_harbour`]).toBeUndefined();
  });
  it('does not alter an earlier or finished acceptance',()=>{
    const f=fixture();f.credit(f.pip,101n);expect(f.refresh).not.toHaveBeenCalled();
    f.quest.state='turned_in';f.credit();expect(f.refresh).not.toHaveBeenCalled();
    expect(f.complete()).toBe(false);
  });
});

function dialogueFixture(){
  const f=fixture();f.quest.state='absent';
  const active={npcId:f.pip,dialogueId:'willow_harbour_guide',nodeId:'hearth_arrival_request'};
  const effect=vi.fn(()=>{f.quest.state='active';f.quest.acceptedTick=100n;});
  const credit=vi.fn(f.rawCredit);
  const update=vi.fn((row:typeof active)=>Object.assign(active,row));
  const ctx={...f.ctx,senderAuth:{jwt:null},db:{...f.ctx.db,
    membership:{identity:{find:()=>null}},world_clock:{id:{find:()=>({authorityTick:100n})}},
    active_dialogue:{identity:{update,delete:vi.fn()}}}};
  const admission=vi.fn(()=>({active}));
  const dependencies={...f.dependencies,SenderError:Error,requireAuthorizedSender:vi.fn(),
    activeMerchantSession:admission,raiseDialogueChoiceEvent:effect,creditQuestAcceptanceAtNpc:credit};
  const statement=source.statements.find(node=>ts.isVariableStatement(node)&&
    node.declarationList.declarations.some(item=>item.name.getText(source)==='chooseDialogueOption')) as ts.VariableStatement;
  const initializer=statement.declarationList.declarations[0]!.initializer as ts.CallExpression;
  const callback=initializer.arguments[1]!.getText(source);
  const code=ts.transpile(declaration('questRequirementMatches')+';return ('+callback+');',{target:ts.ScriptTarget.ES2022});
  const choose=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown,args:{choiceId:string})=>void;
  return {...f,active,effect,credit,update,admission,choose:(choiceId:string)=>choose(ctx,{choiceId})};
}
describe('actual chooseDialogueOption acceptance caller with database and lifecycle boundaries faked',()=>{
  it('applies the admitted Accept effect before crediting the current conversation and location',()=>{
    const f=dialogueFixture();f.choose('accept');
    expect(f.complete()).toBe(true);expect(f.active.nodeId).toBe('hearth_arrival_accepted');
    expect(f.effect).toHaveBeenCalledOnce();expect(f.credit).toHaveBeenCalledOnce();
    expect(f.effect.mock.invocationCallOrder[0]!).toBeLessThan(f.credit.mock.invocationCallOrder[0]!);
    expect(f.credit.mock.invocationCallOrder[0]!).toBeLessThan(f.update.mock.invocationCallOrder[0]!);
    expect(f.values[`quest_npc_talks:${f.pip}`]).toBe(5n);
    f.active.nodeId='hearth_arrival_request';
    expect(()=>f.choose('accept')).toThrow('dialogue_choice_unavailable');
    expect(f.credit).toHaveBeenCalledOnce();
  });
  it('rejects forged and unavailable choices before lifecycle effects or acceptance credit',()=>{
    const f=dialogueFixture();expect(()=>f.choose('forged_accept')).toThrow('dialogue_choice_not_found');
    f.quest.state='turned_in';expect(()=>f.choose('accept')).toThrow('dialogue_choice_unavailable');
    expect(f.effect).not.toHaveBeenCalled();expect(f.credit).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();
  });
  it('cannot grant acceptance credit when live NPC admission fails',()=>{
    const f=dialogueFixture();f.admission.mockImplementation(()=>{throw new Error('merchant_out_of_range');});
    expect(()=>f.choose('accept')).toThrow('merchant_out_of_range');
    expect(f.effect).not.toHaveBeenCalled();expect(f.credit).not.toHaveBeenCalled();
  });
});
