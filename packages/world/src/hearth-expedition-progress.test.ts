import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {it,expect,vi} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const fn=(name:string)=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(source);
it('actual private view reads only caller equipment and reflects breakage away from any home',()=>{
  const registry=sim.bootstrapContentRegistry(),owner={toHexString:()=> 'owner'},other={toHexString:()=> 'other'};
  const inventory=[{slot:33,itemKind:'hearth_common_sword',quantity:1,durability:250},{slot:39,itemKind:'hearth_common_body',quantity:1,durability:0}];
  const lookup=vi.fn((identity:typeof owner)=>identity===owner?inventory:[]);
  const ctx={sender:owner,db:{inventory_slot:{by_identity:{filter:lookup}},player_quest_baseline:{by_identity:{filter:(identity:typeof owner)=>identity===owner?
    ['weapon','body'].map(objectiveId=>({id:objectiveId,questId:'hearth_prepare_expedition',objectiveId,value:0n})):[]}}}};
  const declaration=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(source)==='ownPlayerQuestBaselines')) as ts.VariableStatement;
  const call=declaration.declarationList.declarations[0]!.initializer as ts.CallExpression;
  const dependencies={...sim,contentRegistry:()=>registry,residenceFurnishingFor:()=>{throw new Error('unexpected home scan');}};
  const code=ts.transpile(fn('expeditionPreparationFor')+';return '+call.arguments[2]!.getText(source)+';',{target:ts.ScriptTarget.ES2022});
  const view=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown)=>Array<{currentValue?:bigint}>;
  expect(view(ctx).map(row=>row.currentValue)).toEqual([1n,1n]);expect(lookup).toHaveBeenCalledExactlyOnceWith(owner);
  inventory[0]!.durability=0;expect(view(ctx).map(row=>row.currentValue)).toEqual([0n,1n]);
  expect(view({...ctx,sender:other})).toEqual([]);
});
it('actual delivery consumes exactly two basalt, including cursor custody, and cannot pay twice',()=>{
  const registry=sim.bootstrapContentRegistry(),definition=sim.runtimeQuestDefinition(registry,'hearth_return_basalt')!;
  const owner={toHexString:()=> 'owner'};
  let quest={questId:definition.id,state:'complete',acceptedTick:1n};
  const inventory=[{slot:0,itemKind:'basalt',quantity:1,durability:0,lit:true},{slot:1,itemKind:'stone',quantity:4,durability:0,lit:true}];
  let cursor:{itemKind:string;quantity:number}|null={itemKind:'basalt',quantity:2};
  const ctx={sender:owner,db:{
    player_quest:{by_identity:{filter:()=>[quest]},id:{find:()=>quest,update:(next:typeof quest)=>{quest=next;}}},
    inventory_slot:{by_identity:{filter:()=>inventory}},inventory_cursor:{identity:{find:()=>cursor,delete:()=>{cursor=null;},update:(next:NonNullable<typeof cursor>)=>{cursor=next;}}},
  }};
  const grant=vi.fn();
  const dependencies={...sim,SenderError:Error,contentRegistry:()=>registry,playerQuestId:()=> 'quest',questBaselinesFor:()=>({}),
    questProgressSourceFor:()=>({statistic:()=>0n,itemCount:(kind:string)=>inventory.filter(row=>row.itemKind===kind).reduce((sum,row)=>sum+row.quantity,0)+(cursor?.itemKind===kind?cursor.quantity:0)}),
    raiseSenderBehaviourEvent:vi.fn(),recordPlayerStatistic:vi.fn(),grantQuestRewards:grant,updateEquippedForIdentity:vi.fn(),
    writeInventorySlot:(_ctx:unknown,row:typeof inventory[number])=>{inventory[inventory.findIndex(old=>old.slot===row.slot)]=row;}};
  const code=ts.transpile(['refreshPlayerQuests','removePlayerCarriedItem','turnInQuest'].map(fn).join('\n')+';return turnInQuest;',{target:ts.ScriptTarget.ES2022});
  const turnIn=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown,definition:sim.QuestDefinition,tick:bigint)=>void;
  turnIn(ctx,definition,100n);expect(quest.state).toBe('turned_in');expect(grant).toHaveBeenCalledExactlyOnceWith(ctx,definition);
  expect(inventory[0]).toMatchObject({itemKind:'empty',quantity:0});expect(inventory[1]).toMatchObject({itemKind:'stone',quantity:4});expect(cursor).toEqual({itemKind:'basalt',quantity:1});
  expect(()=>turnIn(ctx,definition,101n)).toThrow('quest_objectives_incomplete');expect(grant).toHaveBeenCalledOnce();expect(cursor?.quantity).toBe(1);
});
