import { describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED } from './state.js';
import type { Direction } from './state.js';
import {
  CELLAR_ENTRY_TILE,
  CELLAR_EXIT_TILE,
  DEBUG_SPACE_ID,
  cellarLadderApproachClear,
  cellarLadderPortal,
  interiorFurnitureBlockingTiles,
  spaceReceivesRain,
  starterCellarTerrainTransitions,
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

  it('resolves an isolated roguelike room from its run snapshot', () => {
    expect(spaceDefinitionFor(50_001, {
      spaceId: 50_001,
      instanceKind: 'roguelike',
      seed: 17,
      roomNumber: 4,
      roomKind: 'combat',
      theme: 'volcanic',
    })).toMatchObject({
      name: 'delve_50001',
      generator: 'roguelike',
      sizeTiles: 32,
      environment: 'underground',
      rogueRoom: { seed: 17, roomNumber: 4, roomKind: 'combat', theme: 'volcanic' },
    });
  });

  it('blocks the lower footprint of beds and bookcases in interiors', () => {
    expect(interiorFurnitureBlockingTiles('marlow_tent')).toEqual([
      { tileX: 4, tileY: 5 }, { tileX: 5, tileY: 5 }, { tileX: 6, tileY: 5 },
      { tileX: 6, tileY: 4 }, { tileX: 7, tileY: 4 }, { tileX: 8, tileY: 4 },
    ]);
    expect(interiorFurnitureBlockingTiles('island')).toEqual([]);
  });

  it('leaves the cellar crossing to its portal and wall ladder without generating a floor manhole', () => {
    expect(starterCellarTerrainTransitions()).toEqual([]);
  });

  it('climbs the cellar ladder only from the tile at its foot, facing it', () => {
    expect(cellarLadderPortal('cellar_exit:toby')).toBe(true);
    expect(cellarLadderPortal('cellar_enter:toby')).toBe(false);
    expect(cellarLadderPortal('residence_exit:toby')).toBe(false);
    const portal = { fromTileX: CELLAR_EXIT_TILE.tileX, fromTileY: CELLAR_EXIT_TILE.tileY };
    const at = (tileX: number, tileY: number, facing: Direction = 'up') => cellarLadderApproachClear({
      x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      facing,
    }, portal);
    // Arriving from the trapdoor lands on exactly that tile.
    expect(at(CELLAR_ENTRY_TILE.tileX, CELLAR_ENTRY_TILE.tileY)).toBe(true);
    expect(at(CELLAR_EXIT_TILE.tileX, CELLAR_EXIT_TILE.tileY)).toBe(false);
    expect(at(CELLAR_ENTRY_TILE.tileX - 1, CELLAR_ENTRY_TILE.tileY)).toBe(false);
    expect(at(CELLAR_ENTRY_TILE.tileX + 1, CELLAR_ENTRY_TILE.tileY)).toBe(false);
    expect(at(CELLAR_ENTRY_TILE.tileX, CELLAR_ENTRY_TILE.tileY + 1)).toBe(false);
    for (const facing of ['down', 'left', 'right', 'upLeft', 'upRight'] as const) {
      expect(at(CELLAR_ENTRY_TILE.tileX, CELLAR_ENTRY_TILE.tileY, facing)).toBe(false);
    }
  });

  it('drops rain on open-air spaces only, and honours the per-space admin flag', () => {
    expect(spaceReceivesRain({ environment: 'outdoor', weather: true })).toBe(true);
    expect(spaceReceivesRain({ environment: 'outdoor', weather: false })).toBe(false);
    expect(spaceReceivesRain({ environment: 'underground', weather: true })).toBe(false);
    expect(spaceReceivesRain({ environment: 'indoor', weather: true })).toBe(false);
    expect(spaceReceivesRain({ environment: 'outdoor', weather: false }, true)).toBe(true);
    expect(spaceReceivesRain({ environment: 'outdoor', weather: true }, false)).toBe(false);
    // A homestead is open air; its residence and cellar are not.
    for (const spaceId of [40_000, 40_001]) {
      const space = spaceDefinitionFor(spaceId, {
        spaceId: 39_999, residenceSpaceId: 40_000, ownerName: 'toby', sizeTier: 0,
      });
      expect(space === undefined ? null : spaceReceivesRain(space)).toBe(false);
    }
  });
});
