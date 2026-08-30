import { statelessRoll, type SkillCheckSeedPart } from './checks.js';

export const MINING_NODE_CLASSES = ['mixed', 'pure', 'pristine', 'rock'] as const;
export type MiningNodeClass = (typeof MINING_NODE_CLASSES)[number];

export const MINING_MAX_RICHNESS = 6;
export const MINING_YIELD_WORK = 12;
export const MINING_BASE_STONE_CHANCE_PERCENT = 70;
export const MINING_ORE_DRESSING_REDUCTION_PERCENT = 10;
export const MINING_ROCK_BONUS_PERCENT = 1;

export const MINING_METAL_RESOURCES = ['ore_iron', 'ore_copper', 'ore_gold'] as const;
export const MINING_GEM_RESOURCES = [
  'ore_emerald', 'ore_sapphire', 'ore_topaz', 'ore_ruby', 'ore_amethyst',
] as const;
export const MINING_ORE_RESOURCES = [...MINING_METAL_RESOURCES, ...MINING_GEM_RESOURCES] as const;
export type MiningOreResourceKind = (typeof MINING_ORE_RESOURCES)[number];

export type MiningPickaxeTier = 1 | 2 | 3;

/** The current starter item is already the authored iron pickaxe, so it stays
 * tier three and cannot create a progression deadlock. Future crude/copper
 * recipes can opt into the lower tiers without changing node data. */
export function miningPickaxeTierForItem(itemKind: string): MiningPickaxeTier | 0 {
  if (itemKind === 'pickaxe' || itemKind === 'iron_pickaxe') return 3;
  if (itemKind === 'copper_pickaxe') return 2;
  if (itemKind === 'crude_pickaxe') return 1;
  return 0;
}

export function miningRequiredPickaxeTier(
  kind: MiningOreResourceKind | 'rock_large',
  nodeClass: MiningNodeClass,
): MiningPickaxeTier {
  // Surface discoveries and ordinary rocks always provide the materials that
  // begin the upgrade chain; only deep pure veins ask for stronger tools.
  if (nodeClass !== 'pure' || kind === 'rock_large') return 1;
  if (kind === 'ore_iron' || kind === 'ore_copper') return 1;
  if (kind === 'ore_gold') return 2;
  return 3;
}

export interface MiningYieldState {
  readonly kind: MiningOreResourceKind | 'rock_large';
  readonly nodeClass: MiningNodeClass;
  readonly richnessRemaining: number;
  readonly maximumRichness: number;
  readonly yieldsProduced: number;
  readonly producedOre: boolean;
}

export interface MiningYieldResult {
  readonly drops: readonly { readonly itemKind: string; readonly quantity: number }[];
  readonly producedOre: boolean;
}

export function normalizeMiningRichness(value: number): number {
  return Math.max(0, Math.min(MINING_MAX_RICHNESS, Math.floor(value)));
}

/** Work units make differently skilled players compose on one shared node.
 * Twelve work means four novice, three trained, or two expert strikes. */
export function miningWorkPerHit(efficientStrikesRank: number): number {
  const rank = Math.max(0, Math.min(2, Math.floor(efficientStrikesRank)));
  return rank === 0 ? 3 : rank === 1 ? 4 : 6;
}

export function miningHitsUntilYield(progress: number, efficientStrikesRank: number): number {
  const remaining = Math.max(0, MINING_YIELD_WORK - Math.max(0, Math.floor(progress)));
  return Math.max(0, Math.ceil(remaining / miningWorkPerHit(efficientStrikesRank)));
}

export function mixedNodeStoneChancePercent(oreDressingRank: number): number {
  const rank = Math.max(0, Math.min(3, Math.floor(oreDressingRank)));
  return MINING_BASE_STONE_CHANCE_PERCENT - rank * MINING_ORE_DRESSING_REDUCTION_PERCENT;
}

export function oreFragmentItemKind(kind: MiningOreResourceKind): string {
  return `${kind.slice('ore_'.length)}_piece`;
}

export function oreChunkItemKind(kind: MiningOreResourceKind): string {
  return `${kind.slice('ore_'.length)}_ore`;
}

/** Rock bonus weights keep useful metals common while retaining a genuinely
 * surprising one-in-many gem find. */
const ROCK_BONUS_ORE_WEIGHTS: readonly MiningOreResourceKind[] = [
  'ore_iron', 'ore_iron', 'ore_iron',
  'ore_copper', 'ore_copper', 'ore_copper',
  'ore_gold', 'ore_gold',
  'ore_emerald', 'ore_sapphire', 'ore_topaz', 'ore_ruby', 'ore_amethyst',
];

export function resolveMiningYield(
  state: MiningYieldState,
  seedParts: readonly SkillCheckSeedPart[],
  oreDressingRank = 0,
  rockhoundRank = 0,
  motherLodeRank = 0,
): MiningYieldResult {
  if (state.nodeClass === 'rock' || state.kind === 'rock_large') {
    const bonusChance = MINING_ROCK_BONUS_PERCENT
      + Math.max(0, Math.min(2, Math.floor(rockhoundRank)));
    const bonus = statelessRoll([...seedParts, 'mining.rock_bonus'], 100) < bonusChance;
    if (!bonus) return { drops: [{ itemKind: 'pebble', quantity: 1 }], producedOre: false };
    const ore = ROCK_BONUS_ORE_WEIGHTS[
      statelessRoll([...seedParts, 'mining.rock_kind'], ROCK_BONUS_ORE_WEIGHTS.length)
    ]!;
    return {
      drops: [
        { itemKind: 'pebble', quantity: 1 },
        { itemKind: oreFragmentItemKind(ore), quantity: 1 },
      ],
      producedOre: true,
    };
  }

  if (state.nodeClass === 'pure' || state.nodeClass === 'pristine') {
    const motherLode = state.nodeClass === 'pure'
      && state.maximumRichness >= 5
      && state.yieldsProduced === 0
      && motherLodeRank > 0;
    return {
      drops: [
        { itemKind: oreChunkItemKind(state.kind), quantity: 1 },
        ...(motherLode ? [{ itemKind: oreFragmentItemKind(state.kind), quantity: 1 }] : []),
      ],
      producedOre: true,
    };
  }

  // A one-richness mixed node and the final payout of an unlucky larger node
  // are forced successes. No shared node can disappear without its material.
  const forceOre = state.richnessRemaining <= 1 && !state.producedOre;
  const stoneChance = mixedNodeStoneChancePercent(oreDressingRank);
  const ore = forceOre
    || statelessRoll([...seedParts, 'mining.mixed_yield'], 100) >= stoneChance;
  return ore
    ? { drops: [{ itemKind: oreFragmentItemKind(state.kind), quantity: 1 }], producedOre: true }
    : { drops: [{ itemKind: 'stone', quantity: 1 }], producedOre: false };
}

export function miningNodeRichnessLabel(richness: number): 'DEPLETED' | 'LOW' | 'MEDIUM' | 'RICH' {
  const value = normalizeMiningRichness(richness);
  if (value === 0) return 'DEPLETED';
  if (value <= 2) return 'LOW';
  if (value <= 4) return 'MEDIUM';
  return 'RICH';
}

export function miningNodeArtVariant(
  nodeClass: MiningNodeClass,
  richnessRemaining: number,
): 'mixed' | 'pure_large' | 'pure_medium' | 'pure_small' | 'pristine' {
  if (nodeClass === 'mixed' || nodeClass === 'rock') return 'mixed';
  if (nodeClass === 'pristine') return 'pristine';
  const richness = normalizeMiningRichness(richnessRemaining);
  return richness >= 5 ? 'pure_large' : richness >= 3 ? 'pure_medium' : 'pure_small';
}
