# Unified actions: first implementation slice

This is the first P0 implementation from the [unified actions plan (PR 34)](https://github.com/Dastari/orchard-cellar/pull/34).
The initial branch started at upstream `1d2462cd`. The 2026-09-21 integration
refreshes it against all six gameplay slices, the hoe fix and reviewed Studio.
The inventory now covers 340 items: 148 callbacks, 69 data graphs, 33 furniture
transactions and 90 inert items. See [integration record](branch-integration-handoff.md).
It establishes an executable bootstrap-content inventory and numerical behavior goldens.
**P0 remains in progress:** this is not approval to start P1 or a claim that the full
custody-writer, lifecycle-payload and parameter-classification audit is finished.

## Reproducing the inventory

- `npm run actions:baseline -- --check` compares current bootstrap item content and reviewed ownership against [the checked-in matrix](action-baseline.md).
- `npm run actions:baseline -- --write` regenerates it after reviewing a deliberate change.
- `npx vitest run packages/tools/src/action-baseline.test.ts` runs the drift check, ownership failure cases, and geometry/charge goldens. The normal test suite also runs it.

Every live bootstrap item variant must have exactly one existing reviewed owner:
compiled callback, data graph, furniture transaction, or a reviewed inert group.
Multiple triggers on one callback-owned item are retained; they do not turn the item
into mutually exclusive tool classes. Missing, conflicting, stale or duplicate owners
fail the audit. Source manifests remain canonical in `packages/lifecycle-authoring/audit`;
this report does not create another hand-maintained ownership list.

All numeric leaves of each item are included, even unknown future fields. This is a
change detector, not a modifier registry. Non-numeric changes, code inside callbacks,
learned actions, hard-coded constants and the live published content head are outside
this report's automatic coverage. Existing lifecycle integrity and capability tests
remain required. A new numeric field needs classification before it becomes modifiable.

## Current tool behavior and migration decisions

| Surface | Current main behavior | Required migration |
| --- | --- | --- |
| Axe / sword | Actor-centred 90° sector, base reach 384 fixed units (1.5 tiles) | Shared resolved sector for targeting, authority and G |
| Pickaxe | Actor-centred 45° sector, base reach 256 fixed units (1 tile); separate precise cellar action | Keep separate named actions and target policies |
| Hoe | F routes to the cultivate/uproot/restore tile action with a 2-tile radius; generic entity swing is bypassed | Retain farming actions and the integrated input-priority fix |
| Watering can | Tile action, 1-tile radius | Shared resolved tile policy |
| Fishing rod | Tile cast/reel, 3-tile radius, persistent single-use cast token | Pin accepted source/activation identity |
| Bow | Continuous cursor aim and authority-timed draw/release; arrow delivery | Separate point/direction targeting from projectile executor |
| Shovel | Repair callback only; authored reach/cost does not implement digging | Add restore of unoccupied player-tilled soil; no item output; reject crops and immutable terrain |
| Anvil repair | Contextual `useWith`; damaged tool at anvil takes priority over F swing | Replace with dedicated repair UI, escrow inputs and atomic output-to-cursor transaction |
| G debug | Legacy forward-offset circle still exists alongside actor-centred sector authority | Render exact effective geometry, tile centres/origin, limits and costs from shared resolver |

A tile is tested at its centre with an inclusive Euclidean radius. Farming measures
from the physical body (144 fixed units above the durable sprite anchor); fishing
uses the anchor. The executable goldens test exact limits, one fixed unit beyond,
arc boundaries, diagonal rejection, translated coordinates and independent bow
range/cost/damage samples. Zero-draw bow samples describe the math helpers, not permission to bypass minimum
charge validation. They record current behavior so intentional changes need
review; they do not assert every current inconsistency should survive the migration.

`executeToolSwing` deduplicates contacts by kind/id, validates before spending,
charges once and wears after all hits. Resisted geometric contacts still count for
wear and make a swing non-empty. Empty swings use the whiff economy and zero wear.
Unexpected validation errors abort. Preserve these distinctions in the action
pipeline. Resource geometric reach and physical LOS/elevation points have distinct
origins; do not collapse them into a single point during refactoring.

## Initial numeric classification

| Current source / field | Units | Future treatment |
| --- | --- | --- |
| `tool.swing.rangeFixed` | Fixed units; 256 per tile | Action reach, bounded modifier target |
| `tool.swing.arcDegrees` | Degrees | Action arc, bounded modifier target |
| `tool.reachTiles` | Tiles | Tile-action radius; never infer swing radius from it |
| `tool.swingTicks`, `vigour.minimumSwingTicks` | Authority ticks | Reconcile animation/action timing versus resource cooldown |
| `tool.swing.baseDamageCenti`, `combat.baseDamageCenti` | Centi damage | Resolved effect strength with explicit rounding |
| `vigour.costCenti` | Centi Vigour | Resource cost; existing `toolVigourCost` modifiers apply |
| `durability.max`, `durability.repairCost` | Durability points; Bronze | Repair capacity and currency cost; `repairMaterial` identifies the material separately |
| `tool.tier` | Ordinal tier | Eligibility, not a distance multiplier |
| `ranged.ts` draw minimum/maximum | Milliseconds | Charge timing; currently 120/1000 ms |
| `ranged.ts` minimum/maximum charge cost | Centi Vigour | Currently 100/3000; charge cost rounds upward |
| `ranged.ts` minimum/maximum target range | Pixels | Currently 16/240; max range scales with draw |
| `ranged.ts` projectile speed/lifetime/recovery | Pixels per tick; ticks; seconds | Delivery tuning; preserve separate safety limits |
| `maxStack`, inventory capacities | Item counts / slots | Custody/storage policy; not automatically action buffs |
| Economy, food, fuel, light and modifier numeric leaves | Field-specific | Inventory captures values; affected subsystems must classify before migration |
| `schemaVersion`, transport scale, ID/revision fields | Protocol / identity | Hard compatibility or safety rules; never buffable |

The future registry must declare scope, unit, bounds, rounding, default and modifier
order for every gameplay value. This initial classification deliberately does not
infer units from numbers or register all scanned fields as tunable parameters.
Wands, staffs and learned spells should use the same action contract with explicit
Mana, Vigour, item and currency costs, plus target/delivery choices independent of
which item supplied the action.

## Custody starting points and required follow-up

The next P0 slice must enumerate **every caller and writer**, not just these helpers:

| Area | Existing authority / storage to audit | Migration concern |
| --- | --- | --- |
| Vigour, Mana, health and cooldown | `player_stats`; `validateToolVigourSpend`, `spendToolVigour`, regeneration/combat/death writers | Reservations must be respected by every writer; damage/drains cancel unfunded holds |
| Currency | `player_wallet`, trade offers, merchant and repair paths | Atomic debits and receipts; no cancellation minting |
| Item transfer / equipment | Inventory slots; `loadPlayerInventory`, menu persistence and equipped-state updates | Source slots are addresses, not durable item-instance identity |
| Cursor | `playerInventoryCursor`, `writePlayerInventoryCursor` | Existing single authoritative cursor can receive repair output; needs explicit empty-cursor precondition |
| Recovery | `stashOverflow`, `drainPlayerOverflow`, `returnInventoryCursorToStorage` | Reuse transactional recovery; never copy an escrowed item into two destinations |
| Trade | `player_trade_session`, `player_trade_offer` | Existing exclusive escrow and revision patterns; trace cross-system transfers |
| Processors / crafting | Placeable slots, crafting slots, process jobs and receipts | Pending outputs and legacy recovery also own items |
| World drops / arrows / death | World item and embedded-projectile paths | Trace input consumption through exactly-once output creation |
| Durability / repair | Inventory and cursor durability, wear and repair lifecycle adapters | Same item metadata must survive repair and all transfer paths |

`inventory_protocol.version` acknowledges connection layout compatibility; it is
not an item or repair-session revision. `inventory_cursor` owns an actual stack
with item kind, quantity, durability and light metadata. It has no repair quote
revision or session epoch today. The dedicated UI therefore needs new durable
session/escrow identity, revision checks and retry receipts before enabling it.

Repair inputs must transfer into exclusive escrow. The output slot is a quote,
not a second item. Taking it atomically consumes costs and moves the repaired item
to an empty server cursor. A full backpack may still accept that cursor output;
an occupied cursor must reject it. Aborting the pointer gesture after success
leaves the paid-for item on the cursor. Disconnect persists escrow; closing returns
inputs through inventory/overflow. Stale tabs and repeated requests must not take a
newly staged item. Direct anvil repair is retired in the same gated cutover.

## Existing regression coverage to carry forward

| Contract | Executable baseline suite |
| --- | --- |
| Contact accounting, resistance, empty swings, deferred wear | `packages/world/src/behaviour/tool-swing.test.ts` |
| Production swing discovery, resource frame and terrain filtering | `packages/world/src/behaviour/tool-swing-production.test.ts` |
| Farm reach, occupancy and terrain rejection | `packages/world/src/farm-tool-reach.test.ts`; `behaviour/farm-tool-lifecycle-authority.test.ts` |
| Fishing authority, retries, consumption and reward | `packages/world/src/fishing-reel-lifecycle.test.ts`; `behaviour/fishing-lifecycle-authority.test.ts`; `behaviour/fishing-lifecycle-adversarial.test.ts` |
| Bow authored authority | `packages/world/src/behaviour/bow-definition-authority.test.ts` |
| Item input selection and temporary repair priority | `packages/client/src/selected-item-use.test.ts` |

This list does not substitute for the remaining end-to-end custody/conservation
matrix, learned-action inventory, cancellation goldens or complete constant audit.
Finish those P0 deliverables and integrate the phase before P1, as the plan requires.

## Pending integration and handoff

- [PR 26](https://github.com/Dastari/orchard-cellar/pull/26) fixes farm-tool input priority and fish swimming animation. It was not in upstream main at branch creation; this PR does not claim to ship those fixes.
- [PR 30](https://github.com/Dastari/orchard-cellar/pull/30) changes fishing XP; baseline current main independently and review the intended reward change on integration.
- [PR 34](https://github.com/Dastari/orchard-cellar/pull/34) contains the design, ADR, phased plan and rollout gates. Do not silently stack its implementation phases before dependencies merge.
- Implementation PR: [#35](https://github.com/Dastari/orchard-cellar/pull/35), open; no merge or deployment authorized/performed.
- Worktree: `/home/toby/projects/orchard-cellar-actions-p0`; branch: `feat/unified-action-baselines`.
- Next: complete the P0 audits above, then P1's validated action schema and resolver. Before any enabling phase, verify published head, client/schema/bindings compatibility and recovery/rollback; do not infer live state from this bootstrap inventory.
- This slice changes developer tooling/tests/docs only. No schema, content, runtime action, deployed client or Studio behavior is changed.

## Validation at implementation closeout

`ORCHARD_TEST_LICENSED_ART=0 npm run check` passed: lifecycle integrity, world build,
workspace typechecks, lint, 4,763 tests (one additional test skipped), coverage gates
and asset validation. The asset build/validation covered 1,182 assets. The tools
package build, baseline CLI check and local documentation links also passed.
GitHub CI was queued at closeout; consult PR #35 for its current result.
