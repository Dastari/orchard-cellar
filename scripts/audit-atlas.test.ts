import { test } from 'vitest';
import assert from 'node:assert/strict';
import { crop, pixelFingerprint, visibleFingerprint, classifyDuplicate, audit } from './audit-atlas.js';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { atlasSourceRevision } from '../packages/tools/src/assets/source-revision.js';
import { encodePng } from '../packages/tools/src/assets/png.js';

test('fingerprints retain dimensions, alpha and hidden RGB',()=>{
  const rgba=new Uint8Array([1,2,3,0,4,5,6,255]);
  assert.notEqual(pixelFingerprint(2,1,rgba),pixelFingerprint(1,2,rgba));
  assert.notEqual(pixelFingerprint(2,1,rgba),pixelFingerprint(2,1,new Uint8Array([0,2,3,0,4,5,6,255])));
  assert.notEqual(pixelFingerprint(2,1,rgba),pixelFingerprint(2,1,new Uint8Array([1,2,3,255,4,5,6,255])));
  assert.equal(visibleFingerprint(2,1,rgba),visibleFingerprint(2,1,new Uint8Array([0,0,0,0,4,5,6,255])));
});
test('complete audit reconciles frames, provenance, seasons and deterministic artifacts; invalid crops remain failures',async()=>{
  const root=await mkdtemp(join(tmpdir(),'orchard-atlas-audit-'));
  try {
    for(const dir of ['packages/assets/tiles','packages/assets/generated','docs/reference-assets','references/art','art','output']) await mkdir(join(root,dir),{recursive:true});
    const json=async(path:string,value:unknown)=>writeFile(join(root,path),JSON.stringify(value));
    const generated='packages/assets/generated/';
    const source={name:'tile_a',category:'tiles',size:[1,1],frames:{base:[['a']]},sourcePath:'references/art/test.png',sourceRegions:{base:[[0,0,1,1]]}};
    const revision=atlasSourceRevision([source],{},{});
    await json('packages/assets/palette.json',{});
    await json('packages/assets/seasons.json',{});
    const frame={x:0,y:0,width:1,height:1,durationTicks:0};
    const meta={assetId:1,category:'tiles',pageId:'tiles:p000',animations:{},variants:{},states:{base:frame}};
    const entry={name:'tile_a',...meta,tags:[],placement:{},states:['base']};
    await json('packages/assets/tiles/tile_a.tile.json',source);
    await json(generated+'asset-registry.json',{revision,assets:[entry]});
    await json(generated+'atlas_tiles.meta.json',{revision,assets:{tile_a:meta}});
    const atlases=Object.fromEntries(['spring','summer','autumn','winter'].map(s=>[`tiles:p000:${s}`,s+'.png']));
    await json(generated+'atlas.meta.json',{revision,atlases,pages:{'tiles:p000':{width:1,height:1}},assetCategories:{tile_a:'tiles'},assetsById:{1:'tile_a'}});
    const png=encodePng(1,1,new Uint8Array([10,20,30,255]));
    for(const file of Object.values(atlases)) await writeFile(join(root,generated,file),png);
    await writeFile(join(root,'references/art/test.png'),png);
    await json('docs/reference-assets/reference-library-index.json',{entries:[{path:'references/art/test.png'}]});
    await json('docs/reference-assets/cute-fantasy-index.json',{entries:[]});
    const first=await audit(root,join(root,'references'),join(root,'output'));
    assert.equal(first.summary.expectedSeasonFrames,4);
    assert.equal(first.summary.processedSeasonFrames,4);
    assert.equal(first.summary.errors,0);
    assert.equal(first.sourceLedger[0].status,'declared-crops-cover-visible-sheet');
    assert.equal(first.frames[0].sourcePixelComparison,'exact-rgba-match');
    const before=await readFile(join(root,'output/inventory.json'));
    const evidence=await readFile(join(root,'output/frames.jsonl.gz'));
    assert.equal(gunzipSync(evidence).toString().trim().split('\n').length,1);
    await audit(root,join(root,'references'),join(root,'output'));
    assert.deepEqual(await readFile(join(root,'output/inventory.json')),before);
    assert.deepEqual(await readFile(join(root,'output/frames.jsonl.gz')),evidence);
    await json(generated+'atlas_tiles.meta.json',{revision,assets:{tile_a:{...meta,states:{base:{...frame,x:1}}}}});
    const broken=await audit(root,join(root,'references'),join(root,'output'));
    assert.equal(broken.summary.processedSeasonFrames,0);
    assert.equal(broken.errors.filter(e=>e.kind==='invalid-frame-crop').length,4);
    await json(generated+'atlas_tiles.meta.json',{revision,assets:{tile_a:meta}});
    await json('packages/assets/tiles/tile_a.tile.json',{...source,frames:{base:[['a']],new_variant:[['a']]}});
    const stale=await audit(root,join(root,'references'),join(root,'output'));
    assert.ok(stale.errors.some(e=>e.kind==='source-registry-frame-count-mismatch'));
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('crop copies exact rows and rejects partial, fractional or negative bounds',()=>{
  const image={width:2,height:2,rgba:new Uint8Array(Array.from({length:16},(_,i)=>i))};
  assert.deepEqual([...crop(image,[1,0,1,2])],[4,5,6,7,12,13,14,15]);
  for(const rect of [[-1,0,1,1],[1,0,2,1],[0,0,1,3],[0.5,0,1,1],[0,0,0,1]] as const) assert.throws(()=>crop(image,rect),/Invalid crop/);
});
test('empty, repeated frames and documented crop aliases remain separate classes',()=>{
  assert.equal(classifyDuplicate([{asset:'a',empty:true},{asset:'b',empty:true}]),'transparent-empty');
  assert.equal(classifyDuplicate([{asset:'a'},{asset:'a'}]),'same-asset-repeated-frame-or-season');
  assert.equal(classifyDuplicate([{asset:'a',sourcePath:'x',sourceRect:[0,0,16,16]},{asset:'b',sourcePath:'x',sourceRect:[0,0,16,16]}]),'same-source-crop-alias');
  assert.equal(classifyDuplicate([{asset:'a'},{asset:'b'}]),'cross-asset-exact-pixels-review');
});
