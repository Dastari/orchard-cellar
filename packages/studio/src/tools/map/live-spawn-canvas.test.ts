import { describe, expect, it, vi } from 'vitest';
import { createMapPrefabDocument, normalizeMapPrefab } from '@orchard/sim';
import type { AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import type { AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { StudioShellController, type StudioConnectionFactory } from '../../shell/controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/studio-connection.js';
import { buildMapCanvasTool } from './canvas.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 250, height: 620 });
const WORKSPACE = Object.freeze({ x: 280, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1120, y: 20, width: 280, height: 620 });
const DEFINITIONS: readonly never[] = Object.freeze([]);

const PREVIEW: AdminMutationPreview = Object.freeze({
  operation: 'spawn_entity', target: { kind: 'space' as const, spaceId: '0' },
  baseVersion: 'objects:base-canvas',
  preview: { changes: [{ path: '/entities/next', before: { present: false },
    after: { present: true, value: { definitionId: 'object:chest' } } }], truncated: false },
  warnings: [], expiresAtMicros: '1780000060000000',
});

function liveApi() {
  const calls: Parameters<AdminObjectsApi['mutate']>[] = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => ({ rows: [], nextCursor: null,
      worldVersion: 'unused', rowsScanned: 0 })),
    container: vi.fn(async () => { throw new Error('unused'); }),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push([mutation, expectedBaseVersion, previewFingerprint]);
      return { preview: PREVIEW, previewFingerprint: 'preview:canvas-exact',
        committed: !mutation.dryRun, version: mutation.dryRun ? PREVIEW.baseVersion : 'objects:after-canvas',
        audit: null, notice: null };
    }),
  };
  return { api, calls };
}

async function liveContext(api: AdminObjectsApi): Promise<StudioCanvasToolContext> {
  let changed = (): void => undefined;
  const contentHead = ({ revision: 27n, contentHash: 'content:canvas-exact' } as unknown) as NonNullable<StudioConnectionView['contentHead']>;
  const view: StudioConnectionView = {
    connected: true, synchronizing: false, identity: 'owner-identity', role: 'owner',
    contentRevision: 27n, contentHead, contentDefinitions: DEFINITIONS,
    mapRevision: 7, mapDocument: null, publishingMap: false, worldMutating: false,
    error: null, rows: { placeables: [], npcs: [], homesteads: [], players: [] },
  };
  const factory: StudioConnectionFactory = async (_environment, onChanged): Promise<StudioLiveAdapter> => {
    changed = onChanged;
    return { view: () => view, connect: () => changed(), disconnect: () => undefined, adminObjects: api };
  };
  const controller = new StudioShellController(factory, null);
  controller.chooseEnvironment('local');
  await controller.connectExplicit();
  return {
    controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR,
    bounds: WORKSPACE, route: controller.activeRoute(), controller, invalidate: vi.fn(),
  };
}

describe('Map Editor Canvas functional live spawn mode', () => {
  it('exposes compact Canvas-native height and collision toggles with keyboard parity', async () => {
    const context = await liveContext(liveApi().api);
    let surface = buildMapCanvasTool(context);
    expect(surface.nodes.find(({ id }) => id === 'map-height-overlay')).toMatchObject({
      symbol: 'height', label: undefined,
    });
    expect(surface.nodes.find(({ id }) => id === 'map-collision-overlay')).toMatchObject({
      symbol: 'collision', label: undefined,
    });
    expect(surface.actions.find(({ id }) => id === 'map-height-overlay')?.label).toContain('(H)');
    expect(surface.actions.find(({ id }) => id === 'map-collision-overlay')?.label).toContain('(C)');

    surface.actions.find(({ id }) => id === 'map-height-overlay')?.activate();
    expect(surface.input?.keyDown?.({ key: 'c', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    surface = buildMapCanvasTool(context);
    expect(surface.nodes.find(({ id }) => id === 'map-height-overlay')?.state).toBe('active');
    expect(surface.nodes.find(({ id }) => id === 'map-collision-overlay')?.state).toBe('active');
    expect(surface.input?.keyDown?.({ key: 'g', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('uses a temporary exact preview and never commits before the Canvas confirmation action', async () => {
    const probe = liveApi();
    const context = await liveContext(probe.api);
    buildMapCanvasTool(context);
    const prefab = normalizeMapPrefab({
      ...createMapPrefabDocument({ id: 'content-chest', title: 'Chest', tags: ['object:chest'] }),
      behaviors: [{ kind: 'placeable', archetype: 'world.placeable' }],
    });
    const state = context.controller.toolState<{
      readonly model: { selectWorkspace(value: 'objects'): void };
      readonly interaction: {
        setCatalog(value: readonly typeof prefab[]): void;
        selectLayer(value: 'gameplay'): void;
        selectPrefab(value: string): void;
        tileAtPoint: (point: { readonly x: number; readonly y: number }) => {
          readonly tileX: number; readonly tileY: number; readonly elevation: number;
        } | null;
      };
      catalogDefinitionIds: ReadonlyMap<string, string>;
      catalogContentSource: readonly never[];
      catalogReady: boolean;
      liveSpawnPreviewing: boolean;
    }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
    state.model.selectWorkspace('objects');
    state.interaction.selectLayer('gameplay');
    state.interaction.setCatalog([prefab]);
    state.interaction.selectPrefab(prefab.id);
    state.interaction.tileAtPoint = () => ({ tileX: 72, tileY: 81, elevation: 2 });
    state.catalogDefinitionIds = new Map([[prefab.id, 'object:chest']]);
    state.catalogContentSource = DEFINITIONS;
    state.catalogReady = true;

    let surface = buildMapCanvasTool(context);
    const mode = surface.actions.find(({ id }) => id === 'map-live-spawn-mode');
    expect(mode).toMatchObject({ disabled: false,
      label: 'Spawn selected object as a functional live entity' });
    mode?.activate();
    surface = buildMapCanvasTool(context);
    expect(surface.nodes.find(({ id }) => id === 'map-live-spawn-mode'))
      .toMatchObject({ symbol: 'gamepad', state: 'active', label: undefined });

    expect(surface.input?.pointerDown?.({
      point: { x: WORKSPACE.x + 200, y: WORKSPACE.y + 200 }, button: 0, pointerId: 1,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    })).toBe(true);
    await vi.waitFor(() => {
      expect(probe.calls).toHaveLength(1);
      expect(state.liveSpawnPreviewing).toBe(false);
    });
    expect(probe.calls[0]?.[0]).toMatchObject({ definitionId: 'object:chest',
      tileX: 72, tileY: 81, dryRun: true });

    surface = buildMapCanvasTool(context);
    expect(surface.nodes.find(({ id }) => id === 'map-live-spawn-content')?.label)
      .toBe('CONTENT R27 · content:canvas-exact');
    expect(surface.nodes.find(({ id }) => id === 'map-live-spawn-receipt')?.label)
      .toBe('BASE objects:base-canvas · RECEIPT preview:canvas-exact');
    expect(surface.nodes.find(({ id }) => id === 'map-live-spawn-authority')?.label)
      .toContain('AUTHORITY OWNER · REASON Spawn Chest from Map Editor');
    expect(surface.actions.find(({ id }) => id === 'map-live-spawn-confirm'))
      .toMatchObject({ disabled: false });
    expect(probe.calls).toHaveLength(1);

    expect(surface.input?.keyDown?.({ key: 'Escape', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    surface = buildMapCanvasTool(context);
    expect(surface.actions.some(({ id }) => id === 'map-live-spawn-confirm')).toBe(false);
    expect(probe.calls).toHaveLength(1);

    surface.actions.find(({ id }) => id === 'map-live-spawn-mode')?.activate();
    surface = buildMapCanvasTool(context);
    surface.input?.pointerDown?.({
      point: { x: WORKSPACE.x + 200, y: WORKSPACE.y + 200 }, button: 0, pointerId: 2,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    });
    await vi.waitFor(() => {
      expect(probe.calls).toHaveLength(2);
      expect(state.liveSpawnPreviewing).toBe(false);
    });
    surface = buildMapCanvasTool(context);
    surface.actions.find(({ id }) => id === 'map-live-spawn-confirm')?.activate();
    await vi.waitFor(() => expect(probe.calls).toHaveLength(3));
    expect(probe.calls[2]).toMatchObject([
      { operation: 'spawn_entity', definitionId: 'object:chest', tileX: 72, tileY: 81, dryRun: false },
      'objects:base-canvas',
      'preview:canvas-exact',
    ]);
  });
});
