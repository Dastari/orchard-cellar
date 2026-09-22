import { describe, expect, it } from 'vitest';
import {
  applyMapEdit,
  commitMapEdit,
  collisionMapForCompiledMapDocument,
  collisionTileIsBlockedAtPlane,
  cellFamilyAt,
  compileMapDocument,
  compiledMapElevationAt,
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  createMapEditHistory,
  createTerrainLabDocument,
  mapCollisionAtPlane,
  mapDependencyHalo,
  minimumTerrainBrushPoints,
  mapDocumentHash,
  parseMapDocument,
  rasterMapLine,
  redoMapEdit,
  resolvedMapCellAt,
  semanticTerrainTraceAt,
  serializeMapDocument,
  undoMapEdit,
  validateMapDocument,
  cliffFamilyAtIndex,
  cliffFamilyIndex,
  TERRAIN_CLIFF_FAMILY_IDS,
  TERRAIN_SURFACE_FAMILY_IDS,
  bootstrapTilesetDefinitions,
  runtimeTilesetResolver,
  surfaceFamilyAtIndex,
  terrainCliffTileSet,
  terrainDocumentForMapV3,
  terrainWalkingStepAllowed,
  terrainPlaneCollisionBytesForElevationGrid,
  raisedTerrainInsetRolesAt,
} from './index.js';

describe('MapDocumentV2 editor foundation', () => {
  it('paints a zero-height ledge polygon as base blocking without collision-plane rows', () => {
    const base = createEmptyMapDocument({ id: 'ledge', title: 'Ledge', width: 8, height: 8 });
    const edited = applyMapEdit(base, {
      kind: 'set_ledge_polygon',
      polygon: [
        { tileX: 2, tileY: 2 }, { tileX: 6, tileY: 2 },
        { tileX: 6, tileY: 6 }, { tileX: 2, tileY: 6 },
      ],
      ledge: true,
    }).document;
    expect(resolvedMapCellAt(edited, 3, 3)).toMatchObject({ elevation: 0, ledge: true });
    const compiled = compileMapDocument(edited);
    const index = 3 * compiled.width + 3;
    expect(compiled.blocked[index]).toBe(true);
    expect(collisionMapForCompiledMapDocument(compiled).terrainPlaneBlocked?.[index]).toBe(0);
    const opened = applyMapEdit(edited, {
      kind: 'paint', points: [{ tileX: 3, tileY: 3 }], patch: { ledge: false },
    }).document;
    expect(resolvedMapCellAt(opened, 3, 3).ledge).toBe(false);
    const openedCompiled = compileMapDocument(opened);
    expect(collisionTileIsBlockedAtPlane(
      collisionMapForCompiledMapDocument(openedCompiled), 3, 3, 0,
    )).toBe(false);
  });

  it('stamps a 2x2 minimum and prunes one-cell-wide raised remnants', () => {
    const base = createEmptyMapDocument({ id: 'minimum-cliff', title: 'Minimum cliff', width: 6, height: 6 });
    const stamp = minimumTerrainBrushPoints({ tileX: 2, tileY: 2 }, base.width, base.height);
    expect(stamp).toEqual([
      { tileX: 2, tileY: 2 }, { tileX: 3, tileY: 2 },
      { tileX: 2, tileY: 3 }, { tileX: 3, tileY: 3 },
    ]);
    const raised = applyMapEdit(base, {
      kind: 'paint', points: stamp, patch: { elevation: 1 },
      enforceMinimumTerrainFootprint: true,
    }).document;
    expect(stamp.map(({ tileX, tileY }) => resolvedMapCellAt(raised, tileX, tileY).elevation))
      .toEqual([1, 1, 1, 1]);

    const thinned = applyMapEdit(raised, {
      kind: 'paint', points: [{ tileX: 2, tileY: 2 }, { tileX: 2, tileY: 3 }],
      patch: { elevation: 0 }, enforceMinimumTerrainFootprint: true,
    }).document;
    expect([2, 3].flatMap((tileY) => [2, 3].map(
      (tileX) => resolvedMapCellAt(thinned, tileX, tileY).elevation,
    ))).toEqual([0, 0, 0, 0]);
  });

  it('applies the same 2x2 minimum to excavated contours', () => {
    const base = createEmptyMapDocument({ id: 'minimum-pit', title: 'Minimum pit', width: 4, height: 4 });
    const rejected = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { elevation: -1 },
      enforceMinimumTerrainFootprint: true,
    }).document;
    expect(resolvedMapCellAt(rejected, 1, 1).elevation).toBe(0);
  });

  it('warns when an imported document bypasses the 2x2 terrain minimum', () => {
    const base = createEmptyMapDocument({ id: 'imported-spur', title: 'Imported spur', width: 4, height: 4 });
    const imported = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { elevation: 1 },
    }).document;
    expect(validateMapDocument(imported)).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'terrain_footprint_too_small', tileX: 1, tileY: 1,
    }));
  });

  it('round-trips a canonical source document with a stable content hash', () => {
    const document = createTerrainLabDocument();
    const source = serializeMapDocument(document);
    const parsed = parseMapDocument(source);
    expect(serializeMapDocument(parsed)).toBe(source);
    expect(mapDocumentHash(parsed)).toBe(mapDocumentHash(document));
    expect(source).not.toContain('references/');
  });

  it('reports invalid programmatic gameplay anchors before publication', () => {
    const base = createEmptyMapDocument({ id: 'anchors', title: 'Anchors', width: 4, height: 4 });
    const document = {
      ...base,
      anchors: [
        { id: 'duplicate', kind: 'poi' as const, tileX: 1, tileY: 1, elevation: 0, label: 'Gate' },
        { id: 'duplicate', kind: 'spawn' as const, tileX: 8, tileY: 1, elevation: 0 },
        { id: 'height-drift', kind: 'spawn' as const, tileX: 2, tileY: 2, elevation: 1 },
        { id: 'blank', kind: 'label' as const, tileX: 3, tileY: 3, elevation: 0, label: ' ' },
      ],
    };
    expect(validateMapDocument(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'anchor_duplicate' }),
      expect.objectContaining({ code: 'anchor_out_of_bounds', tileX: 8, tileY: 1 }),
      expect.objectContaining({ code: 'anchor_height_mismatch', tileX: 2, tileY: 2 }),
      expect.objectContaining({ code: 'anchor_label_invalid', tileX: 3, tileY: 3 }),
    ]));
  });

  it('uses the same deterministic line cells for pointer and headless strokes', () => {
    expect(rasterMapLine({ tileX: 1, tileY: 1 }, { tileX: 5, tileY: 3 })).toEqual([
      { tileX: 1, tileY: 1 },
      { tileX: 2, tileY: 2 },
      { tileX: 3, tileY: 2 },
      { tileX: 4, tileY: 3 },
      { tileX: 5, tileY: 3 },
    ]);
  });

  it('paints, fills, raises a closed contour, and restores exact undo/redo hashes', () => {
    const empty = createEmptyMapDocument({ id: 'fixture', title: 'Fixture', width: 8, height: 8 });
    let history = createMapEditHistory(empty);
    history = commitMapEdit(history, {
      kind: 'line', from: { tileX: 1, tileY: 2 }, to: { tileX: 6, tileY: 2 }, patch: { surface: 'sand' },
    });
    const sandHash = mapDocumentHash(history.present);
    history = commitMapEdit(history, {
      kind: 'change_elevation_polygon', delta: 1,
      polygon: [
        { tileX: 2, tileY: 3 }, { tileX: 6, tileY: 3 },
        { tileX: 6, tileY: 7 }, { tileX: 2, tileY: 7 },
      ],
    });
    expect(resolvedMapCellAt(history.present, 3, 4).elevation).toBe(1);
    const raisedHash = mapDocumentHash(history.present);
    history = undoMapEdit(history);
    expect(mapDocumentHash(history.present)).toBe(sandHash);
    history = redoMapEdit(history);
    expect(mapDocumentHash(history.present)).toBe(raisedHash);

    const filled = applyMapEdit(history.present, {
      kind: 'fill_surface', start: { tileX: 0, tileY: 0 }, surface: 'dirt',
    });
    expect(resolvedMapCellAt(filled.document, 0, 0).surface).toBe('dirt');
    expect(resolvedMapCellAt(filled.document, 3, 2).surface).toBe('sand');
  });

  it('resizes every authored layer by one relative offset and supports exact undo', () => {
    const empty = createEmptyMapDocument({ id: 'resize', title: 'Resize', width: 4, height: 3 });
    const painted = applyMapEdit(empty, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { surface: 'stone' },
    }).document;
    const source = {
      ...painted,
      transitions: [{
        contourLevel: 1, kind: 'slope', direction: 'up',
        lowerTileX: 1, lowerTileY: 1, upperTileX: 1, upperTileY: 0,
      }] as const,
      scenery: [{ id: 'tree', assetId: 'tree', tileX: 2, tileY: 1, elevation: 0 }],
      anchors: [{ id: 'spawn', kind: 'spawn' as const, tileX: 2, tileY: 2, elevation: 0 }],
    };
    let history = createMapEditHistory(source);
    history = commitMapEdit(history, { kind: 'resize', width: 6, height: 5, anchor: 'south_east' });
    expect(history.present).toMatchObject({ width: 6, height: 5, revision: source.revision + 1 });
    expect(resolvedMapCellAt(history.present, 3, 3).surface).toBe('stone');
    expect(history.present.transitions[0]).toMatchObject({
      lowerTileX: 3, lowerTileY: 3, upperTileX: 3, upperTileY: 2,
    });
    expect(history.present.scenery[0]).toMatchObject({ tileX: 4, tileY: 3 });
    expect(history.present.anchors[0]).toMatchObject({ tileX: 4, tileY: 4 });
    history = undoMapEdit(history);
    expect(history.present).toEqual(source);
  });

  it('crops out-of-bounds layers and deterministically biases odd centre growth south-east', () => {
    const source = applyMapEdit(
      createEmptyMapDocument({ id: 'crop', title: 'Crop', width: 4, height: 4 }),
      { kind: 'paint', points: [{ tileX: 0, tileY: 0 }], patch: { surface: 'stone' } },
    ).document;
    const grown = applyMapEdit(source, {
      kind: 'resize', width: 5, height: 5, anchor: 'center',
    }).document;
    expect(resolvedMapCellAt(grown, 0, 0).surface).toBe('stone');
    const cropped = applyMapEdit(grown, {
      kind: 'resize', width: 3, height: 3, anchor: 'south_east',
    });
    expect(cropped.fullRebuild).toBe(true);
    expect(cropped.document.cells).toEqual({});
    expect(() => applyMapEdit(source, {
      kind: 'resize', width: 0, height: 4, anchor: 'north_west',
    })).toThrow('positive integers');
  });

  it('derives height-plane collision and dirty dependency halos', () => {
    const empty = createEmptyMapDocument({
      id: 'planes', title: 'Planes', width: 5, height: 5, baseElevation: 2,
    });
    const edited = applyMapEdit(empty, {
      kind: 'paint', points: [{ tileX: 2, tileY: 2 }], patch: { elevation: 3 },
    }).document;
    const compiled = compileMapDocument(edited);
    expect(mapCollisionAtPlane(compiled, 2, 2, 2)).toBe('blocked');
    expect(mapCollisionAtPlane(compiled, 2, 2, 3)).toBe('open');
    expect(mapDependencyHalo(edited, [{ tileX: 0, tileY: 0 }], 1)).toEqual([
      { tileX: 0, tileY: 0 }, { tileX: 1, tileY: 0 },
      { tileX: 0, tileY: 1 }, { tileX: 1, tileY: 1 },
    ]);
  });

  it('flattens a polygon to the elevation sampled at its first point', () => {
    const base = createEmptyMapDocument({ id: 'flatten', title: 'Flatten', width: 5, height: 5 });
    const raised = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { elevation: 3 },
    }).document;
    const flattened = applyMapEdit(raised, {
      kind: 'flatten_elevation_polygon',
      polygon: [
        { tileX: 1, tileY: 1 }, { tileX: 3, tileY: 1 },
        { tileX: 3, tileY: 3 }, { tileX: 1, tileY: 3 },
      ],
    }).document;
    expect(resolvedMapCellAt(flattened, 2, 2).elevation).toBe(3);
  });

  it('uses zero as an unset cliff-family ordinal and round-trips every id', () => {
    expect(cliffFamilyAtIndex(0)).toBeNull();
    for (const family of TERRAIN_CLIFF_FAMILY_IDS) {
      expect(cliffFamilyAtIndex(cliffFamilyIndex(family))).toBe(family);
    }
  });

  it('persists a selected grass surface family independently from cliff art', () => {
    const base = createEmptyMapDocument({ id: 'surface', title: 'Surface', width: 3, height: 3 });
    const painted = applyMapEdit(base, {
      kind: 'paint',
      points: [{ tileX: 1, tileY: 1 }],
      patch: { surface: 'grass', surfaceFamily: 'grass_4', cliffFamily: 'desert_2' },
    }).document;
    const compiled = compileMapDocument(parseMapDocument(serializeMapDocument(painted)));
    expect(surfaceFamilyAtIndex(compiled.surfaceFamilies[4] ?? 0)).toBe('grass_4');
    expect(resolvedMapCellAt(painted, 1, 1)).toMatchObject({
      surfaceFamily: 'grass_4', cliffFamily: 'desert_2',
    });
  });

  it('decodes a painted cliff family consistently in trace, collision, and validation', () => {
    const base = createEmptyMapDocument({
      id: 'dungeon-family', title: 'Dungeon family', width: 7, height: 7,
      baseElevation: 1,
    });
    const everyCell = Array.from({ length: base.width * base.height }, (_, index) => ({
      tileX: index % base.width,
      tileY: Math.floor(index / base.width),
    }));
    const dungeon = applyMapEdit(base, {
      kind: 'paint', points: everyCell, patch: { cliffFamily: 'dungeon_2' },
    }).document;
    const floor = applyMapEdit(dungeon, {
      kind: 'paint',
      points: Array.from({ length: 9 }, (_, index) => ({
        tileX: 2 + index % 3,
        tileY: 2 + Math.floor(index / 3),
      })),
      patch: { elevation: 0 },
    }).document;
    const compiled = compileMapDocument(floor);
    expect(cellFamilyAt(compiled, 3, 3)).toBe('dungeon_2');
    const trace = semanticTerrainTraceAt(floor, 3, 3, compiled);
    expect(trace.layers).toContainEqual(expect.objectContaining({
      role: 'contour.face.lower_wall.middle', family: 'dungeon_2',
    }));
    expect(trace.layers.every(({ family }) => family === 'dungeon_2')).toBe(true);
    expect(collisionTileIsBlockedAtPlane(
      collisionMapForCompiledMapDocument(compiled), 3, 2, 0,
    )).toBe(true);
    const overridden = applyMapEdit(floor, {
      kind: 'paint', points: [{ tileX: 3, tileY: 3 }],
      patch: {
        cliffFamily: 'dungeon_2',
        terrainOverride: {
          contourLevel: 1,
          role: 'face.lower_wall.middle',
          family: 'dungeon_2',
          frameIndex: 89,
        },
      },
    }).document;
    expect(semanticTerrainTraceAt(overridden, 3, 3).layers).toContainEqual(expect.objectContaining({
      role: 'contour.override.face.lower_wall.middle', family: 'dungeon_2', frameIndex: 89,
    }));
    expect(() => validateMapDocument(overridden)).not.toThrow();
    expect(validateMapDocument(overridden).filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(validateMapDocument(overridden)).not.toContainEqual(expect.objectContaining({
      code: 'terrain_override_stale',
    }));
  });

  it('builds signed plane collision for an authored pit and clears its crossing lanes', () => {
    const base = createEmptyMapDocument({ id: 'pit', title: 'Pit', width: 5, height: 5 });
    const pit = applyMapEdit(base, {
      kind: 'paint',
      points: [{ tileX: 2, tileY: 2 }, { tileX: 3, tileY: 2 }],
      patch: { elevation: -1 },
    }).document;
    const withCrossing = applyMapEdit(pit, {
      kind: 'add_transitions',
      transitions: [2, 3].map((tileX) => ({
        contourLevel: 0,
        kind: 'slope' as const,
        direction: 'up' as const,
        lowerTileX: tileX,
        lowerTileY: 2,
        upperTileX: tileX,
        upperTileY: 1,
      })),
    }).document;
    const compiled = compileMapDocument(withCrossing);
    const collision = collisionMapForCompiledMapDocument(compiled);
    expect(collision.terrainMinimumElevation).toBe(-1);
    expect(collision.terrainPlaneBlocked).toHaveLength(2 * 25);
    expect(collisionTileIsBlockedAtPlane(collision, 2, 2, -1)).toBe(false);
    expect(collisionTileIsBlockedAtPlane(collision, 2, 1, 0)).toBe(false);
    expect(terrainWalkingStepAllowed(
      compiled.elevations, compiled.width, compiled.height, compiled.transitions,
      2, 2, 2, 1,
    )).toBe(true);
  });

  it('places each stacked direct-drop face on the plane immediately below its contour', () => {
    const width = 5;
    const height = 10;
    const elevations = new Int16Array(width * height);
    for (let tileY = 2; tileY <= 5; tileY += 1) {
      for (let tileX = 1; tileX <= 3; tileX += 1) {
        elevations[tileY * width + tileX] = 3;
      }
    }
    const collision = terrainPlaneCollisionBytesForElevationGrid(
      width, height, elevations, [], 'stone_1',
    );
    const stride = width * height;
    expect(collision[0 * stride + 5 * width + 2]).toBe(1);
    expect(collision[1 * stride + 4 * width + 2]).toBe(1);
    expect(collision[2 * stride + 3 * width + 2]).toBe(1);
  });

  it('does not wrap a south-edge pit face into the next collision plane', () => {
    const width = 3;
    const height = 3;
    const elevations = Int16Array.from([
       0, -1, -2,
      -1, -1, -2,
      -2, -2, -2,
    ]);
    const collision = terrainPlaneCollisionBytesForElevationGrid(
      width, height, elevations, [], 'stone_1',
    );
    const stride = width * height;
    // The projected L-1 face below the south edge lies at y=3 and must be
    // discarded. Without the upper bound it aliases plane L-1, tile (0,0).
    expect(collision[1 * stride + 0]).toBe(0);
    expect(collision[1 * stride + 1]).toBe(1);
  });

  it('draws the capped cave face below a rounded turn without blocking the floor under it', () => {
    const width = 7;
    const base = createEmptyMapDocument({
      id: 'cave-corner-plane',
      title: 'Cave corner plane',
      width,
      height: 8,
      baseElevation: 0,
      baseSurface: 'cave_floor',
      cliffFamily: 'cave',
    });
    const points = [
      { tileX: 2, tileY: 1 }, { tileX: 3, tileY: 1 }, { tileX: 4, tileY: 1 },
      { tileX: 3, tileY: 2 }, { tileX: 4, tileY: 2 },
      { tileX: 3, tileY: 3 }, { tileX: 4, tileY: 3 },
      { tileX: 3, tileY: 4 }, { tileX: 4, tileY: 4 },
    ];
    const document = applyMapEdit(base, {
      kind: 'paint', points, patch: { elevation: 1 },
    }).document;
    const compiled = compileMapDocument(document);
    const collision = collisionMapForCompiledMapDocument(compiled).terrainPlaneBlocked!;
    const target = 2 * width + 2;
    const stride = width * compiled.height;
    expect(semanticTerrainTraceAt(document, 2, 1).layers).toContainEqual(
      expect.objectContaining({ role: 'contour.edge.top_left', frameIndex: 25 }),
    );
    expect(semanticTerrainTraceAt(document, 2, 2).layers).toContainEqual(
      expect.objectContaining({
        role: 'contour.face.wall.left', frameIndex: 46, blocksMovement: true,
      }),
    );
    expect(semanticTerrainTraceAt(document, 2, 2).layers).not.toContainEqual(
      expect.objectContaining({ role: 'contour.edge.bottom_left' }),
    );
    // Only the rock footprint collides; the displaced face is not floor collision.
    expect(collision[width + 2]).toBe(1);
    expect(collision[target]).toBe(0);
    expect(collision[stride + target]).toBe(0);
  });

  it('reports invalid stair data without throwing during compile or edit', () => {
    const base = createEmptyMapDocument({ id: 'invalid-stair', title: 'Invalid Stair', width: 4, height: 4 });
    const invalidRun = { x: 1, y: 1, direction: 'up' as const, fromLevel: 2, toLevel: 1 };
    const document = { ...base, stairRuns: [invalidRun] };
    expect(() => compileMapDocument(document)).not.toThrow();
    expect(validateMapDocument(document)).toContainEqual(expect.objectContaining({ code: 'stair_run_invalid' }));
    expect(applyMapEdit(base, { kind: 'add_stair_run', run: invalidRun }).document).toBe(base);
    expect(() => parseMapDocument(JSON.stringify(document))).toThrow('Map stair run is invalid');
  });

  it('aligns raised-map out-of-bounds elevation with the renderer datum', () => {
    const document = createEmptyMapDocument({
      id: 'oob', title: 'OOB', width: 3, height: 3, baseElevation: 2,
    });
    expect(compiledMapElevationAt(compileMapDocument(document), -1, 1)).toBe(0);
  });

  it('keeps interaction ladders solid to ordinary walking', () => {
    const base = createEmptyMapDocument({ id: 'ladder', title: 'Ladder', width: 3, height: 3 });
    const raised = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { elevation: 1 },
    }).document;
    const document = applyMapEdit(raised, {
      kind: 'add_transition',
      transition: {
        contourLevel: 1,
        kind: 'ladder',
        direction: 'up',
        lowerTileX: 1,
        lowerTileY: 2,
        upperTileX: 1,
        upperTileY: 1,
      },
    }).document;
    const compiled = compileMapDocument(document);
    expect(mapCollisionAtPlane(compiled, 1, 2, 1)).toBe('blocked');
    expect(mapCollisionAtPlane(compiled, 1, 1, 0)).toBe('blocked');
  });

  it('fails publication validation closed on transitions without an exact runtime contract', () => {
    const base = createEmptyMapDocument({ id: 'transition-capability', title: 'Transitions', width: 5, height: 5 });
    const northRaised = applyMapEdit(base, {
      kind: 'paint',
      points: [
        { tileX: 1, tileY: 0 }, { tileX: 2, tileY: 0 },
        { tileX: 1, tileY: 1 }, { tileX: 2, tileY: 1 },
      ],
      patch: { elevation: 1 },
    }).document;
    const northBank = [1, 2].map((tileX) => ({
      contourLevel: 1,
      kind: 'slope' as const,
      direction: 'up' as const,
      lowerTileX: tileX,
      lowerTileY: 2,
      upperTileX: tileX,
      upperTileY: 1,
    }));
    expect(validateMapDocument({ ...northRaised, transitions: northBank })
      .filter(({ code }) => code.startsWith('transition_'))).toEqual([]);
    expect(validateMapDocument({
      ...northRaised,
      transitions: northBank.map((transition) => ({ ...transition, kind: 'stairs' as const })),
    })).toContainEqual(expect.objectContaining({ code: 'transition_stair_art_unavailable' }));
    expect(validateMapDocument({
      ...northRaised,
      transitions: [{ ...northBank[0]!, kind: 'ladder' as const }],
    })).toContainEqual(expect.objectContaining({ code: 'transition_ladder_runtime_unavailable' }));
    expect(validateMapDocument({
      ...northRaised,
      defaultCliffFamily: 'cave',
      transitions: northBank,
    })).toContainEqual(expect.objectContaining({ code: 'transition_family_art_unavailable' }));
    expect(validateMapDocument({
      ...northRaised,
      transitions: [northBank[0]!],
    })).toContainEqual(expect.objectContaining({ code: 'transition_bank_width_unavailable' }));

    const eastRaised = applyMapEdit(base, {
      kind: 'paint',
      points: [
        { tileX: 2, tileY: 1 }, { tileX: 3, tileY: 1 },
        { tileX: 2, tileY: 2 }, { tileX: 3, tileY: 2 },
      ],
      patch: { elevation: 1 },
    }).document;
    expect(validateMapDocument({
      ...eastRaised,
      transitions: [1, 2].map((tileY) => ({
        contourLevel: 1,
        kind: 'slope' as const,
        direction: 'right' as const,
        lowerTileX: 1,
        lowerTileY: tileY,
        upperTileX: 2,
        upperTileY: tileY,
      })),
    })).toContainEqual(expect.objectContaining({ code: 'transition_direction_art_unavailable' }));
  });

  it('fingerprints only the six pinned live-island stairs for legacy compatibility', () => {
    const document = terrainDocumentForMapV3(createLiveIslandMapDocument());
    const slopes = document.transitions.filter(({ kind }) => kind === 'slope');
    const stairs = document.transitions.filter(({ kind }) => kind === 'stairs');
    expect(slopes.length).toBeGreaterThan(0);
    expect(stairs.map((transition) => [
      transition.contourLevel,
      transition.lowerTileX,
      transition.lowerTileY,
      transition.upperTileX,
      transition.upperTileY,
    ].join(':'))).toEqual([
      '1:474:408:474:407', '1:475:408:475:407',
      '2:474:407:474:406', '2:475:407:475:406',
      '3:474:406:474:405', '3:475:406:475:405',
    ]);
    expect(validateMapDocument(
      { ...document, transitions: slopes },
      undefined,
      runtimeTilesetResolver(bootstrapTilesetDefinitions()),
    ).filter(({ severity }) => severity === 'error')).toEqual([]);
    const fullIssues = validateMapDocument(
      document,
      undefined,
      runtimeTilesetResolver(bootstrapTilesetDefinitions()),
    );
    expect(fullIssues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(fullIssues).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'transition_legacy_generated_stair_compatibility',
      tileX: 474, tileY: 408,
    }));

    const slope = slopes[0]!;
    expect(validateMapDocument(
      { ...document, transitions: [...document.transitions, { ...slope, kind: 'stairs' }] },
      undefined,
      runtimeTilesetResolver(bootstrapTilesetDefinitions()),
    )).toContainEqual(expect.objectContaining({ code: 'transition_stair_art_unavailable' }));
    expect(validateMapDocument(
      { ...document, provenance: { ...document.provenance, generatorVersion: 31 } },
      undefined,
      runtimeTilesetResolver(bootstrapTilesetDefinitions()),
    )).toContainEqual(expect.objectContaining({ code: 'transition_stair_art_unavailable' }));
  });

  it('exposes asset-independent contour roles and WHY reasons', () => {
    const lab = createTerrainLabDocument();
    const trace = semanticTerrainTraceAt(lab, 19, 48);
    expect(trace.elevation).toBe(1);
    expect(trace.layers.some((layer) => layer.role.startsWith('crossing.ramp_'))).toBe(true);
    expect(trace.layers.every((layer) => layer.reason.length > 0)).toBe(true);
  });

  it('applies a terrain override to its named role slot within a layered contour', () => {
    const lab = createTerrainLabDocument();
    const original = semanticTerrainTraceAt(lab, 47, 3);
    expect(original.layers.filter(({ contourLevel }) => contourLevel === 0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'contour.edge.bottom_right', frameIndex: 31 }),
        expect.objectContaining({ role: 'contour.face.lower_wall.left', frameIndex: 57 }),
      ]),
    );
    const edited = applyMapEdit(lab, {
      kind: 'paint',
      points: [{ tileX: 47, tileY: 3 }],
      patch: {
        terrainOverride: {
          contourLevel: 0,
          role: 'bottom_right',
          frameIndex: 777,
        },
      },
    }).document;
    const traced = semanticTerrainTraceAt(edited, 47, 3);
    expect(traced.layers).toContainEqual(expect.objectContaining({
      role: 'contour.override.bottom_right', frameIndex: 777,
    }));
    expect(traced.layers).toContainEqual(expect.objectContaining({
      role: 'contour.face.lower_wall.left', frameIndex: 57,
    }));
    expect(validateMapDocument(edited)).not.toContainEqual(expect.objectContaining({
      code: 'terrain_override_stale',
    }));
  });

  it('validates ramps and a three-course stair against signed coordinate-derived heights', () => {
    const lab = createTerrainLabDocument();
    // Four extra direct transitions are the explicit 4-lane review fixture.
    expect(lab.transitions).toHaveLength(14);
    expect(lab.stairRuns).toHaveLength(1);
    expect(compileMapDocument(lab).transitions).toHaveLength(20);
    // The terrain-lab deliberately retains its isolated-cell review fixture;
    // imported-map validation now reports that fixture instead of silently
    // accepting geometry the editor brush would normalize away.
    expect(validateMapDocument(lab)).toEqual([
      expect.objectContaining({
        severity: 'warning', code: 'terrain_footprint_too_small', tileX: 7, tileY: 58,
      }),
      expect.objectContaining({
        severity: 'error', code: 'transition_stair_art_unavailable', tileX: 19, tileY: 35,
      }),
    ]);
    expect(resolvedMapCellAt(lab, 20, 27).elevation).toBe(5);
    expect(resolvedMapCellAt(lab, 60, 27).elevation).toBe(-3);
  });

  it('compiles map and cell cliff families plus final terrain overrides as source data', () => {
    const base = createEmptyMapDocument({ id: 'families', title: 'Families', width: 4, height: 4 });
    const desert = applyMapEdit(base, {
      kind: 'set_default_cliff_family', family: 'desert_1',
    }).document;
    const edited = applyMapEdit(desert, {
      kind: 'paint',
      points: [{ tileX: 1, tileY: 1 }],
      patch: {
        elevation: 1,
        cliffFamily: 'stone_4',
        terrainOverride: {
          contourLevel: 1,
          family: 'shroomlands',
          role: 'top_left',
          frameIndex: terrainCliffTileSet('shroomlands')!.edgeFrames.top_left!,
        },
      },
    }).document;
    const compiled = compileMapDocument(edited);
    expect(compiled.defaultCliffFamily).toBe('desert_1');
    expect(resolvedMapCellAt(edited, 1, 1).cliffFamily).toBe('stone_4');
    expect(compiled.terrainOverrides[5]).toEqual({
      contourLevel: 1,
      family: 'shroomlands',
      role: 'top_left',
      frameIndex: terrainCliffTileSet('shroomlands')!.edgeFrames.top_left!,
    });
    expect(semanticTerrainTraceAt(edited, 1, 1, compiled).layers.at(-1)?.family).toBe('shroomlands');
    expect(validateMapDocument(edited).filter(({ severity }) => severity === 'error')).toEqual([]);
  });

  it('clears a cell cliff family back to inherited default deterministically', () => {
    const base = createEmptyMapDocument({ id: 'clear-cliff-family', title: 'Clear cliff family', width: 4, height: 4 });
    const painted = applyMapEdit(base, {
      kind: 'paint',
      points: [{ tileX: 1, tileY: 1 }, { tileX: 2, tileY: 2 }],
      patch: { cliffFamily: 'stone_3' },
    }).document;
    const beforeRevision = painted.revision;
    const cleared = applyMapEdit(painted, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { cliffFamily: null },
    });

    expect(cleared.document.revision).toBe(beforeRevision + 1);
    expect(cleared.document.cells['1,1']?.cliffFamily).toBeUndefined();
    expect(resolvedMapCellAt(cleared.document, 1, 1).cliffFamily).toBe('stone_1');
    expect(cleared.document.cells['2,2']?.cliffFamily).toBe('stone_3');
    expect(serializeMapDocument(parseMapDocument(serializeMapDocument(cleared.document))))
      .toBe(serializeMapDocument(cleared.document));

    const unchanged = applyMapEdit(cleared.document, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { cliffFamily: null },
    });
    expect(unchanged.document).toBe(cleared.document);
    expect(unchanged.changed).toEqual([]);

    const changedDefault = applyMapEdit(cleared.document, {
      kind: 'set_default_cliff_family', family: 'desert_1',
    }).document;
    expect(resolvedMapCellAt(changedDefault, 1, 1).cliffFamily).toBe('desert_1');
    expect(resolvedMapCellAt(changedDefault, 2, 2).cliffFamily).toBe('stone_3');
  });

  it('changes the default surface family atomically while preserving cell-specific families', () => {
    const base = createEmptyMapDocument({ id: 'surface-families', title: 'Surface Families', width: 4, height: 4 });
    const withCellFamily = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { surfaceFamily: 'grass_4' },
    }).document;
    const beforeRevision = withCellFamily.revision;
    const changed = applyMapEdit(withCellFamily, {
      kind: 'set_default_surface_family', family: 'grass_2',
    });
    expect(changed).toMatchObject({ changed: [], fullRebuild: true });
    expect(changed.document.revision).toBe(beforeRevision + 1);
    expect(changed.document.defaultSurfaceFamily).toBe('grass_2');
    expect(changed.document.cells['1,1']?.surfaceFamily).toBe('grass_4');
    expect(resolvedMapCellAt(changed.document, 1, 1).surfaceFamily).toBe('grass_4');
    expect(resolvedMapCellAt(changed.document, 0, 0).surfaceFamily).toBe('grass_2');

    const unchanged = applyMapEdit(changed.document, {
      kind: 'set_default_surface_family', family: 'grass_2',
    });
    expect(unchanged.document).toBe(changed.document);
    expect(unchanged).toEqual({ document: changed.document, changed: [] });
  });

  it('supports every registered grass family as one undoable deterministic command', () => {
    const base = createEmptyMapDocument({ id: 'surface-history', title: 'Surface History', width: 3, height: 3 });
    for (const family of TERRAIN_SURFACE_FAMILY_IDS) {
      const result = applyMapEdit(base, { kind: 'set_default_surface_family', family });
      expect(result.document.defaultSurfaceFamily).toBe(family);
      expect(parseMapDocument(serializeMapDocument(result.document))).toEqual(result.document);
      expect(mapDocumentHash(parseMapDocument(serializeMapDocument(result.document))))
        .toBe(mapDocumentHash(result.document));
    }

    const history = commitMapEdit(createMapEditHistory(base), {
      kind: 'set_default_surface_family', family: 'grass_3',
    });
    expect(history.past).toEqual([base]);
    expect(undoMapEdit(history).present).toBe(base);
    expect(redoMapEdit(undoMapEdit(history)).present.defaultSurfaceFamily).toBe('grass_3');
  });

  it('fails closed for unregistered default and per-cell surface families', () => {
    const base = createEmptyMapDocument({ id: 'invalid-surface-family', title: 'Invalid', width: 3, height: 3 });
    const invalidCommand = applyMapEdit(base, {
      kind: 'set_default_surface_family', family: 'grass_5',
    } as never);
    expect(invalidCommand.document).toBe(base);

    expect(() => parseMapDocument(JSON.stringify({
      ...base,
      defaultSurfaceFamily: 'grass_5',
    }))).toThrow('Map surface family is invalid');

    const invalidCell = {
      ...base,
      cells: { '1,1': { surfaceFamily: 'grass_5' } },
    } as unknown as typeof base;
    expect(validateMapDocument(invalidCell)).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'surface_family_invalid', tileX: 1, tileY: 1,
    }));
  });

  it('compiles a newly published authored family as the default, per-cell family, and final override', () => {
    const source = structuredClone(bootstrapTilesetDefinitions()
      .find(({ familyId }) => familyId === 'stone_1')!);
    const custom = {
      ...source,
      id: 'tileset:orchard_moss' as const,
      familyId: 'orchard_moss',
      roleFrames: source.roleFrames.map((entry) => entry.group === 'edge' && entry.role === 'top_left'
        ? { ...entry, frame: 91 }
        : entry),
    };
    const resolver = runtimeTilesetResolver([custom]);
    const base = createEmptyMapDocument({ id: 'authored-family', title: 'Authored Family', width: 4, height: 4 });
    const defaulted = applyMapEdit(base, {
      kind: 'set_default_cliff_family', family: 'orchard_moss',
    }).document;
    const edited = applyMapEdit(defaulted, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }],
      patch: {
        elevation: 1,
        cliffFamily: 'orchard_moss',
        terrainOverride: { contourLevel: 1, family: 'orchard_moss', role: 'top_left', frameIndex: 91 },
      },
    }).document;
    const compiled = compileMapDocument(edited, resolver);
    expect(compiled.defaultCliffFamily).toBe('orchard_moss');
    expect(compiled.cliffFamilyIds).toContain('orchard_moss');
    expect(cellFamilyAt(compiled, 1, 1)).toBe('orchard_moss');
    expect(resolver.tileSetFor('orchard_moss')?.edgeFrames.top_left).toBe(91);
    expect(semanticTerrainTraceAt(edited, 1, 1, compiled).layers.at(-1)).toMatchObject({
      family: 'orchard_moss', frameIndex: 91,
    });
    expect(validateMapDocument(edited, undefined, resolver).filter(({ severity }) => severity === 'error')).toEqual([]);
  });

  it('rejects a contour-scoped terrain override which no longer has a target', () => {
    const base = createEmptyMapDocument({ id: 'stale', title: 'Stale', width: 3, height: 3 });
    const edited = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }],
      patch: { terrainOverride: { contourLevel: 7, frameIndex: 4 } },
    }).document;
    expect(validateMapDocument(edited)).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'terrain_override_topology_mismatch', tileX: 1, tileY: 1,
    }));
  });

  it('rejects override roles and frames which are incompatible with derived topology', () => {
    const base = createEmptyMapDocument({ id: 'unsafe-override', title: 'Unsafe', width: 4, height: 4 });
    const wrongRole = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }],
      patch: {
        elevation: 1,
        terrainOverride: { contourLevel: 1, role: 'top', frameIndex: 999_999 },
      },
    }).document;
    expect(validateMapDocument(wrongRole)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'terrain_override_topology_mismatch' }),
      expect.objectContaining({ severity: 'error', code: 'terrain_override_frame_incompatible' }),
    ]));

    const reservedFamily = applyMapEdit(base, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }],
      patch: {
        elevation: 1,
        terrainOverride: { contourLevel: 1, role: 'top_left', family: 'snow' },
      },
    }).document;
    expect(validateMapDocument(reservedFamily)).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'terrain_override_family_unavailable',
    }));
  });

  it('fails closed when imported cell JSON contains a malformed terrain override', () => {
    const base = createEmptyMapDocument({ id: 'malformed-override', title: 'Malformed', width: 4, height: 4 });
    const imported = parseMapDocument(JSON.stringify({
      ...base,
      cells: { '1,1': { terrainOverride: null } },
    }));
    expect(validateMapDocument(imported)).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'terrain_override_invalid', tileX: 1, tileY: 1,
    }));
  });

  it('rejects collision overrides without an authored reason', () => {
    const empty = createEmptyMapDocument({ id: 'invalid', title: 'Invalid', width: 3, height: 3 });
    const edited = applyMapEdit(empty, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { collision: 'force_walk' },
    }).document;
    expect(validateMapDocument(edited)).toContainEqual(expect.objectContaining({ code: 'collision_reason_missing' }));
  });
});

it('limits footprint assistance to the stroke and its immediate neighbors',()=>{
 const base=createEmptyMapDocument({id:'local-assist',title:'Local',width:100,height:100});
 const manual=applyMapEdit(base,{kind:'paint',points:[{tileX:80,tileY:80}],patch:{elevation:3}}).document;
 const assisted=applyMapEdit(manual,{kind:'paint',points:minimumTerrainBrushPoints({tileX:4,tileY:4},100,100),patch:{elevation:1},enforceMinimumTerrainFootprint:true});
 expect(assisted.document.cells['80,80']?.elevation).toBe(3);
 expect(compileMapDocument(assisted.document).elevations[8080]).toBe(3);
 expect(assisted.changed.every(p=>p.tileX>=3&&p.tileX<=6&&p.tileY>=3&&p.tileY<=6)).toBe(true);
 expect(assisted.document.cells['4,4']?.elevation).toBe(1);
});

it('joins diagonal height strokes locally at positive and excavated levels without stacked insets',()=>{
 for(const elevation of [1,-1]){
  const base=createEmptyMapDocument({id:'diagonal-local',title:'Diagonal',width:20,height:20});
  const initial=applyMapEdit(base,{kind:'paint',points:minimumTerrainBrushPoints({tileX:4,tileY:4},20,20),patch:{elevation,cliffFamily:'stone_2'}}).document;
  const before=applyMapEdit(initial,{kind:'paint',points:[{tileX:17,tileY:17}],patch:{elevation:3}}).document;
  const points=minimumTerrainBrushPoints({tileX:5,tileY:5},20,20);
  const exact=applyMapEdit(before,{kind:'paint',points,patch:{elevation,cliffFamily:'stone_2'}}).document;
  const raisedAt=(doc:typeof before)=>(x:number,y:number)=>resolvedMapCellAt(doc,x,y).elevation===elevation;
  expect(raisedTerrainInsetRolesAt({raisedAt:raisedAt(exact)},5,5).length).toBe(2);
  const result=applyMapEdit(before,{kind:'paint',points,patch:{elevation,cliffFamily:'stone_2'},enforceSingleTerrainInset:true});
  expect(result.document).not.toBe(before);
  for(let y=3;y<8;y++)for(let x=3;x<8;x++)expect(raisedTerrainInsetRolesAt({raisedAt:raisedAt(result.document)},x,y).length).toBeLessThanOrEqual(1);
  for(const p of points)expect(resolvedMapCellAt(result.document,p.tileX,p.tileY).elevation).toBe(elevation);
  expect(result.changed.every(p=>p.tileX>=4&&p.tileX<=7&&p.tileY>=4&&p.tileY<=7)).toBe(true);
  expect(result.document.cells['17,17']).toEqual(before.cells['17,17']);
  for(const p of result.changed)expect(resolvedMapCellAt(result.document,p.tileX,p.tileY).cliffFamily).toBe('stone_2');
 }
});
