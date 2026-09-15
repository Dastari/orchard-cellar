import { statelessRoll, type SkillCheckSeedPart } from './checks.js';
import type { ContentRegistry } from './content/registry.js';
import type { ResourceContentDefinition } from './content/resource-definition.js';
import { runtimeItemDefinition, runtimeResourceDefinition } from './content/runtime.js';

/** Safe-integer IDs, disjoint from generated resources and bit-63 cellar veins. */
const PLANTED_TREE_ID_BASE = 1n << 49n;
export function plantedFruitTreeId(spaceId: number, tileX: number, tileY: number): bigint {
  return PLANTED_TREE_ID_BASE | (BigInt(spaceId & 0xffff) << 32n)
    | (BigInt(tileY & 0xffff) << 16n) | BigInt(tileX & 0xffff);
}
export function isPlantedFruitTreeId(id: bigint): boolean {
  return id >= PLANTED_TREE_ID_BASE && id < PLANTED_TREE_ID_BASE + (1n << 48n);
}

export function fruitTreeForSeed(registry: ContentRegistry, seedKind: string): ResourceContentDefinition | null {
  const seed = runtimeItemDefinition(registry, seedKind);
  if (seed === null || !seed.tags.includes('item.seed')) return null;
  const matches = [...registry.resources.values()].filter((resource) => resource.retired !== true
    && resource.seedItem === `item:${seedKind}` && resource.tags.includes('resource.fruit_tree')
    && resource.regrowth?.enabled === true && resource.health.followsGrowthStage === true);
  return matches.length === 1 ? matches[0]! : null;
}

export function fruitSeedChanceBps(rank: number): number {
  return 500 + (Number.isSafeInteger(rank) ? Math.max(0, Math.min(3, rank)) : 0) * 1_000;
}

/** One independent roll per mature fruit payout, never per fruit or tool hit. */
export function fruitSeedDrop(
  registry: ContentRegistry, resource: { kind: string; definitionId?: string },
  drops: readonly { itemKind: string; quantity: number }[], rank: number,
  seedParts: readonly SkillCheckSeedPart[],
): { itemKind: string; quantity: number } | null {
  const definition = runtimeResourceDefinition(registry, resource);
  const seedKind = definition?.seedItem?.slice('item:'.length);
  if (seedKind === undefined || fruitTreeForSeed(registry, seedKind)?.id !== definition?.id
    || !drops.some((drop) => drop.quantity > 0
      && runtimeItemDefinition(registry, drop.itemKind)?.tags.includes('crop.fruit') === true)) return null;
  return statelessRoll([...seedParts, 'orchard.seed'], 10_000) < fruitSeedChanceBps(rank)
    ? { itemKind: seedKind, quantity: 1 } : null;
}
