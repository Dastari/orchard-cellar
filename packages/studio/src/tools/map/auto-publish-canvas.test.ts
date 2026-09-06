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
import { MAP_AUTO_PUBLISH_DEBOUNCE_MS } from './auto-publish.js';
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
  it('is off by default, exposes status, and publishes only the latest quiet edit', async () => {
    vi.useFakeTimers();
    const { context, retained, publishMap } = await harness();
    retained.model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    let surface = buildMapCanvasTool(context);
    expect(retained.autoPublishEnabled).toBe(false);
    expect(surface.nodes.find(({ id }) => id === 'map-auto-publish')).toMatchObject({
      symbol: 'cloudConnect', state: 'idle', label: undefined,
    });
    expect(surface.actions.find(({ id }) => id === 'map-auto-publish')?.label)
      .toContain('AUTO PUBLISH OFF');
    expect(surface.nodes.find(({ id }) => id === 'map-map-stats')?.label).toContain('AUTO OFF');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishMap).not.toHaveBeenCalled();

    surface.actions.find(({ id }) => id === 'map-auto-publish')?.activate();
    surface = buildMapCanvasTool(context);
    expect(surface.nodes.find(({ id }) => id === 'map-auto-publish')?.state).toBe('active');
    expect(surface.actions.find(({ id }) => id === 'map-auto-publish')?.label)
      .toContain('250 ms');
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS - 1);
    retained.model.paintBiome([{ tileX: 401, tileY: 400 }], 'forest');
    buildMapCanvasTool(context);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS - 1);
    expect(publishMap).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(publishMap).toHaveBeenCalledTimes(1);
    expect(publishMap.mock.calls[0]?.[2]).toBe(7);
  });

  it('routes manual publish through the same gate while automatic mode remains off', async () => {
    const { context, retained, publishMap } = await harness();
    retained.model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const surface = buildMapCanvasTool(context);
    expect(surface.actions.find(({ id }) => id === 'map-publish')).toMatchObject({ disabled: false });
    surface.actions.find(({ id }) => id === 'map-publish')?.activate();
    await vi.waitFor(() => expect(publishMap).toHaveBeenCalledTimes(1));
    expect(retained.autoPublishEnabled).toBe(false);
  });

  it('cancels a pending automatic publication when the retained route is disposed', async () => {
    vi.useFakeTimers();
    const { context, retained, publishMap } = await harness();
    retained.model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    let surface = buildMapCanvasTool(context);
    surface.actions.find(({ id }) => id === 'map-auto-publish')?.activate();
    surface = buildMapCanvasTool(context);
    surface.lifecycle?.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishMap).not.toHaveBeenCalled();
  });
});
