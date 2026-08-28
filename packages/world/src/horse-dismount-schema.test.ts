import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('horse dismount persistence', () => {
  it('re-homes a ridden horse where the player leaves it', () => {
    const reducer = source.slice(
      source.indexOf('export const interactHorse'),
      source.indexOf('export const jumpHorse'),
    );

    expect(reducer).toContain('rider: undefined');
    expect(reducer).toContain('homeX: currentMount.x');
    expect(reducer).toContain('homeY: currentMount.y');
  });

  it('keeps owner recovery explicit, unridden, and re-homed', () => {
    const reducer = source.slice(
      source.indexOf('export const adminRelocateHorse'),
      source.indexOf('export const setDisplayName'),
    );

    expect(reducer).toContain('requireWorldOwner(');
    expect(reducer).toContain("horse.kind !== 'horse'");
    expect(reducer).toContain("throw new SenderError('horse_is_mounted')");
    expect(reducer).toContain('homeX: x');
    expect(reducer).toContain('homeY: y');
  });

  it('runs the legacy two-horse recovery once and never moves a mounted horse', () => {
    expect(source).toContain('horseDismountRecoveryVersion: t.u8().default(0)');
    const recovery = source.slice(
      source.indexOf('const LEGACY_DISMOUNT_HORSE_RECOVERY'),
      source.indexOf('const TICK_TELEMETRY_LOG_TICKS'),
    );
    expect(recovery).toContain('{ id: STARTER_HORSE_ID, tileX: 334, tileY: 359 }');
    expect(recovery).toContain('BigInt(WILDLIFE_FIRST_NPC_ID + 5)');
    expect(recovery).toContain('if (horse.rider !== undefined)');
    expect(recovery).toContain('horseDismountRecoveryVersion: 1');
    expect(source).toContain('recoverLegacyDismountHorses(ctx, clock.authorityTick)');
  });
});
