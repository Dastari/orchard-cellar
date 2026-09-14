import { describe, expect, it } from 'vitest';
import { bootstrapContentRows } from '../packages/sim/src/content/bootstrap-registry.js';
import { buildContentRegistry } from '../packages/sim/src/content/registry.js';
import type { SupportedContentDefinition } from '../packages/sim/src/content/definitions.js';
import { assertCookingRegistryCompatibility } from './cooking-content-continuity.js';

const rows = bootstrapContentRows();
function changed(id: string, transform: (definition: SupportedContentDefinition) => SupportedContentDefinition) {
  return buildContentRegistry(rows.map((row) => row.id !== id ? row
    : { ...row, json: JSON.stringify(transform(JSON.parse(row.json) as SupportedContentDefinition)) })).registry;
}

describe('prospective content cooking escrow continuity', () => {
  it('accepts authored recovery while permitting current recipe output/time/stack edits', () => {
    expect(() => assertCookingRegistryCompatibility(buildContentRegistry(rows).registry)).not.toThrow();
    const registry = changed('process:cook_beef', (definition) => {
      if (definition.kind !== 'process') throw new Error('fixture_kind');
      return { ...definition, ticksPerUnit: 2000, outputs: [{ item: 'item:cooked_fish', count: 2 }] };
    });
    expect(() => assertCookingRegistryCompatibility(registry)).not.toThrow();
    expect(() => assertCookingRegistryCompatibility(changed('item:cooked_beef', (definition) => {
      if (definition.kind !== 'item') throw new Error('fixture_kind');
      return { ...definition, maxStack: 1 };
    }))).not.toThrow();
  });

  it('rejects content merges that remove or retire the global cancellation callback', () => {
    for (const retired of [false, true]) {
      const registry = changed('frame:pack', (definition) => {
        if (definition.kind !== 'frame') throw new Error('fixture_kind');
        return retired ? { ...definition, retired: true }
          : { ...definition, buttons: definition.buttons?.filter((button) => button.onInvoke === undefined) };
      });
      expect(() => assertCookingRegistryCompatibility(registry)).toThrow('cooking_content_inventory_recovery_missing_or_ambiguous');
    }
  });

  it('rejects changed or missing historical progression independently of new recipes', () => {
    for (const amount of [0, 5, 8]) {
      const registry = changed('process:cook_beef', (definition) => {
        if (definition.kind !== 'process') throw new Error('fixture_kind');
        return { ...definition, legacyJob: { recipeId: 'cook_beef', farmingExperiencePerItem: amount } };
      });
      expect(() => assertCookingRegistryCompatibility(registry)).toThrow('cooking_content_progression_changed:cook_beef');
    }
  });

  it('requires saved output and input item kinds to remain representable', () => {
    for (const id of ['item:raw_beef', 'item:cooked_beef']) {
      const registry = buildContentRegistry(rows.filter((row) => row.id !== id)).registry;
      expect(() => assertCookingRegistryCompatibility(registry)).toThrow('cooking_content_escrow_item_unavailable');
    }
  });

  it('rejects unreachable collection frames and changes to either historical station', () => {
    for (const id of ['object:campfire', 'object:camp_cooking_fire', 'frame:cooking']) {
      expect(() => assertCookingRegistryCompatibility(changed(id, (definition) => ({ ...definition, retired: true }))))
        .toThrow('cooking_content_station_collection_unavailable');
    }
    expect(() => assertCookingRegistryCompatibility(changed('frame:cooking', (definition) => {
      if (definition.kind !== 'frame') throw new Error('fixture_kind');
      return { ...definition, buttons: definition.buttons?.filter((button) => button.onInvoke?.claimProcessJob !== 'collect') };
    }))).toThrow('cooking_content_station_collection_unavailable');
  });

  it('rejects a content merge that remaps the old landmark job target', () => {
    expect(() => assertCookingRegistryCompatibility(changed('space:island', (definition) => {
      if (definition.kind !== 'space') throw new Error('fixture_kind');
      return { ...definition, landmarks: definition.landmarks?.map((landmark) => ({ ...landmark,
        decorations: landmark.decorations.map((rule) => rule.kind === 'point' && rule.placeable?.runtimeId === '3000000004'
          ? { ...rule, tileX: rule.tileX + 1 } : rule),
      })) };
    }))).toThrow('cooking_content_landmark_alias_changed');
  });
});
