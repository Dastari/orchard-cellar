import { describe, expect, it } from 'vitest';
import { HOMESTEAD_TENT_TILE } from '@orchard/sim';
import { homesteadTentPresentationTargets } from './homestead-presentation.js';

describe('homestead tent presentation targets', () => {
  it('keeps the interior tent present without a transient homestead cache row', () => {
    expect(homesteadTentPresentationTargets({ spaceId: 10_000, generator: 'homestead' }, [])).toEqual([{
      spaceId: 10_000,
      tileX: HOMESTEAD_TENT_TILE.tileX,
      tileY: HOMESTEAD_TENT_TILE.tileY,
      interior: true,
    }]);
  });

  it('uses subscribed homestead rows for overworld marker tents', () => {
    expect(homesteadTentPresentationTargets({ spaceId: 0, generator: 'island' }, [{
      spaceId: 10_001,
      overworldTileX: 37,
      overworldTileY: 42,
    }])).toEqual([{
      spaceId: 10_001,
      tileX: 37,
      tileY: 42,
      interior: false,
    }]);
  });
});
