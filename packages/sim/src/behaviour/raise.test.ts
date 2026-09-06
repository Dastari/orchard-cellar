import { describe, expect, it, vi } from 'vitest';
import type { Effect } from './effects.js';
import type { LifecycleEvent } from './events.js';
import {
  MAX_EFFECTS_PER_HANDLER_RESULT,
  blockedResult,
  effectsResult,
  type Handler,
} from './handler.js';
import { EFFECT_CAP_EXCEEDED_BLOCK, raiseEvent } from './raise.js';
import {
  createHandlerRegistry,
  type AnyHandlerRegistration,
  type HandlerMatcher,
  type HandlerSource,
} from './registry.js';
import { createReadOnlySnapshot, type ReadOnlySnapshot } from './snapshot.js';

function snapshot(): ReadOnlySnapshot {
  return createReadOnlySnapshot({
    tick: 10n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
    space: { id: 'space:test', kind: 'homestead', tags: [] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    selectedItem: { kind: 'axe', tags: ['tool.axe'], count: 1 },
    target: {
      entityType: 'object',
      id: 'object:1',
      definitionId: 'object:tree',
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
  target: { entityType: 'object', id: 'object:1', definitionId: 'object:tree' },
} as const satisfies LifecycleEvent;

function registered(
  id: string,
  source: HandlerSource,
  handler: Handler,
  priority = 0,
  match: HandlerMatcher = { kind: 'any' },
): AnyHandlerRegistration {
  return { id, eventType: 'useWith', source, match, priority, handler };
}

function emitted(label: string): Effect {
  return { sfx: label };
}

describe('raiseEvent', () => {
  it('stops at the first successful handler unless it explicitly continues', () => {
    const first = vi.fn<Handler>(() => effectsResult([emitted('first')]));
    const later = vi.fn<Handler>(() => effectsResult([emitted('later')]));
    const registry = createHandlerRegistry([
      registered('later', 'target', later),
      registered('first', 'selectedItem', first),
    ]);

    expect(raiseEvent(registry, event, snapshot())).toEqual({ effects: [emitted('first')] });
    expect(first).toHaveBeenCalledOnce();
    expect(later).not.toHaveBeenCalled();
  });

  it('concatenates continued effects in source and priority order', () => {
    const calls: string[] = [];
    const continuing = (label: string): Handler => () => {
      calls.push(label);
      return effectsResult([emitted(label)], { continue: true });
    };
    const winner: Handler = () => {
      calls.push('tile');
      return effectsResult([emitted('tile')]);
    };
    const registry = createHandlerRegistry([
      registered('tile', 'tile', winner, 100, { kind: 'tag', tag: 'ground.grass' }),
      registered('target-low', 'target', continuing('target-low'), 1),
      registered('item', 'selectedItem', continuing('item')),
      registered('target-high', 'target', continuing('target-high'), 10),
    ]);

    expect(raiseEvent(registry, event, snapshot())).toEqual({
      effects: [emitted('item'), emitted('target-high'), emitted('target-low'), emitted('tile')],
    });
    expect(calls).toEqual(['item', 'target-high', 'target-low', 'tile']);
  });

  it('propagates a block and atomically discards earlier continued effects', () => {
    const blocked = blockedResult('requires_builder_role');
    const later = vi.fn<Handler>(() => effectsResult([emitted('never')]));
    const registry = createHandlerRegistry([
      registered('first', 'selectedItem', () => effectsResult([emitted('discarded')], { continue: true })),
      registered('blocked', 'target', () => blocked),
      registered('later', 'tile', later),
    ]);

    expect(raiseEvent(registry, event, snapshot())).toBe(blocked);
    expect(later).not.toHaveBeenCalled();
  });

  it('returns an empty successful result when nothing matches', () => {
    expect(raiseEvent(createHandlerRegistry(), event, snapshot())).toEqual({ effects: [] });
  });

  it('blocks an individually oversized effect list', () => {
    const oversized = Array.from(
      { length: MAX_EFFECTS_PER_HANDLER_RESULT + 1 },
      (_, index) => emitted(`effect-${index}`),
    );
    const registry = createHandlerRegistry([
      registered('oversized', 'global', () => effectsResult(oversized)),
    ]);
    expect(raiseEvent(registry, event, snapshot())).toEqual({ blocked: EFFECT_CAP_EXCEEDED_BLOCK });
  });

  it('blocks when continued handlers cumulatively exceed the effect cap', () => {
    const first = Array.from(
      { length: MAX_EFFECTS_PER_HANDLER_RESULT - 1 },
      (_, index) => emitted(`first-${index}`),
    );
    const registry = createHandlerRegistry([
      registered('first', 'selectedItem', () => effectsResult(first, { continue: true })),
      registered('second', 'target', () => effectsResult([emitted('second-1'), emitted('second-2')])),
    ]);
    expect(raiseEvent(registry, event, snapshot())).toEqual({ blocked: EFFECT_CAP_EXCEEDED_BLOCK });
  });
});
