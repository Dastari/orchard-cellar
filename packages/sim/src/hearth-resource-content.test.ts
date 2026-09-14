import { expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { hearthGatheringContentReady } from './hearth-resource-content.js';
import { runtimeItemDefinition } from './content/runtime.js';

const registry = bootstrapContentRegistry();
it('admits the actual authored gathering registry using bare runtime slugs', () => {
  expect(runtimeItemDefinition(registry, 'item:basalt')).toBeNull();
  expect(runtimeItemDefinition(registry, 'basalt')).not.toBeNull();
  expect(hearthGatheringContentReady(registry)).toBe(true);
});
it('rejects missing or retired materials even when the compiled item remains', () => {
  for (const kind of ['basalt', 'ashwood', 'cinder_ore', 'emberglass']) {
    const items = new Map(registry.items), id = `item:${kind}`;
    items.set(id, { ...items.get(id)!, retired: true });
    expect(hearthGatheringContentReady({ ...registry, items })).toBe(false);
    items.delete(id);
    expect(hearthGatheringContentReady({ ...registry, items })).toBe(false);
  }
});
it('rejects absent, retired or changed loot instead of installing dry or overpaying nodes', () => {
  for (const id of ['loot:mining_rock_basalt', 'loot:mining_ore_cinder', 'loot:mining_ore_emberglass', 'loot:resource_tree_ashwood']) {
    const loots = new Map(registry.loots), original = loots.get(id)!;
    loots.delete(id);
    expect(hearthGatheringContentReady({ ...registry, loots })).toBe(false);
    loots.set(id, { ...original, retired: true });
    expect(hearthGatheringContentReady({ ...registry, loots })).toBe(false);
    const group = original.groups[0]!, entry = group.entries[0]!;
    loots.set(id, { ...original, groups: [{ ...group, entries: [{ ...entry,
      target: { item: 'item:not_authored', min: 1, max: 1 } }] }] });
    expect(hearthGatheringContentReady({ ...registry, loots })).toBe(false);
    loots.set(id, { ...original, groups: [{ ...group, conditions: [{ toolTierAtLeast: 99 }] }] });
    expect(hearthGatheringContentReady({ ...registry, loots })).toBe(false);
  }
  const loots = new Map(registry.loots), original = loots.get('loot:resource_tree_ashwood')!;
  loots.set(original.id, { ...original, groups: original.groups.map(group => ({ ...group,
    entries: group.entries.map(entry => ({ ...entry, conditions: [] })) })) });
  expect(hearthGatheringContentReady({ ...registry, loots })).toBe(false);
});
it('requires usable common axe and pickaxe capabilities, not merely existing tool records', () => {
  for (const specialization of ['woodcutting', 'mining']) {
    const items = new Map(registry.items);
    for (const [id, item] of items) if (item.quality === 'common'
      && item.tool?.specialization === specialization) items.set(id, { ...item, retired: true });
    expect(hearthGatheringContentReady({ ...registry, items })).toBe(false);
  }
  const items = new Map(registry.items);
  for (const [id, item] of items) if (item.quality === 'common'
    && item.tool?.specialization === 'mining') items.set(id, {
      ...item, tool: { ...item.tool, mineableResources: [] },
    });
  expect(hearthGatheringContentReady({ ...registry, items })).toBe(false);
});
