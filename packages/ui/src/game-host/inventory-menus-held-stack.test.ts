import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, itemDefinition, type ItemStack } from '@orchard/sim';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiItemArt, type OverworldUiModel, type OverworldWindow } from '../overworld-ui.js';
import type { UiSkin } from '../skin.js';
import type { LoadedAsset } from '../assets.js';
import type { UiPoint } from '../geometry.js';
import type { UiElement } from '../kit/runtime/element.js';
import type { UiRoot } from '../kit/runtime/root.js';
import type { InventoryMenus } from './inventory-menus.js';
import { uiTestArt, uiTestAsset } from '../kit/lab/testing/art.js';

// Item slot S3: the host no longer paints the held stack or the spread corners; the kit does, over every inventory
// window (wiki Roadmap/Item Slot Component).

const registry = bootstrapContentRegistry();
const skinSource = readFileSync(new URL('../skin.ts', import.meta.url), 'utf8');
const SKIN_NAMES = Object.fromEntries([...skinSource.slice(skinSource.indexOf('const UI_ASSETS')).matchAll(/^\s+(\w+): "([\w_]+)",$/gmu)].map(match => [match[1], match[2]]));
function asset(name: string): LoadedAsset {
  for (const category of name.startsWith('item_') || name.startsWith('prop_') ? ['props', 'ui'] : ['ui', 'props']) {
    try { return uiTestAsset(name, category); } catch { /* the other category */ }
  }
  throw new Error(`Missing test asset ${name}`);
}
/** The host's legacy skin and item art, loaded from the real sprite sources (the hearth stash still paints with them). */
const skin = new Proxy({}, { get: (_target, key) => typeof key === 'string' && SKIN_NAMES[key] ? asset(SKIN_NAMES[key]!) : undefined }) as UiSkin;
const itemArt = new Proxy({}, { get: (_target, key) => {
  if (typeof key !== 'string') return undefined;
  if (key === 'missing' || key === 'avatar') return asset('ui_cf_slot');
  const icon = itemDefinition(key)?.iconKey; return icon ? asset(icon) : undefined;
} }) as OverworldUiItemArt;

async function fixture(window: OverworldWindow, overrides: Partial<OverworldUiModel>, callbacks: Partial<OverworldUiCallbacks> = {}) {
  const art = await uiTestArt();
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1), querySelector: () => null });
  const handlers = new Proxy(callbacks, { get: (target, key) => (target as Record<string | symbol, unknown>)[key] ?? vi.fn() }) as OverworldUiCallbacks;
  const ui = new OverworldUi(skin, art.pixel, itemArt, handlers);
  const model = { width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0, touchControls: false,
    inventory: [{ slot: 10, itemKind: 'wood', quantity: 8 }], hasBackpack: true, backpackSlotCapacity: 20, contentRegistry: registry,
    activeFrameState: {}, knownRecipeIds: [], audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null, ...overrides } as OverworldUiModel;
  ui.update(model); ui.openWindow = window;
  const root: UiRoot = ui.enableRetainedInventory(art);
  const menus = (ui as unknown as { retainedMenus: InventoryMenus }).retainedMenus;
  const slot = (container: string, index: number): UiElement => {
    root.arrange();
    const node = root.entries().find(({ element }) => { const ref = element.props['binding'] as { container: string; index: number } | undefined; return ref?.container === container && ref.index === index; })?.element;
    if (!node) throw new Error(`Missing kit slot ${container}/${index}`); return node;
  };
  const centre = (node: UiElement): UiPoint => ({ x: Math.round(node.rect.x + node.rect.width / 2), y: Math.round(node.rect.y + node.rect.height / 2) });
  const move = (point: UiPoint) => { ui.systemCursorMove(point); root.pointer({ type: 'move', point, pointerId: 1, button: -1 }); };
  /** The cursor overlay pass alone, on a transparent canvas: returns the alpha of a point. */
  const overlay = () => {
    const canvas = createCanvas(480, 270), context = canvas.getContext('2d');
    ui.drawCursorOverlay(context as unknown as CanvasRenderingContext2D);
    return (x: number, y: number, width = 1, height = 1) => { let sum = 0; const data = context.getImageData(x, y, width, height).data; for (let i = 3; i < data.length; i += 4) sum += data[i]!; return sum; };
  };
  return { ui, root, menus, slot, centre, move, overlay, dispose: () => ui.disposeRetainedInventory() };
}
const ore: ItemStack = { itemKind: 'copper_ore', quantity: 12 };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the held stack is the kit\'s (S3)', () => {
  it('follows the pointer in the cursor pass, and wears the pack cross only over a slot that refuses it', async () => {
    const f = await fixture('content', { activeFrameId: 'frame:furnace', cursorStack: ore });
    try {
      const input = f.centre(f.slot('placeable', 0)), fuel = f.centre(f.slot('placeable', 1));
      f.move(input); let alpha = f.overlay();
      // The held stack's face is 28x31 centred on the pointer, left and above the cursor arrow's hotspot.
      expect(alpha(input.x - 12, input.y - 12)).toBeGreaterThan(0);
      const badge = (at: UiPoint, read: ReturnType<typeof f.overlay>) => read(at.x - 17, at.y - 18, 3, 12) + read(at.x - 14, at.y - 18, 12, 3);
      expect(badge(input, alpha)).toBe(0);
      f.move(fuel); alpha = f.overlay();
      expect(alpha(fuel.x - 12, fuel.y - 12)).toBeGreaterThan(0);
      expect(badge(fuel, alpha)).toBeGreaterThan(0);
      // The verdict is the authority's: the kit fuel slot refuses ore, exactly as the gesture source does.
      expect(f.menus.controller.model.canAccept({ container: 'placeable', index: 1 }, ore)).toBe(false);
      expect(f.menus.controller.model.canAccept({ container: 'placeable', index: 0 }, ore)).toBe(true);
    } finally { f.dispose(); }
  });

  it('is gone once the window closes or nothing is held', async () => {
    const f = await fixture('content', { activeFrameId: 'frame:furnace', cursorStack: ore });
    try {
      const input = f.centre(f.slot('placeable', 0)); f.move(input);
      expect(f.overlay()(input.x - 12, input.y - 12)).toBeGreaterThan(0);
      f.ui.update({ ...(f.ui as unknown as { model: OverworldUiModel }).model, cursorStack: null });
      expect(f.overlay()(input.x - 12, input.y - 12)).toBe(0);
      f.ui.update({ ...(f.ui as unknown as { model: OverworldUiModel }).model, cursorStack: ore });
      expect(f.overlay()(input.x - 12, input.y - 12)).toBeGreaterThan(0);
      f.ui.openWindow = null;
      expect(f.overlay()(input.x - 12, input.y - 12)).toBe(0);
    } finally { f.dispose(); }
  });

  it('still shows over the hearth stash, the one inventory window the host draws itself', async () => {
    const f = await fixture('content', { activeFrameId: 'frame:hearth_stash', cursorStack: ore });
    try {
      expect(f.ui.retainedInventoryActive).toBe(false);
      const point = { x: 240, y: 135 }; f.ui.systemCursorMove(point);
      expect(f.overlay()(point.x - 12, point.y - 12)).toBeGreaterThan(0);
    } finally { f.dispose(); }
  });

  it('shows the original stack during a spread, marks the targets, and drops both when the press is cancelled', async () => {
    const apples: ItemStack = { itemKind: 'apple', quantity: 12 };
    const f = await fixture('inventory', { cursorStack: apples });
    try {
      const refs = [3, 4, 5].map(index => ({ container: 'backpack', index })), nodes = refs.map(ref => f.slot(ref.container, ref.index));
      f.move(f.centre(nodes[0]!)); f.root.pointer({ type: 'down', point: f.centre(nodes[0]!), pointerId: 1, button: 0 });
      f.move(f.centre(nodes[1]!)); f.move(f.centre(nodes[2]!));
      expect(refs.map(ref => f.menus.controller.spreadTarget(ref))).toEqual([true, true, true]);
      expect(f.menus.controller.model.displayedCursor()).toEqual(apples);
      f.root.pointer({ type: 'cancel', point: f.centre(nodes[2]!), pointerId: 1, button: 0 });
      expect(refs.map(ref => f.menus.controller.spreadTarget(ref))).toEqual([false, false, false]);
      expect(f.menus.controller.model.displayedCursor()).toEqual(apples);
    } finally { f.dispose(); }
  });

  it('flashes the slot a held stack is dropped on when the server refuses the move', async () => {
    let reject!: (error: Error) => void;
    const click = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const f = await fixture('inventory', { cursorStack: { itemKind: 'apple', quantity: 3 } }, { inventoryCursorClick: click });
    try {
      const ref = { container: 'backpack', index: 4 }, node = f.slot(ref.container, ref.index), at = f.centre(node);
      f.move(at); f.root.pointer({ type: 'down', point: at, pointerId: 1, button: 0 }); f.root.pointer({ type: 'up', point: at, pointerId: 1, button: 0 });
      expect(click).toHaveBeenCalledExactlyOnceWith('backpack', 4, 'left');
      expect(f.menus.controller.refusalFrame(ref, performance.now())).toBe(0);
      reject(new Error('slot_rejects_item')); await new Promise(resolve => setTimeout(resolve, 0));
      expect(f.menus.controller.refusalFrame(ref, performance.now())).toBe(1);
    } finally { f.dispose(); }
  });
});
