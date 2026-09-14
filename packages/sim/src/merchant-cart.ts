import { ITEM_ECONOMY, commerceTotal } from './commerce.js';
import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
import {
  BASE_BACKPACK_CAPACITY,
  TRADE_UNSELLABLE_ITEM_TAG,
  itemHasTag,
  maxStackFor,
  quickMoveItemStack,
  type ContainerSnapshot,
} from './item-containers.js';

export const MAX_MERCHANT_CART_LINES = 32;

export interface MerchantCartLine {
  readonly itemKind: string;
  readonly quantity: number;
}

export interface MerchantContentResolver {
  readonly economyFor: (itemKind: string) => { readonly buyPriceBronze: number | null; readonly sellPriceBronze: number } | null;
  readonly maxStackFor: (itemKind: string) => number | null;
  readonly initialDurabilityFor: (itemKind: string) => number | null;
  readonly hasTag: (itemKind: string, tag: string) => boolean;
  readonly inventoryCapacityFor: (itemKind: string) => number | null;
}

const LEGACY_MERCHANT_CONTENT: MerchantContentResolver = {
  economyFor: (itemKind) => ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY] ?? null,
  maxStackFor,
  initialDurabilityFor: (itemKind) => (
    bootstrapDefinitionsOfKind('item').find(({ id }) => id === `item:${itemKind}`)?.durability?.max ?? null
  ),
  hasTag: itemHasTag,
  inventoryCapacityFor: (itemKind) => (
    bootstrapDefinitionsOfKind('item').find(({ id }) => id === `item:${itemKind}`)?.equip?.inventoryCapacity ?? null
  ),
};

export type MerchantCartFailureCode =
  | 'merchant_cart_empty'
  | 'merchant_cart_too_large'
  | 'merchant_cart_invalid_quantity'
  | 'merchant_cart_duplicate_item'
  | 'merchant_offer_not_found'
  | 'inventory_full'
  | 'item_not_sellable'
  | 'sale_quantity_missing'
  | 'backpack_not_empty';

interface MerchantCartFailure {
  readonly ok: false;
  readonly code: MerchantCartFailureCode;
}

export interface MerchantCartPlan {
  readonly ok: true;
  readonly totalBronze: bigint;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type MerchantCartResult = MerchantCartPlan | MerchantCartFailure;

function failure(code: MerchantCartFailureCode): MerchantCartFailure {
  return { ok: false, code };
}

function cartLinesAreValid(lines: readonly MerchantCartLine[]): MerchantCartFailure | null {
  if (lines.length === 0) return failure('merchant_cart_empty');
  if (lines.length > MAX_MERCHANT_CART_LINES) return failure('merchant_cart_too_large');
  const seen = new Set<string>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > 0xffff) {
      return failure('merchant_cart_invalid_quantity');
    }
    if (seen.has(line.itemKind)) return failure('merchant_cart_duplicate_item');
    seen.add(line.itemKind);
  }
  return null;
}

function persistentContainers(
  before: Readonly<Record<string, ContainerSnapshot>>,
  after: Readonly<Record<string, ContainerSnapshot>>,
): Readonly<Record<string, ContainerSnapshot>> {
  return Object.fromEntries(Object.keys(before).map((id) => [id, after[id]!]));
}

/** Computes a complete mixed purchase without mutating the supplied inventory.
 * Authorities can commit the returned snapshot and wallet debit together. */
export function planMerchantPurchase(
  before: Readonly<Record<string, ContainerSnapshot>>,
  lines: readonly MerchantCartLine[],
  offeredItemKinds: readonly string[],
  content: MerchantContentResolver = LEGACY_MERCHANT_CONTENT,
): MerchantCartResult {
  const invalid = cartLinesAreValid(lines);
  if (invalid !== null) return invalid;
  let containers = before;
  let totalBronze = 0n;
  for (const line of lines) {
    if (!offeredItemKinds.includes(line.itemKind)) {
      return failure('merchant_offer_not_found');
    }
    const economy = content.economyFor(line.itemKind);
    const lineTotal = economy?.buyPriceBronze == null
      ? null
      : commerceTotal(economy.buyPriceBronze, line.quantity);
    const maximum = content.maxStackFor(line.itemKind);
    if (lineTotal === null || maximum === null) return failure('merchant_offer_not_found');
    totalBronze += lineTotal;
    let remaining = line.quantity;
    while (remaining > 0) {
      const batch = Math.min(maximum, remaining);
      const sourceId = `merchant_purchase:${line.itemKind}`;
      const inserted = quickMoveItemStack({
        ...containers,
        [sourceId]: {
          id: sourceId,
          capacity: 1,
          slots: [{
            itemKind: line.itemKind,
            quantity: batch,
            ...(content.initialDurabilityFor(line.itemKind) === null
              ? {} : { durability: content.initialDurabilityFor(line.itemKind)! }),
          }],
        },
      }, { fromContainer: sourceId, fromIndex: 0, toContainers: ['hotbar', 'backpack'] }, content);
      if (!inserted.ok || inserted.movedQuantity !== batch) return failure('inventory_full');
      containers = persistentContainers(containers, inserted.containers);
      remaining -= batch;
    }
  }
  return { ok: true, totalBronze, containers };
}

/** Computes an exact mixed sale from the authoritative accessible inventory.
 * Missing quantities reject the whole plan, so stale client carts cannot mint
 * money after their items have moved or been dropped. */
export function planMerchantSale(
  before: Readonly<Record<string, ContainerSnapshot>>,
  lines: readonly MerchantCartLine[],
  content: MerchantContentResolver = LEGACY_MERCHANT_CONTENT,
  /** Trusted caller's effective capacity, including separately granted slots.
   * Never derive this from an untrusted cart or widen the supplied snapshot. */
  accessibleBackpackCapacity?: number,
): MerchantCartResult {
  const invalid = cartLinesAreValid(lines);
  if (invalid !== null) return invalid;
  const next: Record<string, ContainerSnapshot> = { ...before };
  let totalBronze = 0n;
  for (const line of lines) {
    if (content.hasTag(line.itemKind, TRADE_UNSELLABLE_ITEM_TAG)
      || content.hasTag(line.itemKind, 'item.quest_unique')) {
      return failure('item_not_sellable');
    }
    const economy = content.economyFor(line.itemKind);
    const lineTotal = economy === null
      ? null
      : commerceTotal(economy.sellPriceBronze, line.quantity);
    if (lineTotal === null) return failure('item_not_sellable');
    let remaining = line.quantity;
    for (const containerId of ['hotbar', 'backpack'] as const) {
      const container = next[containerId];
      if (container === undefined) return failure('sale_quantity_missing');
      const slots = [...container.slots];
      for (let index = 0; index < Math.min(container.capacity, slots.length) && remaining > 0; index += 1) {
        const stack = slots[index];
        if (stack?.itemKind !== line.itemKind) continue;
        const removed = Math.min(remaining, stack.quantity);
        slots[index] = removed === stack.quantity ? null : { ...stack, quantity: stack.quantity - removed };
        remaining -= removed;
      }
      next[containerId] = { ...container, slots };
    }
    if (remaining !== 0) return failure('sale_quantity_missing');
    totalBronze += lineTotal;
  }
  const equippedCapacityItem = next.equipment?.slots[4];
  const equippedCapacity = equippedCapacityItem === null || equippedCapacityItem === undefined
    ? BASE_BACKPACK_CAPACITY
    : content.inventoryCapacityFor(equippedCapacityItem.itemKind) ?? BASE_BACKPACK_CAPACITY;
  const grantedCapacity = accessibleBackpackCapacity !== undefined
    && Number.isSafeInteger(accessibleBackpackCapacity) && accessibleBackpackCapacity >= 0
    ? Math.min(before.backpack?.capacity ?? 0, accessibleBackpackCapacity) : 0;
  const carriedCapacity = Math.max(equippedCapacity, grantedCapacity);
  const occupiedExpansionSlot = next.backpack?.slots
    .slice(carriedCapacity)
    .some((stack) => stack !== null) ?? false;
  if (occupiedExpansionSlot) {
    return failure('backpack_not_empty');
  }
  return { ok: true, totalBronze, containers: next };
}
