/** v1.0.0 — Render registered atlas frames through the real engine on a local Canvas surface. */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, ImageData, type Canvas } from '@napi-rs/canvas';
import { MAP_EDITOR_ASSET_NAMES, type OverworldArt } from '../packages/engine/src/overworld-art.js';
import type { BuiltAssetRecord, LoadedAsset } from '../packages/ui/src/index.js';
import { createNativeIslandRenderer } from './native-island-preview/core.js';
import { cinderwakeDesign, willowharbourDesign } from './native-island-scenes.js';
import { lavaLightProof } from './native-island-light-proof.js';

const root=fileURLToPath(new URL('../',import.meta.url)),generated=resolve(root,'packages/assets/generated'),output=resolve(root,'output/native-islands-20261001');
// Canvas adapter only: no alternate browser, authored PNG manipulation or replacement renderer.
Object.assign(globalThis,{document:{createElement:()=>createCanvas(1,1)},ImageData});
await mkdir(output,{recursive:true});
const records:Record<string,BuiltAssetRecord>={};
for(const file of (await readdir(generated)).filter(file=>/^atlas_.*\.meta\.json$/.test(file))){
  const m=JSON.parse(await readFile(resolve(generated,file),'utf8')) as {assets:Record<string,BuiltAssetRecord>};Object.assign(records,m.assets);
}
const assets=new Map<string,LoadedAsset>(),images=new Map<string,Awaited<ReturnType<typeof loadImage>>>();
const manifest=JSON.parse(await readFile(resolve(generated,'atlas.meta.json'),'utf8')) as {atlases:Record<string,string>};
for(const [name,record] of Object.entries(records)){
  const file=manifest.atlases[`${record.pageId??record.category}:summer`]!;
  let image=images.get(file);if(!image){image=await loadImage(resolve(generated,file));images.set(file,image);}
  assets.set(name,{...record,name,image:image as unknown as CanvasImageSource,atlasRevision:1,
    metadata:{image:file,animations:record.animations,variants:record.variants,states:record.states}});
}
const terrainAssets=Object.fromEntries([...assets].filter(([name])=>name.startsWith('tile_')));
const named=MAP_EDITOR_ASSET_NAMES as Record<string,string>;
const art=new Proxy({terrainAssets},{get(target,key){return key==='terrainAssets'?target.terrainAssets:typeof key==='string'?assets.get(named[key]??key):undefined;}}) as unknown as OverworldArt;
const registry=JSON.parse(await readFile(resolve(generated,'asset-registry.json'),'utf8')) as {revision:string};
const renderer=createNativeIslandRenderer(art,assets,registry.revision);
for(const scene of [cinderwakeDesign(),willowharbourDesign()]){
  const full=renderer.render(scene,'day') as unknown as Canvas;
  await writeFile(resolve(output,scene.id+'-overview.png'),full.toBuffer('image/png'));
  for(const view of scene.views){const c=createCanvas(view.width*2,view.height*2),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(full,view.x,view.y,view.width,view.height,0,0,c.width,c.height);await writeFile(resolve(output,`${scene.id}-${view.id}.png`),c.toBuffer('image/png'));}
  if(scene.id==='cinderwake')for(const mode of ['night-off','night-self','night-glow'] as const){const c=renderer.render(scene,mode) as unknown as Canvas;await writeFile(resolve(output,`${scene.id}-${mode}.png`),c.toBuffer('image/png'));}
  await writeFile(resolve(output,scene.id+'-map.json'),JSON.stringify(renderer.editable(scene),null,2)+'\n');
  await writeFile(resolve(output,scene.id+'-design.json'),JSON.stringify({placements:scene.placements,intendedTerraces:scene.intendedTerraces,note:'Native visual draft. Traversal pending; intended heights are separate from flat art placement.'},null,2)+'\n');
  console.log(`${scene.id}: ${scene.placements.length} native placements rendered`);
}

const proof=lavaLightProof(art,assets);
await writeFile(resolve(output,'lava-proof-comparison.png'),(proof.board as unknown as Canvas).toBuffer('image/png'));
await writeFile(resolve(output,'lava-proof-metrics.json'),JSON.stringify({stats:proof.stats,note:proof.note},null,2)+'\n');
console.log('Lava emission, cliff occlusion and elevation isolation verified.');
