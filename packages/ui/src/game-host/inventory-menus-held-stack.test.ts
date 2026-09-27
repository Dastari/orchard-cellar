import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, itemDefinition, type ContainerSnapshot, type ItemStack, type SlotRestriction } from '@orchard/sim';
import { frameRestrictions } from '@orchard/sim/content/frame-runtime';
import { BACKPACK_SLOT_OFFSET, CRAFTING_SLOT_COUNT, CRAFTING_SLOT_OFFSET, EQUIPMENT_SLOT_COUNT, EQUIPMENT_SLOT_OFFSET, EQUIPMENT_SLOT_RESTRICTIONS, HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { clickContainerSlot, itemPolicyResolver } from '@orchard/sim/item-containers';
import { uiSlotDropTarget } from '../kit/components/inventory.js';
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

  it('forgets a refused flash when the window closes, and a late refusal never flashes the reopened slot', async () => {
    let reject!: (error: Error) => void;
    const click = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const f = await fixture('inventory', { cursorStack: { itemKind: 'apple', quantity: 3 } }, { inventoryCursorClick: click });
    try {
      const ref = { container: 'backpack', index: 4 }, at = f.centre(f.slot(ref.container, ref.index));
      f.menus.controller.refuse([ref]);
      expect(f.menus.controller.refusalFrame(ref, performance.now())).toBe(1);
      f.ui.openWindow = null;
      expect(f.menus.controller.refusalFrame(ref, performance.now())).toBe(0);
      f.ui.openWindow = 'inventory';
      const node = f.slot(ref.container, ref.index);
      f.move(at); f.root.pointer({ type: 'down', point: f.centre(node), pointerId: 1, button: 0 }); f.root.pointer({ type: 'up', point: f.centre(node), pointerId: 1, button: 0 });
      expect(click).toHaveBeenCalledOnce();
      // The window closes and reopens before the server answers.
      f.ui.openWindow = null; f.ui.openWindow = 'inventory'; f.slot(ref.container, ref.index);
      reject(new Error('slot_rejects_item')); await new Promise(resolve => setTimeout(resolve, 0));
      expect(f.menus.controller.refusalFrame(ref, performance.now())).toBe(0);
    } finally { f.dispose(); }
  });

  it('checks no drop rule again across frames while nothing changes, and looks slots up without rebuilding them', async () => {
    const f = await fixture('content', { activeFrameId: 'frame:furnace', cursorStack: ore, openPlaceableInventory: [{ slot: 2, itemKind: 'copper_bar', quantity: 2 }],
      inventory: Array.from({ length: 12 }, (_, index) => ({ slot: BACKPACK_SLOT_OFFSET + index, itemKind: index % 2 ? 'wood' : 'apple', quantity: 3 })) });
    try {
      const canAccept = vi.spyOn(f.menus.controller.model, 'canAccept');
      const rebuilds = vi.spyOn(f.ui as unknown as { retainedFrame(): unknown }, 'retainedFrame');
      const model = (f.ui as unknown as { model: OverworldUiModel }).model;
      const context = createCanvas(480, 270).getContext('2d') as unknown as CanvasRenderingContext2D;
      // One production frame: a fresh model, then the window and the cursor pass.
      const frame = () => { f.ui.update({ ...model }); f.ui.draw(context, false); f.ui.drawCursorOverlay(context); };
      f.move(f.centre(f.slot('placeable', 1)));
      frame();
      const slots = f.root.entries().filter(({ element }) => element.props['binding'] !== undefined).length;
      expect(canAccept.mock.calls.length).toBeGreaterThan(0); expect(canAccept.mock.calls.length).toBeLessThanOrEqual(slots);
      canAccept.mockClear(); rebuilds.mockClear();
      for (let index = 0; index < 5; index++) frame();
      expect(canAccept).not.toHaveBeenCalled();
      // The retained slot set is rebuilt at most once per frame (a few frame lookups each), not once per slot lookup.
      expect(rebuilds.mock.calls.length).toBeLessThanOrEqual(5 * 6);
      // A different held item re-checks each slot once.
      f.ui.update({ ...model, cursorStack: { itemKind: 'wood', quantity: 4 } }); f.ui.draw(context, false);
      expect(canAccept.mock.calls.length).toBeGreaterThan(0); expect(canAccept.mock.calls.length).toBeLessThanOrEqual(slots);
    } finally { f.dispose(); }
  });
});

/** The containers as the authority loads them for a menu (world `loadOpenMenuInventory`): equipment restricted by the
 * equipment slots, an entity by its frame's panes overlaid with its object's own container rules, the rest free. */
function authorityContainers(model: OverworldUiModel, frameId: string | undefined): Record<string, ContainerSnapshot> {
  const inventory = new Map(model.inventory.map(item => [item.slot, item]));
  const row = (offset: number, count: number) => Array.from({ length: count }, (_, index) => { const item = inventory.get(offset + index); return item ? { itemKind: item.itemKind, quantity: item.quantity } : null; });
  const containers: Record<string, ContainerSnapshot> = {
    hotbar: { id: 'hotbar', capacity: HOTBAR_SLOT_COUNT, slots: row(0, HOTBAR_SLOT_COUNT) },
    backpack: { id: 'backpack', capacity: model.backpackSlotCapacity!, slots: row(BACKPACK_SLOT_OFFSET, model.backpackSlotCapacity!) },
    equipment: { id: 'equipment', capacity: EQUIPMENT_SLOT_COUNT, slots: row(EQUIPMENT_SLOT_OFFSET, EQUIPMENT_SLOT_COUNT), restrictions: EQUIPMENT_SLOT_RESTRICTIONS },
    crafting: { id: 'crafting', capacity: CRAFTING_SLOT_COUNT, slots: row(CRAFTING_SLOT_OFFSET, CRAFTING_SLOT_COUNT) },
  };
  const frame = frameId ? registry.frames.get(frameId) : undefined;
  if (frame) {
    const restrictions: Record<number, SlotRestriction> = { ...frameRestrictions(frame, registry) };
    const object = [...registry.objects.values()].find(definition => definition.components.frame?.ref === frame.id);
    for (const rule of object?.components.container?.restrictions ?? []) for (const slot of rule.slots) restrictions[slot] = { ...restrictions[slot], ...(rule.readOnly === undefined ? {} : { readOnly: rule.readOnly }) };
    const id = frame.presentation?.entityContainer === 'chest' ? 'chest' : 'placeable';
    const stored = new Map(((id === 'chest' ? model.openChestInventory : model.openPlaceableInventory) ?? []).map(item => [item.slot, item]));
    const capacity = Math.max(16, ...stored.keys()) + 1;
    containers[id] = { id, capacity, slots: Array.from({ length: capacity }, (_, index) => { const item = stored.get(index); return item ? { itemKind: item.itemKind, quantity: item.quantity } : null; }), restrictions };
  }
  return containers;
}

describe('every kit drop verdict is the authority\'s click outcome (S3 review)', () => {
  const held = ['copper_ore', 'wood', 'helm', 'apple', 'pickaxe', 'copper_bar', 'watch', 'backpack'];
  const scenes: readonly { readonly name: string; readonly window: OverworldWindow; readonly model: Partial<OverworldUiModel> }[] = [
    { name: 'inventory: paper doll, an occupied restricted head, occupied backpack cells', window: 'inventory', model: {
      inventory: [{ slot: EQUIPMENT_SLOT_OFFSET + 1, itemKind: 'helm', quantity: 1 }, { slot: BACKPACK_SLOT_OFFSET, itemKind: 'apple', quantity: 3 },
        { slot: BACKPACK_SLOT_OFFSET + 1, itemKind: 'wood', quantity: 4 }, { slot: 2, itemKind: 'torch', quantity: 2 }] } },
    { name: 'furnace: role slots, an occupied input and a take-only output', window: 'content', model: { activeFrameId: 'frame:furnace',
      openPlaceableInventory: [{ slot: 0, itemKind: 'copper_ore', quantity: 3 }, { slot: 2, itemKind: 'copper_bar', quantity: 2 }] } },
    { name: 'press: two take-only outputs', window: 'content', model: { activeFrameId: 'frame:press', openPlaceableInventory: [{ slot: 1, itemKind: 'must', quantity: 1 }] } },
    { name: 'chest: an unrestricted pane with occupied cells (swaps allowed)', window: 'chest', model: { activeFrameId: 'frame:chest',
      openChestInventory: [{ slot: 0, itemKind: 'apple', quantity: 5 }, { slot: 3, itemKind: 'pickaxe', quantity: 1 }] } },
  ];
  it.each(scenes)('$name', async ({ window, model: overrides }) => {
    for (const itemKind of held) {
      const cursor = { itemKind, quantity: 1 };
      const f = await fixture(window, { ...overrides, cursorStack: cursor });
      try {
        expect(f.ui.retainedInventoryActive).toBe(true);
        const model = (f.ui as unknown as { model: OverworldUiModel }).model, containers = authorityContainers(model, model.activeFrameId);
        const policy = itemPolicyResolver(registry);
        f.root.arrange();
        const bound = f.root.entries().flatMap(({ element }) => { const ref = element.props['binding'] as { container: string; index: number } | undefined; return ref ? [{ element, ref }] : []; });
        expect(bound.length).toBeGreaterThan(10);
        let refusals = 0;
        for (const { element, ref } of bound) {
          if (!containers[ref.container] || ref.index >= containers[ref.container]!.capacity) continue;
          const result = clickContainerSlot(containers, cursor, { container: ref.container, index: ref.index, button: 'left' }, policy);
          const refused = !result.ok && result.code === 'slot_rejects_item';
          expect(uiSlotDropTarget(element), `${itemKind} over ${ref.container}/${ref.index}: ${result.ok ? result.outcome : result.code}`).toBe(refused ? 'refuse' : 'accept');
          if (refused) refusals++;
        }
        if (window !== 'chest') expect(refusals, itemKind).toBeGreaterThan(0);
      } finally { f.dispose(); }
    }
  });
});
