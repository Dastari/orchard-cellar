import { describe, expect, it } from 'vitest';
import {
  HOMESTEAD_BUILD_DEFINITIONS,
  HOMESTEAD_BUILD_UNDO_TICKS,
  homesteadBuildFootprintTiles,
  homesteadBuildRemovalRefund,
} from './homestead-build.js';
import { PLACEABLE_KINDS } from './crafting.js';

describe('homestead build registry', () => {
  it('includes every ordinary placeable in the data palette', () => {
    expect(Object.keys(HOMESTEAD_BUILD_DEFINITIONS).sort()).toEqual([...PLACEABLE_KINDS].sort());
  });

  it('expands bottom-centre footprints deterministically', () => {
    expect(homesteadBuildFootprintTiles({ footprint: { width: 3, height: 2 } }, 10, 12)).toEqual([
      { tileX: 9, tileY: 11 }, { tileX: 10, tileY: 11 }, { tileX: 11, tileY: 11 },
      { tileX: 9, tileY: 12 }, { tileX: 10, tileY: 12 }, { tileX: 11, tileY: 12 },
    ]);
  });

  it('returns the intact build during undo grace and material salvage later', () => {
    expect(homesteadBuildRemovalRefund('furnace', 10n, 10n + HOMESTEAD_BUILD_UNDO_TICKS))
      .toEqual([{ itemKind: 'furnace', quantity: 1 }]);
    expect(homesteadBuildRemovalRefund('furnace', 10n, 11n + HOMESTEAD_BUILD_UNDO_TICKS))
      .toEqual([{ itemKind: 'stone', quantity: 4 }]);
    expect(homesteadBuildRemovalRefund('fence', 10n, 11n + HOMESTEAD_BUILD_UNDO_TICKS))
      .toEqual([{ itemKind: 'plank', quantity: 1 }]);
  });
});
