import {
  ATTRIBUTE_IDS,
  HUNGER_MAX_CENTI,
  adminPreviewHasChanges,
  diffAdminValues,
  isSkillTrack,
  type AdminJsonObject,
  type SkillTrack,
} from '@orchard/sim';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminErrorCode,
  type AdminMutationPreview,
  type AdminPlayerMutation,
} from './contracts.js';
import {
  requireSupportMutationWithinCaps,
  type SupportCaps,
  type SupportMutationContext,
} from './support-caps.js';

export type AdminProgressionOperation =
  | 'set_wallet'
  | 'set_stats'
  | 'set_vitals'
  | 'grant_skill_points'
  | 'reset_skill_tree'
  | 'set_quest_state'
  | 'reset_quests';

export type AdminProgressionMutation = AdminPlayerMutation & {
  readonly operation: AdminProgressionOperation;
};

export interface AdminAttributeState {
  readonly str: number;
  readonly dex: number;
  readonly con: number;
  readonly int: number;
  readonly wis: number;
  readonly cha: number;
}

export interface AdminVitalState {
  readonly healthCenti: number;
  readonly manaCenti: number;
  readonly vigourCenti: number;
  readonly hungerCenti: number;
}

export interface AdminSkillTrackState {
  readonly track: SkillTrack;
  readonly experience: bigint;
  readonly spentPoints: number;
  readonly bonusPoints: number;
  readonly respecCount: number;
}

export interface AdminSkillNodeState {
  readonly track: SkillTrack;
  readonly nodeId: string;
  readonly rank: number;
}

export type AdminQuestStateValue = 'active' | 'complete' | 'turned_in';

export interface AdminQuestState {
  readonly questId: string;
  readonly state: AdminQuestStateValue;
  readonly acceptedTick: bigint;
  readonly completedTick: bigint | null;
  readonly turnedInTick: bigint | null;
  readonly pinned: boolean;
}

export interface AdminQuestBaselineState {
  readonly questId: string;
  readonly objectiveId: string;
  readonly value: bigint;
}

export interface AdminQuestWorldItemState {
  readonly questId: string;
  readonly objectiveId: string;
  readonly surfaceId: bigint;
  readonly slot: number;
  readonly itemKind: string;
}

export interface AdminProgressionState {
  readonly walletBronze: bigint;
  readonly stats: AdminAttributeState;
  readonly vitals: AdminVitalState;
  readonly skillTracks: readonly AdminSkillTrackState[];
  readonly skillNodes: readonly AdminSkillNodeState[];
  readonly quests: readonly AdminQuestState[];
  readonly questBaselines: readonly AdminQuestBaselineState[];
  readonly questWorldItems: readonly AdminQuestWorldItemState[];
}

export interface AdminProgressionPlanRequest {
  readonly mutation: AdminProgressionMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
  readonly authorityTick: bigint;
  readonly questObjectiveIds: ReadonlyMap<string, readonly string[]>;
  readonly attributeBounds: {
    readonly minimum: number;
    readonly maximum: number;
  };
}

export interface AdminProgressionPlan {
  readonly before: AdminProgressionState;
  readonly after: AdminProgressionState;
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string;
}

export class AdminProgressionError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminProgressionError';
  }
}

function fail(code: AdminErrorCode): never {
  throw new AdminProgressionError(code);
}

function cloneState(state: AdminProgressionState): AdminProgressionState {
  return Object.freeze({
    walletBronze: state.walletBronze,
    stats: Object.freeze({ ...state.stats }),
    vitals: Object.freeze({ ...state.vitals }),
    skillTracks: Object.freeze(state.skillTracks.map((row) => Object.freeze({ ...row }))),
    skillNodes: Object.freeze(state.skillNodes.map((row) => Object.freeze({ ...row }))),
    quests: Object.freeze(state.quests.map((row) => Object.freeze({ ...row }))),
    questBaselines: Object.freeze(state.questBaselines.map((row) => Object.freeze({ ...row }))),
    questWorldItems: Object.freeze(state.questWorldItems.map((row) => Object.freeze({ ...row }))),
  });
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of stableJson(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function bigintJson(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

export function adminProgressionDocument(state: AdminProgressionState): AdminJsonObject {
  return {
    walletBronze: state.walletBronze.toString(),
    stats: { ...state.stats },
    vitals: { ...state.vitals },
    skillTracks: state.skillTracks.map((row) => ({
      ...row, experience: row.experience.toString(),
    })),
    skillNodes: state.skillNodes.map((row) => ({ ...row })),
    quests: state.quests.map((row) => ({
      ...row,
      acceptedTick: row.acceptedTick.toString(),
      completedTick: bigintJson(row.completedTick),
      turnedInTick: bigintJson(row.turnedInTick),
    })),
    questBaselines: state.questBaselines.map((row) => ({ ...row, value: row.value.toString() })),
    questWorldItems: state.questWorldItems.map((row) => ({ ...row, surfaceId: row.surfaceId.toString() })),
  };
}

export function adminProgressionVersion(state: AdminProgressionState): string {
  return `progression:${fingerprint(adminProgressionDocument(state))}`;
}

function integerPatch(
  patch: AdminJsonObject,
  allowed: ReadonlySet<string>,
  maximum: (key: string) => number,
): Readonly<Record<string, number>> {
  const entries = Object.entries(patch);
  if (entries.length === 0) fail('admin_invalid_patch');
  const result: Record<string, number> = {};
  for (const [key, value] of entries) {
    if (!allowed.has(key) || typeof value !== 'number' || !Number.isSafeInteger(value)
      || value < 0 || value > maximum(key)) fail('admin_invalid_patch');
    result[key] = value;
  }
  return Object.freeze(result);
}

const ATTRIBUTE_SET = new Set<string>(ATTRIBUTE_IDS);
const VITAL_SET = new Set(['healthCenti', 'manaCenti', 'vigourCenti', 'hungerCenti']);
const U32_MAX = 4_294_967_295;
const U64_MAX = (1n << 64n) - 1n;

function applyMutation(
  state: AdminProgressionState,
  mutation: AdminProgressionMutation,
  authorityTick: bigint,
  questObjectiveIds: ReadonlyMap<string, readonly string[]>,
  attributeBounds: AdminProgressionPlanRequest['attributeBounds'],
): AdminProgressionState {
  switch (mutation.operation) {
    case 'set_wallet': {
      let delta: bigint;
      try { delta = BigInt(mutation.deltaBronze); } catch { return fail('admin_payload_invalid'); }
      const walletBronze = state.walletBronze + delta;
      if (walletBronze < 0n || walletBronze > U64_MAX) fail('admin_payload_invalid');
      return { ...state, walletBronze };
    }
    case 'set_stats': {
      const patch = integerPatch(mutation.patch, ATTRIBUTE_SET, () => attributeBounds.maximum);
      if (Object.values(patch).some((value) => value < attributeBounds.minimum)) {
        fail('admin_invalid_patch');
      }
      return { ...state, stats: { ...state.stats, ...patch } };
    }
    case 'set_vitals': {
      const patch = integerPatch(
        mutation.patch,
        VITAL_SET,
        (key) => key === 'hungerCenti' ? HUNGER_MAX_CENTI : U32_MAX,
      );
      return { ...state, vitals: { ...state.vitals, ...patch } };
    }
    case 'grant_skill_points': {
      if (!isSkillTrack(mutation.track) || !Number.isSafeInteger(mutation.points)
        || mutation.points <= 0) fail('admin_payload_invalid');
      const existing = state.skillTracks.find(({ track }) => track === mutation.track);
      if (existing === undefined || existing.bonusPoints + mutation.points > 65_535) {
        fail('admin_payload_invalid');
      }
      return { ...state, skillTracks: state.skillTracks.map((row) => row.track === mutation.track
        ? { ...row, bonusPoints: row.bonusPoints + mutation.points }
        : row) };
    }
    case 'reset_skill_tree': {
      if (mutation.track !== undefined && !isSkillTrack(mutation.track)) fail('admin_payload_invalid');
      const affected = mutation.track === undefined
        ? state.skillNodes.length
        : state.skillNodes.filter(({ track }) => track === mutation.track).length;
      if (affected === 0) fail('admin_no_changes');
      return {
        ...state,
        skillNodes: state.skillNodes.filter(({ track }) => mutation.track !== undefined && track !== mutation.track),
        skillTracks: state.skillTracks.map((row) => mutation.track === undefined || row.track === mutation.track
          ? { ...row, spentPoints: 0 }
          : row),
      };
    }
    case 'set_quest_state': {
      const requested = mutation.state;
      if (requested !== 'available' && requested !== 'active'
        && requested !== 'complete' && requested !== 'turned_in') fail('admin_payload_invalid');
      const objectives = questObjectiveIds.get(mutation.questId);
      if (objectives === undefined) fail('admin_payload_invalid');
      const previous = state.quests.find(({ questId }) => questId === mutation.questId);
      const keepQuest = <T extends { readonly questId: string }>(row: T) => row.questId !== mutation.questId;
      if (requested === 'available') return {
        ...state,
        quests: state.quests.filter(keepQuest),
        questBaselines: state.questBaselines.filter(keepQuest),
        questWorldItems: state.questWorldItems.filter(keepQuest),
      };
      const quest: AdminQuestState = {
        questId: mutation.questId,
        state: requested,
        acceptedTick: previous?.acceptedTick ?? authorityTick,
        completedTick: requested === 'active' ? null : previous?.completedTick ?? authorityTick,
        turnedInTick: requested === 'turned_in' ? previous?.turnedInTick ?? authorityTick : null,
        pinned: previous?.pinned ?? true,
      };
      return {
        ...state,
        quests: [...state.quests.filter(keepQuest), quest].sort((left, right) => left.questId.localeCompare(right.questId)),
        questBaselines: previous === undefined
          ? [...state.questBaselines, ...objectives.map((objectiveId) => ({
              questId: mutation.questId, objectiveId, value: 0n,
            }))]
          : state.questBaselines,
        questWorldItems: requested === 'active'
          ? state.questWorldItems
          : state.questWorldItems.filter(keepQuest),
      };
    }
    case 'reset_quests':
      if (state.quests.length === 0 && state.questBaselines.length === 0
        && state.questWorldItems.length === 0) fail('admin_no_changes');
      return { ...state, quests: [], questBaselines: [], questWorldItems: [] };
  }
}

function mutationFingerprint(
  mutation: AdminProgressionMutation,
  baseVersion: string,
  after: AdminProgressionState,
): string {
  return `preview:${fingerprint({
    mutation: { ...mutation, dryRun: false, reason: String(mutation.reason).trim() },
    baseVersion,
    after: adminProgressionDocument(after),
  })}`;
}

function inverseFor(
  _mutation: AdminProgressionMutation,
  before: AdminProgressionState,
): AdminAuditPayloadV1['inverse'] {
  return { operation: 'undo', args: { progression: adminProgressionDocument(before) } };
}

function changedVitalMagnitude(before: AdminVitalState, patch: AdminJsonObject): number {
  return Math.max(0, ...Object.entries(patch).map(([key, value]) => (
    typeof value === 'number' && Number.isSafeInteger(value)
      ? Math.abs(value - (before[key as keyof AdminVitalState] ?? 0))
      : Number.POSITIVE_INFINITY
  )));
}

export function requireAdminProgressionAuthority(
  role: AdminEffectiveRole,
  mutation: AdminProgressionMutation,
  state: AdminProgressionState,
  caps: SupportCaps,
  context: SupportMutationContext,
): void {
  if (!adminRoleCanMutate(role, mutation.operation)) fail('admin_role_forbidden');
  if (role !== 'support') return;
  const capMutation: AdminProgressionMutation = mutation.operation === 'set_stats'
    ? { ...mutation, patch: Object.fromEntries(Object.entries(mutation.patch).map(([key, value]) => [
        key,
        typeof value === 'number' ? value - (state.stats[key as keyof AdminAttributeState] ?? 0) : value,
      ])) }
    : mutation;
  try { requireSupportMutationWithinCaps(capMutation, caps, context); }
  catch (error) {
    if (error instanceof Error && (error.message === 'admin_support_cap_exceeded'
      || error.message === 'admin_rate_limited')) fail(error.message);
    throw error;
  }
  if (mutation.operation === 'set_vitals'
    && changedVitalMagnitude(state.vitals, mutation.patch) > caps.statDeltaPerMutation) {
    fail('admin_support_cap_exceeded');
  }
}

export function planAdminProgressionMutation(
  inputState: AdminProgressionState,
  request: AdminProgressionPlanRequest,
): AdminProgressionPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId)
    || request.nowMicros < 0n || request.authorityTick < 0n) fail('admin_payload_invalid');
  const before = cloneState(inputState);
  const baseVersion = adminProgressionVersion(before);
  if (request.expectedBaseVersion !== baseVersion) fail('admin_preview_stale');
  const after = cloneState(applyMutation(
    before, request.mutation, request.authorityTick, request.questObjectiveIds,
    request.attributeBounds,
  ));
  const diff = diffAdminValues(adminProgressionDocument(before), adminProgressionDocument(after));
  if (!adminPreviewHasChanges(diff)) fail('admin_no_changes');
  const previewFingerprint = mutationFingerprint(request.mutation, baseVersion, after);
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) {
    fail('admin_preview_required');
  }
  const notice = `An administrator applied ${request.mutation.operation.replaceAll('_', ' ')}.`;
  const preview: AdminMutationPreview = Object.freeze({
    operation: request.mutation.operation,
    target: { kind: 'player' as const, identity: request.mutation.targetIdentity },
    baseVersion,
    preview: diff,
    warnings: Object.freeze(['The affected online player will receive a notice.']),
    expiresAtMicros: (request.nowMicros + 60_000_000n).toString(),
  });
  const audit: AdminAuditPayloadV1 = Object.freeze({
    schemaVersion: 1,
    clientMutationId: request.mutation.clientMutationId,
    target: { kind: 'player' as const, identity: request.mutation.targetIdentity },
    reason: reason.value,
    changes: diff.changes,
    inverse: inverseFor(request.mutation, before),
    notice,
  });
  return Object.freeze({
    before,
    after,
    baseVersion,
    committedVersion: adminProgressionVersion(after),
    previewFingerprint,
    preview,
    audit,
    notice,
  });
}

export function supportMutationCountInRollingHour(
  occurredAtMicros: Iterable<bigint>,
  nowMicros: bigint,
): number {
  if (nowMicros < 0n) fail('admin_payload_invalid');
  const floor = nowMicros > 3_600_000_000n ? nowMicros - 3_600_000_000n : 0n;
  let count = 0;
  for (const occurredAt of occurredAtMicros) {
    if (occurredAt >= floor && occurredAt <= nowMicros) count += 1;
  }
  return count;
}
