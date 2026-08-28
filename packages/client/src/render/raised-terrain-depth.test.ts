import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  survivalPlateauRamps,
} from '@orchard/sim';
import {
  raisedTerrainDepthEntries,
  raisedTerrainDepthLayers,
  raisedTerrainSurfaceRuns,
  raisedTerrainWaterfallFrameIndex,
  raisedTerrainVisualOffset,
} from './raised-terrain-depth.js';
import { plateauLayerPlansAt, terrainForWorld, type TerrainArray } from './terrain.js';
import {
  createProceduralEditorPreview,
  generateProceduralEditorChunk,
  proceduralEditorWorldToLocalTile,
  recenterProceduralEditorPreview,
  terrainArrayForProceduralEditorPreview,
} from '../editor/procedural-editor-preview.js';

function nestedTerrain(): TerrainArray {
  const width = 7;
  const height = 7;
  const elevations = new Uint8Array(width * height);
  for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) {
    elevations[y * width + x] = 1;
  }
  for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) {
    elevations[y * width + x] = 2;
  }
  elevations[3 * width + 3] = 3;
  return {
    spaceId: 0,
    seed: 1,
    version: 1,
    width,
    height,
    biomes: new Uint8Array(width * height).fill(4),
    blocked: Array<boolean>(width * height).fill(false),
    horseJumpableTerrain: Array<boolean>(width * height).fill(false),
    cliffRoles: new Uint8Array(width * height),
    elevations,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe('30§5 raised-terrain depth entries', () => {
  it('submits every nested contour at its elevation boundary phase', () => {
    const entries = raisedTerrainDepthEntries(nestedTerrain(), 0, 0, 6, 6);
    const nestedSouth = entries.filter(({ tileX, tileY }) => tileX === 3 && tileY === 5);
    expect(nestedSouth.map(({ contourLevel }) => contourLevel)).toEqual([1, 2, 3]);
    expect(nestedSouth.map(({ footY, depthOffset }) => footY + depthOffset)).toEqual([
      64 + 0.5 / 1_024,
      32 + 1.5 / 1_024,
      0 + 2.5 / 1_024,
    ]);
    expect(nestedSouth.map(raisedTerrainVisualOffset)).toEqual([32, 64, 96]);
  });

  it('30§5 separates lower-plane wall faces from upper-plane rims and caps', () => {
    const entries = raisedTerrainDepthEntries(nestedTerrain(), 0, 0, 6, 6);
    const face = entries.find(({ plan }) => plan.faceLayers.length > 0);
    const cap = entries.find(({ plan }) => plan.edgeFrame !== null);
    expect(face).toBeDefined();
    expect(cap).toBeDefined();
    expect(raisedTerrainDepthLayers(face!)).toContainEqual({
      stratum: 'face', elevationLayer: face!.contourLevel - 1, depthPhase: 'boundary',
    });
    expect(raisedTerrainDepthLayers(cap!)).toContainEqual({
      stratum: 'cap', elevationLayer: cap!.contourLevel, depthPhase: 'surface',
    });
  });

  it('30§5 keeps mixed corner stacks together without submitting indirect-only columns', () => {
    const base = nestedTerrain();
    const elevations = new Uint8Array(base.width * base.height);
    // The left column continues south while the right column ends. Resolving
    // the next projected row on the left therefore emits indirect rear
    // coverage around the convex corner rather than a direct south face.
    elevations[0 * base.width + 1] = 1;
    elevations[1 * base.width + 1] = 1;
    elevations[0 * base.width + 2] = 1;
    const entries = raisedTerrainDepthEntries({ ...base, elevations }, 0, 0, 6, 6);
    const rearFace = entries.find(({ plan }) => (
      new Set(plan.faceLayers.map((face) => face.direct)).size === 2
    ));
    expect(rearFace).toBeDefined();
    expect(new Set(rearFace!.plan.faceLayers.map((face) => face.direct))).toEqual(new Set([false, true]));
    expect(raisedTerrainDepthLayers(rearFace!).filter(
      ({ stratum }) => stratum === 'face' || stratum === 'face_foot',
    )).toHaveLength(1);

    const indirectOnly = entries.find(({ plan }) => (
      plan.faceLayers.length > 0 && plan.faceLayers.every((face) => !face.direct)
    ));
    expect(indirectOnly).toBeDefined();
    expect(raisedTerrainDepthLayers(indirectOnly!).every(
      ({ stratum }) => stratum === 'cap',
    )).toBe(true);
  });

  it('30§5 submits the cosmetic ground-contact row as a lower-plane underlay', () => {
    const entries = raisedTerrainDepthEntries(nestedTerrain(), 0, 0, 6, 6);
    const foot = entries.find(({ plan }) => plan.faceLayers.some(
      (face) => face.direct && face.rowId === 'foot',
    ));
    expect(foot).toBeDefined();
    expect(raisedTerrainDepthLayers(foot!)).toContainEqual({
      stratum: 'face_foot',
      elevationLayer: foot!.contourLevel - 1,
      depthPhase: 'surface',
    });
  });

  it('keeps the legacy overworld rear staircase corner free of an opaque wall underlay', () => {
    const terrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
    const corner = plateauLayerPlansAt(terrain, 362, 435)
      .find(({ contourLevel }) => contourLevel === 1);
    expect(corner?.plan.edgeRole).toBe('top_left');
    expect(corner?.plan.edgeSeamUnderlayFrame).toBeUndefined();
  }, 20_000);

  it('43§8 replaces a south-facing cliff crossing with all four waterfall strata', () => {
    const width = 7;
    const height = 9;
    const elevations = new Uint8Array(width * height);
    for (let tileY = 1; tileY <= 4; tileY += 1) {
      for (let tileX = 1; tileX <= 5; tileX += 1)
        elevations[tileY * width + tileX] = 1;
    }
    const biomes = new Uint8Array(width * height).fill(
      SURVIVAL_BIOMES.indexOf('plains'),
    );
    for (let tileY = 4; tileY <= 7; tileY += 1) {
      for (let tileX = 2; tileX <= 4; tileX += 1)
        biomes[tileY * width + tileX] = SURVIVAL_BIOMES.indexOf('waterfall');
    }
    const terrain: TerrainArray = {
      ...nestedTerrain(),
      width,
      height,
      biomes,
      elevations,
      plateaus: elevations,
      blocked: Array<boolean>(width * height).fill(false),
      horseJumpableTerrain: Array<boolean>(width * height).fill(false),
      cliffRoles: new Uint8Array(width * height),
      dirtCliffRoles: new Uint8Array(width * height),
      dirtTerraces: new Uint8Array(width * height),
    };
    const entries = raisedTerrainDepthEntries(
      terrain,
      0,
      0,
      width - 1,
      height - 1,
    );
    const frameAt = (tileY: number, stratum: 'cap' | 'face' | 'face_foot') => {
      const entry = entries.find(({ tileX, tileY: entryY }) =>
        tileX === 3 && entryY === tileY,
      );
      expect(entry).toBeDefined();
      return raisedTerrainWaterfallFrameIndex(terrain, entry!, stratum);
    };
    expect(frameAt(4, 'cap')).toBe(1);
    expect(frameAt(5, 'face')).toBe(4);
    expect(frameAt(6, 'face')).toBe(10);
    expect(frameAt(7, 'face_foot')).toBe(13);
  });

  it('43§8 keeps the middle column of a repaired diagonal waterfall drawable', () => {
    let preview = createProceduralEditorPreview({ seed: 987_654_321 });
    preview = recenterProceduralEditorPreview(preview, 9, 224);
    preview = generateProceduralEditorChunk(preview, 9, 224);
    preview = generateProceduralEditorChunk(preview, 9, 225);
    const terrain = terrainArrayForProceduralEditorPreview(preview);
    const centerX = 153;
    const crestY = 3_596;
    const local = proceduralEditorWorldToLocalTile(preview, centerX, crestY);
    const entries = raisedTerrainDepthEntries(
      terrain,
      local.tileX - 2,
      local.tileY - 2,
      local.tileX + 2,
      local.tileY + 5,
    );
    const frameAt = (
      tileY: number,
      stratum: 'cap' | 'face' | 'face_foot',
    ): number | null => {
      const entry = entries.find(
        ({ tileX, tileY: entryY }) =>
          tileX === local.tileX && entryY === local.tileY + tileY - crestY,
      );
      expect(entry).toBeDefined();
      expect(raisedTerrainDepthLayers(entry!).map(({ stratum }) => stratum))
        .toContain(stratum);
      return raisedTerrainWaterfallFrameIndex(terrain, entry!, stratum);
    };
    expect(frameAt(crestY, 'cap')).toBe(1);
    expect(frameAt(crestY + 1, 'face')).toBe(4);
    expect(frameAt(crestY + 2, 'face')).toBe(10);
    expect(frameAt(crestY + 3, 'face_foot')).toBe(13);
  });

  it('30§5 submits only interior caps, leaving edge transparency to the shaped boundary sheet', () => {
    const runs = raisedTerrainSurfaceRuns(nestedTerrain(), 0, 0, 6, 6);
    expect(runs).toEqual([]);

    const base = nestedTerrain();
    const terrain = { ...base, elevations: new Uint8Array(base.width * base.height).fill(1) };
    const interiorRuns = raisedTerrainSurfaceRuns(terrain, 0, 0, 6, 6);
    expect(interiorRuns.filter(({ tileY }) => tileY === 3).map((run) => ({
      firstTileX: run.firstTileX,
      lastTileX: run.lastTileX,
      elevation: run.elevation,
      footY: run.footY,
      visualOffset: run.visualOffset,
    }))).toEqual([
      { firstTileX: 1, lastTileX: 5, elevation: 1, footY: 32, visualOffset: 32 },
    ]);
  });

  it('30§3 maps every generated semantic crossing to its named contour art', () => {
    const terrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
    for (const ramp of survivalPlateauRamps(SURVIVAL_WORLD_SEED)) {
      const upperLeft = plateauLayerPlansAt(terrain, ramp.tileX, ramp.tileY - 1)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      const upperRight = plateauLayerPlansAt(terrain, ramp.tileX + 1, ramp.tileY - 1)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      const lowerLeft = plateauLayerPlansAt(terrain, ramp.tileX, ramp.tileY)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      const lowerRight = plateauLayerPlansAt(terrain, ramp.tileX + 1, ramp.tileY)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      expect([
        upperLeft?.plan.rampRole,
        upperRight?.plan.rampRole,
        lowerLeft?.plan.rampRole,
        lowerRight?.plan.rampRole,
      ]).toEqual([
        'ramp_top_left', 'ramp_top_right', 'ramp_bottom_left', 'ramp_bottom_right',
      ]);
    }
  }, 20_000);
});
