import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { processProgressAt, processRemainingTicksAt } from '@orchard/sim';
import { processJobFrameState } from './frame-presentation.js';
import { snapshotTimingClocks } from './timing-clock.js';

describe('simulation and calendar clock domains', () => {
  it.each([354_191n, -354_191n, 0n])('keeps a one-second-old job independent of offset %s', offset => {
    const startedTick = 47_734_743n;
    const { authorityTick, calendarTick } = snapshotTimingClocks({
      clock: { authorityTick: startedTick + 20n },
      environment: { calendarTick: 0n, cropCalendarOffset: offset },
    });
    expect(calendarTick).toBe(authorityTick + offset);
    expect(processRemainingTicksAt(startedTick, authorityTick, 1_200n)).toBe(1_180n);
    expect(processProgressAt(startedTick, authorityTick, 1_200n)).toBeCloseTo(1 / 60);
    expect(processJobFrameState({ items: new Map() }, {
      outputKind: 'cooked_fish', quantity: 1, startedTick, readyTick: startedTick + 1_200n,
    }, authorityTick)).toMatchObject({ processJobReady: false, processJobProgress: 1 / 60 });
  });

  it('rehydrates authority independently of old calendar state on reconnect', () => {
    expect(snapshotTimingClocks({ clock: null, environment: null }))
      .toEqual({ authorityTick: 0n, calendarTick: 0n });
    expect(snapshotTimingClocks({ clock: { authorityTick: 1_300n },
      environment: { calendarTick: 9_000n } }))
      .toEqual({ authorityTick: 1_300n, calendarTick: 9_000n });
    expect(processRemainingTicksAt(100n, 1_300n, 1_200n)).toBe(0n);
  });

  it('wires both processor surfaces and private jobs to authority, calendar displays separately', () => {
    const source = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');
    expect(source).toContain('const { authorityTick, calendarTick } = snapshotTimingClocks(snapshot)');
    expect(source).toContain('processorTiming(snapshot, snapshot.activePlaceable, authorityTick)');
    expect(source).toContain('processorTiming(snapshot, hoveredProcessor, authorityTick)');
    expect(source).toContain('processJobFrameState(snapshot.content.registry, snapshot.cookingJob, authorityTick)');
    expect(source).toContain('processJobFrameState(snapshot.content.registry, frameJob, authorityTick)');
    expect(source).toContain('calendarAtTick(Number(calendarTick) * SIM_STEPS_PER_AUTHORITY_TICK)');
    expect(source).not.toContain('processorAuthorityTick');
  });
});
