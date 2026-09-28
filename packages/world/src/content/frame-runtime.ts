import {
  activeHearthLobbyDefinition,
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
  return frameAndContainerRestrictions(registry, placeable, placeableFrameDefinition(registry, placeable));
}

/** Frame pane rules for `definition`, overlaid with the object's own container rules. */
function frameAndContainerRestrictions(
  registry: ContentRegistry,
  placeable: FramePlaceableRow,
  definition: FrameContentDefinition | null,
): Readonly<Record<number, SlotRestriction>> {
  // A pane bound to `entitySlots: all` covers the object's whole container.
  const capacity = placeableObjectDefinition(registry, placeable)?.components.container?.slotCount ?? 0;
  const restrictions: Record<number, SlotRestriction> = definition === null
    ? {} : { ...frameRestrictions(definition, registry, capacity) };
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

/** A frame the client would actually present in an entity window: present,
 * not retired, and on the `entity` surface (see the UI's `activeContentFrame`). */
function presentedEntityFrame(frame: FrameContentDefinition | null | undefined): FrameContentDefinition | null {
  return frame === null || frame === undefined || frame.retired === true
    || frame.presentation?.surface !== 'entity' ? null : frame;
}

/** Slot rules the authority applies to the private hearth stash. They mirror
 * the client's `frame:hearth_stash` panes; a frame the client would not present
 * (missing, retired or off the entity surface) contributes no rules. Rules
 * govern insertion only, so stored items that break a newly authored rule stay
 * where they are and can be taken out. */
export function hearthStashFrameRestrictions(
  registry: ContentRegistry,
): Readonly<Record<number, SlotRestriction>> {
  const frame = presentedEntityFrame(registry.frames.get(HEARTH_STASH_FRAME_ID));
  return frame === null ? Object.freeze({})
    : frameRestrictions(frame, registry, activeHearthLobbyDefinition(registry)?.stashCapacity ?? 0);
}

/** Slot rules the authority applies to a legacy `world_chest` container, resolved
 * through the same object and frame as the client's generic chest fallback
 * (`activeObjectFrameId`): a retired chest object contributes nothing, and a
 * frame the client would not present contributes no pane rules. The object's
 * own container rules still apply, as they do for a generic chest placeable.
 * Only this legacy path is narrowed; `placeableFrameRestrictions` is unchanged. */
export function legacyWorldChestFrameRestrictions(
  registry: ContentRegistry,
): Readonly<Record<number, SlotRestriction>> {
  const object = placeableObjectDefinition(registry, LEGACY_WORLD_CHEST_PLACEABLE);
  if (object === undefined || object.retired === true) return Object.freeze({});
  return frameAndContainerRestrictions(registry, LEGACY_WORLD_CHEST_PLACEABLE,
    presentedEntityFrame(placeableFrameDefinition(registry, LEGACY_WORLD_CHEST_PLACEABLE)));
}
