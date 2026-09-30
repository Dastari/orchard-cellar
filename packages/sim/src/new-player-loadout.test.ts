import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import { inventoryContainerSlotCount } from './inventory-layout.js';
import { planNewPlayerLoadout } from './new-player-loadout.js';

describe('authored new-player loadout planning', () => {
  it('preserves the exact current starter inventory, selected tool, and durability', () => {
    const plan = planNewPlayerLoadout(bootstrapContentRegistry(), {
      existingCharacter: false,
      containerCapacity: inventoryContainerSlotCount,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok || !plan.apply) throw new Error('starter loadout was not applied');
    expect(plan.definitionId).toBe('loadout:new_player');
    expect(plan.selectedSlot).toBe(0);
    expect(plan.equippedKind).toBe('axe');
    // Exactly the cells the legacy global slots 0-5 addressed, and nothing else: vacant cells are not planned.
    expect(plan.selectedCell).toEqual({ container: 'hotbar', index: 0 });
    expect(plan.cells).toEqual([
      { container: 'hotbar', index: 0, itemKind: 'axe', quantity: 1, durability: 200, lit: true },
      { container: 'hotbar', index: 1, itemKind: 'pickaxe', quantity: 1, durability: 250, lit: true },
      { container: 'hotbar', index: 2, itemKind: 'hoe', quantity: 1, durability: 180, lit: true },
      { container: 'hotbar', index: 3, itemKind: 'watering_can', quantity: 1, durability: 160, lit: true },
      { container: 'hotbar', index: 4, itemKind: 'bow', quantity: 1, durability: 180, lit: true },
      { container: 'hotbar', index: 5, itemKind: 'arrow', quantity: 32, durability: 0, lit: true },
    ]);
  });

  it('retains behavior when both the loadout and a durable starter tool receive arbitrary ids', () => {
    const rows = bootstrapContentRows();
    const loadoutRow = rows.find(({ id }) => id === 'loadout:new_player');
    const axeRow = rows.find(({ id }) => id === 'item:axe');
    if (loadoutRow === undefined || axeRow === undefined) throw new Error('missing renamed loadout fixtures');
    const loadout = JSON.parse(String(loadoutRow.json)) as {
      readonly entries: readonly Record<string, unknown>[];
    } & Record<string, unknown>;
    const axe = JSON.parse(String(axeRow.json)) as Record<string, unknown>;
    const renamed = buildContentRegistry([
      ...rows.filter(({ id }) => id !== loadoutRow.id),
      {
        id: 'item:survey_hatchet', kind: 'item', slug: 'survey_hatchet',
        json: JSON.stringify({
          ...axe,
          id: 'item:survey_hatchet',
          displayName: 'Survey Hatchet',
          durability: { max: 777, repairMaterial: 'item:wood', repairCost: 5 },
        }),
      },
      {
        id: 'loadout:island_arrival', kind: 'loadout', slug: 'island_arrival',
        json: JSON.stringify({
          ...loadout,
          id: 'loadout:island_arrival',
          entries: loadout.entries.map((entry, index) => index === 0
            ? { ...entry, item: 'item:survey_hatchet' }
            : entry),
        }),
      },
    ]);
    expect(renamed.report.errors).toEqual([]);
    const plan = planNewPlayerLoadout(renamed.registry, {
      existingCharacter: false,
      containerCapacity: inventoryContainerSlotCount,
    });
    expect(plan).toMatchObject({
      ok: true, apply: true, definitionId: 'loadout:island_arrival', equippedKind: 'survey_hatchet',
    });
    if (!plan.ok || !plan.apply) throw new Error('renamed loadout was not applied');
    expect(plan.cells[0]).toEqual({
      container: 'hotbar', index: 0, itemKind: 'survey_hatchet', quantity: 1, durability: 777, lit: true,
    });
  });

  it('fails closed for invalid active item policy while never planning writes for an existing character', () => {
    const rows = bootstrapContentRows();
    const loadoutRow = rows.find(({ id }) => id === 'loadout:new_player');
    const arrowRow = rows.find(({ id }) => id === 'item:arrow');
    if (loadoutRow === undefined || arrowRow === undefined) throw new Error('missing fail-closed fixtures');
    const arrow = JSON.parse(String(arrowRow.json)) as Record<string, unknown>;
    const invalid = buildContentRegistry(rows.map((row) => row.id !== arrowRow.id ? row : {
      ...row,
      json: JSON.stringify({ ...arrow, maxStack: 16 }),
    }));
    expect(invalid.report.valid).toBe(false);
    expect(planNewPlayerLoadout(invalid.registry, {
      existingCharacter: false,
      containerCapacity: inventoryContainerSlotCount,
    })).toEqual({ ok: false, code: 'loadout_item_invalid' });

    const noLoadoutRegistry = buildContentRegistry(rows.filter(({ id }) => id !== loadoutRow.id)).registry;
    expect(planNewPlayerLoadout(noLoadoutRegistry, {
      existingCharacter: true,
      containerCapacity: () => 0,
    })).toEqual({ ok: true, apply: false, cells: [] });
  });

  it('translates every legacy container once and plans the same cells from the container-addressed form', () => {
    const rows = bootstrapContentRows();
    const loadoutRow = rows.find(({ id }) => id === 'loadout:new_player');
    if (loadoutRow === undefined) throw new Error('missing loadout fixture');
    const loadout = JSON.parse(String(loadoutRow.json)) as Record<string, unknown>;
    const withLoadout = (json: Record<string, unknown>) => {
      const built = buildContentRegistry([...rows.filter(({ id }) => id !== loadoutRow.id), { ...loadoutRow, json: JSON.stringify(json) }]);
      expect(built.report.errors).toEqual([]);
      return planNewPlayerLoadout(built.registry, { existingCharacter: false, containerCapacity: inventoryContainerSlotCount });
    };
    // Legacy global slots in every legacy container, selecting the Main Hand (legacy slot 33).
    const legacy = withLoadout({
      ...loadout,
      selectedSlot: 33,
      entries: [
        { item: 'item:wood', quantity: 5, slot: 40 },
        { item: 'item:sword', quantity: 1, slot: 33 },
        { item: 'item:torch', quantity: 1, slot: 12, lit: false },
        { item: 'item:axe', quantity: 1, slot: 9 },
      ],
    });
    const cells = [
      { container: 'hotbar', index: 9, itemKind: 'axe', quantity: 1, durability: 200, lit: true },
      { container: 'backpack', index: 2, itemKind: 'torch', quantity: 1, lit: false },
      { container: 'equipment', index: 3, itemKind: 'sword', quantity: 1, lit: true },
      { container: 'crafting', index: 0, itemKind: 'wood', quantity: 5, durability: 0, lit: true },
    ];
    expect(legacy).toMatchObject({
      ok: true, apply: true, selectedSlot: 33, selectedCell: { container: 'equipment', index: 3 }, equippedKind: 'sword',
    });
    if (!legacy.ok || !legacy.apply) throw new Error('legacy loadout was not applied');
    expect(legacy.cells).toMatchObject(cells);
    // The same kit authored by container and index plans exactly the same cells and selection.
    const addressed = withLoadout({
      ...loadout,
      selectedSlot: undefined,
      selectedCell: { container: 'equipment', index: 3 },
      entries: [
        { item: 'item:wood', quantity: 5, cell: { container: 'crafting', index: 0 } },
        { item: 'item:sword', quantity: 1, cell: { container: 'equipment', index: 3 } },
        { item: 'item:torch', quantity: 1, cell: { container: 'backpack', index: 2 }, lit: false },
        { item: 'item:axe', quantity: 1, cell: { container: 'hotbar', index: 9 } },
      ],
    });
    expect(addressed).toEqual({ ...legacy, definitionId: 'loadout:new_player' });
    // And the bootstrap kit rewritten by cell plans what the bootstrap kit plans.
    const bootstrapEntries = loadout['entries'] as readonly { readonly slot: number }[];
    const rewritten = withLoadout({
      ...loadout,
      selectedSlot: undefined,
      selectedCell: { container: 'hotbar', index: 0 },
      entries: bootstrapEntries.map(({ slot, ...entry }) => ({ ...entry, cell: { container: 'hotbar', index: slot } })),
    });
    expect(rewritten).toEqual(planNewPlayerLoadout(bootstrapContentRegistry(), {
      existingCharacter: false, containerCapacity: inventoryContainerSlotCount,
    }));
  });

  it('refuses cells past a container, legacy slots past the frozen layout, and a selection no tool can hold', () => {
    const rows = bootstrapContentRows();
    const loadoutRow = rows.find(({ id }) => id === 'loadout:new_player');
    if (loadoutRow === undefined) throw new Error('missing loadout fixture');
    const loadout = JSON.parse(String(loadoutRow.json)) as Record<string, unknown>;
    const plan = (json: Record<string, unknown>) => planNewPlayerLoadout(buildContentRegistry([
      ...rows.filter(({ id }) => id !== loadoutRow.id), { ...loadoutRow, json: JSON.stringify(json) },
    ]).registry, { existingCharacter: false, containerCapacity: inventoryContainerSlotCount });
    const axe = { item: 'item:axe', quantity: 1 };
    expect(plan({ ...loadout, selectedSlot: 49, entries: [{ ...axe, slot: 49 }] }))
      .toEqual({ ok: false, code: 'loadout_capacity_exceeded' });
    expect(plan({ ...loadout, selectedSlot: undefined, selectedCell: { container: 'hotbar', index: 10 }, entries: [
      { ...axe, cell: { container: 'hotbar', index: 10 } },
    ] })).toEqual({ ok: false, code: 'loadout_capacity_exceeded' });
    expect(plan({ ...loadout, selectedSlot: 12, entries: [{ ...axe, slot: 12 }] }))
      .toEqual({ ok: false, code: 'loadout_item_invalid' });
  });
});
it('plans the seven basic crafting guides only for a new character, without changing its carried kit', () => {
  const registry = bootstrapContentRegistry();
  const plan = planNewPlayerLoadout(registry, { existingCharacter: false, containerCapacity: inventoryContainerSlotCount });
  if (!plan.ok || !plan.apply) throw Error('missing new-player plan');
  expect(plan.knownRecipeIds).toEqual(['planks', 'sticks', 'axe', 'pickaxe', 'hoe', 'shovel', 'workbench']);
  expect(plan.cells).toHaveLength(6);
  expect(planNewPlayerLoadout(registry, { existingCharacter: true, containerCapacity: inventoryContainerSlotCount })).toEqual({ ok: true, apply: false, cells: [] });
  const recipes = new Map(registry.recipes); recipes.delete('recipe:workbench');
  expect(planNewPlayerLoadout({ ...registry, recipes }, { existingCharacter: false, containerCapacity: inventoryContainerSlotCount })).toEqual({ ok: false, code: 'loadout_recipe_invalid' });
});
