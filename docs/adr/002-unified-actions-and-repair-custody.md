# ADR 002: Shared resolved actions and transactional repair custody

Date: 2026-09-21. Status: Proposed.

## Context

Tools currently mix sector swings, tile actions and bow-specific execution, with
input behavior partly determined by conditional order. Hoe/cellar/anvil regressions
show that an item's animation or specialization cannot choose its action reliably.
Future spells add mixed mana/item costs, activation phases and geometry modifiers.
The user requires G to show actual action limits and repair via output dragging.

## Decision

Model named actions on items and abilities. Target selection, effect geometry,
activation, delivery, resource costs and presentation are separate contracts. One
pure effective-parameter resolver supplies client presentation and authoritative
validation; the authority independently recomputes trusted values and owns targets,
transactions, activation state and once-only settlement. Extend existing modifier
algebra through typed action parameter slots, retaining hard safety/policy limits.

Keep authoritative sector resolution from [ADR 001](001-facing-swing-authority.md).
Generalize it to explicit action contracts, declared origins and contact policies.
Freeze effective parameters at accepted activation by default; revalidate live
eligibility and custody at commit. G draws those same resolved geometry descriptors
and labels prediction/authority freshness rather than claiming omniscient live state.

Repair inputs have exclusive, durable private custody. Output is a computed quote,
not a second item. Taking it atomically consumes the payable resources and moves the
same tool with updated durability into the existing authoritative cursor. Session
revisions and idempotency prevent replay and racing collections. Close/disconnect
recovery preserves items through existing inventory/overflow semantics.

## Alternatives

- More specialization checks in input handlers: extends the branch-order problem and
  creates another spell-specific path; rejected.
- One mutually exclusive targeting category per tool: cannot express pickaxe swing,
  wall excavation and contextual use on one item; rejected.
- Rebuild effects/inventory from scratch: discards tested claims, loot and custody
  semantics; rejected in favor of shared contracts around existing adapters.
- Client-managed repair output or separate consume/grant requests: permits stale
  previews, retries and partial operations to create copies/loss; rejected.
- Persistent pre-created repaired output: can be safe with a full crafting-job custody
  model, but adds intermediate state without benefit for instantaneous repair; choose
  a virtual preview and atomic take instead.

## Consequences

New actions share targeting, costs and debug semantics; modifiers are inspectable
and spells don't require a parallel engine. Costs are never trusted from a client.
The price is explicit action metadata, migration of old entry points, a durable
activation/reservation contract and tests across every inventory/resource writer.
Exact client debug means parity on the same known snapshot, not immunity to latency.
Repair introduces private escrow/schema that requires migration and rollback care.
Snapshot-at-acceptance behavior must be communicated and tested for long casts.

Details and acceptance gates: [specification](../unified-actions-spec.md) and
[delivery plan](../unified-actions-plan.md). This ADR does not authorize deployment
or production spell balance/content.
