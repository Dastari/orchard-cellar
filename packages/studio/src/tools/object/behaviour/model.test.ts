import { describe, expect, it, vi } from 'vitest';
import { createReadOnlySnapshot } from '@orchard/sim';
import { OBJECT_BEHAVIOUR_REGISTRATION } from './contracts.js';
import { createObjectBehaviourModel } from './model.js';

function lampDefinition() {
  return {
    id: 'object:oil_lamp', kind: 'object', schemaVersion: 1, displayName: 'Oil Lamp',
    components: {
      identity: { tags: ['emits.light'] },
      states: { lit: { type: 'bool', default: false } },
      light: {
        when: { state: 'lit', equals: true }, color: [255, 196, 120],
        radiusTiles: 4, profile: 'steady', offsetY: -6,
      },
      interactions: [{
        id: 'toggle', verb: 'use', prompt: { lit: 'PUT OUT', default: 'LIGHT' },
        conditions: [{ reach: 'object' }],
        effects: [{ toggleState: 'lit' }, { sfx: 'lantern_click' }, { statistic: 'lights_toggled' }],
      }],
    },
  } as const;
}

function previewSnapshot(lit = false) {
  const tile = { spaceId: 'space:test', x: 11, y: 10, tags: ['grass'] } as const;
  return createReadOnlySnapshot({
    tick: 10n,
    registry: { engineVersion: 1, revision: 3n, contentHash: 'preview', definitions: {} },
    space: { id: tile.spaceId, kind: 'homestead', tags: [] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      entityType: 'player', id: 'player', tags: [], tile: { ...tile, x: 10 }, bronze: 10n,
      vitals: { hunger: 5000, vigour: 5000 }, inventory: [], worldRoles: ['player'],
      homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
    },
    target: {
      entityType: 'object', id: 'object:7', definitionId: 'object:oil_lamp', tags: ['emits.light'], tile,
      state: { lit },
    },
    nearbyObjects: [],
  });
}

function useEvent() {
  return {
    type: 'use' as const,
    actor: { entityType: 'player' as const, id: 'player' },
    target: { entityType: 'object' as const, id: 'object:7', definitionId: 'object:oil_lamp' },
  };
}

describe('Object Studio behaviour graph model', () => {
  it('exports an isolated Object Studio contribution descriptor', () => {
    expect(OBJECT_BEHAVIOUR_REGISTRATION).toMatchObject({
      id: 'object.behaviour', parentToolId: 'object', tab: { id: 'behaviour' },
    });
    expect(OBJECT_BEHAVIOUR_REGISTRATION.docks).toEqual([
      'behaviour', 'inspector', 'preview', 'validation',
    ]);
  });

  it('edits condition/effect nodes deterministically and validates continuously', () => {
    const model = createObjectBehaviourModel({ definition: lampDefinition(), access: 'anonymous' });
    expect(model.snapshot()).toMatchObject({ dirty: false, validation: { valid: true } });
    expect(model.snapshot().nodes.map(({ id }) => id)).toEqual([
      'toggle/trigger', 'toggle/condition/0', 'toggle/effect/0', 'toggle/effect/1', 'toggle/effect/2',
    ]);

    model.insertNode('toggle', 'condition', 1, { state: 'lit', equals: false });
    model.insertNode('toggle', 'effect', 1, { animation: 'light_lamp' });
    model.moveNode('toggle/effect/3', 0);
    model.updateNode('toggle/effect/3', { sfx: 'oil_lamp_click' });
    const edited = model.snapshot();
    expect(edited.validation.valid).toBe(true);
    expect(edited.dirty).toBe(true);
    expect(edited.definition.components.interactions?.[0]?.effects).toEqual([
      { statistic: 'lights_toggled' }, { toggleState: 'lit' },
      { animation: 'light_lamp' }, { sfx: 'oil_lamp_click' },
    ]);
    model.removeNode('toggle/condition/1');
    expect(model.snapshot().definition.components.interactions?.[0]?.conditions).toEqual([{ reach: 'object' }]);
  });

  it('adds, updates, and removes interaction trigger nodes', () => {
    const model = createObjectBehaviourModel({ definition: lampDefinition(), access: 'anonymous' });
    model.addInteraction({
      id: 'refuel', verb: 'secondary', prompt: 'REFUEL',
      conditions: [{ state: 'lit', equals: false }, { selectedItem: { tag: 'fuel.oil' } }],
      effects: [{ consumeSelected: 1 }, { setState: { lit: true } }],
    });
    expect(model.snapshot().nodes.map(({ id }) => id)).toContain('refuel/trigger');
    model.updateInteraction('refuel', { id: 'refuel_oil', priority: 20 });
    expect(model.snapshot().definition.components.interactions?.[1]).toMatchObject({ id: 'refuel_oil', priority: 20 });
    model.removeInteraction('refuel_oil');
    expect(model.snapshot().definition.components.interactions).toHaveLength(1);
  });

  it('previews the exact effect list and state-aware prompt without applying it', () => {
    const model = createObjectBehaviourModel({ definition: lampDefinition(), access: 'anonymous' });
    expect(model.preview('toggle', useEvent(), previewSnapshot(false))).toEqual({
      interactionId: 'toggle', available: true, prompt: 'LIGHT',
      effects: [{ toggleState: 'lit' }, { sfx: 'lantern_click' }, { statistic: 'lights_toggled' }],
    });
    expect(model.preview('toggle', useEvent(), previewSnapshot(true)).prompt).toBe('PUT OUT');
    expect(previewSnapshot(false).target).toMatchObject({ state: { lit: false } });
  });

  it('constructs no live adapter anonymously and never publishes implicitly', async () => {
    const createAdapter = vi.fn(() => ({ publishContentChangeSet: vi.fn(async () => undefined) }));
    const model = createObjectBehaviourModel({
      definition: lampDefinition(), access: 'anonymous', createPublishAdapter: createAdapter,
    });
    model.insertNode('toggle', 'effect', 3, { animation: 'light_lamp' });
    expect(createAdapter).not.toHaveBeenCalled();
    await expect(model.publish('object.oil-lamp.1', 'preview only'))
      .rejects.toThrow('object_behaviour_publish_unavailable');
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it('publishes only through an explicit write adapter with the current reducer envelope', async () => {
    const publishContentChangeSet = vi.fn(async () => undefined);
    const model = createObjectBehaviourModel({
      definition: lampDefinition(), access: 'write', baseRevision: 12n,
      createPublishAdapter: () => ({ publishContentChangeSet }),
    });
    model.insertNode('toggle', 'effect', 3, { animation: 'light_lamp' });
    const request = model.buildPublishRequest('object.oil-lamp.12', '  add preview animation  ');
    expect(request).toMatchObject({
      packId: 'live', expectedRevision: 12n, clientMutationId: 'object.oil-lamp.12',
      deletes: '[]', note: 'add preview animation',
    });
    expect(JSON.parse(request.upserts)).toEqual([
      expect.objectContaining({ id: 'object:oil_lamp', kind: 'object' }),
    ]);
    expect(publishContentChangeSet).not.toHaveBeenCalled();
    await model.publish('object.oil-lamp.12', 'add preview animation');
    expect(publishContentChangeSet).toHaveBeenCalledWith(request);
  });

  it('gates incompatible engines and read-only editing', () => {
    const model = createObjectBehaviourModel({
      definition: lampDefinition(), access: 'write', headEngineVersion: 2,
      createPublishAdapter: () => ({ publishContentChangeSet: vi.fn(async () => undefined) }),
    });
    model.insertNode('toggle', 'effect', 3, { animation: 'light_lamp' });
    expect(model.snapshot()).toMatchObject({ engineGate: 'requires_update', canPublish: false });
    expect(() => model.buildPublishRequest('object.future.1', 'future')).toThrow('content_engine_update_required');

    const readOnly = createObjectBehaviourModel({ definition: lampDefinition(), access: 'read_only' });
    expect(() => readOnly.removeInteraction('toggle')).toThrow('object_behaviour_read_only');
  });

  it('surfaces graph ambiguity and state-reference errors from the shared validator', () => {
    const model = createObjectBehaviourModel({ definition: lampDefinition(), access: 'anonymous' });
    model.addInteraction({
      id: 'duplicate_use', verb: 'use', conditions: [{ state: 'missing', equals: true }], effects: [{ sfx: 'bad' }],
    });
    expect(model.snapshot().validation.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'ambiguous_interaction', 'invalid_component_set',
    ]));
  });
});
