import { describe, expect, it } from 'vitest';
import { farmActionPrompt, type FarmActionPromptState } from './farm-action-prompt.js';

const BASE: FarmActionPromptState = {
  targeted: true,
  selectedItem: 'watering_can',
  seedSelected: false,
  soilExists: true,
  soilWatered: false,
  cropName: null,
  cropMature: false,
  cropWatered: false,
};

describe('farm action prompt', () => {
  it('offers to water a dry planted crop when the watering can is selected', () => {
    expect(farmActionPrompt({ ...BASE, cropName: 'Strawberry' })).toBe('[F] WATER STRAWBERRY');
  });

  it('reports the selected crop as already watered from its current soil window', () => {
    expect(farmActionPrompt({
      ...BASE,
      cropName: 'Strawberry',
      soilWatered: true,
      cropWatered: true,
    })).toBe('STRAWBERRY ALREADY WATERED');
  });

  it('retains passive crop status when no farm tool action takes priority', () => {
    expect(farmActionPrompt({
      ...BASE,
      selectedItem: 'empty',
      cropName: 'Strawberry',
    })).toBe('STRAWBERRY NEEDS WATER');
  });

  it('uses the inventory interaction key for mature crop harvesting', () => {
    expect(farmActionPrompt({
      ...BASE,
      selectedItem: 'empty',
      cropName: 'Strawberry',
      cropMature: true,
      cropWatered: true,
    })).toBe('[E] HARVEST STRAWBERRY');
  });

  it('offers to dig up a crop at any growth stage when the hoe is selected', () => {
    const crop = { ...BASE, selectedItem: 'hoe', cropName: 'Strawberry' };
    expect(farmActionPrompt({ ...crop, cropMature: false })).toBe('[F] DIG UP STRAWBERRY');
    expect(farmActionPrompt({ ...crop, cropMature: true })).toBe('[F] DIG UP STRAWBERRY');
  });
});
