import {expect,it} from 'vitest';
import {bootstrapContentRegistry,streetlampState,objectInteractionMetadata,resolveObjectLight} from '@orchard/sim';
import {planPlaceableStateEffect,resolvePlaceableObject} from './content/object-runtime.js';
const registry=bootstrapContentRegistry(),definition=registry.objects.get('object:hearth_streetlamp')!;
it('cycles persistent object modes with contextual prompts and one sprite/light state',()=>{
 let row={id:1n,kind:'hearth_streetlamp',definitionId:definition.id,open:false,...streetlampState('{}',0n)};
 for(const next of ['on','off','auto']){
  const state=resolvePlaceableObject(registry,row).state;
  const interaction=definition.components.interactions!.find(i=>i.conditions.every(c=>'state'in c&&state[c.state]===c.equals))!;
  const metadata=objectInteractionMetadata(definition,'use',state)!;
  expect(metadata.prompt).toContain(`SET ${next.toUpperCase()}`);expect(metadata.reachTiles).toBe(2.5);
  const effect=interaction.effects[0]!;if(!('setState'in effect))throw new Error('Expected mode state');
  const plan=planPlaceableStateEffect(registry,row,effect);
  row={...row,...plan,...streetlampState(plan.stateJson,0n),definitionId:definition.id};
  expect(JSON.parse(row.stateJson).mode).toBe(next);
  expect(resolveObjectLight(definition.components.light!,JSON.parse(row.stateJson)).enabled).toBe(row.lit);
  expect(definition.components.sprite!.animationByState![row.lit?'lit':'default']).toBe(row.lit?'on':'base');
 }
});
it('runs the authority materializer once per identity and preserves saved manual state',async()=>{
 const {readFileSync}=await import('node:fs');const ts=await import('typescript');
 const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='settleTownStreetlamps');
 if(!fn)throw new Error('Missing authority materializer');
 const javascript=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 type Row={id:bigint;definitionId:string;stateJson:string;lit:boolean};
 const rows=new Map<bigint,Row>();let inserts=0,updates=0;
 const ctx={databaseIdentity:'authority',db:{world_placeable:{id:{find:(id:bigint)=>rows.get(id)??null,update:(row:Row)=>{updates++;rows.set(row.id,row);}},insert:(row:Row)=>{inserts++;rows.set(row.id,row);}}}};
 const dependencies={compiledLiveIslandRuntime:()=>({document:{}}),contentRegistry:()=>registry,mapStreetlampPlans:()=>[{id:10n,tileX:120,tileY:400}],streetlampState,STREETLAMP_DEFINITION:definition.id,SURVIVAL_CHUNK_TILES:16,SenderError:Error};
 const settle=new Function(...Object.keys(dependencies),`${javascript};return settleTownStreetlamps;`)(...Object.values(dependencies));
 settle(ctx,0n);expect(inserts).toBe(1);expect(rows.get(10n)!.lit).toBe(false);
 settle(ctx,0n);expect(updates).toBe(0);
 settle(ctx,9000n);expect(rows.get(10n)!.lit).toBe(true);expect(updates).toBe(1);
 rows.set(10n,{...rows.get(10n)!,...streetlampState('{"mode":"off"}',0n)});
 settle(ctx,9000n);expect(rows.get(10n)!.lit).toBe(false);expect(inserts).toBe(1);
 rows.set(10n,{...rows.get(10n)!,definitionId:'object:other'});
 expect(()=>settle(ctx,9000n)).toThrow('streetlamp_identity_conflict');
});
