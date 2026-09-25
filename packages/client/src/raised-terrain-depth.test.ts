import { describe, expect, it, vi } from 'vitest';
import {
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  cliffFamilyIndex,
  expandStairRun,
  survivalPlateauRamps,
  survivalStairRuns,
} from '@orchard/sim';
import {
  enqueueRaisedTerrainDepth,
  raisedTerrainDepthEntries,
  raisedTerrainDepthLayers,
  raisedTerrainCrossingSuppressesCliffStrata,
  raisedTerrainLadderFrameIndex,
  raisedTerrainSurfaceRuns,
  raisedTerrainStairFrameIndex,
  terrainLedgePlanAt,
  raisedTerrainWaterfallFrameIndex,
  raisedTerrainVisualOffset,
} from '@orchard/engine/raised-terrain-depth';
import { withGroundSpriteSource } from '@orchard/engine/ground-light-source';
import type { OverworldArt } from '@orchard/engine/overworld-art';
import type { GroundChunkCache } from '@orchard/engine/ground-cache';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { LoadedAsset } from '@orchard/ui';
import { sortWorldDepthItems } from '@orchard/engine/renderer';
import { plateauLayerPlansAt, terrainForWorld, type TerrainArray } from '@orchard/engine/terrain';
import {
  createProceduralEditorPreview,
  generateProceduralEditorChunk,
  proceduralEditorWorldToLocalTile,
  recenterProceduralEditorPreview,
  terrainArrayForProceduralEditorPreview,
} from '@orchard/engine/editor/procedural-editor-preview';

function nestedTerrain(): TerrainArray {
  const width = 7;
  const height = 7;
  const elevations = new Int16Array(width * height);
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
    blocked: new Uint8Array(width * height),
    horseJumpableTerrain: new Uint8Array(width * height),
    elevations,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe('World/Map & Terrain: raised-terrain depth entries', () => {
  it('routes flat cliff caps and ledges through spatial ground lighting before drawing', () => {
    const terrain = nestedTerrain();
    const ledges = new Uint8Array(49); ledges[8] = ledges[9] = 1;
    const cliff = { image: {}, anchor: [8, 15], metadata: { animations: { base: Array.from({ length: 300 }, () =>
      ({ x: 0, y: 0, width: 16, height: 16, durationTicks: 0 })) } } } as unknown as LoadedAsset;
    const art = { terrainAssets: {}, grass: cliff, cliff } as unknown as OverworldArt;
    const draws = vi.fn(), context = { getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),save: vi.fn(), restore: vi.fn(), translate: vi.fn(), drawImage: draws } as unknown as CanvasRenderingContext2D;
    const cache = { drawProjectedRun: vi.fn() } as unknown as GroundChunkCache;
    const items: WorldDepthItem[] = [], litImage = {} as CanvasImageSource;
    let flatDraws = 0, faceDraws = 0;
    enqueueRaisedTerrainDepth(items, context, art, { ...terrain, ledges }, cache, 0, 0, 1, 112, 112, undefined,
      (_x, _y, _level, face, draw) => {
        draws.mockClear();
        if (face === 'flat') {
          withGroundSpriteSource(context, (source, x, y) => {
            expect(x % 16).toBe(0); expect(y % 16).toBe(0);
            return { ...source, image: litImage };
          }, draw);
          for (const call of draws.mock.calls) expect(call[0]).toBe(litImage);
          flatDraws += draws.mock.calls.length;
        } else {
          draw();
          for (const call of draws.mock.calls) expect(call[0]).toBe(cliff.image);
          faceDraws += draws.mock.calls.length;
        }
      });
    for (const item of items) item.draw();
    expect(flatDraws).toBeGreaterThan(0); expect(faceDraws).toBeGreaterThan(0);
  });
  it('keeps projection space-wide when the origin uses interior-family art', () => {
    const base = nestedTerrain();
    const terrain = {
      ...base,
      elevations: new Int16Array(base.width * base.height).fill(1),
    };
    const cliffFamilies = new Uint8Array(terrain.width * terrain.height)
      .fill(cliffFamilyIndex('stone_1'));
    cliffFamilies[0] = cliffFamilyIndex('cave');
    const mixed: TerrainArray = {
      ...terrain,
      defaultCliffFamily: 'stone_1',
      projectionStyle: 'raised',
      baseDatum: 0,
      cliffFamilies,
    };
    expect(raisedTerrainSurfaceRuns(mixed, 0, 0, 6, 6).length).toBeGreaterThan(0);
    expect(raisedTerrainDepthEntries(mixed, 0, 0, 6, 6).some(
      (entry) => entry.visualProjectionRows > 0,
    )).toBe(true);
    expect(new Set(raisedTerrainDepthEntries(mixed, 0, 0, 6, 6).map(
      ({ projectionRows }) => projectionRows,
    ))).toEqual(new Set([1]));
    expect(new Set(raisedTerrainDepthEntries(mixed, 0, 0, 6, 6).map(
      ({ visualProjectionRows }) => visualProjectionRows,
    ))).toEqual(new Set([1]));
  });

  it('submits every nested contour at its elevation boundary phase', () => {
    const entries = raisedTerrainDepthEntries(nestedTerrain(), 0, 0, 6, 6);
    const nestedSouth = entries.filter(({ tileX, tileY }) => tileX === 3 && tileY === 5);
    expect(nestedSouth.map(({ contourLevel }) => contourLevel)).toEqual([1, 2, 3]);
    expect(nestedSouth.map(({ footY, depthOffset }) => footY + depthOffset)).toEqual([
      80 + 0.5 / 1_024,
      64 + 1.5 / 1_024,
      48 + 2.5 / 1_024,
    ]);
    expect(nestedSouth.map(raisedTerrainVisualOffset)).toEqual([16, 32, 48]);
  });

  it('projects signed pit walls downward and keeps their south-facing rim over a pit actor', () => {
    const base = nestedTerrain();
    const elevations = new Int16Array(base.width * base.height);
    elevations[3 * base.width + 3] = -2;
    const terrain = { ...base, elevations };
    const entries = raisedTerrainDepthEntries(terrain, 0, 0, 6, 6);
    const southFacingRim = entries.filter(({ tileX, tileY }) => tileX === 3 && tileY === 2);
    expect(southFacingRim.map(({ contourLevel }) => contourLevel)).toEqual([-1, 0]);
    expect(southFacingRim.map(raisedTerrainVisualOffset)).toEqual([-16, 0]);
    const rim = southFacingRim.find((entry) => entry.contourLevel === 0)!;
    expect(raisedTerrainDepthLayers(rim)).toContainEqual({
      stratum: 'cap', elevationLayer: 0, depthPhase: 'surface',
    });
    expect(sortWorldDepthItems([
      { tie: 'south-rim', footY: rim.footY, elevationLayer: 0, depthPhase: 'surface' as const },
      { tie: 'pit-player', footY: 10_000, elevationLayer: -2, depthPhase: 'entity' as const },
    ]).map(({ tie }) => tie)).toEqual(['pit-player', 'south-rim']);
  });

  it('selects base, repeatable tread, and crest ramp-bank courses from one compiled run', () => {
    const base = nestedTerrain();
    const elevations = new Int16Array(base.width * base.height);
    for (let y = 0; y < 4; y += 1) {
      elevations[y * base.width] = 3 - y;
      elevations[y * base.width + 1] = 3 - y;
    }
    const terrain: TerrainArray = {
      ...base,
      elevations,
      terrainTransitions: expandStairRun({
        x: 0, y: 3, direction: 'up', fromLevel: 0, toLevel: 3,
      }),
    };
    const entries = raisedTerrainDepthEntries(terrain, 0, 0, 1, 3);
    const frameAt = (tileX: number, tileY: number, contourLevel: number): number | null => {
      const entry = entries.find((candidate) => candidate.tileX === tileX
        && candidate.tileY === tileY && candidate.contourLevel === contourLevel);
      return entry === undefined ? null : raisedTerrainStairFrameIndex(terrain, entry);
    };
    // S2 restored the authored fourth source row as the contact-trim base and
    // maps L|middle|R without the standalone fourth column: base 12/14,
    // alternating treads 8/10 then 4/6, crest 0/2.
    expect(frameAt(0, 3, 1)).toBe(12);
    expect(frameAt(1, 3, 1)).toBe(14);
    expect(frameAt(0, 2, 1)).toBe(8);
    expect(frameAt(0, 2, 2)).toBeNull();
    expect(frameAt(0, 1, 2)).toBe(4);
    expect(frameAt(0, 0, 3)).toBe(0);
  });

  it('suppresses cliff strata for both contours sharing an intermediate crossing tile', () => {
    const base = nestedTerrain();
    const elevations = new Int16Array(base.width * base.height);
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 2; x += 1) {
      elevations[y * base.width + x] = 3 - y;
    }
    const terrain: TerrainArray = {
      ...base,
      elevations,
      terrainTransitions: expandStairRun({
        x: 0, y: 3, direction: 'up', fromLevel: 0, toLevel: 3,
      }),
    };
    const shared = raisedTerrainDepthEntries(terrain, 0, 2, 1, 2)
      .filter(({ tileX, tileY }) => tileX === 0 && tileY === 2);
    expect(shared.map(({ contourLevel }) => contourLevel)).toEqual([1, 2]);
    expect(shared.every((entry) => (
      raisedTerrainCrossingSuppressesCliffStrata(terrain, entry)
    ))).toBe(true);
    expect(shared.map((entry) => raisedTerrainStairFrameIndex(terrain, entry)))
      .toEqual([8, null]);
  });

  it('selects declared cave ladder art without treating the crossing as walkable stairs', () => {
    const transition = {
      contourLevel: 1,
      kind: 'ladder' as const,
      direction: 'up' as const,
      lowerTileX: 2,
      lowerTileY: 3,
      upperTileX: 2,
      upperTileY: 2,
    };
    const terrain: TerrainArray = {
      ...nestedTerrain(),
      defaultCliffFamily: 'cave',
      terrainTransitions: [transition],
    };
    expect(raisedTerrainLadderFrameIndex(terrain, transition)).toBe(0);
    expect(raisedTerrainStairFrameIndex(
      terrain,
      raisedTerrainDepthEntries(terrain, 2, 2, 2, 3)[0]!,
    )).toBeNull();
  });

  it('autotiles flat ledges with convex and inset roles without adding elevation', () => {
    const terrain = nestedTerrain();
    const ledges = new Uint8Array(terrain.width * terrain.height);
    for (let y = 0; y <= 2; y += 1) for (let x = 0; x <= 2; x += 1) ledges[y * terrain.width + x] = 1;
    ledges[0] = 0; // concave north-west notch around the centre cell
    const withLedge: TerrainArray = { ...terrain, ledges, defaultSurfaceFamily: 'grass_1' };
    expect(terrainLedgePlanAt(withLedge, 1, 1)).toEqual({
      assetId: 'tile_cf_grass_1_ledge', edgeRole: null, edgeFrame: null,
      insetRoles: ['inner_top_left'], insetFrames: [11],
    });
    expect(terrainLedgePlanAt(withLedge, 0, 1)?.edgeFrame).toBe(0);
    expect(terrainLedgePlanAt(withLedge, 3, 3)).toBeNull();
    expect(withLedge.elevations[1 * terrain.width + 1]).toBe(1);

    const desertLedge: TerrainArray = {
      ...withLedge,
      defaultCliffFamily: 'desert_2',
    };
    expect(terrainLedgePlanAt(desertLedge, 1, 1)?.assetId)
      .toBe('tile_cf_desert_2_ledge');
  });

  it('World/Map & Terrain: separates lower-plane wall faces from upper-plane rims and caps', () => {
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

  it('World/Map & Terrain: keeps mixed corner stacks together without submitting indirect-only columns', () => {
    const base = nestedTerrain();
    const elevations = new Int16Array(base.width * base.height);
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

  it('World/Map & Terrain: submits the cosmetic ground-contact row as a lower-plane underlay', () => {
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

  it('World/Map & Terrain: replaces a south-facing cliff crossing with all four waterfall strata', () => {
    const width = 7;
    const height = 9;
    const elevations = new Int16Array(width * height);
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
      blocked: new Uint8Array(width * height),
      horseJumpableTerrain: new Uint8Array(width * height),
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
    expect(frameAt(6, 'face_foot')).toBe(13);
  });

  it('maps a three-level direct waterfall drop to upper, repeat, lower, and foot rows once', () => {
    const base = nestedTerrain();
    const elevations = new Int16Array(base.width * base.height);
    for (let y = 1; y <= 4; y += 1) for (let x = 1; x <= 5; x += 1) {
      elevations[y * base.width + x] = 3;
    }
    const biomes = new Uint8Array(base.width * base.height).fill(SURVIVAL_BIOMES.indexOf('waterfall'));
    const terrain: TerrainArray = { ...base, elevations, biomes };
    const entries = raisedTerrainDepthEntries(terrain, 0, 0, 6, 6);
    const frameFor = (contourLevel: number, rowId: string): number | null => {
      const entry = entries.find(({ tileX, contourLevel: level, plan }) => tileX === 3
        && level === contourLevel && plan.faceLayers.some((face) => face.direct && face.rowId === rowId));
      expect(entry).toBeDefined();
      return raisedTerrainWaterfallFrameIndex(
        terrain,
        entry!,
        rowId === 'foot' ? 'face_foot' : 'face',
      );
    };
    expect(frameFor(3, 'wall')).toBe(4);
    expect(frameFor(2, 'wall')).toBe(7);
    expect(frameFor(1, 'lower_wall')).toBe(10);
    expect(frameFor(1, 'foot')).toBe(13);
  });

  it('World/Map & Terrain: keeps the middle column of a repaired diagonal waterfall drawable', () => {
    // This coordinate is the checked-in v6 diagonal-waterfall repair fixture;
    // keep it on that generator contract while v7 changes macro terrain.
    let preview = createProceduralEditorPreview({ seed: 987_654_321, generatorVersion: 6 });
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
    expect(frameAt(crestY + 2, 'face_foot')).toBe(13);
  });

  it('World/Map & Terrain: submits only interior caps, leaving edge transparency to the shaped boundary sheet', () => {
    const runs = raisedTerrainSurfaceRuns(nestedTerrain(), 0, 0, 6, 6);
    expect(runs).toEqual([]);

    const base = nestedTerrain();
    const terrain = { ...base, elevations: new Int16Array(base.width * base.height).fill(1) };
    const interiorRuns = raisedTerrainSurfaceRuns(terrain, 0, 0, 6, 6);
    expect(interiorRuns.filter(({ tileY }) => tileY === 3).map((run) => ({
      firstTileX: run.firstTileX,
      lastTileX: run.lastTileX,
      elevation: run.elevation,
      footY: run.footY,
      visualOffset: run.visualOffset,
    }))).toEqual([
      { firstTileX: 1, lastTileX: 5, elevation: 1, footY: 48, visualOffset: 16 },
    ]);
  });

  it('World/Map & Terrain: maps every generated semantic crossing to its named contour art', () => {
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
    const stair = survivalStairRuns(SURVIVAL_WORLD_SEED)[0];
    expect(stair).toBeDefined();
    if (stair === undefined) return;
    const entries = raisedTerrainDepthEntries(
      terrain,
      stair.x,
      stair.y - (stair.toLevel - stair.fromLevel),
      stair.x + 1,
      stair.y,
    );
    const stairFrameAt = (tileX: number, tileY: number, contourLevel: number): number | null => {
      const entry = entries.find((candidate) => candidate.tileX === tileX
        && candidate.tileY === tileY && candidate.contourLevel === contourLevel);
      return entry === undefined ? null : raisedTerrainStairFrameIndex(terrain, entry);
    };
    // The reviewed S2 delta restores source row 9 as the distinct base trim
    // and exposes both authored tread variants instead of duplicating one.
    expect(stairFrameAt(stair.x, stair.y, 1)).toBe(12);
    expect(stairFrameAt(stair.x + 1, stair.y, 1)).toBe(14);
    expect(stairFrameAt(stair.x, stair.y - 1, 1)).toBe(8);
    expect(stairFrameAt(stair.x, stair.y - 1, 2)).toBeNull();
    expect(stairFrameAt(stair.x, stair.y - 2, 2)).toBe(4);
    expect(stairFrameAt(stair.x, stair.y - 3, 3)).toBe(0);
  }, 20_000);
});
