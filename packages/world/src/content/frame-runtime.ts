import {
  frameRestrictions,
  type ContentRegistry,
  type FrameContentDefinition,
  type SlotRestriction,
} from '@orchard/sim';

export interface FramePlaceableRow {
  readonly kind: string;
  readonly definitionId?: string;
}

export type AuthoredFrameAction = NonNullable<FrameContentDefinition['buttons']>[number];

function placeableObjectDefinition(registry: ContentRegistry, placeable: FramePlaceableRow) {
  const definitionId = placeable.definitionId?.trim() || `object:${placeable.kind}`;
  return registry.objects.get(definitionId);
}

/** Resolve a command only from the active frame's authored action surface. */
export function authoredFrameAction(
  frame: FrameContentDefinition,
  actionId: string,
): AuthoredFrameAction | null {
  return frame.buttons?.find(({ interaction }) => interaction === actionId) ?? null;
}

export function placeableFrameDefinition(
  registry: ContentRegistry,
  placeable: FramePlaceableRow,
): FrameContentDefinition | null {
  const object = placeableObjectDefinition(registry, placeable);
  const authoredFrame = object?.components.frame?.ref;
  if (authoredFrame !== undefined) return registry.frames.get(authoredFrame) ?? null;
  return null;
}

export function placeableFrameRestrictions(
  registry: ContentRegistry,
  placeable: FramePlaceableRow,
): Readonly<Record<number, SlotRestriction>> {
  const definition = placeableFrameDefinition(registry, placeable);
  const restrictions: Record<number, SlotRestriction> = definition === null
    ? {} : { ...frameRestrictions(definition, registry) };
  for (const restriction of placeableObjectDefinition(registry, placeable)
    ?.components.container?.restrictions ?? []) {
    for (const slot of restriction.slots) {
      const current = restrictions[slot];
      restrictions[slot] = {
        ...(current ?? {}),
        ...(restriction.acceptedItems === undefined ? {} : {
          acceptedKinds: restriction.acceptedItems.map((item) => item.slice('item:'.length)),
        }),
        ...(restriction.requiredTags === undefined ? {} : { requiredTags: restriction.requiredTags }),
        ...(restriction.readOnly === undefined ? {} : { readOnly: restriction.readOnly }),
      };
    }
  }
  return Object.freeze(restrictions);
}
