import type { AdminChangePreview } from '@orchard/sim';
import {
  normalizeAdminReason,
  type AdminApi,
  type AdminPlayerMutation,
  type AdminPlayerMutationResult,
  type AdminPlayerSnapshot,
} from '../../admin/api.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const PLAYBOOKS_TOOL_REGISTRATION = Object.freeze({
  id: 'playbooks', label: 'Playbooks', mode: 'operate', icon: 'editor.playbooks',
  routes: ['/operate/playbooks'], docks: ['live_outliner', 'inspector', 'audit_tail'],
  commands: [{ id: 'playbooks.start', label: 'Start guided remedy', keywords: ['stuck', 'lost items', 'missing chest'] }],
} satisfies StudioToolDefinition);

export const REMEDY_PLAYBOOK_IDS = ['player_stuck', 'lost_items_after_crash', 'chest_disappeared'] as const;
export type RemedyPlaybookId = typeof REMEDY_PLAYBOOK_IDS[number];
export type RemedyStepKind = 'inspect' | 'preview' | 'commit' | 'verify';
export type RemedyStepStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface RemedyStepSnapshot {
  readonly kind: RemedyStepKind;
  readonly label: string;
  readonly status: RemedyStepStatus;
  readonly detail: string | null;
}

export interface PlayerStuckInput { readonly targetIdentity: string }
export interface LostItemsInput {
  readonly targetIdentity: string;
  readonly stacks: readonly { readonly itemKind: string; readonly quantity: number; readonly durability?: number }[];
}
export interface ChestDisappearedInput {
  readonly targetIdentity: string;
  readonly entityId: string;
}
export type RemedyInput =
  | ({ readonly playbookId: 'player_stuck' } & PlayerStuckInput)
  | ({ readonly playbookId: 'lost_items_after_crash' } & LostItemsInput)
  | ({ readonly playbookId: 'chest_disappeared' } & ChestDisappearedInput);

export interface MissingContainerInspection {
  readonly entityId: string;
  readonly targetIdentity: string;
  readonly recoverable: boolean;
  readonly auditId: string | null;
  readonly summary: string;
  readonly version: string;
}

export interface MissingContainerPreview {
  readonly token: string;
  readonly baseVersion: string;
  readonly preview: AdminChangePreview;
  readonly warnings: readonly string[];
}

export interface MissingContainerResult {
  readonly committed: boolean;
  readonly version: string;
  readonly auditId: string;
  readonly notice: string;
}

/** W4 supplies this narrow adapter. Keeping it outside AdminApi lets the first two
 * player remedies ship and remain testable before object reducers are registered. */
export interface MissingContainerRemedyApi {
  inspectMissingContainer(input: ChestDisappearedInput): Promise<MissingContainerInspection>;
  previewRestoreMissingContainer(input: ChestDisappearedInput & { readonly reason: string; readonly clientMutationId: string }): Promise<MissingContainerPreview>;
  commitRestoreMissingContainer(input: ChestDisappearedInput & { readonly reason: string; readonly clientMutationId: string; readonly token: string; readonly expectedBaseVersion: string }): Promise<MissingContainerResult>;
  verifyRestoredContainer(entityId: string, expectedVersion: string): Promise<boolean>;
}

/** Deterministic offline custody fixture used by Studio's explicit sandbox. */
export class MockMissingContainerRemedyApi implements MissingContainerRemedyApi {
  #restoredVersion: string | null = null;
  #sequence = 0;

  async inspectMissingContainer(input: ChestDisappearedInput): Promise<MissingContainerInspection> {
    return Object.freeze({
      ...input, recoverable: true, auditId: `mock-despawn-${input.entityId}`,
      summary: 'Audit custody contains the chest definition, position, and exact slot payload.',
      version: 'mock-world-v1',
    });
  }

  async previewRestoreMissingContainer(input: ChestDisappearedInput & { readonly reason: string; readonly clientMutationId: string }): Promise<MissingContainerPreview> {
    normalizeAdminReason(input.reason);
    return Object.freeze({
      token: input.clientMutationId, baseVersion: 'mock-world-v1',
      preview: { changes: [{
        path: `/entities/${input.entityId.replaceAll('~', '~0').replaceAll('/', '~1')}`,
        before: { present: false }, after: { present: true, value: { restoredFromAudit: true, slots: 2 } },
      }], truncated: false },
      warnings: Object.freeze(['The affected player will receive a restoration notice.']),
    });
  }

  async commitRestoreMissingContainer(input: ChestDisappearedInput & { readonly reason: string; readonly clientMutationId: string; readonly token: string; readonly expectedBaseVersion: string }): Promise<MissingContainerResult> {
    normalizeAdminReason(input.reason);
    if (input.clientMutationId !== input.token || input.expectedBaseVersion !== 'mock-world-v1') throw new Error('container_preview_stale');
    this.#restoredVersion = `mock-world-v${++this.#sequence + 1}`;
    return Object.freeze({ committed: true, version: this.#restoredVersion, auditId: `mock-restore-${this.#sequence}`, notice: 'Your missing chest and its contents were restored.' });
  }

  async verifyRestoredContainer(_entityId: string, expectedVersion: string): Promise<boolean> {
    return this.#restoredVersion === expectedVersion;
  }
}

export interface RemedyPlaybookSnapshot {
  readonly input: RemedyInput | null;
  readonly title: string | null;
  readonly reason: string;
  readonly steps: readonly RemedyStepSnapshot[];
  readonly activeStep: number;
  readonly complete: boolean;
  readonly error: string | null;
  readonly auditId: string | null;
  readonly notice: string | null;
}

const TITLES: Readonly<Record<RemedyPlaybookId, string>> = {
  player_stuck: 'Player stuck',
  lost_items_after_crash: 'Lost items after crash',
  chest_disappeared: 'Chest disappeared',
};

const STEP_LABELS: Readonly<Record<RemedyPlaybookId, readonly string[]>> = {
  player_stuck: ['Inspect player position', 'Preview nearest walkable tile', 'Commit audited unstick', 'Verify settled position and notice'],
  lost_items_after_crash: ['Inspect inventory and connection history', 'Preview capacity-safe refund', 'Commit audited refund', 'Verify inventory version and notice'],
  chest_disappeared: ['Inspect audit custody and missing entity', 'Preview exact container restoration', 'Commit audited restoration', 'Verify entity, contents, and notice'],
};

function stepsFor(id: RemedyPlaybookId): readonly RemedyStepSnapshot[] {
  return Object.freeze((['inspect', 'preview', 'commit', 'verify'] as const).map((kind, index) => Object.freeze({
    kind, label: STEP_LABELS[id][index]!, status: 'pending' as const, detail: null,
  })));
}

function mutationId(): string {
  return typeof crypto === 'undefined' ? `playbook-${Date.now()}` : crypto.randomUUID();
}

export class RemedyPlaybookModel {
  readonly #api: AdminApi;
  readonly #containers: MissingContainerRemedyApi | null;
  readonly #createMutationId: () => string;
  #input: RemedyInput | null = null;
  #reason = '';
  #steps: readonly RemedyStepSnapshot[] = Object.freeze([]);
  #activeStep = 0;
  #running = false;
  #error: string | null = null;
  #playerBefore: AdminPlayerSnapshot | null = null;
  #playerMutation: AdminPlayerMutation | null = null;
  #playerResult: AdminPlayerMutationResult | null = null;
  #containerInspection: MissingContainerInspection | null = null;
  #containerPreview: MissingContainerPreview | null = null;
  #containerResult: MissingContainerResult | null = null;

  constructor(api: AdminApi, containers: MissingContainerRemedyApi | null = null, createMutationId = mutationId) {
    this.#api = api; this.#containers = containers; this.#createMutationId = createMutationId;
  }

  start(input: RemedyInput, reason: string): void {
    normalizeAdminReason(reason);
    if (input.targetIdentity.trim().length === 0) throw new Error('player_required');
    if (input.playbookId === 'lost_items_after_crash' && (input.stacks.length === 0
      || input.stacks.some((stack) => stack.itemKind.trim().length === 0 || !Number.isSafeInteger(stack.quantity) || stack.quantity <= 0))) {
      throw new Error('valid_refund_stacks_required');
    }
    if (input.playbookId === 'chest_disappeared' && input.entityId.trim().length === 0) throw new Error('entity_required');
    this.#input = Object.freeze(structuredClone(input)); this.#reason = normalizeAdminReason(reason);
    this.#steps = stepsFor(input.playbookId); this.#activeStep = 0; this.#running = false; this.#error = null;
    this.#playerBefore = null; this.#playerMutation = null; this.#playerResult = null;
    this.#containerInspection = null; this.#containerPreview = null; this.#containerResult = null;
  }

  snapshot(): RemedyPlaybookSnapshot {
    return Object.freeze({
      input: this.#input, title: this.#input === null ? null : TITLES[this.#input.playbookId], reason: this.#reason,
      steps: this.#steps, activeStep: this.#activeStep, complete: this.#steps.length > 0 && this.#activeStep === this.#steps.length,
      error: this.#error, auditId: this.#playerResult?.audit?.id ?? this.#containerResult?.auditId ?? null,
      notice: this.#playerResult?.notice ?? this.#containerResult?.notice ?? null,
    });
  }

  async advance(): Promise<void> {
    if (this.#input === null) throw new Error('playbook_not_started');
    if (this.#running) throw new Error('playbook_step_running');
    if (this.#activeStep >= this.#steps.length) return;
    this.#running = true; this.#error = null; this.updateStep('running', null);
    try {
      const detail = this.#input.playbookId === 'chest_disappeared'
        ? await this.runContainerStep(this.#activeStep, this.#input)
        : await this.runPlayerStep(this.#activeStep, this.#input);
      this.updateStep('complete', detail); this.#activeStep += 1;
    } catch (error: unknown) {
      this.#error = error instanceof Error ? error.message : String(error);
      this.updateStep('failed', this.#error); throw error;
    } finally { this.#running = false; }
  }

  private async runPlayerStep(index: number, input: Exclude<RemedyInput, { playbookId: 'chest_disappeared' }>): Promise<string> {
    if (index === 0) {
      const [snapshot, inventory, connections] = await Promise.all([
        this.#api.playerSnapshot(input.targetIdentity), this.#api.playerInventory(input.targetIdentity),
        this.#api.connections(input.targetIdentity, null),
      ]);
      this.#playerBefore = snapshot;
      return input.playbookId === 'player_stuck'
        ? `Position ${JSON.stringify(snapshot.position)}; ${connections.rows.length} connection event(s) inspected.`
        : `${inventory.slots.filter(({ stack }) => stack !== null).length} occupied slot(s); ${connections.rows.length} connection event(s) inspected.`;
    }
    const before = this.#playerBefore;
    if (before === null) throw new Error('inspect_required');
    if (index === 1) {
      this.#playerMutation = input.playbookId === 'player_stuck'
        ? { operation: 'unstick', targetIdentity: input.targetIdentity, reason: normalizeAdminReason(this.#reason), clientMutationId: this.#createMutationId(), dryRun: true }
        : { operation: 'give_items', targetIdentity: input.targetIdentity, stacks: input.stacks, reason: normalizeAdminReason(this.#reason), clientMutationId: this.#createMutationId(), dryRun: true };
      this.#playerResult = await this.#api.mutatePlayer(this.#playerMutation, before.version);
      if (this.#playerResult.committed) throw new Error('preview_mutated_world');
      return `${this.#playerResult.preview.preview.changes.length} change(s) previewed.`;
    }
    if (index === 2) {
      if (this.#playerMutation === null || this.#playerResult === null) throw new Error('preview_required');
      this.#playerResult = await this.#api.mutatePlayer({ ...this.#playerMutation, dryRun: false } as AdminPlayerMutation, this.#playerResult.preview.baseVersion);
      if (!this.#playerResult.committed || this.#playerResult.audit === null) throw new Error('commit_missing_audit');
      return `Committed as audit ${this.#playerResult.audit.id}.`;
    }
    if (this.#playerResult === null) throw new Error('commit_required');
    const after = await this.#api.playerSnapshot(input.targetIdentity);
    if (after.version === before.version || this.#playerResult.notice === null) throw new Error('remedy_verification_failed');
    return `Verified version ${after.version}; player notice recorded.`;
  }

  private async runContainerStep(index: number, input: Extract<RemedyInput, { playbookId: 'chest_disappeared' }>): Promise<string> {
    const api = this.#containers;
    if (api === null) throw new Error('container_remedy_unavailable');
    if (index === 0) {
      this.#containerInspection = await api.inspectMissingContainer(input);
      if (!this.#containerInspection.recoverable || this.#containerInspection.auditId === null) throw new Error('container_not_recoverable');
      return this.#containerInspection.summary;
    }
    if (index === 1) {
      this.#containerPreview = await api.previewRestoreMissingContainer({ ...input, reason: this.#reason, clientMutationId: this.#createMutationId() });
      return `${this.#containerPreview.preview.changes.length} restoration change(s) previewed.`;
    }
    if (index === 2) {
      if (this.#containerPreview === null) throw new Error('preview_required');
      this.#containerResult = await api.commitRestoreMissingContainer({
        ...input, reason: this.#reason, clientMutationId: this.#containerPreview.token,
        token: this.#containerPreview.token, expectedBaseVersion: this.#containerPreview.baseVersion,
      });
      if (!this.#containerResult.committed) throw new Error('container_commit_failed');
      return `Restored as audit ${this.#containerResult.auditId}.`;
    }
    if (this.#containerResult === null || !await api.verifyRestoredContainer(input.entityId, this.#containerResult.version)) {
      throw new Error('container_verification_failed');
    }
    return `Verified ${input.entityId} with exact audited contents; player notice recorded.`;
  }

  private updateStep(status: RemedyStepStatus, detail: string | null): void {
    this.#steps = Object.freeze(this.#steps.map((step, index) => index === this.#activeStep
      ? Object.freeze({ ...step, status, detail }) : step));
  }
}
