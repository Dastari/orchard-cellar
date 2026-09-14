import { describe, expect, it } from 'vitest';
import { migrateEquipmentLayout } from './inventory-migration.js';

describe('Body slot migration', () => {
  const rows = Array.from({length:48},(_,slot) => ({
    slot, itemKind: `item_${slot}`, quantity: slot+1, durability: slot*7, lit: slot%2 === 0,
    additionalState: `preserve-${slot}`,
  }));
  it('moves all nine crafting cells without altering count, durability, light or other metadata', () => {
    const result = migrateEquipmentLayout(rows,0);
    expect(result.insertedEmptySlots).toEqual([39]);
    expect(result.slots.slice(0,39)).toEqual(rows.slice(0,39));
    expect(result.slots.slice(39)).toEqual(rows.slice(39).map(row => ({...row,slot:row.slot+1})));
    const metadata = (row: (typeof rows)[number]) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'slot'));
    expect(result.slots.map(metadata)).toEqual(rows.map(metadata));
    expect(rows[39]!.slot).toBe(39);
    expect(result.slots.at(-1)!.slot).toBe(48);
    expect(migrateEquipmentLayout(result.slots,result.version).slots).toEqual(result.slots);
  });
  it('fails closed on unknown layout or conflicting rows before providing a write plan', () => {
    expect(()=>migrateEquipmentLayout(rows,2)).toThrow('version_unsupported');
    expect(()=>migrateEquipmentLayout([...rows,{...rows[0]!,slot:48}],0)).toThrow('rows_invalid');
    expect(()=>migrateEquipmentLayout([...rows,rows[0]!],0)).toThrow('rows_invalid');
    expect(()=>migrateEquipmentLayout([{...rows[0]!,slot:3.5}],0)).toThrow('rows_invalid');
  });
  it('supports sparse old storage without inventing item rows', () => {
    const result=migrateEquipmentLayout([rows[47]!],0);
    expect(result.slots).toEqual([{...rows[47]!,slot:48}]);
    expect(result.insertedEmptySlots).toEqual([39]);
  });
});
