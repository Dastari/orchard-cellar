import { describe, expect, it } from "vitest";
import {
  EDITOR_UI_SCALE,
  editorUiActionAt,
  editorUiDrawerAt,
  editorUiHeaderLabel,
  editorInspectionLayerShortcut,
  editorUiMapHeaderAt,
  editorUiScrollLimit,
  editorUiScrollbarConfig,
  editorUiTooltipForAction,
  editorVisiblePrefabSelection,
  editorVisiblePrefabs,
  editorToolForShortcut,
  EDITOR_TOOLS,
} from "./editor-ui.js";
import type { TerrainInspection } from '@orchard/engine/terrain-inspector';

const scaled = (value: number): number => value * EDITOR_UI_SCALE;

const INSPECTION: TerrainInspection = {
  projectedWorldX: 0,
  projectedWorldY: 0,
  tileX: 0,
  tileY: 0,
  activeElevation: 1,
  logicalElevation: 1,
  collisionCell: 'open',
  blocked: false,
  layers: [
    {
      asset: 'ground_cache', frame: null, role: 'projected_surface', contourLevel: 1,
      tileX: 0, tileY: 0, elevationLayer: 1, depthPhase: 'surface', footY: 0,
      depthOffset: 0, tie: 'ground',
    },
    {
      asset: 'tile_cf_stone_cliff_variants', frame: 59, role: 'lower_wall_right',
      contourLevel: 2, tileX: 0, tileY: 1, elevationLayer: 1, depthPhase: 'boundary',
      footY: 0, depthOffset: 0, tie: 'wall',
    },
  ],
};

describe("offline editor resize controls", () => {
  it("uses the game-readable two-times editor chrome baseline", () => {
    expect(EDITOR_UI_SCALE).toBe(2);
  });

  it("maps both grow and crop buttons to each physical map edge", () => {
    expect(editorUiActionAt(scaled(18), scaled(473), 1_280)).toEqual({
      kind: "resize",
      edge: "west",
      grow: false,
    });
    expect(editorUiActionAt(scaled(50), scaled(473), 1_280)).toEqual({
      kind: "resize",
      edge: "west",
      grow: true,
    });
    expect(editorUiActionAt(scaled(81), scaled(473), 1_280)).toEqual({
      kind: "resize",
      edge: "east",
      grow: false,
    });
    expect(editorUiActionAt(scaled(112), scaled(473), 1_280)).toEqual({
      kind: "resize",
      edge: "east",
      grow: true,
    });
    expect(editorUiActionAt(scaled(18), scaled(500), 1_280)).toEqual({
      kind: "resize",
      edge: "north",
      grow: false,
    });
    expect(editorUiActionAt(scaled(50), scaled(500), 1_280)).toEqual({
      kind: "resize",
      edge: "north",
      grow: true,
    });
    expect(editorUiActionAt(scaled(81), scaled(500), 1_280)).toEqual({
      kind: "resize",
      edge: "south",
      grow: false,
    });
    expect(editorUiActionAt(scaled(112), scaled(500), 1_280)).toEqual({
      kind: "resize",
      edge: "south",
      grow: true,
    });
  });

  it("does not turn the spacing between resize controls into a hit target", () => {
    expect(editorUiActionAt(scaled(46), scaled(473), 1_280)).toBeNull();
  });

  it("removes finite resize actions from a procedural signed world", () => {
    expect(
      editorUiActionAt(scaled(18), scaled(473), 1_280, false, 0, 0, false),
    ).toBeNull();
  });

  it("only exposes Generate inside the selected ungenerated chunk action", () => {
    expect(editorUiActionAt(900, scaled(98), 1_280, true)).toEqual({
      kind: "generate_chunk",
    });
    expect(editorUiActionAt(900, scaled(98), 1_280, false)).toBeNull();
    expect(editorUiActionAt(900, scaled(140), 1_280, true)).toBeNull();
  });

  it("keeps hit targets aligned after scrolling a drawer", () => {
    expect(editorUiActionAt(scaled(18), scaled(393), 1_280, false, 80)).toEqual(
      {
        kind: "resize",
        edge: "west",
        grow: false,
      },
    );
  });

  it('exposes the registered grass surface palette as an editor selection', () => {
    expect(editorUiActionAt(scaled(18), scaled(425), 1_280)).toEqual({
      kind: 'cycle_surface_family',
    });
  });

  it('binds every advertised tool ordinal, including the ledge tools', () => {
    expect(Array.from({ length: 9 }, (_, index) => (
      editorToolForShortcut(String(index + 1))
    ))).toEqual(EDITOR_TOOLS.slice(0, 9));
    expect(Array.from({ length: 8 }, (_, index) => (
      editorToolForShortcut(String(index), true)
    ))).toEqual(EDITOR_TOOLS.slice(9));
  });

  it('provides keyboard selection and visibility for inspection layers', () => {
    expect(editorInspectionLayerShortcut('ArrowRight', true, null, 3)).toEqual({
      kind: 'select_inspection_layer', index: 0,
    });
    expect(editorInspectionLayerShortcut('ArrowLeft', true, 0, 3)).toEqual({
      kind: 'select_inspection_layer', index: 2,
    });
    expect(editorInspectionLayerShortcut('v', false, 2, 3)).toEqual({
      kind: 'toggle_inspection_layer', index: 2,
    });
    expect(editorInspectionLayerShortcut('v', false, null, 3)).toBeNull();
  });

  it("keeps commands fixed above the scrollable tool and terrain palettes", () => {
    expect(editorUiActionAt(scaled(18), scaled(42), 1_280)).toEqual({
      kind: "undo",
    });
    expect(editorUiActionAt(scaled(39), scaled(42), 1_280)).toEqual({
      kind: "redo",
    });
    expect(editorUiActionAt(scaled(60), scaled(42), 1_280)).toEqual({
      kind: "save",
    });
    expect(editorUiActionAt(scaled(81), scaled(42), 1_280)).toEqual({
      kind: "load",
    });
    expect(editorUiActionAt(scaled(102), scaled(42), 1_280)).toEqual({
      kind: "export",
    });
    expect(editorUiActionAt(scaled(108), scaled(42), 1_280)).toEqual({
      kind: "import",
    });
    expect(
      editorUiActionAt(scaled(126), scaled(42), 1_280, false, 0, 0, false),
    ).toEqual({
      kind: "randomize_seed",
    });
    expect(editorUiActionAt(scaled(126), scaled(42), 1_280)).toBeNull();
    expect(editorUiActionAt(scaled(18), scaled(42), 1_280, false, 200)).toEqual(
      { kind: "undo" },
    );
  });

  it("uses icon grids for editing tools and display toggles", () => {
    expect(editorUiActionAt(scaled(18), scaled(110), 1_280)).toEqual({
      kind: "tool",
      tool: "inspect",
    });
    expect(editorUiActionAt(scaled(50), scaled(110), 1_280)).toEqual({
      kind: "tool",
      tool: "grass",
    });
    expect(editorUiActionAt(scaled(18), scaled(206), 1_280)).toEqual({
      kind: "tool",
      tool: "transition",
    });
    expect(editorUiActionAt(scaled(50), scaled(206), 1_280)).toEqual({
      kind: "tool",
      tool: "ledge",
    });
    expect(editorUiActionAt(scaled(82), scaled(206), 1_280)).toEqual({
      kind: "tool",
      tool: "erase_ledge",
    });
    expect(editorUiActionAt(scaled(18), scaled(270), 1_280)).toEqual({
      kind: "toggle_grid",
    });
    expect(editorUiActionAt(scaled(42), scaled(270), 1_280)).toEqual({
      kind: "toggle_height",
    });
    expect(editorUiActionAt(scaled(66), scaled(270), 1_280)).toEqual({
      kind: "toggle_collision",
    });
    expect(editorUiActionAt(scaled(90), scaled(270), 1_280)).toEqual({
      kind: "toggle_edge_mode",
    });
    expect(editorUiActionAt(scaled(18), scaled(353), 1_280)).toEqual({
      kind: "toggle_terrain_family",
    });
    expect(
      editorUiActionAt(scaled(18), scaled(398), 1_280, false, 0, 0, true, true),
    ).toEqual({
      kind: "terrain_family",
      family: "basic",
    });
    expect(
      editorUiActionAt(scaled(18), scaled(442), 1_280, false, 0, 0, true, true),
    ).toEqual({
      kind: "terrain_family",
      family: "stone_1",
    });
  });

  it('switches workspaces and keeps layer targeting exclusively in the right stack', () => {
    expect(editorUiActionAt(scaled(18), scaled(72), 1_280)).toEqual({
      kind: 'workspace', workspace: 'terrain',
    });
    expect(editorUiActionAt(scaled(50), scaled(72), 1_280)).toEqual({
      kind: 'workspace', workspace: 'objects',
    });
    const layers = [
      { id: 'generated_base', label: 'Generated Base', visible: true, editable: false },
      { id: 'terrain', label: 'Terrain', visible: true, editable: true },
    ] as const;
    const prefabs = [
      { id: 'apple-tree', title: 'Apple Tree', collection: 'plants', tags: ['tree'] },
      { id: 'farm-gate', title: 'Farm Gate', collection: 'buildings', tags: ['gate'] },
    ] as const;
    const args = [false, 0, 0, true, false, [], null, false, 'inspect', 'objects', layers, prefabs, 'plants'] as const;
    expect(editorUiActionAt(scaled(18), scaled(132), 1_280, ...args)).toEqual({
      kind: 'focus_object_search',
    });
    expect(editorUiActionAt(scaled(18), scaled(147), 1_280, ...args)).toEqual({
      kind: 'cycle_prefab_collection',
    });
    expect(editorUiActionAt(scaled(18), scaled(178), 1_280, ...args)).toEqual({
      kind: 'select_prefab', prefabId: 'apple-tree',
    });
  });

  it('searches object names, ids, collections, and tags using every query term', () => {
    const prefabs = [
      { id: 'apple-tree', title: 'Apple Tree', collection: 'plants', tags: ['fruit', 'orchard'] },
      { id: 'farm-gate', title: 'Farm Gate', collection: 'buildings', tags: ['wooden', 'fence'] },
    ] as const;
    expect(editorVisiblePrefabs(prefabs, 'all', 'apple orchard').map((entry) => entry.id))
      .toEqual(['apple-tree']);
    expect(editorVisiblePrefabs(prefabs, 'buildings', 'wooden').map((entry) => entry.id))
      .toEqual(['farm-gate']);
    expect(editorVisiblePrefabs(prefabs, 'plants', 'gate')).toEqual([]);
  });

  it('drops an object placement selection when the palette no longer shows it', () => {
    const prefabs = [
      { id: 'apple-tree', title: 'Apple Tree', collection: 'plants', tags: ['tree'] },
      { id: 'farm-gate', title: 'Farm Gate', collection: 'buildings', tags: ['gate'] },
    ] as const;
    expect(editorVisiblePrefabSelection(prefabs, 'plants', '', 'apple-tree'))
      .toBe('apple-tree');
    expect(editorVisiblePrefabSelection(prefabs, 'buildings', '', 'apple-tree'))
      .toBeNull();
    expect(editorVisiblePrefabSelection(prefabs, 'all', 'gate', 'apple-tree'))
      .toBeNull();
    expect(editorVisiblePrefabSelection(prefabs, 'all', '', null)).toBeNull();
  });

  it('separates active-layer selection from the eye control in the lower right frame', () => {
    const layers = [
      { id: 'generated_base', label: 'Generated Base', visible: true, editable: false },
      { id: 'terrain', label: 'Terrain', visible: true, editable: true },
    ] as const;
    const args = [
      false, 0, 0, true, false, [], null, false, 'inspect', 'objects', layers,
    ] as const;
    expect(editorUiActionAt(scaled(390), scaled(331), 1_280, ...args)).toEqual({
      kind: 'toggle_content_layer', layer: 'generated_base',
    });
    expect(editorUiActionAt(scaled(420), scaled(331), 1_280, ...args)).toEqual({
      kind: 'select_content_layer', layer: 'generated_base',
    });
  });

  it('reserves the right drawer for selection actions instead of prefab picking', () => {
    const selection = {
      kind: 'authored_object', id: 'rock-1', name: 'Rock', tileX: 10, tileY: 12,
      elevation: 0, layer: 'objects', prefabId: 'rock', prefabRevision: 2,
      rotationDegrees: 0, flipX: false, scale: 1, enabled: true,
      cloneable: true, deletable: true, hideable: true, transformable: true,
      previewAsset: null, previewFrame: null, metadata: [],
    } as const;
    const args = [
      false, 0, 0, true, false, [], null, false, 'inspect', 'objects', [], [],
      'all', true, true, selection,
    ] as const;
    expect(editorUiActionAt(scaled(389), scaled(226), 1_280, ...args)).toEqual({
      kind: 'clone_selected_object',
    });
    expect(editorUiActionAt(scaled(559), scaled(226), 1_280, ...args)).toEqual({
      kind: 'scale_selected_object',
    });
    expect(editorUiActionAt(scaled(435), scaled(80), 1_280, ...args)).toBeNull();
  });

  it('reports disabled inspector controls for hover help without enabling clicks', () => {
    const selection = {
      kind: 'generated_object', id: 'resource-1', name: 'Tree', tileX: 4, tileY: 8,
      elevation: 0, layer: 'generated_base', prefabId: null, prefabRevision: null,
      rotationDegrees: 0, flipX: false, scale: 1, enabled: true,
      cloneable: false, deletable: true, hideable: true, transformable: false,
      previewAsset: null, previewFrame: null, metadata: [],
    } as const;
    const args = [
      false, 0, 0, true, false, [], null, false, 'inspect', 'objects', [], [],
      'all', true, true, selection,
    ] as const;
    expect(editorUiActionAt(scaled(389), scaled(226), 1_280, ...args)).toBeNull();
    expect(editorUiActionAt(scaled(389), scaled(226), 1_280, ...args, true)).toEqual({
      kind: 'clone_selected_object',
    });
    expect(editorUiActionAt(scaled(423), scaled(226), 1_280, ...args)).toEqual({
      kind: 'delete_selected_object',
    });
  });

  it('keeps subscribed player-owned world objects inspectable without destructive controls', () => {
    const selection = {
      kind: 'live_player_object', id: 'homestead:7', name: "Dastari's Homestead",
      tileX: 28, tileY: 30, elevation: 2, layer: 'player_owned',
      prefabId: null, prefabRevision: null, rotationDegrees: 0, flipX: false,
      scale: 1, enabled: true, cloneable: false, deletable: false,
      hideable: false, transformable: false, movable: true, previewAsset: null, previewFrame: null,
      metadata: [{ label: 'Persistence', value: 'live player state' }],
    } as const;
    const args = [
      false, 0, 0, true, false, [], null, false, 'inspect', 'objects', [], [],
      'all', true, true, selection,
    ] as const;
    expect(editorUiActionAt(scaled(423), scaled(226), 1_280, ...args)).toBeNull();
    expect(editorUiActionAt(scaled(423), scaled(226), 1_280, ...args, true)).toEqual({
      kind: 'delete_selected_object',
    });
  });

  it("exposes a bounded elevation brush delta stepper", () => {
    expect(editorUiActionAt(scaled(100), scaled(304), 1_280)).toEqual({
      kind: "elevation_delta",
      delta: -1,
    });
    expect(editorUiActionAt(scaled(126), scaled(304), 1_280)).toEqual({
      kind: "elevation_delta",
      delta: 1,
    });
  });

  it('turns the same bounded stepper into a 2-4 lane stair-width selector', () => {
    expect(editorUiActionAt(
      scaled(100), scaled(304), 1_280,
      false, 0, 0, true, false, [], null, false, 'transition',
    )).toEqual({ kind: 'stair_width', delta: -1 });
    expect(editorUiActionAt(
      scaled(126), scaled(304), 1_280,
      false, 0, 0, true, false, [], null, false, 'transition',
    )).toEqual({ kind: 'stair_width', delta: 1 });
  });

  it("provides concise hover help for every compact control family", () => {
    expect(editorUiTooltipForAction({ kind: "export" })).toContain("CTRL");
    expect(editorUiTooltipForAction({ kind: "toggle_grid" })).toContain("(G)");
    expect(editorUiTooltipForAction({ kind: "tool", tool: "water" })).toContain(
      "WATER",
    );
    expect(
      editorUiTooltipForAction({ kind: "terrain_family", family: "desert_2" }),
    ).toContain("SAND");
    expect(editorUiTooltipForAction({ kind: 'select_inspection_layer', index: 1 }))
      .toContain('LAYER 2');
    expect(editorUiTooltipForAction({ kind: 'toggle_inspection_layer', index: 1 }))
      .toContain('HIDE OR SHOW');
    expect(editorUiTooltipForAction({ kind: 'scale_selected_object' })).toContain('2X');
  });

  it('separates stack-tile selection from its visibility control', () => {
    const args = [false, 0, 0, true, false, [], INSPECTION, false] as const;
    expect(editorUiActionAt(scaled(435), scaled(200), 1_280, ...args)).toEqual({
      kind: 'select_inspection_layer',
      index: 0,
    });
    expect(editorUiActionAt(scaled(456), scaled(192), 1_280, ...args)).toEqual({
      kind: 'toggle_inspection_layer',
      index: 0,
    });
    expect(editorUiActionAt(scaled(435), scaled(180), 1_280, false, 0, 20,
      true, false, [], INSPECTION, false)).toEqual({
      kind: 'select_inspection_layer',
      index: 0,
    });
  });

  it("reserves a floating map-information plate above the canvas", () => {
    expect(editorUiMapHeaderAt(640, scaled(18), 1_280)).toBe(true);
    expect(editorUiMapHeaderAt(640, scaled(50), 1_280)).toBe(false);
  });

  it("keeps the procedural map header concise enough for its central plate", () => {
    const label = editorUiHeaderLabel({
      title: "Procedural Sanctuary Preview",
      hash: "597c02deadbeef",
      mapWidth: 400,
      mapHeight: 400,
      revision: 12,
      validationErrors: 0,
      procedural: {
        seedLabel: "2098878576",
        generatorVersion: 3,
        generatedChunkCount: 25,
      },
    } as never);
    expect(label).toBe(
      "Procedural Sanctuary / SEED 2098878576 / V3 / 25 CHUNKS GENERATED / R12 / E0",
    );
    expect(label).not.toContain("SIGNED CHUNK WORLD");
  });

  it('makes live player-state connectivity and homestead count explicit', () => {
    const base = {
      title: 'Live Island', hash: '904247abcdef', mapWidth: 832, mapHeight: 832,
      revision: 10, validationErrors: 0, procedural: null,
      live: {
        supported: true, connected: false, synchronizing: false,
        worldSynchronized: false, homesteadCount: 0, publishing: false,
        canPublish: false, remoteRevision: null, dirty: false, error: null,
      },
    };
    expect(editorUiHeaderLabel(base as never)).toContain('LIVE OFFLINE');
    expect(editorUiHeaderLabel({
      ...base,
      live: {
        ...base.live, connected: true, worldSynchronized: true,
        homesteadCount: 3, remoteRevision: 10,
      },
    } as never)).toContain('LIVE R10 / 3 HOMES');
  });

  it("reserves the scaled drawers and exposes bounded overflow", () => {
    expect(editorUiDrawerAt(200, 1_280)).toBe("left");
    expect(editorUiDrawerAt(1_000, 1_280)).toBe("right");
    expect(editorUiDrawerAt(500, 1_280)).toBeNull();
    expect(editorUiScrollLimit("left", 600)).toBeGreaterThan(0);
    expect(editorUiScrollLimit("left", 600, true)).toBeLessThan(
      editorUiScrollLimit("left", 600),
    );
    expect(editorUiScrollLimit("right", 600)).toBeGreaterThan(0);
    expect(editorUiScrollLimit("left", 1_080, true)).toBe(0);
    expect(editorUiScrollLimit("left", 1_080, true, true)).toBeGreaterThan(200);
    expect(editorUiScrollLimit("right", 1_080)).toBeGreaterThanOrEqual(150);
    expect(editorUiScrollLimit("right", 1_080, false, false, 'objects', 0, 0)).toBeGreaterThan(0);
    expect(editorUiScrollLimit("right", 1_080, false, false, 'objects', 0, null, false)).toBe(0);
    const scrollbar = editorUiScrollbarConfig('left', 1_280, 600, false, false, 'objects', 60);
    expect(scrollbar.bounds.width).toBe(14);
    expect(scrollbar.bounds.height).toBeGreaterThan(100);
    expect(scrollbar.totalRows).toBeGreaterThan(scrollbar.visibleRows);
  });
});
