import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED, bootstrapContentRegistry } from '@orchard/sim';
import {
  acceptanceCellsEqual,
  acceptanceCellsWellFormed,
  placeableAcceptanceCapacity,
  placeableAcceptanceConfirmation,
  planPlaceableAcceptance,
  type AcceptanceCell,
  type AcceptancePlanInput,
} from './placeable-interaction-acceptance-policy.js';

const registry = bootstrapContentRegistry();
const identity = '01'.repeat(32);
const target = {
  id: 17n, kind: 'fruit_press', definitionId: 'object:fruit_press',
  tileX: 11, tileY: 10, spaceId: 0, placedBy: identity, carriedBy: null,
  open: false, processStartTick: null, processStartedBy: null, processInputKind: null,
};
// Sparse container-cell views: an empty fruit press has no rows at all.
const cells: AcceptanceCell[] = [];

function input(changes: Partial<AcceptancePlanInput> = {}): AcceptancePlanInput {
  return {
    registry, mode: 'inspect', host: 'https://orchard.dastari.net/', database: 'orchard-cellar-world',
    identity, kind: 'fruit_press', target,
    position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED, facing: 'right', spaceId: 0 },
    cells, activePlaceableId: null, allowProduction: false, ...changes,
  };
}

describe('placeable interaction acceptance policy', () => {
  it('checks sparse cells against the captured live capacity: no row per slot, no duplicates, nothing past capacity', () => {
    const chest = (index: number, placeableId = 18n): AcceptanceCell => ({
      placeableId, index, itemKind: 'apple', quantity: 2, durability: 0, lit: true,
    });
    const capacity = placeableAcceptanceCapacity(registry, 'chest');
    expect(capacity).toBeGreaterThan(2);
    // An empty container is no rows; a partly filled one is only its occupied cells, in any order.
    expect(acceptanceCellsWellFormed([], 18n, capacity)).toBe(true);
    expect(acceptanceCellsWellFormed([chest(capacity - 1), chest(0)], 18n, capacity)).toBe(true);
    // Duplicate indices, another placeable's cell, a cell past the capacity, or a vacant row are not a valid view.
    expect(acceptanceCellsWellFormed([chest(1), chest(1)], 18n, capacity)).toBe(false);
    expect(acceptanceCellsWellFormed([chest(1, 19n)], 18n, capacity)).toBe(false);
    expect(acceptanceCellsWellFormed([chest(capacity)], 18n, capacity)).toBe(false);
    expect(acceptanceCellsWellFormed([{ ...chest(1), itemKind: 'empty', quantity: 0 }], 18n, capacity)).toBe(false);
    // The live capacity is the captured content's: a cell valid at 4 is past the capacity at the bootstrap's 3.
    const press = registry.objects.get('object:fruit_press')!;
    const expanded = { ...press, components: { ...press.components,
      container: { ...press.components.container!, slotCount: 4 } } };
    const liveRegistry = { objects: new Map(registry.objects).set(press.id, expanded) };
    const pressCell = { placeableId: 17n, index: 3, itemKind: 'apple', quantity: 1, durability: 0, lit: true };
    expect(planPlaceableAcceptance(input({ registry: liveRegistry, cells: [pressCell] })).issues)
      .not.toContain('acceptance_cell_projection_invalid');
    expect(planPlaceableAcceptance(input({ cells: [pressCell] })).issues)
      .toContain('acceptance_cell_projection_invalid');
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
      cells: [{ placeableId: 17n, index: 0, itemKind: 'apple', quantity: 1, durability: 0, lit: true }],
    }));
    expect(plan.issues).toEqual(expect.arrayContaining([
      'acceptance_target_not_owned', 'acceptance_session_already_active',
      'acceptance_target_wrong_space', 'acceptance_facing_invalid',
      'acceptance_processor_active', 'acceptance_processor_not_empty',
    ]));
    expect(plan.inspection.durableSlotFingerprint).toBe('owner_scoped_unavailable');
    expect(planPlaceableAcceptance(input({ cells: [
      { placeableId: 17n, index: 0, itemKind: 'apple', quantity: 1, durability: 0, lit: true },
      { placeableId: 17n, index: 0, itemKind: 'pear', quantity: 1, durability: 0, lit: true },
    ] })).issues).toContain('acceptance_cell_projection_invalid');
  });

  it('accepts a migrated generic chest radially without requiring the faced tile', () => {
    const chestCells: AcceptanceCell[] = [
      { placeableId: 18n, index: 0, itemKind: 'apple', quantity: 4, durability: 0, lit: true },
      { placeableId: 18n, index: 5, itemKind: 'wood', quantity: 9, durability: 0, lit: true },
    ];
    const chestInput = input({ kind: 'chest', target: { ...target, id: 18n, kind: 'chest',
      definitionId: 'object:chest', tileX: 11, tileY: 10, placedBy: identity },
    position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED, facing: 'up', spaceId: 0 },
    cells: chestCells });
    expect(planPlaceableAcceptance(chestInput)).toMatchObject({
      inspection: {
        runtimeDefinitionId: 'object:chest', reachPolicy: 'radial_two_tiles',
        owned: true, durableSlotFingerprint: 'available',
      },
      issues: [],
    });
    expect(acceptanceCellsEqual(chestCells, [...chestCells].reverse())).toBe(true);
    expect(acceptanceCellsEqual(chestCells, chestCells.map((cell) => (
      cell.index === 0 ? { ...cell, quantity: 3 } : cell
    )))).toBe(false);
    // Emptying a cell removes its row, which is a change.
    expect(acceptanceCellsEqual(chestCells, chestCells.slice(1))).toBe(false);
  });

  it('represents nonowned chest inspection without false kind, facing, or slot errors', () => {
    const chestInput = input({
      kind: 'chest',
      target: { ...target, id: 18n, kind: 'chest', definitionId: 'object:chest',
        tileX: 11, tileY: 10, placedBy: '02'.repeat(32) },
      position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED, facing: 'up', spaceId: 0 },
      cells: [],
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
    expect(placeableAcceptanceCapacity(registry, kind)).toBe(capacity);
    const legacyInput = input({
      kind,
      target: { ...target, id, kind, definitionId: '', placedBy: identity },
      cells: [],
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

  it('has no item movement path and verifies cells before, while open and after closing', () => {
    expect(source).not.toMatch(/movePlaceableItem|moveInventoryItem|moveItem\(|quickMove|adminSetContainerSlot/);
    expect(source).toContain('acceptanceCellsEqual(cellsBefore, openCells(client))');
    expect(source).toContain('acceptanceCellsWellFormed(openCells(client), targetId, capacity)');
    expect(source).toContain('acceptanceCellsEqual(cellsBefore, placedCells(client, targetId))');
    expect(source).toContain('client.connection.reducers.closePlaceable({})');
    expect(source).toContain('if (interactionDispatched)');
    expect(source).toContain('acceptanceCellsEqual(cellsBefore, cellsAfter)');
    expect(source).toContain('itemsMoved: 0');
  });

  it('acknowledges inventory protocol 2 before interacting and names an older world plainly', () => {
    const acknowledge = source.indexOf('await acknowledgeProtocol(client);');
    expect(acknowledge).toBeGreaterThan(source.indexOf("acceptance_preflight_failed"));
    expect(acknowledge).toBeLessThan(source.indexOf('client.connection.reducers.interactEntity('));
    expect(source).toContain('version: CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION');
    expect(source).toContain('acceptance_world_not_on_container_cells');
    expect(source).toContain('acceptance_subscription_rejected:${ACCEPTANCE_PROTOCOL_REQUIRED}');
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
      'ownOpenPlaceableContainerCells', 'ownPlacedPlaceableContainerCells']) expect(subscribe).toContain(`tables.${table}`);
    expect(subscribe).toContain('row.kind.eq(kind)');
    // The frozen legacy slot views are never read.
    expect(source).not.toMatch(/ownOpenPlaceableSlots|ownPlacedPlaceableSlots/u);
  });
});
