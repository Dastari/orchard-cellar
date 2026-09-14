import { expect, it } from 'vitest';
import { HEARTH_RESOURCE_SITES } from './hearth-resource-sites.js';
import { beginHearthResourceDepletion, planHearthResourceRespawn,
  HEARTH_RESOURCE_COOLDOWN_TICKS as cooldown, HEARTH_RESOURCE_QUIET_TICKS as quiet,
  HEARTH_RESOURCE_OBSERVATION_TICKS as second, type HearthResourceDepletion } from './hearth-resource-respawn.js';
const safe = { activationOrdinal: 7, depleted: true, siteEnabled: true, playerInSight: false,
  encounterEngaged: false, footprintClear: true, continuousObservation: true };
function observe(state: HearthResourceDepletion, tick: bigint, changes: Partial<typeof safe> = {}) {
  return planHearthResourceRespawn(state, { ...safe, tick, ...changes });
}
function advance(state: HearthResourceDepletion, end: bigint) {
  let result = observe(state, state.lastObservedTick);
  for (let tick = state.lastObservedTick + second; tick <= end; tick += second) result = observe(result.state, tick);
  return result;
}
it('requires both cooldown and continuously observed quiet, without changing depleted state or rewarding', () => {
  for (const site of HEARTH_RESOURCE_SITES) {
    const original = beginHearthResourceDepletion(site.id, 7, 0n);
    const early = advance(original, cooldown - second);
    expect(early.respawn).toBe(false);
    const ready = observe(early.state, cooldown);
    expect(ready).toMatchObject({ respawn: true, nextActivationOrdinal: 8 });
    expect(original).toEqual(beginHearthResourceDepletion(site.id, 7, 0n));
    expect(observe(ready.state, cooldown).respawn).toBe(false);
    expect(observe(ready.state, cooldown + second, { activationOrdinal: 8 }).respawn).toBe(false);
    expect(observe(ready.state, cooldown + second, { depleted: false }).respawn).toBe(false);
  }
});
it('restarts the quiet interval for each unsafe observation and waits thirty fresh seconds', () => {
  const initial = advance(beginHearthResourceDepletion(HEARTH_RESOURCE_SITES[0]!.id, 7, 0n), cooldown - second).state;
  for (const changes of [{ playerInSight: true }, { encounterEngaged: true }, { footprintClear: false }, { siteEnabled: false }]) {
    const unsafe = observe(initial, cooldown, changes);
    expect(unsafe.respawn).toBe(false);
    expect(unsafe.state.quietSinceTick).toBeNull();
    const before = advance(unsafe.state, cooldown + quiet);
    expect(before.respawn).toBe(false);
    expect(observe(before.state, cooldown + quiet + second).respawn).toBe(true);
  }
});
it('does not count missed observations or a restart with contiguous authority ticks as quiet time', () => {
  const initial = advance(beginHearthResourceDepletion(HEARTH_RESOURCE_SITES[0]!.id, 7, 0n), cooldown - second).state;
  for (const [tick, changes] of [[cooldown + 500n, {}], [cooldown, { continuousObservation: false }]] as const) {
    const resumed = observe(initial, tick, changes);
    expect(resumed.respawn).toBe(false);
    expect(resumed.state.quietSinceTick).toBe(tick);
    const before = advance(resumed.state, tick + quiet - second);
    expect(before.respawn).toBe(false);
    expect(observe(before.state, tick + quiet).respawn).toBe(true);
  }
});
it('fails closed for invalid identity, counter overflow and corrupt persisted timing', () => {
  const state = beginHearthResourceDepletion(HEARTH_RESOURCE_SITES[0]!.id, 7, 0n);
  expect(() => beginHearthResourceDepletion(1n, 7, 0n)).toThrow('hearth_depletion_invalid');
  expect(() => beginHearthResourceDepletion(state.resourceId, 7, -1n)).toThrow();
  for (const invalid of [{ ...state, resourceId: 1n }, { ...state, depletedAtTick: 1n },
    { ...state, activationOrdinal: 0xffff_ffff }, { ...state, quietSinceTick: -1n },
    { ...state, quietSinceTick: 1n }]) {
    expect(planHearthResourceRespawn(invalid, { ...safe, activationOrdinal: invalid.activationOrdinal, tick: cooldown }).respawn).toBe(false);
  }
  expect(observe(state, 1n << 64n).respawn).toBe(false);
});
