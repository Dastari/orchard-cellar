import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadAssets, workspaceRoot } from './assets/load.js';
import { renderReview } from './render-review.js';

const port = 4174;
const assets = await loadAssets();
const musicFiles = (await readdir(new URL('packages/assets/music/', workspaceRoot))).filter((name) => name.endsWith('.song.json'));
const sfxFiles = (await readdir(new URL('packages/assets/sfx/', workspaceRoot))).filter((name) => name.endsWith('.sfx.json'));
await Promise.all(assets.map(async (asset) => await renderReview(asset.name)));

function html(): string {
  const cards = assets.map((asset) => `<figure><canvas data-asset="${asset.name}" aria-label="Animated preview for ${asset.name}"></canvas><img src="/review/${asset.name}.png" alt="Review sheet for ${asset.name}"><figcaption>${asset.name}</figcaption></figure>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Orchard Asset Preview</title><style>
    body{margin:0;background:#141420;color:#fff6e0;font:16px monospace}header{position:sticky;top:0;z-index:2;padding:12px 16px;background:#232338;border-bottom:2px solid #6b4423}nav{display:inline-flex;gap:8px;margin-left:24px}button{padding:8px 12px;color:#fff6e0;background:#6b4423;border:2px solid #d5b568;font:inherit;cursor:pointer}button:hover,button:focus{background:#8a613f}.art{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;padding:16px}figure{margin:0;padding:12px;background:#2b1d0e}img{width:100%;image-rendering:pixelated;background:#d9c49a}canvas{display:block;margin:0 auto 12px;image-rendering:pixelated;background:#d9c49a}figcaption{padding-top:8px}.audio{padding:20px}.audio iframe{width:100%;height:640px;border:2px solid #d5b568;background:#141420}.hidden{display:none}
  </style></head><body><header><b>ORCHARD &amp; CELLAR — ASSET REVIEW</b> · ${assets.length} art · ${musicFiles.length} songs · ${sfxFiles.length} SFX<nav><button data-tab="art">Art</button><button data-tab="audio">Audio</button></nav></header><main class="art" data-panel="art">${cards}</main><main class="audio hidden" data-panel="audio"><h1>Audio review</h1><p>The embedded panel is the game client’s exact runtime audio implementation.</p><iframe id="runtime-audio" title="Runtime audio review"></iframe></main><script type="module">
    const index=await fetch('/generated/atlas.meta.json').then(r=>r.json());
    const categories=[...new Set(Object.values(index.assetCategories))];
    const categoryMetadata=await Promise.all(categories.map(category=>fetch('/generated/atlas_'+category+'.meta.json?rev='+encodeURIComponent(index.revision)).then(r=>r.json())));
    const meta={...index,assets:Object.assign({},...categoryMetadata.map(category=>category.assets))};
    for(const canvas of document.querySelectorAll('canvas[data-asset]')){const asset=meta.assets[canvas.dataset.asset];if(!asset)continue;const animation=Object.entries(asset.animations)[0];const variant=Object.entries(asset.variants)[0];const state=Object.entries(asset.states)[0];const chosen=animation??variant??(state?[state[0],[state[1]]]:null);if(!chosen)continue;const frames=chosen[1];const timed=animation===chosen;canvas.title=(timed?'animation':variant===chosen?'variant':'state')+': '+chosen[0];const file=meta.atlases[asset.category+':summer'];const image=new Image();image.src='/generated/'+file;await image.decode();canvas.width=frames[0].width*4;canvas.height=frames[0].height*4;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const start=performance.now();const draw=()=>{const elapsed=(performance.now()-start)/1000;const index=timed?Math.floor(elapsed*60/frames[0].durationTicks)%frames.length:0;const f=frames[index];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,f.x,f.y,f.width,f.height,0,0,canvas.width,canvas.height);if(timed)requestAnimationFrame(draw)};draw()}
    for(const tab of document.querySelectorAll('[data-tab]'))tab.addEventListener('click',()=>{for(const panel of document.querySelectorAll('[data-panel]'))panel.classList.toggle('hidden',panel.dataset.panel!==tab.dataset.tab);if(tab.dataset.tab==='audio'){const frame=document.querySelector('#runtime-audio');if(!frame.src)frame.src=location.protocol+'//'+location.hostname+':5173/audio-preview.html'}});
  </script></body></html>`;
}

createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html());
    return;
  }
  const match = /^\/review\/([a-z0-9_]+)\.png$/.exec(request.url ?? '');
  if (match?.[1]) {
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    createReadStream(fileURLToPath(new URL(`build/review/${match[1]}.png`, workspaceRoot))).pipe(response);
    return;
  }
  const generated = /^\/generated\/([a-z0-9_.]+)$/.exec(request.url ?? '');
  if (generated?.[1]) {
    response.writeHead(200, { 'content-type': generated[1].endsWith('.json') ? 'application/json' : 'image/png', 'cache-control': 'no-store' });
    createReadStream(fileURLToPath(new URL(`packages/client/public/generated/${generated[1]}`, workspaceRoot))).pipe(response);
    return;
  }
  response.writeHead(404).end();
}).listen(port, '0.0.0.0', () => console.log(`Asset preview: http://localhost:${port}`));
