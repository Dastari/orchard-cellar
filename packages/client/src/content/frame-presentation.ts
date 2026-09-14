import { placeableObjectDefinition, type ContentRegistry, type FrameDefinitionId } from '@orchard/sim';
import type { PlayerCookingJob, WorldCampfireState, WorldPlaceable } from '@orchard/world-bindings/types';

type FrameState = Readonly<Record<string, boolean | string | number>>;

/** A persisted private batch keeps its stored quantity and clock. These values
 * only describe the job; frame callbacks revalidate custody on the server. */
export function processJobFrameState(
  registry: Pick<ContentRegistry, 'items'>,
  job: Pick<PlayerCookingJob, 'outputKind' | 'quantity' | 'startedTick' | 'readyTick'> | null,
  authorityTick: bigint,
): FrameState {
  if (job === null) return { processJobPending: false, processJobReady: false };
  const outputLabel = registry.items.get(`item:${job.outputKind}`)?.displayName ?? job.outputKind;
  const duration = job.readyTick - job.startedTick;
  const progress = duration <= 0n ? 1
    : Math.max(0, Math.min(1, Number(authorityTick - job.startedTick) / Number(duration)));
  return {
    processJobPending: true,
    processJobReady: authorityTick >= job.readyTick,
    processJobProgress: progress,
    processJobOutputLabel: outputLabel,
    processJobQuantity: job.quantity,
    processJobLabel: `${job.quantity} × ${outputLabel}`,
  };
}

/** Legacy landmark jobs can alias a materialized object only when the original
 * landmark row still identifies the same location. Numeric IDs alone do not
 * establish that relationship. */
export function processJobMatchesFrame(
  job: Pick<PlayerCookingJob, 'targetKind' | 'targetId' | 'spaceId'> | null,
  placeable: Pick<WorldPlaceable, 'id' | 'spaceId' | 'tileX' | 'tileY'> | null,
  landmark: Pick<WorldCampfireState, 'id' | 'spaceId' | 'tileX' | 'tileY'> | undefined,
): boolean {
  if (job === null || placeable === null || job.targetId !== placeable.id
    || job.spaceId !== placeable.spaceId) return false;
  if (job.targetKind === 'placeable') return true;
  return job.targetKind === 'landmark' && landmark !== undefined
    && landmark.id === placeable.id && landmark.spaceId === placeable.spaceId
    && landmark.tileX === placeable.tileX && landmark.tileY === placeable.tileY;
}

/** Resolves authored window topology from object -> frame references. Kind and
 * frame ids are deliberately not interpreted; missing/retired definitions
 * fail closed to the legacy presentation path. */
export function activeObjectFrameId(
  registry: Pick<ContentRegistry, 'objects' | 'frames'>,
  placeable: Pick<WorldPlaceable, 'kind' | 'definitionId'> | null | undefined,
): FrameDefinitionId | null {
  if (placeable === null || placeable === undefined) return null;
  const definition = placeable.definitionId.trim() === ''
    ? placeableObjectDefinition(registry, placeable) : registry.objects.get(placeable.definitionId);
  if (definition?.retired === true) return null;
  const frameId = definition?.components.frame?.ref;
  if (frameId === undefined) return null;
  const frame = registry.frames.get(frameId);
  return frame === undefined || frame.retired === true ? null : frame.id;
}

/** Parses only primitive presentation state. Reducers remain authoritative for
 * all mutations and re-validate every frame interaction server-side. */
export function activeObjectFrameState(
  placeable: Pick<WorldPlaceable, 'stateJson' | 'lit' | 'barrelSealedTick'> | null | undefined,
): Readonly<Record<string, boolean | string | number>> {
  if (placeable === null || placeable === undefined) return {};
  let authored: Record<string, boolean | string | number> = {};
  try {
    const decoded = JSON.parse(placeable.stateJson) as unknown;
    if (decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)) {
      authored = Object.fromEntries(Object.entries(decoded as Record<string, unknown>)
        .filter((entry): entry is [string, boolean | string | number] => {
          const value = entry[1];
          return typeof value === 'boolean' || typeof value === 'string'
            || (typeof value === 'number' && Number.isFinite(value));
        }));
    }
  } catch {
    // Presentation metadata is optional and cannot expand server authority.
  }
  return Object.freeze({ ...authored, lit: placeable.lit, sealed: placeable.barrelSealedTick !== undefined });
}
