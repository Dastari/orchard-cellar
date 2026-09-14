/** Offline source/atlas gathering study through actual native terrain/resource rendering. No atlas publication or authority connection. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng } from './assets/png.js';
const root=resolve(import.meta.dirname,'../../..');
const atlasMode=process.argv.includes('--atlas');
const output=resolve(root,'output/doc60/gathering-sites-'+(process.argv.includes('--depleted')?'depleted':'active')+(atlasMode?'-atlas':'')+'.png');
const settings={width:1152,height:768,scale:3};
const depleted=process.argv.includes('--depleted');
const scene=`
import {HEARTH_RESOURCE_SITES,createLiveIslandMapDocument,terrainDocumentForMapV3,compileMapDocument} from '/packages/sim/src/index.ts';
import {composeHearthArchipelago} from '/packages/tools/src/hearth-archipelago-authoring.ts';
import {terrainArrayForMapDocument} from '/packages/engine/src/editor-terrain.ts';
import {terrainProjectedDepthAtFoot} from '/packages/engine/src/terrain.ts';
import {GroundChunkCache} from '/packages/engine/src/ground-cache.ts';
import {enqueueRaisedTerrainDepth} from '/packages/engine/src/raised-terrain-depth.ts';
import {sortWorldDepthItems} from '/packages/engine/src/renderer.ts';
import {loadOverworldArt,drawOverworldTree,drawOverworldStump,drawOverworldOreNode} from '/packages/engine/src/overworld-art.ts';
import {drawPixelText} from '/packages/ui/src/pixel-ui.ts';
import {loadGeneratedAssetRegistry} from '/packages/ui/src/assets.ts';
import {HEARTH_RESOURCE_ASSET_NAMES} from '/packages/engine/src/hearth-resource-art.ts';
try {
 const loaded=await loadOverworldArt(),bank={};
 if(!${atlasMode})for(const [kind,name,override] of [
  ['rock_basalt','resource_cf_hearth_basalt'],['ore_cinder','resource_cf_hearth_cinder'],
  ['ore_emberglass','resource_cf_hearth_emberglass'],['tree_ashwood','resource_cf_hearth_ashwood'],
  ['tree_ashwood_stump','prop_cf_poi_stump',[8,13]]]) {
  const source=await(await fetch('/packages/assets/props/'+name+'.sprite.json')).json();
  const image=document.createElement('canvas');image.width=source.size[0];image.height=source.size[1];
  const ctx=image.getContext('2d'),data=ctx.createImageData(image.width,image.height);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
   const key=source.frames.base[0][y][x];if(key==='.')continue;
   const hex=source.sourcePalette[key].slice(1),at=(y*image.width+x)*4;
   data.data[at]=parseInt(hex.slice(0,2),16);data.data[at+1]=parseInt(hex.slice(2,4),16);
   data.data[at+2]=parseInt(hex.slice(4,6),16);data.data[at+3]=hex.length===8?parseInt(hex.slice(6,8),16):255;
  }
  ctx.putImageData(data,0,0);
  bank[kind]={image,anchor:override??source.anchor,metadata:{animations:{base:[{x:0,y:0,width:image.width,height:image.height,durationTicks:1}]}}};
 }
 const loadedAssetIds={};
 if(${atlasMode}) {
  const registry=await loadGeneratedAssetRegistry();
  for(const [kind,name] of Object.entries(HEARTH_RESOURCE_ASSET_NAMES)) {
   const expectedId=Object.entries(registry.assetsById).find(([,value])=>value===name)?.[0];
   const actualId=loaded.hearthResources?.[kind]?.assetId;
   if(expectedId===undefined || actualId===registry.placeholderAssetId || actualId!==Number(expectedId))throw new Error('Atlas lacks exact Hearth resource asset: '+name);
   loadedAssetIds[kind]=actualId;
  }
 }
 const art=${atlasMode}?loaded:{...loaded,hearthResources:bank};
 const doc=composeHearthArchipelago(createLiveIslandMapDocument()).document;
 const base=terrainDocumentForMapV3(doc),terrain=terrainArrayForMapDocument(base,compileMapDocument(base),doc,{includeTerrainPlaneCollision:false});
 const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=768;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
 let resourceDraws=0;
 for(const [index,site] of HEARTH_RESOURCE_SITES.entries()) {
  const panel=document.createElement('canvas');panel.width=384;panel.height=384;
  const ctx=panel.getContext('2d');ctx.imageSmoothingEnabled=false;
  const x=site.tileX*16+8,foot=(site.tileY+1)*16,projected=foot-terrainProjectedDepthAtFoot(terrain,x,foot);
  const cameraX=x-64,cameraY=projected-76,scale=3,ground=new GroundChunkCache();
  ground.draw(ctx,art,terrain,cameraX,cameraY,scale,384,384);
  const queue=[];enqueueRaisedTerrainDepth(queue,ctx,art,terrain,ground,cameraX,cameraY,scale,128,128);
  if(site.kind==='tree_ashwood'||!${depleted})queue.push({footY:projected,elevationLayer:site.elevation,depthPhase:'entity',tie:'resource:'+site.id,
   draw:()=>{resourceDraws++;return site.kind==='tree_ashwood'?(${depleted}?drawOverworldStump(ctx,art,x,projected,cameraX,cameraY,scale,site.kind):drawOverworldTree(ctx,art,x,projected,false,cameraX,cameraY,scale,site.kind))
    :drawOverworldOreNode(ctx,art,site.kind,x,projected,cameraX,cameraY,scale)}});
  for(const item of sortWorldDepthItems(queue))item.draw();
  ctx.fillStyle='#211923';ctx.fillRect(0,0,384,35);
  drawPixelText(ctx,art.ui,site.kind.replace('tree_','').replace('rock_','').replace('ore_','').toUpperCase()+' / '+site.tileX+','+site.tileY,8,12,{color:'#fff2d0'});
  context.drawImage(panel,index%3*384,Math.floor(index/3)*384);
 }
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:doc.provenance.generatorSeed,resources:6,decorations:0,draws:resourceDraws,loadedAssetIds})});
}catch(error){await fetch('/__login-result',{method:'POST',body:JSON.stringify({error:String(error),stack:error?.stack})});}
`;
let finish: (value: string) => void = () => undefined;
const result = new Promise<string>((resolveResult) => { finish = resolveResult; });
const server = await createServer({
 root, configFile: false, publicDir: resolve(root, 'packages/client/public'),
 server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error',
 plugins: [{ name: 'offline-login-island', configureServer(server) {
  server.middlewares.use((request, response, next) => {
   if (request.url === '/__login-island') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body><script type="module" src="/__login-scene.js"></script></body></html>');
   } else if (request.url === '/__login-scene.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(scene);
   } else if (request.url === '/__login-result' && request.method === 'POST') {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => { finish(Buffer.concat(chunks).toString('utf8')); response.end('ok'); });
   } else next();
  });
 } }],
});
const profile = await mkdtemp(resolve(tmpdir(), 'orchard-login-art-'));
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') throw new Error('preview address unavailable');
const chrome = spawn(process.env['CHROME_BIN'] ?? '/usr/bin/google-chrome', [
 '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
 `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/__login-island`,
], { stdio: 'ignore' });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
 const payload = JSON.parse(await Promise.race([result, new Promise<never>((_resolve, reject) => {
  timer = setTimeout(() => reject(new Error('Offline render timed out')), 120_000);
 })])) as { png?: string; error?: string; stack?: string; seed: number; resources: number; decorations: number; draws: number; loadedAssetIds: Record<string, number> };
 if (payload.error !== undefined || payload.png === undefined) throw new Error(payload.stack ?? payload.error ?? 'render missing');
 const png = Buffer.from(payload.png.slice('data:image/png;base64,'.length), 'base64');
 const decoded = decodePng(png);
 if (decoded.width !== settings.width || decoded.height !== settings.height) throw new Error('render dimensions invalid');
 await mkdir(dirname(output), { recursive: true });
 await writeFile(output, png);
 const atlas = JSON.parse(await readFile(resolve(root, 'packages/client/public/generated/atlas.meta.json'), 'utf8')) as { revision: string };
 const sourcePaths = ['packages/tools/src/render-hearth-gathering-study.ts','packages/engine/src/overworld-art.ts','packages/engine/src/hearth-resource-art.ts','packages/sim/src/hearth-resource-sites.ts','packages/sim/src/hearth-archipelago.ts','packages/tools/src/hearth-archipelago-authoring.ts','packages/client/public/generated/atlas.meta.json',...['basalt','cinder','emberglass','ashwood'].map(name=>'packages/assets/props/resource_cf_hearth_'+name+'.sprite.json'),'packages/assets/props/prop_cf_poi_stump.sprite.json'];
 const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
 ])));
 const provenance = { format: 'orchard-hearth-gathering-study-v1', ...settings, seed: payload.seed,
  generator: (atlasMode?'generated atlas assets':'native candidate source pixels')+' on composed Cinderwake terrain; unlit, no populated encounters',
  renderer: 'GroundChunkCache / raised terrain / actual engine resource draw functions',
  atlasRevision: atlas.revision, sourceSha256, decorations: payload.decorations, resources: payload.resources, draws: payload.draws, loadedAssetIds: payload.loadedAssetIds,
  players: 0, liveData: false, imageSha256: createHash('sha256').update(png).digest('hex'),
  rgbaSha256: createHash('sha256').update(decoded.rgba).digest('hex'),
  depleted, sourceAssetFixture: !atlasMode, releaseReady: false, reproduce: 'npx tsx packages/tools/src/render-hearth-gathering-study.ts'+(depleted?' --depleted':'')+(atlasMode?' --atlas':''),
 };
 const provenancePath = output.replace(/\.png$/, '.provenance.json');
 await mkdir(dirname(provenancePath), { recursive: true });
 await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
 console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally {
 if (timer !== undefined) clearTimeout(timer);
 chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
