import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  createMapPrefabDocument,
  migrateMapDocumentV2,
  normalizeMapPrefab,
} from '@orchard/sim';
import {
  editorArtRetryDelayMs,
  EDITOR_ART_RETRY_MAXIMUM_MS,
  editorDetailedTileEstimate,
  MAX_EDITOR_DETAILED_TILES,
  mapDetailedTerrainLayerForVisibility,
  mapEditorAuthoredDragFootprint,
  mapEditorAuthoredObjectFootprint,
  mapEditorSelectionFootprintRects,
  mapEditorTerrainRenderMode,
  mapEditorTransitionPreviewSegments,
  mapEditorOverviewLiveMarkerVisible,
  mapGameplayAnchorMarkerScreenPosition,
  mapGameplayAnchorMarkerVisual,
  mapGeneratedBaseDocument,
  mapGeneratedBaseTerrainKey,
  mapOverviewLayerForVisibility,
  mapTerrainOverrideInfluenceRuns,
  visibleMapSelectionFootprint,
  visibleMapGameplayAnchors,
  visibleMapTileRange,
} from './editor-renderer.js';
import { planMapEditorTransition } from './transition-authoring.js';
import type { TerrainArray } from '@orchard/engine';

function terrainFixture(width = 12, height = 12): TerrainArray {
  const length = width * height;
  return {
    spaceId: 4_200_001,
    seed: 42,
    version: 1,
    width,
    height,
    generator: 'debug_flat',
    biomes: new Uint8Array(length).fill(4),
    blocked: Array<boolean>(length).fill(false),
    horseJumpableTerrain: Array<boolean>(length).fill(true),
    elevations: new Int16Array(length),
    defaultCliffFamily: 'stone_1',
    defaultSurfaceFamily: 'grass_1',
    raisedTerrainCollisionClassified: true,
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

describe('map editor render culling', () => {
  it('projects visible gameplay anchors at their stored elevation with kind-specific UI markers', () => {
    const terrain = terrainFixture();
    terrain.elevations[4 * terrain.width + 3] = 2;
    const anchors = [
      { id: 'spawn-a', kind: 'spawn' as const, tileX: 3, tileY: 4, elevation: 2 },
      { id: 'portal-b', kind: 'portal' as const, tileX: 11, tileY: 11, elevation: 0 },
    ];
    const range = { minimumX: 2, minimumY: 3, maximumX: 6, maximumY: 7 };
    expect(visibleMapGameplayAnchors(anchors, range)).toEqual([anchors[0]]);
    expect(mapGameplayAnchorMarkerVisual('spawn')).not.toEqual(mapGameplayAnchorMarkerVisual('portal'));
    expect(mapGameplayAnchorMarkerScreenPosition(
      anchors[0]!, terrain, { x: 100, y: 50, width: 300, height: 200 },
      { x: 16, y: 32, zoom: 2 },
    )).toEqual({ x: 180, y: 66 });
  });

  it('renders every authored transition lane from the semantic preview plan', () => {
    const document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'preview', title: 'Preview', width: 6, height: 6,
    }));
    const elevations = terrainFixture(6, 6);
    elevations.elevations[1 * 6 + 2] = 1;
    elevations.elevations[1 * 6 + 3] = 1;
    const plan = planMapEditorTransition(document, { tileX: 2, tileY: 2 }, { tileX: 2, tileY: 1 },
      'slope', 2, elevations);

    expect(plan.error).toBeNull();
    expect(mapEditorTransitionPreviewSegments(plan)).toEqual([
      { lower: { tileX: 2, tileY: 2, elevation: 0 }, upper: { tileX: 2, tileY: 1, elevation: 1 } },
      { lower: { tileX: 3, tileY: 2, elevation: 0 }, upper: { tileX: 3, tileY: 1, elevation: 1 } },
    ]);
  });

  it('keeps bounded combined close views on the production terrain and object pipeline', () => {
    const source = readFileSync(new URL('./editor-renderer.ts', import.meta.url), 'utf8');
    expect(mapEditorTerrainRenderMode(1, 960, 700, true, true, true)).toBe('detail');
    expect(source).toContain('detailedTerrain.groundCache.draw(');
    expect(source).toContain('drawAnimatedTerrain(');
    expect(source).toContain('enqueueRaisedTerrainDepth(');
    expect(source).toContain('enqueueLiveMapObjects(');
    expect(source).toContain('sortWorldDepthItems(queue)');
  });

  it('uses production artwork branches and per-marker layer visibility for live overlays', () => {
    const source = readFileSync(new URL('./editor-renderer.ts', import.meta.url), 'utf8');
    expect(source).toContain('model.isLayerVisible(marker.layer)');
    expect(source).toContain('drawOverworldChest(');
    expect(source).toContain('drawOverworldPlaceable(');
    expect(source).toContain('drawOverworldAvatar(');
    expect(source).toContain('drawOverworldMerchant(');
    expect(source).toContain('drawOverworldWildlife(');
    expect(source).toContain('drawOverworldArcheryTarget(');
  });

  it('collapses dense one-tile runtime substrates into the fit-map overview', () => {
    expect(mapEditorOverviewLiveMarkerVisible({ entityKind: 'resource' })).toBe(false);
    expect(mapEditorOverviewLiveMarkerVisible({ entityKind: 'surface' })).toBe(false);
    expect(mapEditorOverviewLiveMarkerVisible({ entityKind: 'player' })).toBe(true);
    expect(mapEditorOverviewLiveMarkerVisible({ entityKind: 'npc' })).toBe(true);
    expect(mapEditorOverviewLiveMarkerVisible({ entityKind: 'placeable' })).toBe(true);
  });

  it('selects independent cached overview and production terrain layers for every visibility state', () => {
    expect(mapOverviewLayerForVisibility(true, true)).toBe('combined');
    expect(mapOverviewLayerForVisibility(true, false)).toBe('generated_base');
    expect(mapOverviewLayerForVisibility(false, true)).toBe('terrain');
    expect(mapOverviewLayerForVisibility(false, false)).toBeNull();
    expect(mapDetailedTerrainLayerForVisibility(true, true)).toBe('combined');
    expect(mapDetailedTerrainLayerForVisibility(true, false)).toBe('generated_base');
    expect(mapDetailedTerrainLayerForVisibility(false, true)).toBe('terrain');
    expect(mapDetailedTerrainLayerForVisibility(false, false)).toBeNull();
  });

  it('uses detailed production terrain for every non-empty close layer visibility state', () => {
    expect(mapEditorTerrainRenderMode(1, 960, 700, true, true, true)).toBe('detail');
    expect(mapEditorTerrainRenderMode(1, 960, 700, false, true, true)).toBe('overview');
    expect(mapEditorTerrainRenderMode(1, 960, 700, true, true, false)).toBe('detail');
    expect(mapEditorTerrainRenderMode(1, 960, 700, true, false, true)).toBe('detail');
    expect(mapEditorTerrainRenderMode(1, 960, 700, true, false, false)).toBe('none');
  });

  it('builds a compact authored terrain mask with topology and projection coverage', () => {
    const generatedBase = terrainFixture();
    const elevations = new Int16Array(generatedBase.elevations);
    elevations[6 * generatedBase.width + 6] = 2;
    const combined: TerrainArray = { ...generatedBase, elevations };
    const runs = mapTerrainOverrideInfluenceRuns(combined, generatedBase);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((run) => run.tileY === 6
      && run.firstTileX <= 4 && run.lastTileX >= 8)).toBe(true);
    expect(Math.min(...runs.map(({ tileY }) => tileY))).toBeLessThan(4);
    expect(mapTerrainOverrideInfluenceRuns(generatedBase, generatedBase)).toEqual([]);
    expect(mapTerrainOverrideInfluenceRuns({
      ...generatedBase,
      cliffFamilies: new Uint8Array(generatedBase.width * generatedBase.height),
      surfaceFamilies: new Uint8Array(generatedBase.width * generatedBase.height),
      ledges: new Uint8Array(generatedBase.width * generatedBase.height),
      terrainOverrides: Array.from(
        { length: generatedBase.width * generatedBase.height },
        () => null,
      ),
    }, generatedBase)).toEqual([]);
  });

  it('keeps generated crossings in the base while masking authored transition changes', () => {
    const live = createLiveIslandMapDocument();
    const authoredTransition = {
      contourLevel: 1,
      kind: 'stairs',
      direction: 'up',
      lowerTileX: 6,
      lowerTileY: 6,
      upperTileX: 6,
      upperTileY: 5,
    } as const;
    const edited = {
      ...live,
      cells: { '6,6': { elevation: 0, biome: 'plains' as const } },
      transitions: [...live.transitions, authoredTransition],
      stairRuns: [{ x: 6, y: 6, direction: 'up' as const, fromLevel: 0, toLevel: 1 }],
    };
    const generatedBase = mapGeneratedBaseDocument(edited);
    expect(generatedBase.cells).toEqual({});
    expect(generatedBase.transitions.map((transition) => JSON.stringify(transition)).sort())
      .toEqual(live.transitions.map((transition) => JSON.stringify(transition)).sort());
    expect(generatedBase.stairRuns).toEqual([]);
    expect(mapGeneratedBaseTerrainKey(edited)).toBe(mapGeneratedBaseTerrainKey(live));
    expect(mapGeneratedBaseTerrainKey({ ...edited, baseSurface: 'sand' }))
      .not.toBe(mapGeneratedBaseTerrainKey(live));

    const baseTerrain = terrainFixture();
    const combinedTerrain: TerrainArray = {
      ...baseTerrain,
      terrainTransitions: [authoredTransition],
    };
    const runs = mapTerrainOverrideInfluenceRuns(combinedTerrain, baseTerrain);
    expect(runs.some((run) => run.tileY === 6
      && run.firstTileX <= 6 && run.lastTileX >= 6)).toBe(true);
  });

  it('keeps isolated production layers cached outside the frame loop', () => {
    const source = readFileSync(new URL('./editor-renderer.ts', import.meta.url), 'utf8');
    const loader = readFileSync(new URL('./editor-terrain-loader.ts', import.meta.url), 'utf8');
    const worker = readFileSync(new URL('./editor-terrain-worker.ts', import.meta.url), 'utf8');
    expect(source).toContain('readonly #generatedBaseGroundCache = new GroundChunkCache()');
    expect(source).toContain("#generatedBaseTerrainKey = ''");
    expect(source).toContain('this.#generatedBaseTerrain !== null');
    expect(source).toContain('const clipRuns = this.#terrainOverrideInfluenceRuns ?? []');
    expect(source).toContain('if (clipRuns.length > 0)');
    expect(source).toContain('drawAnimatedTerrain(');
    expect(source).toContain('enqueueRaisedTerrainDepth(');
    expect(source).toContain('context.clip(terrainClip');
    expect(source).toContain('if (this.#terrainPendingIdentity === terrainIdentity) return null');
    expect(source).toContain('this.#terrainLoader.load(mapDocument)');
    expect(source).toContain('this.#terrainLoader.dispose()');
    expect(source).toContain('this.#overlayCache.dispose()');
    expect(source).toContain('this.#terrainFallbackTimer = setTimeout');
    expect(source).not.toContain(
      'return this.acceptTerrain(mapDocument, terrainIdentity, buildMapEditorTerrain(mapDocument))',
    );
    expect(source).toContain(
      'this.#generatedBaseTerrainKey !== derivatives.generatedBaseTerrainKey',
    );
    expect(loader).toContain("new Worker(new URL('./editor-terrain-worker.ts', import.meta.url)");
    expect(worker).toContain('buildMapEditorTerrainDerivatives(document, terrain)');
    expect(worker).toContain('encodeMapEditorTerrainDerivatives(');
    expect(source).not.toContain('editorMapOverviewRaster(');
    expect(source).not.toContain('mapTerrainOverrideInfluenceRuns(');
    expect(source).toContain('this.#overviewCache.image(model.terrainIdentity(), overviewLayer)');
  });

  it('backs failed artwork requests off exponentially and caps the cooldown', () => {
    expect(editorArtRetryDelayMs(1)).toBe(1_000);
    expect(editorArtRetryDelayMs(2)).toBe(2_000);
    expect(editorArtRetryDelayMs(3)).toBe(4_000);
    expect(editorArtRetryDelayMs(100)).toBe(EDITOR_ART_RETRY_MAXIMUM_MS);
    expect(editorArtRetryDelayMs(Number.NaN)).toBe(1_000);

    const source = readFileSync(new URL('./editor-renderer.ts', import.meta.url), 'utf8');
    expect(source).toContain('if (Date.now() < this.#artRetryAt) return null');
    expect(source).toContain('this.#artFailureCount += 1');
    expect(source).toContain('retryDetailedArt(): void');
  });

  it('retains semantic overview LOD below the detailed pass capacity', () => {
    expect(mapEditorTerrainRenderMode(0.49, 2_048, 1_080, true, true, true)).toBe('overview');
    expect(mapEditorTerrainRenderMode(0.5, 2_048, 1_080, true, true, true)).toBe('overview');
    expect(mapEditorTerrainRenderMode(1, 2_048, 1_080, true, true, true)).toBe('detail');
  });

  it('bounds detailed production terrain by visible tile count', () => {
    expect(editorDetailedTileEstimate(0.5, 2_048, 1_080)).toBeGreaterThan(MAX_EDITOR_DETAILED_TILES);
    expect(editorDetailedTileEstimate(1, 2_048, 1_080)).toBeLessThanOrEqual(MAX_EDITOR_DETAILED_TILES);
  });

  it('limits detailed grid work to visible world tiles', () => {
    expect(visibleMapTileRange(
      { width: 832, height: 832 },
      { x: 80, y: 20, width: 960, height: 700 },
      { x: 6_400, y: 4_800, zoom: 2 },
    )).toEqual({ minimumX: 400, minimumY: 300, maximumX: 430, maximumY: 322 });
  });

  it('clamps distant views to finite map bounds', () => {
    expect(visibleMapTileRange(
      { width: 10, height: 8 },
      { x: 0, y: 0, width: 640, height: 480 },
      { x: -500, y: -500, zoom: 0.5 },
    )).toEqual({ minimumX: 0, minimumY: 0, maximumX: 10, maximumY: 8 });
  });

  it('uses the exact transformed collision footprint for selected authored objects', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'selection-footprint', title: 'Selection Footprint', width: 12, height: 12,
    }));
    const created = createMapPrefabDocument({ id: 'long-object', title: 'Long Object', width: 2, height: 1 });
    const prefab = normalizeMapPrefab({
      ...created,
      pivot: { tileX: 0, tileY: 0 },
      cells: [
        { id: 'left', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0001 },
        { id: 'right', tileX: 1, tileY: 0, elevation: 1, collisionMask: 0xffff },
      ],
    });
    const object = {
      id: 'selected', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 5, tileY: 6, elevation: 1, layer: 'objects' as const,
      quarterTurns: 1 as const, flipX: false, enabled: false,
    };
    const document = { ...base, prefabs: [prefab], objects: [object] };
    expect(mapEditorAuthoredObjectFootprint(document, object).map(({ tileX, tileY, elevation }) => ({
      tileX, tileY, elevation,
    }))).toEqual([
      { tileX: 5, tileY: 6, elevation: 1 },
      { tileX: 5, tileY: 7, elevation: 2 },
    ]);

    const nonBlocking = normalizeMapPrefab({
      ...prefab,
      id: 'non-blocking',
      cells: prefab.cells.map((cell) => ({ ...cell, collisionMask: 0 })),
    });
    const scaled = { ...object, enabled: true, prefabId: nonBlocking.id,
      prefabRevision: nonBlocking.revision, quarterTurns: 0 as const, scale: 2 as const };
    const scaledDocument = { ...base, prefabs: [nonBlocking], objects: [scaled] };
    const scaledFootprint = mapEditorAuthoredObjectFootprint(scaledDocument, scaled);
    expect(scaledFootprint).toHaveLength(8);
    expect(scaledFootprint.every(({ collisionMask }) => collisionMask === 0)).toBe(true);

    expect(mapEditorAuthoredDragFootprint(document, object, {
      tileX: 8, tileY: 3, elevation: 4,
    }).map(({ tileX, tileY, elevation }) => ({ tileX, tileY, elevation }))).toEqual([
      { tileX: 8, tileY: 3, elevation: 4 },
      { tileX: 8, tileY: 4, elevation: 5 },
    ]);
  });

  it('projects footprint cells and collision quarters without scanning offscreen cells', () => {
    const terrain = terrainFixture();
    const cells = [
      { tileX: 3, tileY: 4, elevation: 0, collisionMask: 0x8001 },
      { tileX: 200, tileY: 200, elevation: 0, collisionMask: 0xffff },
    ];
    const visible = visibleMapSelectionFootprint(cells, {
      minimumX: 0, minimumY: 0, maximumX: 10, maximumY: 10,
    });
    expect(visible).toEqual([cells[0]]);
    const rects = mapEditorSelectionFootprintRects(visible, terrain,
      { x: 100, y: 50, width: 640, height: 480 }, { x: 16, y: 32, zoom: 2 });
    expect(rects).toHaveLength(1);
    expect(rects[0]?.tile).toEqual({ x: 164, y: 114, width: 32, height: 32 });
    expect(rects[0]?.collision).toEqual([
      { x: 164, y: 114, width: 8, height: 8 },
      { x: 188, y: 138, width: 8, height: 8 },
    ]);
  });
});
