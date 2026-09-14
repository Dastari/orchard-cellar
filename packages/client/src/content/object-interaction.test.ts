import { describe, expect, it } from 'vitest';
import { parseObjectDefinition } from '@orchard/sim';
import { objectSecondaryTarget, objectUsePrompt } from './object-interaction.js';

describe('authored object use metadata', () => {
  const definition = parseObjectDefinition({
    id: 'object:moon_machine', kind: 'object', schemaVersion: 1, displayName: 'Moon Machine',
    components: {
      placement: { item: 'item:moon_crate', layer: 'object', spaces: ['homestead'], facing: false },
      interactions: [
        { id: 'awaken', verb: 'use', prompt: 'AWAKEN MOON', conditions: [{ state: 'awake', equals: false }], effects: [] },
        { id: 'sleep', verb: 'use', prompt: 'SLEEP MOON', conditions: [{ state: 'awake', equals: true }], effects: [] },
      ],
    },
  });
  const registry = { objects: new Map([[definition.id, definition]]) };

  it('projects renamed placement edges and state branches without station-kind dispatch', () => {
    expect(objectUsePrompt(registry, { kind: 'moon_crate' }, { awake: false })).toBe('AWAKEN MOON');
    expect(objectUsePrompt(registry, { kind: 'unrelated', definitionId: definition.id }, { awake: true }))
      .toBe('SLEEP MOON');
  });

  it('does not advertise use for missing definitions or objects with no authored callback', () => {
    expect(objectUsePrompt(registry, { kind: 'furnace' }, {})).toBeNull();
    expect(objectUsePrompt(registry, { kind: 'moon_crate', definitionId: 'object:missing' }, {})).toBeNull();
    const inert = { ...definition, components: { placement: definition.components.placement! } };
    expect(objectUsePrompt({ objects: new Map([[inert.id, inert]]) }, { kind: 'moon_crate' }, {})).toBeNull();
  });

  it('requires a real target and state-matching active secondary callback before intercepting selected use', () => {
    const target = { id: 3200000003n, tileX: 403, tileY: 319, lit: true };
    const secondary = parseObjectDefinition({
      ...definition,
      components: {
        ...definition.components,
        interactions: [{ id: 'dim', verb: 'secondary', conditions: [
          { state: 'lit', equals: true },
        ], effects: [{ toggleState: 'lit' }] }],
      },
    });
    // Decorative landmarks have no authority row: even a valid callback must
    // leave the input available to the selected item's normal secondary use.
    expect(objectSecondaryTarget(undefined, secondary, { lit: true })).toBeNull();
    expect(objectSecondaryTarget(target, undefined, { lit: true })).toBeNull();
    expect(objectSecondaryTarget(target, definition, { lit: true })).toBeNull();
    expect(objectSecondaryTarget(target, { ...secondary, retired: true }, { lit: true })).toBeNull();
    expect(objectSecondaryTarget(target, secondary, { lit: false })).toBeNull();
    expect(objectSecondaryTarget(target, secondary, { lit: true })).toBe(target);
  });
});
