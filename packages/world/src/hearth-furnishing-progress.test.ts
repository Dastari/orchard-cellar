import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import * as sim from '@orchard/sim';
import {resolvePlaceableObject} from './content/object-runtime.js';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const registry=sim.bootstrapContentRegistry();
const fn=(name:string)=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(source);
function fixture(){
  const owner={toHexString:()=> 'owner'},guest={toHexString:()=> 'guest'};
  const home={owner,residenceSpaceId:900};
  let rows=[{id:1n,kind:'furniture_rustic_chair',definitionId:'object:furniture_rustic_chair',tileX:6,tileY:6,stateJson:'{}',open:false,lit:false}];
  const bases=[{id:'b',identity:owner,questId:'hearth_furnish_room',objectiveId:'seat',value:0n}];
  const ownerLookup=vi.fn((identity:typeof owner)=>identity===owner?[home]:[]);
  const spaceLookup=vi.fn((space:number)=>space===900?rows:[]);
  const ctx={sender:owner,db:{homestead:{by_owner:{filter:ownerLookup}},world_placeable:{by_chunk:{filter:spaceLookup}},
    player_quest_baseline:{by_identity:{filter:(identity:typeof owner)=>identity===owner?bases:[]}}}};
  const dependencies={...sim,resolvePlaceableObject,firstIndexRow:(values:unknown[])=>values[0]??null,contentRegistry:()=>registry};
  const node=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(source)==='ownPlayerQuestBaselines')) as ts.VariableStatement;
  const call=node.declarationList.declarations[0]!.initializer as ts.CallExpression;
  const code=ts.transpile(fn('residenceFurnishingFor')+';return {read:residenceFurnishingFor,view:'+call.arguments[2]!.getText(source)+'};',{target:ts.ScriptTarget.ES2022});
  const api=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as {
    read:(ctx:unknown,identity:typeof owner)=>Record<string,number>;view:(ctx:unknown)=>Array<{currentValue?:bigint}>};
  return {ctx,owner,guest,ownerLookup,spaceLookup,api,setRows:(next:typeof rows)=>{rows=next;},rows};
}
describe('actual owner furnishing lookup and private quest view',()=>{
  it('derives current progress from indexed owner residence without depending on viewport or current position',()=>{
    const f=fixture();expect(f.api.view(f.ctx)[0]?.currentValue).toBe(1n);
    expect(f.ownerLookup).toHaveBeenCalledWith(f.owner);expect(f.spaceLookup).toHaveBeenCalledWith(900);
    f.setRows([]);expect(f.api.view(f.ctx)[0]?.currentValue).toBe(0n);
    expect(f.api.read(f.ctx,f.guest)).toEqual({seat:0,table:0,lamp:0,rug:0});
    expect(f.api.view({...f.ctx,sender:f.guest})).toEqual([]);
  });
  it('rejects invalid authored state through the actual object resolver',()=>{
    const f=fixture();f.setRows([{...f.rows[0]!,stateJson:'{"unexpected":true}'}]);
    expect(f.api.view(f.ctx)[0]?.currentValue).toBe(0n);
  });
});
it('actual turn-in rechecks current furnishings and pays only once',()=>{
  const definition=sim.runtimeQuestDefinition(registry,'hearth_furnish_room')!;
  const identity={toHexString:()=> 'owner'};
  let furnishing={seat:1,table:1,lamp:1,rug:0};
  let quest={questId:definition.id,state:'complete',acceptedTick:10n};
  const ctx={sender:identity,db:{player_quest:{by_identity:{filter:()=>[quest]},id:{find:()=>quest,update:(row:typeof quest)=>{quest=row;}}}}};
  const grant=vi.fn(),consume=vi.fn();
  const dependencies={...sim,SenderError:Error,contentRegistry:()=>registry,
    questProgressSourceFor:()=>({statistic:()=>0n,itemCount:()=>0,furnishingCount:(category:keyof typeof furnishing)=>furnishing[category]}),
    questBaselinesFor:()=>({}),playerQuestId:()=> 'quest',raiseSenderBehaviourEvent:vi.fn(),
    grantQuestRewards:grant,removePlayerCarriedItem:consume,recordPlayerStatistic:vi.fn()};
  const code=ts.transpile(fn('refreshPlayerQuests')+'\n'+fn('turnInQuest')+';return turnInQuest;',{target:ts.ScriptTarget.ES2022});
  const turnIn=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown,definition:sim.QuestDefinition,tick:bigint)=>void;
  expect(()=>turnIn(ctx,definition,100n)).toThrow('quest_objectives_incomplete');
  expect(quest.state).toBe('active');expect(grant).not.toHaveBeenCalled();
  furnishing={...furnishing,rug:1};turnIn(ctx,definition,101n);
  expect(quest.state).toBe('turned_in');expect(grant).toHaveBeenCalledExactlyOnceWith(ctx,definition);expect(consume).not.toHaveBeenCalled();
  expect(()=>turnIn(ctx,definition,102n)).toThrow('quest_objectives_incomplete');expect(grant).toHaveBeenCalledOnce();
});
it('refreshes the owner rather than the guest builder',()=>{
  const owner={toHexString:()=> 'owner'},guest={toHexString:()=> 'guest'},refresh=vi.fn();
  const ctx={sender:guest,db:{world_clock:{id:{find:()=>({authorityTick:100n})}}}};
  const dependencies={homesteadForSpace:(_ctx:unknown,space:number)=>space===900?{owner}:null,refreshPlayerQuests:refresh};
  const code=ts.transpile(fn('refreshResidenceFurnishingQuests')+';return refreshResidenceFurnishingQuests;',{target:ts.ScriptTarget.ES2022});
  const run=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown,space:number)=>void;
  run(ctx,900);expect(refresh).toHaveBeenCalledExactlyOnceWith(ctx,owner,100n);
  run(ctx,901);expect(refresh).toHaveBeenCalledOnce();
});
