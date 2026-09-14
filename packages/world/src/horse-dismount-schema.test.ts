import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('horse dismount persistence', () => {
  it('re-homes a ridden horse where the player leaves it', () => {
    const reducer = source.slice(
      source.indexOf('export const interactHorse'),
      source.indexOf('export const jumpHorse'),
    );

    expect(reducer).toContain("interactEntityBehaviour(ctx, { targetKind: 'npc', entityId: horseId, verb: 'use' }");
    const authority = source.slice(source.indexOf('function applyMountLifecycle('), source.indexOf('export const interactHorse'));
    expect(authority).toContain('currentMount?.id !== npc.id || npc.rider?.isEqual(ctx.sender) !== true');
    expect(authority).toContain('const plan = vehicleCustodyPlan(npc, position, {');
    expect(authority).toContain('updateWorldNpc(ctx, plan.npc)');
    const custody = readFileSync(new URL('./behaviour/vehicle.ts', import.meta.url), 'utf8');
    expect(custody).toContain("const reanchor = !mounting && transition.adapter === 'horse'");
    expect(custody).toContain('rider: mounting ? transition.actor : undefined');
    expect(custody).toContain('homeX: npc.x, homeY: npc.y');
  });

  it('uses the typed generic NPC relocation replacement for owner recovery', () => {
    expect(source).not.toContain('export const adminRelocateHorse');
    const reducer = source.slice(
      source.indexOf('export const adminRelocateNpc'),
      source.indexOf('export const adminRespawnResources'),
    );
    expect(reducer).toContain('executeAdminObjectMutation(ctx');
    expect(reducer).toContain("operation: 'relocate_npc'");
    expect(reducer).toContain('npcId');
  });

  it('runs the legacy two-horse recovery once and never moves a mounted horse', () => {
    expect(source).toContain('horseDismountRecoveryVersion: t.u8().default(0)');
    const recovery = source.slice(
      source.indexOf('function recoverLegacyDismountHorses'),
      source.indexOf('const TICK_TELEMETRY_LOG_TICKS'),
    );
    expect(recovery).toContain('runtimeStarterHorseDefinition(contentRegistry(ctx))');
    expect(recovery).toContain('BigInt(starter.runtimeId)');
    expect(recovery).toMatch(/BigInt\(WILDLIFE_FIRST_NPC_ID\s*\+\s*5\)/);
    expect(recovery).toContain('if (horse.rider !== undefined)');
    expect(recovery).toContain('horseDismountRecoveryVersion: 1');
    expect(source).toContain('recoverLegacyDismountHorses(ctx, clock.authorityTick)');
  });
});
