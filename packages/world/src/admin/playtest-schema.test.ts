import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('World Tables exact playtest authority registration', () => {
  it('routes spawn, effect, and upgrade through one authored planner path', () => {
    for (const name of ['adminPlaytestSpawn', 'adminPlaytestApplyEffect', 'adminPlaytestGrantUpgrade']) {
      expect(between(`export const ${name} = spacetimedb.reducer(`, '\n);'))
        .toContain('executeAdminPlaytestMutation(ctx, {');
    }
    const loader = between('function loadAdminPlaytestState(', 'function writeAdminPlaytestAction(');
    expect(loader).toContain('const registry = contentRegistry(ctx)');
    expect(loader).toContain('registry.creatures.get(');
    expect(loader).toContain('registry.effects.get(');
    expect(loader).toContain('registry.upgrades.get(');
    expect(loader).toContain('ctx.db.player_effect.by_identity.filter(target)');
    expect(loader).toContain('ctx.db.homestead.by_owner.filter(target)');
  });

  it('allows empty discovery only on dry-run and consumes an exact caller receipt on commit', () => {
    const execution = between('function executeAdminPlaytestMutation(', 'const adminPlaytestEnvelope');
    expect(execution).toContain("mutation.dryRun && expectedBaseVersion === ''");
    expect(execution).toContain('adminPlaytestVersion(loaded) : expectedBaseVersion');
    expect(execution).toContain("if (expectedBaseVersion === '' || previewFingerprint === undefined");
    expect(execution).toContain('existing.clientMutationId !== mutation.clientMutationId');
    expect(execution).toContain('existing.baseVersion !== expectedBaseVersion');
    expect(execution).toContain('existing.fingerprint !== previewFingerprint');
    expect(execution).toContain('ctx.db.admin_mutation_preview.id.delete(previewId)');
  });

  it('writes typed state, an inverse audit, and target-only online notices', () => {
    const writer = between('function writeAdminPlaytestAction(', 'function executeAdminPlaytestMutation(');
    expect(writer).toContain('ctx.db.world_npc.insert(row)');
    expect(writer).toContain('ctx.db.world_wildlife_profile.insert({');
    expect(writer).toContain('ctx.db.player_effect');
    expect(writer).toContain('ctx.db.homestead_upgrade');
    const execution = between('function executeAdminPlaytestMutation(', 'const adminPlaytestEnvelope');
    expect(execution).toContain('payload: serializeAdminAuditPayload(plan.audit)');
    expect(execution).toContain('ctx.db.connection_presence_v2.by_identity.filter(targetIdentity)');
    const planner = readFileSync(new URL('./playtest.ts', import.meta.url), 'utf8');
    expect(planner).toContain("operation: 'despawn_entity'");
    expect(planner).toContain("operation: 'undo'");
  });

  it('has exact generated bindings for all three reducers', () => {
    for (const file of [
      'admin_playtest_spawn_reducer.ts',
      'admin_playtest_apply_effect_reducer.ts',
      'admin_playtest_grant_upgrade_reducer.ts',
    ]) {
      expect(existsSync(new URL(`../../../world-bindings/src/${file}`, import.meta.url)), file).toBe(true);
    }
  });
});
