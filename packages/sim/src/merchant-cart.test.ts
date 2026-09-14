import { describe, expect, it } from 'vitest';
import type { ContainerSnapshot } from './item-containers.js';
import { planMerchantPurchase, planMerchantSale, type MerchantContentResolver } from './merchant-cart.js';
import { TOOL_MERCHANT_OFFERS } from './commerce.js';

function inventory(
  hotbar: ContainerSnapshot['slots'],
  backpack: ContainerSnapshot['slots'] = [],
  equipment: ContainerSnapshot['slots'] = [],
): Readonly<Record<string, ContainerSnapshot>> {
  return {
    hotbar: { id: 'hotbar', capacity: hotbar.length, slots: hotbar },
    backpack: { id: 'backpack', capacity: backpack.length, slots: backpack },
    equipment: { id: 'equipment', capacity: equipment.length, slots: equipment },
    crafting: { id: 'crafting', capacity: 0, slots: [] },
  };
}

describe('authoritative merchant cart plans', () => {
  it('preflights a mixed purchase and leaves its source snapshot unchanged', () => {
    const before = inventory([null, null, null]);
    const result = planMerchantPurchase(before, [
      { itemKind: 'axe', quantity: 1 },
      { itemKind: 'arrow', quantity: 12 },
    ], TOOL_MERCHANT_OFFERS);
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
    ], TOOL_MERCHANT_OFFERS)).toEqual({ ok: false, code: 'inventory_full' });
    expect(before.hotbar?.slots).toEqual([{ itemKind: 'stone', quantity: 99 }]);
  });

  it('validates against the active shop rather than the tool merchant catalog', () => {
    const before = inventory([null]);
    expect(planMerchantPurchase(before, [{ itemKind: 'carrot_seeds', quantity: 1 }], ['carrot_seeds']).ok)
      .toBe(true);
    expect(planMerchantPurchase(before, [{ itemKind: 'axe', quantity: 1 }], ['carrot_seeds']))
      .toEqual({ ok: false, code: 'merchant_offer_not_found' });
  });

  it('values and initializes items through the supplied live content revision', () => {
    const content: MerchantContentResolver = {
      economyFor: (kind) => kind === 'live_tool'
        ? { buyPriceBronze: 17, sellPriceBronze: 11 } : null,
      maxStackFor: (kind) => kind === 'live_tool' ? 2 : null,
      initialDurabilityFor: (kind) => kind === 'live_tool' ? 333 : null,
      hasTag: () => false,
      inventoryCapacityFor: () => null,
    };
    const bought = planMerchantPurchase(
      inventory([null]), [{ itemKind: 'live_tool', quantity: 1 }], ['live_tool'], content,
    );
    expect(bought).toMatchObject({ ok: true, totalBronze: 17n });
    if (!bought.ok) return;
    expect(bought.containers.hotbar?.slots[0]).toEqual({
      itemKind: 'live_tool', quantity: 1, durability: 333,
    });
    expect(planMerchantSale(bought.containers, [{ itemKind: 'live_tool', quantity: 1 }], content))
      .toMatchObject({ ok: true, totalBronze: 11n });
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

  it('resolves unique quest protection from the active content rather than bootstrap item IDs', () => {
    const content: MerchantContentResolver = {
      economyFor: () => ({ buyPriceBronze: 10, sellPriceBronze: 5 }),
      maxStackFor: () => 99,
      initialDurabilityFor: () => null,
      hasTag: (kind, tag) => kind === 'authored_quest_token' && tag === 'item.quest_unique',
      inventoryCapacityFor: () => null,
    };
    expect(planMerchantSale(inventory([{ itemKind: 'authored_quest_token', quantity: 1 }]),
      [{ itemKind: 'authored_quest_token', quantity: 1 }], content))
      .toEqual({ ok: false, code: 'item_not_sellable' });
    // The active revision explicitly removed quest protection from this ID.
    expect(planMerchantSale(inventory([{ itemKind: 'marlow_book', quantity: 1 }]),
      [{ itemKind: 'marlow_book', quantity: 1 }], content))
      .toMatchObject({ ok: true, totalBronze: 5n });
  });

  it('protects earned Guardian Seals and rejects a mixed sale without consuming its ordinary materials', () => {
    const before = inventory([{ itemKind: 'basalt', quantity: 2 }, { itemKind: 'guardian_seal', quantity: 1 }]);
    expect(planMerchantSale(before, [{ itemKind: 'basalt', quantity: 2 }]))
      .toMatchObject({ ok: true, totalBronze: 16n });
    expect(planMerchantSale(before, [
      { itemKind: 'basalt', quantity: 2 }, { itemKind: 'guardian_seal', quantity: 1 },
    ])).toEqual({ ok: false, code: 'item_not_sellable' });
    expect(before.hotbar?.slots).toEqual([
      { itemKind: 'basalt', quantity: 2 }, { itemKind: 'guardian_seal', quantity: 1 },
    ]);
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

  it('uses the authoritative granted backpack capacity for hotbar and expanded-slot sales', () => {
    const backpack = Array.from({ length: 20 }, (_, index) => (
      index === 17 ? { itemKind: 'stone', quantity: 3 } : null
    ));
    const before = inventory([{ itemKind: 'wood', quantity: 2 }], backpack);
    // This reproduced the old rejection even though the server exposed all 20 slots.
    expect(planMerchantSale(before, [{ itemKind: 'wood', quantity: 1 }]))
      .toEqual({ ok: false, code: 'backpack_not_empty' });
    const hotbarSale = planMerchantSale(before, [{ itemKind: 'wood', quantity: 1 }], undefined, 20);
    expect(hotbarSale).toMatchObject({ ok: true, totalBronze: 2n });
    if (!hotbarSale.ok) return;
    expect(hotbarSale.containers.backpack?.slots[17]).toEqual({ itemKind: 'stone', quantity: 3 });
    const expandedSale = planMerchantSale(before, [{ itemKind: 'stone', quantity: 2 }], undefined, 20);
    expect(expandedSale).toMatchObject({ ok: true, totalBronze: 6n });
    if (!expandedSale.ok) return;
    expect(expandedSale.containers.backpack?.slots[17]).toEqual({ itemKind: 'stone', quantity: 1 });
    expect(before.backpack?.slots[17]).toEqual({ itemKind: 'stone', quantity: 3 });
    expect(planMerchantSale(before, [{ itemKind: 'stone', quantity: 4 }], undefined, 20))
      .toEqual({ ok: false, code: 'sale_quantity_missing' });
  });

  it('does not let a capacity grant expose rows outside the authoritative snapshot', () => {
    const before = inventory([{ itemKind: 'wood', quantity: 2 }], [
      ...Array.from({ length: 8 }, () => null), { itemKind: 'stone', quantity: 1 },
    ]);
    const bounded = { ...before, backpack: { ...before.backpack!, capacity: 8 } };
    expect(planMerchantSale(bounded, [{ itemKind: 'wood', quantity: 1 }], undefined, 20))
      .toEqual({ ok: false, code: 'backpack_not_empty' });
    expect(planMerchantSale(bounded, [{ itemKind: 'stone', quantity: 1 }], undefined, 20))
      .toEqual({ ok: false, code: 'sale_quantity_missing' });
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

  it('uses authored equipped capacity for a renamed definition and gives metadata-only items no expansion', () => {
    const content: MerchantContentResolver = {
      economyFor: () => ({ buyPriceBronze: 10, sellPriceBronze: 5 }),
      maxStackFor: () => 99,
      initialDurabilityFor: () => null,
      hasTag: () => false,
      inventoryCapacityFor: (kind) => kind === 'trail_satchel' ? 20 : null,
    };
    const expansion = Array.from({ length: 9 }, (_, index) => (
      index === 8 ? { itemKind: 'stone', quantity: 1 } : null
    ));
    const equipment = (kind: string): ContainerSnapshot['slots'] => [
      null, null, null, null, { itemKind: kind, quantity: 1 },
    ];

    expect(planMerchantSale(
      inventory([{ itemKind: 'wood', quantity: 1 }], expansion, equipment('trail_satchel')),
      [{ itemKind: 'wood', quantity: 1 }],
      content,
    )).toMatchObject({ ok: true });
    expect(planMerchantSale(
      inventory([{ itemKind: 'wood', quantity: 1 }], expansion, equipment('container_tag_only')),
      [{ itemKind: 'wood', quantity: 1 }],
      content,
    )).toEqual({ ok: false, code: 'backpack_not_empty' });
  });
});
