import { describe, expect, it } from 'vitest';
import { objectEnvironmentIntervals } from './object-lifecycle-environment.js';
import { anchorStatefulGrowth, createStatefulLifecycle, settleStatefulTransitions } from './content/stateful-components.js';
const set = { growth: { maxProgress: 100, sweepTicks: 10, stageThresholds: [0, 100], modifiers: { rainBps: 2500 } } };
describe('historical object growth', () => {
  it('splits forced weather at its exact authority tick', () => {
    const intervals = objectEnvironmentIntervals([{ atTick: 0n, calendarOffset: 0n, weatherMode: 'clear' },
      { atTick: 25n, calendarOffset: 0n, weatherMode: 'rain' }], 0n, 50n);
    expect(intervals).toEqual([{ throughTick: 24n, environment: { raining: false, season: 'spring' } },
      { throughTick: 50n, environment: { raining: true, season: 'spring' } }]);
  });
  it('preserves fractional credits and incomplete sweeps across split catch-up', () => {
    const once = anchorStatefulGrowth(set, createStatefulLifecycle(set, 0n), 80n, { raining: true });
    let split = createStatefulLifecycle(set, 0n);
    for (const tick of [13n, 25n, 41n, 59n, 80n]) split = anchorStatefulGrowth(set, split, tick, { raining: true });
    expect(split).toEqual(once);
    expect(split.growthProgress).toBe(10);
    expect(settleStatefulTransitions(set, split, { nowTick: 89n, environment: { raining: true } }).growthProgress).toBe(10);
  });
  it('bounds work and gives the next transaction a forward checkpoint', () => {
    const epochs = [{ atTick: 0n, calendarOffset: 0n, weatherMode: 'auto' as const }];
    const first = objectEnvironmentIntervals(epochs, 0n, 999999n, {}, 2);
    expect(first).toHaveLength(2);
    const end = first.at(-1)!.throughTick;
    expect(end).toBeLessThan(999999n);
    expect(objectEnvironmentIntervals(epochs, end, 999999n, {}, 2)[0]!.throughTick).toBeGreaterThan(end);
  });
});
