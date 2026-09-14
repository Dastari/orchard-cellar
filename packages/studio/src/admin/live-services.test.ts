import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DbConnection } from '@orchard/world-bindings';
import { normalizeAdminReason } from './api.js';
import type { AdminObjectsApi } from './objects-api.js';
import { StudioLiveAdminServices, StudioLiveAdminWorldService } from './live-services.js';
import type { AdminWorldControlDraft } from './world-api.js';

const identity = '01'.repeat(32);
const reason = normalizeAdminReason('Restore requested object safely');

function playerPage(): string {
  return JSON.stringify({ rows: [{ identity, displayName: 'Ada', role: 'owner', grants: [], online: true,
    spaceId: '0', tileX: 1, tileY: 2, lastSeenMicros: '1' }], nextCursor: null });
}

describe('connected Studio admin services', () => {
  it('decodes validated procedure JSON and surfaces malformed payloads', async () => {
    let calls = 0;
    const connection = { procedures: { adminFindPlayers: async () => { calls += 1; return playerPage(); } } } as unknown as DbConnection;
    const service = new StudioLiveAdminServices(() => connection);
    await expect(service.findPlayers('', null)).resolves.toMatchObject({ rows: [{ identity, displayName: 'Ada' }] });
    expect(calls).toBe(1);

    const malformed = { procedures: { adminFindPlayers: async () => '{"rows":"not-an-array"}' } } as unknown as DbConnection;
    await expect(new StudioLiveAdminServices(() => malformed).findPlayers('', null))
      .rejects.toMatchObject({ code: 'admin_payload_invalid' });
    await expect(new StudioLiveAdminServices(() => null).findPlayers('', null)).rejects.toThrow('not_connected');
  });

  it('returns an exact usable undo audit id and dispatches audited undo on the live connection', async () => {
    const reducerCalls: { readonly name: string; readonly args: unknown }[] = [];
    const changes = [{ path: '/walletBronze', before: { present: true, value: '100' },
      after: { present: true, value: '125' } }];
    const preview = { operation: 'set_wallet', target: { kind: 'player', identity },
      baseVersion: 'progression:before', preview: { changes, truncated: false }, warnings: [],
      expiresAtMicros: '9999999999999999' } as const;
    const envelope = { preview, previewFingerprint: 'preview:set-wallet', committedVersion: 'progression:after' };
    const committedAudit = { id: '41', actorIdentity: identity, operation: 'set_wallet',
      target: preview.target, occurredAtMicros: '2', payload: { schemaVersion: 1,
        clientMutationId: 'player-wallet', target: preview.target, reason, changes,
        inverse: { operation: 'undo', args: { progression: {} } }, notice: 'Wallet changed.' } };
    const undoChanges = changes.map(({ path, before, after }) => ({ path, before: after, after: before }));
    const undoAudit = { id: '42', actorIdentity: identity, operation: 'undo',
      target: preview.target, occurredAtMicros: '3', payload: { schemaVersion: 1,
        clientMutationId: 'player-wallet-undo', target: preview.target, reason, changes: undoChanges,
        inverse: null, notice: 'Wallet change undone.' } };
    const connection = {
      reducers: {
        adminSetWallet: async (args: unknown) => { reducerCalls.push({ name: 'set', args }); },
        adminUndoPlayer: async (args: unknown) => { reducerCalls.push({ name: 'undo', args }); },
      },
      procedures: {
        adminPlayerMutationResult: async ({ clientMutationId }: { readonly clientMutationId: string }) => JSON.stringify(
          clientMutationId === 'player-wallet'
            ? { audit: committedAudit, committedVersion: 'progression:after' }
            : { audit: undoAudit, committedVersion: 'progression:before' },
        ),
      },
      db: { ownAdminMutationPreviews: { iter: () => [{ clientMutationId: 'player-wallet',
        previewJson: JSON.stringify(envelope) }] } },
    } as unknown as DbConnection;
    const service = new StudioLiveAdminServices(() => connection);
    const mutation = { operation: 'set_wallet', targetIdentity: identity, deltaBronze: '25', reason,
      clientMutationId: 'player-wallet', dryRun: true } as const;
    await service.mutatePlayer(mutation, 'progression:before');
    const committed = await service.mutatePlayer({ ...mutation, dryRun: false }, 'progression:before');
    expect(committed).toMatchObject({ committed: true, version: 'progression:after', undoAuditId: '41' });

    const undone = await service.undoPlayer({ auditId: committed.undoAuditId!, targetIdentity: identity,
      reason, clientMutationId: 'player-wallet-undo', expectedBaseVersion: committed.version });
    expect(reducerCalls[2]).toMatchObject({ name: 'undo', args: { auditId: 41n,
      expectedBaseVersion: 'progression:after', clientMutationId: 'player-wallet-undo' } });
    expect(undone).toMatchObject({ committed: true, version: 'progression:before',
      undoAuditId: null, audit: { id: '42', operation: 'undo' } });
    expect(undone.preview.preview.changes).toEqual(undoChanges);
  });

  it('rejects malformed JSON from every connected admin procedure family', async () => {
    const invalid = async () => '{}';
    const connection = { procedures: {
      adminFindPlayers: invalid, adminPlayerSnapshot: invalid, adminPlayerInventory: invalid,
      adminConnectionsPage: invalid, adminAuditPage: invalid, adminEntitiesInArea: invalid,
      adminContainerContents: invalid, adminTelemetry: invalid, adminValidateWorld: invalid,
      adminClientErrors: invalid, adminMissingContainerRecovery: invalid,
    } } as unknown as DbConnection;
    const service = new StudioLiveAdminServices(() => connection);
    const calls = [service.findPlayers('', null), service.playerSnapshot(identity), service.playerInventory(identity),
      service.connectionsPage(null, null), service.auditPage({}, null), service.listEntities({ kinds: ['chest'],
        spaceId: '0', x0: 0, y0: 0, x1: 1, y1: 1, text: '', cursor: null, limit: 10 }),
      service.container('1'), service.telemetry(), service.validateWorld(), service.clientErrors(null),
      service.inspectMissingContainer({ entityId: '91', targetIdentity: identity })];
    const results = await Promise.allSettled(calls);
    expect(results).toHaveLength(11);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'admin_payload_invalid' });
    }
  });

  it('runs exact missing-container inspect, preview, audited commit, and verification over one connection', async () => {
    const reducerArgs: unknown[] = [];
    let present = false;
    const inspection = () => JSON.stringify({ entityId: '91', targetIdentity: identity,
      recoverable: !present, auditId: '300', summary: present
        ? 'The container is already present with the exact audited state.'
        : 'Audit 300 contains exact definition, provenance, custody, processor, damage, and 24 slots.',
      version: present ? 'missing:v2' : 'missing:v1' });
    const preview = { operation: 'restore_missing_container', target: { kind: 'entity', entityId: '91' },
      baseVersion: 'missing:v1', preview: { changes: [{ path: '/present',
        before: { present: true, value: false }, after: { present: true, value: true } }], truncated: false },
      warnings: ['Exact custody will be restored.'], expiresAtMicros: '9999999999999999' };
    const envelope = { preview, previewFingerprint: 'preview:restore-91', committedVersion: 'missing:v2' };
    const audit = { id: '301', actorIdentity: identity, operation: 'restore_missing_container',
      target: preview.target, occurredAtMicros: '3', payload: { schemaVersion: 1, clientMutationId: 'restore-91',
        target: preview.target, reason, changes: preview.preview.changes,
        inverse: { operation: 'despawn_entity', args: { entityId: '91', spillContents: false } },
        notice: 'Your missing container and its exact audited contents were restored.' } };
    const connection = { reducers: { adminRestoreMissingContainer: async (args: { dryRun: boolean }) => {
      reducerArgs.push(args); if (!args.dryRun) present = true;
    } }, procedures: {
      adminMissingContainerRecovery: async () => inspection(),
      adminAuditPage: async () => JSON.stringify({ rows: [audit], nextCursor: null }),
    }, db: { ownAdminMutationPreviews: { iter: () => [{ clientMutationId: 'restore-91',
      previewJson: JSON.stringify(envelope) }] } } } as unknown as DbConnection;
    const service = new StudioLiveAdminServices(() => connection);
    await expect(service.inspectMissingContainer({ entityId: '91', targetIdentity: identity }))
      .resolves.toMatchObject({ recoverable: true, auditId: '300' });
    const staged = await service.previewRestoreMissingContainer({ entityId: '91', targetIdentity: identity,
      reason, clientMutationId: 'restore-91' });
    expect(staged).toMatchObject({ token: 'restore-91', baseVersion: 'missing:v1' });
    expect(reducerArgs[0]).toMatchObject({ dryRun: true, sourceAuditId: 300n,
      expectedBaseVersion: 'missing:v1', previewFingerprint: undefined });
    const committed = await service.commitRestoreMissingContainer({ entityId: '91', targetIdentity: identity,
      reason, clientMutationId: 'restore-91', token: 'restore-91', expectedBaseVersion: staged.baseVersion });
    expect(committed).toMatchObject({ committed: true, version: 'missing:v2', auditId: '301' });
    expect(reducerArgs[1]).toMatchObject({ dryRun: false, sourceAuditId: 300n,
      expectedBaseVersion: 'missing:v1', previewFingerprint: 'preview:restore-91' });
    await expect(service.verifyRestoredContainer('91', 'missing:v2')).resolves.toBe(true);
  });

  it('uses empty base only for object discovery then commits the exact receipt', async () => {
    const reducerArgs: unknown[] = [];
    const preview = { operation: 'spawn_entity', target: { kind: 'space', spaceId: '0' }, baseVersion: 'world-v7',
      preview: { changes: [{ path: '/entities/new', before: null, after: { definitionId: 'object:chest' } }], truncated: false },
      warnings: [], expiresAtMicros: '9999999999999999' };
    const envelope = { preview, previewFingerprint: 'preview:exact', committedVersion: 'world-v8' };
    const audit = { id: 'audit-spawn-live', actorIdentity: identity, operation: 'spawn_entity',
      target: preview.target, occurredAtMicros: '2', payload: { schemaVersion: 1, clientMutationId: 'spawn-live',
        target: preview.target, reason, changes: preview.preview.changes, inverse: null } };
    const connection = {
      reducers: { adminSpawnEntity: async (args: unknown) => { reducerArgs.push(args); } },
      procedures: { adminAuditPage: async () => JSON.stringify({ rows: [audit], nextCursor: null }) },
      db: { ownAdminMutationPreviews: { iter: () => [{ clientMutationId: 'spawn-live', previewJson: JSON.stringify(envelope) }] } },
    } as unknown as DbConnection;
    const service = new StudioLiveAdminServices(() => connection);
    const mutation = { operation: 'spawn_entity', definitionId: 'object:chest', spaceId: '0', tileX: 2, tileY: 3,
      reason, clientMutationId: 'spawn-live', dryRun: true } as const;
    const dryRun = await service.mutate(mutation, '', null);
    expect(dryRun.preview.baseVersion).toBe('world-v7');
    expect(reducerArgs[0]).toMatchObject({ dryRun: true, expectedBaseVersion: '', previewFingerprint: undefined });

    await expect(service.mutate({ ...mutation, dryRun: false }, '', 'preview:exact'))
      .rejects.toThrow('admin_preview_required');
    expect(reducerArgs).toHaveLength(1);

    const committed = await service.mutate({ ...mutation, dryRun: false }, 'world-v7', 'preview:exact');
    expect(reducerArgs[1]).toMatchObject({ dryRun: false, expectedBaseVersion: 'world-v7', previewFingerprint: 'preview:exact' });
    expect(committed).toMatchObject({ committed: true, audit: { id: 'audit-spawn-live' } });
  });

  it('keeps one shell connection and restricts mocks to the explicit sandbox', () => {
    const connection = readFileSync(new URL('../shell/studio-connection.ts', import.meta.url), 'utf8');
    expect(connection.match(/DbConnection\.builder\(\)/gu)).toHaveLength(1);
    expect(connection).toContain('new StudioLiveAdminServices(() => this.#connected ? this.#connection : null)');
    expect(connection).toContain('tables.ownAdminMutationPreviews');
    const canvas = readFileSync(new URL('../tools/operate-canvas.ts', import.meta.url), 'utf8');
    expect(canvas).toContain("environment === 'sandbox'");
    expect(canvas).toContain('controller.liveAdapter()?.');
    expect(canvas).not.toMatch(/document\.createElement|HTMLElement|HTMLInputElement/u);
  });

  it('binds W5 world writes to the caller-private exact receipt', async () => {
    const reducerArgs: unknown[] = [];
    const preview = { operation: 'set_space_flags', target: { kind: 'space', spaceId: '0' }, baseVersion: 'world:old',
      preview: { changes: [{ path: '/spaces/0/flags/buildAllowed', before: true, after: false }], truncated: false },
      warnings: [], expiresAtMicros: '9999999999999999' };
    const envelope = { preview, previewFingerprint: 'preview:w5', committedVersion: 'world:new' };
    const connection = {
      reducers: { adminSetSpaceFlags: async (args: unknown) => { reducerArgs.push(args); } },
      procedures: { adminAuditPage: async () => JSON.stringify({ rows: [], nextCursor: null }) },
      db: { ownAdminMutationPreviews: { iter: () => [{ clientMutationId: 'world-flags', previewJson: JSON.stringify(envelope) }] } },
    } as unknown as DbConnection;
    const world = new StudioLiveAdminWorldService(() => connection, {} as AdminObjectsApi);
    const mutation = { draft: { operation: 'set_space_flags', spaceId: '0', patch: { buildAllowed: false } },
      reason, clientMutationId: 'world-flags', dryRun: true } as const;
    const dryRun = await world.mutate(mutation, 'world:old', null, null);
    expect(dryRun.preview).toMatchObject({ baseVersion: 'world:old', fingerprint: 'preview:w5' });
    await expect(world.mutate({ ...mutation, dryRun: false }, '', 'preview:w5', null))
      .rejects.toThrow('admin_preview_required');
    const committed = await world.mutate({ ...mutation, dryRun: false }, 'world:old', 'preview:w5', null);
    expect(committed).toMatchObject({ committed: true, worldVersion: 'world:new' });
    expect(reducerArgs[1]).toMatchObject({ expectedWorldVersion: 'world:old', previewFingerprint: 'preview:w5' });
  });

  it.each([
    [{ operation: 'set_time', calendarTick: '43000' }, 'adminSetTime', { calendarTick: 43000n }],
    [{ operation: 'set_weather', weatherMode: 'rain' }, 'adminSetWeather', { weatherMode: 'rain' }],
    [{ operation: 'set_wind', direction: 'east' }, 'adminSetWind', { direction: 'east' }],
    [{ operation: 'set_motd', body: 'Harvest festival tonight' }, 'adminSetMotd', { body: 'Harvest festival tonight' }],
    [{ operation: 'global_notice', body: 'Server restart in ten minutes' }, 'adminGlobalNotice', { body: 'Server restart in ten minutes' }],
    [{ operation: 'restore_map', revisionId: '17' }, 'adminRestoreMap', { revisionId: 17n }],
    [{ operation: 'move_homestead', spaceId: '30000', tileX: 26, tileY: 31 }, 'adminMoveHomesteadExact',
      { spaceId: 30000, tileX: 26, tileY: 31 }],
  ] as const)('binds %s to an authority-discovered exact U5 receipt', async (draft, reducerName, expectedArgs) => {
    const reducerArgs: unknown[] = [];
    const clientMutationId = `u5-${draft.operation}`;
    const target = draft.operation === 'move_homestead'
      ? { kind: 'space', spaceId: draft.spaceId } as const : { kind: 'world' } as const;
    const preview = { operation: draft.operation, target, baseVersion: 'world-control:old',
      preview: { changes: [{ path: '/world', before: 'old', after: 'new' }], truncated: false },
      warnings: [], expiresAtMicros: '9999999999999999' };
    const envelope = { preview, previewFingerprint: `preview:${draft.operation}`, committedVersion: 'world-control:new' };
    const reducers = { [reducerName]: async (args: unknown) => { reducerArgs.push(args); } };
    const connection = {
      reducers,
      procedures: { adminAuditPage: async () => JSON.stringify({ rows: [], nextCursor: null }) },
      db: { ownAdminMutationPreviews: { iter: () => [{ clientMutationId, previewJson: JSON.stringify(envelope) }] } },
    } as unknown as DbConnection;
    const world = new StudioLiveAdminWorldService(() => connection, {} as AdminObjectsApi);
    const mutation = { draft: draft as AdminWorldControlDraft, reason, clientMutationId, dryRun: true } as const;

    const dryRun = await world.mutate(mutation, 'validation-report-version', null, null);
    expect(dryRun.preview).toMatchObject({ baseVersion: 'world-control:old', fingerprint: `preview:${draft.operation}` });
    expect(reducerArgs[0]).toMatchObject({ dryRun: true, expectedWorldVersion: '',
      previewFingerprint: undefined, ...expectedArgs });

    await expect(world.mutate({ ...mutation, dryRun: false }, '', `preview:${draft.operation}`, null))
      .rejects.toThrow('admin_preview_required');
    const committed = await world.mutate({ ...mutation, dryRun: false }, 'world-control:old',
      `preview:${draft.operation}`, null);
    expect(reducerArgs[1]).toMatchObject({ dryRun: false, expectedWorldVersion: 'world-control:old',
      previewFingerprint: `preview:${draft.operation}`, ...expectedArgs });
    expect(committed).toMatchObject({ committed: true, worldVersion: 'world-control:new' });
  });

  it('fails closed before transport for invalid U5 integer identifiers', async () => {
    let reducerCalled = false;
    const connection = { reducers: {
      adminSetTime: async () => { reducerCalled = true; },
      adminRestoreMap: async () => { reducerCalled = true; },
    } } as unknown as DbConnection;
    const world = new StudioLiveAdminWorldService(() => connection, {} as AdminObjectsApi);
    const mutation = { draft: { operation: 'restore_map', revisionId: '-1' }, reason,
      clientMutationId: 'u5-invalid-revision', dryRun: true } as const;
    await expect(world.mutate(mutation, 'validation-report-version', null, null)).rejects.toThrow('admin_payload_invalid');
    expect(reducerCalled).toBe(false);
  });
});
