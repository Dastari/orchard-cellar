import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LoadedAsset, StudioSpatialArt, UiRect } from '@orchard/ui/studio';
import type { OverworldArt, TerrainArray } from '@orchard/engine';
const fixture = vi.hoisted(() => ({ asset: null as LoadedAsset | null }));
vi.mock('@orchard/ui', async original => ({ ...await original<typeof import('@orchard/ui')>(), loadGeneratedAsset: async () => fixture.asset }));
vi.mock('@orchard/ui/studio', async original => ({ ...await original<typeof import('@orchard/ui/studio')>(), loadGeneratedAsset: async () => fixture.asset }));
vi.mock('@orchard/engine', async original => {
  const engine = await original<typeof import('@orchard/engine')>();
  return { ...engine, sortWorldDepthItems: vi.fn(engine.sortWorldDepthItems),
  terrainProjectedDepthAtFoot: () => 0, terrainProjectedElevationAtFoot: () => 0, terrainElevationAtWorldFoot: () => 0,
  loadMapEditorArt: async () => ({}),
  };
});
import { preloadLiveMapObjectAssets, sortWorldDepthItems } from '@orchard/engine';
import { bootstrapContentRegistry, createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2,
  normalizeMapDocumentV3, mapDocumentV3Hash, serializeMapDocumentV3, STREETLAMP_DEFINITION, STREETLAMP_ID_BASE, type MapDocumentV3 } from '@orchard/sim';
import { MapEditorRenderer } from './editor-renderer.js';
import { MapEditorController, pickTopmostVisibleMapEntity, type MapEditorLiveMarker } from './editor-controller.js';
import { MapEditorModel } from './model.js';
import { StudioInspectorKernel, StudioNotifications, StudioSelectionBus, StudioValidationPanel, type StudioLiveAdapter } from '../../shell/index.js';

const prefab = { ...createMapPrefabDocument({ id: 'local-lamp', title: 'Local lamp', width: 1, height: 1 }),
  pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0660 }],
  placements: [{ id: 'lamp', assetId: 107981891, assetName: 'prop_cf_hearth_streetlamp', tileX: 0, tileY: 0, elevation: 0,
    layer: 'object' as const, quarterTurns: 0 as const, flipX: false, visual: { kind: 'variant' as const, name: 'base', frameIndex: 0 } }] };
const published = normalizeMapDocumentV3({ ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'live-island', title: 'BUG010', width: 64, height: 64 })),
  revision: 12, landmarks: [], prefabs: [prefab], objects: [{ id: 'authored-lamp', prefabId: prefab.id, prefabRevision: prefab.revision,
    tileX: 20, tileY: 24, elevation: 0, layer: 'objects', enabled: true, quarterTurns: 0, flipX: false }] });
const id = STREETLAMP_ID_BASE + BigInt(24 * 512 + 20);
const registry = bootstrapContentRegistry();
const camera = { x: 250, y: 280, zoom: 1 }, viewport = { x: 0, y: 0, width: 480, height: 220 };
const rows = (lit: boolean) => ({ placeables: [{ id, spaceId: 0, kind: 'hearth_streetlamp', definitionId: STREETLAMP_DEFINITION,
  ownerIdentity: 'local-world', tileX: 20, tileY: 24, lit, state: { mode: lit ? 'on' : 'off', lit } }],
  chests: [], homesteads: [], players: [], npcs: [], resources: [], combatTargets: [], surfaces: [] });

interface RendererInternals {
  ensureLiveObjectAsset(name: string): void;
  drawDetailed(context: CanvasRenderingContext2D, art: OverworldArt, terrain: TerrainArray, document: MapDocumentV3,
    model: MapEditorModel, interaction: MapEditorController, viewport: UiRect, viewCamera: typeof camera,
    detailedTerrain: null, drawPrefabs: boolean, drawLiveArtwork: boolean): void;
  terrainFor(): TerrainArray | null;
  detailedArt(art: StudioSpatialArt): OverworldArt | null;
  drawSelectedSilhouette(context: CanvasRenderingContext2D, model: MapEditorModel, interaction: MapEditorController,
    terrain: TerrainArray, viewport: UiRect, viewCamera: typeof camera, document: MapDocumentV3): void;
}
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeAll(async () => {
  // Real native Canvas drawing; only the art bytes and flat terrain are fixtures.
  const sprite = createCanvas(32, 48), ink = sprite.getContext('2d');
  ink.fillStyle = '#796b50'; ink.fillRect(6, 2, 4, 46); ink.fillRect(2, 2, 12, 9);
  ink.fillStyle = '#cfbb72'; ink.fillRect(22, 2, 4, 46); ink.fillStyle = '#ffe96b'; ink.fillRect(18, 2, 12, 9);
  const base = { x: 0, y: 0, width: 16, height: 48, durationTicks: 1 }, on = { ...base, x: 16 };
  fixture.asset = { assetId: 107981891, name: 'prop_cf_hearth_streetlamp', image: sprite as unknown as CanvasImageSource,
    anchor: [8, 47], collision: [], tags: [], atlasRevision: 1,
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    metadata: { image: 'local.png', animations: { base: [base], on: [on] }, states: { base, on } } };
  await preloadLiveMapObjectAssets(published);
});

async function harness(lit = true) {
  const live = { view: () => ({ connected: true, mapRevision: 12, mapDocument: { mapId: 'live-island', revision: 12,
    contentHash: mapDocumentV3Hash(published), documentJson: serializeMapDocumentV3(published) } }) } as StudioLiveAdapter;
  const model = new MapEditorModel('live-island', { selection: new StudioSelectionBus(), inspector: new StudioInspectorKernel(),
    validation: new StudioValidationPanel(), notifications: new StudioNotifications(), live: () => live }, null);
  model.reconcileLiveHead();
  const renderer = new MapEditorRenderer(() => {}), internal = renderer as unknown as RendererInternals;
  renderer.setLiveContent('fixture', registry); internal.ensureLiveObjectAsset('prop_cf_hearth_streetlamp');
  await Promise.resolve(); await Promise.resolve();
  const controller = new MapEditorController(model); controller.setLiveRows(rows(lit), registry);
  cleanup.push(() => { controller.dispose(); renderer.dispose(); model.dispose(); });
  const render = (document = model.document(), markers: readonly MapEditorLiveMarker[] = controller.liveMarkers()) => {
    const canvas = createCanvas(480, 220), context = canvas.getContext('2d');
    context.fillStyle = '#283e37'; context.fillRect(0, 0, 480, 220);
    const calls: { sourceX: number; x: number; y: number; width: number; height: number }[] = [];
    const original = context.drawImage.bind(context);
    context.drawImage = ((...args: Parameters<typeof context.drawImage>) => {
      const transform = context.getTransform();
      const dx = Number(args[5]), dy = Number(args[6]);
      calls.push({ sourceX: Number(args[1]), x: transform.a * dx + transform.c * dy + transform.e,
        y: transform.b * dx + transform.d * dy + transform.f, width: Number(args[7]), height: Number(args[8]) });
      return original(...args);
    }) as typeof context.drawImage;
    internal.drawDetailed(context as unknown as CanvasRenderingContext2D, {} as OverworldArt, {} as TerrainArray,
      document, model, { liveMarkers: () => markers } as MapEditorController, viewport, camera, null, true, true);
    return { calls, canvas };
  };
  return { model, controller, renderer, internal, render };
}

describe('BUG-010 actual lamp rendering and picking', () => {
  it('draws one authoritative on/off sprite and retains authored selection through a dirty move', async () => {
    const { model, controller, render } = await harness();
    const on = render();
    expect(on.calls).toEqual([{ sourceX: 16, x: 70, y: 73, width: 16, height: 48 }]);
    const beforePick = pickTopmostVisibleMapEntity(model.document(), controller.liveMarkers(), () => true, 20, 24, model.publishedDocument());
    expect(beforePick).toMatchObject({ kind: 'object', id: 'authored-lamp' });
    model.moveObject('authored-lamp', 26, 24);
    expect(model.dirty()).toBe(true);
    const moved = render();
    expect(moved.calls).toEqual([{ sourceX: 16, x: 166, y: 73, width: 16, height: 48 }]);
    expect(pickTopmostVisibleMapEntity(model.document(), controller.liveMarkers(), () => true, 20, 24, model.publishedDocument())).toBeNull();
    expect(pickTopmostVisibleMapEntity(model.document(), controller.liveMarkers(), () => true, 26, 24, model.publishedDocument()))
      .toMatchObject({ kind: 'object', id: 'authored-lamp' });
    controller.setLiveRows(rows(false), registry);
    expect(render().calls).toEqual([{ sourceX: 0, x: 166, y: 73, width: 16, height: 48 }]);
    model.moveObject('authored-lamp', 20, 24); // Its own authority row cannot block moving back.
    expect(model.document().objects[0]!.tileX).toBe(20);
    expect(model.document().objects).toHaveLength(1); expect(controller.liveMarkers()).toHaveLength(1);
    if (process.env['ORCHARD_LAMP_EVIDENCE']) {
      const path = process.env['ORCHARD_LAMP_EVIDENCE']; mkdirSync(path, { recursive: true });
      writeFileSync(`${path}/fixed-on.png`, on.canvas.toBuffer('image/png'));
      writeFileSync(`${path}/fixed-moved.png`, moved.canvas.toBuffer('image/png'));
      writeFileSync(`${path}/fixed-draws.json`, JSON.stringify({ on: on.calls, moved: moved.calls }, null, 2));
    }
  });

  it('uses the same association at drag-preview positions and hides the pair with its authored layer', async () => {
    const { model, render } = await harness();
    const preview = { ...model.document(), objects: [{ ...model.document().objects[0]!, tileX: 30 }] };
    expect(render(preview).calls).toEqual([{ sourceX: 16, x: 230, y: 73, width: 16, height: 48 }]);
    expect(model.document().objects[0]!.tileX).toBe(20);
    const ground = { ...preview, objects: [{ ...preview.objects[0]!, layer: 'ground' as const }] };
    expect(render(ground).calls).toHaveLength(1);
    const sorted = vi.mocked(sortWorldDepthItems).mock.calls.at(-1)![0];
    expect(sorted).toHaveLength(1); expect(sorted[0]!.depthPhase).toBe('surface');
    model.toggleLayer('objects'); expect(render(preview).calls).toEqual([]);
  });

  it('re-enables its own disabled lamp while retaining unrelated live occupancy restrictions', async () => {
    const { model, controller } = await harness();
    const object = model.document().objects[0]!;
    expect(model.placeObject({ ...object, enabled: false })).toBe(true);
    expect(model.placeObject(object)).toBe(true);
    expect(model.document().objects[0]!.enabled).toBe(true);
    expect(model.placeObject({ ...object, enabled: false })).toBe(true);
    const live = rows(true);
    controller.setLiveRows({ ...live, placeables: [...live.placeables, { ...live.placeables[0]!, id: 555n }] }, registry);
    expect(model.placeObject(object)).toBe(false);
    expect(model.document().objects[0]!.enabled).toBe(false);
  });

  it('keeps authored artwork while a live asset is missing and during offline preview', async () => {
    const { renderer, model, render } = await harness();
    renderer.setLiveContent('loading', registry);
    expect(render().calls).toHaveLength(1); // Promise has not loaded the live sprite yet.
    expect(render(model.document(), []).calls).toHaveLength(1);
    await Promise.resolve(); await Promise.resolve();
    expect(render().calls).toEqual([{ sourceX: 16, x: 70, y: 73, width: 16, height: 48 }]);
  });

  it('retains one live fallback for disabled/deleted authored lamps and preserves unbound rows', async () => {
    const { model, render, controller } = await harness();
    model.placeObject({ ...model.document().objects[0]!, enabled: false });
    expect(render().calls).toHaveLength(1);
    model.removeObject('authored-lamp'); expect(render().calls).toHaveLength(1);
    expect(render(model.document(), []).calls).toHaveLength(0);
    const unbound = [{ ...controller.liveMarkers()[0]!, id: String(id + 1n), tileX: 21, worldX: 344 }];
    expect(render(published, unbound).calls).toHaveLength(2);
  });

  it('falls back when the live sprite has no frame for its authoritative state', async () => {
    const { renderer, internal, render } = await harness();
    const complete = fixture.asset!;
    fixture.asset = { ...complete, metadata: { ...complete.metadata,
      animations: { base: complete.metadata.animations['base']! }, states: {} } };
    try {
      renderer.setLiveContent('missing-on-frame', registry); internal.ensureLiveObjectAsset('prop_cf_hearth_streetlamp');
      await Promise.resolve(); await Promise.resolve();
      expect(render().calls).toEqual([{ sourceX: 0, x: 70, y: 73, width: 16, height: 48 }]);
    } finally { fixture.asset = complete; }
  });

  it('uses the authoritative frame and preview position in the selected silhouette', async () => {
    const { model, internal, controller } = await harness();
    const masks: Canvas[] = [];
    vi.stubGlobal('document', { createElement: () => { const canvas = createCanvas(1, 1); masks.push(canvas); return canvas; } });
    internal.detailedArt({} as StudioSpatialArt); await Promise.resolve(); await Promise.resolve();
    model.selectObject('authored-lamp');
    const output = createCanvas(480, 220), context = output.getContext('2d');
    const composite = vi.spyOn(context, 'drawImage');
    const preview = { ...model.document(), objects: [{ ...model.document().objects[0]!, tileX: 30 }] };
    internal.drawSelectedSilhouette(context as unknown as CanvasRenderingContext2D, model, controller,
      {} as TerrainArray, viewport, camera, preview);
    expect(composite).toHaveBeenCalledOnce();
    const pixels = masks[0]!.getContext('2d');
    expect(pixels.getImageData(236, 80, 1, 1).data[3]).toBeGreaterThan(0);
    expect(pixels.getImageData(76, 80, 1, 1).data[3]).toBe(0);
  });

  it('draws only one overview marker, including disabled authored fallback', async () => {
    const { model, renderer, internal, controller } = await harness();
    vi.spyOn(internal, 'terrainFor').mockReturnValue(null);
    vi.spyOn(internal, 'detailedArt').mockReturnValue(null);
    const canvas = createCanvas(480, 220), context = canvas.getContext('2d');
    const fills = vi.spyOn(context, 'fillRect');
    const draw = (drag = false) => {
      fills.mockClear();
      const interaction = { liveMarkers: () => controller.liveMarkers(), snapshot: () => ({ ...controller.snapshot(),
        camera, viewport, dragDestination: drag ? { kind: 'object', id: 'authored-lamp', tileX: 30, tileY: 24, elevation: 0 } : null }) } as MapEditorController;
      renderer.draw(context as unknown as CanvasRenderingContext2D, model, interaction, false, {} as StudioSpatialArt);
      // Ignore the viewport background; each marker is a small square.
      return fills.mock.calls.filter(([, , width, height]) => width < 30 && height < 30);
    };
    expect(draw()).toHaveLength(1);
    const dragMarker = draw(true);
    expect(dragMarker).toHaveLength(1); expect(dragMarker[0]![0]).toBeGreaterThan(200);
    expect(model.document().objects[0]!.tileX).toBe(20);
    model.placeObject({ ...model.document().objects[0]!, enabled: false });
    expect(draw()).toHaveLength(1);
    model.toggleLayer('objects'); expect(draw()).toHaveLength(0);
  });
});
