import { describe, expect, it } from 'vitest';
import {
  DEBUG_SPACE_ID,
  interiorFurnitureBlockingTiles,
  TOPSIDE_SPACE_ID,
  spaceDefinitionFor,
} from './spaces.js';

describe('26§2 space registry', () => {
  it('resolves static topside and owner-only debug definitions', () => {
    expect(spaceDefinitionFor(TOPSIDE_SPACE_ID)).toMatchObject({ generator: 'island', environment: 'outdoor' });
    expect(spaceDefinitionFor(DEBUG_SPACE_ID)).toMatchObject({
      generator: 'debug_flat',
      environment: 'outdoor',
      ownerOnly: true,
    });
  });

  it('resolves future per-player homestead rows with u16 ids', () => {
    expect(spaceDefinitionFor(60_000, { spaceId: 60_000, sizeTier: 2 })).toMatchObject({
      spaceId: 60_000,
      generator: 'homestead',
      environment: 'outdoor',
      sizeTiles: 160,
    });
    expect(spaceDefinitionFor(60_000, { spaceId: 60_001, sizeTier: 2 })).toBeUndefined();
    expect(spaceDefinitionFor(65_536, { spaceId: 65_536, sizeTier: 0 })).toBeUndefined();
  });

  it('blocks the lower footprint of beds and bookcases in interiors', () => {
    expect(interiorFurnitureBlockingTiles('marlow_tent')).toEqual([
      { tileX: 4, tileY: 5 }, { tileX: 5, tileY: 5 }, { tileX: 6, tileY: 5 },
      { tileX: 6, tileY: 4 }, { tileX: 7, tileY: 4 }, { tileX: 8, tileY: 4 },
    ]);
    expect(interiorFurnitureBlockingTiles('island')).toEqual([]);
  });
});
