import { describe, expect, it } from 'vitest';
import type { TerrainArray } from '@orchard/engine/terrain';
import {
  editorMapOverviewRaster,
  splitEditorMapOverviewLayers,
} from './editor-map-overview.js';
import { cellFlags } from '@orchard/sim/cell-flags';

describe('authored map overview raster', () => {
  it('uses one opaque semantic pixel per tile with elevation shading', () => {
    const terrain: TerrainArray = {
      spaceId: 1,
      seed: 2,
      version: 3,
      width: 2,
      height: 1,
      biomes: Uint8Array.of(0, 4),
      blocked: cellFlags([true, false]),
      horseJumpableTerrain: cellFlags([false, true]),
      elevations: Int16Array.of(0, 1),
      dirtCliffRoles: new Uint8Array(2),
      dirtTerraces: new Uint8Array(2),
    };
    const raster = editorMapOverviewRaster(terrain);
    expect(raster.width).toBe(2);
    expect(raster.height).toBe(1);
    expect(raster.minimumElevation).toBe(0);
    expect(raster.maximumElevation).toBe(1);
    expect(raster.contentBounds).toEqual({ tileX: 0, tileY: 0, width: 2, height: 1 });
    expect([...raster.pixels]).toEqual([
      0, 122, 191, 255,
      62, 137, 72, 255,
    ]);
  });

  it('isolates sparse overrides while preserving exact combined pixels', () => {
    const terrain: TerrainArray = {
      spaceId: 1,
      seed: 2,
      version: 3,
      width: 2,
      height: 1,
      biomes: Uint8Array.of(0, 4),
      blocked: cellFlags([true, false]),
      horseJumpableTerrain: cellFlags([false, true]),
      elevations: Int16Array.of(0, 1),
      dirtCliffRoles: new Uint8Array(2),
      dirtTerraces: new Uint8Array(2),
    };
    const raster = editorMapOverviewRaster(terrain);
    const layers = splitEditorMapOverviewLayers(raster, [
      { tileX: 1, tileY: 0, biome: 0, elevation: 0 },
    ]);
    expect([...layers.generatedBase]).toEqual([
      0, 122, 191, 255,
      0, 122, 191, 255,
    ]);
    expect([...layers.terrainOverrides]).toEqual([
      0, 0, 0, 0,
      62, 137, 72, 255,
    ]);

    const recomposed = layers.generatedBase.slice();
    for (let offset = 0; offset < recomposed.length; offset += 4) {
      if (layers.terrainOverrides[offset + 3] === 0) continue;
      recomposed.set(layers.terrainOverrides.subarray(offset, offset + 4), offset);
    }
    expect(recomposed).toEqual(raster.pixels);
  });

  it('finds finite non-ocean bounds with an overview margin', () => {
    const width = 40;
    const height = 40;
    const biomes = new Uint8Array(width * height);
    biomes[20 * width + 20] = 4;
    const terrain: TerrainArray = {
      spaceId: 1,
      seed: 2,
      version: 3,
      width,
      height,
      biomes,
      blocked: new Uint8Array(width * height),
      horseJumpableTerrain: new Uint8Array(width * height),
      elevations: new Int16Array(width * height),
      dirtCliffRoles: new Uint8Array(width * height),
      dirtTerraces: new Uint8Array(width * height),
    };
    expect(editorMapOverviewRaster(terrain).contentBounds).toEqual({
      tileX: 8, tileY: 8, width: 25, height: 25,
    });
  });
});
