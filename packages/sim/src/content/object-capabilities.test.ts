import { describe, expect, it } from 'vitest';

import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { parseObjectDefinition } from './object-definition.js';
import {
  runtimeObjectCarry,
  runtimeChestObjectDefinition,
  runtimeObjectDamageable,
  runtimeObjectDefinition,
  runtimeFixedCombatTargetPlans,
  runtimePlaceableObjectDefinitionByTag,
} from './object-capabilities.js';

describe('authored object capabilities', () => {
  it('authors the canonical target, chest, and fire policies in the content pack', () => {
    const registry = bootstrapContentRegistry();
    expect(runtimeObjectDamageable(registry, { kind: 'archery_target' })).toEqual({
      model: 'health', maximumHealthCenti: 10_000, minimumHealthCenti: 1,
      regeneration: { amountCenti: 100, everyTicks: 20 },
      fixedTargets: [
        ['4294966900', 'space:island', 342, 376],
        ['4294966901', 'space:island', 346, 376],
        ['4294966902', 'space:island', 350, 376],
      ],
    });
    expect(runtimeObjectCarry(registry, { kind: 'archery_target' }))
      .toEqual({ mode: 'preserve_entity' });
    expect(runtimeObjectCarry(registry, { kind: 'chest' })).toEqual({
      mode: 'preserve_entity_or_item_when_empty', item: 'item:chest',
    });
    for (const kind of ['camp_cooking_fire', 'campfire', 'chest', 'cooking_fire']) {
      expect(runtimeObjectDamageable(registry, { kind })).toMatchObject({
        model: 'hits', maximumHits: 3, toolSpecialization: 'woodcutting',
        salvageRecipe: `recipe:${kind}`,
      });
    }
  });

  it('resolves fixed combat targets across object renames and rejects incomplete authority', () => {
    const base = bootstrapContentRegistry();
    expect(runtimeFixedCombatTargetPlans(base)?.map(({ id, kind, spaceId, tileX, tileY }) => (
      { id, kind, spaceId, tileX, tileY }
    ))).toEqual([
      { id: 4_294_966_900n, kind: 'archery_target', spaceId: 0, tileX: 342, tileY: 376 },
      { id: 4_294_966_901n, kind: 'archery_target', spaceId: 0, tileX: 346, tileY: 376 },
      { id: 4_294_966_902n, kind: 'archery_target', spaceId: 0, tileX: 350, tileY: 376 },
    ]);

    const target = base.objects.get('object:archery_target')!;
    const renamed = parseObjectDefinition({ ...target, id: 'object:moon_target' });
    const objects = new Map(base.objects);
    objects.delete(target.id);
    objects.set(renamed.id, renamed);
    expect(runtimeFixedCombatTargetPlans({ objects, spaces: base.spaces })?.map(({ kind }) => kind))
      .toEqual(['moon_target', 'moon_target', 'moon_target']);

    objects.set(renamed.id, { ...renamed, retired: true });
    expect(runtimeFixedCombatTargetPlans({ objects, spaces: base.spaces })).toBeNull();
    objects.set(renamed.id, renamed);
    objects.set('object:duplicate_target', parseObjectDefinition({
      ...renamed, id: 'object:duplicate_target', displayName: 'Duplicate Target',
    }));
    expect(runtimeFixedCombatTargetPlans({ objects, spaces: base.spaces })).toBeNull();

    const missingSpace = new Map(base.objects);
    const targetDamageable = target.components.damageable;
    if (targetDamageable?.model !== 'health') throw new Error('expected health target fixture');
    missingSpace.set(target.id, { ...target, components: { ...target.components, damageable: {
      ...targetDamageable,
      fixedTargets: [['4294966900', 'space:missing', 342, 376]],
    } } });
    expect(runtimeFixedCombatTargetPlans({ objects: missingSpace, spaces: base.spaces })).toBeNull();
  });

  it('resolves arbitrary explicit object ids independently of the durable kind', () => {
    const base = bootstrapContentRegistry();
    const chest = base.objects.get('object:chest')!;
    const renamed = parseObjectDefinition({
      ...chest,
      id: 'object:moon_crate',
      displayName: 'Moon Crate',
      components: {
        ...chest.components,
        placement: { ...chest.components.placement!, item: 'item:chest' },
        damageable: {
          model: 'hits', maximumHits: 7, toolSpecialization: 'mining',
          salvageRecipe: 'recipe:chest',
        },
      },
    });
    const registry = { objects: new Map([[renamed.id, renamed]]) };
    const reference = { kind: 'totally_renamed', definitionId: renamed.id };

    expect(runtimeObjectDefinition(registry, reference)?.id).toBe(renamed.id);
    expect(runtimeObjectDamageable(registry, reference)).toMatchObject({
      model: 'hits', maximumHits: 7, toolSpecialization: 'mining',
    });
    expect(runtimeObjectCarry(registry, reference)).toEqual({
      mode: 'preserve_entity_or_item_when_empty', item: 'item:chest',
    });
  });

  it('fails closed for explicit missing, malformed, and retired definitions', () => {
    const base = bootstrapContentRegistry();
    const chest = base.objects.get('object:chest')!;
    const retired = { ...chest, retired: true as const };
    const registry = { objects: new Map([[retired.id, retired]]) };

    expect(runtimeObjectDefinition(registry, {
      kind: 'chest', definitionId: 'object:missing',
    })).toBeNull();
    expect(runtimeObjectDefinition(registry, {
      kind: 'chest', definitionId: 'not-an-object-id',
    })).toBeNull();
    expect(runtimeObjectDefinition(registry, {
      kind: 'chest', definitionId: retired.id,
    })).toBeNull();
  });

  it('preserves pre-schema kind and placement-item compatibility', () => {
    const base = bootstrapContentRegistry();
    const chest = base.objects.get('object:chest')!;
    const renamed = parseObjectDefinition({
      ...chest,
      id: 'object:lunar_storage',
      components: {
        ...chest.components,
        placement: { ...chest.components.placement!, item: 'item:moon_crate' },
        carry: { mode: 'preserve_entity_or_item_when_empty', item: 'item:moon_crate' },
      },
    });
    const registry = { objects: new Map([[renamed.id, renamed]]) };

    expect(runtimeObjectDefinition(base, { kind: 'chest' })?.id).toBe('object:chest');
    expect(runtimeObjectDefinition(registry, { kind: 'moon_crate' })?.id).toBe(renamed.id);
  });

  it('keeps furniture storage outside gameplay damage and carry capabilities', () => {
    const registry = bootstrapContentRegistry();
    const furniture = { kind: 'furniture_rustic_chest' };
    expect(runtimeObjectDamageable(registry, furniture)).toBeNull();
    expect(runtimeObjectCarry(registry, furniture)).toBeNull();
  });

  it('routes chest capability through an active placement item across object renames', () => {
    const base = bootstrapContentRegistry();
    const chest = base.objects.get('object:chest')!;
    const renamed = parseObjectDefinition({ ...chest, id: 'object:moon_crate' });
    const active = { objects: new Map([[renamed.id, renamed]]), items: base.items };
    expect(runtimeChestObjectDefinition(active, {
      kind: 'chest', definitionId: renamed.id,
    })?.id).toBe(renamed.id);
    expect(runtimeChestObjectDefinition(active, {
      kind: 'chest', definitionId: chest.id,
    })).toBeNull();
    expect(runtimeChestObjectDefinition(base, { kind: 'chest' })?.id).toBe(chest.id);
  });

  it('resolves unique active placeable roles across definition renames', () => {
    const base = bootstrapContentRegistry();
    const workbench = base.objects.get('object:workbench')!;
    const renamed = parseObjectDefinition({ ...workbench, id: 'object:moon_bench' });
    const objects = new Map(base.objects);
    objects.delete(workbench.id);
    objects.set(renamed.id, renamed);
    const registry = { objects, items: base.items };

    expect(runtimePlaceableObjectDefinitionByTag(registry, 'station.workbench')?.id)
      .toBe('object:moon_bench');
    objects.set(renamed.id, { ...renamed, retired: true });
    expect(runtimePlaceableObjectDefinitionByTag(registry, 'station.workbench')).toBeNull();
    expect(runtimePlaceableObjectDefinitionByTag(base, 'station.missing')).toBeNull();
  });
});
