import {
  bootstrapContentRegistry,
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
  const activeRegistry = registry ?? bootstrapContentRegistry();
  const definition = runtimeDurabilityDefinition(activeRegistry, itemKind);
  return definition === null ? null
    : runtimeNormalizeDurability(activeRegistry, itemKind, durability) / definition.maximum;
}
