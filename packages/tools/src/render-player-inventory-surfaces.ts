/** Offline renders of every window that shows the player's inventory (BUG-067), for owner review. No world connection.
 * Usage: npx tsx packages/tools/src/render-player-inventory-surfaces.ts <output-dir> [surface ...] */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const output = resolve(root, args[0] ?? 'output/player-inventory-surfaces');
const ALL = ['inventory', 'crafting', 'chest', 'furnace', 'stash', 'trade', 'merchant-sell'] as const;
const surfaces = args.slice(1).length ? args.slice(1) : [...ALL];
// The game's logical UI at 1280x720 and UI scale 2 (640x360); --compact renders the smallest 480x270 layout.
const compact = process.argv.includes('--compact');
const size = compact ? { width: 1440, height: 810, uiWidth: 480, uiHeight: 270, scale: 3 } : { width: 1280, height: 720, uiWidth: 640, uiHeight: 360, scale: 2 };

const scene = `
import { bootstrapContentRegistry, MAIN_HAND_INVENTORY_SLOT } from '/packages/sim/src/index.ts';
import { loadUiKitArt } from '/packages/ui/src/kit/components/art.ts';
import { NpcInteractionUi } from '/packages/ui/src/npc-interaction-ui.ts';
import { TradeUi } from '/packages/ui/src/trade-ui.ts';
import { OverworldUi } from '/packages/ui/src/overworld-ui.ts';
import { loadOverworldArt } from '/packages/engine/src/overworld-art.ts';
const size = ${JSON.stringify(size)}, surfaces = ${JSON.stringify(surfaces)};
const post = body => fetch('/__result', { method: 'POST', body: JSON.stringify(body) });
try {
  const art = await loadOverworldArt(), kitArt = await loadUiKitArt(), registry = bootstrapContentRegistry();
  const itemArt = { missing: art.missingItem, avatar: art.avatar, ...art.itemIcons };
  const inventory = [{ slot: 0, itemKind: 'axe', quantity: 1, durability: 250 }, { slot: 1, itemKind: 'wood', quantity: 25 },
    { slot: 2, itemKind: 'apple', quantity: 12 }, { slot: 10, itemKind: 'stone', quantity: 40 }, { slot: 11, itemKind: 'plank', quantity: 30 },
    { slot: 12, itemKind: 'carrot_seeds', quantity: 8 }, { slot: 13, itemKind: 'copper_ore', quantity: 10 }, { slot: 16, itemKind: 'arrow', quantity: 20 },
    { slot: 34, itemKind: 'backpack', quantity: 1 }];
  const callbacks = new Proxy({}, { get: () => () => Promise.resolve() });
  const base = { width: size.uiWidth, height: size.uiHeight, connected: true, playerCount: 1, selectedSlot: 0, inventory, hasBackpack: true,
    backpackSlotCapacity: 20, contentRegistry: registry, balanceBronze: 10000n, audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '12:00', timeFraction: .5, raining: false, weatherMode: 'auto', prompt: null, toast: null, knownRecipeIds: [] };
  const results = [];
  for (const surface of surfaces) {
    const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.scale(size.scale, size.scale);
    ctx.fillStyle = '#3f7550'; ctx.fillRect(0, 0, size.uiWidth, size.uiHeight);
    if (surface === 'trade') {
      const trade = new TradeUi(kitArt, itemArt, callbacks); trade.resize(size.uiWidth, size.uiHeight);
      const self = { toHexString: () => 'self' }, peer = { toHexString: () => 'peer' };
      trade.update({ contentRegistry: registry, identityHex: 'self', requesterName: 'Mara', recipientName: 'Toby', walletBronze: 10000n,
        inventorySlots: inventory, backpackSlotCapacity: 20, offers: [{ id: 'o1', tradeId: 't', owner: self, slot: 0, itemKind: 'apple', quantity: 4, durability: 0, lit: false }],
        session: { id: 't', requester: self, recipient: peer, state: 'active', requesterAccepted: false, recipientAccepted: false,
          requesterBronze: 0n, recipientBronze: 0n, revision: 1n, createdTick: 0n } });
      trade.draw(ctx, size.uiWidth, size.uiHeight);
    } else if (surface === 'merchant-sell') {
      const shop = new NpcInteractionUi(kitArt, itemArt, callbacks);
      shop.update({ interactionSessionKey: 'offline', width: size.uiWidth, height: size.uiHeight, npcId: 1n, dialogueId: 'willow_storekeeper',
        shopId: 'willow_storekeeper', nodeId: 'shop', balanceBronze: 10000n, inventory, contentRegistry: registry });
      shop.root.key({ key: '2' }); shop.draw(ctx);
    } else {
      const ui = new OverworldUi(art.uiSkin, art.ui, itemArt, callbacks);
      const frame = { chest: 'frame:chest', furnace: 'frame:furnace', stash: 'frame:hearth_stash' }[surface];
      const model = { ...base, ...(frame ? { activeFrameId: frame } : {}),
        ...(surface === 'chest' ? { openChestInventory: [{ slot: 0, itemKind: 'wood', quantity: 50 }, { slot: 5, itemKind: 'arrow', quantity: 12 }] } : {}),
        ...(surface === 'stash' ? { openStashInventory: [{ slot: 0, itemKind: 'torch', quantity: 1, durability: 73, lit: false }, { slot: 3, itemKind: 'arrow', quantity: 12 }] } : {}) };
      ui.update(model); ui.enableRetainedInventory(kitArt);
      ui.openWindow = surface === 'stash' ? 'content' : surface; ui.update(model);
      ui.draw(ctx);
    }
    results.push({ surface, png: canvas.toDataURL('image/png') });
  }
  await post({ results });
} catch (error) { await post({ error: String(error), stack: error?.stack }); }
`;

let deliver!: (value: string) => void;
const result = new Promise<string>((resolvePromise) => { deliver = resolvePromise; });
const server = await createServer({ root, configFile: false, publicDir: resolve(root, 'packages/client/public'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false }, plugins: [{
  name: 'orchard-player-inventory-surfaces',
  resolveId: (id) => id === '/__scene.js' ? '\0scene.js' : null,
  load: (id) => id === '\0scene.js' ? scene : null,
  configureServer(dev) {
    dev.middlewares.use((request, response, next) => {
      if (request.url === '/__scene') { response.setHeader('content-type', 'text/html'); response.end('<script type="module" src="/__scene.js"></script>'); return; }
      if (request.url === '/__result' && request.method === 'POST') {
        let body = ''; request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => { response.end('ok'); deliver(body); }); return;
      }
      next();
    });
  },
}] });
const profile = await mkdtemp(resolve(tmpdir(), 'orchard-inventory-surfaces-'));
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') throw new Error('preview address unavailable');
const chrome = spawn(process.env['CHROME_BIN'] ?? '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-background-networking', `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/__scene`], { stdio: 'ignore' });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const payload = JSON.parse(await Promise.race([result, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('render timed out')), 180_000);
  })])) as { results?: { surface: string; png: string }[]; error?: string; stack?: string };
  if (!payload.results) throw new Error(payload.stack ?? payload.error ?? 'render missing');
  await mkdir(output, { recursive: true });
  for (const { surface, png } of payload.results) {
    const path = resolve(output, `${surface}.png`);
    await writeFile(path, Buffer.from(png.slice('data:image/png;base64,'.length), 'base64'));
    console.log(path);
  }
} finally {
  if (timer !== undefined) clearTimeout(timer);
  chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
