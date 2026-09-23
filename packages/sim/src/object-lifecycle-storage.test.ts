import { describe, expect, it } from 'vitest';
import { createObjectLifecycleState, settleObjectTransitions } from './content/object-archetype.js';
import type { ObjectContentDefinition } from './content/object-definition.js';
import { encodeObjectLifecycle, restoreObjectLifecycle } from './object-lifecycle-storage.js';
const object: ObjectContentDefinition = { id: 'object:clock', kind: 'object', schemaVersion: 1, displayName: 'Clock', components: {
  states: { lit: { type: 'bool', default: false } },
  transitions: [{ id: 'ignite', from: { lit: false }, to: { lit: true }, after: { ticks: 5 } }],
} };
describe('durable object lifecycle', () => {
  it('round trips bigint anchors and never repeats a settled firing', () => {
    const now = 9007199254740993n;
    const first = settleObjectTransitions(object, createObjectLifecycleState(object, now), { nowTick: now + 6n });
    expect(first.fired).toHaveLength(1);
    const restored = restoreObjectLifecycle(object, encodeObjectLifecycle(first.state), first.state.values, now + 10n);
    expect(restored.enteredAt.lit).toBe(now + 5n);
    expect(settleObjectTransitions(object, restored, { nowTick: now + 20n }).fired).toHaveLength(0);
  });
  it('initializes legacy state without retroactive firings', () => {
    const state = restoreObjectLifecycle(object, null, { lit: false }, 100n);
    expect(settleObjectTransitions(object, state, { nowTick: 100n }).fired).toHaveLength(0);
  });
  it('reanchors explicit state changes and rejects corrupt or future anchors', () => {
    const json = encodeObjectLifecycle(createObjectLifecycleState(object, 10n));
    expect(restoreObjectLifecycle(object, json, { lit: true }, 20n).enteredAt.lit).toBe(20n);
    expect(() => restoreObjectLifecycle(object, json, {}, 1n)).toThrow('future_tick');
    expect(() => restoreObjectLifecycle(object, '{}', {}, 20n)).toThrow('object_lifecycle_invalid');
  });
});
