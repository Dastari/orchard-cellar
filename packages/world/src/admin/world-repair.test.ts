import { describe, expect, it } from 'vitest';
import { parseAdminReason } from './contracts.js';
import {
  ADMIN_WORLD_ISSUE_LIMIT,
  ADMIN_WORLD_SCAN_LIMIT,
  AdminWorldRepairError,
  adminWorldVersion,
  planAdminValidateWorld,
  planAdminWorldMutation,
  requireAdminWorldAuthority,
  type AdminWorldMutationRequest,
  type AdminWorldRepairMutation,
  type AdminWorldRepairOperation,
  type AdminWorldState,
} from './world-repair.js';

const parsedReason = parseAdminReason('Repair validation report 5021');
if (!parsedReason.ok) throw new Error('invalid test reason');
const reason = parsedReason.value;

function state(overrides: Partial<AdminWorldState> = {}): AdminWorldState {
  return {
    spaces: [
      { spaceId: '0', sizeTiles: 64, flags: { ownerOnly: false, weather: true } },
      { spaceId: '1', sizeTiles: 32, flags: { ownerOnly: true, weather: false } },
    ],
    portals: [
      { portalId: '10', kind: 'door_enter', fromSpace: '0', fromTileX: 4, fromTileY: 5, toSpace: '1', toTileX: 2, toTileY: 3 },
      { portalId: '11', kind: 'door_exit', fromSpace: '1', fromTileX: 2, fromTileY: 3, toSpace: '0', toTileX: 4, toTileY: 5 },
    ],
    players: [{ identity: 'player-1', spaceId: '0', tileX: 8, tileY: 9, blocked: false, repairPosition: null }],
    rowReferences: [],
    custody: [],
    contentReferences: [],
    ...overrides,
  };
}

function mutation(value: { readonly operation: AdminWorldRepairOperation; readonly dryRun: boolean } & Record<string, unknown>): AdminWorldRepairMutation {
  return { reason, clientMutationId: 'world-repair-test-1', ...value } as AdminWorldRepairMutation;
}

function request(
  input: AdminWorldState,
  operation: AdminWorldRepairMutation,
  overrides: Partial<AdminWorldMutationRequest> = {},
): AdminWorldMutationRequest {
  return {
    mutation: operation,
    expectedWorldVersion: adminWorldVersion(input),
    previewFingerprint: null,
    report: null,
    reportFingerprint: null,
    nowMicros: 1_000_000n,
    ...overrides,
  };
}

describe('W5 world validation and repair kernel', () => {
  it('produces the same version and fingerprint for equivalent row orderings', () => {
    const input = state();
    const reordered = state({ spaces: [...input.spaces].reverse(), portals: [...input.portals].reverse() });
    const left = planAdminValidateWorld(input, 'report-stable', 50n);
    const right = planAdminValidateWorld(reordered, 'report-stable', 50n);
    expect(right).toEqual(left);
    expect(left.issues).toEqual([]);
  });

  it('reports deterministic orphan, custody, portal, space, collision, and content issues', () => {
    const input = state({
      portals: [state().portals[0]!],
      players: [
        { identity: 'blocked', spaceId: '0', tileX: 8, tileY: 9, blocked: true, repairPosition: { spaceId: '0', tileX: 7, tileY: 9 } },
        { identity: 'lost', spaceId: '404', tileX: 1, tileY: 1, blocked: false, repairPosition: null },
      ],
      rowReferences: [
        { sourceKind: 'inventory_slot', sourceId: 'slot-1', targetKind: 'player', targetId: 'missing', targetExists: false, repair: 'delete_source' },
      ],
      custody: [
        { entityKind: 'chest', entityId: '7', holderIdentity: 'missing', holderExists: false, parentExists: true, claims: 1 },
        { entityKind: 'trade_offer', entityId: 'offer-2', holderIdentity: 'player-1', holderExists: true, parentExists: false, claims: 2 },
      ],
      contentReferences: [
        { sourceKind: 'placeable', sourceId: '8', definitionId: 'object:retired', exists: true, retired: true },
        { sourceKind: 'npc', sourceId: '9', definitionId: 'npc:missing', exists: false, retired: false },
      ],
    });
    const report = planAdminValidateWorld(input, 'report-5021', 10n);
    expect(report.issues.map(({ code }) => code)).toEqual([
      'player_inside_collision',
      'space_reference_missing',
      'portal_pair_missing',
      'orphaned_row',
      'custody_holder_missing',
      'custody_parent_missing',
      'custody_claim_conflict',
      'definition_missing',
      'definition_retired',
    ]);
    expect(report.repairs.map(({ kind }) => kind)).toEqual([
      'relocate_player', 'insert_portal', 'delete_orphan', 'clear_custody',
    ]);
    expect(report.fingerprint).toMatch(/^report:/);
    expect(report.worldVersion).toBe(adminWorldVersion(input));
    expect(report.expiresAtMicros).toBe('60000010');
  });

  it('detects reverse-endpoint mismatches without overwriting either valid portal row', () => {
    const input = state({
      portals: [
        state().portals[0]!,
        { ...state().portals[1]!, toTileX: 20 },
      ],
    });
    const report = planAdminValidateWorld(input, 'report-mismatch', 0n);
    expect(report.issues.map(({ code }) => code)).toContain('portal_pair_mismatch');
    expect(report.repairs).toHaveLength(1);
    expect(report.repairs[0]).toMatchObject({ kind: 'insert_portal' });
    expect(report.repairs.some((repair) => repair.kind === 'insert_portal'
      && (repair.portal.portalId === '10' || repair.portal.portalId === '11'))).toBe(false);
    const repair = mutation({ operation: 'repair_portal_pair', portalId: '10', dryRun: true });
    expect(() => planAdminWorldMutation(input, request(input, repair)))
      .toThrowError(new AdminWorldRepairError('admin_invalid_patch'));
  });

  it('bounds scans and issues while making truncation explicit', () => {
    const rowReferences = Array.from({ length: ADMIN_WORLD_SCAN_LIMIT + 20 }, (_, index) => ({
      sourceKind: 'slot', sourceId: String(index).padStart(6, '0'), targetKind: 'player',
      targetId: 'missing', targetExists: false, repair: 'none' as const,
    }));
    const report = planAdminValidateWorld(state({ spaces: [], portals: [], players: [], rowReferences }), 'report-bounded', 0n);
    expect(report.rowsScanned).toBe(ADMIN_WORLD_SCAN_LIMIT);
    expect(report.issues).toHaveLength(ADMIN_WORLD_ISSUE_LIMIT);
    expect(report.issues[report.issues.length - 1]?.code).toBe('issue_limit_reached');
  });

  it('plans an additive space flag patch and exact inverse without replacing unrelated flags', () => {
    const input = state();
    const dryRun = mutation({
      operation: 'set_space_flags', spaceId: '0', patch: { ownerOnly: true }, dryRun: true,
    });
    const preview = planAdminWorldMutation(input, request(input, dryRun));
    expect(preview.after.spaces[0]?.flags).toEqual({ ownerOnly: true, weather: true });
    expect(preview.audit.inverse).toEqual({
      operation: 'undo',
      args: { actions: [{ kind: 'set_space_flags', spaceId: '0', flags: { ownerOnly: false, weather: true } }] },
    });
    expect(input.spaces[0]?.flags).toEqual({ ownerOnly: false, weather: true });
    expect(() => planAdminWorldMutation(input, request(input, mutation({
      operation: 'set_space_flags', spaceId: '0', patch: { unknownFlag: true }, dryRun: true,
    })))).toThrowError(new AdminWorldRepairError('admin_invalid_patch'));
  });

  it('creates only a missing reverse portal and preserves every existing row', () => {
    const input = state({ portals: [state().portals[0]!] });
    const dryRun = mutation({ operation: 'repair_portal_pair', portalId: '10', dryRun: true });
    const preview = planAdminWorldMutation(input, request(input, dryRun));
    expect(preview.after.portals).toHaveLength(2);
    expect(preview.after.portals.find(({ portalId }) => portalId === '10')).toEqual(input.portals[0]);
    expect(preview.actions).toEqual([{
      kind: 'insert_portal',
      portal: { portalId: '1', kind: 'repaired_pair:door_enter', fromSpace: '1', fromTileX: 2, fromTileY: 3, toSpace: '0', toTileX: 4, toTileY: 5 },
    }]);
  });

  it('binds report repair to id, fingerprint, expiry, and exact world version', () => {
    const input = state({ portals: [state().portals[0]!] });
    const report = planAdminValidateWorld(input, 'report-commit', 1_000n);
    const dryRun = mutation({ operation: 'run_world_repair', reportId: report.reportId, dryRun: true });
    const preview = planAdminWorldMutation(input, request(input, dryRun, {
      report,
      reportFingerprint: report.fingerprint,
    }));
    const commit = { ...dryRun, dryRun: false } as AdminWorldRepairMutation;
    const committed = planAdminWorldMutation(input, request(input, commit, {
      report,
      reportFingerprint: report.fingerprint,
      previewFingerprint: preview.previewFingerprint,
    }));
    expect(committed.after).toEqual(preview.after);
    expect(committed.audit.inverse?.args['actions']).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'delete_portal', portalId: '1' }),
    ]));
    expect(() => planAdminWorldMutation(input, request(input, commit, {
      report, reportFingerprint: 'report:wrong', previewFingerprint: preview.previewFingerprint,
    }))).toThrowError(new AdminWorldRepairError('admin_preview_required'));
    expect(() => planAdminWorldMutation(input, request(input, commit, {
      report, reportFingerprint: report.fingerprint, previewFingerprint: preview.previewFingerprint,
      nowMicros: BigInt(report.expiresAtMicros) + 1n,
    }))).toThrowError(new AdminWorldRepairError('admin_world_revision_conflict'));
    expect(() => planAdminWorldMutation({ ...input, spaces: [...input.spaces, { spaceId: '2', sizeTiles: 8, flags: {} }] }, request(input, commit, {
      report, reportFingerprint: report.fingerprint, previewFingerprint: preview.previewFingerprint,
    }))).toThrowError(new AdminWorldRepairError('admin_world_revision_conflict'));
  });

  it('requires exact preview parity on direct repair commits', () => {
    const input = state({ portals: [state().portals[0]!] });
    const dryRun = mutation({ operation: 'repair_portal_pair', portalId: '10', dryRun: true });
    const preview = planAdminWorldMutation(input, request(input, dryRun));
    const commit = { ...dryRun, dryRun: false } as AdminWorldRepairMutation;
    expect(() => planAdminWorldMutation(input, request(input, commit)))
      .toThrowError(new AdminWorldRepairError('admin_preview_required'));
    const result = planAdminWorldMutation(input, request(input, commit, {
      previewFingerprint: preview.previewFingerprint,
    }));
    expect(result.actions).toEqual(preview.actions);
    expect(result.committedVersion).toBe(adminWorldVersion(preview.after));
  });

  it('allows only owner/admin world mutations', () => {
    const operation = mutation({ operation: 'run_world_repair', reportId: 'report-1', dryRun: true });
    expect(() => requireAdminWorldAuthority('owner', operation)).not.toThrow();
    expect(() => requireAdminWorldAuthority('admin', operation)).not.toThrow();
    for (const role of ['support', 'moderator', 'content_editor', 'friend'] as const) {
      expect(() => requireAdminWorldAuthority(role, operation))
        .toThrowError(new AdminWorldRepairError('admin_role_forbidden'));
    }
  });
});
