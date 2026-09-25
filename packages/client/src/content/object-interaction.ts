import type { ContentRegistry, ObjectInteractionMetadata, PlaceableContentReference, ObjectContentDefinition, StateValue } from '@orchard/sim';
import { objectInteractionMetadata } from '@orchard/sim/behaviour/data-graph';
import { placeableObjectDefinition } from '@orchard/sim/crafting';

/** Resolves a semantic object capability from the active content registry.
 * Persisted pre-definition rows still follow their authored placement edge;
 * the runtime `kind` is never treated as capability authority here. */
export function objectHasAuthoredTag(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: PlaceableContentReference,
  tag: string,
): boolean {
  return placeableObjectDefinition(registry, reference)?.components.identity?.tags.includes(tag) === true;
}

/** Optional contextual input must have both a subscribed authority row and an
 * active authored callback. This is metadata selection, not callback execution:
 * actor conditions, reach and all effects remain server decisions. */
export function objectSecondaryTarget<T>(
  target: T | null | undefined,
  definition: ObjectContentDefinition | null | undefined,
  state: Readonly<Record<string, StateValue>>,
): T | null {
  if (target == null || definition == null || definition.retired === true) return null;
  return definition.components.interactions?.some((interaction) => (
    interaction.verb === 'secondary'
    && interaction.conditions.every((condition) => !('state' in condition)
      || state[condition.state] === condition.equals)
  )) === true ? target : null;
}

/** Code-free use metadata. Target state selects the authored branch; reach,
 * actor permissions, inventory and effect execution remain server decisions. */
export function objectUsePrompt(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: PlaceableContentReference,
  state: Readonly<Record<string, StateValue>>,
): string | null {
  const definition = placeableObjectDefinition(registry, reference);
  return definition === null ? null : objectInteractionMetadata(definition, 'use', state)?.prompt ?? null;
}

export function objectUseMetadata(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: PlaceableContentReference,
  state: Readonly<Record<string, StateValue>>,
): ObjectInteractionMetadata | null {
  const definition = placeableObjectDefinition(registry, reference);
  return definition === null ? null : objectInteractionMetadata(definition, 'use', state);
}

export function objectUseWithinRadialReach(
  metadata: ObjectInteractionMetadata | null,
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
  tileSize: number,
): boolean {
  return metadata?.reachTiles !== undefined
    && Math.hypot(targetX - playerX, targetY - playerY) <= metadata.reachTiles * tileSize;
}
