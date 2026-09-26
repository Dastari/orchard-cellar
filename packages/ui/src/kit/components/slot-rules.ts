import type { ItemPolicyResolver, SlotRestriction } from '@orchard/sim';
import { slotAcceptsItem } from '@orchard/sim/item-containers';

/** What a slot accepts, in the slot's own words. It mirrors the server's `SlotRestriction` field for field and
 * is only ever checked by the sim's `slotAcceptsItem`, the same function the world reducers run, so the slot's
 * acceptance feedback cannot drift from what the server allows. */
export interface UiSlotRules {
  /** Allow list by item kind (`SlotRestriction.acceptedKinds`). */
  readonly allowItems?: readonly string[];
  /** Item types: every tag must be present (`SlotRestriction.requiredTags`). */
  readonly requireTags?: readonly string[];
  /** Deny list by item kind (`SlotRestriction.rejectedKinds`). A denial always wins. */
  readonly denyItems?: readonly string[];
  /** Deny list by item type (`SlotRestriction.rejectedTags`). A denial always wins. */
  readonly denyTags?: readonly string[];
  /** Take-only: station outputs and results (`SlotRestriction.readOnly`). */
  readonly readOnly?: boolean;
}

/** Slot rules from the authority's restriction record: frame bindings, equipment slots, placeable containers. */
export function uiSlotRulesFromRestriction(restriction: SlotRestriction | undefined): UiSlotRules | undefined {
  if (restriction === undefined) return undefined;
  return Object.freeze({
    ...(restriction.acceptedKinds === undefined ? {} : { allowItems: restriction.acceptedKinds }),
    ...(restriction.requiredTags === undefined ? {} : { requireTags: restriction.requiredTags }),
    ...(restriction.rejectedKinds === undefined ? {} : { denyItems: restriction.rejectedKinds }),
    ...(restriction.rejectedTags === undefined ? {} : { denyTags: restriction.rejectedTags }),
    ...(restriction.readOnly === undefined ? {} : { readOnly: restriction.readOnly }),
  });
}

/** The inverse of `uiSlotRulesFromRestriction`: the record `slotAcceptsItem` checks. */
export function uiSlotRestrictionFromRules(rules: UiSlotRules): SlotRestriction {
  return Object.freeze({
    ...(rules.allowItems === undefined ? {} : { acceptedKinds: rules.allowItems }),
    ...(rules.requireTags === undefined ? {} : { requiredTags: rules.requireTags }),
    ...(rules.denyItems === undefined ? {} : { rejectedKinds: rules.denyItems }),
    ...(rules.denyTags === undefined ? {} : { rejectedTags: rules.denyTags }),
    ...(rules.readOnly === undefined ? {} : { readOnly: rules.readOnly }),
  });
}

/** Whether a slot with these rules accepts the item as a drop, decided by the shared sim rule. `policy` must be
 * the active content's (`itemPolicyResolver(registry)`); unknown or retired items are refused, as on the server.
 * Server-only rules (a backpack still in use, gear rank requirements, untradeable items) are not visible here. */
export function uiSlotAcceptsItem(rules: UiSlotRules | undefined, itemKind: string, policy: ItemPolicyResolver): boolean {
  return slotAcceptsItem({
    id: 'slot', capacity: 1, slots: [null],
    ...(rules === undefined ? {} : { restrictions: { 0: uiSlotRestrictionFromRules(rules) } }),
  }, 0, itemKind, policy);
}
