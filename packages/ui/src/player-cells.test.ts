import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, compileEquipmentLoadout, MAIN_HAND_SELECTED_SLOT } from '@orchard/sim';
import { mainHandRow } from './overworld-ui.js';
import { BACKPACK_EQUIPMENT_INDEX, OFF_HAND_EQUIPMENT_INDEX, isAccessibleCarriedCell, selectedCellRow, type PlayerCellStack } from './player-cells.js';

const row = (container: PlayerCellStack['container'], index: number, itemKind: string): PlayerCellStack => ({ container, index, itemKind, quantity: 1 });

describe('player cells (Uncapped Storage step 4c)', () => {
  it('names the fixed equipment cells by their paper-doll ids', () => {
    expect(BACKPACK_EQUIPMENT_INDEX).toBe(4);
    expect(OFF_HAND_EQUIPMENT_INDEX).toBe(5);
  });

  it('resolves a stored selectedSlot to a hotbar cell or, for 33, the Main Hand cell', () => {
    const rows = [row('hotbar', 3, 'apple'), row('equipment', 3, 'hearth_rare_sword'), row('backpack', 23, 'stone')];
    expect(selectedCellRow(rows, 3)?.itemKind).toBe('apple');
    expect(selectedCellRow(rows, MAIN_HAND_SELECTED_SLOT)?.itemKind).toBe('hearth_rare_sword');
    expect(mainHandRow(rows)?.itemKind).toBe('hearth_rare_sword');
    // Selection values outside the hotbar and the Main Hand name no cell.
    expect(selectedCellRow(rows, 23)).toBeUndefined();
    expect(selectedCellRow(rows, -1)).toBeUndefined();
  });

  it('reads carried cells by the world rule: the hotbar and the bag\'s open backpack cells only', () => {
    expect(isAccessibleCarriedCell({ container: 'hotbar', index: 9 }, 8)).toBe(true);
    expect(isAccessibleCarriedCell({ container: 'hotbar', index: 10 }, 8)).toBe(false);
    expect(isAccessibleCarriedCell({ container: 'backpack', index: 7 }, 8)).toBe(true);
    expect(isAccessibleCarriedCell({ container: 'backpack', index: 8 }, 8)).toBe(false);
    expect(isAccessibleCarriedCell({ container: 'backpack', index: 19 }, 20)).toBe(true);
    for (const container of ['equipment', 'crafting', 'stash'] as const) expect(isAccessibleCarriedCell({ container, index: 0 }, 20)).toBe(false);
  });

  it('feeds the sim loadout the cells themselves, with no legacy global numbering (Uncapped Storage step 5)', () => {
    const cells = [row('hotbar', 0, 'axe'), row('backpack', 25, 'stone'), { ...row('equipment', 3, 'hearth_legendary_sword'), durability: 100 },
      row('crafting', 8, 'plank'), row('stash', 0, 'torch')];
    const registry = bootstrapContentRegistry();
    const loadout = (rows: readonly PlayerCellStack[]) => compileEquipmentLoadout({ registry, inventory: rows,
      selectedSlot: MAIN_HAND_SELECTED_SLOT, trainedRanks: {} }).modifiers;
    // The Main Hand sword's modifiers apply: the loadout found it at equipment cell 3.
    expect(loadout(cells).length).toBeGreaterThan(loadout(cells.filter(cell => cell.container !== 'equipment')).length);
    // A backpack of any size moves no equipment: a sword in backpack cell 23 (legacy global 33) is not the Main Hand.
    expect(loadout([row('backpack', 23, 'hearth_legendary_sword')])).toEqual(loadout([]));
  });
});
