import { AUTHORITY_HZ, orchardFruitStatus, runtimeResourceDefinition,
  type ContentRegistry, type OrchardHarvestResource } from '@orchard/sim';

/** Shared keyboard/touch prompt: pick ripe fruit, or count down to ripe fruit. */
export function orchardHarvestPrompt(
  registry: ContentRegistry, resource: OrchardHarvestResource, authorityTick: bigint,
): string | null {
  const harvest = runtimeResourceDefinition(registry, resource)?.fruitHarvest;
  if (harvest === undefined) return null;
  const status = orchardFruitStatus(resource, authorityTick);
  // A picked or young tree has nothing to offer yet; say nothing rather than a standing negative prompt.
  if (status === 'depleted' || status === 'tree_immature') return null;
  if (status === 'fruit_ripening') {
    const seconds = Math.ceil(Number((resource.fruitReadyAtTick ?? 0n) - authorityTick) / AUTHORITY_HZ);
    return `FRUIT RIPENING - ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  const fruit = registry.items.get(harvest.item)?.displayName ?? 'Fruit';
  return `[E] PICK ${fruit.toUpperCase()}`;
}
