import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(start, startNeedle).toBeGreaterThanOrEqual(0);
  expect(end, endNeedle).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authoritative empty-soil decay', () => {
  it('uses private one-shot timers rather than adding a per-tick farm scan', () => {
    const timer = sourceBetween(
      'const soil_decay_timer = table(',
      'const spacetimedb = schema(',
    );
    expect(timer).toContain("name: 'soil_decay_timer'");
    expect(timer).not.toContain('public: true');
    expect(timer).toContain('expectedDecayAtTick: t.u64()');

    const scheduler = sourceBetween(
      'function scheduleEmptyTopsideSoilDecay(',
      'function ensureSoilDecayTimers(',
    );
    expect(scheduler).toContain('soil.spaceId !== TOPSIDE_SPACE_ID');
    expect(scheduler).toContain('ScheduleAt.time(');

    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('ensureSoilDecayTimers(ctx, clock.authorityTick)');
    expect(step).not.toContain('ctx.db.world_soil.iter()');
  });

  it('rejects stale timers and preserves planted and Homestead soil', () => {
    const reducer = sourceBetween(
      'export const decayEmptyTopsideSoil =',
      'export const useFarmTool =',
    );
    expect(reducer).toContain('soil.spaceId !== TOPSIDE_SPACE_ID');
    expect(reducer).toContain('expectedDecayAtTick !== scheduledMessage.expectedDecayAtTick');
    expect(reducer).toContain('ctx.db.world_crop.id.find(soil.id) !== null');
    expect(reducer).toContain('emptySoilDecayDue(');
    expect(reducer).toContain('ctx.db.world_soil.id.delete(soil.id)');
  });

  it('refreshes the timer on tilling, watering, and harvest', () => {
    const farming = sourceBetween(
      'export const useFarmTool =',
      'export const tendTree =',
    );
    expect(farming.match(/scheduleEmptyTopsideSoilDecay\(/g)).toHaveLength(3);
    expect(farming).toContain('wateredAtTick: clock.authorityTick');
    expect(farming).toContain('tilledAtTick: clock.authorityTick');
  });

  it('backfills pre-existing empty overworld plots exactly once', () => {
    const migration = sourceBetween(
      'function ensureSoilDecayTimers(',
      'function mutableFarmTileAuthorized(',
    );
    expect(migration).toContain('ctx.db.world_soil.iter()');
    expect(migration).toContain('ctx.db.world_crop.id.find(soil.id)');
    expect(migration).toContain('soilDecayTimerVersion: SOIL_DECAY_TIMER_MIGRATION_VERSION');
  });
});
