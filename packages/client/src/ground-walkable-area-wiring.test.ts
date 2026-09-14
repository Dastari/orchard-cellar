import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8');
const collision=source.slice(source.indexOf('function refreshCollision('),source.indexOf('function updateLighting('));

describe('authored ground-walkable client wiring',()=>{
  it('uses active content and optional persisted source instances without exact decoration kinds',()=>{
    expect(collision).toContain('activeSpaceGroundWalkableTiles(\n    snapshot.content.registry, TOPSIDE_SPACE_ID, liveDocument?.landmarks,');
    expect(collision).toContain('authoredGroundWalkableTiles');
    expect(collision).not.toContain('authoredDockWalkableTiles');
    expect(collision).not.toContain('fisher_dock');
    expect(collision).not.toMatch(/landmark\.kind\s*===/u);
    expect(collision).not.toContain('Array.from({ length: 3 }');
  });
});
