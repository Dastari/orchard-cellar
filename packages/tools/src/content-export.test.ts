import { describe, expect, it } from 'vitest';
import {
  buildContentRegistry,
  type ContentDefinitionRow,
  type SupportedContentDefinition,
} from '@orchard/sim';
import { bootstrapContentFiles } from './content-export.js';

describe('bootstrap content export', () => {
  it('emits deterministic per-kind documents that rebuild one valid registry', () => {
    const first = bootstrapContentFiles();
    const second = bootstrapContentFiles();
    expect(second).toEqual(first);
    expect(first.map(({ fileName }) => fileName)).toEqual([
      'items.json', 'recipes.json', 'processes.json', 'shops.json', 'tilesets.json', 'frames.json',
      'loot.json', 'npcs.json', 'dialogues.json', 'quests.json', 'balance.json', 'progression.json',
      'crops.json', 'creatures.json', 'spawns.json', 'spaces.json', 'skill-trees.json',
      'effects.json', 'statistics.json', 'upgrades.json', 'balance-groups.json',
      'objects.json', 'resources.json', 'loadouts.json',
      'enemies.json', 'encounters.json', 'world-rules.json', 'gear.json',
    ]);

    const definitions = first.flatMap(({ json }) => (
      JSON.parse(json) as SupportedContentDefinition[]
    ));
    const rows: ContentDefinitionRow[] = definitions.map((definition) => ({
      id: definition.id,
      kind: definition.kind,
      json: definition,
    }));
    const { registry, report } = buildContentRegistry(rows);
    expect(report.valid).toBe(true);
    expect(registry.definitions.size).toBe(definitions.length);
    expect(registry.tilesets.size).toBeGreaterThan(10);
    expect(registry.crops.size).toBeGreaterThan(20);
    expect(registry.statistics.size).toBeGreaterThan(50);
    expect(registry.resources.size).toBeGreaterThan(20);
    expect(registry.loadouts.size).toBe(1);
    expect(registry.enemies.size).toBe(6);
    expect(registry.encounters.size).toBe(5);
  });
});
