/** Offline native gameplay UI study; no authority connection or publication. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng } from './assets/png.js';
const root=resolve(import.meta.dirname,'../../..');
const output=resolve(root,process.argv[2]??'output/doc60/combat-defenses.png');
const settings={width:1440,height:960,scale:2};
const scene=`
import {drawPlayerDefenseCue} from '/packages/engine/src/combat-telegraph.ts';
import {loadOverworldArt} from '/packages/engine/src/overworld-art.ts';
import {drawPixelText} from '/packages/ui/src/pixel-ui.ts';
import {TouchControls,touchControlLayout} from '/packages/ui/src/touch-controls.ts';
try {
 const art=await loadOverworldArt(),canvas=document.createElement('canvas');canvas.width=1440;canvas.height=960;
 const ctx=canvas.getContext('2d');document.body.append(canvas);ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#1f302c';ctx.fillRect(0,0,1440,960);ctx.scale(2,2);
 for(const [left,width,height] of [[0,480,270],[480,240,480]]) {
  ctx.save();ctx.translate(left,0);ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  ctx.fillStyle='#477c45';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#558a52';for(let x=0;x<width;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
  drawPixelText(ctx,art.ui,width>300?'R: DODGE / HOLD X: BLOCK':'TOUCH DEFENSES',12,16,{color:'#fff2d0'});
  const controls=new TouchControls(true),layout=touchControlLayout(width,height);
  controls.pointerDown({x:layout.blockButton.x+8,y:layout.blockButton.y+8},1,'touch',width,height);
  controls.draw(ctx,art.ui,art.uiSkin,width,height);
  for(const [kind,x] of [['block',width/2-28],['dodge',width/2+28]]) {
   drawPlayerDefenseCue(ctx,kind,'right',x,100,0,0,1);
   drawPixelText(ctx,art.ui,kind.toUpperCase(),x,125,{align:'center',color:'#fff2d0'});
  }
  ctx.restore();
 }
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:0,resources:0,decorations:0,draws:2})});
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
 const sourcePaths = ['packages/tools/src/render-hearth-defense-study.ts','packages/engine/src/combat-telegraph.ts','packages/sim/src/combat-actions.ts','packages/engine/src/overworld-art.ts','packages/client/public/generated/atlas.meta.json'];
 const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
 ])));
 const provenance = { format: 'orchard-hearth-defense-study-v1', ...settings, seed: payload.seed,
  generator: 'offline defense controls readability fixture',
  renderer: 'TouchControls / drawPlayerDefenseCue',
  atlasRevision: atlas.revision, sourceSha256, decorations: payload.decorations, resources: payload.resources, draws: payload.draws,
  players: 0, liveData: false, imageSha256: createHash('sha256').update(png).digest('hex'),
  rgbaSha256: createHash('sha256').update(decoded.rgba).digest('hex'),
  reproduce: 'npx tsx packages/tools/src/render-hearth-defense-study.ts',
 };
 const provenancePath = output.replace(/\.png$/, '.provenance.json');
 await mkdir(dirname(provenancePath), { recursive: true });
 await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
 console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally {
 if (timer !== undefined) clearTimeout(timer);
 chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
