import { ITEM_DEFINITIONS, type KnownItemKind } from './item-containers.js';
import { PRESERVED_CROP_ECONOMY } from './barreling.js';
import { CROP_DEFINITIONS, CROP_HARVEST_ECONOMY, CROP_SEED_ECONOMY } from './crops.js';
import { FOOD_ECONOMY } from './food.js';

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

/** Every authority-recognized item has an explicit value. Keeping this table
 * exhaustive prevents newly collectible items from silently becoming
 * unsellable or defaulting to an exploitable price. */
export const ITEM_ECONOMY = {
  // The reducer rejects deed sales; the nominal value keeps the exhaustive
  // economy contract positive without making deeds a currency exploit.
  homestead_deed: { buyPriceBronze: 50_000, sellPriceBronze: 1 },
  marlow_book: { buyPriceBronze: null, sellPriceBronze: 1 },
  janes_gardening_book: { buyPriceBronze: null, sellPriceBronze: 1 },
  bob_fast_strawberry_seeds: { buyPriceBronze: null, sellPriceBronze: 1 },
  axe: { buyPriceBronze: 450, sellPriceBronze: 180 },
  hoe: { buyPriceBronze: 350, sellPriceBronze: 140 },
  pickaxe: { buyPriceBronze: 600, sellPriceBronze: 240 },
  watering_can: { buyPriceBronze: 400, sellPriceBronze: 160 },
  bow: { buyPriceBronze: 700, sellPriceBronze: 280 },
  sword: { buyPriceBronze: 750, sellPriceBronze: 300 },
  shovel: { buyPriceBronze: 400, sellPriceBronze: 160 },
  hammer: { buyPriceBronze: 500, sellPriceBronze: 200 },
  torch: { buyPriceBronze: 80, sellPriceBronze: 32 },
  lantern: { buyPriceBronze: 700, sellPriceBronze: 280 },
  arrow: { buyPriceBronze: 4, sellPriceBronze: 1 },
  wood: { buyPriceBronze: 6, sellPriceBronze: 2 },
  pebble: { buyPriceBronze: null, sellPriceBronze: 1 },
  stone: { buyPriceBronze: 8, sellPriceBronze: 3 },
  fiber: { buyPriceBronze: null, sellPriceBronze: 2 },
  iron_piece: { buyPriceBronze: null, sellPriceBronze: 10 },
  copper_piece: { buyPriceBronze: null, sellPriceBronze: 7 },
  gold_piece: { buyPriceBronze: null, sellPriceBronze: 36 },
  emerald_piece: { buyPriceBronze: null, sellPriceBronze: 8 },
  sapphire_piece: { buyPriceBronze: null, sellPriceBronze: 10 },
  topaz_piece: { buyPriceBronze: null, sellPriceBronze: 7 },
  ruby_piece: { buyPriceBronze: null, sellPriceBronze: 12 },
  amethyst_piece: { buyPriceBronze: null, sellPriceBronze: 9 },
  iron_ore: { buyPriceBronze: null, sellPriceBronze: 90 },
  copper_ore: { buyPriceBronze: null, sellPriceBronze: 63 },
  gold_ore: { buyPriceBronze: null, sellPriceBronze: 324 },
  iron_bar: { buyPriceBronze: null, sellPriceBronze: 184 },
  copper_bar: { buyPriceBronze: null, sellPriceBronze: 130 },
  gold_bar: { buyPriceBronze: null, sellPriceBronze: 652 },
  emerald_ore: { buyPriceBronze: 180, sellPriceBronze: 72 },
  sapphire_ore: { buyPriceBronze: 220, sellPriceBronze: 88 },
  topaz_ore: { buyPriceBronze: 160, sellPriceBronze: 64 },
  ruby_ore: { buyPriceBronze: 260, sellPriceBronze: 104 },
  amethyst_ore: { buyPriceBronze: 200, sellPriceBronze: 80 },
  plank: { buyPriceBronze: 3, sellPriceBronze: 1 },
  stick: { buyPriceBronze: 2, sellPriceBronze: 1 },
  cactus: { buyPriceBronze: null, sellPriceBronze: 3 },
  chest: { buyPriceBronze: 160, sellPriceBronze: 64 },
  workbench: { buyPriceBronze: 120, sellPriceBronze: 48 },
  anvil: { buyPriceBronze: 500, sellPriceBronze: 200 },
  campfire: { buyPriceBronze: null, sellPriceBronze: 18 },
  cooking_fire: { buyPriceBronze: null, sellPriceBronze: 24 },
  camp_cooking_fire: { buyPriceBronze: null, sellPriceBronze: 24 },
  furnace: { buyPriceBronze: null, sellPriceBronze: 220 },
  fence: { buyPriceBronze: null, sellPriceBronze: 4 },
  fence_gate: { buyPriceBronze: null, sellPriceBronze: 12 },
  sign: { buyPriceBronze: null, sellPriceBronze: 10 },
  standing_torch: { buyPriceBronze: null, sellPriceBronze: 20 },
  fruit_press: { buyPriceBronze: null, sellPriceBronze: 260 },
  fermentation_cask: { buyPriceBronze: null, sellPriceBronze: 240 },
  shed: { buyPriceBronze: null, sellPriceBronze: 360 },
  greenhouse: { buyPriceBronze: null, sellPriceBronze: 520 },
  barn: { buyPriceBronze: null, sellPriceBronze: 780 },
  coop: { buyPriceBronze: null, sellPriceBronze: 420 },
  silo: { buyPriceBronze: null, sellPriceBronze: 560 },
  sprinkler: { buyPriceBronze: 50_000, sellPriceBronze: 20_000 },
  ...FOOD_ECONOMY,
  ...CROP_SEED_ECONOMY,
  ...CROP_HARVEST_ECONOMY,
  ...PRESERVED_CROP_ECONOMY,
  apple: { buyPriceBronze: 12, sellPriceBronze: 5 },
  pear: { buyPriceBronze: 12, sellPriceBronze: 5 },
  peach: { buyPriceBronze: 14, sellPriceBronze: 6 },
  cherry: { buyPriceBronze: 14, sellPriceBronze: 6 },
  grape: { buyPriceBronze: null, sellPriceBronze: 15 },
  must: { buyPriceBronze: null, sellPriceBronze: 12 },
  pomace: { buyPriceBronze: null, sellPriceBronze: 4 },
  bottles: { buyPriceBronze: null, sellPriceBronze: 120 },
  orchard_tea: { buyPriceBronze: 120, sellPriceBronze: 48 },
  barrel: { buyPriceBronze: 180, sellPriceBronze: 72 },
  backpack: { buyPriceBronze: 1_500, sellPriceBronze: 600 },
  necklace: { buyPriceBronze: 2_000, sellPriceBronze: 800 },
  helm: { buyPriceBronze: 2_200, sellPriceBronze: 880 },
  tunic: { buyPriceBronze: 2_400, sellPriceBronze: 960 },
  ring: { buyPriceBronze: 2_600, sellPriceBronze: 1_040 },
  shield: { buyPriceBronze: 2_100, sellPriceBronze: 840 },
  gloves: { buyPriceBronze: 1_600, sellPriceBronze: 640 },
  pants: { buyPriceBronze: 1_800, sellPriceBronze: 720 },
  boots: { buyPriceBronze: 1_700, sellPriceBronze: 680 },
} as const satisfies Readonly<Record<KnownItemKind, ItemEconomyDefinition>>;

export const TOOL_MERCHANT_OFFERS = [
  'homestead_deed',
  'axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'sword', 'arrow',
  'shovel', 'hammer', 'torch', 'lantern', 'workbench', 'anvil', 'sprinkler',
] as const satisfies readonly KnownItemKind[];

export type ToolMerchantOfferKind = typeof TOOL_MERCHANT_OFFERS[number];

export const FARMER_MERCHANT_OFFERS = [
  'hoe', 'shovel', 'watering_can',
  ...CROP_DEFINITIONS.map(({ seedItemKind }) => seedItemKind),
] as const satisfies readonly KnownItemKind[];

export const MERCHANT_OFFERS = {
  general_tools: TOOL_MERCHANT_OFFERS,
  farmer_supplies: FARMER_MERCHANT_OFFERS,
} as const satisfies Readonly<Record<string, readonly KnownItemKind[]>>;

export function merchantOffers(shopId: string): readonly KnownItemKind[] {
  return Object.prototype.hasOwnProperty.call(MERCHANT_OFFERS, shopId)
    ? MERCHANT_OFFERS[shopId as keyof typeof MERCHANT_OFFERS]
    : [];
}

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
