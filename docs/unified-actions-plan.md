# Unified actions and repair implementation plan

Date: 2026-09-21. Status: Planned; implementation has not started.

Contract: [specification](unified-actions-spec.md).
Decision: [ADR 002](adr/002-unified-actions-and-repair-custody.md).
Execution brief: [handoff](unified-actions-handoff.md).

## Delivery rules

Use sequential, bounded PRs. Each migrated action changes authority, input selection,
reticle/prompt and G visualization together. Foundation PRs may add unused validated
contracts, but no feature is declared complete while an active path disagrees about
geometry/costs. One action has one owner; temporary compatibility endpoints forward
to that owner and cannot also execute legacy effects. No second spell subsystem.

A phase begins only once its dependencies are integrated into upstream main after
explicit merge authorization. An open dependency PR is a delivery boundary; do not
silently cherry-pick it into another main-based branch. Stacked implementation PRs
would require a separately agreed workflow. Independent preparation/tests may proceed
without enabling dependent behavior.

Before enabling any migrated path in P2–P6, verify actual published content coverage,
private schema and generated metadata/bindings, old-client gating or safe forwarding,
and that phase's custody/recovery/rollback compatibility. In particular, P6 must gate
old clients before retiring their repair endpoint. P7 repeats these checks for the
integrated release; it is not the first compatibility gate.

The planning PR changes documentation only. Do not deploy, create production test
items, or treat proposed parameter values as new balancing decisions. Preserve
existing gameplay/economy unless a task explicitly specifies a change. At runtime
cutover, remove instant anvil repair in favor of output collection through repair UI.

At each phase start: fetch, inspect branches/open PRs and overlapping diffs, branch
from current upstream main, then verify this plan against current sources. Preserve
unrelated work. At phase close: relevant regression and integration checks, required
workspace checks/builds, lifecycle/binding integrity as applicable, documentation and
runtime package version updates, commit/push/PR. Never merge without instruction.

## Tasks, dependencies, and completion evidence

| ID | Deliverable | Depends on | Completion evidence |
| --- | --- | --- | --- |
| P0 | Action/parameter and custody inventory; golden behavior matrix | None | Every active source/lifecycle route classified; unknowns resolved before affected implementation |
| P1 | Validated action schema, parameter registry and pure resolver | P0 | Deterministic modifier, authoring, payload and geometry contract tests |
| P2 | Authority activation/cost/custody framework | P1 | Isolated transactional tests prove once-only effects and shared-resource conservation |
| P3 | Facing-action migration and exact G overlay | P2 | Axes/swords/picks work through all inputs; debug/authority parity, modified chunk-boundary tests |
| P4 | Tile, entity and self migration, including shovel | P3 | Farm/fish/excavation/context regressions, shovel conservation, radius overlays |
| P5 | Generic aimed delivery and spell extension proofs | P4 | Bow parity plus actual wand/staff/area/heal/self fixtures, mana/reagent/channel tests |
| P6 | Dedicated repair UI and retirement of instant repair | P2, P4; normally after P5 | Real two-client/restart anti-dupe tests and complete drag/cursor/overflow UX |
| P7 | Legacy retirement, integration and release candidate | P3–P6 | No duplicate owners/geometry; full acceptance matrix and guarded migration rehearsal |

### P0 — Establish the behavior and parameter matrix

Read `selected-item-use.ts`, input handlers and debug drawing in `overworld-main.ts`,
`tool-swing.ts`, `tile-targeting.ts`, `modifiers.ts`, `ranged.ts`, lifecycle source
metadata, content definitions and authority adapters. Enumerate every active item
variant and learned-action source, its input bindings and target payloads. Classify
all numeric fields and constants using the spec's parameter registry requirements.

Capture current successful and failed actions as goldens: origin/contact points,
range, target filters, costs, accepted/resisted/empty swings, wear, cooldown, loot/XP,
charge cancellation and output custody. Review `executeToolSwing`: its geometric
contacts, including resisted contacts, influence costs/wear; do not accidentally
change that economy when introducing generic validation. Distinguish geometric
reach points from physical LOS/elevation points.

Inventory every writer of mana/vigour/currency/items/durability/cooldowns, including
trade, consumption, processors, repair, death, equipment movement and overflow. Name
which existing transfer operations can serve repair inputs and cursor outputs and
which lack adequate revisions/identity. Resolve shovel behavior concretely: default
proposal is restore unoccupied player-tilled soil to its base ground, with no free
item output; digging crops/immutable terrain is rejected. Any broader excavation or
resource yield needs a declared terrain policy and conservation tests first.

Deliver a checked-in matrix and baseline tests, not just source-text checks. Verify
PR 26 regressions and PR 30 fishing XP against the actual integrated revision.

### P1 — Contracts and effective parameters

Implement the discriminated target payloads, named action bindings, activation and
delivery descriptions, typed resource costs and numeric parameter registry. Wands,
staffs and learned spells must not require a farming/mining tool specialization.
Reuse modifier layers through action-scoped parameter keys, not hundreds of global
actor stats. Enumerate and validate all supported numeric tunables and their units,
rounding, bounds, zero behavior and snapshot policy.

Generate client action metadata and server lifecycle registration from the same
source. Validate absent/retired callbacks, unknown executors/parameters, incompatible
payloads and ambiguous priorities. Add pure resolution/provenance and geometry
queries; no client-only range/cost implementations. Extract existing helpers only
where needed and preserve public compatibility until consumers migrate.

Gate: modifier permutations, scope isolation, overflow, clamp/rounding, all target
union branches, malformed authored content, exact boundary golden tests pass.

### P2 — Authority, state machine and costs

Implement activation identity, phased transitions, request deduplication, reservation
and settlement, cancellation and interruption policies. Adapt existing effects so
prepaid costs cannot be charged again. Keep source/target authorization in effect
adapters as well as common validation. Bound contact selection and effect fan-out.

All writers found in P0 must respect reservations or transfer resources into actual
exclusive escrow before the first reservation-backed action is enabled. Test that
trade, old repair, skills and another cast cannot consume a reserved reagent or mana
balance. Separately test involuntary damage/drains, reduced maximum vitals and death:
reservations cannot shield damage, mint refunds, or leave active unfunded promises.
Apply the spec's deterministic newest-first cancellation policy. Update generated bindings/schema safely where needed; inspect full private
schema diffs, not only client-visible tables.

Gate: isolated real-database tests for concurrent requests, request/payload reuse,
expired receipts, out-of-order phase messages, insufficient resources, partial-output
failure, disconnect/restart and no duplicate refunds. Assert final state/custody and
cost/event totals. No generic transaction helper may grant an effect before securing
all of its nonrefundable costs.

### P3 — Facing actions plus G

Migrate axes, swords and pickaxes through the action controller and common authority.
Preserve eight-way facing, contact categories/filters, mining claims/tier gates,
prepaid nested effects, whiff/resisted costs and per-contact wear. Expand chunk queries
using effective range plus bounded contact-footprint offsets; modified reach must
not miss an entity stored across the next chunk boundary.

Replace old offset-circle visualization for these actions with the resolved sector.
G retains collision display and adds action geometry, origin/contact points, resolved
parameters/costs and rejection reasons. Normal reticles/prompts and G consume the
same descriptors; prediction and last-known authority are visibly distinguished.

Gate: every facing, exact arc/radius boundaries, LOS/elevation, modified geometry,
resource/NPC/chest aliases, multiple contacts, owner permissions and mounted states.
Golden overlay descriptors must match authority inclusion on identical snapshots.

### P4 — Tile and contextual actions

Migrate hoe till/uproot/restore, watering, fishing cast/reel, cellar excavation and
shovel tile use. Preserve the continuous point-versus-tile distinction. Keep explicit
farm body origins and wall projection/source-tile mapping; don't replace them with a
universal feet anchor. Make any broad pointer-picking ceiling account for effective
range while retaining safe bounds. Range bonuses must affect actual picking, reticle,
validation and candidate scans, not just displayed circles.

Migrate entity/self actions through explicit contracts. During transition, temporary
anvil repair has a named contextual route, not a branch-order exception. P6 removes
it; do not design this exception into the permanent default action selector.

Gate: all tool tiers, mouse/F/touch, keyboard fallback, protected/occupied soil,
restore and uproot, valid/invalid water, fishing timing/custody/XP, cellar corners and
raised terrain; every radius buff and debuff updates picking, G and authority together.

### P5 — Aimed delivery and future spell support

Move bow begin/release/cancel through common activation and resource accounting while
preserving its existing charge curve, trajectory, ammunition and recoverable-arrow
rules. Separate point/direction targeting from projectile delivery. Add typed executor
registration rather than branching on wand/staff item names. Additional delivery
families need their own bounded execution implementation; a schema entry alone is
not evidence they work.

Test-only authored fixtures must execute through real authority: instant wand bolt,
staff channel (mana each pulse plus declared reagent cost), free-point area effect,
entity heal and self buff. These prove geometry, timing, cancellation, eligibility,
resource mixes and extensibility without committing a production spell economy.
Demonstrate a buff/debuff to geometry, timing, effects and each supported cost family.

Gate: source swapped while charging, lost release, simultaneous casts, interrupted
channels, resource exhaustion before a pulse, start/release/impact snapshot semantics,
projectile terrain collision and once-only hits. Implement durable delivery instances
and atomic effect/application keys; restart between hit and acknowledgement, between
penetrating hits, and at recoverable-arrow/periodic-area output or expiry boundaries.
Test movement/turning during windup/channel, source swaps after launch and caster
travel/death after launch against the executor's spatial-sampling contract. G shows nominal trajectory limits,
aim and effect shape without leaking hidden targets.

### P6 — Repair authority and UI as one complete change

Add private repair escrow/revisions and read-only quotes, integrate transfer adapters,
then implement atomic take-to-cursor before UI collection is enabled. Preserve every
item field. Author repair amount and costs using the common parameter/cost contracts.
Reuse cursor and overflow handling; do not invent a browser-owned output stack.

UI exposes tool/material inputs, required costs, before/after durability and output
preview. Dragging output is the commit gesture; pending/rejected actions are clear.
Support keyboard/touch equivalents through the same take operation. Closing returns
inputs safely; disconnect persists custody. First release disables batch output
shortcuts unless they satisfy the same tested single-item semantics.

Delete instant repair handlers/prompts and reject stale legacy requests without writes
in this same cutover. Gate against old-client fallback: no direct endpoint may still
spend/grant independently. Keep a repair route available to players with broken tools.

Gate: model-based inventory conservation tests plus real two-client tests for collect
versus collect/move/close, multiple tabs, duplicate/out-of-order requests, lost ack,
reconnect/restart at every durable boundary, full inventory, occupied cursor, excess
materials, changed price/modifiers, full durability, custom tool metadata and replay
against a new session's tool. Test panel recovery without deleting escrow state.

### P7 — Integration, retirement and release rehearsal

Remove superseded special-case input routing and geometry for migrated actions;
search all legacy call sites and retain only explicit adapters with one owner. Ensure
active content is fully migrated: bootstrap fixtures alone cannot validate a live
published content head. Migrate content/actions, schema and client metadata as a
coordinated candidate; validate old clients are gated before incompatible use.

Run the full matrix in spec section 8; run lifecycle integrity, checked world build,
all-workspace typecheck/lint, coverage and exhaustive tests, asset validation, affected
production builds and generated binding checks. Rehearse private-state migration and
reservation/escrow recovery on an isolated copy. Record schema diff, backup, rollback
compatibility and custody reconciliation evidence. Do not roll back new custody
rows into an old module that cannot account for them.

Prepare a reviewable release candidate and guarded publication instructions. Actual
merge/deployment remains separately authorized. Use the canonical Orchard URL for
post-release visual/input verification; Studio output must keep its prebuild guard.

## Acceptance scorecard

- 100% of active action sources/bindings and numeric gameplay parameters inventoried.
- 0 ambiguous default action bindings; 0 duplicated cost/geometry owners for migrated actions.
- Exact target inclusion parity between debug descriptors and authority at all tested
  boundaries on identical snapshots, including modified values and elevated terrain.
- 0 item/currency conservation violations or duplicate effects in generated sequence,
  race, replay and restart tests; no collection from a repair preview without commit.
- Every selected extension fixture works without adding an item-kind routing branch.
- Existing gameplay goldens retained, except explicit shovel/repair UX additions.
- No unbounded world scans; debug uses bounded candidate work and no new per-frame
  network requests. Record action/G timings against baseline representative scenes;
  investigate any measured regression before release rather than inventing a budget.

## Review findings incorporated

Independent planning review confirmed the shared action resolver approach and found
current G uses offset-circle geometry while swing authority uses actor-centred sectors.
It also identified separate physical/reach points, contact-offset chunk coverage,
resisted-contact wear, fixed-point rounding and source eligibility as migration traps.
P0, P2–P5 and their boundary/conservation gates explicitly cover these findings.
Fresh-context adversarial review found spatial-sampling ambiguity, involuntary vital
depletion, delayed-delivery deduplication, per-phase rollout gates and unmerged phase
dependencies. The specification and delivery rules now define these contracts and
explicit tests; see the handoff for resolutions.
