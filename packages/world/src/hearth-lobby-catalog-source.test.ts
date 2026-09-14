import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';

const sourceText=readFileSync(new URL('../../sim/src/hearth-lobby.ts',import.meta.url),'utf8');
const source=ts.createSourceFile('hearth-lobby.ts',sourceText,ts.ScriptTarget.Latest,true);

describe('Hearth lobby authored catalog source gate',()=>{
  it('keeps canonical catalog IDs, coordinates, and presentation kinds out of simulation source',()=>{
    const literals:string[]=[];
    const visit=(node:ts.Node):void=>{
      if(ts.isStringLiteral(node)||ts.isNumericLiteral(node)||ts.isBigIntLiteral(node))literals.push(node.text);
      ts.forEachChild(node,visit);
    };
    visit(source);
    for(const forbidden of ['65532','4294966903','personal-stash','standing_torch',
      'marlow_tent_table','residence_bookshelf','camp_round_stool','camp_bench']){
      expect(literals,`hard-coded lobby catalog literal ${forbidden}`).not.toContain(forbidden);
    }
    expect(sourceText).toContain('runtimeHearthLobbyDefinition');
    expect(sourceText).toContain('registry.spaces.values()');
  });
});
