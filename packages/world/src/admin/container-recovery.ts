import { adminPreviewHasChanges, diffAdminValues, type AdminJsonObject, type AdminJsonValue } from '@orchard/sim';
import { ADMIN_MUTATION_ID_PATTERN, parseAdminAuditPayload, parseAdminReason, type AdminAuditPayloadV1,
  type AdminErrorCode, type AdminMissingContainerInspection, type AdminMutationPreview } from './contracts.js';
import { AdminObjectError, type AdminManagedEntity } from './objects.js';

export interface MissingContainerAuditSource {
  readonly id: string;
  readonly action: string;
  readonly targetKey: string;
  readonly payload: string;
}

export interface MissingContainerAuthority {
  readonly current: AdminManagedEntity | null;
  readonly ownerExists: boolean;
  readonly carrierExists: boolean;
  readonly destinationBlocked: boolean;
  readonly definitionCapacity: number | null;
}

export interface MissingContainerRecoveryRequest {
  readonly entityId: string;
  readonly targetIdentity: string;
  readonly reason: string;
  readonly clientMutationId: string;
  readonly dryRun: boolean;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
  readonly source: MissingContainerAuditSource;
  readonly authority: MissingContainerAuthority;
}

export interface MissingContainerRecoveryPlan {
  readonly entity: AdminManagedEntity;
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string;
}

function fail(code: AdminErrorCode): never { throw new AdminObjectError(code); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isJson(value: unknown): value is AdminJsonValue {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (Array.isArray(value) && value.every(isJson))
    || (isRecord(value) && Object.values(value).every(isJson));
}
function stableJson(value: unknown): string {
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
function validUnsigned(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return false;
  try { return BigInt(value) >= 0n; } catch { return false; }
}
function managedEntity(value: unknown): AdminManagedEntity | null {
  const legacyChestSnapshot = value !== null && isRecord(value)
    && value['persistence'] === undefined && value['entityKind'] === 'chest'
    && value['definitionId'] === 'object:chest' && isRecord(value['state'])
    && Object.keys(value['state']).length === 0 && value['processor'] === null && value['build'] === undefined;
  if (!isRecord(value) || !validUnsigned(value['entityId'])
    || (value['entityKind'] !== 'placeable' && value['entityKind'] !== 'chest')
    || typeof value['definitionId'] !== 'string' || value['definitionId'].length === 0
    || !(value['ownerIdentity'] === null || typeof value['ownerIdentity'] === 'string')
    || !validUnsigned(value['spaceId']) || !Number.isSafeInteger(value['tileX']) || !Number.isSafeInteger(value['tileY'])
    || !isRecord(value['state']) || !isJson(value['state']) || !Array.isArray(value['slots'])
    || !value['slots'].every((stack) => stack === null || (isRecord(stack) && typeof stack['itemKind'] === 'string'
      && Number.isSafeInteger(stack['quantity']) && (stack['durability'] === undefined || Number.isSafeInteger(stack['durability']))
      && (stack['lit'] === undefined || typeof stack['lit'] === 'boolean')))
    || !(value['processor'] === null || (isRecord(value['processor']) && isJson(value['processor'])))
    || !(value['custody'] === undefined || (isRecord(value['custody']) && isJson(value['custody'])))
    || (!legacyChestSnapshot && value['persistence'] !== 'placeable' && value['persistence'] !== 'legacy_chest')
    || !(value['build'] === undefined || (isRecord(value['build']) && isJson(value['build'])))
    || !Number.isSafeInteger(value['damage'])) return null;
  const build = value['build'];
  if (value['persistence'] === 'placeable' && (!isRecord(build) || !validUnsigned(build['spaceId'])
    || typeof build['placedBy'] !== 'string' || !validUnsigned(build['placedAtTick']))) return null;
  if ((value['persistence'] === 'legacy_chest' || legacyChestSnapshot) && build !== undefined) return null;
  return legacyChestSnapshot
    ? { ...(value as unknown as AdminManagedEntity), persistence: 'legacy_chest' }
    : value as unknown as AdminManagedEntity;
}

/** Extracts only server-authored inverse state. Client input can never select
 * arbitrary replacement contents. The unambiguous pre-provenance legacy-chest
 * shape is upgraded; placeable audits without construction provenance fail closed. */
export function missingContainerEntityFromAudit(
  source: MissingContainerAuditSource, entityId: string, targetIdentity: string,
): AdminManagedEntity | null {
  if (source.action !== 'despawn_entity' || source.targetKey !== `entity:${entityId}`) return null;
  const parsed = parseAdminAuditPayload(source.payload);
  if (!parsed.ok || parsed.value.target.kind !== 'entity' || parsed.value.target.entityId !== entityId
    || parsed.value.inverse?.operation !== 'undo') return null;
  const objectState = parsed.value.inverse.args['objectState'];
  if (!isRecord(objectState) || !Array.isArray(objectState['entities'])) return null;
  const matching = objectState['entities'].map(managedEntity).filter((entity): entity is AdminManagedEntity => entity !== null)
    .filter((entity) => entity.entityId === entityId);
  if (matching.length !== 1 || matching[0]!.ownerIdentity !== targetIdentity) return null;
  return matching[0]!;
}

export function missingContainerRecoveryVersion(
  sourceAuditId: string, entity: AdminManagedEntity, present: boolean,
): string {
  return `missing-container:${fingerprint({ sourceAuditId, entity, present })}`;
}

export function inspectMissingContainerRecovery(
  source: MissingContainerAuditSource | null, entityId: string, targetIdentity: string,
  authority: MissingContainerAuthority,
): AdminMissingContainerInspection {
  const entity = source === null ? null : missingContainerEntityFromAudit(source, entityId, targetIdentity);
  const exactCurrent = entity !== null && authority.current !== null
    && stableJson(authority.current) === stableJson(entity);
  const authorityValid = entity !== null && authority.ownerExists && authority.carrierExists
    && !authority.destinationBlocked && authority.definitionCapacity === entity.slots.length;
  const recoverable = entity !== null && authority.current === null && authorityValid;
  const version = entity === null || source === null ? 'missing-container:unavailable'
    : missingContainerRecoveryVersion(source.id, exactCurrent ? authority.current! : entity, authority.current !== null);
  const summary = recoverable
    ? `Audit ${source!.id} contains exact definition, provenance, custody, processor, damage, and ${entity!.slots.length} slots.`
    : exactCurrent ? 'The container is already present with the exact audited state.'
      : entity === null ? 'No exact audited despawn inverse is available for this container and owner.'
        : !authority.ownerExists || !authority.carrierExists ? 'The archived owner or custody identity is no longer authoritative.'
          : authority.definitionCapacity !== entity.slots.length ? 'The current definition cannot hold the archived exact slot layout.'
            : authority.destinationBlocked ? 'The archived world position is currently blocked.'
              : 'The entity id is already occupied by different state.';
  return Object.freeze({ entityId, targetIdentity, recoverable, auditId: entity === null ? null : source!.id, summary, version });
}

export function planMissingContainerRecovery(request: MissingContainerRecoveryRequest): MissingContainerRecoveryPlan {
  const reason = parseAdminReason(request.reason); if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.clientMutationId) || request.nowMicros < 0n) fail('admin_payload_invalid');
  const entity = missingContainerEntityFromAudit(request.source, request.entityId, request.targetIdentity);
  if (entity === null || !request.authority.ownerExists || !request.authority.carrierExists
    || request.authority.definitionCapacity !== entity.slots.length) fail('admin_payload_invalid');
  if (request.authority.current !== null) fail('admin_no_changes');
  if (request.authority.destinationBlocked) fail('admin_position_blocked');
  const baseVersion = missingContainerRecoveryVersion(request.source.id, entity, false);
  if (request.expectedBaseVersion !== baseVersion) fail('admin_preview_stale');
  const preview = diffAdminValues({ present: false }, {
    present: true, value: entity as unknown as AdminJsonObject,
  });
  if (!adminPreviewHasChanges(preview)) fail('admin_no_changes');
  const committedVersion = missingContainerRecoveryVersion(request.source.id, entity, true);
  const previewFingerprint = `preview:${fingerprint({ operation: 'restore_missing_container', entity,
    sourceAuditId: request.source.id, targetIdentity: request.targetIdentity, baseVersion })}`;
  if (!request.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const notice = 'Your missing container and its exact audited contents were restored.';
  const mutationPreview: AdminMutationPreview = Object.freeze({
    operation: 'restore_missing_container', target: { kind: 'entity' as const, entityId: request.entityId },
    baseVersion, preview, warnings: Object.freeze([
      'The original entity id, slots, processor state, damage, custody, and construction provenance will be restored.',
    ]), expiresAtMicros: (request.nowMicros + 60_000_000n).toString(),
  });
  const audit: AdminAuditPayloadV1 = Object.freeze({ schemaVersion: 1, clientMutationId: request.clientMutationId,
    target: mutationPreview.target, reason: reason.value, changes: preview.changes,
    inverse: { operation: 'despawn_entity' as const, args: { entityId: request.entityId, spillContents: false,
      destructionReason: 'Inverse of audited missing-container restoration' } }, notice });
  return Object.freeze({ entity, baseVersion, committedVersion, previewFingerprint,
    preview: mutationPreview, audit, notice });
}
