import {
  isMapObjectLayer,
  type MapContentLayerId,
  type MapDocumentV3,
  type MapObjectLayer,
} from '@orchard/sim';

export type MapOutlinerAuthoredNodeKind =
  | 'space'
  | 'layer'
  | 'object'
  | 'landmark'
  | 'anchor'
  | 'generated';

export interface MapOutlinerMutationGuard {
  readonly access: 'anonymous' | 'read_only' | 'write';
  readonly conflict: boolean;
  readonly publishing: boolean;
  readonly hiddenLayers: ReadonlySet<MapContentLayerId>;
  readonly lockedLayers: ReadonlySet<MapContentLayerId>;
}

export type MapOutlinerMutationRequest =
  | {
      readonly kind: 'reparent';
      readonly view: 'world' | 'live';
      readonly nodeKind: MapOutlinerAuthoredNodeKind;
      readonly nodeId: string;
      readonly targetLayer: MapContentLayerId;
      /** Target ancestry supplied by the retained tree hit record. */
      readonly targetAncestorIds?: readonly string[];
    }
  | {
      readonly kind: 'reorder';
      readonly view: 'world' | 'live';
      readonly nodeKind: MapOutlinerAuthoredNodeKind;
      readonly nodeId: string;
      readonly direction: 'toward_front' | 'toward_back';
    };

export type MapOutlinerMutationOperation =
  | {
      readonly kind: 'reparent_object' | 'reparent_landmark';
      readonly id: string;
      readonly targetLayer: MapObjectLayer;
      readonly undoEntries: 1;
    }
  | {
      readonly kind: 'reorder_layer';
      readonly id: MapContentLayerId;
      readonly direction: 'toward_front' | 'toward_back';
      readonly undoEntries: 1;
    };

export type MapOutlinerMutationDenial =
  | 'runtime_read_only'
  | 'authority_read_only'
  | 'document_conflict'
  | 'publish_in_progress'
  | 'cycle_forbidden'
  | 'node_missing'
  | 'immutable_node'
  | 'layer_missing'
  | 'layer_incompatible'
  | 'layer_hidden'
  | 'layer_locked'
  | 'schema_parent_fixed'
  | 'schema_order_derived'
  | 'ordering_boundary'
  | 'no_change';

export type MapOutlinerMutationPlan =
  | { readonly ok: true; readonly operation: MapOutlinerMutationOperation }
  | { readonly ok: false; readonly reason: MapOutlinerMutationDenial };

const denied = (reason: MapOutlinerMutationDenial): MapOutlinerMutationPlan => Object.freeze({
  ok: false,
  reason,
});

function layerDenial(
  document: MapDocumentV3,
  layerId: MapContentLayerId,
  guard: MapOutlinerMutationGuard,
): MapOutlinerMutationDenial | null {
  const layer = document.layers.find(({ id }) => id === layerId);
  if (layer === undefined) return 'layer_missing';
  if (!layer.editable || guard.lockedLayers.has(layerId)) return 'layer_locked';
  if (guard.hiddenLayers.has(layerId)) return 'layer_hidden';
  return null;
}

/** Plans only mutations representable by MapDocumentV3. Object and landmark
 * instances own a persisted layer field; anchors have a fixed semantic parent,
 * while sibling entity order is derived from world depth/id and cannot be
 * truthfully rewritten. Live rows never enter this path. */
export function planMapOutlinerMutation(
  document: MapDocumentV3,
  request: MapOutlinerMutationRequest,
  guard: MapOutlinerMutationGuard,
): MapOutlinerMutationPlan {
  if (request.view === 'live') return denied('runtime_read_only');
  if (guard.access !== 'write') return denied('authority_read_only');
  if (guard.conflict) return denied('document_conflict');
  if (guard.publishing) return denied('publish_in_progress');

  if (request.kind === 'reparent') {
    if (request.targetAncestorIds?.includes(request.nodeId) === true) return denied('cycle_forbidden');
    if (request.nodeKind === 'space' || request.nodeKind === 'layer'
      || request.nodeKind === 'generated') return denied('immutable_node');
    if (request.nodeKind === 'anchor') return denied('schema_parent_fixed');
    if (!isMapObjectLayer(request.targetLayer)) return denied('layer_incompatible');
    const targetDenial = layerDenial(document, request.targetLayer, guard);
    if (targetDenial !== null) return denied(targetDenial);
    const collection = request.nodeKind === 'object' ? document.objects : document.landmarks;
    const node = collection.find(({ id }) => id === request.nodeId);
    if (node === undefined) return denied('node_missing');
    const sourceDenial = layerDenial(document, node.layer, guard);
    if (sourceDenial !== null) return denied(sourceDenial);
    if (node.layer === request.targetLayer) return denied('no_change');
    return Object.freeze({
      ok: true,
      operation: Object.freeze({
        kind: request.nodeKind === 'object' ? 'reparent_object' : 'reparent_landmark',
        id: node.id,
        targetLayer: request.targetLayer,
        undoEntries: 1,
      }),
    });
  }

  if (request.nodeKind !== 'layer') {
    if (request.nodeKind === 'space' || request.nodeKind === 'generated') return denied('immutable_node');
    return denied('schema_order_derived');
  }
  const id = request.nodeId as MapContentLayerId;
  const sourceDenial = layerDenial(document, id, guard);
  if (sourceDenial !== null) return denied(sourceDenial);
  if (!isMapObjectLayer(id)) return denied('ordering_boundary');
  const ordered = [...document.layers].sort((left, right) => left.order - right.order
    || left.id.localeCompare(right.id));
  const index = ordered.findIndex((layer) => layer.id === id);
  const target = ordered[index + (request.direction === 'toward_front' ? 1 : -1)];
  if (target === undefined || !isMapObjectLayer(target.id)) return denied('ordering_boundary');
  const targetDenial = layerDenial(document, target.id, guard);
  if (targetDenial !== null) return denied(targetDenial);
  if (target.order === ordered[index]?.order) return denied('no_change');
  return Object.freeze({
    ok: true,
    operation: Object.freeze({
      kind: 'reorder_layer', id, direction: request.direction, undoEntries: 1,
    }),
  });
}
