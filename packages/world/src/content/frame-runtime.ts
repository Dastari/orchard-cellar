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

/** The client always presents the private hearth stash through this frame. */
export const HEARTH_STASH_FRAME_ID = 'frame:hearth_stash';

/** The client presents a legacy `world_chest` row as the authored generic chest. */
export const LEGACY_WORLD_CHEST_PLACEABLE: FramePlaceableRow = Object.freeze({
  kind: 'chest', definitionId: 'object:chest',
});

/** Slot rules the authority applies to the private hearth stash. They mirror
 * the client's `frame:hearth_stash` panes; a missing or retired frame, like on
 * the client, contributes no rules. Rules govern insertion only, so stored
 * items that break a newly authored rule stay where they are and can be taken out. */
export function hearthStashFrameRestrictions(
  registry: ContentRegistry,
): Readonly<Record<number, SlotRestriction>> {
  const frame = registry.frames.get(HEARTH_STASH_FRAME_ID);
  return frame === undefined || frame.retired === true ? Object.freeze({}) : frameRestrictions(frame, registry);
}

/** Slot rules the authority applies to a legacy `world_chest` container, resolved
 * through the same object and frame as the client's generic chest fallback. */
export function legacyWorldChestFrameRestrictions(
  registry: ContentRegistry,
): Readonly<Record<number, SlotRestriction>> {
  return placeableFrameRestrictions(registry, LEGACY_WORLD_CHEST_PLACEABLE);
}
