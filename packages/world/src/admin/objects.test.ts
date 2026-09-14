import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRegistry,
  bootstrapContentRows,
  buildContentRegistry,
  itemPolicyResolver,
  type ItemPolicyResolver,
} from '@orchard/sim';
import { parseAdminReason } from './contracts.js';
import {
  AdminObjectError,
  adminObjectDocument,
  adminObjectVersion,
  planAdminObjectMutation,
  requireAdminObjectAuthority,
  type AdminObjectDefinition,
  type AdminObjectMutation,
  type AdminObjectState,
} from './objects.js';

const parsedReason = parseAdminReason('Resolve object incident 5102');
if (!parsedReason.ok) throw new Error('invalid reason');
const reason = parsedReason.value;
const bootstrapItemPolicy = itemPolicyResolver(bootstrapContentRegistry());

function customItemPolicy(
  itemKind: string,
  maxStack: number,
  tags: readonly string[] = [],
  retired = false,
): ItemPolicyResolver {
  const template = bootstrapContentRegistry().items.get('item:wood');
  if (template === undefined) throw new Error('missing item policy template');
  const id = `item:${itemKind}`;
  const built = buildContentRegistry([...bootstrapContentRows(), {
    id,
    kind: 'item',
    slug: itemKind,
    json: {
      ...template,
      id,
      displayName: itemKind,
      maxStack,
      tags,
      ...(retired ? { retired: true, replacement: 'item:wood' } : {}),
    },
  }]);
  if (!built.report.valid) throw new Error(`invalid item policy fixture: ${JSON.stringify(built.report.errors)}`);
  return itemPolicyResolver(built.registry);
}

const definitions = new Map<string, AdminObjectDefinition>([
  ['object:chest', { definitionId: 'object:chest', entityKind: 'chest', capacity: 2,
    stateKeys: ['open'], initialState: { open: false }, processorInitialState: null }],
  ['object:lamp', { definitionId: 'object:lamp', entityKind: 'placeable', capacity: 0,
    stateKeys: ['lit'], initialState: { lit: false }, processorInitialState: null }],
  ['object:furnace', { definitionId: 'object:furnace', entityKind: 'placeable', capacity: 2,
    stateKeys: ['lit'], initialState: { lit: false },
    processorInitialState: { status: 'idle', progress: 0, startedTick: null } }],
  ['object:furnace_reinforced', { definitionId: 'object:furnace_reinforced', entityKind: 'placeable', capacity: 3,
    stateKeys: ['lit'], initialState: { lit: true },
    processorInitialState: { status: 'idle', progress: 0, startedTick: null } }],
]);

function state(): AdminObjectState {
  return {
    entities: [
      { entityId: '10', entityKind: 'chest', definitionId: 'object:chest', ownerIdentity: 'owner-a',
        spaceId: '0', tileX: 4, tileY: 5, state: { open: false },
        slots: [{ itemKind: 'apple', quantity: 3 }, null], processor: null, damage: 2 },
      { entityId: '11', entityKind: 'placeable', definitionId: 'object:furnace', ownerIdentity: 'owner-a',
        spaceId: '0', tileX: 8, tileY: 9, state: { lit: true },
        slots: [{ itemKind: 'wood', quantity: 2 }, { itemKind: 'stone', quantity: 1 }],
        processor: { status: 'running', progress: 4, startedTick: '90' }, damage: 3 },
      { entityId: '7', entityKind: 'npc', definitionId: 'npc:fisherman_fin', ownerIdentity: null,
        spaceId: '0', tileX: 20, tileY: 21, state: { activity: 'fish_wait' },
        slots: [], processor: null, damage: 0 },
    ],
    resources: [{ entityId: '500', definitionId: 'resource:tree', spaceId: '0',
      tileX: 1, tileY: 1, state: { health: 4 } }],
    spilledItems: [],
    nextEntityId: 100n,
    nextWorldItemId: 1_000n,
  };
}

const resourceCandidates = [
  { entityId: '500', definitionId: 'resource:tree', spaceId: '0', tileX: 1, tileY: 1, state: { health: 4 } },
  { entityId: '501', definitionId: 'resource:rock', spaceId: '0', tileX: 2, tileY: 2, state: { health: 6 } },
  { entityId: '502', definitionId: 'resource:tree', spaceId: '1', tileX: 2, tileY: 2, state: { health: 4 } },
];

function mutation<T extends AdminObjectMutation>(value: {
  readonly operation: AdminObjectMutation['operation'];
  readonly dryRun: boolean;
} & Record<string, unknown>): T {
  return { reason, clientMutationId: `object-${value.operation}`, ...value } as T;
}

function plan(
  input: AdminObjectState,
  operation: AdminObjectMutation,
  itemPolicy: ItemPolicyResolver = bootstrapItemPolicy,
) {
  return planAdminObjectMutation(input, {
    mutation: operation,
    expectedBaseVersion: adminObjectVersion(input),
    previewFingerprint: null,
    nowMicros: 10_000n,
    definitions,
    blockedTiles: new Set(['0:30:30']),
    resourceCandidates,
    itemPolicy,
  });
}

describe('W4 administration object and container kernel', () => {
  it('spawns, moves and patches only known object state fields', () => {
    const input = state();
    const spawned = plan(input, mutation({ operation: 'spawn_entity', dryRun: true,
      definitionId: 'object:lamp', spaceId: '0', tileX: 12, tileY: 13,
      state: { lit: true }, ownerIdentity: 'owner-a' }));
    expect(spawned.after.entities[spawned.after.entities.length - 1]).toMatchObject({
      entityId: '100', definitionId: 'object:lamp', tileX: 12, tileY: 13, state: { lit: true },
    });
    expect(spawned.after.nextEntityId).toBe(101n);
    const moved = plan(input, mutation({ operation: 'move_entity', dryRun: true,
      entityId: '10', spaceId: '1', tileX: 7, tileY: 8 }));
    expect(moved.after.entities[0]).toMatchObject({ spaceId: '1', tileX: 7, tileY: 8 });
    expect(moved.after.entities[0]?.slots).toEqual(input.entities[0]?.slots);
    expect(() => plan(input, mutation({ operation: 'set_entity_state', dryRun: true,
      entityId: '10', patch: { secret: true } }))).toThrowError(new AdminObjectError('admin_invalid_patch'));
    const carried = { ...input, entities: input.entities.map((entity) => entity.entityId === '10'
      ? { ...entity, custody: { carriedBy: 'player-a' } }
      : entity) };
    expect(() => plan(carried, mutation({ operation: 'move_entity', dryRun: true,
      entityId: '10', spaceId: '1', tileX: 7, tileY: 8 })))
      .toThrowError(new AdminObjectError('admin_payload_invalid'));
  });

  it('spills custody deterministically and requires a second explicit reason to destroy it', () => {
    const input = state();
    const spilled = plan(input, mutation({ operation: 'despawn_entity', dryRun: true,
      entityId: '10', spillContents: true }));
    expect(spilled.after.entities.some(({ entityId }) => entityId === '10')).toBe(false);
    expect(spilled.after.spilledItems).toEqual([{
      entityId: '1000', sourceEntityId: '10', spaceId: '0', tileX: 4, tileY: 5,
      itemKind: 'apple', quantity: 3,
    }]);
    expect(spilled.after.nextWorldItemId).toBe(1_001n);
    expect(() => plan(input, mutation({ operation: 'despawn_entity', dryRun: true,
      entityId: '10', spillContents: false }))).toThrowError(new AdminObjectError('admin_payload_invalid'));
    expect(plan(input, mutation({ operation: 'despawn_entity', dryRun: true,
      entityId: '10', spillContents: false, destructionReason: reason })).after.spilledItems).toEqual([]);
  });

  it('edits slots, repairs processors and replaces objects without losing custody or position', () => {
    const input = state();
    const slot = plan(input, mutation({ operation: 'set_container_slot', dryRun: true,
      entityId: '10', slot: 1, stack: { itemKind: 'wood', quantity: 5 } }));
    expect(slot.after.entities[0]?.slots[1]).toEqual({ itemKind: 'wood', quantity: 5 });
    const repaired = plan(input, mutation({ operation: 'repair_entity', dryRun: true, entityId: '11' }));
    expect(repaired.after.entities[1]).toMatchObject({
      damage: 0, slots: input.entities[1]?.slots,
      processor: { status: 'idle', progress: 0, startedTick: null },
    });
    const replaced = plan(input, mutation({ operation: 'replace_entity', dryRun: true,
      entityId: '11', definitionId: 'object:furnace_reinforced' }));
    expect(replaced.after.entities[1]).toMatchObject({
      entityId: '11', definitionId: 'object:furnace_reinforced', spaceId: '0', tileX: 8, tileY: 9,
      processor: input.entities[1]?.processor,
    });
    expect(replaced.after.entities[1]?.slots).toEqual([
      { itemKind: 'wood', quantity: 2 }, { itemKind: 'stone', quantity: 1 }, null,
    ]);
  });

  it('relocates only NPCs and respawns bounded missing resource candidates', () => {
    const input = state();
    expect(plan(input, mutation({ operation: 'relocate_npc', dryRun: true,
      npcId: '7', spaceId: '0', tileX: 25, tileY: 26 })).after.entities[2])
      .toMatchObject({ tileX: 25, tileY: 26, state: { activity: 'fish_wait' } });
    expect(() => plan(input, mutation({ operation: 'relocate_npc', dryRun: true,
      npcId: '10', spaceId: '0', tileX: 25, tileY: 26 })))
      .toThrowError(new AdminObjectError('admin_entity_not_found'));
    const respawned = plan(input, mutation({ operation: 'respawn_resources', dryRun: true,
      spaceId: '0', x0: 0, y0: 0, x1: 4, y1: 4 }));
    expect(respawned.after.resources.map(({ entityId }) => entityId)).toEqual(['500', '501']);
    expect(() => plan(input, mutation({ operation: 'respawn_resources', dryRun: true,
      spaceId: '0', x0: 0, y0: 0, x1: 100, y1: 100 })))
      .toThrowError(new AdminObjectError('admin_payload_invalid'));
  });

  it('requires exact preview/base parity and produces operation-shaped inverse audit', () => {
    const input = state();
    const dryRun = mutation<AdminObjectMutation>({ operation: 'set_container_slot', dryRun: true,
      entityId: '10', slot: 1, stack: { itemKind: 'wood', quantity: 2 } });
    const preview = plan(input, dryRun);
    const commit = { ...dryRun, dryRun: false } as AdminObjectMutation;
    const committed = planAdminObjectMutation(input, {
      mutation: commit, expectedBaseVersion: preview.baseVersion,
      previewFingerprint: preview.previewFingerprint, nowMicros: 10_001n,
      definitions, blockedTiles: new Set(), resourceCandidates, itemPolicy: bootstrapItemPolicy,
    });
    expect(adminObjectDocument(committed.after)).toEqual(adminObjectDocument(preview.after));
    expect(committed.audit.inverse).toEqual({
      operation: 'set_container_slot',
      args: { entityId: '10', slot: 1, stack: null },
    });
    expect(committed.notice).toContain('set container slot');
    expect(() => planAdminObjectMutation(input, {
      mutation: commit, expectedBaseVersion: preview.baseVersion,
      previewFingerprint: 'preview:wrong', nowMicros: 10_001n,
      definitions, blockedTiles: new Set(), resourceCandidates, itemPolicy: bootstrapItemPolicy,
    })).toThrowError(new AdminObjectError('admin_preview_required'));
    expect(() => planAdminObjectMutation(input, {
      mutation: commit, expectedBaseVersion: 'objects:stale',
      previewFingerprint: preview.previewFingerprint, nowMicros: 10_001n,
      definitions, blockedTiles: new Set(), resourceCandidates, itemPolicy: bootstrapItemPolicy,
    })).toThrowError(new AdminObjectError('admin_preview_stale'));
    expect(() => planAdminObjectMutation(input, {
      mutation: dryRun, expectedBaseVersion: 'objects:stale',
      previewFingerprint: null, nowMicros: 10_001n,
      definitions, blockedTiles: new Set(), resourceCandidates, itemPolicy: bootstrapItemPolicy,
    })).toThrowError(new AdminObjectError('admin_preview_stale'));
    expect(() => planAdminObjectMutation(input, {
      mutation: commit, expectedBaseVersion: '',
      previewFingerprint: preview.previewFingerprint, nowMicros: 10_001n,
      definitions, blockedTiles: new Set(), resourceCandidates, itemPolicy: bootstrapItemPolicy,
    })).toThrowError(new AdminObjectError('admin_preview_stale'));
  });

  it('allows owner/admin and rejects support, moderator and friend object mutation', () => {
    const operation = mutation<AdminObjectMutation>({ operation: 'move_entity', dryRun: true,
      entityId: '10', spaceId: '0', tileX: 6, tileY: 6 });
    expect(() => requireAdminObjectAuthority('owner', operation)).not.toThrow();
    expect(() => requireAdminObjectAuthority('admin', operation)).not.toThrow();
    for (const role of ['support', 'moderator', 'friend'] as const) {
      expect(() => requireAdminObjectAuthority(role, operation))
        .toThrowError(new AdminObjectError('admin_role_forbidden'));
    }
  });

  it('resolves arbitrary active stack limits and quest-unique policy from the supplied registry', () => {
    const stackPolicy = customItemPolicy('admin_crystal', 7);
    const added = plan(state(), mutation({
      operation: 'set_container_slot', dryRun: true,
      entityId: '10', slot: 1, stack: { itemKind: 'admin_crystal', quantity: 7 },
    }), stackPolicy);
    expect(added.after.entities[0]?.slots[1]).toEqual({ itemKind: 'admin_crystal', quantity: 7 });
    expect(() => plan(state(), mutation({
      operation: 'set_container_slot', dryRun: true,
      entityId: '10', slot: 1, stack: { itemKind: 'admin_crystal', quantity: 8 },
    }), stackPolicy)).toThrowError(new AdminObjectError('admin_stack_invalid'));

    const uniquePolicy = customItemPolicy('admin_relic', 99, ['item.quest_unique']);
    const ownsRelic: AdminObjectState = {
      ...state(),
      entities: state().entities.map((entity) => entity.entityId === '10'
        ? { ...entity, slots: [{ itemKind: 'admin_relic', quantity: 1 }, null] }
        : entity),
    };
    expect(() => plan(ownsRelic, mutation({
      operation: 'set_container_slot', dryRun: true,
      entityId: '10', slot: 1, stack: { itemKind: 'admin_relic', quantity: 1 },
    }), uniquePolicy)).toThrowError(new AdminObjectError('admin_unique_item_conflict'));
  });

  it('fails closed for absent, retired, or omitted policy without rejecting preserved legacy rows', () => {
    const retiredPolicy = customItemPolicy('retired_admin_crystal', 7, [], true);
    for (const [itemKind, itemPolicy] of [
      ['absent_admin_crystal', bootstrapItemPolicy],
      ['retired_admin_crystal', retiredPolicy],
    ] as const) {
      expect(() => plan(state(), mutation({
        operation: 'set_container_slot', dryRun: true,
        entityId: '10', slot: 1, stack: { itemKind, quantity: 1 },
      }), itemPolicy)).toThrowError(new AdminObjectError('admin_stack_invalid'));
    }

    const input = state();
    expect(() => planAdminObjectMutation(input, {
      mutation: mutation({ operation: 'set_container_slot', dryRun: true,
        entityId: '10', slot: 1, stack: { itemKind: 'wood', quantity: 1 } }),
      expectedBaseVersion: adminObjectVersion(input),
      previewFingerprint: null,
      nowMicros: 10_000n,
      definitions,
      blockedTiles: new Set(),
      resourceCandidates,
    })).toThrowError(new AdminObjectError('admin_stack_invalid'));

    const withLegacyRow: AdminObjectState = {
      ...state(),
      entities: state().entities.map((entity) => entity.entityId === '11'
        ? { ...entity, slots: [{ itemKind: 'removed_legacy_item', quantity: 400 }, entity.slots[1] ?? null] }
        : entity),
    };
    const repaired = plan(withLegacyRow, mutation({
      operation: 'repair_entity', dryRun: true, entityId: '11',
    }), customItemPolicy('admin_crystal', 7));
    expect(repaired.after.entities[1]?.slots[0]).toEqual({
      itemKind: 'removed_legacy_item', quantity: 400,
    });
  });
});
