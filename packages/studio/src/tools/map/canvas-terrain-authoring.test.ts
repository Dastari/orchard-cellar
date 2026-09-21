import { kitElement, pressKit } from '../kit-test-driver.js';
import {
  bootstrapTilesetDefinitions,
  contentDefinitionRowsHash,
  createLiveIslandMapDocument,
  mapDocumentV3Hash,
  serializeMapDocumentV3,
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

async function surfaceWithTerrainSelection(
  canvasContext: StudioCanvasToolContext,
): Promise<StudioCanvasToolSurface> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const surface = buildMapCanvasTool(canvasContext);
    if (kitElement(surface, 'map-selection-terrain-apply-current')) return surface;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Terrain selection drawer did not receive its worker terrain');
}

describe('Map Canvas terrain authoring', () => {
  it('shows semantic materials and gates them when Terrain is hidden',async()=>{
 const c=await context();let s=buildMapCanvasTool(c);pressKit(s,'map-tool-terrain');s=buildMapCanvasTool(c);
 const choices=()=> (kitElement(s,'map-palette-list')!.props['items'] as {id:string;disabled:boolean}[][]).flat();
 expect(choices().some(x=>x.id==='map-material-farmland')).toBe(true);expect(choices().every(x=>!x.disabled)).toBe(true);
 pressKit(s,'map-layer-visible-terrain');s=buildMapCanvasTool(c);expect(choices().every(x=>x.disabled)).toBe(true);
});

  it('provides current/default/inherit/exact selection actions and gates mutations to Terrain', async () => {
    const canvasContext = await context();
    buildMapCanvasTool(canvasContext);
    const state = canvasContext.controller.toolState('map-canvas:terrain-lab', () => null) as unknown as {
      readonly model: MapEditorModel;
      readonly interaction: MapEditorController;
    };
    state.interaction.selectEditingTool('terrain');
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
    for (const id of ids) expect(kitElement(surface, id)).toMatchObject({kind:'button',focusable:true});

    const before = state.model.document();
    pressKit(surface, 'map-selection-terrain-apply-current');
    expect(state.model.document().cells['20,20']?.surfaceFamily).toBe('grass_3');
    expect(state.model.document().revision).toBe(before.revision + 1);
    state.model.undo();
    expect(state.model.document()).toBe(before);

    state.model.toggleLayer('terrain');
    surface = await surfaceWithTerrainSelection(canvasContext);
    for (const id of ids.filter((id) => id !== 'map-selection-terrain-use-default')) {
      expect(kitElement(surface, id)?.disabled).toBe(true);
    }
    expect(kitElement(surface, 'map-selection-terrain-use-default')?.disabled).toBe(false);
  });
});
