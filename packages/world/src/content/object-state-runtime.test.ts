import { describe, expect, it } from 'vitest';
import { createObjectLifecycleState, encodeObjectLifecycle, defineAuthoredLifecycle,
  type ObjectContentDefinition, type ReadOnlySnapshot } from '@orchard/sim';
import { planObjectStateSettlement } from './object-state-runtime.js';
const definition: ObjectContentDefinition = { id: 'object:clock', kind: 'object', schemaVersion: 1, displayName: 'Clock', components: {
  states: { ready: { type: 'bool', default: false } },
  transitions: [{ id: 'ready', from: { ready: false }, to: { ready: true }, after: { ticks: 5 }, run: { callback: 'ready' } }],
} };
const view: ReadOnlySnapshot = { tick: 10n, registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
  space: { id: '1', kind: 'world', tags: [] }, calendar: { minuteOfDay: 0, season: 'spring' }, nearbyObjects: [],
  target: { entityType: 'object', id: '42', definitionId: definition.id, tags: [], tile: { spaceId: '1', x: 0, y: 0, tags: [] }, state: { ready: false, open: false, lit: false } } };
const callback = defineAuthoredLifecycle({ id: 'ready', definitionId: definition.id, kind: 'object', hook: 'onTransition', run(ctx) { ctx.emit({ setLight: { enabled: true } }); } });
const input = { definition, view, now: 10n, stored: encodeObjectLifecycle(createObjectLifecycleState(definition, 0n)),
  callbacks: [callback], engineVersion: 1, authority: { approved: () => true, consume: () => true, audit: () => {} } };
describe('authoritative object settlement', () => {
  it('settles once across persistence and strips compatibility-only state', () => {
    const plan = planObjectStateSettlement(input);
    expect(plan.effects).toEqual([{ setLight: { enabled: true } }]);
    expect(plan.state.values).toEqual({ ready: true });
    const target = { ...view.target!, state: plan.state.values };
    expect(planObjectStateSettlement({ ...input, stored: plan.stored, view: { ...view, target } }).effects).toEqual([]);
  });
  it('rejects unapproved callbacks, missing ownership and exhausted budgets', () => {
    expect(() => planObjectStateSettlement({ ...input, authority: { ...input.authority, approved: () => false } })).toThrow('approval_required');
    expect(() => planObjectStateSettlement({ ...input, callbacks: [{ ...callback, definitionId: 'object:other' }] })).toThrow('callback_missing');
    expect(() => planObjectStateSettlement({ ...input, authority: { ...input.authority, consume: () => false } })).toThrow('invocation_limit');
  });
  it('rejects corrupt persisted anchors instead of replaying', () => {
    expect(() => planObjectStateSettlement({ ...input, stored: '{}' })).toThrow('object_lifecycle_invalid');
  });
});

it('explicit state mutation preserves elapsed growth and excludes a paused interval', () => {
  const growing: ObjectContentDefinition = { ...definition, components: { states: definition.components.states!,
    growth: { maxProgress: 100, sweepTicks: 10, stageThresholds: [0, 100], pausedWhen: [{ ready: true }] } } };
  const base = { ...input, definition: growing, callbacks: [], stored: encodeObjectLifecycle(createObjectLifecycleState(growing, 0n)) };
  const paused = planObjectStateSettlement({ ...base, now: 50n, mutation: { ready: true } });
  expect(paused.state.growthProgress).toBe(5);
  expect(paused.state.growthAnchorTick).toBe(50n);
  const pausedView = { ...view, target: { ...view.target!, state: paused.state.values } };
  const resumed = planObjectStateSettlement({ ...base, view: pausedView, stored: paused.stored, now: 100n, mutation: { ready: false } });
  expect(resumed.state.growthProgress).toBe(5);
  expect(resumed.state.growthAnchorTick).toBe(100n);
  const final = planObjectStateSettlement({ ...base, view: { ...view, target: { ...view.target!, state: resumed.state.values } }, stored: resumed.stored, now: 140n });
  expect(final.growthProgress).toBe(9);
});

it('persists a bounded environmental checkpoint and defers interactions until caught up', () => {
  const partial = { ...input, now: 100n, intervals: [{ throughTick: 20n, environment: { raining: false } }] };
  const plan = planObjectStateSettlement(partial);
  expect(plan).toMatchObject({ caughtUp: false, throughTick: 20n });
  expect(() => planObjectStateSettlement({ ...partial, event: 'use' })).toThrow('object_state_catching_up');
});

it('runs a transition graph once against its triggering state', () => {
  const graph: ObjectContentDefinition = { ...definition, components: { ...definition.components,
    transitions: [{ id: 'ready', on: 'use', from: { ready: false }, to: { ready: true }, run: { graph: 'activate' } }],
    interactions: [{ id: 'activate', verb: 'use', conditions: [{ state: 'ready', equals: false }], effects: [{ setLight: { enabled: true } }] }],
  } };
  const plan = planObjectStateSettlement({ ...input, definition: graph, stored: null, callbacks: [], event: 'use' });
  expect(plan.effects).toEqual([{ setLight: { enabled: true } }]);
});

it('does not advance an external graph transition disabled by the current appearance', () => {
  const disabled: ObjectContentDefinition = { ...definition, components: { ...definition.components,
    transitions: [{ id: 'ready', on: 'use', from: { ready: false }, to: { ready: true }, run: { graph: 'activate' } }],
    interactions: [{ id: 'activate', verb: 'use', conditions: [], effects: [{ setLight: { enabled: true } }] }],
    overrides: [{ when: { ready: false }, interactions: { activate: false } }],
  } };
  const plan = planObjectStateSettlement({ ...input, definition: disabled, stored: null, callbacks: [], event: 'use' });
  expect(plan.fired).toEqual([]);
  expect(plan.state.values.ready).toBe(false);
});
