import type { AdminJsonObject, AdminJsonValue } from '@orchard/sim';
import type { ObjectContentDefinition, ObjectStateDefinition } from '@orchard/sim';
import type {
  AdminAuditRow,
  AdminEntityMutation,
  AdminEntitySummary,
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import { ADMIN_MUTATION_ID_PATTERN } from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';

const STATE_KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const INTEGER_TEXT = /^-?(?:0|[1-9][0-9]*)$/u;

export type MapSchemaInspectorRole = 'owner' | 'admin';
export type MapSchemaInspectorTargetKind = AdminEntitySummary['kind'];

/** This is deliberately an allowlist, not a reducer name. The adapter below
 * owns the sole mapping to `set_entity_state`; untrusted schema metadata cannot
 * select another reducer or supply an arbitrary mutation envelope. */
export interface MapSchemaInspectorEntityStateAction {
  readonly adapter: 'admin_objects';
  readonly command: 'set_entity_state';
  readonly stateKey: string;
  readonly value: ObjectStateDefinition;
  readonly access: 'write';
  readonly roles: readonly MapSchemaInspectorRole[];
}

export interface MapSchemaInspectorField {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly why: string;
  readonly readOnly?: boolean;
  /** Runtime-validated because definitions may have arrived over the live
   * content subscription rather than from trusted TypeScript source. */
  readonly action?: unknown;
}

export interface MapSchemaInspectorTarget {
  readonly entityId: string;
  readonly entityKind: MapSchemaInspectorTargetKind;
  readonly definitionId: string;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly state: AdminJsonObject;
}

export interface MapSchemaInspectorAuthority {
  readonly mapId: string;
  readonly routeAccess: 'hidden' | 'read_only' | 'write';
  readonly connected: boolean;
  readonly role: string | null;
  readonly hasLiveApi: boolean;
  readonly target: MapSchemaInspectorTarget | null;
}

export type MapSchemaInspectorAvailability =
  | {
    readonly editable: true;
    readonly action: MapSchemaInspectorEntityStateAction;
    readonly authority: MapSchemaInspectorRole;
    readonly reason: string;
  }
  | { readonly editable: false; readonly reason: string };

export interface MapSchemaInspectorReceipt {
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly why: string;
  readonly entityId: string;
  readonly definitionId: string;
  readonly stateKey: string;
  readonly before: AdminJsonValue;
  readonly after: AdminJsonValue;
  readonly baseVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
}

function labelForStateKey(stateKey: string): string {
  return stateKey.replaceAll(/[._-]+/gu, ' ').replace(/\b\w/gu, (value) => value.toUpperCase());
}

function stateValueMatches(value: unknown, schema: ObjectStateDefinition): value is string | number | boolean {
  if (schema.type === 'bool') return typeof value === 'boolean';
  if (schema.type === 'enum') return typeof value === 'string' && schema.values.includes(value);
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= (schema.min ?? Number.MIN_SAFE_INTEGER)
    && value <= (schema.max ?? Number.MAX_SAFE_INTEGER);
}

/** Converts a verified object definition's state schema into Inspector rows.
 * The definition's state-key allowlist is the declaration of availability;
 * missing/malformed subscribed state remains visible but read-only. */
export function mapSchemaInspectorObjectStateFields(
  definition: ObjectContentDefinition,
  target: MapSchemaInspectorTarget,
): readonly MapSchemaInspectorField[] {
  const states = definition.components.states ?? {};
  const definitionMatches = definition.id === target.definitionId;
  return Object.freeze(Object.entries(states).sort(([left], [right]) => left.localeCompare(right))
    .map(([stateKey, schema]): MapSchemaInspectorField => {
      const current = target.state[stateKey];
      const currentValid = definitionMatches && stateValueMatches(current, schema);
      const type = schema.type === 'bool' ? 'boolean' : schema.type === 'enum'
        ? `one of ${schema.values.join(', ')}`
        : `an integer from ${schema.min ?? Number.MIN_SAFE_INTEGER} to ${schema.max ?? Number.MAX_SAFE_INTEGER}`;
      const explanation = currentValid
        ? `The ${definition.id} state schema declares ${stateKey} as ${type}.`
        : definitionMatches
          ? `The ${definition.id} state schema declares ${stateKey}, but subscribed state is missing or invalid.`
          : `The selected entity does not match the ${definition.id} state schema.`;
      return Object.freeze({
        id: `live-state-${stateKey}`,
        label: labelForStateKey(stateKey),
        value: currentValid ? current : null,
        why: explanation,
        ...(currentValid ? {
          action: Object.freeze({
            adapter: 'admin_objects',
            command: 'set_entity_state',
            stateKey,
            value: schema,
            access: 'write',
            roles: Object.freeze(['owner', 'admin'] as const),
          }) satisfies MapSchemaInspectorEntityStateAction,
        } : { readOnly: true }),
      });
    }));
}

interface PendingSchemaMutation {
  readonly mutation: AdminEntityMutation & { readonly operation: 'set_entity_state' };
  readonly receipt: MapSchemaInspectorReceipt;
  readonly field: MapSchemaInspectorField;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roles(value: unknown): value is readonly MapSchemaInspectorRole[] {
  return Array.isArray(value) && value.length > 0
    && new Set(value).size === value.length
    && value.every((role) => role === 'owner' || role === 'admin');
}

function valueSchema(value: unknown): value is ObjectStateDefinition {
  if (!record(value) || typeof value['type'] !== 'string') return false;
  if (value['type'] === 'bool') return typeof value['default'] === 'boolean';
  if (value['type'] === 'enum') {
    return typeof value['default'] === 'string'
      && Array.isArray(value['values']) && value['values'].length > 0
      && new Set(value['values']).size === value['values'].length
      && value['values'].every((entry) => typeof entry === 'string' && entry.length > 0)
      && value['values'].includes(value['default']);
  }
  if (value['type'] !== 'counter' || !Number.isSafeInteger(value['default'])) return false;
  const minimum = value['min'] ?? Number.MIN_SAFE_INTEGER;
  const maximum = value['max'] ?? Number.MAX_SAFE_INTEGER;
  return Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum)
    && Number(minimum) <= Number(value['default']) && Number(value['default']) <= Number(maximum)
    && Number(minimum) <= Number(maximum);
}

export function parseMapSchemaInspectorAction(
  value: unknown,
): MapSchemaInspectorEntityStateAction | null {
  if (!record(value)
    || value['adapter'] !== 'admin_objects'
    || value['command'] !== 'set_entity_state'
    || value['access'] !== 'write'
    || typeof value['stateKey'] !== 'string'
    || !STATE_KEY.test(value['stateKey'])
    || !valueSchema(value['value'])
    || !roles(value['roles'])) return null;
  return Object.freeze({
    adapter: 'admin_objects',
    command: 'set_entity_state',
    access: 'write',
    stateKey: value['stateKey'],
    value: Object.freeze({ ...value['value'] }) as ObjectStateDefinition,
    roles: Object.freeze([...value['roles']]),
  });
}

function why(field: MapSchemaInspectorField): string | null {
  const value = field.why.trim();
  return value.length === 0 ? null : value;
}

function unavailable(field: MapSchemaInspectorField, reason: string): MapSchemaInspectorAvailability {
  const explanation = why(field);
  return Object.freeze({
    editable: false,
    reason: `${reason}${explanation === null ? '' : ` · WHY ${explanation}`}`,
  });
}

/** Computes presentation and repeats all security gates used by preview. Canvas
 * may show this reason directly; the model never trusts presentation alone. */
export function mapSchemaInspectorAvailability(
  field: MapSchemaInspectorField,
  authority: MapSchemaInspectorAuthority,
): MapSchemaInspectorAvailability {
  if (why(field) === null) return unavailable(field, 'Field metadata has no WHY explanation');
  if (field.readOnly === true) return unavailable(field, 'Field metadata is read only');
  const action = parseMapSchemaInspectorAction(field.action);
  if (action === null) return unavailable(field, 'No supported mutation action is declared');
  if (authority.mapId !== 'live-island') {
    return unavailable(field, 'Schema actions are available only for the live island');
  }
  if (!authority.connected || !authority.hasLiveApi) {
    return unavailable(field, 'Connect to live authority to change this field');
  }
  if (authority.routeAccess !== action.access) {
    return unavailable(field, 'This Inspector route is read only');
  }
  if (authority.role !== 'owner' && authority.role !== 'admin') {
    return unavailable(field, 'Only an owner or administrator may change live fields');
  }
  if (!action.roles.includes(authority.role)) {
    return unavailable(field, `${authority.role === 'owner' ? 'Owner' : 'Administrator'} access is not declared for this field`);
  }
  const target = authority.target;
  if (target === null) return unavailable(field, 'Select a live entity first');
  if (target.spaceId !== 0) return unavailable(field, 'Only live-island entities are available here');
  if (target.entityKind !== 'placeable' && target.entityKind !== 'chest') {
    return unavailable(field, 'This entity kind has no safe generic state adapter');
  }
  if (!target.definitionId.startsWith('object:')) {
    return unavailable(field, 'The selected entity has no verified object definition');
  }
  if (!(action.stateKey in target.state)) {
    return unavailable(field, 'The subscribed entity state does not expose this field');
  }
  return Object.freeze({ editable: true, action, authority: authority.role, reason: `WHY ${field.why.trim()}` });
}

function assertCurrentValue(value: MapSchemaInspectorField['value'], schema: ObjectStateDefinition): AdminJsonValue {
  if (schema.type === 'bool' && typeof value === 'boolean') return value;
  if (schema.type === 'enum' && typeof value === 'string' && schema.values.includes(value)) return value;
  if (schema.type === 'counter' && typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new Error('map_schema_field_value_invalid');
}

export function parseMapSchemaInspectorEdit(
  field: MapSchemaInspectorField,
  action: MapSchemaInspectorEntityStateAction,
  source: string,
): AdminJsonValue {
  const before = assertCurrentValue(field.value, action.value);
  const text = source.trim();
  let next: AdminJsonValue;
  if (action.value.type === 'bool') {
    if (text !== 'true' && text !== 'false') throw new Error('map_schema_edit_boolean_invalid');
    next = text === 'true';
  } else if (action.value.type === 'enum') {
    if (!action.value.values.includes(text)) throw new Error('map_schema_edit_option_invalid');
    next = text;
  } else {
    if (!INTEGER_TEXT.test(text)) throw new Error('map_schema_edit_counter_invalid');
    const parsed = Number(text);
    const minimum = action.value.min ?? Number.MIN_SAFE_INTEGER;
    const maximum = action.value.max ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error('map_schema_edit_counter_invalid');
    }
    next = parsed;
  }
  if (next === before) throw new Error('admin_no_changes');
  return next;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stateChange(
  preview: AdminMutationPreview,
  stateKey: string,
  expected: AdminJsonValue,
): boolean {
  const suffix = `/state/${stateKey}`;
  return preview.preview.changes.some((change) => change.path.endsWith(suffix)
    && change.after.present && sameJson(change.after.value, expected));
}

function targetMatchesSummary(
  target: MapSchemaInspectorTarget,
  action: MapSchemaInspectorEntityStateAction,
  current: AdminJsonValue,
  row: AdminEntitySummary,
): boolean {
  return row.entityId === target.entityId
    && row.kind === target.entityKind
    && row.definitionId === target.definitionId
    && row.spaceId === String(target.spaceId)
    && row.tileX === target.tileX
    && row.tileY === target.tileY
    && sameJson(row.state[action.stateKey], current);
}

function matchingAudit(
  audit: AdminAuditRow,
  pending: PendingSchemaMutation,
): boolean {
  const { mutation, receipt } = pending;
  const inverse = audit.payload.inverse;
  return audit.operation === 'set_entity_state'
    && audit.target.kind === 'entity' && audit.target.entityId === receipt.entityId
    && audit.payload.target.kind === 'entity' && audit.payload.target.entityId === receipt.entityId
    && audit.payload.clientMutationId === mutation.clientMutationId
    && stateChange({ ...receipt.preview, preview: { changes: audit.payload.changes, truncated: false } },
      receipt.stateKey, receipt.after)
    && inverse?.operation === 'set_entity_state'
    && inverse.args['entityId'] === receipt.entityId
    && record(inverse.args['patch'])
    && sameJson(inverse.args['patch'][receipt.stateKey], receipt.before);
}

/** Receipt-bound adapter for fields explicitly enabled by schema metadata.
 * Discovery is read-only, the dry-run asks authority for its current exact
 * base, and commit forwards that base/fingerprint without substitution. */
export class MapSchemaInspectorActionModel {
  #pending: PendingSchemaMutation | null = null;
  #generation = 0;
  #disposed = false;

  constructor(
    readonly api: AdminObjectsApi,
    private readonly createMutationId: () => string = () => crypto.randomUUID(),
  ) {}

  pending(): MapSchemaInspectorReceipt | null { return this.#pending?.receipt ?? null; }

  cancel(): void {
    this.#generation += 1;
    this.#pending = null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.cancel();
  }

  async preview(
    field: MapSchemaInspectorField,
    authority: MapSchemaInspectorAuthority,
    source: string,
    reason: string,
  ): Promise<AdminMutationPreview> {
    if (this.#disposed) throw new Error('map_schema_action_disposed');
    const availability = mapSchemaInspectorAvailability(field, authority);
    if (!availability.editable) throw new Error('map_schema_field_read_only');
    const target = authority.target!;
    const before = assertCurrentValue(field.value, availability.action.value);
    const after = parseMapSchemaInspectorEdit(field, availability.action, source);
    const normalizedReason = normalizeAdminReason(reason);
    const clientMutationId = this.createMutationId();
    if (!ADMIN_MUTATION_ID_PATTERN.test(clientMutationId)) throw new Error('admin_invalid_mutation_id');
    const generation = ++this.#generation;
    this.#pending = null;
    const page = await this.api.listEntities({
      kinds: [target.entityKind],
      spaceId: String(target.spaceId),
      x0: target.tileX,
      y0: target.tileY,
      x1: target.tileX,
      y1: target.tileY,
      text: target.entityId,
      cursor: null,
      limit: 100,
    });
    const current = page.rows.find(({ entityId }) => entityId === target.entityId);
    if (current === undefined
      || !targetMatchesSummary(target, availability.action, before, current)) {
      throw new Error('map_schema_entity_stale');
    }
    if (generation !== this.#generation || this.#disposed) {
      throw new Error('map_schema_action_cancelled');
    }
    const mutation = Object.freeze({
      operation: 'set_entity_state' as const,
      entityId: target.entityId,
      patch: Object.freeze({ [availability.action.stateKey]: after }),
      reason: normalizedReason,
      clientMutationId,
      dryRun: true,
    });
    // Browser live projections currently expose an empty version and ask the
    // reducer to discover the exact base during dry-run. Offline/test adapters
    // may already have an exact version; preserve it rather than weakening the
    // same adapter contract.
    const result = await this.api.mutate(mutation, current.version, null);
    if (result.committed || result.audit !== null
      || result.preview.operation !== 'set_entity_state'
      || result.preview.target.kind !== 'entity'
      || result.preview.target.entityId !== target.entityId
      || result.preview.baseVersion.length === 0
      || result.previewFingerprint.length === 0
      || !stateChange(result.preview, availability.action.stateKey, after)) {
      throw new Error('admin_preview_receipt_mismatch');
    }
    if (generation === this.#generation && !this.#disposed) {
      this.#pending = Object.freeze({
        mutation,
        field,
        receipt: Object.freeze({
          fieldId: field.id,
          fieldLabel: field.label,
          why: field.why.trim(),
          entityId: target.entityId,
          definitionId: target.definitionId,
          stateKey: availability.action.stateKey,
          before,
          after,
          baseVersion: result.preview.baseVersion,
          previewFingerprint: result.previewFingerprint,
          preview: result.preview,
        }),
      });
    }
    return result.preview;
  }

  async commit(
    confirmed: boolean,
    authority: MapSchemaInspectorAuthority,
  ): Promise<AdminObjectMutationResult> {
    if (this.#disposed) throw new Error('map_schema_action_disposed');
    if (this.#pending === null) throw new Error('admin_preview_required');
    if (!confirmed) throw new Error('map_schema_confirmation_required');
    const pending = this.#pending;
    const availability = mapSchemaInspectorAvailability(pending.field, authority);
    if (!availability.editable) throw new Error('map_schema_field_read_only');
    const target = authority.target;
    if (target === null
      || target.entityId !== pending.receipt.entityId
      || target.definitionId !== pending.receipt.definitionId
      || availability.action.stateKey !== pending.receipt.stateKey
      || !sameJson(target.state[pending.receipt.stateKey], pending.receipt.before)) {
      this.cancel();
      throw new Error('map_schema_entity_stale');
    }
    this.cancel();
    const result = await this.api.mutate(
      { ...pending.mutation, dryRun: false },
      pending.receipt.baseVersion,
      pending.receipt.previewFingerprint,
    );
    if (!result.committed || result.audit === null
      || result.previewFingerprint !== pending.receipt.previewFingerprint
      || result.preview.baseVersion !== pending.receipt.baseVersion
      || result.preview.operation !== 'set_entity_state'
      || result.preview.target.kind !== 'entity'
      || result.preview.target.entityId !== pending.receipt.entityId
      || !stateChange(result.preview, pending.receipt.stateKey, pending.receipt.after)
      || !matchingAudit(result.audit, pending)) {
      throw new Error('commit_receipt_mismatch');
    }
    return result;
  }
}
