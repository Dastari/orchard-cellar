import {
  runtimeCreatureDefinition,
  runtimeNpcDefinition,
  runtimeObjectDefinition,
  type ContentRegistry,
  type NpcContentDefinition,
  type ObjectContentDefinition,
} from '@orchard/sim';
import type { MapEditorLiveMarker } from './editor-controller.js';

export type StudioLiveMarkerPresentation =
  | { readonly kind: 'neutral' }
  | { readonly kind: 'object'; readonly definition: ObjectContentDefinition;
      readonly legacyFallback: boolean }
  | { readonly kind: 'npc'; readonly definition: NpcContentDefinition;
      readonly runtimeKind: string; readonly fishingCycle: boolean }
  | { readonly kind: 'mount'; readonly adapter: 'boat' | 'horse' }
  | { readonly kind: 'wildlife'; readonly species: string }
  | { readonly kind: 'legacy-npc'; readonly runtimeKind: string };

const NEUTRAL = Object.freeze({ kind: 'neutral' as const });

/** Selects artwork only through the verified live registry. Explicit durable
 * identities fail closed when missing/retired; blank pre-schema rows retain a
 * narrowly-scoped kind adapter so existing worlds remain visually intact. */
export function resolveStudioLiveMarkerPresentation(
  registry: ContentRegistry | null,
  marker: MapEditorLiveMarker,
): StudioLiveMarkerPresentation {
  if (registry === null) return NEUTRAL;
  if (marker.entityKind === 'placeable' || marker.entityKind === 'chest'
    || marker.entityKind === 'combat-target') {
    const explicit = (marker.definitionId?.trim() ?? '').length > 0;
    const definition = runtimeObjectDefinition(registry, marker);
    if (definition === null) {
      return explicit || marker.entityKind === 'placeable' ? NEUTRAL
        : Object.freeze({ kind: 'legacy-npc', runtimeKind: marker.kind });
    }
    return Object.freeze({ kind: 'object', definition, legacyFallback: !explicit });
  }
  if (marker.entityKind !== 'npc') return NEUTRAL;
  if (marker.species !== undefined) {
    return runtimeCreatureDefinition(registry, marker.species) === null ? NEUTRAL
      : Object.freeze({ kind: 'wildlife', species: marker.species });
  }
  const explicit = (marker.definitionId?.trim() ?? '').length > 0;
  const definition = runtimeNpcDefinition(registry, marker);
  if (definition === null) return explicit ? NEUTRAL
    : Object.freeze({ kind: 'legacy-npc', runtimeKind: marker.kind });
  if (definition.mount !== undefined) {
    return Object.freeze({ kind: 'mount', adapter: definition.mount.adapter });
  }
  return Object.freeze({
    kind: 'npc', definition,
    runtimeKind: definition.runtimeKind ?? definition.id.slice('npc:'.length),
    fishingCycle: definition.ai.kind === 'fishing_cycle',
  });
}
