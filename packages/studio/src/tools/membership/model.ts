import { diffAdminValues, type AdminChangePreview } from '@orchard/sim';
import { normalizeAdminReason } from '../../admin/api.js';
import type { StudioRole } from '../../shell/access.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const MEMBERSHIP_TOOL_REGISTRATION = Object.freeze({
  id: 'membership', label: 'Membership', mode: 'operate', icon: 'editor.membership',
  routes: ['/operate/membership'], docks: ['live_outliner', 'inspector', 'audit_tail'],
  commands: [{ id: 'membership.find', label: 'Find member', keywords: ['approve', 'role', 'grant', 'block'] }],
} satisfies StudioToolDefinition);

export interface MembershipAdminRow {
  readonly identity: string;
  readonly displayName: string;
  readonly role: 'owner' | 'admin' | 'moderator' | 'friend';
  readonly grants: readonly ('content_editor' | 'support')[];
  readonly blocked: boolean;
  readonly revoked: boolean;
  readonly lastActiveOwner: boolean;
  readonly version: string;
}

export type MembershipMutationDraft =
  | { readonly operation: 'approve'; readonly role: MembershipAdminRow['role'] }
  | { readonly operation: 'set_role'; readonly role: MembershipAdminRow['role'] }
  | { readonly operation: 'revoke' }
  | { readonly operation: 'set_blocked'; readonly blocked: boolean }
  | { readonly operation: 'grant_content_editor' | 'revoke_content_editor' | 'grant_support' | 'revoke_support' };

export interface MembershipPreview {
  readonly token: string;
  readonly targetIdentity: string;
  readonly baseVersion: string;
  readonly mutation: MembershipMutationDraft;
  readonly preview: AdminChangePreview;
  readonly warnings: readonly string[];
}

export interface MembershipCommitResult {
  readonly row: MembershipAdminRow;
  readonly auditId: string;
  readonly inverse: MembershipMutationDraft | null;
}

export interface MembershipApi {
  list(query: string): Promise<readonly MembershipAdminRow[]>;
  preview(targetIdentity: string, mutation: MembershipMutationDraft, reason: string, clientMutationId: string, expectedVersion: string): Promise<MembershipPreview>;
  commit(preview: MembershipPreview, reason: string): Promise<MembershipCommitResult>;
}

export interface MembershipManagerSnapshot {
  readonly rows: readonly MembershipAdminRow[];
  readonly selectedIdentity: string | null;
  readonly reason: string;
  readonly pending: MembershipPreview | null;
  readonly lastAuditId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export class MembershipManagerModel {
  #rows: readonly MembershipAdminRow[] = Object.freeze([]);
  #selectedIdentity: string | null = null;
  #reason = '';
  #pending: MembershipPreview | null = null;
  #lastAuditId: string | null = null;
  #loading = false;
  #error: string | null = null;

  constructor(private readonly api: MembershipApi, private readonly role: StudioRole | null, private readonly createMutationId: () => string = () => crypto.randomUUID()) {}

  snapshot(): MembershipManagerSnapshot { return Object.freeze({ rows: this.#rows, selectedIdentity: this.#selectedIdentity, reason: this.#reason, pending: this.#pending, lastAuditId: this.#lastAuditId, loading: this.#loading, error: this.#error }); }
  canWrite(): boolean { return this.role === 'owner'; }
  setReason(value: string): void { this.#reason = value; this.#pending = null; }
  select(identity: string): void { this.#selectedIdentity = identity; this.#pending = null; }

  async search(query: string): Promise<void> {
    this.#loading = true; this.#error = null;
    try { this.#rows = await this.api.list(query); }
    catch (error: unknown) { this.#error = error instanceof Error ? error.message : String(error); throw error; }
    finally { this.#loading = false; }
  }

  async preview(mutation: MembershipMutationDraft): Promise<MembershipPreview> {
    if (!this.canWrite()) throw new Error('membership_owner_required');
    const identity = this.#selectedIdentity;
    const row = this.#rows.find((candidate) => candidate.identity === identity);
    if (identity === null || row === undefined) throw new Error('membership_target_required');
    if (row.lastActiveOwner && (mutation.operation === 'revoke' || mutation.operation === 'set_blocked'
      || (mutation.operation === 'set_role' && mutation.role !== 'owner'))) throw new Error('admin_last_owner_protected');
    const reason = normalizeAdminReason(this.#reason);
    this.#pending = await this.api.preview(identity, mutation, reason, this.createMutationId(), row.version);
    return this.#pending;
  }

  async commit(): Promise<MembershipCommitResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    const result = await this.api.commit(this.#pending, normalizeAdminReason(this.#reason));
    this.#rows = Object.freeze(this.#rows.map((row) => row.identity === result.row.identity ? result.row : row));
    this.#lastAuditId = result.auditId; this.#pending = null; return result;
  }
}

interface StagedMembership { readonly preview: MembershipPreview; readonly reason: string }

export class MockMembershipApi implements MembershipApi {
  readonly #rows = new Map<string, MembershipAdminRow>([
    ['identity-ada', Object.freeze({ identity: 'identity-ada', displayName: 'Ada Orchard', role: 'owner', grants: Object.freeze([]), blocked: false, revoked: false, lastActiveOwner: true, version: 'membership-v1' } satisfies MembershipAdminRow)],
    ['identity-bea', Object.freeze({ identity: 'identity-bea', displayName: 'Bea Bramble', role: 'friend', grants: Object.freeze(['support'] as const), blocked: false, revoked: false, lastActiveOwner: false, version: 'membership-v2' } satisfies MembershipAdminRow)],
  ]);
  readonly #staged = new Map<string, StagedMembership>();
  #version = 2;

  async list(query: string): Promise<readonly MembershipAdminRow[]> {
    const term = query.trim().toLowerCase();
    return Object.freeze([...this.#rows.values()].filter((row) => !term || row.identity.toLowerCase().includes(term) || row.displayName.toLowerCase().includes(term)));
  }

  async preview(targetIdentity: string, mutation: MembershipMutationDraft, reason: string, clientMutationId: string, expectedVersion: string): Promise<MembershipPreview> {
    normalizeAdminReason(reason);
    const row = this.#rows.get(targetIdentity); if (row === undefined || row.version !== expectedVersion) throw new Error('admin_world_revision_conflict');
    const after = this.apply(row, mutation, row.version);
    const json = (value: MembershipAdminRow) => ({
      identity: value.identity, displayName: value.displayName, role: value.role,
      grants: value.grants, blocked: value.blocked, revoked: value.revoked,
      lastActiveOwner: value.lastActiveOwner, version: value.version,
    });
    const preview = Object.freeze({ token: clientMutationId, targetIdentity, baseVersion: expectedVersion, mutation, preview: diffAdminValues(json(row), json(after)), warnings: Object.freeze(row.lastActiveOwner ? ['Last-owner protection is active.'] : []) });
    this.#staged.set(clientMutationId, { preview, reason }); return preview;
  }

  async commit(preview: MembershipPreview, reason: string): Promise<MembershipCommitResult> {
    normalizeAdminReason(reason);
    const staged = this.#staged.get(preview.token); const row = this.#rows.get(preview.targetIdentity);
    if (staged === undefined || JSON.stringify(staged.preview) !== JSON.stringify(preview) || staged.reason !== reason) throw new Error('admin_preview_required');
    if (row === undefined || row.version !== preview.baseVersion) throw new Error('admin_preview_stale');
    const inverse = this.inverse(row, preview.mutation);
    const next = this.apply(row, preview.mutation, `membership-v${++this.#version}`); this.#rows.set(row.identity, next); this.#staged.delete(preview.token);
    return Object.freeze({ row: next, auditId: `membership-audit-${this.#version}`, inverse });
  }

  private apply(row: MembershipAdminRow, mutation: MembershipMutationDraft, version: string): MembershipAdminRow {
    const grants = new Set(row.grants);
    if (mutation.operation === 'grant_content_editor') grants.add('content_editor');
    if (mutation.operation === 'revoke_content_editor') grants.delete('content_editor');
    if (mutation.operation === 'grant_support') grants.add('support');
    if (mutation.operation === 'revoke_support') grants.delete('support');
    return Object.freeze({
      ...row, version,
      ...(mutation.operation === 'approve' || mutation.operation === 'set_role' ? { role: mutation.role, revoked: false } : {}),
      ...(mutation.operation === 'revoke' ? { revoked: true } : {}),
      ...(mutation.operation === 'set_blocked' ? { blocked: mutation.blocked } : {}),
      grants: Object.freeze([...grants].sort()),
    });
  }

  private inverse(row: MembershipAdminRow, mutation: MembershipMutationDraft): MembershipMutationDraft | null {
    switch (mutation.operation) {
      case 'set_role': case 'approve': return { operation: 'set_role', role: row.role };
      case 'set_blocked': return { operation: 'set_blocked', blocked: row.blocked };
      case 'grant_content_editor': return { operation: 'revoke_content_editor' };
      case 'revoke_content_editor': return { operation: 'grant_content_editor' };
      case 'grant_support': return { operation: 'revoke_support' };
      case 'revoke_support': return { operation: 'grant_support' };
      case 'revoke': return null;
    }
  }
}
