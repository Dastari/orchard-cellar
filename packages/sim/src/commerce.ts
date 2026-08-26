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
  readonly displayName: string;
  /** What a merchant charges. Null means this item is not normally stocked. */
  readonly buyPriceBronze: number | null;
  /** What a merchant pays the player for one item. */
  readonly sellPriceBronze: number;
}

/** Every authority-recognized item has an explicit value. Keeping this table
 * exhaustive prevents newly collectible items from silently becoming
 * unsellable or defaulting to an exploitable price. */
export const ITEM_ECONOMY = {
  axe: { displayName: 'Iron Axe', buyPriceBronze: 450, sellPriceBronze: 180 },
  hoe: { displayName: 'Iron Hoe', buyPriceBronze: 350, sellPriceBronze: 140 },
  pickaxe: { displayName: 'Iron Pickaxe', buyPriceBronze: 600, sellPriceBronze: 240 },
  watering_can: { displayName: 'Watering Can', buyPriceBronze: 400, sellPriceBronze: 160 },
  bow: { displayName: 'Wooden Bow', buyPriceBronze: 700, sellPriceBronze: 280 },
  sword: { displayName: 'Iron Sword', buyPriceBronze: 750, sellPriceBronze: 300 },
  shovel: { displayName: 'Iron Shovel', buyPriceBronze: 400, sellPriceBronze: 160 },
  hammer: { displayName: 'Iron Hammer', buyPriceBronze: 500, sellPriceBronze: 200 },
  torch: { displayName: 'Torch', buyPriceBronze: 80, sellPriceBronze: 32 },
  lantern: { displayName: 'Lantern', buyPriceBronze: 700, sellPriceBronze: 280 },
  arrow: { displayName: 'Arrow', buyPriceBronze: 4, sellPriceBronze: 1 },
  wood: { displayName: 'Wood', buyPriceBronze: 6, sellPriceBronze: 2 },
  stone: { displayName: 'Stone', buyPriceBronze: 8, sellPriceBronze: 3 },
  iron_ore: { displayName: 'Iron Ore', buyPriceBronze: 24, sellPriceBronze: 10 },
  copper_ore: { displayName: 'Copper Ore', buyPriceBronze: 18, sellPriceBronze: 7 },
  gold_ore: { displayName: 'Gold Ore', buyPriceBronze: 90, sellPriceBronze: 36 },
  emerald_ore: { displayName: 'Emerald', buyPriceBronze: 180, sellPriceBronze: 72 },
  sapphire_ore: { displayName: 'Sapphire', buyPriceBronze: 220, sellPriceBronze: 88 },
  topaz_ore: { displayName: 'Topaz', buyPriceBronze: 160, sellPriceBronze: 64 },
  ruby_ore: { displayName: 'Ruby', buyPriceBronze: 260, sellPriceBronze: 104 },
  amethyst_ore: { displayName: 'Amethyst', buyPriceBronze: 200, sellPriceBronze: 80 },
  plank: { displayName: 'Planks', buyPriceBronze: 3, sellPriceBronze: 1 },
  stick: { displayName: 'Stick', buyPriceBronze: 2, sellPriceBronze: 1 },
  chest: { displayName: 'Chest', buyPriceBronze: 160, sellPriceBronze: 64 },
  apple: { displayName: 'Apple', buyPriceBronze: 12, sellPriceBronze: 5 },
  pear: { displayName: 'Pear', buyPriceBronze: 12, sellPriceBronze: 5 },
  peach: { displayName: 'Peach', buyPriceBronze: 14, sellPriceBronze: 6 },
  cherry: { displayName: 'Cherries', buyPriceBronze: 14, sellPriceBronze: 6 },
  grape: { displayName: 'Grapes', buyPriceBronze: 12, sellPriceBronze: 5 },
  orchard_tea: { displayName: 'Orchard Tea', buyPriceBronze: 120, sellPriceBronze: 48 },
  barrel: { displayName: 'Barrel', buyPriceBronze: 180, sellPriceBronze: 72 },
  backpack: { displayName: 'Backpack', buyPriceBronze: 1_500, sellPriceBronze: 600 },
  necklace: { displayName: 'Necklace', buyPriceBronze: 2_000, sellPriceBronze: 800 },
  helm: { displayName: 'Helm', buyPriceBronze: 2_200, sellPriceBronze: 880 },
  tunic: { displayName: 'Tunic', buyPriceBronze: 2_400, sellPriceBronze: 960 },
  ring: { displayName: 'Ring', buyPriceBronze: 2_600, sellPriceBronze: 1_040 },
  shield: { displayName: 'Shield', buyPriceBronze: 2_100, sellPriceBronze: 840 },
  gloves: { displayName: 'Gloves', buyPriceBronze: 1_600, sellPriceBronze: 640 },
  pants: { displayName: 'Pants', buyPriceBronze: 1_800, sellPriceBronze: 720 },
  boots: { displayName: 'Boots', buyPriceBronze: 1_700, sellPriceBronze: 680 },
} as const satisfies Readonly<Record<KnownItemKind, ItemEconomyDefinition>>;

export const TOOL_MERCHANT_OFFERS = [
  'axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'sword', 'arrow',
  'shovel', 'hammer', 'torch', 'lantern',
] as const satisfies readonly KnownItemKind[];

export type ToolMerchantOfferKind = typeof TOOL_MERCHANT_OFFERS[number];

export function itemEconomyDefinition(itemKind: string): ItemEconomyDefinition | null {
  return Object.prototype.hasOwnProperty.call(ITEM_ECONOMY, itemKind)
    ? ITEM_ECONOMY[itemKind as KnownItemKind]
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
