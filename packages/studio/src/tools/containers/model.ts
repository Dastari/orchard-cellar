import type { AdminContainerSnapshot, AdminEntityMutation, AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioRole } from '../../shell/access.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const CONTAINERS_TOOL_REGISTRATION = Object.freeze({
  id: 'containers', label: 'Container Inspector', mode: 'operate', icon: 'editor.container',
  routes: ['/operate/containers'], docks: ['live_outliner', 'inspector', 'audit_tail'],
  commands: [{ id: 'containers.inspect', label: 'Inspect container custody', keywords: ['slots', 'processor'] }],
} satisfies StudioToolDefinition);

type ContainerDraft =
  | { readonly operation: 'set_container_slot'; readonly slot: number; readonly stack: { readonly itemKind: string; readonly quantity: number; readonly durability?: number } | null }
  | { readonly operation: 'repair_entity' }
  | { readonly operation: 'replace_entity'; readonly definitionId: string }
  | { readonly operation: 'despawn_entity'; readonly spillContents: boolean };

export class ContainerManagerModel {
  #container: AdminContainerSnapshot | null = null;
  #reason = '';
  #pending: { readonly mutation: AdminEntityMutation; readonly preview: AdminMutationPreview;
    readonly fingerprint: string; readonly baseVersion: string } | null = null;
  #lastResult: AdminObjectMutationResult | null = null;

  constructor(readonly api: AdminObjectsApi, readonly role: StudioRole | null,
    private readonly createMutationId: () => string = () => crypto.randomUUID()) {}

  snapshot() { return Object.freeze({ container: this.#container, reason: this.#reason,
    pending: this.#pending, lastResult: this.#lastResult }); }
  setReason(value: string): void { this.#reason = value; this.#pending = null; }

  async inspect(entityId: string): Promise<void> {
    this.#container = await this.api.container(entityId.trim()); this.#pending = null;
  }

  async preview(draft: ContainerDraft): Promise<AdminMutationPreview> {
    if (this.role !== 'owner' && this.role !== 'admin') throw new Error('admin_role_forbidden');
    if (this.#container === null) throw new Error('admin_entity_not_found');
    const mutation = { ...draft, entityId: this.#container.entityId, reason: normalizeAdminReason(this.#reason),
      clientMutationId: this.createMutationId(), dryRun: true } as AdminEntityMutation;
    const result = await this.api.mutate(mutation, this.#container.version, null);
    this.#pending = { mutation, preview: result.preview, fingerprint: result.previewFingerprint,
      baseVersion: result.preview.baseVersion };
    return result.preview;
  }

  async commit(): Promise<AdminObjectMutationResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    const pending = this.#pending;
    const result = await this.api.mutate({ ...pending.mutation, dryRun: false } as AdminEntityMutation,
      pending.baseVersion, pending.fingerprint);
    const entityId = 'entityId' in pending.mutation ? pending.mutation.entityId : null;
    if (entityId === null) throw new Error('admin_entity_not_found');
    this.#container = pending.mutation.operation === 'despawn_entity'
      ? null
      : await this.api.container(entityId);
    this.#pending = null; this.#lastResult = result; return result;
  }
}
