import {
  adminPreviewHasChanges,
  diffAdminValues,
  type AdminJsonObject,
} from '@orchard/sim';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminErrorCode,
  type AdminMutationEnvelope,
  type AdminMutationPreview,
} from './contracts.js';

export type AdminPlaytestMutation = AdminMutationEnvelope & (
  | { readonly operation: 'playtest_spawn'; readonly definitionId: string; readonly spaceId: string;
    readonly tileX: number; readonly tileY: number }
  | { readonly operation: 'playtest_apply_effect'; readonly definitionId: string; readonly targetIdentity: string }
  | { readonly operation: 'playtest_grant_upgrade'; readonly definitionId: string; readonly targetIdentity: string;
    readonly rank: number }
);

export interface AdminPlaytestCreatureDefinition {
  readonly definitionId: string;
  readonly species: string;
  readonly variants: number;
  readonly habitat: string;
  readonly maximumHealth: number;
}

export type AdminPlaytestState =
  | { readonly kind: 'spawn'; readonly authorityTick: bigint; readonly entityId: bigint;
    readonly definition: AdminPlaytestCreatureDefinition; readonly existingEntity: AdminJsonObject | null }
  | { readonly kind: 'effect'; readonly authorityTick: bigint; readonly targetExists: boolean;
    readonly definitionId: string; readonly effectKind: string; readonly maximumStacks: number;
    readonly durationTicks: number; readonly existingEffect: AdminPlaytestEffect | null }
  | { readonly kind: 'upgrade'; readonly authorityTick: bigint; readonly targetExists: boolean;
    readonly definitionId: string; readonly upgradeKind: string; readonly maximumRank: number;
    readonly homesteadSpaceId: string | null; readonly existingUpgrade: AdminPlaytestUpgrade | null };

export interface AdminPlaytestEffect {
  readonly id: string | null;
  readonly stacks: number;
  readonly appliedTick: string;
  readonly expiresTick: string;
}

export interface AdminPlaytestUpgrade {
  readonly rank: number;
  readonly purchasedBy: string;
  readonly purchasedAtTick: string;
}

export type AdminPlaytestAction =
  | { readonly kind: 'spawn_creature'; readonly entityId: string; readonly definitionId: string;
    readonly species: string; readonly variant: number; readonly habitat: string; readonly maximumHealth: number;
    readonly spaceId: string; readonly tileX: number; readonly tileY: number; readonly authorityTick: string }
  | { readonly kind: 'upsert_effect'; readonly targetIdentity: string; readonly definitionId: string;
    readonly effectKind: string; readonly previousId: string | null; readonly stacks: number;
    readonly appliedTick: string; readonly expiresTick: string }
  | { readonly kind: 'upsert_upgrade'; readonly targetIdentity: string; readonly definitionId: string;
    readonly upgradeKind: string; readonly homesteadSpaceId: string; readonly rank: number;
    readonly authorityTick: string };

export interface AdminPlaytestPlanRequest {
  readonly mutation: AdminPlaytestMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
}

export interface AdminPlaytestPlan {
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly action: AdminPlaytestAction;
  readonly notice: string | null;
}

export class AdminPlaytestError extends Error {
  constructor(readonly code: AdminErrorCode) { super(code); this.name = 'AdminPlaytestError'; }
}

function fail(code: AdminErrorCode): never { throw new AdminPlaytestError(code); }

function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined)
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

function stateDocument(state: AdminPlaytestState): AdminJsonObject {
  if (state.kind === 'spawn') return {
    kind: state.kind, authorityTick: state.authorityTick.toString(), entityId: state.entityId.toString(),
    definition: { ...state.definition }, existingEntity: state.existingEntity,
  };
  if (state.kind === 'effect') return {
    kind: state.kind, authorityTick: state.authorityTick.toString(), targetExists: state.targetExists,
    definitionId: state.definitionId, effectKind: state.effectKind, maximumStacks: state.maximumStacks,
    durationTicks: state.durationTicks, existingEffect: state.existingEffect === null ? null : { ...state.existingEffect },
  };
  return {
    kind: state.kind, authorityTick: state.authorityTick.toString(), targetExists: state.targetExists,
    definitionId: state.definitionId, upgradeKind: state.upgradeKind, maximumRank: state.maximumRank,
    homesteadSpaceId: state.homesteadSpaceId,
    existingUpgrade: state.existingUpgrade === null ? null : { ...state.existingUpgrade },
  };
}

export function adminPlaytestVersion(state: AdminPlaytestState): string {
  return `playtest:${fingerprint(stateDocument(state))}`;
}

function afterAndAction(state: AdminPlaytestState, mutation: AdminPlaytestMutation): {
  readonly after: AdminJsonObject; readonly action: AdminPlaytestAction; readonly notice: string | null;
} {
  if (mutation.operation === 'playtest_spawn') {
    if (state.kind !== 'spawn' || state.definition.definitionId !== mutation.definitionId
      || state.existingEntity !== null || state.definition.variants < 1 || mutation.spaceId.length === 0
      || !Number.isSafeInteger(mutation.tileX) || !Number.isSafeInteger(mutation.tileY)) fail('admin_payload_invalid');
    const variant = Number(state.entityId % BigInt(state.definition.variants));
    const action: AdminPlaytestAction = {
      kind: 'spawn_creature', entityId: state.entityId.toString(), definitionId: mutation.definitionId,
      species: state.definition.species, variant, habitat: state.definition.habitat,
      maximumHealth: state.definition.maximumHealth, spaceId: mutation.spaceId,
      tileX: mutation.tileX, tileY: mutation.tileY, authorityTick: state.authorityTick.toString(),
    };
    return { after: { ...stateDocument(state), existingEntity: { ...action } }, action, notice: null };
  }
  if (mutation.operation === 'playtest_apply_effect') {
    if (state.kind !== 'effect' || !state.targetExists || state.definitionId !== mutation.definitionId
      || state.maximumStacks < 1 || state.durationTicks < 1) fail('admin_payload_invalid');
    const active = state.existingEffect !== null && BigInt(state.existingEffect.expiresTick) > state.authorityTick;
    const stacks = active ? Math.min(state.maximumStacks, state.existingEffect!.stacks + 1) : 1;
    const action: AdminPlaytestAction = {
      kind: 'upsert_effect', targetIdentity: mutation.targetIdentity, definitionId: mutation.definitionId,
      effectKind: state.effectKind, previousId: state.existingEffect?.id ?? null, stacks,
      appliedTick: state.authorityTick.toString(),
      expiresTick: (state.authorityTick + BigInt(state.durationTicks)).toString(),
    };
    return { after: { ...stateDocument(state), existingEffect: { id: action.previousId, stacks,
      appliedTick: action.appliedTick, expiresTick: action.expiresTick } }, action,
    notice: `An administrator applied the ${state.effectKind.replaceAll('_', ' ')} playtest effect.` };
  }
  if (state.kind !== 'upgrade' || !state.targetExists || state.definitionId !== mutation.definitionId
    || state.homesteadSpaceId === null || !Number.isSafeInteger(mutation.rank)
    || mutation.rank < 1 || mutation.rank > state.maximumRank
    || state.existingUpgrade?.rank === mutation.rank) fail('admin_payload_invalid');
  const action: AdminPlaytestAction = {
    kind: 'upsert_upgrade', targetIdentity: mutation.targetIdentity, definitionId: mutation.definitionId,
    upgradeKind: state.upgradeKind, homesteadSpaceId: state.homesteadSpaceId, rank: mutation.rank,
    authorityTick: state.authorityTick.toString(),
  };
  return { after: { ...stateDocument(state), existingUpgrade: { rank: mutation.rank,
    purchasedBy: mutation.targetIdentity, purchasedAtTick: state.authorityTick.toString() } }, action,
  notice: `An administrator set ${state.upgradeKind.replaceAll('_', ' ')} to rank ${mutation.rank} for playtesting.` };
}

export function requireAdminPlaytestAuthority(role: AdminEffectiveRole, mutation: AdminPlaytestMutation): void {
  if (!adminRoleCanMutate(role, mutation.operation)) fail('admin_role_forbidden');
}

export function planAdminPlaytestMutation(
  state: AdminPlaytestState,
  request: AdminPlaytestPlanRequest,
): AdminPlaytestPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId) || request.nowMicros < 0n) {
    fail('admin_payload_invalid');
  }
  const before = stateDocument(state);
  const baseVersion = adminPlaytestVersion(state);
  if (request.expectedBaseVersion !== baseVersion) fail('admin_preview_stale');
  const { after, action, notice } = afterAndAction(state, request.mutation);
  const changes = diffAdminValues(before, after);
  if (!adminPreviewHasChanges(changes)) fail('admin_no_changes');
  const previewFingerprint = `preview:${fingerprint({
    mutation: { ...request.mutation, dryRun: false, reason: reason.value }, baseVersion, after,
  })}`;
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const committedVersion = `playtest:${fingerprint(after)}`;
  const target = request.mutation.operation === 'playtest_spawn'
    ? { kind: 'space' as const, spaceId: request.mutation.spaceId }
    : { kind: 'player' as const, identity: request.mutation.targetIdentity };
  const inverse: AdminAuditPayloadV1['inverse'] = action.kind === 'spawn_creature'
    ? { operation: 'despawn_entity', args: { entityId: action.entityId, spillContents: false } }
    : { operation: 'undo', args: { playtest: before } };
  return Object.freeze({
    baseVersion, committedVersion, previewFingerprint,
    preview: Object.freeze({ operation: request.mutation.operation, target, preview: changes,
      baseVersion, warnings: Object.freeze(['Playtest changes durable world state; use the audit inverse to restore it.']),
      expiresAtMicros: (request.nowMicros + 60_000_000n).toString() }),
    audit: Object.freeze({ schemaVersion: 1, clientMutationId: request.mutation.clientMutationId,
      target, reason: reason.value, changes: changes.changes, inverse, ...(notice === null ? {} : { notice }) }),
    action, notice,
  });
}
