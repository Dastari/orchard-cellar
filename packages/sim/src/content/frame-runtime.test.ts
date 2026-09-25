import { describe, expect, it } from 'vitest';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import type { FrameContentDefinition, ItemContentDefinition, ProcessContentDefinition } from './definitions.js';
import { frameRestrictions, resolveFrameSlotRestriction } from './frame-runtime.js';
import { clickContainerSlot, itemContainerContentResolver, slotAcceptsItem } from '../item-containers.js';

const definitions = bootstrapContentDefinitions();
const registry = {
  items: new Map(definitions.filter((definition): definition is ItemContentDefinition => definition.kind === 'item')
    .map((definition) => [definition.id, definition] as const)),
  processes: new Map(definitions.filter((definition): definition is ProcessContentDefinition => definition.kind === 'process')
    .map((definition) => [definition.id, definition] as const)),
};

function frame(id: string): FrameContentDefinition {
  return definitions.find((definition): definition is FrameContentDefinition => definition.id === `frame:${id}`)!;
}

describe('frame restriction resolver', () => {
  it('derives station inputs and outputs deterministically', () => {
    expect(frameRestrictions(frame('furnace'), registry)).toEqual({
      0: { acceptedKinds: ['clay', 'copper_ore', 'gold_ore', 'iron_ore', 'sand', 'silver_ore', 'tin_ore'] },
      1: { acceptedKinds: ['coal', 'plank', 'wood'] },
      2: { readOnly: true },
    });
    expect(resolveFrameSlotRestriction({
      acceptedFrom: { stationTag: 'station.furnace', role: 'output' }, readOnly: true,
    }, registry)).toEqual({ acceptedKinds: ['brick', 'copper_bar', 'glass_pane', 'gold_bar', 'iron_bar', 'silver_bar', 'tin_bar'], readOnly: true });
  });

  it('rejects insertion when an authored process set is empty but preserves extraction of existing contents', () => {
    const restriction = resolveFrameSlotRestriction({
      acceptedFrom: { stationTag: 'station.future', role: 'input' },
    }, registry)!;
    expect(restriction).toEqual({ acceptedKinds: [] });
    const content = itemContainerContentResolver(registry);
    const existing = { itemKind: 'wood', quantity: 12, durability: 0, lit: false };
    const processor = { id: 'processor', capacity: 1, slots: [existing], restrictions: { 0: restriction } };
    expect(slotAcceptsItem(processor, 0, 'wood', content)).toBe(false);
    expect(clickContainerSlot({ processor }, null, { container: 'processor', index: 0, button: 'left' }, content))
      .toMatchObject({ ok: true, cursor: existing, containers: { processor: { slots: [null] } } });
    expect(processor.slots).toEqual([existing]);
    expect(resolveFrameSlotRestriction({ acceptedItems: [] }, registry)).toEqual({ acceptedKinds: [] });
  });

  it('follows active authored fuel policies without requiring an unrelated item tag', () => {
    const content = itemContainerContentResolver(registry);
    const furnace = { id: 'furnace', capacity: 3, slots: [null, null, null], restrictions: frameRestrictions(frame('furnace'), registry) };
    for (const itemKind of ['wood', 'plank']) {
      expect(content.hasTag(itemKind, 'fuel.furnace')).toBe(false);
      expect(slotAcceptsItem(furnace, 1, itemKind, content)).toBe(true);
    }
    for (const itemKind of ['stick', 'stone', 'copper_ore', 'copper_bar']) {
      expect(slotAcceptsItem(furnace, 1, itemKind, content)).toBe(false);
    }
    const changed = {
      ...registry,
      processes: new Map([...registry.processes].map(([id, process]) => [id, process.stationTag === 'station.furnace'
        ? { ...process, fuelPolicy: { ...process.fuelPolicy!, acceptedItems: ['item:stick' as const] } } : process])),
    };
    expect(frameRestrictions(frame('furnace'), changed)[1]).toEqual({ acceptedKinds: ['stick'] });
    const retired = { ...changed, processes: new Map([...changed.processes].map(([id, process]) => [id, { ...process, retired: true }])) };
    expect(frameRestrictions(frame('furnace'), retired)[1]).toEqual({ acceptedKinds: [] });
  });

  it('admits every active process input and fuel through its authored processor frame', () => {
    const content = itemContainerContentResolver(registry);
    for (const object of definitions) {
      if (object.kind !== 'object' || object.retired === true || object.components.processor === undefined) continue;
      const processor = object.components.processor;
      const frameId = object.components.frame?.ref;
      const definition = definitions.find((entry): entry is FrameContentDefinition => entry.kind === 'frame' && entry.id === frameId);
      expect(definition, object.id).toBeDefined();
      const container = { id: object.id, capacity: object.components.container!.slotCount, slots: [], restrictions: frameRestrictions(definition!, registry) };
      for (const process of registry.processes.values()) {
        if (process.retired === true || process.stationTag !== processor.processTag) continue;
        expect(processor.slotRoles.input?.some((slot) => slotAcceptsItem(container, slot, process.input.item.slice(5), content)), process.id).toBe(true);
        for (const fuel of process.fuelPolicy?.acceptedItems ?? []) {
          expect(processor.slotRoles.fuel?.some((slot) => slotAcceptsItem(container, slot, fuel.slice(5), content)), `${process.id}:${fuel}`).toBe(true);
        }
      }
      for (const slot of processor.slotRoles.output ?? []) {
        if (processor.slotRoles.input?.includes(slot)) continue;
        expect(slotAcceptsItem(container, slot, 'wood', content), `${object.id}:output${slot}`).toBe(false);
      }
    }
  });
});


describe('frame slot deny lists', () => {
  const content = itemContainerContentResolver(registry);
  const bin = (restriction: Parameters<typeof resolveFrameSlotRestriction>[0]) => ({
    id: 'bin', capacity: 1, slots: [null], restrictions: { 0: resolveFrameSlotRestriction(restriction, registry)! },
  });

  it('resolves authored deny lists into unprefixed runtime kinds kept apart from the allow list', () => {
    expect(resolveFrameSlotRestriction({
      rejectedItems: ['item:wood', 'item:coal', 'item:wood'], rejectedTags: ['item.tool'],
    }, registry)).toEqual({ rejectedKinds: ['coal', 'wood'], rejectedTags: ['item.tool'] });
    expect(resolveFrameSlotRestriction({ rejectedItems: [] }, registry)).toEqual({ rejectedKinds: [] });
  });

  it('denies by item', () => {
    const container = bin({ rejectedItems: ['item:wood'] });
    expect(slotAcceptsItem(container, 0, 'wood', content)).toBe(false);
    expect(slotAcceptsItem(container, 0, 'stone', content)).toBe(true);
    expect(clickContainerSlot({ bin: container }, { itemKind: 'wood', quantity: 3 },
      { container: 'bin', index: 0, button: 'left' }, content)).toEqual({ ok: false, code: 'slot_rejects_item' });
  });

  it('denies by item type', () => {
    const container = bin({ rejectedTags: ['item.tool'] });
    expect(slotAcceptsItem(container, 0, 'axe', content)).toBe(false);
    expect(slotAcceptsItem(container, 0, 'hoe', content)).toBe(false);
    expect(slotAcceptsItem(container, 0, 'wood', content)).toBe(true);
  });

  it('lets the deny list win over an allow list, a required type and a process-derived allow list', () => {
    const listed = bin({ acceptedItems: ['item:wood', 'item:coal'], rejectedItems: ['item:coal'] });
    expect(slotAcceptsItem(listed, 0, 'wood', content)).toBe(true);
    expect(slotAcceptsItem(listed, 0, 'coal', content)).toBe(false);
    const typed = bin({ requiredTags: ['item.tool'], rejectedTags: ['tool.farming.cultivate'] });
    expect(slotAcceptsItem(typed, 0, 'axe', content)).toBe(true);
    expect(slotAcceptsItem(typed, 0, 'hoe', content)).toBe(false);
    const fuel = bin({ acceptedFrom: { stationTag: 'station.furnace', role: 'fuel' }, rejectedItems: ['item:plank'] });
    expect(slotAcceptsItem(fuel, 0, 'wood', content)).toBe(true);
    expect(slotAcceptsItem(fuel, 0, 'plank', content)).toBe(false);
    // Existing contents stay extractable: restrictions govern insertion only.
    const loaded = { ...fuel, slots: [{ itemKind: 'plank', quantity: 2 }] };
    expect(clickContainerSlot({ bin: loaded }, null, { container: 'bin', index: 0, button: 'left' }, content))
      .toMatchObject({ ok: true, cursor: { itemKind: 'plank', quantity: 2 } });
  });

  it('leaves every existing authored frame without a deny list', () => {
    for (const definition of definitions) {
      if (definition.kind !== 'frame') continue;
      for (const pane of definition.panes) {
        expect(pane.restriction?.rejectedItems, `${definition.id}:${pane.id}`).toBeUndefined();
        expect(pane.restriction?.rejectedTags, `${definition.id}:${pane.id}`).toBeUndefined();
      }
      for (const restriction of Object.values(frameRestrictions(definition, registry))) {
        expect(restriction).not.toHaveProperty('rejectedKinds');
        expect(restriction).not.toHaveProperty('rejectedTags');
      }
    }
  });
});

it('distinguishes Nado-style preserving barrels from casks and keeps cask output extraction safe', () => {
  const content = itemContainerContentResolver(registry);
  const barrel = { id: 'barrel', capacity: 8, slots: Array(8).fill(null), restrictions: frameRestrictions(frame('barrel'), registry) };
  const cask = { id: 'cask', capacity: 2, slots: [null, null], restrictions: frameRestrictions(frame('fermentation'), registry) };
  expect(slotAcceptsItem(barrel, 0, 'must', content)).toBe(false);
  expect(slotAcceptsItem(barrel, 0, 'grape', content)).toBe(true);
  expect(slotAcceptsItem(cask, 0, 'must', content)).toBe(true);
  expect(slotAcceptsItem(cask, 1, 'must', content)).toBe(false);
  expect(frame('barrel').title).toBe('PRESERVING BARREL');
  const loaded = { ...cask, slots: [null, { itemKind: 'bottles', quantity: 1 }] };
  expect(clickContainerSlot({ cask: loaded }, null, { container: 'cask', index: 1, button: 'left' }, content))
    .toMatchObject({ ok: true, cursor: { itemKind: 'bottles', quantity: 1 } });
});
