import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLiveIslandMapDocument, mapDocumentV3Hash, normalizeMapDocumentV3, serializeMapDocumentV3 } from '@orchard/sim';
import { UiRoot, type UiElement, type UiKitArt } from '@orchard/ui/studio';
import { uiTestArt } from '../../../../ui/src/kit/lab/testing/art.js';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/index.js';
import type { LiveMapPublicationProgress } from '../../world-chunks/publication.js';
import { kitElement, pressKit } from '../kit-test-driver.js';
import { buildMapCanvasTool } from './canvas.js';
import type { MapEditorModel } from './model.js';

/**
 * Static world S7b-3: the publish button while a topside publication builds, checks, uploads and
 * commits its chunks. Set ORCHARD_STUDIO_PUBLISH_RENDERS=<dir> to write the owner-review renders.
 */
const CONTROLS = Object.freeze({ x: 10, y: 20, width: 206, height: 620 });
const WORKSPACE = Object.freeze({ x: 300, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1140, y: 20, width: 260, height: 620 });
let art: UiKitArt;

beforeAll(async () => {
  art = await uiTestArt();
  vi.stubGlobal('document', { hidden: false, createElement: () => createCanvas(1, 1) });
  vi.stubGlobal('requestAnimationFrame', () => 0); vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem() {}, removeItem() {} });
});
afterAll(() => vi.unstubAllGlobals());

const tree = (node: UiElement): UiElement[] => [node, ...node.children.flatMap(tree)];
const PHASES: readonly (readonly [string, LiveMapPublicationProgress | null, string])[] = [
  ['preparing', { phase: 'predicting' }, 'Preparing…'],
  ['building', { phase: 'materialising' }, 'Building chunks…'],
  ['checking', { phase: 'verifying' }, 'Checking chunks…'],
  ['uploading', { phase: 'uploading', done: 3, total: 12 }, 'Uploading 3/12…'],
  ['going-live', { phase: 'committing' }, 'Going live…'],
];

describe('Map Editor publish progress (static world S7b-3)', () => {
  it('labels the publish button with where the chunk publication is', async () => {
    const base = normalizeMapDocumentV3({ ...createLiveIslandMapDocument(), revision: 6 });
    let progress: LiveMapPublicationProgress | null = null;
    const view = (): StudioConnectionView => ({
      connected: true, synchronizing: false, identity: 'author', role: 'admin', contentRevision: null, mapRevision: 6,
      mapDocument: { mapId: base.id, revision: 6, contentHash: mapDocumentV3Hash(base), documentJson: serializeMapDocumentV3(base) },
      publishingMap: progress !== null, mapPublishProgress: progress, worldMutating: false, error: null,
      rows: { placeables: [], npcs: [], homesteads: [], players: [] },
    } as StudioConnectionView);
    const adapter: StudioLiveAdapter = { view, connect: () => undefined, disconnect: () => undefined, publishMap: () => new Promise<void>(() => undefined) };
    const controller = new StudioShellController(async () => adapter, null);
    controller.chooseEnvironment('production');
    await controller.connectExplicit();
    expect(controller.navigate('/build/map')).toBe(true);
    const context: StudioCanvasToolContext = { controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR, bounds: WORKSPACE,
      route: controller.activeRoute(), controller, invalidate: vi.fn() };
    buildMapCanvasTool(context);
    const model = (context.controller.toolState('map-canvas:live-island', () => null) as unknown as { model: MapEditorModel }).model;
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    pressKit(buildMapCanvasTool(context), 'map-publish');
    await vi.waitFor(() => expect(model.publishing()).toBe(true));
    const directory = process.env['ORCHARD_STUDIO_PUBLISH_RENDERS'];
    for (const [name, value, label] of PHASES) {
      progress = value;
      const surface = buildMapCanvasTool(context);
      const button = kitElement(surface, 'map-publish')!;
      expect(button.props['label'], name).toBe(label);
      if (directory) {
        // The controls column with the publish button: as drawn (top), then with its tooltip open (bottom).
        const region = Object.values(surface.kit ?? {}).find(node => node && tree(node).includes(button))!;
        const width = CONTROLS.width, height = 200, scale = 2;
        const root = new UiRoot({ art, scale, dpr: 1 }); root.resize(width * scale, height * scale, 1); root.mount(region); root.arrange();
        const frame = (): Canvas => {
          const layer = createCanvas(width * scale, height * scale), paint = layer.getContext('2d');
          paint.fillStyle = '#ffffff'; paint.fillRect(0, 0, width * scale, height * scale);
          root.draw(paint as unknown as CanvasRenderingContext2D, 0);
          return layer;
        };
        const drawn = frame();
        const tip = tree(region).find(element => element.kind === 'tooltip' && tree(element).includes(button));
        tip?.hooks.onFocus?.(true, tip, 'keyboard'); root.arrange();
        const hovered = frame();
        const image = createCanvas(width * scale, height * scale * 2), paint = image.getContext('2d');
        paint.drawImage(drawn, 0, 0); paint.drawImage(hovered, 0, height * scale);
        mkdirSync(directory, { recursive: true });
        writeFileSync(`${directory}/publish-${name}.png`, image.toBuffer('image/png'));
        root.unmount(region); root.dispose();
      }
    }
    model.dispose();
  });
});
