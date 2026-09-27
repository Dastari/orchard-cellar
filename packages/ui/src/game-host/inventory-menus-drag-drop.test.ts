/// <reference types="node" />
// BUG-051: a stack picked up by dragging is put down where it is released. Real OverworldUi and kit root, real art
// painted every step, and a sim-backed authority that answers each reducer call on the next frame, as live does.
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, itemDefinition, type ContainerSnapshot, type ItemStack } from '@orchard/sim';
import { BACKPACK_SLOT_OFFSET, EQUIPMENT_SLOT_OFFSET, EQUIPMENT_SLOT_COUNT, EQUIPMENT_SLOT_RESTRICTIONS, HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { clickContainerSlot, itemPolicyResolver } from '@orchard/sim/item-containers';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiItemArt, type OverworldUiModel } from '../overworld-ui.js';
import type { UiSkin } from '../skin.js';
import type { LoadedAsset } from '../assets.js';
import type { UiElement } from '../kit/runtime/element.js';
import { uiSlotDropTarget } from '../kit/components/inventory.js';
import { uiTestArt, uiTestAsset } from '../kit/lab/testing/art.js';

const registry = bootstrapContentRegistry(), policy = itemPolicyResolver(registry);
const skinSource = readFileSync(new URL('../skin.ts', import.meta.url), 'utf8');
const SKIN = Object.fromEntries([...skinSource.slice(skinSource.indexOf('const UI_ASSETS')).matchAll(/^\s+(\w+): "([\w_]+)",$/gmu)].map(m => [m[1], m[2]]));
const asset = (name: string): LoadedAsset => { for (const c of ['ui', 'props']) { try { return uiTestAsset(name, c); } catch { /* next */ } } throw new Error(name); };
const skin = new Proxy({}, { get: (_t, k) => typeof k === 'string' && SKIN[k] ? asset(SKIN[k]!) : undefined }) as UiSkin;
const itemArt = new Proxy({}, { get: (_t, k) => { if (typeof k !== 'string') return undefined; if (k === 'missing' || k === 'avatar') return asset('ui_cf_slot'); const i = itemDefinition(k)?.iconKey; return i ? asset(i) : undefined; } }) as OverworldUiItemArt;

async function run(release: 'origin' | 'backpack' | 'helm', viaRefuser: boolean) {
  const art = await uiTestArt();
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1), querySelector: () => null });
  const state = { inventory: new Map<number, ItemStack>([[5, { itemKind: 'arrow', quantity: 12 }], [BACKPACK_SLOT_OFFSET, { itemKind: 'arrow', quantity: 22 }]]), cursor: null as ItemStack | null };
  const containers = (): Record<string, ContainerSnapshot> => ({
    hotbar: { id: 'hotbar', capacity: HOTBAR_SLOT_COUNT, slots: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, i) => state.inventory.get(i) ?? null) },
    backpack: { id: 'backpack', capacity: 20, slots: Array.from({ length: 20 }, (_, i) => state.inventory.get(BACKPACK_SLOT_OFFSET + i) ?? null) },
    equipment: { id: 'equipment', capacity: EQUIPMENT_SLOT_COUNT, slots: Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, i) => state.inventory.get(EQUIPMENT_SLOT_OFFSET + i) ?? null), restrictions: EQUIPMENT_SLOT_RESTRICTIONS },
  });
  const offsets: Record<string, number> = { hotbar: 0, backpack: BACKPACK_SLOT_OFFSET, equipment: EQUIPMENT_SLOT_OFFSET };
  const clicks: string[] = [];
  const pending: (() => void)[] = [];
  const inventoryCursorClick = vi.fn((container: string, index: number, button: 'left' | 'right') => {
    const result = clickContainerSlot(containers(), state.cursor, { container, index, button }, policy);
    clicks.push(`${container}/${index}:${result.ok ? result.outcome : result.code}`);
    if (!result.ok) return Promise.reject(new Error(result.code));
    return new Promise<void>(resolve => pending.push(() => {
      for (const [id, c] of Object.entries(result.containers)) c.slots.forEach((s, i) => { const k = offsets[id]! + i; if (s) state.inventory.set(k, s); else state.inventory.delete(k); });
      state.cursor = result.cursor; resolve();
    }));
  });
  const handlers = new Proxy({ inventoryCursorClick } as Partial<OverworldUiCallbacks>, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? vi.fn() }) as OverworldUiCallbacks;
  const ui = new OverworldUi(skin, art.pixel, itemArt, handlers);
  const model = (): OverworldUiModel => ({ width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0, touchControls: false,
    inventory: [...state.inventory].map(([slot, s]) => ({ slot, ...s })), cursorStack: state.cursor, hasBackpack: true, backpackSlotCapacity: 20, contentRegistry: registry,
    activeFrameState: {}, knownRecipeIds: [], audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null } as OverworldUiModel);
  ui.update(model()); ui.openWindow = 'inventory';
  const root = ui.enableRetainedInventory(art);
  const context = createCanvas(480, 270).getContext('2d') as unknown as CanvasRenderingContext2D;
  // One frame: the server answers anything pending, the client updates and paints.
  const frame = async () => { while (pending.length) pending.shift()!(); await Promise.resolve(); await Promise.resolve(); ui.update(model()); ui.draw(context, false); ui.drawCursorOverlay(context); };
  const slot = (c: string, i: number): UiElement => { root.arrange(); return root.entries().find(({ element }) => { const r = element.props['binding'] as { container: string; index: number } | undefined; return r?.container === c && r.index === i; })!.element; };
  const centre = (n: UiElement) => ({ x: Math.round(n.rect.x + n.rect.width / 2), y: Math.round(n.rect.y + n.rect.height / 2) });
  const ev = async (type: 'down' | 'move' | 'up', p: { x: number; y: number }) => { ui.systemCursorMove(p); root.pointer({ type, point: p, pointerId: 1, button: 0, pointerType: 'mouse', isPrimary: true }); await frame(); };
  await frame();
  const origin = centre(slot('hotbar', 5)), helm = centre(slot('equipment', 1)), bag = centre(slot('backpack', 7));
  const mid = { x: Math.round((origin.x + helm.x) / 2), y: Math.round((origin.y + helm.y) / 2) };
  const path = (from: { x: number; y: number }, to: { x: number; y: number }) => Array.from({ length: 8 }, (_, i) => ({ x: Math.round(from.x + (to.x - from.x) * (i + 1) / 8), y: Math.round(from.y + (to.y - from.y) * (i + 1) / 8) }));
  await ev('move', origin); await ev('down', origin);
  let at = origin;
  if (viaRefuser) { for (const p of [...path(at, mid), ...path(mid, helm)]) await ev('move', p); at = helm; for (const p of path(at, mid)) await ev('move', p); at = mid; }
  const end = release === 'origin' ? origin : release === 'backpack' ? bag : helm;
  for (const p of path(at, end)) await ev('move', p);
  // What the kit shows just before the release: the origin's verdict is fresh after crossing the refuser.
  const originVerdict = uiSlotDropTarget(slot('hotbar', 5));
  await ev('up', end);
  const menus = (ui as unknown as { retainedMenus: { controller: { refusalFrame(ref: { container: string; index: number }, now: number): number } } }).retainedMenus;
  const helmFlash = menus.controller.refusalFrame({ container: 'equipment', index: 1 }, performance.now());
  await frame(); await frame();
  ui.disposeRetainedInventory();
  return { originVerdict, helmFlash, clicks, cursor: state.cursor, hotbar5: state.inventory.get(5) ?? null, bag7: state.inventory.get(BACKPACK_SLOT_OFFSET + 7) ?? null };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const arrows = { itemKind: 'arrow', quantity: 12 };

describe('BUG-051: a dragged stack is put down where it is released', () => {
  it('back on its origin after crossing the helmet slot, which refuses it (the live repro)', async () => {
    const result = await run('origin', true);
    expect(result.originVerdict).toBe('accept');
    expect(result.clicks).toEqual(['hotbar/5:pickup', 'hotbar/5:place']);
    expect(result).toMatchObject({ cursor: null, hotbar5: arrows, helmFlash: 0 });
  });
  it('on another slot that accepts it, whether or not it crossed a refuser', async () => {
    for (const via of [true, false]) {
      const result = await run('backpack', via);
      expect(result.clicks, `via ${via}`).toEqual(['hotbar/5:pickup', 'backpack/7:place']);
      expect(result).toMatchObject({ cursor: null, hotbar5: null, bag7: arrows });
    }
  });
  it('not on a slot that refuses it: the stack stays held, no reducer runs for it, and the slot flashes', async () => {
    const result = await run('helm', false);
    expect(result.clicks).toEqual(['hotbar/5:pickup']);
    expect(result).toMatchObject({ cursor: arrows, hotbar5: null, helmFlash: 1 });
  });
});
