import { describe, expect, it } from 'vitest';
import type { ContainerSnapshot } from './item-containers.js';
import { planMerchantPurchase, planMerchantSale } from './merchant-cart.js';

function inventory(
  hotbar: ContainerSnapshot['slots'],
  backpack: ContainerSnapshot['slots'] = [],
): Readonly<Record<string, ContainerSnapshot>> {
  return {
    hotbar: { id: 'hotbar', capacity: hotbar.length, slots: hotbar },
    backpack: { id: 'backpack', capacity: backpack.length, slots: backpack },
    equipment: { id: 'equipment', capacity: 0, slots: [] },
    crafting: { id: 'crafting', capacity: 0, slots: [] },
  };
}

describe('authoritative merchant cart plans', () => {
  it('preflights a mixed purchase and leaves its source snapshot unchanged', () => {
    const before = inventory([null, null, null]);
    const result = planMerchantPurchase(before, [
      { itemKind: 'axe', quantity: 1 },
      { itemKind: 'arrow', quantity: 12 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalBronze).toBe(498n);
    expect(result.containers.hotbar?.slots).toEqual([
      { itemKind: 'axe', quantity: 1, durability: 200 },
      { itemKind: 'arrow', quantity: 12 },
      null,
    ]);
    expect(before.hotbar?.slots).toEqual([null, null, null]);
  });

  it('rejects the whole purchase when its complete destination cannot fit', () => {
    const before = inventory([{ itemKind: 'stone', quantity: 99 }]);
    expect(planMerchantPurchase(before, [
      { itemKind: 'arrow', quantity: 1 },
      { itemKind: 'axe', quantity: 1 },
    ])).toEqual({ ok: false, code: 'inventory_full' });
    expect(before.hotbar?.slots).toEqual([{ itemKind: 'stone', quantity: 99 }]);
  });

  it('removes an exact mixed sale and computes one payout', () => {
    const before = inventory([
      { itemKind: 'wood', quantity: 4 },
      { itemKind: 'stone', quantity: 3 },
    ]);
    const result = planMerchantSale(before, [
      { itemKind: 'wood', quantity: 3 },
      { itemKind: 'stone', quantity: 2 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalBronze).toBe(12n);
    expect(result.containers.hotbar?.slots).toEqual([
      { itemKind: 'wood', quantity: 1 },
      { itemKind: 'stone', quantity: 1 },
    ]);
  });

  it('rejects a stale sale after the client-visible items have moved or dropped', () => {
    const authoritativeNow = inventory([{ itemKind: 'wood', quantity: 1 }]);
    expect(planMerchantSale(authoritativeNow, [{ itemKind: 'wood', quantity: 2 }]))
      .toEqual({ ok: false, code: 'sale_quantity_missing' });
    expect(authoritativeNow.hotbar?.slots).toEqual([{ itemKind: 'wood', quantity: 1 }]);
  });

  it('allows ordinary sales while items remain in the eight base backpack slots', () => {
    const result = planMerchantSale(inventory(
      [{ itemKind: 'wood', quantity: 2 }],
      [{ itemKind: 'stone', quantity: 1 }],
    ), [{ itemKind: 'wood', quantity: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers.hotbar?.slots).toEqual([{ itemKind: 'wood', quantity: 1 }]);
    expect(result.containers.backpack?.slots).toEqual([{ itemKind: 'stone', quantity: 1 }]);
  });

  it('rejects duplicate lines, protected item sales, and backpack removal with occupied expansion slots', () => {
    expect(planMerchantSale(inventory([{ itemKind: 'wood', quantity: 2 }]), [
      { itemKind: 'wood', quantity: 1 },
      { itemKind: 'wood', quantity: 1 },
    ])).toEqual({ ok: false, code: 'merchant_cart_duplicate_item' });
    expect(planMerchantSale(inventory([{ itemKind: 'homestead_deed', quantity: 1 }]), [
      { itemKind: 'homestead_deed', quantity: 1 },
    ])).toEqual({ ok: false, code: 'item_not_sellable' });
    expect(planMerchantSale(inventory([{ itemKind: 'marlow_book', quantity: 1 }]), [
      { itemKind: 'marlow_book', quantity: 1 },
    ])).toEqual({ ok: false, code: 'item_not_sellable' });
    expect(planMerchantSale(inventory([{ itemKind: 'wood', quantity: 1 }]), [
      { itemKind: 'wood', quantity: 1 },
    ])).toMatchObject({ ok: true });
    expect(planMerchantSale(inventory(
      [{ itemKind: 'backpack', quantity: 1 }],
      Array.from({ length: 9 }, (_, index) => index === 8 ? { itemKind: 'stone', quantity: 1 } : null),
    ), [{ itemKind: 'backpack', quantity: 1 }])).toEqual({ ok: false, code: 'backpack_not_empty' });
  });
});
