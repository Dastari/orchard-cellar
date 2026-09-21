import { kitElement, kitElements, pressKit } from '../kit-test-driver.js';
import { describe, expect, it, vi } from 'vitest';
import type { MapDocumentV3 } from '@orchard/sim';
import type {
  AdminEntityMutation,
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { StudioShellController, type StudioConnectionFactory } from '../../shell/controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/studio-connection.js';
import { buildMapCanvasTool, selectedGeneratedMapDescriptor } from './canvas.js';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import { inspectMapSelection } from './selection-inspection.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 250, height: 620 });
const WORKSPACE = Object.freeze({ x: 280, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1120, y: 20, width: 280, height: 620 });

function mutationPreview(operation: AdminEntityMutation['operation']): AdminMutationPreview {
  return Object.freeze({
    operation,
    target: { kind: 'entity' as const, entityId: '41' },
    baseVersion: 'object:before-canvas',
    preview: { changes: [{ path: '/entity', before: { present: true }, after: { present: true } }],
      truncated: false },
    warnings: operation === 'despawn_entity' ? ['Container contents will spill safely.'] : [],
    expiresAtMicros: '1780000060000000',
  });
}

function liveProbe() {
  const calls: Parameters<AdminObjectsApi['mutate']>[] = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => ({ rows: [], nextCursor: null,
      worldVersion: 'unused', rowsScanned: 0 })),
    container: vi.fn(async () => ({
      entityId: '41', definitionId: 'object:fruit_press', ownerIdentity: 'player-a',
      position: { spaceId: '0', tileX: 12, tileY: 14 }, state: {}, processor: null,
      slots: [null, null, null], version: '',
    })),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push([mutation, expectedBaseVersion, previewFingerprint]);
      const preview = mutationPreview(mutation.operation);
      const result: AdminObjectMutationResult = {
        preview,
        previewFingerprint: 'preview:canvas-runtime-exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? preview.baseVersion : 'object:after-canvas',
        audit: mutation.dryRun ? null : {
          id: 'audit-runtime-canvas', actorIdentity: 'owner-identity',
          operation: mutation.operation, target: preview.target,
          occurredAtMicros: '1780000000000000',
          payload: { schemaVersion: 1, clientMutationId: mutation.clientMutationId,
            target: preview.target, reason: mutation.reason, changes: preview.preview.changes,
            inverse: { operation: 'undo', args: {} } },
        },
        notice: mutation.dryRun ? null : 'The object was changed by an administrator.',
      };
      return result;
    }),
  };
  return { api, calls };
}

async function runtimeContext(
  api: AdminObjectsApi,
  role: StudioConnectionView['role'] = 'owner',
): Promise<StudioCanvasToolContext> {
  let changed = (): void => undefined;
  const view: StudioConnectionView = {
    connected: true, synchronizing: false, identity: 'owner-identity', role,
    contentRevision: null, contentHead: null, contentDefinitions: [],
    mapRevision: 7, mapDocument: null, publishingMap: false, worldMutating: false,
    error: null,
    rows: {
      placeables: [{ id: 41n, spaceId: 0, kind: 'fruit_press', tileX: 12, tileY: 14,
        elevation: 0, facing: 'down' }],
      npcs: [], homesteads: [], players: [],
    },
  };
  const factory: StudioConnectionFactory = async (_environment, onChanged): Promise<StudioLiveAdapter> => {
    changed = onChanged;
    return { view: () => view, connect: () => changed(), disconnect: () => undefined,
      adminObjects: api };
  };
  const controller = new StudioShellController(factory, null);
  controller.chooseEnvironment('local');
  await controller.connectExplicit();
  return {
    controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR,
    bounds: WORKSPACE, route: controller.activeRoute(), controller, invalidate: vi.fn(),
  };
}

function selectPress(context: StudioCanvasToolContext): void {
  buildMapCanvasTool(context);
  const state = context.controller.toolState<{
    readonly model: {
      selectEntity(entityKind: string, id: string, spaceId: number): void;
      selection(): unknown;
      document(): MapDocumentV3;
      terrainIdentity(): object;
    };
    readonly renderer: {
      inspectionTerrain(terrainIdentity: object): ReturnType<typeof buildMapEditorTerrain> | null;
    };
    readonly interaction: {
      liveMarkers(): readonly unknown[];
      tileAtPoint: (point: { readonly x: number; readonly y: number }) => {
      readonly tileX: number; readonly tileY: number; readonly elevation: number;
    } | null };
  }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
  const terrain = buildMapEditorTerrain(state.model.document());
  state.renderer.inspectionTerrain = () => terrain;
  state.model.selectEntity('placeable', '41', 0);
  state.interaction.tileAtPoint = () => ({ tileX: 20, tileY: 21, elevation: 2 });
  expect(state.model.selection()).toEqual({ kind: 'entity', entityKind: 'placeable', id: '41', spaceId: 0 });
  expect(state.interaction.liveMarkers()).toEqual([
    expect.objectContaining({ id: '41', entityKind: 'placeable', tileX: 12, tileY: 14 }),
  ]);
  const descriptor = selectedGeneratedMapDescriptor(
    state.model.document(),
    state.model.selection() as Parameters<typeof selectedGeneratedMapDescriptor>[1],
    state.interaction.liveMarkers() as Parameters<typeof selectedGeneratedMapDescriptor>[2],
    terrain,
  );
  expect(descriptor).not.toBeNull();
  expect(inspectMapSelection({
    document: state.model.document(),
    selection: state.model.selection() as Parameters<typeof inspectMapSelection>[0]['selection'],
    activeLayer: 'player_owned',
    generatedEntities: descriptor === null ? [] : [descriptor],
    terrain,
  })).not.toBeNull();
}

describe('Map Editor Canvas runtime object actions', () => {
  it('keeps player-owned move behind exact preview and explicit Canvas confirmation', async () => {
    const probe = liveProbe();
    const context = await runtimeContext(probe.api);
    selectPress(context);

    let surface = buildMapCanvasTool(context);
    const diagnostic = context.controller.toolState<{
      readonly inspectionCache: { readonly inspection: unknown } | null;
    }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
    expect(diagnostic.inspectionCache?.inspection).toBeTruthy();
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(context);
      expect(kitElements(surface).map(({ id }) => id).filter((id) => id.startsWith('map-selection')))
        .toContain('map-selection-runtime-move');
    });
    expect(kitElement(surface, 'map-selection-runtime-move'))
      .toMatchObject({ kind: 'button', label: 'Move' });
    expect(kitElement(surface, 'map-selection-runtime-repair'))
      .toMatchObject({ kind: 'button', label: 'Repair' });
    expect(kitElement(surface, 'map-selection-runtime-despawn'))
      .toMatchObject({ kind: 'button', label: 'Despawn', props: { tone: 'danger' } });

    pressKit(surface, 'map-selection-runtime-move');
    surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-runtime-object-receipt')?.label)
      .toBe('NO WORLD CHANGE · CHOOSE A TILE');
    expect(surface.input?.pointerDown?.({
      point: { x: WORKSPACE.x + 100, y: WORKSPACE.y + 100 }, button: 0, pointerId: 1,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    })).toBe(true);
    await vi.waitFor(() => expect(probe.calls).toHaveLength(1));
    expect(probe.calls[0]).toMatchObject([
      { operation: 'move_entity', entityId: '41', tileX: 20, tileY: 21, dryRun: true },
      '', null,
    ]);

    surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-runtime-object-custody')?.label)
      .toContain('PLAYER-OWNED CUSTODY');
    expect(kitElement(surface, 'map-runtime-object-receipt')?.label)
      .toBe('BASE object:before-canvas · RECEIPT preview:canvas-runtime-exact');
    expect(kitElement(surface, 'map-runtime-object-confirm'))
      .toMatchObject({ disabled: false });
    expect(probe.calls).toHaveLength(1);

    expect(surface.input?.keyDown?.({ key: 'Escape', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    expect(probe.calls).toHaveLength(1);

    surface = buildMapCanvasTool(context);
    pressKit(surface, 'map-selection-runtime-repair');
    await vi.waitFor(() => expect(probe.calls).toHaveLength(2));
    surface = buildMapCanvasTool(context);
    pressKit(surface, 'map-runtime-object-confirm');
    await vi.waitFor(() => expect(probe.calls).toHaveLength(3));
    expect(probe.calls[2]).toMatchObject([
      { operation: 'repair_entity', entityId: '41', dryRun: false },
      'object:before-canvas', 'preview:canvas-runtime-exact',
    ]);
  });

  it('marks safe despawn as destructive and disables every action for a non-admin', async () => {
    const ownerProbe = liveProbe();
    const ownerContext = await runtimeContext(ownerProbe.api);
    selectPress(ownerContext);
    let surface = buildMapCanvasTool(ownerContext);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(ownerContext);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-runtime-despawn');
    });
    pressKit(surface, 'map-selection-runtime-despawn');
    await vi.waitFor(() => expect(ownerProbe.calls).toHaveLength(1));
    surface = buildMapCanvasTool(ownerContext);
    expect(kitElement(surface, 'map-runtime-object-confirm'))
      .toMatchObject({ disabled: false });
    expect(kitElement(surface, 'map-runtime-object-confirm'))
      .toMatchObject({ props: { tone: 'danger' } });
    expect(ownerProbe.calls).toHaveLength(1);

    const deniedContext = await runtimeContext(liveProbe().api, 'content_editor');
    selectPress(deniedContext);
    surface = buildMapCanvasTool(deniedContext);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(deniedContext);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-runtime-move');
    });
    expect(kitElements(surface).some(element => element.label.includes('owner or administrator'))).toBe(true);
    for (const id of ['map-selection-runtime-move', 'map-selection-runtime-repair',
      'map-selection-runtime-despawn']) {
      expect(kitElement(surface, id)).toMatchObject({
        disabled: true,
      });
    }
  });
});
