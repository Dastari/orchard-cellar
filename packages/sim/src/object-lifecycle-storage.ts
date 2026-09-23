import { createObjectLifecycleState, type ObjectLifecycleState } from './content/object-archetype.js';
import type { ObjectContentDefinition } from './content/object-definition.js';
import type { StateValues } from './content/stateful-components.js';

/** Storage format is explicit: bigint authority ticks never cross JSON as numbers. */
export function encodeObjectLifecycle(state: ObjectLifecycleState): string {
  return JSON.stringify({ version: 1, values: state.values,
    enteredAt: Object.fromEntries(Object.entries(state.enteredAt).map(([key, tick]) => [key, tick.toString()])),
    growthProgress: state.growthProgress, growthRemainderBps: state.growthRemainderBps ?? 0, growthAnchorTick: state.growthAnchorTick.toString() });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function tick(value: unknown, now: bigint): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/u.test(value)) throw new Error('object_lifecycle_invalid_tick');
  const parsed = BigInt(value);
  if (parsed > now) throw new Error('object_lifecycle_future_tick');
  return parsed;
}

/** Null is the only legacy marker. Invalid persisted anchors must not silently
 * reset and replay a transition's side effects. Definition updates reconcile
 * added/changed values at now while preserving unchanged anchors. */
export function restoreObjectLifecycle(
  definition: ObjectContentDefinition, json: string | null, values: StateValues, now: bigint,
): ObjectLifecycleState {
  const declared = Object.fromEntries(Object.entries(definition.components.states ?? {}).map(([key, declaration]) => {
    const value = values[key] ?? declaration.default;
    const valid = declaration.type === 'bool' ? typeof value === 'boolean'
      : declaration.type === 'enum' ? typeof value === 'string' && declaration.values.includes(value)
      : typeof value === 'number' && Number.isSafeInteger(value)
        && (declaration.min === undefined || value >= declaration.min)
        && (declaration.max === undefined || value <= declaration.max);
    if (!valid) throw new Error('object_lifecycle_invalid_value');
    return [key, value];
  }));
  const fresh = createObjectLifecycleState(definition, now, declared);
  if (json === null) return fresh;
  const raw: unknown = JSON.parse(json);
  if (!record(raw) || raw.version !== 1 || !record(raw.values) || !record(raw.enteredAt)
    || typeof raw.growthProgress !== 'number' || !Number.isSafeInteger(raw.growthProgress)
    || raw.growthProgress < 0
    || Object.values(raw.values).some(value => typeof value !== 'boolean' && typeof value !== 'string'
      && !(typeof value === 'number' && Number.isSafeInteger(value)))) throw new Error('object_lifecycle_invalid');
  const remainder = raw.growthRemainderBps ?? 0;
  if (typeof remainder !== 'number' || !Number.isSafeInteger(remainder) || remainder < 0 || remainder >= 10000) throw new Error('object_lifecycle_invalid_remainder');
  const anchor = tick(raw.growthAnchorTick, now);
  const enteredAt: Record<string, bigint> = {};
  for (const [key, value] of Object.entries(fresh.values)) {
    const unchanged = raw.values[key] === value;
    if (unchanged && raw.enteredAt[key] === undefined) throw new Error('object_lifecycle_missing_anchor');
    enteredAt[key] = unchanged ? tick(raw.enteredAt[key], now) : now;
  }
  return { values: fresh.values, enteredAt,
    growthProgress: raw.growthProgress,
    growthAnchorTick: anchor, growthRemainderBps: remainder };
}
