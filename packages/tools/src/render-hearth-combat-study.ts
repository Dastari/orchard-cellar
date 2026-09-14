/** Offline native gameplay UI study; no authority connection or publication. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng } from './assets/png.js';
const root=resolve(import.meta.dirname,'../../..');
const warden=process.argv.includes('--warden');
const output=resolve(root,process.argv.slice(2).find(arg=>!arg.startsWith('--'))??(warden?'output/doc60/warden-cues.png':'output/doc60/combat-telegraphs.png'));
const settings={width:1440,height:720,scale:3,warden};
const scene=`
import {commitEnemyAttack,hearthWardenAttack,FIXED_UNITS_PER_PIXEL} from '/packages/sim/src/index.ts';
import {drawEnemyAttackTelegraph,drawWardenCrest,drawOutdoorSummonMark} from '/packages/engine/src/combat-telegraph.ts';
import {loadOverworldArt,drawOverworldRogueEnemy} from '/packages/engine/src/overworld-art.ts';
import {drawPixelText} from '/packages/ui/src/pixel-ui.ts';
try {
 const settings=${JSON.stringify(settings)},art=await loadOverworldArt();
 const canvas=document.createElement('canvas');canvas.width=settings.width;canvas.height=settings.height;
 const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;document.body.append(canvas);
 const patterns=settings.warden?['charge','burst','pulse']:['pulse','charge','bolt'];const kinds=settings.warden?['cowling','cowling','cowling']:['slime_small','cowling','cowling_mage'];
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
   const left=col*480,top=row*360;ctx.save();ctx.beginPath();ctx.rect(left,top,480,360);ctx.clip();ctx.translate(left,top);
   ctx.fillStyle=row===0?'#776a61':'#242632';ctx.fillRect(0,0,480,360);
   ctx.strokeStyle=row===0?'#85796e':'#30323f';ctx.lineWidth=1;
   for(let x=0;x<=480;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,360);ctx.stroke();}
   for(let y=0;y<=360;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(480,y);ctx.stroke();}
   let attack=commitEnemyAttack(patterns[col],1n,0n,{x:48*FIXED_UNITS_PER_PIXEL,y:72*FIXED_UNITS_PER_PIXEL},
     {x:112*FIXED_UNITS_PER_PIXEL,y:72*FIXED_UNITS_PER_PIXEL},64*FIXED_UNITS_PER_PIXEL);
   if(settings.warden&&col<2){const tuning=hearthWardenAttack(col===0?1:2,0);attack={...attack,tellTicks:tuning.tellTicks,activeTicks:tuning.activeTicks,recoveryTicks:tuning.recoveryTicks};}
   if(settings.warden&&col===2)drawOutdoorSummonMark(ctx,112,72,8n,0n,0,0,3);
   else drawEnemyAttackTelegraph(ctx,attack,8n,0,0,3,(_x,y)=>y);
   if(settings.warden)drawWardenCrest(ctx,48,72,col+1,20n,8n,0,0,3);
   drawOverworldRogueEnemy(ctx,art,kinds[col],'tell',48,72,'right',false,1,0,0,3,false);
   drawPixelText(ctx,art.ui,(settings.warden?['WARDEN CHARGE','WARDEN VENT','SUMMON MARK'][col]:patterns[col].toUpperCase())+' / '+(row===0?'DAY':'DARK'),18,18,{scale:2,color:'#fff2d0'});
   ctx.restore();
 }
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:0,resources:0,decorations:0,draws:6})});
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
 })])) as { png?: string; error?: string; stack?: string; seed: number; resources: number; decorations: number; draws: number };
 if (payload.error !== undefined || payload.png === undefined) throw new Error(payload.stack ?? payload.error ?? 'render missing');
 const png = Buffer.from(payload.png.slice('data:image/png;base64,'.length), 'base64');
 const decoded = decodePng(png);
 if (decoded.width !== settings.width || decoded.height !== settings.height) throw new Error('render dimensions invalid');
 await mkdir(dirname(output), { recursive: true });
 await writeFile(output, png);
 const atlas = JSON.parse(await readFile(resolve(root, 'packages/client/public/generated/atlas.meta.json'), 'utf8')) as { revision: string };
 const sourcePaths = ['packages/tools/src/render-hearth-combat-study.ts','packages/engine/src/combat-telegraph.ts','packages/sim/src/combat-actions.ts','packages/sim/src/hearth-warden.ts','packages/engine/src/overworld-art.ts','packages/client/public/generated/atlas.meta.json'];
 const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
 ])));
 const provenance = { format: 'orchard-hearth-combat-study-v1', ...settings, seed: payload.seed,
  generator: 'offline attack readability fixture',
  renderer: 'drawEnemyAttackTelegraph / drawOverworldRogueEnemy',
  atlasRevision: atlas.revision, sourceSha256, decorations: payload.decorations, resources: payload.resources, draws: payload.draws,
  players: 0, liveData: false, imageSha256: createHash('sha256').update(png).digest('hex'),
  rgbaSha256: createHash('sha256').update(decoded.rgba).digest('hex'),
  reproduce: `npx tsx packages/tools/src/render-hearth-combat-study.ts${warden?' --warden':''}`,
 };
 const provenancePath = output.replace(/\.png$/, '.provenance.json');
 await mkdir(dirname(provenancePath), { recursive: true });
 await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
 console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally {
 if (timer !== undefined) clearTimeout(timer);
 chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
