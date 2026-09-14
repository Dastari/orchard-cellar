import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRetainedCookingEscrow, assertCookingClaimCapability, loadCookingCompatibilitySources, legacyCookingReleaseGate,
  type CookingCompatibilitySources,
} from './legacy-cooking-release-gate.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const repository = fileURLToPath(new URL('..', import.meta.url));
const sources = loadCookingCompatibilitySources(repository);
afterEach(() => { vi.resetAllMocks(); });

function schemaChange(from: string, to: string): CookingCompatibilitySources {
  const start = sources.world.indexOf('const player_cooking_job = table(');
  const end = sources.world.indexOf('\n);', start) + 3;
  const original = sources.world.slice(start, end);
  expect(original).toContain(from);
  return { ...sources, world: sources.world.slice(0, start) + original.replace(from, to) + sources.world.slice(end) };
}

describe('preserved cooking escrow release compatibility', () => {
  it('retains the exact archived private schema without querying or requiring empty jobs', () => {
    expect(() => assertRetainedCookingEscrow(sources)).not.toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
    for (const [from, to] of [
      ['quantity: t.u8()', 'quantity: t.u16()'],
      ['readyTick: t.u64()', 'readyTick: t.u32()'],
      ["name: 'player_cooking_job'", "name: 'player_cooking_job', public: true"],
      ["columns: ['targetId']", "columns: ['spaceId']"],
      ['inputKind: t.string(),', ''],
    ]) {
      expect(() => assertRetainedCookingEscrow(schemaChange(from!, to!))).toThrow('cooking_escrow_schema_changed');
    }
  });

  it('rejects lost caller-scoped rejoin evidence', () => {
    expect(() => assertRetainedCookingEscrow({ ...sources, world: sources.world.replace(
      'ctx.db.player_cooking_job.identity.find(ctx.sender)', 'ctx.db.player_cooking_job.iter()'),
    })).toThrow('cooking_escrow_caller_view_missing');
    expect(() => assertRetainedCookingEscrow({ ...sources, rejoin: '' })).toThrow('cooking_escrow_rejoin_parity_missing');
  });

  it('rejects background conversion, clearing, arbitrary deletion and a removed claim adapter', () => {
    for (const write of [
      'ctx.db.player_cooking_job.insert(job)', 'ctx.db.player_cooking_job.identity.update(job)',
      'ctx.db.player_cooking_job.clear()', 'ctx.db.player_cooking_job.identity.delete(other)',
    ]) {
      expect(() => assertRetainedCookingEscrow({ ...sources,
        worldFiles: { ...sources.worldFiles, 'unsafe-migration.ts': `function onConnect() { ${write}; }` },
      })).toThrow('cooking_escrow_unreviewed_writer');
    }
    expect(() => assertRetainedCookingEscrow({ ...sources,
      worldFiles: { ...sources.worldFiles, 'behaviour/process-jobs.ts': '' },
    })).toThrow('cooking_escrow_unreviewed_writer');
  }, 30_000);

  it('requires authorization, full grant and receipt before escrow removal', () => {
    for (const anchor of ['dependencies.authorize(ctx)', 'job.identity.isEqual(ctx.sender)',
      'dependencies.prepareInventoryGrant(ctx, plan)', 'grant()', 'ctx.db.player_process_job_receipt.insert(']) {
      expect(() => assertRetainedCookingEscrow({ ...sources, claim: sources.claim.replace(anchor, '') }))
        .toThrow('cooking_escrow_claim_custody_missing');
    }
  }, 30_000);

  it('requires both authored collection and globally reachable inventory cancellation', () => {
    expect(() => assertCookingClaimCapability(sources)).not.toThrow();
    for (const action of ['collect', 'cancel']) {
      const frames = JSON.parse(sources.frames) as Array<{ buttons?: Array<{ onInvoke?: { claimProcessJob: string } }> }>;
      for (const frame of frames) {
        for (const button of frame.buttons ?? []) {
          if (button.onInvoke?.claimProcessJob === action) delete button.onInvoke;
        }
      }
      expect(() => assertCookingClaimCapability({ ...sources, frames: JSON.stringify(frames) }))
        .toThrow('cooking_authored_claim_callback_missing');
    }
    expect(() => assertCookingClaimCapability({ ...sources, frameHandler: '' }))
      .toThrow('cooking_authored_claim_handler_missing');
    expect(() => assertCookingClaimCapability({ ...sources, world: sources.world.replace(
      'permittedProcessClaim === undefined', 'false'),
    })).toThrow('cooking_authored_claim_adapter_missing');
  });

  it('rejects remapping the historical landmark or removing its guarded target resolution', () => {
    expect(() => assertCookingClaimCapability({ ...sources, spaces: sources.spaces.replace(
      '"runtimeId": "3000000004"', '"runtimeId": "3000000005"'),
    })).toThrow('cooking_legacy_landmark_alias_changed');
    expect(() => assertCookingClaimCapability({ ...sources, world: sources.world.replace(
      'plan.objectDefinitionId === runtime?.object.id', 'true'),
    })).toThrow('cooking_legacy_target_adapter_missing');
  });

  it('runs every required candidate claim fixture locally without SQL or production targets', () => {
    legacyCookingReleaseGate(repository);
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith(process.execPath, [
      `${repository}node_modules/vitest/vitest.mjs`, 'run',
      'packages/world/src/behaviour/process-jobs.test.ts',
      'packages/sim/src/behaviour/handlers/frame-actions.test.ts',
      'packages/sim/src/content/process-legacy-job.test.ts',
      'scripts/cooking-content-continuity.test.ts',
    ], { cwd: repository, timeout: 60_000, stdio: 'inherit' });
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('fixture_failed'); });
    expect(() => legacyCookingReleaseGate(repository)).toThrow('fixture_failed');
  });

  it('checks actual candidate compatibility before and after publication, before reopen', () => {
    for (const relative of ['./world-release.sh', './world-release-retire-chests.sh',
      '../ops/orchard-runtime/bin/restore-world-rehearsal.sh',
      '../ops/orchard-runtime/bin/restore-world-retirement-rehearsal.sh']) {
      const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
      const publish = source.indexOf('\nspacetime publish') >= 0
        ? source.indexOf('\nspacetime publish') : source.indexOf('\n  spacetime publish');
      const checks = [...source.matchAll(/node --import tsx .*legacy-cooking-release-gate\.ts.*$/gmu)];
      expect(publish).toBeGreaterThan(0);
      expect(checks.some((match) => match.index < publish)).toBe(true);
      expect(checks.some((match) => match.index > publish)).toBe(true);
      for (const check of checks) {
        expect(check[0]).toContain(relative.includes('retire') ? '"$candidate_repository"' : '"$repository"');
        expect(check[0]).not.toContain('$database');
      }
      const applyContent = source.indexOf('run world:content-head -- apply');
      if (applyContent >= 0) expect(checks.at(-1)!.index).toBeLessThan(applyContent);
      const restoreTraffic = source.indexOf('\nrestore_traffic\n');
      if (restoreTraffic >= 0) expect(checks.at(-1)!.index).toBeLessThan(restoreTraffic);
      expect(source).toContain('set -euo pipefail');
    }
  });
});
