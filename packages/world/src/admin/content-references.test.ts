import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, type ContentRegistry } from '@orchard/sim';
import {
  adminItemContentReference,
  adminNpcContentReference,
  adminObjectContentReference,
  adminResourceContentReference,
} from './content-references.js';

const base = bootstrapContentRegistry();

describe('admin durable content reference resolution', () => {
  it('reports active, retired, and missing object references through canonical object resolution', () => {
    const chest = base.objects.get('object:chest')!;
    const renamed = { ...chest, id: 'object:moon_crate' as const };
    const activeRegistry = { objects: new Map([[renamed.id, renamed]]) };
    expect(adminObjectContentReference(activeRegistry, {
      kind: 'old_chest_kind', definitionId: renamed.id,
    })).toEqual({ definitionId: renamed.id, exists: true, retired: false });

    const retired = { ...renamed, retired: true };
    expect(adminObjectContentReference({ objects: new Map([[retired.id, retired]]) }, {
      kind: 'old_chest_kind', definitionId: retired.id,
    })).toEqual({ definitionId: retired.id, exists: true, retired: true });
    expect(adminObjectContentReference(activeRegistry, {
      kind: 'old_chest_kind', definitionId: 'object:missing',
    })).toEqual({ definitionId: 'object:missing', exists: false, retired: false });
  });

  it('reports active, retired, and missing resource definitionId references', () => {
    const fishPool = base.resources.get('resource:fish_pool')!;
    const renamed = { ...fishPool, id: 'resource:moon_pool' as const, runtimeKind: 'moon_pool' };
    const active = {
      ...base,
      resources: new Map([[renamed.id, renamed]]),
    } satisfies ContentRegistry;
    expect(adminResourceContentReference(active, {
      kind: 'old_pool', definitionId: renamed.id,
    })).toEqual({ definitionId: renamed.id, exists: true, retired: false });

    const retiredDefinition = { ...renamed, retired: true };
    const retired = {
      ...base,
      resources: new Map([[retiredDefinition.id, retiredDefinition]]),
    } satisfies ContentRegistry;
    expect(adminResourceContentReference(retired, {
      kind: 'old_pool', definitionId: retiredDefinition.id,
    })).toEqual({ definitionId: retiredDefinition.id, exists: true, retired: true });
    expect(adminResourceContentReference(active, {
      kind: 'old_pool', definitionId: 'resource:missing',
    })).toEqual({ definitionId: 'resource:missing', exists: false, retired: false });
  });

  it('uses runtimeNpcDefinition for renamed active NPCs and distinguishes retired from missing', () => {
    const horse = base.npcs.get('npc:horse')!;
    const renamed = { ...horse, id: 'npc:island_starter' as const };
    const active = { npcs: new Map([[renamed.id, renamed]]) };
    expect(adminNpcContentReference(active, { id: 1n, kind: 'old_horse' }))
      .toEqual({ definitionId: renamed.id, exists: true, retired: false });

    const retiredDefinition = { ...renamed, retired: true };
    expect(adminNpcContentReference({
      npcs: new Map([[retiredDefinition.id, retiredDefinition]]),
    }, { id: 1n, kind: 'old_horse' }))
      .toEqual({ definitionId: retiredDefinition.id, exists: true, retired: true });
    expect(adminNpcContentReference(active, { id: 88n, kind: 'missing' }))
      .toEqual({ definitionId: 'npc:missing', exists: false, retired: false });
  });

  it('reports exact active, retired, and missing item references', () => {
    const apple = base.items.get('item:apple')!;
    expect(adminItemContentReference(base, 'apple'))
      .toEqual({ definitionId: apple.id, exists: true, retired: false });
    expect(adminItemContentReference({ items: new Map([
      [apple.id, { ...apple, retired: true }],
    ]) }, 'apple'))
      .toEqual({ definitionId: apple.id, exists: true, retired: true });
    expect(adminItemContentReference(base, 'not_authored'))
      .toEqual({ definitionId: 'item:not_authored', exists: false, retired: false });
  });
});
