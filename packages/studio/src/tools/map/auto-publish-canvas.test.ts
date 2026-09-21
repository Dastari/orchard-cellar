import { kitElement, pressKit } from '../kit-test-driver.js';
import {
  createLiveIslandMapDocument,
  mapDocumentV3Hash,
  normalizeMapDocumentV3,
  serializeMapDocumentV3,
  type MapDocumentV3,
} from '@orchard/sim';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/index.js';
import { buildMapCanvasTool } from './canvas.js';
import type { MapEditorModel } from './model.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 206, height: 620 });
const WORKSPACE = Object.freeze({ x: 300, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1140, y: 20, width: 260, height: 620 });

function connectionView(document: MapDocumentV3): StudioConnectionView {
  return {
    connected: true, synchronizing: false, identity: 'author', role: 'admin',
    contentRevision: null, mapRevision: document.revision,
    mapDocument: { mapId: document.id, revision: document.revision,
      contentHash: mapDocumentV3Hash(document), documentJson: serializeMapDocumentV3(document) },
    publishingMap: false, worldMutating: false, error: null,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
  };
}

async function harness() {
  const live = normalizeMapDocumentV3({ ...createLiveIslandMapDocument(), revision: 7 });
  const publishMap = vi.fn(async (
    document: MapDocumentV3,
    documentJson: string,
    expectedRevision: number,
  ) => {
    void document;
    void documentJson;
    void expectedRevision;
  });
  const adapter: StudioLiveAdapter = {
    view: () => connectionView(live),
    connect: () => undefined,
    disconnect: () => undefined,
    publishMap,
  };
  const controller = new StudioShellController(async () => adapter, null);
  controller.chooseEnvironment('production');
  await controller.connectExplicit();
  expect(controller.navigate('/build/map')).toBe(true);
  const context: StudioCanvasToolContext = {
    controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR,
    bounds: WORKSPACE, route: controller.activeRoute(), controller, invalidate: vi.fn(),
  };
  buildMapCanvasTool(context);
  const retained = controller.toolState<{
    readonly model: MapEditorModel;
    readonly autoPublishEnabled: boolean;
  }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
  return { context, retained, publishMap };
}

afterEach(() => vi.useRealTimers());

describe('Map Canvas automatic publication', () => {
  it('keeps surrounding generation independent of live publication',async()=>{
 vi.useFakeTimers();const {context,retained,publishMap}=await harness();retained.model.paintBiome([{tileX:400,tileY:400}],'forest');
 let s=buildMapCanvasTool(context);expect(kitElement(s,'map-auto-publish')).toBeUndefined();expect(kitElement(s,'map-auto-generation')?.props['value']).toBe(true);
 pressKit(s,'map-auto-generation');s=buildMapCanvasTool(context);expect(kitElement(s,'map-auto-generation')?.props['value']).toBe(false);
 await vi.advanceTimersByTimeAsync(1000);expect(publishMap).not.toHaveBeenCalled();expect(retained.autoPublishEnabled).toBe(false);
});

  it('routes manual publish through the same gate while automatic mode remains off', async () => {
    const { context, retained, publishMap } = await harness();
    retained.model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-publish')).toMatchObject({ disabled: false });
    pressKit(surface, 'map-publish');
    await vi.waitFor(() => expect(publishMap).toHaveBeenCalledTimes(1));
    expect(retained.autoPublishEnabled).toBe(false);
  });

  it('does not publish when the route is disposed',async()=>{
 vi.useFakeTimers();const {context,retained,publishMap}=await harness();retained.model.paintBiome([{tileX:400,tileY:400}],'forest');buildMapCanvasTool(context).lifecycle?.dispose();await vi.advanceTimersByTimeAsync(1000);expect(publishMap).not.toHaveBeenCalled();
});
});
