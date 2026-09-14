import { createMapPrefabDocument, createTerrainLabDocument, migrateMapDocumentV2 } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { planMapOutlinerMutation, type MapOutlinerMutationGuard } from './outliner-authored-actions.js';

function document() {
  const base = migrateMapDocumentV2(createTerrainLabDocument());
  const prefab = createMapPrefabDocument({ id: 'apple-tree', title: 'Apple Tree' });
  return {
    ...base,
    prefabs: [prefab],
    objects: [{
      id: 'tree-1', prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: 3, tileY: 4, elevation: 0, layer: 'objects' as const,
      quarterTurns: 0 as const, flipX: false, enabled: true,
    }],
    landmarks: [{
      id: 'dock-1', sourceDecorationId: 5, groupId: 'fisherman_fin_camp' as const,
      groupLabel: 'Fisher Dock', kind: 'fisher_dock' as const,
      tileX: 5, tileY: 6, elevation: 0, layer: 'ground' as const,
      variant: 0, animationOffset: 0, quarterTurns: 0 as const, flipX: false, enabled: true,
    }],
  };
}

const writable = (overrides: Partial<MapOutlinerMutationGuard> = {}): MapOutlinerMutationGuard => ({
  access: 'write', conflict: false, publishing: false,
  hiddenLayers: new Set(), lockedLayers: new Set(), ...overrides,
});

describe('Map authored Outliner mutation planner', () => {
  it('plans object and landmark layer changes as exactly one undo entry', () => {
    expect(planMapOutlinerMutation(document(), {
      kind: 'reparent', view: 'world', nodeKind: 'object', nodeId: 'tree-1', targetLayer: 'ground',
    }, writable())).toEqual({
      ok: true,
      operation: { kind: 'reparent_object', id: 'tree-1', targetLayer: 'ground', undoEntries: 1 },
    });
    expect(planMapOutlinerMutation(document(), {
      kind: 'reparent', view: 'world', nodeKind: 'landmark', nodeId: 'dock-1', targetLayer: 'canopy',
    }, writable())).toEqual({
      ok: true,
      operation: { kind: 'reparent_landmark', id: 'dock-1', targetLayer: 'canopy', undoEntries: 1 },
    });
  });

  it('keeps runtime rows, immutable nodes and fixed-parent anchors read-only', () => {
    expect(planMapOutlinerMutation(document(), {
      kind: 'reparent', view: 'live', nodeKind: 'object', nodeId: 'tree-1', targetLayer: 'ground',
    }, writable())).toEqual({ ok: false, reason: 'runtime_read_only' });
    expect(planMapOutlinerMutation(document(), {
      kind: 'reparent', view: 'world', nodeKind: 'generated', nodeId: 'tree', targetLayer: 'ground',
    }, writable())).toEqual({ ok: false, reason: 'immutable_node' });
    expect(planMapOutlinerMutation(document(), {
      kind: 'reparent', view: 'world', nodeKind: 'anchor', nodeId: 'spawn', targetLayer: 'ground',
    }, writable())).toEqual({ ok: false, reason: 'schema_parent_fixed' });
  });

  it('fails closed for access, conflict, publishing and malicious cycles', () => {
    const request = {
      kind: 'reparent' as const, view: 'world' as const, nodeKind: 'object' as const,
      nodeId: 'tree-1', targetLayer: 'ground' as const,
    };
    expect(planMapOutlinerMutation(document(), request, writable({ access: 'read_only' })))
      .toEqual({ ok: false, reason: 'authority_read_only' });
    expect(planMapOutlinerMutation(document(), request, writable({ conflict: true })))
      .toEqual({ ok: false, reason: 'document_conflict' });
    expect(planMapOutlinerMutation(document(), request, writable({ publishing: true })))
      .toEqual({ ok: false, reason: 'publish_in_progress' });
    expect(planMapOutlinerMutation(document(), {
      ...request, targetAncestorIds: ['space:0', 'tree-1'],
    }, writable())).toEqual({ ok: false, reason: 'cycle_forbidden' });
  });

  it('rejects hidden, locked, incompatible, missing and unchanged layers', () => {
    const request = {
      kind: 'reparent' as const, view: 'world' as const, nodeKind: 'object' as const,
      nodeId: 'tree-1', targetLayer: 'ground' as const,
    };
    expect(planMapOutlinerMutation(document(), request, writable({ hiddenLayers: new Set(['ground']) })))
      .toEqual({ ok: false, reason: 'layer_hidden' });
    expect(planMapOutlinerMutation(document(), request, writable({ lockedLayers: new Set(['objects']) })))
      .toEqual({ ok: false, reason: 'layer_locked' });
    expect(planMapOutlinerMutation(document(), { ...request, targetLayer: 'anchors' }, writable()))
      .toEqual({ ok: false, reason: 'layer_incompatible' });
    expect(planMapOutlinerMutation(document(), { ...request, nodeId: 'missing' }, writable()))
      .toEqual({ ok: false, reason: 'node_missing' });
    expect(planMapOutlinerMutation(document(), { ...request, targetLayer: 'objects' }, writable()))
      .toEqual({ ok: false, reason: 'no_change' });
  });

  it('reorders only editable adjacent object layers', () => {
    expect(planMapOutlinerMutation(document(), {
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'objects', direction: 'toward_back',
    }, writable())).toEqual({
      ok: true,
      operation: { kind: 'reorder_layer', id: 'objects', direction: 'toward_back', undoEntries: 1 },
    });
    expect(planMapOutlinerMutation(document(), {
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'terrain', direction: 'toward_front',
    }, writable())).toEqual({ ok: false, reason: 'ordering_boundary' });
    expect(planMapOutlinerMutation(document(), {
      kind: 'reorder', view: 'world', nodeKind: 'object', nodeId: 'tree-1', direction: 'toward_front',
    }, writable())).toEqual({ ok: false, reason: 'schema_order_derived' });
  });

  it('cannot bypass immutable system locks with an incomplete caller lock set', () => {
    expect(planMapOutlinerMutation(document(), {
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'generated_base',
      direction: 'toward_front',
    }, writable())).toEqual({ ok: false, reason: 'layer_locked' });
    expect(planMapOutlinerMutation(document(), {
      kind: 'reparent', view: 'world', nodeKind: 'object', nodeId: 'tree-1',
      targetLayer: 'player_owned',
    }, writable())).toEqual({ ok: false, reason: 'layer_incompatible' });
  });
});
