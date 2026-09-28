import { describe, expect, it } from 'vitest';
import { Identity } from 'spacetimedb';
import { MAIN_HAND_SELECTED_SLOT, selectedSlotCell, U32_MAX } from '@orchard/sim';
import type { PlayerContainerCell } from '@orchard/world-bindings/types';
import { PlayerContainerCells } from './player-container-cells.js';

const identity = Identity.fromString('2'.padStart(64, '0'));
function cell(container: string, index: number, itemKind = 'wood', quantity = 1): PlayerContainerCell {
  return { id: `${identity.toHexString()}:${container}:${index}`, identity, container, index, itemKind, quantity, durability: 0, lit: false };
}
const key = (row: { readonly container: string; readonly index: number }) => `${row.container}:${row.index}`;

describe('the client container-cell model (Uncapped Storage step 4c)', () => {
  it('keys each row by its own container and u32 index, so containers never share numbers', () => {
    const cells = new PlayerContainerCells();
    // Hotbar 0, backpack 0, equipment 0, crafting 0 and stash 0 are five different cells.
    for (const container of ['stash', 'crafting', 'equipment', 'backpack', 'hotbar']) expect(cells.set(cell(container, 0, container))).toBe(true);
    expect(cells.set(cell('backpack', 20, 'past the legacy bag'))).toBe(true);
    expect(cells.set(cell('backpack', 300))).toBe(true);
    expect(cells.set(cell('backpack', U32_MAX))).toBe(true);
    expect(cells.size).toBe(8);
    expect([...cells].map(key)).toEqual(['hotbar:0', 'backpack:0', 'backpack:20', 'backpack:300', `backpack:${U32_MAX}`,
      'equipment:0', 'crafting:0', 'stash:0']);
    expect(cells.get({ container: 'equipment', index: 0 })?.itemKind).toBe('equipment');
    // Legacy slot 30 was equipment 0; here backpack 20 is its own cell.
    expect(cells.get({ container: 'backpack', index: 20 })?.itemKind).toBe('past the legacy bag');
    expect(cells.carried().map(key)).not.toContain('stash:0');
    expect(cells.container('stash').map(key)).toEqual(['stash:0']);
  });

  it('ignores a row it cannot place instead of guessing', () => {
    const cells = new PlayerContainerCells();
    expect(cells.set(cell('satchel', 0))).toBe(false);
    expect(cells.set(cell('backpack', -1))).toBe(false);
    expect(cells.set(cell('backpack', 1.5))).toBe(false);
    expect(cells.set(cell('backpack', U32_MAX + 1))).toBe(false);
    expect(cells.size).toBe(0);
  });

  it('updates in place, deletes only the row it names, and bumps the revision on every change', () => {
    const cells = new PlayerContainerCells();
    const start = cells.revision;
    cells.set(cell('hotbar', 2, 'apple', 3));
    const afterInsert = cells.revision;
    expect(afterInsert).toBeGreaterThan(start);
    const carried = cells.carried();
    cells.set(cell('hotbar', 2, 'apple', 5));
    expect(cells.size).toBe(1);
    expect(cells.get({ container: 'hotbar', index: 2 })?.quantity).toBe(5);
    expect(cells.revision).toBeGreaterThan(afterInsert);
    expect(cells.carried()).not.toBe(carried);
    // A stash change leaves the carried view as it was.
    const beforeStash = cells.carried();
    cells.set(cell('stash', 9));
    expect(cells.carried()).toBe(beforeStash);
    expect(cells.delete({ id: 'someone-else', container: 'hotbar', index: 2 })).toBe(false);
    expect(cells.delete(cell('hotbar', 2))).toBe(true);
    expect(cells.get({ container: 'hotbar', index: 2 })).toBeUndefined();
    cells.clear();
    expect(cells.size).toBe(0);
    expect([...cells]).toEqual([]);
  });

  it('resolves a stored selectedSlot only through selectedSlotCell: 33 is the Main Hand cell', () => {
    const cells = new PlayerContainerCells();
    cells.set(cell('equipment', 3, 'hearth_rare_sword'));
    cells.set(cell('hotbar', 3, 'apple'));
    cells.set(cell('backpack', 23, 'stone'));
    expect(cells.get(selectedSlotCell(MAIN_HAND_SELECTED_SLOT))?.itemKind).toBe('hearth_rare_sword');
    expect(cells.get(selectedSlotCell(3))?.itemKind).toBe('apple');
    // Legacy global 33 would have been backpack 23 under a bigger bag; the selection never means that.
    expect(cells.get(selectedSlotCell(23))).toBeUndefined();
    expect(cells.get(null)).toBeUndefined();
  });
});
