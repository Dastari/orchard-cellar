/// <reference types="node" />
// Owner feedback 2026-09-26 on the unified item slot (Game 0.47.0): icon position, slot size and
// new 16px icons for the eight items whose art is a small ground-drop sprite. Proposal renders only:
// the production slot painter is unchanged, so this file paints the slot with the same kit pieces
// (skin, pixel font, selectors, wear fills) and asserts that option A matches `uiSlot` pixel for pixel.
// Run: SLOT_FEEDBACK_RENDER=1 npx vitest run packages/ui/src/kit/lab/slot-feedback-render.test.ts --maxWorkers=2
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { itemDefinition, type ItemStack } from '@orchard/sim';
import { ui, type UiKitArt } from '../components/index.js';
import { uiSlot, uiItemFrame, UI_SLOT_INKS } from '../components/inventory.js';
import { paintUiSkin } from '../components/art.js';
import { paintUiSelector, uiWindow } from '../components/window.js';
import { UiRoot } from '../runtime/root.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { uiTestArt, uiTestAsset } from './testing/art.js';
import type { LoadedAsset } from '../../assets.js';
import type { UiRect } from '../../geometry.js';
import { drawOutlinedPixelText } from '../../pixel-ui.js';
import { drawUiSkinAsset } from '../../skin.js';
import { uiDurabilityFraction } from '../../item-durability.js';
import { uiInventorySlotTone } from '../../design-system/inventory.js';

const enabled = process.env['SLOT_FEEDBACK_RENDER'] === '1';
const outDir = process.env['DESIGN_RENDER_OUT'] ?? new URL('../../../../../output/slot-feedback/', import.meta.url).pathname;
const PACK = '/home/toby/projects/orchard-cellar/references/art/kenmi/cute-fantasy/icons';

interface SlotGeometry {
  readonly width: number; readonly height: number;
  /** Icon well top, wear track top (from the foot), stack count baseline (from the foot) and right inset. */
  readonly iconY: number; readonly wearFoot: number; readonly countFoot: number; readonly countRight: number;
  /** Wear track side inset (5 today). */
  readonly wearInset?: number;
  /** Nine-slice insets for frames other than the authored 28x31. */
  readonly slice?: readonly [number, number, number, number];
}
const A: SlotGeometry = { width: 28, height: 31, iconY: 7, wearFoot: 7, countFoot: 14, countRight: 5 };
const B: SlotGeometry = { ...A, iconY: 6, wearFoot: 8, countFoot: 15 };
const C: SlotGeometry = { ...A, iconY: 5, wearFoot: 9, countFoot: 16 };
const ROOMY: SlotGeometry = { width: 30, height: 33, iconY: 7, wearFoot: 9, countFoot: 16, countRight: 6, wearInset: 6, slice: [4, 3, 4, 6] };

type Artwork = Record<string, LoadedAsset>;
interface SlotOptions { readonly hotkey?: string; readonly selected?: boolean }
let art: UiKitArt;
const grass = () => uiTestAsset('tile_cf_grass', 'tiles');
const WEAR_FILLS = { good: 'bar_fill_green.base.0', worn: 'bar_fill_gold.base.0', failing: 'bar_fill_red.base.0' } as const;
const sliced = new Map<string, UiKitArt['skin']['slot']>();
function slotFamily(geometry: SlotGeometry): UiKitArt['skin']['slot'] {
  if (!geometry.slice) return art.skin.slot;
  const key = geometry.slice.join(',');
  let family = sliced.get(key);
  if (!family) {
    family = Object.fromEntries(Object.entries(art.skin.slot).map(([name, value]) => [name, { ...value, entry: { ...value.entry, slice: geometry.slice } }]));
    sliced.set(key, family);
  }
  return family;
}

/** The uiSlot paint path with the icon, wear and count offsets as parameters. */
function paintSlot(context: CanvasRenderingContext2D, r: UiRect, geometry: SlotGeometry, stack: ItemStack | null, artwork: Artwork, options: SlotOptions): void {
  const rarity = uiInventorySlotTone(stack?.itemKind);
  paintUiSkin(context, slotFamily(geometry), `slot.${rarity === 'common' ? 'idle' : rarity}.0`, r);
  const scale = Math.max(1, Math.floor(Math.min(r.width / geometry.width, r.height / geometry.height)));
  if (stack) {
    const asset = artwork[stack.itemKind], source = asset && uiItemFrame(asset, itemDefinition(stack.itemKind)?.iconAnimation);
    if (asset && source) {
      const size = 16 * scale, well = { x: r.x + Math.floor((r.width - size) / 2), y: r.y + geometry.iconY * scale, width: size, height: size };
      const fit = Math.min(well.width / source.width, well.height / source.height);
      const width = Math.max(1, Math.round(source.width * fit)), height = Math.max(1, Math.round(source.height * fit));
      context.save(); context.imageSmoothingEnabled = false;
      context.drawImage(asset.image, source.x, source.y, source.width, source.height, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2), width, height);
      context.restore();
    }
    if (stack.quantity > 1) drawOutlinedPixelText(context, art.pixel, String(stack.quantity), r.x + r.width - geometry.countRight * scale, r.y + r.height - geometry.countFoot * scale, { align: 'right', ...UI_SLOT_INKS });
    const durability = uiDurabilityFraction(stack.itemKind, stack.durability);
    if (durability !== null) {
      const inset = geometry.wearInset ?? 5, track = { x: r.x + inset * scale, y: r.y + r.height - geometry.wearFoot * scale, width: r.width - 2 * inset * scale, height: 3 * scale };
      context.fillStyle = '#3f2832'; context.fillRect(track.x, track.y, track.width, track.height);
      const width = Math.round(track.width * durability);
      if (width <= 0) { context.fillStyle = '#c34242'; context.fillRect(track.x, track.y, scale, track.height); }
      else { const fill = art.skin.feedback[WEAR_FILLS[durability > .5 ? 'good' : durability > .2 ? 'worn' : 'failing']]; if (fill) drawUiSkinAsset(context, fill.asset, { ...track, width }); }
    }
  }
  if (options.hotkey) drawOutlinedPixelText(context, art.pixel, options.hotkey, r.x + 3, r.y + 3, UI_SLOT_INKS);
  if (options.selected) paintUiSelector(context, art.skin.selector, 'confirm', r);
}

function slot(geometry: SlotGeometry, stack: ItemStack | null, artwork: Artwork, options: SlotOptions = {}): UiElement {
  return new UiElement({ kind: 'design-slot', label: stack?.itemKind ?? 'empty', style: { width: uiFixed(geometry.width), height: uiFixed(geometry.height), shrink: 0 },
    paint(element, { context }) { paintSlot(context, element.rect, geometry, stack, artwork, options); } });
}
/** The same slot painted at 1x and enlarged by an integer factor, for pixel inspection. */
function zoom(geometry: SlotGeometry, stack: ItemStack | null, artwork: Artwork, factor: number, options: SlotOptions = {}): UiElement {
  return new UiElement({ kind: 'design-zoom', label: 'zoom', style: { width: uiFixed(geometry.width * factor), height: uiFixed(geometry.height * factor), shrink: 0 },
    paint(element, { context }) {
      const canvas = createCanvas(geometry.width, geometry.height), target = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
      target.imageSmoothingEnabled = false; paintSlot(target, { x: 0, y: 0, width: geometry.width, height: geometry.height }, geometry, stack, artwork, options);
      context.save(); context.imageSmoothingEnabled = false;
      context.drawImage(canvas as unknown as CanvasImageSource, element.rect.x, element.rect.y, geometry.width * factor, geometry.height * factor);
      context.restore();
    } });
}
/** A bare 16px icon enlarged on the slot face colour. */
function iconZoom(asset: LoadedAsset | undefined, factor: number): UiElement {
  return new UiElement({ kind: 'design-icon', label: 'icon', style: { width: uiFixed(16 * factor + 4), height: uiFixed(16 * factor + 4), shrink: 0 },
    paint(element, { context }) {
      const r = element.rect; context.fillStyle = '#e4a672'; context.fillRect(r.x, r.y, r.width, r.height);
      context.fillStyle = '#3f2832'; context.fillRect(r.x, r.y, r.width, 1); context.fillRect(r.x, r.y + r.height - 1, r.width, 1); context.fillRect(r.x, r.y, 1, r.height); context.fillRect(r.x + r.width - 1, r.y, 1, r.height);
      const source = asset && uiItemFrame(asset); if (!asset || !source) return;
      context.save(); context.imageSmoothingEnabled = false;
      context.drawImage(asset.image, source.x, source.y, source.width, source.height, r.x + 2, r.y + 2, 16 * factor, 16 * factor); context.restore();
    } });
}

const ITEMS = JSON.parse(readFileSync(new URL('../../../../assets/content/items.json', import.meta.url), 'utf8')) as { id: string; durability?: { max: number }; maxStack?: number }[];
const stack = (itemKind: string, quantity = 1, wear?: number): ItemStack => {
  const max = ITEMS.find(item => item.id === `item:${itemKind}`)?.durability?.max;
  return { itemKind, quantity, ...(wear !== undefined && max ? { durability: Math.round(max * wear) } : {}) };
};
const HOTBAR: readonly (ItemStack | null)[] = [stack('axe', 1, .8), stack('pickaxe', 1, .35), stack('wood', 9), stack('apple', 32), stack('torch', 3), stack('cherry', 12), stack('hoe', 1, .1), stack('strawberry', 5), stack('arrow', 24), null];
const EXCERPT: readonly (ItemStack | null)[] = [stack('plank', 4), stack('pear', 6), stack('peach', 2), stack('pebble', 14), stack('iron_ore', 5), stack('emberglass', 3), stack('guardian_seal', 1), stack('carrot', 8), stack('sword', 1, .6), null];
const SMALL = ['apple', 'cherry', 'peach', 'pear', 'arrow', 'pebble', 'emberglass', 'guardian_seal'] as const;
const QUANTITY: Readonly<Record<string, number>> = { apple: 32, cherry: 12, peach: 2, pear: 6, arrow: 24, pebble: 14, emberglass: 3, guardian_seal: 1 };

const before: Artwork = {}, after: Artwork = {}, pack: Artwork = {};
function iconAsset(name: string): LoadedAsset { return uiTestAsset(name, name.startsWith('item_') || name.startsWith('prop_') ? 'props' : 'ui'); }
async function packCell(sheet: string, x: number, y: number, name: string): Promise<LoadedAsset | undefined> {
  if (!existsSync(sheet)) return undefined;
  const image = await loadImage(readFileSync(sheet));
  return { ...iconAsset('icon_cf_pickaxe'), name, image: image as unknown as CanvasImageSource, metadata: { image: name, animations: { base: [{ x, y, width: 16, height: 16, durationTicks: 5 }] } } } as LoadedAsset;
}

const hotkey = (index: number) => String((index + 1) % 10);
const row = (children: readonly UiElement[], gap = 2, align: 'start' | 'center' = 'start') => ui.flex({ direction: 'row', gap, align, shrink: 0 }, children);
const column = (children: readonly UiElement[], gap = 2) => ui.flex({ direction: 'column', gap, shrink: 0 }, children);
const label = (text: string) => ui.text(text, { role: 'label' });
const caption = (text: string) => ui.text(text, { role: 'caption' });
function hotbar(geometry: SlotGeometry, stacks: readonly (ItemStack | null)[], artwork: Artwork): UiElement {
  return row(stacks.map((item, index) => slot(geometry, item, artwork, { hotkey: hotkey(index), selected: index === 0 })));
}
function grid(geometry: SlotGeometry, stacks: readonly (ItemStack | null)[], artwork: Artwork, columns: number): UiElement {
  const rows: UiElement[] = [];
  for (let start = 0; start < stacks.length; start += columns) rows.push(row(stacks.slice(start, start + columns).map(item => slot(geometry, item, artwork))));
  return column(rows);
}

function render(name: string, width: number, height: number, build: () => UiElement): void {
  const pixel = 2, canvas = createCanvas(width * pixel, height * pixel);
  const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  context.imageSmoothingEnabled = false; context.setTransform(pixel, 0, 0, pixel, 0, 0);
  const tile = grass(), frame = tile.metadata.animations[Object.keys(tile.metadata.animations)[0]!]![0]!;
  for (let y = 0; y < height; y += frame.height) for (let x = 0; x < width; x += frame.width) context.drawImage(tile.image, frame.x, frame.y, frame.width, frame.height, x, y, frame.width, frame.height);
  context.fillStyle = 'rgba(10, 16, 12, 0.25)'; context.fillRect(0, 0, width, height);
  const root = new UiRoot({ scale: 1, art }); root.resize(width, height);
  root.mount(ui.flex({ width: 'grow', height: 'grow', justify: 'center', align: 'center' }, [build()])); root.arrange();
  root.draw(context, 0, false, { scale: pixel, x: 0, y: 0 }); root.dispose();
  mkdirSync(outDir, { recursive: true }); writeFileSync(`${outDir}/${name}.png`, canvas.toBuffer('image/png'));
}
function pixels(width: number, height: number, element: UiElement): Uint8ClampedArray {
  const canvas = createCanvas(width, height), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const root = new UiRoot({ scale: 1, art }); root.resize(width, height); root.mount(element); root.arrange();
  root.draw(context, 0, false, { scale: 1, x: 0, y: 0 }); root.dispose();
  return context.getImageData(0, 0, width, height).data;
}

describe.skipIf(!enabled)('slot feedback renders (owner 2026-09-26)', () => {
  beforeAll(async () => {
    art = await uiTestArt();
    const kinds = new Set([...HOTBAR, ...EXCERPT].flatMap(item => item ? [item.itemKind] : []).concat([...SMALL, 'stone', 'tomato', 'wheat_seeds']));
    for (const kind of kinds) { const icon = itemDefinition(kind)?.iconKey; if (icon) before[kind] = after[kind] = iconAsset(icon); }
    for (const kind of SMALL) after[kind] = iconAsset(`icon_item_${kind}`);
    const farming = `${PACK}/Cute_Fantasy_Icons_Farming/16x16/Farming_all_16x16.png`, weapons = `${PACK}/Cute_Fantasy_Icons_Weapons/16x16/Weapons_all_16x16.png`;
    for (const [kind, sheet, x, y] of [['apple', farming, 0, 160], ['peach', farming, 48, 160], ['pear', farming, 96, 160], ['cherry', farming, 144, 160], ['arrow', weapons, 0, 1984]] as const) {
      const cell = await packCell(sheet, x, y, `pack_${kind}`); if (cell) pack[kind] = cell;
    }
  });

  it('keeps option A identical to the production uiSlot', () => {
    for (const [index, item] of HOTBAR.entries()) {
      const options = { hotkey: hotkey(index), selected: index === 0 };
      const real = pixels(28, 31, uiSlot({ stack: item, artwork: before, ...options }));
      const proposal = pixels(28, 31, slot(A, item, before, options));
      expect(Buffer.from(proposal).equals(Buffer.from(real)), `slot ${index}`).toBe(true);
    }
  });

  it('never lets the wear bar touch the icon well or a stack count', () => {
    for (const geometry of [A, B, C, ROOMY]) expect(geometry.height - geometry.wearFoot - (geometry.iconY + 16)).toBeGreaterThanOrEqual(1);
    expect(ITEMS.filter(item => item.durability && (item.maxStack ?? 1) > 1).map(item => item.id)).toEqual([]);
  });

  it('renders 05 icon offset', () => {
    const option = (id: string, geometry: SlotGeometry, text: string) => column([
      label(`${id}  ${text}`),
      row([hotbar(geometry, HOTBAR, before), grid(geometry, EXCERPT, before, 5),
        zoom(geometry, HOTBAR[0]!, before, 3, { hotkey: '1', selected: true }), zoom(geometry, HOTBAR[3]!, before, 3, { hotkey: '4' }), zoom(geometry, EXCERPT[6]!, before, 3)], 12),
    ], 4);
    render('05-icon-offset', 860, 432, () => uiWindow({ title: 'ICON POSITION', layout: { direction: 'column', gap: 12 }, children: [
      option('A', A, 'TODAY: ICON 7 DOWN, WEAR 7 ABOVE THE FOOT'),
      option('B', B, 'UP 1: ICON 6 DOWN, WEAR 8 UP, COUNT UP 1'),
      option('C', C, 'UP 2: ICON 5 DOWN, WEAR 9 UP, COUNT UP 2'),
      caption('Hotbar, a backpack excerpt and 3x close-ups (real slot art at 2x).\nThe wear bar always keeps 1px clear below the 16px well; counts and wear never share a slot.'),
    ] }));
  });

  it('renders 06 slot size', () => {
    const five = HOTBAR.slice(0, 5);
    const option = (text: string, geometry: SlotGeometry, count: number) => column([label(text), hotbar(geometry, HOTBAR.slice(0, count), before)], 4);
    render('06-slot-size', 740, 470, () => uiWindow({ title: 'SLOT SIZE', layout: { direction: 'column', gap: 12 }, children: [
      option('TODAY 28x31, 16PX ICON (HOTBAR 298 WIDE)', A, 12),
      option('ROOMY 30x33, 16PX ICON, +1PX PADDING EACH SIDE (HOTBAR 318 WIDE)', ROOMY, 12),
      row([
        column([label('TODAY 3X'), row([zoom(A, five[0]!, before, 3, { hotkey: '1', selected: true }), zoom(A, five[3]!, before, 3, { hotkey: '4' })], 4)], 4),
        column([label('ROOMY 3X'), row([zoom(ROOMY, five[0]!, before, 3, { hotkey: '1', selected: true }), zoom(ROOMY, five[3]!, before, 3, { hotkey: '4' })], 4)], 4),
        column([label('2X LARGE 56x62, 32PX ICON (COMPARISON)'), row(five.map((item, index) => uiSlot({ stack: item, artwork: before, hotkey: hotkey(index), selected: index === 0, layout: { width: uiFixed(56), height: uiFixed(62) } })))], 4),
      ], 16),
      caption('The UI scale is 1x, 2x or 3x and item art is drawn 1:1 in a 16px well, so nothing is scaled by a fraction.\nA 20px icon (1.25x) would blur or double pixels unevenly, so only whole-pixel frames and 2x art are offered.'),
    ] }));
  });

  it('renders 07 new small icons', () => {
    const header = row([label('ITEM').setStyle({ width: uiFixed(100) }), label('TODAY').setStyle({ width: uiFixed(40) }), label('NEW').setStyle({ width: uiFixed(40) }), label('PACK').setStyle({ width: uiFixed(40) }), label('NEW ART 3X')], 6);
    const line = (kind: string) => row([
      caption(itemDefinition(kind)?.displayName ?? kind).setStyle({ width: uiFixed(100) }),
      slot(A, stack(kind, QUANTITY[kind]), before).setStyle({ width: uiFixed(28) }), ui.flex({ width: uiFixed(12) }, []),
      slot(A, stack(kind, QUANTITY[kind]), after), ui.flex({ width: uiFixed(12) }, []),
      pack[kind] ? slot(A, stack(kind, QUANTITY[kind]), pack) : ui.flex({ width: uiFixed(28), height: uiFixed(31) }, []), ui.flex({ width: uiFixed(12) }, []),
      iconZoom(after[kind], 3).setStyle({ width: uiFixed(52), height: uiFixed(52) }),
    ], 6, 'center');
    const reference = ['pickaxe', 'strawberry', 'tomato', 'stone', 'wheat_seeds', 'wood', 'torch'];
    const mixed = [stack('axe', 1, .8), stack('apple', 32), stack('cherry', 12), stack('pear', 6), stack('peach', 2), stack('strawberry', 5), stack('tomato', 3), stack('arrow', 24), stack('pebble', 14), stack('guardian_seal')];
    render('07-new-small-icons', 820, 640, () => uiWindow({ title: 'NEW 16PX ICONS', layout: { direction: 'row', gap: 16, align: 'start' }, children: [
      column([header, column(SMALL.slice(0, 4).map(line), 4), column(SMALL.slice(4).map(line), 4)], 6),
      column([
        label('EXISTING ICONS (DENSITY)'), row(reference.map(kind => slot(A, stack(kind), before))),
        label('HOTBAR TODAY'), hotbar(A, mixed, before),
        label('HOTBAR WITH NEW ICONS'), hotbar(A, mixed, after),
        label('WITH PACK FRUIT (KENMI PREMIUM)'), hotbar(A, mixed, { ...after, ...pack }),
        caption('NEW: project-drawn 16x16 icons, 12-14px of\ncontent, pack palette, 1px outline, light\nfrom the top left. PACK: the licensed Kenmi\npremium Farming/Weapons icon for comparison.\nDrawn in slots with today\'s offsets (A).'),
      ], 6),
    ] }));
  });
});
