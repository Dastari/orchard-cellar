import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemStack } from '@orchard/sim';
import { EQUIPMENT_SLOTS } from '@orchard/sim/inventory-layout';
import { itemDefinition } from '@orchard/sim/item-containers';
import type { UiPoint, UiRect } from '../../geometry.js';
import type { LoadedAsset } from '../../assets.js';
import { drawOutlinedPixelText } from '../../pixel-ui.js';
import { selectAtlasFrame } from '../../sprite.js';
import { UiRoot } from '../runtime/root.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { UI_SLOT_REFUSED_FLASH_FRAME_MS, UiInventoryController, type UiInventoryModel } from '../runtime/inventory.js';
import { uiTestArt, uiTestAsset } from '../lab/testing/art.js';
import { paintUiSkin, type UiKitArt } from './art.js';
import { paintUiSelector } from './window.js';
import { UI_SLOT_INKS, UI_SLOT_REFUSER_ALPHA, uiHeldStack, uiHeldStackRect, uiItemFrame, uiSlot, uiSlotIconRect, type UiSlotOptions } from './inventory.js';
import { UiSlotController, UiSlotGestures, type UiSlotAuthority, type UiSlotRef } from './slot-controller.js';

// Item slot S3 (wiki Roadmap/Item Slot Component): the held stack, spread corners and drag feedback drawn by the kit.
// The oracles are the approval render's own prototype painters (renders 02 and 04, approved 2026-09-27), with the
// icon well and count at today's position B, as in S1.

const asset = (kind: string) => { const name = itemDefinition(kind)!.iconKey!; return uiTestAsset(name, name.startsWith('item_') || name.startsWith('prop_') ? 'props' : 'ui'); };
const artwork = { iron_ore: asset('iron_ore'), wood: asset('wood'), apple: asset('apple') };
const ore: ItemStack = { itemKind: 'iron_ore', quantity: 12 };
const SLOT = { x: 0, y: 0, width: 28, height: 31 };

/** The approval render's `drawIcon`. */
function icon(context: CanvasRenderingContext2D, r: UiRect, source: LoadedAsset): void {
  const frame = uiItemFrame(source)!, well = uiSlotIconRect(r), fit = Math.min(well.width / frame.width, well.height / frame.height);
  const width = Math.max(1, Math.round(frame.width * fit)), height = Math.max(1, Math.round(frame.height * fit));
  context.save(); context.imageSmoothingEnabled = false;
  context.drawImage(source.image, frame.x, frame.y, frame.width, frame.height, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2), width, height); context.restore();
}
/** The approval render's `face`: the idle slot face with its stack or placeholder, at an opacity. */
function face(context: CanvasRenderingContext2D, r: UiRect, kit: UiKitArt, options: { stack?: ItemStack; placeholder?: string; alpha?: number }): void {
  context.save(); context.globalAlpha *= options.alpha ?? 1;
  paintUiSkin(context, kit.skin.slot, 'slot.idle.0', r);
  if (options.stack) {
    icon(context, r, artwork[options.stack.itemKind as keyof typeof artwork]);
    if (options.stack.quantity > 1) drawOutlinedPixelText(context, kit.pixel, String(options.stack.quantity), r.x + r.width - 5, r.y + r.height - 15, { align: 'right', ...UI_SLOT_INKS });
  } else if (options.placeholder) paintUiSkin(context, kit.skin.equipment, `silhouette.${options.placeholder}`, r);
  context.restore();
}
/** The approval render's `heldAt`, badge being the pack cross (catalog icon 245) at 12px, 3px up and left. */
function heldAt(context: CanvasRenderingContext2D, kit: UiKitArt, x: number, y: number, badge: boolean): void {
  face(context, { x, y, width: 28, height: 31 }, kit, { stack: ore });
  if (!badge) return;
  const entry = kit.skin.icon['icon_catalog.catalog.0']!, frame = selectAtlasFrame(entry.asset.metadata, 'catalog', 245)!;
  context.drawImage(entry.asset.image, frame.x, frame.y, frame.width, frame.height, x - 3, y - 3, 12, 12);
}
/** The approval render painted each slot inside its own 28x31 cell, so corners stop at the slot's edge. */
function clipped(context: CanvasRenderingContext2D, r: UiRect, paint: () => void): void {
  context.save(); context.beginPath(); context.rect(r.x, r.y, r.width, r.height); context.clip(); paint(); context.restore();
}
/** The approval render's refused-drop frames. */
function flash(context: CanvasRenderingContext2D, kit: UiKitArt, r: UiRect, frame: 1 | 2): void {
  if (frame === 1) { context.save(); context.fillStyle = 'rgba(169, 54, 62, 0.45)'; context.fillRect(r.x + 3, r.y + 3, r.width - 6, r.height - 6); context.restore(); paintUiSelector(context, kit.skin.selector, 'deny', r, 1); }
  else paintUiSelector(context, kit.skin.selector, 'deny', r);
}

async function paint(element: UiElement, size: { width: number; height: number }, now = 0, before?: (root: UiRoot) => void): Promise<Buffer> {
  const root = new UiRoot({ art: await uiTestArt(), scale: 1 }); root.resize(size.width, size.height); root.mount(element); root.arrange();
  before?.(root);
  const canvas = createCanvas(size.width, size.height); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, now);
  const pixels = canvas.toBuffer('image/png'); root.dispose(); return pixels;
}
const oracle = (size: { width: number; height: number }, painter: (context: CanvasRenderingContext2D, kit: UiKitArt) => void) => paint(new UiElement({ kind: 'oracle',
  style: { width: uiFixed(size.width), height: uiFixed(size.height) }, paint(_element, { context, art }) { if (art) painter(context, art); } }), size);

/** A controller whose held stack and verdicts the test sets: `accepts` per slot index. */
function controllerFor(held: () => ItemStack | null, accepts: (index: number) => boolean = () => true, stack: (index: number) => ItemStack | null = () => null): UiInventoryController {
  const model: UiInventoryModel = {
    get cursor() { return held(); }, status: '', get dragging() { return false; }, stack: (ref) => stack(ref.index), displayedCursor: () => held(),
    canAccept: (ref) => accepts(ref.index), pointerDown: () => ({ type: 'none' }) as never, pointerEnter: () => false,
    pointerUp: () => ({ type: 'none' }) as never, cancel: () => undefined,
  };
  return new UiInventoryController(model);
}
const one = (options: Omit<UiSlotOptions, 'binding' | 'controller'>, controller: UiInventoryController, index = 0) => uiSlot({ artwork, binding: { container: 'chest', index }, controller, ...options });

afterEach(() => { vi.restoreAllMocks(); });

describe('dim refusers while carrying (render 02 B, 04 B)', () => {
  it('fades a refusing slot, empty or full, to 45% with its stack, exactly as approved', async () => {
    expect(UI_SLOT_REFUSER_ALPHA).toBe(.45);
    const refusing = controllerFor(() => ore, () => false);
    expect(await paint(one({}, refusing), SLOT)).toEqual(await oracle(SLOT, (context, kit) => face(context, SLOT, kit, { alpha: .45 })));
    const wood = { itemKind: 'wood', quantity: 9 };
    expect(await paint(one({}, controllerFor(() => ore, () => false, () => wood)), SLOT)).toEqual(await oracle(SLOT, (context, kit) => face(context, SLOT, kit, { stack: wood, alpha: .45 })));
  });

  it('fades the refusing equipment slots of the paper doll with their silhouettes (04 B)', async () => {
    const helm = { itemKind: 'helm', quantity: 1 };
    for (const slot of EQUIPMENT_SLOTS.slice(0, 8)) {
      if (slot.id === 'head') continue;
      const controller = controllerFor(() => helm, () => false);
      expect(await paint(uiSlot({ placeholder: slot.id, binding: { container: 'equipment', index: slot.index }, controller }), SLOT), slot.id)
        .toEqual(await oracle(SLOT, (context, kit) => face(context, SLOT, kit, { placeholder: slot.id, alpha: .45 })));
    }
  });

  it('dims only while a stack is held, never an accepting slot, and never a disabled one', async () => {
    let held: ItemStack | null = null;
    const controller = controllerFor(() => held, () => false);
    const plain = await oracle(SLOT, (context, kit) => face(context, SLOT, kit, {}));
    expect(await paint(one({}, controller), SLOT)).toEqual(plain);
    held = ore; controller.refresh();
    expect(await paint(one({}, controller), SLOT)).not.toEqual(plain);
    held = null; controller.refresh();
    expect(await paint(one({}, controller), SLOT)).toEqual(plain);
    expect(await paint(one({}, controllerFor(() => ore, () => true)), SLOT)).toEqual(plain);
    // A disabled slot keeps the approved grey face (01 B); it does not fade further.
    const grey = await paint(uiSlot({ state: { enabled: false } }), SLOT);
    expect(await paint(one({ state: { enabled: false } }, controllerFor(() => ore, () => false)), SLOT)).toEqual(grey);
  });

  it('keeps the slot under the pointer clear, with the red corners (render 02, "Held stack over a refusing slot")', async () => {
    const area = { width: 40, height: 40 };
    const slot = one({ layout: { position: 'absolute', inset: { left: uiFixed(6), top: uiFixed(5) } } }, controllerFor(() => ore, () => false));
    const hovered = await paint(new UiElement({ style: { width: uiFixed(40), height: uiFixed(40) }, children: [slot] }), area, 0,
      root => root.pointer({ type: 'move', point: { x: 20, y: 20 }, pointerId: 1, button: -1 }));
    const r = { x: 6, y: 5, width: 28, height: 31 };
    expect(hovered).toEqual(await oracle(area, (context, kit) => clipped(context, r, () => { face(context, r, kit, {}); paintUiSelector(context, kit.skin.selector, 'deny', r); })));
  });
});

describe('the held stack (uiHeldStack)', () => {
  const area = { width: 60, height: 60 }, point = { x: 30, y: 30 };
  it('draws the held stack centred on the pointer, with the pack cross over a refusing slot (render 02, "Pack cross")', async () => {
    const controller = controllerFor(() => ore);
    const at = uiHeldStackRect(point);
    expect(at).toEqual({ x: 16, y: 15, width: 28, height: 31 });
    expect(await paint(uiHeldStack({ controller, artwork, point: () => point, refusesAt: () => true }), area))
      .toEqual(await oracle(area, (context, kit) => heldAt(context, kit, at.x, at.y, true)));
    expect(await paint(uiHeldStack({ controller, artwork, point: () => point, refusesAt: () => false }), area))
      .toEqual(await oracle(area, (context, kit) => heldAt(context, kit, at.x, at.y, false)));
  });

  it('takes its badge verdict from the slot under the pointer, the same verdict that paints its red corners', async () => {
    let accepts = false;
    const controller = controllerFor(() => ore, () => accepts);
    const scene = () => new UiElement({ style: { width: uiFixed(60), height: uiFixed(60) }, children: [one({ layout: { position: 'absolute', inset: { left: uiFixed(16), top: uiFixed(15) } } }, controller), uiHeldStack({ controller, artwork, point: () => point })] });
    const refused = await paint(scene(), area);
    accepts = true; controller.refresh();
    const accepted = await paint(scene(), area);
    expect(refused).not.toEqual(accepted);
    // The badge is the only difference the held stack adds: the slot beneath is fully covered, bar its corners.
    expect(await paint(uiHeldStack({ controller, artwork, point: () => point, refusesAt: () => true }), area))
      .not.toEqual(await paint(uiHeldStack({ controller, artwork, point: () => point, refusesAt: () => false }), area));
  });

  it('follows the observed pointer, takes no input, and paints nothing while nothing is held', async () => {
    let stack: ItemStack | null = ore;
    const controller = controllerFor(() => stack);
    const held = uiHeldStack({ controller, artwork });
    const root = new UiRoot({ art: await uiTestArt(), scale: 1 }); root.resize(120, 80); root.mount(held); root.arrange();
    const draw = () => { const canvas = createCanvas(120, 80); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 0); return canvas; };
    const opaque = (canvas: Canvas, p: UiPoint) => canvas.getContext('2d').getImageData(p.x, p.y, 1, 1).data[3]!;
    expect(opaque(draw(), { x: 30, y: 30 })).toBe(0);
    root.pointer({ type: 'move', point: { x: 30, y: 30 }, pointerId: 1, button: -1 });
    expect(root.input.hits({ x: 30, y: 30 })).not.toContain(held);
    let canvas = draw(); expect(opaque(canvas, { x: 30, y: 30 })).toBe(255); expect(opaque(canvas, { x: 90, y: 50 })).toBe(0);
    root.pointer({ type: 'move', point: { x: 90, y: 50 }, pointerId: 1, button: -1 });
    canvas = draw(); expect(opaque(canvas, { x: 30, y: 30 })).toBe(0); expect(opaque(canvas, { x: 90, y: 50 })).toBe(255);
    stack = null; controller.refresh();
    canvas = draw(); expect(opaque(canvas, { x: 90, y: 50 })).toBe(0);
    root.dispose();
  });
});

describe('refused drop flash (render 02, about 300ms)', () => {
  it('plays frame 1 (wash, corners pushed out), then frame 2 (corners), then rests', async () => {
    expect(UI_SLOT_REFUSED_FLASH_FRAME_MS * 2).toBe(300);
    const controller = controllerFor(() => null), ref = { container: 'chest', index: 0 };
    controller.refuse([ref], 1000);
    const at = async (now: number) => paint(one({}, controller), SLOT, now);
    expect(await at(1000)).toEqual(await oracle(SLOT, (context, kit) => { face(context, SLOT, kit, {}); flash(context, kit, SLOT, 1); }));
    expect(await at(1149)).toEqual(await oracle(SLOT, (context, kit) => { face(context, SLOT, kit, {}); flash(context, kit, SLOT, 1); }));
    expect(await at(1150)).toEqual(await oracle(SLOT, (context, kit) => { face(context, SLOT, kit, {}); flash(context, kit, SLOT, 2); }));
    expect(await at(1300)).toEqual(await oracle(SLOT, (context, kit) => face(context, SLOT, kit, {})));
    expect(controller.refusalFrame(ref, 1000)).toBe(0);
    expect(controller.refusalFrame({ container: 'chest', index: 1 }, 1000)).toBe(0);
  });
});

/** One row of "bag" slots and a held stack, through the kit gesture state machine, as in slot-controller.test.ts. */
function gestures(slots: (ItemStack | null)[], held: ItemStack | null, refuse: (index: number) => boolean) {
  const state = { slots: [...slots], cursor: held };
  const authority = {
    click: vi.fn((ref: UiSlotRef) => {
      if (refuse(ref.index) && state.cursor !== null) return false;
      if (state.cursor === null) { const stack = state.slots[ref.index] ?? null; if (stack === null) return false; state.cursor = stack; state.slots[ref.index] = null; return true; }
      if (state.slots[ref.index] === null) { state.slots[ref.index] = state.cursor; state.cursor = null; return true; }
      return false;
    }),
    previewSpread: vi.fn(), cancelSpread: vi.fn(), spread: vi.fn(), quickMove: vi.fn(), quickMoveAll: vi.fn(), collect: vi.fn(), drop: vi.fn(), return: vi.fn(),
  } satisfies UiSlotAuthority;
  const machine = new UiSlotGestures({
    cursor: () => state.cursor, has: ref => ref.index < state.slots.length, stack: ref => state.slots[ref.index] ?? null,
    accepts: ref => !refuse(ref.index), maxStack: () => 99, quickMoveSources: () => ['bag'],
    slotAt: point => point.y < 31 && point.x >= 0 && point.x < slots.length * 30 ? { container: 'bag', index: Math.floor(point.x / 30) } : null,
  }, authority);
  const controller = new UiSlotController(machine, { contains: () => true });
  return { state, authority, machine, controller };
}
const bag = (index: number): UiSlotRef => ({ container: 'bag', index });
const centre = (index: number): UiPoint => ({ x: index * 30 + 15, y: 15 });

describe('refused drops reach the flash through the kit gesture', () => {
  it('flashes a slot a held stack is released over when it refuses it, and nothing else', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const { machine, controller, authority } = gestures([null, null], ore, index => index === 1);
    machine.begin(bag(1), centre(1), 0); machine.finish(centre(1), false, true);
    expect(authority.click).toHaveBeenCalledExactlyOnceWith(bag(1), 'left');
    expect(controller.refusalFrame(bag(1), 5000)).toBe(1);
    expect(controller.refusalFrame(bag(0), 5000)).toBe(0);
    // An accepted drop and a pickup never flash.
    machine.begin(bag(0), centre(0), 0); machine.finish(centre(0), false, true);
    expect(controller.refusalFrame(bag(0), 5000)).toBe(0);
    machine.begin(bag(0), centre(0), 0); machine.finish(centre(0), false, true);
    expect(controller.refusalFrame(bag(0), 5000)).toBe(0);
    controller.dispose();
  });

  it('flashes the slots a host reports as refused by the server', () => {
    const { machine, controller } = gestures([null, null, null], ore, () => false);
    vi.spyOn(performance, 'now').mockReturnValue(100);
    machine.refused([bag(0), bag(2)]);
    expect([0, 1, 2].map(index => controller.refusalFrame(bag(index), 100))).toEqual([1, 0, 1]);
    controller.dispose();
    // After dispose the controller no longer listens.
    machine.refused([bag(1)]); expect(controller.refusalFrame(bag(1), 100)).toBe(0);
  });
});

describe('spread corners (render 02, "Drag to spread")', () => {
  it('marks every previewed spread target, not a single-slot press or a press without a held stack', () => {
    const { machine, controller } = gestures([null, null, null, null], { itemKind: 'apple', quantity: 12 }, () => false);
    machine.begin(bag(0), centre(0), 0);
    expect(controller.spreadTarget(bag(0))).toBe(false);
    machine.move(centre(1), bag(1)); machine.move(centre(2), bag(2));
    expect([0, 1, 2, 3].map(index => controller.spreadTarget(bag(index)))).toEqual([true, true, true, false]);
    machine.cancel();
    expect(controller.spreadTarget(bag(0))).toBe(false);
    controller.dispose();
    const empty = gestures([{ itemKind: 'apple', quantity: 3 }, null], null, () => false);
    empty.machine.begin(bag(0), centre(0), 0); empty.machine.move(centre(1), bag(1));
    expect(empty.controller.spreadTarget(bag(0))).toBe(false); expect(empty.controller.spreadTarget(bag(1))).toBe(false);
    empty.controller.dispose();
  });

  it('paints white corners on each target and green on the one under the pointer (the kit selector, not the host\'s)', async () => {
    const apples = (quantity: number): ItemStack => ({ itemKind: 'apple', quantity });
    const { machine, controller } = gestures([apples(4), apples(4), apples(4), null], apples(12), () => false);
    machine.begin(bag(0), centre(0), 0); machine.move(centre(1), bag(1)); machine.move(centre(2), bag(2));
    const row = { width: 30 * 4, height: 40 };
    const scene = new UiElement({ style: { width: uiFixed(row.width), height: uiFixed(row.height) }, children: [0, 1, 2, 3].map(index => uiSlot({ artwork, binding: bag(index), controller, layout: { position: 'absolute', inset: { left: uiFixed(index * 30 + 1), top: uiFixed(4) } } })) });
    const pixels = await paint(scene, row, 0, root => root.pointer({ type: 'move', point: { x: 2 * 30 + 15, y: 20 }, pointerId: 1, button: -1 }));
    expect(pixels).toEqual(await oracle(row, (context, kit) => [0, 1, 2, 3].forEach(index => {
      const r = { x: index * 30 + 1, y: 4, width: 28, height: 31 };
      clipped(context, r, () => {
        face(context, r, kit, index < 3 ? { stack: apples(4) } : {});
        if (index < 3) paintUiSelector(context, kit.skin.selector, index === 2 ? 'confirm' : 'neutral', r);
      });
    })));
    controller.dispose();
  });
});
