import type { StudioRole } from '../../shell/access.js';
import {
  AdminApiError,
  normalizeAdminReason,
  type AdminApi,
  type AdminConnectionRow,
  type AdminMutationPreview,
  type AdminPlayerInventory,
  type AdminPlayerMutation,
  type AdminPlayerMutationResult,
  type AdminPlayerSnapshot,
  type AdminPlayerSummary,
} from '../../admin/api.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const PLAYER_MANAGER_TABS = [
  'position', 'inventory', 'wallet_stats', 'vitals_effects', 'skills', 'quests',
  'statistics', 'membership_connections', 'notices',
] as const;
export type PlayerManagerTab = typeof PLAYER_MANAGER_TABS[number];

export const PLAYER_MANAGER_OPERATIONS = [
  'set_wallet', 'set_stats', 'set_vitals', 'grant_skill_points', 'reset_skill_tree',
  'set_quest_state', 'reset_quests', 'give_items', 'remove_items', 'clear_cursor',
  'drain_overflow', 'set_slot', 'set_spawn', 'respawn', 'unstick', 'teleport_player',
  'set_display_name', 'kick', 'notify',
] as const satisfies readonly AdminPlayerMutation['operation'][];

export const PLAYERS_TOOL_REGISTRATION = Object.freeze({
  id: 'players', label: 'Player Manager', mode: 'operate', icon: 'editor.players',
  routes: ['/operate/players'], docks: ['live_outliner', 'inspector', 'audit_tail'],
  commands: [
    { id: 'players.find', label: 'Find player', shortcut: 'Ctrl+Shift+F', keywords: ['identity', 'online'] },
    { id: 'players.preview', label: 'Preview player remedy', keywords: ['dry run', 'diff'] },
  ],
} satisfies StudioToolDefinition);

type StripEnvelope<T> = T extends AdminPlayerMutation
  ? Omit<T, 'clientMutationId' | 'dryRun' | 'reason' | 'targetIdentity'>
  : never;
export type PlayerMutationDraft = StripEnvelope<AdminPlayerMutation>;

export interface PlayerOperationState {
  readonly enabled: boolean;
  readonly reason: string | null;
}

const SUPPORT_OPERATIONS: ReadonlySet<AdminPlayerMutation['operation']> = new Set([
  'set_wallet', 'set_stats', 'set_vitals', 'grant_skill_points',
  'set_quest_state', 'reset_quests', 'give_items', 'remove_items', 'clear_cursor', 'drain_overflow',
  'set_spawn', 'respawn', 'unstick', 'teleport_player', 'set_display_name', 'notify',
]);
const MODERATOR_OPERATIONS: ReadonlySet<AdminPlayerMutation['operation']> = new Set(['kick', 'notify']);

export function playerOperationState(
  role: StudioRole | null,
  operation: AdminPlayerMutation['operation'],
): PlayerOperationState {
  if (role === 'owner' || role === 'admin') return { enabled: true, reason: null };
  if (role === 'support') return SUPPORT_OPERATIONS.has(operation)
    ? { enabled: true, reason: null }
    : { enabled: false, reason: 'Support can apply player remedies but cannot edit economy or progression.' };
  if (role === 'moderator') return MODERATOR_OPERATIONS.has(operation)
    ? { enabled: true, reason: null }
    : { enabled: false, reason: 'Moderators can send notices and kick active sessions only.' };
  return { enabled: false, reason: role === 'content_editor'
    ? 'Content editors have read-only Operate access.'
    : 'Connect with an authorized live role to operate on players.' };
}

export interface PlayerManagerSnapshot {
  readonly apiSource: AdminApi['source'];
  readonly query: string;
  readonly results: readonly AdminPlayerSummary[];
  readonly nextCursor: string | null;
  readonly selectedIdentity: string | null;
  readonly player: AdminPlayerSnapshot | null;
  readonly inventory: AdminPlayerInventory | null;
  readonly connections: readonly AdminConnectionRow[];
  readonly connectionCursor: string | null;
  readonly tab: PlayerManagerTab;
  readonly reason: string;
  readonly reasonError: string | null;
  readonly loading: boolean;
  readonly pendingPreview: AdminMutationPreview | null;
  readonly committing: boolean;
  readonly conflict: string | null;
  readonly lastResult: AdminPlayerMutationResult | null;
  readonly notice: string | null;
  readonly undoAuditId: string | null;
}

export interface PlayerManagerOptions {
  readonly api: AdminApi;
  readonly role: StudioRole | null;
  readonly createMutationId?: () => string;
}

export class PlayerManagerModel {
  readonly #api: AdminApi;
  readonly #role: StudioRole | null;
  readonly #createMutationId: () => string;
  #query = '';
  #results: readonly AdminPlayerSummary[] = Object.freeze([]);
  #nextCursor: string | null = null;
  #selectedIdentity: string | null = null;
  #player: AdminPlayerSnapshot | null = null;
  #inventory: AdminPlayerInventory | null = null;
  #connections: readonly AdminConnectionRow[] = Object.freeze([]);
  #connectionCursor: string | null = null;
  #tab: PlayerManagerTab = 'position';
  #reason = '';
  #reasonError: string | null = null;
  #loading = false;
  #pending: { readonly mutation: AdminPlayerMutation; readonly preview: AdminMutationPreview } | null = null;
  #committing = false;
  #conflict: string | null = null;
  #lastResult: AdminPlayerMutationResult | null = null;
  #notice: string | null = null;
  #undoAuditId: string | null = null;
  #undoBaseVersion: string | null = null;
  #requestEpoch = 0;

  constructor(options: PlayerManagerOptions) {
    this.#api = options.api;
    this.#role = options.role;
    this.#createMutationId = options.createMutationId ?? (() => crypto.randomUUID());
  }

  snapshot(): PlayerManagerSnapshot {
    return Object.freeze({
      apiSource: this.#api.source, query: this.#query, results: this.#results,
      nextCursor: this.#nextCursor, selectedIdentity: this.#selectedIdentity,
      player: this.#player, inventory: this.#inventory, connections: this.#connections,
      connectionCursor: this.#connectionCursor, tab: this.#tab, reason: this.#reason,
      reasonError: this.#reasonError, loading: this.#loading,
      pendingPreview: this.#pending?.preview ?? null, committing: this.#committing,
      conflict: this.#conflict, lastResult: this.#lastResult, notice: this.#notice,
      undoAuditId: this.#undoAuditId,
    });
  }

  operationState(operation: AdminPlayerMutation['operation']): PlayerOperationState {
    const access = playerOperationState(this.#role, operation);
    if (!access.enabled) return access;
    if (this.#selectedIdentity === null || this.#player === null) return { enabled: false, reason: 'Select a player first.' };
    if (this.#loading || this.#committing) return { enabled: false, reason: 'Wait for the current request to finish.' };
    return access;
  }

  setReason(reason: string): void {
    this.#reason = reason;
    try { normalizeAdminReason(reason); this.#reasonError = null; }
    catch { this.#reasonError = 'Reason must be 8–500 characters after trimming.'; }
    this.clearPreview();
  }

  selectTab(tab: PlayerManagerTab): void { this.#tab = tab; }

  async search(query: string): Promise<void> {
    const epoch = ++this.#requestEpoch;
    this.#query = query.trim(); this.#loading = true; this.#conflict = null;
    try {
      const page = await this.#api.findPlayers(this.#query, null);
      if (epoch !== this.#requestEpoch) return;
      this.#results = page.rows; this.#nextCursor = page.nextCursor;
      if (this.#selectedIdentity !== null && !page.rows.some(({ identity }) => identity === this.#selectedIdentity)) this.clearSelection();
    } finally { if (epoch === this.#requestEpoch) this.#loading = false; }
  }

  async loadMore(): Promise<void> {
    if (this.#nextCursor === null || this.#loading) return;
    const epoch = ++this.#requestEpoch; this.#loading = true;
    try {
      const page = await this.#api.findPlayers(this.#query, this.#nextCursor);
      if (epoch !== this.#requestEpoch) return;
      const known = new Set(this.#results.map(({ identity }) => identity));
      this.#results = Object.freeze([...this.#results, ...page.rows.filter(({ identity }) => !known.has(identity))]);
      this.#nextCursor = page.nextCursor;
    } finally { if (epoch === this.#requestEpoch) this.#loading = false; }
  }

  async select(identity: string): Promise<void> {
    if (identity !== this.#selectedIdentity) {
      this.#undoAuditId = null;
      this.#undoBaseVersion = null;
    }
    const epoch = ++this.#requestEpoch; this.#selectedIdentity = identity;
    this.#loading = true; this.#connections = Object.freeze([]); this.#connectionCursor = null;
    this.clearPreview();
    try {
      const [player, inventory, connections] = await Promise.all([
        this.#api.playerSnapshot(identity), this.#api.playerInventory(identity), this.#api.connections(identity, null),
      ]);
      if (epoch !== this.#requestEpoch) return;
      this.#player = player; this.#inventory = inventory;
      this.#connections = connections.rows; this.#connectionCursor = connections.nextCursor;
    } finally { if (epoch === this.#requestEpoch) this.#loading = false; }
  }

  async loadMoreConnections(): Promise<void> {
    if (this.#selectedIdentity === null || this.#connectionCursor === null || this.#loading) return;
    const page = await this.#api.connections(this.#selectedIdentity, this.#connectionCursor);
    this.#connections = Object.freeze([...this.#connections, ...page.rows]);
    this.#connectionCursor = page.nextCursor;
  }

  async preview(draft: PlayerMutationDraft): Promise<AdminMutationPreview> {
    const operation = draft.operation;
    const access = this.operationState(operation);
    if (!access.enabled) throw new Error(access.reason ?? 'operation_disabled');
    const identity = this.#selectedIdentity;
    const player = this.#player;
    if (identity === null || player === null) throw new Error('player_not_selected');
    const reason = normalizeAdminReason(this.#reason);
    this.#reasonError = null; this.#conflict = null; this.#notice = null;
    const mutation = {
      ...draft, targetIdentity: identity, clientMutationId: this.#createMutationId(), dryRun: true, reason,
    } as AdminPlayerMutation;
    try {
      const result = await this.#api.mutatePlayer(mutation, player.version);
      this.#pending = { mutation, preview: result.preview };
      this.#lastResult = result;
      return result.preview;
    } catch (error: unknown) {
      this.captureConflict(error);
      throw error;
    }
  }

  async commit(): Promise<AdminPlayerMutationResult> {
    const pending = this.#pending;
    if (pending === null) throw new Error('preview_required');
    this.#committing = true; this.#conflict = null;
    try {
      const result = await this.#api.mutatePlayer({ ...pending.mutation, dryRun: false } as AdminPlayerMutation, pending.preview.baseVersion);
      this.#lastResult = result; this.#notice = result.notice; this.#undoAuditId = result.undoAuditId;
      this.#undoBaseVersion = result.undoAuditId === null ? null : result.version;
      this.#pending = null;
      await this.refreshSelected();
      return result;
    } catch (error: unknown) {
      this.captureConflict(error);
      throw error;
    } finally { this.#committing = false; }
  }

  async undoLast(): Promise<AdminPlayerMutationResult> {
    const auditId = this.#undoAuditId;
    const undoBaseVersion = this.#undoBaseVersion;
    const identity = this.#selectedIdentity;
    const player = this.#player;
    if (auditId === null || undoBaseVersion === null || identity === null || player === null) throw new Error('undo_unavailable');
    const reason = normalizeAdminReason(this.#reason);
    this.#committing = true; this.#conflict = null;
    try {
      const result = await this.#api.undoPlayer({
        auditId, targetIdentity: identity, reason,
        clientMutationId: this.#createMutationId(), expectedBaseVersion: undoBaseVersion,
      });
      this.#lastResult = result; this.#notice = result.notice; this.#undoAuditId = null; this.#undoBaseVersion = null;
      await this.refreshSelected();
      return result;
    } catch (error: unknown) { this.captureConflict(error); throw error; }
    finally { this.#committing = false; }
  }

  clearPreview(): void { this.#pending = null; this.#lastResult = null; this.#conflict = null; }

  private clearSelection(): void {
    this.#selectedIdentity = null; this.#player = null; this.#inventory = null;
    this.#undoAuditId = null; this.#undoBaseVersion = null;
    this.#connections = Object.freeze([]); this.#connectionCursor = null; this.clearPreview();
  }

  private async refreshSelected(): Promise<void> {
    const identity = this.#selectedIdentity;
    if (identity === null) return;
    const [player, inventory] = await Promise.all([
      this.#api.playerSnapshot(identity), this.#api.playerInventory(identity),
    ]);
    this.#player = player; this.#inventory = inventory;
  }

  private captureConflict(error: unknown): void {
    if (error instanceof AdminApiError && (error.code === 'admin_preview_stale' || error.code === 'admin_world_revision_conflict')) {
      this.#conflict = 'The player changed after preview. Refresh the snapshot and preview again.';
    }
  }
}
