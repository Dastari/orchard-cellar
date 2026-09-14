import { describe, expect, it } from 'vitest';
import {
  applyMapDocumentV3Edit,
  authoredMapContentPainterTie,
  createLiveIslandMapDocument,
  createEmptyMapDocument,
  createMapPrefabDocument,
  mapDocumentV3Hash,
  mapContentLayerRank,
  mapObjectCollisionCells,
  generateSurvivalLandmarkDecorations,
  mapLandmarkCollisionObstacle,
  migrateMapDocumentV2,
  parseMapDocumentV3,
  resolvedMapCellAt,
  resolvedMapBiomeAt,
  serializeMapDocument,
  serializeMapDocumentV3,
  survivalBiomeAt,
  survivalTerrainHeightAt,
  isSurvivalAuthoredLandmarkDecoration,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  terrainDocumentForMapV3,
  type MapPrefabDocumentV2,
} from './index.js';

function fixture() {
  return migrateMapDocumentV2(createEmptyMapDocument({
    id: 'v3-fixture', title: 'V3 Fixture', width: 16, height: 12,
  }));
}

describe('MapDocumentV3', () => {
  it('round-trips registry-authored landmark group ids outside the original island groups', () => {
    const decorations = generateSurvivalLandmarkDecorations([{
      id: 'moonlit_orchard', label: 'Moonlit Orchard', runtimeIdBase: '8000000000',
      bounds: { minimumTileX: 2, maximumTileX: 4, minimumTileY: 2, maximumTileY: 4 },
      decorations: [{ kind: 'point', decorationKind: 'camp_flowers', tileX: 3, tileY: 3 }],
    }]);
    const decoration = decorations[0]!;
    const document = {
      ...fixture(),
      landmarks: [{
        ...decoration, id: `landmark-${decoration.id}`, sourceDecorationId: decoration.id,
        elevation: 0, layer: 'objects' as const, quarterTurns: 0 as const,
        flipX: false, enabled: true,
      }],
    };
    const parsed = parseMapDocumentV3(serializeMapDocumentV3(document));
    expect(parsed.landmarks).toEqual(document.landmarks);
    expect(parsed.landmarks[0]?.groupId).toBe('moonlit_orchard');
    for (const groupId of ['', 'invalid group', 'x'.repeat(97), 3]) {
      expect(() => parseMapDocumentV3(JSON.stringify({
        ...document, landmarks: [{ ...document.landmarks[0], groupId }],
      }))).toThrow();
    }
  });

  it('migrates V2 with explicit layers and a semantic base biome', () => {
    const v2 = createEmptyMapDocument({ id: 'legacy', title: 'Legacy', width: 8, height: 6 });
    const parsed = parseMapDocumentV3(serializeMapDocument(v2));
    expect(parsed).toMatchObject({ schemaVersion: 3, baseBiome: 'plains' });
    expect(parsed.layers.map((layer) => layer.id)).toEqual([
      'generated_base', 'terrain', 'ground', 'objects', 'gameplay', 'player_owned', 'canopy', 'anchors',
    ]);
  });

  it('adds newly introduced read-only layers when opening an older V3 document', () => {
    const document = fixture();
    const legacy = JSON.parse(serializeMapDocumentV3(document)) as { layers: Array<{ id: string }> };
    legacy.layers = legacy.layers.filter((layer) => layer.id !== 'player_owned');
    const parsed = parseMapDocumentV3(JSON.stringify(legacy));
    expect(parsed.layers.find((layer) => layer.id === 'player_owned')).toMatchObject({
      label: 'Player-Owned Objects', editable: false,
    });
  });

  it('derives a stable authored painter tie from persisted back-to-front layer order', () => {
    const document = fixture();
    const reordered = {
      ...document,
      layers: document.layers.map((layer) => layer.id === 'ground'
        ? { ...layer, order: 30 }
        : layer.id === 'objects' ? { ...layer, order: 20 } : layer),
    };
    expect(mapContentLayerRank(document, 'ground')).toBeLessThan(mapContentLayerRank(document, 'objects'));
    expect(mapContentLayerRank(reordered, 'objects')).toBeLessThan(mapContentLayerRank(reordered, 'ground'));
    expect(authoredMapContentPainterTie(reordered, 'objects', 'object', 'crate').localeCompare(
      authoredMapContentPainterTie(reordered, 'ground', 'landmark', 'flowers'),
    )).toBeLessThan(0);
  });

  it('round-trips biome overrides independently from terrain', () => {
    const base = fixture();
    const edited = applyMapDocumentV3Edit(base, {
      kind: 'paint_biome', points: [{ tileX: 3, tileY: 4 }], biome: 'forest',
    }).document;
    expect(resolvedMapBiomeAt(edited, 3, 4)).toBe('forest');
    const parsed = parseMapDocumentV3(serializeMapDocumentV3(edited));
    expect(parsed).toEqual(edited);
    expect(mapDocumentV3Hash(parsed)).toBe(mapDocumentV3Hash(edited));
  });

  it('applies a default surface family as one full-rebuild V3 terrain command', () => {
    const base = fixture();
    const changed = applyMapDocumentV3Edit(base, {
      kind: 'terrain',
      command: { kind: 'set_default_surface_family', family: 'grass_3' },
    });
    expect(changed).toMatchObject({ changed: [], fullRebuild: true });
    expect(changed.document).toMatchObject({
      defaultSurfaceFamily: 'grass_3', revision: base.revision + 1,
    });
    expect(parseMapDocumentV3(serializeMapDocumentV3(changed.document))).toEqual(changed.document);

    const unchanged = applyMapDocumentV3Edit(changed.document, {
      kind: 'terrain',
      command: { kind: 'set_default_surface_family', family: 'grass_3' },
    });
    expect(unchanged.document).toBe(changed.document);
    expect(unchanged).toEqual({ document: changed.document, changed: [] });
  });

  it('strictly reconstructs bounded anchors and preserves canonical labels', () => {
    const source = JSON.parse(serializeMapDocumentV3(fixture())) as Record<string, unknown>;
    source['anchors'] = [{
      id: 'orchard-gate', kind: 'poi', tileX: 3, tileY: 4, elevation: 0,
      label: '  Orchard Gate  ', ignored: 'not canonical',
    }];
    expect(parseMapDocumentV3(JSON.stringify(source)).anchors).toEqual([{
      id: 'orchard-gate', kind: 'poi', tileX: 3, tileY: 4, elevation: 0,
      label: 'Orchard Gate',
    }]);
  });

  it.each([
    ['unstable id', { id: 'Bad ID', kind: 'spawn', tileX: 1, tileY: 1, elevation: 0 }],
    ['unknown kind', { id: 'bad-kind', kind: 'zone', tileX: 1, tileY: 1, elevation: 0 }],
    ['fractional coordinate', { id: 'fractional', kind: 'spawn', tileX: 1.5, tileY: 1, elevation: 0 }],
    ['out-of-bounds coordinate', { id: 'outside', kind: 'spawn', tileX: 16, tileY: 1, elevation: 0 }],
    ['fractional elevation', { id: 'fractional-height', kind: 'spawn', tileX: 1, tileY: 1, elevation: 0.5 }],
    ['unbounded elevation', { id: 'high', kind: 'spawn', tileX: 1, tileY: 1, elevation: 33 }],
    ['missing annotation label', { id: 'unlabelled', kind: 'poi', tileX: 1, tileY: 1, elevation: 0 }],
    ['empty annotation label', { id: 'empty-label', kind: 'label', tileX: 1, tileY: 1, elevation: 0, label: '   ' }],
    ['oversized label', { id: 'long-label', kind: 'label', tileX: 1, tileY: 1, elevation: 0, label: 'x'.repeat(97) }],
  ])('rejects an anchor with %s', (_case, anchor) => {
    const source = JSON.parse(serializeMapDocumentV3(fixture())) as Record<string, unknown>;
    source['anchors'] = [anchor];
    expect(() => parseMapDocumentV3(JSON.stringify(source))).toThrow('Map gameplay anchor is invalid');
  });

  it('rejects anchor elevation drift and ids shared with objects', () => {
    const raised = applyMapDocumentV3Edit(fixture(), {
      kind: 'terrain', command: { kind: 'paint', points: [{ tileX: 2, tileY: 2 }], patch: { elevation: 1 } },
    }).document;
    const mismatched = JSON.parse(serializeMapDocumentV3(raised)) as Record<string, unknown>;
    mismatched['anchors'] = [{ id: 'height-drift', kind: 'spawn', tileX: 2, tileY: 2, elevation: 0 }];
    expect(() => parseMapDocumentV3(JSON.stringify(mismatched)))
      .toThrow('Map gameplay anchor elevation does not match terrain');

    const prefab = createMapPrefabDocument({ id: 'marker', title: 'Marker' });
    let withObject = applyMapDocumentV3Edit(fixture(), { kind: 'embed_prefab', prefab }).document;
    withObject = applyMapDocumentV3Edit(withObject, {
      kind: 'place_object',
      object: {
        id: 'shared-id', prefabId: prefab.id, prefabRevision: prefab.revision,
        tileX: 3, tileY: 3, elevation: 0, layer: 'objects',
        quarterTurns: 0, flipX: false, enabled: true,
      },
    }).document;
    const duplicate = JSON.parse(serializeMapDocumentV3(withObject)) as Record<string, unknown>;
    duplicate['anchors'] = [{ id: 'shared-id', kind: 'spawn', tileX: 1, tileY: 1, elevation: 0 }];
    expect(() => parseMapDocumentV3(JSON.stringify(duplicate))).toThrow(
      'Map V3 ids and prefab references must be unique and complete',
    );
  });

  it('places, moves, and removes annotation anchors as strict single-revision edits', () => {
    const base = fixture();
    const placed = applyMapDocumentV3Edit(base, {
      kind: 'place_anchor',
      anchor: { id: 'north-gate', kind: 'poi', label: ' North Gate ', tileX: 2, tileY: 3, elevation: 0 },
    });
    expect(placed).toMatchObject({
      changed: [{ tileX: 2, tileY: 3 }],
      document: { revision: base.revision + 1, anchors: [{
        id: 'north-gate', kind: 'poi', label: 'North Gate', tileX: 2, tileY: 3, elevation: 0,
      }] },
    });

    const moved = applyMapDocumentV3Edit(placed.document, {
      kind: 'move_anchor', anchorId: 'north-gate', tileX: 4, tileY: 5, elevation: 0,
    });
    expect(moved).toMatchObject({
      changed: [{ tileX: 2, tileY: 3 }, { tileX: 4, tileY: 5 }],
      document: { revision: base.revision + 2, anchors: [{ tileX: 4, tileY: 5 }] },
    });
    expect(applyMapDocumentV3Edit(moved.document, {
      kind: 'move_anchor', anchorId: 'north-gate', tileX: 4, tileY: 5, elevation: 0,
    }).document).toBe(moved.document);

    const removed = applyMapDocumentV3Edit(moved.document, {
      kind: 'remove_anchor', anchorId: 'north-gate',
    });
    expect(removed).toMatchObject({
      changed: [{ tileX: 4, tileY: 5 }],
      document: { revision: base.revision + 3, anchors: [] },
    });
  });

  it('updates only an annotation anchor label as one strict revision', () => {
    const base = applyMapDocumentV3Edit(fixture(), {
      kind: 'place_anchor',
      anchor: { id: 'north-gate', kind: 'poi', label: 'North Gate', tileX: 2, tileY: 3, elevation: 0 },
    }).document;
    const updated = applyMapDocumentV3Edit(base, {
      kind: 'update_anchor_label', anchorId: 'north-gate', label: '  Orchard Gate  ',
    });
    expect(updated).toMatchObject({
      changed: [{ tileX: 2, tileY: 3 }],
      document: { revision: base.revision + 1, anchors: [{
        id: 'north-gate', kind: 'poi', label: 'Orchard Gate', tileX: 2, tileY: 3, elevation: 0,
      }] },
    });
    expect(applyMapDocumentV3Edit(updated.document, {
      kind: 'update_anchor_label', anchorId: 'north-gate', label: ' Orchard Gate ',
    }).document).toBe(updated.document);
  });

  it('rejects invalid or runtime-authoritative anchor label updates', () => {
    const annotation = applyMapDocumentV3Edit(fixture(), {
      kind: 'place_anchor',
      anchor: { id: 'label-1', kind: 'label', label: 'Map Label', tileX: 1, tileY: 1, elevation: 0 },
    }).document;
    for (const label of ['', '   ', 'x'.repeat(97)]) {
      expect(() => applyMapDocumentV3Edit(annotation, {
        kind: 'update_anchor_label', anchorId: 'label-1', label,
      })).toThrow('Map gameplay anchor label is invalid');
    }
    expect(() => applyMapDocumentV3Edit(annotation, {
      kind: 'update_anchor_label', anchorId: 'Bad ID', label: 'Safe',
    })).toThrow('Map gameplay anchor id is invalid');
    const runtime = { ...fixture(), anchors: [{
      id: 'runtime-spawn', kind: 'spawn' as const, tileX: 1, tileY: 1, elevation: 0,
    }] };
    expect(() => applyMapDocumentV3Edit(runtime, {
      kind: 'update_anchor_label', anchorId: 'runtime-spawn', label: 'No authority',
    })).toThrow('Runtime-authoritative gameplay anchor labels cannot be edited');
  });

  it('rejects runtime-authoritative, duplicate, malformed, and elevation-drift anchor edits', () => {
    const base = fixture();
    expect(() => applyMapDocumentV3Edit(base, {
      kind: 'place_anchor',
      anchor: { id: 'spawn-main', kind: 'spawn', tileX: 1, tileY: 1, elevation: 0 },
    })).toThrow('Only annotation gameplay anchors can be authored');
    expect(() => applyMapDocumentV3Edit(base, {
      kind: 'place_anchor',
      anchor: { id: 'Bad ID', kind: 'label', label: 'Bad', tileX: 1, tileY: 1, elevation: 0 },
    })).toThrow('Only annotation gameplay anchors can be authored');

    const placed = applyMapDocumentV3Edit(base, {
      kind: 'place_anchor',
      anchor: { id: 'label-1', kind: 'label', label: 'Label 1', tileX: 1, tileY: 1, elevation: 0 },
    }).document;
    expect(() => applyMapDocumentV3Edit(placed, {
      kind: 'place_anchor',
      anchor: { id: 'label-1', kind: 'poi', label: 'Duplicate', tileX: 2, tileY: 2, elevation: 0 },
    })).toThrow('Map gameplay anchor id must be unique');

    const raised = applyMapDocumentV3Edit(base, {
      kind: 'terrain', command: { kind: 'paint', points: [{ tileX: 3, tileY: 3 }], patch: { elevation: 1 } },
    }).document;
    expect(() => applyMapDocumentV3Edit(raised, {
      kind: 'place_anchor',
      anchor: { id: 'wrong-height', kind: 'poi', label: 'Wrong', tileX: 3, tileY: 3, elevation: 0 },
    })).toThrow('Map gameplay anchor elevation does not match terrain');

    const runtime = { ...base, anchors: [{
      id: 'runtime-spawn', kind: 'spawn' as const, tileX: 1, tileY: 1, elevation: 0,
    }] };
    expect(() => applyMapDocumentV3Edit(runtime, {
      kind: 'move_anchor', anchorId: 'runtime-spawn', tileX: 2, tileY: 2, elevation: 0,
    })).toThrow('Runtime-authoritative gameplay anchors cannot be moved');
    expect(() => applyMapDocumentV3Edit(runtime, {
      kind: 'remove_anchor', anchorId: 'runtime-spawn',
    })).toThrow('Runtime-authoritative gameplay anchors cannot be removed');
  });

  it('represents the live island as a sparse overlay over its pinned generated base', () => {
    const document = createLiveIslandMapDocument();
    const terrain = terrainDocumentForMapV3(document);
    const point = { tileX: Math.floor(SURVIVAL_WORLD_SIZE / 2), tileY: Math.floor(SURVIVAL_WORLD_SIZE / 2) };
    expect(document).toMatchObject({
      id: 'live-island', width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE,
      cells: {},
      provenance: {
        kind: 'generated', generator: 'survival-island',
        generatorSeed: SURVIVAL_WORLD_SEED,
      },
    });
    expect(resolvedMapCellAt(terrain, point.tileX, point.tileY).elevation).toBe(
      survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, point.tileX, point.tileY),
    );
    expect(resolvedMapBiomeAt(document, point.tileX, point.tileY)).toBe(
      survivalBiomeAt(SURVIVAL_WORLD_SEED, point.tileX, point.tileY),
    );
    const painted = applyMapDocumentV3Edit(document, {
      kind: 'terrain',
      command: { kind: 'paint', points: [{ tileX: 0, tileY: 0 }], patch: { surface: 'grass' } },
    }).document;
    expect(resolvedMapCellAt(terrainDocumentForMapV3(painted), 0, 0)).toMatchObject({
      surface: 'grass', collision: 'inherit',
    });
    expect(Object.keys(painted.cells)).toEqual(['0,0']);
  });

  it('materializes named locations as editable persisted landmarks, not procedural clutter', () => {
    let document = createLiveIslandMapDocument();
    expect(new Set(document.landmarks.map((landmark) => landmark.groupId))).toEqual(new Set([
      'marlow_camp', 'farmer_bob_farm', 'fisherman_fin_camp',
    ]));
    expect(document.landmarks.every((landmark) => isSurvivalAuthoredLandmarkDecoration({
      id: landmark.sourceDecorationId,
    }))).toBe(true);

    const farmhouse = document.landmarks.find((landmark) => landmark.kind === 'farm_house')!;
    document = applyMapDocumentV3Edit(document, {
      kind: 'move_landmark', landmarkId: farmhouse.id,
      tileX: farmhouse.tileX + 2, tileY: farmhouse.tileY + 1,
    }).document;
    document = applyMapDocumentV3Edit(document, {
      kind: 'place_landmark',
      landmark: { ...document.landmarks.find((entry) => entry.id === farmhouse.id)!, quarterTurns: 1, scale: 2 },
    }).document;
    const moved = parseMapDocumentV3(serializeMapDocumentV3(document))
      .landmarks.find((landmark) => landmark.id === farmhouse.id)!;
    expect(moved).toMatchObject({ tileX: farmhouse.tileX + 2, tileY: farmhouse.tileY + 1, quarterTurns: 1, scale: 2 });
    expect(mapLandmarkCollisionObstacle(moved, 'ground')).not.toBeNull();

    const removed = applyMapDocumentV3Edit(document, {
      kind: 'remove_landmark', landmarkId: farmhouse.id,
    }).document;
    expect(removed.landmarks.some((landmark) => landmark.id === farmhouse.id)).toBe(false);
  });

  it('upgrades old live documents and preserves hidden landmark decorations', () => {
    const current = createLiveIslandMapDocument();
    const hidden = current.landmarks.find((landmark) => landmark.groupId === 'marlow_camp')!;
    const legacy = JSON.parse(serializeMapDocumentV3(current)) as Record<string, unknown>;
    delete legacy['landmarks'];
    legacy['generatedSuppressions'] = [`decoration-${hidden.sourceDecorationId}`];
    const upgraded = parseMapDocumentV3(JSON.stringify(legacy));
    expect(upgraded.landmarks.find((landmark) => landmark.id === hidden.id)?.enabled).toBe(false);
    expect(upgraded.generatedSuppressions).not.toContain(`decoration-${hidden.sourceDecorationId}`);
  });

  it('embeds a prefab, places it, moves it, and exposes collision cells', () => {
    const prefab: MapPrefabDocumentV2 = {
      ...createMapPrefabDocument({ id: 'apple-tree', title: 'Apple Tree', width: 2, height: 2 }),
      cells: [{ id: 'trunk', tileX: 1, tileY: 1, elevation: 0, collisionMask: 0xffff }],
    };
    let document = applyMapDocumentV3Edit(fixture(), { kind: 'embed_prefab', prefab }).document;
    document = applyMapDocumentV3Edit(document, {
      kind: 'place_object',
      object: {
        id: 'tree-1', prefabId: 'apple-tree', prefabRevision: 0,
        tileX: 5, tileY: 6, elevation: 0, layer: 'gameplay',
        quarterTurns: 0, flipX: false, enabled: true,
      },
    }).document;
    expect(mapObjectCollisionCells(document, document.objects[0]!)).toEqual([
      { tileX: 5, tileY: 6, elevation: 0, collisionMask: 0xffff },
    ]);
    document = applyMapDocumentV3Edit(document, {
      kind: 'move_object', objectId: 'tree-1', tileX: 8, tileY: 7,
    }).document;
    expect(document.objects[0]).toMatchObject({ tileX: 8, tileY: 7 });
  });

  it('rejects instances whose prefab revision is unavailable', () => {
    expect(() => applyMapDocumentV3Edit(fixture(), {
      kind: 'place_object',
      object: {
        id: 'missing', prefabId: 'missing-prefab', prefabRevision: 0,
        tileX: 1, tileY: 1, elevation: 0, layer: 'objects',
        quarterTurns: 0, flipX: false, enabled: true,
      },
    })).toThrow('unavailable prefab revision');
  });

  it('round-trips 2x object scale and expands collision around the prefab pivot', () => {
    const prefab: MapPrefabDocumentV2 = {
      ...createMapPrefabDocument({ id: 'scaled-rock', title: 'Scaled Rock' }),
      cells: [{ id: 'rock', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
    };
    let document = applyMapDocumentV3Edit(fixture(), { kind: 'embed_prefab', prefab }).document;
    document = applyMapDocumentV3Edit(document, {
      kind: 'place_object',
      object: {
        id: 'rock-2x', prefabId: prefab.id, prefabRevision: prefab.revision,
        tileX: 4, tileY: 5, elevation: 0, layer: 'objects',
        quarterTurns: 0, flipX: false, scale: 2, enabled: true,
      },
    }).document;
    expect(parseMapDocumentV3(serializeMapDocumentV3(document))).toEqual(document);
    expect(mapObjectCollisionCells(document, document.objects[0]!)).toEqual([
      { tileX: 4, tileY: 5, elevation: 0, collisionMask: 0xffff },
      { tileX: 5, tileY: 5, elevation: 0, collisionMask: 0xffff },
      { tileX: 4, tileY: 6, elevation: 0, collisionMask: 0xffff },
      { tileX: 5, tileY: 6, elevation: 0, collisionMask: 0xffff },
    ]);
  });
});
