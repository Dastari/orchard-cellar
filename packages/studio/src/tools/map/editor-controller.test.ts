import {
  bootstrapContentRegistry,
  type ObjectContentDefinition,
  createEmptyMapDocument,
  createMapPrefabDocument,
  mapDocumentV3Hash,
  migrateMapDocumentV2,
  normalizeMapPrefab,
  resolvedMapCellAt,
  serializeMapDocumentV3,
  terrainDocumentForMapV3,
} from '@orchard/sim';
import { terrainProjectedDepthForElevation, type TerrainArray } from '@orchard/engine/terrain';
import { describe, expect, it } from 'vitest';
import {
  StudioInspectorKernel,
  StudioNotifications,
  StudioSelectionBus,
  StudioValidationPanel,
} from '../../shell/index.js';
import {
  MapEditorController,
  mapEditorLiveMarkers,
  mapEditorPickingTerrain,
  mapEditorTerrainCommand,
  mapEditorTerrainToolForSample,
  nextMapEditorAnchor,
  pickTopmostVisibleMapEntity,
} from './editor-controller.js';
import { MapEditorModel } from './model.js';
import { mapEditorAuthoredObjectFootprint } from './selection-footprint.js';

function harness() {
  const selection = new StudioSelectionBus();
  const model = new MapEditorModel('live-island', {
    selection,
    inspector: new StudioInspectorKernel(),
    validation: new StudioValidationPanel(),
    notifications: new StudioNotifications(),
    live: () => null,
  }, null);
  const controller = new MapEditorController(model);
  controller.setViewport({ x: 80, y: 20, width: 960, height: 700 });
  return { controller, model, selection };
}

function terrainHarness(entries: readonly [number, number, number][], width = 8, height = 8) {
  const selection = new StudioSelectionBus();
  const base = migrateMapDocumentV2(createEmptyMapDocument({
    id: 'transition-test', title: 'Transition test', width, height,
  }));
  const document = {
    ...base,
    cells: Object.fromEntries(entries.map(([tileX, tileY, elevation]) => [
      `${tileX},${tileY}`,
      { elevation },
    ])),
  };
  const source = JSON.stringify({
    version: 2,
    baseRevision: 0,
    baseSemanticHash: null,
    dirty: true,
    document: serializeMapDocumentV3(document),
  });
  const model = new MapEditorModel('transition-test', {
    selection,
    inspector: new StudioInspectorKernel(),
    validation: new StudioValidationPanel(),
    notifications: new StudioNotifications(),
    live: () => null,
  }, { getItem: () => source, setItem: () => undefined });
  const controller = new MapEditorController(model);
  controller.setViewport({ x: 80, y: 20, width: 960, height: 700 });
  controller.selectLayer('terrain');
  controller.selectTerrainTool('transition');
  return { controller, model, selection };
}

function screenForTile(controller: MapEditorController, tileX: number, tileY: number) {
  const { camera, viewport } = controller.snapshot();
  return {
    x: viewport.x + (tileX * 16 + 8 - camera.x) * camera.zoom,
    y: viewport.y + (tileY * 16 + 8 - camera.y) * camera.zoom,
  };
}

function screenForProjectedTile(
  controller: MapEditorController,
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
  elevation: number,
) {
  const { camera, viewport } = controller.snapshot();
  return {
    x: viewport.x + (tileX * 16 + 8 - camera.x) * camera.zoom,
    y: viewport.y + (tileY * 16 + 8
      - terrainProjectedDepthForElevation(terrain, elevation) - camera.y) * camera.zoom,
  };
}

function screenForTransitionFoot(controller: MapEditorController, tileX: number, tileY: number) {
  const { camera, viewport } = controller.snapshot();
  return {
    x: viewport.x + (tileX * 16 + 8 - camera.x) * camera.zoom,
    // The shared raised-terrain picker exposes the lower contour endpoint on
    // the visible cliff face immediately above its logical cell.
    y: viewport.y + (tileY * 16 - 4 - camera.y) * camera.zoom,
  };
}

async function waitForFloodFill(controller: MapEditorController): Promise<void> {
  for (let attempt = 0; attempt < 100 && controller.floodFillPending(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(controller.floodFillPending()).toBe(false);
}

describe('MapEditorController', () => {
  it('reconciles selection and camera bounds across resize, undo, and redo', () => {
    const { controller, model, selection } = terrainHarness([], 4, 4);
    selection.select({ kind: 'tile', spaceId: 0, tileX: 3, tileY: 1 });
    const impact = model.planResize('east', false);

    expect(controller.resize(impact)).toBe(true);
    expect(model.document()).toMatchObject({ width: 3, height: 4 });
    expect(selection.current()).toEqual({ kind: 'none' });
    expect(controller.snapshot().camera).toEqual(expect.objectContaining({
      x: expect.any(Number), y: expect.any(Number), zoom: expect.any(Number),
    }));
    expect(controller.undo()).toBe(true);
    expect(model.document()).toMatchObject({ width: 4, height: 4 });
    expect(controller.redo()).toBe(true);
    expect(model.document()).toMatchObject({ width: 3, height: 4 });
  });

  it('keeps the viewport and tile selection attached to content translated by west/north resize', () => {
    const { controller, model, selection } = terrainHarness([], 100, 100);
    controller.setViewport({ x: 80, y: 20, width: 320, height: 240 });
    controller.wheel({ x: 240, y: 140 }, -1_000);
    selection.select({ kind: 'tile', spaceId: 0, tileX: 50, tileY: 50 });
    const before = controller.snapshot().camera;
    const impact = model.planResize('west', true);

    controller.resize(impact);
    expect(selection.current()).toMatchObject({ kind: 'tile', tileX: 51, tileY: 50 });
    expect(controller.snapshot().camera).toMatchObject({ x: before.x + 16, y: before.y });
    controller.undo();
    expect(selection.current()).toMatchObject({ kind: 'tile', tileX: 50, tileY: 50 });
    expect(controller.snapshot().camera).toMatchObject({ x: before.x, y: before.y });
    controller.redo();
    expect(selection.current()).toMatchObject({ kind: 'tile', tileX: 51, tileY: 50 });
    expect(controller.snapshot().camera).toMatchObject({ x: before.x + 16, y: before.y });

    const north = model.planResize('north', true);
    const beforeNorth = controller.snapshot().camera;
    controller.resize(north);
    expect(selection.current()).toMatchObject({ kind: 'tile', tileX: 51, tileY: 51 });
    expect(controller.snapshot().camera).toMatchObject({
      x: beforeNorth.x, y: beforeNorth.y + 16,
    });
  });

  it('authors a complete slope gesture as one undoable and redoable terrain edit', () => {
    const { controller, model } = terrainHarness([[2, 3, 1], [3, 3, 1]]);
    const terrain = mapEditorPickingTerrain(model.document());
    const lower = screenForTransitionFoot(controller, 2, 4);
    const upperOnLockedPlane = screenForProjectedTile(controller, terrain, 2, 3, 1);
    controller.selectTransitionKind('slope');

    expect(controller.pointerDown(lower, 0)).toBe(true);
    expect(controller.pointerMove(upperOnLockedPlane)).toBe(true);
    expect(controller.snapshot().transitionPreview).toMatchObject({
      kind: 'slope', width: 2, direction: 'up', error: null,
    });
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().transitions.slice(-2)).toEqual([
      expect.objectContaining({ kind: 'slope', lowerTileX: 2, upperTileX: 2 }),
      expect.objectContaining({ kind: 'slope', lowerTileX: 3, upperTileX: 3 }),
    ]);
    expect(controller.snapshot().transitionPreview).toBeNull();

    model.undo();
    expect(model.document().transitions).toEqual([]);
    model.redo();
    expect(model.document().transitions).toHaveLength(2);
  });

  it('previews reverse-dragged stairs but cannot commit without dedicated stair art', () => {
    const { controller, model } = terrainHarness([
      [1, 3, 1], [2, 3, 1], [3, 3, 1],
      [1, 2, 2], [2, 2, 2], [3, 2, 2],
    ]);
    const terrain = mapEditorPickingTerrain(model.document());
    controller.selectTransitionKind('stairs');
    controller.adjustTransitionWidth(1);
    const upper = screenForProjectedTile(controller, terrain, 1, 2, 2);
    const lowerOnLockedPlane = screenForProjectedTile(controller, terrain, 1, 4, 2);

    controller.pointerDown(upper, 0);
    controller.pointerMove(lowerOnLockedPlane);
    expect(controller.snapshot().transitionPreview).toMatchObject({
      kind: 'stairs', width: 3, direction: 'up', error: 'transition_stair_art_unavailable',
      command: null,
    });
    controller.pointerUp();
    expect(model.document().stairRuns).toEqual([]);
    expect(model.canUndo()).toBe(false);
    expect(controller.snapshot().transitionFeedback).toBe('DEDICATED STAIR ART IS NOT REGISTERED');
  });

  it('refuses ladders without runtime authority and reports invalid endpoint heights without history', () => {
    const valid = terrainHarness([[4, 3, 1]]);
    const validTerrain = mapEditorPickingTerrain(valid.model.document());
    valid.controller.selectTransitionKind('ladder');
    valid.controller.adjustTransitionWidth(2);
    valid.controller.pointerDown(screenForTransitionFoot(valid.controller, 4, 4), 0);
    valid.controller.pointerMove(screenForProjectedTile(valid.controller, validTerrain, 4, 3, 1));
    expect(valid.controller.snapshot().transitionPreview).toMatchObject({
      kind: 'ladder', error: 'transition_ladder_runtime_unavailable', command: null,
    });
    valid.controller.pointerUp();
    expect(valid.model.document().transitions).toEqual([]);
    expect(valid.model.canUndo()).toBe(false);
    expect(valid.controller.snapshot().transitionFeedback)
      .toBe('LADDER TRAVERSAL AND DIRECTIONAL ART ARE NOT AVAILABLE');

    const invalid = terrainHarness([[2, 3, 1]]);
    const invalidTerrain = mapEditorPickingTerrain(invalid.model.document());
    invalid.controller.selectTransitionKind('slope');
    invalid.controller.pointerDown(screenForTransitionFoot(invalid.controller, 2, 4), 0);
    invalid.controller.pointerMove(screenForProjectedTile(invalid.controller, invalidTerrain, 2, 3, 1));
    expect(invalid.controller.snapshot().transitionPreview?.error)
      .toBe('transition_endpoint_height_mismatch');
    invalid.controller.pointerUp();
    expect(invalid.model.document().transitions).toEqual([]);
    expect(invalid.model.canUndo()).toBe(false);
    expect(invalid.controller.snapshot().transitionFeedback)
      .toBe('EVERY LANE MUST JOIN MATCHING CONTOUR ENDPOINTS');
  });

  it('gates transition gestures to the visible editable terrain layer', () => {
    const { controller, model } = terrainHarness([[2, 3, 1], [3, 3, 1]]);
    const terrain = mapEditorPickingTerrain(model.document());
    const lower = screenForTransitionFoot(controller, 2, 4);
    const upper = screenForProjectedTile(controller, terrain, 2, 3, 1);

    controller.selectLayer('generated_base');
    expect(controller.pointerDown(lower, 0)).toBe(true);
    controller.pointerMove(upper);
    expect(controller.pointerUp()).toBe(false);
    expect(model.document().transitions).toEqual([]);

    controller.selectLayer('terrain');
    controller.selectTerrainTool('transition');
    model.toggleLayer('terrain');
    expect(controller.pointerDown(lower, 0)).toBe(true);
    expect(controller.snapshot().transitionFeedback).toBe('SELECT THE VISIBLE EDITABLE TERRAIN LAYER');
    expect(controller.pointerUp()).toBe(false);
    expect(model.document().transitions).toEqual([]);
  });

  it('frames the complete authored island and zooms around the pointer', () => {
    const { controller } = harness();
    const point = { x: 520, y: 360 };
    controller.wheel(point, -600);
    const before = controller.screenToWorld(point);
    expect(controller.wheel(point, -120)).toBe(true);
    const after = controller.screenToWorld(point);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(controller.snapshot().camera.zoom).toBeGreaterThan(0);
  });

  it('pans with middle drag and clamps the finite map to its viewport', () => {
    const { controller } = harness();
    controller.wheel({ x: 500, y: 350 }, -1_000);
    const before = controller.snapshot().camera;
    expect(controller.pointerDown({ x: 500, y: 350 }, 1)).toBe(true);
    expect(controller.pointerMove({ x: 460, y: 320 })).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(controller.snapshot().camera).not.toEqual(before);
  });

  it('pans with Space plus primary drag without creating an edit', () => {
    const { controller, model } = harness();
    const prefab = createMapPrefabDocument({ id: 'armed-pan-prefab', title: 'Armed pan prefab' });
    controller.setCatalog([prefab]);
    controller.selectLayer('objects');
    controller.selectPrefab(prefab.id);
    controller.wheel({ x: 500, y: 350 }, -1_000);
    const before = controller.snapshot().camera;
    const objectCount = model.document().objects.length;
    expect(controller.pointerDown({ x: 500, y: 350 }, 0, true)).toBe(true);
    expect(controller.pointerMove({ x: 460, y: 320 })).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(controller.snapshot().camera).not.toEqual(before);
    expect(controller.snapshot().selectedPrefabId).toBe(prefab.id);
    expect(model.document().objects).toHaveLength(objectCount);
    expect(model.canUndo()).toBe(false);
  });

  it('resolves a canvas-owned live-spawn target without selection or history side effects', () => {
    const { controller, model, selection } = harness();
    const before = mapDocumentV3Hash(model.document());
    expect(controller.tileAtPoint(screenForTile(controller, 400, 400))).toMatchObject({
      tileX: 400,
      tileY: 400,
    });
    expect(selection.current()).toEqual({ kind: 'none' });
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(model.canUndo()).toBe(false);
  });

  it('keeps active selection and visibility stable while editing authored layer metadata', () => {
    const { controller, model } = harness();
    controller.selectLayer('objects');
    controller.toggleLayerVisibility('objects');

    expect(controller.renameLayer('objects', 'Interactive Props')).toBe(true);
    expect(controller.reorderLayer('objects', 'toward_back')).toBe(true);
    expect(controller.snapshot().activeLayer).toBe('objects');
    expect(model.isLayerVisible('objects')).toBe(false);
    expect(model.document().layers.find(({ id }) => id === 'objects')).toMatchObject({
      label: 'Interactive Props',
      order: 20,
    });

    expect(controller.renameLayer('player_owned', 'Mutable Live Objects')).toBe(false);
    expect(controller.reorderLayer('gameplay', 'toward_front')).toBe(false);
    expect(controller.snapshot().activeLayer).toBe('objects');
  });

  it('gates authored placement, transform, terrain, and anchor edits behind eye, lock, and solo state', () => {
    const { controller, model } = harness();
    const prefab = createMapPrefabDocument({ id: 'layer-gate-prefab', title: 'Layer gate prefab' });
    controller.setCatalog([prefab]);
    controller.selectLayer('objects');
    controller.selectPrefab(prefab.id);
    const terrain = mapEditorPickingTerrain(model.document());
    controller.adoptPickingTerrain(model.terrainGeometryIdentity(), terrain);
    const elevation = resolvedMapCellAt(terrainDocumentForMapV3(model.document()), 400, 400).elevation;
    const point = screenForProjectedTile(controller, terrain, 400, 400, elevation);
    const before = mapDocumentV3Hash(model.document());

    expect(controller.toggleLayerLock('objects')).toBe(true);
    controller.pointerDown(point, 0);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(controller.toggleLayerLock('objects')).toBe(true);
    expect(controller.toggleLayerSolo('terrain')).toBe(true);
    controller.pointerDown(point, 0);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(controller.toggleLayerSolo('terrain')).toBe(true);
    expect(controller.pointerDown(point, 0)).toBe(true);
    const placed = model.document().objects.find(({ prefabId }) => prefab.id === prefabId)!;
    expect(placed).toBeDefined();
    model.selectObject(placed.id);
    expect(controller.toggleLayerLock('objects')).toBe(true);
    expect(controller.rotateSelected()).toBe(false);
    expect(controller.deleteSelected()).toBe(false);
    expect(model.document().objects.some(({ id }) => id === placed.id)).toBe(true);
    expect(controller.toggleLayerLock('objects')).toBe(true);

    model.selectWorkspace('terrain');
    controller.selectLayer('terrain');
    controller.selectTerrainTool('grass');
    const beforeTerrain = mapDocumentV3Hash(model.document());
    expect(controller.toggleLayerLock('terrain')).toBe(true);
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(controller.pointerUp()).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(beforeTerrain);
    expect(controller.toggleLayerLock('terrain')).toBe(true);

    model.selectWorkspace('objects');
    controller.selectLayer('anchors');
    expect(controller.selectAnchorKind('poi')).toBe(true);
    const anchorCount = model.document().anchors.length;
    expect(controller.toggleLayerLock('anchors')).toBe(true);
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(model.document().anchors).toHaveLength(anchorCount);
  });

  it('selects and drags authored landmarks as one undoable document edit', () => {
    const { controller, model, selection } = harness();
    const landmark = model.document().landmarks[0]!;
    controller.selectLayer(landmark.layer);
    const initial = screenForTile(controller, landmark.tileX, landmark.tileY);
    controller.wheel(initial, -1_400);
    const from = screenForTile(controller, landmark.tileX, landmark.tileY);
    const to = screenForTile(controller, landmark.tileX + 1, landmark.tileY + 1);
    expect(controller.pointerDown(from, 0)).toBe(true);
    expect(selection.current()).toMatchObject({ kind: 'entity', id: landmark.id });
    controller.pointerMove(to);
    controller.pointerUp();
    expect(model.document().landmarks.find(({ id }) => id === landmark.id)).toMatchObject({
      tileX: landmark.tileX + 1,
      tileY: landmark.tileY + 1,
    });
    expect(model.canUndo()).toBe(true);
  });

  it('lets visible content beneath a disabled object receive the pick without a click edit', () => {
    const { controller, model, selection } = harness();
    const created = createMapPrefabDocument({
      id: 'visual-footprint', title: 'Visual Footprint', width: 2, height: 1,
    });
    const prefab = normalizeMapPrefab({
      ...created,
      pivot: { tileX: 0, tileY: 0 },
      cells: [
        { id: 'left', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0 },
        { id: 'right', tileX: 1, tileY: 0, elevation: 0, collisionMask: 0 },
      ],
    });
    model.embedPrefab(prefab);
    model.placeObject({
      id: 'visual-object', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'objects', quarterTurns: 0,
      flipX: false, enabled: false,
    });
    model.placeObject({
      id: 'visible-object', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'ground', quarterTurns: 0,
      flipX: false, enabled: true,
    });
    controller.selectLayer('objects');
    const initial = screenForTile(controller, 401, 400);
    controller.wheel(initial, -1_400);
    const revision = model.document().revision;

    expect(controller.pointerDown(screenForTile(controller, 401, 400), 0)).toBe(true);
    expect(selection.current()).toMatchObject({ kind: 'entity', id: 'visible-object' });
    expect(controller.snapshot().dragDestination).toMatchObject({
      kind: 'object', id: 'visible-object', tileX: 400, tileY: 400, elevation: 0,
    });
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(revision);
  });

  it('clamps a dragged transformed footprint and commits exactly one undoable move', () => {
    const { controller, model } = harness();
    const created = createMapPrefabDocument({
      id: 'edge-footprint', title: 'Edge Footprint', width: 2, height: 1,
    });
    const prefab = normalizeMapPrefab({
      ...created,
      pivot: { tileX: 0, tileY: 0 },
      cells: [
        { id: 'left', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff },
        { id: 'right', tileX: 1, tileY: 0, elevation: 0, collisionMask: 0xffff },
      ],
    });
    model.embedPrefab(prefab);
    model.placeObject({
      id: 'edge-object', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'objects', quarterTurns: 2,
      flipX: false, enabled: true,
    });
    controller.selectLayer('objects');
    const initial = screenForTile(controller, 400, 400);
    controller.wheel(initial, -1_400);
    const revision = model.document().revision;

    expect(controller.pointerDown(screenForTile(controller, 400, 400), 0)).toBe(true);
    expect(controller.pointerMove(screenForTile(controller, 0, 400))).toBe(true);
    expect(controller.snapshot().dragDestination).toMatchObject({ tileX: 1, tileY: 400 });
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(revision + 1);
    expect(model.document().objects.find(({ id }) => id === 'edge-object')?.tileX).toBe(1);
    model.undo();
    expect(model.document().objects.find(({ id }) => id === 'edge-object')?.tileX).toBe(400);
  });

  it('auto-picks the latest entity on the topmost visible layer through its transformed footprint', () => {
    const { controller, model, selection } = harness();
    const created = createMapPrefabDocument({
      id: 'auto-pick-footprint', title: 'Auto Pick Footprint', width: 2, height: 1,
    });
    const prefab = normalizeMapPrefab({
      ...created,
      pivot: { tileX: 0, tileY: 0 },
      cells: [
        { id: 'left', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0 },
        { id: 'right', tileX: 1, tileY: 0, elevation: 0, collisionMask: 0 },
      ],
    });
    model.embedPrefab(prefab);
    const instance = (id: string, layer: 'objects' | 'canopy') => ({
      id, prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer, quarterTurns: 1 as const,
      flipX: true, enabled: true,
    });
    model.placeObject(instance('lower-object', 'objects'));
    model.placeObject(instance('earlier-canopy', 'canopy'));
    model.placeObject(instance('latest-canopy', 'canopy'));
    const transformedCell = mapEditorAuthoredObjectFootprint(
      model.document(), model.document().objects.find(({ id }) => id === 'latest-canopy')!,
    ).find(({ tileX, tileY }) => tileX !== 400 || tileY !== 400)!;
    const terrain = mapEditorPickingTerrain(model.document());
    const elevation = terrain.elevations[transformedCell.tileY * terrain.width + transformedCell.tileX]!;
    let point = screenForProjectedTile(
      controller, terrain, transformedCell.tileX, transformedCell.tileY, elevation,
    );
    controller.wheel(point, -1_400);
    point = screenForProjectedTile(
      controller, terrain, transformedCell.tileX, transformedCell.tileY, elevation,
    );
    const revision = model.document().revision;

    expect(model.workspace()).toBe('terrain');
    expect(controller.snapshot().activeLayer).toBe('terrain');
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(selection.current()).toMatchObject({ kind: 'entity', id: 'latest-canopy' });
    expect(controller.snapshot().activeLayer).toBe('canopy');
    expect(model.workspace()).toBe('objects');
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(revision);

    model.toggleLayer('canopy');
    model.clearSelection();
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(selection.current()).toMatchObject({ kind: 'entity', id: 'lower-object' });
    expect(controller.snapshot().activeLayer).toBe('objects');
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(revision);
  });

  it('uses authored layer reordering for topmost visible selection', () => {
    const { controller, model } = harness();
    const prefab = createMapPrefabDocument({ id: 'layer-order-pick', title: 'Layer order pick' });
    model.embedPrefab(prefab);
    const instance = (id: string, layer: 'ground' | 'objects') => ({
      id, prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer, quarterTurns: 0 as const,
      flipX: false, enabled: true,
    });
    model.placeObject(instance('ground-object', 'ground'));
    model.placeObject(instance('world-object', 'objects'));
    const pick = () => pickTopmostVisibleMapEntity(
      model.document(), [], (layer) => model.isLayerVisible(layer), 400, 400,
    );

    expect(pick()).toMatchObject({ id: 'world-object', layer: 'objects' });
    expect(controller.reorderLayer('objects', 'toward_back')).toBe(true);
    expect(pick()).toMatchObject({ id: 'ground-object', layer: 'ground' });
  });

  it('picks read-only anchors with collision-safe identity and respects Anchors visibility', () => {
    const { model } = harness();
    const document = {
      ...model.document(),
      anchors: [{ id: '42', kind: 'npc' as const, tileX: 400, tileY: 400, elevation: 0 }],
    };
    const live = [{
      id: '42', entityKind: 'npc' as const, kind: 'merchant', label: 'Runtime NPC',
      spaceId: 0, tileX: 400, tileY: 400, worldX: 6_408, worldY: 6_416,
      elevation: 0, footprint: { width: 1, height: 1 }, layer: 'gameplay' as const,
      color: '#fff',
    }];
    expect(pickTopmostVisibleMapEntity(document, live, () => true, 400, 400))
      .toEqual(expect.objectContaining({ kind: 'anchor', id: '42', layer: 'anchors' }));
    expect(pickTopmostVisibleMapEntity(
      document, live, (layer) => layer !== 'anchors', 400, 400,
    )).toEqual(expect.objectContaining({ kind: 'live', id: '42', entityKind: 'npc' }));
  });

  it('authors annotation anchors at projected terrain elevation and supports drag, nudge, delete', () => {
    const { controller, model, selection } = terrainHarness([[2, 2, 1], [3, 2, 1], [4, 2, 1]]);
    model.selectWorkspace('objects');
    controller.selectLayer('anchors');
    const terrain = mapEditorPickingTerrain(model.document());
    const source = screenForProjectedTile(controller, terrain, 2, 2, 1);
    const destination = screenForProjectedTile(controller, terrain, 3, 2, 1);
    const revision = model.document().revision;

    expect(controller.selectAnchorKind('poi')).toBe(true);
    expect(controller.pointerDown(source, 0)).toBe(true);
    const placed = model.document().anchors[0]!;
    expect(placed).toMatchObject({
      id: `poi-${revision + 1}`, kind: 'poi', tileX: 2, tileY: 2, elevation: 1,
      label: `Point of Interest ${revision + 1}`,
    });
    expect(selection.current()).toEqual({
      kind: 'entity', entityKind: 'map-anchor', id: placed.id, spaceId: 0,
    });
    expect(model.document().revision).toBe(revision + 1);
    model.undo();
    expect(model.document().anchors).toEqual([]);
    model.redo();
    expect(model.document().anchors).toHaveLength(1);

    expect(controller.keyDown('Escape')).toBe(true);
    expect(controller.snapshot().selectedAnchorKind).toBeNull();
    model.selectAnchor(placed.id);
    const beforeLabel = model.document().anchors[0]!;
    const beforeLabelRevision = model.document().revision;
    expect(controller.updateSelectedAnchorLabel(' Orchard Gate ')).toBe(true);
    expect(model.document()).toMatchObject({
      revision: beforeLabelRevision + 1,
      anchors: [{
        id: beforeLabel.id, kind: beforeLabel.kind, label: 'Orchard Gate',
        tileX: beforeLabel.tileX, tileY: beforeLabel.tileY, elevation: beforeLabel.elevation,
      }],
    });
    model.undo();
    expect(model.document().anchors[0]?.label).toBe(beforeLabel.label);
    model.redo();
    expect(model.document().anchors[0]?.label).toBe('Orchard Gate');
    expect(() => controller.updateSelectedAnchorLabel('   '))
      .toThrow('Map gameplay anchor label is invalid');
    expect(model.document().anchors[0]?.label).toBe('Orchard Gate');
    const beforeUnsupportedTransforms = mapDocumentV3Hash(model.document());
    expect(controller.rotateSelected()).toBe(false);
    expect(controller.flipSelected()).toBe(false);
    expect(controller.cycleSelectedScale()).toBe(false);
    expect(controller.toggleSelectedVisibility()).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(beforeUnsupportedTransforms);
    expect(controller.pointerDown(source, 0)).toBe(true);
    expect(controller.pointerMove(destination)).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().anchors[0]).toMatchObject({ tileX: 3, tileY: 2, elevation: 1 });

    expect(controller.keyDown('ArrowRight')).toBe(true);
    expect(model.document().anchors[0]).toMatchObject({ tileX: 4, tileY: 2, elevation: 1 });
    expect(controller.keyDown('Delete')).toBe(true);
    expect(model.document().anchors).toEqual([]);
    model.undo();
    expect(model.document().anchors[0]).toMatchObject({ tileX: 4, tileY: 2 });
  });

  it('arms only editable visible Anchors and derives deterministic globally unique ids', () => {
    const { controller, model } = terrainHarness([]);
    model.selectWorkspace('objects');
    expect(controller.selectAnchorKind('label')).toBe(false);
    controller.selectLayer('anchors');
    expect(controller.selectAnchorKind('label')).toBe(true);
    const restored = controller.snapshot();
    controller.selectAnchorKind(null);
    expect(controller.restoreSession({ ...restored, selectedAnchorKind: 'label' })).toBe(true);
    expect(controller.snapshot().selectedAnchorKind).toBe('label');
    controller.selectAnchorKind(null);
    model.toggleLayer('anchors');
    expect(controller.selectAnchorKind('poi')).toBe(false);

    const document = {
      ...model.document(),
      objects: [{
        id: 'poi-1', prefabId: 'fixture', prefabRevision: 0, tileX: 0, tileY: 0,
        elevation: 0, layer: 'objects' as const, quarterTurns: 0 as const,
        flipX: false, enabled: true,
      }],
      anchors: [{
        id: 'poi-2', kind: 'poi' as const, label: 'Existing', tileX: 0, tileY: 0, elevation: 0,
      }],
      revision: 0,
    };
    expect(nextMapEditorAnchor(document, 'poi', 1, 2, 0)).toMatchObject({
      id: 'poi-3', label: 'Point of Interest 3', tileX: 1, tileY: 2, elevation: 0,
    });
  });

  it('keeps foot-Y ahead of reordered layer ties when overlapping authored footprints', () => {
    const { model } = harness();
    const base = createMapPrefabDocument({
      id: 'layer-depth-pick', title: 'Layer depth pick', width: 1, height: 2,
    });
    const prefab = {
      ...base,
      cells: [
        { id: 'north', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff },
        { id: 'south', tileX: 0, tileY: 1, elevation: 0, collisionMask: 0xffff },
      ],
    };
    model.embedPrefab(prefab);
    const instance = (id: string, layer: 'ground' | 'objects', tileY: number) => ({
      id, prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY, elevation: 0, layer, quarterTurns: 0 as const,
      flipX: false, enabled: true,
    });
    model.placeObject(instance('south-lower-layer', 'objects', 400));
    model.placeObject(instance('north-upper-layer', 'ground', 399));
    expect(model.reorderLayer('objects', 'toward_back')).toBe(true);

    expect(pickTopmostVisibleMapEntity(
      model.document(), [], (layer) => model.isLayerVisible(layer), 400, 399,
    )).toMatchObject({ id: 'south-lower-layer', layer: 'objects' });
  });

  it('hides and deletes selected authored content', () => {
    const { controller, model } = harness();
    const landmark = model.document().landmarks[0]!;
    controller.selectLayer(landmark.layer);
    const initial = screenForTile(controller, landmark.tileX, landmark.tileY);
    controller.wheel(initial, -1_400);
    controller.pointerDown(screenForTile(controller, landmark.tileX, landmark.tileY), 0);
    controller.pointerUp();
    expect(controller.toggleSelectedVisibility()).toBe(true);
    expect(model.document().landmarks.find(({ id }) => id === landmark.id)?.enabled).toBe(false);
    expect(controller.toggleSelectedVisibility()).toBe(true);
    expect(model.document().landmarks.find(({ id }) => id === landmark.id)?.enabled).toBe(true);
    expect(controller.deleteSelected()).toBe(true);
    expect(model.document().landmarks.some(({ id }) => id === landmark.id)).toBe(false);
  });

  it('rotates, flips, scales, and clones selected authored content as discrete edits', () => {
    const { controller, model, selection } = harness();
    const landmark = model.document().landmarks[0]!;
    model.selectObject(landmark.id);
    expect(controller.rotateSelected()).toBe(true);
    expect(controller.flipSelected()).toBe(true);
    expect(controller.cycleSelectedScale()).toBe(true);
    expect(model.document().landmarks.find(({ id }) => id === landmark.id)).toMatchObject({
      quarterTurns: (landmark.quarterTurns + 1) % 4,
      flipX: !landmark.flipX,
      scale: 2,
    });
    const count = model.document().landmarks.length;
    expect(controller.cloneSelected()).toBe(true);
    expect(model.document().landmarks).toHaveLength(count + 1);
    expect(selection.current()).toMatchObject({ kind: 'entity', id: expect.stringMatching(/^clone-/u) });
    model.undo();
    expect(model.document().landmarks).toHaveLength(count);

    const prefab = createMapPrefabDocument({ id: 'transformable', title: 'Transformable' });
    model.embedPrefab(prefab);
    model.placeObject({
      id: 'transform-object', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'objects', quarterTurns: 0,
      flipX: false, enabled: true,
    });
    model.selectObject('transform-object');
    expect(controller.rotateSelected()).toBe(true);
    expect(controller.flipSelected()).toBe(true);
    expect(controller.cycleSelectedScale()).toBe(true);
    expect(model.document().objects.find(({ id }) => id === 'transform-object')).toMatchObject({
      quarterTurns: 1, flipX: true, scale: 2,
    });
    const objectCount = model.document().objects.length;
    expect(controller.cloneSelected()).toBe(true);
    expect(model.document().objects).toHaveLength(objectCount + 1);
  });

  it('nudges selected authored content with arrow keys but never moves live rows', () => {
    const { controller, model, selection } = harness();
    const landmark = model.document().landmarks[0]!;
    model.selectObject(landmark.id);
    expect(controller.keyDown('ArrowRight')).toBe(true);
    expect(controller.keyDown('ArrowUp')).toBe(true);
    expect(model.document().landmarks.find(({ id }) => id === landmark.id)).toMatchObject({
      tileX: landmark.tileX + 1,
      tileY: landmark.tileY - 1,
    });

    selection.select({ kind: 'entity', entityKind: 'resource', id: 'live-7', spaceId: 0 });
    const before = mapDocumentV3Hash(model.document());
    expect(controller.keyDown('ArrowLeft')).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('scatters a painted prefab stroke through one atomic model history entry', () => {
    const { controller, model } = harness();
    const prefab = createMapPrefabDocument({ id: 'scatter-tree', title: 'Scatter Tree', tags: ['tree'] });
    controller.setCatalog([prefab]);
    model.selectWorkspace('scatter');
    controller.selectLayer('objects');
    controller.selectPrefab(prefab.id);
    controller.adjustScatterDensity(6_500);
    expect(controller.snapshot().scatterDensity).toBe(10_000);
    const initial = screenForTile(controller, 400, 400);
    controller.wheel(initial, -1_400);
    const before = mapDocumentV3Hash(model.document());
    expect(controller.pointerDown(screenForTile(controller, 400, 400), 0)).toBe(true);
    expect(controller.pointerMove(screenForTile(controller, 406, 400))).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().objects.length).toBeGreaterThanOrEqual(3);
    expect(model.document().objects.every(({ prefabId }) => prefabId === prefab.id)).toBe(true);
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('consumes an in-map context click even when it only selects a tile', () => {
    const { controller, model } = harness();
    const center = controller.screenToWorld({ x: 500, y: 350 });
    const tileX = Math.floor(center.x / 16);
    const tileY = Math.floor(center.y / 16);
    expect(controller.pointerDown(screenForTile(controller, tileX, tileY), 2)).toBe(true);
    expect(model.selection()).toMatchObject({ kind: 'tile', tileX, tileY });
  });

  it('filters embedded prefabs and places the selected prefab on the active object layer', () => {
    const { controller, model } = harness();
    const prefab = createMapPrefabDocument({ id: 'apple-tree', title: 'Apple Tree', tags: ['orchard', 'tree'] });
    model.embedPrefab(prefab);
    model.placeObject({
      id: 'existing-tree', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'objects', quarterTurns: 0,
      flipX: false, enabled: true,
    });
    controller.selectLayer('objects');
    expect(controller.palette('apple orchard').map(({ id }) => id)).toEqual(['apple-tree']);
    controller.selectPrefab(prefab.id);
    const initial = screenForTile(controller, 400, 400);
    controller.wheel(initial, -1_400);
    expect(controller.pointerDown(screenForTile(controller, 400, 400), 0)).toBe(true);
    expect(model.document().objects.at(-1)).toMatchObject({ prefabId: prefab.id, tileX: 400, tileY: 400, layer: 'objects' });
    expect(model.selection()).not.toMatchObject({ id: 'existing-tree' });
  });

  it('supports standard undo/redo shortcuts and Escape returns to selection mode', () => {
    const { controller, model } = harness();
    const prefab = createMapPrefabDocument({ id: 'apple-tree', title: 'Apple Tree', tags: ['tree'] });
    model.embedPrefab(prefab);
    expect(model.document().prefabs.some(({ id }) => id === prefab.id)).toBe(true);
    expect(controller.keyDown('z', true)).toBe(true);
    expect(model.document().prefabs.some(({ id }) => id === prefab.id)).toBe(false);
    expect(controller.keyDown('y', true)).toBe(true);
    expect(model.document().prefabs.some(({ id }) => id === prefab.id)).toBe(true);

    controller.selectBiome('plains');
    expect(controller.snapshot().selectedBiome).toBe('plains');
    expect(controller.keyDown('Escape')).toBe(true);
    expect(controller.snapshot().selectedBiome).toBeNull();
  });

  it('toggles independent height/collision overlays without map edits and leaves global G alone', () => {
    const { controller, model } = harness();
    const before = mapDocumentV3Hash(model.document());
    expect(controller.snapshot()).toMatchObject({
      heightOverlayVisible: false,
      collisionOverlayVisible: false,
    });

    expect(controller.keyDown('h')).toBe(true);
    expect(controller.keyDown('C')).toBe(true);
    expect(controller.snapshot()).toMatchObject({
      heightOverlayVisible: true,
      collisionOverlayVisible: true,
    });
    expect(controller.keyDown('g')).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('samples exact terrain and biome semantics without editing the document', () => {
    const { controller, model } = harness();
    model.editTerrain({ kind: 'paint', points: [{ tileX: 400, tileY: 400 }], patch: {
      surface: 'dirt', feature: 'none', cliffFamily: 'stone_1',
    } });
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const point = screenForTile(controller, 400, 400);
    controller.wheel(point, -1_400);
    const samplePoint = screenForTile(controller, 400, 400);
    const before = mapDocumentV3Hash(model.document());

    controller.selectLayer('generated_base');
    expect(controller.keyDown('i')).toBe(true);
    expect(controller.snapshot().eyedropperActive).toBe(true);
    expect(controller.pointerDown(samplePoint, 0)).toBe(true);
    expect(controller.snapshot()).toMatchObject({
      eyedropperActive: false, activeLayer: 'terrain', terrainTool: 'inspect',
      sampledTerrainPatch: expect.objectContaining({
        surface: 'dirt', feature: 'none', cliffFamily: null,
      }),
    });
    expect(mapDocumentV3Hash(model.document())).toBe(before);

    model.selectWorkspace('biomes');
    controller.selectLayer('terrain');
    controller.toggleEyedropper();
    expect(controller.pointerDown(samplePoint, 0)).toBe(true);
    expect(controller.snapshot()).toMatchObject({ eyedropperActive: false, selectedBiome: 'forest' });
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('paints surface, cliff, and dry visual farmland palettes as single undoable strokes', () => {
    const { controller, model } = terrainHarness([], 8, 8);
    const first = screenForTile(controller, 2, 2);
    const second = screenForTile(controller, 4, 2);

    controller.selectSurfaceFamily('grass_3');
    let before = model.document();
    expect(controller.pointerDown(first, 0)).toBe(true);
    expect(controller.pointerMove(second)).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(before.revision + 1);
    for (const tileX of [2, 3, 4]) {
      expect(resolvedMapCellAt(terrainDocumentForMapV3(model.document()), tileX, 2))
        .toMatchObject({ surface: 'grass', feature: 'none', surfaceFamily: 'grass_3' });
    }
    model.undo();
    expect(model.document()).toBe(before);

    controller.selectCliffFamily('desert_1');
    before = model.document();
    expect(controller.pointerDown(first, 0)).toBe(true);
    expect(controller.pointerMove(second)).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(before.revision + 1);
    for (const tileX of [2, 3, 4]) {
      expect(model.document().cells[`${tileX},2`]?.cliffFamily).toBe('desert_1');
    }
    model.undo();
    expect(model.document()).toBe(before);

    controller.selectTerrainPaletteMode('farmland_visual');
    expect(controller.snapshot().terrainAuthoringFeedback)
      .toBe('DRY VISUAL ONLY · WET SOIL AND CROPS REMAIN RUNTIME AUTHORITY');
    before = model.document();
    expect(controller.pointerDown(first, 0)).toBe(true);
    expect(controller.pointerMove(second)).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(before.revision + 1);
    for (const tileX of [2, 3, 4]) {
      expect(resolvedMapCellAt(terrainDocumentForMapV3(model.document()), tileX, 2))
        .toMatchObject({ surface: 'dirt', feature: 'farmland' });
    }
    model.undo();
    expect(model.document()).toBe(before);
  });

  it('samples a full composed terrain patch while retaining family inheritance for one later stroke', () => {
    const { controller, model } = terrainHarness([], 8, 8);
    model.paintTerrainPatch([{ tileX: 2, tileY: 2 }], {
      surface: 'dirt', feature: 'farmland', collision: 'force_block',
      collisionReason: 'sampled authority', ledge: true,
    });
    const source = screenForTile(controller, 2, 2);
    controller.toggleEyedropper();
    const beforeSample = model.document();
    expect(controller.pointerDown(source, 0)).toBe(true);
    expect(model.document()).toBe(beforeSample);
    expect(controller.snapshot()).toMatchObject({
      eyedropperActive: false,
      sampledTerrainPatch: {
        surface: 'dirt', feature: 'farmland', collision: 'force_block',
        collisionReason: 'sampled authority', cliffFamily: null,
        surfaceFamily: null, terrainOverride: null, ledge: true,
      },
      terrainAuthoringFeedback: 'EXACT COMPOSED CELL ARMED FOR ONE STROKE',
    });

    const destination = screenForTile(controller, 4, 4);
    const destinationEnd = screenForTile(controller, 5, 4);
    const revision = model.document().revision;
    expect(controller.pointerDown(destination, 0)).toBe(true);
    expect(controller.pointerMove(destinationEnd)).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(revision + 1);
    for (const tileX of [4, 5]) {
      expect(resolvedMapCellAt(terrainDocumentForMapV3(model.document()), tileX, 4))
        .toMatchObject({
          surface: 'dirt', feature: 'farmland', collision: 'force_block',
          collisionReason: 'sampled authority', ledge: true,
        });
      expect(model.document().cells[`${tileX},4`]).not.toHaveProperty('cliffFamily');
      expect(model.document().cells[`${tileX},4`]).not.toHaveProperty('surfaceFamily');
      expect(model.document().cells[`${tileX},4`]).not.toHaveProperty('terrainOverride');
    }
    expect(controller.snapshot().sampledTerrainPatch).toBeNull();
    model.undo();
    expect(model.document()).toBe(beforeSample);
  });

  it('applies a topology-safe exact override to only the pointer-down cell', () => {
    const { controller, model } = terrainHarness([
      [2, 2, 1], [3, 2, 1], [2, 3, 1], [3, 3, 1],
    ], 8, 8);
    controller.selectTerrainTool('inspect');
    model.selectTile(2, 2);
    const choice = controller.exactTerrainChoicesAtSelection()[0];
    expect(choice).toBeDefined();
    expect(controller.selectExactTerrainOverride(choice!)).toBe(true);
    const before = model.document();
    const terrain = mapEditorPickingTerrain(model.document());
    expect(controller.pointerDown(screenForProjectedTile(controller, terrain, 2, 2, 1), 0)).toBe(true);
    expect(controller.pointerMove(screenForTile(controller, 5, 5))).toBe(true);
    expect(controller.pointerUp()).toBe(true);

    expect(model.document().revision).toBe(before.revision + 1);
    expect(model.document().cells['2,2']?.terrainOverride).toEqual(choice!.override);
    expect(model.document().cells['5,5']?.terrainOverride).toBeUndefined();
    expect(controller.snapshot().selectedExactTerrainOverrideId).toBeNull();
    model.undo();
    expect(model.document()).toBe(before);
  });

  it('fails closed when the Terrain layer is hidden and resumes without stale partial history', () => {
    const { controller, model } = terrainHarness([], 8, 8);
    controller.selectSurfaceFamily('grass_4');
    model.toggleLayer('terrain');
    const before = model.document();
    expect(controller.pointerDown(screenForTile(controller, 2, 2), 0)).toBe(true);
    expect(controller.pointerUp()).toBe(false);
    expect(model.document()).toBe(before);
    expect(controller.snapshot().terrainAuthoringFeedback)
      .toBe('SELECT THE VISIBLE EDITABLE TERRAIN LAYER');

    model.toggleLayer('terrain');
    expect(controller.pointerDown(screenForTile(controller, 2, 2), 0)).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(before.revision + 1);
  });

  it('samples an authored object prefab and its actual visible layer without live mutation', () => {
    const { controller, model, selection } = harness();
    const prefab = createMapPrefabDocument({ id: 'sampled-prefab', title: 'Sampled Prefab' });
    model.embedPrefab(prefab);
    model.placeObject({
      id: 'sampled-object', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'ground', quarterTurns: 0,
      flipX: false, enabled: true,
    });
    model.selectWorkspace('objects');
    controller.selectLayer('objects');
    const point = screenForTile(controller, 400, 400);
    controller.wheel(point, -1_400);
    const before = mapDocumentV3Hash(model.document());

    controller.toggleEyedropper();
    expect(controller.pointerDown(screenForTile(controller, 400, 400), 0)).toBe(true);
    expect(controller.snapshot()).toMatchObject({
      eyedropperActive: false, activeLayer: 'ground', selectedPrefabId: prefab.id,
    });
    expect(selection.current()).toMatchObject({ kind: 'entity', id: 'sampled-object' });
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('leaves the eyedropper armed for terrain semantics absent from the palette', () => {
    expect(mapEditorTerrainToolForSample({
      surface: 'dirt', feature: 'farmland', collision: 'inherit', terrainOverride: null, ledge: false,
    })).toBeNull();
    expect(mapEditorTerrainToolForSample({
      surface: 'grass', feature: 'none', collision: 'inherit',
      terrainOverride: { contourLevel: 0, family: 'grass_1', frameIndex: 0 }, ledge: false,
    })).toBeNull();
    expect(mapEditorTerrainToolForSample({
      surface: 'grass', feature: 'none', collision: 'force_block', terrainOverride: null, ledge: false,
    })).toBe('block');
  });

  it('restores validated interaction state before initial viewport framing', () => {
    const { model } = harness();
    expect(model.restoreSession('biomes', [])).toBe(true);
    const controller = new MapEditorController(model);
    expect(controller.restoreSession({
      camera: { x: 100, y: 120, zoom: 1 },
      terrainTool: 'water', activeLayer: 'terrain', selectedPrefabId: null,
      selectedBiome: 'forest', activeElevation: 3, scatterDensity: 4_250,
    })).toBe(true);
    controller.setViewport({ x: 20, y: 30, width: 640, height: 480 });
    expect(controller.snapshot()).toMatchObject({
      camera: { x: 100, y: 120, zoom: 1 }, terrainTool: 'water', activeLayer: 'terrain',
      selectedBiome: 'forest', activeElevation: 3, scatterDensity: 4_250,
    });
    expect(controller.restoreSession({
      camera: { x: 0, y: 0, zoom: 0 },
      terrainTool: 'inspect', activeLayer: 'terrain', selectedPrefabId: null,
      selectedBiome: null, activeElevation: 0, scatterDensity: 3_500,
    })).toBe(false);
    expect(controller.restoreSession({
      camera: { x: 0, y: 0, zoom: 1 },
      terrainTool: 'inspect', activeLayer: 'terrain', selectedPrefabId: 'apple-tree',
      selectedBiome: null, activeElevation: 0, scatterDensity: 3_500,
    })).toBe(false);
  });

  it('maps authored terrain tools to semantic surface, ledge, and collision commands', () => {
    const { model } = harness();
    const document = model.document();
    expect(mapEditorTerrainCommand('water', [{ tileX: 4, tileY: 5 }], document, 0))
      .toMatchObject({ kind: 'paint', patch: { surface: 'water', feature: 'river' } });
    expect(mapEditorTerrainCommand('erase_ledge', [{ tileX: 4, tileY: 5 }], document, 0))
      .toEqual({ kind: 'paint', points: [{ tileX: 4, tileY: 5 }], patch: { ledge: false } });
    expect(mapEditorTerrainCommand('walk', [{ tileX: 4, tileY: 5 }], document, 0))
      .toMatchObject({ kind: 'paint', patch: { collision: 'force_walk' } });
    expect(mapEditorTerrainCommand('inherit', [{ tileX: 4, tileY: 5 }], document, 0))
      .toMatchObject({ kind: 'paint', patch: { collision: 'inherit', collisionReason: '' } });
  });

  it('picks an elevated plane and commits a continuous terrain stroke as one undoable edit', () => {
    const { controller, model, selection } = harness();
    const plateau = [
      { tileX: 400, tileY: 400 }, { tileX: 401, tileY: 400 }, { tileX: 402, tileY: 400 },
      { tileX: 400, tileY: 401 }, { tileX: 401, tileY: 401 }, { tileX: 402, tileY: 401 },
    ];
    model.editTerrain({ kind: 'paint', points: plateau, patch: { elevation: 2 },
      enforceMinimumTerrainFootprint: true });
    const terrain = mapEditorPickingTerrain(model.document());
    const initial = screenForProjectedTile(controller, terrain, 400, 400, 2);
    controller.wheel(initial, -2_000);
    controller.selectTerrainTool('inspect');
    expect(controller.pointerDown(screenForProjectedTile(controller, terrain, 400, 400, 2), 0)).toBe(true);
    expect(selection.current()).toMatchObject({ kind: 'tile', tileX: 400, tileY: 400 });
    expect(controller.snapshot().activeElevation).toBe(2);

    controller.selectTerrainTool('cave_floor');
    const before = mapDocumentV3Hash(model.document());
    const revision = model.document().revision;
    expect(controller.pointerDown(screenForProjectedTile(controller, terrain, 400, 400, 2), 0)).toBe(true);
    expect(controller.pointerMove(screenForProjectedTile(controller, terrain, 402, 400, 2))).toBe(true);
    expect(controller.pointerUp()).toBe(true);
    expect(model.document().revision).toBe(revision + 1);
    const editedTerrain = terrainDocumentForMapV3(model.document());
    for (const tileX of [400, 401, 402]) {
      expect(resolvedMapCellAt(editedTerrain, tileX, 400).surface).toBe('cave_floor');
    }
    expect(controller.keyDown('z', true)).toBe(true);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('commits an incremental Shift fill as exactly one undoable terrain edit', async () => {
    const { controller, model } = terrainHarness([], 64, 64);
    const before = mapDocumentV3Hash(model.document());
    const revision = model.document().revision;
    let invalidations = 0;
    const interaction = new MapEditorController(model, () => { invalidations += 1; });
    interaction.setViewport({ x: 80, y: 20, width: 960, height: 700 });
    interaction.selectLayer('terrain');
    interaction.selectTerrainTool('water');
    interaction.adoptPickingTerrain(
      model.terrainGeometryIdentity(),
      mapEditorPickingTerrain(model.document()),
    );

    expect(interaction.pointerDown(screenForTile(interaction, 10, 10), 0, false, true)).toBe(true);
    expect(interaction.floodFillPending()).toBe(true);
    await waitForFloodFill(interaction);

    expect(model.document().revision).toBe(revision + 1);
    expect(model.canUndo()).toBe(true);
    expect(invalidations).toBe(1);
    expect(resolvedMapCellAt(terrainDocumentForMapV3(model.document()), 63, 63).surface).toBe('water');
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    controller.dispose();
    interaction.dispose();
    model.dispose();
  });

  it('cancels an in-flight Shift fill on controller disposal without a partial commit', async () => {
    const { controller, model } = terrainHarness([], 128, 128);
    const before = mapDocumentV3Hash(model.document());
    let invalidations = 0;
    const interaction = new MapEditorController(model, () => { invalidations += 1; });
    interaction.setViewport({ x: 80, y: 20, width: 960, height: 700 });
    interaction.selectLayer('terrain');
    interaction.selectTerrainTool('water');
    interaction.adoptPickingTerrain(
      model.terrainGeometryIdentity(),
      mapEditorPickingTerrain(model.document()),
    );

    expect(interaction.pointerDown(screenForTile(interaction, 10, 10), 0, false, true)).toBe(true);
    expect(interaction.floodFillPending()).toBe(true);
    interaction.dispose();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(interaction.floodFillPending()).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(model.canUndo()).toBe(false);
    expect(invalidations).toBe(0);
    controller.dispose();
    model.dispose();
  });

  it('reuses renderer terrain for the first pointer interaction', () => {
    const { controller, model, selection } = harness();
    controller.selectLayer('terrain');
    controller.adoptPickingTerrain(
      model.terrainGeometryIdentity(),
      mapEditorPickingTerrain(model.document()),
    );
    const point = { x: 500, y: 350 };
    const world = controller.screenToWorld(point);
    const expected = {
      tileX: Math.floor(world.x / 16),
      tileY: Math.floor(world.y / 16),
    };
    const started = performance.now();
    expect(controller.pointerDown(point, 0)).toBe(true);
    const elapsed = performance.now() - started;
    expect(selection.current()).toMatchObject({ kind: 'tile', ...expected });
    expect(elapsed).toBeLessThan(50);

    const cachedStarted = performance.now();
    controller.pointerUp();
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(performance.now() - cachedStarted).toBeLessThan(50);
    expect(model.document().width * model.document().height).toBe(832 * 832);
  });

  it('selects terrain tools with compact numeric shortcuts and adjusts the set-elevation level', () => {
    const { controller } = harness();
    expect(controller.keyDown('2')).toBe(true);
    expect(controller.snapshot().terrainTool).toBe('grass');
    expect(controller.keyDown('1', false, false, true)).toBe(true);
    expect(controller.snapshot().terrainTool).toBe('lower');
    const elevation = controller.snapshot().activeElevation;
    expect(controller.keyDown(']')).toBe(true);
    expect(controller.snapshot().activeElevation).toBe(elevation + 1);
  });

  it('refreshes renamed object footprints at a content change without replacing live rows', () => {
    const { controller } = harness();
    const rows = { placeables: [{ id: 77n, spaceId: 0, kind: 'unrelated_item',
      definitionId: 'object:moon_shelter', tileX: 5, tileY: 6 }], npcs: [], players: [], homesteads: [] };
    const definition: ObjectContentDefinition = { kind: 'object', schemaVersion: 1,
      id: 'object:moon_shelter', displayName: 'Moon Shelter', components: {
        placement: { item: 'item:unrelated_item', layer: 'object', spaces: ['homestead'], facing: false,
          footprint: [[15, 15, 15], [15, 15, 15]] },
      } };
    controller.setLiveRows(rows, { objects: new Map([[definition.id, definition]]) });
    expect(controller.liveMarkers()[0]?.footprint).toEqual({ width: 3, height: 2 });
    controller.setLiveRows(rows, { objects: new Map([[definition.id, {
      ...definition, components: { ...definition.components,
        placement: { ...definition.components.placement!, footprint: [[15, 15]] } },
    }]]) });
    expect(controller.liveMarkers()[0]?.footprint).toEqual({ width: 2, height: 1 });
    controller.setLiveRows(rows, { objects: new Map() });
    expect(controller.liveMarkers()[0]?.footprint).toEqual({ width: 1, height: 1 });
  });

  it('projects every retained live row onto its semantic Photoshop-style layer', () => {
    const { controller, selection } = harness();
    const world = controller.screenToWorld({ x: 500, y: 350 });
    const tileX = Math.floor(world.x / 16);
    const tileY = Math.floor(world.y / 16);
    const rows = {
      placeables: [{ id: 7n, spaceId: 0, kind: 'tent', tileX: tileX + 1, tileY }],
      chests: [{ id: 8n, spaceId: 0, tileX: tileX + 3, tileY, open: true }],
      combatTargets: [{ id: 10n, spaceId: 0, tileX: tileX + 4, tileY }],
      surfaces: [{ id: 11n, spaceId: 0, kind: 'wooden_table', tileX: tileX + 5, tileY }],
      npcs: [{ id: 12n, spaceId: 0, kind: 'farmer_bob', displayName: 'Farmer Bob',
        x: (tileX + 6) * 256 + 128, y: tileY * 256 + 128, facing: 'left' }],
      players: [{ identity: { toHexString: () => 'player-one' }, spaceId: 0,
        displayName: 'Player One', x: (tileX + 7) * 256 + 128, y: tileY * 256 + 128 },
      { identity: { toHexString: () => 'cellar-player' }, spaceId: 13,
        displayName: 'Cellar Player', x: (tileX + 8) * 256 + 128, y: tileY * 256 + 128 }],
      homesteads: [{ spaceId: 42, owner: { toHexString: () => 'owner' }, tileX, tileY }],
      resources: [{ id: 9n, spaceId: 0, kind: 'tree', tileX: tileX + 2, tileY }],
    };
    expect(mapEditorLiveMarkers(rows).map(({ entityKind, layer }) => [entityKind, layer]))
      .toEqual([
        ['placeable', 'player_owned'], ['chest', 'player_owned'],
        ['homestead', 'player_owned'], ['resource', 'canopy'],
        ['combat-target', 'gameplay'], ['surface', 'gameplay'],
        ['npc', 'gameplay'], ['player', 'gameplay'],
      ]);
    expect(mapEditorLiveMarkers({ ...rows, placeables: [{
      id: 8n, spaceId: 0, kind: 'shed', tileX: tileX + 8, tileY, elevation: 2,
    }] }, bootstrapContentRegistry())[0]).toMatchObject({
      layer: 'player_owned', elevation: 2,
      footprint: { width: 4, height: 2 },
    });
    controller.setLiveRows(rows);
    controller.selectLayer('player_owned');
    expect(controller.pointerDown(screenForTile(controller, tileX, tileY), 0)).toBe(true);
    expect(selection.current()).toEqual({ kind: 'entity', entityKind: 'homestead', id: '42', spaceId: 42 });
    expect(controller.pointerUp()).toBe(false);
  });

  it('retains production processor state and selects players as read-only live actors', () => {
    const { controller, model, selection } = harness();
    const press = { id: 21n, spaceId: 0, kind: 'fruit_press', tileX: 398, tileY: 400,
      processStartTick: 91n };
    const cask = { id: 22n, spaceId: 0, kind: 'fermentation_cask', tileX: 399, tileY: 400,
      barrelSealedTick: 92n };
    const player = { identity: { toHexString: () => 'abc123' }, spaceId: 0,
      displayName: 'Orchard Keeper', x: 400 * 256 + 128, y: 400 * 256 + 128,
      facing: 'right', moving: true, equippedKind: 'watering_can' };
    controller.setLiveRows({ placeables: [press, cask], chests: [], homesteads: [],
      resources: [], combatTargets: [], surfaces: [], npcs: [], players: [player] });
    expect(controller.liveMarkers().slice(0, 2)).toEqual([
      expect.objectContaining({ kind: 'fruit_press', layer: 'player_owned', activity: 'processing' }),
      expect.objectContaining({ kind: 'fermentation_cask', layer: 'player_owned', activity: 'processing' }),
    ]);
    const terrain = mapEditorPickingTerrain(model.document());
    const elevation = terrain.elevations[400 * terrain.width + 400]!;
    const point = screenForProjectedTile(controller, terrain, 400, 400, elevation);
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(selection.current()).toEqual({ kind: 'player', identity: 'abc123', spaceId: 0 });
    expect(controller.snapshot().activeLayer).toBe('gameplay');
    expect(controller.deleteSelected()).toBe(false);
  });

  it('retains structural marker objects across movement-only row projections', () => {
    const { controller } = harness();
    const identity = { toHexString: () => 'moving-player' };
    const rows = {
      placeables: [], chests: [], homesteads: [], combatTargets: [], surfaces: [],
      resources: [{ id: 9n, spaceId: 0, kind: 'tree', tileX: 400, tileY: 400 }],
      npcs: [],
      players: [{ identity, spaceId: 0, x: 400 * 256, y: 400 * 256 }],
    };
    controller.setLiveRows(rows);
    const resourceMarker = controller.liveMarkers().find(({ entityKind }) => entityKind === 'resource');

    controller.setLiveRows({
      ...rows,
      players: [{ ...rows.players[0]!, x: 401 * 256 }],
    });

    expect(controller.liveMarkers().find(({ entityKind }) => entityKind === 'resource'))
      .toBe(resourceMarker);
    expect(controller.liveMarkers().find(({ entityKind }) => entityKind === 'player'))
      .toMatchObject({ tileX: 401 });
  });

  it('auto-picks live rows through their full footprint and keeps them read-only', () => {
    const { controller, model, selection } = harness();
    const anchor = { tileX: 400, tileY: 400 };
    controller.setLiveRows({
      placeables: [{ id: 77n, spaceId: 0, kind: 'shed', ...anchor }],
      npcs: [], homesteads: [], players: [], resources: [],
    }, bootstrapContentRegistry());
    const terrain = mapEditorPickingTerrain(model.document());
    const footprintTile = { tileX: 399, tileY: 399 };
    const elevation = terrain.elevations[footprintTile.tileY * terrain.width + footprintTile.tileX]!;
    let point = screenForProjectedTile(
      controller, terrain, footprintTile.tileX, footprintTile.tileY, elevation,
    );
    controller.wheel(point, -1_400);
    point = screenForProjectedTile(
      controller, terrain, footprintTile.tileX, footprintTile.tileY, elevation,
    );
    const before = mapDocumentV3Hash(model.document());

    expect(controller.snapshot().activeLayer).toBe('terrain');
    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(selection.current()).toEqual({
      kind: 'entity', entityKind: 'placeable', id: '77', spaceId: 0,
    });
    expect(controller.snapshot().activeLayer).toBe('player_owned');
    expect(model.workspace()).toBe('objects');
    expect(controller.pointerUp()).toBe(false);
    expect(controller.keyDown('Delete')).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('falls back to terrain selection when no visible entity occupies the tile', () => {
    const { controller, model, selection } = harness();
    const center = controller.screenToWorld({ x: 500, y: 350 });
    const tileX = Math.floor(center.x / 16);
    const tileY = Math.floor(center.y / 16);
    const point = screenForTile(controller, tileX, tileY);
    const revision = model.document().revision;

    expect(controller.pointerDown(point, 0)).toBe(true);
    expect(selection.current()).toMatchObject({ kind: 'tile', tileX, tileY });
    expect(controller.pointerUp()).toBe(false);
    expect(model.document().revision).toBe(revision);
  });
});

describe('semantic material and active height tools',()=>{
 it('raises only the active plane, expands locally and preserves material and remote overrides',()=>{
  const {controller,model}=terrainHarness([[3,2,3],[6,6,4]]);
  model.editTerrain({kind:'paint',points:[{tileX:2,tileY:2}],patch:{surface:'sand',cliffFamily:'desert_2'}},'beach');
  const before=model.document();controller.selectEditingTool('raise');
  controller.pointerDown(screenForTile(controller,2,2),0);controller.pointerUp();
  expect(model.document().cells['2,2']).toMatchObject({elevation:1,surface:'sand',cliffFamily:'desert_2',biome:'beach'});
  expect(model.document().cells['3,2']?.elevation).toBe(3);
  expect(model.document().cells['6,6']?.elevation).toBe(4);
  expect(model.document().cells['2,3']?.elevation).toBe(1);
  controller.undo();expect(model.document()).toBe(before);
 });
 it('supports single-cell manual height and prevents Lower from raising low ground',()=>{
  const {controller,model}=terrainHarness([[2,2,1],[3,2,3]]);
  controller.selectEditingTool('lower');controller.adjustActiveElevation(1);controller.setAutomaticGeneration(false);
  const point=screenForProjectedTile(controller,mapEditorPickingTerrain(model.document()),2,2,1);controller.pointerDown(point,0);controller.pointerUp();
  expect(resolvedMapCellAt(terrainDocumentForMapV3(model.document()),2,2).elevation).toBe(0);
  const next=model.document();controller.pointerDown(point,0);controller.pointerUp();expect(model.document()).toBe(next);
  expect(model.document().cells['3,2']?.elevation).toBe(3);
 });
});

it('refuses an automatic raised contour when no supported footprint exists',()=>{
 const entries:[number,number,number][]=[];
 for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)if(x!==2||y!==2)entries.push([x,y,3]);
 const {controller,model}=terrainHarness(entries);const before=model.document();controller.selectEditingTool('raise');
 controller.pointerDown(screenForTile(controller,2,2),0);controller.pointerUp();
 expect(model.document()).toBe(before);expect(controller.snapshot().terrainAuthoringFeedback).toContain('2 by 2');
});

it('does not flood a surface on another active height',async()=>{
 const {controller,model}=terrainHarness([]);controller.selectEditingTool('fill');controller.adjustActiveElevation(2);
 controller.selectMaterial('sand','Beach',{surface:'sand'},'beach');const before=model.document();
 controller.pointerDown(screenForProjectedTile(controller,mapEditorPickingTerrain(model.document()),2,2,2),0);controller.pointerUp();
 await Promise.resolve();expect(model.document()).toBe(before);expect(controller.snapshot().terrainAuthoringFeedback).toContain('height');
});

it('samples a manual fence and restores automatic joining for the next placement',()=>{
 const {controller,model}=terrainHarness([]);
 const prefab=normalizeMapPrefab({...createMapPrefabDocument({id:'fence-sample',title:'Fence'}),placements:[{id:'visual',assetId:1,assetName:'prop_cf_fence_horizontal',elevation:0,tileX:0,tileY:0,layer:'object',quarterTurns:0,flipX:false,visual:{kind:'variant',name:'base',frameIndex:0}}]});
 controller.setCatalog([prefab]);controller.selectObjectChoice(prefab.id);controller.setAutomaticGeneration(false);
 controller.pointerDown(screenForTile(controller,2,2),0);controller.pointerUp();
 const placed=model.document().objects.at(-1)!;expect(model.document().prefabs.find(p=>p.id===placed.prefabId)?.tags).toContain('studio.connection.manual');
 controller.toggleEyedropper();controller.pointerDown(screenForTile(controller,2,2),0);controller.pointerUp();
 expect(controller.snapshot().selectedPrefabId).toBe(prefab.id);controller.setAutomaticGeneration(true);
 controller.pointerDown(screenForTile(controller,3,2),0);controller.pointerUp();
 const next=model.document().objects.find(o=>o.tileX===3)!;expect(model.document().prefabs.find(p=>p.id===next.prefabId)?.tags).not.toContain('studio.connection.manual');
});
