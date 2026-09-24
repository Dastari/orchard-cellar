/// <reference types="node" />
// Design review renderer: paints lab specimens (or ad-hoc design compositions) at the
// game's real logical viewports onto a grass backdrop and writes PNGs for owner review.
// Run: DESIGN_RENDER=1 npx vitest run packages/ui/src/kit/lab/design-render.test.ts
// Optional DESIGN_RENDER_FILTER=<substring> and DESIGN_RENDER_OUT=<dir>.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { beforeAll, describe, it } from 'vitest';
import { itemDefinition, SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import { ui, type UiKitArt } from '../components/index.js';
import { UI_CHARACTER_PORTRAIT_ASSETS } from '../components/character-portrait.js';
import { UiRoot } from '../runtime/root.js';
import type { UiElement } from '../runtime/element.js';
import { UI_LAB_SPECIMENS, uiLabVariants, type UiLabMocks } from './registry.js';
import { UI_LAB_ITEM_KINDS } from './inventory-mock.js';
import { uiTestArt, uiTestAsset } from './testing/art.js';
import type { LoadedAsset } from '../../assets.js';
import { DESIGN_SHEETS } from './design-sheets.js';

const enabled = process.env['DESIGN_RENDER'] === '1';
const filter = process.env['DESIGN_RENDER_FILTER'] ?? '';
const outDir = process.env['DESIGN_RENDER_OUT'] ?? new URL('../../../../../output/ui-design/renders/', import.meta.url).pathname;

export const DESIGN_VIEWPORTS = {
  desktop: { width: 960, height: 540, pixel: 2 },
  laptop: { width: 683, height: 384, pixel: 2 },
  phone: { width: 390, height: 797, pixel: 2 },
  'phone-landscape': { width: 844, height: 390, pixel: 2 },
} as const;
export type DesignViewport = keyof typeof DESIGN_VIEWPORTS;

let art: UiKitArt;
const assets = new Map<string, LoadedAsset>();
function mocks(): UiLabMocks {
  const actor = assets.get('npc_cf_desert_person_01')!;
  return { art, activate: () => {}, assets, actors: [{ id: actor.name, asset: actor.name, label: 'Desert Person 1', kind: 'npc', animations: Object.keys(actor.metadata.animations), companions: [] }] };
}

function paintBackdrop(context: CanvasRenderingContext2D, width: number, height: number): void {
  const grass = assets.get('tile_cf_grass')!;
  const frame = grass.metadata.animations[Object.keys(grass.metadata.animations)[0]!]![0]!;
  for (let y = 0; y < height; y += frame.height) for (let x = 0; x < width; x += frame.width)
    context.drawImage(grass.image, frame.x, frame.y, frame.width, frame.height, x, y, frame.width, frame.height);
  context.fillStyle = 'rgba(10, 16, 12, 0.25)'; context.fillRect(0, 0, width, height);
}

function render(name: string, viewport: DesignViewport, build: () => UiElement): void {
  const vp = DESIGN_VIEWPORTS[viewport];
  const canvas = createCanvas(vp.width * vp.pixel, vp.height * vp.pixel);
  const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  context.imageSmoothingEnabled = false;
  context.setTransform(vp.pixel, 0, 0, vp.pixel, 0, 0);
  paintBackdrop(context, vp.width, vp.height);
  const root = new UiRoot({ scale: 1, art }); root.resize(vp.width, vp.height);
  root.mount(build()); root.arrange(); root.draw(context, 0, false, { scale: vp.pixel, x: 0, y: 0 });
  root.dispose();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/${name}--${viewport}.png`, canvas.toBuffer('image/png'));
}

describe.skipIf(!enabled)('design renders', () => {
  beforeAll(async () => {
    art = await uiTestArt();
    for (const name of ['tile_cf_grass', 'tile_cf_stone_cliff_variants']) assets.set(name, uiTestAsset(name, 'tiles'));
    const actor = uiTestAsset('npc_cf_desert_person_01', 'characters'); assets.set(actor.name, actor);
    for (const node of SKILL_NODE_DEFINITIONS) assets.set(node.iconAsset, uiTestAsset(node.iconAsset, 'ui'));
    for (const name of UI_CHARACTER_PORTRAIT_ASSETS) assets.set(name, uiTestAsset(name, 'characters'));
    for (const name of ['icon_cf_quest_offer', 'icon_cf_quest_complete']) assets.set(name, uiTestAsset(name, 'ui'));
    const island = await loadImage(readFileSync(new URL('../../../../client/public/ui/island-background.png', import.meta.url)));
    assets.set('island-background', { name: 'island-background', image: island } as unknown as LoadedAsset);
    for (const name of ['prop_basket_press', 'prop_oak_barrel', 'prop_cf_barrel', 'prop_cf_furnace', 'prop_cf_cooking_fire', 'prop_cf_workbench', 'prop_cf_chest']) assets.set(name, uiTestAsset(name, 'props'));
    for (const kind of ['fruit_press', 'fermentation_cask', 'apple', 'must', 'pomace', 'coal', 'iron_ore', 'iron_bar', 'raw_beef', 'cooked_beef', 'beetroot', 'bottles', 'wood']) { const icon = itemDefinition(kind)?.iconKey; if (icon && !assets.has(icon)) try { assets.set(icon, uiTestAsset(icon, icon.startsWith('item_') || icon.startsWith('prop_') ? 'props' : 'ui')); } catch { /* optional art */ } }
    for (const kind of UI_LAB_ITEM_KINDS) { const icon = itemDefinition(kind)?.iconKey; if (icon) assets.set(icon, uiTestAsset(icon, icon.startsWith('item_') || icon.startsWith('prop_') ? 'props' : 'ui')); }
  });
  it('renders lab specimens and design sheets', () => {
    for (const sheet of DESIGN_SHEETS) {
      if (filter && !sheet.id.includes(filter)) continue;
      for (const viewport of sheet.viewports) render(sheet.id, viewport, () => sheet.build(ui, mocks(), viewport));
    }
    const specimenFilter = process.env['DESIGN_RENDER_SPECIMENS'];
    if (!specimenFilter) return;
    for (const specimen of UI_LAB_SPECIMENS) {
      if (!specimen.id.includes(specimenFilter)) continue;
      const props = uiLabVariants(specimen)[0] ?? {};
      for (const viewport of ['desktop', 'phone'] as const) render(`specimen-${specimen.id}`, viewport, () => specimen.build(ui, props, mocks()));
    }
  });
});
