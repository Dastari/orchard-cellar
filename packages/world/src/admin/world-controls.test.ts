import { describe, expect, it } from 'vitest';
import { parseAdminReason, type AdminWorldMutation } from './contracts.js';
import {
  AdminWorldControlError,
  adminWorldControlVersion,
  planAdminWorldControlMutation,
  requireAdminWorldControlAuthority,
  type AdminWorldControlMutation,
  type AdminWorldControlState,
} from './world-controls.js';

const reason = (() => {
  const parsed = parseAdminReason('World control acceptance test');
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
})();

const state: AdminWorldControlState = Object.freeze({
  authorityTick: '1000', calendarTick: '1200', cropCalendarOffset: '200',
  weatherMode: 'auto', windDirection: 'auto', motd: 'Welcome.',
  globalNoticeSequence: '8', homesteadSiteAllowed: true,
  mapHead: Object.freeze({ revisionId: '19', mapId: 'live-island', revision: 19,
    contentHash: 'head-hash', documentJson: '{"schemaVersion":3,"mapId":"live-island"}' }),
  restoreRevision: Object.freeze({ revisionId: '17', mapId: 'live-island', revision: 17,
    contentHash: 'old-hash', documentJson: '{"schemaVersion":3,"mapId":"live-island","old":true}' }),
  homestead: Object.freeze({ spaceId: '30000', ownerIdentity: 'ada', ownerName: 'Ada', tileX: 24, tileY: 30,
    entrancePortalId: '60000', entranceTileX: 24, entranceTileY: 31,
    exitPortalId: '60001', exitTileX: 24, exitTileY: 32 }),
});

type WorldControlDraft = AdminWorldControlMutation extends infer Mutation
  ? Mutation extends unknown ? Omit<Mutation, 'clientMutationId' | 'dryRun' | 'reason'> : never
  : never;

function mutation(fields: WorldControlDraft): AdminWorldControlMutation {
  return { ...fields, clientMutationId: `world-${fields.operation}`, dryRun: true,
    reason } as AdminWorldControlMutation;
}

const drafts: readonly AdminWorldControlMutation[] = [
  mutation({ operation: 'set_time', calendarTick: '2400' }),
  mutation({ operation: 'set_weather', weatherMode: 'rain' }),
  mutation({ operation: 'set_wind', direction: 'e' }),
  mutation({ operation: 'set_motd', body: ' Harvest festival tonight. ' }),
  mutation({ operation: 'global_notice', body: 'Server restart in ten minutes.' }),
  mutation({ operation: 'restore_map', revisionId: '17' }),
  mutation({ operation: 'move_homestead', spaceId: '30000', tileX: 40, tileY: 41 }),
];

describe('exact world-control planner', () => {
  it.each(drafts.map((draft) => [draft.operation, draft] as const))(
    '%s preserves dry-run/commit fingerprint parity and typed inverse audit',
    (_operation, draft) => {
      const base = adminWorldControlVersion(state);
      const preview = planAdminWorldControlMutation(state, { mutation: draft,
        expectedBaseVersion: base, previewFingerprint: null, nowMicros: 1_000n });
      const commit = planAdminWorldControlMutation(state, { mutation: { ...draft, dryRun: false },
        expectedBaseVersion: base, previewFingerprint: preview.previewFingerprint, nowMicros: 1_000n });
      expect(commit.previewFingerprint).toBe(preview.previewFingerprint);
      expect(commit.committedVersion).toBe(preview.committedVersion);
      expect(commit.audit.schemaVersion).toBe(1);
      expect(commit.audit.changes.length).toBeGreaterThan(0);
      expect(commit.preview.baseVersion).toBe(base);
      if (draft.operation === 'global_notice') expect(commit.audit.inverse).toBeNull();
      else expect(commit.audit.inverse?.operation).toBe(draft.operation);
    },
  );

  it('rejects stale bases and an altered preview fingerprint', () => {
    const draft = drafts[0]!;
    expect(() => planAdminWorldControlMutation(state, { mutation: draft,
      expectedBaseVersion: 'world-control:stale', previewFingerprint: null, nowMicros: 1n }))
      .toThrowError(new AdminWorldControlError('admin_world_revision_conflict'));
    const base = adminWorldControlVersion(state);
    expect(() => planAdminWorldControlMutation(state, { mutation: { ...draft, dryRun: false },
      expectedBaseVersion: base, previewFingerprint: 'preview:altered', nowMicros: 1n }))
      .toThrowError(new AdminWorldControlError('admin_preview_required'));
  });

  it('validates authority values, collision result, and no-op changes', () => {
    const base = adminWorldControlVersion(state);
    for (const draft of [
      mutation({ operation: 'set_time', calendarTick: '-1' }),
      mutation({ operation: 'set_weather', weatherMode: 'storm' }),
      mutation({ operation: 'set_wind', direction: 'sideways' }),
      mutation({ operation: 'set_motd', body: '' }),
      mutation({ operation: 'global_notice', body: '' }),
    ]) expect(() => planAdminWorldControlMutation(state, { mutation: draft,
      expectedBaseVersion: base, previewFingerprint: null, nowMicros: 1n })).toThrow();
    expect(() => planAdminWorldControlMutation({ ...state, homesteadSiteAllowed: false }, {
      mutation: drafts[6]!, expectedBaseVersion: adminWorldControlVersion({ ...state, homesteadSiteAllowed: false }),
      previewFingerprint: null, nowMicros: 1n,
    })).toThrowError(new AdminWorldControlError('admin_position_blocked'));
    expect(() => planAdminWorldControlMutation(state, { mutation: mutation({ operation: 'set_weather', weatherMode: 'auto' }),
      expectedBaseVersion: base, previewFingerprint: null, nowMicros: 1n }))
      .toThrowError(new AdminWorldControlError('admin_no_changes'));
  });

  it('limits world controls to owner/admin roles', () => {
    const draft = drafts[0]!;
    expect(() => requireAdminWorldControlAuthority('owner', draft)).not.toThrow();
    expect(() => requireAdminWorldControlAuthority('admin', draft)).not.toThrow();
    for (const role of ['support', 'moderator', 'content_editor', 'friend'] as const) {
      expect(() => requireAdminWorldControlAuthority(role, draft)).toThrowError(
        new AdminWorldControlError('admin_role_forbidden'),
      );
    }
  });

  it('keeps every world control operation in the shared contract', () => {
    const operations: AdminWorldMutation['operation'][] = drafts.map(({ operation }) => operation);
    expect(operations).toEqual(['set_time', 'set_weather', 'set_wind', 'set_motd',
      'global_notice', 'restore_map', 'move_homestead']);
  });
});
