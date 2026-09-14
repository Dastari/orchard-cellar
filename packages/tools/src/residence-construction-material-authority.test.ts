import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('residence construction material source authority',()=>{
  it('keeps material ids and recipe values out of simulation and mutation callers',()=>{
    const paths=['../../sim/src/hearth-architecture-edits.ts','../../sim/src/hearth-architecture-inventory.ts',
      '../../world/src/index.ts','../../client/src/overworld-main.ts'];
    const source=paths.map(path=>readFileSync(new URL(path,import.meta.url),'utf8')).join('\n');
    expect(source).not.toContain('MATERIALS_V1');
    expect(source).not.toMatch(/['"](?:wood|stone|copper_piece)['"]\s*:/u);
    expect(source).toContain('runtimeResidenceConstructionMaterials');
    expect(source).toContain('planHearthArchitectureEdits(registry,editInput)');
    expect(source).toContain('planHearthArchitectureEdits(latestSnapshot.content.registry,');
  });
});
