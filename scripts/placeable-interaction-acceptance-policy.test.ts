import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED, bootstrapContentRegistry } from '@orchard/sim';
import {
  acceptanceSlotsEqual,
  placeableAcceptanceCapacity,
  placeableAcceptanceConfirmation,
  planPlaceableAcceptance,
  type AcceptancePlanInput,
  type AcceptanceSlot,
} from './placeable-interaction-acceptance-policy.js';

const registry = bootstrapContentRegistry();
const identity = '01'.repeat(32);
const target = {
  id: 17n, kind: 'fruit_press', definitionId: 'object:fruit_press',
  tileX: 11, tileY: 10, spaceId: 0, placedBy: identity, carriedBy: null,
  open: false, processStartTick: null, processStartedBy: null, processInputKind: null,
};
const slots: AcceptanceSlot[] = Array.from({ length: 3 }, (_, slot) => ({
  placeableId: 17n, slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true,
}));

function input(changes: Partial<AcceptancePlanInput> = {}): AcceptancePlanInput {
  return {
    registry, mode: 'inspect', host: 'https://orchard.dastari.net/', database: 'orchard-cellar-world',
    identity, kind: 'fruit_press', target,
    position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED, facing: 'right', spaceId: 0 },
    slots, activePlaceableId: null, allowProduction: false, ...changes,
  };
}

describe('placeable interaction acceptance policy', () => {
  it('uses the captured live container capacity and rejects missing or duplicate custody slots', () => {
    const press = registry.objects.get('object:fruit_press')!;
    const expanded = { ...press, components: { ...press.components,
      container: { ...press.components.container!, slotCount: 4 } } };
    const liveRegistry = { objects: new Map(registry.objects).set(press.id, expanded) };
    expect(planPlaceableAcceptance(input({ registry: liveRegistry })).issues)
      .toContain('acceptance_slot_projection_incomplete');
    expect(planPlaceableAcceptance(input({ slots: [slots[0]!, slots[0]!, slots[2]!] })).issues)
      .toContain('acceptance_slot_projection_incomplete');
    expect(planPlaceableAcceptance(input({ target: { ...target, definitionId: 'object:missing' } })).issues)
      .toContain('acceptance_container_definition_unavailable');
  });

  it('reports a stable exact-target confirmation during read-first inspection', () => {
    const plan = planPlaceableAcceptance(input());
    expect(plan).toEqual({ production: true,
      confirmation: `accept-placeable-interaction|https://orchard.dastari.net|orchard-cellar-world|${identity}|fruit_press|17|0:11:10`,
      inspection: {
        runtimeDefinitionId: 'object:fruit_press', reachPolicy: 'exact_faced_tile',
        owned: true, durableSlotFingerprint: 'available',
      },
      issues: [] });
    expect(placeableAcceptanceConfirmation(input())).toBe(plan.confirmation);
    expect(planPlaceableAcceptance(input({ host: 'http://127.0.0.1:3000' })).production).toBe(true);
  });

  it('requires identity, exact confirmation, and a separate production opt-in before interaction', () => {
    const pending = planPlaceableAcceptance(input({ mode: 'interact' }));
    expect(pending.issues).toEqual([
      'acceptance_expected_identity_required',
      'acceptance_confirmation_required',
      'acceptance_production_opt_in_required',
    ]);
    const authorizedInput = input({ mode: 'interact', expectedIdentity: identity, allowProduction: true });
    expect(planPlaceableAcceptance({ ...authorizedInput,
      confirmation: placeableAcceptanceConfirmation(authorizedInput) }).issues).toEqual([]);
  });

  it('fails closed on ownership, session, position, processor, and slot projection hazards', () => {
    const plan = planPlaceableAcceptance(input({
      activePlaceableId: 99n,
      target: { ...target, placedBy: '02'.repeat(32), processStartTick: 4n },
      position: { x: 1, y: 1, facing: 'bogus', spaceId: 2 },
      slots: [{ ...slots[0]!, itemKind: 'apple', quantity: 1 }],
    }));
    expect(plan.issues).toEqual(expect.arrayContaining([
      'acceptance_target_not_owned', 'acceptance_session_already_active',
      'acceptance_target_wrong_space', 'acceptance_facing_invalid',
      'acceptance_processor_active', 'acceptance_processor_not_empty',
    ]));
    expect(plan.inspection.durableSlotFingerprint).toBe('owner_scoped_unavailable');
    expect(planPlaceableAcceptance(input({ slots: slots.slice(0, 1) })).issues)
      .toContain('acceptance_slot_projection_incomplete');
  });

  it('accepts a migrated generic chest radially without requiring the faced tile', () => {
    const chestSlots: AcceptanceSlot[] = Array.from({ length: placeableAcceptanceCapacity(registry, 'chest') },
      (_, slot) => ({ placeableId: 18n, slot, itemKind: slot === 0 ? 'apple' : 'empty',
        quantity: slot === 0 ? 4 : 0, durability: 0, lit: true }));
    const chestInput = input({ kind: 'chest', target: { ...target, id: 18n, kind: 'chest',
      definitionId: 'object:chest', tileX: 11, tileY: 10, placedBy: identity },
    position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED, facing: 'up', spaceId: 0 },
    slots: chestSlots });
    expect(planPlaceableAcceptance(chestInput)).toMatchObject({
      inspection: {
        runtimeDefinitionId: 'object:chest', reachPolicy: 'radial_two_tiles',
        owned: true, durableSlotFingerprint: 'available',
      },
      issues: [],
    });
    expect(acceptanceSlotsEqual(chestSlots, [...chestSlots].reverse())).toBe(true);
    expect(acceptanceSlotsEqual(chestSlots, chestSlots.map((slot) => (
      slot.slot === 0 ? { ...slot, quantity: 3 } : slot
    )))).toBe(false);
  });

  it('represents nonowned chest inspection without false kind, facing, or slot errors', () => {
    const chestInput = input({
      kind: 'chest',
      target: { ...target, id: 18n, kind: 'chest', definitionId: 'object:chest',
        tileX: 11, tileY: 10, placedBy: '02'.repeat(32) },
      position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED, facing: 'up', spaceId: 0 },
      slots: [],
    });
    expect(planPlaceableAcceptance(chestInput)).toMatchObject({
      inspection: { owned: false, durableSlotFingerprint: 'owner_scoped_unavailable' },
      issues: ['acceptance_target_not_owned'],
    });
  });

  it.each([
    ['fruit_press', 21n, 3],
    ['fermentation_cask', 22n, 2],
  ] as const)('resolves a legacy empty definition id for %s by runtime kind', (kind, id, capacity) => {
    const processorSlots: AcceptanceSlot[] = Array.from({ length: capacity }, (_, slot) => ({
      placeableId: id, slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true,
    }));
    const legacyInput = input({
      kind,
      target: { ...target, id, kind, definitionId: '', placedBy: identity },
      slots: processorSlots,
    });
    expect(planPlaceableAcceptance(legacyInput)).toMatchObject({
      inspection: { runtimeDefinitionId: `object:${kind}`, reachPolicy: 'exact_faced_tile' },
      issues: [],
    });
  });
});

describe('placeable interaction live harness safety contract', () => {
  const source = readFileSync(new URL('./placeable-interaction-acceptance.ts', import.meta.url), 'utf8');

  it('loads without connecting and defaults to read-first inspection', async () => {
    await expect(import('./placeable-interaction-acceptance.js'))
      .resolves.toMatchObject({ main: expect.any(Function) });
    expect(source).toContain("process.argv[2] ?? 'inspect'");
    expect(source).toContain("if (mode === 'inspect')");
  });

  it('has no item movement path and verifies slots before and after closing', () => {
    expect(source).not.toMatch(/movePlaceableItem|moveInventoryItem|quickMove|adminSetContainerSlot/);
    expect(source).toContain('acceptanceSlotsEqual(slotsBefore, slotSnapshots(client, targetId))');
    expect(source).toContain('client.connection.reducers.closePlaceable({})');
    expect(source).toContain('if (interactionDispatched)');
    expect(source).toContain('acceptanceSlotsEqual(slotsBefore, slotsAfter)');
    expect(source).toContain('itemsMoved: 0');
  });

  it('requires exact target, identity, confirmation, and explicit production opt-in', () => {
    expect(source).toContain("PLACEABLE_ACCEPTANCE_TARGET_ID_required");
    expect(source).toContain("PLACEABLE_ACCEPTANCE_EXPECT_IDENTITY");
    expect(source).toContain("PLACEABLE_ACCEPTANCE_CONFIRM");
    expect(source).toContain("PLACEABLE_ACCEPTANCE_ALLOW_PRODUCTION");
    expect(source).toContain("=== 'YES'");
  });

  it('subscribes only to the target kind and caller-scoped interaction surfaces', () => {
    const subscribe = source.slice(source.indexOf('function subscribe'), source.indexOf('function identityHex'));
    for (const table of ['worldPlaceable', 'playerPosition', 'ownActivePlaceable',
      'ownOpenPlaceableSlots', 'ownPlacedPlaceableSlots']) expect(subscribe).toContain(`tables.${table}`);
    expect(subscribe).toContain('row.kind.eq(kind)');
  });
});
