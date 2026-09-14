import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {createLiveIslandMapDocument,serializeMapDocumentV3ForTransport} from '@orchard/sim';
import {exportHearthMap,validateExportVisual} from './export-hearth-map.js';
import {loadAssets} from './assets/load.js';
vi.mock('./assets/load.js',async importOriginal=>{
  const actual=await importOriginal<typeof import('./assets/load.js')>();
  return {...actual,loadAssets:vi.fn(actual.loadAssets)};
});
const directories:string[]=[];
afterEach(async()=>{vi.clearAllMocks();await Promise.all(directories.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'hearth-export-test-'));directories.push(directory);
  const input=join(directory,'input.json'),output=join(directory,'candidate');
  const bytes=serializeMapDocumentV3ForTransport(createLiveIslandMapDocument());await writeFile(input,bytes);
  return {input,output,bytes};
}
it('writes a review manifest and complete candidate without replacing input or existing output',async()=>{
  const {input,output,bytes}=await fixture();await exportHearthMap(input,output);
  const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8')) as {publishReady:boolean;mapSha256:string;assets:Record<string,unknown>;unapprovedAssets:string[]};
  expect(manifest.publishReady).toBe(false);expect(Object.keys(manifest.assets).length).toBeGreaterThan(30);
  expect(await readFile(join(output,'COMPLETE'),'utf8')).toBe(manifest.mapSha256+'\n');
  const map=await readFile(join(output,'map.json'),'utf8');
  expect(await readFile(input,'utf8')).toBe(bytes);
  await expect(exportHearthMap(input,output)).rejects.toThrow();
  expect(await readFile(join(output,'map.json'),'utf8')).toBe(map);
},20000);
it('rejects silently discarded input fields before creating output',async()=>{
  const {input,output,bytes}=await fixture();await writeFile(input,JSON.stringify({...JSON.parse(bytes),unknownAuthoredData:'must not disappear'}));
  await expect(exportHearthMap(input,output)).rejects.toThrow('input_requires_lossless');
  await expect(access(output)).rejects.toThrow();
});
it('rejects stale generated assets before creating output',async()=>{
  const {input,output}=await fixture();vi.mocked(loadAssets).mockResolvedValueOnce([]);
  await expect(exportHearthMap(input,output)).rejects.toThrow('generated_assets_are_stale');
  await expect(access(output)).rejects.toThrow();
});
it('writes no candidate when saved terrain conflicts with the reviewed map',async()=>{
  const {input,output,bytes}=await fixture();const map=JSON.parse(bytes);map.cells['220,400']={surface:'stone',biome:'paving'};
  await writeFile(input,JSON.stringify(map));
  await expect(exportHearthMap(input,output)).rejects.toThrow('cell:unreviewed:220,400');
  await expect(access(output)).rejects.toThrow();
},20000);

it('rejects an invalid later animation frame that the runtime would cycle into',()=>{
  const frame={x:0,y:0,width:16,height:16,durationTicks:1};
  expect(()=>validateExportVisual('boat',{assetId:1,category:'props',pageId:'props:p000',
    animations:{left:[frame,{...frame,width:17}]},variants:{},states:{}},[16,16],'left',0,true)).toThrow('asset_frame_mismatch');
});
it('rejects unknown saved legacy scenery states before creating output',async()=>{
  const {input,output,bytes}=await fixture();const map=JSON.parse(bytes);
  map.scenery=[{id:'old-chest',assetId:'prop_cf_chest',tileX:400,tileY:400,elevation:0,state:'missing-state'}];
  await writeFile(input,JSON.stringify(map));
  await expect(exportHearthMap(input,output)).rejects.toThrow('asset_frame_mismatch:prop_cf_chest:missing-state');
  await expect(access(output)).rejects.toThrow();
},20000);
it('exports a customized ordinary landmark and records its resolved native source',async()=>{
  const {input,output,bytes}=await fixture();const map=JSON.parse(bytes);
  const house=map.landmarks.find((row:{kind:string})=>row.kind==='farm_house');
  Object.assign(house,{tileX:400,tileY:400,quarterTurns:1,flipX:true,scale:2,enabled:false});
  await writeFile(input,JSON.stringify(map));await exportHearthMap(input,output);
  const saved=JSON.parse(await readFile(join(output,'map.json'),'utf8'));
  expect(saved.landmarks.find((row:{id:string})=>row.id===house.id)).toEqual(house);
  const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));
  expect(manifest.assetFileHashes['packages/assets/buildings/building_cf_farmhouse.sprite.json']).toMatch(/^[a-f0-9]{64}$/);
},20000);
