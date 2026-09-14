import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '@orchard/world-bindings';
import { StudioLiveWorldPlaytestAdapter } from './live-world-playtest.js';

const identity = '01'.repeat(32);
const reason = 'Verify authored world definition';

function receipt(clientMutationId: string, operation: string, target: object) {
  return {
    clientMutationId,
    previewJson: JSON.stringify({
      preview: {
        operation, target, baseVersion: 'playtest:exact',
        preview: { changes: [{ path: '/playtest', before: null, after: { active: true } }], truncated: false },
        warnings: ['Durable playtest state'], expiresAtMicros: '9999999999999999',
      },
      previewFingerprint: 'preview:exact', committedVersion: 'playtest:committed',
    }),
  };
}

describe('live World Tables playtest adapter', () => {
  it('is constructed once by the shared Studio connection with no mock fallback', () => {
    const source = readFileSync(new URL('../shell/studio-connection.ts', import.meta.url), 'utf8');
    expect(source.match(/new StudioLiveWorldPlaytestAdapter\(/gu)).toHaveLength(1);
    expect(source).toContain('() => this.#connected ? this.#connection : null');
    expect(source).toContain('get worldPlaytest(): WorldPlaytestAdapter { return this.#worldPlaytestService; }');
    expect(source).not.toContain('MockWorldPlaytest');
  });

  it.each([
    [{ kind: 'spawn', definitionId: 'creature:goose', spaceId: 0, tileX: -2, tileY: 4,
      reason, clientMutationId: 'world.spawn.1' }, 'adminPlaytestSpawn',
    { definitionId: 'creature:goose', spaceId: 0, tileX: -2, tileY: 4 }, { kind: 'space', spaceId: '0' }],
    [{ kind: 'apply_effect', definitionId: 'effect:well_rested', targetPlayer: identity,
      reason, clientMutationId: 'world.effect.1' }, 'adminPlaytestApplyEffect',
    { definitionId: 'effect:well_rested' }, { kind: 'player', identity }],
    [{ kind: 'grant_upgrade', definitionId: 'upgrade:rich_soil', targetPlayer: identity, rank: 2,
      reason, clientMutationId: 'world.upgrade.1' }, 'adminPlaytestGrantUpgrade',
    { definitionId: 'upgrade:rich_soil', rank: 2 }, { kind: 'player', identity }],
  ] as const)('discovers then commits the exact receipt for %s', async (request, reducerName, expected, target) => {
    const calls: Record<string, unknown>[] = [];
    const connection = {
      reducers: { [reducerName]: async (args: Record<string, unknown>) => { calls.push(args); } },
      db: { ownAdminMutationPreviews: { iter: () => [receipt(request.clientMutationId,
        request.kind === 'spawn' ? 'playtest_spawn' : `playtest_${request.kind}`, target)] } },
    } as unknown as DbConnection;
    const adapter = new StudioLiveWorldPlaytestAdapter(() => connection);
    expect(adapter.source).toBe('live');
    await adapter.run(request);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ ...expected, reason, clientMutationId: request.clientMutationId,
      dryRun: true, expectedBaseVersion: '', previewFingerprint: undefined });
    expect(calls[1]).toMatchObject({ ...expected, reason, clientMutationId: request.clientMutationId,
      dryRun: false, expectedBaseVersion: 'playtest:exact', previewFingerprint: 'preview:exact' });
  });

  it('fails closed on malformed receipts, invalid targets, and disconnected providers', async () => {
    const call = vi.fn(async () => undefined);
    const malformed = { reducers: { adminPlaytestSpawn: call }, db: {
      ownAdminMutationPreviews: { iter: () => [{ clientMutationId: 'world.spawn.bad', previewJson: '{}' }] },
    } } as unknown as DbConnection;
    await expect(new StudioLiveWorldPlaytestAdapter(() => malformed).run({
      kind: 'spawn', definitionId: 'creature:goose', spaceId: 0, tileX: 1, tileY: 1,
      reason, clientMutationId: 'world.spawn.bad',
    })).rejects.toMatchObject({ code: 'admin_payload_invalid' });
    expect(call).toHaveBeenCalledTimes(1);

    const invalidTarget = { reducers: { adminPlaytestApplyEffect: call }, db: {
      ownAdminMutationPreviews: { iter: () => [] },
    } } as unknown as DbConnection;
    await expect(new StudioLiveWorldPlaytestAdapter(() => invalidTarget).run({
      kind: 'apply_effect', definitionId: 'effect:well_rested', targetPlayer: 'not-an-identity',
      reason, clientMutationId: 'world.effect.bad',
    })).rejects.toThrow('admin_payload_invalid');
    await expect(new StudioLiveWorldPlaytestAdapter(() => null).run({
      kind: 'spawn', definitionId: 'creature:goose', spaceId: 0, tileX: 1, tileY: 1,
      reason, clientMutationId: 'world.spawn.offline',
    })).rejects.toThrow('not_connected');
  });
});
