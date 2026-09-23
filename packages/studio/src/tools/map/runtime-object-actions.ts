import type {
  AdminContainerSnapshot,
  AdminEntityMutation,
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { MapEditorLiveMarker } from './editor-controller.js';

export type MapRuntimeObjectOperation = 'move_entity' | 'repair_entity' | 'despawn_entity';

export interface MapRuntimeObjectAuthorityInput {
  readonly mapId: string;
  readonly routeAccess: 'hidden' | 'read_only' | 'write';
  readonly connected: boolean;
  readonly role: string | null;
  readonly hasLiveApi: boolean;
  readonly marker: MapEditorLiveMarker | null;
}

export type MapRuntimeObjectAvailability =
  | { readonly allowed: true; readonly authority: 'owner' | 'admin' }
  | { readonly allowed: false; readonly reason: string };

/** Runtime object edits never borrow authored-map drag/delete authority. Only
 * server-managed chest/placeable rows enter the receipt-backed admin path;
 * resources keep their reversible generated-suppression workflow and every
 * other projected kind remains immutable here. */
export function mapRuntimeObjectAvailability(
  input: MapRuntimeObjectAuthorityInput,
): MapRuntimeObjectAvailability {
  if (input.mapId !== 'live-island') {
    return { allowed: false, reason: 'Runtime objects can only be changed on the live island' };
  }
  if (!input.connected || !input.hasLiveApi) {
    return { allowed: false, reason: 'Connect to the live world to change this runtime object' };
  }
  if (input.role !== 'owner' && input.role !== 'admin') {
    return { allowed: false, reason: 'Only an owner or administrator can change runtime objects' };
  }
  if (input.routeAccess !== 'write') {
    return { allowed: false, reason: 'This map is read only' };
  }
  if (input.marker === null) return { allowed: false, reason: 'Select a runtime object first' };
  if (input.marker.spaceId !== 0) {
    return { allowed: false, reason: 'Only live-island objects are available on this map' };
  }
  if (input.marker.entityKind === 'resource') {
    return { allowed: false, reason: 'Generated resources use reversible map suppression' };
  }
  if (input.marker.entityKind !== 'placeable' && input.marker.entityKind !== 'chest') {
    return { allowed: false, reason: 'This projected world row is immutable in the Map Editor' };
  }
  if (input.marker.mapMaterialized === true) {
    return { allowed: false, reason: 'This lamp follows its authored map object; move that object and publish the map' };
  }
  return { allowed: true, authority: input.role };
}

export type MapRuntimeObjectDraft =
  | { readonly operation: 'move_entity'; readonly tileX: number; readonly tileY: number }
  | { readonly operation: 'repair_entity' }
  | { readonly operation: 'despawn_entity' };

export interface MapRuntimeObjectReceipt {
  readonly operation: MapRuntimeObjectOperation;
  readonly entityId: string;
  readonly displayName: string;
  readonly from: { readonly spaceId: number; readonly tileX: number; readonly tileY: number };
  readonly to: { readonly spaceId: number; readonly tileX: number; readonly tileY: number } | null;
  readonly playerOwned: boolean;
  readonly baseVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
}

interface PendingRuntimeObjectMutation {
  readonly mutation: AdminEntityMutation;
  readonly receipt: MapRuntimeObjectReceipt;
}

function snapshotPosition(snapshot: AdminContainerSnapshot): {
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
} {
  const spaceId = Number(snapshot.position['spaceId']);
  const tileX = snapshot.position['tileX'];
  const tileY = snapshot.position['tileY'];
  if (!Number.isInteger(spaceId) || typeof tileX !== 'number' || !Number.isSafeInteger(tileX)
    || typeof tileY !== 'number' || !Number.isSafeInteger(tileY)) {
    throw new Error('map_live_entity_snapshot_invalid');
  }
  return { spaceId, tileX, tileY };
}

function snapshotMatchesMarker(snapshot: AdminContainerSnapshot, marker: MapEditorLiveMarker): boolean {
  if (snapshot.entityId !== marker.id) return false;
  const position = snapshotPosition(snapshot);
  if (position.spaceId !== marker.spaceId || position.tileX !== marker.tileX
    || position.tileY !== marker.tileY) return false;
  const chest = snapshot.definitionId === 'chest' || snapshot.definitionId === 'object:chest';
  return marker.entityKind === 'chest' ? chest : !chest;
}

function runtimeMutation(
  marker: MapEditorLiveMarker,
  draft: MapRuntimeObjectDraft,
  reason: string,
  clientMutationId: string,
): AdminEntityMutation {
  const envelope = { reason: normalizeAdminReason(reason), clientMutationId, dryRun: true } as const;
  if (draft.operation === 'move_entity') return {
    ...envelope,
    operation: 'move_entity',
    entityId: marker.id,
    spaceId: String(marker.spaceId),
    tileX: draft.tileX,
    tileY: draft.tileY,
  };
  if (draft.operation === 'repair_entity') return {
    ...envelope, operation: 'repair_entity', entityId: marker.id,
  };
  return {
    ...envelope, operation: 'despawn_entity', entityId: marker.id, spillContents: true,
  };
}

export class MapRuntimeObjectActionModel {
  #pending: PendingRuntimeObjectMutation | null = null;
  #generation = 0;

  constructor(
    readonly api: AdminObjectsApi,
    private readonly createMutationId: () => string = () => crypto.randomUUID(),
  ) {}

  pending(): MapRuntimeObjectReceipt | null { return this.#pending?.receipt ?? null; }

  cancel(): void {
    this.#generation += 1;
    this.#pending = null;
  }

  async preview(
    marker: MapEditorLiveMarker,
    draft: MapRuntimeObjectDraft,
    reason: string,
  ): Promise<AdminMutationPreview> {
    if ((marker.entityKind !== 'placeable' && marker.entityKind !== 'chest')
      || marker.mapMaterialized === true) {
      throw new Error('map_live_entity_immutable');
    }
    const generation = ++this.#generation;
    this.#pending = null;
    const snapshot = await this.api.container(marker.id);
    if (!snapshotMatchesMarker(snapshot, marker)) throw new Error('map_live_entity_stale');
    const from = snapshotPosition(snapshot);
    if (draft.operation === 'move_entity'
      && (!Number.isSafeInteger(draft.tileX) || !Number.isSafeInteger(draft.tileY))) {
      throw new Error('map_live_move_target_invalid');
    }
    const mutation = runtimeMutation(marker, draft, reason, this.createMutationId());
    const result = await this.api.mutate(mutation, snapshot.version, null);
    if (result.preview.operation !== mutation.operation
      || result.preview.target.kind !== 'entity'
      || result.preview.target.entityId !== marker.id
      || result.previewFingerprint.length === 0
      || result.preview.baseVersion.length === 0) throw new Error('admin_preview_receipt_mismatch');
    if (generation !== this.#generation) return result.preview;
    this.#pending = {
      mutation,
      receipt: Object.freeze({
        operation: mutation.operation as MapRuntimeObjectOperation,
        entityId: marker.id,
        displayName: marker.label,
        from,
        to: draft.operation === 'move_entity'
          ? Object.freeze({ spaceId: marker.spaceId, tileX: draft.tileX, tileY: draft.tileY })
          : null,
        // World-owned rows carry the module identity as their owner; only a
        // row classified as player custody requires the owner notice.
        playerOwned: snapshot.ownerIdentity !== null && marker.ownership !== 'world',
        baseVersion: result.preview.baseVersion,
        previewFingerprint: result.previewFingerprint,
        preview: result.preview,
      }),
    };
    return result.preview;
  }

  async commit(confirmed: boolean): Promise<AdminObjectMutationResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    if (!confirmed) throw new Error('map_live_confirmation_required');
    const pending = this.#pending;
    this.cancel();
    const result = await this.api.mutate(
      { ...pending.mutation, dryRun: false } as AdminEntityMutation,
      pending.receipt.baseVersion,
      pending.receipt.previewFingerprint,
    );
    if (!result.committed || result.audit === null
      || result.audit.operation !== pending.mutation.operation
      || result.audit.target.kind !== 'entity'
      || result.audit.target.entityId !== pending.receipt.entityId
      || result.audit.payload.clientMutationId !== pending.mutation.clientMutationId) {
      throw new Error('commit_receipt_mismatch');
    }
    return result;
  }
}
