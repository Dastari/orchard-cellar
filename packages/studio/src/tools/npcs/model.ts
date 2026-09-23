import type { AdminEntityMutation, AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminEntityRecord, AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioRole } from '../../shell/access.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const NPCS_TOOL_REGISTRATION = Object.freeze({
  id: 'npcs', label: 'NPC Manager', mode: 'operate', icon: 'editor.npc',
  routes: ['/operate/npcs'], docks: ['live_outliner', 'inspector', 'audit_tail'],
  commands: [{ id: 'npcs.relocate', label: 'Relocate NPC', keywords: ['home', 'wildlife', 'authored'] }],
} satisfies StudioToolDefinition);

export class NpcManagerModel {
  #rows: readonly AdminEntityRecord[] = Object.freeze([]);
  #nextCursor: string | null = null;
  #worldVersion = '';
  #selected: AdminEntityRecord | null = null;
  #reason = '';
  #filter = '';
  #spaceId = '0';
  #pending: { readonly mutation: AdminEntityMutation; readonly preview: AdminMutationPreview;
    readonly fingerprint: string; readonly baseVersion: string } | null = null;
  #lastResult: AdminObjectMutationResult | null = null;

  constructor(readonly api: AdminObjectsApi, readonly role: StudioRole | null,
    private readonly createMutationId: () => string = () => crypto.randomUUID()) {}

  snapshot() { return Object.freeze({ rows: this.#rows, nextCursor: this.#nextCursor,
    worldVersion: this.#worldVersion, selected: this.#selected, reason: this.#reason,
    filter: this.#filter, spaceId: this.#spaceId, pending: this.#pending, lastResult: this.#lastResult }); }
  setReason(value: string): void { this.#reason = value; this.#pending = null; }
  setFilter(value: string, spaceId = this.#spaceId): void {
    this.#filter = value.trim(); this.#spaceId = spaceId.trim(); this.#pending = null;
  }
  select(entityId: string): void { this.#selected = this.#rows.find((row) => row.entityId === entityId) ?? null; this.#pending = null; }

  async load(reset = true): Promise<void> {
    const page = await this.api.listEntities({ kinds: ['npc'], spaceId: this.#spaceId, x0: 0, y0: 0,
      x1: 127, y1: 127, text: this.#filter, cursor: reset ? null : this.#nextCursor, limit: 50 });
    this.#rows = Object.freeze(reset ? [...page.rows] : [...this.#rows, ...page.rows]);
    this.#nextCursor = page.nextCursor; this.#worldVersion = page.worldVersion;
    if (this.#selected !== null) this.#selected = this.#rows.find(({ entityId }) => entityId === this.#selected?.entityId) ?? null;
  }

  async previewRelocate(spaceId: string, tileX: number, tileY: number): Promise<AdminMutationPreview> {
    if (this.role !== 'owner' && this.role !== 'admin') throw new Error('admin_role_forbidden');
    if (this.#selected === null) throw new Error('admin_entity_not_found');
    const mutation: AdminEntityMutation = { operation: 'relocate_npc', npcId: this.#selected.entityId,
      spaceId, tileX, tileY, reason: normalizeAdminReason(this.#reason),
      clientMutationId: this.createMutationId(), dryRun: true };
    const result = await this.api.mutate(mutation, this.#selected.version, null);
    this.#pending = { mutation, preview: result.preview, fingerprint: result.previewFingerprint,
      baseVersion: result.preview.baseVersion };
    return result.preview;
  }

  async commit(): Promise<AdminObjectMutationResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    const pending = this.#pending;
    const result = await this.api.mutate({ ...pending.mutation, dryRun: false }, pending.baseVersion, pending.fingerprint);
    this.#pending = null; this.#lastResult = result; await this.load(true); return result;
  }
}
