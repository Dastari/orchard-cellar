import { describe, expect, it } from 'vitest';
import type { LifecycleEvent } from './events.js';
import { effectsResult, type Handler } from './handler.js';
import {
  createHandlerRegistry,
  registerHandler,
  resolveHandlers,
  type AnyHandlerRegistration,
  type HandlerRegistration,
} from './registry.js';
import { createReadOnlySnapshot, type ReadOnlySnapshot } from './snapshot.js';

const noop: Handler = () => effectsResult([]);

function snapshot(): ReadOnlySnapshot {
  return createReadOnlySnapshot({
    tick: 10n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
    space: { id: 'space:test', kind: 'homestead', tags: [] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      entityType: 'player',
      id: 'player:1',
      tags: [],
      tile: { spaceId: 'space:test', x: 4, y: 4, tags: ['ground.soil'] },
      bronze: 0n,
      vitals: { hunger: 5_000, vigour: 5_000 },
      inventory: [],
      worldRoles: ['player'],
      homesteadRoles: {},
      questStates: {},
      statistics: {},
      skillRanks: {},
    },
    selectedItem: {
      kind: 'axe',
      definitionId: 'item:iron_axe',
      tags: ['item.tool', 'tool.axe'],
      count: 1,
    },
    target: {
      entityType: 'object',
      id: 'object:1',
      definitionId: 'object:oak_tree',
      tags: ['resource.tree'],
      tile: { spaceId: 'space:test', x: 5, y: 4, tags: ['ground.grass'] },
      state: {},
    },
    nearbyObjects: [],
  });
}

const event = {
  type: 'useWith',
  actor: { entityType: 'player', id: 'player:1' },
  selectedItem: { kind: 'axe' },
  target: { entityType: 'object', id: 'object:1', definitionId: 'object:oak_tree' },
} as const satisfies LifecycleEvent;

function registration(
  id: string,
  source: HandlerRegistration<'useWith'>['source'],
  match: HandlerRegistration<'useWith'>['match'],
  priority = 0,
): HandlerRegistration<'useWith'> {
  return { id, eventType: 'useWith', source, match, priority, handler: noop };
}

describe('behaviour handler registry', () => {
  it('canonicalises registration order by event, source, descending priority, then id', () => {
    const registrations = [
      registration('tile', 'tile', { kind: 'tag', tag: 'ground.grass' }, 100),
      registration('target-low', 'target', { kind: 'tag', tag: 'resource.tree' }, 1),
      registration('item-b', 'selectedItem', { kind: 'tag', tag: 'tool.axe' }, 5),
      registration('target-high', 'target', { kind: 'definition', definitionId: 'object:oak_tree' }, 10),
      registration('item-a', 'selectedItem', { kind: 'definition', definitionId: 'item:iron_axe' }, 5),
      registration('global', 'global', { kind: 'any' }, 1_000),
    ] as const satisfies readonly AnyHandlerRegistration[];

    const forward = resolveHandlers(createHandlerRegistry(registrations), event, snapshot());
    const reverse = resolveHandlers(createHandlerRegistry([...registrations].reverse()), event, snapshot());
    const ids = ['item-a', 'item-b', 'target-high', 'target-low', 'tile', 'global'];
    expect(forward.map(({ registrationId }) => registrationId)).toEqual(ids);
    expect(reverse.map(({ registrationId }) => registrationId)).toEqual(ids);
  });

  it('matches selected items by live definition id, legacy kind, or tag', () => {
    const registry = createHandlerRegistry([
      registration('definition', 'selectedItem', { kind: 'definition', definitionId: 'item:iron_axe' }),
      registration('legacy-kind', 'selectedItem', { kind: 'definition', definitionId: 'axe' }),
      registration('tag', 'selectedItem', { kind: 'tag', tag: 'tool.axe' }),
      registration('miss', 'selectedItem', { kind: 'tag', tag: 'tool.pickaxe' }),
    ]);
    expect(resolveHandlers(registry, event, snapshot()).map(({ registrationId }) => registrationId)).toEqual([
      'definition', 'legacy-kind', 'tag',
    ]);
  });

  it('keeps registration immutable and rejects ambiguous registry state', () => {
    const empty = createHandlerRegistry();
    const first = registerHandler(empty, registration('one', 'global', { kind: 'any' }));
    expect(empty.registrations).toEqual([]);
    expect(first.registrations.map(({ id }) => id)).toEqual(['one']);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.registrations)).toBe(true);
    expect(() => registerHandler(first, registration('one', 'global', { kind: 'any' }))).toThrow(
      /duplicate behaviour handler id/u,
    );
    expect(() => createHandlerRegistry([
      registration('bad-global', 'global', { kind: 'tag', tag: 'anything' }),
    ])).toThrow(/must use the any matcher/u);
    expect(() => createHandlerRegistry([
      registration('bad-priority', 'target', { kind: 'any' }, Number.NaN),
    ])).toThrow(/safe integer/u);
  });

  it('does not match a target registration against a tile-only target', () => {
    const tileView: ReadOnlySnapshot = {
      ...snapshot(),
      target: { spaceId: 'space:test', x: 5, y: 4, tags: ['ground.grass'] },
    };
    const registry = createHandlerRegistry([
      registration('target', 'target', { kind: 'any' }),
      registration('tile', 'tile', { kind: 'tag', tag: 'ground.grass' }),
    ]);
    expect(resolveHandlers(registry, event, tileView).map(({ registrationId }) => registrationId)).toEqual(['tile']);
  });
});
