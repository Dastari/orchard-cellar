import { kitElement, kitElements, pressKit } from '../kit-test-driver.js';
import {
  createLiveIslandMapDocument,
  mapDocumentV3Hash,
  normalizeMapDocumentV3,
  serializeMapDocumentV3,
  type MapDocumentV3,
} from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/index.js';
import { MapEditorModel } from './model.js';
import { buildMapCanvasTool, mapEditorPublishPresentation } from './canvas.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 206, height: 620 });
const WORKSPACE = Object.freeze({ x: 300, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1140, y: 20, width: 260, height: 620 });

function connectionView(document: MapDocumentV3): StudioConnectionView {
  return {
    connected: true, synchronizing: false, identity: 'author', role: 'admin',
    contentRevision: null, mapRevision: document.revision,
    mapDocument: {
      mapId: document.id, revision: document.revision,
      contentHash: mapDocumentV3Hash(document), documentJson: serializeMapDocumentV3(document),
    },
    publishingMap: false, worldMutating: false, error: null,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
  };
}

async function connectedContext(
  view: () => StudioConnectionView,
): Promise<StudioCanvasToolContext> {
  const adapter: StudioLiveAdapter = {
    view,
    connect: () => undefined,
    disconnect: () => undefined,
    publishMap: async () => undefined,
  };
  const controller = new StudioShellController(async () => adapter, null);
  controller.chooseEnvironment('production');
  await controller.connectExplicit();
  expect(controller.navigate('/build/map')).toBe(true);
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

describe('Map Editor publish state', () => {
  it('gives every compact command state a precise disabled or enabled reason', () => {
    const base = {
      dirty: true, publishing: false, conflictRevision: null, baseRevision: 7,
      validation: 'ready' as const,
      connected: true, synchronizing: false, authorized: true, publishAvailable: true,
    } as const;
    expect(mapEditorPublishPresentation({ ...base, dirty: false })).toMatchObject({
      state: 'CLEAN', disabled: true, tooltip: 'CLEAN — No unpublished map changes', icon: 'save',
    });
    expect(mapEditorPublishPresentation(base)).toMatchObject({
      state: 'DIRTY', disabled: false,
      tooltip: 'DIRTY — Publish local changes against live revision 7', icon: 'cloudPublish',
    });
    expect(mapEditorPublishPresentation({ ...base, publishing: true })).toMatchObject({
      state: 'PUBLISHING', disabled: true, tooltip: 'PUBLISHING — Waiting for live authority',
    });
    expect(mapEditorPublishPresentation({ ...base, conflictRevision: 8 })).toMatchObject({
      state: 'CONFLICT', disabled: true,
      tooltip: 'CONFLICT — Live revision 8 changed; reload latest or keep this local draft',
    });
    expect(mapEditorPublishPresentation({ ...base, connected: false })).toMatchObject({
      state: 'DIRTY', disabled: true, tooltip: 'DIRTY — Connect to the live world to publish',
    });
    expect(mapEditorPublishPresentation({ ...base, authorized: false })).toMatchObject({
      state: 'DIRTY', disabled: true, tooltip: 'DIRTY — Map publish permission is required',
    });
    expect(mapEditorPublishPresentation({ ...base, publishAvailable: false })).toMatchObject({
      state: 'DIRTY', disabled: true, tooltip: 'DIRTY — Live map publishing is unavailable',
    });
    expect(mapEditorPublishPresentation({ ...base, validation: 'pending' })).toMatchObject({
      state: 'DIRTY', disabled: true, tooltip: 'DIRTY — Wait for map validation to finish',
    });
    expect(mapEditorPublishPresentation({ ...base, validation: 'invalid' })).toMatchObject({
      state: 'DIRTY', disabled: true, tone: 'danger',
      tooltip: 'DIRTY — Resolve blocking map validation errors before publishing',
    });
  });

  it('keeps a conflicting draft until an explicit Canvas action resolves or dismisses it', async () => {
    const revisionSeven = normalizeMapDocumentV3({
      ...createLiveIslandMapDocument(), revision: 7, title: 'Revision seven',
    });
    let liveView = connectionView(revisionSeven);
    const context = await connectedContext(() => liveView);
    buildMapCanvasTool(context);
    const retained = context.controller.toolState('map-canvas:live-island', () => null) as unknown as {
      readonly model: MapEditorModel;
    };
    retained.model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const localHash = mapDocumentV3Hash(retained.model.document());

    const revisionEight = normalizeMapDocumentV3({
      ...revisionSeven, revision: 8, title: 'Revision eight',
    });
    liveView = connectionView(revisionEight);
    let surface = buildMapCanvasTool(context);
    expect(mapDocumentV3Hash(retained.model.document())).toBe(localHash);
    expect(kitElement(surface, 'map-publish-conflict-ribbon')).toMatchObject({
      kind: 'text', label: 'MAP CONFLICT · LIVE R8',
    });
    expect(kitElement(surface, 'map-publish')).toMatchObject({
      disabled: true,
      label: 'CONFLICT — Live revision 8 changed; reload latest or keep this local draft',
    });
    expect(kitElement(surface, 'map-publish-conflict-export')).toMatchObject({
      disabled: false,
      label: 'Export local draft',
    });
    pressKit(surface, 'map-publish-conflict-export');
    expect(context.controller.notifications.items().at(-1)).toMatchObject({
      kind: 'error', title: 'Map export unavailable',
    });

    pressKit(surface, 'map-publish-conflict-keep-local');
    surface = buildMapCanvasTool(context);
    expect(kitElements(surface).some(({ id }) => id === 'map-publish-conflict-panel')).toBe(false);
    expect(mapDocumentV3Hash(retained.model.document())).toBe(localHash);
    expect(retained.model.conflictRevision()).toBe(8);

    const revisionNine = normalizeMapDocumentV3({
      ...revisionEight, revision: 9, title: 'Revision nine',
    });
    liveView = connectionView(revisionNine);
    surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-publish-conflict-ribbon')).toMatchObject({
      label: 'MAP CONFLICT · LIVE R9',
    });
    pressKit(surface, 'map-publish-conflict-reload');
    surface = buildMapCanvasTool(context);
    expect(retained.model.document().title).toBe('Revision nine');
    expect(retained.model.dirty()).toBe(false);
    expect(retained.model.conflictRevision()).toBeNull();
    expect(kitElement(surface, 'map-publish')).toMatchObject({
      disabled: true, label: 'CLEAN — No unpublished map changes',
    });
  });
});
