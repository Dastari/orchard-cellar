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
      0: { acceptedKinds: ['copper_ore', 'gold_ore', 'iron_ore', 'silver_ore'] },
      1: { acceptedKinds: ['plank', 'wood'] },
      2: { readOnly: true },
    });
    expect(resolveFrameSlotRestriction({
      acceptedFrom: { stationTag: 'station.furnace', role: 'output' }, readOnly: true,
    }, registry)).toEqual({ acceptedKinds: ['copper_bar', 'gold_bar', 'iron_bar', 'silver_bar'], readOnly: true });
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
