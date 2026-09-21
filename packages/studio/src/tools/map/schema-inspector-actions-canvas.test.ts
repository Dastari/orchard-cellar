import { kitElement, kitElements, pressKit, chooseKit } from '../kit-test-driver.js';
import { describe, expect, it, vi } from 'vitest';
import type { AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { StudioShellController, type StudioConnectionFactory } from '../../shell/controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/studio-connection.js';
import { buildMapCanvasTool } from './canvas.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 250, height: 620 });
const WORKSPACE = Object.freeze({ x: 280, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1120, y: 20, width: 300, height: 620 });

function preview(): AdminMutationPreview {
  return Object.freeze({
    operation: 'set_entity_state',
    target: { kind: 'entity' as const, entityId: '41' },
    baseVersion: 'object:exact-before',
    preview: Object.freeze({
      changes: Object.freeze([{
        path: '/entities/0/state/lit',
        before: { present: true as const, value: true },
        after: { present: true as const, value: false },
      }]),
      truncated: false,
    }),
    warnings: Object.freeze([]),
    expiresAtMicros: '1780000060000000',
  });
}

function probe() {
  const calls: Parameters<AdminObjectsApi['mutate']>[] = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => ({
      rows: [{ entityId: '41', kind: 'placeable' as const, definitionId: 'object:standing_torch',
        displayName: 'Standing Torch', ownerIdentity: 'player-a', spaceId: '0', tileX: 12, tileY: 14,
        state: { lit: true }, version: '' }],
      nextCursor: null, worldVersion: '', rowsScanned: 1,
    })),
    container: vi.fn(async () => { throw new Error('not used'); }),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push([mutation, expectedBaseVersion, previewFingerprint]);
      const exactPreview = preview();
      const result: AdminObjectMutationResult = {
        preview: exactPreview,
        previewFingerprint: 'preview:schema-canvas-exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? exactPreview.baseVersion : 'object:exact-after',
        audit: mutation.dryRun ? null : {
          id: 'audit-schema-canvas', actorIdentity: 'owner-identity', operation: 'set_entity_state',
          target: exactPreview.target, occurredAtMicros: '1780000000000000',
          payload: {
            schemaVersion: 1, clientMutationId: mutation.clientMutationId,
            target: exactPreview.target, reason: mutation.reason,
            changes: exactPreview.preview.changes,
            inverse: { operation: 'set_entity_state', args: { entityId: '41', patch: { lit: true } } },
          },
        },
        notice: mutation.dryRun ? null : 'Standing Torch was changed by an administrator.',
      };
      return result;
    }),
  };
  return { api, calls };
}

async function contextFor(
  api: AdminObjectsApi,
  role: StudioConnectionView['role'] = 'owner',
): Promise<StudioCanvasToolContext> {
  const definition = {
    id: 'object:standing_torch', kind: 'object', schemaVersion: 1, displayName: 'Standing Torch',
    components: { states: { lit: { type: 'bool', default: false } } },
  };
  let changed = (): void => undefined;
  const view: StudioConnectionView = {
    connected: true, synchronizing: false, identity: 'owner-identity', role,
    contentRevision: 1n, contentHead: null,
    contentDefinitions: [{ kind: 'object', json: JSON.stringify(definition) }] as never,
    mapRevision: 7, mapDocument: null, publishingMap: false, worldMutating: false, error: null,
    rows: {
      placeables: [{
        id: 41n, spaceId: 0, kind: 'standing_torch', tileX: 12, tileY: 14,
        elevation: 0, facing: 'down', definitionId: 'object:standing_torch', state: { lit: true },
      }],
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

function selectTorch(context: StudioCanvasToolContext): void {
  buildMapCanvasTool(context);
  const state = context.controller.toolState<{
    readonly model: { selectEntity(kind: string, id: string, spaceId: number): void };
  }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
  state.model.selectEntity('placeable', '41', 0);
}

describe('Map schema Inspector Canvas actions', () => {
  it('keeps a typed state edit behind exact preview and explicit confirmation', async () => {
    const { api, calls } = probe();
    const context = await contextFor(api);
    selectTorch(context);
    let surface = buildMapCanvasTool(context);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(context);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-view');
    });
    chooseKit(surface, 'map-selection-view', 'Schema');
    surface = buildMapCanvasTool(context);
    expect(kitElements(surface).some(({ id }) => id === 'map-selection-property-map')).toBe(false);
    expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-property-map-label');
    expect(kitElement(surface, 'map-selection-property-map-label')?.label)
      .toContain('READ ONLY');
    const retained = context.controller.toolState<{
      selectionOffset: number;
      readonly schemaActionEditor: { setValue(value: string): void };
      readonly schemaActionError: string | null;
    }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
    retained.selectionOffset = Number.MAX_SAFE_INTEGER;
    surface = buildMapCanvasTool(context);

    const stateAction = kitElement(surface, 'map-selection-property-live-state-lit');
    expect(stateAction).toMatchObject({ disabled: false, label: 'Change' });

    pressKit(surface, 'map-selection-property-live-state-lit');
    surface = buildMapCanvasTool(context);
    retained.schemaActionEditor.setValue('false');
    surface = buildMapCanvasTool(context);
    pressKit(surface, 'map-schema-action-proceed');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject([
      { operation: 'set_entity_state', entityId: '41', patch: { lit: false }, dryRun: true },
      '', null,
    ]);

    surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-schema-action-receipt')?.label)
      .toBe('BASE object:exact-before · RECEIPT preview:schema-canvas-exact');
    pressKit(surface, 'map-schema-action-proceed');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject([
      { operation: 'set_entity_state', entityId: '41', patch: { lit: false }, dryRun: false },
      'object:exact-before', 'preview:schema-canvas-exact',
    ]);
    expect(retained.schemaActionError).toBeNull();
    await vi.waitFor(() => {
      expect(context.controller.notifications.items().map(({ kind, title, detail }) => ({ kind, title, detail })))
        .toContainEqual({ kind: 'success', title: 'Lit changed', detail: 'Audit audit-schema-canvas' });
    });
  });

  it('leaves the declared row visible but disabled when authority is insufficient', async () => {
    const { api } = probe();
    const context = await contextFor(api, 'content_editor');
    selectTorch(context);
    let surface = buildMapCanvasTool(context);
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(context);
      expect(kitElements(surface).map(({ id }) => id)).toContain('map-selection-view');
    });
    chooseKit(surface, 'map-selection-view', 'Schema');
    surface = buildMapCanvasTool(context);
    const retained = context.controller.toolState<{ selectionOffset: number }>(
      'map-canvas:live-island', () => { throw new Error('map state was not retained'); },
    );
    retained.selectionOffset = Number.MAX_SAFE_INTEGER;
    surface = buildMapCanvasTool(context);
    expect(kitElements(surface).some(element => element.label.includes('owner or administrator'))).toBe(true);
    expect(kitElement(surface, 'map-selection-property-live-state-lit'))
      .toMatchObject({ disabled: true });
  });
});
