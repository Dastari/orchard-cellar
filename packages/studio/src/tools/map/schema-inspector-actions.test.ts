import { describe, expect, it, vi } from 'vitest';
import { parseObjectDefinition } from '@orchard/sim';
import type {
  AdminAuditRow,
  AdminEntityMutation,
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import type {
  AdminEntityPage,
  AdminObjectMutationResult,
  AdminObjectsApi,
} from '../../admin/objects-api.js';
import { createMockAdminObjectsApi } from '../../admin/objects-api.js';
import {
  MapSchemaInspectorActionModel,
  mapSchemaInspectorObjectStateFields,
  mapSchemaInspectorAvailability,
  parseMapSchemaInspectorAction,
  parseMapSchemaInspectorEdit,
  type MapSchemaInspectorAuthority,
  type MapSchemaInspectorEntityStateAction,
  type MapSchemaInspectorField,
} from './schema-inspector-actions.js';

const ACTION = Object.freeze({
  adapter: 'admin_objects',
  command: 'set_entity_state',
  stateKey: 'lit',
  value: Object.freeze({ type: 'bool', default: true }),
  access: 'write',
  roles: Object.freeze(['owner', 'admin'] as const),
}) satisfies MapSchemaInspectorEntityStateAction;

const FIELD = Object.freeze({
  id: 'state-lit',
  label: 'Lit',
  value: true,
  why: 'Controls the authored light state declared by this object definition.',
  action: ACTION,
}) satisfies MapSchemaInspectorField;

const TARGET = Object.freeze({
  entityId: '41',
  entityKind: 'placeable' as const,
  definitionId: 'object:standing_torch',
  spaceId: 0,
  tileX: 12,
  tileY: 14,
  state: Object.freeze({ lit: true }),
});

const AUTHORITY = Object.freeze({
  mapId: 'live-island',
  routeAccess: 'write' as const,
  connected: true,
  role: 'admin',
  hasLiveApi: true,
  target: TARGET,
}) satisfies MapSchemaInspectorAuthority;

function mutationPreview(after = false): AdminMutationPreview {
  return Object.freeze({
    operation: 'set_entity_state',
    target: { kind: 'entity' as const, entityId: TARGET.entityId },
    baseVersion: 'object:exact-before',
    preview: Object.freeze({
      changes: Object.freeze([{
        path: '/entities/0/state/lit',
        before: { present: true as const, value: true },
        after: { present: true as const, value: after },
      }]),
      truncated: false,
    }),
    warnings: Object.freeze([]),
    expiresAtMicros: '1780000060000000',
  });
}

function audit(mutation: AdminEntityMutation, inverse = true): AdminAuditRow {
  return Object.freeze({
    id: 'audit-schema-1',
    actorIdentity: 'admin',
    operation: 'set_entity_state',
    target: { kind: 'entity' as const, entityId: TARGET.entityId },
    occurredAtMicros: '1780000000000000',
    payload: Object.freeze({
      schemaVersion: 1 as const,
      clientMutationId: mutation.clientMutationId,
      target: { kind: 'entity' as const, entityId: TARGET.entityId },
      reason: mutation.reason,
      changes: mutationPreview().preview.changes,
      inverse: Object.freeze({
        operation: 'set_entity_state' as const,
        args: Object.freeze({
          entityId: TARGET.entityId,
          patch: Object.freeze({ lit: inverse }),
        }),
      }),
    }),
  });
}

function entityPage(state = { lit: true }): AdminEntityPage {
  return Object.freeze({
    rows: Object.freeze([{
      ...TARGET,
      kind: TARGET.entityKind,
      spaceId: String(TARGET.spaceId),
      state,
      ownerIdentity: 'player-a',
      version: '',
    }]),
    nextCursor: null,
    worldVersion: '',
    rowsScanned: 1,
  });
}

function probe(): {
  readonly api: AdminObjectsApi;
  readonly calls: Array<{
    readonly mutation: AdminEntityMutation;
    readonly expectedBaseVersion: string;
    readonly previewFingerprint: string | null;
  }>;
} {
  const calls: Array<{
    mutation: AdminEntityMutation;
    expectedBaseVersion: string;
    previewFingerprint: string | null;
  }> = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => entityPage()),
    container: vi.fn(async () => { throw new Error('Schema state does not use container authority'); }),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push({ mutation, expectedBaseVersion, previewFingerprint });
      const preview = mutationPreview();
      return Object.freeze({
        preview,
        previewFingerprint: 'preview:schema-exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? preview.baseVersion : 'object:after',
        audit: mutation.dryRun ? null : audit(mutation),
        notice: mutation.dryRun ? null : 'The object was changed by an administrator.',
      }) satisfies AdminObjectMutationResult;
    }),
  };
  return { api, calls };
}

describe('Map schema Inspector mutation planner', () => {
  it('derives action metadata from verified object states and leaves mismatches read only', () => {
    const definition = parseObjectDefinition({
      schemaVersion: 1,
      id: 'object:standing_torch',
      kind: 'object',
      displayName: 'Standing Torch',
      components: {
        states: {
          lit: { type: 'bool', default: true },
          charge: { type: 'counter', default: 2, min: 0, max: 5 },
          facing: { type: 'enum', default: 'down', values: ['up', 'down'] },
        },
      },
    });
    const fields = mapSchemaInspectorObjectStateFields(definition, {
      ...TARGET,
      state: { lit: true, charge: 3, facing: 'down' },
    });
    expect(fields.map(({ id }) => id)).toEqual([
      'live-state-charge', 'live-state-facing', 'live-state-lit',
    ]);
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'live-state-lit', label: 'Lit', value: true,
        action: expect.objectContaining({ command: 'set_entity_state', stateKey: 'lit' }) }),
      expect.objectContaining({ id: 'live-state-charge', value: 3,
        why: expect.stringContaining('integer from 0 to 5') }),
    ]));

    const missing = mapSchemaInspectorObjectStateFields(definition, {
      ...TARGET,
      state: { lit: 'yes', facing: 'sideways' },
    });
    expect(missing.every(({ readOnly, action }) => readOnly === true && action === undefined)).toBe(true);
    expect(missing[0]?.why).toContain('missing or invalid');
    const wrongDefinition = mapSchemaInspectorObjectStateFields(definition, {
      ...TARGET,
      definitionId: 'object:other',
    });
    expect(wrongDefinition.every(({ readOnly }) => readOnly === true)).toBe(true);
    expect(wrongDefinition[0]?.why).toContain('does not match');
  });

  it('accepts only the allowlisted adapter command and validated state schemas', () => {
    expect(parseMapSchemaInspectorAction(ACTION)).toEqual(ACTION);
    expect(parseMapSchemaInspectorAction({ ...ACTION, command: 'admin_reset_world' })).toBeNull();
    expect(parseMapSchemaInspectorAction({ ...ACTION, adapter: 'reducer_by_name' })).toBeNull();
    expect(parseMapSchemaInspectorAction({ ...ACTION, stateKey: '__proto__' })).toBeNull();
    expect(parseMapSchemaInspectorAction({ ...ACTION, roles: ['moderator'] })).toBeNull();
    expect(parseMapSchemaInspectorAction({ ...ACTION,
      value: { type: 'enum', default: 'open', values: [] } })).toBeNull();
    expect(parseMapSchemaInspectorAction({ ...ACTION,
      value: { type: 'counter', default: 3, min: 5, max: 1 } })).toBeNull();
  });

  it('parses booleans, enum values, and bounded counters without coercion', () => {
    expect(parseMapSchemaInspectorEdit(FIELD, ACTION, ' false ')).toBe(false);
    expect(() => parseMapSchemaInspectorEdit(FIELD, ACTION, 'yes'))
      .toThrow('map_schema_edit_boolean_invalid');
    expect(() => parseMapSchemaInspectorEdit(FIELD, ACTION, 'true')).toThrow('admin_no_changes');

    const enumAction = { ...ACTION, stateKey: 'facing',
      value: { type: 'enum' as const, default: 'down', values: ['up', 'down'] } };
    const enumField = { ...FIELD, value: 'down' };
    expect(parseMapSchemaInspectorEdit(enumField, enumAction, 'up')).toBe('up');
    expect(() => parseMapSchemaInspectorEdit(enumField, enumAction, 'left'))
      .toThrow('map_schema_edit_option_invalid');

    const counterAction = { ...ACTION, stateKey: 'charge',
      value: { type: 'counter' as const, default: 2, min: 0, max: 5 } };
    const counterField = { ...FIELD, value: 2 };
    expect(parseMapSchemaInspectorEdit(counterField, counterAction, '5')).toBe(5);
    for (const invalid of ['1.5', '+2', '6', '9007199254740992']) {
      expect(() => parseMapSchemaInspectorEdit(counterField, counterAction, invalid))
        .toThrow('map_schema_edit_counter_invalid');
    }
  });

  it('keeps unsupported, read-only, unauthorized, and non-live fields visibly unavailable with WHY', () => {
    expect(mapSchemaInspectorAvailability(FIELD, AUTHORITY)).toMatchObject({
      editable: true,
      authority: 'admin',
      reason: expect.stringContaining('WHY Controls'),
    });
    const cases = [
      [{ ...FIELD, action: undefined }, AUTHORITY, 'No supported mutation action'],
      [{ ...FIELD, readOnly: true }, AUTHORITY, 'metadata is read only'],
      [{ ...FIELD, why: '' }, AUTHORITY, 'no WHY'],
      [FIELD, { ...AUTHORITY, connected: false }, 'Connect to live authority'],
      [FIELD, { ...AUTHORITY, routeAccess: 'read_only' }, 'route is read only'],
      [FIELD, { ...AUTHORITY, role: 'content_editor' }, 'owner or administrator'],
      [FIELD, { ...AUTHORITY, target: { ...TARGET, entityKind: 'npc' } }, 'no safe generic'],
      [FIELD, { ...AUTHORITY, target: null }, 'Select a live entity'],
    ] as const;
    for (const [field, authority, text] of cases) {
      expect(mapSchemaInspectorAvailability(field, authority)).toMatchObject({
        editable: false,
        reason: expect.stringContaining(text),
      });
    }
    expect(mapSchemaInspectorAvailability({ ...FIELD,
      action: { ...ACTION, roles: ['owner'] } }, AUTHORITY)).toMatchObject({
      editable: false,
      reason: expect.stringContaining('Administrator access is not declared'),
    });
  });

  it('discovers current state, dry-runs, then commits the exact fingerprint with a matching inverse audit', async () => {
    const { api, calls } = probe();
    const model = new MapSchemaInspectorActionModel(api, () => 'map-schema-lit-41');
    await model.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light');
    expect(api.listEntities).toHaveBeenCalledWith(expect.objectContaining({
      kinds: ['placeable'], spaceId: '0', x0: 12, y0: 14, x1: 12, y1: 14,
      text: '41', cursor: null, limit: 100,
    }));
    expect(calls[0]).toMatchObject({
      mutation: {
        operation: 'set_entity_state', entityId: '41', patch: { lit: false },
        reason: 'Disable selected torch light', clientMutationId: 'map-schema-lit-41', dryRun: true,
      },
      expectedBaseVersion: '',
      previewFingerprint: null,
    });
    expect(model.pending()).toMatchObject({
      fieldId: 'state-lit', entityId: '41', definitionId: 'object:standing_torch',
      stateKey: 'lit', before: true, after: false,
      baseVersion: 'object:exact-before', previewFingerprint: 'preview:schema-exact',
    });
    await expect(model.commit(false, AUTHORITY)).rejects.toThrow('map_schema_confirmation_required');
    expect(calls).toHaveLength(1);
    const result = await model.commit(true, AUTHORITY);
    expect(calls[1]).toMatchObject({
      mutation: { operation: 'set_entity_state', entityId: '41', patch: { lit: false }, dryRun: false },
      expectedBaseVersion: 'object:exact-before',
      previewFingerprint: 'preview:schema-exact',
    });
    expect(result).toMatchObject({ committed: true, audit: { operation: 'set_entity_state' } });
    expect(model.pending()).toBeNull();
  });

  it('rejects the generic mock adapter when its committed audit omits the required inverse receipt', async () => {
    const target = Object.freeze({
      ...TARGET,
      entityId: '21',
      tileX: 20,
      tileY: 16,
    });
    const authority = Object.freeze({ ...AUTHORITY, target });
    const model = new MapSchemaInspectorActionModel(createMockAdminObjectsApi(), () => 'map-schema-real-api');
    await model.preview(FIELD, authority, 'false', 'Disable selected standing torch');
    expect(model.pending()).toMatchObject({
      entityId: '21', before: true, after: false,
      baseVersion: 'entity-v1', previewFingerprint: expect.stringMatching(/^preview:/u),
    });
    await expect(model.commit(true, authority)).rejects.toThrow('commit_receipt_mismatch');
    expect(model.pending()).toBeNull();
  });

  it('rejects a stale selected projection before opening a mutation receipt', async () => {
    const { api, calls } = probe();
    vi.mocked(api.listEntities).mockResolvedValueOnce(entityPage({ lit: false }));
    const model = new MapSchemaInspectorActionModel(api, () => 'map-schema-stale');
    await expect(model.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light'))
      .rejects.toThrow('map_schema_entity_stale');
    expect(calls).toHaveLength(0);
    expect(model.pending()).toBeNull();
  });

  it('validates reason and mutation identity before reads and rechecks authority before commit', async () => {
    const invalidReason = probe();
    const invalidReasonModel = new MapSchemaInspectorActionModel(invalidReason.api, () => 'valid-id');
    await expect(invalidReasonModel.preview(FIELD, AUTHORITY, 'false', 'short'))
      .rejects.toThrow('admin_invalid_reason');
    expect(invalidReason.api.listEntities).not.toHaveBeenCalled();

    const invalidId = probe();
    const invalidIdModel = new MapSchemaInspectorActionModel(invalidId.api, () => 'not valid!');
    await expect(invalidIdModel.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light'))
      .rejects.toThrow('admin_invalid_mutation_id');
    expect(invalidId.api.listEntities).not.toHaveBeenCalled();

    const guarded = probe();
    const guardedModel = new MapSchemaInspectorActionModel(guarded.api, () => 'map-schema-role-loss');
    await guardedModel.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light');
    await expect(guardedModel.commit(true, { ...AUTHORITY, role: 'content_editor' }))
      .rejects.toThrow('map_schema_field_read_only');
    expect(guarded.calls).toHaveLength(1);
    expect(guardedModel.pending()).not.toBeNull();
    await guardedModel.commit(true, AUTHORITY);
    expect(guarded.calls).toHaveLength(2);
  });

  it('cancels late discovery/preview adoption and rejects all work after disposal', async () => {
    const { api } = probe();
    let resolvePage!: (page: AdminEntityPage) => void;
    vi.mocked(api.listEntities).mockReturnValueOnce(new Promise((resolve) => { resolvePage = resolve; }));
    const model = new MapSchemaInspectorActionModel(api, () => 'map-schema-cancel');
    const pending = model.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light');
    model.cancel();
    resolvePage(entityPage());
    await expect(pending).rejects.toThrow('map_schema_action_cancelled');
    expect(api.mutate).not.toHaveBeenCalled();
    expect(model.pending()).toBeNull();

    model.dispose();
    await expect(model.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light'))
      .rejects.toThrow('map_schema_action_disposed');
    await expect(model.commit(true, AUTHORITY)).rejects.toThrow('map_schema_action_disposed');
  });

  it('clears the retained receipt before stale commit rejection and verifies audit identity', async () => {
    const { api, calls } = probe();
    const model = new MapSchemaInspectorActionModel(api, () => 'map-schema-stale-commit');
    await model.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light');
    vi.mocked(api.mutate).mockRejectedValueOnce(new Error('admin_preview_stale'));
    await expect(model.commit(true, AUTHORITY)).rejects.toThrow('admin_preview_stale');
    expect(model.pending()).toBeNull();
    expect(calls[0]).toMatchObject({ expectedBaseVersion: '', previewFingerprint: null });

    const mismatch = probe();
    const bad = new MapSchemaInspectorActionModel(mismatch.api, () => 'map-schema-bad-audit');
    await bad.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light');
    vi.mocked(mismatch.api.mutate).mockImplementationOnce(async (mutation) => ({
      preview: mutationPreview(),
      previewFingerprint: 'preview:schema-exact',
      committed: true,
      version: 'object:after',
      audit: audit(mutation, false),
      notice: null,
    }));
    await expect(bad.commit(true, AUTHORITY)).rejects.toThrow('commit_receipt_mismatch');
    expect(bad.pending()).toBeNull();
  });

  it('rejects preview receipts for another entity or a different field', async () => {
    const { api } = probe();
    vi.mocked(api.mutate).mockResolvedValueOnce({
      preview: { ...mutationPreview(), target: { kind: 'entity', entityId: '42' } },
      previewFingerprint: 'preview:schema-exact',
      committed: false,
      version: 'object:exact-before',
      audit: null,
      notice: null,
    });
    const model = new MapSchemaInspectorActionModel(api, () => 'map-schema-mismatch');
    await expect(model.preview(FIELD, AUTHORITY, 'false', 'Disable selected torch light'))
      .rejects.toThrow('admin_preview_receipt_mismatch');
  });
});
