import { describe, expect, it } from 'vitest';
import { HEARTH_FURNITURE_SHAPES } from '../hearth-furniture-state.js';
import { bootstrapContentDefinitions } from '../content/bootstrap-registry.js';
import type { ItemContentDefinition } from '../content/definitions.js';
import type { ObjectContentDefinition } from '../content/object-definition.js';
import type { LifecycleEvent } from './events.js';
import { raiseEvent } from './raise.js';
import { createHandlerRegistry } from './registry.js';
import { createReadOnlySnapshot, type ReadOnlySnapshotInput } from './snapshot.js';
import { registerObjectDataGraphs } from './data-graph.js';
import { registerProcessorHandlers } from './handlers/processors.js';
import { PLACEABLE_HANDLER_REGISTRATIONS } from './handlers/placeables.js';

const tile = { spaceId: '0', x: 11, y: 10, tags: ['grass'] } as const;
const objects = bootstrapContentDefinitions().filter(
  (definition): definition is ObjectContentDefinition => definition.kind === 'object',
);

function snapshot(
  definitionId: string,
  state: Readonly<Record<string, boolean>> = {},
  tags: readonly string[] = [],
): ReturnType<typeof createReadOnlySnapshot> {
  const target = { entityType: 'object' as const, id: '7', definitionId, tags, tile, state };
  const input: ReadOnlySnapshotInput = {
    tick: 1000n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'bootstrap-object-graphs',
      definitions: Object.fromEntries(objects.map((definition) => [definition.id, {
        id: definition.id, kind: definition.kind, tags: definition.components.identity?.tags ?? [],
      }])) },
    space: { id: '0', kind: 'homestead', tags: ['outdoors'] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      entityType: 'player', id: 'player', tags: [], tile: { ...tile, x: 10 },
      bronze: 100n, vitals: { hunger: 5000, vigour: 7500 }, inventory: [],
      worldRoles: ['player'], homesteadRoles: { '0': 'owner' }, questStates: {},
      statistics: {}, skillRanks: {},
    },
    target,
    nearbyObjects: [],
  };
  return createReadOnlySnapshot(input);
}

function effects(event: LifecycleEvent, view: ReturnType<typeof createReadOnlySnapshot>) {
  const registry = registerObjectDataGraphs(
    registerProcessorHandlers(objects, createHandlerRegistry()), objects, 1,
  );
  const result = raiseEvent(registry, event, view);
  if ('blocked' in result) throw new Error(result.blocked);
  return result.effects;
}

function use(definitionId: string): LifecycleEvent {
  return { type: 'use', actor: { entityType: 'player', id: 'player' },
    target: { entityType: 'object', id: '7', definitionId } };
}

describe('bootstrap authored object behaviour parity', () => {
  it('contains the exact reviewed object graph migration batch', () => {
    expect(objects.map(({ id }) => id)).toEqual([
      'object:anvil', 'object:archery_target', 'object:barn', 'object:barrel',
      'object:camp_cooking_fire', 'object:campfire',
      'object:chest', 'object:cooking_fire', 'object:coop', 'object:farmer_jane_memorial',
      'object:fence', 'object:fence_gate',
      'object:fermentation_cask', 'object:fruit_press', 'object:furnace', 'object:greenhouse',
      'object:lantern', 'object:shed', 'object:sign', 'object:silo', 'object:sprinkler',
      'object:standing_torch', 'object:workbench',
      ...Object.keys(HEARTH_FURNITURE_SHAPES).map(id => `object:${id}`),
    ].sort());
    const compiledIds = new Set<string>(PLACEABLE_HANDLER_REGISTRATIONS.map(({ id }) => id));
    for (const retiredId of [
      'placeable.fence-gate-toggle', 'placeable.campfire-toggle',
      'placeable.ground-lantern-toggle', 'placeable.open.station.furnace',
      'placeable.open.station.campfire', 'placeable.open.station.press',
      'placeable.open.station.cellar', 'placeable.open.container.barrel',
      'placeable.chest-open',
    ]) expect(compiledIds.has(retiredId), retiredId).toBe(false);
  });

  it('gives every live placeable item an authored presentation and placement graph', () => {
    const placeableItems = bootstrapContentDefinitions().filter((definition): definition is ItemContentDefinition => (
      definition.kind === 'item' && definition.retired !== true && definition.tags.includes('item.placeable')
    ));
    const byItem = new Map(objects.flatMap((definition) => (
      definition.components.placement === undefined
        ? [] : [[definition.components.placement.item, definition] as const]
    )));
    expect([...byItem.keys()].sort()).toEqual(placeableItems.map(({ id }) => id).sort());
    for (const item of placeableItems) {
      const definition = byItem.get(item.id);
      expect(definition?.components.sprite, `${item.id} sprite`).toBeDefined();
      expect(definition?.components.collision, `${item.id} collision`).toBeDefined();
      expect(definition?.components.placement, `${item.id} placement`).toBeDefined();
    }
  });

  it.each([
    ['object:fence_gate', false, [{ toggleState: 'open' }, { setCollision: false }]],
    ['object:fence_gate', true, [{ toggleState: 'open' }, { setCollision: true }]],
  ] as const)('preserves the §11 row-5 %s open=%s golden', (definitionId, open, golden) => {
    expect(effects(use(definitionId), snapshot(definitionId, { open }, ['build.fence'])))
      .toEqual(golden);
  });

  it.each([
    ['object:campfire', false, [{ toggleState: 'lit' }, { setLight: { enabled: true } }]],
    ['object:campfire', true, [{ toggleState: 'lit' }, { setLight: { enabled: false } }]],
    ['object:camp_cooking_fire', false, [{ toggleState: 'lit' }, { setLight: { enabled: true } }]],
    ['object:cooking_fire', false, [{ toggleState: 'lit' }, { setLight: { enabled: true } }]],
  ] as const)('preserves the §11 light golden for %s', (definitionId, lit, golden) => {
    const event = {
      type: 'secondary' as const, actor: { entityType: 'player' as const, id: 'player' },
      selectedItem: { kind: 'hands' },
      target: { entityType: 'object' as const, id: '7', definitionId },
    };
    expect(effects(event, snapshot(definitionId, { lit }, ['emits.light']))).toEqual(golden);
  });

  it('leaves ground lantern object presentation inert because item:lantern owns use', () => {
    expect(effects(use('object:lantern'), snapshot('object:lantern', { lit: true }, ['emits.light'])))
      .toEqual([]);
  });

  it.each([
    ['object:barrel', ['container.barrel'], 'frame:barrel'],
    ['object:campfire', ['station.campfire'], 'frame:cooking'],
    ['object:camp_cooking_fire', ['station.campfire'], 'frame:cooking'],
    ['object:cooking_fire', ['station.campfire'], 'frame:cooking'],
    ['object:fermentation_cask', ['station.cellar'], 'frame:fermentation'],
    ['object:fruit_press', ['station.press'], 'frame:press'],
    ['object:furnace', ['station.furnace'], 'frame:furnace'],
  ] as const)('preserves settle-then-open parity for %s', (definitionId, tags, frame) => {
    expect(effects(use(definitionId), snapshot(definitionId, {}, tags))).toEqual([
      { settleProcess: true }, { openFrame: frame },
    ]);
  });

  it('opens a chest from its authored object graph without a processor settlement', () => {
    expect(effects(use('object:chest'), snapshot(
      'object:chest', { hasContents: true }, ['container', 'damageable'],
    ))).toEqual([{ openFrame: 'frame:chest' }]);
  });

  it('leaves an unknown persisted object compatible and inert instead of guessing behavior', () => {
    expect(effects(use('object:future_unknown'), snapshot('object:future_unknown'))).toEqual([]);
  });
});
