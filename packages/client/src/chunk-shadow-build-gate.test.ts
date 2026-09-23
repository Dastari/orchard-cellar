import {expect,it} from 'vitest';
import {chunkRuntimeBuildAudit} from './chunk-shadow-build-gate.js';
it('records bundled legacy modules and fails explicit retirement and live activation gates',()=>{
 const modules=['/repo/packages/sim/src/procedural-terrain.ts','/repo/packages/engine/src/terrain.ts','/repo/packages/sim/src/world-chunk.ts'];
 expect(chunkRuntimeBuildAudit('shadow',modules).legacyModules).toHaveLength(2);
 expect(()=>chunkRuntimeBuildAudit('shadow',modules,true)).toThrow(/retirement/);
 expect(()=>chunkRuntimeBuildAudit('live',[])).toThrow(/not_approved/);
 expect(chunkRuntimeBuildAudit('off',[]).activationAllowed).toBe(false);
});
it('does not mistake the chunk-native decoder for legacy generation',()=>{
 expect(chunkRuntimeBuildAudit('shadow',['/repo/packages/sim/src/world-chunk.ts','/repo/packages/engine/src/bounded-chunk-terrain-store.ts'],true).legacyModules).toEqual([]);
});
