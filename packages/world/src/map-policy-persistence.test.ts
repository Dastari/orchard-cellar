import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='commitLiveMapSnapshot');
if(fn===undefined)throw new Error('map commit implementation missing');
const javascript=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture(){
  const landmarks=sim.activeSurvivalLandmarks(sim.bootstrapContentRegistry(),sim.TOPSIDE_SPACE_ID);
  const initial={...sim.createLiveIslandMapDocument({landmarks}),combatRegions:sim.HEARTH_COMBAT_REGIONS};
  let row={mapId:initial.id,revision:1,documentJson:sim.serializeMapDocumentV3(initial),contentHash:sim.mapDocumentV3Hash(initial),clientMutationId:'initial'};
  const history:unknown[]=[];
  const ctx={sender:{},timestamp:{},db:{live_map_document:{mapId:{find:()=>row,update:(next:typeof row)=>{row=next;}}},
    live_map_revision:{insert:(next:unknown)=>history.push(next)}}};
  const dependencies={...sim,SenderError:Error,activeTopsideLandmarks:()=>landmarks,insertLegacyAdminAudit:()=>{}};
  const commit=new Function(...Object.keys(dependencies),`${javascript};return commitLiveMapSnapshot;`)(...Object.values(dependencies));
  return {ctx,initial,history,current:()=>row,commit};
}
describe('combat policy custody across map publication',()=>{
  it('preserves policy omitted by an older editor and retries that mutation idempotently',()=>{
    const f=fixture();const edited={...sim.createLiveIslandMapDocument(),title:'Edited by older Studio'};
    f.commit(f.ctx,edited,1,'older-editor');
    expect(sim.parseMapDocumentV3(f.current().documentJson).combatRegions).toHaveLength(3);
    expect(f.current().contentHash).toBe(sim.mapDocumentV3Hash(
      sim.parseMapDocumentV3(f.current().documentJson),
    ));
    expect(f.current().documentJson).not.toContain('\n');
    const committedHash=f.current().contentHash;
    f.commit(f.ctx,edited,1,'older-editor');
    expect(f.history).toHaveLength(1);expect(f.current().revision).toBe(2);
    expect(f.current().contentHash).toBe(committedHash);
  });
  it('allows an explicit empty policy and intentional historical restore',()=>{
    const cleared=fixture();cleared.commit(cleared.ctx,{...cleared.initial,combatRegions:[]},1,'explicit-empty');
    expect(sim.parseMapDocumentV3(cleared.current().documentJson).combatRegions).toEqual([]);
    const restored=fixture();restored.commit(restored.ctx,sim.createLiveIslandMapDocument(),1,'restore',false);
    expect(sim.parseMapDocumentV3(restored.current().documentJson).combatRegions).toBeUndefined();
  });
});
