import { describe, expect, it } from 'vitest';
import {
  ADMIN_PROCEDURE_SCAN_LIMIT,
  ADMIN_READ_PROCEDURES,
  AdminProcedureError,
  boundedAdminPage,
  buildAdminAuditPage,
  buildAdminConnectionsPage,
  buildAdminEntitiesInArea,
  buildAdminFindPlayers,
  buildAdminPlayerInventory,
  buildAdminPlayerSnapshot,
  buildAdminTelemetry,
  buildAdminValidateWorld,
  decodeAdminCursor,
  requireOwnerOrAdminRead,
  stringifyAdminProcedureResult,
} from './procedures.js';

const player = (index: number) => ({
  identity: `identity-${index}`, displayName: `Player ${String(index).padStart(3, '0')}`,
  role: 'friend' as const, grants: [], online: index % 2 === 0,
  spaceId: '0', tileX: index, tileY: index, lastSeenMicros: String(index),
});

describe('W1 administration read procedures', () => {
  it('authorizes only active owners and admins', () => {
    expect(requireOwnerOrAdminRead({ role: 'owner', blocked: false, revoked: false })).toBe('owner');
    expect(requireOwnerOrAdminRead({ role: 'admin', blocked: false, revoked: false })).toBe('admin');
    for (const row of [null, { role: 'support', blocked: false, revoked: false }, { role: 'owner', blocked: true, revoked: false }, { role: 'admin', blocked: false, revoked: true }]) {
      expect(() => requireOwnerOrAdminRead(row)).toThrow(AdminProcedureError);
    }
  });

  it('uses scoped bounded cursors and scans at most page size plus one', () => {
    const first = boundedAdminPage('players', Array.from({ length: 200 }, (_, index) => index), null);
    expect(first.page.rows).toHaveLength(50);
    expect(first.rowsScanned).toBe(ADMIN_PROCEDURE_SCAN_LIMIT);
    const second = boundedAdminPage('players', Array.from({ length: 80 }, (_, index) => index), first.page.nextCursor);
    expect(second.page.rows[0]).toBe(50);
    expect(() => decodeAdminCursor(first.page.nextCursor, 'audit')).toThrow('admin_invalid_cursor');
  });

  it('searches stable summaries and exposes a named scan counter', () => {
    const response = buildAdminFindPlayers(Array.from({ length: 80 }, (_, index) => player(index)), 'Player 0', null);
    expect(response.result.rows).toHaveLength(50);
    expect(response.rowsScanned.adminFindPlayersRowsScanned).toBeLessThanOrEqual(ADMIN_PROCEDURE_SCAN_LIMIT);
    expect(Object.keys(response.rowsScanned)).toEqual(ADMIN_READ_PROCEDURES.map((name) => `${name}RowsScanned`));
  });

  it('assembles full player and resolved inventory snapshots from targeted rows', () => {
    const summary = player(1);
    const snapshot = buildAdminPlayerSnapshot({
      summary, position: { spaceId: '0', tileX: 1, tileY: 1 }, spawn: { tileX: 2, tileY: 2 },
      walletBronze: '50', stats: { str: 1 }, vitals: { health: 100 }, effects: [],
      skillTracks: [], skillNodes: [], quests: [], statistics: [], homestead: null,
      dialogue: null, mount: null, blocked: false, revoked: false, version: 'v1', rowsScanned: 12,
    });
    expect(snapshot.result).toMatchObject({ identity: 'identity-1', walletBronze: '50', membership: { blocked: false } });
    expect(snapshot.rowsScanned.adminPlayerSnapshotRowsScanned).toBe(12);

    const inventory = buildAdminPlayerInventory('identity-1', [{ area: 'hotbar', index: 0, itemKind: 'apple', quantity: 2 }], new Map([
      ['apple', { itemKind: 'apple', displayName: 'Apple', maxStack: 20, tags: ['food'] }],
    ]), 'v1');
    expect(inventory.result.slots[0]?.stack).toMatchObject({ displayName: 'Apple', maxStack: 20 });
    expect(inventory.rowsScanned.adminPlayerInventoryRowsScanned).toBe(1);
  });

  it('pages typed audit payloads while preserving legacy audit rows', () => {
    const page = buildAdminAuditPage([
      { id: '1', actorIdentity: 'owner', action: 'set_world_time', value: '12', occurredAtMicros: '100', targetKey: '', payload: '' },
      {
        id: '2', actorIdentity: 'owner', action: 'teleport_player', value: '', occurredAtMicros: '101', targetKey: 'player:i1',
        payload: JSON.stringify({
          schemaVersion: 1, clientMutationId: 'typed-audit-2', target: { kind: 'player', identity: 'i1' },
          reason: 'Restore safe player position', changes: [], inverse: { operation: 'set_spawn', args: { tileX: 1, tileY: 2 } },
        }),
      },
    ], null);
    expect(page.result.rows[0]).toMatchObject({ operation: 'legacy', payload: { schemaVersion: 1, inverse: null } });
    expect(page.result.rows[0]?.payload.changes[0]?.path).toBe('/legacy/set_world_time');
    expect(page.result.rows[1]).toMatchObject({ operation: 'teleport_player', target: { kind: 'player', identity: 'i1' } });
  });

  it('folds indexed connection events into bounded sessions', () => {
    const result = buildAdminConnectionsPage([
      { connectionId: 'c1', identity: 'i1', eventKind: 'connect', occurredAtMicros: '10' },
      { connectionId: 'c1', identity: 'i1', eventKind: 'disconnect', occurredAtMicros: '20' },
      { connectionId: 'c2', identity: 'i2', eventKind: 'connect', occurredAtMicros: '30' },
    ], 'i1', null);
    expect(result.result.rows).toEqual([expect.objectContaining({ connectionId: 'c1', active: false, disconnectedAtMicros: '20' })]);
  });

  it('bounds spatial areas and validates collision, portal and definition references', () => {
    const entities = buildAdminEntitiesInArea([
      { entityId: '1', kind: 'item', definitionId: 'apple', spaceId: '0', tileX: 2, tileY: 3, state: {} },
      { entityId: '2', kind: 'item', definitionId: 'wood', spaceId: '0', tileX: 200, tileY: 300, state: {} },
    ], { spaceId: '0', x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(entities.result.map(({ entityId }) => entityId)).toEqual(['1']);
    expect(() => buildAdminEntitiesInArea([], { spaceId: '0', x0: 0, y0: 0, x1: 500, y1: 500 })).toThrow('admin_payload_invalid');

    const report = buildAdminValidateWorld({
      reportId: 'report-1', worldVersion: '7', expiresAtMicros: '900',
      playerPositions: [{ identity: 'i1', blocked: true }], portalIds: new Set(['p1']),
      portalPairs: [{ portalId: 'p1', pairedPortalId: 'missing' }],
      referencedDefinitions: [{ target: 'e1', definitionId: 'retired' }], knownDefinitions: new Set(),
    });
    expect(report.result.issues.map(({ code }) => code)).toEqual(['player_inside_collision', 'portal_pair_missing', 'definition_retired']);
    expect(report.rowsScanned.adminValidateWorldRowsScanned).toBe(3);
  });

  it('returns telemetry without scanning and serializes bigint transports', () => {
    const response = buildAdminTelemetry({ sampledAtMicros: '1', tick: {}, rowsTouched: {}, rowsScanned: {}, subscriptions: {} });
    expect(response.rowsScanned.adminTelemetryRowsScanned).toBe(0);
    expect(stringifyAdminProcedureResult({ revision: 3n })).toBe('{"revision":"3"}');
  });
});
