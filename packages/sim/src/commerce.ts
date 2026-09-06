import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { ITEM_DEFINITIONS, type KnownItemKind } from './item-containers.js';

export const BRONZE_PER_SILVER = 100n;
export const SILVER_PER_GOLD = 100n;
export const BRONZE_PER_GOLD = BRONZE_PER_SILVER * SILVER_PER_GOLD;

export interface CoinPurse {
  readonly gold: bigint;
  readonly silver: number;
  readonly bronze: number;
}

export function coinPurseFromBronze(balanceBronze: bigint): CoinPurse {
  const safe = balanceBronze < 0n ? 0n : balanceBronze;
  const gold = safe / BRONZE_PER_GOLD;
  const afterGold = safe % BRONZE_PER_GOLD;
  return {
    gold,
    silver: Number(afterGold / BRONZE_PER_SILVER),
    bronze: Number(afterGold % BRONZE_PER_SILVER),
  };
}

export function bronzeFromCoinPurse(purse: CoinPurse): bigint {
  if (purse.gold < 0n || !Number.isSafeInteger(purse.silver) || purse.silver < 0 || purse.silver >= Number(SILVER_PER_GOLD)
    || !Number.isSafeInteger(purse.bronze) || purse.bronze < 0 || purse.bronze >= Number(BRONZE_PER_SILVER)) {
    throw new Error('invalid_coin_purse');
  }
  return purse.gold * BRONZE_PER_GOLD + BigInt(purse.silver) * BRONZE_PER_SILVER + BigInt(purse.bronze);
}

export interface ItemEconomyDefinition {
  /** What a merchant charges. Null means this item is not normally stocked. */
  readonly buyPriceBronze: number | null;
  /** What a merchant pays the player for one item. */
  readonly sellPriceBronze: number;
}

/** Legacy authority code has one unconditional economy dependency: completed
 * bottle batches must always have a sale value. Assert that pack invariant at
 * the compatibility boundary so consumers retain a total typed projection. */
export type BootstrapItemEconomy = Readonly<Record<string, ItemEconomyDefinition>> & {
  readonly bottles: ItemEconomyDefinition;
};

function bootstrapItemEconomy(): BootstrapItemEconomy {
  const economy = BOOTSTRAP_COMPILED_CONTENT.itemEconomy;
  if (economy.bottles === undefined) throw new Error('bootstrap_item_economy_missing:bottles');
  return economy as BootstrapItemEconomy;
}

/** Compatibility projections are parsed from the committed bootstrap pack. */
export const ITEM_ECONOMY = bootstrapItemEconomy();

export const MERCHANT_OFFERS: Readonly<Record<string, readonly KnownItemKind[]>> =
  BOOTSTRAP_COMPILED_CONTENT.merchantOffers;

export const TOOL_MERCHANT_OFFERS = MERCHANT_OFFERS.general_tools ?? [];
export type ToolMerchantOfferKind = string;
export const FARMER_MERCHANT_OFFERS = MERCHANT_OFFERS.farmer_supplies ?? [];

export function merchantOffers(shopId: string): readonly KnownItemKind[] {
  return Object.prototype.hasOwnProperty.call(MERCHANT_OFFERS, shopId)
    ? MERCHANT_OFFERS[shopId as keyof typeof MERCHANT_OFFERS] ?? []
    : [];
}

export function itemEconomyDefinition(itemKind: string): ItemEconomyDefinition | null {
  return Object.prototype.hasOwnProperty.call(ITEM_ECONOMY, itemKind)
    ? ITEM_ECONOMY[itemKind as KnownItemKind] ?? null
    : null;
}

export function commerceTotal(unitPriceBronze: number, quantity: number): bigint | null {
  if (!Number.isSafeInteger(unitPriceBronze) || unitPriceBronze < 0
    || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
  return BigInt(unitPriceBronze) * BigInt(quantity);
}

export function economyCatalogIsExhaustive(): boolean {
  const itemKinds = Object.keys(ITEM_DEFINITIONS).sort();
  const pricedKinds = Object.keys(ITEM_ECONOMY).sort();
  return itemKinds.length === pricedKinds.length
    && itemKinds.every((itemKind, index) => itemKind === pricedKinds[index]);
}
