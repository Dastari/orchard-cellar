import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { authenticationRejection, isWorldOwnerRole, membershipRejection, OIDC_ISSUER } from './auth-policy.js';
import {
  CHUNK_AUTHORITY_AUDIT_TARGET_KEY,
  CHUNK_AUTHORITY_SPACE_ID,
  adminSpaceFlagsBySpace,
  adminVisibleSpaceFlags,
  chunkAuthorityAuditPayload,
  chunkAuthorityMode,
  chunkAuthorityModeFromFlagsJson,
  parseChunkAuthorityMode,
  planChunkAuthorityFlags,
  preserveOwnerOnlySpaceFlags,
  withoutOwnerOnlySpaceFlags,
} from './chunk-authority-setting.js';
import { planAdminWorldMutation, adminWorldVersion, type AdminWorldRepairMutation, type AdminWorldState } from './admin/world-repair.js';
import { parseAdminReason, parseAdminAuditPayload } from './admin/contracts.js';
import { adminAuditRow } from './admin/procedures.js';
import type { AdminJsonObject } from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);

/** Transpiles one top-level declaration from the real module source. */
function declarationCode(name: string): string {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      return ts.transpileModule(`return ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    }
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations.find((candidate) => candidate.name.getText(source) === name);
      if (declaration?.initializer !== undefined) {
        return ts.transpileModule(`return ${declaration.initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      }
    }
  }
  throw new Error(`declaration ${name} not found`);
}

function compile<T>(name: string, scope: Record<string, unknown>): T {
  return new Function(...Object.keys(scope), declarationCode(name))(...Object.values(scope)) as T;
}

class SenderError extends Error {}
const now = { microsSinceUnixEpoch: 1_700_000_000_000_000n };

type Membership = { role: string; revokedAt?: unknown; blocked: boolean } | null;
const jwt = { issuer: OIDC_ISSUER, audience: ['orchard-web'] };
const requireAuthorizedSender = compile('requireAuthorizedSender', { authenticationRejection, membershipRejection, SenderError });
const requireStrictWorldOwner = compile('requireStrictWorldOwner', { requireAuthorizedSender, isWorldOwnerRole, SenderError });
const setChunkAuthority = compile<(ctx: unknown, args: { mode: string }) => void>('setChunkAuthority', {
  spacetimedb: { reducer: (_schema: unknown, handler: unknown) => handler },
  t: { string: () => null },
  requireStrictWorldOwner,
  parseChunkAuthorityMode,
  planChunkAuthorityFlags,
  CHUNK_AUTHORITY_SPACE_ID,
  CHUNK_AUTHORITY_AUDIT_TARGET_KEY,
  chunkAuthorityAuditPayload,
  SenderError,
});

function world(member: Membership, flagsJson?: string) {
  const audits: Record<string, unknown>[] = [];
  let row: { spaceId: number; flagsJson: string; updatedBy: unknown; updatedAt: unknown } | null = flagsJson === undefined
    ? null : { spaceId: 0, flagsJson, updatedBy: 'previous', updatedAt: 'earlier' };
  const insert = vi.fn((value: typeof row) => { row = value; });
  const update = vi.fn((value: typeof row) => { row = value; });
  const ctx = {
    sender: 'sender', timestamp: now, senderAuth: { jwt }, audits,
    db: {
      world_admin_audit: { insert: (value: Record<string, unknown>) => { audits.push(value); } },
      membership: { identity: { find: () => member } },
      space_admin_flag: { spaceId: { find: (spaceId: number) => (spaceId === 0 ? row : null), update }, insert },
    },
  };
  return { ctx, insert, update, row: () => row };
}

describe('chunkAuthority mode parsing and reader', () => {
  it('accepts exactly off, shadow and on', () => {
    expect(['off', 'shadow', 'on'].map(parseChunkAuthorityMode)).toEqual(['off', 'shadow', 'on']);
    for (const value of ['', 'ON', 'active', ' on', null, undefined, 1, true, {}]) expect(parseChunkAuthorityMode(value)).toBeNull();
  });

  it('defaults to off when the row, the key or a valid value is missing', () => {
    expect(chunkAuthorityModeFromFlagsJson(undefined)).toBe('off');
    expect(chunkAuthorityModeFromFlagsJson('{"weather":true}')).toBe('off');
    expect(chunkAuthorityModeFromFlagsJson('{"chunkAuthority":"sideways"}')).toBe('off');
    expect(chunkAuthorityModeFromFlagsJson('{"chunkAuthority":true}')).toBe('off');
    expect(chunkAuthorityModeFromFlagsJson('not json')).toBe('off');
    expect(chunkAuthorityModeFromFlagsJson('["on"]')).toBe('off');
    expect(chunkAuthorityModeFromFlagsJson('{"chunkAuthority":"shadow"}')).toBe('shadow');
  });

  it('reads the space 0 row only', () => {
    expect(chunkAuthorityMode(world(null).ctx)).toBe('off');
    expect(chunkAuthorityMode(world(null, '{"chunkAuthority":"on","weather":false}').ctx)).toBe('on');
    const find = vi.fn(() => ({ flagsJson: '{"chunkAuthority":"shadow"}' }));
    expect(chunkAuthorityMode({ db: { space_admin_flag: { spaceId: { find } } } })).toBe('shadow');
    expect(find).toHaveBeenCalledWith(0);
  });

  it('plans a write that keeps every other flag, and nothing when already in that mode', () => {
    expect(planChunkAuthorityFlags(undefined, 'off')).toBeNull();
    expect(planChunkAuthorityFlags('{"chunkAuthority":"bogus"}', 'off')).toBeNull();
    expect(planChunkAuthorityFlags('{"chunkAuthority":"on"}', 'on')).toBeNull();
    const plan = planChunkAuthorityFlags('{"ownerOnly":false,"weather":true}', 'shadow');
    expect(plan?.previous).toBe('off');
    expect(JSON.parse(plan?.flagsJson ?? '')).toEqual({ ownerOnly: false, weather: true, chunkAuthority: 'shadow' });
  });
});

describe('setChunkAuthority reducer', () => {
  it('lets the world owner set the mode, recording who and when', () => {
    const state = world({ role: 'owner', blocked: false }, '{"weather":true,"buildAllowed":false}');
    setChunkAuthority(state.ctx, { mode: 'shadow' });
    expect(state.row()).toEqual({
      spaceId: 0, flagsJson: '{"weather":true,"buildAllowed":false,"chunkAuthority":"shadow"}', updatedBy: 'sender', updatedAt: now,
    });
    expect(chunkAuthorityMode(state.ctx)).toBe('shadow');
    expect(state.ctx.audits).toHaveLength(1);
    const audit = state.ctx.audits[0]!;
    expect(audit).toMatchObject({
      id: 0n, actor: 'sender', action: 'set_chunk_authority', value: 'off->shadow', occurredAt: now,
      occurredAtMicros: now.microsSinceUnixEpoch, targetKey: 'space:0',
    });
    // Studio's audit page parses it as a normal v1 row under the space 0 target.
    const row = adminAuditRow({
      id: '1', actorIdentity: 'sender', action: String(audit['action']), value: String(audit['value']),
      occurredAtMicros: String(audit['occurredAtMicros']), targetKey: String(audit['targetKey']), payload: String(audit['payload']),
    });
    expect(row.target).toEqual({ kind: 'space', spaceId: '0' });
    expect(row.payload.clientMutationId).toBe('chunk-authority-1700000000000000');
    expect(row.payload.changes).toEqual([{ path: '/chunkAuthority', before: { present: true, value: 'off' }, after: { present: true, value: 'shadow' } }]);
    expect(row.payload.inverse).toBeNull();
    setChunkAuthority(state.ctx, { mode: 'on' });
    expect(chunkAuthorityMode(state.ctx)).toBe('on');
    setChunkAuthority(state.ctx, { mode: 'off' });
    expect(chunkAuthorityMode(state.ctx)).toBe('off');
    expect(state.ctx.audits).toHaveLength(3);
  });

  it('inserts the space 0 row when none exists and is idempotent', () => {
    const state = world({ role: 'owner', blocked: false });
    setChunkAuthority(state.ctx, { mode: 'off' });
    expect(state.insert).not.toHaveBeenCalled();
    setChunkAuthority(state.ctx, { mode: 'on' });
    setChunkAuthority(state.ctx, { mode: 'on' });
    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.row()?.flagsJson).toBe('{"chunkAuthority":"on"}');
    expect(state.ctx.audits).toHaveLength(1);
  });

  it.each([
    ['admin', { role: 'admin', blocked: false }],
    ['moderator', { role: 'moderator', blocked: false }],
    ['player', { role: 'friend', blocked: false }],
    ['missing membership', null],
    ['blocked owner', { role: 'owner', blocked: true }],
    ['revoked owner', { role: 'owner', blocked: false, revokedAt: 'then' }],
  ] as const)('rejects %s without writing', (_label, member) => {
    const state = world(member, '{"chunkAuthority":"off"}');
    expect(() => setChunkAuthority(state.ctx, { mode: 'on' })).toThrow(SenderError);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.ctx.audits).toEqual([]);
  });

  it('rejects an admin with owner_required', () => {
    const state = world({ role: 'admin', blocked: false });
    expect(() => setChunkAuthority(state.ctx, { mode: 'on' })).toThrow('owner_required');
  });

  it('rejects an unauthenticated owner session', () => {
    const state = world({ role: 'owner', blocked: false });
    state.ctx.senderAuth = { jwt: null as unknown as typeof jwt };
    expect(() => setChunkAuthority(state.ctx, { mode: 'on' })).toThrow('authentication_required');
  });

  it.each(['', 'ON', 'active', 'true'])('rejects invalid mode %j without writing', (mode) => {
    const state = world({ role: 'owner', blocked: false }, '{"chunkAuthority":"shadow"}');
    expect(() => setChunkAuthority(state.ctx, { mode })).toThrow('chunk_authority_mode_invalid');
    expect(state.update).not.toHaveBeenCalled();
    expect(chunkAuthorityMode(state.ctx)).toBe('shadow');
  });
});

describe('admin space flag writes keep the owner chunkAuthority switch', () => {
  it('preserves the current owner-only value and strips it from snapshots', () => {
    expect(withoutOwnerOnlySpaceFlags({ weather: true, chunkAuthority: 'on' })).toEqual({ weather: true });
    expect(preserveOwnerOnlySpaceFlags({ weather: false, chunkAuthority: 'off' }, { weather: true, chunkAuthority: 'on' }))
      .toEqual({ weather: false, chunkAuthority: 'on' });
    expect(preserveOwnerOnlySpaceFlags({ weather: false, chunkAuthority: 'on' }, { weather: true })).toEqual({ weather: false });
  });

  it('an admin undo executed after an owner switch leaves the switch in place', () => {
    const parsedReason = parseAdminReason('Undo space flags ticket 77');
    if (!parsedReason.ok) throw new Error('invalid reason');
    const before: AdminWorldState = {
      spaces: [{ spaceId: '0', sizeTiles: 64, flags: { ownerOnly: false, weather: true, chunkAuthority: 'off' } }],
      portals: [], players: [], rowReferences: [], custody: [], contentReferences: [],
    };
    const mutation = {
      operation: 'set_space_flags', spaceId: '0', patch: { weather: false }, dryRun: true,
      reason: parsedReason.value, clientMutationId: 'chunk-authority-undo-1',
    } as AdminWorldRepairMutation;
    const plan = planAdminWorldMutation(before, {
      mutation, expectedWorldVersion: adminWorldVersion(before), previewFingerprint: null,
      report: null, reportFingerprint: null, nowMicros: 1n,
    });
    const inverse = (plan.audit.inverse?.args['actions'] as readonly { kind: string; spaceId: string; flags: Record<string, unknown> }[])[0]!;
    expect(inverse.flags).toEqual({ ownerOnly: false, weather: true });

    // The owner switches to `on` after the admin change; the admin then undoes.
    const state = world({ role: 'owner', blocked: false }, JSON.stringify({ ownerOnly: false, weather: false, chunkAuthority: 'off' }));
    setChunkAuthority(state.ctx, { mode: 'on' });
    const spaceAdminFlags = compile('spaceAdminFlags', {});
    const writeAdminWorldRepairAction = compile<(ctx: unknown, action: unknown) => void>('writeAdminWorldRepairAction', {
      adminWorldSpaceId: Number, spaceAdminFlags, preserveOwnerOnlySpaceFlags, SenderError,
    });
    // Even a snapshot that still carries an old chunkAuthority value is ignored.
    for (const flags of [inverse.flags, { ...inverse.flags, chunkAuthority: 'off' }]) {
      writeAdminWorldRepairAction(state.ctx, { kind: 'set_space_flags', spaceId: '0', flags });
      expect(JSON.parse(state.row()?.flagsJson ?? '')).toEqual({ ownerOnly: false, weather: true, chunkAuthority: 'on' });
      expect(chunkAuthorityMode(state.ctx)).toBe('on');
    }
  });
});

describe('the admin world view keeps showing Topside defaults after a first-time owner switch', () => {
  const topsideDefaults: AdminJsonObject = { ownerOnly: false, weather: true };
  const reason = (() => {
    const parsed = parseAdminReason('Disable building ticket 91');
    if (!parsed.ok) throw new Error('invalid reason');
    return parsed.value;
  })();
  /** Mirrors loadAdminWorldState: parsed row (or none) plus authored defaults. */
  function adminTopside(row: { flagsJson: string } | null): AdminWorldState {
    const stored = row === null ? undefined : JSON.parse(row.flagsJson) as AdminJsonObject;
    return {
      spaces: [{ spaceId: '0', sizeTiles: 64, flags: adminVisibleSpaceFlags(stored, topsideDefaults) }],
      portals: [], players: [], rowReferences: [], custody: [], contentReferences: [],
    };
  }

  it('loadAdminWorldState resolves every space through the owner-key-hiding view', () => {
    const body = declarationCode('loadAdminWorldState');
    expect(body.match(/adminVisibleSpaceFlags\(flagsBySpace\.get\(/gu)).toHaveLength(2);
    expect(body).not.toMatch(/flagsBySpace\.get\([^)]*\)\)\s*\?\?/u);
  });

  it('shows the same flags and world version as before the switch, and admin patches still start from the defaults', () => {
    const state = world({ role: 'owner', blocked: false });
    const before = adminTopside(state.row());
    setChunkAuthority(state.ctx, { mode: 'on' });
    expect(state.row()?.flagsJson).toBe('{"chunkAuthority":"on"}');
    const after = adminTopside(state.row());
    expect(after.spaces[0]?.flags).toEqual(topsideDefaults);
    expect(adminWorldVersion(after)).toBe(adminWorldVersion(before));

    const plan = planAdminWorldMutation(after, {
      mutation: { operation: 'set_space_flags', spaceId: '0', patch: { buildAllowed: false }, dryRun: true,
        reason, clientMutationId: 'chunk-authority-defaults-1' } as AdminWorldRepairMutation,
      expectedWorldVersion: adminWorldVersion(after), previewFingerprint: null,
      report: null, reportFingerprint: null, nowMicros: 1n,
    });
    expect(plan.after.spaces[0]?.flags).toEqual({ ...topsideDefaults, buildAllowed: false });
    const writeAdminWorldRepairAction = compile<(ctx: unknown, action: unknown) => void>('writeAdminWorldRepairAction', {
      adminWorldSpaceId: Number, spaceAdminFlags: compile('spaceAdminFlags', {}), preserveOwnerOnlySpaceFlags, SenderError,
    });
    for (const action of plan.actions) writeAdminWorldRepairAction(state.ctx, action);
    expect(JSON.parse(state.row()?.flagsJson ?? '')).toEqual({ ...topsideDefaults, buildAllowed: false, chunkAuthority: 'on' });
    expect(adminTopside(state.row()).spaces[0]?.flags).toEqual({ ...topsideDefaults, buildAllowed: false });
  });

  it('leaves rows that already hold admin flags exactly as stored', () => {
    expect(adminVisibleSpaceFlags(undefined, topsideDefaults)).toEqual(topsideDefaults);
    expect(adminVisibleSpaceFlags({ buildAllowed: false }, topsideDefaults)).toEqual({ buildAllowed: false });
    expect(adminVisibleSpaceFlags({ weather: false, chunkAuthority: 'shadow' }, topsideDefaults)).toEqual({ weather: false });
    expect(adminVisibleSpaceFlags({}, topsideDefaults)).toEqual({});
  });
});

describe('the admin world view parses stored flags tolerantly', () => {
  const defaults = { ownerOnly: false, weather: true };
  it('never hands a null, array, scalar or malformed row to the admin view', () => {
    const bySpace = adminSpaceFlagsBySpace([
      { spaceId: 0, flagsJson: 'null' }, { spaceId: 1, flagsJson: '[true]' }, { spaceId: 2, flagsJson: '7' },
      { spaceId: 3, flagsJson: '{bad' }, { spaceId: 4, flagsJson: '{"weather":false,"chunkAuthority":"on"}' },
      { spaceId: 5, flagsJson: '{"chunkAuthority":"on"}' },
    ]);
    for (const id of ['0', '1', '2', '3']) {
      expect(bySpace.get(id)).toEqual({});
      expect(() => adminVisibleSpaceFlags(bySpace.get(id), defaults)).not.toThrow();
    }
    expect(adminVisibleSpaceFlags(bySpace.get('4'), defaults)).toEqual({ weather: false });
    expect(adminVisibleSpaceFlags(bySpace.get('5'), defaults)).toEqual(defaults);
    expect(adminVisibleSpaceFlags(null as unknown as undefined, defaults)).toEqual(defaults);
  });

  it('loadAdminWorldState uses the tolerant parser, not a bare JSON.parse', () => {
    const body = declarationCode('loadAdminWorldState');
    expect(body).toContain('adminSpaceFlagsBySpace(take(ctx.db.space_admin_flag.iter()))');
    expect(body).not.toContain('JSON.parse(row.flagsJson)');
  });
});

describe('chunkAuthority audit payload', () => {
  it('is a valid v1 audit payload targeting space 0', () => {
    const plan = planChunkAuthorityFlags(undefined, 'on')!;
    const parsed = parseAdminAuditPayload(chunkAuthorityAuditPayload(plan, 42n));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.target).toEqual({ kind: 'space', spaceId: '0' });
    expect(parsed.value.changes).toEqual([{ path: '/chunkAuthority', before: { present: true, value: 'off' }, after: { present: true, value: 'on' } }]);
    expect(CHUNK_AUTHORITY_AUDIT_TARGET_KEY).toBe('space:0');
  });
});
