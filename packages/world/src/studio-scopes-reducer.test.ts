import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isStudioScope, resolveStudioScopes } from '../../sim/src/studio-scopes.js';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
function between(start: string, end: string): string {
  const from = source.indexOf(start); return source.slice(from, source.indexOf(end, from + start.length));
}
class TestIdentity {
  constructor(readonly value: string) {}
  toHexString(): string { return this.value; }
  isEqual(other: TestIdentity): boolean { return other.value === this.value; }
}
const actor = new TestIdentity('owner'); const target = new TestIdentity('editor');
const now = { microsSinceUnixEpoch: 1000n };
type Row = { id: string; identity: TestIdentity; scope: string; revokedAt: typeof now | undefined; grantedAt: typeof now };
function harness() {
  const grants = new Map<string, Row>();
  const receipts = new Map<string, { id: string }>();
  const audits: unknown[] = [];
  const members = new Map([
    ['owner', { role: 'owner', blocked: false, revokedAt: undefined as unknown }],
    ['editor', { role: 'friend', blocked: false, revokedAt: undefined as unknown }],
  ]);
  const ctx = { sender: actor, senderAuth: { jwt: {} }, timestamp: now, db: {
    membership: { identity: { find: (id: TestIdentity) => members.get(id.value) ?? null } },
    content_editor_grant: { identity: { find: () => null } }, support_grant: { identity: { find: () => null } },
    studio_scope_grant: { by_identity: { filter: (id: TestIdentity) => [...grants.values()].filter(row => row.identity.isEqual(id)) },
      id: { find: (id: string) => grants.get(id) ?? null, update: (row: Row) => grants.set(row.id, row) },
      insert: (row: Row) => grants.set(row.id, row) },
    studio_scope_change: { id: { find: (id: string) => receipts.get(id) ?? null }, insert: (row: { id: string }) => receipts.set(row.id, row) },
    world_admin_audit: { insert: (row: unknown) => { audits.push(row); return { id: BigInt(audits.length) }; } },
  } };
  const program = [
    between('function scopesFor(', '\nfunction requireStudioScope'),
    between('function requireStudioScope(', '\n/** Explicit domain'),
    between('function studioScopeVersion(', '\nexport const adminStudioMembers'),
    between('function validateScopeDelegation(', '\nexport const previewStudioScope'),
    between('export const setStudioScope =', '\nexport const submitStudioScript').replace('export const', 'const'),
    'return { reduce: setStudioScope, version: studioScopeVersion };',
  ].join('\n');
  const js = ts.transpileModule(program, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const result = new Function('spacetimedb', 't', 'SenderError', 'resolveStudioScopes', 'isStudioScope', 'requireAuthorizedSender', 'validatedAdminMutationReason', js)(
    { reducer: (_args: unknown, callback: unknown) => callback },
    { identity: () => ({}), string: () => ({}), bool: () => ({}) }, Error, resolveStudioScopes, isStudioScope,
    (_jwt: unknown, member: { blocked: boolean; revokedAt: unknown } | null) => {
      if (member === null || member.blocked || member.revokedAt !== undefined) throw new Error('inactive');
    }, (reason: string) => { if (reason.trim().length < 8) throw new Error('invalid_reason'); return reason.trim(); },
  ) as { reduce(ctx: unknown, input: unknown): void; version(ctx: unknown, id: TestIdentity): string };
  const input = () => ({ identity: target, scope: 'objects', granted: true, reason: 'Allow object authoring', clientMutationId: 'grant-1', expectedVersion: result.version(ctx, target) });
  return { ctx, grants, receipts, audits, members, input, ...result };
}
describe('executed scope grant reducer', () => {
  it('commits a grant plus real audit receipt and makes identical retries a no-op', () => {
    const h = harness(); const input = h.input(); h.reduce(h.ctx, input); h.reduce(h.ctx, input);
    expect(h.grants.get('editor:objects')?.revokedAt).toBeUndefined();
    expect(h.audits).toHaveLength(1); expect(h.receipts).toHaveLength(1);
    expect(() => h.reduce(h.ctx, { ...input, granted: false })).toThrow('studio_scope_mutation_conflict');
  });
  it('rejects stale grants before any mutation and records revocation as a deny override', () => {
    const h = harness(); const first = h.input(); h.reduce(h.ctx, first);
    expect(() => h.reduce(h.ctx, { ...first, clientMutationId: 'grant-2', granted: false })).toThrow('admin_preview_stale');
    h.reduce(h.ctx, { ...h.input(), clientMutationId: 'grant-2', granted: false });
    expect(h.grants.get('editor:objects')?.revokedAt).toEqual(now); expect(h.audits).toHaveLength(2);
  });
  it('rejects blocked targets, owner overrides, unknown scopes and unauthorized callers without audits', () => {
    const h = harness();
    expect(() => h.reduce(h.ctx, { ...h.input(), identity: actor })).toThrow('studio_owner_scopes_protected');
    expect(() => h.reduce(h.ctx, { ...h.input(), scope: 'unknown' })).toThrow('studio_scope_invalid');
    h.members.set('editor', { role: 'friend', blocked: true, revokedAt: undefined });
    expect(() => h.reduce(h.ctx, h.input())).toThrow('admin_target_not_found');
    expect(() => h.reduce({ ...h.ctx, sender: target }, h.input())).toThrow('inactive');
    expect(h.audits).toHaveLength(0);
  });
});
