import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import { INVENTORY_SLOT_COUNT } from './inventory-layout.js';
import { planNewPlayerLoadout } from './new-player-loadout.js';

describe('authored new-player loadout planning', () => {
  it('preserves the exact current starter inventory, selected tool, and durability', () => {
    const plan = planNewPlayerLoadout(bootstrapContentRegistry(), {
      existingCharacter: false,
      inventoryCapacity: INVENTORY_SLOT_COUNT,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok || !plan.apply) throw new Error('starter loadout was not applied');
    expect(plan.definitionId).toBe('loadout:new_player');
    expect(plan.selectedSlot).toBe(0);
    expect(plan.equippedKind).toBe('axe');
    expect(plan.slots.slice(0, 6)).toEqual([
      { slot: 0, itemKind: 'axe', quantity: 1, durability: 200, lit: true },
      { slot: 1, itemKind: 'pickaxe', quantity: 1, durability: 250, lit: true },
      { slot: 2, itemKind: 'hoe', quantity: 1, durability: 180, lit: true },
      { slot: 3, itemKind: 'watering_can', quantity: 1, durability: 160, lit: true },
      { slot: 4, itemKind: 'bow', quantity: 1, durability: 300, lit: true },
      { slot: 5, itemKind: 'arrow', quantity: 32, durability: 0, lit: true },
    ]);
    expect(plan.slots.slice(6)).toHaveLength(INVENTORY_SLOT_COUNT - 6);
    expect(plan.slots.slice(6).every(({ itemKind, quantity, durability, lit }) => (
      itemKind === 'empty' && quantity === 0 && durability === 0 && lit
    ))).toBe(true);
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
      inventoryCapacity: INVENTORY_SLOT_COUNT,
    });
    expect(plan).toMatchObject({
      ok: true, apply: true, definitionId: 'loadout:island_arrival', equippedKind: 'survey_hatchet',
    });
    if (!plan.ok || !plan.apply) throw new Error('renamed loadout was not applied');
    expect(plan.slots[0]).toEqual({
      slot: 0, itemKind: 'survey_hatchet', quantity: 1, durability: 777, lit: true,
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
      inventoryCapacity: INVENTORY_SLOT_COUNT,
    })).toEqual({ ok: false, code: 'loadout_item_invalid' });

    const noLoadoutRegistry = buildContentRegistry(rows.filter(({ id }) => id !== loadoutRow.id)).registry;
    expect(planNewPlayerLoadout(noLoadoutRegistry, {
      existingCharacter: true,
      inventoryCapacity: 0,
    })).toEqual({ ok: true, apply: false, slots: [] });
  });
});
