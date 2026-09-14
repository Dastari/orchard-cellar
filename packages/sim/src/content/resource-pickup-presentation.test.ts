import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import type { ItemContentDefinition } from './definitions.js';
import type { LootContentDefinition } from './loot-definition.js';
import type { ContentRegistry } from './registry.js';
import type { ResourceContentDefinition } from './resource-definition.js';
import { runtimeResourcePickupPresentation } from './runtime.js';

const base = bootstrapContentRegistry();

function registryWith(
  overrides: Partial<Pick<ContentRegistry, 'resources' | 'loots' | 'items'>>,
): ContentRegistry {
  return { ...base, ...overrides };
}

describe('authored gatherable pickup presentation', () => {
  it('preserves canonical resource prompts and pickup feedback', () => {
    expect(runtimeResourcePickupPresentation(base, 'loose_stone')).toEqual({
      promptLabel: 'Pebble', feedbackLabel: 'Stone', itemId: 'item:pebble',
    });
    expect(runtimeResourcePickupPresentation(base, 'fallen_branch')).toEqual({
      promptLabel: 'Fallen Branch', feedbackLabel: 'Wood', itemId: 'item:wood',
    });
  });

  it('follows renamed resource and item identities through authored loot edges', () => {
    const sourceResource = base.resources.get('resource:loose_stone')!;
    const sourceLoot = base.loots.get(sourceResource.loot)!;
    const sourceItem = base.items.get('item:pebble')!;
    const resource: ResourceContentDefinition = {
      ...sourceResource,
      id: 'resource:moon_grit',
      runtimeKind: 'scattered_moon_grit',
    };
    const item: ItemContentDefinition = { ...sourceItem, id: 'item:moon_pebble' };
    const loot: LootContentDefinition = {
      ...sourceLoot,
      groups: sourceLoot.groups.map((group) => ({
        ...group,
        entries: group.entries.map((entry) => ({
          ...entry,
          target: 'item' in entry.target
            ? { ...entry.target, item: item.id }
            : entry.target,
        })),
      })),
    };
    const resources = new Map(base.resources);
    resources.delete(sourceResource.id);
    resources.set(resource.id, resource);
    const items = new Map(base.items);
    items.delete(sourceItem.id);
    items.set(item.id, item);
    const loots = new Map(base.loots);
    loots.set(loot.id, loot);

    expect(runtimeResourcePickupPresentation(
      registryWith({ resources, loots, items }),
      { kind: resource.runtimeKind, definitionId: resource.id },
    )).toEqual({
      promptLabel: 'Pebble', feedbackLabel: 'Stone', itemId: 'item:moon_pebble',
    });
  });

  it('fails closed for missing, retired, conditional, nested, or ambiguous content', () => {
    expect(runtimeResourcePickupPresentation(base, 'not_authored')).toBeNull();

    const sourceResource = base.resources.get('resource:fallen_branch')!;
    const sourceLoot = base.loots.get(sourceResource.loot)!;
    const resources = new Map(base.resources);
    resources.set(sourceResource.id, { ...sourceResource, retired: true });
    expect(runtimeResourcePickupPresentation(registryWith({ resources }), sourceResource.runtimeKind)).toBeNull();

    const retiredItems = new Map(base.items);
    retiredItems.set('item:wood', { ...base.items.get('item:wood')!, retired: true });
    expect(runtimeResourcePickupPresentation(registryWith({ items: retiredItems }), sourceResource.runtimeKind)).toBeNull();

    const ambiguousLoot: LootContentDefinition = {
      ...sourceLoot,
      groups: [{
        ...sourceLoot.groups[0]!,
        entries: [
          ...sourceLoot.groups[0]!.entries,
          { id: 'also_pebble', weight: 1, target: { item: 'item:pebble', min: 1, max: 1 } },
        ],
      }],
    };
    const ambiguousLootMap = new Map(base.loots);
    ambiguousLootMap.set(ambiguousLoot.id, ambiguousLoot);
    expect(runtimeResourcePickupPresentation(
      registryWith({ loots: ambiguousLootMap }), sourceResource.runtimeKind,
    )).toBeNull();

    const conditionalLoot: LootContentDefinition = {
      ...sourceLoot,
      groups: [{ ...sourceLoot.groups[0]!, conditions: [{ toolTierAtLeast: 1 }] }],
    };
    const conditionalLootMap = new Map(base.loots);
    conditionalLootMap.set(conditionalLoot.id, conditionalLoot);
    expect(runtimeResourcePickupPresentation(
      registryWith({ loots: conditionalLootMap }), sourceResource.runtimeKind,
    )).toBeNull();

    const nestedLoot: LootContentDefinition = {
      ...sourceLoot,
      groups: [{
        ...sourceLoot.groups[0]!,
        entries: [{ id: 'nested', weight: 1, target: { loot: 'loot:resource_loose_stone' } }],
      }],
    };
    const nestedLootMap = new Map(base.loots);
    nestedLootMap.set(nestedLoot.id, nestedLoot);
    expect(runtimeResourcePickupPresentation(
      registryWith({ loots: nestedLootMap }), sourceResource.runtimeKind,
    )).toBeNull();
  });
});
