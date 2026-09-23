import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { runtimeTraversalPolicy } from './content/runtime-traversal.js';
import { canTraverse, type MediumHazard } from './traversal.js';
import { advanceHazardDamage, type HazardDamageState } from './traversal-hazards.js';

const policy = runtimeTraversalPolicy(bootstrapContentRegistry())!;
const zero = (): HazardDamageState => ({ numerator: 0n, elapsedTicks: 0 });
function damageThrough(hazard: MediumHazard, maximum: number, steps: readonly number[]) {
  let state = zero(), damage = 0;
  for (const ticks of steps) {
    const next = advanceHazardDamage(state, hazard, maximum, ticks, 20, true, false);
    state = next.state; damage += next.damage;
  }
  return { state, damage };
}

describe('approved percentage hazards', () => {
  it.each([['lava', 10], ['shroom_water', 50]] as const)('%s full-health survival is level invariant', (medium, seconds) => {
    const hazard = policy.media[medium].hazards[0]!;
    expect(hazard.intervalTicks).toBe(20);
    for (const maximum of [1, 7, 100, 12_345, 10_000_000]) {
      expect(damageThrough(hazard, maximum, [20 * (seconds - 1)]).damage).toBeLessThan(maximum);
      expect(damageThrough(hazard, maximum, [20 * seconds]).damage).toBe(maximum);
    }
  });
  it('retains fractional damage and is invariant to timestep partitioning', () => {
    const hazard = policy.media.lava.hazards[0]!;
    const whole = damageThrough(hazard, 7, [200]);
    expect(damageThrough(hazard, 7, Array<number>(200).fill(1))).toEqual(whole);
    expect(damageThrough(hazard, 7, [7, 33, 41, 19, 100])).toEqual(whole);
    const first = damageThrough(hazard, 1, [20]);
    expect(first.damage).toBe(0);
    expect(first.state.numerator).toBeGreaterThan(0n);
    expect(damageThrough(hazard, 1, [200]).damage).toBe(1);
  });
  it('permits shroom entry independently of toxin immunity and prevents immune damage', () => {
    expect(canTraverse('shroom_water', new Set(['boat']), policy.media)).toBe(true);
    expect(canTraverse('shroom_water', new Set(['water_walk']), policy.media)).toBe(true);
    expect(canTraverse('shroom_water', new Set(['walk']), policy.media)).toBe(false);
    const hazard = policy.media.shroom_water.hazards[0]!;
    const pending = advanceHazardDamage(zero(), hazard, 10_000, 19, 20, true, false);
    const immune = advanceHazardDamage(pending.state, hazard, 10_000, 400, 20, true, true);
    expect(immune.damage).toBe(0);
    expect(immune.state).toEqual(zero());
    expect(advanceHazardDamage(zero(), hazard, 10_000, 400, 20, false, false).damage).toBe(0);
  });
  it('rejects malformed inputs instead of silently erasing or overflowing damage', () => {
    const hazard = policy.media.lava.hazards[0]!;
    expect(() => advanceHazardDamage(zero(), hazard, 0, 1, 20, true, false)).toThrow('invalid_hazard_damage_state');
    expect(() => advanceHazardDamage({ numerator: -1n, elapsedTicks: 0 }, hazard, 100, 1, 20, true, false)).toThrow();
    expect(() => advanceHazardDamage(zero(), { ...hazard, maxHealthBasisPointsPerSecond: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER, 20, 20, true, false)).toThrow('hazard_damage_overflow');
  });
});
