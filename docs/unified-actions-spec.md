# Unified tool, spell, and repair actions

Date: 2026-09-21. Status: Proposed implementation specification; no runtime changes.

User-approved direction: explicit action targeting, extensible tools/spells, modifiable
gameplay values and resource costs, exact G-debug limits, and a dedicated repair UI
whose output is collected by dragging. Detailed policies below are proposals for
implementation, not claims about shipped behavior.

Read with [the delivery plan](unified-actions-plan.md) and
[ADR 002](adr/002-unified-actions-and-repair-custody.md).

## 1. Outcome and scope

An item or learned ability exposes named actions. Each action describes targeting,
activation, delivery, effects, costs, and presentation. One shared deterministic
resolver supplies effective parameters to client previews and server validation.
The server selects contacts and owns all mutations, costs, cooldowns and custody.

Include existing axe/sword/pickaxe swings, cellar excavation, farming, fishing,
bow charging/projectiles, contextual interactions, self-use, and repair. Provide a
working shovel tile action with explicit ground rules and conservation-safe results.
Prove extension with test-only wand, staff/channel, area and self/entity spell actions
through the real dispatch/authority path, without relying on item-name checks.

Exclude a production spell catalogue, schools/unlock economy, PvP redesign, new
rendering engines, and unrelated inventory migrations. The action framework must
support spells without requiring any of those features to ship first. Reuse existing
geometry, target-specific effect adapters, inventory custody and modifier machinery.
Do not redesign content editing or bypass the Studio prebuild guard.

Success: every active item/ability action has an explicit contract; input order cannot
change its meaning; no gameplay reach/cost calculation is duplicated in UI code;
all audited numeric gameplay parameters resolve through typed modifier slots; repair
and action retries cannot mint items, repeat effects, or spend resources twice.

## 2. Verified starting point and integration dependencies

Planning baseline: upstream main `1d2462cd`. Inspect current main again before coding.

| Existing area | Retain | Change needed |
| --- | --- | --- |
| `packages/sim/src/tool-swing.ts` | Facing sector and bounded chunk selection | Resolve modified geometry and canonical contact policy |
| `packages/sim/src/tile-targeting.ts` | Tile-centre radial tests, explicit body origins | Remove competing geometry rules from migrated actions |
| `packages/client/src/selected-item-use.ts` and `overworld-main.ts` | Lifecycle capability checks | Replace tool-specialization/branch-order dispatch with action contracts |
| `packages/sim/src/modifiers.ts` | Deterministic layers, sources, stacking and bounds | Typed action parameter targets and per-action scopes |
| `packages/lifecycle-authoring` | Compiled lifecycle ownership and generated metadata | Emit validated action metadata beside handlers |
| `packages/world/src/index.ts` | Transactional validators and effect adapters | Shared resolved actions, activation ledger and repair authority |
| `packages/sim/src/ranged.ts` | Tested bow trajectory and charge behavior | Delivery configuration independent of bow identity |
| Private inventory cursor and overflow | Durable single-owner item custody | Repair escrow containers using the same transfer rules |

PR [26](https://github.com/Dastari/orchard-cellar/pull/26) is open at planning time:
hoe F routing and swimming-fish rendering are fixes to preserve, not prerequisites
that this documentation merges. Its local validation passed 4,754 tests. PR
[30](https://github.com/Dastari/orchard-cellar/pull/30) changes fishing XP; preserve its
intended awards if integrated. Other open gameplay PRs touch authority and inventory:
rescan descriptions and changed files before each implementation branch.

Current shovels have anvil repair callbacks but no digging action. Hoes expose both
a secondary swing and farming. Pickaxes use a separate tile action for cellar walls.
Direct anvil repair is temporary. The existing facing-sector authority in ADR 001
remains authoritative; this work generalizes its parameter and routing contracts.

## 3. Action contract

An `ActionDefinition` has stable action ID, source binding (item/ability), content
revision, input bindings/priority, targeting, activation, delivery/effect executors,
parameter bases/modifier slots, resource costs, eligibility and presentation.
An item can expose several actions; targeting is not a mutually exclusive item type.

| Target mode | Geometry/policy | Examples |
| --- | --- | --- |
| `facing` | Sector from declared origin and authoritative facing | Axe, sword, pickaxe |
| `tile` | Integer tile plus radial reach to tile centre | Hoe, can, shovel, fishing, excavation |
| `point` / `direction` | Continuous world coordinates or normalized vector; never snapped to a tile | Bow, wand bolt, staff beam, ground-position spell |
| `entity` | Typed entity reference, range and visibility/obstruction rules | Repair station access if required, targeted heal, object use |
| `self` | Actor, with no externally supplied target | Potion, light toggle, self buff |

Direction and point are separate payload variants: aiming through a point need not
stop a projectile there, whereas a ground-position spell may terminate exactly there.
Delivery is independent: direct effects, projectiles, areas and channel pulses use
registered typed executors. An effect area (circle, sector, line or authored tile
footprint) is distinct from the range used to select its centre. Entity target policy
records teams/ownership/categories, hit footprint, line of sight and elevation.

Use a discriminated payload union, not optional tile/entity/aim fields in one bag.
Reject incompatible target kinds, nonfinite/out-of-bounds values, retired actions,
invalid phases and unsupported executors during validation. Technical bounds and
permissions are enforced policy, never bypassable through gameplay modifiers.

Resolve an explicit contextual interaction ahead of a default action only when its
contract declares that binding. F, pointer and touch produce the same `ActionIntent`
for the same selected action. Context changes update prompt and reticle together.
Ambiguous equal-priority bindings fail content validation instead of depending on
source order. If a hoe retains a combat action it needs a distinct binding; default
hoe use remains farming. Anvil F repair disappears when the repair UI cutover ships.

Suggested modules: `sim/action-definition.ts`, `action-parameters.ts`,
`action-targeting.ts`, `action-costs.ts`; `client/action-controller.ts`;
`engine/action-debug.ts`; authority adapters under `world/src/actions/`.
Names are implementation guidance, not permission to duplicate existing helpers.

## 4. Modifiable values and deterministic resolution

Inventory every numeric gameplay tuning field before migration; assign each a typed
parameter ID, unit, scope, base, stacking rule, rounding stage, bounds and snapshot
policy. No unclassified hardcoded gameplay numbers may remain in a migrated path.

| Parameter family | Required coverage |
| --- | --- |
| Targeting | Interaction range, sector distance/angle, area radius/length/width, footprint size, target limit |
| Timing | Windup, recovery, cooldown, charge limits/curve parameters, channel interval/duration, effect lifetime |
| Delivery | Projectile speed, distance/lifetime, collision radius, count, spread and penetration/bounce limits when supported |
| Effects | Damage/healing, strength, duration, critical values, harvest yield and repair amount |
| Costs | Vigour, mana, optional health with explicit nonlethal/lethal policy, item/reagent/ammo quantities, currency, durability and charges |

Extend the existing flat/pctAdd/pctMult/override system; sources include equipment,
skills, buffs/debuffs and environment. Scope by action ID/tags, source and parameter,
so a mining range bonus cannot widen a heal or a fishing cast accidentally. Keep
existing stacking/exclusive-family precedence deterministic and inspectable.

`resolveAction(definition, actorSnapshot, modifierSnapshot, context)` is pure and
returns effective values plus provenance (base, applied/excluded modifiers, resolved
value and clamp). Use canonical fixed-point lengths, integer authority ticks and
explicit percentage units. Round geometric values at their defined conversion;
round payable item/currency quantities upward after composition. Free actions are
explicitly allowed by a parameter's zero floor; negative costs are forbidden.
Integer target/projectile counts and footprints have declared quantization rules.
Reject overflow and invalid curve results. Caps bound CPU, reach and effect fan-out;
those safety limits are not buffable. Symbolic resource IDs, permissions and executor
selection are configuration/policy, not numeric stat modifiers.

Default snapshot policy: preview follows current state; accepted activation freezes
resolved geometry, effects, costs, content revision and modifier revision until it
finishes. Bow charge may select within that frozen curve. Projectiles retain the
cast's resolved values. Eligibility, target validity, available resources, position
and permissions are still checked when an effect commits. A later buff affects the
next activation. Continuous re-resolution is opt-in and needs separate tests; do not
silently mix fresh costs with frozen benefits. Quotes stale before acceptance require
a refreshed preview, not silent acceptance at a different price.

### Spatial sampling and delivery ownership

Freezing geometry means its numerical parameters, not freezing every world position.
Each action declares this sampling policy; these are the default migration rules:

| Executor | Spatial sample and source checks |
| --- | --- |
| Instant or windup swing/tile action | Current authority origin/facing at commit; tile/point intent remains the accepted target; recheck range/LOS/source then |
| Bow/wand projectile | Current origin at launch, accepted release aim, frozen parameters; launch validates equipment/resources; trajectory then belongs to the projectile in its launch space |
| Channel | Current actor origin each pulse, accepted aim/point or stable entity ID; live entity position and source eligibility checked each pulse; retargeting requires a declared validated update, never an implicit cursor sample |
| Delayed/periodic area | Centre/space fixed when placed unless an explicitly authored following policy says otherwise; targets/permissions checked on each application |

Source swaps, death and travel cancel unlaunched actions/channels under their settlement
policy. A launched projectile remains autonomous: changing equipment or caster space
must not move it, duplicate it, or invalidate a paid shot. Its target's current legality
is checked at impact; caster equipment is not re-required. Alternate cancel-on-owner-loss
or homing behavior must be explicit. G uses the matching sample for each phase.

## 5. Authority, phases and resource accounting

State machine: idle -> accepted -> windup/charging/channeling -> committed/completed,
with explicit cancel/interruption/expiry transitions. Instant actions can accept and
commit in one transaction. Use authority ticks, not client-held time, for eligibility.

Requests carry action ID, source reference/revision, target variant, client request
ID and expected state/content revision. The server derives actor identity, validates
source custody/equipment, resolves parameters and returns an activation ID. Never
accept client-computed cost, range, damage, contacts, durability or result items.

Each cost declares resource, resolved amount/curve, phase (start, commit, channel
pulse or successful contact), refund rule and reservation policy. Multi-target swings
retain one activation charge plus explicitly declared per-contact wear, preserving
existing behavior. Damage and loot adapters must not also charge prepaid costs.

- Reserve deferred item/currency/vital costs in durable authoritative custody or a
  reservation ledger visible to every consuming operation. Never merely subtract
  them from the client's displayed balance. Available = actual minus reservations.
- Reservations constrain voluntary spending, not enemy damage, mandated mana drain,
  max-resource reduction or death. Those events apply normally. If actual vitals fall
  below reserved totals, cancel the newest accepted activation first (stable acceptance
  sequence, then activation ID) until remaining reservations are funded. Release holds
  through once-only settlement; never refund an unfunded vital amount or revive a dead
  actor through cancellation. Paid start costs default to nonrefundable. Revalidate
  lethal/nonlethal health-cost floors at commit. Death cancels all pending actor casts.
- Charging reserves an affordable budget and caps achievable charge accordingly;
  unused reservations return on settlement. Preserve the existing bow's cancellation
  charge through an explicit curve, not a generic full-refund default.
- Channels reserve/pay each pulse atomically before that pulse's effect. No resource
  means no pulse. A tick key prevents duplicate payment/effect after retries/restarts.
- Normally pay projectile costs at launch, even on a miss. Any future impact-time
  cost must already have secured custody; do not launch a benefit funded only by a
  promise to pay later. Shared cooldown reservations prevent parallel casts.
- Revalidate and preflight every effect/output destination before any writes, then
  commit costs, cooldown, mutations and lifecycle/statistic events transactionally.
  A failure rolls back the entire operation. External effects cannot be placed in
  this transaction without their own durable delivery contract.

Persist activation phase/revision and once-only settlement markers. Request IDs are
actor/session scoped and bound to a payload hash: retries return the prior outcome;
reusing an ID with another payload fails. Duplicate/out-of-order release, cancel or
pulse requests cannot repeat effects. Bound receipts and outstanding activations;
a retired session epoch/expired ID is rejected after receipt pruning, never treated
as a fresh request. Reconcile interrupted activations and reservations on disconnect,
reconnect, death, equipment changes, travel, content publication and restart. Define
cancel costs for each interruption reason; idempotent cleanup cannot refund twice.

### Durable deliveries

A projectile, channel or periodic area can outlive its launch transaction. Give each
an authority-created delivery-instance ID linked to its activation and persist its
space, resolved parameters, progress/next tick, expiry and hit/penetration state.
Atomically commit each effect plus its application key (instance, pulse/contact ordinal
and target where relevant). Recoverable-arrow creation also has one terminal output
key/custody transition. Activation settlement alone is not hit deduplication.
Schedulers resume durable state after restart rather than re-emitting elapsed effects
from scratch. Retain dedup state while an instance is actionable; after cleanup,
non-reusable instance IDs/tombstones or epochs reject delayed work. Never resurrect an
expired instance from a client retry. Bound pulse/contact history and lifetime by
validated content caps. Real-database tests must interrupt after effects commit and
before acknowledgement, including multi-hit and periodic delivery.

## 6. G-debug contract

Keep G's existing collision-debug function and add the selected action's exact
resolved geometry, not a second approximate range calculator.

Show origin, facing, sector boundary, tile-centre radial boundary and eligible tile
centres, continuous aim, projectile corridor/termination bounds, target/effect area,
and blocked contacts relevant to the active mode. Distinguish selection range from
effect radius, and nominal reach from terrain/ownership/elevation restrictions.
Display resolved costs, timing, action ID, snapshot revision and modifier provenance.
A stationary self action shows its origin and any effect radius, not an invented range.

Use the same collision/geometry queries as validation, with canonical-to-screen
projection for cliffs, zoom and raised terrain. Draw authoritative known origin and
limits solid; optionally show prediction dashed. Label snapshot tick/age. A networked
client cannot claim to show unknown current server state: missing visibility/authority
facts are marked unknown, never guessed or used to reveal hidden entities. Debug is
read-only and never grants permissions or changes requests.

Automated parity tests feed identical snapshots to authority queries, reticles and
overlay descriptors and assert identical inclusion at boundaries. Browser checks
cover every facing, height, zoom/DPR, moving/buffed/debuffed actor, charging and
channels. Bound candidate tile scans by effective reach and hard safety caps; do not
scan the whole world or allocate unbounded work when G is toggled.

## 7. Repair UI and item conservation

Proposed access: a dedicated inventory/crafting-adjacent repair panel usable without
an anvil. This preserves a renewable repair route; an anvil may later supply an
authored efficiency modifier through the same action. Station access is a product
policy, not a second execution path. Initial costs preserve current authored repair
material and currency charges, displayed explicitly; no unannounced balance change.

Panel: one tool input (quantity one), material input(s) for authored requirements,
cost/before-after display, and a read-only output preview. Materials can be stacked;
unconsumed remainder stays in input custody. No independent Repair button is needed.

Inputs move into caller-private durable repair escrow using existing authoritative
inventory/cursor transfer semantics. They cease to exist in the source slot. They
cannot simultaneously be equipped, dropped, traded, consumed or loaded in another
station. Preserve the tool's full supported state/identity, including future custom
modifiers and enchantments; if stable item IDs do not exist for a path, use a unique
custody reference plus monotonic revision. Never reconstruct a tool from its kind.

The output preview is a quote, NOT a stored or movable inventory item. It records
input revisions, effective repair amount/cost, content/modifier revision and expected
output metadata. Repair amount is bounded by the tool's canonical maximum durability;
a capacity-changing modifier must have an explicit durable-state normalization rule.
A full-durability/ineligible item yields no collectible output and consumes nothing.

Dragging the preview begins one `takeRepairOutput` operation into the **empty
server-owned inventory cursor**, consistent with existing cursor ownership. In one
transaction, the authority:

1. Verifies caller, session/quote/input revisions, tool custody and all requirements.
2. Recomputes the quote and validates an empty destination cursor; stale/different
   prices fail with a refreshed quote before spending.
3. Removes the input tool from escrow, consumes exactly the payable materials and
   other costs, preserves leftovers, and puts the repaired tool into cursor custody.
4. Advances session revision, invalidates output preview, stores an idempotency
   receipt and emits the success event/statistics exactly once.

Do not send consume/repair/grant as separate client operations. Client drag art is
optimistic presentation only. Failed/full-cursor collection changes nothing. After
success, canceling the pointer gesture does not undo payment or create another tool:
the repaired tool remains in authoritative cursor custody until placed normally.
Lost acknowledgements and reloads rehydrate that same cursor and receipt.

Closing the panel returns staged inputs through one transaction to inventory, or to
existing private overflow if full; it must never drop/discard them. A disconnect or
crash keeps escrow/cursor durable; reopening resumes it, and explicit close recovers
it. Multiple tabs share one session/revision; close racing with collect can commit
only one outcome. Epochs/non-reusable revisions reject old requests after reopening.
A filled backpack does not block an empty-cursor collection, but must be tested when
placing/recovering the result. Output shift-click/double-click/quick-craft are disabled
for the first repair UI unless they use this same single-item transaction contract.

Conservation invariant: each repair transforms exactly one tool into exactly one
repaired tool, consumes the quoted material/currency delta, preserves all other state,
and leaves each item in exactly one custody location. A replay cannot apply a second
transformation to a newly inserted tool. Remove old direct anvil repair handlers and
prompts in the same release as the UI; a legacy repair request must fail without writes.

## 8. Required verification and release boundaries

- Contract tests for all active items/abilities: explicit routes, no ambiguous binding,
  complete numeric parameter inventory, retired/invalid source and target rejection.
- Deterministic modifier tests: stacking, order independence, rounding, negative/zero
  floors, safety caps, overflow, per-action scope, buffs expiring during activation.
- Geometry tests: sector/radius boundaries, diagonals, different origin policies,
  elevation/obstruction, effect area versus selection range, modified range chunk scans.
- Authority tests: real transactional adapters, forged targets/costs/IDs, inventory
  movement during windup, concurrent casts sharing mana/items, duplicate/out-of-order
  events, interruption, restart and once-only statistics/progression/loot.
- Repair state-machine/property tests for arbitrary move/close/collect/retry sequences;
  actual isolated-database two-client races and restart/lost-ack cases. Assert item
  custody and exact balance deltas, not only RPC return values or source-code strings.
- Fixtures: swinging tool, tile tool, bow, wand projectile, staff channel with mana +
  reagent costs, point-area spell, entity heal and self action. Buff and debuff each;
  G descriptors and server inclusion must agree on the same resolved snapshot.
- Regression: mining claims, tier checks, harvest yields, fishing XP/depletion, crop
  ownership/watering/uprooting, charge cancellation, chest/processor/trade custody,
  anvil migration, mounted/hands-full restrictions and all supported input devices.
- Full repository CI, affected production builds, lifecycle metadata integrity and
  generated bindings when contracts/schema change. Test schema/custody migration on
  an isolated copy before publication; no production queries/mutations as tests.
- Every phase that enables migrated behavior must validate the actual published
  content head, schema/bindings/lifecycle metadata and client compatibility first.
  Gate incompatible old clients or safely forward old requests to the single owner.
  Rehearse recovery/rollback for that phase's durable state before enabling it. P6
  must supply/gate the replacement repair UI before retiring legacy repair; P7 is
  the aggregate check, not the first migration rehearsal.
- No merge or production deployment is authorized by this planning request. Future
  publication follows the guarded release/runbook and requires explicit authorization.
  Canonical visual verification URL is `https://orchard.dastari.net/` after rollout.
