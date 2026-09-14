import { describe, expect, it } from 'vitest';
import {
  STUDIO_EQUIPMENT_ITEMS,
  equipmentPalette,
  itemById,
  materialColorMap,
  studioActionAnimation,
  studioFlips,
  studioLocomotionAnimation,
  studioToolAnimation,
} from './model.js';

describe('character studio paper-doll model', () => {
  it('uses the same side-facing and mirror policy as the overworld', () => {
    expect(studioLocomotionAnimation('upRight', true)).toBe('walk_right');
    expect(studioLocomotionAnimation('down', false)).toBe('idle_down');
    expect(studioFlips('downLeft')).toBe(true);
    expect(studioFlips('upRight')).toBe(false);
  });

  it('maps tools onto the authored semantic rows', () => {
    expect(studioActionAnimation('swing_pickaxe', 'up')).toBe('swing_pickaxe_up');
    expect(studioToolAnimation('swing_axe', 'left')).toBe('axe_right');
    expect(studioToolAnimation('ranged_weapon', 'down')).toBe('ranged_weapon_down');
  });

  it('maps many items to a smaller set of visual families and palettes', () => {
    expect(itemById('chest_bronze')).toMatchObject({ visualFamily: 'plate_chest', material: 'bronze' });
    expect(materialColorMap('bronze').get('#424c6e')).toBe('#743f39');
    expect(materialColorMap('gold').get('#c0cbdc')).toBe('#fff7d2');
  });

  it('maps Raven icons onto animated templates while retaining their native palette identity', () => {
    const ravenHelmet = itemById('raven_helm_azure');
    expect(ravenHelmet).toMatchObject({
      source: 'raven',
      visualFamily: 'plate_helmet',
      icon: { set: 'masks', frame: 'azure_demon' },
    });
    expect(ravenHelmet === null ? [] : equipmentPalette(ravenHelmet)).toEqual([
      '#0a1c6b', '#1e3284', '#4f6ed6', '#7794f3',
    ]);
    expect(STUDIO_EQUIPMENT_ITEMS.filter((item) => item.source === 'raven' && item.slot === 'head')).toHaveLength(6);
    expect(STUDIO_EQUIPMENT_ITEMS.filter((item) => item.source === 'raven' && item.slot === 'body')).toHaveLength(6);
    expect(STUDIO_EQUIPMENT_ITEMS.filter((item) => item.source === 'raven' && item.slot === 'legs')).toHaveLength(5);
  });
});
