import { describe, expect, it } from 'vitest';
import {
  CROP_DEFINITIONS,
  FARMER_BOB_FAST_STRAWBERRY_CROP,
  cropDefinition,
  cropGrowthAt,
} from '@orchard/sim';
import { cropTooltipIndicator } from './crop-tooltip.js';

describe('crop tooltip indicator', () => {
  it('previews every mature crop harvest item', () => {
    for (const definition of CROP_DEFINITIONS) {
      const growth = cropGrowthAt(
        definition,
        definition.growthTicks,
        0n,
        0n,
        0n,
      );
      expect(cropTooltipIndicator(definition, growth)).toEqual({
        kind: 'harvest',
        itemKind: definition.harvestItemKind,
      });
    }
  });

  it('previews an ordinary strawberry for Bob\'s mature fast crop', () => {
    const definition = cropDefinition(FARMER_BOB_FAST_STRAWBERRY_CROP)!;
    const growth = cropGrowthAt(
      definition,
      definition.growthTicks,
      0n,
      0n,
      0n,
    );
    expect(cropTooltipIndicator(definition, growth)).toEqual({
      kind: 'harvest',
      itemKind: 'strawberry',
    });
  });

  it('keeps the timer while a crop is still growing', () => {
    const definition = CROP_DEFINITIONS[0]!;
    expect(cropTooltipIndicator(definition, {
      growthTicks: 0n,
      remainingTicks: definition.growthTicks,
      progress: 0.5,
      stage: 2,
      mature: false,
      watered: true,
      wateredUntilTick: 0n,
      inSeason: true,
    })).toEqual({ kind: 'timer', frame: 7 });
  });
});
