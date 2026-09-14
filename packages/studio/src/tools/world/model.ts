import type { AdminWorldValidationReport } from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type {
  AdminWorldApi,
  AdminWorldControlDraft,
  AdminWorldControlMutation,
  AdminWorldControlPreview,
  AdminWorldControlResult,
  AdminWorldControlSnapshot,
} from '../../admin/world-api.js';
import type { StudioRole } from '../../shell/access.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const WORLD_TOOL_REGISTRATION = Object.freeze({
  id: 'world', label: 'World Control', mode: 'operate', icon: 'editor.world',
  routes: ['/operate/world'], docks: ['live_outliner', 'inspector', 'validation', 'audit_tail'],
  commands: [
    { id: 'world.validate', label: 'Validate world', keywords: ['repair', 'orphans', 'portals'] },
    { id: 'world.spaces', label: 'Manage spaces', keywords: ['weather', 'build', 'owner'] },
  ],
} satisfies StudioToolDefinition);

export function worldMutationEnabled(role: StudioRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

interface PendingWorldMutation {
  readonly mutation: AdminWorldControlMutation;
  readonly baseVersion: string;
  readonly reportFingerprint: string | null;
  readonly preview: AdminWorldControlPreview;
}

export class WorldControlModel {
  #world: AdminWorldControlSnapshot | null = null;
  #report: AdminWorldValidationReport | null = null;
  #reason = '';
  #pending: PendingWorldMutation | null = null;
  #selectedIssues = new Set<number>();
  #activeIssue = 0;
  #lastResult: AdminWorldControlResult | null = null;
  #loading = false;

  constructor(readonly api: AdminWorldApi, readonly role: StudioRole | null,
    private readonly createMutationId: () => string = () => crypto.randomUUID()) {}

  snapshot() { return Object.freeze({ world: this.#world, report: this.#report, reason: this.#reason,
    pending: this.#pending, selectedIssues: new Set(this.#selectedIssues), activeIssue: this.#activeIssue,
    lastResult: this.#lastResult, loading: this.#loading, canMutate: worldMutationEnabled(this.role) }); }
  setReason(value: string): void { this.#reason = value; this.#pending = null; }
  navigateIssue(index: number): void {
    const count = this.#report?.issues.length ?? 0;
    this.#activeIssue = count === 0 ? 0 : Math.max(0, Math.min(count - 1, Math.trunc(index)));
  }
  toggleSafeIssue(index: number): void {
    const issue = this.#report?.issues[index];
    if (issue?.repairable !== true) return;
    if (this.#selectedIssues.has(index)) this.#selectedIssues.delete(index); else this.#selectedIssues.add(index);
    this.#pending = null;
  }

  async load(): Promise<void> {
    this.#loading = true;
    try { this.#world = await this.api.snapshot(); }
    finally { this.#loading = false; }
  }

  async validate(): Promise<AdminWorldValidationReport> {
    this.#report = await this.api.validateWorld(); this.#world = await this.api.snapshot();
    this.#selectedIssues = new Set(this.#report.issues.map((issue, index) => issue.repairable ? index : -1).filter((index) => index >= 0));
    this.#activeIssue = 0; this.#pending = null; return this.#report;
  }

  async preview(draft: AdminWorldControlDraft): Promise<AdminWorldControlPreview> {
    if (!worldMutationEnabled(this.role)) throw new Error('admin_role_forbidden');
    if (this.#world === null) throw new Error('admin_world_not_loaded');
    if (draft.operation === 'run_world_repair') {
      const repairable = this.#report?.issues.map((issue, index) => issue.repairable ? index : -1).filter((index) => index >= 0) ?? [];
      if (this.#report === null || repairable.length === 0
        || repairable.some((index) => !this.#selectedIssues.has(index))) throw new Error('admin_safe_selection_incomplete');
    }
    const mutation: AdminWorldControlMutation = { draft, reason: normalizeAdminReason(this.#reason),
      clientMutationId: this.createMutationId(), dryRun: true };
    const reportFingerprint = draft.operation === 'run_world_repair' ? this.#report?.fingerprint ?? null : null;
    const result = await this.api.mutate(mutation, this.#world.worldVersion, null, reportFingerprint);
    this.#pending = { mutation, baseVersion: result.preview.baseVersion, reportFingerprint, preview: result.preview };
    this.#lastResult = result; return result.preview;
  }

  async previewSelectedRepair(): Promise<AdminWorldControlPreview> {
    if (this.#report === null) throw new Error('admin_preview_required');
    return this.preview({ operation: 'run_world_repair', reportId: this.#report.reportId });
  }

  async commit(): Promise<AdminWorldControlResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    const pending = this.#pending;
    const result = await this.api.mutate({ ...pending.mutation, dryRun: false }, pending.baseVersion,
      pending.preview.fingerprint, pending.reportFingerprint);
    this.#world = await this.api.snapshot(); this.#pending = null; this.#lastResult = result; return result;
  }
}
