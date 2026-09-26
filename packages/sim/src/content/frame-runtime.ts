import type { SlotRestriction } from '../item-containers.js';
import type { ItemContentDefinition, ProcessContentDefinition } from './definitions.js';
import type { FrameContentDefinition, FrameSlotRestriction } from './frame-definition.js';

export interface FrameRestrictionRegistry {
  readonly items: ReadonlyMap<string, ItemContentDefinition>;
  readonly processes: ReadonlyMap<string, ProcessContentDefinition>;
}

function itemSlug(id: string): string {
  return id.startsWith('item:') ? id.slice('item:'.length) : id;
}

function processMatches(
  process: ProcessContentDefinition,
  source: NonNullable<FrameSlotRestriction['acceptedFrom']>,
): boolean {
  if (process.retired === true) return false;
  if (source.process !== undefined && process.id !== source.process) return false;
  if (source.stationTag !== undefined && process.stationTag !== source.stationTag) return false;
  return true;
}

/** Resolves authored item ids into the runtime's unprefixed item kinds. The
 * caller must pass the registry from the same durable content revision as the
 * frame so client preflight and authority validation cannot drift. */
export function resolveFrameSlotRestriction(
  restriction: FrameSlotRestriction | undefined,
  registry: FrameRestrictionRegistry,
): SlotRestriction | undefined {
  if (restriction === undefined) return undefined;
  const accepted = new Set((restriction.acceptedItems ?? []).map(itemSlug));
  const source = restriction.acceptedFrom;
  if (source !== undefined) {
    for (const process of registry.processes.values()) {
      if (!processMatches(process, source)) continue;
      if (source.role === 'input') accepted.add(itemSlug(process.input.item));
      else if (source.role === 'output') {
        for (const output of process.outputs) accepted.add(itemSlug(output.item));
      } else {
        for (const fuel of process.fuelPolicy?.acceptedItems ?? []) accepted.add(itemSlug(fuel));
      }
    }
  }
  return Object.freeze({
    // An authored allow-list with no current matches admits nothing. Existing
    // contents remain extractable because restrictions govern insertion only.
    ...(restriction.acceptedItems === undefined && source === undefined
      ? {} : { acceptedKinds: Object.freeze([...accepted].sort()) }),
    ...(restriction.requiredTags === undefined ? {} : { requiredTags: Object.freeze([...restriction.requiredTags]) }),
    // Deny lists stay separate from the allow list so the shared rule can let them win.
    ...(restriction.rejectedItems === undefined ? {} : {
      rejectedKinds: Object.freeze([...new Set(restriction.rejectedItems.map(itemSlug))].sort()),
    }),
    ...(restriction.rejectedTags === undefined ? {} : { rejectedTags: Object.freeze([...restriction.rejectedTags]) }),
    ...(restriction.readOnly === undefined ? {} : { readOnly: restriction.readOnly }),
  });
}

/** One authoritative restriction record keyed by the entity's durable slot.
 * Self/merchant panes never contribute entity restrictions. */
export function frameRestrictions(
  definition: FrameContentDefinition,
  registry: FrameRestrictionRegistry,
): Readonly<Record<number, SlotRestriction>> {
  const entries: [number, SlotRestriction][] = [];
  for (const pane of definition.panes) {
    if (!('entitySlots' in pane.bind)) continue;
    const restriction = resolveFrameSlotRestriction(pane.restriction, registry);
    if (restriction === undefined || Object.keys(restriction).length === 0) continue;
    for (const slot of pane.bind.entitySlots) entries.push([slot, restriction]);
  }
  return Object.freeze(Object.fromEntries(entries));
}
