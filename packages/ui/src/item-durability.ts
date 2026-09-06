import {
  durabilityFraction,
  runtimeDurabilityDefinition,
  runtimeNormalizeDurability,
  type ContentRegistry,
} from '@orchard/sim';

/** Live inventory surfaces use their active authored item metadata. */
export function uiDurabilityFraction(
  itemKind: string,
  durability: number | undefined,
  registry?: ContentRegistry,
): number | null {
  if (registry === undefined) return durabilityFraction(itemKind, durability);
  const definition = runtimeDurabilityDefinition(registry, itemKind);
  return definition === null ? null
    : runtimeNormalizeDurability(registry, itemKind, durability) / definition.maximum;
}
