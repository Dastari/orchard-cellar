import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';

const sourceText=readFileSync(new URL('../../sim/src/hearth-interiors.ts',import.meta.url),'utf8');
const source=ts.createSourceFile('hearth-interiors.ts',sourceText,ts.ScriptTarget.Latest,true);

describe('Hearth interior authored catalog source gate',()=>{
  it('keeps the six canonical spaces, furniture catalog, and layout coordinates out of simulation source',()=>{
    const literals:string[]=[];
    const visit=(node:ts.Node):void=>{
      if(ts.isStringLiteral(node)||ts.isNumericLiteral(node))literals.push(node.text);
      ts.forEachChild(node,visit);
    };
    visit(source);
    for(const forbidden of ['65520','65521','65522','65523','65524','65525','The Willow Lantern',
      'Harbour Provisions','Alder Workshop','furniture_rustic_dining_table','townhouse_bookcase']){
      expect(literals,`hard-coded interior catalog literal ${forbidden}`).not.toContain(forbidden);
    }
    expect(sourceText).toContain('runtimeHearthInteriorForSpace');
    expect(sourceText).toContain('registry.spaces.values()');
    expect(sourceText).toContain('registry.objects.values()');
  });
});
