import { SIM_TICKS_PER_SECOND } from './state.js';

/** Authoritative world snapshots published by SpaceTimeDB each second. */
export const AUTHORITY_HZ = 20;
export const AUTHORITY_TICK_MS = 1_000 / AUTHORITY_HZ;
export const AUTHORITY_TICK_MICROS = 1_000_000n / BigInt(AUTHORITY_HZ);
export const SIM_STEPS_PER_AUTHORITY_TICK = SIM_TICKS_PER_SECOND / AUTHORITY_HZ;

/**
 * Confirm movement to the authority in one authority-tick-sized interval.
 * Transitions still send immediately, so even a shorter tap is accounted exactly.
 */
export const INPUT_REFRESH_STEPS = SIM_STEPS_PER_AUTHORITY_TICK;
export const REMOTE_INTERPOLATION_DELAY_TICKS = 1.5;
export const REMOTE_SNAPSHOT_CAPACITY = 10;
