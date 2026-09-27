import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKPACK_SLOT_COUNT, BASE_BACKPACK_CAPACITY, bootstrapContentRegistry, type ContentRegistry } from '@orchard/sim';
import { clientBackpackSlotCapacity, equippedBackpackCapacity } from './backpack-capacity.js';

const registry = bootstrapContentRegistry();
/** The bootstrap registry plus bags authored with other capacities (none ships below 20 today). */
function withBag(itemId: string, inventoryCapacity: number, retired = false): ContentRegistry {
  const backpack = registry.items.get('item:backpack')!;
  return { ...registry, items: new Map(registry.items).set(`item:${itemId}`, { ...backpack, id: `item:${itemId}`, equip: { ...backpack.equip!, inventoryCapacity }, ...(retired ? { retired } : {}) }) };
}
const worn = (itemKind: string) => ({ itemKind, quantity: 1 });

describe('BUG-054: the client uses the world\'s backpack capacity rule', () => {
  it('opens the base 8 cells for a bag authored with 6, as the server does', () => {
    const small = withBag('pouch', 6);
    expect(equippedBackpackCapacity(small, worn('pouch'))).toBe(6);
    // Before BUG-054 the client computed min(20, 6) = 6 and showed cells 6 and 7 as unavailable.
    expect(clientBackpackSlotCapacity(small, worn('pouch'))).toBe(BASE_BACKPACK_CAPACITY);
  });

  it('keeps every other case: no bag, the shipped bag, oversized bags, retired bags and debug slots', () => {
    expect(clientBackpackSlotCapacity(registry, undefined)).toBe(8);
    expect(clientBackpackSlotCapacity(registry, { itemKind: 'backpack', quantity: 0 })).toBe(8);
    expect(clientBackpackSlotCapacity(registry, worn('backpack'))).toBe(20);
    expect(clientBackpackSlotCapacity(withBag('trunk', 40), worn('trunk'))).toBe(BACKPACK_SLOT_COUNT);
    expect(clientBackpackSlotCapacity(withBag('satchel', 12), worn('satchel'))).toBe(12);
    expect(clientBackpackSlotCapacity(withBag('old_pack', 12, true), worn('old_pack'))).toBe(8);
    expect(clientBackpackSlotCapacity(registry, undefined, 14)).toBe(14);
    // Debug slots are capped at the 20 cells, as the server caps them (the client did not before).
    expect(clientBackpackSlotCapacity(registry, undefined, 30)).toBe(BACKPACK_SLOT_COUNT);
  });

  it('is the one rule: the client model and the world menu containers both call the shared sim function', () => {
    const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    const world = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/const backpackSlotCapacity = clientBackpackSlotCapacity\(/u);
    const worldRule = world.slice(world.indexOf('function accessibleInventoryContainerCapacity('), world.indexOf('function equippedInventoryCapacity('));
    expect(worldRule).toContain('return accessibleBackpackCapacity(equippedCapacity, debugBackpackSlots);');
  });
});
