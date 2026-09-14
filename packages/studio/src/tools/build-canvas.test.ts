import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLiveIslandMapDocument } from '@orchard/sim';
import type { StudioCanvasShellArt, UiRect } from '@orchard/ui';
import { StudioShellController } from '../shell/controller.js';
import type { StudioCanvasToolBuilder, StudioCanvasToolContext, StudioCanvasToolSurface } from '../shell/canvas-tool.js';
import { canvasAction, canvasParts } from './build-canvas-common.js';
import { buildAudioCanvasTool } from './audio/canvas.js';
import { buildCharacterCanvasTool } from './character/canvas.js';
import { buildMapCanvasTool } from './map/canvas.js';
import { buildObjectCanvasTool } from './object/canvas.js';
import { buildTilesCanvasTool } from './tiles/canvas.js';
import { buildUiLabCanvasTool } from './ui-lab/canvas.js';
import { buildItemsCanvasTool } from './items/canvas.js';
import { buildNarrativeCanvasTool } from './narrative/canvas.js';
import { buildWorldAuthoringCanvasTool } from './world-tables/canvas.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../shell/studio-connection.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 206, height: 620 });
const WORKSPACE = Object.freeze({ x: 300, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1140, y: 20, width: 260, height: 620 });

function context(path: string): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('unused'); }, null);
  expect(controller.navigate(path)).toBe(true);
  return { controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR, bounds: WORKSPACE,
    route: controller.activeRoute(), controller, invalidate: vi.fn() };
}

async function liveContentContext(
  path: string,
  view: StudioConnectionView,
): Promise<StudioCanvasToolContext> {
  let changed = (): void => undefined;
  const adapter: StudioLiveAdapter = {
    view: () => view,
    connect: () => changed(),
    disconnect: () => undefined,
  };
  const controller = new StudioShellController(async (_environment, onChanged) => {
    changed = onChanged;
    return adapter;
  });
  controller.chooseEnvironment('local');
  await controller.connectExplicit();
  expect(controller.navigate(path)).toBe(true);
  return { controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR,
    bounds: WORKSPACE, route: controller.activeRoute(), controller, invalidate: vi.fn() };
}

function connectionView(overrides: Partial<StudioConnectionView> = {}): StudioConnectionView {
  return {
    connected: true, synchronizing: false, identity: '01'.repeat(32), role: 'content_editor',
    contentRevision: null, contentHead: null, contentDefinitions: [], mapRevision: null,
    mapDocument: null, publishingMap: false, worldMutating: false, error: null,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
    ...overrides,
  };
}

function setOutlinerView(context: StudioCanvasToolContext, view: 'palette' | 'world' | 'live'): void {
  context.controller.toolState<{ leftView: string }>('map-canvas:live-island', () => {
    throw new Error('Expected initialized map');
  }).leftView = view;
}

function inside(child: UiRect, parent: UiRect): boolean {
  return child.x >= parent.x && child.y >= parent.y
    && child.x + child.width <= parent.x + parent.width
    && child.y + child.height <= parent.y + parent.height;
}

function overlaps(a: UiRect, b: UiRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function assertSurface(surface: StudioCanvasToolSurface, toolId: string, requiresWorkspaceNode = true): void {
  expect(surface.nodes.length).toBeGreaterThan(4);
  expect(surface.nodes.length).toBeLessThanOrEqual(200);
  expect(surface.actions.length).toBeGreaterThan(0);
  expect(surface.actions.length).toBeLessThanOrEqual(200);
  expect(new Set(surface.nodes.map(({ id }) => id)).size).toBe(surface.nodes.length);
  expect(new Set(surface.actions.map(({ id }) => id)).size).toBe(surface.actions.length);
  expect(surface.nodes.every(({ id }) => id.startsWith(`${toolId}-`))).toBe(true);
  expect(surface.actions.every(({ id }) => id.startsWith(`${toolId}-`))).toBe(true);
  expect(surface.nodes.some(({ bounds }) => inside(bounds, CONTROLS))).toBe(true);
  if (requiresWorkspaceNode) expect(surface.nodes.some(({ bounds }) => inside(bounds, WORKSPACE))).toBe(true);
  expect(surface.actions.every(({ bounds }) => bounds.width >= 40 && bounds.height >= 40)).toBe(true);
  expect(surface.nodes.some(({ id }) => id.endsWith('-controls-surface') || id.endsWith('-workspace-surface'))).toBe(false);
  expect(surface.nodes.filter(({ id }) => id.endsWith('-panel'))
    .every(({ kind }) => kind === 'thin_panel')).toBe(true);
  const outside = surface.actions.find(({ bounds }) => !inside(bounds, CONTROLS)
    && !inside(bounds, WORKSPACE) && !inside(bounds, INSPECTOR));
  expect(outside, outside === undefined ? undefined : `${outside.id} outside shell-safe bounds ${JSON.stringify(outside.bounds)}`).toBeUndefined();
  for (let index = 0; index < surface.actions.length; index += 1) {
    for (let other = index + 1; other < surface.actions.length; other += 1) {
      expect(overlaps(surface.actions[index]!.bounds, surface.actions[other]!.bounds),
        `${surface.actions[index]!.id} overlaps ${surface.actions[other]!.id}`).toBe(false);
    }
  }
  expect(surface.draw).toBeTypeOf('function');
}

function fakeCanvasContext(): CanvasRenderingContext2D {
  const target = {
    save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    ellipse: vi.fn(), fillText: vi.fn(),
    drawImage: vi.fn(), setLineDash: vi.fn(), putImageData: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) })),
  };
  return new Proxy(target, { set(object, property, value) {
    Object.assign(object, { [property]: value }); return true;
  } }) as unknown as CanvasRenderingContext2D;
}

const BUILDERS: readonly [string, string, StudioCanvasToolBuilder][] = [
  ['object', '/build/object', buildObjectCanvasTool],
  ['tiles', '/build/tiles', buildTilesCanvasTool],
  ['character', '/author/character', buildCharacterCanvasTool],
  ['audio', '/author/audio', buildAudioCanvasTool],
  ['ui-lab', '/author/ui-lab', buildUiLabCanvasTool],
];

const LIVE_CONTENT_BUILDERS: readonly [string, string, StudioCanvasToolBuilder][] = [
  ['tiles', '/build/tiles', buildTilesCanvasTool],
  ['ui-lab', '/author/ui-lab', buildUiLabCanvasTool],
  ['items', '/author/items', buildItemsCanvasTool],
  ['npc-studio', '/author/npcs', buildNarrativeCanvasTool],
  ['world-tables', '/author/world-tables', buildWorldAuthoringCanvasTool],
];

describe('canvas-native Build and asset tools', () => {
  it.each(LIVE_CONTENT_BUILDERS)('%s shows loading while its live content subscription is not ready', async (
    _toolId, path, builder,
  ) => {
    const toolContext = await liveContentContext(path, connectionView({
      connected: false, synchronizing: true, contentHead: undefined, contentDefinitions: undefined,
    }));
    const surface = builder(toolContext);
    expect(surface.nodes.find(({ id }) => id.endsWith('content-status-title'))?.label).toBe('LOADING LIVE CONTENT');
    expect(surface.nodes.find(({ id }) => id.endsWith('content-status-detail'))?.label)
      .toBe('WAITING FOR VERIFIED LIVE CONTENT');
    expect(surface.actions).toHaveLength(0);
  });

  it.each(LIVE_CONTENT_BUILDERS)('%s fails closed when connected live content has no verified head or rows', async (
    _toolId, path, builder,
  ) => {
    const toolContext = await liveContentContext(path, connectionView());
    const surface = builder(toolContext);
    expect(surface.nodes.find(({ id }) => id.endsWith('content-status-title'))?.label).toBe('LIVE CONTENT UNAVAILABLE');
    expect(surface.nodes.find(({ id }) => id.endsWith('content-status-detail'))?.label)
      .toBe('NO VERIFIED LIVE CONTENT HEAD IS AVAILABLE');
    expect(surface.actions).toHaveLength(0);
    expect(surface.tables ?? []).toHaveLength(0);
  });

  it.each(LIVE_CONTENT_BUILDERS)('%s retains explicit offline bootstrap authoring', (
    _toolId, path, builder,
  ) => {
    const surface = builder(context(path));
    expect(surface.nodes.some(({ id }) => id.endsWith('content-status-title'))).toBe(false);
    expect(surface.actions.length).toBeGreaterThan(0);
  });

  it.each(['/build/map', '/build/map/terrain-lab', '/build/map/procedural-world'])('builds map route %s without route controls', async (path) => {
    const toolContext = context(path);
    let surface = buildMapCanvasTool(toolContext);
    assertSurface(surface, 'map', false);
    expect(surface.actions.some(({ label }) => label.includes('/build/map'))).toBe(false);
    expect(surface.actions.find(({ id }) => id === 'map-export')).toMatchObject({
      label: 'Download the current local map draft as validated JSON',
      disabled: false,
    });
    expect(surface.nodes.find(({ id }) => id === 'map-export')).toMatchObject({
      kind: 'button', symbol: 'export', label: undefined,
    });
    expect(surface.nodes.find(({ id }) => id === 'map-layers-ribbon')).toMatchObject({ kind: 'ribbon', label: 'LAYERS' });
    expect(surface.nodes.some(({ id }) => id === 'map-selection-ribbon')).toBe(false);
    expect(surface.actions.some(({ id }) => id === 'map-layer-visible-terrain')).toBe(true);
    expect(surface.actions.some(({ id }) => id === 'map-layer-select-objects')).toBe(true);
    expect(surface.actions.map(({ id }) => id).filter((id) => id.startsWith('map-left-view-')))
      .toEqual([]);
    expect(surface.actions.find(({ id }) => id === 'map-layer-select-generated_base')?.label)
      .toContain('(system locked)');
    expect(surface.nodes.find(({ id }) => id === 'map-layers-card-panel'))
      .toMatchObject({ kind: 'thin_panel' });
    expect(surface.nodes.some(({ id }) => id === 'map-selection-card-panel')).toBe(false);
    expect(surface.nodes.filter(({ id }) => id.startsWith('map-layer-visible-')))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ symbol: 'visibility', label: undefined }),
      ]));
    const layerRows = surface.nodes.filter(({ id }) => id.startsWith('map-layer-select-'));
    expect(layerRows).toHaveLength(8);
    expect(layerRows.every(({ kind, label }) => kind === 'button' && label === undefined)).toBe(true);
    expect(surface.nodes.some(({ label }) => label?.startsWith('Work on '))).toBe(false);
    expect(surface.nodes.filter(({ id }) => id.startsWith('map-layer-thumbnail-'))
      .every(({ kind, symbol }) => kind === 'slot' && symbol !== undefined)).toBe(true);
    expect(surface.nodes.filter(({ id }) => id.startsWith('map-layer-lock-')))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'button', symbol: 'lock', state: 'disabled' }),
        expect.objectContaining({ kind: 'button', symbol: 'unlock' }),
      ]));
    expect(surface.actions.some(({ id }) => id.startsWith('map-layer-lock-'))).toBe(true);
    expect(surface.nodes.filter(({ id }) => id.startsWith('map-layer-solo-'))
      .every(({ kind, symbol, label }) => kind === 'button' && symbol === 'layers' && label === undefined))
      .toBe(true);
    expect(surface.nodes.filter(({ id }) => id.startsWith('map-layer-select-')).map(({ id }) => id))
      .toEqual([
        'map-layer-select-anchors', 'map-layer-select-canopy', 'map-layer-select-player_owned',
        'map-layer-select-gameplay', 'map-layer-select-objects', 'map-layer-select-ground',
        'map-layer-select-terrain', 'map-layer-select-generated_base',
      ]);
    expect(surface.actions.filter(({ id }) => id.startsWith('map-layer-select-')).map(({ id }) => id))
      .toEqual([
        'map-layer-select-anchors', 'map-layer-select-canopy', 'map-layer-select-player_owned',
        'map-layer-select-gameplay', 'map-layer-select-objects', 'map-layer-select-ground',
        'map-layer-select-terrain', 'map-layer-select-generated_base',
      ]);
    surface.actions.find(({ id }) => id === 'map-export')?.activate();
    expect(toolContext.controller.notifications.items().at(-1)).toMatchObject({
      kind: 'error',
      title: 'Map export unavailable',
      detail: 'This browser preview does not provide a file-download bridge.',
    });
    if (path === '/build/map') {
      setOutlinerView(toolContext, 'world');
      let outlinerSurface = buildMapCanvasTool(toolContext);
      expect(outlinerSurface.nodes.find(({ id }) => id === 'map-world-outliner-card-panel'))
        .toMatchObject({ kind: 'thin_panel' });
      expect(outlinerSurface.nodes.find(({ id }) => id === 'map-world-outliner-ribbon'))
        .toMatchObject({ kind: 'ribbon', label: expect.stringMatching(/^WORLD OUTLINER(?: |$)/) });
      expect(outlinerSurface.actions.some(({ id }) => id === 'map-outliner-select-space:0:layer:objects'))
        .toBe(true);
      outlinerSurface.actions.find(({ id }) => id === 'map-outliner-toggle-space:0:layer:objects')?.activate();
      outlinerSurface = buildMapCanvasTool(toolContext);
      expect(outlinerSurface.actions.some(({ id }) => id.startsWith('map-outliner-select-map-object:')))
        .toBe(true);
      setOutlinerView(toolContext, 'live');
      const liveOutlinerSurface = buildMapCanvasTool(toolContext);
      expect(liveOutlinerSurface.nodes.find(({ id }) => id === 'map-live-outliner-card-panel'))
        .toMatchObject({ kind: 'thin_panel' });
      expect(liveOutlinerSurface.nodes.find(({ id }) => id === 'map-live-outliner-empty')?.label)
        .toBe('CONNECT TO VIEW LIVE WORLD');
      setOutlinerView(toolContext, 'palette');
      surface = buildMapCanvasTool(toolContext);

      const terrainTools = surface.nodes.filter(({ id }) => id.startsWith('map-terrain-tool-'));
      expect(terrainTools.length).toBeGreaterThan(0);
      expect(terrainTools.length).toBeLessThanOrEqual(18);
      expect(terrainTools.every(({ kind, symbol, label }) =>
        kind === 'slot' && symbol !== undefined && label === undefined)).toBe(true);
      expect(surface.nodes.find(({ id }) => id === 'map-object-search'))
        .toMatchObject({ kind: 'field', label: 'SEARCH PALETTE' });
      expect(surface.actions.find(({ id }) => id === 'map-eyedropper')?.label)
        .toBe('Sample map content into the palette (I)');
      expect(surface.nodes.find(({ id }) => id === 'map-eyedropper'))
        .toMatchObject({ kind: 'button', symbol: 'pointer', label: undefined, state: 'idle' });
      expect(surface.nodes.filter(({ id }) => id.startsWith('map-terrain-mode-')))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'map-terrain-mode-brush', state: 'active' }),
          expect.objectContaining({ id: 'map-terrain-mode-surface_family' }),
          expect.objectContaining({ id: 'map-terrain-mode-cliff_family' }),
          expect.objectContaining({ id: 'map-terrain-mode-exact_override' }),
          expect.objectContaining({ id: 'map-terrain-mode-farmland_visual' }),
        ]));
      const paletteSearch = surface.textEditors?.find(({ id }) => id === 'map-object-search')?.editor;
      paletteSearch?.setValue('crossing');
      surface = buildMapCanvasTool(toolContext);
      surface.actions.find(({ id }) => id === 'map-terrain-tool-transition')!.activate();
      paletteSearch?.setValue('');
      let transitionSurface = buildMapCanvasTool(toolContext);
      const transitionControls = transitionSurface.nodes.filter(({ id }) => id.startsWith('map-transition-'));
      expect(transitionControls).toHaveLength(5);
      expect(transitionControls.every(({ label }) => label === undefined)).toBe(true);
      expect(transitionSurface.actions.find(({ id }) => id === 'map-transition-slope'))
        .toMatchObject({ label: 'Author a complete slope bank' });
      transitionSurface.actions.find(({ id }) => id === 'map-transition-stairs')?.activate();
      transitionSurface.actions.find(({ id }) => id === 'map-transition-width-more')?.activate();
      transitionSurface = buildMapCanvasTool(toolContext);
      expect(transitionSurface.nodes.find(({ id }) => id === 'map-transition-stairs'))
        .toMatchObject({ symbol: 'stairs', state: 'active' });
      expect(transitionSurface.nodes.find(({ id }) => id === 'map-map-stats')?.label)
        .toContain('STAIRS W3');
      transitionSurface.actions.find(({ id }) => id === 'map-transition-ladder')?.activate();
      transitionSurface = buildMapCanvasTool(toolContext);
      expect(transitionSurface.actions.find(({ id }) => id === 'map-transition-width-more'))
        .toMatchObject({ disabled: true });
      surface.actions.find(({ id }) => id === 'map-eyedropper')?.activate();
      const samplingSurface = buildMapCanvasTool(toolContext);
      expect(samplingSurface.nodes.find(({ id }) => id === 'map-eyedropper'))
        .toMatchObject({ state: 'active' });
      expect(samplingSurface.nodes.find(({ id }) => id === 'map-map-stats')?.label)
        .toContain('EYEDROPPER · CLICK MAP');
      samplingSurface.actions.find(({ id }) => id === 'map-eyedropper')?.activate();
      expect(samplingSurface.actions.some(({ id }) => id.startsWith('map-workspace-'))).toBe(false);
      samplingSurface.actions.find(({ id }) => id === 'map-layer-select-canopy')!.activate();
      const canopySurface = buildMapCanvasTool(toolContext);
      expect(canopySurface.nodes.find(({ id }) => id === 'map-layer-select-canopy')?.state).toBe('active');
      expect(canopySurface.nodes.some(({ id }) => id.startsWith('map-terrain-tool-'))).toBe(false);
      canopySurface.actions.find(({ id }) => id === 'map-layer-select-terrain')!.activate();

      const landmark = createLiveIslandMapDocument().landmarks[0]!;
      toolContext.controller.selection.select({
        kind: 'entity', entityKind: 'map-object', id: landmark.id, spaceId: 0,
      });
      let selectionSurface = buildMapCanvasTool(toolContext);
      await vi.waitFor(() => {
        selectionSurface = buildMapCanvasTool(toolContext);
        expect(selectionSurface.nodes.find(({ id }) => id === 'map-selection-hide'))
          .toMatchObject({ glyph: 'power', label: undefined, state: 'active' });
      });
      expect(selectionSurface.nodes.find(({ id }) => id === 'map-selection-card-panel'))
        .toMatchObject({ kind: 'thin_panel' });
      expect(overlaps(
        selectionSurface.nodes.find(({ id }) => id === 'map-selection-card-panel')!.bounds,
        selectionSurface.nodes.find(({ id }) => id === 'map-layers-card-panel')!.bounds,
      )).toBe(false);
      expect(selectionSurface.nodes.find(({ id }) => id === 'map-selection-provenance')?.label)
        .toContain('AUTHORED');
      expect(selectionSurface.nodes.find(({ id }) => id === 'map-selection-layer')?.label)
        .toMatch(/LAYER.*CANOPY.*INACTIVE.*VISIBLE.*EDITABLE/u);
      expect(selectionSurface.nodes.find(({ id }) => id === 'map-selection-material')?.label)
        .toMatch(/BIOME.*SURFACE/u);
      selectionSurface.actions.find(({ id }) => id === 'map-selection-view-schema')?.activate();
      let schemaSurface = buildMapCanvasTool(toolContext);
      expect(schemaSurface.nodes.find(({ id }) => id === 'map-selection-group-document'))
        .toMatchObject({ kind: 'heading', label: 'DOCUMENT · 3 FIELDS' });
      expect(schemaSurface.input?.wheel?.({
        point: { x: INSPECTOR.x + 20, y: INSPECTOR.y + 110 },
        deltaX: 0,
        deltaY: 1_000,
        ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      })).toBe(true);
      schemaSurface = buildMapCanvasTool(toolContext);
      expect(schemaSurface.nodes.some(({ id }) => id.startsWith('map-selection-property-'))).toBe(true);
      expect(schemaSurface.nodes.some(({ id }) => id.startsWith('map-selection-why-'))).toBe(true);
      schemaSurface.actions.find(({ id }) => id === 'map-selection-view-visual')?.activate();
      const visualSurface = buildMapCanvasTool(toolContext);
      expect(visualSurface.actions.map(({ id }) => id)).toEqual(expect.arrayContaining([
        'map-selection-hide', 'map-selection-clone', 'map-selection-rotate',
        'map-selection-flip', 'map-selection-scale', 'map-selection-delete',
      ]));
      const selectionActionIds = new Set([
        'map-selection-hide', 'map-selection-clone', 'map-selection-rotate',
        'map-selection-flip', 'map-selection-scale', 'map-selection-delete',
      ]);
      expect(visualSurface.nodes.filter(({ id }) => selectionActionIds.has(id))
        .every(({ glyph, label }) => glyph !== undefined && label === undefined)).toBe(true);
      expect(visualSurface.input?.wheel?.({
        point: { x: INSPECTOR.x + 20, y: INSPECTOR.y + 100 },
        deltaX: 0,
        deltaY: 1_000,
        ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      })).toBe(true);
      const scrolledInspectionSurface = buildMapCanvasTool(toolContext);
      expect(scrolledInspectionSurface.nodes.some(({ id }) => id.startsWith('map-selection-visual-'))).toBe(true);
      const terrainRow = selectionSurface.nodes.find(({ id }) => id === 'map-layer-select-terrain');
      expect(terrainRow).toMatchObject({ kind: 'button', state: 'active' });
      expect(selectionSurface.nodes.find(({ id }) => id === 'map-layer-lock-terrain'))
        .toMatchObject({ kind: 'button', symbol: 'unlock' });
      expect(selectionSurface.nodes.some(({ id }) => id === 'map-layer-select-anchors')).toBe(false);
      expect(selectionSurface.nodes.find(({ id }) => id === 'map-layers-ribbon')?.label)
        .toMatch(/^LAYERS \d+-\d+\/8$/u);
      expect(selectionSurface.input?.wheel?.({
        point: { x: terrainRow!.bounds.x + 2, y: terrainRow!.bounds.y + 2 },
        deltaX: 0,
        deltaY: -100,
        ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      })).toBe(true);
      const scrolledLayerSurface = buildMapCanvasTool(toolContext);
      expect(scrolledLayerSurface.nodes.some(({ id }) => id === 'map-layer-select-anchors')).toBe(true);
      expect(scrolledLayerSurface.nodes.find(({ id }) => id === 'map-layers-ribbon')?.label)
        .toMatch(/^LAYERS \d+-\d+\/8$/u);
      const canopyEye = scrolledLayerSurface.actions.find(({ id }) => id === 'map-layer-visible-canopy');
      canopyEye?.activate();
      expect(buildMapCanvasTool(toolContext).nodes.find(({ id }) => id === 'map-layer-visible-canopy'))
        .toMatchObject({ symbol: 'eyeOff', state: 'idle' });

      const scatterSurface = buildMapCanvasTool(context('/build/map/procedural-world'));
      expect(scatterSurface.actions.map(({ id }) => id)).toEqual(expect.arrayContaining([
        'map-scatter-less', 'map-scatter-more',
      ]));
      expect(scatterSurface.nodes.find(({ id }) => id === 'map-scatter-density'))
        .toMatchObject({ label: '35% DENSITY' });
      expect(scatterSurface.nodes.find(({ id }) => id === 'map-map-stats')?.label).toContain('DRAW TO SCATTER');
    }
    expect(surface.nodes.some(({ label }) => label === 'KIND  none' || label === 'ROUTE  /build/map')).toBe(false);
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => fakeCanvasContext() })) });
    expect(() => surface.draw?.(fakeCanvasContext(), {} as StudioCanvasShellArt)).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('keeps warm map scene construction inside one animation-frame budget', () => {
    const toolContext = context('/build/map');
    buildMapCanvasTool(toolContext);
    const samples = Array.from({ length: 8 }, () => {
      const started = performance.now();
      buildMapCanvasTool(toolContext);
      return performance.now() - started;
    });
    expect(Math.max(...samples)).toBeLessThan(16.7);
  });

  it('mounts searchable keyboard Outliners and guarded one-entry authored tree edits', () => {
    const toolContext = context('/build/map');
    buildMapCanvasTool(toolContext);
    setOutlinerView(toolContext, 'world');
    let surface = buildMapCanvasTool(toolContext);

    const landmark = createLiveIslandMapDocument().landmarks[0]!;
    const search = surface.textEditors
      ?.find(({ id }) => id === 'map-outliner-search-world')?.editor;
    expect(search).toBeDefined();
    search?.setValue(landmark.id);
    surface = buildMapCanvasTool(toolContext);
    const filteredRows = surface.actions.filter(({ id }) => id.startsWith('map-outliner-select-'))
      .map(({ id }) => id);
    expect(filteredRows).toEqual(expect.arrayContaining([
      'map-outliner-select-space:0',
      `map-outliner-select-map-object:${landmark.id}`,
    ]));
    expect(filteredRows.filter((id) => id.startsWith('map-outliner-select-map-object:')))
      .toEqual([`map-outliner-select-map-object:${landmark.id}`]);

    surface.actions.find(({ id }) => id === 'map-outliner-clear-world')?.activate();
    surface = buildMapCanvasTool(toolContext);
    const groundRowId = 'map-outliner-select-space:0:layer:ground';
    const groundRow = surface.actions.find(({ id }) => id === groundRowId)!;
    const right = groundRow.keyDown?.({ key: 'ArrowRight', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    expect(right).toBe(groundRowId);
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-outliner-toggle-space:0:layer:ground'))
      .toMatchObject({ state: 'active' });
    const firstChildFocus = surface.actions.find(({ id }) => id === groundRowId)?.keyDown?.({
      key: 'ArrowRight', repeat: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    });
    expect(firstChildFocus).toMatch(/^map-outliner-select-map-object:/u);
    surface = buildMapCanvasTool(toolContext);
    const firstChild = surface.actions.find(({ id }) => id === firstChildFocus)!;
    expect(firstChild.keyDown?.({ key: 'Enter', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(firstChildFocus);
    expect(toolContext.controller.selection.current()).toMatchObject({
      kind: 'entity', entityKind: 'map-object', spaceId: 0,
    });

    toolContext.controller.selection.select({
      kind: 'entity', entityKind: 'map-object', id: landmark.id, spaceId: 0,
    });
    surface = buildMapCanvasTool(toolContext);
    const targetLayer = landmark.layer === 'canopy' ? 'ground' : 'canopy';
    const reparent = surface.actions.find(({ id }) => (
      id === `map-outliner-reparent-space:0:layer:${targetLayer}`
    ));
    expect(reparent).toMatchObject({ disabled: false });
    reparent?.activate();
    type OutlinerModelProbe = { readonly model: {
      document(): ReturnType<typeof createLiveIslandMapDocument>;
    } };
    const retained = toolContext.controller.toolState<OutlinerModelProbe>('map-canvas:live-island', () => {
      throw new Error('map state was not retained');
    });
    expect(retained.model.document().landmarks.find(({ id }) => id === landmark.id)?.layer)
      .toBe(targetLayer);
    buildMapCanvasTool(toolContext).actions.find(({ id }) => id === 'map-undo')?.activate();
    expect(retained.model.document().landmarks.find(({ id }) => id === landmark.id)?.layer)
      .toBe(landmark.layer);

    search?.setValue('world objects');
    surface = buildMapCanvasTool(toolContext);
    const objectsRow = surface.actions.find(({ id }) => id === 'map-outliner-select-space:0:layer:objects')!;
    expect(objectsRow.keyDown?.({ key: 'ArrowUp', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: true, metaKey: false }))
      .toBe('map-outliner-select-space:0:layer:objects');
    expect(retained.model.document().layers.map(({ id }) => id).indexOf('objects'))
      .toBeLessThan(retained.model.document().layers.map(({ id }) => id).indexOf('ground'));
    buildMapCanvasTool(toolContext).actions.find(({ id }) => id === 'map-undo')?.activate();

    setOutlinerView(toolContext, 'live');
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-live-outliner-ribbon')?.label)
      .toContain('READ ONLY');
    expect(surface.actions.some(({ id }) => id.startsWith('map-outliner-reparent-'))).toBe(false);
  });

  it('provides compact canvas-native layer rename/reorder controls with locked system boundaries', () => {
    const toolContext = context('/build/map');
    let surface = buildMapCanvasTool(toolContext);
    const rename = surface.actions.find(({ id }) => id === 'map-layer-rename-terrain');
    const towardFront = surface.actions.find(({ id }) => id === 'map-layer-front-terrain');
    const towardBack = surface.actions.find(({ id }) => id === 'map-layer-back-terrain');
    expect(rename?.label).toBe('Rename Terrain Overrides');
    expect(surface.nodes.find(({ id }) => id === rename?.id)).toMatchObject({ glyph: undefined, label: 'Rename' });
    expect(towardFront).toMatchObject({
      disabled: true,
      label: 'Terrain Overrides is not an authored object painter layer',
    });
    expect(towardBack).toMatchObject({ disabled: true });

    rename?.activate();
    surface = buildMapCanvasTool(toolContext);
    const editor = surface.textEditors?.find(({ id }) => id === 'map-layer-rename-terrain')?.editor;
    expect(surface.nodes.find(({ id }) => id === 'map-layer-rename-terrain')).toMatchObject({
      kind: 'field', label: 'Terrain Overrides|',
    });
    editor?.setValue('Cultivated Ground');
    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-layer-rename-confirm-terrain')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layer-name-terrain')?.label)
      .toBe('CULTIVATED GROUND');
    expect(surface.textEditors?.some(({ id }) => id === 'map-layer-rename-terrain')).toBe(false);

    surface.actions.find(({ id }) => id === 'map-layer-select-objects')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.actions.find(({ id }) => id === 'map-layer-back-objects')).toMatchObject({
      disabled: false,
      label: 'Move World Objects toward back at equal elevation and depth',
    });
    surface.actions.find(({ id }) => id === 'map-layer-back-objects')?.activate();
    surface = buildMapCanvasTool(toolContext);
    const orderedRows = surface.nodes.filter(({ id }) => id.startsWith('map-layer-select-'))
      .map(({ id }) => id);
    expect(orderedRows.indexOf('map-layer-select-ground'))
      .toBeLessThan(orderedRows.indexOf('map-layer-select-objects'));
    expect(surface.nodes.find(({ id }) => id === 'map-layer-select-objects'))
      .toMatchObject({ state: 'active' });

    surface.actions.find(({ id }) => id === 'map-undo')?.activate();
    buildMapCanvasTool(toolContext).actions.find(({ id }) => id === 'map-undo')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layer-name-terrain')?.label)
      .toBe('TERRAIN OVERRIDES');

    surface.actions.find(({ id }) => id === 'map-layer-select-generated_base')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.actions.find(({ id }) => id === 'map-layer-rename-generated_base'))
      .toMatchObject({ disabled: true, label: 'Generated Base is a required read-only system layer' });
    expect(surface.actions.find(({ id }) => id === 'map-layer-front-generated_base'))
      .toMatchObject({ disabled: true });
    expect(surface.actions.find(({ id }) => id === 'map-layer-back-generated_base'))
      .toMatchObject({ disabled: true });
  });

  it('supports Photoshop-style layer ranges and safe bulk eye/lock actions', () => {
    const toolContext = context('/build/map');
    const modifiers = (overrides: Partial<{
      shiftKey: boolean;
      altKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
    }> = {}) => ({ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...overrides });
    let surface = buildMapCanvasTool(toolContext);

    surface.actions.find(({ id }) => id === 'map-layer-select-objects')
      ?.activate(modifiers({ ctrlKey: true }));
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layers-ribbon')?.label)
      .toBe('LAYERS · 2 SELECTED');
    expect(surface.nodes.find(({ id }) => id === 'map-layer-select-objects'))
      .toMatchObject({ state: 'active' });
    expect(surface.nodes.find(({ id }) => id === 'map-layer-select-terrain'))
      .toMatchObject({ state: 'active' });
    expect(surface.nodes.find(({ id }) => id === 'map-layer-name-objects')?.label)
      .toBe('> WORLD OBJECTS');
    expect(surface.nodes.find(({ id }) => id === 'map-layer-name-terrain')?.label)
      .toBe('+ TERRAIN OVERRIDES');
    expect(surface.actions.find(({ id }) => id === 'map-layers-bulk-visibility'))
      .toMatchObject({ disabled: false, label: 'Hide all 2 selected layers' });
    expect(surface.actions.find(({ id }) => id === 'map-layers-bulk-lock'))
      .toMatchObject({ disabled: false, label: 'Lock 2 selected editable layers' });

    surface.actions.find(({ id }) => id === 'map-layers-bulk-visibility')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layer-visible-objects'))
      .toMatchObject({ symbol: 'eyeOff' });
    expect(surface.nodes.find(({ id }) => id === 'map-layer-visible-terrain'))
      .toMatchObject({ symbol: 'eyeOff' });
    expect(surface.actions.find(({ id }) => id === 'map-layers-bulk-visibility'))
      .toMatchObject({ label: 'Show all 2 selected layers' });
    surface.actions.find(({ id }) => id === 'map-layers-bulk-visibility')?.activate();

    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-layer-select-player_owned')
      ?.activate(modifiers({ shiftKey: true }));
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layers-ribbon')?.label)
      .toBe('LAYERS · 3 SELECTED');
    expect(surface.nodes.find(({ id }) => id === 'map-layer-name-player_owned')?.label)
      .toBe('> PLAYER-OWNED OBJECTS');
    expect(surface.actions.find(({ id }) => id === 'map-layers-bulk-lock')).toMatchObject({
      disabled: false,
      label: 'Lock 2 selected editable layers; 1 immutable system lock remains',
    });
    surface.actions.find(({ id }) => id === 'map-layers-bulk-lock')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layer-lock-player_owned'))
      .toMatchObject({ state: 'disabled', symbol: 'lock' });
    expect(surface.nodes.find(({ id }) => id === 'map-layer-lock-gameplay'))
      .toMatchObject({ state: 'active', symbol: 'lock' });
    expect(surface.nodes.find(({ id }) => id === 'map-layer-lock-objects'))
      .toMatchObject({ state: 'active', symbol: 'lock' });
    expect(surface.actions.find(({ id }) => id === 'map-layers-bulk-lock')?.label)
      .toBe('Unlock 2 selected editable layers; 1 immutable system lock remains');
    surface.actions.find(({ id }) => id === 'map-layers-bulk-lock')?.activate();

    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-layer-select-canopy')
      ?.activate(modifiers({ metaKey: true }));
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layers-ribbon')?.label)
      .toBe('LAYERS · 4 SELECTED');
    expect(surface.nodes.find(({ id }) => id === 'map-layer-name-canopy')?.label)
      .toBe('> CANOPY / FOREGROUND');

    surface.actions.find(({ id }) => id === 'map-layer-select-terrain')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id === 'map-layers-ribbon')?.label).toBe('LAYERS');
    expect(surface.nodes.filter(({ id, state }) => id.startsWith('map-layer-select-') && state === 'active'))
      .toHaveLength(1);
    expect(surface.actions.some(({ id }) => id.startsWith('map-layers-bulk-'))).toBe(false);

    const state = toolContext.controller.toolState<{
      readonly model: { canUndo(): boolean; isLayerUserLocked(layer: 'objects' | 'gameplay'): boolean };
      readonly interaction: { snapshot(): { readonly activeLayer: string } };
    }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
    expect(state.interaction.snapshot().activeLayer).toBe('terrain');
    expect(state.model.isLayerUserLocked('objects')).toBe(false);
    expect(state.model.isLayerUserLocked('gameplay')).toBe(false);
    expect(state.model.canUndo()).toBe(false);
  });

  it('offers icon-only annotation anchor tools and disabled runtime-authority references', () => {
    const toolContext = context('/build/map/terrain-lab');
    buildMapCanvasTool(toolContext);
    type AnchorProbe = {
      readonly model: {
        selectWorkspace(workspace: 'objects'): void;
        toggleLayer(layer: 'anchors'): void;
      };
      readonly interaction: {
        selectLayer(layer: 'anchors'): void;
        snapshot(): { readonly selectedAnchorKind: 'poi' | 'label' | null };
      };
    };
    const state = toolContext.controller.toolState<AnchorProbe>('map-canvas:terrain-lab', () => {
      throw new Error('map state was not retained');
    });
    state.model.selectWorkspace('objects');
    state.interaction.selectLayer('anchors');
    let surface = buildMapCanvasTool(toolContext);

    expect(surface.actions.find(({ id }) => id === 'map-anchor-tool-poi')).toMatchObject({
      disabled: false,
      label: expect.stringContaining('exact projected terrain elevation'),
    });
    expect(surface.nodes.find(({ id }) => id === 'map-anchor-tool-poi')).toMatchObject({
      kind: 'slot', symbol: 'pointer', label: undefined,
    });
    expect(surface.nodes.find(({ id }) => id === 'map-anchor-tool-label')).toMatchObject({
      kind: 'slot', symbol: 'landPlot', label: undefined,
    });
    for (const kind of ['spawn', 'portal', 'npc', 'resource']) {
      expect(surface.actions.find(({ id }) => id === `map-anchor-tool-${kind}`)).toMatchObject({
        disabled: true,
        label: expect.stringContaining('runtime authority not available'),
      });
    }

    surface.actions.find(({ id }) => id === 'map-anchor-tool-poi')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(state.interaction.snapshot().selectedAnchorKind).toBe('poi');
    expect(surface.nodes.find(({ id }) => id === 'map-map-stats')?.label)
      .toContain('PLACE POI · CLICK MAP · ESC CANCEL');
    expect(surface.input?.keyDown?.({
      key: 'Escape', repeat: false, shiftKey: false, altKey: false,
      ctrlKey: false, metaKey: false,
    })).toBe(true);
    expect(state.interaction.snapshot().selectedAnchorKind).toBeNull();

    surface.actions.find(({ id }) => id === 'map-anchor-tool-label')?.activate();
    state.model.toggleLayer('anchors');
    surface = buildMapCanvasTool(toolContext);
    expect(state.interaction.snapshot().selectedAnchorKind).toBeNull();
    expect(surface.actions.find(({ id }) => id === 'map-anchor-tool-label'))
      .toMatchObject({ disabled: true });
  });

  it('edits an annotation label through one compact Canvas-native action with strict cancel and validation', async () => {
    const toolContext = context('/build/map/terrain-lab');
    buildMapCanvasTool(toolContext);
    type AnchorLabelProbe = {
      readonly model: {
        document(): { readonly revision: number; readonly anchors: readonly {
          readonly id: string; readonly label?: string;
        }[] };
        placeAnchor(anchor: {
          readonly id: string; readonly kind: 'poi'; readonly label: string;
          readonly tileX: number; readonly tileY: number; readonly elevation: number;
        }): void;
        selectAnchor(id: string): void;
        undo(): void;
      };
    };
    const state = toolContext.controller.toolState<AnchorLabelProbe>('map-canvas:terrain-lab', () => {
      throw new Error('map state was not retained');
    });
    state.model.selectAnchor('editor-spawn');
    let surface = buildMapCanvasTool(toolContext);
    expect(surface.actions.some(({ id }) => id === 'map-selection-edit-anchor-label')).toBe(false);
    expect(surface.actions.some(({ id }) => id === 'map-selection-delete-anchor')).toBe(false);

    state.model.placeAnchor({
      id: 'poi-1', kind: 'poi', label: 'Old Label', tileX: 2, tileY: 2, elevation: 0,
    });
    state.model.selectAnchor('poi-1');
    const beforeRevision = state.model.document().revision;
    const editedAnchor = () => state.model.document().anchors.find(({ id }) => id === 'poi-1');
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(toolContext);
      expect(surface.nodes.find(({ id }) => id === 'map-selection-edit-anchor-label'))
        .toMatchObject({ kind: 'button', symbol: 'penTool', label: undefined });
    });
    expect(surface.actions.find(({ id }) => id === 'map-selection-edit-anchor-label')?.label)
      .toBe('Edit Old Label label');

    surface.actions.find(({ id }) => id === 'map-selection-edit-anchor-label')?.activate();
    surface = buildMapCanvasTool(toolContext);
    const editor = surface.textEditors?.find(({ id }) => id === 'map-selection-edit-anchor-label')?.editor;
    expect(editor?.snapshot()).toMatchObject({ value: 'Old Label', focused: true });
    expect(surface.nodes.find(({ id }) => id === 'map-selection-edit-anchor-label'))
      .toMatchObject({ kind: 'field' });

    editor?.setValue('   ');
    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-selection-confirm-anchor-label')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document().revision).toBe(beforeRevision);
    expect(editedAnchor()?.label).toBe('Old Label');
    expect(editor?.snapshot().value).toBe('   ');
    expect(surface.nodes.find(({ id }) => id === 'map-selection-edit-anchor-label'))
      .toMatchObject({ kind: 'field', tone: 'danger' });

    editor?.setValue('x'.repeat(97));
    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-selection-confirm-anchor-label')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document().revision).toBe(beforeRevision);
    expect(editedAnchor()?.label).toBe('Old Label');
    expect(editor?.snapshot().value).toHaveLength(97);
    expect(surface.actions.find(({ id }) => id === 'map-selection-edit-anchor-label')?.label)
      .toContain('96 characters or fewer');

    editor?.setValue(' Orchard Gate ');
    surface = buildMapCanvasTool(toolContext);
    expect(surface.input?.keyDown?.({
      key: 'Enter', repeat: false, shiftKey: false, altKey: false,
      ctrlKey: false, metaKey: false,
    })).toBe(true);
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document()).toMatchObject({ revision: beforeRevision + 1 });
    expect(editedAnchor()).toMatchObject({
      id: 'poi-1', label: 'Orchard Gate', tileX: 2, tileY: 2, elevation: 0,
    });
    expect(surface.textEditors?.some(({ id }) => id === 'map-selection-edit-anchor-label')).toBe(false);
    state.model.undo();
    expect(editedAnchor()?.label).toBe('Old Label');

    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-selection-edit-anchor-label')?.activate();
    surface = buildMapCanvasTool(toolContext);
    const cancelledEditor = surface.textEditors?.find(
      ({ id }) => id === 'map-selection-edit-anchor-label',
    )?.editor;
    cancelledEditor?.setValue('Discard Me');
    expect(surface.input?.keyDown?.({
      key: 'Escape', repeat: false, shiftKey: false, altKey: false,
      ctrlKey: false, metaKey: false,
    })).toBe(true);
    surface = buildMapCanvasTool(toolContext);
    expect(editedAnchor()?.label).toBe('Old Label');
    expect(surface.textEditors?.some(({ id }) => id === 'map-selection-edit-anchor-label')).toBe(false);

    surface.actions.find(({ id }) => id === 'map-selection-edit-anchor-label')?.activate();
    surface = buildMapCanvasTool(toolContext);
    const disposedEditor = surface.textEditors?.find(
      ({ id }) => id === 'map-selection-edit-anchor-label',
    )?.editor;
    disposedEditor?.setValue('Discard On Dispose');
    surface.lifecycle?.dispose();
    expect(disposedEditor?.snapshot().focused).toBe(false);
    expect(editedAnchor()?.label).toBe('Old Label');
  });

  it('previews finite-map crop loss in canvas chrome before one undoable resize command', () => {
    const protectedMap = buildMapCanvasTool(context('/build/map'));
    expect(protectedMap.actions.find(({ id }) => id === 'map-resize-mode')).toMatchObject({
      disabled: true, label: 'Live island dimensions are fixed by server authority',
    });
    expect(protectedMap.actions.some(({ id }) => id === 'map-resize-west-shrink')).toBe(false);
    const procedural = buildMapCanvasTool(context('/build/map/procedural-world'));
    expect(procedural.actions.find(({ id }) => id === 'map-resize-mode')).toMatchObject({
      disabled: true, label: 'Signed procedural worlds have no finite map edge',
    });
    expect(procedural.actions.some(({ id }) => id === 'map-resize-west-shrink')).toBe(false);

    const toolContext = context('/build/map/terrain-lab');
    let surface = buildMapCanvasTool(toolContext);
    expect(surface.actions.find(({ id }) => id === 'map-resize-mode')).toMatchObject({ disabled: false });
    surface.actions.find(({ id }) => id === 'map-resize-mode')?.activate();
    surface = buildMapCanvasTool(toolContext);
    const resizeActions = surface.actions.filter(({ id }) => id.startsWith('map-resize-'));
    expect(resizeActions).toHaveLength(9);
    expect(resizeActions.filter(({ id }) => id !== 'map-resize-mode')
      .every(({ disabled }) => !disabled)).toBe(true);
    expect(surface.nodes.filter(({ id }) => id.startsWith('map-resize-') && id !== 'map-resize-mode')
      .every(({ bounds }) => bounds.width >= 40 && bounds.height >= 40)).toBe(true);
    type ResizeProbe = {
      readonly model: { document(): { readonly width: number; readonly height: number } };
    };
    const state = toolContext.controller.toolState<ResizeProbe>('map-canvas:terrain-lab', () => {
      throw new Error('map state was not retained');
    });
    const initial = { width: state.model.document().width, height: state.model.document().height };

    surface.actions.find(({ id }) => id === 'map-resize-west-shrink')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document()).toMatchObject(initial);
    expect(surface.nodes.find(({ id }) => id === 'map-resize-preview-dimensions')?.label)
      .toContain(`CROP WEST · ${initial.width - 1}×${initial.height}`);
    expect(surface.nodes.find(({ id }) => id === 'map-resize-preview-loss')?.label)
      .toMatch(/OBJECT \d+ · TRANSITION \d+ · OTHER \d+/u);
    expect(surface.actions.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'map-resize-cancel', 'map-resize-confirm',
    ]));
    expect(surface.input?.pointerDown?.({
      point: { x: WORKSPACE.x + 100, y: WORKSPACE.y + 100 }, button: 0, pointerId: 1,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    })).toBe(true);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => fakeCanvasContext() })),
    });
    const previewDrawing = fakeCanvasContext();
    expect(() => surface.draw?.(previewDrawing, {} as StudioCanvasShellArt)).not.toThrow();
    expect(previewDrawing.fillRect).toHaveBeenCalled();
    expect(previewDrawing.setLineDash).toHaveBeenCalledWith([6, 4]);
    vi.unstubAllGlobals();

    expect(surface.input?.keyDown?.({ key: 'Escape', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document()).toMatchObject(initial);
    expect(surface.actions.some(({ id }) => id === 'map-resize-confirm')).toBe(false);

    surface.actions.find(({ id }) => id === 'map-resize-west-shrink')?.activate();
    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-resize-confirm')?.activate();
    expect(state.model.document()).toMatchObject({ width: initial.width - 1, height: initial.height });
    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-undo')?.activate();
    expect(state.model.document()).toMatchObject(initial);
    surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-redo')?.activate();
    expect(state.model.document()).toMatchObject({ width: initial.width - 1, height: initial.height });
  });

  it('gates terrain authoring controls when the active terrain layer is hidden or locked', () => {
    const toolContext = context('/build/map');
    let surface = buildMapCanvasTool(toolContext);
    surface.actions.find(({ id }) => id === 'map-layer-visible-terrain')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.actions.filter(({ id }) => id.startsWith('map-terrain-tool-'))
      .every(({ disabled }) => disabled)).toBe(true);

    surface.actions.find(({ id }) => id === 'map-layer-visible-terrain')?.activate();
    surface.actions.find(({ id }) => id === 'map-layer-select-generated_base')?.activate();
    surface = buildMapCanvasTool(toolContext);
    expect(surface.actions.filter(({ id }) => id.startsWith('map-terrain-tool-'))
      .every(({ disabled }) => disabled)).toBe(true);
  });

  it('routes Space plus primary drag to map panning without an edit', () => {
    const toolContext = context('/build/map');
    const surface = buildMapCanvasTool(toolContext);
    const state = toolContext.controller.toolState<{
      readonly model: { canUndo(): boolean };
      readonly interaction: { snapshot(): { readonly camera: { readonly x: number; readonly y: number;
        readonly zoom: number } } };
    }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
    const point = { x: WORKSPACE.x + 300, y: WORKSPACE.y + 220 };
    surface.input?.wheel?.({ point, deltaX: 0, deltaY: -1_000,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    const before = state.interaction.snapshot().camera;
    const pointer = { point, button: 0, pointerId: 7, spaceHeld: true,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
    expect(surface.input?.spaceDragPan).toBe(true);
    expect(surface.input?.pointerDown?.(pointer)).toBe(true);
    expect(surface.input?.pointerMove?.({ ...pointer,
      point: { x: point.x - 40, y: point.y - 30 } })).toBe(true);
    expect(surface.input?.pointerUp?.(pointer)).toBe(true);
    expect(state.interaction.snapshot().camera).not.toEqual(before);
    expect(state.model.canUndo()).toBe(false);
  });

  it('terminates map terrain work and recreates retained state after lifecycle disposal', () => {
    const workers: Array<{ terminated: boolean }> = [];
    class FakeWorker {
      terminated = false;
      constructor() { workers.push(this); }
      addEventListener(): void { /* pending until disposal */ }
      postMessage(): void { /* pending until disposal */ }
      terminate(): void { this.terminated = true; }
    }
    vi.stubGlobal('Worker', FakeWorker);
    try {
      const toolContext = context('/build/map');
      const first = buildMapCanvasTool(toolContext);
      expect(first.lifecycle?.key).toBe('map-canvas:live-island');
      expect(workers).toHaveLength(1);

      first.lifecycle?.dispose();
      expect(workers[0]?.terminated).toBe(true);

      const second = buildMapCanvasTool(toolContext);
      expect(workers).toHaveLength(2);
      expect(workers[1]?.terminated).toBe(false);
      second.lifecycle?.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores map camera, workspace, tool, layers, visibility, and palette state by route/document', () => {
    const records = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value); },
    });
    try {
      const smallControls = Object.freeze({ ...CONTROLS, height: 300 });
      const first = { ...context('/build/map'), controlsBounds: smallControls };
      let surface = buildMapCanvasTool(first);
      surface.input?.keyDown?.({ key: '7', repeat: false,
        shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      surface.actions.find(({ id }) => id === 'map-layer-visible-canopy')?.activate();
      surface.actions.find(({ id }) => id === 'map-layer-lock-objects')?.activate();
      surface.actions.find(({ id }) => id === 'map-layer-solo-gameplay')?.activate();

      type Probe = {
        readonly model: {
          workspace(): string;
          isLayerEyeVisible(id: 'canopy'): boolean;
          isLayerUserLocked(id: 'objects'): boolean;
          soloLayer(): string | null;
        };
        readonly interaction: { snapshot(): { readonly camera: { readonly x: number; readonly y: number;
          readonly zoom: number }; readonly terrainTool: string; readonly activeLayer: string } };
        readonly search: { setValue(value: string): void; snapshot(): { readonly value: string } };
        readonly worldOutlinerSearch: { setValue(value: string): void; snapshot(): { readonly value: string } };
        readonly worldOutlinerState: { readonly expandedIds: readonly string[]; readonly selectedId: string | null };
        readonly leftView: string;
        paletteOffset: number;
      };
      const firstState = first.controller.toolState<Probe>('map-canvas:live-island', () => {
        throw new Error('map state was not retained');
      });
      firstState.search.setValue('e');
      surface = buildMapCanvasTool(first);
      const paletteAction = surface.actions.find(({ id }) => id.startsWith('map-terrain-tool-'))!;
      const palettePoint = { x: paletteAction.bounds.x + 2, y: paletteAction.bounds.y + 2 };
      surface.input?.wheel?.({ point: palettePoint, deltaX: 0, deltaY: 1,
        shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      surface.input?.wheel?.({ point: palettePoint, deltaX: 0, deltaY: 1,
        shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      surface.input?.wheel?.({ point: { x: WORKSPACE.x + 100, y: WORKSPACE.y + 100 },
        deltaX: 0, deltaY: -1, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      buildMapCanvasTool(first);
      const expectedCamera = firstState.interaction.snapshot().camera;
      expect(firstState.paletteOffset).toBeGreaterThan(0);
      setOutlinerView(first, 'world');
      surface = buildMapCanvasTool(first);
      firstState.worldOutlinerSearch.setValue('farm tree');
      buildMapCanvasTool(first);
      expect(firstState.leftView).toBe('world');
      expect(firstState.worldOutlinerState.expandedIds).toContain('space:0');

      const second = { ...context('/build/map'), controlsBounds: smallControls };
      buildMapCanvasTool(second);
      const secondState = second.controller.toolState<Probe>('map-canvas:live-island', () => {
        throw new Error('map state was not restored');
      });
      expect(secondState.model.workspace()).toBe('terrain');
      expect(secondState.interaction.snapshot()).toMatchObject({
        camera: expectedCamera, terrainTool: 'water', activeLayer: 'terrain',
      });
      expect(secondState.model.isLayerEyeVisible('canopy')).toBe(false);
      expect(secondState.model.isLayerUserLocked('objects')).toBe(true);
      expect(secondState.model.soloLayer()).toBeNull();
      expect(secondState.search.snapshot().value).toBe('e');
      expect(secondState.paletteOffset).toBe(firstState.paletteOffset);
      expect(secondState.leftView).toBe('palette');
      expect(secondState.worldOutlinerSearch.snapshot().value).toBe('farm tree');
      expect(secondState.worldOutlinerState.expandedIds).toContain('space:0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(BUILDERS)('builds functional %s controls and a clipped workspace draw layer', (toolId, path, builder) => {
    const surface = builder(context(path));
    assertSurface(surface, toolId);
    expect(() => surface.draw?.(fakeCanvasContext(), {} as StudioCanvasShellArt)).not.toThrow();
  });

  it('shares the global gray-white grid preference with Object Studio', () => {
    const toolContext = context('/build/object');
    const surface = buildObjectCanvasTool(toolContext);
    const visible = fakeCanvasContext();
    surface.draw?.(visible, {} as StudioCanvasShellArt);
    expect(visible.strokeStyle).toBe('rgba(255, 255, 255, 0.52)');
    expect(visible.stroke).toHaveBeenCalled();

    expect(toolContext.controller.toggleGrid()).toBe(false);
    const hidden = fakeCanvasContext();
    surface.draw?.(hidden, {} as StudioCanvasShellArt);
    expect(hidden.stroke).not.toHaveBeenCalled();
  });

  it('mutates retained character state through a semantic canvas action', () => {
    const toolContext = context('/author/character');
    const initial = buildCharacterCanvasTool(toolContext);
    initial.actions.find(({ id }) => id === 'character-facing-right')?.activate();
    const updated = buildCharacterCanvasTool(toolContext);
    expect(updated.nodes.find(({ id }) => id === 'character-facing-right')?.state).toBe('active');
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('contains no DOM, HTML, or SVG implementation path in the canonical adapters', () => {
    const sources = [
      'build-canvas-common.ts', 'map/canvas.ts', 'object/canvas.ts', 'tiles/canvas.ts',
      'character/canvas.ts', 'audio/canvas.ts', 'ui-lab/canvas.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    expect(sources).not.toMatch(/document\.(?:createElement|querySelector|body|head)|createElement|HTMLElement|innerHTML|insertAdjacentHTML|<svg|SVGElement/u);
    expect(sources).toContain('layoutUiFrameSlots');
    expect(sources).toContain('layoutUiFlex');
    expect(sources).toContain('controlsBounds');
    expect(sources).toContain('workspaceBounds');
  });

  it('leaves transparent editor workspaces open for the shared alpha grid', () => {
    for (const path of ['object/canvas.ts', 'tiles/canvas.ts', 'character/canvas.ts', 'ui-lab/canvas.ts']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source, path).not.toMatch(/fillRect\((?:workspaceBody|target)\.x,\s*(?:workspaceBody|target)\.y,\s*(?:workspaceBody|target)\.width/gu);
    }
  });
});


describe('square icon controls', () => {
  it('keeps the painted icon and its hit target square inside a stretched layout cell', () => {
    const parts = canvasParts();
    canvasAction(parts, 'undo', 'Undo', { x: 10, y: 20, width: 72, height: 40 }, () => {}, { symbol: 'undo' });
    expect(parts.nodes[0]!.bounds).toEqual({ x: 26, y: 20, width: 40, height: 40 });
    expect(parts.actions[0]!.bounds).toEqual(parts.nodes[0]!.bounds);
    canvasAction(parts, 'text', 'Rename', { x: 10, y: 60, width: 100, height: 40 }, () => {});
    expect(parts.nodes[1]!.bounds.width).toBe(100);
  });
});
