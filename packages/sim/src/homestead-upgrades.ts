import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { BRONZE_PER_GOLD } from './commerce.js';

export const HOMESTEAD_UPGRADE_KINDS = [
  'rich_soil',
  'selective_seeds',
  'barrel_cellar',
  'estate_vintage',
] as const;

export type HomesteadUpgradeKind = (typeof HOMESTEAD_UPGRADE_KINDS)[number];

export interface HomesteadUpgradeDefinition {
  readonly kind: HomesteadUpgradeKind;
  readonly displayName: string;
  readonly description: string;
  readonly maximumRank: number;
  readonly baseCostGold: number;
  readonly costGrowth: number;
}

export const HOMESTEAD_UPGRADE_DEFINITIONS = BOOTSTRAP_COMPILED_CONTENT.upgrades as
  Readonly<Record<HomesteadUpgradeKind, HomesteadUpgradeDefinition>>;

export function isHomesteadUpgradeKind(kind: string): kind is HomesteadUpgradeKind {
  return Object.prototype.hasOwnProperty.call(HOMESTEAD_UPGRADE_DEFINITIONS, kind);
}

export function homesteadUpgradeCostBronze(kind: HomesteadUpgradeKind, currentRank: number): bigint {
  const definition = HOMESTEAD_UPGRADE_DEFINITIONS[kind];
  if (!Number.isInteger(currentRank) || currentRank < 0 || currentRank >= definition.maximumRank) return 0n;
  return BigInt(Math.round(definition.baseCostGold * definition.costGrowth ** currentRank)) * BRONZE_PER_GOLD;
}

/** Crop progress is stored as base growth ticks. Lowering the required total
 * preserves old rows and makes an upgrade take effect immediately. */
export function richSoilGrowthTicks(baseGrowthTicks: bigint, rank: number): bigint {
  const safeRank = Math.max(0, Math.min(3, Math.floor(rank)));
  return baseGrowthTicks * 10n / BigInt(10 + safeRank);
}

/** A stable entropy value avoids mutable RNG state and makes retries safe. */
export function selectiveSeedHarvestQuantity(baseQuantity: number, rank: number, entropy: number): number {
  const safeRank = Math.max(0, Math.min(3, Math.floor(rank)));
  const bonusTenths = Math.max(0, baseQuantity) * safeRank;
  const guaranteed = Math.floor(bonusTenths / 10);
  const chanceTenths = bonusTenths % 10;
  const roll = Math.abs(Math.floor(entropy)) % 10;
  return Math.max(0, baseQuantity) + guaranteed + (roll < chanceTenths ? 1 : 0);
}

export function barrelCellarCureTicks(baseTicks: bigint, rank: number): bigint {
  const safeRank = Math.max(0, Math.min(3, Math.floor(rank)));
  return baseTicks * 10n / BigInt(10 + safeRank);
}

export function barrelCellarBatchCapacity(baseCapacity: number, rank: number): number {
  return baseCapacity + Math.max(0, Math.min(3, Math.floor(rank))) * 8;
}

export interface EstateVintageTier {
  readonly rank: number;
  readonly label: string;
  readonly agingTicks: bigint;
  readonly sellPriceBronze: number;
}

export function estateVintageTier(
  rank: number,
  baseAgingTicks: bigint,
  baseSellPriceBronze: number,
): EstateVintageTier {
  const safeRank = Math.max(0, Math.min(3, Math.floor(rank)));
  const labels = ['Estate', 'Select', 'Reserve', 'Grand Vintage'] as const;
  const agingNumerators = [2n, 3n, 4n, 6n] as const;
  const valueMultipliers = [1, 2, 4, 8] as const;
  return {
    rank: safeRank,
    label: labels[safeRank]!,
    agingTicks: baseAgingTicks * agingNumerators[safeRank]! / 2n,
    sellPriceBronze: baseSellPriceBronze * valueMultipliers[safeRank]!,
  };
}

export const SPRINKLER_RADIUS_TILES = 2;

export function sprinklerCoversTile(
  sprinklerTileX: number,
  sprinklerTileY: number,
  tileX: number,
  tileY: number,
  radius = SPRINKLER_RADIUS_TILES,
): boolean {
  return Math.max(Math.abs(tileX - sprinklerTileX), Math.abs(tileY - sprinklerTileY)) <= radius;
}
