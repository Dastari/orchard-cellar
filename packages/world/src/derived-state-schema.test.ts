import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);

function sourceBetween(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Architecture/World-SpacetimeDB T6 derived-state cutover', () => {
  it('stores a signed optional calendar offset and migrates the legacy value once', () => {
    const environment = sourceBetween(worldSource, 'const world_environment =', 'const world_campfire_state =');
    expect(environment).toContain('cropCalendarOffset: t.option(t.i64()).default(undefined)');

    const stepStart = worldSource.indexOf('export const stepWorld =');
    expect(stepStart).toBeGreaterThanOrEqual(0);
    const step = worldSource.slice(stepStart);
    expect(step).toContain('environment.calendarTick - clock.authorityTick');
    expect(step).toContain('cropCalendarOffset: calendarOffset');
    expect(step).toContain('const calendarTick = authorityTick + calendarOffset');
    expect(step).not.toContain('world_environment.id.update({ ...environment, calendarTick })');
  });

  it('derives current calendar time from authority plus offset on the client', () => {
    const helper = readFileSync(new URL('../../client/src/content/timing-clock.ts', import.meta.url), 'utf8');
    expect(helper).toContain('snapshot.environment?.cropCalendarOffset');
    expect(helper).toContain("(snapshot.clock?.authorityTick ?? 0n) + cropCalendarOffsetForSnapshot(snapshot)");
    expect(clientSource).toContain('snapshotTimingClocks(snapshot)');
    expect(clientSource.match(/calendarTickForSnapshot\(snapshot\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('centralizes inventory-derived equipment projection in the shared helper', () => {
    const helper = sourceBetween(
      worldSource,
      'function updateEquippedForIdentity(',
      'function updateEquippedFromInventory(',
    );
    expect(helper).toContain('containers ?? loadPlayerInventory(ctx, identity).containers');
    expect(helper).toContain('position.equippedKind === equippedKind');
    expect(worldSource).not.toContain('equippedKind: selected?.itemKind');
    expect(worldSource.match(/updateEquippedForIdentity\(/g)?.length ?? 0).toBeGreaterThanOrEqual(20);
  });

  it('grants expanded carried capacity only from authored policy in the equipped back slot', () => {
    expect(worldSource).toContain('runtimeItemInventoryCapacity(contentRegistry(ctx), row.itemKind)');
    expect(worldSource).not.toContain('inventoryHasEquippedBackpack(rows)');
    expect(worldSource).toContain("throw new SenderError('backpack_in_use')");
  });
});
