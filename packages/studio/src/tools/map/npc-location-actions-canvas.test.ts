import { kitElement, kitElements, pressKit } from '../kit-test-driver.js';
import { describe, expect, it, vi } from 'vitest';
import type { MapDocumentV3 } from '@orchard/sim';
import type {
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { StudioShellController, type StudioConnectionFactory } from '../../shell/controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/studio-connection.js';
import { buildMapCanvasTool, selectedGeneratedMapDescriptor } from './canvas.js';
import type { MapEditorLiveMarker } from './editor-controller.js';
import { buildMapEditorTerrain } from './editor-terrain-build.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 250, height: 620 });
const WORKSPACE = Object.freeze({ x: 280, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1120, y: 20, width: 280, height: 620 });
const TILE_FIXED = 256;

function mutationPreview(): AdminMutationPreview {
  return Object.freeze({
    operation: 'relocate_npc',
    target: { kind: 'entity' as const, entityId: '7' },
    baseVersion: 'object:npc-before-canvas',
    preview: { changes: [{ path: '/entities/0/tileX',
      before: { present: true, value: 22 }, after: { present: true, value: 40 } }],
    truncated: false },
    warnings: [],
    expiresAtMicros: '1780000060000000',
  });
}

function liveProbe() {
  const calls: Parameters<AdminObjectsApi['mutate']>[] = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => ({ rows: [], nextCursor: null,
      worldVersion: 'unused', rowsScanned: 0 })),
    container: vi.fn(async () => { throw new Error('NPC path must not use container authority'); }),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push([mutation, expectedBaseVersion, previewFingerprint]);
      const preview = mutationPreview();
      const result: AdminObjectMutationResult = {
        preview,
        previewFingerprint: 'preview:npc-canvas-exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? preview.baseVersion : 'object:npc-after-canvas',
        audit: mutation.dryRun ? null : {
          id: 'audit-npc-canvas', actorIdentity: 'owner-identity',
          operation: 'relocate_npc', target: preview.target,
          occurredAtMicros: '1780000000000000',
          payload: { schemaVersion: 1, clientMutationId: mutation.clientMutationId,
            target: preview.target, reason: mutation.reason, changes: preview.preview.changes,
            inverse: { operation: 'relocate_npc', args: {
              npcId: '7', spaceId: '0', tileX: 22, tileY: 21,
            } } },
        },
        notice: null,
      };
      return result;
    }),
  };
  return { api, calls };
}

async function npcContext(
  api: AdminObjectsApi,
  npc: StudioConnectionView['rows']['npcs'][number] = {
    id: 7n, spaceId: 0, kind: 'npc:fisherman_fin', displayName: 'Fisherman Fin',
    x: 22 * TILE_FIXED + TILE_FIXED / 2, y: 21 * TILE_FIXED + TILE_FIXED / 2,
    homeX: 20 * TILE_FIXED + TILE_FIXED / 2, homeY: 20 * TILE_FIXED + TILE_FIXED / 2,
    facing: 'down', moving: false, wanderDirection: 'idle', health: 10,
  },
): Promise<StudioCanvasToolContext> {
  let changed = (): void => undefined;
  const view: StudioConnectionView = {
    connected: true, synchronizing: false, identity: 'owner-identity', role: 'owner',
    contentRevision: null, contentHead: null, contentDefinitions: [],
    mapRevision: 7, mapDocument: null, publishingMap: false, worldMutating: false,
    error: null,
    rows: { placeables: [], npcs: [npc], homesteads: [], players: [] },
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

function selectNpc(context: StudioCanvasToolContext): void {
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
      liveMarkers(): readonly MapEditorLiveMarker[];
      tileAtPoint: (point: { readonly x: number; readonly y: number }) => {
        readonly tileX: number; readonly tileY: number; readonly elevation: number;
      } | null;
    };
  }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
  state.renderer.inspectionTerrain = () => buildMapEditorTerrain(state.model.document());
  state.model.selectEntity('npc', '7', 0);
  state.interaction.tileAtPoint = () => ({ tileX: 40, tileY: 41, elevation: 2 });
  expect(state.interaction.liveMarkers()).toEqual([
    expect.objectContaining({
      id: '7', entityKind: 'npc', homeTileX: 20, homeTileY: 20,
    }),
  ]);
  const descriptor = selectedGeneratedMapDescriptor(
    state.model.document(),
    state.model.selection() as Parameters<typeof selectedGeneratedMapDescriptor>[1],
    state.interaction.liveMarkers() as Parameters<typeof selectedGeneratedMapDescriptor>[2],
    buildMapEditorTerrain(state.model.document()),
  );
  expect(descriptor?.details).toContainEqual({ label: 'Home', value: '20, 20' });
}

describe('Map Editor Canvas NPC home/location actions', () => {
  it('moves one exact Outliner/Canvas NPC only after preview and explicit confirmation', async () => {
    const probe = liveProbe();
    const context = await npcContext(probe.api);
    selectNpc(context);

    let surface = buildMapCanvasTool(context);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(context);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-npc-location');
    });
    expect(kitElement(surface, 'map-selection-npc-location'))
      .toMatchObject({ kind: 'button', label: 'Move NPC' });
    pressKit(surface, 'map-selection-npc-location');
    surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-npc-location-receipt')?.label)
      .toBe('NO WORLD CHANGE · CHOOSE A TILE');

    expect(surface.input?.pointerDown?.({
      point: { x: WORKSPACE.x + 100, y: WORKSPACE.y + 100 }, button: 0, pointerId: 1,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    })).toBe(true);
    await vi.waitFor(() => expect(probe.calls).toHaveLength(1));
    expect(probe.calls[0]).toMatchObject([
      { operation: 'relocate_npc', npcId: '7', spaceId: '0', tileX: 40, tileY: 41,
        dryRun: true },
      '', null,
    ]);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(context);
      expect(kitElement(surface, 'map-npc-location-confirm'))
        .toMatchObject({ disabled: false });
    });
    expect(kitElement(surface, 'map-npc-location-target')?.label)
      .toContain('LIVE 22,21 · HOME 20,20 → 40,41');
    expect(kitElement(surface, 'map-npc-location-receipt')?.label)
      .toBe('BASE object:npc-before-canvas · RECEIPT preview:npc-canvas-exact');
    expect(probe.calls).toHaveLength(1);

    expect(surface.input?.keyDown?.({ key: 'Escape', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    expect(probe.calls).toHaveLength(1);
    surface = buildMapCanvasTool(context);
    expect(kitElements(surface).some(({ id }) => id === 'map-npc-location-confirm')).toBe(false);

    pressKit(surface, 'map-selection-npc-location');
    surface = buildMapCanvasTool(context);
    surface.input?.pointerDown?.({ point: { x: 400, y: 200 }, button: 0, pointerId: 2,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    await vi.waitFor(() => {
      expect(probe.calls).toHaveLength(2);
      surface = buildMapCanvasTool(context);
      expect(kitElement(surface, 'map-npc-location-confirm')?.disabled).toBe(false);
    });
    pressKit(surface, 'map-npc-location-confirm');
    await vi.waitFor(() => expect(probe.calls).toHaveLength(3));
    expect(probe.calls[2]).toMatchObject([
      { operation: 'relocate_npc', npcId: '7', dryRun: false },
      'object:npc-before-canvas', 'preview:npc-canvas-exact',
    ]);
  });

  it('shows the action but disables generated wildlife and player-custody mounts', async () => {
    const wildlifeContext = await npcContext(liveProbe().api, {
      id: 7n, spaceId: 0, kind: 'wildlife', displayName: 'Doe',
      x: 22 * TILE_FIXED, y: 21 * TILE_FIXED, homeX: 20 * TILE_FIXED, homeY: 20 * TILE_FIXED,
      species: 'deer', variant: 2,
    });
    selectNpc(wildlifeContext);
    let surface = buildMapCanvasTool(wildlifeContext);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(wildlifeContext);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-npc-location');
    });
    expect(kitElement(surface, 'map-selection-npc-location'))
      .toMatchObject({ disabled: true });
    expect(kitElements(surface).some(element => /world authority|player custody/u.test(element.label))).toBe(true);

    const custodyContext = await npcContext(liveProbe().api, {
      id: 7n, spaceId: 0, kind: 'horse', displayName: 'Bramble',
      x: 22 * TILE_FIXED, y: 21 * TILE_FIXED, homeX: 20 * TILE_FIXED, homeY: 20 * TILE_FIXED,
      riderIdentity: 'player-1',
    });
    selectNpc(custodyContext);
    surface = buildMapCanvasTool(custodyContext);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(custodyContext);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-npc-location');
    });
    expect(kitElement(surface, 'map-selection-npc-location'))
      .toMatchObject({ disabled: true });
    expect(kitElements(surface).some(element => /world authority|player custody/u.test(element.label))).toBe(true);
  });
});
