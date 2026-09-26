import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { ItemStack, SlotRestriction } from '@orchard/sim';
import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { frameRestrictions } from '@orchard/sim/content/frame-runtime';
import { EQUIPMENT_SLOT_RESTRICTIONS } from '@orchard/sim/inventory-layout';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, itemPolicyResolver, slotAcceptsItem } from '@orchard/sim/item-containers';
import { UiRoot } from '../runtime/root.js';
import { UiInventoryController, type UiInventoryModel } from '../runtime/inventory.js';
import { uiTestArt, uiTestAsset } from '../lab/testing/art.js';
import { uiSetSlotState, uiSlot, uiSlotView, uiInventoryGrid, type UiSlotOptions, type UiSlotState } from './inventory.js';
import { uiSlotArt } from './slot-art.js';
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

describe('slot component S0 is pixel-neutral', () => {
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

  it('keeps today\'s look for rules, cooldown, drag, pending and the placeholders awaiting approval', async () => {
    const baseline = await render({ stack, artwork });
    expect(await render({ stack, artwork, rules: { denyItems: ['wood'] }, cooldown: () => ({ fraction: 0.5, seconds: 3 }),
      drag: { source: true, target: false }, state: { pending: true } })).toEqual(baseline);
    const empty = await render({});
    expect(await render({ placeholder: { item: 'wood' } })).toEqual(empty);
    expect(await render({ placeholder: 'main_hand' })).not.toEqual(empty);
  });

  it('paints enabled: false and locked as today\'s disabled slot, and selected as today\'s selected slot', async () => {
    const disabled = await render({ stack, artwork, disabled: true });
    expect(await render({ stack, artwork })).not.toEqual(disabled);
    expect(await render({ stack, artwork, state: { enabled: false } })).toEqual(disabled);
    expect(await render({ stack, artwork, state: { locked: { reason: 'Needs Smithing 3' } } })).toEqual(disabled);
    expect(await render({ stack, artwork }, { enabled: false })).toEqual(disabled);
    expect(await render({ stack, artwork, state: { enabled: false } }, { pending: true })).toEqual(await render({ stack, artwork }));
    expect(await render({ stack, artwork, state: { selected: true } })).toEqual(await render({ stack, artwork, selected: true }));
  });

  it('refuses the variants whose looks await approval', () => {
    expect(() => uiSlot({ variant: 'inline' })).toThrow('awaits owner approval');
    expect(() => uiSlot({ variant: 'well' })).toThrow('awaits owner approval');
    expect(() => uiSlot({ variant: 'slot' })).not.toThrow();
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
      binding, controller: new UiInventoryController(model(cursor, accepts)), ...(rules ? { rules } : {}),
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

  it('checks rules with the live registry the art carries, else bootstrap content', () => {
    const retired = { ...registry, items: new Map([...registry.items].map(([id, item]) => [id, id === 'item:coal' ? { ...item, retired: true } : item])) };
    const target = (art?: ReturnType<typeof uiSlotArt>) => uiSlotView(uiSlot({ binding, rules: {}, ...(art ? { art } : {}),
      controller: new UiInventoryController(model({ itemKind: 'coal', quantity: 1 })) }))!.dropTarget;
    expect(BOOTSTRAP_ITEM_CONTAINER_CONTENT.maxStackFor('coal')).not.toBeNull();
    expect(target()).toBe('accept');
    expect(target(uiSlotArt({ contentRegistry: () => registry }))).toBe('accept');
    // A retired item is unknown to the live policy, which refuses it exactly as the server does.
    expect(target(uiSlotArt({ contentRegistry: () => retired }))).toBe('refuse');
  });
});
