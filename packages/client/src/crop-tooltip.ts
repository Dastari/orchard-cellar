import type { CropDefinition, CropGrowthSnapshot } from '@orchard/sim';

export type CropTooltipIndicator =
  | { readonly kind: 'timer'; readonly frame: number }
  | { readonly kind: 'harvest'; readonly itemKind: string };

/** Mature crops replace the growth timer with the physical item yielded by
 * harvesting. Quest crops inherit their ordinary harvest item through their
 * crop definition, so Bob's fast plants correctly preview a strawberry. */
export function cropTooltipIndicator(
  definition: CropDefinition,
  growth: CropGrowthSnapshot,
): CropTooltipIndicator {
  if (growth.mature) return { kind: 'harvest', itemKind: definition.harvestItemKind };
  return { kind: 'timer', frame: Math.min(15, Math.max(0, Math.floor(growth.progress * 15))) };
}
