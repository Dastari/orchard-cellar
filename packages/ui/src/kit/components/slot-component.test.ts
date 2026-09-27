import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { ItemStack, SlotRestriction } from '@orchard/sim';
import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { frameRestrictions } from '@orchard/sim/content/frame-runtime';
import { EQUIPMENT_SLOT_RESTRICTIONS } from '@orchard/sim/inventory-layout';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, itemDefinition, itemPolicyResolver, slotAcceptsItem } from '@orchard/sim/item-containers';
import { UiRoot } from '../runtime/root.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import type { LoadedAsset } from '../../assets.js';
import { drawOutlinedPixelText } from '../../pixel-ui.js';
import { selectAtlasFrame } from '../../sprite.js';
import { uiInventorySlotTone } from '../../design-system/inventory.js';
import { paintUiSkin, type UiKitArt } from './art.js';
import { paintUiSelector } from './window.js';
import { UiInventoryController, type UiInventoryModel } from '../runtime/inventory.js';
import { uiTestArt, uiTestAsset } from '../lab/testing/art.js';
import { UI_SLOT_INKS, uiItemFrame, uiSetSlotState, uiSlot, uiSlotIconRect, uiSlotView, uiInventoryGrid, type UiSlotOptions, type UiSlotState } from './inventory.js';
import { uiSlotArt, uiSlotArtPolicy } from './slot-art.js';
import { uiSlotAcceptsItem, uiSlotRestrictionFromRules, uiSlotRulesFromRestriction, type UiSlotRules } from './slot-rules.js';

const registry = bootstrapContentRegistry();
const policy = itemPolicyResolver(registry);
const itemKinds = [...registry.items.values()].map(({ id }) => id.slice('item:'.length));

describe('slot rules mirror the authority', () => {
  const restrictions: SlotRestriction[] = [
    ...[...registry.frames.values()].flatMap((frame) => Object.values(frameRestrictions(frame, registry))),
    ...Object.values(EQUIPMENT_SLOT_RESTRICTIONS),
    { rejectedKinds: ['wood'] }, { rejectedTags: ['item.tool'] },
    { acceptedKinds: ['wood', 'coal'], rejectedKinds: ['coal'] },
    { requiredTags: ['item.tool'], rejectedTags: ['tool.farming.cultivate'] },
  ];

  it('round-trips every authored restriction', () => {
    for (const restriction of restrictions) {
      expect(uiSlotRestrictionFromRules(uiSlotRulesFromRestriction(restriction)!)).toEqual(restriction);
    }
    expect(uiSlotRulesFromRestriction(undefined)).toBeUndefined();
  });

  it('accepts exactly what the server rule accepts, for every restriction and every item', () => {
    for (const restriction of [undefined, ...restrictions]) {
      const container = { id: 'slot', capacity: 1, slots: [null], ...(restriction ? { restrictions: { 0: restriction } } : {}) };
      const rules = uiSlotRulesFromRestriction(restriction);
      for (const itemKind of [...itemKinds, 'not_an_item']) {
        expect(uiSlotAcceptsItem(rules, itemKind, policy), `${JSON.stringify(restriction)} ${itemKind}`)
          .toBe(slotAcceptsItem(container, 0, itemKind, policy));
      }
    }
  });

  it('lets deny lists win, by item and by item type', () => {
    const rules: UiSlotRules = { allowItems: ['wood', 'coal', 'hoe'], denyItems: ['coal'], denyTags: ['tool.farming.cultivate'] };
    expect(uiSlotAcceptsItem(rules, 'wood', policy)).toBe(true);
    expect(uiSlotAcceptsItem(rules, 'coal', policy)).toBe(false);
    expect(uiSlotAcceptsItem(rules, 'hoe', policy)).toBe(false);
    expect(uiSlotAcceptsItem({ readOnly: true }, 'wood', policy)).toBe(false);
  });
});

describe('slot component art and unpainted state', () => {
  const stack: ItemStack = { itemKind: 'wood', quantity: 7 };
  const artwork = { wood: uiTestAsset('item_cf_wood', 'props') };
  const render = async (options: UiSlotOptions, change?: UiSlotState) => {
    const root = new UiRoot({ art: await uiTestArt(), scale: 1 }); root.resize(28, 31);
    const slot = uiSlot(options); root.mount(slot); if (change) uiSetSlotState(slot, change);
    const canvas = createCanvas(28, 31); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 0);
    const pixels = canvas.toBuffer('image/png'); root.dispose(); return pixels;
  };

  it('draws the same icon through a UiSlotArt as through the artwork shorthand', async () => {
    const baseline = await render({ stack, artwork });
    expect(await render({ stack: { itemKind: 'blank', quantity: 1 } })).not.toEqual(baseline);
    expect(await render({ stack, art: uiSlotArt({ artwork }) })).toEqual(baseline);
    expect(await render({ stack, art: uiSlotArt({ artwork: () => artwork }) })).toEqual(baseline);
    expect(await render({ stack, art: uiSlotArt({ artwork, iconAnimation: () => 'base', contentRegistry: () => registry }) }))
      .toEqual(await render({ stack, artwork, iconAnimation: () => 'base', contentRegistry: () => registry }));
  });

  it('keeps the look for rules, drag and pending, which have no approved paint', async () => {
    const baseline = await render({ stack, artwork });
    expect(await render({ stack, artwork, rules: { denyItems: ['wood'] }, drag: { source: true, target: false }, state: { pending: true } })).toEqual(baseline);
    expect(await render({ placeholder: { icon: { lucide: 'lock' } } })).toEqual(await render({}));
    // A state change repaints: re-enabling a disabled slot restores the ordinary face, and selected is the classic corners.
    expect(await render({ stack, artwork, state: { enabled: false } }, { pending: true })).toEqual(baseline);
    expect(await render({ stack, artwork }, { enabled: false })).toEqual(await render({ stack, artwork, state: { enabled: false } }));
    expect(await render({ stack, artwork, state: { selected: true } })).toEqual(await render({ stack, artwork, selected: true }));
    expect(await render({ stack, artwork, state: { selected: true } })).not.toEqual(baseline);
  });

  it('refuses the variants whose looks await approval', () => {
    expect(() => uiSlot({ variant: 'inline' })).toThrow('awaits owner approval');
    expect(() => uiSlot({ variant: 'well' })).toThrow('awaits owner approval');
    expect(() => uiSlot({ variant: 'slot' })).not.toThrow();
  });
});

// The approved looks (owner decisions 2026-09-27, wiki Roadmap/Item Slot Component renders 01 and 03). Each oracle
// is the approval render's own prototype painter, with the icon well and count at today's position B.
describe('approved slot states', () => {
  const r = { x: 0, y: 0, width: 28, height: 31 };
  const tea: ItemStack = { itemKind: 'orchard_tea', quantity: 3 };
  // Item art as the approval render loaded it: props for ground sprites, ui for icons.
  const asset = (kind: string) => { const name = itemDefinition(kind)!.iconKey!; return uiTestAsset(name, name.startsWith('item_') || name.startsWith('prop_') ? 'props' : 'ui'); };
  const art = { iron_ore: asset('iron_ore'), pickaxe: asset('pickaxe'), wood: asset('wood'), orchard_tea: asset('orchard_tea') };
  const paintRoot = async (element: UiElement, size = { width: 28, height: 31 }) => {
    const root = new UiRoot({ art: await uiTestArt(), scale: 1 }); root.resize(size.width, size.height); root.mount(element);
    const canvas = createCanvas(size.width, size.height); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 0);
    const pixels = canvas.toBuffer('image/png'); root.dispose(); return pixels;
  };
  const slotPixels = (options: UiSlotOptions) => paintRoot(uiSlot(options));
  const oracle = (paint: (context: CanvasRenderingContext2D, kit: UiKitArt) => void) => paintRoot(new UiElement({ kind: 'oracle', style: { width: uiFixed(28), height: uiFixed(31) },
    paint(_element, { context, art: kit }) { if (kit) paint(context, kit); } }));
  const icon = (context: CanvasRenderingContext2D, asset: LoadedAsset, alpha: number) => {
    const source = uiItemFrame(asset)!, well = uiSlotIconRect(r), fit = Math.min(well.width / source.width, well.height / source.height);
    const width = Math.max(1, Math.round(source.width * fit)), height = Math.max(1, Math.round(source.height * fit));
    context.save(); context.imageSmoothingEnabled = false; context.globalAlpha *= alpha;
    context.drawImage(asset.image, source.x, source.y, source.width, source.height, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2), width, height); context.restore();
  };
  const blocked = (context: CanvasRenderingContext2D, kit: UiKitArt, x: number, y: number, size: number) => {
    const entry = kit.skin.icon['icon_catalog.catalog.0']!, frame = selectAtlasFrame(entry.asset.metadata, 'catalog', 208)!;
    context.drawImage(entry.asset.image, frame.x, frame.y, frame.width, frame.height, x, y, size, size);
  };
  const grey = (context: CanvasRenderingContext2D, kit: UiKitArt) => paintUiSkin(context, kit.skin.slot, 'slot.disabled.0', r);
  const count = (context: CanvasRenderingContext2D, kit: UiKitArt, text: string) => drawOutlinedPixelText(context, kit.pixel, text, 23, 16, { align: 'right', ...UI_SLOT_INKS });

  it('paints disabled as the pack\'s grey face with the item at 50% and its count (01 B)', async () => {
    const empty = await oracle(grey);
    expect(await slotPixels({ state: { enabled: false } })).toEqual(empty);
    const withItem = await oracle((context, kit) => { grey(context, kit); icon(context, art.iron_ore, .5); count(context, kit, '5'); });
    expect(await slotPixels({ artwork: art, stack: { itemKind: 'iron_ore', quantity: 5 }, state: { enabled: false } })).toEqual(withItem);
    // Every way a slot is disabled paints the one approved face: the legacy option, the cell flag and setDisabled.
    expect(await slotPixels({ artwork: art, stack: { itemKind: 'iron_ore', quantity: 5 }, disabled: true })).toEqual(withItem);
    const external = uiSlot({ artwork: art, stack: { itemKind: 'iron_ore', quantity: 5 } }); external.setDisabled(true);
    expect(await paintRoot(external)).toEqual(withItem);
    // The item's quality face gives way to the grey face, and a disabled tool shows no wear bar.
    expect(await slotPixels({ artwork: art, stack: { itemKind: 'pickaxe', quantity: 1, durability: 10 }, state: { enabled: false } }))
      .toEqual(await oracle((context, kit) => { grey(context, kit); icon(context, art.pickaxe, .5); }));
  });

  it('paints locked as the grey face plus the red blocked mark, in the corner over an item (01 C)', async () => {
    expect(await slotPixels({ state: { locked: { reason: 'Needs Smithing 3' } } })).toEqual(await oracle((context, kit) => { grey(context, kit); blocked(context, kit, 6, 7, 16); }));
    expect(await slotPixels({ artwork: art, stack: { itemKind: 'pickaxe', quantity: 1 }, state: { locked: { reason: 'Needs Mining 2' } } }))
      .toEqual(await oracle((context, kit) => { grey(context, kit); icon(context, art.pickaxe, .5); blocked(context, kit, 1, 1, 12); }));
    // A locked slot hides any placeholder under its mark.
    expect(await slotPixels({ placeholder: 'main_hand', state: { locked: { reason: 'Needs a level' } } })).toEqual(await slotPixels({ state: { locked: { reason: 'Needs a level' } } }));
    // Under the pointer it shows the red corners. The kit never hovers a disabled slot today, so the paint is forced.
    const locked = uiSlot({ state: { locked: { reason: 'Needs a pack' } } });
    const hovered = new UiElement({ kind: 'hovered', style: { width: uiFixed(28), height: uiFixed(31) }, paint(element, paint) { locked.hooks.paint!(element, { ...paint, hovered: true }); } });
    expect(await paintRoot(hovered)).toEqual(await oracle((context, kit) => { grey(context, kit); blocked(context, kit, 6, 7, 16); paintUiSelector(context, kit.skin.selector, 'deny', r); }));
  });

  it('paints an item placeholder as a flat silhouette of that item\'s art, only while the slot is empty (03 A)', async () => {
    const silhouette = (asset: LoadedAsset) => oracle((context, kit) => {
      paintUiSkin(context, kit.skin.slot, 'slot.idle.0', r);
      const source = uiItemFrame(asset)!, well = uiSlotIconRect(r), fit = Math.min(well.width / source.width, well.height / source.height);
      const width = Math.max(1, Math.round(source.width * fit)), height = Math.max(1, Math.round(source.height * fit));
      const tmp = createCanvas(width, height), t = tmp.getContext('2d');
      t.imageSmoothingEnabled = false; t.drawImage(asset.image as never, source.x, source.y, source.width, source.height, 0, 0, width, height);
      t.globalCompositeOperation = 'source-in'; t.fillStyle = '#8d6e55'; t.fillRect(0, 0, width, height);
      context.save(); context.globalAlpha *= .55; context.drawImage(tmp as never, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2)); context.restore();
    });
    expect(await slotPixels({ artwork: art, placeholder: { item: 'iron_ore' } })).toEqual(await silhouette(art.iron_ore));
    expect(await slotPixels({ art: uiSlotArt({ artwork: art }), placeholder: { item: 'wood' } })).toEqual(await silhouette(art.wood));
    expect(await slotPixels({ artwork: art, placeholder: { item: 'wood' }, stack: { itemKind: 'iron_ore', quantity: 2 } })).toEqual(await slotPixels({ artwork: art, stack: { itemKind: 'iron_ore', quantity: 2 } }));
    // No art for the item: nothing to cut, so the slot stays plain.
    expect(await slotPixels({ placeholder: { item: 'iron_ore' } })).toEqual(await slotPixels({}));
  });

  it('paints the cooldown as a shade over the icon well that drains from the top (03 A)', async () => {
    const shade = (fraction: number) => oracle((context, kit) => {
      paintUiSkin(context, kit.skin.slot, `slot.${uiInventorySlotTone('orchard_tea') === 'common' ? 'idle' : uiInventorySlotTone('orchard_tea')}.0`, r);
      icon(context, art.orchard_tea, 1); count(context, kit, '3');
      if (fraction > 0) { const well = uiSlotIconRect(r), height = Math.round(well.height * fraction); context.fillStyle = 'rgba(31, 20, 26, 0.62)'; context.fillRect(3, well.y + well.height - height, 22, height); }
    });
    for (const fraction of [.75, .3]) expect(await slotPixels({ artwork: art, stack: tea, cooldown: () => ({ fraction }) }), String(fraction)).toEqual(await shade(fraction));
    const ready = await slotPixels({ artwork: art, stack: tea });
    expect(ready).toEqual(await shade(0));
    for (const cooldown of [null, { fraction: 0 }, { fraction: -1 }]) expect(await slotPixels({ artwork: art, stack: tea, cooldown: () => cooldown })).toEqual(ready);
    expect(await slotPixels({ artwork: art, stack: tea, cooldown: () => ({ fraction: 4 }) })).toEqual(await shade(1));
    // An empty slot has no icon to shade.
    expect(await slotPixels({ cooldown: () => ({ fraction: .5 }) })).toEqual(await slotPixels({}));
  });

  it('scales the grey face, blocked mark and silhouette with larger slots', async () => {
    const md = { width: 56, height: 62 };
    const big = (options: UiSlotOptions) => paintRoot(uiSlot({ ...options, layout: { width: uiFixed(56), height: uiFixed(62) } }), md);
    const locked = await big({ state: { locked: { reason: 'Locked' } } });
    expect(locked).not.toEqual(await big({ state: { enabled: false } }));
    expect(await big({ artwork: art, placeholder: { item: 'iron_ore' } })).not.toEqual(await big({}));
  });
});

describe('slot state model', () => {
  const model = (cursor: ItemStack | null, accepts = true): UiInventoryModel => ({
    cursor, status: '', dragging: cursor !== null, stack: () => null, displayedCursor: () => cursor, canAccept: () => accepts,
    pointerDown: () => ({ type: 'none' }) as never, pointerEnter: () => false, pointerUp: () => ({ type: 'none' }) as never, cancel: () => undefined,
  });
  const binding = { container: 'chest', index: 0 };

  it('derives the drop target from the controller and the slot rules', () => {
    const view = (cursor: ItemStack | null, rules?: UiSlotRules, accepts = true) => uiSlotView(uiSlot({
      binding, controller: new UiInventoryController(model(cursor, accepts)), ...(rules ? { rules } : {}), art: uiSlotArt({ contentRegistry: () => registry }),
    }))!.dropTarget;
    expect(view(null)).toBeNull();
    expect(view({ itemKind: 'coal', quantity: 1 })).toBe('accept');
    expect(view({ itemKind: 'coal', quantity: 1 }, undefined, false)).toBe('refuse');
    expect(view({ itemKind: 'coal', quantity: 1 }, { denyItems: ['coal'] })).toBe('refuse');
    expect(view({ itemKind: 'axe', quantity: 1 }, { denyTags: ['item.tool'] })).toBe('refuse');
    expect(view({ itemKind: 'coal', quantity: 1 }, { allowItems: ['coal'] })).toBe('accept');
    // The rules narrow the controller's verdict; they never overrule a refusal.
    expect(view({ itemKind: 'coal', quantity: 1 }, { allowItems: ['coal'] }, false)).toBe('refuse');
  });

  it('reports state, cooldown, placeholder, rules and drag, and blocks input as soon as the state changes', () => {
    const slot = uiSlot({ state: { pending: true },
      cooldown: () => ({ fraction: 1.4 }), placeholder: { item: 'wood' }, rules: { readOnly: true }, drag: { split: false } });
    expect(uiSlotView(slot)).toMatchObject({ variant: 'slot', enabled: true, locked: null, pending: true, selected: false,
      cooldown: { fraction: 1 }, placeholder: { item: 'wood' }, rules: { readOnly: true }, drag: { split: false }, dropTarget: null });
    uiSetSlotState(slot, { locked: { reason: 'Needs Smithing 3' } });
    // Hit-testing reads element.disabled: it changes with the state, without a paint.
    expect(slot.disabled).toBe(true);
    expect(uiSlotView(slot)).toMatchObject({ enabled: false, locked: { reason: 'Needs Smithing 3' }, pending: false });
    uiSetSlotState(slot, undefined);
    expect(slot.disabled).toBe(false);
    // A state change that leaves blocking alone does not override an external setDisabled.
    slot.setDisabled(true); uiSetSlotState(slot, { pending: true });
    expect(slot.disabled).toBe(true);
    expect(() => uiSetSlotState(uiInventoryGrid({ container: 'chest', count: 1 }), {})).toThrow('needs a slot');
    expect(uiSlotView(uiSlot({ state: { enabled: false } }))?.enabled).toBe(false);
    expect(uiSlotView(uiSlot({}))).toMatchObject({ enabled: true, cooldown: null, placeholder: null, rules: null, drag: null });
  });

  it('passes per-cell rules and state through the grid, and blocks input on locked cells', () => {
    const grid = uiInventoryGrid({ container: 'chest', count: 3, art: uiSlotArt({ contentRegistry: () => registry }), cells: [
      { id: '0', index: 0, rules: { denyItems: ['coal'] } },
      { id: '1', index: 1, state: { locked: { reason: 'Locked' } } },
      { id: '2', index: 2 },
    ] });
    const [first, second, third] = grid.children.map((child) => uiSlotView(child)!);
    expect(first?.rules).toEqual({ denyItems: ['coal'] });
    expect(second).toMatchObject({ enabled: false, locked: { reason: 'Locked' } });
    expect(grid.children[1]?.disabled).toBe(true);
    expect(third).toMatchObject({ enabled: true, rules: null });
  });

  it('checks rules with the live registry the art carries, and skips them without one', () => {
    const retired = { ...registry, items: new Map([...registry.items].map(([id, item]) => [id, id === 'item:coal' ? { ...item, retired: true } : item])) };
    const target = (rules: UiSlotRules, art?: ReturnType<typeof uiSlotArt>, accepts = true) => uiSlotView(uiSlot({ binding, rules, ...(art ? { art } : {}),
      controller: new UiInventoryController(model({ itemKind: 'coal', quantity: 1 }, accepts)) }))!.dropTarget;
    expect(target({}, uiSlotArt({ contentRegistry: () => registry }))).toBe('accept');
    expect(target({ denyItems: ['coal'] }, uiSlotArt({ contentRegistry: () => registry }))).toBe('refuse');
    // A retired item is unknown to the live policy, which refuses it exactly as the server does.
    expect(target({}, uiSlotArt({ contentRegistry: () => retired }))).toBe('refuse');
    // Without a live registry the rules are never checked against bootstrap content: the controller's verdict stands.
    expect(target({ denyItems: ['coal'] })).toBe('accept');
    expect(target({ denyItems: ['coal'] }, uiSlotArt({ contentRegistry: () => undefined }))).toBe('accept');
    expect(target({ readOnly: true }, undefined, false)).toBe('refuse');
    expect(uiSlotArtPolicy(uiSlotArt())).toBeUndefined();
    expect(uiSlotArtPolicy(uiSlotArt({ contentRegistry: () => registry }))?.maxStackFor('coal')).toBe(BOOTSTRAP_ITEM_CONTAINER_CONTENT.maxStackFor('coal'));
  });
});
