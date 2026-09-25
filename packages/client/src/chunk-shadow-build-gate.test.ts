import {describe,expect,it} from 'vitest';
import {CHUNK_RUNTIME_ACTIVATION_RELEASE,CHUNK_RUNTIME_BUILD_MODES,chunkRuntimeActivationApproved,chunkRuntimeBuildAudit,parseChunkRuntimeBuildMode} from './chunk-shadow-build-gate.js';
import {CHUNK_RUNTIME_MODES} from '@orchard/sim/chunk-runtime';
it('records bundled legacy modules and fails explicit retirement and unknown modes',()=>{
 const modules=['/repo/packages/sim/src/procedural-terrain.ts','/repo/packages/engine/src/terrain.ts','/repo/packages/sim/src/world-chunk.ts'];
 expect(chunkRuntimeBuildAudit('shadow',modules).legacyModules).toHaveLength(2);
 expect(()=>chunkRuntimeBuildAudit('shadow',modules,{requireGeneratorFree:true})).toThrow(/retirement/);
 expect(()=>chunkRuntimeBuildAudit('live',[])).toThrow(/mode_invalid/);
 expect(chunkRuntimeBuildAudit('off',[]).activationAllowed).toBe(false);
});
it('does not mistake the chunk-native decoder for legacy generation',()=>{
 expect(chunkRuntimeBuildAudit('shadow',['/repo/packages/sim/src/world-chunk.ts','/repo/packages/engine/src/bounded-chunk-terrain-store.ts'],{requireGeneratorFree:true}).legacyModules).toEqual([]);
});
describe('activation guard',()=>{
 it('ships with no approved release',()=>{
  // Flipping this is the S5c activation decision and needs its own review.
  expect(CHUNK_RUNTIME_ACTIVATION_RELEASE).toBeNull();
 });
 it('refuses an `on` production build without the reviewed release flag',()=>{
  expect(()=>chunkRuntimeBuildAudit('on',[],{production:true})).toThrow(/activation_not_approved/);
  // No env value can approve while the committed release is null.
  expect(()=>chunkRuntimeBuildAudit('on',[],{production:true,activationRelease:'anything'})).toThrow(/release_mismatch/);
 });
 it('lets dev servers and the preview build run `on` without ever allowing activation',()=>{
  expect(chunkRuntimeBuildAudit('on',[],{production:false})).toEqual({schema:1,mode:'on',legacyModules:[],activationAllowed:false,activationRelease:null});
 });
 it('keeps off and shadow production builds exactly as before',()=>{
  for(const mode of ['off','shadow',undefined,''])expect(chunkRuntimeBuildAudit(mode,[],{production:true})).toMatchObject({activationAllowed:false,activationRelease:null});
  expect(chunkRuntimeBuildAudit(undefined,[]).mode).toBe('off');
 });
 it('allows activation only when the committed release and the build env agree',()=>{
  const approved={approvedRelease:'static-world-s5c'} as const;
  expect(chunkRuntimeBuildAudit('on',[],{...approved,production:true,activationRelease:'static-world-s5c'}))
   .toMatchObject({mode:'on',activationAllowed:true,activationRelease:'static-world-s5c'});
  expect(()=>chunkRuntimeBuildAudit('on',[],{...approved,production:true})).toThrow(/activation_not_approved/);
  expect(()=>chunkRuntimeBuildAudit('on',[],{...approved,production:true,activationRelease:'static-world-s5b'})).toThrow(/release_mismatch/);
  // A release flag on an off/shadow build is a mistake, not a no-op.
  expect(()=>chunkRuntimeBuildAudit('shadow',[],{...approved,production:true,activationRelease:'static-world-s5c'})).toThrow(/release_mismatch/);
  expect(chunkRuntimeActivationApproved('on','',"")).toBe(false);
 });
});
it('parses modes like the runtime does',()=>{
 expect([...CHUNK_RUNTIME_BUILD_MODES]).toEqual([...CHUNK_RUNTIME_MODES]);
 expect(parseChunkRuntimeBuildMode(undefined)).toBe('off');expect(parseChunkRuntimeBuildMode('on')).toBe('on');
 expect(()=>parseChunkRuntimeBuildMode('On')).toThrow(/mode_invalid/);
});
describe('vite config wiring',()=>{
 const run=async(env:Record<string,string|undefined>,command:'build'|'serve',mode:string)=>{
  const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  try{
   const {default:config}=await import('../vite.config.js');
   return (config as (env:{command:string;mode:string})=>unknown)({command,mode});
  }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 };
 it('refuses an unapproved `on` release build but allows dev servers and the preview mode',async()=>{
  const on={VITE_CHUNK_RUNTIME_MODE:'on',ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE:undefined};
  await expect(run(on,'build','client-production')).rejects.toThrow(/activation_not_approved/);
  await expect(run(on,'build','production')).rejects.toThrow(/activation_not_approved/);
  await expect(run(on,'serve','development')).resolves.toBeTruthy();
  await expect(run(on,'build','chunk-runtime-preview')).resolves.toBeTruthy();
  await expect(run({VITE_CHUNK_RUNTIME_MODE:'shadow',ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE:undefined},'build','client-production')).resolves.toBeTruthy();
  await expect(run({VITE_CHUNK_RUNTIME_MODE:'on',ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE:'static-world-s5c'},'build','client-production')).rejects.toThrow(/release_mismatch/);
  await expect(run({VITE_CHUNK_RUNTIME_MODE:'live'},'serve','development')).rejects.toThrow(/mode_invalid/);
 });
});
