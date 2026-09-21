import {
  applyMapDocumentV3Edit,
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  createMapPrefabDocument,
  migrateMapDocumentV2,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import { inspectMapSelection, type MapGeneratedSelectionDescriptor } from './selection-inspection.js';

describe('map selection inspection projection', () => {
  it('reports generated production terrain with semantic WHY and exact visual roles', () => {
    const document = createLiveIslandMapDocument();
    const terrain = buildMapEditorTerrain(document);
    // The renderer visits visible terrain before exposing it to selection.
    // Warm the same per-terrain visual topology caches outside the measured
    // input path, then verify a selection cannot trigger another full compile.
    inspectMapSelection({
      document,
      selection: { kind: 'tile', spaceId: 0, tileX: 399, tileY: 400 },
      activeLayer: 'terrain',
      terrain,
    });
    const started = performance.now();
    const inspection = inspectMapSelection({
      document,
      selection: { kind: 'tile', spaceId: 0, tileX: 400, tileY: 400 },
      activeLayer: 'terrain',
      terrain,
    });
    expect(performance.now() - started).toBeLessThan(50);
    expect(inspection).not.toBeNull();
    expect(inspection?.provenance).toMatchObject({ kind: 'generated', authored: false, generated: true });
    expect(inspection?.layer).toMatchObject({ id: 'terrain', active: true, visible: true, editable: true });
    expect(inspection?.terrain.sources).toEqual({
      biome: 'generated', surface: 'generated', elevation: 'generated',
      collision: 'generated', visualOverride: 'generated',
    });
    expect(inspection?.semanticHierarchy[0]).toMatchObject({
      hierarchy: expect.arrayContaining(['surface']),
      reason: expect.stringMatching(/^generated .* surface selected by survival-island biome$/u),
    });
    expect(inspection?.visualComposition.layers.length).toBeGreaterThan(0);
    expect(inspection?.visualComposition.layers.every(({ asset, role }) => asset.length > 0 && role.length > 0)).toBe(true);
  });

  it('distinguishes authored field overrides and preserves collision reasons', () => {
    let document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'inspect-authored', title: 'Inspect Authored', width: 8, height: 8,
    }));
    document = applyMapDocumentV3Edit(document, {
      kind: 'terrain', command: { kind: 'paint', points: [{ tileX: 3, tileY: 3 }], patch: {
        surface: 'water', elevation: 1, collision: 'force_block',
        collisionReason: 'blocked for inspection test',
      } },
    }).document;
    document = applyMapDocumentV3Edit(document, {
      kind: 'paint_biome', points: [{ tileX: 3, tileY: 3 }], biome: 'freshwater',
    }).document;
    const inspection = inspectMapSelection({
      document,
      selection: { kind: 'tile', spaceId: 0, tileX: 3, tileY: 3 },
      activeLayer: 'objects', hiddenLayers: ['terrain'],
    });
    expect(inspection?.provenance.kind).toBe('authored');
    expect(inspection?.layer).toMatchObject({ id: 'terrain', active: false, visible: false });
    expect(inspection?.terrain).toMatchObject({
      biome: 'freshwater', blocked: true,
      cell: { surface: 'water', elevation: 1, collision: 'force_block', collisionReason: 'blocked for inspection test' },
      sources: { biome: 'authored', surface: 'authored', elevation: 'authored', collision: 'authored' },
    });
    expect(inspection?.semanticHierarchy.some(({ role, reason }) => (
      role === 'surface.water' && reason.includes('water surface')
    ))).toBe(true);
  });

  it('reuses completed renderer terrain for an edited 832x832 selection without losing exact semantics', () => {
    let document = createLiveIslandMapDocument();
    document = applyMapDocumentV3Edit(document, {
      kind: 'terrain', command: { kind: 'paint', points: [{ tileX: 400, tileY: 400 }], patch: {
        surface: 'stone', elevation: 1, collision: 'force_block',
        collisionReason: 'large edited selection fixture',
      } },
    }).document;
    const terrain = buildMapEditorTerrain(document);
    const started = performance.now();
    const inspection = inspectMapSelection({
      document,
      selection: { kind: 'tile', spaceId: 0, tileX: 400, tileY: 400 },
      activeLayer: 'terrain',
      terrain,
    });
    expect(performance.now() - started).toBeLessThan(50);
    expect(inspection?.terrain).toMatchObject({
      blocked: false,
      cell: { surface: 'stone', elevation: 1, collision: 'inherit', collisionReason: null },
      sources: { surface: 'authored', elevation: 'authored' },
    });
    expect(inspection?.semanticHierarchy.some(({ role }) => role === 'surface.stone')).toBe(true);
  });

  it('describes authored object and landmark transforms on their actual layer', () => {
    const prefab = createMapPrefabDocument({ id: 'inspect-tree', title: 'Inspection Tree' });
    let document = createLiveIslandMapDocument();
    document = applyMapDocumentV3Edit(document, { kind: 'embed_prefab', prefab }).document;
    document = applyMapDocumentV3Edit(document, { kind: 'place_object', object: {
      id: 'inspect-tree-1', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 400, tileY: 400, elevation: 0, layer: 'canopy', quarterTurns: 2,
      flipX: true, scale: 2, enabled: false,
    } }).document;
    const terrain = buildMapEditorTerrain(document);
    const object = inspectMapSelection({
      document, terrain,
      selection: { kind: 'entity', entityKind: 'map-object', id: 'inspect-tree-1', spaceId: 0 },
      activeLayer: 'objects', hiddenLayers: ['canopy'],
    });
    expect(object?.provenance).toMatchObject({ kind: 'authored', source: 'map-object:inspect-tree-1' });
    expect(object?.layer).toMatchObject({ id: 'canopy', active: false, visible: false });
    expect(object?.entity).toMatchObject({
      kind: 'authored_object', name: 'Inspection Tree', quarterTurns: 2,
      flipX: true, scale: 2, enabled: false,
    });
    expect(object?.suppression.supported).toBe(false);

    const landmark = document.landmarks[0]!;
    const landmarkInspection = inspectMapSelection({
      document, terrain,
      selection: { kind: 'entity', entityKind: 'map-object', id: landmark.id, spaceId: 0 },
      activeLayer: landmark.layer,
    });
    expect(landmarkInspection?.entity).toMatchObject({
      kind: 'authored_landmark', id: landmark.id, name: landmark.groupLabel,
    });
    expect(landmarkInspection?.layer.active).toBe(true);
  });

  it('describes annotation anchors as editable metadata and explicitly runtime unbound', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'inspect-anchor', title: 'Inspect Anchor', width: 8, height: 8,
    }));
    const document = {
      ...base,
      anchors: [{ id: 'north-gate', kind: 'poi' as const, label: 'North Gate', tileX: 3, tileY: 4, elevation: 0 }],
    };
    const inspection = inspectMapSelection({
      document,
      selection: { kind: 'entity', entityKind: 'map-anchor', id: 'north-gate', spaceId: 0 },
      activeLayer: 'anchors',
    });
    expect(inspection).toMatchObject({
      provenance: { kind: 'authored', source: 'map-anchor:north-gate' },
      layer: { id: 'anchors', active: true, editable: true },
      entity: {
        kind: 'authored_anchor', id: 'north-gate', name: 'North Gate',
        tileX: 3, tileY: 4, elevation: 0, runtimeKind: 'poi', readOnly: false,
        details: expect.arrayContaining([
          { label: 'Kind', value: 'POI' },
          { label: 'Label', value: 'North Gate' },
          { label: 'Runtime', value: 'UNBOUND' },
        ]),
      },
    });
    const relabelled = applyMapDocumentV3Edit(document, {
      kind: 'update_anchor_label', anchorId: 'north-gate', label: 'Orchard Gate',
    }).document;
    expect(inspectMapSelection({
      document: relabelled,
      selection: { kind: 'entity', entityKind: 'map-anchor', id: 'north-gate', spaceId: 0 },
      activeLayer: 'anchors',
    })?.entity).toMatchObject({
      name: 'Orchard Gate', readOnly: false,
      details: expect.arrayContaining([{ label: 'Label', value: 'Orchard Gate' }]),
    });
  });

  it('keeps runtime-functional anchor labels read-only', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'inspect-runtime-anchor', title: 'Inspect Runtime Anchor', width: 8, height: 8,
    }));
    const document = {
      ...base,
      anchors: [{ id: 'spawn-main', kind: 'spawn' as const, tileX: 3, tileY: 4, elevation: 0 }],
    };
    expect(inspectMapSelection({
      document,
      selection: { kind: 'entity', entityKind: 'map-anchor', id: 'spawn-main', spaceId: 0 },
      activeLayer: 'anchors',
    })).toMatchObject({
      layer: { id: 'anchors', editable: false },
      entity: { id: 'spawn-main', runtimeKind: 'spawn', readOnly: true },
    });
  });

  it('uses explicit generated provenance and reversible canonical suppression ids', () => {
    let document = createLiveIslandMapDocument();
    // Match the renderer's shared terrain snapshot. Suppression changes the
    // entity projection, so both inspections can reuse the same terrain.
    const terrain = buildMapEditorTerrain(document);
    const generated: MapGeneratedSelectionDescriptor = {
      entityKind: 'resource', id: '42', spaceId: 0, name: 'Apple Tree',
      tileX: 400, tileY: 400, elevation: 0, layer: 'generated_base',
      source: 'survival-island:resources', suppressionId: 'resource-42',
    };
    const before = inspectMapSelection({
      document, terrain,
      selection: { kind: 'entity', entityKind: 'resource', id: '42', spaceId: 0 },
      activeLayer: 'generated_base', generatedEntities: [generated],
    });
    expect(before?.provenance).toMatchObject({ kind: 'generated', generated: true });
    expect(before?.entity).toMatchObject({ kind: 'generated_object', name: 'Apple Tree' });
    expect(before?.suppression).toEqual({
      supported: true, id: 'resource-42', suppressed: false, canSuppress: true, canRestore: false,
    });

    document = applyMapDocumentV3Edit(document, {
      kind: 'suppress_generated_object', generatedId: 'resource-42', suppressed: true,
    }).document;
    expect(inspectMapSelection({
      document, terrain,
      selection: { kind: 'entity', entityKind: 'resource', id: '42', spaceId: 0 },
      activeLayer: 'generated_base', generatedEntities: [generated],
    })?.suppression).toEqual({
      supported: true, id: 'resource-42', suppressed: true, canSuppress: false, canRestore: true,
    });
  });

  it('describes live chests and players as read-only entities on semantic layers', () => {
    const document = createLiveIslandMapDocument();
    const terrain = buildMapEditorTerrain(document);
    const chest: MapGeneratedSelectionDescriptor = {
      entityKind: 'chest', id: '81', spaceId: 0, name: 'Chest',
      tileX: 401, tileY: 402, elevation: 0, layer: 'player_owned',
      source: 'live-world:chest', provenance: 'live', runtimeKind: 'chest', suppressionId: null,
    };
    const player: MapGeneratedSelectionDescriptor = {
      entityKind: 'player', id: 'player-hex', spaceId: 0, name: 'Orchard Keeper',
      tileX: 403, tileY: 404, elevation: 0, layer: 'gameplay',
      source: 'live-world:player', provenance: 'live', runtimeKind: 'player', suppressionId: null,
    };
    const chestInspection = inspectMapSelection({
      document, terrain, generatedEntities: [chest], activeLayer: 'player_owned',
      selection: { kind: 'entity', entityKind: 'chest', id: '81', spaceId: 0 },
    });
    expect(chestInspection).toMatchObject({
      provenance: { kind: 'live', source: 'live-world:chest', authored: false, generated: false },
      layer: { id: 'player_owned', editable: false },
      entity: { kind: 'live_object', runtimeKind: 'chest', readOnly: true, details: [] },
      suppression: { supported: false },
    });
    const playerInspection = inspectMapSelection({
      document, terrain, generatedEntities: [player], activeLayer: 'gameplay',
      selection: { kind: 'player', identity: 'player-hex', spaceId: 0 },
    });
    expect(playerInspection).toMatchObject({
      provenance: { kind: 'live', source: 'live-world:player' },
      layer: { id: 'gameplay', editable: false },
      entity: { name: 'Orchard Keeper', kind: 'live_object', readOnly: true },
    });
  });

  it('fails closed for absent, unknown, and out-of-map selections', () => {
    const document = createLiveIslandMapDocument();
    expect(inspectMapSelection({ document, selection: { kind: 'none' }, activeLayer: 'terrain' })).toBeNull();
    expect(inspectMapSelection({
      document,
      selection: { kind: 'entity', entityKind: 'unknown', id: 'missing', spaceId: 0 },
      activeLayer: 'objects',
    })).toBeNull();
    expect(inspectMapSelection({
      document,
      selection: { kind: 'tile', spaceId: 0, tileX: -1, tileY: 2 },
      activeLayer: 'terrain',
    })).toBeNull();
  });
});
