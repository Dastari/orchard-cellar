import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const runtime=source.slice(source.indexOf('function compiledLiveIslandRuntime('),source.indexOf('function liveMapCollisionForSpace('));

describe('authored ground-walkable world authority wiring',()=>{
  it('projects active authored areas through persisted source instances without exact decoration kinds',()=>{
    expect(runtime).toContain('activeSpaceGroundWalkableTiles(\n    registry, TOPSIDE_SPACE_ID, document.landmarks,');
    expect(runtime).toContain('groundWalkableTiles.has(');
    expect(runtime).not.toContain('dockWalkableTiles');
    expect(runtime).not.toContain('fisher_dock');
    expect(runtime).not.toMatch(/landmark\.kind\s*===/u);
    expect(runtime).not.toContain('Array.from({ length: 3 }');
  });
});
