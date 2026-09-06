/** Offline, deterministic login artwork. No network connection or live player data.
 * Run: npx tsx packages/tools/src/render-login-island.ts
 * Requires the existing generated atlases and a Chrome/Chromium executable.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng } from './assets/png.js';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, process.argv[2] ?? 'packages/client/public/ui/island-background.png');
const settings = { width: 1536, height: 1024, centerTileX: 376, centerTileY: 337, zoom: 1, frameMs: 0 };
const scene = `
import { SURVIVAL_WORLD_SEED, generateSurvivalResources, generateSurvivalDecorations,
 generateMarlowCampPathTiles, isMineableOreKind } from '/packages/sim/src/index.ts';
import { terrainForWorld } from '/packages/engine/src/terrain.ts';
import { GroundChunkCache } from '/packages/engine/src/ground-cache.ts';
import { drawAnimatedTerrain } from '/packages/engine/src/animated-terrain.ts';
import { drawInsetGround } from '/packages/engine/src/farmland.ts';
import { loadOverworldArt, drawOverworldTree, drawOverworldOreNode, drawOverworldRock,
 drawOverworldPoiDecoration, overworldPoiDecorationDepthY } from '/packages/engine/src/overworld-art.ts';
const options = ${JSON.stringify(settings)};
try {
 const art = await loadOverworldArt();
 const terrain = terrainForWorld(SURVIVAL_WORLD_SEED, 1);
 const canvas = document.createElement('canvas');
 canvas.width = options.width; canvas.height = options.height;
 const context = canvas.getContext('2d', { alpha: false });
 if (!context) throw new Error('canvas context unavailable');
 context.imageSmoothingEnabled = false;
 const scale = options.zoom;
 const cameraX = options.centerTileX * 16 - options.width / scale / 2;
 const cameraY = options.centerTileY * 16 - options.height / scale / 2;
 const visible = row => row.tileX * 16 > cameraX - 160 && row.tileX * 16 < cameraX + options.width / scale + 160
  && row.tileY * 16 > cameraY - 160 && row.tileY * 16 < cameraY + options.height / scale + 160;
 const ground = new GroundChunkCache();
 ground.draw(context, art, terrain, cameraX, cameraY, scale, options.width, options.height);
 drawAnimatedTerrain(context, art, terrain, cameraX, cameraY, scale, options.width / scale, options.height / scale, options.frameMs, 0, 1);
 drawInsetGround(context, art.dirtTerrace, art.farmlandGrassInset, generateMarlowCampPathTiles(), cameraX, cameraY, scale, options.width, options.height);
 const decorations = generateSurvivalDecorations(SURVIVAL_WORLD_SEED).filter(visible);
 const resources = generateSurvivalResources(SURVIVAL_WORLD_SEED).filter(visible);
 const draws = decorations.map(row => ({ depth: overworldPoiDecorationDepthY(row.kind, (row.tileY + 1) * 16),
  draw: () => drawOverworldPoiDecoration(context, art, row.kind, row.tileX * 16 + 8, (row.tileY + 1) * 16,
    cameraX, cameraY, scale, row.variant, 0, true) }));
 for (const row of resources) {
  const x = row.tileX * 16 + 8, y = (row.tileY + 1) * 16;
  if (row.kind.startsWith('tree_')) draws.push({ depth: y,
   draw: () => drawOverworldTree(context, art, x, y - 4, false, cameraX, cameraY, scale, row.kind, 0, 0) });
  else if (isMineableOreKind(row.kind)) draws.push({ depth: y,
   draw: () => drawOverworldOreNode(context, art, row.kind, x, y, cameraX, cameraY, scale, row.nodeClass, row.richness) });
  else if (row.kind === 'rock' || row.kind === 'rock_large') draws.push({ depth: y,
   draw: () => drawOverworldRock(context, art, x, y, cameraX, cameraY, scale) });
 }
 draws.sort((a, b) => a.depth - b.depth).forEach(row => row.draw());
 await fetch('/__login-result', { method: 'POST', body: JSON.stringify({ png: canvas.toDataURL('image/png'),
  seed: SURVIVAL_WORLD_SEED, decorations: decorations.length, resources: resources.length, draws: draws.length }) });
} catch (error) {
 await fetch('/__login-result', { method: 'POST', body: JSON.stringify({ error: String(error), stack: error?.stack }) });
}
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
 const sourcePaths = ['packages/tools/src/render-login-island.ts', 'packages/sim/src/survival-world.ts',
  'packages/sim/src/content/bootstrap-spaces.ts', 'packages/engine/src/terrain.ts',
  'packages/engine/src/ground-cache.ts', 'packages/engine/src/animated-terrain.ts',
  'packages/engine/src/overworld-art.ts', 'packages/client/public/generated/atlas.meta.json'];
 const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
 ])));
 const provenance = { format: 'orchard-generated-login-island-v1', ...settings, seed: payload.seed,
  generator: 'terrainForWorld + generateSurvivalResources + generateSurvivalDecorations',
  renderer: 'GroundChunkCache + drawAnimatedTerrain + native object/resource drawing',
  atlasRevision: atlas.revision, sourceSha256, decorations: payload.decorations, resources: payload.resources, draws: payload.draws,
  players: 0, liveData: false, imageSha256: createHash('sha256').update(png).digest('hex'),
  rgbaSha256: createHash('sha256').update(decoded.rgba).digest('hex'),
  reproduce: 'npx tsx packages/tools/src/render-login-island.ts',
 };
 const provenancePath = resolve(root, 'art/custom/login-island/provenance.json');
 await mkdir(dirname(provenancePath), { recursive: true });
 await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
 console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally {
 if (timer !== undefined) clearTimeout(timer);
 chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
