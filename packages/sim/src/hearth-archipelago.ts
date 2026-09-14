import type {CombatRegion} from './combat-regions.js';

/** Reviewed runtime island policy. All coordinates are logical tiles. */
export const HEARTH_ISLANDS = {
  willowharbour: {
    name: 'Willowharbour', minX: 64, minY: 320, maxX: 223, maxY: 479,
    arrival: { tileX: 204, tileY: 400 }, ferry: { tileX: 209, tileY: 400 },
  },
  cinderwake: {
    name: 'Cinderwake', minX: 608, minY: 48, maxX: 799, maxY: 239,
    arrival: { tileX: 652, tileY: 211 }, ferry: { tileX: 644, tileY: 207 },
  },
} as const;

export const HEARTH_COMBAT_REGIONS: readonly CombatRegion[] = [
  { id: 'willowharbour', spaceId: 0, minX: 64, minY: 320, maxX: 223, maxY: 479, policy: 'sanctuary' },
  { id: 'cinderwake', spaceId: 0, minX: 608, minY: 48, maxX: 799, maxY: 239, policy: 'hostile' },
  { id: 'cinderwake-landing', spaceId: 0, minX: 634, minY: 192, maxX: 668, maxY: 224,
    policy: 'sanctuary', parentId: 'cinderwake' },
];

export const HEARTH_DELVE_APPROACH = {
  facade: { tileX: 481, tileY: 415 }, threshold: { tileX: 481, tileY: 416 },
  return: { tileX: 481, tileY: 418 }, assetId: 'prop_cf_stone_cliff_1_cave_entrance',
} as const;
