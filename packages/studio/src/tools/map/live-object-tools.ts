import type { AdminEntityMutation, AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';

export const MAP_FUNCTIONAL_LIVE_DEFINITION_IDS = Object.freeze([
  'object:chest',
  'object:fruit_press',
  'object:fermentation_cask',
] as const);

export type MapFunctionalLiveDefinitionId = typeof MAP_FUNCTIONAL_LIVE_DEFINITION_IDS[number];

const FUNCTIONAL_LIVE_DEFINITION_IDS = new Set<string>(MAP_FUNCTIONAL_LIVE_DEFINITION_IDS);

export function isMapFunctionalLiveDefinitionId(
  value: string | null | undefined,
): value is MapFunctionalLiveDefinitionId {
  return typeof value === 'string' && FUNCTIONAL_LIVE_DEFINITION_IDS.has(value);
}

export interface MapLiveSpawnAvailabilityInput {
  readonly mapId: string;
  readonly routeAccess: 'hidden' | 'read_only' | 'write';
  readonly connected: boolean;
  readonly role: string | null;
  readonly hasLiveApi: boolean;
  readonly contentVersion: string | null;
  readonly contentFingerprint: string | null;
  readonly definitionId: string | null;
}

export type MapLiveSpawnAvailability =
  | { readonly allowed: true; readonly authority: 'owner' | 'admin' }
  | { readonly allowed: false; readonly reason: string };

/** Live entity creation is deliberately narrower than authored-map editing.
 * Content editors may place scenery in the document, but only a connected
 * owner/admin with an exact content head may stage a durable world mutation. */
export function mapLiveSpawnAvailability(
  input: MapLiveSpawnAvailabilityInput,
): MapLiveSpawnAvailability {
  if (input.mapId !== 'live-island') {
    return { allowed: false, reason: 'Functional entities can only be spawned on the live island' };
  }
  if (!input.connected || !input.hasLiveApi) {
    return { allowed: false, reason: 'Connect to the live world to spawn a functional entity' };
  }
  if (input.role !== 'owner' && input.role !== 'admin') {
    return { allowed: false, reason: 'Only an owner or administrator can spawn a functional entity' };
  }
  if (input.routeAccess !== 'write') {
    return { allowed: false, reason: 'This map is read only' };
  }
  if (input.contentVersion === null || input.contentFingerprint === null) {
    return { allowed: false, reason: 'The authoritative content head is still synchronizing' };
  }
  if (!isMapFunctionalLiveDefinitionId(input.definitionId)) {
    return { allowed: false, reason: 'Select Chest, Fruit Press, or Fermentation Cask first' };
  }
  return { allowed: true, authority: input.role };
}

export interface MapSpawnHerePreviewInput {
  readonly definitionId: MapFunctionalLiveDefinitionId;
  readonly displayName: string;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly reason: string;
  /** Empty on live dry-runs so server authority discovers the exact current
   * object-state version. Tests and offline adapters may supply a known base. */
  readonly expectedBaseVersion?: string;
  readonly authority: 'owner' | 'admin';
  readonly contentVersion: string;
  readonly contentFingerprint: string;
}

export interface MapSpawnHereReceipt {
  readonly definitionId: MapFunctionalLiveDefinitionId;
  readonly displayName: string;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly reason: string;
  readonly authority: 'owner' | 'admin';
  readonly contentVersion: string;
  readonly contentFingerprint: string;
  readonly baseVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
}

export class MapSpawnHereModel {
  #pending: { readonly mutation: AdminEntityMutation; readonly receipt: MapSpawnHereReceipt } | null = null;
  #generation = 0;

  constructor(readonly api: AdminObjectsApi, private readonly createMutationId: () => string = () => crypto.randomUUID()) {}
  pending(): MapSpawnHereReceipt | null { return this.#pending?.receipt ?? null; }

  cancel(): void {
    this.#generation += 1;
    this.#pending = null;
  }

  async preview(input: MapSpawnHerePreviewInput): Promise<AdminMutationPreview> {
    const generation = ++this.#generation;
    this.#pending = null;
    const mutation: AdminEntityMutation = { operation: 'spawn_entity', definitionId: input.definitionId,
      spaceId: String(input.spaceId), tileX: input.tileX, tileY: input.tileY,
      reason: normalizeAdminReason(input.reason),
      clientMutationId: this.createMutationId(), dryRun: true };
    const result = await this.api.mutate(mutation, input.expectedBaseVersion ?? '', null);
    if (generation !== this.#generation) return result.preview;
    this.#pending = {
      mutation,
      receipt: Object.freeze({
        definitionId: input.definitionId,
        displayName: input.displayName,
        spaceId: input.spaceId,
        tileX: input.tileX,
        tileY: input.tileY,
        reason: String(mutation.reason),
        authority: input.authority,
        contentVersion: input.contentVersion,
        contentFingerprint: input.contentFingerprint,
        baseVersion: result.preview.baseVersion,
        previewFingerprint: result.previewFingerprint,
        preview: result.preview,
      }),
    };
    return result.preview;
  }

  async commit(): Promise<AdminObjectMutationResult> {
    if (this.#pending === null) throw new Error('admin_preview_required');
    const pending = this.#pending;
    this.cancel();
    return this.api.mutate(
      { ...pending.mutation, dryRun: false },
      pending.receipt.baseVersion,
      pending.receipt.previewFingerprint,
    );
  }
}
