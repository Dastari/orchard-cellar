import type { AdminEntityMutation, AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type {
  AdminEntityQuery,
  AdminEntityRecord,
  AdminObjectMutationResult,
  AdminObjectsApi,
} from '../../admin/objects-api.js';
import type { StudioRole } from '../../shell/access.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const OBJECTS_TOOL_REGISTRATION = Object.freeze({
  id: 'objects', label: 'Object Manager', mode: 'operate', icon: 'editor.object',
  routes: ['/operate/objects'], docks: ['live_outliner', 'inspector', 'audit_tail'],
  commands: [
    { id: 'objects.spawn', label: 'Spawn object', keywords: ['placeable', 'map', 'tile'] },
    { id: 'objects.repair', label: 'Repair selected objects', keywords: ['bulk', 'processor'] },
  ],
} satisfies StudioToolDefinition);

type StripEnvelope<T> = T extends AdminEntityMutation
  ? Omit<T, 'clientMutationId' | 'dryRun' | 'reason'>
  : never;
export type AdminObjectMutationDraft = StripEnvelope<AdminEntityMutation>;

export interface ObjectManagerSnapshot {
  readonly rows: readonly AdminEntityRecord[];
  readonly nextCursor: string | null;
  readonly worldVersion: string;
  readonly rowsScanned: number;
  readonly selected: ReadonlySet<string>;
  readonly reason: string;
  readonly loading: boolean;
  readonly pending: readonly { readonly mutation: AdminEntityMutation; readonly preview: AdminMutationPreview;
    readonly fingerprint: string; readonly baseVersion: string }[];
  readonly lastResult: AdminObjectMutationResult | null;
}

const DEFAULT_QUERY: AdminEntityQuery = Object.freeze({
  kinds: ['placeable', 'chest'] as const, spaceId: '0', x0: 0, y0: 0, x1: 127, y1: 127,
  text: '', cursor: null, limit: 50,
});

export function objectMutationEnabled(role: StudioRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export class ObjectManagerModel {
  #query: AdminEntityQuery = DEFAULT_QUERY;
  #rows: readonly AdminEntityRecord[] = Object.freeze([]);
  #nextCursor: string | null = null;
  #worldVersion = '';
  #rowsScanned = 0;
  readonly #selected = new Set<string>();
  #reason = '';
  #loading = false;
  #pending: ObjectManagerSnapshot['pending'] = Object.freeze([]);
  #lastResult: AdminObjectMutationResult | null = null;

  constructor(
    readonly api: AdminObjectsApi,
    readonly role: StudioRole | null,
    private readonly createMutationId: () => string = () => crypto.randomUUID(),
  ) {}

  snapshot(): ObjectManagerSnapshot {
    return Object.freeze({ rows: this.#rows, nextCursor: this.#nextCursor,
      worldVersion: this.#worldVersion, rowsScanned: this.#rowsScanned,
      selected: new Set(this.#selected), reason: this.#reason, loading: this.#loading,
      pending: this.#pending, lastResult: this.#lastResult });
  }

  setReason(value: string): void { this.#reason = value; this.#pending = Object.freeze([]); }
  setQuery(query: Partial<Omit<AdminEntityQuery, 'cursor'>>): void {
    this.#query = Object.freeze({ ...this.#query, ...query, cursor: null });
    this.#pending = Object.freeze([]);
  }
  toggle(entityId: string): void {
    if (this.#selected.has(entityId)) this.#selected.delete(entityId); else this.#selected.add(entityId);
    this.#pending = Object.freeze([]);
  }
  clearSelection(): void { this.#selected.clear(); this.#pending = Object.freeze([]); }

  async load(reset = true): Promise<void> {
    this.#loading = true;
    try {
      const page = await this.api.listEntities({ ...this.#query, cursor: reset ? null : this.#nextCursor });
      this.#rows = Object.freeze(reset ? [...page.rows] : [...this.#rows, ...page.rows]);
      this.#nextCursor = page.nextCursor; this.#worldVersion = page.worldVersion;
      this.#rowsScanned += page.rowsScanned;
    } finally { this.#loading = false; }
  }

  async preview(draft: AdminObjectMutationDraft): Promise<AdminMutationPreview> {
    if (!objectMutationEnabled(this.role)) throw new Error('admin_role_forbidden');
    const reason = normalizeAdminReason(this.#reason);
    const mutation = { ...draft, reason, clientMutationId: this.createMutationId(), dryRun: true } as AdminEntityMutation;
    const baseVersion = this.baseVersion(draft);
    const result = await this.api.mutate(mutation, baseVersion, null);
    this.#pending = Object.freeze([{ mutation, preview: result.preview,
      fingerprint: result.previewFingerprint, baseVersion: result.preview.baseVersion }]);
    this.#lastResult = result;
    return result.preview;
  }

  async previewSelected(operation: 'repair_entity' | 'despawn_entity', spillContents = true): Promise<readonly AdminMutationPreview[]> {
    if (!objectMutationEnabled(this.role)) throw new Error('admin_role_forbidden');
    const reason = normalizeAdminReason(this.#reason);
    const pending: Array<ObjectManagerSnapshot['pending'][number]> = [];
    for (const entityId of [...this.#selected].sort()) {
      const row = this.#rows.find((candidate) => candidate.entityId === entityId);
      if (row === undefined) continue;
      const mutation = { operation, entityId, ...(operation === 'despawn_entity' ? { spillContents } : {}),
        reason, clientMutationId: this.createMutationId(), dryRun: true } as AdminEntityMutation;
      const result = await this.api.mutate(mutation, row.version, null);
      pending.push({ mutation, preview: result.preview, fingerprint: result.previewFingerprint,
        baseVersion: result.preview.baseVersion });
    }
    this.#pending = Object.freeze(pending);
    return Object.freeze(pending.map(({ preview }) => preview));
  }

  async commit(): Promise<readonly AdminObjectMutationResult[]> {
    if (this.#pending.length === 0) throw new Error('admin_preview_required');
    const results: AdminObjectMutationResult[] = [];
    for (const pending of this.#pending) {
      results.push(await this.api.mutate({ ...pending.mutation, dryRun: false } as AdminEntityMutation,
        pending.baseVersion, pending.fingerprint));
    }
    this.#lastResult = results[results.length - 1] ?? null;
    this.#pending = Object.freeze([]);
    await this.load(true);
    return Object.freeze(results);
  }

  private baseVersion(draft: AdminObjectMutationDraft): string {
    const id = 'entityId' in draft ? draft.entityId : 'npcId' in draft ? draft.npcId : null;
    if (id === null) return this.#worldVersion;
    const row = this.#rows.find((candidate) => candidate.entityId === id);
    if (row === undefined) throw new Error('admin_entity_not_found');
    return row.version;
  }
}
