import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('boat reconnect persistence', () => {
  it('keeps the rider link when an offline presence lease expires', () => {
    const worldTick = source.indexOf('recoverLegacyDismountHorses');
    const leaseStart = source.indexOf('function expirePresenceLeases', worldTick);
    const leaseCleanup = source.slice(
      leaseStart,
      source.indexOf('export const stepWorld =', leaseStart),
    );
    expect(leaseCleanup).toContain("if (runtimeNpcMount(contentRegistry(ctx), npc)?.adapter === 'boat')");
    expect(leaseCleanup).toContain('authorityTick: clock.authorityTick');
    const boatBranch = leaseCleanup.slice(
      leaseCleanup.indexOf("if (runtimeNpcMount(contentRegistry(ctx), npc)?.adapter === 'boat')"),
      leaseCleanup.indexOf('continue;', leaseCleanup.indexOf("if (runtimeNpcMount(contentRegistry(ctx), npc)?.adapter === 'boat')")),
    );
    expect(boatBranch).toContain('...npc');
    expect(boatBranch).not.toContain('rider:');
    expect(boatBranch).not.toContain('homeX:');
    expect(boatBranch).not.toContain('homeY:');
    expect(leaseCleanup.indexOf("if (runtimeNpcMount(contentRegistry(ctx), npc)?.adapter === 'boat')"))
      .toBeLessThan(leaseCleanup.indexOf('rider: undefined'));
  });
});
