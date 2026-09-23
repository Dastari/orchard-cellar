/** Calendar offsets change seasons, never elapsed processing or job time. */
export interface TimingClockSnapshot {
  readonly clock: { readonly authorityTick: bigint } | null;
  readonly environment: {
    readonly cropCalendarOffset?: bigint;
    readonly calendarTick: bigint;
  } | null;
}

export function cropCalendarOffsetForSnapshot(snapshot: TimingClockSnapshot): bigint {
  const authorityTick = snapshot.clock?.authorityTick ?? 0n;
  return snapshot.environment?.cropCalendarOffset
    ?? (snapshot.environment?.calendarTick ?? authorityTick) - authorityTick;
}

export function calendarTickForSnapshot(snapshot: TimingClockSnapshot): bigint {
  return (snapshot.clock?.authorityTick ?? 0n) + cropCalendarOffsetForSnapshot(snapshot);
}

/** Explicit domains prevent a calendar adjustment from completing a job. */
export function snapshotTimingClocks(snapshot: TimingClockSnapshot): {
  readonly authorityTick: bigint;
  readonly calendarTick: bigint;
} {
  return {
    authorityTick: snapshot.clock?.authorityTick ?? 0n,
    calendarTick: calendarTickForSnapshot(snapshot),
  };
}
