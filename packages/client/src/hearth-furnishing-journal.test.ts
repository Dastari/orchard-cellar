import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {it,expect} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('overworld-main.ts',readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declaration=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='questLogEntries')!.getText(source);
const dependencies={...sim,liveItemDefinition:()=>null};
const journal=new Function(...Object.keys(dependencies),ts.transpile(declaration+';return questLogEntries;',{target:ts.ScriptTarget.ES2022}))(...Object.values(dependencies)) as (snapshot:unknown)=>Array<{objectives:Array<{complete:boolean;progress:string}>}>;
it('renders remote private furnishing counts without nearby world rows and tracks removal',()=>{
  const snapshot={content:{registry:sim.bootstrapContentRegistry()},playerStatistics:[],inventorySlots:[],inventoryCursor:null,
    quests:[{questId:'hearth_furnish_room',state:'active',pinned:true}],
    questBaselines:sim.HEARTH_FURNISHING_CATEGORIES.map(category=>({questId:'hearth_furnish_room',objectiveId:category,value:99n,currentValue:1n}))};
  expect(journal(snapshot)[0]!.objectives.every(item=>item.complete&&item.progress==='1/1')).toBe(true);
  snapshot.questBaselines[0]!.currentValue=0n;
  expect(journal(snapshot)[0]!.objectives[0]).toMatchObject({complete:false,progress:'0/1'});
});
it('renders current equipment readiness from the private objective projection',()=>{
  const snapshot={content:{registry:sim.bootstrapContentRegistry()},playerStatistics:[],inventorySlots:[],inventoryCursor:null,
    quests:[{questId:'hearth_prepare_expedition',state:'active',pinned:true}],
    questBaselines:['weapon','body'].map(objectiveId=>({questId:'hearth_prepare_expedition',objectiveId,value:99n,currentValue:1n}))};
  expect(journal(snapshot)[0]!.objectives.every(item=>item.complete)).toBe(true);
  snapshot.questBaselines[0]!.currentValue=0n;
  expect(journal(snapshot)[0]!.objectives[0]).toMatchObject({complete:false,progress:'0/1'});
});
