import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, EQUIPMENT_SLOTS, type FrameContentDefinition, type ItemStack } from '@orchard/sim';
import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { frameRestrictions } from '@orchard/sim/content/frame-runtime';
import { EQUIPMENT_SLOT_RESTRICTIONS } from '@orchard/sim/inventory-layout';
import { itemPolicyResolver } from '@orchard/sim/item-containers';
import { resolveFramePaneSlots, type FrameContainerAliases } from '../../content-frame.js';
import { uiLabInventory } from '../lab/inventory-mock.js';
import { UiRoot } from '../runtime/root.js';
import { UiInventoryController, type UiInventoryModel } from '../runtime/inventory.js';
import type { UiElement } from '../runtime/element.js';
import { uiSlotView } from './inventory.js';
import { uiSlotAcceptsItem, uiSlotRulesFromRestriction } from './slot-rules.js';
import { UI_STATION_PLACEHOLDERS, uiContentFrame, uiFramePaneCells, type UiContentFrameOptions } from './content-frame.js';

// Item slot component S1 (wiki Roadmap/Item Slot Component): frames pass each pane's rules, take-only flags and
// placeholders to their slots, and the rules are exactly the ones the authority applies.
const registry = bootstrapContentRegistry();
const frame = (id: string) => bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === id)!;
const stationAliases: FrameContainerAliases = { entity: 'placeable', backpack: 'backpack', hotbar: 'hotbar' };
const packAliases: FrameContainerAliases = { hotbar: 'hotbar', backpack: 'backpack', equipment: 'equipment' };

function mount(options: Partial<UiContentFrameOptions> & Pick<UiContentFrameOptions, 'definition' | 'aliases'>) {
  const root = new UiRoot({ scale: 1 }); root.resize(960, 600);
  root.mount(uiContentFrame({ registry, contentRegistry: () => registry, ...options })); root.arrange();
  const slots = root.entries().map(entry => entry.element).filter(element => element.kind === 'slot');
  const slot = (container: string, index: number): UiElement => slots.find(element => {
    const binding = element.props['binding'] as { container: string; index: number } | undefined;
    return binding?.container === container && binding.index === index;
  })!;
  return { root, slots, slot, view: (container: string, index: number) => uiSlotView(slot(container, index))! };
}

describe('content frame slots', () => {
  it.each(['frame:furnace', 'frame:cooking', 'frame:press', 'frame:fermentation', 'frame:barrel', 'frame:chest', 'frame:hearth_stash'])(
    'gives %s entity slots the authority\'s restriction as rules', id => {
      const definition = frame(id), authority = frameRestrictions(definition, registry);
      const { root, view } = mount({ definition, aliases: stationAliases });
      for (const pane of definition.panes) {
        if (!('entitySlots' in pane.bind)) continue;
        for (const index of pane.bind.entitySlots) {
          const rules = view('placeable', index).rules;
          expect(rules ?? undefined, `${pane.id} ${index}`).toEqual(uiSlotRulesFromRestriction(authority[index]));
          // Take-only panes (station outputs) are marked read-only.
          expect(rules?.readOnly === true, `${pane.id} ${index}`).toBe(pane.restriction?.readOnly === true);
        }
      }
      root.dispose();
    });

  it('shows the approved station placeholders, one per output slot', () => {
    const placeholder = (id: string, index: number) => { const { root, view } = mount({ definition: frame(id), aliases: stationAliases }); const value = view('placeable', index).placeholder; root.dispose(); return value; };
    expect(placeholder('frame:furnace', 0)).toEqual({ item: 'iron_ore' });
    expect(placeholder('frame:furnace', 1)).toEqual({ item: 'wood' });
    expect(placeholder('frame:furnace', 2)).toEqual({ item: 'iron_bar' });
    expect(placeholder('frame:press', 1)).toEqual({ item: 'must' });
    expect(placeholder('frame:press', 2)).toEqual({ item: 'pomace' });
    expect(placeholder('frame:fermentation', 1)).toEqual({ item: 'bottles' });
    // Storage has no placeholders.
    expect(placeholder('frame:chest', 0)).toBeNull();
    expect(placeholder('frame:barrel', 0)).toBeNull();
  });

  it('only shows placeholders a slot really takes or its station really makes', () => {
    const policy = itemPolicyResolver(registry);
    for (const [id, panes] of Object.entries(UI_STATION_PLACEHOLDERS)) {
      const definition = frame(id), authority = frameRestrictions(definition, registry);
      const station = definition.panes.flatMap(pane => pane.restriction?.acceptedFrom ? [pane.restriction.acceptedFrom] : [])[0]!;
      const made = new Set([...registry.processes.values()].filter(process => !process.retired && process.stationTag === station.stationTag)
        .flatMap(process => process.outputs.map(output => output.item.slice('item:'.length))));
      for (const [paneId, items] of Object.entries(panes)) {
        const pane = definition.panes.find(entry => entry.id === paneId);
        expect(pane && 'entitySlots' in pane.bind, `${id} ${paneId}`).toBe(true);
        if (!pane || !('entitySlots' in pane.bind)) continue;
        expect(items.length).toBeLessThanOrEqual(pane.bind.entitySlots.length);
        for (const item of items) {
          if (pane.restriction?.readOnly) expect(made.has(item), `${id} ${paneId} ${item}`).toBe(true);
          else for (const index of pane.bind.entitySlots) expect(uiSlotAcceptsItem(uiSlotRulesFromRestriction(authority[index]), item, policy), `${id} ${paneId} ${item}`).toBe(true);
        }
      }
    }
  });

  it('gives the paper doll the equipment slot rules and its silhouettes, and self panes no rules', () => {
    const { root, view } = mount({ definition: frame('frame:pack'), aliases: packAliases });
    for (const slot of EQUIPMENT_SLOTS) {
      expect(view('equipment', slot.index).rules).toEqual(uiSlotRulesFromRestriction(EQUIPMENT_SLOT_RESTRICTIONS[slot.index]));
      expect(view('equipment', slot.index).placeholder).toBe(slot.id);
    }
    expect(view('backpack', 0).rules).toBeNull();
    expect(view('hotbar', 0).rules).toBeNull();
    root.dispose();
  });

  it('ignores restrictions on self panes, which the server does not enforce', () => {
    const pack = frame('frame:pack');
    const definition: FrameContentDefinition = { ...pack, panes: pack.panes.map(pane => 'self' in pane.bind && pane.bind.self === 'backpack'
      ? { ...pane, restriction: { rejectedItems: ['item:wood'] } } : pane) };
    const backpack = definition.panes.find(pane => 'self' in pane.bind && pane.bind.self === 'backpack')!;
    expect(resolveFramePaneSlots(backpack, packAliases, registry)[0]?.restriction).toBeDefined();
    expect(uiFramePaneCells(definition, backpack, resolveFramePaneSlots(backpack, packAliases, registry)).every(cell => cell.rules === undefined)).toBe(true);
    const { root, view } = mount({ definition, aliases: packAliases });
    expect(view('backpack', 0).rules).toBeNull();
    root.dispose();
  });

  it('passes the same rules and placeholders to the frame designer preview', () => {
    const definition = frame('frame:furnace'), authority = frameRestrictions(definition, registry);
    const { root, view } = mount({ definition, aliases: stationAliases, onPaneSelect: () => {} });
    expect(view('placeable', 0)).toMatchObject({ rules: uiSlotRulesFromRestriction(authority[0]), placeholder: { item: 'iron_ore' } });
    expect(view('placeable', 2)).toMatchObject({ rules: { readOnly: true }, placeholder: { item: 'iron_bar' } });
    root.dispose();
  });

  it('agrees with the server on a held stack: fuel refuses ore, the take-only output refuses everything', () => {
    const definition = frame('frame:furnace');
    const held = (itemKind: string): UiInventoryModel => ({
      cursor: { itemKind, quantity: 1 } as ItemStack, status: '', dragging: true, stack: () => null, displayedCursor: () => ({ itemKind, quantity: 1 }), canAccept: () => true,
      pointerDown: () => ({ type: 'none' }) as never, pointerEnter: () => false, pointerUp: () => ({ type: 'none' }) as never, cancel: () => undefined,
    });
    const target = (itemKind: string, index: number, live = true) => {
      const controller = new UiInventoryController(held(itemKind));
      const { root, view } = mount({ definition, aliases: stationAliases, controller, ...(live ? {} : { contentRegistry: undefined }) });
      const result = view('placeable', index).dropTarget; root.dispose(); controller.dispose(); return result;
    };
    expect(target('iron_ore', 0)).toBe('accept');
    expect(target('iron_ore', 1)).toBe('refuse');
    expect(target('wood', 1)).toBe('accept');
    expect(target('iron_bar', 2)).toBe('refuse');
    // Without the live registry the slot keeps the controller's verdict rather than checking bootstrap content.
    expect(target('iron_ore', 1, false)).toBe('accept');
  });

  it('keeps the lab inventory slots bound and reachable with the rules in place', () => {
    const definition = frame('frame:furnace');
    const { controller } = uiLabInventory({ activate: vi.fn() }, undefined, false, { definition, aliases: stationAliases, registry });
    const { root, slots } = mount({ definition, aliases: stationAliases, controller });
    expect(slots.filter(element => !element.disabled).length).toBe(slots.length);
    root.dispose(); controller.dispose();
  });
});
