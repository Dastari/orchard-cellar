import {
  compileObjectDataGraph,
  createHandlerRegistry,
  createReadOnlySnapshot,
  effectsResult,
  parseObjectDefinition,
  type AnyHandlerRegistration,
  type BehaviourTargetSnapshot,
  type LifecycleEvent,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import { raiseSystemLifecycleEvent } from './system-events.js';

const tile = { spaceId: 'space:moon', x: 7, y: 11, tags: ['tile:moon_path'] } as const;

function snapshot(target?: BehaviourTargetSnapshot) {
  return createReadOnlySnapshot({
    tick: 42n,
    registry: { engineVersion: 1, revision: 9n, contentHash: 'spatial-test', definitions: {} },
    space: { id: tile.spaceId, kind: 'moon_orchard', tags: ['space:night'] },
    calendar: { minuteOfDay: 60, season: 'winter' },
    ...(target === undefined ? {} : { target }),
    nearbyObjects: [],
  });
}

function registration(
  id: string,
  eventType: 'walkOnto' | 'enterSpace' | 'leaveSpace' | 'despawn',
  source: 'tile' | 'target' | 'global',
  effect: Parameters<typeof effectsResult>[0][number],
): AnyHandlerRegistration {
  return {
    id,
    eventType,
    source,
    match: source === 'global' ? { kind: 'any' } : source === 'tile'
      ? { kind: 'tag', tag: 'tile:moon_path' }
      : { kind: 'definition', definitionId: 'object:moon_gate' },
    handler: () => effectsResult([effect]),
  } as AnyHandlerRegistration;
}

describe('system lifecycle event bridge', () => {
  it('executes an arbitrary authored object walkOnto definition', () => {
    const definition = parseObjectDefinition({
      id: 'object:moon_gate', kind: 'object', schemaVersion: 1, displayName: 'Moon Gate',
      components: { interactions: [{
        id: 'glimmer', verb: 'walk_onto', conditions: [], effects: [{ animation: 'moon_glimmer' }],
      }] },
    });
    const target = {
      entityType: 'object' as const,
      id: 'gate-1',
      definitionId: definition.id,
      tags: [], tile, state: {},
    };
    expect(raiseSystemLifecycleEvent(createHandlerRegistry([
      compileObjectDataGraph(definition, 1)[0]!,
    ]), {
      type: 'walkOnto', actor: { entityType: 'player', id: 'traveller' }, tile,
    }, snapshot(target))).toEqual([{ animation: 'moon_glimmer' }]);
  });

  it.each([
    ['walkOnto', registration('moon.walk', 'walkOnto', 'tile', { animation: 'moon_glimmer' }),
      { type: 'walkOnto', actor: { entityType: 'player', id: 'traveller' }, tile }],
    ['enterSpace', registration('moon.enter', 'enterSpace', 'global', { sfx: 'moon_arrival' }),
      { type: 'enterSpace', actor: { entityType: 'player', id: 'traveller' }, space: { id: tile.spaceId } }],
    ['leaveSpace', registration('moon.leave', 'leaveSpace', 'global', { animation: 'moon_fade' }),
      { type: 'leaveSpace', actor: { entityType: 'player', id: 'traveller' }, space: { id: tile.spaceId } }],
  ] as const)('raises arbitrary %s registrations', (_name, handler, event) => {
    expect(raiseSystemLifecycleEvent(createHandlerRegistry([handler]), event, snapshot(tile)))
      .toHaveLength(1);
  });

  it('matches an arbitrary authored object definition on despawn', () => {
    const target = {
      entityType: 'object' as const,
      id: 'gate-1',
      definitionId: 'object:moon_gate',
      tags: [], tile, state: { open: true },
    };
    const event: LifecycleEvent = {
      type: 'despawn',
      subject: { entityType: 'object', id: target.id, definitionId: target.definitionId },
    };
    expect(raiseSystemLifecycleEvent(createHandlerRegistry([
      registration('moon.despawn', 'despawn', 'target', { sfx: 'moon_gate_vanish' }),
    ]), event, snapshot(target))).toEqual([{ sfx: 'moon_gate_vanish' }]);
  });

  it('fails closed on durable effects before engine-owned movement or despawn', () => {
    const registry = createHandlerRegistry([
      registration('moon.teleport', 'enterSpace', 'global', {
        teleport: { spaceId: 'space:void', x: 0, y: 0 },
      }),
    ]);
    expect(() => raiseSystemLifecycleEvent(registry, {
      type: 'enterSpace', actor: { entityType: 'player', id: 'traveller' }, space: { id: tile.spaceId },
    }, snapshot())).toThrow('system_lifecycle_effect_unavailable:teleport');
  });
});
