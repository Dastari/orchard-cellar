import { expect, it } from 'vitest';
import { CombatRegionPolicy } from './combat-regions.js';
import { HEARTH_COMBAT_REGIONS } from './hearth-archipelago.js';
import { hearthDangerNotice } from './hearth-danger-notice.js';
const policy = new CombatRegionPolicy(HEARTH_COMBAT_REGIONS);
const at = (x: number, y: number, spaceId = 0) => hearthDangerNotice(policy, { spaceId, tileX: x, tileY: y });
it('warns before both actual gate boundaries and changes status at the exact policy edge', () => {
  expect(at(652.5, 211.5)).toBe('protected');
  expect(at(665.5, 196)).toBe('protected');
  expect(at(665.5, 195)).toBe('boundary');
  expect(at(665.5, 192)).toBe('boundary');
  expect(at(665.5, 191.999)).toBe('hostile');
  expect(at(666, 206.5)).toBe('boundary');
  expect(at(668.999, 206.5)).toBe('boundary');
  expect(at(669, 206.5)).toBe('hostile');
  expect(at(721, 117)).toBe('hostile');
});
it('does not infer hostile ground from candidate scenery, other spaces or removed policy', () => {
  expect(at(652, 211, 1)).toBeNull();
  expect(at(165, 394)).toBeNull();
  expect(hearthDangerNotice(new CombatRegionPolicy([]), { spaceId: 0, tileX: 721, tileY: 117 })).toBeNull();
  const edited = new CombatRegionPolicy(HEARTH_COMBAT_REGIONS.map(region => region.id === 'cinderwake-landing'
    ? { ...region, minY: 190 } : region));
  expect(hearthDangerNotice(edited, { spaceId: 0, tileX: 665.5, tileY: 191 })).toBe('boundary');
  expect(at(Number.NaN, 211)).toBeNull();
});
it('does not call an adjoining peaceful region or unclassified space a hostile boundary', () => {
  const extended = new CombatRegionPolicy(HEARTH_COMBAT_REGIONS.map(region => region.id === 'cinderwake-landing'
    ? { ...region, minX: 608 } : region));
  expect(hearthDangerNotice(extended, { spaceId: 0, tileX: 608.5, tileY: 207 })).toBe('protected');
  const adjacent = new CombatRegionPolicy([...HEARTH_COMBAT_REGIONS, {
    id: 'cinder-refuge', parentId: 'cinderwake', policy: 'sanctuary', spaceId: 0,
    minX: 669, maxX: 677, minY: 192, maxY: 224,
  }]);
  expect(hearthDangerNotice(adjacent, { spaceId: 0, tileX: 668.5, tileY: 207 })).toBe('protected');
});
