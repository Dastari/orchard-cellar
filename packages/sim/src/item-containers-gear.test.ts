import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_ITEM_CONTAINER_CONTENT,
  clickContainerSlot,
  distributeItemStack,
  insertItemStack,
  insertItemStackPartial,
  itemStacksCompatible,
  moveItemStacks,
  quickMoveItemStack,
  sortAndStackContainer,
  stackMetadataMatches,
  type ContainerSnapshot,
  type ItemStack,
} from './item-containers.js';
import type { ItemGear } from './item-gear.js';

const content = BOOTSTRAP_ITEM_CONTAINER_CONTENT;
const gear = (instanceId: string, fields: Partial<ItemGear> = {}): ItemGear => ({
  instanceId, rollVersion: 1, rarity: 'rare', material: 'steel', itemLevel: 19,
  prefix: 'mighty', suffix: 'fortitude', lineage: '', legendary: '', seed: 1, ...fields,
});
// Wood stacks to 99, so any merge would be visible; a sword is a one-per-slot kind.
const woodCopy = (instanceId: string): ItemStack => ({ itemKind: 'wood', quantity: 1, gear: gear(instanceId) });
const container = (id: string, slots: (ItemStack | null)[]): ContainerSnapshot => ({ id, capacity: slots.length, slots });

describe('instanced gear stacks', () => {
  it('never match any other stack, including an identical copy of themselves', () => {
    const copy = woodCopy('10');
    expect(stackMetadataMatches(copy, { ...copy })).toBe(false);
    expect(itemStacksCompatible(copy, { itemKind: 'wood', quantity: 1 })).toBe(false);
    expect(itemStacksCompatible({ itemKind: 'wood', quantity: 1 }, copy)).toBe(false);
    expect(itemStacksCompatible(copy, woodCopy('11'))).toBe(false);
    expect(itemStacksCompatible({ itemKind: 'wood', quantity: 1 }, { itemKind: 'wood', quantity: 3 })).toBe(true);
  });

  it('insert into empty slots instead of merging, and keep their record', () => {
    const start = container('backpack', [{ itemKind: 'wood', quantity: 5 }, woodCopy('20'), null, null]);
    const inserted = insertItemStack(start, woodCopy('21'));
    expect(inserted.ok && inserted.container.slots).toEqual([
      { itemKind: 'wood', quantity: 5 }, woodCopy('20'), woodCopy('21'), null,
    ]);
    const plain = insertItemStack(start, { itemKind: 'wood', quantity: 2 });
    expect(plain.ok && plain.container.slots[0]).toEqual({ itemKind: 'wood', quantity: 7 });
    expect(plain.ok && plain.container.slots[1]).toEqual(woodCopy('20'));
    const partial = insertItemStackPartial(container('overflow', [woodCopy('22'), null]), woodCopy('23'), content);
    expect(partial.ok && partial.container.slots).toEqual([woodCopy('22'), woodCopy('23')]);
    expect(insertItemStack(container('full', [woodCopy('24')]), woodCopy('25'))).toEqual({ ok: false, code: 'container_full' });
  });

  it('are always exactly one copy', () => {
    const doubled: ItemStack = { itemKind: 'wood', quantity: 2, gear: gear('30') };
    expect(insertItemStack(container('backpack', [null, null]), doubled)).toEqual({ ok: false, code: 'invalid_quantity' });
    expect(moveItemStacks({ a: container('a', [doubled]), b: container('b', [null]) },
      { fromContainer: 'a', fromIndex: 0, toContainer: 'b', toIndex: 0, quantity: 1 }, content))
      .toEqual({ ok: false, code: 'unknown_item_kind' });
  });

  it('keep each copy separate when sorting, ordered deterministically by instance id', () => {
    const slots = [woodCopy('100'), { itemKind: 'wood', quantity: 40 }, woodCopy('9'), { itemKind: 'wood', quantity: 70 }, null, null];
    const sorted = sortAndStackContainer(container('chest', slots), content);
    expect(sorted.ok && sorted.container.slots).toEqual([
      { itemKind: 'wood', quantity: 99 }, { itemKind: 'wood', quantity: 11 }, woodCopy('9'), woodCopy('100'), null, null,
    ]);
    const reversed = sortAndStackContainer(container('chest', [...slots].reverse()), content);
    expect(reversed.ok && reversed.container.slots).toEqual(sorted.ok && sorted.container.slots);
  });

  it('carry the record through moves, swaps, quick moves and the cursor', () => {
    const sword = { itemKind: 'hearth_rare_sword', quantity: 1, gear: gear('40') };
    const moved = moveItemStacks({ a: container('a', [sword]), b: container('b', [woodCopy('41')]) },
      { fromContainer: 'a', fromIndex: 0, toContainer: 'b', toIndex: 0, quantity: 1 }, content);
    expect(moved.ok && moved.outcome).toBe('swap');
    expect(moved.ok && [moved.containers.a!.slots[0], moved.containers.b!.slots[0]]).toEqual([woodCopy('41'), sword]);

    const merge = moveItemStacks({ a: container('a', [woodCopy('42')]), b: container('b', [woodCopy('43')]) },
      { fromContainer: 'a', fromIndex: 0, toContainer: 'b', toIndex: 0, quantity: 1 }, content);
    expect(merge.ok && merge.outcome).toBe('swap');

    const quick = quickMoveItemStack({ hotbar: container('hotbar', [woodCopy('44')]), backpack: container('backpack', [woodCopy('45'), null]) },
      { fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'] }, content);
    expect(quick.ok && quick.containers.backpack!.slots).toEqual([woodCopy('45'), woodCopy('44')]);

    const picked = clickContainerSlot({ a: container('a', [sword, woodCopy('46')]) }, null, { container: 'a', index: 0, button: 'right' }, content);
    expect(picked.ok && picked.cursor).toEqual(sword);
    const placed = clickContainerSlot(picked.ok ? picked.containers : {}, picked.ok ? picked.cursor : null,
      { container: 'a', index: 1, button: 'left' }, content);
    expect(placed.ok && placed.outcome).toBe('swap');
    expect(placed.ok && [placed.containers.a!.slots[1], placed.cursor]).toEqual([sword, woodCopy('46')]);
  });

  // Regression (BeigeShore, PR #139 review): distribute compared only item kinds,
  // so one quantity-1 gear copy merged into another and its record vanished.
  it('never distribute a gear copy into another stack, and move it whole into one empty slot', () => {
    const containers = { backpack: container('backpack', [woodCopy('10'), woodCopy('11'), { itemKind: 'wood', quantity: 2 }, null, null]) };
    const into = (index: number) => ({ container: 'backpack', index });
    const merged = distributeItemStack(containers, { fromContainer: 'backpack', fromIndex: 0, targets: [into(1), into(2)] }, content);
    expect(merged).toEqual(expect.objectContaining({ ok: false }));
    const moved = distributeItemStack(containers, { fromContainer: 'backpack', fromIndex: 0, targets: [into(3), into(4)] }, content);
    expect(moved.ok && moved.containers['backpack']!.slots).toEqual([
      null, woodCopy('11'), { itemKind: 'wood', quantity: 2 }, woodCopy('10'), null,
    ]);
    // Plain stacks still never merge into a gear copy.
    const plain = distributeItemStack(containers, { fromContainer: 'backpack', fromIndex: 2, targets: [into(1)] }, content);
    expect(plain).toEqual(expect.objectContaining({ ok: false }));
    // A malformed multi-quantity gear stack is refused rather than split into duplicate ids.
    const broken = { backpack: container('backpack', [{ ...woodCopy('12'), quantity: 2 }, null, null]) };
    expect(distributeItemStack(broken, { fromContainer: 'backpack', fromIndex: 0, targets: [into(1), into(2)] }, content))
      .toEqual(expect.objectContaining({ ok: false }));
  });
});
