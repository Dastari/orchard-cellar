import { describe, expect, it } from 'vitest';
import {
  FIRST_HOMESTEAD_SPACE_ID,
  HOMESTEAD_GATE_TILE,
  HOMESTEAD_ENTRY_TILE,
  HOMESTEAD_TENT_TILE,
  HOMESTEAD_TERRAIN_SIZE_TILES,
  homesteadBiomeAt,
  homesteadPathTiles,
  homesteadPortalName,
  homesteadTentFootprint,
  homesteadMarkerPlacementTiles,
  homesteadBoundaryTiles,
  homesteadPlayableTile,
  homesteadPlotBounds,
  spaceDefinitionFor,
  generateStarterCellarExcavation,
  cellarPlayableTile,
} from './spaces.js';

describe('homestead spaces', () => {
  it('resolves the starter tier with its overworld site', () => {
    const space = spaceDefinitionFor(FIRST_HOMESTEAD_SPACE_ID, {
      spaceId: FIRST_HOMESTEAD_SPACE_ID,
      sizeTier: 0,
      ownerName: 'Dastari',
      residenceSpaceId: 30_000,
      overworldTileX: 120,
      overworldTileY: 90,
    });
    expect(space).toMatchObject({ generator: 'homestead', environment: 'outdoor', sizeTiles: HOMESTEAD_TERRAIN_SIZE_TILES });
    expect(space?.name).toBe("Dastari's_farm");
    expect(spaceDefinitionFor(30_000, {
      spaceId: FIRST_HOMESTEAD_SPACE_ID, sizeTier: 0,
      ownerName: 'Dastari', residenceSpaceId: 30_000,
    })).toMatchObject({ generator: 'residence', environment: 'indoor', name: "Dastari's_home", sizeTiles: 16 });
    expect(spaceDefinitionFor(30_001, {
      spaceId: FIRST_HOMESTEAD_SPACE_ID, sizeTier: 0,
      ownerName: 'Dastari', residenceSpaceId: 30_000,
    })).toMatchObject({ generator: 'cellar', environment: 'underground', name: "Dastari's_cellar", sizeTiles: 1_024 });
    expect(space?.homesteadSite).toEqual({ worldTileX: 120, worldTileY: 90 });
  });

  it('builds a short three-wide path through and below the southern gate', () => {
    const path = homesteadPathTiles();
    expect(path).toHaveLength(12);
    expect(path[0]).toEqual({ tileX: 63, tileY: 76 });
    expect(path.at(-1)).toEqual({ tileX: 65, tileY: 79 });
  });

  it('builds the cellar from one authoritative excavation grid', () => {
    const grid = generateStarterCellarExcavation();
    expect(grid).toMatchObject({ width: 1_024, height: 1_024 });
    expect(grid.dug.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(300);
    expect(cellarPlayableTile(512, 502)).toBe(true);
    expect(cellarPlayableTile(0, 0)).toBe(false);
    expect(cellarPlayableTile(1_023, 1_023)).toBe(false);
  });

  it('surrounds the farm with one indestructible southern gate', () => {
    const boundary = homesteadBoundaryTiles();
    expect(boundary.filter(({ kind }) => kind === 'gate')).toEqual([
      { tileX: HOMESTEAD_GATE_TILE.tileX, tileY: HOMESTEAD_GATE_TILE.tileY, kind: 'gate' },
    ]);
    expect(boundary).toHaveLength(124);
  });

  it('expands north and sideways while preserving the southern gate and existing coordinates', () => {
    expect(homesteadPlotBounds(128)).toEqual({ minimumX: 48, maximumX: 79, minimumY: 48, maximumY: 79 });
    expect(homesteadPlotBounds(144)).toEqual({ minimumX: 40, maximumX: 87, minimumY: 32, maximumY: 79 });
    expect(homesteadPlayableTile(41, 33, 144)).toBe(true);
    expect(homesteadPlayableTile(41, 33, 128)).toBe(false);
    expect(homesteadBoundaryTiles(144).filter(({ kind }) => kind === 'gate')).toEqual([
      { tileX: HOMESTEAD_GATE_TILE.tileX, tileY: HOMESTEAD_GATE_TILE.tileY, kind: 'gate' },
    ]);
  });

  it('keeps the central route clear while magnifying nearby overworld terrain', () => {
    expect(homesteadBiomeAt(0xc0ffee, { worldTileX: 100, worldTileY: 100 },
      HOMESTEAD_ENTRY_TILE.tileX, HOMESTEAD_ENTRY_TILE.tileY, HOMESTEAD_TERRAIN_SIZE_TILES)).toBe('plains');
    expect(homesteadTentFootprint(HOMESTEAD_TENT_TILE.tileX, HOMESTEAD_TENT_TILE.tileY, true))
      .toEqual({ minX: 62, minY: 50, maxX: 66, maxY: 54 });
  });

  it('extracts owner names only from entry portals', () => {
    expect(homesteadPortalName('homestead_enter:Maple')).toBe('Maple');
    expect(homesteadPortalName('homestead_exit:Maple')).toBeNull();
  });

  it('reserves a 3x4 marker footprint including the entrance path row', () => {
    const tiles = homesteadMarkerPlacementTiles(10, 20);
    expect(tiles).toHaveLength(12);
    expect(tiles[0]).toEqual({ tileX: 9, tileY: 18 });
    expect(tiles.at(-1)).toEqual({ tileX: 11, tileY: 21 });
  });
});
