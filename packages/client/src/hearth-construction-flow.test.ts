import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import {HearthConstructionRequest} from './hearth-construction-request.js';
const source=ts.createSourceFile('overworld-main.ts',readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const functions=['performWorldPointerAction','applyConstructionProposal'].map(name=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(source)).join('\n');
const compiled=ts.transpile(functions,{target:ts.ScriptTarget.ES2022});
it('actual click handler stages only; Apply sends once, rechecks revision and prevents stale scope commits',async()=>{
  const send=vi.fn(async()=>{}),toast=vi.fn(),requests=new HearthConstructionRequest();
  const flow=new Function('network','setToast','constructionRequests',`
    let constructionProposal=null,homesteadBuildMode=true,hoveredInteractionTile={tileX:6,tileY:8};
    const homesteadBuildPalette={selection:{kind:'remove'},constructionTool:'doorway_ew'};
    const activeSpaceDefinition={generator:'residence'},furnitureMoves={pending:false};
    let scope='a',revision=1n;
    const constructionScope=()=>scope;
    const computeConstructionPreviewAt=()=>({failure:null,revision,edits:[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,partition:'wall'}}],materials:['USE 4 WOOD'],footprint:[{tileX:6,tileY:8}]});
    const constructionPreviewAt=computeConstructionPreviewAt;
    ${compiled}
    return {click:()=>performWorldPointerAction({button:0,pointerId:1,preventDefault(){}},0,0,true),apply:applyConstructionProposal,
      proposal:()=>constructionProposal,changeRevision:()=>revision++,changeScope:()=>scope='b'};
  `)({editResidenceArchitecture:send},toast,requests) as {click():void;apply():void;proposal():unknown;changeRevision():void;changeScope():void};
  flow.click();expect(send).not.toHaveBeenCalled();expect(flow.proposal()).not.toBeNull();
  flow.apply();flow.apply();expect(send).toHaveBeenCalledTimes(1);expect(requests.pending).toBe(true);
  await Promise.resolve();expect(requests.pending).toBe(true);
  requests.sync('a',2n);flow.changeRevision();flow.click();flow.changeRevision();flow.apply();
  expect(send).toHaveBeenCalledTimes(1);expect(flow.proposal()).toBeNull();expect(toast).toHaveBeenCalled();
  flow.click();flow.changeScope();flow.apply();expect(send).toHaveBeenCalledTimes(1);expect(flow.proposal()).toBeNull();
});
