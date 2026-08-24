import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadAssets, workspaceRoot } from './assets/load.js';
import { renderReview } from './render-review.js';

const port = 4174;
const assets = await loadAssets();
await Promise.all(assets.map(async (asset) => await renderReview(asset.name)));

function html(): string {
  const cards = assets.map((asset) => `<figure><canvas data-asset="${asset.name}" aria-label="Animated preview for ${asset.name}"></canvas><img src="/review/${asset.name}.png" alt="Review sheet for ${asset.name}"><figcaption>${asset.name}</figcaption></figure>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Orchard Asset Preview</title><style>
    body{margin:0;background:#141420;color:#fff6e0;font:16px monospace}header{position:sticky;top:0;padding:16px;background:#232338;border-bottom:2px solid #6b4423}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;padding:16px}figure{margin:0;padding:12px;background:#2b1d0e}img{width:100%;image-rendering:pixelated;background:#d9c49a}canvas{display:block;margin:0 auto 12px;image-rendering:pixelated;background:#d9c49a}figcaption{padding-top:8px}
  </style></head><body><header><b>ORCHARD &amp; CELLAR — ASSET REVIEW</b> · ${assets.length} authored assets</header><main>${cards}</main><script type="module">
    const meta=await fetch('/generated/atlas.meta.json').then(r=>r.json());
    for(const canvas of document.querySelectorAll('canvas[data-asset]')){const asset=meta.assets[canvas.dataset.asset];if(!asset)continue;const entries=Object.entries(asset.animations);const chosen=entries.find(([,f])=>f.length>1)??entries[0];if(!chosen)continue;const frames=chosen[1];const file=meta.atlases[asset.category+':summer'];const image=new Image();image.src='/generated/'+file;await image.decode();canvas.width=frames[0].width*4;canvas.height=frames[0].height*4;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const start=performance.now();const draw=()=>{const elapsed=(performance.now()-start)/1000;const index=Math.floor(elapsed*60/frames[0].durationTicks)%frames.length;const f=frames[index];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,f.x,f.y,f.width,f.height,0,0,canvas.width,canvas.height);requestAnimationFrame(draw)};draw()}
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
