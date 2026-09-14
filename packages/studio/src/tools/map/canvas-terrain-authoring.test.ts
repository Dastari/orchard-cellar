import {
  bootstrapTilesetDefinitions,
  contentDefinitionRowsHash,
  createLiveIslandMapDocument,
  mapDocumentV3Hash,
  serializeMapDocumentV3,
  type TilesetContentDefinition,
} from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/index.js';
import { buildMapCanvasTool } from './canvas.js';
import type { MapEditorController } from './editor-controller.js';
import type { MapEditorModel } from './model.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 270, height: 720 });
const WORKSPACE = Object.freeze({ x: 300, y: 20, width: 820, height: 720 });
const INSPECTOR = Object.freeze({ x: 1140, y: 20, width: 286, height: 720 });

async function context(): Promise<StudioCanvasToolContext> {
  const document = createLiveIslandMapDocument();
  const definitions = bootstrapTilesetDefinitions().map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    slug: definition.familyId,
    json: JSON.stringify(definition),
  }));
  const view: StudioConnectionView = {
    connected: true, synchronizing: false, identity: 'terrain-author', role: 'admin',
    contentRevision: 1n,
    contentHead: {
      revision: 1n,
      contentHash: contentDefinitionRowsHash(definitions),
      definitionCount: definitions.length,
    } as never,
    contentDefinitions: definitions as never,
    mapRevision: document.revision,
    mapDocument: {
      mapId: document.id, revision: document.revision,
      contentHash: mapDocumentV3Hash(document), documentJson: serializeMapDocumentV3(document),
    },
    publishingMap: false, worldMutating: false, error: null,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
  };
  const adapter: StudioLiveAdapter = {
    view: () => view,
    connect: () => undefined,
    disconnect: () => undefined,
    publishMap: async () => undefined,
  };
  const controller = new StudioShellController(async () => adapter, null);
  controller.chooseEnvironment('production');
  await controller.connectExplicit();
  expect(controller.navigate('/build/map/terrain-lab')).toBe(true);
  return {
    controlsBounds: CONTROLS,
    workspaceBounds: WORKSPACE,
    inspectorBounds: INSPECTOR,
    bounds: WORKSPACE,
    route: controller.activeRoute(),
    controller,
    invalidate: vi.fn(),
  };
}

async function mutableLiveContext(initial: readonly TilesetContentDefinition[]): Promise<{
  readonly canvasContext: StudioCanvasToolContext;
  readonly setDefinitions: (
    definitions: readonly TilesetContentDefinition[], revision: bigint, contentHash: string,
  ) => void;
}> {
  const document = createLiveIslandMapDocument();
  const viewFor = (
    definitions: readonly TilesetContentDefinition[], revision: bigint, contentHash: string,
  ): StudioConnectionView => {
    const rows = definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definition.familyId,
      json: JSON.stringify(definition),
    }));
    return {
      connected: true, synchronizing: false, identity: 'terrain-author', role: 'admin',
      contentRevision: revision,
      contentHead: { revision, contentHash, definitionCount: rows.length } as never,
      contentDefinitions: rows as never,
      mapRevision: document.revision,
      mapDocument: {
        mapId: document.id, revision: document.revision,
        contentHash: mapDocumentV3Hash(document), documentJson: serializeMapDocumentV3(document),
      },
      publishingMap: false, worldMutating: false, error: null,
      rows: { placeables: [], npcs: [], homesteads: [], players: [] },
    };
  };
  const hashFor = (definitions: readonly TilesetContentDefinition[]): string => contentDefinitionRowsHash(
    definitions.map((definition) => ({ id: definition.id, kind: definition.kind,
      slug: definition.familyId, json: JSON.stringify(definition) })),
  );
  let view = viewFor(initial, 1n, hashFor(initial));
  const adapter: StudioLiveAdapter = {
    view: () => view,
    connect: () => undefined,
    disconnect: () => undefined,
    publishMap: async () => undefined,
  };
  const controller = new StudioShellController(async () => adapter, null);
  controller.chooseEnvironment('production');
  await controller.connectExplicit();
  expect(controller.navigate('/build/map/terrain-lab')).toBe(true);
  return {
    canvasContext: {
      controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR,
      bounds: WORKSPACE, route: controller.activeRoute(), controller, invalidate: vi.fn(),
    },
    setDefinitions: (definitions, revision, contentHash) => {
      view = viewFor(definitions, revision, contentHash);
    },
  };
}

function action(surface: StudioCanvasToolSurface, id: string) {
  const found = surface.actions.find((candidate) => candidate.id === id);
  expect(found, `missing Canvas action ${id}; have ${surface.actions.map(({ id: candidate }) => candidate).join(', ')}`)
    .toBeDefined();
  return found!;
}

async function surfaceWithTerrainSelection(
  canvasContext: StudioCanvasToolContext,
): Promise<StudioCanvasToolSurface> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const surface = buildMapCanvasTool(canvasContext);
    if (surface.actions.some(({ id }) => id === 'map-selection-terrain-apply-current')) return surface;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Terrain selection drawer did not receive its worker terrain');
}

describe('Map Canvas terrain authoring', () => {
  it('mounts compact searchable Canvas modes with an explicit dry farmland warning', async () => {
    const canvasContext = await context();
    let surface = buildMapCanvasTool(canvasContext);
    const modeIds = [
      'map-terrain-mode-brush',
      'map-terrain-mode-surface_family',
      'map-terrain-mode-cliff_family',
      'map-terrain-mode-exact_override',
      'map-terrain-mode-farmland_visual',
    ];
    for (const id of modeIds) {
      expect(action(surface, id).bounds).toMatchObject({ height: 40 });
    }
    expect(action(surface, 'map-terrain-tool-dirt').label).toContain('Dirt');

    action(surface, 'map-terrain-mode-farmland_visual').activate();
    surface = buildMapCanvasTool(canvasContext);
    expect(action(surface, 'map-terrain-farmland-visual')).toMatchObject({
      disabled: false,
      label: 'Farmland · Visual — dry appearance only; wet soil and crops remain runtime authority',
    });

    const state = canvasContext.controller.toolState('map-canvas:terrain-lab', () => null) as unknown as {
      readonly model: MapEditorModel;
    };
    state.model.toggleLayer('terrain');
    surface = buildMapCanvasTool(canvasContext);
    expect(action(surface, 'map-terrain-farmland-visual').disabled).toBe(true);
  });

  it('provides current/default/inherit/exact selection actions and gates mutations to Terrain', async () => {
    const canvasContext = await context();
    buildMapCanvasTool(canvasContext);
    const state = canvasContext.controller.toolState('map-canvas:terrain-lab', () => null) as unknown as {
      readonly model: MapEditorModel;
      readonly interaction: MapEditorController;
    };
    state.model.selectTile(20, 20);
    state.interaction.selectSurfaceFamily('grass_3');
    let surface = await surfaceWithTerrainSelection(canvasContext);
    const ids = [
      'map-selection-terrain-apply-current',
      'map-selection-terrain-use-default',
      'map-selection-terrain-apply-default',
      'map-selection-terrain-inherit',
      'map-selection-terrain-apply-exact',
      'map-selection-terrain-clear',
    ];
    for (const id of ids) expect(action(surface, id).bounds.height).toBe(40);

    const before = state.model.document();
    action(surface, 'map-selection-terrain-apply-current').activate();
    expect(state.model.document().cells['20,20']?.surfaceFamily).toBe('grass_3');
    expect(state.model.document().revision).toBe(before.revision + 1);
    state.model.undo();
    expect(state.model.document()).toBe(before);

    state.model.toggleLayer('terrain');
    surface = await surfaceWithTerrainSelection(canvasContext);
    for (const id of ids.filter((id) => id !== 'map-selection-terrain-use-default')) {
      expect(action(surface, id).disabled).toBe(true);
    }
    expect(action(surface, 'map-selection-terrain-use-default').disabled).toBe(false);
  });

  it('refreshes the retained palette from each verified live content head without bootstrap fallback', async () => {
    const source = bootstrapTilesetDefinitions().find(({ familyId }) => familyId === 'stone_1')!;
    const renamed = (familyId: string): TilesetContentDefinition => ({
      ...source, id: `tileset:${familyId}`, familyId,
    });
    const live = await mutableLiveContext([renamed('orchard_moss')]);
    let surface = buildMapCanvasTool(live.canvasContext);
    action(surface, 'map-terrain-mode-cliff_family').activate();
    surface = buildMapCanvasTool(live.canvasContext);
    expect(action(surface, 'map-terrain-cliff-orchard_moss')).toBeDefined();
    expect(surface.actions.some(({ id }) => id === 'map-terrain-cliff-stone_1')).toBe(false);

    const moonstone = [renamed('moonstone')];
    live.setDefinitions(moonstone, 2n, contentDefinitionRowsHash(moonstone.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definition.familyId,
      json: JSON.stringify(definition),
    }))));
    surface = buildMapCanvasTool(live.canvasContext);
    expect(action(surface, 'map-terrain-cliff-moonstone')).toBeDefined();
    expect(surface.actions.some(({ id }) => id === 'map-terrain-cliff-orchard_moss')).toBe(false);

    const retired = [{ ...renamed('stone_1'), retired: true }];
    live.setDefinitions(retired, 3n, contentDefinitionRowsHash(retired.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definition.familyId,
      json: JSON.stringify(definition),
    }))));
    surface = buildMapCanvasTool(live.canvasContext);
    expect(surface.actions.some(({ id }) => id.startsWith('map-terrain-cliff-'))).toBe(false);
  });
});
