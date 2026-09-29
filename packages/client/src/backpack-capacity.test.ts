import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_BACKPACK_CAPACITY, bootstrapContentRegistry, type ContentRegistry, type PlayerContainerCellRef, type PlayerContainerId } from '@orchard/sim';
import { clientBackpackSlotCapacity, equippedBackpackCapacity, reachableCarriedRows } from './backpack-capacity.js';

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

  it('keeps every other case: no bag, the shipped bag, large bags, retired bags and debug slots', () => {
    expect(clientBackpackSlotCapacity(registry, undefined)).toBe(8);
    expect(clientBackpackSlotCapacity(registry, { itemKind: 'backpack', quantity: 0 })).toBe(8);
    expect(clientBackpackSlotCapacity(registry, worn('backpack'))).toBe(20);
    // No 20-cell clamp since Uncapped Storage step 5: the bag alone decides, as the server does.
    expect(clientBackpackSlotCapacity(withBag('trunk', 40), worn('trunk'))).toBe(40);
    expect(clientBackpackSlotCapacity(withBag('wagon', 1000), worn('wagon'))).toBe(1000);
    expect(clientBackpackSlotCapacity(withBag('satchel', 12), worn('satchel'))).toBe(12);
    expect(clientBackpackSlotCapacity(withBag('old_pack', 12, true), worn('old_pack'))).toBe(8);
    expect(clientBackpackSlotCapacity(registry, undefined, 14)).toBe(14);
    // Debug slots open more cells, as the server's do.
    expect(clientBackpackSlotCapacity(registry, undefined, 30)).toBe(30);
  });

  it('is the one rule: the client model and the world menu containers both call the shared sim function', () => {
    const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    const world = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/const backpackSlotCapacity = clientBackpackSlotCapacity\(/u);
    const worldRule = world.slice(world.indexOf('function accessibleInventoryContainerCapacity('), world.indexOf('function equippedInventoryCapacity('));
    expect(worldRule).toContain('return accessibleBackpackCapacity(equippedCapacity, debugBackpackSlots);');
  });
});

describe('BUG-068: the client refuses a bow draw the server would refuse', () => {
  const arrows = (container: PlayerContainerId, index: number) => ({ container, index, itemKind: 'arrow', quantity: 10 });
  const bag = (itemKind: string) => ({ container: 'equipment' as const, index: 4, itemKind, quantity: 1 });
  it('keeps only the hotbar and the accessible backpack, for the equipped bag and debug slots', () => {
    const rows = [arrows('hotbar', 1), arrows('backpack', 7), arrows('backpack', 11), arrows('backpack', 12), arrows('backpack', 19),
      arrows('crafting', 0), arrows('crafting', 8), arrows('stash', 0)];
    const cells = (registry: ContentRegistry, carried: readonly (PlayerContainerCellRef & { itemKind: string; quantity: number })[], debug = 0) =>
      reachableCarriedRows(registry, carried, debug).map(row => `${row.container}:${row.index}`);
    expect(cells(registry, rows)).toEqual(['hotbar:1', 'backpack:7']);
    expect(cells(registry, rows, 12)).toEqual(['hotbar:1', 'backpack:7', 'backpack:11']);
    expect(cells(withBag('satchel', 12), [...rows, bag('satchel')])).toEqual(['hotbar:1', 'backpack:7', 'backpack:11']);
    expect(cells(registry, [...rows, bag('backpack')])).toEqual(['hotbar:1', 'backpack:7', 'backpack:11', 'backpack:12', 'backpack:19']);
  });

  it('feeds every client bow readiness check', () => {
    const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    const checks = main.split('itemActionRejection(').slice(1);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    for (const check of checks) expect(check.slice(0, 220)).toContain('reachableCarriedRows(latestSnapshot.content.registry');
  });
});
