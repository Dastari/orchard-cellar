import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRows,
  buildContentRegistry,
  createReadOnlySnapshot,
  createHandlerRegistry,
  effectsResult,
  parseObjectDefinition,
  raiseEvent,
  registerHandler,
  registerObjectDataGraphs,
  runtimePlaceableBlocksMovement,
} from '@orchard/sim';
import type { CachedContentRegistry } from './cache.js';
import {
  authoredPlaceableLight,
  invalidateObjectGraphRegistryCache,
  objectGraphRegistryForContent,
  placementObjectForSelectedItem,
  planPlaceableLightEffect,
  planPlaceableCollisionEffect,
  planPlaceableStateEffect,
  resolvePlaceableObject,
} from './object-runtime.js';

const lamp = parseObjectDefinition({
  id: 'object:oil_lamp', kind: 'object', schemaVersion: 1, displayName: 'Oil Lamp',
  components: {
    identity: { tags: ['emits.light', 'decoration'] },
    states: {
      lit: { type: 'bool', default: false },
      intensity: { type: 'counter', default: 1, min: 0, max: 3 },
    },
    light: {
      when: { state: 'lit', equals: true }, color: [255, 196, 120],
      radiusTiles: 4, profile: 'steady', offsetY: -6,
    },
    interactions: [{
      id: 'toggle', verb: 'use', conditions: [],
      effects: [{ toggleState: 'lit' }, { setLight: { enabled: true } }],
    }],
  },
});

function registry() {
  const definitions = [...bootstrapContentRows(), { id: lamp.id, kind: lamp.kind, json: lamp }];
  return buildContentRegistry(definitions).registry;
}

describe('authored collision effects', () => {
  it('opens and closes a gate through declared state without making chest lids passable', () => {
    const content = registry();
    const gate = { kind: 'fence_gate', definitionId: 'object:fence_gate', stateJson: '{"open":false}', open: false, lit: false };
    const opened = { ...gate, ...planPlaceableCollisionEffect(content, gate, false) };
    expect(opened.open).toBe(true);
    expect(JSON.parse(opened.stateJson)).toEqual({ open: true });
    expect(runtimePlaceableBlocksMovement(content, opened)).toBe(false);
    const closed = { ...opened, ...planPlaceableCollisionEffect(content, opened, true) };
    expect(closed.open).toBe(false);
    expect(runtimePlaceableBlocksMovement(content, closed)).toBe(true);
    for (const kind of ['chest', 'barrel']) {
      const row = { kind, definitionId: `object:${kind}`, stateJson: '{"open":true}', open: true, lit: false };
      expect(runtimePlaceableBlocksMovement(content, row)).toBe(true);
      const unchanged = { ...row, ...planPlaceableCollisionEffect(content, row, true) };
      expect(unchanged).toEqual(row);
      expect(() => planPlaceableCollisionEffect(content, unchanged, true)).not.toThrow();
      expect(() => planPlaceableCollisionEffect(content, row, false)).toThrow('behaviour_collision_state_not_switchable');
    }
  });

  it('rejects malformed or unavailable collision state before mutation', () => {
    const content = registry();
    const gate = { kind: 'fence_gate', definitionId: 'object:fence_gate', stateJson: '{"open":"true"}', open: true, lit: false };
    expect(() => planPlaceableCollisionEffect(content, gate, false)).toThrow('behaviour_collision_state_invalid');
    expect(runtimePlaceableBlocksMovement(content, gate)).toBe(true);
    const missing = { ...gate, definitionId: 'object:missing', stateJson: '{}' };
    expect(() => planPlaceableCollisionEffect(content, missing, false)).toThrow('behaviour_collision_state_invalid');
    expect(runtimePlaceableBlocksMovement(content, missing)).toBe(true);
    const malformed = { ...gate, definitionId: 'invalid-explicit-id', stateJson: '{}' };
    expect(() => planPlaceableCollisionEffect(content, malformed, false)).toThrow('behaviour_collision_state_invalid');
    expect(runtimePlaceableBlocksMovement(content, malformed)).toBe(true);
  });
});

describe('world object runtime compatibility', () => {
  it('binds arbitrary item and object ids through the authored placement edge', () => {
    const portableCrate = parseObjectDefinition({
      id: 'object:field_cache', kind: 'object', schemaVersion: 1, displayName: 'Field Cache',
      components: {
        identity: { tags: ['container'] },
        placement: {
          item: 'item:portable_box', layer: 'object', spaces: ['topside'], facing: false,
        },
      },
    });
    const built = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: portableCrate.id, kind: portableCrate.kind, json: portableCrate },
    ]).registry;
    expect(placementObjectForSelectedItem(built, portableCrate.id, 'portable_box'))
      .toEqual(portableCrate);
    expect(placementObjectForSelectedItem(built, portableCrate.id, 'field_cache')).toBeNull();
    expect(placementObjectForSelectedItem(built, 'object:missing', 'portable_box')).toBeNull();
  });

  it.each([
    ['fruit_press', 'station.press', 'frame:press'],
    ['fermentation_cask', 'station.cellar', 'frame:fermentation'],
  ] as const)('opens a legacy empty-id %s through its runtime definition', (kind, tag, frame) => {
    const content = buildContentRegistry(bootstrapContentRows()).registry;
    const resolved = resolvePlaceableObject(content, {
      kind, open: false, lit: true, definitionId: '', stateJson: '{}',
    }, content.items.get(`item:${kind}`)?.tags ?? []);
    expect(resolved.definitionId).toBe(`object:${kind}`);
    expect(resolved.tags).toContain(tag);
    const target = {
      entityType: 'object' as const, id: '7', definitionId: resolved.definitionId,
      tags: resolved.tags, state: resolved.state,
      tile: { spaceId: '0', x: 11, y: 10, tags: [] },
    };
    const view = createReadOnlySnapshot({
      tick: 1n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'processor-legacy', definitions: {} },
      space: { id: '0', kind: 'topside', tags: [] },
      calendar: { minuteOfDay: 720, season: 'spring' },
      actor: {
        entityType: 'player', id: 'actor', tags: [],
        tile: { spaceId: '0', x: 10, y: 10, tags: [] },
        bronze: 0n, vitals: { hunger: 1, vigour: 1 }, inventory: [],
        worldRoles: ['player'], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
      },
      target,
      nearbyObjects: [],
    });
    const result = raiseEvent(registerObjectDataGraphs(
      createHandlerRegistry(), [...content.objects.values()], 1,
    ), {
      type: 'use', actor: { entityType: 'player', id: 'actor' },
      target: { entityType: 'object', id: target.id, definitionId: target.definitionId },
    }, view);
    if ('blocked' in result) throw new Error(result.blocked);
    expect(result.effects).toEqual([{ openFrame: frame }]);
  });

  it('preserves unknown legacy placeables through empty trailing-column defaults', () => {
    const row = { kind: 'future_unknown', open: true, lit: false, definitionId: '', stateJson: '{}' };
    expect(resolvePlaceableObject(buildContentRegistry(bootstrapContentRows()).registry, row, ['legacy'])).toEqual({
      definitionId: 'object:future_unknown', definition: null,
      state: { open: true, lit: false }, tags: ['legacy'], legacyFallback: true, stateJsonValid: true,
    });
  });

  it('merges authored defaults, legacy mirrors, and durable JSON without losing old state', () => {
    const row = {
      kind: 'lantern', open: true, lit: false, definitionId: lamp.id,
      stateJson: '{"intensity":2,"lit":true}',
    };
    expect(resolvePlaceableObject(registry(), row, ['legacy', 'emits.light'])).toMatchObject({
      definitionId: lamp.id, legacyFallback: false, stateJsonValid: true,
      state: { open: true, lit: true, intensity: 2 },
      tags: ['decoration', 'emits.light', 'legacy'],
    });
  });

  it('does not replace pre-schema compatibility state when its authored definition appears', () => {
    const row = {
      kind: 'oil_lamp', open: true, lit: true, definitionId: '', stateJson: '{}',
    };
    expect(resolvePlaceableObject(registry(), row).state).toEqual({
      open: true, lit: true, intensity: 1,
    });
    expect(planPlaceableStateEffect(registry(), row, { toggleState: 'lit' })).toEqual({
      definitionId: lamp.id,
      stateJson: '{"intensity":1,"lit":false}',
      open: true,
      lit: false,
    });
  });

  it('plans typed state changes deterministically and mirrors open/lit compatibility columns', () => {
    const row = { kind: 'lantern', open: false, lit: false, definitionId: lamp.id, stateJson: '{}' };
    expect(planPlaceableStateEffect(registry(), row, { toggleState: 'lit' })).toEqual({
      definitionId: lamp.id, stateJson: '{"intensity":1,"lit":true}', open: false, lit: true,
    });
    expect(planPlaceableStateEffect(registry(), row, {
      incrementState: { state: 'intensity', amount: 1 },
    })).toEqual({
      definitionId: lamp.id, stateJson: '{"intensity":2,"lit":false}', open: false, lit: false,
    });
    expect(() => planPlaceableStateEffect(registry(), row, { setState: { missing: true } }))
      .toThrow('behaviour_state_invalid:missing');
  });

  it('keeps legacy toggle behavior when no authored object exists', () => {
    const source = buildContentRegistry(bootstrapContentRows()).registry;
    const row = { kind: 'future_unknown', open: false, lit: true, definitionId: '', stateJson: '{}' };
    expect(planPlaceableStateEffect(source, row, { toggleState: 'lit' })).toEqual({
      definitionId: '', stateJson: '{}', open: false, lit: false,
    });
    expect(() => planPlaceableStateEffect(source, row, {
      incrementState: { state: 'intensity', amount: 1 },
    })).toThrow('behaviour_state_invalid:intensity');
  });

  it('resolves authored light and mirrors explicit light effects for legacy renderers', () => {
    const row = { kind: 'lantern', open: false, lit: false, definitionId: lamp.id, stateJson: '{}' };
    expect(authoredPlaceableLight(registry(), row)).toEqual({
      enabled: false, color: [255, 196, 120], radiusTiles: 4, profile: 'steady', offsetY: -6,
    });
    expect(planPlaceableLightEffect(registry(), row, true)).toEqual({
      definitionId: lamp.id, stateJson: '{"intensity":1,"lit":true}', open: false, lit: true,
    });
  });

  it('fails closed to legacy lighting when authored state JSON is invalid', () => {
    const row = {
      kind: 'lantern', open: false, lit: true, definitionId: lamp.id,
      stateJson: '{"lit":"yes"}',
    };
    expect(authoredPlaceableLight(registry(), row)).toBeNull();
    expect(planPlaceableLightEffect(registry(), row, false)).toEqual({
      definitionId: lamp.id, stateJson: '{"lit":"yes"}', open: false, lit: false,
    });
  });

  it('compiles and caches object graphs by exact content revision/hash', () => {
    invalidateObjectGraphRegistryCache();
    const content: CachedContentRegistry = {
      key: 'live:2:abc', revision: 2n, contentHash: 'abc', registry: registry(),
    };
    const base = createHandlerRegistry();
    const first = objectGraphRegistryForContent(base, content, 1);
    const second = objectGraphRegistryForContent(base, content, 1);
    expect(second).toBe(first);
    expect(first.registrations.map(({ id }) => id).filter((id) => id.includes('oil_lamp')))
      .toEqual(['object:oil_lamp.data_graph.toggle']);
    expect(objectGraphRegistryForContent(base, { ...content, key: 'live:3:def', revision: 3n }, 1))
      .not.toBe(first);
  });

  it('orders authored graph overrides ahead of same-priority migration handlers', () => {
    invalidateObjectGraphRegistryCache();
    const base = registerHandler(createHandlerRegistry(), {
      id: 'placeable.oil-lamp-migration', eventType: 'use', source: 'target',
      match: { kind: 'definition', definitionId: lamp.id },
      handler: () => effectsResult([{ sfx: 'compiled_fallback' }]),
    });
    const content: CachedContentRegistry = {
      key: 'live:8:override', revision: 8n, contentHash: 'override', registry: registry(),
    };
    expect(objectGraphRegistryForContent(base, content, 1).registrations
      .filter(({ id }) => id === 'object:oil_lamp.data_graph.toggle'
        || id === 'placeable.oil-lamp-migration').map(({ id }) => id)).toEqual([
      'object:oil_lamp.data_graph.toggle',
      'placeable.oil-lamp-migration',
    ]);
  });

  it('uses one code handler instead of also compiling the same item data graph', () => {
    invalidateObjectGraphRegistryCache();
    const built = buildContentRegistry(bootstrapContentRows());
    expect(built.report.valid).toBe(true);
    const base = registerHandler(createHandlerRegistry(), {
      id: 'item:fishing_handbook.on_use', eventType: 'secondary', source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:fishing_handbook' },
      handler: () => effectsResult([{ consumeSelected: 1 }]),
    });
    const content: CachedContentRegistry = {
      key: 'live:9:code', revision: 9n, contentHash: 'code', registry: built.registry,
    };
    const ids = objectGraphRegistryForContent(base, content, 1).registrations.map(({ id }) => id);
    expect(ids).toContain('item:fishing_handbook.on_use');
    expect(ids).not.toContain('item:fishing_handbook.data_graph.read');
  });

  it('suppresses item data graphs only for the exact code-owned event lane', () => {
    invalidateObjectGraphRegistryCache();
    const built = buildContentRegistry(bootstrapContentRows());
    const handbook = built.registry.items.get('item:fishing_handbook');
    if (handbook === undefined) throw new Error('missing fishing handbook fixture');
    const items = new Map(built.registry.items);
    items.set(handbook.id, Object.freeze({
      ...handbook,
      onUse: Object.freeze([
        ...handbook.onUse,
        Object.freeze({
          id: 'place-copy', verb: 'place' as const, prompt: 'PLACE', conditions: Object.freeze([]),
          effects: Object.freeze([{ consumeSelected: 1 }]),
        }),
      ]),
    }));
    const base = registerHandler(createHandlerRegistry(), {
      id: 'item:fishing_handbook.on_use', eventType: 'secondary', source: 'selectedItem',
      match: { kind: 'definition', definitionId: handbook.id },
      handler: () => effectsResult([{ consumeSelected: 1 }]),
    });
    const content: CachedContentRegistry = {
      key: 'live:10:event-lanes', revision: 10n, contentHash: 'event-lanes',
      registry: Object.freeze({ ...built.registry, items }),
    };
    const ids = objectGraphRegistryForContent(base, content, 1).registrations.map(({ id }) => id);
    expect(ids).not.toContain('item:fishing_handbook.data_graph.read');
    expect(ids).toContain('item:fishing_handbook.data_graph.place-copy');
  });
});
