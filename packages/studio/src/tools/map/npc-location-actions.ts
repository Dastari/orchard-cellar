import type {
  AdminEntityMutation,
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { MapEditorLiveMarker } from './editor-controller.js';

export interface MapNpcLocationMarker extends MapEditorLiveMarker {
  /** Current live home, projected from world_npc fixed-point coordinates. */
  readonly homeTileX?: number;
  readonly homeTileY?: number;
  /** A rider means player custody is active and relocation must fail closed. */
  readonly playerControlled?: boolean;
  /** Generated wildlife homes belong to world authority, not authored NPC placement. */
  readonly systemControlled?: boolean;
}

export interface MapNpcLocationAuthorityInput {
  readonly mapId: string;
  readonly routeAccess: 'hidden' | 'read_only' | 'write';
  readonly connected: boolean;
  readonly role: string | null;
  readonly hasLiveApi: boolean;
  readonly marker: MapNpcLocationMarker | null;
}

export type MapNpcLocationAvailability =
  | { readonly allowed: true; readonly authority: 'owner' | 'admin' }
  | { readonly allowed: false; readonly reason: string };

/** Only authored, unmounted live-island NPCs enter the receipt-backed home and
 * location path. Players, player-custody mounts, generated wildlife, and rows
 * projected onto an immutable system layer retain their owning authority. */
export function mapNpcLocationAvailability(
  input: MapNpcLocationAuthorityInput,
): MapNpcLocationAvailability {
  if (input.mapId !== 'live-island') {
    return { allowed: false, reason: 'NPC homes can only be changed on the live island' };
  }
  if (!input.connected || !input.hasLiveApi) {
    return { allowed: false, reason: 'Connect to the live world to change an NPC home' };
  }
  if (input.role !== 'owner' && input.role !== 'admin') {
    return { allowed: false, reason: 'Only an owner or administrator can change NPC homes' };
  }
  if (input.routeAccess !== 'write') return { allowed: false, reason: 'This map is read only' };
  if (input.marker === null) return { allowed: false, reason: 'Select an authored NPC first' };
  if (input.marker.entityKind === 'player' || input.marker.layer === 'player_owned') {
    return { allowed: false, reason: 'Player-owned state remains immutable in the Map Editor' };
  }
  if (input.marker.spaceId !== 0) {
    return { allowed: false, reason: 'Only live-island NPCs are available on this map' };
  }
  if (input.marker.entityKind !== 'npc') {
    return { allowed: false, reason: 'Only an authored NPC has a movable home and location' };
  }
  if (input.marker.playerControlled === true) {
    return { allowed: false, reason: 'An NPC in player custody cannot be relocated' };
  }
  if (input.marker.systemControlled === true || input.marker.variant !== undefined
    || input.marker.kind === 'boat') {
    return { allowed: false, reason: 'Simulation-controlled homes remain under world authority' };
  }
  if (input.marker.layer !== 'gameplay') {
    return { allowed: false, reason: 'This system-layer NPC is immutable in the Map Editor' };
  }
  return { allowed: true, authority: input.role };
}

export interface MapNpcLocationReceipt {
  readonly operation: 'relocate_npc';
  readonly npcId: string;
  readonly displayName: string;
  readonly from: {
    readonly spaceId: number;
    readonly tileX: number;
    readonly tileY: number;
    readonly homeTileX: number;
    readonly homeTileY: number;
  };
  readonly to: { readonly spaceId: number; readonly tileX: number; readonly tileY: number };
  readonly baseVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
}

interface PendingNpcLocationMutation {
  readonly mutation: AdminEntityMutation & { readonly operation: 'relocate_npc' };
  readonly receipt: MapNpcLocationReceipt;
}

function assertMutableNpc(marker: MapNpcLocationMarker): void {
  if (marker.entityKind !== 'npc' || marker.spaceId !== 0 || marker.layer !== 'gameplay'
    || marker.playerControlled === true || marker.systemControlled === true
    || marker.variant !== undefined || marker.kind === 'boat') {
    throw new Error('map_npc_location_immutable');
  }
}

function validDestination(tileX: number, tileY: number): void {
  if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
    throw new Error('map_npc_location_target_invalid');
  }
}

/** Bridges a selected Canvas marker to the existing admin relocation reducer.
 * The reducer owns collision, base-version, receipt-expiry, and atomic
 * position+home enforcement; this client retains and confirms its exact receipt. */
export class MapNpcLocationActionModel {
  #pending: PendingNpcLocationMutation | null = null;
  #generation = 0;

  constructor(
    readonly api: AdminObjectsApi,
    private readonly createMutationId: () => string = () => crypto.randomUUID(),
  ) {}

  pending(): MapNpcLocationReceipt | null { return this.#pending?.receipt ?? null; }

  cancel(): void {
    this.#generation += 1;
    this.#pending = null;
  }

  async preview(
    marker: MapNpcLocationMarker,
    tileX: number,
    tileY: number,
    reason: string,
  ): Promise<AdminMutationPreview> {
    assertMutableNpc(marker);
    validDestination(tileX, tileY);
    const homeTileX = marker.homeTileX ?? marker.tileX;
    const homeTileY = marker.homeTileY ?? marker.tileY;
    if (tileX === marker.tileX && tileY === marker.tileY
      && tileX === homeTileX && tileY === homeTileY) throw new Error('admin_no_changes');
    const generation = ++this.#generation;
    this.#pending = null;
    const mutation = Object.freeze({
      operation: 'relocate_npc' as const,
      npcId: marker.id,
      spaceId: String(marker.spaceId),
      tileX,
      tileY,
      reason: normalizeAdminReason(reason),
      clientMutationId: this.createMutationId(),
      dryRun: true,
    });
    // Empty base version asks live authority to discover and return the exact
    // current fingerprint. Commit never re-discovers or substitutes it.
    const result = await this.api.mutate(mutation, '', null);
    if (result.committed || result.audit !== null
      || result.preview.operation !== 'relocate_npc'
      || result.preview.target.kind !== 'entity'
      || result.preview.target.entityId !== marker.id
      || result.preview.baseVersion.length === 0
      || result.previewFingerprint.length === 0) throw new Error('admin_preview_receipt_mismatch');
    if (generation !== this.#generation) return result.preview;
    this.#pending = Object.freeze({
      mutation,
      receipt: Object.freeze({
        operation: 'relocate_npc',
        npcId: marker.id,
        displayName: marker.label,
        from: Object.freeze({
          spaceId: marker.spaceId,
          tileX: marker.tileX,
          tileY: marker.tileY,
          homeTileX,
          homeTileY,
        }),
        to: Object.freeze({ spaceId: marker.spaceId, tileX, tileY }),
        baseVersion: result.preview.baseVersion,
        previewFingerprint: result.previewFingerprint,
        preview: result.preview,
      }),
    });
    return result.preview;
  }

  async commit(confirmed: boolean): Promise<AdminObjectMutationResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    if (!confirmed) throw new Error('map_npc_location_confirmation_required');
    const pending = this.#pending;
    this.cancel();
    const result = await this.api.mutate(
      { ...pending.mutation, dryRun: false },
      pending.receipt.baseVersion,
      pending.receipt.previewFingerprint,
    );
    const audit = result.audit;
    const inverse = audit?.payload.inverse;
    if (!result.committed || audit === null
      || result.previewFingerprint !== pending.receipt.previewFingerprint
      || result.preview.baseVersion !== pending.receipt.baseVersion
      || result.preview.operation !== pending.receipt.operation
      || result.preview.target.kind !== 'entity'
      || result.preview.target.entityId !== pending.receipt.npcId
      || audit.operation !== 'relocate_npc'
      || audit.target.kind !== 'entity'
      || audit.target.entityId !== pending.receipt.npcId
      || audit.payload.target.kind !== 'entity'
      || audit.payload.target.entityId !== pending.receipt.npcId
      || audit.payload.clientMutationId !== pending.mutation.clientMutationId
      || inverse?.operation !== 'relocate_npc'
      || inverse.args['npcId'] !== pending.receipt.npcId
      || String(inverse.args['spaceId']) !== String(pending.receipt.from.spaceId)
      || inverse.args['tileX'] !== pending.receipt.from.tileX
      || inverse.args['tileY'] !== pending.receipt.from.tileY) {
      throw new Error('commit_receipt_mismatch');
    }
    return result;
  }
}
