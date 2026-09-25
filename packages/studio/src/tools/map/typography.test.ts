import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UiRoot, ui, type CanvasTextEditor, type UiElement, type UiKitArt, type UiScale } from '@orchard/ui/studio';
import { uiTestArt } from '../../../../ui/src/kit/lab/testing/art.js';
import { StudioShellController } from '../../shell/controller.js';
import { StudioShellApp } from '../../shell/app.js';
import { StudioCanvasToolRegistry } from '../../shell/canvas-tool-registry.js';
import { registerBuiltinStudioCanvasTools } from '../../shell/builtin-canvas-tools.js';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { studioPropertyRow } from '../../shell/studio-models.js';
import { buildMapCanvasTool } from './canvas.js';
import { kitElement, kitElements, pressKit } from '../kit-test-driver.js';
import type { MapEditorController, MapEditorLiveMarker } from './editor-controller.js';
import type { MapEditorModel } from './model.js';
import type { MapEditorRenderer } from './editor-renderer.js';
import type { MapSchemaInspectorField } from './schema-inspector-actions.js';
import { cellFlags } from '@orchard/sim/cell-flags';

let art: UiKitArt;
const faces = new WeakMap<object, 'font_5x7' | 'font_8x12'>();
let glyphs: { face: string; width: number; height: number; character: string }[] = [];
const cleanups: (() => void)[] = [];
const evidence: { scenario: string; scale: number; dpr: number; width: number; glyphs: number }[] = [];

/** Follow both the original font atlas and its actual tinted copies. This
 * records real glyph draws, including draws inside retained bitmap caches. */
function canvas(width: number, height: number): Canvas {
  const result = createCanvas(width, height), context = result.getContext('2d');
  const original = context.drawImage.bind(context);
  context.drawImage = ((...args: Parameters<typeof context.drawImage>) => {
    const source = args[0], face = faces.get(source);
    if (face && args.length === 9) {
      const asset = face === 'font_5x7' ? art.pixel.font : art.pixel.headerFont;
      const metrics = asset.font!;
      if (args[3] === metrics.glyphSize[0] && args[4] === metrics.glyphSize[1]) {
        const index = Math.floor(Number(args[2]) / metrics.cellSize[1]) * metrics.columns
          + Math.floor(Number(args[1]) / metrics.cellSize[0]);
        glyphs.push({ face, width: Number(args[3]), height: Number(args[4]), character: metrics.charset[index] ?? '?' });
      } else if (Number(args[3]) === source.width && Number(args[4]) === source.height) faces.set(result, face);
    }
    return original(...args);
  }) as typeof context.drawImage;
  return result;
}

beforeAll(async () => {
  art = await uiTestArt();
  faces.set(art.pixel.font.image, 'font_5x7'); faces.set(art.pixel.headerFont.image, 'font_8x12');
  vi.stubGlobal('document', { hidden: false, createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`Unexpected typography fixture DOM: ${tag}`);
    return canvas(1, 1);
  } });
  vi.stubGlobal('requestAnimationFrame', () => 0); vi.stubGlobal('cancelAnimationFrame', () => {});
  // Local in-memory sessions only. No application draft or authority is read or written.
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Fixture has no remote assets', { status: 404 })));
});
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); });
afterAll(() => {
  const directory = process.env['ORCHARD_MAP_TYPOGRAPHY_EVIDENCE'];
  if (directory) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/glyph-coverage.json`, JSON.stringify(evidence, null, 2)); }
  vi.unstubAllGlobals();
});

const tree = (node: UiElement): UiElement[] => [node, ...node.children.flatMap(tree)];
const sizes = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const matrices = ([1, 2, 3] as const).flatMap(scale => [1, 1.25].flatMap(dpr => sizes.map(size => ({ scale, dpr, ...size }))));

function check(node: UiElement, scenario: string, options: { scale: UiScale; dpr: number; width: number; height: number }, expectedText?: string, tooltip = false): void {
  const { scale, dpr, width, height } = options;
  const root = new UiRoot({ art, scale, dpr }); root.resize(width, height, dpr); root.mount(node); root.arrange();
  if (tooltip) {
    const tip = tree(node).find(element => element.kind === 'tooltip');
    expect(tip, `${scenario} real tooltip`).toBeDefined();
    tip!.hooks.onFocus?.(true, tip!, 'keyboard'); root.arrange();
  }
  for (const element of tree(node)) expect(element.props['role'], `${scenario} ${element.id}`).not.toBe('special-heading');
  const image = canvas(Math.round(width * dpr), Math.round(height * dpr)); glyphs = [];
  root.draw(image.getContext('2d') as unknown as CanvasRenderingContext2D, 0);
  expect(glyphs.length, `${scenario} painted text`).toBeGreaterThan(0);
  expect(new Set(glyphs.map(glyph => `${glyph.face}:${glyph.width}x${glyph.height}`)), scenario).toEqual(new Set(['font_5x7:5x7']));
  if (expectedText) expect(glyphs.map(glyph => glyph.character).join(''), scenario).toContain(expectedText);
  evidence.push({ scenario, scale, dpr, width, glyphs: glyphs.length });
  const directory = process.env['ORCHARD_MAP_TYPOGRAPHY_EVIDENCE'];
  if (directory && scale === 2 && dpr === 1.25) {
    mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/${scenario.replaceAll(/[^a-z0-9]+/giu, '-')}-${width}.png`, image.toBuffer('image/png'));
  }
  root.unmount(node); root.dispose();
}

function context(path = '/build/map'): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('No authority connection in typography fixture'); }, null);
  controller.session.connected({ identity: 'local-typography', role: 'owner', contentRevision: null, mapRevision: null });
  expect(controller.navigate(path)).toBe(true);
  const workspaceBounds = { x: 300, y: 20, width: 820, height: 620 };
  return { controller, route: controller.activeRoute(), controlsBounds: { x: 10, y: 20, width: 248, height: 620 },
    inspectorBounds: { x: 1140, y: 20, width: 286, height: 620 }, workspaceBounds, bounds: workspaceBounds, invalidate() {} };
}
interface MapProbe {
  model: MapEditorModel; interaction: MapEditorController; renderer: MapEditorRenderer;
  publishError: string | null; liveSpawnMode: boolean; liveSpawnCommitting: boolean; liveSpawnTarget: { tileX: number; tileY: number; elevation: number } | null;
  contextMenu?: { x: number; y: number }; runtimeObjectMarker: MapEditorLiveMarker | null;
  npcLocationMarker: MapEditorLiveMarker | null; schemaActionField: ReturnType<typeof studioPropertyRow> | null;
  schemaActionTargetId: string | null; schemaActionError: string | null; schemaActionEditor: CanvasTextEditor;
}
function map(path = '/build/map') {
  const ctx = context(path); let surface = buildMapCanvasTool(ctx);
  const id = path.endsWith('terrain-lab') ? 'terrain-lab' : path.endsWith('procedural-world') ? 'procedural-world' : 'live-island';
  const state = ctx.controller.toolState<MapProbe>(`map-canvas:${id}`, () => { throw new Error('Missing retained map state'); });
  cleanups.push(() => surface.lifecycle?.dispose());
  return { ctx, state, rebuild: () => surface = buildMapCanvasTool(ctx), surface: () => surface };
}
function checkSurface(surface: StudioCanvasToolSurface, scenario: string): void {
  for (const [region, node] of Object.entries(surface.kit ?? {})) {
    if (!node || !tree(node).some(element => element.label)) continue;
    for (const options of matrices) check(node, `${scenario}-${region}`, options, region === 'inspector' ? 'Layers' : undefined);
  }
}

describe('production Studio typography', () => {
  it('detects the forbidden large atlas in an explicit recorder calibration', () => {
    const root = new UiRoot({ art, scale: 1 }); root.resize(240, 80);
    root.mount(ui.text('Calibration', { role: 'special-heading' })); root.arrange(); glyphs = [];
    root.draw(canvas(240, 80).getContext('2d') as unknown as CanvasRenderingContext2D, 0);
    expect(glyphs.length).toBeGreaterThan(0);
    expect(new Set(glyphs.map(glyph => `${glyph.face}:${glyph.width}x${glyph.height}`))).toEqual(new Set(['font_8x12:8x12']));
    root.dispose();
  });

  it.each(['/build/map', '/build/map/terrain-lab', '/build/map/procedural-world'])('draws actual %s controls, layer titles and overlay labels at every scale', path => {
    const h = map(path);
    h.state.model.renameLayer('objects', 'Objects with a deliberately long author label');
    checkSurface(h.rebuild(), path);
    expect(kitElements(h.surface()).some(element => element.label === 'Layers')).toBe(true);
  });

  it.each(['objects', 'biomes', 'scatter'] as const)('draws the %s workspace controls and inspector with the ordinary font', workspace => {
    const h = map(); h.state.model.selectWorkspace(workspace);
    checkSurface(h.rebuild(), `map-workspace-${workspace}`);
  });

  it('draws the actual resize chooser and destructive-crop confirmation with 5x7 text', () => {
    const h = map('/build/map/terrain-lab'); pressKit(h.surface(), 'map-resize-mode');
    let surface = h.rebuild(); expect(kitElement(surface, 'map-resize-edges-panel')).toBeDefined();
    for (const options of matrices) check(surface.kit!.overlays!, 'resize-chooser', options, 'Resize map');
    pressKit(surface, 'map-resize-west-shrink'); surface = h.rebuild();
    expect(kitElement(surface, 'map-resize-confirm')).toBeDefined();
    for (const options of matrices) check(surface.kit!.overlays!, 'resize-confirmation', options, 'CROP WEST');
  });

  it('draws map tooltips and selected-anchor annotations from the production builders', () => {
    const h = map();
    for (const options of matrices) check(h.surface().kit!.overlays!, 'map-toolbar-tooltip', options, undefined, true);
    h.state.model.placeAnchor({ id: 'local-long-annotation', kind: 'label', label: 'A long author label', tileX: 20, tileY: 24, elevation: 0 });
    h.state.model.selectAnchor('local-long-annotation');
    vi.spyOn(h.state.renderer, 'inspectionTerrain').mockReturnValue({
      spaceId: 0, seed: 1, version: 1, width: 1, height: 1, generator: 'debug_flat',
      biomes: new Uint8Array(1), blocked: cellFlags([false]), horseJumpableTerrain: cellFlags([true]), elevations: new Int16Array(1),
      dirtCliffRoles: new Uint8Array(1), dirtTerraces: new Uint8Array(1),
    });
    const snapshot = h.state.interaction.snapshot();
    vi.spyOn(h.state.interaction, 'snapshot').mockReturnValue({ ...snapshot, viewport: h.ctx.workspaceBounds,
      camera: { ...snapshot.camera, x: 20 * 16, y: 24 * 16, zoom: 1 } });
    const surface = h.rebuild(); expect(kitElement(surface, 'map-anchor-annotation')).toBeDefined();
    for (const options of matrices) check(surface.kit!.annotations!, 'selected-anchor-annotation', options, 'RUNTIME UNBOUND');
  });

  it('draws publish error/conflict, spawn, runtime, NPC and schema panels without heading exceptions', () => {
    const h = map();
    const run = (name: string, expectedId: string, expectedText?: string) => {
      const surface = h.rebuild(); expect(kitElement(surface, expectedId), name).toBeDefined();
      for (const options of matrices) check(surface.kit!.overlays!, name, options, expectedText);
    };
    h.state.publishError = 'A deliberately long publication rejection preserves the local draft and all undo history.';
    run('publish-error', 'map-publish-error-title'); h.state.publishError = null;
    const conflict = vi.spyOn(h.state.model, 'conflictRevision').mockReturnValue(28);
    run('publish-conflict', 'map-publish-conflict-ribbon'); conflict.mockRestore();
    // Seed retained presentation state only; this fixture never requests authority or invokes a mutation.
    h.state.liveSpawnMode = true; h.state.liveSpawnCommitting = true; h.state.liveSpawnTarget = { tileX: 20, tileY: 24, elevation: 0 };
    run('live-spawn-committing', 'map-live-spawn-ribbon'); h.state.liveSpawnMode = false; h.state.liveSpawnCommitting = false; h.state.liveSpawnTarget = null;
    const marker: MapEditorLiveMarker = { id: 'local-object', entityKind: 'placeable', kind: 'bench', label: 'Long ordinary object preview title',
      spaceId: 0, tileX: 20, tileY: 24, worldX: 328, worldY: 400, elevation: 0, footprint: { width: 1, height: 1 }, layer: 'objects', color: '#ffffff' };
    const live = vi.spyOn(h.state.interaction, 'liveMarkers').mockReturnValue([marker]);
    h.state.model.selectEntity('placeable', marker.id, 0); h.state.runtimeObjectMarker = marker;
    run('runtime-object-preview', 'map-runtime-object-ribbon'); h.state.runtimeObjectMarker = null;
    const npc = { ...marker, id: 'local-npc', entityKind: 'npc' as const, kind: 'merchant' };
    live.mockReturnValue([npc]); h.state.model.selectEntity('npc', npc.id, 0); h.state.npcLocationMarker = npc;
    run('npc-location-preview', 'map-npc-location-ribbon'); h.state.npcLocationMarker = null; live.mockRestore();
    const field: MapSchemaInspectorField = { id: 'lit', label: 'Ordinary state label', value: false, why: 'Change the reviewed local fixture state',
      action: { adapter: 'admin_objects', command: 'set_entity_state', access: 'write', stateKey: 'lit', value: { type: 'bool', default: false }, roles: ['owner'] } };
    const target = vi.spyOn(h.state.model, 'schemaInspectorTarget').mockReturnValue({ entityId: 'local-state', entityKind: 'placeable',
      definitionId: 'object:hearth_streetlamp', spaceId: 0, tileX: 20, tileY: 24, state: { lit: false } });
    h.state.schemaActionTargetId = 'local-state'; h.state.schemaActionField = studioPropertyRow({ ...field, component: 'State', kind: 'boolean' });
    h.state.schemaActionEditor.setValue('false');
    h.state.schemaActionError = 'Long validation message for this local-only preview';
    run('schema-action', 'map-schema-action-ribbon', 'false'); h.state.schemaActionField = null; target.mockRestore();
    h.state.contextMenu = { x: 400, y: 120 }; run('map-context-menu', 'map-object-context-menu');
  });

  it('draws real shell connection titles and ordinary author/operate chrome', async () => {
    const registry = new StudioCanvasToolRegistry(); registerBuiltinStudioCanvasTools(registry);
    for (const path of ['/build/map', '/author/items', '/operate/players']) {
      const ctx = context(path);
      const app = new StudioShellApp({ style: {} } as HTMLCanvasElement, ctx.controller, registry);
      const mounted = vi.spyOn(UiRoot.prototype, 'mount');
      (app as unknown as { buildShell(): void }).buildShell();
      const shell = mounted.mock.calls.at(-1)![0]; mounted.mockRestore();
      for (const options of matrices) check(shell, `shell-${path}`, options, undefined, true);
      shell.dispose(); app.dispose();
      if (path !== '/build/map') {
        const builder = await registry.load(ctx.route.tool.id); expect(builder).not.toBeNull();
        const surface = builder!(ctx); cleanups.push(() => surface.lifecycle?.dispose());
        for (const [region, node] of Object.entries(surface.kit ?? {})) if (node && tree(node).some(element => element.label)) {
          for (const options of matrices) check(node, `${path}-${region}`, options);
        }
      }
    }
    const ctx = context(); ctx.controller.session.disconnected(); ctx.controller.chooseEnvironment('local');
    const app = new StudioShellApp({ style: {} } as HTMLCanvasElement, ctx.controller, registry);
    const mounted = vi.spyOn(UiRoot.prototype, 'mount');
    (app as unknown as { buildShell(): void }).buildShell();
    const shell = mounted.mock.calls.at(-1)![0]; mounted.mockRestore();
    for (const options of matrices) check(shell, 'shell-connecting', options);
    expect(tree(shell).some(element => element.label === 'Connecting to live Studio')).toBe(true);
    shell.dispose(); app.dispose();
  });

  it('forbids map-local alternate-font overrides, including spatial viewport sources', () => {
    const directory = new URL('./', import.meta.url);
    const files = readdirSync(directory).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    const overrides = files.flatMap(file => {
      const source = readFileSync(new URL(file, directory), 'utf8');
      return /font_8x12|\.headerFont\b|(?:role\s*:\s*['"]special-heading|font\s*:\s*['"]header)/u.test(source) ? [file] : [];
    });
    expect(files.length).toBeGreaterThan(50); expect(overrides).toEqual([]);
  });
});
