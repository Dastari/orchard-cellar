import {
  FAIL_CLOSED_ITEM_POLICY,
  UNIQUE_QUEST_ITEM_TAG,
  adminPreviewHasChanges,
  diffAdminValues,
  type AdminJsonObject,
  type AdminJsonValue,
  type ItemPolicyResolver,
} from '@orchard/sim';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminEntityMutation,
  type AdminErrorCode,
  type AdminMutationPreview,
} from './contracts.js';

export type AdminObjectMutation = AdminEntityMutation;
export type AdminManagedEntityKind = 'placeable' | 'chest' | 'npc';

export interface AdminObjectStack {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
}

export interface AdminManagedEntity {
  readonly entityId: string;
  readonly entityKind: AdminManagedEntityKind;
  readonly definitionId: string;
  readonly ownerIdentity: string | null;
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly state: AdminJsonObject;
  readonly slots: readonly (AdminObjectStack | null)[];
  readonly processor: AdminJsonObject | null;
  /** Physical authority table used for an exact inverse. */
  readonly persistence?: 'placeable' | 'legacy_chest';
  /** Authority custody which must participate in preview/version checks but is
   * never rewritten by move, repair, or replacement. */
  readonly custody?: AdminJsonObject;
  /** Construction provenance is durable custody. Exact recovery refuses an
   * audit that predates this snapshot field instead of inventing a new tick. */
  readonly build?: AdminJsonObject;
  readonly damage: number;
}

export interface AdminManagedResource {
  readonly entityId: string;
  readonly definitionId: string;
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly state: AdminJsonObject;
}

export interface AdminSpilledWorldItem extends AdminObjectStack {
  readonly entityId: string;
  readonly sourceEntityId: string;
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
}

export interface AdminObjectState {
  readonly entities: readonly AdminManagedEntity[];
  readonly resources: readonly AdminManagedResource[];
  readonly spilledItems: readonly AdminSpilledWorldItem[];
  readonly nextEntityId: bigint;
  readonly nextWorldItemId: bigint;
}

export interface AdminObjectDefinition {
  readonly definitionId: string;
  readonly entityKind: 'placeable' | 'chest';
  readonly capacity: number;
  readonly stateKeys: readonly string[];
  readonly initialState: AdminJsonObject;
  readonly processorInitialState: AdminJsonObject | null;
}

export interface AdminResourceRespawnCandidate {
  readonly entityId: string;
  readonly definitionId: string;
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly state: AdminJsonObject;
}

export interface AdminObjectPlanRequest {
  readonly mutation: AdminObjectMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
  readonly definitions: ReadonlyMap<string, AdminObjectDefinition>;
  readonly blockedTiles: ReadonlySet<string>;
  readonly resourceCandidates: readonly AdminResourceRespawnCandidate[];
  /** Active published content policy. Omission is accepted only as a
   * migration-safe API seam and rejects every newly requested item stack. */
  readonly itemPolicy?: ItemPolicyResolver;
}

export interface AdminObjectPlan {
  readonly before: AdminObjectState;
  readonly after: AdminObjectState;
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string | null;
}

export class AdminObjectError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminObjectError';
  }
}

function fail(code: AdminErrorCode): never {
  throw new AdminObjectError(code);
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

function cloneState(state: AdminObjectState): AdminObjectState {
  return Object.freeze({
    entities: Object.freeze(state.entities.map((entity) => Object.freeze({
      ...entity,
      state: Object.freeze({ ...entity.state }),
      slots: Object.freeze(entity.slots.map((stack) => stack === null ? null : Object.freeze({ ...stack }))),
      processor: entity.processor === null ? null : Object.freeze({ ...entity.processor }),
      ...(entity.custody === undefined ? {} : { custody: Object.freeze({ ...entity.custody }) }),
      ...(entity.build === undefined ? {} : { build: Object.freeze({ ...entity.build }) }),
    }))),
    resources: Object.freeze(state.resources.map((resource) => Object.freeze({
      ...resource, state: Object.freeze({ ...resource.state }),
    }))),
    spilledItems: Object.freeze(state.spilledItems.map((item) => Object.freeze({ ...item }))),
    nextEntityId: state.nextEntityId,
    nextWorldItemId: state.nextWorldItemId,
  });
}

function stackDocument(stack: AdminObjectStack | null): AdminJsonValue {
  return stack === null ? null : { ...stack };
}

function entityDocument(entity: AdminManagedEntity): AdminJsonObject {
  return {
    ...entity,
    slots: entity.slots.map(stackDocument),
  };
}

export function adminObjectDocument(state: AdminObjectState): AdminJsonObject {
  return {
    entities: state.entities.map(entityDocument),
    resources: state.resources.map((resource) => ({ ...resource })),
    spilledItems: state.spilledItems.map((item) => ({ ...item })),
    nextEntityId: state.nextEntityId.toString(),
    nextWorldItemId: state.nextWorldItemId.toString(),
  };
}

export function adminObjectVersion(state: AdminObjectState): string {
  return `objects:${fingerprint(adminObjectDocument(state))}`;
}

function tileKey(spaceId: string, tileX: number, tileY: number): string {
  return `${spaceId}:${tileX}:${tileY}`;
}

function requireTile(
  spaceId: string,
  tileX: number,
  tileY: number,
  blockedTiles: ReadonlySet<string>,
  entities: readonly AdminManagedEntity[],
  exceptId?: string,
): void {
  if (spaceId.length === 0 || !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)
    || blockedTiles.has(tileKey(spaceId, tileX, tileY))
    || entities.some((entity) => entity.entityId !== exceptId && entity.spaceId === spaceId
      && entity.tileX === tileX && entity.tileY === tileY)) fail('admin_position_blocked');
}

function validStack(stack: AdminObjectStack, itemPolicy: ItemPolicyResolver): AdminObjectStack {
  const maxStack = itemPolicy.maxStackFor(stack.itemKind);
  if (maxStack === null || !Number.isSafeInteger(stack.quantity)
    || stack.quantity <= 0 || stack.quantity > maxStack
    || (stack.durability !== undefined && (!Number.isSafeInteger(stack.durability)
      || stack.durability < 0 || stack.durability > 65_535))) fail('admin_stack_invalid');
  if (itemPolicy.hasTag(stack.itemKind, UNIQUE_QUEST_ITEM_TAG) && stack.quantity !== 1) {
    fail('admin_unique_item_conflict');
  }
  return Object.freeze({ ...stack });
}

function uniqueCounts(state: AdminObjectState, itemPolicy: ItemPolicyResolver): Map<string, number> {
  const counts = new Map<string, number>();
  const stacks = [
    ...state.entities.flatMap(({ slots }) => slots.filter((stack): stack is AdminObjectStack => stack !== null)),
    ...state.spilledItems,
  ];
  for (const stack of stacks) if (itemPolicy.hasTag(stack.itemKind, UNIQUE_QUEST_ITEM_TAG)) {
    counts.set(stack.itemKind, (counts.get(stack.itemKind) ?? 0) + stack.quantity);
  }
  return counts;
}

function requireUniquePolicy(
  before: AdminObjectState,
  after: AdminObjectState,
  itemPolicy: ItemPolicyResolver,
): void {
  const previous = uniqueCounts(before, itemPolicy);
  const next = uniqueCounts(after, itemPolicy);
  for (const itemKind of new Set([...previous.keys(), ...next.keys()])) {
    const count = next.get(itemKind) ?? 0;
    if (count > 1 && count > (previous.get(itemKind) ?? 0)) fail('admin_unique_item_conflict');
    if (count < (previous.get(itemKind) ?? 0)) fail('admin_unique_item_conflict');
  }
}

function entityById(state: AdminObjectState, entityId: string): AdminManagedEntity {
  const entity = state.entities.find((candidate) => candidate.entityId === entityId);
  if (entity === undefined) fail('admin_entity_not_found');
  return entity;
}

function requireReleasedCustody(entity: AdminManagedEntity): void {
  if (entity.custody?.['carriedBy'] !== null && entity.custody?.['carriedBy'] !== undefined) {
    fail('admin_payload_invalid');
  }
}

function updateEntity(
  state: AdminObjectState,
  entityId: string,
  update: (entity: AdminManagedEntity) => AdminManagedEntity,
): AdminObjectState {
  return {
    ...state,
    entities: state.entities.map((entity) => entity.entityId === entityId ? update(entity) : entity),
  };
}

function safeStatePatch(
  state: AdminJsonObject,
  patch: AdminJsonObject,
  allowed: ReadonlySet<string>,
): AdminJsonObject {
  const entries = Object.entries(patch);
  if (entries.length === 0) fail('admin_invalid_patch');
  for (const [key, value] of entries) {
    if (!allowed.has(key) || (typeof value === 'number' && !Number.isFinite(value))
      || (typeof value === 'object' && value !== null)) fail('admin_invalid_patch');
  }
  return { ...state, ...patch };
}

function applyMutation(
  state: AdminObjectState,
  mutation: AdminObjectMutation,
  request: Pick<AdminObjectPlanRequest,
    'definitions' | 'blockedTiles' | 'resourceCandidates' | 'itemPolicy'>,
): AdminObjectState {
  const itemPolicy = request.itemPolicy ?? FAIL_CLOSED_ITEM_POLICY;
  switch (mutation.operation) {
    case 'spawn_entity': {
      const definition = request.definitions.get(mutation.definitionId);
      if (definition === undefined || (mutation.ownerIdentity !== undefined
        && mutation.ownerIdentity.length === 0)) fail('admin_payload_invalid');
      requireTile(mutation.spaceId, mutation.tileX, mutation.tileY, request.blockedTiles, state.entities);
      const entity: AdminManagedEntity = {
        entityId: state.nextEntityId.toString(), entityKind: definition.entityKind,
        definitionId: definition.definitionId, ownerIdentity: mutation.ownerIdentity ?? null,
        spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY,
        state: mutation.state === undefined
          ? { ...definition.initialState }
          : safeStatePatch(definition.initialState, mutation.state, new Set(definition.stateKeys)),
        slots: Array.from({ length: definition.capacity }, () => null),
        processor: definition.processorInitialState === null ? null : { ...definition.processorInitialState },
        damage: 0,
      };
      return { ...state, entities: [...state.entities, entity], nextEntityId: state.nextEntityId + 1n };
    }
    case 'despawn_entity': {
      const entity = entityById(state, mutation.entityId);
      requireReleasedCustody(entity);
      const contents = entity.slots.flatMap((stack) => stack === null ? [] : [stack]);
      if (!mutation.spillContents && contents.length > 0 && mutation.destructionReason === undefined) {
        fail('admin_payload_invalid');
      }
      let nextWorldItemId = state.nextWorldItemId;
      const spilled = mutation.spillContents ? contents.map((stack, index): AdminSpilledWorldItem => ({
        ...stack,
        entityId: (nextWorldItemId + BigInt(index)).toString(),
        sourceEntityId: entity.entityId,
        spaceId: entity.spaceId,
        tileX: entity.tileX + (index % 2),
        tileY: entity.tileY + Math.floor(index / 2),
      })) : [];
      nextWorldItemId += BigInt(spilled.length);
      return {
        ...state,
        entities: state.entities.filter(({ entityId }) => entityId !== mutation.entityId),
        spilledItems: [...state.spilledItems, ...spilled],
        nextWorldItemId,
      };
    }
    case 'move_entity': {
      const entity = entityById(state, mutation.entityId);
      requireReleasedCustody(entity);
      requireTile(mutation.spaceId, mutation.tileX, mutation.tileY, request.blockedTiles, state.entities, mutation.entityId);
      return updateEntity(state, mutation.entityId, (entity) => ({
        ...entity, spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY,
      }));
    }
    case 'set_entity_state': {
      const entity = entityById(state, mutation.entityId);
      const definition = request.definitions.get(entity.definitionId);
      if (definition === undefined || entity.entityKind === 'npc') fail('admin_payload_invalid');
      return updateEntity(state, mutation.entityId, (current) => ({
        ...current,
        state: safeStatePatch(current.state, mutation.patch, new Set(definition.stateKeys)),
      }));
    }
    case 'set_container_slot': {
      const entity = entityById(state, mutation.entityId);
      if (!Number.isSafeInteger(mutation.slot) || mutation.slot < 0 || mutation.slot >= entity.slots.length) {
        fail('admin_payload_invalid');
      }
      const slots = [...entity.slots];
      slots[mutation.slot] = mutation.stack === null ? null : validStack(mutation.stack, itemPolicy);
      return updateEntity(state, mutation.entityId, (current) => ({ ...current, slots }));
    }
    case 'repair_entity': {
      const entity = entityById(state, mutation.entityId);
      const definition = request.definitions.get(entity.definitionId);
      if (definition === undefined || (entity.damage === 0
        && stableJson(entity.processor) === stableJson(definition.processorInitialState))) fail('admin_no_changes');
      return updateEntity(state, mutation.entityId, (current) => ({
        ...current,
        damage: 0,
        processor: definition.processorInitialState === null ? null : { ...definition.processorInitialState },
      }));
    }
    case 'replace_entity': {
      const entity = entityById(state, mutation.entityId);
      requireReleasedCustody(entity);
      const definition = request.definitions.get(mutation.definitionId);
      if (definition === undefined || entity.entityKind !== definition.entityKind
        || definition.capacity < entity.slots.length
        || (entity.processor !== null && definition.processorInitialState === null)) fail('admin_payload_invalid');
      return updateEntity(state, mutation.entityId, (current) => ({
        ...current,
        definitionId: definition.definitionId,
        state: { ...definition.initialState },
        slots: [...current.slots, ...Array.from({ length: definition.capacity - current.slots.length }, () => null)],
        // Existing progress, attribution and deadlines are custody, just like slots.
        processor: current.processor,
      }));
    }
    case 'relocate_npc': {
      const entity = entityById(state, mutation.npcId);
      if (entity.entityKind !== 'npc') fail('admin_entity_not_found');
      requireTile(mutation.spaceId, mutation.tileX, mutation.tileY, request.blockedTiles, state.entities, entity.entityId);
      return updateEntity(state, entity.entityId, (current) => ({
        ...current, spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY,
      }));
    }
    case 'respawn_resources': {
      if (!Number.isSafeInteger(mutation.x0) || !Number.isSafeInteger(mutation.y0)
        || !Number.isSafeInteger(mutation.x1) || !Number.isSafeInteger(mutation.y1)
        || mutation.x0 > mutation.x1 || mutation.y0 > mutation.y1
        || (mutation.x1 - mutation.x0 + 1) * (mutation.y1 - mutation.y0 + 1) > 4_096) {
        fail('admin_payload_invalid');
      }
      const existing = new Set(state.resources.map(({ entityId }) => entityId));
      const spawned = request.resourceCandidates.filter((candidate) => (
        candidate.spaceId === mutation.spaceId
        && candidate.tileX >= mutation.x0 && candidate.tileX <= mutation.x1
        && candidate.tileY >= mutation.y0 && candidate.tileY <= mutation.y1
        && !existing.has(candidate.entityId)
      )).sort((left, right) => left.entityId.localeCompare(right.entityId));
      if (spawned.length === 0) fail('admin_no_changes');
      return { ...state, resources: [...state.resources, ...spawned] };
    }
  }
}

function mutationFingerprint(
  mutation: AdminObjectMutation,
  baseVersion: string,
  after: AdminObjectState,
): string {
  return `preview:${fingerprint({
    mutation: { ...mutation, dryRun: false, reason: String(mutation.reason).trim() },
    baseVersion,
    after: adminObjectDocument(after),
  })}`;
}

function inverseFor(
  mutation: AdminObjectMutation,
  before: AdminObjectState,
  after: AdminObjectState,
): AdminAuditPayloadV1['inverse'] {
  switch (mutation.operation) {
    case 'spawn_entity': return {
      operation: 'despawn_entity', args: {
        entityId: after.entities.find((entity) => !before.entities.some(({ entityId }) => entityId === entity.entityId))!.entityId,
        spillContents: false,
      },
    };
    case 'move_entity': {
      const entity = entityById(before, mutation.entityId);
      return { operation: 'move_entity', args: {
        entityId: mutation.entityId, spaceId: entity.spaceId, tileX: entity.tileX, tileY: entity.tileY,
      } };
    }
    case 'set_entity_state': {
      const entity = entityById(before, mutation.entityId);
      return { operation: 'set_entity_state', args: {
        entityId: mutation.entityId,
        patch: Object.fromEntries(Object.keys(mutation.patch).map((key) => [key, entity.state[key] ?? null])),
      } };
    }
    case 'set_container_slot': return {
      operation: 'set_container_slot', args: {
        entityId: mutation.entityId, slot: mutation.slot,
        stack: stackDocument(entityById(before, mutation.entityId).slots[mutation.slot] ?? null),
      },
    };
    case 'relocate_npc': {
      const npc = entityById(before, mutation.npcId);
      return { operation: 'relocate_npc', args: {
        npcId: mutation.npcId, spaceId: npc.spaceId, tileX: npc.tileX, tileY: npc.tileY,
      } };
    }
    case 'despawn_entity':
    case 'repair_entity':
    case 'replace_entity': return {
      operation: 'undo', args: { objectState: adminObjectDocument(before) },
    };
    case 'respawn_resources': return {
      operation: 'undo', args: {
        resourceIds: after.resources.filter((resource) => !before.resources.some(({ entityId }) => entityId === resource.entityId))
          .map(({ entityId }) => entityId),
      },
    };
  }
}

export function requireAdminObjectAuthority(role: AdminEffectiveRole, mutation: AdminObjectMutation): void {
  if (!adminRoleCanMutate(role, mutation.operation)) fail('admin_role_forbidden');
}

export function planAdminObjectMutation(
  inputState: AdminObjectState,
  request: AdminObjectPlanRequest,
): AdminObjectPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId) || request.nowMicros < 0n) {
    fail('admin_payload_invalid');
  }
  const before = cloneState(inputState);
  const baseVersion = adminObjectVersion(before);
  if (request.expectedBaseVersion !== baseVersion) fail('admin_preview_stale');
  const itemPolicy = request.itemPolicy ?? FAIL_CLOSED_ITEM_POLICY;
  const mutated = applyMutation(before, request.mutation, request);
  requireUniquePolicy(before, mutated, itemPolicy);
  const after = cloneState(mutated);
  const diff = diffAdminValues(adminObjectDocument(before), adminObjectDocument(after));
  if (!adminPreviewHasChanges(diff)) fail('admin_no_changes');
  const previewFingerprint = mutationFingerprint(request.mutation, baseVersion, after);
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const target = 'entityId' in request.mutation
    ? { kind: 'entity' as const, entityId: request.mutation.entityId }
    : 'npcId' in request.mutation
      ? { kind: 'entity' as const, entityId: request.mutation.npcId }
      : { kind: 'space' as const, spaceId: request.mutation.spaceId };
  const affectedId = 'entityId' in request.mutation
    ? request.mutation.entityId
    : 'npcId' in request.mutation ? request.mutation.npcId : undefined;
  const affected = affectedId === undefined
    ? undefined
    : before.entities.find(({ entityId }) => entityId === affectedId);
  const noticeOwner = affected?.ownerIdentity ?? (request.mutation.operation === 'spawn_entity'
    ? request.mutation.ownerIdentity ?? null
    : null);
  const notice = noticeOwner === null
    ? null
    : `An administrator applied ${request.mutation.operation.replaceAll('_', ' ')} to your object.`;
  const preview: AdminMutationPreview = Object.freeze({
    operation: request.mutation.operation,
    target,
    baseVersion,
    preview: diff,
    warnings: request.mutation.operation === 'despawn_entity'
      ? Object.freeze(['Despawn can destroy or spill durable container custody.'])
      : Object.freeze([]),
    expiresAtMicros: (request.nowMicros + 60_000_000n).toString(),
  });
  const audit: AdminAuditPayloadV1 = Object.freeze({
    schemaVersion: 1,
    clientMutationId: request.mutation.clientMutationId,
    target,
    reason: reason.value,
    changes: diff.changes,
    inverse: inverseFor(request.mutation, before, after),
    ...(notice === null ? {} : { notice }),
  });
  return Object.freeze({
    before,
    after,
    baseVersion,
    committedVersion: adminObjectVersion(after),
    previewFingerprint,
    preview,
    audit,
    notice,
  });
}
