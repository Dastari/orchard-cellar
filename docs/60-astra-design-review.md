# Doc 60 — independent Astra design review

Reviewed 2026-09-09 by the requested second Astra agent. This is an offline source
and source-art review, with a concrete authoring layout approved for implementation.
It is **not** approval to publish, evidence of live occupancy, or completed visual
acceptance. Implementation and representative rendered scenes need a second pass.

## Decision

Keep the 832×832 world, original seed, origin and 256–575 home-island square.
Compose the two additional islands within the proposed bounds. A larger map adds
cost without solving a demonstrated space problem. Do not feed new island cells
through the old global smoothing pass: that could change original coastlines.
Use stable, separately seeded bounded masks and authored roads/clearings.

Recommended integration seam: compose bounded cells into MapDocumentV3, carrying
biome **and** surface/elevation/terrain-family/collision semantics. Keep
`survivalBiomeAt` immutable. `resolvedMapBiomeAt` already prefers authored cells,
while `terrainDocumentForMapV3` and `resolvedMapCellAt` feed the shared compiler.
An authored surface replaces inherited generated-water blocking; biome alone does
not. `compiledLiveIslandRuntime` already supplies compiled ground/water collision,
elevation/transitions and authored obstacles. Water traversal uses compiled
surfaces, so collision parity requires all these fields to agree. Install the
composed document before enabling ferries; the precomputed legacy fallback knows
nothing about new island land. Preserve existing sparse edits above patch content
or produce a surveyed conflict manifest before stamping; never replace live cells
wholesale. Additions should be idempotent and have their own stable content version.

The new bounds are outside the original generator's possible land square. That is
source evidence of base-terrain separation, **not** a survey of live sparse edits,
boats, homesteads, chests or other occupied rows. Preserve occupied rows; survey
before applying new land or scenery to the live world.

## Willowharbour layout approved for authoring

Use envelope X64–223/Y320–479; predominantly low, green, irregular land. Keep the
town compact in its eastern half. Arrival has a direct view of the square, inn and
carpenter's sign; rural western space gives the ten buildings room to breathe.

Suggested coastline polygon, before bounded organic edge variation:
`(95,333),(124,325),(147,336),(177,330),(200,348),(208,374),
(217,390),(214,415),(198,432),(196,451),(171,468),(143,472),
(121,456),(98,462),(80,441),(71,416),(82,391),(74,367),(88,349)`.
Keep a small east-facing harbour indentation near Y400. No checkerboard coast,
one-tile stray islets, random houses or decorative paths ending in water.

Coordinates below describe **reserved plots**, not sprite collision boxes. Imports
must derive actual art size, anchor and colliders before stamping structures.

| Structure | Reserved plot | Role and entrance |
| --- | --- | --- |
| Inn | X155–174/Y373–389 | Largest roof and square's northern focal point; entrance south |
| General store/harbour office | X184–198/Y389–401 | Shared harbour introduction and supplies, exterior counter or enterable shop |
| Carpenter | X142–155/Y391–404 | Enterable service; timber yard immediately west |
| Furnisher/tailor | X158–170/Y408–421 | Enterable service and textile/plant frontage |
| Smith | X180–193/Y411–424 | Enterable service; charcoal roof and outdoor work apron |
| Guild/archivist | X174–185/Y366–381 | Enterable service; quieter northern courtyard |
| Residence A | X116–130/Y363–378 | Garden-facing private cottage |
| Residence B | X105–119/Y411–426 | Varied house silhouette; two residents |
| Barn/farmyard | X108–126/Y440–453 | Agricultural landmark, fenced crops and pens |
| Greenhouse | X136–149/Y442–453 | Cultivated southern edge, short garden lane |

Square X163–185/Y393–407. Main harbour lane follows approximately
`(210,400) → (196,400) → (176,400)`. Ferry threshold `(209,400)` and arrival
`(204,400)` are provisional authored ground/dock cells. This is about 28 tiles to
the square centre, with useful storefronts immediately on arrival. Main streets
are 3–4 tiles wide; secondary garden lanes 2 tiles. Keep doors and NPC interaction
cells free of awnings, colliders, trees and storage props.

Use a pond in X131–149/Y370–385 with a narrow bridge near `(143,382)`; its lane
connects the residence gardens to the square. Keep water out of the mandatory dock
route. Market awnings occupy the square edges, leaving its centre traversable.
Hedges define gardens in interrupted runs; small vegetable plots, washing, barrels,
flower planters and working yards explain who lives here. Avoid filling the square
with the entire furniture catalogue.

Six genuinely enterable services are inn, general store, carpenter, furnisher,
smith and guild. Eight service characters can be harbour clerk, general merchant,
carpenter, furnisher, smith, innkeeper, cook and archivist. Add four residents with
their own identities. A harbour clerk outside the shared general-store building
keeps ten exteriors and eight services without inventing an eleventh building.

Art inspected directly: `House_5_Wood_Base_Red.png` is a substantial 180×132 timber
house with central gable and varied roofline, suitable for the inn. The existing
`Blacksmith_House_Black.png` visibly includes forge equipment, chimney and a darker
roof. Select smaller Wood-family houses and occasional limestone accents around
these; use several silhouettes rather than recolouring one prefab ten times.
Neither inspected image is an imported runtime town building yet. New semantic
sprite definitions and provenance remain required; do not ship source sheets.

## Cinderwake layout approved for authoring

Envelope X608–799/Y48–239. Suggested coastline polygon:
`(644,81),(671,64),(706,57),(736,71),(768,69),(789,97),
(793,131),(781,156),(787,186),(764,214),(732,231),(703,226),
(681,234),(655,215),(630,207),(615,177),(624,151),(616,125),(629,102)`.

| Area | Authoring reservation | Composition |
| --- | --- | --- |
| Protected landing | X634–668/Y192–224 | Southwestern harbour, return ferry, cache, clear timber/lantern safety cues |
| Ash shore | X653–719/Y174–207 | Broad gathering clearings, spaced beginner packs, two retreat routes |
| Basalt terraces | X665–759/Y133–178 | Bending paths, readable height changes, ruins and alternate branch |
| Caldera | X695–764/Y88–140 | Irregular raised rim, clearly impassable lava channels |
| Guardian arena | X711–744/Y103–131 | At least 20×20 usable floor after obstacles, approach visible before commitment |

Provisional dock arrival `(652,211)`, ferry threshold `(644,215)`. Approach passes
through `(664,190)`, then `(688,178)` and `(704,153)` to the caldera. These route
anchors require intentionally walkable ground and ramps; they cannot be validated
by a biome colour. Two branches around a lava channel reconnect before the arena.
Do not funnel all players into a two-tile combat doorway. Preserve at least four
clear tiles at encounter approaches and room to step around a charge tell.

Safe dock policy wins over the volcanic danger region. Add a monster-free buffer
outside its boundary; start the nearest encounter well beyond aggro/attack reach.
Treat projectile segment crossing, AoE cells, attacker and victim origins and
knockback destinations with the same authoritative policy. No enemy spawns on the
dock, even if nearby land is volcanic. Lava collision must use a semantic terrain
role, not merely painted red tiles. Use warm sparse shore vegetation, basalt and
ruins; save the strongest lava contrast for higher progression areas.

## Home-island cave: surveyed base-generator candidate

Source survey used `SURVIVAL_WORLD_SEED` and current version 30, sampling generated
height, biome, raised-terrain blocking, resources, decorations and stair transitions.
The eastern plateau is centred near world `(471,401)`. Its south face provides an
unbroken seven-tile span at X478–484:

| Row | Height | Generated result |
| --- | --- | --- |
| Y414 | 1 | Cliff-edge/ridge, raised blocking false at sampled cells |
| Y415 | 0 | Front-facing ridge wall, raised blocking true |
| Y416–417 | 0 | Plains, raised blocking false, no generated resources |

**Candidate:** cave centred on X481 at the Y415 front wall, interaction threshold
`(481,416)` from lower ground, return/arrival `(481,418)`. Keep its approach in
X480–482/Y416–422. Existing stairs at X474–475/Y405–408 remain separate. Cosmetic
grass/flowers appear in parts of the proposed path and need a narrow authored
clearing; no resource appeared in the surveyed threshold span.

Current `survival-tileset.ts` explicitly uses Stone Cliff 1. The directly inspected
`Stone_Cliff_1_Cave_Entrance.png` therefore matches the correct family. It is 48×48,
with runtime anchor `(24,47)` and a current blanket 3×3 blocking placement profile.
Do **not** reuse that blanket profile for the portal: it would obstruct the
approach. Keep the terrain wall intact, render a facade independently, and reserve
one reachable threshold interaction cell. Align visible threshold pixels with the
projected foot of the cliff; the transparent bottom and baked shadow mean sprite
anchor coordinates are not the same thing as logical portal coordinates.

Two lanterns near `(479,417)` and `(483,417)`, a short worn path and sign beside the
approach are enough. Check their art footprints before authoring. Do not cut a
3×3 hole through the wall, occupy the cliff cap or permit interaction from above.

This is the northeastern/eastern stone plateau relative to the starter area, but
it is not the northernmost plateau. The final live map/editor view must confirm
that it matches the user's intended northeastern cliff and is unoccupied. If live
overrides differ, preserve them and choose another continuous south-face segment.

Lobby: retain the requested 24×24 room. Outside exit and arrival alcove at the
south `(12,21)/(12,19)`; supply counter west `(5,14)`, seating east `(18,15)`,
practice corner east `(18,8)`, descent at north `(12,4)`. Leave a clear central
three-tile aisle and useful gathering space. Stone transitions to masonry northward.
Descent requires explicit confirmation; movement into the room never creates a run.

## Gates for implementation approval

- Compare original terrain, height, collision, landmarks and resource placements
  before/after across the complete original square; exact equality except the
  explicitly approved cave scenery/threshold overlay. Existing positions do not move.
- Flood-fill new terrain with colliders: every ferry, door, service, gathering
  clearing and arena has a valid route. Test actual approach positions and return
  directions, including full inventory and empty Vigour.
- Render overview, one town block, square, furnished service interior, furnished
  home, cave from below/above, lobby and each volcanic progression zone. A table of
  coordinates alone does not pass visual review. Inspect day/night, Basic/Dynamic,
  mobile framing, Y sorting and enough negative space to read enemy tells.
- Confirm content counts and service stock; decorative doors must differ from
  usable entrances. Six empty room shells are not six completed service interiors.
- Prove region safety against two players, projectiles, AoE, knockback and leashing;
  ensure loot participation and repeat kills cannot duplicate claims.
- Re-run the requested independent Astra implementation review with scene captures
  and tests before publication.

Doc 59 currently records open performance/rendering acceptance and physical iPad
evidence still to obtain; the latest source note also reports expired owner
authentication. Its passing correctness gates do not close those rows. Record new
baseline/load evidence and actual iPad review before claiming the full doc 60 P6
gate. Canonical shared visual verification remains `https://orchard.dastari.net/`.
Preserve Studio's prebuild guard and use the reviewed Studio release checkout for
editor changes, per AGENTS.md. This review does not authorize bypasses.

## Foundation implementation review, 2026-09-09

Reviewed `hearth-archipelago.ts`, its composition/collision tests,
`combat-regions.ts` and its tests, and the first two terrain-only PNG studies in
`output/doc60/`. Both test files passed: 10 tests. These files remain foundation
work; there are no authored buildings, service interiors or encounters in these
studies and they do not show completed gameplay.

The region primitive correctly defaults to sanctuary, validates explicit protected
children, freezes installed definitions and rejects attacks across or out of a
safe area. It is not yet wired into authority damage/spawn/projectile consumers;
this is a primitive review rather than runtime safety verification.

Actual compiled plane-collision bytes showed all twelve volcanic ramp endpoints
clear and no blocked cells in the tested guardian floor. A player-hitbox cardinal
flood-fill using `collisionMapForCompiledMapDocument`, `positionCollides` and
`movementPositionAllowed` reached all three terrace banks and the arena from the
arrival. It also exposed a **blocked ferry** at the proposed `(644,215)`: the
polygon excluded that cell and `road()` skipped missing land. The implementer
moved the threshold to `(644,207)` and updated its route. Do not restore the old
coordinate without explicitly building a physical dock over water.

`mapCollisionAtPlane` alone does not inspect projected plane bytes and therefore
cannot prove player reachability. Regression coverage should walk each tile edge
in one-pixel substeps with the real hitbox and prove return travel as well.

The initial map validator found a narrow L2 contour at `(764,144)`; its peninsula
vertex was subsequently pulled in. The inn/guild coarse plot reservations also
overlapped on column X174. Move the guild east or shrink the inn reservation before
building imports, and validate plot overlap instead of relying on aggregate counts.

Remaining preservation concerns: reject wrong map ID/provenance despite matching
832×832 dimensions; survey objects, prefabs, landmarks, transitions and runtime
occupancy in addition to cells; and give contribution cells versioned ownership.
Blindly retaining every old contribution cell prevents later patch revisions from
updating their own terrain. Preserve user changes and report a concrete conflict
manifest; a nonempty manifest must block activating ferry content.

Visual direction remains viable, but the first terrain studies need these changes:
the village paving reads as boardwalk, Cinderwake has a hard unblended ocean edge,
identical terrace fills obscure height, and two uniform lava ribbons look temporary.
Use a volcanic shore band, differentiated basalt shelves and irregular connected
lava pools/channels with correct bank/fall art. Add a second authored ascent route
to deliver the requested alternate paths. Final visual approval awaits populated
scenes, close gameplay scale, readable encounters and day/night review.

## Populated Willowharbour study review, 2026-09-09

Inspected `output/doc60/willowharbour-town.png` at its native-detail study scale,
`hearth-village.ts` and the three facade/scenery tool tests. This review compares
the result with doc 60's village composition requirements; no additional original
user reference attachments were available to this reviewer. The crop includes the
central service block, not all ten buildings or the harbour.

**Approved direction:** coherent native timber architecture, varied rooflines and
correct building scale. The inn is a substantial focal point and the smith's dark
roof/chimney/workshop shape gives it a distinct role. Stone paving now reads
clearly. Square size leaves useful traversal space around the fountain and stalls.
Retain these silhouettes and the compact service arrangement.

**Revise before final composition approval:** the identical rectangular hedge
enclosures around every service make it read as separate private plots. A village
square needs active shared frontages. Keep full gardens for the two residences,
some rear/side enclosure for the guild, and open the inn, store, carpenter,
furnisher and smith to their streets. Avoid replacing every lawn with random decor;
use each service's work to explain its frontage.

| Location | Concrete next treatment |
| --- | --- |
| Inn near `(165,391)` | Open terrace beside the entrance with outdoor tables, inn sign and warm lamps |
| Carpenter west of `(149,405)` | Timber stacks, saw/workbench, sample joinery; leave a public approach |
| Furnisher near `(164,422)` | Textile/finished-furniture displays, colour through merchandise |
| Smith near `(187,425)` | Stone/ash work apron, cooling trough and metal racks rather than enclosed lawn |
| Guild approach `(179,382–394)` | Garden lane/courtyard with map board or training feature, not an empty long bright strip |
| Market square | Break up the evenly spaced empty stall row: two north stalls and one east-side stall with goods and reachable merchant positions |
| Fountain and benches | Socially arranged seats, a shade tree or planter off the main route; preserve central circulation |
| Pond crossing | Bank-to-bank bridge art showing the water channel, replacing the current causeway and isolated water sliver |

Keep main routes at least 3–4 clear tiles through frontage work. Service signs must
distinguish the six actual entrances; residential/decorative doors need a clear
private/closed treatment. Add the promised NPCs, working farmyard, quay/harbour
office and interiors before calling this a complete village.

Scenery collision uses small tree-trunk subcell masks and foundation-only building
collision, which is the right separation from canopies/roof art. Current scenery
placement prevents duplicate **anchor** cells only; it does not prevent overlapping
multi-tile colliders or canopies. Existing deliberate placements look viable, but
new frontage pieces need expanded footprint checks. The tool reachability test
conservatively blocks any nonzero mask at tile level and proves door connection;
add actual player hitbox/interaction-position checks once service NPCs and usable
objects are installed. The test does not establish correct counter reach or
door interaction from the south.

Next requested review evidence: whole-village overview showing all ten buildings,
the existing close square view with NPCs and service frontage work, quay, rural
farmyard, one furnished service interior and night lighting. These are explicit
remaining scene requirements, not a rejection of the now-working architecture.

## P2 equipment foundation review, 2026-09-09

Reviewed `equipment-skills.ts`, `skill-gear-metadata.ts`, the authored skill
metadata, all 45 generated item definitions, their import tool and the current
world melee/projectile base-damage integration. The resolver and content suites
passed **14 tests**. Main-hand activation and inventory/Body migration are expressly
unfinished; this section does not certify equipping or persistence behavior.

The trained/effective separation is sound in the reviewed resolver. Invalid ranks
and missing prerequisite chains receive no equipment effect. It does not feed
over-cap values back into ownership. Rare/Epic/Legendary permissions implement the
proposed arithmetic, with two contributions per node, four effective bonus ranks
per loadout and two total over-cap ranks. Priority is deterministic and source
identity deduplication fails closed. Runtime must supply validated equipped slot
instances from active content, and use trained values for tool eligibility and
all purchase/unlock checks. Player priority still needs authoritative persistence
and an explanation in the UI; alphabetic fallback can otherwise favor Archery
over Blade in a fully trained mixed loadout.

**Material integration blockers:**

- Delve enemy attacks in `packages/world/src/index.ts` still subtract
  `profile.damage * 100` directly. This bypasses the defense modifier pipeline, so
  new armor currently supplies no Delve damage mitigation. Route incoming attacks
  through shared authored damage/defense resolution before claiming armor works.
- `modifiersForEffectiveSkillRanks(..., 'weapon')` and other specific contexts
  include global effects too. The existing world pipeline combines global player
  modifiers with a separate tool-context list. A mechanical helper replacement
  doubles global skill effects: Blade rank 6 resolved base 1,000 to 1,180 once,
  but to 1,360 when the global and weapon lists were concatenated. Modifier IDs do
  not deduplicate. Compile exactly once per final action context, or emit a
  context-only supplement; remove the corresponding old trained modifiers.
- Equipment-only stat caps from doc 60 are not yet enforced. Current catalogue
  values are modest, but the metadata parser permits numeric effects up to
  ±10,000 bp per rank; two gear ranks can exceed a 30% cost budget or produce free
  actions if content is changed. Enforce the gameplay caps in the shared equipment
  resolution path, separately from trained skills/boons and technical stat maxima.

Battle Conditioning's new `weapon` context is correct. The old helper applies it
as a global tool-cost modifier; explicitly test farming/mining/fishing to ensure
replacing that old behavior does not stack the two paths. Specialist pendant
effects must use the action's validated tool specialization. Rare pendants at a
fully trained cap correctly grant no extra rank, which must be shown before buying.

The catalogue contains the requested 10 weapons, 25 armor pieces, five shields
and five utility necks. New gear is nonstackable and new armor has no degradation.
With five armor pieces plus shield, current direct bonuses are:

| Loadout | Flat armor, centi | Maximum Health | Maximum Vigour, before neck |
| --- | --- | --- | --- |
| Common | 510 | +0% | +0% |
| Rare | 680 | +3% | +15% |
| Legendary | 850 | +6% | +29% |

Each utility pendant adds another +5% maximum Vigour. The current 1,000-hit fixture
produces legendary/rare damage ratios **1.29877 sword** and **1.27882 bow**, within
the proposed starting band. This is a per-hit comparison using synthetic weapon
plus armor rank contributions. It is not a complete loadout's sustained combat
result: it omits Vigour depletion/regeneration, recovery intervals, bow charging,
enemy armor, movement/dodge/block and strong run boons. Add actual loadout/priority
tests and representative fight timelines before balancing encounters around it.

Flat armor needs an incoming-damage matrix when it becomes active. Existing Delve
enemies include 500–800-centi hits; a 680/850-centi loadout can drive many to the
100-centi minimum. The rare-to-legendary difference can therefore have a much
larger survival effect than the tooltip's armor increment suggests. Measure
time-to-knockout and healing sustain for baseline/Common/Rare/Legendary builds,
without increasing enemy health in response to currently equipped gear.

The refreshed Willowharbour crop was also inspected. Open service frontages,
inn seating and the moved third stall improve the square and are approved as the
next composition direction. The earlier populated-scene completion gates remain.

## P2 authority integration review, 2026-09-09

The earlier armor-budget findings have been acted on: Common/Rare/Legendary
armor-plus-shield totals are now **140/174/208 centi**, and Delve incoming damage
uses shared mitigation. The prior 510/680/850 figures above describe the reviewed
earlier candidate, not the current catalogue. Actual-loadout small-hit tests were
added by the implementer. `equipment-loadout.ts` now compiles trained effects once
per action context, and sends only direct equipment plus skill-bonus deltas into
`equipment-budget.ts`; this closes the duplicate-global-helper design issue.

Main Hand uses equipment index 3/global slot 33 and Body appends at index 9/global
39. The pure migration planner moves crafting 39–47 to 40–48 without altering
metadata. The authority deletes all moved keys before reinserting and runs the old
hotbar migration first. Private per-connection protocol acknowledgement prevents
one updated tab from implicitly approving an older tab; the skill priority table
and caller-filtered view preserve privacy. These are appropriate contracts, but
isolated database migration/restore rehearsal remains required.

**Blocking findings sent to the implementer:**

1. **Delve equipment lock bypass through menu reducers.** At review,
   `loadOpenMenuInventory` checked protocol only. Cursor click, quick craft,
   pickup-all, hotbar swap and container sort reached `writeOpenMenuInventory`
   without `requirePersistentInventoryAvailable`. A client could change equipment
   in a run although the separate quick-move reducer rejected it. Enforce the run
   lock at the common mutation entry and execute every mutation family in tests.
2. **Loadout settlement must preserve activity suppression.** Newly added
   `advancePlayerStats` calls around selection/equipment/priority use the default
   `suppressVigourRegen=false`. While a bow is charging or sprinting, repeated
   selection/priority mutations can settle regeneration between the periodic
   suppressed sweeps. Centralize effective activity suppression in settlement;
   include same-slot selection and repeat-packet tests.
3. **Bow transition and presentation consistency.** `updateEquippedForIdentity`
   cached `bowCharge`, deleted it when changing selected item, then still used the
   old non-null row to hide Off Hand. Re-read validity after cancellation. Draw
   start, fire, cancel, selection and disconnect need a single coherent before/
   after stats/presentation policy; the new shield reserve cannot depend on which
   cancellation entry was used. Draw start did not immediately clamp after
   suppressing the shield, while disconnect deleted the charge without settlement.

Projectile damage is now snapshotted at launch, with old zero snapshots populated
once on a later authority tick. This avoids post-launch equipment switching
changing damage. Old in-flight arrows cannot recover their true historical
loadout; the compatibility snapshot is a documented first-tick approximation,
which needs an upgrade/reconnect test and must not be described as exact launch
history restoration.

`cappedEquipmentModifiers` currently discards a single otherwise well-formed
modifier outside its per-target range before aggregation. For example a
`toolVigourCost` gear delta of −4,000 bp produces **no effect**, rather than the
−3,000-bp budget. Current catalogue effects stay below that threshold, but accepted
skill metadata can generate it and the skill UI will still report granted ranks.
Either reject such metadata consistently or clamp computed gear deltas while
continuing to reject unsupported targets/layers/signs. Do not silently report
effective skill ranks whose effects vanished.

Verification run: four focused sim files passed; the old inventory layout schema
suite failed one obsolete hotbar-only source assertion. The inventory reconnect
suite failed three tests because its extracted authority harness did not supply
the new migration helper/version dependencies. Cursor schema tests passed. Update
the reconnect harness to exercise both old layout migrations, populated/sparse
crafting, metadata/cursor preservation, idempotence and version markers; source
substring assertions alone are insufficient for this migration.

Approval remains pending these fixes, executable authority mutation tests and the
new equipment UI scene review. No publication approval is implied.

## P2 direct-mutation and projectile follow-up

The implementer added the shared menu lock, centralized activity suppression in
advance/preview, settlement around bow-charge removal, draw-start reserve clamping
and stale-charge presentation correction. Oversized computed skill deltas now
clamp instead of disappearing. Executable authority tests are being added; the
following remaining direct paths were identified by source review:

- `dropSelected` directly empties the selected inventory row and sets visible
  equipment to empty. It now accepts selected Main Hand 33 but does not clear a
  matching drawn-bow charge or run normal equipment refresh/settlement. Dropping
  a drawn bow can leave charge suppression active while fire/cancel reject the
  missing selected weapon, and hide a still-equipped off-hand light. Route this
  through common selected-loadout mutation handling while preserving drop action.
- `removePlayerCarriedItem` scans equipped slots as well as carried ones. Quest
  consumption/abandonment can therefore remove future equipped quest gear without
  reserve settlement. Generic `consumeSelected` can also address Main Hand now.
  Durability break/repair changes valid weapon effects outside the common writer.
  These paths require explicit coverage, even if current named weapon stats do
  not contain reserve modifiers.
- `closeCrafting` has neither the new protocol acknowledgement nor run-inventory
  lock; it returns persistent inputs directly. Decide and test its run/recovery
  policy explicitly. Ordinary crafting/build/trade writes inspected here otherwise
  restrict their direct slot access to carried or crafting ranges.

Arrow launch ordering is correct in the reviewed implementation: modifiers and
attributes are captured while charging still suppresses Off Hand, before charge
clear and durability wear. Thus a last-durability shot retains its launch bonuses.
Impact reads saved damage/critical without consulting a changed loadout.

Two action/presentation gates remain: explicit bow cancellation pays charge cost
and recovery, while selection/replacement/disconnect clear the charge directly.
This pre-existing free-cancel gap needs the doc 60 P1 action-rule decision and
equivalent cancellation tests. Fire clears charge and then writes visible bow
equipment; verify that the off-hand light reappears after release without another
inventory or selection event. Run finish restores exact saved vitals and then
deletes charge: do not add post-restore settlement that breaks exact restoration;
refresh presentation separately if necessary.

Follow-up correction: the implementer added explicit equipment refresh after bow
fire/cancel and before/after settlement plus equipment refresh for `dropSelected`.
Source inspection confirms the common menu entry now enforces the run lock and
bow cancel refreshes presentation. The remaining direct mutation guards/tests
were still being completed. Implicit cancellation economics are explicitly a P1
task; P2 does not silently redefine existing charge costs.

## Outdoor combat architecture and initial tuning review

The proposed architecture is approved for implementation: optional authored map
regions with old maps peaceful; separate persistent outdoor encounter profiles;
shared tick-based tell/active/recovery components; frozen committed aim; a maximum
of three committed attackers per player; obstacle-aware leash; and swept boundary
checks. It still needs the following precise contracts and executable evidence.

Acquire the three-attacker quota at **tell start**, not damage time. Ranged tells,
the guardian and its adds all count. Retain the slot through recovery and release
on recovery completion, death, invalid target or leash. Use authoritative rows,
not module globals, so reconnect/restart cannot forget ownership. Every attack has
an increasing sequence and a per-victim hit-once identity; a multi-tick charge or
pulse must not damage a target once per tick. Freeze origin, aim/target point,
direction, plane, phase start and deadline when committing. Ground telegraphs must
match that committed geometry; no retargeting after the tell.

Region policy is part of the compiled map revision. Validate bounded rectangles,
explicit safe-child precedence and contradictory overlaps at publication. A changed
revision invalidates the cached policy and cancels actions whose authority is no
longer valid. Missing/invalid policy is peaceful. Older editor round trips must
preserve the optional field; silently dropping it is a content regression even
though the safe fallback prevents damage.

Check policy at spawn and tell, then again at actual impact. Projectile sweeps,
AoE cells and knockback paths/destinations use the same logical-foot coordinates
and terrain plane as movement. Collision, navigability and policy are separate
requirements: hostile ocean is not a valid ground spawn. The safe dock and an
enemy-free buffer must remain reachable even at zero Vigour. Arrival protection
is authority state and expires on leaving the dock; it must not permit attacking
while protected. A target crossing safety cancels/leashes the committed attacker
without a final free hit.

Suggested first-pass tuning at **20 Hz** (one tick = 50 ms):

| Enemy | Tell | Active action | Recovery |
| --- | --- | --- | --- |
| Ember Slime | 10 ticks / 500 ms | Four-tick hop, one landing pulse | 10 ticks |
| Ember Cowling | 12 ticks / 600 ms | Committed charge, at most eight ticks and four tiles | 12 ticks |
| Pyromancer | 14 ticks / 700 ms | Slow aimed bolt, at most 0.4 tile/tick; separate 14-tick tell for marked burst | 12 ticks |
| Cinder Skull | 12 ticks / 600 ms | Six-tick dive to fixed point, then retreat | 12 ticks |
| Caldera Warden | At least 10 ticks initially | Three patterns at 65% and 30% health; at most two adds sharing attacker quota | Explicit visible windows |

These values are tuning candidates, not latency/touch acceptance. Commit and render
the tell before its active phase under a delayed connection. Define deterministic
same-tick order: accepted defense state, movement, attack sweeps, applied damage,
death/cleanup and rewards. Client animation is immediate but cannot backdate
invulnerability or alter commitment. Include touch users in the same input/state
contract.

Dodge baseline: **1,800 centi Vigour**, six ticks of movement over at most 1.5 tiles,
invulnerability on `[startTick, startTick + 4)`, then eight recovery ticks; the
next attack/block/dodge begins no earlier than `startTick + 14`. Direction is
committed and diagonal distance normalized. Substep collision; stop at obstacles,
cliffs and lava rather than crossing them because invulnerability is active.
Carrying, building, mounted and incapacitated states reject it. Suppress Vigour
regeneration during the committed dodge/recovery window initially and measure
sustain before reducing its cost.

Block baseline: held frontal **120-degree cone**, 600 centi Vigour/second
(30 centi/tick), no Vigour regeneration while held. A confirmed blocked hit costs
400 centi plus 80% of its raw incoming centi damage, paid once for that attack ID.
Take 35% of ordinary post-armor damage, initially with a 100-centi damage floor.
If the full cost is unaffordable, set Vigour to zero, apply the ordinary hit and
enter 12-tick guard-break recovery. Held/repeated packets cannot restart block or
skip recovery. Bow draw, dodge and busy/incapacitated states exclude it. Resolve
projectile block angle from incoming direction, and melee angle from actual
attacker location on the compatible terrain plane. No perfect-parry subsystem.

Use one action-state gate for attack, dodge, block, healing/item switching and bow
cancel. Explicit and implicit cancellation must settle the same committed cost
and recovery; a switch/disconnect is not a free cancel. Settle vitals under the
old activity before changing state and clamp after, using the existing P2 policy.

### Encounter rewards and restart contract

- Persist stable encounter ID, monotonic generation, enemy instance identity,
  immutable reward seed/result and unique `(encounterId, generation)` completion.
  Keep definitions separate from rapidly changing phases and contribution state.
- Count actual applied damage, capped to remaining enemy health, and only useful
  support attributable to this encounter. Do not credit proximity, overkill,
  self-inflicted damage/heal loops or repeated full-health healing. Use a bounded
  contribution window and freeze eligibility on completion; last hit is irrelevant.
- Final death atomically inserts completion, freezes participants, grants Combat
  XP once and creates each participant's reward entitlement. Claim atomically
  consumes that entitlement and delivers exact loot. Full inventory leaves a
  claim available or produces explicitly reserved loot; never lose or duplicate it.
- Leash resets combat HP, commitment and contributions without rerolling reward
  identity or incrementing generation. Respawn increments generation only after
  the quiet cooldown and a server-derived nearby-player/sight exclusion. The
  client camera is not authoritative sight evidence.
- Reconnect/restart preserves claims and completed generations. Cancel stale
  tells when reactivating unloaded encounters; do not fast-forward a backlog of
  attacks into newly arrived players. Revalidate terrain/policy and target space.
- Material and seal rewards need deterministic quantities/acquisition paths.
  Guardian eligibility is per participant and generation, so group play cannot
  multiply one person's claim through reconnect or simultaneous finishing blows.

Bound activation and navigation work: index runtime profiles by space/chunk and
encounter, activate only a bounded nearby set, and cap path search work, live adds
and outstanding projectiles. Do not poll every new island tile or stream every
encounter/interior to every client. Test two players crossing activation boundaries
and restarting the module during a tell, at death and between completion/claim.
Publication remains gated on these authority tests and actual desktop/touch fights.

## P1 committed attack study review — 9 September 2026

Reviewed `output/doc60/combat-telegraphs.png`, `combat-actions.ts`, the engine
telegraph renderer and the current `stepCommittedRogueAttack` foundation. This
is a contrast/composition study and code review, not approval of completed fights.

- Amber fill and cream outline remain legible on both flat study backgrounds.
  Charge and bolt are currently the same dashed capsule. Add repeated forward
  chevrons for charge and a bead/thin centre line for bolt while preserving the
  truthful outer hit-width outline. Do not distinguish them by colour alone.
- Pulse countdown currently finishes at start+10, but the landing hit is start+14
  (700 ms at 20 Hz). During those four travel ticks the warning is already fully
  red/filled. Give flight a distinct landing countdown, or drive the countdown to
  the actual impact tick. The 500 ms initial tell and 500 ms recovery are sensible
  starting values. The image's distant pulse is not evidence for the real
  1.25-tile melee reach; capture the actual approach/hop/landing sequence.
- The 600 ms charge and 700 ms bolt tells are reasonable initial timings. A
  15-tick bolt traversal yields variable speed depending on frozen target range;
  test near/far shots for readability and consider fixed speed with a derived
  lifetime if the close-range shot feels artificially slow. Recovery needs a
  distinct actor pose; removing the floor warning alone does not show opportunity.
- Material authority gap: obstruction is tested only along origin→segment.to.
  A victim inside the 0.9/0.6-tile hit radius can still stand across a side wall
  or around a corner. Check the closest point on the attack segment→victim for
  terrain, policy and plane compatibility before damage. Use the same rule for
  AoE and outdoor sanctuary boundaries, including knockback.
- Hop/charge/dive NPC movement now exists, but a rejected movement candidate does
  not stop the separately advancing damage segment. A player-sized blocked move
  must end/clip that physical attack so an immobilized attacker cannot strike at
  its unreachable frozen destination. A flying bolt may use its own explicitly
  smaller collision shape; do not conflate that with a charging actor's body.
- Tests still need active-phase first/last ticks, pulse only once at landing,
  per-victim hit once per sequence, blocked corner, blocked actor movement,
  target change/death/space change, stale restart, three-commitment cap including
  recovery, and actual dodge/block integration. The reviewed damage path was
  still receiving the defense integration; this is not a claim it already passes.

Next visual proof should use actual cave stone and volcanic/lava backgrounds,
night lighting, a player and three overlapping commitments at native desktop
and small touch scale. Include tell→active→recovery clips and frozen-target
sidestep footage; the static six-panel sheet cannot establish combat readability.

P4's independently reviewed 32+4 catalogue, native art families, recipes, concrete
price baseline and bounded first slice are in
[`60-astra-furniture-catalogue-review.md`](60-astra-furniture-catalogue-review.md).

### Follow-up: telegraph fixes and defense integration contract

The parent reports 24 focused authority/math tests passing after adding thin
obstacle slab checks, stopping blocked physical attacks before damage, extending
pulse countdown to landing, distinguishing charge chevrons from the bolt line,
and correcting Cowling's native foot anchor. Code inspection confirms the new
`combatSegmentObstructed` helper and nearest-contact→victim check, plus movement
rejection before damage. These address the corresponding findings above. This
follow-up does not substitute for the remaining actual-terrain/touch fight review.

The proposed persisted dodge/block/recovery state is a suitable foundation.
Before implementing it, make these integration rules explicit:

1. **One authoritative action timeline.** Store server start/expiry ticks,
   sequence, space, dodge direction, recovery-until and hold owner connection.
   Client ticks never backdate invulnerability. Start each accepted dodge on the
   next simulation tick so all six movement ticks and four invulnerable ticks
   have the same meaning regardless of reducer arrival timing. Reserve/pay its
   1,800 Vigour atomically at acceptance. Invalid attempts spend nothing; repeated
   packets cannot replace direction or extend/restart the action.
2. **Damage ordering includes projectiles.** Current `stepWorld` advances
   projectiles before player movement, then NPCs. Adding defense only inside the
   movement loop leaves earlier damage consumers on the wrong action phase.
   Establish defense phases before every damage consumer and decide whether
   projectile collision uses pre- or post-movement positions consistently. A
   dodge accepted after this tick's damage cannot undo that damage. Use one
   incoming-hit resolver for Delve/outdoor attacks and hostile projectiles.
3. **Defense owns its input lease.** Presence heartbeat currently refreshes
   `player_input.updatedAtMicros`; it is unsuitable as evidence that block is
   still held. Use a defense-specific hold timestamp, monotonically increasing
   command sequence and controlling connection. A stale tab's release/disconnect
   must not cancel a newer tab's hold. Reconnect clears held intent, not paid
   recovery. Reject commands without current authorization/readiness and a live
   player in the matching space. Define and test a short hold timeout separately
   from the existing 30-second presence lease.
4. **Exclusive movement.** The movement loop can drain several queued steps per
   tick. Dodge must not run that loop as well: flush/acknowledge stale queued
   walking/sprinting intent at commitment and prevent input accumulated during
   dodge from bursting out afterward. Normalize diagonal dodge distance, freeze
   its direction, step the full player body through obstacles and cliff planes,
   and stop at hazards/boundaries. A blocked dodge retains paid cost/recovery.
   Do not advance dodge twice through catch-up or client-settled steps.
5. **One resource settlement.** Extend `activitySuppressesVigourRegen` for active
   dodge/block and the agreed recovery phase, including preview consumers.
   Settle old activity before state mutation. At expired boundaries, avoid
   applying the new idle policy retroactively to the whole previously suppressed
   interval. Hold drain is 30 once per tick using last-processed tick; if drain
   exhausts Vigour, release/break guard before incoming hits. For multiple hits,
   each reads the freshly updated reserve; never reuse a pre-loop stats snapshot.
6. **Real shield and facing.** Revalidate equipped, usable off-hand shield on
   start, every held tick and each impact; reject two-handed/bow-charge conflicts.
   Inventory removal, breakage, hand suppression, carry/mount, death, portal and
   Delve transitions settle and terminate block. Equipment switching must not
   clear recovery. Choose an explicit block movement rule (recommended walking
   allowed, sprint/jump/attack disallowed) and use server-authorized logical
   facing. For moving projectiles, incoming direction comes from local flight
   direction, not the launch owner's current position. The 120-degree cone's
   exact boundary and co-located pulse case need deterministic tests.
7. **Bow cancellation is not yet unified.** `clearBowCharge` presently settles
   regen and deletes the row; explicit cancellation separately spends committed
   cost. A dodge/block transition that only calls this helper would still be a
   free bow cancel. Centralize cancellation using charge-start weapon/cost data,
   including implicit selection, drop and disconnect when the selected item may
   already be gone. Fire has already paid: its cleanup must not charge again.
   Specify whether a bow cancel plus dodge requires both costs (recommended) and
   fail atomically if unaffordable; cleanup on disconnect should clamp debt to
   available Vigour and retain recovery, not throw and preserve the charge.
8. **Hits and cleanup are idempotent.** Resolve geometric contact once per attack
   sequence/victim. A contact avoided by invulnerability should still consume that
   sequence's contact rather than damage the player again from the same lingering
   sweep after invulnerability ends. Guard break starts 12 recovery ticks once;
   repeated release packets cannot shorten it. Restart/space change cancels stale
   movement/hold, preserves unexpired cooldown, and never fast-forwards movement
   into a new space. Explicitly keep lava/environmental damage outside dodge's
   combat-hit immunity unless the design intentionally says otherwise.

Required executable regressions: dodge ticks 0/3/4/5/6/13/14; packet duplicates
and two connections; queued sprint before/after dodge; thin obstacle and cliff;
same-tick two hits exhausting block; shield removed/broken while held; heartbeat
without hold refresh; bow cancel by every implicit path versus paid fire;
disconnect/reconnect/restart during each phase; and projectile/NPC impact on the
same tick. Existing pure math tests cannot alone prove these reducer contracts.

### Implemented defense slice: bounded server review

Reviewed the current `player_combat_state`, `combatDefense`, `stepPlayerDefense`,
`resolveDefendedPlayerHit`, bow lifecycle and extracted authority tests. The parent
reports 26 passing authority tests. The following findings are from source review;
they are not claims of independently running an end-to-end world tick.

Addressed contracts: acceptance pays dodge once and starts next tick; normal
movement is excluded and queued movement acknowledged while defense owns motion;
the block lease is separate from presence heartbeat; disconnect checks defense
connection ownership; geometric contact records the victim even when dodge makes
damage zero; successive NPC attacks read current stored Vigour; implicit bow
cancel pays the draw snapshot and retains recovery, while fire passes alreadyPaid.

Concrete remaining issues at this review snapshot:

- **Stale projectile hitboxes after reordering.** `playersBySpace` is built before
  movement. Projectile target construction still reads those snapshot x/y values
  after movement updates `player_position`. Refresh the snapshot or fetch current
  positions when building projectile targets. Existing player arrows can otherwise
  be intercepted at the old location; future hostile projectiles would damage
  that old hitbox. Add a full movement→projectile regression, not only helper tests.
- **Mounting can retain active defense.** `applyMountLifecycle` neither gates on
  combat state nor cancels it; `stepPlayerDefense` checks neither mounted status
  nor a changed hands-occupied condition for dodge. Accept dodge/block, then mount
  through entity interaction: the next defense step can preserve guard or move
  the mounted player along the old dodge path. Gate mount/carry or settle/cancel
  the state, and revalidate mount/carry/health each tick. The current fixture's
  `handsOccupiedFor: () => false` cannot detect this class of transition.
- **Block facing disagrees with presentation.** Initial block stores aimX/Y but
  returns unchanged player facing. A down-facing avatar can guard right, with no
  authoritative visual turn. Renewals ignore new aim too. Either explicitly
  freeze and display the accepted guard direction or authorize coherent turning
  with the corresponding state/presentation update. Test a perpendicular initial
  aim and a held-direction change.
- **Replay protection is lost on owner handoff.** The command high-water mark is
  checked only against the current ownerConnection. Once B takes over an idle
  state, delayed commands from still-connected A bypass A's previously accepted
  sequence. Retain per-connection high-water marks or a server ownership epoch
  which old commands cannot reuse. Test A sequence10 → release11 → B action and
  release → delayed A sequence10, while both transports remain authorized.

Additional bounded follow-ups: `stepPlayerDefense` currently permits a second call
at the same tick to drain block twice; production appears to call it once, but an
explicit lastProcessedTick guard would enforce its stated idempotence. Hold drain
uses `<30`, so exactly30 leaves active block at zero until a hit or next tick;
make exhaustion at zero explicit. Recovery currently permits ordinary movement
and Vigour regeneration: document that intentional tuning or extend the shared
policy if the earlier recovery suppression recommendation is retained. Authored
shields currently have no durability, so do not treat their fixture durability0
as broken; if shield durability is later authored, hasActiveShield must respect it.

The source-extraction tests are useful for real reducer logic, but do not exercise
the scheduled world's position snapshots, interaction/mount lifecycle, or incoming
contact consumption through dodge as a complete attack sequence. These need
targeted integration tests before this server slice is considered closed.

### Defense fixes and native controls study follow-up

Current source inspection confirms fixes for all four concrete issues in the
preceding review: per-connection `player_defense_input` retains replay high-water
marks, mount is combat-gated and active defense revalidates mount/carry/health,
frozen guard direction is echoed to player facing, and projectile target building
reloads current authoritative position after movement. Same-tick defense stepping
is now idempotent; exact drain exhaustion breaks guard. Exclusive defense resets
movement credit and discards pending prediction without rewinding client time.
Recovery intentionally allows ordinary walking and regeneration while blocking
actions; this is now an explicit tuning decision rather than an unresolved rule.

Viewed `output/doc60/combat-defenses.png`. The native parchment buttons are
readable, the separate HOLD instruction helps, and DODGE / 18 V fits the existing
control vocabulary. The cream dashed dodge footprint and blue frontal arc are
distinct. This flat-background study contains no avatar or real encounter and
does not establish alignment, cooldown readability, actual CSS touch size, or
thumb reach on an iPad. Next visual proof should show the arc with the avatar
facing perpendicular to its prior movement, dodge recovery/insufficient Vigour,
and the buttons alongside the real HUD on landscape and portrait touch layouts.

Two concrete client follow-ups remain at this snapshot:

- `updateDefenseHold` does not include every gameplay-input blocker: active trade,
  Delve reward, blocking update prompt and world readiness are omitted even
  though other input paths check them. A previously held keyboard X can continue
  renewing guard behind those overlays. Reuse a complete gameplay-availability
  predicate and release on its transition to unavailable. Touch reset alone does
  not clear keyboard-held intent.
- The asynchronous block-request catch unconditionally sets `blockHoldRejected`.
  An old request may reject after release and a new hold have started, marking
  that newer hold rejected and suppressing its refreshes until the server lease
  expires. Give each held-intent lifetime a generation/token; only matching
  responses may set rejection state or show an action-specific error. Test a
  delayed old rejection after a successful fresh hold.

No additional server blocker was identified in this bounded follow-up. That does
not close full-world integration tests, actual controls acceptance, or publication.

## Outdoor encounters: first placement and tuning recommendation

The parent reports the final hold-input issues fixed with shared availability and
generation-guarded async responses, with 644 world tests and 31 focused authority/
hold tests passing. Full controls acceptance and publication remain open.

Inspected current `hearth-archipelago.ts` and `cinderwake-terrain.png`. The image
still has placeholder lava topology and sparse terrain treatment; camp scenery,
arena identity and a second ascent route are not visually complete. The following
five sites establish the progression spine, not final island population density.

Coordinates are logical tiles. A direct query of
`buildHearthArchipelagoContribution()` verified every cell in each proposed square
below exists, contains no lava and has the stated elevation. That checks terrain
authoring, not compiled player/NPC hitbox reachability or future props.

| Stable encounter suffix | Centre / half-width / plane | Initial members and homes | Aggro / operating limit | Purpose |
|---|---|---|---|---|
| ash-shore | 678,204 / 6 / 0 | Slimes at676,203 and680,206 | 4-tile individual aggro; stay within square672–684,198–210 | First optional beginner pack, near accessible gathering |
| south-basalt | 715,205 / 7 / 0 | One Cowling at715,205 | 5-tile aggro; square708–722,198–212 | Learn charge with plenty of retreat space |
| terrace-kiln | 725,169 / 7 / 1 | Pyromancer725,168 + Cowling722,173 | 6-tile aggro; square718–732,162–176 | First mixed pack, east of ascent |
| skull-roost | 736,147 / 4 / 2 | One Skull at736,147 | 4-tile aggro; square732–740,143–151 | Tight but open dive practice between shelves |
| caldera-warden | 721,117 / 11 / 3 | Warden721,117; optional add homes715,116 and727,116 | Explicit arena interaction starts encounter; square710–732,106–128 | Deliberate three-phase finale |

Keep x704–707's approach and a five-tile clearance around each ramp at y180,
y150 and y138 free of spawn/aggro centres and gathering blockers. Do not populate
the dock sanctuary x634–668/y192–224. The shore encounter starts beyond it, with
at least several tiles of breathing room; sanctuary policy still clips all body
motion, attack segments, AoE contact and knockback regardless of home distance.
Entering safety cancels pursuit/commitment and clears the target, not merely HP
damage. Dock recovery and ferry interaction must work with zero Vigour/full bags.

### Initial profiles at 20 Hz

Use actual HP in the design below; multiply by100 at the centi-based authority
boundary. Native NPC health field units must be checked rather than assumed.
Common blade base damage is18 HP and common bow14 before attributes/modifiers;
these HP values are starting candidates for short shore fights, not measured TTK.

| Enemy | HP / raw hit HP | Tell / active / recovery ticks | Pattern constraints |
|---|---|---|---|
| Ember Slime | 36 / 6 | 10 / 5 / 10 | Frozen hop ≤1.25tiles; 0.9tile landing pulse once on final active tick |
| Ember Cowling | 60 / 9 | 12 / ≤8 / 12 | Frozen charge ≤4tiles; collision ends charge and opens full recovery |
| Pyromancer | 48 / 8 bolt, 7 burst | 14 / bounded bolt travel / 12 | Bolt ≤6tiles, speed≤0.4tile/tick; every third commitment uses a separately marked burst instead |
| Cinder Skull | 42 / 10 | 12 / 6 / 12 | Orbit outside contact range; frozen dive≤3tiles, then visible retreat; no contact damage while orbiting |
| Warden | 450 / 14 charge, 10 vent | 14 / ≤8 / 16 | Three phases at65% and30%; maintain ≥10tick tells throughout |

No invisible passive touch damage, speed boosts on target acquisition, or attacks
while pathing home. Pair members share encounter aggro, but stage the second
initial tell at least six ticks after the first. The three-commitment cap is
global per target across camps and includes tell through recovery. For beginners,
limit the first camp to two commitments and never fill the unused third slot
with a freshly spawned neighbour.

Warden phase1 alternates a single charge and exposed recovery. Phase2 adds one
marked vent burst, with ≥6ticks separation from charge impact; phase3 may add at
most two ordinary enemies. Warden plus those two share the three-slot cap. Keep
at least a two-tile-wide escape lane through vent patterns; vents never cover the
entire arena, sole entrance, or both sides of a player at once. Adds grant no
separate material/XP rewards and cannot recursively spawn adds. Do not summon
replacement adds immediately after a kill; limit one authored add wave per phase.

### Reward and lifecycle invariants

Proposed per-eligible-player **camp completion** payouts: ash-shore24CombatXP +
2basalt; south-basalt32XP +2ashwood; terrace-kiln48XP +2emberglass +1cinder ore;
skull-roost36XP +2cinder ore; Warden120XP +1guardian seal +2emberglass. Existing
wildlife gives roughly14–28XP for small ordinary animals, so these are conservative
first numbers to compare against actual clear time. They are not approved final
economy tuning. Guaranteed shore gathering must also supply ashwood/basalt without
requiring higher-tier combat gear. Keep named equipment progression deterministic
through material/seal exchange; no random-drop requirement to reach the next camp.

For this first slice, use one completion ledger per camp generation. Member deaths
mark progress; grant XP/material entitlements only when all authored members are
dead. Leashing before completion resets the entire pack and its contribution state
without changing generation/reward identity. This avoids repeatedly killing the
easy member, leashing the hard member and farming partial rewards. A later
per-enemy payout requires its own persisted member-death claim IDs.

Eligibility proposal: actual applied damage ≥5% of the camp's original total HP,
or equivalent useful support, with qualifying activity in the last30seconds and
presence in the encounter's space. Bound credit to remaining enemy HP; useful
support means actual recovered damage or mitigated hostile hits attributable to
this encounter, not proximity or repeated healing at full health. Support must
be tied to encounter actions/victims and independently bounded against farming.
Freeze eligibility at completion; reconnecting is not required to receive the
persisted entitlement. Do not demand the last hit or membership in a client party.

Leash on target leaving the operating square plus a two-tile hysteresis margin,
incompatible plane, sanctuary entry, or four seconds without a valid reachable
target. Use bounded obstacle-aware return paths, with no attack during return.
If home becomes blocked, disable the encounter and report the content conflict;
never teleport an enemy through players or into dock safety. Do not reroll HP,
reward seed or generation while returning/resetting.

Keep ordinary completed camps quiet for at least five minutes, Warden fifteen.
Respawn only after that cooldown AND no player is within the server's maximum
supported sight/subscription reach plus a margin for at least30seconds. Do not
trust a client camera or reset cooldown when a reconnect happens. Waiting with a
nearby player keeps the camp cleared for gathering. Increment generation only in
the actual respawn transaction; restart cancels stale attacks and resumes persisted
completion/claims without spawning duplicates or fast-forwarding damage.

Remaining blockers: compiled collision/access checks with final props; safe-dock
cross-boundary attacks and empty-Vigour return; common-only shore fights on touch
and delayed connections; mixed-pack commitment limits across camp boundaries;
Warden phase/add/vent art and actual recovery windows; claim races/full inventory;
leash/reconnect/restart reward conservation; and bounded inactive-region work.
Coordinate approval is provisional until the composed live map's preserved user
objects are surveyed. No publication approval is implied by this recommendation.

### Outdoor damage/reward foundation: bounded authority review

Reviewed `outdoor-encounters.ts`, the persisted outdoor tables,
`persistOutdoorEncounterDamage`, `claimOutdoorReward`, `damageOutdoorEnemy`, the
projectile policy adapter and `outdoor-rewards.test.ts`. Spawning, encounter ticks,
KO recovery and installed material/camp definitions are outside this slice.

The completion/claim transaction structure is sound: final applied damage stores
the completed generation, unique completion key and one immutable item entitlement
per credited identity, and grants Combat XP in the same reducer transaction.
Completed damage retries return zero, and claimed item retries do not grant XP.
Claims are owner-checked and inventory-protocol/Delve-lock checked. Inventory
delivery computes all changes before writing, so an ordinary full-inventory
failure preserves the entitlement and existing inventory. Generation-suffixed
keys preserve earlier unclaimed rewards; a restored active generation alongside
its completion key fails closed instead of issuing rewards twice.

**Concrete claim blocker:** profiles permit a line quantity up to1000 and merge
multiple lines of the same kind. `claimOutdoorReward` sends that total as one
escrow source stack, but `quickMoveItemStack` rejects a source stack above its
definition's maxStack. A stone reward100, or two weapon copies, therefore reports
`reward_inventory_full` even with enough empty slots and can never be collected.
Split each frozen quantity into maxStack-sized source stacks before the single
atomic insertion. Test one oversized material line, duplicated lines whose sum
exceeds the cap, multiple nonstackable items, and partial capacity across several
reward lines. The current stone2 fixture does not exercise this case.

Damage units are consistently converted at the reviewed bridge: NPC health is
whole HP; damage rounds up from centi once, clamps to remaining NPC HP, and credits
exactly appliedHP×100 to the pack pool. The aggregate mismatch check then aborts
the transaction rather than silently losing health/rewards. Camp installation and
reset must set pack max/current centi equal to100×the sum of member max/current
whole HP, including the final member. Do not include reward-free Warden adds in
that original completion pool unless their lifecycle is explicitly modelled.
The current authority tests execute the ledger callback but not the production
NPC-damage bridge; add two-member depletion, overkill, stale generation, and
deliberately inconsistent pool tests before wiring camps.

Dock segment logic correctly rejects hostile→safe, safe→hostile and a hostile
segment crossing the dock, while preserving ordinary peaceful-world arrows. The
outdoor damage gate additionally requires an active matching generation, same
space, compatible plane and unobstructed origin→NPC segment. Undefined policy
allows ordinary arrows to continue but outdoor enemy damage itself fails closed.
Test real shoreline/cliff coordinates with ranged impacts: projectile origin uses
its collision-plane point while NPC melee targets use their stored foot point;
the current flat custom-region test does not prove their elevation agreement.

Two explicit contracts remain for subsequent integration:

- The64-participant cap currently discards every newcomer once full, even if old
  rows are negligible tags and the newcomer deals all remaining damage. Consider
  pruning/replacing the least useful below-threshold rows or reserving capacity
  for materially contributing damage; do not silently deny a strong participant
  because64 stale-but-not-expired tags arrived first. Test this with contributions
  still within the600-tick window, not only the existing expired-support case.
- Eligibility currently uses recent damage plus half useful support, without a
  same-space/presence check at completion. This may be an intentional generous
  reconnect/retreat rule; document it. If the earlier same-space recommendation is
  retained, freeze server-validated eligibility before storing grants without
  making online connection mandatory. No current support authority should accept
  client-provided support quantities.

Respawn's pure helper accepts a caller-provided nearby-player boolean and preserves
the old reward revision; the pending scheduler must supply the quiet-sight window,
member reset and atomic generation transition. Existing callback tests use
in-memory maps without transaction rollback: they demonstrate branch logic and
successful custody paths, not rollback after an XP/claim insertion failure. Keep
a real-module atomic-failure/reconnect test in the acceptance ledger.

### Five Cinderwake materials: content/economy review

Reviewed `import-hearth-materials.ts`, `hearth-encounters.ts`, the native Raven
crafting and jewel sheets, and the existing merchant sale rules. Parent reports
the oversized-claim fix, strongest64 contribution retention and production
multi-member damage tests now passing. Live restart proof remains outstanding.

**Concrete blocker:** Guardian Seal's `sell:0` does not mean unsellable. Existing
`commerceTotal(0, quantity)` returns0 and `planMerchantSale` removes the offered
items. Add the existing `trade.unsellable` tag to the seal so a mixed sale rejects
atomically rather than destroying earned progression for no coins. This does not
require making it untradeable or adding a new account-binding system. Test both
a seal-only sale and a mixed seal/material cart, with unchanged custody/wallet.

Five distinct materials are justified if their sinks stay distinct:

| Material | Recommended role | Native icon assessment / guardrail |
|---|---|---|
| Basalt | Shore masonry, dark hearths/foundations and armor reinforcement | Dark clustered stone crop distinguishes it from ordinary light stone; do not make it a universal replacement for existing stone |
| Ashwood | Volcanic furniture frames, bow stocks and dark cabinetry | Current crafting-sheet column10/row8 looks like a dark metallic bar at native size; use a visibly grained log silhouette instead |
| Cinder Ore | Smith's higher-tier weapon/metal component recipes | Orange rough ore cluster is a useful distinction from a finished ingot; do not use it interchangeably with emberglass |
| Emberglass | Lamps, magical gear fittings and selected trophy trim | Warm jewel crop is readable; retain angular translucent/glassy treatment and a distinct silhouette from the rough ore pile |
| Guardian Seal | Deterministic chosen-recipe/gear exchange | Gold medallion crop supports currency/token reading; keep name visible and unsellable, rather than treating it as an ordinary gemstone |

For ashwood, inspect the existing Raven
`collections/premium/updates/trees-and-logs/sheets/trees-and-logs-16.png`: the gray
log with grain at column5/row1 is a stronger candidate than the current bar.
Confirm the semantic crop in the actual inventory at1×/2× alongside existing
Wood, iron/copper bars, Basalt and Cinder Ore before accepting the change. This
is an art recommendation, not permission to introduce a new wood-processing
system. Retain all five icons' native scale and item labels in reward/recipe UI.

Current coin payouts per eligible participant are16 for shore,16 for Cowling,
78 for kiln,60 for skull, and48 plus a seal for Warden. Thus all four ordinary
camps sell for170 per rotation: a theoretical2,040bronze/hour at five-minute
cooldowns, before travel/combat and sight-exclusion delays. Warden contributes
at most192bronze/hour plus4seals at fifteen-minute intervals. These are steady-state
upper rates, not claims about achievable gameplay or the initial spawn timing.
They are modest beside the existing5,000-bronze bottle base value. No direct coin
minting loop exists in these no-buy definitions by themselves.

Per-participant rewards deliberately multiply across qualified players; group
play is not a duplication exploit, but throughput tests must report rewards per
participant and global minting separately. AFK/proximity tagging must remain
ineligible, adds must remain reward-free, and cooldown/claim conservation is more
important than reducing these small material sale values pre-emptively.

Recipe guardrails for the pending acquisition slice: do not allow one purchased
Wood(6) to become one sellable Ashwood(8), or otherwise add a conversion whose
outputs exceed purchased input value. Keep volcanic IDs explicit in recipes;
avoid broad generic material tags accidentally enabling substitutions. Cinder
Ore30 being cheaper than existing Iron Ore90 is acceptable for a regional recipe
material; scarcity/progression value comes from its sinks and availability, not
necessarily merchant price. Measure gathering yields before assigning final
recipe quantities. Keep ordinary shore gathering attainable with common tools.

The five definitions currently describe ingredients but do not yet establish
useful acquisition/consumption loops. Before calling this content complete, show
at least one distinct useful sink for each, guaranteed ashwood/basalt gathering,
and a published deterministic seal exchange cost. A four-seal chosen-recipe target
would mean four clears; it remains a proposal until gear recipe budgets and
actual guardian duration are tested. Decorative unlocks should not consume those
same seals by default. Publication remains held.

### Population/return/knockout acceptance matrix

Parent reports the seal is now `trade.unsellable`, including atomic mixed-cart
coverage, and Ashwood uses the reviewed grained-log crop. Those two material
findings are addressed. The next scenarios are implementation acceptance criteria,
not claims that the unfinished population slice passes.

Use a deterministic20Hz clock. Ordinary completion cooldown is6,000ticks,
Warden18,000; quiet respawn requires600continuous ticks with no qualifying nearby
player; no-reachable-target leash requires80continuous ticks. Persist timer
origins; do not infer elapsed time by counting whichever lazy ticks happen to run.

| Scenario | Required result / blocker caught |
|---|---|
| Fresh valid installation | Exactly five camp records and seven base members (two slimes, single shore Cowling, kiln pair, Skull, Warden), each with unique stable membership identity. Whole-HP member sum×100 equals camp pool. Re-running installation changes neither IDs, generation nor reward seed. |
| Fresh installation with occupied/invalid home | A player, preserved prop, lava or incompatible plane at one member home prevents that camp's partial installation. No member appears inside a player or sanctuary. Record a resolvable conflict; other valid camps may still install. |
| First approach to an unloaded camp | Instantiate before the camp becomes visible, or defer while anyone is in its protected sight radius. A player arriving directly on a home must not trigger a surprise spawn underfoot. First population cannot use a weaker safety check than respawn. |
| Ordinary cooldown edge | Complete atT. AtT+5,999 no respawn; atT+6,000 respawn only if the independent quiet interval has also reached600ticks. Warden usesT+17,999/T+18,000. Exactly one generation increment in the actual transaction. |
| Quiet interval edge | First continuously clear observation atQ: Q+599 remains empty; Q+600 may respawn after cooldown. A second player entering atQ+599 resets the quiet origin, even if they leave the next tick. Both players' server space/position matter; client camera and party state do not. |
| Restart while quiet/cooldown | Restart atQ+400 must not manufacture600clear ticks or restart the completed-generation reward ledger. Conservatively require a fresh quiet interval if uninterrupted absence cannot be established from durable presence evidence. Old pending claims remain collectable. |
| Last valid target edge | Valid reachable target observed atT. Missing/unreachable throughT+79 does not finish the four-second timer; atT+80 enter return. A valid alternative target atT+79 resets the interval. Merely seeing a row in the same chunk is not reachable-target evidence. |
| Immediate safety/hard-leash exit | Sanctuary entry, incompatible plane or exceeding camp operating bounds+hysteresis cancels that target's commitment immediately. Do not leave an already committed attack active for the80-tick no-target grace. The camp may select another valid hostile target; the safe player remains untargetable. |
| Return interrupted by player | Returning enemies do not attack or accept fresh combat damage/credit until the whole reset is complete. A player crossing their path cannot restart a half-reset generation or farm repeated kill/return rewards. Freeze a clear reset phase for the entire pack. |
| Return interrupted by obstacle/update | Recompute a bounded route around a new obstruction. If home is unreachable, suspend safely without teleporting through bodies or cliffs. No infinite per-tick path search. Clear old attack/contribution state once; keep reward seed/generation unchanged. |
| Partial pack kill then leash | Kill one slime, retreat before the other dies, return/reset. Both member HP and aggregate camp HP return together to the original total. No XP/material grant, stale dead-member row, or partial-completion credit survives. Restart during this reset gives the same result. |
| Policy removed during tell/flight | Remove the hostile region or expand the dock under the target. On the next tick cancel affected aggro/attacks/projectiles before damage; suspend invalid camps without wiping completions/claims. Re-add valid policy: validate homes again and resume the same unfinished generation without duplicate population or rewards. |
| Warden opt-in | Walking into aggro range, shooting the dormant actor, reconnecting nearby and loading its chunk do not start a fight. Only an authorized, in-reach, same-plane arena interaction activates it. Duplicate/parallel activation requests create one fight. |
| Warden after return/reset | Leaving the arena cancels its attacks/adds; reset requires a new deliberate interaction. No immediate automatic re-aggro on the returning player's feet. Completed Warden stays unavailable until cooldown+quiet and starts the next generation dormant. |
| Simultaneous camp pressure | Draw shore and terrace enemies toward one target; never more than three tell/active/recovery commitments globally. Warden plus adds obey the same limit. Expiring/cancelled rows release quota once; restart cannot retain phantom quota. |
| Lethal hit at dock recovery | First lethal hit moves the player to the valid dock recovery point and applies established recovery once. A second committed/projectile hit in the same tick re-reads space/position/recovery and causes no second KO, damage, teleport or reward side effect. |
| No-loss KO custody | Compare inventory slots/metadata, cursor escrow, wallet, equipped gear, pending claims and carried-object custody before/after. KO itself consumes or drops nothing, applies no new durability penalty and preserves earned rewards. Cancel bow/block/dodge without charging a second already-paid action cost. |
| Full bags, zero Vigour, blocked dock point | KO with full bags and zero Vigour still has a collision-safe sanctuary recovery point and a usable ferry. If the nominal point is occupied, choose a bounded safe fallback; never use hostile ground or silently lose carried/cursor items to make room. |

Distinguish a target's immediate safe-boundary cancellation from the camp's
four-second no-target timer. Distinguish ordinary population from Warden combat
activation: it can have a visible dormant actor without granting free damage or
rewards. Define whether quiet time may overlap completion cooldown; recommended
yes, provided both independent conditions hold at respawn.

Keep three integration tests outside pure-helper mocks: two connected players
resetting quiet time; module restart during partial-pack return and between
completion/claim; and one scheduled tick containing lethal contact followed by a
second attack. Those expose persistence/ordering faults that independent timer
unit tests cannot. All remain publication gates for the final patch.

### First population implementation: concrete blocker review

Reviewed `OUTDOOR_NPC_ID_BASE` through `activateOutdoorEncounter`, the outdoor
context in `stepCommittedRogueAttack`, and controller placement before the ambient
NPC loop. This excludes the acknowledged pending Warden phases/adds/vents,
Pyromancer burst/Skull orbit, speed tuning, client UI and live fight acceptance.

Positive findings: all candidate IDs/homes are checked before pack mutation;
aggregate HP derives from whole-HP member definitions; returning/dormant/disabled
packs cannot accept reward damage; reset retains generation/reward inputs; the
Warden requires in-reach same-plane deliberate activation; policy checks cover
committed paths and victim contact; each damage recipient is fetched afresh, so
after KO the next hit sees the dock location. The shared teleport helper also
updates carried custody. Recovery preserves inventory/wallet/claims and makes
the player mobile with35%HP/at least25%Vigour and60ticks action recovery.

Concrete blockers at this snapshot:

1. **First spawn can overlap a visible player.** The new-camp branch spawns when
   `near` is true, without checking player occupancy or visibility at each home.
   `positionCollides` checks terrain/objects, not the supplied player rows. Arrive
   directly at676.5,203.5 before installation: the first slime can materialize on
   the player. Add a server-derived exclusion for homes and visible first-spawn
   locations, while allowing population from an outer activation band. Test direct
   arrival, a second player on another member home, and no partial pack creation.
2. **Temporary conflicts permanently disable population.** Once a camp phase is
   `disabled`, the controller always continues without revalidation; removing a
   temporary obstacle or restoring policy cannot recover it. Disabling a completed
   camp also overwrites its completed phase, so an eventual naive reset could lose
   cooldown/completion semantics. Preserve the prior lifecycle phase separately
   from suspended/conflict status, and implement bounded revalidation or an explicit
   reviewed repair path. Test policy off/on for both unfinished and completed camps
   while retaining old claims, generation and respawnAfterTick.
3. **Return navigation is greedy, not obstacle-aware routing.**
   `stepNpcTowardPoint` tries two cardinal directions toward the destination; it
   does not search a route. A concave/U-shaped obstacle requiring initial travel
   away from home can trap a member despite a valid path, then disable its camp
   after400ticks. Use a bounded camp-local path search or validated waypoint path,
   with replanning on an obstruction and a genuine no-path outcome. Test a valid
   detour and a genuinely sealed home separately.
4. **First obstructed engagement can leash immediately.** `engaged` uses proximity
   without requiring LOS; `lastTargetTick` may still be the spawn tick. Approach
   an old idle camp from behind a wall, within aggro radius but with no reachable
   target: the80-tick condition is already elapsed and the camp instantly returns.
   Require reachable evidence to begin engagement or start a fresh no-target timer
   on that transition. Test long-idle first approach, then valid target loss at
   +79/+80ticks; do not use spawn time as an engagement-loss clock.

One recovery design issue to resolve before enabling combat: if every fallback
dock tile is obstructed, the damage path currently suppresses **all** incoming
outdoor hits while players may still damage mobs and earn rewards. This preserves
custody but creates asymmetric invulnerability if the dock is obstructable. Keep
recovery coordinates/escape route reserved against gameplay placement, and test
that guarantee; if no valid recovery point exists after a map conflict, suspend
the affected encounter symmetrically rather than allow reward farming without
incoming damage.

The initial population tests cover straightforward spawn, a foreign ID, cooldown,
policy removal, target-loss reset and Warden activation. Add the cases above and
an actual KO followed by a second same-tick attacker with full inventory/cursor/
carried custody before considering this controller slice closed. No publication
approval follows from this source review.

### Population fixes: remaining critical follow-up

Source inspection confirms phase-preserving conflict suspension and periodic
revalidation, generation/cooldown retention on completed camps, a bounded return
BFS with cached-segment revalidation, reachable-evidence engagement, and symmetric
outgoing/incoming denial when dock recovery is unavailable. The supplied tests
now include temporary completed-policy conflicts and a return detour. These
address the corresponding earlier implementation findings.

One first-arrival progression blocker remains: ash-shore centre678.5,204.5 has an
exclusion half-width of6+24=30tiles. The ferry arrival652.5,211.5 is only26tiles
away horizontally and7vertically, so it is already inside that exclusion. On the
first-ever ferry visit the beginner camp is absent, and walking directly toward
it keeps it absent. The farther south-basalt Cowling camp can meanwhile install.
The beginner slimes appear only after the visitor leaves their vicinity, reversing
the intended first-visit learning sequence.

Prewarm valid camp population before the ferry teleports its traveller, while all
players are outside the relevant protected sight area, or establish another safe
first-population contract. Test a clean world with no camp rows, ferry arrival,
and direct walk into the ash shore; require the authored beginner pack to exist
without ever appearing underfoot or on screen. The24tile buffer fixes occupancy,
but is not itself verified visual exclusion: the client supports up to9chunks of
view radius. Derive the visibility exclusion and outer activation range together
so there is a usable prepopulation band.

No further critical ledger/cooldown issue was found in this bounded follow-up.
The return regression currently jumps directly to computed waypoints; keep an
actual controller/movement detour test for final integration so the path and
physical movement agree. Boss patterns, full KO acceptance, touch and performance
remain explicitly outside this follow-up and publication remains held.

### Population prewarming closure for this bounded slice

Inspected the final population change: absent camps now prewarm without a proximity
trigger whenever every authoritative topside player is outside their protected
sight area. Both first population and quiet respawn use shared
`OUTDOOR_SIGHT_PADDING_TILES=176`, covering9×16tiles of regional radius plus a
chunk of alignment,8tiles of centre hysteresis and8tiles of margin. The client
regional regression ties this bound to its actual subscription constants.

This addresses the prior first-arrival blocker and the unproven24tile visibility
buffer. The population regression now establishes prewarm before the visitor's
shore approach, while direct arrival into an unpopulated camp cannot spawn a
member underfoot. The real committed-hit callback test additionally verifies
lethal damage recovers to the dock and a second stale-position hit does not reduce
the recovered player's health; inventory/wallet sentinels remain unchanged.

No remaining critical issue was identified in the reviewed population fixes.
The parent reports39population/reward/region tests passing. This is bounded source
and test review, not a live deployment acceptance. The future ferry reducer must
ensure prewarming has happened before its first arrival; the current test does
not invoke an actual ferry journey. Full Warden patterns, controller-path movement
integration, comprehensive custody/KO, delayed/touch fights, restart and performance
evidence remain open with the full patch. Publication is still held.

### Distinct ordinary-enemy behavior: bounded review

Reviewed `hearth-enemy-behavior.ts` and its controller/movement integration.
Persisting the three-step attack cycle at tell commitment prevents cancellation
from rewinding the mage to a preferred attack. The third commitment uses a
separate700-centi burst with its own tell. Skull minimum dive range and the normal
80-tick post-commit reposition interval give it a distinct spacing pattern. The
tick-derived fixed-point distance avoids accumulating movement drift across restarts;
500/650permille are applied to ordinary movement and return defaults to walking
pace. Warden phase completion is not part of this review.

Two concrete fairness/timing issues remain at this snapshot:

- **Mage retreat loses to attack readiness.** `hearthEnemyAttack` gives the mage
  minimumRange0. The controller checks attack commitment before asking
  `hearthEnemyMovement` to retreat below3tiles. Thus a ready mage fires its bolt
  at point-blank range instead of obeying the stated3–6tile attack band. If that
  band is intended, give bolts a3tile minimum or prioritize close retreat. Decide
  explicitly whether the separately marked burst is allowed as a close-defense
  exception; do not accidentally apply the same minimum to every pattern.
- **Blocked Skull dive skips exposed recovery.** A blocked active movement in
  `stepCommittedRogueAttack` deletes the attack row and sets the NPC recovery
  pose. On the following tick the controller exempts skulls from its recovery
  wait, so the skull immediately retreats/orbits, unlike its normal12tick
  committed recovery. Retain a recovery-until tick/phase when a dive is cancelled
  by collision, then start reposition behavior after that window. The80tick
  reposition delay must not replace the actual punishable recovery window.

Add production-controller tests for mage at2.9/3/6/6.1tiles when attack-ready,
bolt→bolt→burst across a cancelled commitment and pack reset, and Skull normal
versus blocked-dive recovery at the exact transition ticks. Measure skull movement
with the real mover rather than teleporting to proposed targets: retreat to2.4,
orbit2.4–2.9, and3tile maximum dive should all remain inside the camp/plane and
respect obstacles. Check1000ticks of500/650permille movement against the intended
fixed-point travel, including restart at an arbitrary tick phase.

No new reward/generation issue was identified in this behavior slice. Final
ordinary-enemy visual/latency/touch fights and the previously open full-patch
gates remain required; this review does not approve publication.

### Ordinary timing fixes and Expedition Rewards code review

Rechecked the two behavior fixes. All mage casts now require a minimum3tile range,
explicitly choosing retreat rather than a close-defense burst exception. A blocked
lunge retains an `enemy_attack` row with zero tell/active ticks and its full
recovery duration, preserving commitment quota and preventing immediate Skull
retreat. The outdoor next-attack tick adds the appropriate reposition interval
after that recovery. Both prior timing findings are addressed in the source.

Reviewed `OutdoorRewards`, `OutdoorRewardsModel`, the connection's owner-receipt
subscription/revision tracking and `OverworldUi`/main integration. No material
custody, retry, Delve-lock or keyboard blocker was identified. The component never
removes a receipt optimistically; pending requests block repeated collection,
success waits for authoritative disappearance, failed inventory delivery allows
retry, and request generations ignore late responses after receipt replacement.
The model validates receipt JSON and item definitions and refreshes on store or
content revisions. Empty grants can be dismissed through the same authoritative
claim path; earned XP is accurately labelled as already received.

The window is available through the system menu and O shortcut; left/right page,
Enter collects, and its open-window state blocks chat from intercepting Enter.
Collection is disabled for an active Delve while the server independently applies
the inventory lock. Pointer/scroll dispatch respects the existing close control.

Keep a close→reopen-during-pending integration case: main supplies an empty entry
list while the window is closed, which invalidates its local pending request.
Reopening may allow a redundant same-ID call before the receipt deletion arrives;
server idempotence preserves custody, but the UI should remain clear when the
older response resolves or rejects. This is not a newly identified authority
exploit. Also test malformed/missing-content rows and a long item list at the
smallest supported UI frame. Native screenshot review is still forthcoming;
no visual acceptance or publication approval is implied by this code review.

### Expedition Rewards native screenshot review

Viewed `output/doc60/equipment-rewards.png` at1440×810, rendered from480×270
logical UI pixels. Provenance explicitly marks an offline authored fixture,
`liveData:false`; its example Ash Shore contents are not evidence of actual camp
payouts. The four-row layout is clear: camp title, already-earned Combat XP,
receipt count, identifiable native material icons/quantities, persistent-custody
message, and a large green Collect action. No clipping, button overlap or material
label ambiguity is visible at this tested size. The revised Ashwood log reads
clearly as wood beside the dark Basalt and warm ore/glass icons. The styling fits
the established parchment/wood UI. This screenshot passes the bounded readability
review; no visual change is required for this state.

Main now always supplies revision-cached receipt entries, even while the window
is closed, and the component skips identical entry lists while still updating
its Delve-blocked flag. This addresses the previously noted close/reopen pending
state issue. Parent reports146targeted tests passing, including mage range edges
and actual blocked-Skull recovery.

Still require actual collection/full-bag retry/Delve-disabled states and a long
scrolling receipt at the smallest supported touch layout. The screenshot does
not prove live subscriptions, server grants, iPad input or release readiness.
All broader boss/ferry/live/restart/performance gates and publication hold remain.

## Warden three-phase implementation design review

The proposed450HP guardian, phases at300HP and150HP, charge/vent alternation and
two reward-free slime adds fit doc60. Exact thirds are acceptable tuning; the
document requires three readable phases, not specific percentages. Keep health
at450 while testing this added pressure rather than increasing health as well.

### Phase and attack invariants

- Use integer comparisons: phase1 above300HP, phase2 above150HP, phase3 at150HP
  or below. Track desired phase separately from applied phase, or calculate desired
  from current HP and persist the applied monotonic phase. Health reaching0 must
  complete immediately without running pending phase/summon work.
- Commit a phase change only when the current attack has completed recovery.
  Preserve every already-committed target, pattern, timing and damage value. A
  threshold-crossing player hit cannot shorten a tell, replace charge with vent,
  or start the next pattern during exposed recovery.
- If one hit crosses both thresholds, move directly to phase3 at that safe
  boundary. Do not queue phase2 and phase3 transitions back-to-back or force
  skipped attacks. Display one phase transition cue, then a fresh full tell.
- Reset alternation deliberately on phase entry: recommend the first phase2
  attack be a vent after its transition cue; phase3 begins with a charge after
  the summon warning. Persist the committed pattern index so cancelled actions
  and restart do not rewind the alternation. Keep add spawning out of that index.
- The proposed charge14tell/8active/16recovery (700/400/800ms) and vent20tell/
  one active tick/16recovery (1,000/50/800ms) are good first candidates. Keep
  charge≤5tiles and vent radius≤0.9tile initially. These are two distinct
  punishable patterns without continuous heat or hidden persistent damage.

### Base-member/add partition is a correctness blocker if omitted

Current controller and conflict revalidation require the profile count to equal
`definition.members.length`, and current outdoor damage credits every profile's
applied damage to aggregate camp HP. Introduce an explicit base/add role before
adding rows. All validation, damage, reset, targeting, serialization and cleanup
must use that partition consistently:

- Exactly one base Warden profile supplies450HP/45,000centi to completion. Adds
  have their own HP, but do not change this maximum/current reward pool. Damage
  and useful support against adds produce no completion contribution, Combat XP
  or independent claims. Cosmetic hit feedback can still show actual add damage.
- Base membership checks validate the one authored boss; add validation allows
  only the two reserved wave slots with the same encounter generation/reset
  identity. Do not accidentally treat a missing dead add as a base-state conflict.
- Reserve stable add IDs within the camp's16-ID allocation without depending on
  mutable profile iteration order. Persist each slot as pending/spawned/dead
  (or equivalent), so restart and simultaneous ticks cannot duplicate a summon.
- Final boss death atomically completes the base ledger and removes/cancels all
  adds and their commitments. The rest of that tick must reload or skip stale
  member snapshots so an add cannot hit or reinsert an attack after boss death.
  Projectile impacts on removed adds cannot become fallback wildlife loot.
- Leash clears phase/wave state only as part of a full, quiet reset. That reset
  retains the unfinished generation and reward identity but starts a fresh combat
  attempt. Dead adds may return on that fresh attempt; never regenerate them
  during the same active attempt. Restart alone is not a reset.

### Summon fairness and native presentation

Use the previously checked pads715,116 and727,116 on the level3 floor, then
validate the actual body footprint and route to the fight. Pads are candidates,
not permission to overlap a preserved prop, lava, player, exit lane or another
actor. Test current authoritative positions immediately before insertion. Require
at least two tiles' player clearance; if unavailable, leave that slot pending.

Show a visible summon mark for20ticks before an add appears; revalidate at the
end and cancel/defer that mark if occupied. Spawned slimes wait another20ticks
before their first full10tick hop tell. Offset the second slot's readiness by
at least6ticks. Commit spawned/dead slot state atomically with its NPC row. Pending
slots must stop retrying on boss death, return, conflict or phase reset. Players
standing on pads may defer optional adds; do not punish that by spawning elsewhere
underfoot or forcing displacement.

Boss plus at most two adds fit the global three-commitment quota. Keep their
impact times at least6ticks apart initially; simultaneous independently targeted
markers can otherwise demand more than one dodge's4tick immunity. There must
remain a walkable escape from the marked danger using ordinary movement, even
at zero Vigour. Vents cannot cover the entrance or the only route away from a
charge lane. A collision-clipped charge still provides full16tick recovery.

Native Cowling art needs guardian identity beyond its name/HP: reuse a coherent
existing warmer/armored variant where available, and add a restrained arena crest
or aura plus a boss name/phase health display. Do not enlarge the sprite without
matching reviewed physical bounds. Keep charge chevrons, vent ground rings and
summon marks distinct by shape as well as colour. The vent should visibly erupt
at its one damage tick and vanish into a harmless aftermath. Phase changes need
one readable cue; no forced camera shake or screen-wide flash.

### Required blocker scenarios

Test HP301/300/151/150/0, a single hit skipping both thresholds, crossing during
tell/active/recovery, restart with a pending transition, and a blocked charge's
recovery. Test both pads occupied, one slot deferred while the other spawns,
restart after insertion but before first attack, add death then repeated summons,
and leash/reset versus mere restart. Test boss death while an add's active hit
is due in that same scheduled tick, with one full base completion and no add XP.
Verify the controller's original one-member invariant still holds through a
complete three-body fight and that all profile/attack rows are cleaned up on
death, policy conflict and quiet reset.

Finally capture an actual phase2/3 fight over volcanic terrain at native desktop
and touch scale with delayed input. The proposed timings are intentionally
conservative, but mathematical spacing and a static marker study cannot prove
readability or unavoidable-targeting absence. Publication remains held.

Additional rewards visual evidence: independently viewed
`rewards-full-bags-compact.png` and `rewards-delve-compact.png` at360×270logical.
Both retain readable item rows and uncut footer text. Full-bag retry uses clear
red guidance with the Collect action still available; the Delve state explains
the lock and visibly disables Collect. These two offline states pass their
bounded visual review. They do not establish live delivery or physical touch
acceptance. Parent reports500UI/selected-client and675world tests passing plus
types/build checks; full-patch gates remain open.

### First Warden implementation: bounded correctness review

Reviewed `hearth-warden.ts`, the role/phase/summon profile fields, add preparation/
cleanup, summon controller, phase transitions, impact separation and damage
partition. Source-level positives: base membership excludes adds; add damage
does not reduce the45,000centi completion pool or earn participation credit;
phase changes wait through recovery, preserve the20tick cue and skip directly to
phase3 when appropriate; add slots persist pending/marking/spawned/dead state;
occupied pads defer independently; actor presence and routes are rechecked before
insertion; spawned adds receive20/26ticks grace; and boss death clears their rows
and commitments. The outdoor member loop reloads profile/NPC rows before acting.
The six-tick impact separation includes the full charge sweep window rather than
only its endpoint. Those are appropriate implementation choices.

**Critical stale-actor blocker remains in the ambient loop.** `occupiedNpcs`
contains snapshots captured before outdoor processing/projectile cleanup.
`clearOutdoorAdds` deletes both the NPC and its outdoor profile, so the ambient
loop's profile-exists skip no longer recognizes a removed add. The deleted
snapshot then falls through into ordinary NPC processing, where
`updateWorldNpc` calls `world_npc.id.update` on the removed row. This can abort
the scheduled transaction that killed the boss/removed adds (or cause erroneous
orphan processing if mutation semantics change). Reload the current NPC at the
top of that loop and skip missing rows; do not rely only on the now-deleted
outdoor profile. Test actual boss-death→cleanup→ambient processing in one scheduled
tick, plus policy conflict and leash removal, with strict missing-row-update
fixtures or a real module. Direct damage callback tests cannot catch this path.

Remaining summon restart fairness case: a persisted marking slot whose20ticks
elapsed while the camp was not being processed currently spawns immediately on
the next controller call if its pad is clear. Occupancy/grace still prevent an
instant hit, but a newly arrived viewer may never see the promised summon mark.
On stale/unobserved resumption, re-arm the marking interval before insertion,
or establish and test another explicit visibility guarantee. Cover no active
players while marking, restart/resume and a newly arriving player3tiles from a
pad; keep the same slot identity and never reset a previously spawned/dead slot.

No further base-pool, threshold or exactly-once reward flaw was identified in
this bounded review. Native crest/phase/summon rendering still awaits its screenshot
review; phase3 escape/readability, full scheduled-tick tests, live restart/touch
and performance acceptance remain open. Publication is held.

Immediate follow-up: source now reloads each ambient `snapshotNpc` and skips
deleted rows before classification. The shared outdoor committed-hit callback
also checks a live NPC/profile and active matching-generation camp before stale
cached callbacks can apply damage. These address the identified stale-actor code
path; the parent is adding the extracted ambient-loop regression after real
cleanup. The stale/resumed summon-mark fairness case remains to be resolved.

Viewed `warden-cues.png`: charge chevrons, circular vent marker and angular cyan
summon rune remain distinguishable on both flat day/dark backgrounds. The
direction is sound. The large gold double-ring guardian crest uses a shape and
colour similar to harmful ground markers; consider a smaller static crest/phase
pips or explicitly test that players do not interpret it as an unmarked contact
AoE. The image contains no real terrain, adds or player movement, so phase3
overlap, active vent eruption and escape readability remain live/composed-scene
review items, not passed gates.

### Warden bounded follow-up closure

Rechecked the persisted `summonLastTick` implementation: a skipped processing
interval re-arms the full20tick mark; uninterrupted observations advance it;
spawned/dead slots remain untouched. The new40→1000→1020 regression checks the
fresh warning before insertion, then verifies1100does not duplicate bodies.
The resumed-summon fairness finding is addressed.

Parent reports the actual extracted scheduled ambient loop now runs over cached
pre-cleanup snapshots after real boss-death cleanup, with strict failure if a
deleted add reaches generic collision/update. Together with the cached-add-impact
guard regression, this supplies targeted evidence for the previously identified
stale-actor paths. The reported focused set is47passing tests plus world/client
types and lint; this is not a real-module restart test.

Viewed the refreshed `warden-cues.png`: the compact crown and phase pips replace
the large double ring and no longer resemble a second circular damage area.
Charge, vent and summon silhouettes remain clear on the day/dark study grids.
These revisions close the bounded cue finding. No further critical issue was
identified in this follow-up; phase3 actual-terrain fights, full boss integration,
live/touch/restart/performance evidence and the full-patch publication hold remain.

### Basalt arena cue-contrast study

Independently viewed `output/doc60/warden-arena.png` (1536×1152, zoom3, shared
archipelago terrain centred at721,117). The cyan summon diamonds at715/727,116,
cream/gold vent ring and compact guardian crown/pips remain legible over the
actual dense basalt texture. Their outlines separate successfully from the floor;
the bounded terrain-contrast check passes without a cue-colour change.

The arena itself remains visibly unfinished: this is an undifferentiated repeating
floor with no entrance framing, perimeter identity, ruins/volcanic landmarks,
lighting composition or scenic dressing. Add those without blocking the reviewed
summon pads, escape lanes or attack silhouettes. A readable cue fixture is not a
finished caldera environment. This image also has no player/add movement or
active eruption sequence, so it does not establish phase3 combat acceptance.
Parent reports685world tests and client/engine types plus checked build passing;
live, touch, full terrain combat, performance and publication gates remain open.

## Ferry first implementation review

Reviewed `hearth-travel.ts`, `travelHearthFerry`, the shared portal/teleport path,
`FerryMenu`, client E-targeting and the initial pure/authority tests. The fixed
source threshold408,317 and arrival407,317 sit beside authored Fin409,317 without
moving his definition. All three cells are explicitly listed in
`FISHERMAN_DOCK_WALKABLE_TILES`; their raw freshwater biome is correctly overridden
by the existing ground walkway. This preserves Fin's placement; live object
occupancy and interaction-priority coexistence still require the P0 survey.

The route allowlist, same-space/source2tile range, source plane/obstruction checks,
new-destination policy gate and no-fare design are appropriate. Passing false for
the portal's legacy range check is correct after these explicit ferry checks;
it retains mount/custody semantics without imposing a second mismatched range.
The shared path denies carried player-owned boats and moves a permitted horse
and carried-object custody together. Homeward travel intentionally does not depend
on volcanic camp readiness or continued destination policy installation.

Two concrete authority gaps at the reviewed snapshot:

- **Charged bow survives departure.** `usePortalRow`→`teleportPlayer` resets action
  presentation/fishing/defense but does not clear `bow_charge`. A direct ferry
  request while drawing therefore carries the committed token and its off-hand/
  regen suppression to the destination despite a cleared avatar action. Settle
  and cancel it through `clearBowCharge` with equipment refresh, or reject drawing
  departure explicitly. Preserve the established committed cancellation cost and
  recovery; failed landing must not spend it. Test the actual shared transition
  with a bow charge, not a stubbed `usePortalRow` callback.
- **Free landing cell need not have an escape.** `hearthFerryLanding` validates a
  same-plane collision-free point within2tiles but not a usable path to the dock's
  ferry/approach. A fallback in a pocket enclosed by props can strand a traveller,
  especially with full inventory and no ability to remove blockers. Require a
  bounded player-body path to the destination's return threshold/approach, and
  reject isolated candidates. Check actual collision geometry, not tile-only
  flood fill; a blocked nominal landing may still have a valid alternate route.

Prewarmed record presence is a useful first gate but is not full destination
readiness proof. Before publishing routes, verify the actual composed map,
matching member generations/body state, conflict-free camp installation and a
working free return interaction. Completed camps remain valid destinations; do
not require living mobs merely to travel. Existing tests establish route logic
but stub the shared portal, so horse/boat behavior, cursor/carried custody,
pending trade/menu cleanup and empty-Vigour/full-bag travel still need integration
coverage. Repeat a successful request from its old source must fail by position.

The menu's explicit named destinations and dangerous-Cinderwake cue fit doc60;
pending input suppresses duplicate clicks and failures preserve travel choice.
Keyboard1/2 and pointer hit paths still need their UI tests and native small-frame
screenshot. Verify Fin's dialogue/first-catch quest remains reachable near the new
ferry E target. P0 live survey/map installation and publication remain held.

### Ferry follow-up: cancellation closed, swept escape proof still open

Re-read the updated reducer and actual extracted transition test, independently
ran both ferry test files (9/9 pass), and viewed `equipment-ferry.png` at its
360×270 logical size. Named destinations, numbered actions, free travel and the
explicit Cinderwake danger sentence are readable without clipping; the red button
also has textual context. This passes bounded compact-menu readability.

Successful departure now clears the committed bow and refreshes equipment after
landing validation, then uses the actual portal path with its duplicate range
check disabled. The extracted real cancellation/portal/teleport test demonstrates
one cancellation charge and carried chest/barrel relocation. Its lifecycle/stat
helpers remain mocked and its wallet/bags/cursor snapshot is external fixture
state, so this is useful callback coverage, not a live persistence/custody proof.
The previously identified charged-token gap is closed.

The new bounded cardinal BFS rejects isolated tile pockets, but its edge check
still uses `combatSegmentObstructed`: an anchor-centre ray, not a swept body. This
is a remaining correctness issue in the claimed body-clear route. Independently
reproduced with endpoints204.5/205.5,400.5, a thin obstacle atx205tiles±1pixel and
vertical extent7–11pixels above the anchor: both endpoint `positionCollides`
checks are false and the ray is unobstructed, while the midpoint body collides.
The player hitbox is raised6pixels above the anchor, making this especially easy
with low prop collision masks. Use swept `playerHitboxBounds` against obstacle
bounds or actual movement-sized substeps for BFS edges, with a corresponding
thin offset obstacle regression. Publication and live gates remain held.

### Ferry swept-edge closure

Reviewed the replacement cardinal edge test: the union of endpoint
`playerHitboxBounds` is the exact swept rectangle for these axis-aligned moves.
Checking its covered cells with `collisionTileIsBlockedAtPlane` and closed
intersection against object obstacles closes the thin-offset-prop gap. The new
regression blocks the sole route beyond the radius-two landing candidates and
includes an unobstructed control. Independently ran both ferry files:10/10 pass.
No remaining blocker identified in this bounded fix; live destination readiness
and journey/custody acceptance remain open.

## Cliff lobby integration: existing runtime review

The existing integration seam is appropriate: client targeting consumes the active
space's `runEntrances`, E opens `delve-confirmation`, and `startRogueRun` creates a
private instance only after the confirmed request. `finishRogueRun` uses each
member's saved return space/position/facing and restores saved vitals, remainders
and hunger independently of current entrance definitions. Preserve that contract;
never migrate an already-running player's tent return to the lobby.

Concrete implementation constraints from the current code:

- Admission presently checks radius only. Add plane and collision/reachable-side
  checks for the sealed descent threshold, and match the client's targeting.
  The exterior cliff portal must likewise reject interaction from the cliff cap
  or through its solid wall; a48×48 decorative facade does not define walkable
  geometry. Crossing the exterior portal creates no run.
- `startRogueRun` presently snapshots `ensurePlayerStats` (which simply returns an
  existing row) and teleports without clearing `bow_charge`. Settle outstanding
  activity and committed cancellation before saving vitals and hunger; refresh
  equipment, then snapshot the resulting state. Otherwise a token can cross into
  the run, or cancellation cost can be restored away. Re-read survival after any
  hunger settlement. Test a charged admission and exact restored resources on
  voluntary exit, defeat and victory.
- Current checked-in `spaces.json` contains no `runEntrances`. Runtime authored
  overrides may differ. Adding the lobby entry must use the active content/runtime
  path; the existing test is mostly source-order assertions, so add executable
  callback tests for no entrance, closed confirmation, valid descent, repeated
  request and returning old members after entrance removal.
- Use a stable dedicated24×24 lobby space outside the dynamic50000–59999 run range.
  Keep it peaceful and separate from the private run's member/party state; owner-only
  admission remains unchanged. Define an explicit always-visible outside portal.
  Reconnect in the lobby must not create or attach a run automatically.
- Saved returns are exact and `finishRogueRun` does not perform landing validation.
  Reserve the lobby's entire permitted admission/return footprint against player
  construction and movable obstacles, and preserve the legacy tent return space
  and exits. Do not solve a blocked return by silently rewriting active member
  coordinates or discarding their resource snapshot.
- Existing admission denies mounted or occupied hands. The outside-to-lobby portal
  must provide a coherent mounted/carrying refusal before stranding anything;
  supply/stash objects need explicit ownership/custody semantics rather than shared
  unguarded inventory. A practice corner must respect the lobby's no-hostile-damage
  requirement and should not grant repeatable combat rewards.

P0 live cliff/override occupancy survey remains required before fixing exterior
coordinates. The earlier481,415 facade /481,416 threshold /481,418 return proposal
is still provisional. Native lower-ground approach, Y-sort, lights, wall solidity,
return clearance and actual saved-run reconnect tests remain acceptance work.

### Delve admission preflight and snapshot closure

Reviewed the updated `startRogueRun` and `rogue-admission.test.ts`; independently
ran admission plus existing entrance authority tests:9/9 pass. The reducer now
requires clear source/threshold bodies, equal elevation, range and an unobstructed
interaction-origin segment before resource settlement. This is an interaction
visibility check; unlike ferry escape routing, it need not assert physical travel
along the segment. The eventual lobby still needs a reachable authored threshold
and client targeting that agrees with these authority conditions.

Ordering now closes the charged-admission snapshot gap: advance and reject a dead
player, cancel the committed bow, refresh equipment, advance again, then re-read
survival and save vitals/remainders plus post-cancellation hunger. The charge cannot
enter the run, and saved return resources no longer refund its cancellation cost.
Return space, exact position and facing remain the admission location. The new
callback test uses real bow cancellation and hunger spending and asserts these
saved fields; invalid entrance geometry leaves charge and run creation untouched.

No new blocker identified in this bounded change. Stats advancement, equipment
refresh, room initialization and teleport remain mocked in this test, so it does
not yet prove complete admission→victory/defeat/abandon restoration or reconnect.
Those scenarios and the reserved unobstructed return footprint remain required
when the lobby geometry/content is installed. Existing saved tent returns remain
unchanged; publication remains held.

## Lobby bare geometry and native palette review

Independently inspected `output/doc60/delve-lobby.png`, the shared layout/collision,
engine classification and floor-theme branch. Ran sim and engine lobby tests:
3/3 pass. The southern arrival neck, broad central gathering area, western supply
alcove and eastern practice bay provide a useful asymmetric plan. It has enough
clear floor for meeting and loadout inspection without requiring a larger room.
The reviewed descent12,5 and practice18,10 avoid the projected wall footprint;
keep those logical clearance decisions when adding facade-sized doorway art.

Authority and renderer use the same generated elevation/plane collision bytes.
The traversal test samples each cardinal edge at every fixed unit and reaches all
five named points; it is stronger than an endpoint-only flood fill. Re-run with
actual furniture/door obstacles because current collision contains no props.
Reserve a continuous central arrival→descent lane and a clear return/exit alcove.
Put supply storage against the west boundary and practice furnishings in the east
bay, leaving the shared hall open. Avoid creating queues across the south neck.

One material visual adjustment before furnishing: the southern cave floor is a
flat rust rectangle with a hard horizontal cut into blue-gray masonry. It currently
reads as unfinished substrate, not rough cave flooring. Source inspection confirms
`tile_cf_cave_floor_middle` is itself a solid native#8a4836 tile, so this is not a
missing-image bug. Use matching native cave floor/detail pieces and a deliberate
stone threshold or broken masonry transition to articulate that change. Preserve
native source colours; do not solve it by applying a blanket recolour to the kit.
Keep large dark exterior substrate areas visually subordinate to the room.

This passes the bounded shape/collision foundation review, with the cave transition
still needing art work. It does not establish final atmosphere or scale: add native
doors, counter, benches/stash, practice fixtures, warm local lights and a player
before the furnished review. Exterior cliff integration, content activation,
protected return footprints, live transitions and publication remain open.

### Follow-up: north-wall projection mismatch is a blocker

A closer comparison of visual and collision datums found a real alignment defect;
the earlier geometry review established mutual collision consistency, not correct
alignment with visible wall courses. The row5 threshold workaround should not be
accepted as proof that the wall is behaving correctly.

`terrain.ts` sets the lobby renderer's `baseDatum:0`. However,
`terrainPlaneCollisionBytesForElevationGrid` derives its datum from the
`dungeon_1` tileset, whose `interiorFamily` datum is1, and the physical compiler
again chooses the tileset datum. With two wall rows and elevation1, rendering
moves faces north2tiles while collision leaves their logical destinations unmoved.
An executable probe atx12 shows otherwise open rows2/3 have plane0 collision;
row4 has no plane0 byte but its raised foot box still overlaps row3, so the first
clear cell-centre body is row5. Only this last partial-row overlap is intentional
player-anchor behavior; the preceding two-row displacement is not.

The existing rogue rendering path also hardcodes datum0 while invoking the same
collision helper, so copying that setup does not establish correctness. Align the
render and physical compilation datum explicitly in their shared contract, ideally
retaining the currently intended visible room at datum0. Avoid globally changing
interior tileset defaults without auditing their cellar/editor consumers. Add a
visual-plan destination versus physical-byte regression, not just renderer-array
versus authority-array equality, then reassess descent/practice thresholds and
full-body clearance. The previous traversal tests can pass despite this defect
because both consumers receive the same misplaced collision bytes.

### Projection correction and seven-piece furniture foundation

The explicit optional projection datum now reaches the physical compiler; lobby
and both rogue engine/authority consumers pass0 to match their existing renderer.
Default tileset behavior remains unchanged. The lobby test now distinguishes
visible northern face rows0/1 from floor rows2/3, including the intentional raised
foot-box overlap at row2 and clear body at row3. Independently ran lobby and engine
terrain tests:41/41 pass. This closes the previously identified datum mismatch.
Descent12,3 and practice18,8 can now be considered on their actual visible plane.

Reviewed the refreshed native image and shared seven-piece furniture producer.
Authority and client both receive the same lower-footprint obstacles; rendering
uses the same authored anchors. The full-body traversal includes those obstacles,
and the central route remains open. The textured cave patch makes the entrance
read more convincingly as rough ground; a deliberate masonry threshold would
still finish the otherwise abrupt material seam.

For the next furnishing pass, the paired bookshelves currently float several
tiles below the north wall. Place them against that wall flanking the descent
(likely foot row3, after actual art/body checks), or clearly compose them as
freestanding partitions. The two supply stools are also three tiles from the
table; move them closer or group them as waiting seats so their relationship reads
intentionally. Native scale and colour are compatible with the masonry. The
remaining open hall is useful circulation space, not a reason to scatter props.

This is a furniture foundation pass only. Doors, service identity, stash ownership,
practice fixture, lights, player scale/Y-sort and real activation/return journeys
remain unfinished; publication remains held.

## Lobby static identity and practice-target authority

Reviewed the authored65532 lobby, allocator reservations, target provisioning and
carry preflight. Independently ran lobby authority, admission and existing entrance
tests:13/13 pass. Reserving every active static space in both homestead and run
allocation is correct. The24×24 underground definition carries the intended
12,3 descent at1.5tile reach without adding exterior portals or altering saved
Marlow returns.

The fixed practice target is provisioned only for the active lobby generator,
retains current health on repeated ensure calls and rejects carrying through the
actual effect preflight. It uses the existing nonlethal regenerating target path;
the inspected melee branch records damage/tool-use statistics and wear without a
new direct XP or reward grant. This remains a practice service foundation, not a
completed supply/stash service or proof of all ranged interactions.

Two concrete live-installation gates remain:

- Future allocation reservations do not resolve an existing private space already
  allocated at65532. `runtimeSpaceDefinition` prefers static definitions over
  dynamic instance definitions, so installing the lobby could shadow existing
  private geometry. Survey homestead/child-instance ownership and relevant portals
  before activating this static ID; choose a free stable ID if occupied. Preserve
  all existing custody and saved returns.
- Target provisioning runs on init/connection. A content-head update while players
  remain connected needs an explicit provisioning step or verified reconnect before
  opening the lobby route. Its fixed ID4294966903 also requires conflict checking:
  ensure preserves any existing row with that ID rather than validating ownership,
  location or kind. Repeated provisioning must never overwrite an unrelated row.

The current authentication-blocked live survey cannot establish either absence of
conflicts. These are installation gates, not reasons to halt safe local authoring.
No exterior travel or publication approval is implied by the passing local tests.

## Orrin supply service and authored character art review

Reviewed Orrin's authored NPC/dialogue/shop and the new runtime-kind art mapping.
The arrow/torch/apple bronze offers inherit existing prices and commerce authority;
the merchant session still requires the matching dialogue, shop node, same space
and NPC reach. No new grant or currency path is introduced. Native miner artwork
fits the quartermaster role. Runtime ID collision survey remains mandatory because
existing authored NPC materialization can update a conflicting row's kind/name.

The mapping commits atomically and ignores an older head completing after a newer
head. World sprite, bounds and portrait consumers share the same override. The
active catalogue currently has four relevant nonmount NPCs, so this is bounded
loading. Independently ran artwork and lobby authority tests:6/6 pass.

One concrete issue to resolve:

- Client records `npcArtContentHash` before asynchronous success. Any rejected
  asset load rejects the whole mapping; the catch only logs and an unchanged hash
  never retries. A transient failure can leave Orrin on fallback indefinitely.
  Add bounded retry/backoff with head/generation ownership, ensuring old failures
  cannot poison newer heads or create a per-frame request loop. The generic loader
  can also return a placeholder, so native visual acceptance must inspect the
  actual intended asset rather than treating any fulfilled promise as proof.
The initial reach finding is retracted after tracing the actual merchant paths.
`npcWithinInteractionReach` uses an inclusive3tile radius in all three authority
dialogue/shop checks, and client `targetMerchant` also uses3tiles. The1.5tile
`NPC_INTERACTION_REACH_FIXED` constant is used for ambient behavior, not these
admission paths. Orrin5,11 and frontage5,14 therefore meet the actual rule exactly.
Add the proposed real-helper frontage regression; nearby off-centre customer
positions sit outside that exact radial boundary, so native movement verification
should still check that the usable frontage feels natural. No counter proxy or
NPC relocation is required by the reviewed authority code.

The refreshed scene was not yet supplied for this review; no furnished visual or
live shop acceptance is claimed. Publication remains held.

### Orrin artwork retry closure and updated room composition

Re-read the three-attempt loader: it waits250/1000ms between failures, retains
successful per-asset results, commits only a complete current mapping, and checks
state ownership before another request after backoff. An obsolete failure cannot
replace or restart the current head. Exhaustion retains the last good mapping and
reports failure; this is a reasonable bounded fallback. Independently ran art and
lobby authority tests:9/9 pass, including the actual merchant frontage helper.
The retry blocker is closed; the earlier1.5tile merchant finding remains retracted.

Viewed the refreshed lobby image. Orrin is clearly visible behind the table;
stools now belong to that counter grouping, and the north-wall shelves frame the
descent instead of floating in the hall. The target gives the east bay a clear
purpose, with ample central circulation. These changes improve the room's readable
service layout without crowding it. The southern cave exit artwork is visible,
but its final connection/threshold treatment still needs the complete portal view.
The northern doorway currently reads as an open arch; give the final sealed
Begin Delve entrance a clear closed-door/interaction identity and retain its
confirmation behavior. Lighting, signs, stash service, player movement/Y-sort and
actual entrance/return journeys remain unfinished. This is bounded composition
acceptance, not final scene or publication approval.

## Closed descent and six-torch contract review (image pending)

Reviewed the shared native closed-door draw and six fixed nonblocking torch
placements. Door and torch artwork enter the same depth queue as furniture.
Torch drawing and point-light generation use the ordinary placed-torch tile
anchors and flame profile; client light projection matches other flame emitters.
The presentation-only IDs do not create mutable world objects or new collision.
No concrete code-contract blocker found in this bounded inspection.

The current offline lobby tool draws terrain, native sprites and the depth queue
without the gameplay lighting composite. Its next image can establish closed-door
and torch placement, but cannot establish actual illumination or atmosphere.
Use a lighting-enabled gameplay fixture for that acceptance. Refreshed native
image review remains pending; final scene/live/publication gates remain open.

### Closed door and torch placement image review

Viewed the unlit91c4c48974ab7340004e4fce8f38626105cfe7a7db0e2b5661479aeb577d3770
fixture. The native closed descent now reads clearly as a door and fits the
shelves/wall. Six flames identify the arrival, descent and service areas without
filling the central circulation space. One minor silhouette adjustment: the
north-right flame overlaps the bookshelf's lower-left edge. Moving both northern
torches one row south should retain symmetry and separate flame/book silhouettes;
verify against the next image rather than altering collision.

The proposed southern replacement is appropriate: use an unrotated native cave
opening inset into the south wall at exit.tileY+1, removing the upside-down arch
outside the room and its unrelated combat glow. Preserve the solid boundary and
logical interaction portal; the art should communicate an exit from the arrival
alcove without implying a hole the player must walk through. Check final Y-sort
with a player at the exit threshold. No other material placement blocker found.
This remains unlit art/placement evidence; illumination and live travel acceptance
remain pending and publication remains held.

### Gameplay lighting and southern wall attachment review

Viewed Dynamic fixture4bdf8d31db22cc1e249aa2e659ce536554630ba7cf459bdbeddba296fd0679a2
produced through the gameplay painter, depth ordering and lighting pipeline. Cool
masonry remains legible; six warm flame accents distinguish arrival, descent and
services without washing out the native palette. Orrin, table and practice target
retain readable silhouettes. Moving the northern pair has separated flames from
the bookshelves. This passes bounded offline Dynamic lighting/readability.

The southern opening is now upright, visible and attached to the wall, without
the unrelated combat glow. Its explicit elevation1 raw depth item correctly
expresses a wall-mounted visual while leaving player authority on plane0. Sampling
the receiver at the shared exit location keeps its light context tied to the room.
No new code-contract blocker identified. Because this attachment intentionally
paints above floor entities, verify actual player Y-sort at and near the exit;
the current no-player fixture does not establish that overlap behavior.

Basic mode comparison, stash ownership/service, connected portal and actual
arrival/return journeys remain open. This does not constitute live acceptance or
publication approval.

### Visible exit pose and Basic comparison

Viewed `delve-lobby-exit-player.png` and `delve-lobby-basic.png`. At the revised
shared exit12,19, the avatar is fully visible within the alcove and separated from
the wall-mounted opening; arrival12,18 is one step farther inside. Keeping the
wall visual anchor independent from the interaction point is appropriate. This
closes the static threshold-occlusion finding. It does not prove live movement or
all nearby poses. Basic mode retains readable floor, door, Orrin and practice
silhouettes; Dynamic's warm accents remain useful without being required to find
these elements. Both bounded offline checks pass.

### Minimal private stash design recommendation

Use one fixed-capacity owner stash, initially20 slots, exposed through a native
chest/cabinet fixture beside the west service bay. Label it “Personal Stash” so
players understand the shared-looking cabinet does not share contents. The object
is a visual interaction anchor, not a public world chest with hidden UI filtering.
Persist slots in a private table keyed by owner identity plus slot index, and
expose only the sender's slots through an owner view. The server derives owner
from the authenticated sender; reducers accept no arbitrary owner identity.

Adapt the existing `loadOpenMenuInventory`/`writeOpenMenuInventory` boundary so
`moveItemStacks` and `distributeItemStack` retain their shared stack/capacity rules.
Use a private active-stash session and revalidate lobby generator, same space,
reachable anchor and persistent-inventory/Delve lock on every load and mutation.
Integrate all menu paths, including cursor, split, quick transfer, distribute and
throw; a new opening reducer alone is insufficient. Preserve durability, lit state
and stack metadata exactly. No grant, currency conversion or world object carrying
is needed. Keep equipment settlement/clamping on any transfer touching player gear.

Close/teleport/disconnect invalidates the active session without deleting stash
contents or duplicating cursor items. Do not force overflowing cursor contents
into public drops; preserve the established private cursor/overflow custody.
Return from a Delve must not reopen stale remote access. Simultaneous connections
for one identity remain serialized by reducer transactions; stale source/quantity
requests fail or use the current stack under the existing inventory contract.

Acceptance minimum: Alice/Bob isolation including subscriptions and forged direct
requests; full stash/bag no-loss failures; exact durable/lit item round trips;
reconnect/restart persistence; stale access after walking away, ferry, run start or
session replacement; closing with occupied cursor; equipment cap/resource handling.
These are design constraints only; stash service remains unimplemented here.

## Private stash backend first review

Reviewed the new private slot/session tables, owner views, connection ownership,
open/close paths and generic menu load/write integration. Slot authority derives
owner exclusively from the sender, and both table definitions omit public access.
The owner-filtered views do not expose another identity's rows. Stash mutations
use the normal stack planner and player inventory/equipment write path; the writer
revalidates reach and connection ownership. Cursor closure uses existing private
inventory overflow, not public world drops. Disconnect clears only the session
owned by that connection. These are appropriate custody/isolation foundations.

Two concrete issues at this reviewed snapshot:

- `writeOpenMenuInventory` protects unique quest items only when depositing into
  `chest` or `placeable`, not `stash`. `abandonQuest` removes its configured quest
  items only from carried inventory. Stashing `marlow_book`, abandoning/reaccepting
  the quest and collecting its new personal surface item retains an old copy and
  creates another. Reject unique quest-item deposits into stash, or comprehensively
  extend quest custody/abandon/regrant accounting. The narrow deposit restriction
  is preferable for this slice and needs a production writer regression.
- `interactNpc` directly opens the initial dialogue without clearing stash state.
  The lifecycle `openFrame` hook does not cover that initial reducer path. Opening
  Orrin's greeting while in reach can leave stash authority active behind the new
  frame. Clear it on successful NPC interaction, preserving cursor custody. This
  is lingering same-owner session access, not cross-player leakage.

The cabinet is not authored yet. Keep its physical footprint separate from the
shared clear interaction point; do not place a blocking chest exactly over a point
that `hearthStashWithinReach` requires to be collision-free. Use the established
body interaction origin when finalizing visibility around cabinet obstacles.
UI/bindings, actual slot-transfer tests, owner subscription tests, disconnect and
travel integration, restart persistence and publication remain open.

### Stash restriction closure and compact UI review

Re-read the updated restriction/session paths: unique quest-item deposit checking
now includes `stash`, and successful `interactNpc` clears its active session. These
close the two preceding backend findings. Private connection-matched active views
feed the explicit `frame:hearth_stash` container. UI slot binding, pointer requests,
quick moves in both directions and server sorting consistently use `stash`, not
public chest/placeable custody. Independently ran stash authority and content-frame
UI tests:11/11 pass.

Viewed compact360×270 `equipment-stash.png`: all20 stored slots, inventory slots
and hotbar fit, with clear Personal Stash/Your Stored Items labels and intact item
silhouettes. The native cabinet in `delve-lobby-stash.png` belongs beside the supply
counter and leaves its approach separate from the interaction point. This passes
bounded compact layout and cabinet placement review. No new concrete blocker
identified in the inspected source/destination mapping.

The production-helper tests still mock surrounding inventory/cursor/lifecycle
services; they establish the tested callback logic, not real server rollback,
restart persistence, multi-client subscription isolation or every occupied-cursor
travel/close path. Those live acceptance scenarios remain open, as do exterior
portal installation and publication.

## Lobby portal preparation and custody validation review

Reviewed `prepareHearthLobbyPortal` and its generator-gated shared portal hook.
Source-space, reach, clear bodies, same plane and interaction-origin visibility
checks precede living/resource settlement. Mounted/occupied-hands/run admission
is denied, exact destination clearance is required, and successful lobby entry
provisions the practice target before cancelling bow/equipment state. The ordinary
teleport path preserves cleanup/custody behavior. Independently ran the newly
available lobby travel tests:9/9 pass. Adding private stash custody and item
references to the existing admin read-only validation projection is appropriate.

One client/authority contract mismatch remains before activating portals:
`targetPortal` still advertises a legacy±1tile square without the lobby's1.5tile
radial/plane/visibility rules. This can advertise blocked upper-cliff or corner
approaches. Furthermore, `usePortalRow` runs the legacy range check again after
successful lobby preflight; the exact positive1.5tile boundary floors to source+2
and is rejected by that second check. Share the lobby reach/geometry contract with
client targeting and bypass only the redundant legacy range after validated lobby
preflight, preserving unrelated generic portal behavior.

Exact free landing is not a complete exterior escape survey. Final authored
landing/return footprints still need reserved reachable space and existing-object
occupancy verification; no coordinates or portals are activated by this helper.
Live survey, complete journeys/persistence and publication remain held.

### Lobby portal reach parity closure

Reviewed the shared `hearthLobbyPortalApproachClear` and both consumers. Client
classifies a route by current source or authored destination lobby generator;
authority uses the resolved source/destination generators. Both use the same
inclusive1.5tile radius, clear bodies, elevation and interaction-origin visibility.
The shared portal now skips its legacy square range only after lobby preflight;
non-lobby portals retain their original range and mount/private-home checks.
This closes the reviewed contract mismatch. Independently ran lobby travel plus
world rules tests:43/43 pass.

The new boundary cases test both signs at exactly1.5tiles, one fixed unit beyond,
and a rejected legacy square corner. These exercise the shared helper/preparation;
a future actual `usePortalRow` callback regression should additionally ensure the
second legacy check cannot be reintroduced unnoticed. No new blocker identified
in this bounded correction. Activated cliff coordinates, live journeys and
publication remain held.

## Six Willowharbour service interiors: pre-layout review

The proposed six roles match doc60 and the six enterable village facade plots.
Treat32×32 as the finite canvas, not a requirement to expose equal empty floor area
in every building. The substantial inn should feel largest; the compact general
store/smith facades should lead to denser, smaller rooms. Initial usable envelopes
can be roughly inn24×24, general store18×20, carpenter22×20, furnisher24×22,
smith20×20 and guild22×22, with shaped alcoves and wall mass inside the canvas.
These are composition targets, not final logical coordinates or live ID approval.

| Interior | Recommended composition and functional correction |
|---|---|
| Inn | South arrival opens toward two dining groups with a clear central lane. North service counter/kitchen forms the focal point; guest alcoves branch from a side passage so bedrooms are not thoroughfares. Two service roles can be innkeeper and cook; food and introductory village contract need real content. |
| General store | Compact stocked room with two native shelf banks and clear customer aisles, north counter and goods grouped by farming/everyday supplies. Avoid identical bookshelf wallpaper as a stand-in for actual merchandise. |
| Carpenter | Broad demonstration/workbench floor visible on entry, timber storage against one side and a small assembled furniture example on the other. Use wood/material stacks, workbench and tools; keep the working yard role consistent with the exterior plot. Plans, materials and basic furniture recipes distinguish it from the furnisher. |
| Furnisher | Two complete room displays—rustic dining/sleeping and coloured townhouse living—beside a central customer path. Use rugs to define display boundaries without blocking. Display furnishings should correspond to actual purchasable catalogue entries and their native variants. |
| Smith | Forge/range/workbench grouped against the north wall, anvil and cooling vessel on a side working pad, equipment stock near the customer counter. Keep the central lane and frontage separate from the hot work area; indoor forge art must not silently create damage/lava. Repair should be offered only if the existing authority supports it. |
| Guild | North contract desk with side library wings and two reading/map tables. Differentiate it from the general store through books, maps and contract signage. Expedition/loadout tutorial and real contracts belong here; training remains in the planned courtyard or clearly separated practice area. |

Native asset constraints: existing imported bed/table/bookshelf, workbench, anvil,
furnace and barrel assets provide useful starting pieces. The House_Decor families
reviewed for the32+4 furniture catalogue provide coherent broader choices. Inspected
`Kitchen_Furniture.png` includes modern refrigerators/ovens, so avoid importing
those indiscriminately into the rustic inn; use appropriate rustic kitchen/range
and wooden cabinetry selections. `Furniture_Other.png` offers useful warm wood
cupboards and drawer units. Do not rotate upright south-facing shelf/chair sprites
90degrees to fabricate missing side views. Compose aisle orientation around actual
native variants, with declared anchors and lower physical footprints.

Keep an unobstructed two-tile central arrival/exit route. Customer interaction
points must be reachable and inside the actual three-tile merchant radius, with
comfortable lateral tolerance; placing the only usable point exactly on a radius
boundary is fragile. Reserve furniture silhouettes separately from body collision
and test all service frontages after decoration. South exits must remain on visible
floor, following the lobby lesson; visual wall doors are separate attachments.

Six rooms do not themselves satisfy eight service NPCs plus four residents. A
concrete allocation can be innkeeper/cook, storekeeper, carpenter, furnisher,
smith, archivist and harbour guide, with residents separate. Preserve existing
starter NPC identities; introduce distinct town characters rather than duplicating
Fin/Bob/Marlow under the same identity. Essential shops remain available at all
hours. No facade-only or unstocked-room acceptance: every enterable shop requires
its real catalogue, dialogue, functions and travel return. Provisional65520–65525
IDs remain subject to existing-instance/portal occupancy survey before activation.
Rendered native scenes, populated collision, service transactions and publication
remain open.

## Six interior first geometry capture: structural review

Viewed `willowharbour-interiors.png` and the shared room/furniture manifest. Smaller
general-store and smith envelopes distinguish their scale; the inn's guest wings
and furnisher's display alcoves establish different room plans. Existing blank
wall art prevents a final enclosure judgment, and bookshelves used as shop stock
remain placeholders. These rooms are not yet visually or functionally complete.

Correct the inn's central rear service spur before furnishing: x14–17 is only four
tiles wide, and the table at16 spans almost its full width, leaving a narrow
asymmetric bypass. There is no meaningful kitchen space behind it. Widen that
rear central service/kitchen zone to roughly eight tiles or provide a dedicated
side kitchen room, keeping guest access out of the work area. A substantial inn
needs a composed cooking/service area, not simply another table in a narrow spike.

All six first layouts reuse counter16,9/NPC16,7/approach16,10. This is a useful
implementation scaffold but makes the workshop, smith and archive feel like the
same shop with swapped props. Offset the smith's counter toward its forge side
and carpenter's consultation bench toward its work/display area, while retaining
the central exit lane. Guild can keep the axial north contract desk. Furnisher's
four display cubbies are viable provided their short connecting thresholds stay
open after actual wall courses and furnishings are installed.

Projected native walls may alter usable floor at room heads and narrow necks.
Re-run full-body paths after that change and include visible-avatar checks at the
southern exit; binary excavation alone cannot establish visual/collision parity.
Avoid treating uniform warm floor across all six rooms as their final palette:
use timber/rugs in inn and furnisher, resilient native stone around smith work,
and stocked shelves/work materials to establish the other roles.

During concurrent implementation, independently running the current sim interior
test file produced6 failures out of7: each reported target16,9 unreachable. Parent
was notified; this appears after the initial reported13-test checkpoint and needs
resolution against the current table/service coordinates. No implementation edits
were made by this reviewer. Real walls, role decor, NPCs/catalogues, IDs/portal
occupancy survey and publication remain open.

### Six-room structure and native wall correction

Viewed updated05b2b21c8fb3ca78e66039e5d32e65e0f8fa087d3ac1b9d4ee5fbb3381f09d65.
The inn's eight-tile rear zone now has useful service/kitchen space. Carpenterx20
and smithx12 service positions vary the repeated counter arrangement; y8 NPC/y10
customer points avoid the table collision and give comfortable interaction reach.
Room separations reserve the complete three-course wall footprint outside the
playable floors. Independently ran sim, engine and actual-registry world interior
tests:25/25 pass. This closes the temporary16,9 reach failures and the reviewed
structural corrections; no new geometry blocker found.

The draft native plaster crop provides real wall colour while leaving the legacy
asset untouched. It remains an enclosure foundation: large flat panels, abrupt
untrimmed ends and dark side gaps need coherent native skirting/corner/doorway trim.
Do not rely on extra furniture to disguise unfinished wall joints. Current room
structure can proceed to role-specific furnishing; final native player scale,
NPC/frontage/Y-sort and southern exit checks should include the completed walls.
Catalogues, functional kitchen/forge roles, real NPCs, ID/portal survey and
publication remain open.

## Willowharbour roster and first service stock review

The eight-role roster is coherent: Mara/Nell split inn and kitchen, Tavi covers
supplies, Rowan construction, Ada furnishings, Bram starter equipment, Iona
contracts/tutorials and Pip harbour travel. Four separately identified residents
complete the intended social population. All proposed native assets are present.
Inspected witch and desert character source sheets: their native style is compatible;
Iona's witch silhouette can communicate a scholarly magical archivist without
implying a new combat/magic service. Bram and Orrin sharing miner artwork is
acceptable if their names, runtime kinds, locations and dialogue identities remain
distinct. Do not reuse source character names as authoritative identities.

The carpenter's wood6/plank3/workbench120 purchase values already exist. Retain
those economy definitions rather than adding different prices in multiple shop
paths. Furniture recipe economics must account for plank's cheaper existing price
when it substitutes for wood. Eight common smith pieces are an appropriate
accessible starter offer; do not sell rare/legendary progression through the
baseline shop. Confirm exactly which eight slots/weapons are covered and that the
starter loadout still supports the reviewed common-gear shore encounters.

Existing cooked sale values are beef44, chicken28, fish32, mutton36 and pork36.
A defensible initial buy schedule is88/56/64/72/72, respectively, giving a
consistent two-times-sale margin. Verify effective merchant modifiers and food
benefits before final tuning, and give recipes/meal availability proper content
rather than a UI-only price override. Apple already buys12/sells5. Farm/cellar
orders remain the intended noncombat route to building funds; a food shop alone
does not complete that progression.

Ada's existing storage/light offers are useful early stock but do not satisfy the
32+4 furnished catalogue requirement. Rowan still needs real plans/recipes; Iona
needs actual contracts and equipment explanations, not just a greeting; Pip needs
working travel/directions. Dialogue-only introductory roles are fine while those
features are developed, but must not be reported as complete services. Essential
vendors stay available regardless of schedules, and starting services remain
intact. All proposed runtime/space IDs need the pending conflict survey; native
populated frontage, real purchase/return flows and publication remain open.

### Populated service identities and native scale review

Viewed3bb044c932d65919dbae32b675262604ac735bc76032166225596cc116489b1d service fixture.
Moving merchants beside counters makes their bodies visible and preserves clear
customer approaches. The avatar at revised exit25 remains visible, with arrival24
one step inward and the wall-door visual independently anchored. Idle-only Tavi
now renders; world drawing and bounds share the existing animation fallback, so
missing directional names do not make that native actor disappear.

Audited the twelve distinct content identities and six shop offers. Smith stock is
exactly common sword/bow/shield plus head/body/hands/legs/feet; higher tiers are not
sold. Cook has the five priced meals, materials remain on existing definitions,
and Ada's chest/barrel/standing-torch stock is explicitly interim. Independently
ran services, sim/engine/world interiors and art tests:37/37 pass. No new concrete
blocker identified in this bounded content/scale change.

When adding kitchen props, preserve Nell's separate reachable customer position:
she shares x13 with Mara three tiles farther south, so one frontage should not be
assumed to serve both NPCs. Current large open floor areas still require purposeful
role decor—actual shelves/products, kitchen, forge/cooling, timber/display furniture
and archive materials—not arbitrary prop scatter. Trim, full furniture catalogue,
contracts and public guide/resident decorated-map positions remain unfinished.
Live transactions/journeys, occupied-ID survey and publication remain held.

## First eight furniture crops and decorated public-NPC access

Viewed `furniture-first-eight.png`, its ordered source provenance, native
Standing_Lamps/Tables sheets, and the full village/resident study. The eight crops
retain compatible native colours and coherent silhouettes: ladder chair, timber
table, green single bed, banded chest, gold rug, blue short lamp, framed mirror
and leafy potted plant. No clipped or invented crop content identified. The lamp
comes from the short/table-lamp rows, not a tall standing lamp compressed to fit.
These are draft art approvals for further binding, not implemented item behavior.

Physical contract recommendations:

- The table is48×32 native pixels: reserve a3×2 visual envelope, correcting the
  provisional2×2 catalogue estimate. Use its lower physical base, not every pixel
  above the feet, and define an explicit top support area for small objects.
- The48×48 rug is3×3. Draw as nonblocking floor beneath furniture/actors, with no
  obstacle and no pixel rescaling to force a2×2 estimate. Its placement envelope
  still must remain inside the owned room and respect any floor-layer overlap rule.
- Chair has1×1 base beneath its tall back; bed has1×2 visual envelope and appropriate
  lower body footprint; chest is1×1. The chest crop is closed-only, so import native
  open states if storage presentation promises opening rather than inventing them.
- Blue lamp is a supported tabletop object; mirror is wall-attached with1×2 visual
  envelope and no arbitrary floor blocker; plant has a1×1 lower pot footprint.
  Height-bearing art does not justify blocking its entire sprite rectangle.

Placement must preserve support/custody: removing a table with a lamp on it cannot
orphan, duplicate or silently drop the lamp; chest removal cannot destroy contents.
Rotation requires actual native direction variants, not rotating upright pixels.
Prices/recipes and catalogue footprint labels must use the corrected dimensions.

Independently ran `hearth-village-access.test.ts`:1/1 pass. It composes native
facade/scenery anchors, production prefab obstacles and compiled terrain, then
checks body-clear movement from the ferry to all five public guide/resident
positions. This is stronger offline access evidence and remains separate from
live override/occupancy verification. The village study still shows unfinished
harbour treatment, a paving-like pond crossing, sparse working yards and extensive
plain lawn. Complete those with coherent signs, bridge, service-yard activity and
garden groups; further map expansion is not needed for these remaining roles.
No furniture item/placement, completed village or publication claim is implied.

## Furniture placement validator first review

Reviewed the pure validator and independently ran its6/6 passing tests. Permission
injection, bounded room dimensions, support dependency, same-layer overlap,
full-body occupant checks and before/after exit connectivity are useful foundations.
The baseline flood correctly protects empty accessible rooms, not just currently
occupied positions. This remains preflight code without inventory mutation.

Two correctness gaps before authority binding:

- Candidate cells check only raw `collision.blocked`, not plane-indexed terrain or
  fixed obstacles outside `context.existing`. A chair can be placed inside existing
  projected wall collision; the escape comparison cannot catch already-blocked
  floor. Independently reproduced on an8×8 map with only plane0 cell2,2 blocked:
  standing chair at2,2 returns success. Validate the physical base against
  authoritative plane-aware terrain/fixed obstacles, and floor-layer placement
  against actual usable floor. Add projected-face and fixed-counter regressions.
- Even-width shape envelopes disagree with the fixed half-tile-centred anchor.
  Width2 atx5 reserves cells5/6, but halfWidth16 aroundx5.5 spans cells4/5/6. Thus
  physical occupancy can reach a reserved neighbor outside the declared footprint.
  Define native grid-anchor offsets explicitly (even-width assets commonly anchor
  at a tile boundary), or conservatively derive occupied/reserved cells from the
  actual anchored bounds. Validate finite positive physical dimensions and ensure
  they fit that envelope; source shape data must come from validated authority
  content, not arbitrary reducer arguments.

Table support currently uses the support's cell envelope. Before tabletop rendering,
make its actual usable top area and vertical placement offset explicit so a lamp
cannot be treated as supported merely because its artwork overlaps table legs or
an overhang. Wall attachment and lower physical bases likewise need the same native
anchor contract used by renderer and authority. Existing removal dependency helper
is appropriate, but actual removal still needs contents/support/custody checks.
No furniture authority integration or publication approval is implied.

### Furniture placement correction closure

Reviewed the revised validator and explicit eight-shape registry. Plane-aware
cell checks include rugs; standing bases reject fixed obstacles; even-width bases
now centre on the correct tile boundary; finite positive base dimensions are
bounded by declared envelopes. The table's explicit upper3×1 support surface
rejects placement on its lower leg row. Independently ran8/8 tests. These changes
close the two previous validator findings; no new pure-preflight blocker found.

Before renderer/reducer binding, make `liftPixels` reference explicit and shared:
upper support cells already give a lamp candidate tileY one row north of its table
anchor. Subtracting20pixels from that candidate baseline would lift it36pixels
above table feet. Resolve the intended tabletop height from the support's native
baseline, with any surface-row offset handled once. A shared anchor helper should
serve rendering and preview; native lamp-on-table fixture must confirm the result.
The same support-dependency rule must gate moving a table as well as deleting it.
Inventory custody, permissions, native placement UI and publication remain open.

### Native table/lamp anchor check

Viewed `furniture-table-lamp.png` and re-read the shared presentation-anchor helper.
The lamp's base visibly rests on the tabletop; its native shade and stand are not
buried by the parent or floating above it. Support-baseline lift plus explicit
surface-row offset avoids the earlier double-offset risk. Parent-then-attachment
drawing gives the correct local order. Independently ran8/8 placement tests,
including the expected anchor and missing-support result. This passes the bounded
native contact/anchor review. Preserve the parent/attachment draw grouping when
integrating the world depth queue; a naive independent foot sort could hide the
lamp again. Authority inventory mutation and placement UI remain unimplemented.

## Persisted furniture adapter: integration constraints before binding

Reviewed existing world-placeable fields, generic chest classification and legacy
mirror writes alongside the shared placement contract. Exact adapter/collision
changes are still in progress; these are constraints for the next code review.

The new furniture chest should have its own stable runtime kind and definition,
using generic container capability without aliasing legacy`kind:'chest'`.
`genericChest` currently recognizes that legacy kind even with another definition,
and legacy mirror sync replaces `stateJson` with only `{open}`. Reusing that route
could erase furniture support/custom state. Preserve unrelated JSON fields and all
existing open/lit/processor/storage metadata during furniture edits. Moving must
retain the row ID and slots rather than deleting/reinserting a container.

Canonical decimal u64 support IDs are appropriate, but resolution must additionally
require a different, same-space, uncarried standing parent with an authored support
surface. Filter context rows to the current residence; reject orphan/self/cyclic
links and wrong-space IDs. Do not interpret a partial client subscription missing
a parent as authority to detach the item. Tabletop rendering follows the existing
shared anchor and grouped parent/attachment depth contract.

Use explicit `definitionId` as authoritative identity; conflicting legacy kind
must not select a different shape. Only successfully recognized valid furniture
may replace legacy footprint blocking with native base obstacles. Unknown or
malformed saved rows must not become silently nonblocking. Client and authority
need the same recognition/fallback rule. For moves, exclude the old candidate
from both the existing-placement list and precomposed collision obstacles, avoiding
self-collision. Storage contents/support dependencies/permissions must be checked
before deleting any row or issuing inventory refunds. Legacy spawn/carry/drop
routes need explicit guards until the dedicated transactions enforce these rules.

No actual reducer binding, new adapter acceptance or publication is claimed here.

### Persisted adapter and native collision first code review

Reviewed `hearth-furniture-state.ts`, both collision consumers, legacy placement
preflights and object-runtime state planning. Canonical full-range u64 strings
avoid numeric identity loss. Explicit stored definitions win over kind, arbitrary
row geometry is ignored, and malformed support does not remove a standing base.
Valid support metadata stays separate from authored states and survives the
canonical state/light plan. Client and authority both substitute the same native
base for recognized furniture and retain the existing non-furniture path. Spawn,
carry and carried-placement preflight guards keep these items unavailable until
dedicated transactions exist. Independently ran state/placement/client-collision/
object-runtime tests:37/37 pass.

One missed corruption guard: `planPlaceableLightEffect` does not reject recognized
furniture with invalid state JSON, unlike `planPlaceableStateEffect`. Invalid
support metadata falls through to the compatibility `lit` column mutation. Add
the same invalid-furniture-state rejection and a direct malformed-support light
regression. Valid light updates already preserve support; this is the error path.

Before enabling object definitions, explicitly keep furniture collision fixed or
support its authored condition in both native-base branches. They currently ignore
`collision.when`, so a generic collision effect could report a disabled condition
while the hardcoded base remains solid. Reject switchable furniture collision
contracts for this first slice unless that behavior is implemented consistently.
Same-space support existence/cycle validation, storage-preserving dedicated moves,
real placement UI and publication remain future integration work.

### Furniture state/light/collision guard closure

Verified the added furniture invalid-state check in `planPlaceableLightEffect`:
malformed support now rejects, while valid light changes preserve the full u64
support identity and other authored state. Reserved support assignment is explicitly
rejected by authored state mutation. `planPlaceableCollisionEffect` rejects
conditional furniture collision and requests inconsistent with the fixed native
shape, preventing a reported disabled state from diverging from its solid base.
Independently ran object-runtime, furniture-state and client-collision tests:
30/30 pass. Both preceding findings are closed; no new blocker identified in this
bounded guard change. Future furniture definitions must agree with that fixed
shape contract. Dedicated placement/removal transactions, storage custody, UI and
live/publication acceptance remain open.

### Dedicated furniture transaction review

Reviewed the actual builder/residence/reach/row/destination preflights and three
new reducers. Authority derives the current residence and builder role, rejects
Delve custody, mounts and occupied hands, and resolves geometry from known server
shapes. Same-space support lookup prevents attaching to a foreign residence.
Moves retain the placeable ID, slots and unrelated state; excluding the old row
from both native collision and the validator avoids self-collision. Parent
removal/movement is refused while attached children remain, and active container
use prevents moving or picking up the row. Pickup refuses stocked/processing
objects and requires complete inventory insertion before deleting empty slots
and the object. The stored lamp lit flag is passed back to inventory.

The initially identified alternate homestead-build entry point is now guarded
in `requireHomesteadBuildPlacement`; legacy demolition also explicitly refuses
recognized furniture. Current furniture reach additionally checks fixed-geometry
line of sight. These close the reviewed alternate placement/removal routes.
Keep native furniture chests on their distinct runtime kind/definition so legacy
`genericChest` salvage and mirror code cannot alias them.

Before enabling definitions, make their inventory durability policy explicit:
placement currently retains only the consumed item's lit flag, and pickup supplies
no durability. Nondurable furniture fits this implementation; durable furniture
would lose its condition unless that metadata is persisted and restored.

Independently ran furniture authority, placement and state suites:15/15 pass.
The four authority scenarios execute production reducer callbacks and shared
geometry, but mock inventory insertion/consumption. Add an actual inventory-helper
round-trip for full bags, stack compatibility and lit state before content
enablement; current tests prove sequencing rather than that complete custody path.
Also retain explicit active-container and landmark rejection coverage as the
fixture grows. No new ownership or attachment blocker was found in the reviewed
transaction path. Definitions, UI, real residence journeys and publication remain
open; this is bounded backend review only.

### Furniture transaction enablement guard and inventory closure

Verified placement now rejects missing, retired or durable item definitions,
conditional collision and collision solidity inconsistent with the native shape.
Pickup also rejects unavailable or durable item definitions. This explicitly
chooses nondurable furniture and closes the previously identified condition-loss
path. Residence enumeration rejects corrupt recognized furniture state before
any placement, movement or pickup mutation, preserving attachment uncertainty
instead of silently detaching it.

The new test executes actual inventory consume/insert/load/write/normalization
helpers. It restores an unlit lamp stack exactly after consumption, rejects an
unlit return when only a partial lit stack remains in full bags without changing
rows, and permits the compatible lit return to stack to16. Together with the
production reducer callback tests, this closes the previously mocked inventory
custody gap for the first nondurable lamp slice. Independently ran authority,
placement and persisted-state tests:16/16 pass (5 authority scenarios).

No new blocker found in this bounded transaction closure. The new definition
guards and corrupt-state rejection are verified by code inspection; the current
five authority scenarios do not separately exercise every new rejection branch.
Actual placement UI, complete catalogue/recipes/shop offers, live residence
persistence and publication acceptance remain open.

### Furniture renderer grouping first integration review

Reviewed shared `hearthFurnitureScene`/draw groups, placeable rendering, preserved
painter depth phases, attachment light offsets and reserved presentation state.
Same-space standing supports with explicit containing surfaces own their lamps;
parent-first drawing prevents lifted lamp anchors sorting behind the tabletop.
The group sorts against the parent contact, while floor rugs request the surface
phase below ordinary actors. Light position retains the authored emitter offset
relative to the lifted anchor and terrain projection samples the support contact
height. Independent scene/painter/object-presentation tests:12/12 pass.

Native shared-group fixture `furniture-table-lamp.png` SHA
`08589d518fd77e2d77f9c6b7e5c7fa6b0a0edbfea747651b64e57ac2cc0f483d`
retains convincing tabletop contact and intact native silhouettes. This isolated
source-pixel fixture does not validate actual room depth crossings or dynamic
lighting; those remain required integration evidence.

One concrete corruption finding remains: the shared scene admits a standing
parent whose state JSON is invalid, because the collision-oriented row adapter
intentionally retains that object's geometry. Object presentation subsequently
withholds the parent's sprite, but its valid child lamp still draws and emits
light. Reject invalid parent presentation/state for the entire attachment group
and its lights, while retaining physical collision. Add a malformed-parent-state
regression. Existing tests correctly withhold missing, cross-space, carried and
out-of-surface support cases. No publication approval is implied.

### Furniture parent presentation corruption/loading closure

Verified both actual producers now require a valid loaded root sprite before
drawing an attachment group or admitting its light. Light admission also requires
the emitting object's valid loaded sprite. This closes the floating glowing lamp
case for invalid parent state and delayed parent assets without changing physical
collision. The new tests invoke actual placeable/decoration producers and the
real presentation cache, verifying table anchor88,96, lamp anchor88,76, emitter
88,56, parent terrain contact96 and rug surface phase. Corrupt and indefinitely
loading parents produce neither child art nor child light.

No remaining blocker identified in this bounded producer change. Full native
room movement, depth crossings and lighting composites remain broader integration
acceptance work; source draw-call coordinates are not a live visual proof.

Independently ran the four producer/scene/painter/presentation suites:14/14 pass.

### Initial furnishing palette and pointer routing review

Reviewed `hearth-furnishing.ts`, residence role selection, collision-baseline
composition, native ghost rendering and dedicated placement/pickup dispatch.
Residence ownership resolves through the estate's residenceSpaceId and membership
uses that estate's role. Placement infers containing table surfaces and shares
full-body/reservation/escape geometry plus the server's four-tile reach and fixed
line-of-sight checks. The baseline removes movable furniture while retaining
fixed obstacles; existing furniture is supplied separately to the validator.
Logical layer priority selects lamps before tables and tables before rugs.

Three concrete integration corrections are requested before accepting the UI:

- `drawFurniturePreview` invokes the complete before/after swept escape flood
  every rendered frame. Cache unchanged hover/selection/context results, including
  occupant positions and collision/furniture revisions, or explicitly throttle
  preview recomputation. Keep fresh validation when submitting placement.
- Pickup is currently green for any selected row, including attached tables,
  out-of-reach furniture and known occupied storage. Match the locally observable
  pickup constraints and show why a selection cannot be picked up. Full bag
  acceptance must remain authoritative even if a local capacity preview is added.
- Placement preview and palette do not share the new server definition guards:
  missing/retired/durable items and conditional or mismatched collision can still
  appear selectable/green after a content revision. Use a shared eligibility
  predicate, and reject corrupt existing furniture state before treating it as
  usable support, matching authority's corruption guard.

These findings affect responsiveness and preview truthfulness; the server still
revalidates mutations. Move/undo/touch work is explicitly unfinished and not
reviewed as complete. No live room or publication acceptance is implied.

### Furnishing preview parity, cache and pickup feedback closure

Verified `hearthFurnitureDefinition` is shared by server placement, client preview
and palette eligibility. It rejects unavailable/retired/durable items and
non-residence or variable/mismatched collision definitions. Corrupt current
furniture state produces an explicit repair failure before geometry preview.

The actual preview adapter caches by stable collision reference, content hash,
resource revision, role, hovered tile, item, quantity and actor/occupant positions.
The collision builder itself retains its result for an unchanged revision key,
so ordinary stationary redraws preserve the cache. The extracted adapter test
proves120 unchanged calls perform one calculation and invalidates on quantity,
positions, resource revision, collision replacement and hover changes.

Pickup now shows known attachment, local active-container and reach failures in
red. Other selections are amber with explicit bag/storage verification on click,
avoiding a false guarantee about private state or concurrent users. This closes
the three findings in the preceding initial UI review. Server rejection remains
necessary for changes between preview and click. Full move/undo/touch controls
and actual room journeys remain open.

Independently ran furnishing helper/cache, furniture authority and palette suites:
15/15 pass. No publication approval is implied.

### Move and inverse-move first integration review

Reviewed canonical geometry revision metadata, reserved-state preservation,
server expectedRevision comparison/increment, shared source-excluding previews
and two-click client controller. The same authoritative reducer performs inverse
moves, so current reach, ownership, attachments, occupants and escape constraints
still apply. Stable row identity preserves stored contents, while ordinary
authored light/state changes preserve geometry revisions. Counter overflow rejects
rather than wrapping. The inverse is a last-move operation only; place/pickup
undo is explicitly not complete.

One concrete session-liveness finding: controller setScope clears selection and
history but leaves pending true. An unresolved old-connection send can permanently
block the new scope. Release pending on scope change and use an operation token
so an old promise's completion/finally cannot unlock a newer operation. Exercise
unresolved old request, new scope, new request, then late old completion. The
main scope should use actual connection generation/identity rather than only the
connected boolean, ensuring replacement sessions invalidate history.

Also handle strict revision parsing at pointer selection and second-click source
checks. Corrupt state currently throws synchronously before the repair-failure
preview can show feedback. Clear the selection and display the repair reason.
No additional storage/attachment-authority blocker found in this bounded pass.
Controller tests, session-race closure, move/undo native UI and touch work remain
open. No publication approval is implied.

### Move controller session-race and corrupt-selection closure

Verified scope changes increment an operation token and immediately release
pending state while clearing selection/history. Old promise completion cannot
write history across generations, and its finally block cannot release a newer
operation's pending state. The main scope now includes the actual network
connectionGeneration through sessionGeneration, in addition to identity, room
and role. The controller regression executes an unresolved old send, replacement
scope, new pending move and late old completion, then verifies only the new
completion enables its inverse. Exact large support IDs and expected next
revision survive inverse requests.

The actual pointer move branch now catches malformed revision/state parsing,
clears selection and reports the repair reason instead of escaping the event
handler. These close the two preceding client findings. No remaining correctness
blocker identified in this bounded controller change. Broader touch controls,
place/pickup undo and native residence journey acceptance remain open.

Independent five-suite run:20 tests passed, one new palette test failed.
`offers move and guarded undo only when furnishing` calls
`homesteadBuildPaletteBounds` with missing upgrades and fails on undefined.length
at palette line47 (test line15). The fixture needs correction; this run is not an
all-green validation claim. Controller, preview/cache and authority suites passed.

### Palette fixture closure and first-eight acquisition design

The preceding missing-upgrades palette fixture is corrected. Independently reran
the palette suite:3/3 pass. Parent additionally reports50 passing tests across
eight suites plus UI/sim/client typechecks and targeted lint; that broader run is
parent-reported evidence. The bounded last-move controller review is closed, with
full native room acceptance and other undo operations still open.

Explicit requested recipe validation is the correct acquisition integration:
wood-only dining table inputs otherwise collide with planks, and chair inputs
can collide with torches. Authority must validate the exact requested current
recipe against the real grid, then independently enforce station, skill and
output capacity. Reject an invalid/mismatched/retired explicit ID without fallback
or mutation. Craft-all must repeatedly test that same selected recipe, never
switch to the first matching recipe after consumption. UI may prefer a selected
matching recipe and use ordinary discovery when no selected match applies.

For the first eight, finished prices are100/220/280/210/100/100/210/90 bronze
(chair/table/bed/chest/rug/lamp/mirror/fern), totaling1,310. Individual plan prices
are50/110/140/110/50/50/110/50, totaling670. Retain catalogue ingredients and
workbench requirement, no extra crafting XP, no resale or material-salvage route
for these first definitions. Buying is a convenience alternative to gathering.
Recipe knowledge remains the existing reusable shortcut, not an authority gate;
plan descriptions must not imply that unknown players are forbidden to craft.

A consumable plan needs explicit consume-one together with learnRecipes; the
learn effect alone does not consume it. Test stacked-document read consumes one
and persists only its intended knowledge; retain explicit duplicate-read policy
and preferably identify already-known plans in UI. Required crafting regressions:
selected table versus planks from the same grid, multi-table craft-all with
remainders, chair versus torch, wrong-grid rejection, missing station/skill, and
blocked cursor/full inventory preserving materials. This is acquisition design
review only; no completed recipe or economy/live acceptance is claimed.

### Quantity-aware recipe preview review: production fill blocker

The new `craftingRecipeStacks` correctly uses bounded ingredient stacks for
large shapeless recipes while retaining small/shaped layouts; display and hover
show actual quantities. The planner accounts for existing compatible grid
quantities, splits requests across source stacks and refuses incompatible cells.
However, `ghostFillRecipeMoves` has no production caller: the recipe-book action
calls network.fillCraftingRecipe, then the authoritative fill reducer, then
`fillCraftingRecipeFromInventory` in sim/item-containers.ts.

That actual atomic helper still expands each ingredient unit into a separate
cell and returns recipe_not_found after nine. Therefore large furniture recipe
shortcuts remain broken even though the new UI-helper tests pass. It also uses
global recipeDefinition rather than the current registry represented by the
content resolver. Update the actual production helper to quantity-aware desired
stacks and current recipe resolution; exercise it through the reducer or actual
helper for bed W24/F40, split source stacks, partial existing quantities and
incompatible-grid rejection preserving every item. Avoid reintroducing serial
client-side move requests, since the existing fill transaction intentionally
replaced that partial-failure path. This is a completion blocker for acquisition,
not a failure of the new display geometry.

### Production quantity-aware fill follow-up

Verified the actual atomic fill helper now consumes shared recipeGridStacks and
tops up partial grid cells across split source stacks. The real fill reducer
passes runtimeRecipeDefinition from current content explicitly, so this live path
no longer falls back to bootstrap recipe data. The previous nine-unit failure
and production-routing finding are closed by inspection.

One new shared-helper correctness edge remains: occupied targets and source
selection compare itemKind but ignore stack metadata. moveItemStacks may swap
same-kind stacks with different lit/durability metadata when the requested amount
equals the source quantity. A target4/source6 with differing metadata for a
required10 can become target6/source4 while the planner counts6 moved and stops.
Filter source candidates by full itemStacksCompatible with an occupied target,
or reject the mismatch, so ghost filling never displaces existing contents.
Add this regression alongside normal homogeneous wood/fiber partial fills.
This affects shared crafting behavior even though first-eight material stacks
ordinarily have homogeneous metadata.

### Atomic fill metadata and selected-crafting closure

Verified atomic fill source search now requires itemStacksCompatible with an
occupied destination. The partial4/unlit versus source6/lit regression returns
zero moved and unchanged containers, closing the unwanted swap path. Normal
quantity-aware filling still spans split sources and uses the explicit live
recipe supplied by authority.

The new extracted actual craft reducer test confirms57 wood yields exactly two
selected dining tables and one wood, with no fallback planks. Mismatched recipe
IDs and missing stations fail before inventory writes. Blocked output bags or
an incompatible cursor preserve the ingredient grid. These are executable
production callback/helper proofs with mocked database/lifecycle dependencies,
not live server persistence proof. No remaining blocker identified in the
reviewed acquisition-helper change. Plans/merchant purchase/read journeys and
full furniture acceptance remain broader work.

Independently ran selected-crafting authority, acquisition, item-container and
recipe-book suites:50/50 pass. Publication remains held.

### Furniture purchase-detail first review

Authored plan-to-recipe-to-output resolution is appropriate for the eight
single-recipe documents and avoids naming-convention coupling. The detail
resolves real placement dimensions/layer and aggregates materials; its action
adjusts the cart rather than invoking checkout. The native sprite preserves
aspect ratio inside the larger detail preview. Compact overflow and deferred
touch selection are already acknowledged unfinished work.

Additional concrete corrections requested before accepting the detail flow:

- Show offered item name/type (PLAN versus FINISHED ITEM) and unit price. A
  furniture-only title plus a lower recipe line is insufficient purchase clarity.
- Include the required workbench alongside the material list.
- Hide and blur the underlying filter input during inspection; current update
  only checks shopOpen, leaving invisible filter focus active.
- Support Enter for Add to Cart, retaining a separate later checkout action.
  Current inspection swallows every non-Escape keyboard input.
- Clear or revalidate inspection when current content removes/retires the offer.
  A now-null detail otherwise draws the catalogue while pointer handling still
  behaves like the detail view.

No visual compact fixture or new detail interaction tests were available at this
initial inspection. Purchase/read journeys and publication remain open.

### Furniture detail controls and compact layout code closure

Verified offered names and plan/finished labels, actual offered price, authored
station requirement and correct furniture preview resolution. Detail text now
uses a dedicated bounded scrollbar whose rows stop above the fixed catalogue
and cart buttons. The sprite/price column remains separate from scrollable
materials. This resolves the code-level overflow concern; native screenshot
readability still requires visual evidence.

Opening detail hides and blurs the filter, closing restores its shop visibility,
and Enter adds only to the cart. Escape returns to the catalogue. Current content
or offer removal clears stale inspection during update. Touch catalogue row
inspection is deferred until release and canceled by an actual swipe; detail
scrolling has its own touch/wheel/keyboard handling. No additional correctness
blocker identified in this bounded control pass. Actual browser/touch purchase
and read-plan journeys, final visual acceptance and publication remain open.

Independently ran NPC interaction and furniture detail tests:21/21 pass.

### Native compact purchase-detail visual closure

Viewed the actual NpcInteractionUi/loadOverworldArt fixture at360×270 logical
pixels (3× export), `furniture-purchase-details.png`, final SHA
`d1bee47ac09e5e12df838501dda3b82d3429a57d66508bafc7904b025b6c6e9c`.
The wall mirror silhouette is intact; offered plan identity,1 silver10 bronze
price,1×2 reservation, front-facing wall requirement, reusable recipe, workbench
and12 wood/8 stone/4 copper pieces are readable. Catalogue and Add to Cart are
visually distinct and separated from material content.

The initial clipped right border came from hidden authored shop/storage panes
imposing a386-pixel minimum on a360-pixel viewport, despite the custom modal's
344-pixel frame. The local chrome-only projection now uses a minimal synthetic
surface pane while retaining authored style/id/title; source shop panes remain
unchanged. An intermediate empty-pane exception was caught and corrected before
this final capture. Both borders now fit fully inside the image and align with
the modal controls. Independently reran interaction/detail tests:21/21 pass.

Bounded native compact detail readability passes. This screenshot is offline
and does not prove live account state, touch purchase, plan consumption or
persistence. Those journeys and full patch publication remain open.

### Remaining24 base furniture native crop proposal

Produced `output/doc60/remaining-furniture-crops.json` with24 unique remaining
base suffixes, exact source rectangles, source hashes, native anchors, logical
footprints, proposed lower bases/tabletop surfaces and measured light offsets.
Viewed all relevant native sheets and a complete4×6 integer-scale crop contact
sheet, `remaining-furniture-crops-contact.png`, in manifest order. Crops contain
complete coherent native pieces without invented rotations, recolors or combined
objects. All rectangles are within their source dimensions.

Notable source-backed corrections: horizontal2×1 runner with2px opaque fringe;
1×1 genuine flowering ceramic planter;2×1 writing desk and washstand;2×2 side
table;3×3 patterned rug;1×1 iron cooking range. Rustic bench uses a low plain
wooden bench/worktop, not the rear of an upholstered sofa. Tables retain native
alpha100 shadow fringes via50×33/34×33 crops and original body anchors24,31 or
16,31. The current first dining table's48×32 crop loses only103 shadow pixels;
a separate correction preserves them and requires renewed asset review. Kenmi
source import already preserves nonzero alpha.

Range has an actual native off/on pair, with visible orange flame only in burn.
Large brick hearth has no baked flame or matching lit variant; switched emission
behind its dark grate is possible without pretending an animation exists. Floor
lamp shade centres imply offsetY-23, hearth grate-8 and stove flame-6, all before
terrain projection and subject to actual lighting fixtures. Standing bases and
new tabletop contact lifts are proposals requiring shared native contact and
full-body access validation. No assets were imported, no runtime definitions
edited and no publication approval issued in this crop review.

### Imported32 base catalogue: bounded native-art approval

Viewed actual imported-asset contact sheet `furniture-base-catalogue.png`, SHA
`3f9dbe9a685c0f5285da6db2decfe18f5c3bfb73f3b1dce03a5925239fab014e`,
in its first-eight then manifest24 order. All32 retain complete coherent native
silhouettes and intended rustic/blue-townhouse families. The corrected dining
table retains its native shadow fringe without changing the body contact anchor.
Separately viewed actual imported cooking-range off/burn frames: the same stove
and anchor remain stable, with orange grate fire present only in burn.

Independently decoded every imported base frame and the range off/burn variants
against exact reviewed source rectangles, including nonzero-alpha pixels:
34 frame comparisons,28,678 pixels, zero differences. This verifies native crop
fidelity rather than relying only on a contact-sheet resemblance.

Bounded ART approval is granted for these32 base crops and the cooking-range
off/burn pair at this reviewed artifact/source state, including renewed approval
of the corrected first dining-table crop. This does not approve publication or
claim furniture gameplay completion. New bases/tabletop contacts, live storage
journeys, native room lighting, range state transitions and functional seating
still require their separate implementation/acceptance evidence. Asset approval
flags were not edited by this reviewer.

Viewed shared-scene `furniture-table-surfaces.png`, SHA `c55edbbcb9ae96f6e915dbc31a3880902d277eee1b855cb8f7fed61fae8d8f73`:
all four table/lamp combinations have plausible native contact without the lamp
being hidden behind its own table. The lower writing desk uses its distinct
contact lift; white-cloth and dark-square table surfaces remain readable. This
passes bounded attachment-art/contact inspection, not full room collision,
actor-depth crossings, dynamic lighting or live-placement acceptance.

### Native plaster wall tile-to-prop classification review

Viewed Interior_Walls.png and the current prop candidate. Exact native crop
104,48 at16×48 matches all768 source pixels, with unchanged anchor8,47.
Candidate asset SHA `87960a56aa8e8c9baaf253ad20496ea6e9bc88e1aea55b35e38780152b19de28`. Bounded ART approval is granted for
`prop_cf_hearth_plaster_wall` at this state; no approval flags were edited.

Both OverworldArt asset-name paths and study provenance now use the prop name;
no old tile identifier remains under packages. Ground-cache draws selected source
width/height using the anchor, so moving category/name does not resize or shift
the panel. The full48px panel remains appropriate as anchored prop art instead
of violating the16×16 tile contract. No rendering regression identified in
this classification change. Rebuilt six-interior scene evidence, finished wall
trim and live acceptance remain separate work; publication remains held.

### Six-interior wall rename visual closure

Viewed rebuilt `willowharbour-interiors.png`, SHA
`3bb044c932d65919dbae32b675262604ac735bc76032166225596cc116489b1d`.
The full plaster courses render across all six interiors and inn/furnisher
partitions without disappearance,16px compression or shifted floor boundaries.
The image remains pixel-identical to the previously reviewed service/geometry
fixture, as expected for an asset classification/name change. Bounded wall
integration is closed.

This is not approval of finished room design: sparse role-specific furnishings,
wall side/corner/base trim and room lighting remain visibly incomplete and were
not part of this rename closure. Parent reports the rebuilt atlas and no remaining
wall/tile-size validation error; unrelated existing asset approval errors remain
outside this review. No live or publication acceptance is claimed.

### Collapsible furnishing catalogue first review

Reviewed palette collapse/reopen, pointer capture, selection persistence and
main context wiring. Choosing a piece, move or pickup releases the large room
overlay while retaining the selected tool; enabled undo collapses after issuing
only its guarded request. The compact bar reopens without changing selection or
accidentally requesting an action. Identity/session/space scope changes and
explicit build-mode opening expand the catalogue. Exterior build mode remains
uncollapsed. No placement/undo authority bypass found.

One feedback regression is open: compact draw returns before rendering
model.status, displaying only the static selection name. As selection now always
collapses, placement rejection reasons, pending-server status and amber pickup
custody qualification disappear while the user acts. Show current status in the
second compact line when present, falling back to the selected item/tool name;
retain a bounded layout and selected icon. Do not rely only on ghost color.
Native compact-room usability remains pending the requested visual fixture.

### Compact furnishing bar feedback/readability closure

Verified the compact second line now displays current model.status before
falling back to the selected item/tool name, closing the hidden-feedback finding.
Viewed actual HomesteadBuildPalette fixture `furnishing-compact-bar.png` at
320×180 logical pixels (3× export), SHA
`a477a857a6a2d3cb0c823a53cc1b69076d16bafd7f790049cc4ae0a00c053fa9`.
The selected table icon and two text lines are readable, with clear Change
Selection wording and most of the viewport left unobstructed. Bounded compact
bar readability passes.

The image exercises the ordinary selected-name state; error/pending/custody
status priority is verified by code inspection, not shown in this capture.
This is not evidence of actual room overlay placement, day/night readability
or touch furniture interaction. Those wider acceptance gates remain open.

### Native service-interior furniture integration review

Viewed refreshed six-room image `willowharbour-interiors.png`, latest inspected
SHA `b77cbdf28877c4165dcc5bcdc67d35a383666686bcc0e247c573eae086166552`.
Native pieces retain plausible scale; the furnisher now has distinct rustic
bedroom, linen dining, blue sitting and townhouse bedroom/washstand displays.
Revised general-store closed stock cabinets/chests and carpenter benches/material
storage distinguish them from the archive's intentional bookshelves. Service
NPCs and central arrival/exit approaches remain visually unobscured. The smith's
hearth/anvil gives a clearer role cue. These are useful room-composition advances,
not finished service-scene acceptance.

Shared native lower-base obstacles and table/lamp anchors replace former generic
rectangles. Independently ran interior geometry/terrain suites:25/25 pass,
including native floor footprints/support and full-body routes. Two concrete
corrections requested: move the inn plant from5,14 away from directly covering
the hearth grate at5,13 (7,14 is a proposed side location); pass the flat receiver
for native floor rugs through the static interior enqueue contract, matching
persistent furniture rather than defaulting to a south-facing receiver.

Static interior lamps/hearths still need real lighting integration and room
Dynamic/Basic evidence. Further role-specific kitchen/stock details, wall trim
and full live service journeys remain open. No publication approval is implied.

### Native service-interior placement/receiver closure

Personally viewed the refreshed six-room fixture, SHA
`362450e9d36ef547ae97fc20abcd24e42fdc42834dda097cfa5ee9b7ec48f715`.
The inn plant at7,14 now sits beside the hearth and leaves its grate visible.
The shared static producer forwards contact Y and an explicit flat receiver for
floor rugs; standing roots use south receivers and the lamp remains in its
parent table group. Both requested corrections are closed. Independently ran
the two interior suites:27/27 pass, including flat receivers and no separate
lamp enqueue.

Static point-light integration is now present in the client producer, superseding
the earlier wiring-open note. Dynamic/Basic room-lighting evidence, further
role-specific details, trim and live service journeys remain separate gates.
No publication approval.

### Service-interior lighting implementation and first captures

Reviewed `hearthInteriorPointLights` and its client producer: catalogue light
components, native lifted emitters, parent baseline contact sampling, retired
object/missing-art guards and permanent showroom lit state are coherent. The
source retains shared deterministic flicker and uses the same projection path
as player furniture. The 27-test run includes supported lamp emitter/contact
coordinates and missing-parent suppression.

Personally viewed Basic SHA
`e7efbe6c162e89d0f0d4f603ef0af15265beb245fe5b27f585702c5c35aa6604`
and Dynamic SHA
`6536b402ac783d33a7f9be90faa94c1ca990f640e96ba770997b4c9f9d2d5b0c`.
Actors, exits and furnishings remain readable; warm local pools are subtle.
Bright rugs alone do not establish meaningful source output because Dynamic
and Basic also differ in receiver/atlas treatment. Requested a same-Dynamic
lights-empty control and local source-on/off pixel evidence around a lamp and
hearth before closing emitter visual acceptance.

The tan void is a fixture compositing issue: per-room canvases begin transparent,
and the multiply lightmap/Basic ambient fill populates that transparent exterior
before it reaches the dark outer canvas. Initialize each room canvas with an
opaque intended backdrop before drawing ground. This does not establish a live
world rendering defect. Scene trim/detail and live acceptance remain open; no
publication approval.

### Static interior emitter/control closure

Personally viewed the corrected opaque-backdrop Dynamic capture, SHA
`83a6073007c943bb2c4a5c047124d9cc7a734ad73bd0e1f9a84a86efef763f26`.
Dark exterior separation is restored and actors/furniture remain readable.
The matched no-lights control SHA is
`b488514451b3ccb2cbb3def0a4b82fcc60a29f6c027c5dbb63b58730ec8538c9`.
Independently decoded both PNGs with the repository decoder and verified equal
source hashes and atlas revision. Only the light-array toggle differs in the
render path. All13,501 changed pixels have positive RGB-sum differences, none
negative; aggregate RGB increase98,307. The inn-hearth patch has244 changed
pixels/max27 summed RGB increase; the showroom-lamp patch has1,546/max34.
These independently reproduce the reported measurements and establish real,
localized emitter contribution beyond helper-array or Basic/Dynamic comparison
evidence. Subtle pools are appropriate at this warm indoor ambient.

The two bounded fixture/emitter findings are closed. This approves the local
static-light integration/readability evidence only; richer room dressing, live
service/room journeys and full patch acceptance remain open. No publication
approval.

### Native seat-pose source and preliminary contact review

Inspected native player rows50–55 at integer enlargement with composited base,
hair, clothing, shoes and hands. Rows50/51/52 face down/right/up with exactly two
populated frames. Rows53/54/55 repeat the same direction family with six gait
frames. The down/up pose is a rider-like straddle: using50–52 for furniture is a
native pose adaptation, not evidence of a source-authored chair animation label.
Do not use the six-frame gait for stationary seats.

Audited all24 currently extracted action-layer source files plus all four armour
source files. Their rows50–52 fit the existing32×40 crop at16,8 within each64px
cell, with zero nontransparent pixels outside that crop. All six selected cells
are populated except intentionally empty bare-hands down/up cells; right-facing
hands contain12 pixels each. Preserve these transparent layers rather than
falling back to standing hands. Extract corresponding armour and clothing rows
together; do not combine seated body with standing equipment layers.

Native-source contact study `/tmp/astra-seat-contact.png` compares draw-anchor
Y offsets+8/+12/+16 from furniture's shared anchor, using action anchor16,39.
Propose south-facing only, centered X, one occupant per piece: +12px for rustic
chair/stool and townhouse chair/loveseat/armchair; +8px for the broad low bench.
+16 reads in front of the seat; +8 on high-backed chairs reads too high. These
are render offsets, not authoritative position changes. Parent-owned drawing
and parent floor-contact depth/light sampling avoid chairs covering torsos or
lighting the raised sprite as if standing on a different plane. Actual production
renderer pose/contact evidence is still required before seat-art acceptance.

Read the first shared `planHearthSeating` and independently ran10/10 tests.
Its other-base reconstruction, sampled approach, one-occupant check and standing
destination tested with the seat restored are sound for the bounded geometry
slice. Integration must revalidate the seat and standing destination when leaving,
prevent moving/removing occupied seats, and resolve disconnect/travel/action
cancellation without restoring a player inside the furniture collision. Persist
seat ownership separately from visual offsets; the helper alone does not prove
these authority lifecycles. No asset import or publication approval is implied.

### Imported seating pose and native scene-helper review

Viewed `seating-native-poses.png`, SHA
`d6a098d021c9070767f2a24197a5ca2b5c16ca0485ba78bd63e2576a04871c7e`.
Both native frames meet all six seats plausibly at the reviewed +12/+8 render
offsets; no chair back hides the face or torso. The bench remains a broad low
worktop-style seat, with one centered occupant. The shared helper draws native
parent then actual modular avatar, rejects missing parent/body pose, and keeps
visual offsets separate from physical positions. Body-only sitting correctly
avoids an extra held-tool pass. Actual parent depth/light enqueue integration
and authority remain future work.

Independently compared every sitting crop/frame against its original source:
28 assets,215,040 pixels,zero differences. This confirms native crop and modular
source parity; the fixture shows default clothing, not every armour combination.
Character-animation plus seating suites pass13/13.

One concrete metadata correction is required: action extractor hardcodes
animationLoop:false for every action, including sitting, whereas canonical
sitting rows and the armour extractor specify true. Derive loop flags from
the canonical row for the24 action layers too. The static two-frame fixture
cannot expose later animation clamp/stall. Recommend a deliberate2–3fps seat
idle cadence during integration; generic10fps would make this bob restless.
Bounded native pixels/contact review is positive, with that metadata correction
open. No authority, live sitting, or publication approval.

### Seating import metadata closure

Verified both canonical extractors now derive loop flags from each row and
set sitting animations to2fps while retaining existing non-seat FPS. The
regenerated28 assets pass the actual source-pixel/metadata test, including
all168 frames, exact source regions, looping2fps metadata and intentional
empty down/up hands. The prior loop mismatch is closed. Runtime frame cadence,
seating authority/lifecycles and live room evidence remain pending integration;
asset metadata alone does not establish playback behavior. No publication
approval.

### First seating authority integration review

Admission checks invited residence membership, current seat definition, living
state, free hands, combat readiness and shared approach/stand geometry. Unique
placeable custody plus ordinary move/pickup guards protects occupied pieces.
Standing recomputes current geometry rather than trusting an old exit point;
teleport clears custody. Two concrete integration corrections were requested:

- Admission/clock only inspect settleSteps, but idle-to-held setInput starts a
  direction with zero queued steps. Fresh non-idle direction must also reject
  admission/trigger standing. Seated packets must discard settled movement, and
  stand must reset queue/credit/acknowledgements so time waiting for a blocked
  exit cannot become movement backlog. Preserve held intent only with a known
  fresh clientTick boundary; do not substitute authority tick for client tick.
- Admin despawn deletes an occupied seat without custody reconciliation. The
  helper returns false when the seat is missing, and the clock does not inspect
  the live seat when action/position still match custody: this can permanently
  reserve a deleted seat and reject subsequent actions. Reject/settle occupied
  admin relocation/deletion, plus provide safe orphan reconciliation if a row
  vanishes (clear at current position when body-clear, otherwise safe recovery).

Requested executable idle-to-held, blocked-wait-to-release/no-backlog, stale
sequence, deleted-seat-to-stand and same-space relocation cases. Existing small
reducer fixture mocks action guards/collision enumeration, so it cannot prove
these whole lifecycle paths. No authority completion or publication approval.

### Seating movement/orphan authority correction review

Verified fresh non-idle input now rejects seat admission and triggers synchronous
standing in actual setInput. wasSeated suppresses settlement of the previous
run; blocked attempts store idle intent, zero queue/credit, and advance only to
the supplied monotonic clientTick. Successful packet-driven standing starts its
new held run at that packet boundary. Manual/clock/admission resets clear old
queues and acknowledgements without inventing client clock values. Replays still
return before mutation. This closes the held-key/backlog finding.

Admin object mutation commit now rejects occupied IDs before modifications.
The clock detects missing seat rows, and orphan standing clears custody when
the current body is collision-clear; blocked geometry retains custody rather
than teleporting unsafely. External actor relocation clears stale custody
without returning the actor to the chair. These close the identified ordinary
deleted-seat trap and supported mutation bypass.

Independently ran shared seating and extracted authority suites:17/17 pass,
including fresh held input, a200-tick blocked interval, stale packet, missing
seat and external same-space actor relocation. Broader scheduled/disconnect
journeys, client bindings/prediction and actual runtime cadence remain pending.
No complete functional-feature or publication approval is implied.

### First seating client integration review

The public authoritative action/contact resolver avoids exposing private seat
custody, recognizes even-width seat centers, and rejects absent/carried/basic
malformed parents. Runtime frame selection now implements2fps and reduced-motion
frame0. Seat and avatar draw as one parent group, and held-tool light is withheld
with the hidden held tool. E and touch interaction share the existing key route.
Two concrete client corrections remain:

- Reconciliation suppresses prediction for dodge/block only. Seated art is drawn
  at the authoritative seat, but earlier culling, camera/rendered anchors, target
  bounds and nameplates still use predicted/interpolated coordinates. During
  delayed/blocked standing those can drift away; placeables already suppresses
  the occupied chair, so mismatched player culling can hide both. Freeze seated
  presentation while still sending stand intent, and resolve seat before anchors
  and visibility. Test actual producers with deliberately displaced predictions
  and remote interpolation, not only the pure seat resolver.
- Generic targetPlaceable selects the first row at the authored tile. A valid
  rug-first/chair-second overlap can hide Sit entirely, and the other footprint
  column of a bench/loveseat is inert. Use eligible seat footprint/layer-aware
  targeting; cover row order and both halves of two-wide seats.

Client helper tests alone do not establish these painter/control contracts.
Full room/prediction journeys and publication approval remain open.

### Seating client prediction/target correction review

Verified facedHearthSeat selects eligible current-space footprints independently
of rugs and recognizes both columns of wide seats. Sitting reconciliation now
discards queued prediction on every frame; main simulation retains input intent
while withholding local movement. The player producer resolves the authoritative
seat before culling/labels/anchors, so displaced local/remote interpolation no
longer removes the sole seat group. These close the two original client findings.

One follow-up contact correction: seated footY is already the furniture floor
contact, but terrainContactWorldYForPlayer subtracts another six pixels plus
epsilon before computing label/target projection. The parent group samples the
unaltered seat contact. Use seated.anchor.y directly for that projection sample,
and test a sample-dependent projection rather than a constant-zero mock. This
is a contract mismatch concealed on flat floors, not a demonstrated live visual
regression. Runtime/live room acceptance remains open; no publication approval.

### Residence expansion geometry/cache design review

The proposed east then south expansion is coherent with two purchasable rooms
inside a fixed residence envelope. Each rank adds a100-tile room plus a9-tile
connector. The original10×10 floor and entry/exit/trapdoor coordinates remain
unchanged;3-wide halls provide comfortable movement. Rank0 stays16², higher
ranks use32². The second addition leaves useful distinct rooms for kitchen/
dining versus bedroom/workshop without making the original cottage redundant.

Independently exercised actual shared definitions, engine terrain and authority
terrain collision for ranks0/1/2/0/2. Floor totals100/209/318; zero differing
blocked cells between engine and authority. Full-body cardinal traversal with
legacy bed/bookshelf blockers reaches existing exit/trapdoor at every rank, the
east room at rank1+, and the south room at rank2. Repeated ranks reuse their
cache object; rank1 and rank2 remain distinct despite equal32² envelopes. Rank
is present in engine terrain/classification, authority collision and client
presentation keys. Streaming bounds need change0→1 but not1→2. Inspection
harness is `/tmp/astra-expansion-check.ts`.

Two integration requirements remain: export explicit connector/doorway
reservations for furniture and internal architecture validation (currently
'reserved' is only a comment), and furnish/render native boundaries. Residence
ground-cache still uses the previously identified transparent legacy interior
wall asset. When introducing three-course panels, verify every projected pixel
footprint stays outside playable cells at south-room/hall joins, preserving the
original room geometry. These are geometry/cache findings only; purchase,
network schema propagation, internal construction, native scene and live
acceptance are not yet approved. No publication approval.

### Residence expansion pure preflight review

Reviewed sequential-rank/envelope checks and whole persisted furniture layout
validation. It retains IDs/support records, rejects overlap/new reservations/
invalid wall support, and checks exact occupant escape plus centerline hall
access. Shared reservations now include whole halls and both mouths. Replacing
arbitrary room-center required probes with reserved mouth cells avoids rejecting
a valid furnishing solely because it covers a diagnostic room-center point.
No mutation occurs in the pure preflight.

Authority integration must explicitly handle seated occupants: their physical
anchors intentionally overlap their own seat collision, so supplying those as
ordinary occupants returns occupant_blocked even in a valid room. Persistent
offline guest seating makes a simple stand-first requirement potentially
indefinite. Preflight safe stand plans for seated occupants (without mutation
before a successful transaction), or provide an explicit safe offline-custody
resolution policy. Add a seated/offline occupant expansion regression. This
same issue should be checked for ordinary furniture placement around occupied
seats. No purchase/authority or publication approval is implied.

### Seated expansion preflight closure

Reviewed the explicit seated-occupant partition. Each persisted seat ID must be
present and unique; shared seating geometry checks against all actual other
players and the full proposed furniture layout, then verifies exact custody
coordinates. Only its safe virtual standing destination is added to the ordinary
escape validator. Actor positions, seat custody, furniture and support records
remain untouched. This resolves the offline seated-guest false rejection without
weakening the standing-player or passage checks. No additional material safety
issue found in this bounded pure follow-up.

Virtual destinations prove individual ability to stand and escape; they are not
a simultaneous teleport plan and must not later be applied as one. Authority
must derive the complete standing/seated partition from persisted rows, not
accept it from clients, and recheck rank/layout within the purchase transaction.
Purchase integration and live acceptance remain open; no publication approval.

### Native residence wall foundation review

Viewed the three-rank native architecture fixture. Wall panels occupy blocked
rows above floor, preserve visible hall mouths, and stop around the south-room
connector. No floor coverage, invented corner shapes or visible cache cut found
in these authored layouts. This is bare wall/floor composition, not finished
residence art; trims, windows, doors, furnishing and lighting remain open.

The helper checks all three projected courses. With16×48 source/anchor8,47,
drawGroundAsset paints from wall-base row minus2 through its base row. The
cache prepass includes local base rows0..17, correctly capturing the two rows
of possible overhang from the next16-tile chunk. Current authored base rows
are2,7 and15, so this fixture does not directly exercise a wall based at16/17.
Requested a synthetic actual GroundChunkCache seam test for that general
contract before describing it as tested; arithmetic/code inspection is sound.
Provenance additions for residence-wall.ts and spaces.ts are being incorporated
by the implementing agent. No publication approval.

### Actual residence cache-seam closure

Viewed refreshed four-panel fixture SHA
`f4b1d5a05e5089ab16dd805c0ba71481775b56823832f720b78387e736254192`.
The synthetic floor starts at row17, placing its native wall base at16 across
the16-tile cache boundary. Actual GroundChunkCache renders both chunks; the
wall reads continuous. Independently decoded the PNG and compared its320×96
wall rectangle at3168,448 with the uninterrupted rectangle at96,0: all122,880
RGBA channels match exactly, zero differences. The render tool now fails on
any mismatch and records the compared pixel count. This closes the requested
bounded cache-seam evidence gap. Broader finished residence/art/live gates and
publication remain open.

### Residence expansion purchase authority review

The reducer derives the home from the authorized owner's identity, limits
purchase to that estate/home, checks expected current rank before quoting, and
uses server-defined3200/4200 bronze prices. Funds are checked before the full
next-layout preflight; wallet/home writes follow validation. Statistics record
spending without adding XP. Collision rank override is passed only to the
constructed instance definition; it does not temporarily rewrite persisted home
state. Existing furniture, containers, player positions and seat rows are not
rewritten. No concrete debit or custody flaw found in this bounded inspection.

The new persisted occupant partition rejects missing/mismatched sitting custody
before charging. However, the actual reducer fixture currently supplies only
null custody and substitutes collisionForSpace. Requested integration coverage
for an offline seated guest/no actor writes, malformed custody/no debit, and
the actual rank-override collision retaining fixed doorway obstacles while the
persisted rank remains unchanged. Pure-helper coverage does not replace these
new adapter branches. Prices remain initial-testing values until village order
payouts/progression can be played and measured. UI/live/persistence acceptance
and publication remain open.

### Residence purchase adapter coverage closure

Reviewed the expanded fixture extracting both actual purchase callback and
collisionForSpace. The seated guest uses real shared stand/escape validation;
mismatched custody rejects before debit, valid custody permits purchase without
position/seat mutation APIs. A fixed surface blocking the proposed hall is
retained by the actual collision adapter: next terrain is32-wide while persisted
rank remains0, and purchase rejects without wallet/home writes. Both sequential
prices, stale retries, insufficient funds, nonownership and furniture blockage
remain covered. Independently ran6/6 tests successfully. The requested bounded
adapter coverage gap is closed. These use a fake database, not proof of live
SpacetimeDB transactional rollback, reconnect or persistence. No publication
approval.

### Residence purchase UI initial review

The fourth catalogue tool opens a separate room detail; purchase shows room
name,10×10 plus hall, server-shared price and wallet balance. Owner/funds/rank
gates precede request creation, expected rank protects authority debit, and
success remains latched until authoritative rank changes. Scope includes user,
connection generation and space. No implicit purchase occurs on opening detail.

Two corrections requested: expansionFailed(scope,rank) has an A→B→A scope race.
Leaving and returning to the same room/rank permits a new request whose latch
can be cleared by an old request's delayed rejection. Add a per-operation token
and verify failure ownership, as with the move controller. Separately, the
actual compact fixture places BACK/BUY labels along the button top border;
explicit vertical/center alignment is needed. Test stale failure after leaving,
returning and starting a newer purchase, then refresh native button evidence.
These are bounded UI findings; live purchase/reconnect and publication remain
open.

### Residence purchase UI correction closure

Verified monotonic operation tokens flow through queued requests and the client
failure callback. Scope/rank changes discard the active token; only failure of
the currently owned operation clears its latch. The A→B→A regression proves an
old rejection cannot unlock a newer purchase, while its own rejection permits
retry. Independently ran9/9 palette tests.

Personally viewed the refreshed compact purchase fixture: BACK and BUY EAST
ROOM are centered within their buttons, with cost/wallet and room description
clear and unclipped. Both bounded UI findings are closed. Live transactional/
reconnect purchase evidence and publication approval remain open.

### Modular residence architecture source/design review

Personally inspected Interior_Walls and Wood/Stone/Brick_Wall_Fillers at native
integer enlargement, plus House_Decor/windows.png and Doors.png. The wall sheet
provides48px-tall front panels and separate frames/trim; filler sheets provide
repeating material texture. They do not supply complete perspective corners or
a16px-high window/door system. The empty frame atop Interior_Walls must not be
represented as a finished glazed window; use genuine House_Decor/windows art.

Recommend one-tile physical partition cells with an explicit cutaway convention.
Default internal walls display the lower16px native panel band (for the reviewed
plaster family: crop104,80,16,16) and suitable native material fillers. This keeps
art inside its physical cell without consuming three floor rows. Keep open
doorway cells passable and use short native jamb strips where orientation has
source support. Do not rotate/stretch48px fronts into unsupported side walls or
invent corner perspective. Full-height wall/window presentation is safe where
all projected courses lie over blocked cells, as at outer boundaries. Internal
full-height windowed partitions require a separate actor-aware cutaway treatment
that reveals obscured floor/actors; zero floor overlap and a full native window
cannot both fit within one16px collision cell. That constraint must be resolved
explicitly before claiming internal windows complete.

Suggested authority contract: persist floor finishes separately from partition
solidity; an open doorway has a declared axis, solid supporting wall neighbors
and clear same-plane approach cells on both sides. Reserve purchased connector
halls/mouths and original portal cells. Wall-mounted windows/ornaments retain
parent identity and supported orientation; reject support removal/door conversion
until attachments are moved. Validate proposed structural collision with all
persisted furniture and standing/seated escape preflight before charging or
mutating. Changing finishes must never change collision; changing partitions
must invalidate both structural collision and renderer caches through a shared
revision. Test a furnished corner, thin partition behind an actor, doorway
traversal, attached-window support removal and cache boundaries.

This is a source/design recommendation, not imported asset or final architecture
approval. Native reference-style room composition still needs actual furnished
cutaway/window fixtures. No publication approval.

### First modular architecture planner review

The pure planner keeps finish separate from partition collision, bounds cells
to purchased floor, protects portals/connectors, requires window walls and
opposite doorway jambs, and validates furniture plus reachable free floor.
Baseline collision is copied rather than mutated.

Confirmed a concrete fixed-obstacle gap with actual planHearthArchitecture
(`/tmp/astra-architecture-check.ts`): an immutable obstacle covering6,8 permits
a wall at6,8 (null failure), and permits a doorway at6,8 between wall5,8 and7,8
(null failure). Only baseline.blocked is checked; fixed bed/counter obstacles
are retained but not checked against newly authored partition cells. Global
escape can go around the blocked doorway and therefore does not prove that
doorway usable. Reject partition/window bases overlapping fixed obstacles;
floor finish may remain allowed beneath objects. Validate each doorway run's
full-body crossing and approach cells in the proposed collision, not solely
its jamb adjacency or global floor reach. Requested both exact regressions.
The source/native rendering and authority persistence remain separate unfinished
slices. No publication approval.

### Architecture fixed-obstacle/doorway closure

Verified physical partition cells now reject full-tile overlap with immutable
obstacles, while floor finishes can remain beneath them. Every doorway cell
requires a collision-clear starting body and a sampled32px crossing through the
proposed wall layout. The planner repeats this local check with movable furniture
bases included, then discards that temporary furnished collision before ordinary
layout validation so furniture is not added twice. This closes both confirmed
fixed-bed/fixed-counter cases and the otherwise-reachable room with a blocked
doorway approach. Independently ran architecture/furniture suites:16/16 pass.
No additional material issue found in this bounded correction. Persistent
architecture authority, native cutaway/window rendering and live acceptance
remain separate unfinished work; no publication approval.

### Architecture material/edit planner review

Versioned immutable recipe values, expected-revision CAS, bounded distinct edit
coordinates, full replacement matching, signed prior-minus-next materials and
unchanged rejection are coherent. Implicit starter flooring has no refundable
cell, replacement nets original paid values, and windows require removal before
wall demolition. Authority must own persisted state and atomically prove debit/
refund capacity with the state revision; the pure planner does not prove custody.

One repair concern remains: prior planHearthArchitecture validates old cells
against today's dynamic obstacles/occupants before examining the proposed edit.
A counter moved onto a doorway approach can therefore prevent removing that
doorway/partition to restore a safe layout, failing as architecture_state_*
before the repair is tested. Separate intrinsic refundable-state validation
(version, known components, bounded unique coordinates and attachment integrity)
from current physical clearance; enforce full geometry/escape on the proposed
layout. Keep malformed or unsupported persisted recipe values nonrefundable.
Requested an obstructed-old-layout to safe-removal regression. Pricing and
persistent inventory transaction behavior remain future validation gates; no
publication approval.

### Architecture repair/refund validation closure

Prior paid cells are now composed against immutable purchased-floor geometry,
without current objects/occupants or a global escape requirement. Proposed cells
still undergo full current-world validation. The actual regression removes an
old doorway plus jambs after a later counter blocks its approach, returning
exactly12 wood/4 stone and leaving the fixed counter intact. This closes the
repair deadlock identified above.

The strict JSON codec rejects unknown version/fields, invalid decimal-u64
revision, out-of-range/duplicate coordinates and unknown components instead of
dropping refundable state. Codec validity is followed by intrinsic composition
before refund calculation; decoding alone is not structural approval.
Independently ran10/10 edit/codec tests. Persistent transaction, refund stack
capacity/metadata and live acceptance remain pending; no publication approval.

### Architecture material inventory planner review

Carried-only sources, metadata-compatible consumption, active stack-limit
refund chunks and complete movedQuantity checks are coherent. Consumption and
refunds operate on copied slots; failure exposes no partial result, and equipment/
cursor/crafting/storage remain funding-excluded. Net consumed capacity can be
reused for refunds within the proposed atomic transaction.

One defensive loss case remains: Array.from({length:capacity}) silently removes
occupied slots beyond a malformed declared capacity. For example capacity1 with
wood2 then stone1 returns a successful wood:-1 result without that stone. Reject
nonempty out-of-capacity slots before cloning, and validate occupied quantities
across copied carried slots; padding genuinely missing slots is safe. Requested
a no-result/unchanged-input overflow-slot regression. Authority integration must
still derive deltas solely from the edit plan and commit resulting inventory
and architecture state in one transaction. No publication approval.

Immediate follow-up: implementing agent added matching container IDs and
nonempty overflow-slot rejection during review, closing that truncation path
in code. Latest inventory suite6/6 passes; an explicit overflow-slot regression
was still requested before calling that defensive coverage complete.

### Construction inventory defensive regression closure

Reread the latest helper and tests after overlapping implementation updates.
All copied occupied slots now require positive safe-integer quantities, including
unspent kinds; occupied slots beyond active capacity reject before copying.
The explicit overflow regression checks unchanged input. The combined pure
transaction returns architecture state and inventory together; full refund
rejection exposes only failure and leaves the prior revision/cells untouched.
Independently reran the current suite:8/8 pass. The requested bounded defensive
coverage is closed. This remains a pure transaction plan, not proof of actual
database commit atomicity; authority/live acceptance and publication remain open.

### First persisted architecture authority integration review

The edit reducer checks builder/current residence, strict persisted/edit codecs,
expected revision and reach, then constructs bare proposed geometry and resolves
actual standing/seated custody. Combined material planning precedes serialization
and inventory/home writes; no player or storage relocation is introduced. Shared
read paths fail closed for malformed paid state within the affected home rather
than crashing the global tick. Actual authority transaction tests were still
being added at this review checkpoint.

Two integration findings requested:

- Full architecture JSON, including its ever-increasing revision, enters
  previously unbounded engine terrain/classification and authority collision
  cache keys. Repeated net-zero paid-floor relocation can retain unlimited old
 32² snapshots and keys. Bound/evict obsolete per-space revisions in every
  affected cache, with a repeated-revision regression.
- Construction validates doorway approaches against furniture, but subsequent
  ordinary furniture placement/move does not validate authored door approaches.
  Another room route lets its generic escape check pass while the local door
  becomes blocked. Apply the persisted architecture's doorway crossing checks
  to proposed furniture layouts too, with moved source excluded once.

Architecture native rendering/UI, real transaction atomicity/persistence and
publication remain open.

### Persisted architecture bounded integration follow-up

Re-reviewed the current implementation and independently ran the architecture
reducer, residence terrain/cache, architecture geometry and construction
inventory suites: **26 tests passed across four files**. Both findings above are
closed for this local slice. Engine terrain and classification caches prune the
same residence to four keys on saved-state misses; authority collision does the
same within its content/space/medium namespace. The twelve-revision regression
proves old terrain, classification and authority references are evicted, current
keys reuse their results, collision remains aligned, and corrupt state blocks
both render traversal and authority traversal.

`requireFurnitureDestination` now recomposes saved architecture against fixed
obstacles plus other native furniture bases and the proposed candidate, excluding
the moved source. Client preview applies the equivalent doorway check. The actual
server helper regression rejects a chest on a persisted doorway approach before
any mutation. No further concrete blocker found in these two corrections.

The edit reducer tests execute the production callback and shared transaction
planner, covering spend/refund, stale revision, full refund rejection, malformed
input and builder rejection. Admission, reach, collision and inventory persistence
are mocked in this fixture; these results prove local pre-commit behavior rather
than live transaction rollback or full custody integration. The new cardinal
`requireArchitectureReach` avoids the former south-only wall approach, but its
actual helper is not exercised by this test fixture. Native partition rendering,
construction UI, live persistence and full patch publication remain open.

### Native construction crop and cutaway design review

Inspected the original sheets and exact proposed crops at eight-times integer
native scale. Wood_Floor_Tiles (32,96,16,16) contains intact straight gray timber
boards, rather than parquet/herringbone; townhouse/gray-timber naming is accurate.
Interior_Walls (104,80,16,16) contains the plaster panel's complete lower band and
skirting, suitable for the agreed one-cell cutaway. House_Decor/windows
(0,32,16,32) contains a complete narrow arched four-pane dark-blue glazed window.
No clipped native features found in these crops. Repeated-floor seams and actual
jamb cropping remain fixture checks, not approved by this source inspection.

One design correction requested before window integration: testing only whether
an actor's foot lies within the window's projected rectangle misses head/torso
occlusion when the feet lie below it. Intersect actual posed/projected avatar
bounds with the window rectangle, or use a conservative expanded reveal zone;
include local predicted position, remote presentation and seated offsets. Fade
only the window art, retaining the solid low-wall band so physical boundaries
remain legible. Twenty-five-percent alpha is a provisional visual treatment,
requiring a behind-window actor fixture to establish actual readability. Full
windows remain transparent props supported by physical partition cells; their
visual height must not add collision over adjacent floor. No publication or
finished construction visual acceptance granted by this crop review.

### First native architecture integration review

Viewed `output/doc60/residence-architecture.png`: the native gray-board finish
repeats coherently, the low plaster bands remain inside their physical cells,
and the complete arched window is visible above its support. Bare disconnected
bands are an initial cutaway study; doorway jambs and furnished room composition
remain unfinished. The new conservative window reveal bounds cover head/torso
and seated overlap, read final rendered anchors at draw time and preserve incoming
alpha. This closes the prior foot-only trigger design issue, but no actual avatar
occlusion fixture has yet demonstrated the 25-percent treatment visually.

Found a concrete cache integration blocker: `GroundChunkCache.prepareTerrain`
keys space, generator, size, seed, version and rogue revision, but neither saved
architecture nor residence rank/terrain identity. Main's presentation change
only invalidates resource tile(0,0). A saved edit in another chunk of a32x32 home
therefore leaves cached floor/partition pixels stale while authority collision
and separately drawn windows update; same-size rank1-to2 expansion also retains
old cached chunks. Requested structural-key/reference invalidation in the actual
ground cache and same-cache regressions for an edit in chunk(1,1) and rank1-to2.
The existing classification-cache and synthetic seam checks do not cover this
lifecycle. New assets remain draft and publication remains held.

### Ground-cache architecture invalidation closure

Rechecked `GroundChunkCache.prepareTerrain`: retaining only the current residence
terrain reference and clearing chunks when that reference changes closes the
stale-architecture/rank finding. Non-residence terrain clears the retained
reference; unchanged residence terrain reuses its cache. This adds no collection
of old revisions. Independently ran all seven ground-cache tests successfully.
The new same-cache drawTilePreview regression targets chunk(1,1), verifies
rank1-to2 rebaking despite unchanged dimensions, then saved floor/wall rebaking,
and verifies repeated identical terrain avoids another render. Its chunk renderer
is mocked, so this proves invalidation rather than changed native pixel output;
the independently reviewed band/crop fixtures cover the separate drawing path.
Door jambs, actual behind-window avatar readability and publication remain open.

### Standing-window fixture and floor direction

Viewed the refreshed sorted-gameplay-painter architecture fixture with native
standing avatars in rank1/rank2 panels. Both silhouettes remain identifiable;
the window fades while the low physical band remains opaque, and the no-actor
panel retains its full window. This supports bounded standing readability. It
is not seated, animated movement or lighting acceptance.

The gray straight-board fill is technically coherent but reads like dense metal
grating across a large room. Independently inspected native16x16 alternatives
repeated4x4 at integer scale. Recommend Wood_Floor_Tiles(96,0,16,16), warm diagonal
boards, as a new townhouse candidate: repetition is coherent and its diagonal
joints distinguish it from the existing rustic floor. Native(0,96) and(16,112)
only warm the same strong rail pattern and do not resolve that issue. Reference
study `/tmp/astra-floor-96-0.png` uses direct repeated native pixels. Request a
room recapture before approving the replacement; existing crop approval does
not transfer automatically. Door jambs and complete room styling remain open.

### Warm townhouse crop and standing fixture bounded approval

Personally viewed the regenerated architecture fixture after the native
Wood_Floor_Tiles(96,0,16,16) import and atlas rebuild. The warm diagonal boards
repeat cleanly and distinguish the townhouse finish from the surrounding rustic
floor without the previous gray grating effect. Both standing avatars remain
readable, the window's faded/non-faded states remain distinguishable, and low
partition bands remain opaque. Independently ran both exact source-pixel asset
tests successfully. Approve these two imported native crops (warm floor and
arched window) and this limited standing-fixture treatment for the reviewed
slice; no asset flags changed by this review. Seated overlap, lighting, native
jambs, finished rooms and whole-patch/publication acceptance remain open.

### Construction controls design review

Separate Construction/Furnishing subviews and a collapsed tool/status bar are
appropriate for the existing compact palette. Component-specific floor,
partition and window tools must preserve every unrelated component; removing
an unpurchased starter finish is a no-op without refund. Explicitly distinguish
"Restore starter floor" from removing the whole authored cell. Keep the active
tool, affected footprint, signed material totals and failure reason visible
when the catalogue is collapsed. Switching tabs or pressing Escape cancels the
current pointer gesture; a catalogue-close pointer release must not also edit
the world. Hold/drag must not repeatedly spend unless a separate paint mode is
intentionally implemented.

One completeness blocker in the proposed single-cell transaction design:
supported east/west passage requires a two-cell-high opening. Its first doorway
cell cannot pass jamb continuity/body crossing, preventing the second click;
removing one cell from a multi-cell opening can similarly invalidate the
remaining chain. Provide an oriented doorway stamp and whole-contiguous-opening
removal, committed atomically through the existing batch reducer. Preserve each
cell's floor and preview the entire affected footprint/net material delta. Do
not offer rotation unless both supported physical layouts can actually pass
shared preflight.

Preview should use the current revision, shared replacement/batch helper and
full proposed geometry with fixed objects/native furniture. Mirror the actual
cardinal architecture-reach contract rather than south-facing furniture reach.
Cache expensive flood checks by terrain/content/state/furniture/actor changes.
Client-visible passability is provisional where private/offline seat custody or
full refund inventory metadata is unavailable: present an amber "Checked on
apply" state with an actionable reason, never a guaranteed green refund.
Material amounts must come from immutable recipe deltas, including mixed
replacement costs/refunds, rather than static tool prices.

Serialize requests per identity/session/space/builder scope. Snapshot expected
revision and exact edits at dispatch; hold the pending state through response
and authoritative observation, use operation tokens for stale failures, and
never replay a rejected edit automatically against a newer revision. Another
builder's update must invalidate a preview, not silently authorize a replacement
based on stale cells. Keep pending visible after menu collapse and make touch
pan/gesture cancellation distinct from deliberate world edits. This is a design
review only; controller, native controls and complete authoring journeys remain
pending and publication stays held.

### First construction controls implementation review

Reviewed the shared tool helper, request controller, actual main preview/dispatch
and palette. Atomic north/south wall-door-wall and east/west
wall-door-door-wall stamps close the previous single-cell authoring blocker.
Component edits preserve paid floors/windows; connected doorway removal is
bounded and atomic. Net material values come from the actual shared edit planner.
The single preview cache is bounded, and request tokens prevent old-scope
failures from unlocking newer requests. Server-only reach/occupant/bag validation
is explicitly provisional in source rather than represented as guaranteed
client success. No new mutation/custody blocker identified in this bounded pass.

Two feedback corrections requested before calling these controls ready:

- Construction reuses a32px collapsed bar whose one10px status line replaces the
  active tool and must contain every signed material plus the long server-check
  disclaimer. At compact width this clips meaningful costs/refunds or the
  provisional qualification. Provide dedicated multi-line construction feedback
  or a details view preserving the active tool, entire material delta and pending/
  server-check status. The viewed `construction-ui.png` proves the expanded
  nine-tool selector fits, but contains no selected-world-tile transaction feedback.
- A failed stamp preview discards its batch and draws only the hovered cell red.
  Retain and outline the full intended footprint when geometry fails so the
  extra jamb/opening cells are visible before application. A one-cell red marker
  is misleading for a three/four-cell tool near a protected hall or obstacle.

The expanded selector is readable at the supplied compact size. "Remove floor"
would be clearer as "Restore starter floor", reflecting the preserved implicit
floor and absence of any starter-floor refund. Native doorway jambs, live
construction journeys and publication remain open.

### Construction review-before-apply feedback closure

Re-reviewed the staged proposal flow and personally viewed
`output/doc60/construction-review-ui.png`. First world click records the exact
proposal without a reducer call; Apply recomputes the full shared plan and checks
scope, selected tool, revision and edits before submission. Pending prevents a
second apply, and token ownership protects newer proposals from old failures.
The staged116px compact panel displays the active doorway tool/four-cell
footprint, all three stress-case material lines, server-check qualification and
separate Apply/Cancel buttons without clipping at320x180. This closes the prior
hidden-material/provisional-feedback finding. The stress-case combination is
layout evidence, not a claim that this exact recipe yields that refund.

Preview now retains `hearthConstructionToolFootprint` independently of plan
success, including unchanged jambs, so failed stamps outline their complete
intended geometry. This closes the misleading single-red-cell finding.
Independently ran the tool, request, actual extracted world-click/apply and
palette suites successfully. No further concrete blocker identified in this
bounded feedback correction. Native jambs, real touch/live construction journeys
and publication remain open.

### Native doorway source and orientation recommendation

Inspected Interior_Walls and House_Decor/Doors at native integer enlargement,
including exact frame crop and alpha rows. The proposed Interior_Walls
(48,16,32,32) is a closed rectangular frame: source rows42–47 contain a complete
bottom rail. Importing it unchanged as an open passage would visibly obstruct
floor that authority intentionally leaves traversable. Doors.png supplies
front-facing closed door slabs; no honest open side-facing/EW arch is present.
Do not rotate those slabs or claim a native side perspective that the sheet lacks.

Concrete native candidates:

| Role | Source crop x,y,w,h | Anchor | Treatment |
| --- | --- | --- | --- |
| N/S open header/uprights | Interior_Walls48,16,32,26 |16,25| Stops before bottom rail;22px transparent internal span over16px passage |
| Left low timber jamb | Interior_Walls48,34,5,8 |2,7| Intact lower upright segment, no sill/header |
| Right low timber jamb | Interior_Walls75,34,5,8 |2,7| Matching native opposite upright, no rotation |

Prefer a consistent low timber end-jamb convention for the default cutaway.
For a north/south doorway cell at(Dx,Dy), the full frame would occupy horizontal
pixels16Dx-8 through16Dx+23, with its posts on the neighboring solid wall cells;
anchor its base at16(Dy+1). Matching low posts occupy those same horizontal
positions and the bottom8px of the supporting cells. An optional26px front
header must use the existing conservative avatar reveal, while low physical
jamb markers remain visible. It must not add collision to the opening.

For the east/west two-cell-high passage, use the unrotated low timber crops as
cutaway end posts entirely on the north and south supporting wall cells. Center
the5px posts within that wall column; north post occupies the last8px before
the opening, south post the first8px after the two-cell gap. Keep the entire
32px passage floor unpainted by threshold/header rails. This communicates timber
jamb ends without inventing a side arch. If a full side-facing arch is required
artistically, this source does not contain one; it remains an asset/design gap.

These are source-backed proposals, not imported-asset approval. Next fixture
should show both orientations, wall support boundaries, actual moving/standing
avatar overlap and no false floor obstruction. Native low-frame recognizability
must be judged at gameplay scale before treating doorway art complete.

### First native doorway integration review

Viewed the refreshed architecture scene and reviewed `hearthDoorwayFeatures`,
ground jamb drawing and dynamic frame enqueue. The imported front opening is
recognizable, contains no sill across its traversable floor, and fades without
hiding the native standing actors. East/west low posts remain wholly on solid
support cells, leaving the two-cell passage clear. Their recognizability in a
finished partitioned room remains an additional visual check. Native source
crops, run geometry and frame/opacity suites independently passed (13 tests).
No rotation or stretched side arch is introduced.

The window overlapping the front frame's left upright is a general allowed-layout
conflict, not merely a fixture issue. Reserve doorway support cells for their
hardware in shared authoring validation. Reject both adding a window to an
existing jamb and adding a doorway whose supports already hold windows; apply
same support reservation to movable wall ornaments/mirrors during construction
and later furniture placement/move. Keep the underlying low plaster. An error
such as "Doorway support needs clear wall space" explains the necessary repair.
Only moving the fixture window would conceal a layout the player can still make.
Establish this rule before unpublished architecture activation; any later policy
applied to saved paid layouts must retain safe removal/refund repair capability.

Bounded source/collision alignment is satisfactory, but native doorway art/layout
approval remains conditional on resolving this hardware overlap and recapturing
the corrected scene. Seated overlap, Dynamic lighting and whole-room/patch
acceptance remain open; publication stays held.

### Doorway hardware correction and bounded native art approval

Re-reviewed shared doorway-run/support derivation, strict authoring checks,
legacy conflict reduction and later furniture guards. New windows and wall-layer
ornaments cannot occupy doorway supports; both server destination validation and
actual client preview use the same support rule. Physical composition remains
legacy-tolerant, while edit planning admits only a strict subset reduction of
existing window conflicts, retaining original version1 refunds. This closes the
hardware-overlap finding without making old homes impassable or forcing all
legacy windows to be removed in one transaction. Existing ornaments can be moved
or picked up through their ordinary repair routes.

Personally viewed the regenerated fixture after moving the window away from the
reserved jamb. Window and front frame are now distinct, the sill-free N/S
opening remains clear, and the E/W end posts remain inside solid supports. The
standing avatars remain visible. Approve the three native doorway crops and this
bounded unlit cutaway/standing fixture; no asset flags changed by this review.
The source manifest and source-pixel tests support native fidelity. Independent
shared-support, actual authority-helper/reducer, doorway geometry and asset suites
passed. Seated/Dynamic lighting, finished-room recognizability, live authoring
journeys and full patch publication remain open.

### Travel and carpenter introductory contract design review

The proposed first two contracts match doc60's travel-to-town and meet-the-
carpenter sequence.150 bronze each is a modest one-time introduction reward,
with no item-capacity or XP farming complication; retain existing quest
turned-in identity/idempotence rather than permitting repeat acceptance. These
are onboarding payments, not the still-required farming/cellar order income
that should fund home building. Keep shops/furniture available independently of
combat and preserve Fin's existing starter/fishing services when adding choices.

Two concrete existing-system route traps require handling:

- `interactNpc` records its talk before the player chooses Accept, and
  `acceptQuest` snapshots talk counters. Accepting travel directly from Pip will
  not count that already-open conversation. Provide a clearly authored post-
  accept introduction or deliberate verified current-speaker credit; do not
  silently require an unexplained dialogue close/reopen. The same issue applies
  if Rowan can offer his own meet contract after the prerequisite.
- Location tracking only visits active quests. A player who already landed and
  accepts from Pip should be inside the destination region, including Pip's
  reachable frontage and the landing, rather than being sent back to a narrow
  landing trigger. Explain this objective as arriving in Willowharbour; do not
  claim proof of a ferry journey from a location objective alone.

Author state-gated offers/reminders/turn-ins consistently on both alternate
NPCs, including prerequisite turned-in checks and no exhausted quest markers.
Turn-in at the destination NPC avoids mandatory backtracking; Fin/Pip alternate
turn-ins remain convenience routes after actual objectives. Verify Fin-first,
Pip-first, already-met-Rowan, return-before-turn-in and duplicate-turn-in paths.
These two contracts do not complete the remaining furnish/gear/outpost/material
contracts or repeatable peaceful income scope. No publication approval implied.

### First two introductory contracts implementation review

Reviewed the authored travel/carpenter objectives, alternate NPC dialogue routes
and acceptance-credit call site. Fin's original fishing choices remain present;
travel and carpenter each reward150 bronze with empty item/XP arrays, and the
carpenter introduction requires travel turned in. Pip's admitted frontage and
canonical landing fall within the8-tile destination region. Destination dialogue
provides explicit completion choices, avoiding unexplained reopen/backtracking.

`chooseDialogueOption` validates the active merchant session, current authored
choice and quest requirements, synchronously applies its event effects, then
calls acceptance credit only for an accept action. The helper requires an active
quest accepted at that tick, credits at most one current matching speaker via
baseline adjustment, refreshes actual current-location progress and leaves
lifetime talk counters unchanged. Prior visits to other NPCs remain baselined;
repeat helper calls do not accumulate credit. No concrete correctness blocker
found in this bounded implementation review.

Independent content/route, acceptance/location and existing quest suites passed.
The new authority fixture exercises actual acceptance/location helpers, but mocks
quest refresh and does not execute the complete dialogue-choice caller. An actual
caller regression for unavailable/forged acceptance and Pip acceptance-to-complete
would strengthen this integration evidence. This is local evidence only; actual
ferry/indoor journey, duplicate live turn-in and persistence remain unverified.
Remaining four introductions, peaceful repeatable orders and publication stay open.

### Introductory dialogue caller evidence and compact UI closure

The new regression executes the actual `chooseDialogueOption` callback with real
choice lookup, quest requirement matching and acceptance/location helper. It
proves lifecycle effect precedes acceptance credit, which precedes dialogue
transition; duplicate unavailable Accept, forged choice, turned-in state and
failed NPC admission do not reach effects or credit. This closes the requested
caller-ordering/rejection evidence recommendation. Admission, actual lifecycle
mutation and database remain explicitly faked; it is not live end-to-end proof.
Independently reran all21 focused quest/content/caller tests successfully.

Personally viewed arrival-contract-ui.png and carpenter-contract-ui.png. Both
compact dialogues show the full acceptance explanation and distinct Complete/
Back choices without clipping. Approve this bounded text/layout readability.
The blank portrait is an acknowledged fixture fallback, and the completion
states are supplied offline; neither portrait integration nor actual journey/
turn-in progression is established by these captures. Remaining contracts,
peaceful order income and full publication acceptance remain open.

### Furnish-a-room introductory contract design review

Use four current-state objectives: one seat, one table, one furnishing lamp and
one rug in the owner's original residence room. Existing valid furniture should
count immediately on acceptance; guest-built pieces in that owner's home should
also count because cooperative building has no per-piece ownership requirement.
Exclude inventory/cursor/carried rows, other homes, public/static shop displays,
unknown/retired definitions, corrupt furniture state and unsupported attachments.
Require each piece's complete logical footprint within original floorx3..12,
y3..12, ignoring nonblocking native art fringe. Occupied seats and unlit lamps
still qualify. Do not require arranging items on adjacent tiles, buying an
expansion, consuming fuel or demolishing a working existing layout.

Prefer "lamp" over "standing light": a correctly supported tabletop lamp should
qualify alongside floor lamps, so the already-taught first-eight table/lamp route
is not rejected arbitrarily. Exclude held torches, campfires and cooking ranges
from this furniture category. Keep category classification explicit and shared
rather than matching item-name substrings. Offer/turn-in at Rowan (optionally Ada),
with clear directions to Ada's catalogue and a visible explanation that furniture
must remain placed until sign-off. A provisional350-bronze one-time reward with
no items/XP is appropriate; furniture is retained, and the earlier300 bronze plus
ordinary peaceful income covers a modest initial setup without combat gating.

Add a typed current-residence objective/source function to the existing quest
model. Do not disguise it as a lifetime statistic or subtract an acceptance
baseline. Derive counts from the owner's actual residence and indexed placeables,
using the same shared classifier on authority and any projected progress. The
journal at Rowan must use an owner-private server projection or retained
server-derived objective snapshot; local streamed placeables cannot prove remote
home contents. Avoid global furniture scans or one scan per objective: obtain the
owner's layout once per refresh and compute all four categories together.

Turn-in must rederive actual current contents atomically before rewards. Refresh
active/complete quest state when relevant furniture changes, including changes
made by a guest builder on behalf of an offline owner; alternatively ensure the
existing quest refresh path resolves the affected owner rather than ctx.sender.
A cached complete flag must never suffice after pickup/move outside the starter
room. Once turned in, later rearrangement is unrestricted and cannot regrant the
reward. Abandon/reaccept must not manufacture placement credit or rewards.

Acceptance scenarios: already furnished before acceptance; supported tabletop
lamp; seated chair; player visiting Rowan while home is outside subscriptions;
carried lamp exclusion; guest removes a rug during pending turn-in; move into an
expansion revokes that category; full inventory does not matter to bronze-only
reward; duplicate turn-in and reconnect; another player's identical room does
not qualify. These are implementation requirements, not completed-feature or
publication approval.

### First furnish-contract implementation review

Reviewed current furnishing categories/source, owner-indexed lazy residence
lookup, owner-only baseline projection, client journal consumption and success-
only furniture mutation refreshes. The new currentValue projection avoids
lifetime-statistic fabrication and allows journal progress outside the home's
streaming region. Refresh targets the residence owner after guest edits; actual
turn-in rederives the live objective source. Existing turned-in reward handling
remains unchanged. Categories include supported tabletop lamps and existing
pieces;350 bronze and prerequisite carpenter introduction match the reviewed
scope. No privacy or reward duplication blocker identified in these paths.

One concrete validity blocker: `hearthFurnishingCounts` validates only JSON object
shape before admitting rows to the eligible/support list.
`hearthFurniturePlacementFromRow` silently drops malformed support IDs and does
not validate geometry revision, so corrupt chairs/tables can count and a corrupt
parent can support a counted lamp. Require the same reserved metadata and authored
state validation used by actual presentation/mutation eligibility before admitting
any row. Requested malformed revision/support, wrong authored state type and
corrupt-parent-lamp regressions. Do not turn a visually withheld/unrepairable
piece into valid contract progress merely because its item category matches.

This is an initial code review while authority/view tests are still being added.
Live subscription reactivity, remote guest edits, turn-in transactions and final
contract UI remain unverified; publication stays held.

### Furnishing validity follow-up and offer readability

Reserved ID/revision and authored primitive state validation now rejects the
previous malformed metadata/type cases before support lookup. Actual owner
projection additionally uses resolvePlaceableObject state validity. The shortened
native furnishing offer fits completely, clearly stating original owned room,
four categories, retained placement and350bronze. Approve that bounded compact
text/layout; fallback portrait and live progression remain unverified.

One remaining support eligibility defect was independently reproduced with
`/tmp/astra-furnish-support.ts`: a standing table with syntactically valid but
forbidden supportId999 is skipped as a table, yet remains in the support lookup,
so a lamp attached to it still yields `{table:0,lamp:1}`. Another valid table
elsewhere would mask this invalid parent in the complete contract. Exclude
non-tabletop rows with any supportId before constructing the eligible parent
set, and test the exact valid-ID/invalid-parent-role case. The earlier malformed
metadata finding is closed, but complete unsupported-parent exclusion awaits
this correction. Publication remains held.

### Unsupported standing parent closure

Confirmed non-tabletop rows with any parsed support ID are now excluded before
building the eligible support array. The exact invalid table2/support999 + lamp
on2 regression, including another valid table, leaves lamp progress zero.
Independently reran the prior reproduction (now table0/lamp0) and all eight
furnishing classifier/progress tests successfully. This closes the last reported
unsupported-parent validity finding. Live projection/guest-edit/turn-in journeys
and publication remain open.

### Gear, shore outpost and specialist material contract design

The parallel arrival-to-carpenter-to-furnish and arrival-to-gear-to-outpost-to-
material branches preserve peaceful home progression and avoid making combat
wait on furniture purchases. Proposed once-only bronze200/300/200 and no extra
XP are reasonable introductory rewards on top of existing encounter rewards.
Accept any current valid rarity; do not require rare gear or full armour for the
first two-slime shore camp. Bram can explain equipment and Iona can offer/sign
off the expedition branch, with explicit directions to the shore camp.

Equipment must be a current objective, using actual selected MAIN HAND and BODY
slots through the same definition/durability rules as combat. No inventory-only,
wrong-slot, broken, retired or forged-definition credit. A bow requires10 matching
usable ammunition in the same carried containers the real firing path consumes;
exclude storage, other equipment and unusable metadata. Body/weapon still count
while visiting the quest NPC, but changing/removing them before turn-in revokes
readiness. Snapshot-derived private progress must match the server source rather
than infer readiness from character visuals. The contract is an introductory
check, not a requirement to remain permanently equipped after its turn-in.

For the specific cinder-ash-shore camp, increment existing quest-compatible
completion progress only while atomically persisting each eligible immutable
completion grant. Use encounter ID as the subject and the existing generation
completion guard; no final-hitter, proximity, client report or claim-button
credit. Acceptance baselines make earlier clears ineligible, while each eligible
participant receives their own subsequent completion credit, including eligible
players who retreated/disconnected. Unclaimed/full-inventory rewards must not
block completion. No reward-free summoned adds or other camps can satisfy it.

The clear quest/reminder must tell players to keep2Basalt and collect their
Expedition Reward [O] before returning to Iona. The authored shore grant supplies
exactly2Basalt. Delivery should use an ordinary current collect objective,
consuming2 only at successful turn-in; already-held basalt must count immediately
on acceptance. Do not require a new acquisition after accepting the delivery,
which would unnecessarily force another five-minute camp respawn. Selling/spending
it remains possible but should be clearly warned in contract text; pending loot
must remain claimable after clear turn-in and reconnect. No guardian seal or
rare random drop should enter this introductory chain.

Required local scenarios: melee/common and bow/exact10 versus9; wrong-slot and
broken weapon; equipment removal before sign-off; old completion baseline versus
new eligible grant; two contributors and a nonparticipant; duplicate lethal/
claim retries; full bags at clear; claim before delivery acceptance; delivery
partial quantity/full bags; duplicate turn-in. Actual common-gear shore fight,
route readability and live persistence remain broader acceptance work. No
implementation or publication approval follows from this design review.

### Gear/outpost/material implementation and compact offer review

Reviewed actual readiness helper, owner-private current objective source/view,
quest definitions and eligible completion-grant credit. MAIN HAND/BODY slot
checks use current definitions, slot acceptance, durability and quantity validity;
bows require ten matching shots across accessible hotbar/backpack slots. Old
outpost clears remain baselined, and only the specific shore camp's eligible
grant loop records new action credit. Credit persists with completion, not loot
collection, so full bags and claim retries do not regrant or withhold the clear.
Delivery consumes two current basalt and accepts stones held before acceptance.
Independently ran20 readiness and actual outdoor persistence/claim tests; all
passed. No concrete authority blocker found in this bounded slice.

Viewed preparation/outpost/basalt compact offer fixtures. All body text and
choices fit without clipping. One copy correction requested: "I will inspect
them for200 bronze" sounds like an inspection fee, while the quest grants200.
Use "I will pay you200 bronze when you are ready" or equivalent on both offer
routes. Outpost accepted/reminder nodes explicitly explain Expedition Reward[O]
and retaining two basalt; the delivery wording clearly states consumption only
on completion. These are offline fallback-portrait layouts; actual combat,
claim/turn-in journey, current-progress subscription behavior and publication
remain unverified/open.

### Preparation reward wording closure

Confirmed both Bram and Iona now explicitly say "I will pay you200 bronze when
ready". Personally viewed the regenerated preparation-contract-ui.png: complete
text remains unclipped and the reward direction is unambiguous. The fee/reward
copy finding is closed. This is bounded offline text/layout approval; live
expedition/turn-in and publication acceptance remain open.

### Repeatable peaceful orders economy and transaction design

Verified current authored economy: carrots9, potatoes8, grapes15, preserved
carrots14/potatoes12/grapes23, bottles5000 with estate_vintage premium. All these
items currently have buy:null and no direct merchant offers. Preserve processes
are1:1 conversions from the respective crops with36000 ticks per unit; they are
not free shop conversions. Existing native catalogue target room totals1580;
expansions remain3200 and4200.

Recommend a fixed350-bronze order premium over the exact applicable ordinary
merchant sale value of the delivered goods:

| Order | Delivery | Sale opportunity | Total payout |
| --- | --- | ---: | ---: |
| Kitchen carrots |20 carrots|180|530|
| Pantry potatoes |20 potatoes|160|510|
| Table grapes |12 grapes|180|530|
| Preserved carrots |12 preserved carrots|168|518|
| Preserved potatoes |12 preserved potatoes|144|494|
| Preserved grapes |12 preserved grapes|276|626|
| Cellar bottle |1 bottle|Actual owner's vintage sale value|Actual value+350;5350 at base|

By incremental order premium alone, the1580 room takes five orders, the3200 room
ten and4200 room twelve. Total cash also includes the delivered stock's existing
value; do not count that opportunity value twice when claiming order-funded
progress. A bottle's existing sale value already funds an expansion; preserve
that established economy rather than undervaluing bottles to force an order
count. Preserves/bottles are optional stock outlets, not mandatory slow processor
steps for a beginning builder. Leave crops available without combat or completion
of the six introductions. A permanent small catalogue is adequate; arbitrary
daily throttles are not needed solely to stop legitimate repeat deliveries.

Dedicated per-player order revision/receipt transactions are preferable to
resetting once-only introduction quests. Authority resolves a known offer and
fixed quantity, current content validity, actual owned carried sources, NPC
admission, current merchant-equivalent payout (including owner vintage), wallet
capacity and the expected order revision before any writes. Reuse the same
metadata-compatible inventory consumption policy for preview/count/removal;
never pull from another player's inventory, private remote storage or worn slots.
Consume exact quantities and credit wallet/update receipt in one transaction.
No reward items means full bags should not reject a valid currency-only delivery.
A duplicate or stale revision cannot pay again, even through another connection,
NPC or reconnect. Bound receipt retention or keep monotonic revision plus recent
result rather than appending unlimited receipts solely for replay protection.

Quotes should display both actual total payment and350order bonus. Recompute at
execution and reject a stale quote if content/vintage change would alter the
agreed amount; do not silently lower an accepted bottle price. Content validation
must reject newly introduced direct buy→deliver profit or instantaneous purchasable
input→recipe→deliver loops. Review timed-process inputs separately rather than
assuming all crafting is free or all processing time prevents arbitrage. Seeds
requiring actual farming are intended production, not a prohibited purchase loop.

Tests: exact split-stack consumption with unrelated stock preserved; repeated
order legitimate next revision; stale/duplicate cross-connection request; insufficient
stock, overflow wallet and changed quote without writes; base and every vintage
bottle rank equal merchant sale+350; guest storage excluded; newly authored cheap
shop offer/conversion detected. Native board compact/touch readability and real
farm/cellar cadence still need testing. This is a proposed catalogue, not completed
repeatable orders or publication approval.

### First peaceful-order planner and economy report review

Reviewed village-orders.ts quote/copy-on-consume planner and generated
village-order-economy.md. The seven quantities and base/vintage quotes match
reviewed merchant-value-plus350 payouts. Known-order, retirement/direct-buy,
content hash, receipt CAS, revision/wallet bounds and carried source validation
precede a returned commit plan; actual merchant sale supplies exact hotbar/
backpack consumption and leaves other containers untouched. Current non-durable
order goods introduce no item reward or inventory capacity dependency. Authority
still owns admission, trusted source containers and atomic persistence.

One quote-integrity correction requested before wiring transactions: expected
content hash alone does not capture estate-vintage rank/quoted total. Add an
expected payment (or equivalent vintage quote identity) and reject a changed
quote before consuming. A same-content rank change otherwise silently alters
the agreed bottle payment. Existing receipt CAS does not capture that separate
owner state.

The report correctly separates gross payments from350bonus-only gains, shows
actual expansion deliveries often below8–12 and acknowledges bottles already
exceed either expansion price before any bonus. It also explicitly limits the
direct-buy guard and calls out purchased apples→timed must/fermentation income.
This is transparent economic evidence, not a claim that whole-economy pacing or
transitive arbitrage has been solved. Actual cultivation/processing cadence,
authority/UI integration, live delivery and publication remain open.

### Order quote-integrity closure

Rechecked the immediately added expectedTotalBronze guard: a recomputed quote
must equal the reviewed payment before inventory planning. The same-content
vintage-rank change regression rejects stale5350, retains the bottle, accepts
refreshed10350 and permits a legitimate subsequent receipt revision. The current
five planner tests independently pass. Quote-integrity finding closed; authority,
UI and measured overall economy acceptance remain open.

### Peaceful-order authority integration design review

A private one-row-per-player receipt with one global monotonic revision is
appropriate: stale requests cannot spend again through another order/NPC/session,
and receipt storage remains bounded. Treat an absent receipt as revision0 until
a successful delivery; quote/admission/plan failures should not insert or advance
it. Client retry must retain the original expected revision rather than silently
rebase and deliver another batch after a lost response. The last order/tick helps
explain an already-observed success, but is not a second grant authority.

The own-orders view must derive caller identity, residence vintage, current
registry and receipt internally. Expose stable order IDs, current quotes/content
hash and caller revision only; no other owner's inventory/receipt or caller-
supplied rank. Missing/retired/unavailable quotes should disappear or be explicitly
unavailable rather than retain an old price. Actual fulfillment must re-admit the
current NPC by authoritative identity/definition, matching order NPC, same space
and reach. Matching a stale dialogue ID alone is insufficient. Settle survival
before testing living status, and reject carried world objects/mounts without
requiring the player to unequip ordinary Main Hand gear.

After admission, load current wallet/inventory/receipt, run the shared quote,
CAS and copy-on-consume plan, then commit inventory, wallet and receipt together.
Record consumed item quantity and actual earned bronze through existing statistics
after successful planning; do not grant combat/farming XP merely for delivering
shop orders. Currency-only payment should work with otherwise full bags. Keep
all content/vintage/expected-payment checks inside the authoritative transaction.

Concrete authority tests: two order IDs with the same expected revision;
reconnect/duplicate request; wrong NPC and out-of-range/space; dead/mounted/carried
object; stale content and same-content changed vintage quote with all stores
unchanged; full bags with exact goods; split stacks and unrelated items intact;
wallet/revision maximum; private view for two owners with different vintage and
receipts. These are bounded integration criteria, not existing implementation
or live publication approval. Full economy pacing remains independently open.

### Peaceful-order authority and networking bounded review

Reviewed actual fulfillment reducer, receipt declaration, sender-derived quote
view and client subscription/reset/resync wiring. Receipt storage is private and
bounded to one primary identity row. Current active NPC/space/reach is re-admitted,
advanced survival must be alive, and mounts/carried objects reject before the
shared delivery plan. Current quote/content/revision checks precede inventory,
wallet and receipt writes. Successful delivery alone refreshes equipment/quests
and records actual sale/bronze statistics. No concrete authority/privacy/custody
blocker found in this local slice.

The quote view reads only ctx.sender's receipt and owner vintage source; it
exposes seven applicable prices rather than any owner's inventory. Networking
subscribes in the self group, applies insert/update/delete through the existing
incoming event gate, clears quotes on connection reset and rebuilds them on
resync. This is code-path review, not a live subscription/reconnect test.
Independently ran ten planner plus actual reducer/session/view tests successfully.
Their fake database/admission boundaries prove ordering and rejection behavior,
not real database rollback or multi-connection isolation. Order UI, real delivery
journeys, measured overall economy pacing and publication remain open.

### Peaceful-order review/delivery UI lifecycle design

The explicit Review→Deliver flow should freeze order/NPC identity, exact goods,
normal sale value,350bonus, total payment, content hash and global receipt revision.
Show "You deliver" and "You receive" so the currency amount cannot read as a
purchase fee. Orders are their own transaction, not items added to the normal
merchant cart. The NPC-specific list has at most three entries; compact details
must retain all values and a clearly separate Back/Deliver action. Inventory
availability should use the same accessible hotbar/backpack policy as authority,
and any provisional server-only check should remain clearly qualified.

Use monotonic operation ownership plus player identity, actual connection
session generation and NPC/modal scope. Closing/reopening the same NPC must not
let a callback from the earlier modal poison a newer review. Disable duplicate
Deliver while pending, but allow leaving the modal without implying cancellation
of the already-sent server transaction. Preserve or reconcile that outstanding
operation on reopen instead of blindly allowing a replay.

A reducer acknowledgement alone is insufficient for refreshed display; observe
the authoritative global revision. Conversely, another connection can advance
that revision, so revision change alone means "Orders updated; review again",
not proof of this request's success. Quote/content/NPC/revision changes invalidate
a reviewed proposal; neither failure nor reconnect may automatically rebase and
resubmit goods. Observe revision across any current quote, not solely the chosen
order, which can disappear when content changes. If the entire catalogue vanishes
or connection drops before outcome is known, show an unresolved/reconnect state
and allow closing without false success or automatic retry. A separate own
receipt projection would resolve the empty-catalogue edge independently of offers.

Test receipt update before and after acknowledgement; another connection's
update; A→B→A modal/session late success/failure; selected offer removal, all
quotes removal and vintage total change; failed delivery followed by deliberate
review/retry; full bags with exact deliverable goods. Pointer/touch scrolling and
modal-close events must not also activate Deliver or world controls. No UI
implementation or publication approval is implied by this design review.

### First peaceful-order UI implementation review

Reviewed VillageOrderFlow, panel and actual NPC/main integration. Quotes are
frozen for review, exact expected fields reach the reducer, pending blocks repeated
submission and acknowledgement alone leaves it pending. Changed authoritative
quotes withdraw review with neutral "Orders updated" rather than claiming this
connection's success. Monotonic serial ownership rejects late callback effects
across scope changes. NPC filtering and explicit local order selection preserve
normal authored dialogue dispatch. Closing/reopening the local order panel keeps
its in-flight flow; closing the entire NPC conversation resets scope, with server
CAS still preventing stale repeated delivery. No concrete new authority/lifecycle
blocker found in this bounded code review.

Personally viewed village-orders-ui.png, village-order-review-ui.png and
village-order-pending-ui.png. Review/pending screens expose exact goods, ordinary
sale value, bonus and total separately, with distinct Deliver/Back or Pending/
Close actions. Requested one bounded readability correction: ordinary list rows
and neutral buttons use pale text on pale-orange fills, with noticeably weaker
contrast than established dark labels. Move the list's second line off the lower
bevel (up2px or increase interior), and use dark text on neutral buttons/rows;
retain light text on the brown panel and green/red action buttons.

These are offline compact fixtures. Real touch gesture cancellation, connection
loss during delivery, empty-catalogue outcome messaging and live order journeys
remain broader acceptance work. Economy pacing and publication remain open.

### Peaceful-order contrast and bevel closure

Personally inspected all three regenerated actual-catalogue order fixtures.
Dark neutral labels clearly separate from the orange row/button fills, and the
payout second line now sits fully inside each row above its bevel. Review and
pending screens retain clear goods, sale value, bonus, total and action/state
labels. The previous contrast/bevel finding is closed; approve this bounded
compact list/review/pending visual treatment. Live integration, touch journeys,
economy pacing and publication remain open.

### Willowharbour harbour, pond and path composition review

Viewed the populated residents study against current plots/scenery and doc60§4.
The harbour currently reads as a paved dead-end, the pond is cut by a stone
causeway with a tiny southern water remnant, and the pond's east spur lacked a
connection back to the inn/plaza. These are more useful next improvements than
adding unrelated trees to already broad lawns.

Preserve a clear ferry/arrival forecourt approximatelyx202..211,y398..403,
including204,400 arrival and209,400 interaction, with guide207,397 unobscured.
Develop native quay/boardwalk roughlyx211..219,y399..402 and keep moored boat art
seaward; any extension into water needs explicit bounded walkable deck geometry.
Place noticeboard/lamp outside the approach (candidate202,396 and211,395), and
small cargo groups around200..202,395..397 subject to native footprints. Do not
let tall crates/canopies hide the guide or ferry interaction. A short guide
approach207,398→207,400 ties the service to the public path.

Prefer restoring pond water under the oldy382..383 causeway and crossing nearer
the middle with a native modular E/W timber bridge, approximatelyx130..150,
y378..380. Cottage approach can bend via129,382→129,378; east bank should connect
around the inn's west garden to plaza163,394. If retaining the lower crossing as
a smaller slice, reshape the pond so meaningful water remains south, rather than
today's orphan sliver. Deck and rail collision must be authored separately:
ordinary nonflower scenery currently receives a solid full-width base and would
make an imported bridge impassable. Preserve water/shore treatment and native
module proportions; no stretched bridge image or unexplained stone fill.

Parent's immediately implemented smaller corrections were rechecked in code:
153,382→153,394→163,394 connects the east pond spur outside the inn foundation;
207,398→207,400 supplies the guide approach; barrel200,396/chest201,397 remain
west of the reserved arrival/guide corridor. The actual native facade/scenery
access suite was rerun for this bounded geometry pass. These are useful connected
path/cargo additions, not finished harbour or bridge art approval. Full-body deck,
rails, both ferry points and guide frontage need the same regression after dock
assets land. Farmyard crops/pens, service signs, lighting and final village/live
journey acceptance remain open; publication stays held.

### Stone pond bridge source and deck/rail design review

Inspected Bridge_Stone_Horizontal.png (192x112), enlarged native sheet and exact
RGBA rows. Stone is compatible with doc60's coherent native architecture; no
requirement forces timber if the available stone modules are better suited.
The proposed center crossing and new bank approaches resolve the causeway/sliver
composition problem, subject to the actual body traversal fixture.

Found a concrete crop blocker: the suggested repeatingx16 rail module contains
baked terrain. North source row0 has opaque grass/brown bank atx16..24; south
rows60..63 also contain bank greens/browns. Repeating full16px rail crops from
those positions over the pond would stamp grass/bank stripes across water.
Suggested stone-only north cropy1..15 (15px, rendered one pixel below logical
north rail top), and south cropy48..59 (12px with its original alignment), or
alternative individually reviewed modules. Deck sourcey16..47 is the separate
32px walking surface. Preserve native source pixels and module widths; do not
recolour unwanted bank pixels or stretch a single image into the long span.

Dedicated walkable deck versus solid rail prefabs are the right authority seam.
Keep north rail logical378, deck379..380, south rail381 and open bank entrances;
prove full-body passage in both directions including bridge approaches and
water outside rails. Authored ground deck should draw in surface phase while
rails remain entity/south receivers. Add a production producer regression for
both phases, and check existing ground-layer objects for rendering changes if
that classification correction is global. No bridge-art approval before the
repeated native span and corrected crops are viewed. Dock, final pond banks,
lighting/live traversal and publication remain open.

### Stone pond bridge crop, traversal and depth closure

Independently inspected the final native pond/player fixture
`output/doc60/willowharbour-pond-bridge.png`, SHA256
`2782342c7ead8526346301dac978d72002a95bb078e1ea1d2ef9fec5afde88b3`.
The nine imported modules now preserve the source stone without repeating the
sheet's bank stripe: north y1/height15, deck y16/height32, south y48/height12
with the south anchor retaining its original vertical placement. End modules
meet the banks and paths cleanly. Both deck lanes read as walking surface; the
actual native avatar remains visible above the deck and correctly among the
rails. The strict pond ellipse removes the former single-cell shoreline spikes.
No blocking crop, edge or composition finding remains for this bridge slice.
These nine assets are suitable for bounded native-art review approval; this
review does not change asset flags.

Reviewed dedicated empty deck collision versus solid north/south rail rows,
and the physical foot-box centring used by the one-pixel crossing regression.
Independently ran native bridge pixel fidelity, composed village body traversal,
and live-map runtime suites: 8/8 pass. Also ran the actual
`enqueueLiveMapObjects` ground-depth regression: 1/1 pass. It confirms ground
instances sort in surface phase below a northern actor while ordinary object
and canopy instances retain entity depth. This closes the earlier crop and
production depth-evidence requests. Harbour dressing, complete village scenery,
lighting, live movement/arrival and whole-patch publication acceptance remain
separate outstanding work.

### Willowharbour quay foundation review

Inspected the widened `output/doc60/willowharbour-arrival.png` (1344x1152),
SHA256 `11a3d6afa3975b493f4cf25ce85a310d2cbc2e1f3fabd92573704c6b4e11627c`.
The earlier capture clipped the eastern terminal; the wider framing resolves
that evidence gap. The eight-module stone landing, two-row deck and paired rails
have coherent native scale. Shore paving joins the deck cleanly across the
coast, and the exposed eastern end clearly meets open water. Reusing the bridge
modules is acceptable for this small masonry quay foundation. No blocking
proportion, coast-join or edge-readability finding remains for this slice.

Reviewed explicit deck overrides x212..219/y400..401 and separate solid rails
at y399/402. Independently ran `hearth-village-access.test.ts`: 3/3 pass,
including both deck lanes outbound and return at one-pixel steps, blocked water
at x220, blocked side rails and preservation of the complete existing ferry
forecourt and guide/resident access. Arrival204,400 and ferry209,400 remain
unchanged. These are composed native-map tests, not a live ferry journey.

The bare quay still needs its harbour identity: a moored boat or other native
maritime landmark, an unambiguous ferry sign at the existing interaction area,
and appropriate lighting/cargo dressing. Keep those additions outside the
reserved forecourt and both deck lanes. This bounded foundation review does not
approve the whole harbour or whole patch for publication.

### Harbour boat and wayfinding source review

Inspected the existing approved native boat's `left` animation in the actual
arrival fixture. At222,400 it sat about1.4 tiles away from the quay, reading as
offshore. The implemented move to221,400 leaves a small water gap and makes it
read as moored beside the terminal without covering the deck. Independently
reran composed village access after this move: 3/3 pass, including quay return,
rail/ocean rejection and the unchanged ferry forecourt.

The original proposed Signs.png crop32,16/16x32 is a complete LEFT arrow, which
points away from the ferry when placed at202,396. My initial replacement advice
of48,16 was incorrect: that crop contains two rectangular boards. On rechecking
separate enlarged native crops, the correct complete RIGHT arrow is16,16/16x32.
The importer has now been corrected to that source. This preserves source art
without a flip, recolour or fabricated ferry pictogram. Final corrected in-scene
capture review follows separately; the arrow alone is not an explicit Ferry
label or proof of interaction discoverability.

Final corrected arrival fixture independently viewed, SHA256
`eb7165a77d538b915902e1eefaf039424401eb2b185f60f3de3e3f7810ea670f`:
the single native arrow now points east toward the ferry/quay, its full post and
shadow are intact, and the boat has the intended small separation from the tip.
Bounded crop/placement approval is granted for the corrected sign and this boat
composition. No remaining blocker in this slice; no asset flags changed here.
Lighting, explicit service identification and live ferry use remain open.

### Saved-map composition/export design constraints

Reviewed the existing archipelago composer, village producers and MapDocumentV3
content surfaces before the new offline exporter is implemented. A pure,
conflict-reporting composition is the appropriate installation seam; fixture-only
scenery producers are not evidence that the saved client/server map contains
the village. Candidate export remains separate from content activation.

Required invariants for implementation review:

- Idempotent exact authored rows may be reused, using canonical structural
  equality. A matching `hearth-*` prefix must never excuse modified content.
  Duplicate IDs and incompatible cells/prefabs/objects are explicit conflicts.
- Generate the expected village from canonical intended terrain. Do not let
  unrelated saved paving silently redistribute deterministic scenery and then
  treat the changed output as the reviewed village.
- Spatial guards include transformed prefab physical and visual bounds,
  pivots/rotation/flip/scale and objects anchored outside the island whose
  overhang enters it. Unresolved prefabs fail closed. Include landmarks,
  legacy scenery, anchors and disabled rows in a stated conflict policy.
- Check transition/stair conflicts, not merely identical transition JSON.
  The existing archipelago composer appends nonidentical transitions; an
  incompatible existing transition at the same affected edge must not survive
  unnoticed beside the new slope.
- Validate input before lossy normalization; preserve original unrelated rows,
  layers, suppressions, provenance and identity. A map revision change must
  reflect an actual composition change, and a second composition must produce
  no new mutation. Keep the original-island compatibility proof intact.
- Asset IDs/names, actual state/animation, dimensions and anchors must all
  resolve against one recorded generated registry and source set. Missing or
  unreviewed art must appear explicitly in the report; an offline candidate is
  not deployment authorization.
- Record input-byte hash, registry/source hashes, affected bounds and counts.
  Preserve the input and stage output writes; a failed run must not leave a
  previous candidate looking like a successful new result. Conflicts produce
  no newly usable candidate.

These are design requirements and concrete existing integration risks, not
approval of an implementation not yet reviewed. No deployment or live-map
installation is authorized by this bounded review.

### Pure saved-map composer first implementation review

Reviewed `hearth-map-composition.ts` and independently ran its three tests: all
pass. Canonical owned-row matching, disabled/foreign object envelopes,
canonical-terrain scenery generation, unchanged-baseline landmark admission and
null candidate on recorded conflicts follow the reviewed design. Also exercised
actual serializeMapDocumentV3/parse/recompose: unchanged revision and no conflicts.
Two concrete gaps remain, reproduced in `/tmp/astra-composition.ts`:

1. An extra saved override at220,400 `{surface:'stone',biome:'paving'}` is absent
   from the authored contribution and silently survives with no conflict. This
   creates walkable land beyond the reviewed quay. Reject extra saved overrides
   within the new island bounds, or require an explicit reviewed compatibility
   policy; checking only keys also present in contribution.cells is insufficient.
2. An authored transition with identical values but reversed JSON key order is
   accepted by the new canonical comparison, then duplicated by the underlying
   archipelago composer's JSON.stringify deduplication. Output has13 transitions
   instead of12 with no conflict. Use consistent canonical semantic comparison
   when merging transitions and test reordered keys.

CLI raw validation, asset/frame verification and staged export remain outside
this implemented pure slice. No live candidate/export readiness claimed.

### Pure composer two-finding closure

Reread the saved extra-cell check and fixed-order semantic transition key.
Reran both independent reproductions:220,400 now returns
`cell:unreviewed:220,400` with no candidate; a reversed-key transition leaves
exactly12 transitions with no duplicate. Normal JSON and canonical serializer
roundtrips still preserve revision and return no conflicts. The updated composer
suite independently passes4/4. Both reported findings are closed within this
pure-composition slice. CLI raw-input/output safeguards and a general legacy
landmark visual resolver remain pending; no live export or installation approval.

### Offline exporter first implementation review

Reviewed `export-hearth-map.ts`. Fresh-directory creation occurs only after
composition/validation; existing directories are not overwritten. Exclusive
files, COMPLETE written last and removal of a newly created incomplete output
are appropriate local artifact safeguards. Source-revision hashing uses the
shared atlas-builder function; manifest retains source/registry/compiler hashes
and publishReady:false. No network or deployment path is introduced.

Independent exporter suite currently passes3/4. The unknown-input-field test
fails: export succeeds instead of rejecting. MapDocumentV3 parsing preserves
unknown root fields through spreading, so raw-versus-parsed canonical equality
cannot enforce the test's claimed known-schema requirement. Either explicitly
reject unsupported root fields as intended, or document and test lossless
preservation; the present implementation and stated test gate disagree.

Two additional referenced-art validation gaps remain. Animated placement checks
only visual.frameIndex, while the renderer plays all frames; validate every
frame's dimensions and availability. Legacy scenery rows resolve an asset for
spatial bounds but never validate their selected state/default visual. Add
regressions for a malformed later animation frame and a missing legacy scenery
state. CLI slice review remains open pending these corrections and passing
checks. This review does not establish live-map provenance or release readiness.

### Offline exporter validation closure

Reread explicit current-V3 root-field whitelist, shared validateExportVisual and
legacy scenery call site. The whitelist now rejects the unknown-root regression;
animated placements validate every played frame; legacy scenery validates its
requested state or explicit base default. Independently reran all6 exporter
tests:6/6 pass, including real output creation/input preservation, existing
output protection, unknown fields, stale registry, terrain conflict, later
animation-frame mismatch and legacy state rejection across those six cases.
Exact used asset-file hashes are recorded and compared against the initially
loaded source objects before output creation, rejecting changed source content.

The reported exporter findings are closed. This approves the bounded local
candidate-export workflow, not deployment, live input provenance, atlas-pixel
acceptance or whole-patch completion. General edited-landmark visual admission
remains conservatively gated; publishReady:false remains required.

### Seventeen village draft assets: bounded native-source approval

Personally inspected all14 underlying native PNG files/sheets for the17 assets
listed as unapproved in map-candidate-fixture-v1/manifest.json, together with
willowharbour-buildings.png and the current willowharbour-town.png. No native
source-art blocker remains for the following exact selections:

- building_cf_hearth_inn: House_5_Wood_Base_Red,192x128, anchor88,111.
- building_cf_hearth_general_store: House_2_Wood_Base_Red,144x128, anchor40,111.
- building_cf_hearth_carpenter: House_3_Wood_Base_Blue,144x128, anchor88,111.
- building_cf_hearth_furnisher: House_4_Limestone_Base_Red,112x96, anchor40,79.
- building_cf_hearth_smith: Blacksmith_House_Black,160x128, anchor40,111.
- building_cf_hearth_guild: House_3_Limestone_Base_Blue,144x128, anchor88,111.
- building_cf_hearth_garden_cottage: House_1_Wood_Base_Red,96x128, anchor40,111.
- building_cf_hearth_orchard_cottage: House_4_Wood_Green_Blue,112x96, anchor40,79.
- building_cf_hearth_barn: Barn_Base_Black,128x144, anchor64,127.
- building_cf_hearth_greenhouse: GreenHouse_Green first complete96x128 variant,
  anchor48,111. Other sheet sections are alternate/component views and are
  correctly excluded.
- prop_cf_hearth_stall_red/blue/gold: Market_Stalls48x48 crops at0,0/96,0/144,0.
- prop_cf_hearth_bench: Benches32x32 crop32,0, complete wooden seat/back/legs.
- prop_cf_hearth_fountain: Fountain_Anim eight consecutive32x48 native frames,
  intact water jets and basin, authored8fps.
- prop_cf_hearth_hedge_horizontal/vertical: Hedge_Tiles16x16 at32,0/0,16.

The full facades preserve roof/chimney/door/window silhouettes, and the imported
square props read coherently at native scene scale. These are existing native
variants, with no invented recolours, rotations or stretching. Source-art
approval covers these exact crops and anchors; the parent is independently
checking pixel fidelity and import reproducibility before changing flags.

This resolves old draft-art status, not whole-village acceptance. The early
buildings-only capture is historical composition evidence; the current village
still needs remaining working-yard/crop details, service identification and
lighting, followed by live journeys. No asset flags changed by this reviewer,
and no publication approval is implied.

### Modified legacy landmark bounds resolver design review

The proposed optional visual resolver is a suitable way to admit independently
edited simple native landmarks without weakening the existing conservative
fallback. Reviewed actual POI drawing and mapLandmarkCollisionObstacle contracts.
Use runtime origin((tileX+.5)*16,(tileY+1)*16), native rectangle relative to its
anchor, then flip/quarter-turn/scale in the renderer's order. Transform every
rectangle corner and union with actual authoritative collision bounds converted
from fixed units. Call collision with enabled:true for disabled saved rows;
otherwise that helper intentionally returns null. Tent/pond depth-Y corrections
are ordering values and must not move the visual rectangle.

The shared catalogue must match the executed renderer branch. Flowers may select
nature variants and sway, potted flowers use sway, campfire uses burn/off, while
fences/gates, crops, trees, wildlife, fixed fishing line and pond shimmer have
special rendering paths. Unsupported/multipart branches must remain explicit
unresolved conflicts until represented, including all relevant frames/variants;
never substitute empty or missing-item bounds as a proof of nonoverlap.

Recommended boundary regressions: rotated/flipped/scale2 disabled house anchored
outside the island with roof-only overlap; authoritative collision-only overlap;
known simple sprite safely outside all island bounds; unsupported special type
rejected. Implementation and live-map admission are not yet reviewed.

### Common landmark resolver implementation review

Reviewed shared33-kind catalogue, actual editor/game loader routing and
legacyLandmarkBounds. Exact sprite-origin transformation and enabled collision
union match the runtime contracts; unsupported special kinds remain explicit.
Independently ran resolver/composer suites:8/8 pass.

One concrete boundary blocker remains. The new bounds are continuous tile-edge
coordinates, but composer intersection still compares left<=maxX and top<=maxY
as though all bounds were integer cell indices. Protected column223 occupies
[223,224), so an envelope beginning223.5625 overlaps it despite left>223.
Reproduced with the actual16x16/anchor8,15 pink-flower asset: a disabled landmark
at224,400 rotated3 has this overlap yet produces conflicts:[]. Use continuous
intersection against maxX+1/maxY+1, keeping integer-cell membership semantics
separate, and cover fractional eastern and southern edge cases. Reproduction is
appended to /tmp/astra-composition.ts. Resolver admission remains open until
this edge gap is corrected; no live-map or publication acceptance claimed.

### Common landmark continuous-boundary closure

Verified separate half-open continuous rectangle intersection against
maxX+1/maxY+1 for landmark/object/scenery envelopes, with integer-cell membership
unchanged. The independent native pink-flower reproduction now returns
landmark:area:edge-flower. Reran resolver, composer and exporter suites together:
16/16 pass, including east/south fractional overlap and moved disabled scaled
farmhouse export/source-hash coverage. The reported boundary blocker is closed.
Approval remains bounded to common supported landmark admission in the offline
candidate workflow. Unsupported special renderers, live saved-map survey and
publication readiness remain separate gates.

### Farmyard bed and hay-pen layout design review

The proposed crop area136..148/434..439 with central aisle142..143, and hay
pen121..127/442..451 east of the barn, are plausible village-scale additions.
Connect the central aisle north to public path row430, and connect the pen's
east opening through128..129 to path130..131. Preserve an east/south route around
the greenhouse to its south-facing door142,454; the crop aisle cannot continue
through the north wall. Reserve random-tree clearance over these areas and
approach margins. Check fence121 against actual barn eave pixels in the capture.

Concrete implementation hazard: current generic scenery classification makes
all non-flower/non-deck props solid. Native crop sprites must be explicitly
nonblocking for these beds, or the dense rows become an impassable hedge. Keep
hay stacks off the two-tile opening and preserve a continuous clear route inside
the pen. Native fence connectivity/selected crop stages and the populated scene
need subsequent visual review. Static crops and an empty hay pen establish
scenery only; working-farm/livestock interactions remain acknowledged follow-up.

### Static farmyard foundation visual/access closure

Inspected willowharbour-farmyard.png, SHA256
907ae631faedb86a28b307626c152f3f74f9f36fbf09d5c9c0c4daabb896af60,
and the native Fence_Big, Hay_Bales and Crops sheets. No visual blocker in this
bounded foundation: the western fence stays clear of the barn eave, the eastern
two-tile opening meets its paved connection, and hay leaves usable interior
circulation. Carrot/wheat rows and their central path read coherently with the
greenhouse. Mature native crop art is complete; crop scenery is explicitly
nonblocking. Tree reservations preserve the farm approaches.

Independently reran final composed access suite:4/4 pass, including bed aisles,
pen, barn and greenhouse approaches and fence rejection. An earlier concurrent
run had loaded pre-correction sprite-anchor targets and failed at the barn;
verified the final helper centres the actual physical foot box for farm routes,
matching the existing bridge convention. No implementation geometry change was
needed for that test-coordinate issue.

Static farmyard foundation approved within scope. This is not proof of harvest,
planting, livestock, barn/greenhouse interior access or a live working farm.
Those acknowledged functional follow-ups and final village lighting/journeys
remain open; no publication approval.

### Public service thresholds and private-door distinction design

Inspected native Doors.png and enlarged Signs.png. The door sheet offers closed
variants, not matching open versions for the mixed arched village facades; retain
those intact facades. Generic boards/arrows/scribbles do not identify particular
services, so do not treat a repeated sign crop as six service pictograms.

Recommended one consistent public threshold: the existing approved rustic
runner prop_cf_furniture_rustic_runner,32x18/anchor16,17, at each of the six
service door axes, ground phase and nonblocking. Use a shallow three-tile-wide
paved apron to contain its even-width native art/fringe beside the existing
narrow path. Keep all four private/agricultural thresholds bare, with their
existing garden/farm context. Large48x48 room rugs would dominate these small
frontages and are not recommended. Preserve actual door interaction positions
and existing flower pairs. Parent is implementing a3x2 apron/runner study;
final in-scene alignment remains to be reviewed.

Role identification should use distinct native frontage clusters: inn dining
terrace/barrel; general-store apple barrel/chest; carpenter bench/log yard;
furnisher table/chair/lamp display; smith anvil/forge-side apron; guild a compact
book display beside the frontage. Several already exist; the shared threshold
signals public entry while role props supply context. Bare private doors plus
runner-marked public entrances need a subsequent user-facing recognition check;
this design proposal alone is not discoverability or whole-village approval.

### Six-service frontage implementation review

Viewed the complete service-frontages capture, including smith and four bare
private/agricultural doorways. The six identical native runners align with door
axes and fit the shallow paved aprons; ground/nonblocking classification is
correct. Existing flower pairs remain visible. Guild bookshelf, inn barrel and
furnisher lamp/display form coherent frontage details. Independently ran village
contracts and composed access:10/10 pass. These static cues distinguish public
thresholds; full service recognition remains a user-facing/live acceptance task.

Found a source-semantic mistake in the proposed store stock prop:
prop_cf_barrel_apples is a leafy green planter in the native barrels.png bottom
row, not apples. Verified on the enlarged full source sheet. Parent replaced
only the new195,403 placement with an existing closed chest and removed that
misnamed asset from the added scenery catalogue; legacy art is untouched.
Final replacement capture review follows. No new native source import or
whole-village lighting/interaction approval is implied.

Final replacement capture viewed, SHA256
0b6481867c8022ae65889911e4ca5d83fdc53f3fd47a332a9df06cbb3ab4cd27.
The store now has an unobtrusive stock chest on its side apron; no leafy planter
is misrepresented as produce. Runner/public-versus-private frontage treatment
and these bounded native prop placements are approved. No remaining visual
blocker in this slice; service discoverability, exterior lighting and live
entry/journeys remain separate acceptance work.

### Authored outdoor scenery emitter design review

The collector should share actual loaded asset/visual and transformed placement
origin with enqueueLiveMapObjects, with an explicit asset/visual-to-content-light
mapping. Match Canvas offset order: placement flip, placement rotation, object
flip/scale, object rotation. Use stable object+placement identity for flame phase;
never array position. Off/unlit visuals must not emit. A permanently lit immutable
map fixture needs an explicit convention rather than blindly enabling arbitrary
light definitions. Reject disabled rows, unresolved assets/frames and retired or
disabled content; avoid cached ghost lights after a map/content replacement.

Found an integration hazard before implementation: projectedLight currently
samples terrain using light.worldX plus contactY. A quarter-turned torch moves
its flame offset horizontally, so this samples the flame's column instead of
the parent's physical contact. Preserve contactX and contactY, and allow terrain
projection to sample that exact point independently of emitted position. Test
q1/q3 and scale2 beside a plane boundary. Keep content radius in world tiles
unless a separate scaling rule is intended; visibility should include the light
influence radius, not merely the sprite viewport.

Native service/harbour torch placement and Basic/Dynamic appearance remain to
be inspected after implementation. No fixed-coordinate emission or new schema
is required by this design, and no release approval is implied.

### Authored map emitter/projection implementation review

Reviewed liveMapObjectPointLights, explicit native visual/content binding and
shared projectPointLightToTerrain plus actual topside decorations call site.
Current source offset is vertical, so placement flip correctly has no effect
before placement rotation; subsequent parent mirror/scale/rotation matches the
Canvas draw order. Transformed placement origin, emitted position and physical
contactX/Y remain separate. Projection now samples both contact coordinates,
closing the earlier rotated-source plane hazard. Radius remains content-authored
and flicker identity is stable across object reorder.

Collector skips disabled/unresolved/unloaded/off visuals and retired, mismatched
or disabled light content. Static allowlisted fixtures resolve the intentional
lit state; no map switch interaction is claimed. Actual producer limits this
path to active topside, respects hidden-debug state, and culls using each light's
influence radius. Independently ran collector/projection and existing actual
furniture producer suites:5/5 pass. No concrete code blocker found in this slice.

Recommended next evidence is an actual decorations-producer case for a map
light outside sprite viewport but within influence range, and no leakage into
interiors. Existing pure collector tests do not establish those integration
branches end-to-end. Outdoor torch placements and Basic/Dynamic visual
contribution remain pending; no lighting-scene or publication approval yet.

### Outdoor torch coordinate design review

The small native standing-torch set is compatible with the existing village art
and explicit map-emitter path. Two proposed coordinates need adjustment before
scene acceptance. Torch211,397 lies outside the reserved ferry rectangle by tile
index, but the real raised player foot box at corridor anchor211,398 extends
into397; move it to211,396 to retain physical clearance. Store torch194,404 sits
on the north lane of the three-row public paving404..406;194,407 is a clearer
side-of-path position. The201,399 harbour torch remains outside the western
edge, subject to composed body tests.

Other service offsets168,392 /152,407 /167,424 /190,427 /182,384, bridge bank
positions129,377 and151,377, farm132,449 and junction154,407 are plausible
provisional placements. Actual scene and collision checks must verify them;
nighttime coverage cannot be inferred from counts or an unlit capture. This is
coordinate/design advice only, not Basic/Dynamic lighting acceptance.

### Outdoor placement and first controlled lighting study review

Viewed the refreshed full unlit village and harbour Basic/Dynamic studies from
04:16. Adjusted harbour211,396/store194,407 placements are visually clear of
traffic; the native torch set is coherent with current scenery. The fixture
correctly labels controlled ambient, zero celestial intensity, flat Willow only,
map-object/NPC receivers and collision occlusion. It is not a real night-cycle
or full renderer-acceptance study.

Lighting approval remains open. The Dynamic image shows small flame halos but
little convincing path illumination. Concrete contract mismatch: standing_torch
content declares collision.occludesLight:false, while its new map prefab's full
solid cell is supplied to createLightOcclusionMap as a soft obstacle. The source
offset is-6px, inside that same cell, so the rasterized LIGHT_SOFT_ATTENUATOR can
attenuate its own propagation. Separate light occlusion from movement collision
and respect the reviewed emitter's non-occluding declaration; preserve ordinary
blockers. Do not mask the issue by increasing intensity.

Require a real receiver RGB/luma sample beside/south of the source plus matched
Dynamic lights-on/off capture with identical ambient/occlusion/receivers. The
flame's visible native height versus existing global offset can be reviewed
separately if necessary; do not silently change global torch placement economics
or art alignment as part of diagnosing this map-specific occlusion mismatch.
Emitter count13 and unlit placement alone are not outdoor lighting acceptance.

Scope correction from the parent's production-path inspection: the actual
outdoor createLightOcclusionMap call currently receives no map soft obstacles;
only the new offline fixture injected movement obstacles. Thus self-attenuation
is a fixture-parity defect, not a demonstrated live collector defect. Align the
fixture with production and explicitly retain map-occlusion acceptance as open.
The parent also found that live-map ground sprites omit groundSpriteSource,
explaining the conspicuously bright Dynamic quay deck. That production receiver
hook now requires a separate transform-aware fix/review. Neither correction is
covered by earlier emitter-collector approval.

### Affine ground-sprite lighting design review

Reviewed existing groundSpriteSource, WorldLightingRenderer.groundSource and
WebGL ground UV submission. Optional native-pixel-to-logical-world basis is the
appropriate extension; retain identity defaults for all existing callers. Native
source origin must be contact+B*(-anchor), with B containing both placement and
object transforms/object scale but excluding camera zoom. CPU multiplication
samples the field through the inverse basis. Preserve texture sampling/native
pixels and existing final draw transforms. Guard invalid/singular bases and
restore reused scratch-canvas transforms before source draw and destination-in,
including an identity draw immediately after a rotated one.

Current WebGL ground UV rectangle has only four axis-aligned values and cannot
represent rotated/reflected field coordinates. Bounded safe choices are four
independent UV corners computed from origin+B*(u,v), with geometry tests, or an
explicit nonidentity-affine guard even for allowUnverifiedLighting:true. Keep the
existing production unverified-ground guard and avoid a silent CPU-baked GPU
fallback. Test actual nonuniform field sampling under q1/q3/flip/scale2, source
alpha preservation and actual map producer identity sampling. This is design
review only; no transformed-ground or lighting-scene acceptance yet.

### Affine ground sampling implementation closure

Reviewed actual map source basis/top-left generation, CPU inverse-plane
multiplication under saved/restored scratch transform and GPU independent UV
corners. TL/TR/BL/BR coordinates map correctly to actual six vertices
[0,1,2,2,1,3]; existing production unverified-ground guards remain intact.
Identity defaults and original texture draw transforms are preserved.

Independently passed11 focused map source/depth, GPU UV and world-pass lifetime
tests. Also reran the real browser ground-light-check into
/tmp/astra-ground-light-check.png:987 RGB checks pass, with transparent mask,
q1/q3/reflection/scale2, identical identity-after-transform and invalid-basis
rejection. Pixel image SHA256
6269e1ffa9f4ea83a240a1df3379d0bddb61b3dcb4d942cac02bb8b077bbf4d8.
The synthetic field isolates sampling and does not replace live lighting proof.

Viewed willowharbour-harbour-ground-lit.png: quay deck now receives ambient
lighting rather than remaining conspicuously bright, and the nearby paved path
shows warm torch contribution. No remaining blocker in this affine ground-source
slice. Global GPU accuracy, full outdoor occlusion, torch native flame offset
and real night-cycle/village acceptance remain separate open work.

### Standing torch native emitter alignment closure

Independently inspected the original Torch_Anim.png and imported eight burn
frames, native anchor [8,31], item icon binding and generic/lobby draw callers.
Standing torches retain native scale 1 and draw at the same (tileY+1)*16 baseline
used by placeablePointLight. Offset -15 therefore resolves to native pixel
(8,16), on the stable warm flame in all eight frames: yellow in seven and
orange in frame 4. The previous authored -6 resolved onto the gray post; the
fallback -20 resolved nearer the varying flame tip. Matching both paths to -15
is sound; no horizontal offset or schema change is needed.

Independently reran standing-torch-native-light, light-sources and live-map-lights:
11/11 tests pass. The new regression covers all frames, authored/fallback and
lobby world-position parity, and authored unlit suppression. Viewed both refreshed
controlled native captures: the visible glow centers on each flame in the
harbour and lobby, with no remaining alignment blocker in this slice.
Willow image SHA256 aaaa7b382827c97b3368f5f3f2fed463d9391e3e49d9b6e8028d9f475020f18b;
lobby 48f7526778738b3267ce42bb4fceef1ca65cbc0947f92e2ae4d1e53593412cdd.
This closes the native emitter-offset finding only. Outdoor occlusion/shadow
correctness, live day/night journeys and whole-patch publication remain open.

### Authored map-object occlusion design constraints

The proposed collector fills a real omission: production currently combines
legacy/player elevated sprites and resource trees, while authored village trees
and facades have no equivalent native receivers/casters. Reusing native alpha
and the existing column/silhouette machinery is appropriate, subject to these
integration constraints (design review, not implementation approval):

- Preserve the exact draw transform and anchor, including placement and object
  flip/quarter-turn/scale order. Transform the alpha into world-pixel bounds with
  conservative floor/ceil extents and inverse nearest-neighbour sampling; omit
  baked shadows just as the visible source does. Reject nonfinite/singular or
  excessive allocations. Cache transformed native masks independently of world
  position; hundreds of trees must not repeatedly rasterize identical artwork.
- Sample terrain elevation and projection at each placement's physical foot,
  then project mask and collision contact exactly once. Set the receiver and
  caster elevation consistently. Do not sample the top of a tall facade or its
  shifted alpha origin to choose its terrain plane. Verify against the actual
  gameplay painter on raised terrain, not only flat Willow.
- Existing createLightOcclusionMap sorts only footY, then rasterization assigns
  owner=index+1. Equal-depth map receivers need the same tie ordering as visible
  map art; otherwise the occlusion owner can disagree with the visible winner.
  Preserve the one-owner relationship between a tree trunk and its canopy.
- Compound prefabs require an explicit base/receiver partition or grouped-caster
  policy. Duplicating every prefab collision cell for each sprite gives several
  owners the same base; collapsing sparse collision to one rectangle fills real
  gaps. This must not be hidden behind the single-sprite village happy path.
- Current collisionKey excludes map asset readiness. A collector called while
  loadedAsset is null must be rebuilt when assets load or atlas/source identity
  changes, even if map, content and resource revisions remain unchanged. Keep
  such invalidation bounded and ensure obsolete asynchronous loads cannot
  reinstall stale masks.
- Skip disabled/ground/missing art and actual nonoccluding emitter bindings;
  retain that exact content binding check rather than suppressing anything with
  a torch-like name. Static animation frame selection is a limitation for moving
  silhouettes (notably the fountain); choose an explicit policy and test it.
  Do not viewport-cull by anchor alone: offscreen canopies and casters can still
  cover or shadow visible pixels.

Required focused evidence: transformed asymmetric native mask and fractional
scale extents; raised-plane separation; overlapping equal-foot owners; multipart
base behavior; initial-unloaded to loaded invalidation; emitted torch unchanged;
and production/offline occlusion parity plus a lights-on/off or caster-on/off
native village comparison. Full shadows and release acceptance remain open.

### Pure transformed native-mask helper review

Reviewed transformed-light-sprite.ts and independently reran its three tests:
3/3 pass. The inverse basis and anchor-relative source lookup are correct for
quarter-turns, reflection and scale 1/2. Also checked negative world contact
(-20,-30) with source anchor-relative origin (-2,-3): horizontal reflection
produces bounds [-22,-33,4,3] and the expected reversed bitmap. Integer extents
use floor/ceil; nonidentity allocations are checked before construction and
capped at 4,194,304 cells. Identity shares immutable source alpha and preserves
fractional origins. No blocker found in this bounded helper.

Evidence is narrower than complete affine/native-browser parity: current
fractional-origin test is identity only, and transformed cases sample one point
per native pixel plus total occupancy. Nonidentity fractional origins and
fractional/downscaled geometry need explicit expected-bitmaps or actual browser
comparisons if supported by the integrated map path. The identity fast path
assumes already-valid native mask dimensions/buffer. Collector ownership,
compound prefabs, readiness invalidation and world lighting remain unimplemented
in this helper slice and are not approved by these tests.

### Map asset readiness revision foundation

Reviewed liveMapObjectAssetReadinessRevision and its actual loader test; the
focused test passes independently. The counter advances only after successful
assets.set, once per deduplicated asset load, and remains unchanged during
pending work, repeated requests and rejected loads. This is a sound bounded
first-availability signal. No collision refresh is wired yet, appropriately.

Inherited limitation: pendingAssets retains the caught, settled promise after a
failure, so subsequent preload/lazy calls cannot retry that asset until module
reload. The test does not cover failure followed by recovery. Record this as
terminal-per-session behavior or implement bounded retry before claiming robust
readiness recovery. The name-keyed cache/counter also does not detect replacement
of an already-loaded atlas; first availability and hot source invalidation are
different contracts. These limitations do not invalidate the new success-only
counter but remain relevant to the forthcoming collector integration.

### Painter-order shadow ownership foundation

Reviewed optional painterOrder sorting and migrated client descriptors against
actual gameplay enqueue and decoration/resource/placeable producers. Projection,
terrain sort offset, elevation epsilon, entity phase, legacy/authored landmark
ties and special POI visual-depth offsets match the ordinary migrated paths.
Physical shadow feet remain separate from visible painter depth. Mixed fallback
uses a total comparator rather than pair-dependent ordering. No runtime import
cycle was found through renderer/painter-depth/world-pass modules; browser canvas
allocation is instance-time, not triggered merely by importing the comparator.

Independently ran light-painter-ownership and light-occlusion: 14/14 tests pass.
No new blocker found for this ownership foundation. The new higher-plane case
proves descriptor sorting only: its caster elevationLayer remains undefined, so
it is not evidence of cross-plane raster isolation. Native grouped furniture
and occupied seating still use different actual contact/group ownership from
the generic placeable collector and remain outside this closure. Authored-map
collector integration, readiness recovery and native shadow captures remain open.

### Concrete per-placement map caster contact policy

Source trace narrows the problem: local silhouette rasterization returns after
native alpha, without using obstacle; directional projection likewise uses the
native silhouette instead of footprint. celestialCastersFromOcclusion uses
obstacle X only and replaces Y with [-2,1]. receiver-coverage then turns that
footprint into a soft elliptical contact patch. Thus the current renderer cannot
represent arbitrary disjoint exact contact geometry as one footprint, and a
whole-prefab bounding rectangle is unnecessary for silhouette shadows.

Recommended bounded policy: expand transformed mapObjectCollisionCells once per
object into exact occupied 4px subrectangles. Assign each bit to at most one
eligible non-ground placement at the relevant physical plane, using proximity
to its physical foot with the actual painter tie as deterministic tie-breaker;
restrict candidates to overlapping transformed native horizontal extent. For a
silhouette, merge only adjacent assigned bits on the same row and select the
contiguous run closest to that placement foot (then closest horizontal midpoint).
Use that run as a conservative contact patch; do not merge disjoint runs across
gaps. Preserve the complete alpha for local and directional shadowing. A
placement without an assigned run retains its silhouette with explicit disabled
contact, requiring a small contact-enabled option through the celestial bridge.
This is deliberately an approximate contact patch within real occupied geometry,
not a claim to reproduce arbitrary multipart contact unions.

Current village facades have one facade placement and contiguous rectangular
full-cell foundations, so their frontmost nearby run gives the actual contiguous
base width without copying it among different visuals. Current authored trees
have one placement with mask 0x0660: four middle 4px bits form exactly an 8x8
column base at tile offsets [4,12) on both axes. Preserve that rectangle for
column shadows and the same owner's complete canopy receiver. For a compound
tree whose assigned bits do not form a filled rectangle, retain its native
silhouette mode rather than filling holes with a rectangle or duplicating base
bits among owners. A future exact disjoint-column/contact feature would require
explicit multi-rectangle support in rasterization/contact coverage; it should
not be implied by the current single-obstacle interface.

Test distinct separated sprites in one prefab, a deliberate empty gap, competing
placements sharing a candidate cell, a canopy overhang with narrow trunk, and a
facade's contiguous front run. Verify the contact gap separately from alpha
shadow gaps: the existing soft elliptical contact filter already adds a small
fringe and is not a pixel-exact movement-collision mask.

### Contact allocation and transformed-mask cache closure

Reviewed current map-shadow-contacts and TransformedLightSpriteCache; independently
ran contact, transform and cache suites: 9/9 pass. Exact subcell deduplication,
unique nearest compatible placement ownership, contiguous-run selection and the
filled-rectangle area proof preserve the intended gaps. Current extrema use a
loop; an additional 256x256 full-cell input completed without argument-spread
failure. This is a correctness smoke check, not a renderer performance budget.

Cache identity includes alpha buffer, native anchor-relative bounds and basis;
integer world translations reuse transformed pixels while current plane metadata
is reapplied. Fractional contacts use the original sampler, identity shares the
source buffer, LRU evicts under the stated alpha-byte budget and oversized entries
are not retained. No material blocker found in these pure foundations. The byte
budget counts transformed alpha, not all JavaScript entry overhead.

Collector must pass validated unique placement IDs and normalize collision and
placement elevations to the same physical terrain-plane convention. Returned
contact rectangles are logical/unprojected; apply projection once alongside the
receiver. Missing ownership means no contact patch, not omitted native shadow.
Compound rendering, owner assignment, async readiness and native shadow/lighting
acceptance remain outside this closure.

### First authored-map shadow collector integration review

Reviewed collector, animation frame key, createFrameLightOccluder, contact flag
and production retained-base/render-time composition. Independently ran four
focused files (collector/ownership/contacts/cache): 11/11 pass. Mask and contact
projection are applied once; physical receiver/caster plane is consistent in the
code. Visible map animation and shadow frame selection share weatherVisualTick
multiplied by AUTHORITY_TICK_MS. Base occlusion remains separately retained,
with composed occlusion and celestial key replaced when readiness/frame changes.

Concrete open issue: the collector and frame key skip an emitter solely from
MAP_LIGHT_VISUALS asset/name matching. They do not receive the active registry
or check the current bound object's sprite/collision policy. A retired, removed,
rebound or newly occluding definition can stop/change emission while leaving its
visible body permanently shadowless. Require the same current binding checks
as emission and honor resolved occludesLight=false; add content-change cases.

The current collector test mocks both terrain projection and native alpha. It
cannot establish actual raised-map painter/mask alignment or combined native
placement/object transform parity. Those need a real shared-painter comparison.
Animated fountain frame changes currently rebuild all static contacts/receivers
and sort the entire cohort at its animation cadence, including offscreen cases.
Measure full-village cost and rebuild counts; transformed alpha caching alone
does not eliminate this traversal/allocation or celestial refresh work. Native
visual, occlusion and performance acceptance remain pending.

### Current emitter-binding shadow exclusion closure

Verified boundMapLightDefinition is shared by emission, shadow collection and
frame-key selection. It requires the allowlisted visual, current nonretired
object/light component, exact sprite asset and compatible authored default
visual. Shadow exclusion now additionally requires explicit occludesLight=false.
Removed, retired, rebound or newly occluding lamp definitions therefore retain
their visible native caster rather than being suppressed by name alone.
Independently reran live-map-shadows and live-map-lights: the focused suites pass.
The exact content-binding blocker is closed. Actual raised painter/native-mask
parity, whole-village rebuild timings and visual shadow acceptance remain open.

### Retained authored caster review and limited native capture

Per-object retention is sound under the existing immutable document/object and
registry contract. Terrain identity/version, registry identity and successful
asset-readiness revision invalidate the cohort; selected frame changes rebuild
only the relevant object. Independently reran the four collector tests,
including explicit clear/rebuild identity: 4/4 pass. clearLiveMapShadowCaches
releases both transformed alpha and the document-keyed retained cohorts, and
production releaseDynamicLighting invokes it alongside native-mask reset and
base/composed/celestial release.

Decoded baseline and retained PNGs independently: zero differences across
6,193,152 RGBA channels. Latest provenance measures all 590 objects / 542 casters
/ 285 columns, with 3 or 15 recreated casters after the initial zero-change
sample, mean 0.317ms and maximum 0.7ms over 24 local warm collections. This
supports the intended retention improvement, not whole-frame/device performance.

Viewed the native image: it is a harbour viewport while collection spans the
village. The visible tree lies outside both torches' useful influence and almost
all facade art is offscreen. Therefore this capture cannot establish tree/facade
shadow readability. A controlled nearby torch and caster-on/off comparison for
one tree and one facade remain needed, alongside raised-plane parity and full
GPU/iPad/live acceptance. No retention blocker found; visual shadow closure is
still pending.

### Controlled local tree/facade probe review

Viewed both original on/off probe pairs. Their southwest point source had
receiverDirectionWorldY fixed to the target foot instead of the synthetic source
position, so the receiver saw a side-oriented source despite the emitter being
12px south. This fixture mistake prevents those pairs from diagnosing a broken
production front-face receiver. The parent corrected the direction, without
changing production lighting.

Viewed refreshed tree-shadow-probe-direction-on/off: the native tree now clearly
receives warm light (redder trunk, warmer canopy). Caster-on removes illumination
behind the tree while retaining its front illumination. This supports bounded
flat local tree-shadow/receiver behavior; it does not prove raised/celestial
or full-device acceptance. All authored casters are toggled, so nearby props
also contribute to the image difference.

Source trace confirms upright WorldLightingRenderer.drawReceiver samples the
south-facing field once at the physical foot and applies that tint through
worldAssetFrameSource/receiverFrameSource. It is not per-pixel facade distance
shading. Final RGB uses the per-channel maximum of diffuse and local lighting,
so weak local contribution may leave an upright sprite apparently ambient.
Recommend recording target south/flat RGB in the probe provenance, and rerunning
the facade pair with corrected source direction before diagnosing or approving
facade receiver behavior. No production receiver blocker demonstrated yet.

### Facade zero-light probe diagnosis: intervening threshold flower

The facade's zero south/flat sample does not establish self-shadowing. Source
geometry identifies a concrete intervening object: the west service flower is
at tile189,402, with native 16x16 sway art anchored [8,15]. Its world bounds are
X3024..3039, Y6433..6448. The synthetic light-to-facade ray from (3000,6444) to
(3064,6432) passes through X3032,Y6438 inside this sprite. Native 4px cells in
that neighbourhood contain enough opaque flower/stem pixels to become a
silhouette blocker. The collector currently includes these baseless decorative
sprites as silhouettes with contact disabled.

Parent's target-facade-only caster removal still yields zero, supporting an
intervening caster rather than facade self-blocking. Inspect the rejected owner
in receiverHasClearLine, then render all-except-west-flower (or a point source
centered on the facade X, 24px south). Do not bypass another owner's blockers to
force the facade bright. A single foot sample uniformly tinting a large facade
can make a small intervening prop darken the whole building; that is a current
receiver-model limitation, distinct from an ownership implementation failure.

The facade's native anchor [40,111] ends on an opaque row111; rows112/113 are
semtransparent baked shadow. Mixed edge texels and fully-opaque relit ownership
are worthwhile isolated regressions, but not the demonstrated cause of this
all-caster probe. Facade visual acceptance remains open pending isolated proof.

### Isolated facade obstruction diagnosis closure

Independently inspected the four control provenance records and viewed
facade-shadow-probe-no-west-flower.png. Both target-facade-only and all-except-
west-flower return south RGB [109,73,39], flat [143,96,51]. All-casters-on and
all-except-target remain zero on both channels. This isolates the west flower
as the cause of the single-foot sample blockage; the facade's own native caster
does not extinguish its receiver in this controlled flat scene. No production
renderer correction is justified by this probe.

The no-west-flower image retains the native facade and unobstructed warm forecourt;
its facade tint remains subtle because local RGB is largely below the controlled
diffuse ambient. This closes the specific suspected facade self-shadowing
failure, not a broad visual approval of single-point lighting on large buildings.
Raised/celestial shadows, device performance and live acceptance remain open.

### Opt-in recipe-knowledge authority design

An optional requiresKnowledge boolean defaulting false is the appropriate narrow
compatibility boundary. Current manual crafting intentionally permits unknown
ordinary recipes. Existing fillCraftingRecipe already requires knowledge, while
actual crafting goes through craftInventoryRecipe and its explicit requested-ID
grid match. Enforce the opt-in requirement once after resolving that actual
recipe and before any inventory/cursor/result mutation, including craftAll.
Use sender-owned player_known_recipe with the canonical bare recipe ID, matching
existing learnRecipes storage; content reference IDs use a separate recipe:
prefix convention.

Carry the flag through strict boolean parsing, content compilation and shared
runtime RecipeBase; otherwise valid-looking content can lose the requirement
before authority/UI use. Preserve omitted/false legacy behavior. Replace the
crafting-schema test's blanket ban on knowledge checks with actual legacy-unknown
success and opted-in-unknown rejection (single/batch, unchanged custody), then
known success, other-player knowledge rejection and retired recipe rejection.

Client currentRecipeLocked already gates result clicks and renders LOCK; add
knowledge there and in its hover explanation, which currently only handles
station and skill. Known-recipe subscription updates must release the lock.
Recipe matching should not let an unknown gated recipe shadow an available
recipe sharing inputs; prefer the selected match and otherwise an available
match, or prove the new catalogue has unique input signatures. Showing a locked
output should explain how to learn it rather than exposing an inert TAKE action.

For the following seal transaction, reject already-known choices before seal
consumption and enforce the chosen allowlist server-side. Audit all recipe paths
to each legendary output so an unflagged alias does not bypass the acquisition
rule. This is design guidance only; knowledge-gated crafting and seal acquisition
are not yet accepted as implemented.

### Opt-in recipe knowledge implementation and UI regression closure

Reviewed strict schema parsing, compiled/shared flag propagation and actual
craftInventoryRecipe sender-owned bare-ID lookup before skill/station checks or
consumption. Unknown opted-in single/batch crafts reject without mutation;
ordinary unknown crafts remain available. UI gates result interaction and gives
LEARN THIS RECIPE FIRST, then unlocks when authoritative known IDs arrive.
Matching retains an explicit selected recipe even when locked, otherwise prefers
available knowledge/station/skill matches before a locked fallback.

Initial independent four-file run exposed two real UI failures: result clicks
cleared the explicit table selection and the bootstrap manual matcher chose a
station-locked furniture recipe ahead of planks. Parent corrected the actual
pointer path to preserve selection on result click and unified active/bootstrap
matching with an availability predicate; fixtures were not weakened. Reread both
corrections and independently reran all four files: 130/130 pass. No remaining
blocker found in this bounded knowledge-gate slice. No authored recipes opt in
yet; seal exchange and actual legendary acquisition remain subsequent work.

### Gear acquisition economy and station design review

Verified actual refined inputs are item:copper_bar (sell130) and item:iron_bar
(sell184), not ingots or metal pieces. Existing furnace processes consume one
ore for one bar with wood/plank fuel and 6000 ticks (five minutes). Workbench is
manually craftable from four planks; furnace from eight stone at a workbench.
Use the supported station.workbench for gear unless another actual station path
is added: native smith showroom anvil/forge art is not itself a runtime station.

Common manual recipes and higher knowledge-gated recipes fit doc60 progression.
Compute costs from actual item values: wood2, stone3, fiber2, ashwood8, basalt8,
cinder ore30, emberglass24. Require raw-material sale opportunity cost above
finished resale, and separately check buy-to-craft-to-sell routes. For example,
common sword resale150 needs more than150 input value; low-looking counts such
as wood24/stone20/fiber16 total only140. Keep individual required stacks within
actual grid/stack limits and exercise quantity-aware fill for the largest recipe.

Current shore packs give only two basalt or two ashwood per clear, with five-
minute quiet respawns. Start uncommon costs around two to four of each needed
shore material (one or two clears each), using fiber/ordinary materials to meet
value floors. Double-digit counts of both materials on every piece would create
substantial repeated-camp grinding before higher tiers. Rare one-bar inputs
already add130/184 value; large bar counts also add five minutes each of furnace
processing. Epic/legendary volcanic inputs should remain distinct sinks rather
than multiplying every ingredient indiscriminately.

Keep utility pendants available through peaceful refined-material recipes,
despite their rare quality: forcing Cinder drops for farming/fishing utility
would unnecessarily combat-gate the cozy branch. Suggested initial plan-price
ranges for testing: uncommon150–250, rare350–500, epic700–1000, utility pendant
300–450 bronze. These are proposals, not demonstrated pacing targets.

Three guardian seals per chosen legendary recipe is deterministic, with no seal
cost on later recrafting. Current Warden 18000-tick respawn implies the third
clear cannot occur before30 minutes after the first, excluding travel/fights and
quiet/sight conditions. Eight combat recipes require24 credited clears and at
least345 minutes of respawn intervals alone. Evaluate first-piece pacing and
state the cost openly; do not imply whole-set pacing has been accepted. Direct
unknown-only transactional unlock avoids duplicate-plan seal waste. Actual
recipes, acquisition/claim routes and live tuning remain pending review.

### Authored 45-gear acquisition catalogue review

Reviewed the deterministic builder, author script, emitted recipe/item/shop/NPC
references and existing learnRecipes authority callback. Independently ran
acquisition, knowledge and actual crafting suites: 10/10 pass. The catalogue has
45 exact output recipes and37 plans: eight optional common shortcuts plus29
required nonlegendary unlock plans. Eight legendary recipes require knowledge,
have no consumable plan route or alternate output recipe, and await seal exchange.

Actual material IDs and workbench requirements resolve. Counts fit the existing
nine-slot and per-material stack limits; raw-material sale opportunity value
exceeds finished resale for every recipe. Uncommon shore counts are two/four,
rare uses one iron bar with two shore materials each, volcanic upper tiers have
distinct sinks, and utility pendants remain peaceful. Smith's40 offers comprise
eight finished common items plus32 plans; Iona's new linked shop offers five
utility plans. No material catalogue blocker found.

The existing learnRecipes handler converts content IDs to bare recipe IDs,
inserts sender-owned knowledge and records the read; the new authored effect
order learns before consuming the selected plan. Current tests prove metadata
and runtime book lookup, not an actual new-plan useSelectedBehaviour callback
journey. Add one such production-path regression covering knowledge and exact
plan consumption. Existing duplicate-read semantics consume a nonlegendary plan
even when it grants zero new recipes; document that behavior and preserve the
proposed unknown-only rejection for the future seal exchange. Live acquisition,
legendary unlock and pacing acceptance remain open.

### Independent lifecycle dispatch audit: no missing plan lane established

Absence from AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS does not make a secondary
plan interaction unavailable. Actual behaviourActionAuthority.handlers calls
currentWorldBehaviourHandlers, which wraps generated registrations through
objectGraphRegistryForContent. That compiles every nonretired item's onUse data
graph unless the exact item/event lane is already owned by generated code.

Executed /tmp/astra-plan-dispatch.ts against the actual registry composer and
raiseEvent. To preserve the pre-change test condition while the parent added a
new lane, explicitly filtered gear-plan generated registrations out of the base.
Both hearth_uncommon_sword_plan.data_graph.read and
furniture_rustic_dining_table_plan.data_graph.read dispatch learnRecipes followed
by consumeSelected1. Therefore neither family was missing server dispatch.
The client selectedItemLifecycleAction also falls back to definition.onUse for
secondary, so these plan prompts/actions are reachable without code metadata.
Only specialized equipment/world/tile/aimed invocation types are code-only.

All ten Hearth sword/bow definitions already have generated weapon lanes: five
sword secondary, ten sword/bow useWith, and five bow aimedUse registrations.
No analogous weapon capability gap was found. A new explicit gear-plan code
lane can be an authoring-policy choice, but should not be described as repairing
absent runtime dispatch. The existing exact-event ownership filter suppresses
the duplicate data callback when such a code lane is present. Production effect
writer consumption/knowledge testing remains valuable; its handler fixture must
include the actual composed registry rather than generated registrations alone.

### New-plan production callback evidence closure

Reviewed hearth-plan-authority.test.ts after removal of the temporary generated
gear-plan lanes. It composes the actual objectGraphRegistryForContent on the
production generated/loot/placeable base, calls actual useSelectedBehaviour,
and extracts/invokes the current production worldBehaviourEffectWriter through
actual applyBehaviourEffects. All37 authored plans grant the matching sender-
owned bare recipe ID before consumption, preserve source/tick metadata, empty
the selected slot and record the expected statistics. A repeat-read case verifies
one knowledge row and a consumed duplicate plan with zero newly learned recipes.

Independently ran this suite plus item-lifecycle-single-owner: 3/3 tests pass.
This closes the requested bounded dispatch/effect-writer evidence gap. Fake DB,
authorization/admission and final inventory/statistic write boundaries are
explicitly substituted; this is not proof of live transaction rollback or a
merchant purchase/reconnect journey. No new blocker found in the tested path.

### Iona utility-plan shop dialogue access closure

Reviewed emitted dialogue and deterministic authoring update. Iona now has a
matching NPC shop link, dialogue shop reference, unconditional greeting choice
to equipment_plans, and a shop-mode frame:shop node with return to the original
greeting. Existing quest requirements/effects, request/reminder/reward nodes,
advice and goodbye routes remain intact; the new choice spends or grants
nothing by itself. The authoring pass replaces only its named node/choice and
preserves the remaining choices, avoiding duplicate additions on rerun.
Independently reran equipment-acquisition: 4/4 pass. No unintended dialogue
semantics found in this bounded access correction. Live merchant traversal and
compact visual acceptance remain separate.

### Guardian-seal chosen recipe exchange design

Three accessible seals for a once-only chosen legendary recipe fits doc60's
deterministic route. The sender-owned known-recipe row is an adequate atomic
dedup record: duplicate/cross-connection execution must find it and reject before
consumption, so no additional receipt table is required for this one-time action.
Use the canonical bare recipe ID and record source/tick consistently.

Server must own the eight-ID allowlist and validate the current nonretired recipe
and output: expected Hearth legendary gear and requiresKnowledge=true. Reject
removed/rebound or no-longer-gated recipes rather than charging for a wrong or
useless unlock. Verify current contentHash and quoted seal count before planning.
Require Iona's admitted live merchant context with actual position/plane/range
and existing living/mount/hands/menu constraints; a remembered NPC ID is not
sufficient admission.

Consume from accessible hotbar/backpack capacities only, using exact split-stack
planning and normal metadata rules. Cursor, crafting/equipment/stash, inaccessible
overflow and pending Expedition Rewards do not count. No inventory mutation
before complete success; preserve unrelated contents. Display that custody rule
explicitly and point unclaimed rewards to collection rather than silently treating
them as payment. Test split3,short2,overflow exclusion,wrong actor/NPC/recipe,
stale quotes/content and duplicate/cross-connection no-second-charge. Increment
recipes_learned if appropriate, not recipe_books_read for direct exchange.

UI should keep the chosen request pending until authoritative own knowledge
arrives, protect callbacks with scope/token ownership, and avoid automatic retry.
This approves the bounded design direction only; implementation and live
acquisition acceptance remain open.

### First guardian-seal exchange implementation review

Reviewed offer allowlist, pure split-stack plan, actual reducer and extracted
activeMerchantSession test. Independently ran exchange and acquisition suites:
7/7 pass. Current recipe/output/gate validation, quote/hash checks, sender-owned
known-row dedup and inventory-before-knowledge atomic reducer sequence are sound.
The actual merchant helper requires nodeId 'shop'; Iona's renamed shop node now
matches that authority contract. The previous data-link-only shop evidence did
not establish this reducer admission and is superseded by the real-helper test.

Concrete metadata gap: loadPlayerInventory calls storedStack, which drops raw
durability for nondurable items. Guardian seals are nondurable. A persisted seal
row with nonzero durability therefore reaches the planner with durability absent
and passes its check. To enforce the stated rejection, validate accessible raw
rows before normalization (or retain raw metadata in a dedicated adapter).
Current tests mock inventory loading/writing and cannot catch this discrepancy;
add actual load/storedStack/write coverage for malformed durability and lit
preservation. Likewise hidden raw overflow is excluded by actual loader capacity,
whereas the test's capacity-zero snapshot still contains a seal; that test proves
a planner check, not production rejection of hidden raw rows. Exclusion from
payment and preservation of those rows is the intended production contract.

No duplicate-charge flaw found in the normal path. Full inventory-adapter closure,
client UI and live transaction acceptance remain pending.

### Guardian-seal raw inventory adapter closure

Added independent hearth-seal-inventory.test.ts under the parent's explicit
bounded test-edit authorization. It executes the current reducer with actual
loadPlayerInventory, storedStack, normalization/write helpers, and real slot
capacity/offset calculations. In-memory table boundaries substitute for DB;
merchant/auth/stat admission remain separately tested boundaries.

The three new cases prove exact accessible split consumption, preserved lit and
unrelated rows, duplicate no-second-charge, rejection of accessible raw nonzero
durability/zero quantity/overstack, and hidden backpack overflow plus crafting
seals excluded from payment and unchanged. Hidden malformed metadata is also
preserved rather than inspected as accessible payment. Parent's raw-row preflight
runs after successful pure planning and before mutation, closing the normalized-
durability gap. Added the requested slot-offset dependency to the earlier mocked
loader fixture. Both exchange suites pass independently (6/6), targeted lint clean.

Admission scope clarification: activeMerchantSession checks same space and fixed
XY reach, not explicit terrain plane or LOS. Iona's authored guild is currently
single-plane; no concrete cross-plane exploit was demonstrated for this exchange.
Do not claim a general merchant plane/LOS check. Live transaction, UI and device
acceptance remain open.

### Legendary exchange flow review (bounded, 2026-09-10)

Reviewed `HearthSealFlow` and the network wrapper independently. No material blocker found in this standalone flow. The monotonic operation serial prevents old success/failure callbacks from changing a new scope or an acknowledged operation. A resolved reducer promise keeps the request pending; only owner knowledge containing the reviewed recipe clears it as learned. Content/offer changes withdraw the frozen review, and rejection requires an explicit new selection rather than automatically retrying. The wrapper forwards recipe ID, content hash and quoted seal count unchanged.

The four focused flow tests pass independently. They cover eight offers, current shop admission, promise-versus-knowledge acknowledgement, duplicate submission, reconnect/late failures, changed quotes and explicit retry. Panel integration must provide identity plus actual connection generation and current owner knowledge; panel-only close/reopen should retain the admitted shop flow, while leaving the shop currently resets it. A knowledge acknowledgement can reflect another connection learning the recipe, so the neutral “Recipe learned” message correctly avoids attributing payment to this request. This closes only the class/wrapper review: all-eight-choice panel, subscription readiness, actual shop controls and live transaction journey remain unreviewed and publication remains held.

### Legendary exchange panel integration review (bounded, 2026-09-10)

Independently ran panel and flow suites: 7/7 pass. Shop footer entry and KeyL lead to a separate selection/review/confirm path; all eight offers are reachable across two pages. Panel pointer/keyboard handling returns before underlying merchant actions, and pending state rejects repeated confirmation/selection. Closing only the panel preserves its pending flow. Leaving the shop or changing identity/connection scope resets it. The main client supplies the actual connection generation and owner recipe rows only when gameplay is ready; readiness follows the self subscription hydration that includes `ownKnownRecipes`.

No material transaction blocker found in these inspected routes. Requested a concrete guidance correction before visual review: “Claim Expedition Rewards with O first” suggests an unavailable shortcut while this modal consumes O; tell the player to close the shop before pressing O. Native entry/list/review readability and actual connected journey remain pending. This review does not establish live database transaction or full patch acceptance.

### Native seal panel and compact merchant captures (2026-09-10)

Viewed all six actual offline `NpcInteractionUi` captures: shop, first list, second page, review, pending and learned. The corrected shop limits visible rows above its footer and moves the balance above the search/tabs, resolving the two reported overlaps at 320×180. Review and pending screens clearly separate the selected recipe, three-seal cost, custody instructions and confirmation; the revised close-shop-before-O instruction is readable. The learned notice makes no unsupported claim about which connection paid.

Two remaining bounded native readability issues were sent for correction: list cost glyphs touch the lower button bevel (`row.y + 15` in a 26px row; move the line roughly two pixels upward), and the inherited merchant row draws the full “Forester’s Pendant Plan” name into the minus-control area (reserve control width and truncate/ellipsis the name). These are visual findings, not evidence of a transaction failure. Captures remain offline state-fed UI evidence, not a connected exchange or release acceptance.

### Seal panel visual follow-up closure (2026-09-10)

Viewed the regenerated native shop and list captures after the text edits. Both requested findings are closed: the three-seal cost now clears the lower bevel, and the long merchant name ellipsizes before the quantity controls. Names and prices remain readable at the captured 320×180 logical size. The empty-offer message is now neutral about unavailable versus already-known content. This is bounded offline UI readability approval only; connected transaction and wider patch/release gates remain open.

### Cinderwake gathering architecture recommendation (2026-09-10)

Recommend four explicit resource kinds (`tree_ashwood`, `rock_basalt`, `ore_cinder`, `ore_emberglass`) and a small server-owned fixed-site manifest. Keep loot authored through the existing `RESOURCE_LOOT_IDS`/loot JSON route. A general per-node loot-profile field would not remove the current kind-based tool, lifecycle, art, targeting and respawn branches, and would add a second identity that every consumer must resolve. The existing wire resource kind is already a string; add narrowly supported Hearth classifications without changing the original generation inputs.

**Preservation blockers found in actual source:** `oreKindAt` hashes modulo `SURVIVAL_ORE_KINDS.length`, so appending new kinds to that generator list redistributes original ores. Keep original tree/ore generator arrays and counts immutable; extend recognition via separate Hearth constants. `respawnMiningResources` treats any topside mineable ID at or above `ORE_RESOURCE_ID_BASE` as a rotating legacy ore slot and replaces it through `surfaceOreResourceAtSite`. Partition manifest-owned Hearth nodes before that branch and exclude them from legacy active ore populations, migrations and generic tree regrowth. A dedicated manifest-owned ID predicate must validate row kind/site identity too; an ID-range-only shortcut must not silently adopt unrelated rows.

**Shared capability slice:** add Hearth kind recognition and explicit active tool `mineableResources` entries. Basalt must not be collapsed to `rock_large` before capability/loot resolution: the current mining path performs exactly that collapse for all breakable rocks. Preserve existing rock behavior while passing the actual new basalt identity through a shared mining-resource union. Ordinary current pickaxes should admit basalt and both volcanic ores; ordinary axes already use the woodcutting specialization, so ashwood needs that classification and its break lifecycle mapping. Gate deeper materials by actual dangerous terrain access, not a newly invented high-tier tool prerequisite. Add explicit client resource labels and native asset bindings: `drawOverworldOreNode` otherwise falls back to `missingItem`, and the final resource painter branch otherwise treats unknown resources as ordinary trees. Inventory material icons alone are not sufficient evidence for native world-node art, stump/regrowth, selection or shadow silhouettes.

**Authority blocker:** the inspected `resourceHarvestResult` checks XY reach, tool and depletion only; its caller verifies space but has no explicit source/target plane or LOS test. Hearth nodes on terraces require authoritative same-plane and obstruction checks before Vigour, tool wear, claims or yield writes. Mirror those rules in client targeting. Include wrong-plane, thin obstacle and unsafe approach regressions, plus full-body path access to every authored node and nearby recoverable loot landing. The existing mining path already provides shared work, party claims, reserved ground loot and per-yield durability; reuse it. Give ashwood equivalent recipient reservation when awarded on its break path so a combat-adjacent gathering visit does not expose a different custody rule accidentally.

**Initial tuning for testing, not measured economy approval:** two ashwood trees and two basalt nodes near the level-0 shore clearings; one cinder and one emberglass node at the first terrace, with optional later sites only after native composition review. Start ashwood at three guaranteed logs per full tree, basalt at two yields of one basalt, and terrace nodes at two yields of one corresponding material. Use authored fixed outputs without implicit old mixed-ore stone substitution; keep existing mining work/Vigour/wear. Common-tool availability then supports an uncommon upgrade within one or two gathering circuits without removing the existing camp reward route. Do not award seals from gathering. Exact positions remain subject to compiled terrain/body-clear/native node size checks; avoid camp attack lanes, terrace ramps, the dock sanctuary and all return routes.

**Persistent quiet replenishment:** manifest nodes keep stable IDs, positions, depletion and activation ordinals across tick/restart/content reconciliation. Creation must not reset existing depletion. Associate sites with their nearby encounter for a quiet gathering window, but do not make a camp kill itself reset resource health. After depletion use a bounded material cooldown (initially ten minutes), and restore only after the associated encounter is not engaged/returning and no player has the site in authoritative sight for thirty continuous seconds. Any renewed presence resets that quiet interval. Share the existing reviewed sight bound rather than inventing a shorter gathering-only bound. Never replenish under an actor or newly placed obstacle; map/policy removal suspends the manifest controller without changing its generation/depletion. Tests must prove no legacy ore relocation, no restart refill, no duplicate drops on stale callbacks, no quiet-time accumulation during observation, and unchanged original-island fingerprints.

This is implementation guidance from the existing authority/render paths, not approval of unimplemented gathering sites, native node art, live acquisition pacing or release readiness.

### Legacy ore slot partition review (2026-09-10)

Reviewed `legacySurfaceOreSlot` and both respawn call sites. The topside/original-kind/half-open 48-ID boundary is correct, including rejection of IDs below the base, exactly after the final slot, unknown kinds, other spaces and u64 maximum. Active rotating-ore population and actual relocation both use it. Independently ran partition plus mining suites: 10/10 pass. The actual extracted respawn-controller tests establish that a high-ID ore keeps its location, an original slot still rotates, interior veins stay put and an already-replenished row is not replenished twice.

A separate concrete integration blocker remains before authored nodes are installed: `reconcileGeneratedSurvivalResources` deletes every topside row absent the legacy generator's desired map, including its mining claim. This is invoked by world-version reconciliation in both connection and scheduled-tick paths. Preserve validated manifest-owned Hearth rows before that deletion path, with a production-helper test retaining depletion, activation ordinal and claim. The generic in-place respawn fallback still refills nonlegacy ores immediately on its timer and randomizes richness; the future Hearth quiet controller must own those rows before this fallback and before generic claim deletion. Current tests correctly establish partition/location only, not manifest persistence or quiet replenishment.

### Candidate resource manifest and preservation guard (2026-09-10)

The six candidate IDs are separate from legacy generated slots. Reviewed reconciliation now preflights the entire reserved cohort against exact kind, topside space, tile, chunk and spawn-site identity before making any reconciliation writes, then leaves validated resource rows and claims untouched. Mutable depletion, richness, ordinal and cooldown are deliberately not normalized. This closes the inspected deletion path in code. A conflicting reserved row in any space deliberately aborts the world-version migration; the pre-activation occupancy survey must therefore include all six IDs rather than assuming they are free.

An independent compiled-map probe found all six proposed cells open at the declared elevation, with a full player body clear at each point and its four cardinal neighbors on bare terrain. All sites lie outside the dock sanctuary and within their associated camp squares. This is suitable candidate geography, not final placement approval: native tree canopy/base, mineral footprint, full dock approach/return, combat lanes, loot landing and quiet spawning remain to be tested after assets/controller exist. The newly added production reconciliation test had a missing closing brace during this review and did not execute; parent was notified to fix and rerun it before claiming executable preservation evidence.

### Resource preservation and bare-terrain route test closure (2026-09-10)

Independently reran the corrected production reconciliation fixture and new compiled resource-site route test: 3/3 pass. The reconciliation fixture invokes the actual helper, preserves all six depleted rows and claims across repeated reconciliation, retains legacy movement/removal behavior, and rejects each immutable-identity mismatch before any writes. The route test uses actual compiled terrain and full player-body movement, samples each cardinal edge at one-pixel intervals in both directions, and reaches the southern approach of all six sites from the Cinder ferry. Declared elevation and cardinal body clearance are checked too. The earlier test parse finding is closed. These establish the stated preservation and bare-terrain connectivity evidence only; native resource obstacles, current occupancy, installation, quiet replenishment and live journeys remain open.

### Shared Hearth gathering catalogue and loot review (2026-09-10)

Independently ran new gathering, existing mining and existing loot-handler suites: 17/17 pass. No material blocker found in this bounded slice. The separate mining kind union does not change the legacy generator arrays. Three explicit mineral loot profiles return one named material per yield across node classes/seeds/ranks, without old mixed-node stone or fragment substitution; only cinder and emberglass set the ore flag. The ashwood break mapping exists through the shared resource-handler catalogue and pays three logs only for remaining health zero at full growth. Current six pickaxes gain explicit permissions; shovels and other tools without a mining allowlist stay excluded.

The fixed profiles intentionally make ore-dressing, rockhound and mother-lode yield bonuses inapplicable to these materials; efficient-strikes can still shorten shared work when authority is integrated. Do not imply those yield bonuses apply here. If future regrowth exposes harvestable young ashwood, premature chopping currently yields nothing, so either keep activation at full stage or make that restriction clear and reject accidental premature harvesting. World classification, real lifecycle/harvest admission, reserved drops, native nodes, installation and quiet replenishment remain outside this approval.

### Pure gathering respawn planner review (2026-09-10)

Independently ran `hearth-resource-respawn.test.ts`: 4/4 pass. No material blocker found in this pure planner. Refill requires both the ten-minute authority-tick cooldown and thirty seconds of continuously observed quiet. Advancing unsafe observations clear quiet; missed observation intervals or explicit wall-clock continuity loss restart it. Duplicate/backward observations, a changed ordinal, a resource no longer depleted, malformed timing, unknown site and exhausted u32 ordinal cannot produce a refill. The planner emits no rewards and does not mutate the input.

Integration contracts remain explicit: the caller must derive continuity from persisted wall-clock evidence, aggregate sight/policy/encounter/footprint observations for an increasing tick, and revalidate/commit the resource and tracker atomically. A duplicate-tick call returns unchanged state even if different unsafe flags are supplied, so it is not an independent quiet-reset mechanism. Include returning encounters in the unsafe encounter condition. The cooldown uses authority time (offline tick pause does not advance it); only quiet continuity uses the explicit restart-gap signal. Actual controller wiring, stale tracker cleanup, actor/footprint checks and generic-refill bypass are not established by this test.

### Gathering respawn authority review and phase correction (2026-09-10)

Reviewed the private depletion table, harvest recording hooks, exact-site respawn controller and generic refill exclusions. The controller observes player interruptions every tick, persists regular samples at one hertz, and resets quiet when the persisted wall-clock gap exceeds 1.5 seconds (including a long stop with contiguous resumed authority ticks). It rechecks current site identity, ordinal, policy, encounter, collision and nearby living NPCs before an atomic resource update/claim removal/tracker deletion. Missing depletion history conservatively starts a new cooldown rather than inventing elapsed time. Generic mining/migration/tree paths now bypass reserved site IDs.

Found and reported a real phase mismatch: actual encounter completion retains `activated:true`, which the first controller treated as ongoing engagement even in `completed` phase. Parent corrected engagement to be phase-aware and reject unknown phases. With permission, added independent production-controller regressions for completed-plus-activated gathering quiet and unknown-phase rejection. Both pass with the fix; the three focused respawn/planner/partition suites now pass 15/15 independently, and the edited test file passes lint. Completed camps can now accrue quiet without waiting for the next enemy generation, while unexpected encounter phases remain blocked.

These tests mock collision/policy boundaries; parent separately checks the real 3×3 terrain envelope. No nodes are installed yet. Native footprint and other resource overlap, actual new-kind harvesting/plane checks, installation, connected persistence and real gathering/combat visits remain open; this is not full gathering or publication approval.

### Hearth harvest recognition and geometry review (2026-09-10)

Reviewed explicit Hearth classification without generator-list mutation, basalt identity preservation through mining loot, the new target-specific collision exclusion and ashwood owner-reserved drops. The access helper checks exact site identity, maturity, space, current body clearance, source/target elevation and the actual obstacle-aware segment before the shared harvest-result/cost path. The collision builder excludes only the target resource, retaining other resource/chest/placeable/map obstacles. Focused access tests exercise the actual helper and elevation sampler; they are helper evidence, not yet an extracted full harvest callback proving cost/claim/drop ordering.

One pending authority finding was sent to parent: current geometry admission does not check the site's current hostile map policy or associated encounter conflict. Removing expedition policy suspends camps and replenishment but would leave an already-live node harvestable if its geometry remains clear. Reuse the enabled-site policy/conflict admission, or explicitly decide and document the exception, before enabling nodes. Native rendering, client targeting parity, actual installation and live harvest remain open.

Independent access/gathering/site suites passed 7/7. Parent agreed that policy removal should suspend harvesting and is extracting a shared site-enabled check; that correction is pending review rather than assumed complete here.

### Harvest policy parity correction closure (2026-09-10)

Reviewed the shared `hearthResourceSiteEnabled` helper and both harvest/refill uses. Exact site identity, current hostile policy, existing nonconflicting associated camp and absence of resource suppression are now required consistently. Harvest rejects a disabled site before constructing collision or reaching costs/claims/yields. The new helper regression explicitly rejects policy removal, camp conflict and suppression. No remaining blocker found in this bounded correction. Native resource art, client targeting mirror and the full authoritative harvest callback/connected journey remain open.

Independent harvest-authority, respawn-authority and pure-planner rerun: 16/16 tests pass after the shared policy correction.

### Client Hearth targeting geometry review (2026-09-10)

Independently ran client targeting, world access and engine collision suites: 16/16 pass. No current production blocker found. Authority and client use the same extracted body/plane/segment geometry. Engine collision retains the exact per-resource obstacle object; the main client copies the obstacle array while preserving those references, adds map/fixed obstacles and retains the matching provenance map. Targeting removes only the target reference, so a different obstacle with identical bounds still blocks the swing. Exact site/maturity/space/mining permissions are filtered before the existing specialization/facing/reach selection.

Recommended small hardening: require that the provenance object is actually present in `collision.obstacles`, rather than only checking its map entry, to make an externally mismatched collision/provenance pair fail closed as documented. The inspected main refresh updates these together, so this is not a demonstrated current runtime defect. Private camp conflict/claim checks and current policy can still reject a locally clear target. Native art, installation and full authoritative harvest transactions remain open.

### Client targeting provenance and public policy follow-up (2026-09-10)

Independently reran the client targeting suite: 4/4 pass. The helper now requires the exact provenance obstacle to remain present in the supplied collision array, closing the defensive mismatch case. It also rejects sites without current hostile public policy; the main collision refresh constructs that policy from the current live map and resets it to empty outside topside. The refresh key includes the live map revision, so ordinary authored policy revisions rebuild this projection. No remaining finding in these bounded additions. Private encounter conflicts/claims remain authority checks, and native resource/connected harvest acceptance remains open.

### Native gathering node crop recommendations (2026-09-10)

Viewed the actual Kenmi Volcano_Rocks, Dead_tree, HalfDead_tree and Ores sheets, including a nearest-neighbor enlarged inspection. Recommended exact untransformed source crops from `volcano/Volcano_Props/Volcano_Rocks.png`: basalt `(0,112,32,32)`, anchor `(16,23)`; cinder `(16,16,16,32)`, anchor `(8,29)`; emberglass `(96,16,16,32)`, anchor `(8,28)`. Basalt is the plain rounded lower-left boulder, cinder the tall dark jagged formation with orange fissures, and emberglass a shorter dark jagged cluster. The latter depicts obsidian-like dark stone rather than a literal transparent glass crystal; its different silhouette and in-game material label must carry that distinction. Avoid red molten ground-ring variants, which imply an active damage hazard. Do not recolor the established core ore sheet to invent these materials.

Measured opaque local bounds: basalt x6–25/y8–23 (native shadow through y25); cinder x0–14/y7–29 (shadow through31); emberglass x2–14/y17–28 (shadow through30). Keep complete source crops and semitransparent shadow pixels. These fit a one-tile interaction identity with the existing 12px mineral collision core; basalt's 20px rounded visual shoulder overhang needs a native approach/contact check rather than a wider invisible collision box.

Ashwood: use the complete `desert/Props/Dead_tree.png` `(0,0,48,64)` with anchor `(25,52)`, centered on the actual root cluster. Opaque branches/root bounds are x9–44/y4–52, native shadow extends to60. This is a broad leafless crown over a narrow trunk, so preserve full overhang and validate canopy visibility/culling separately from the one-tile site reservation. HalfDead_tree's living green leaves are less suitable for this first dry ashwood treatment.

For depletion, inspected the genuine native stump already used by `prop_cf_poi_stump`: `core/Outdoor decoration/Outdoor_Decor.png` `(16,96,16,16)`, existing anchor `(8,15)`. Its bare roots and fresh cut-wood section are a suitable candidate without fabricating a stump by slicing the standing tree. Align actual opaque roots between tree and stump in the native scene; their asset anchor padding differs, and the existing tree painter's additional y−4 offset must be accounted for exactly once. These are source crop recommendations only. Imported asset pixels, complete node/stump contacts, lighting and real Cinderwake terrain composition remain to be reviewed before art approval.

### Imported gathering candidate crop/contact study (2026-09-10)

Viewed `gathering-native-candidates.png` and its provenance (SHA `cc5bfe5f1a34843408944da15692bc7e1dd4b9c22526117c1e17499fbf9cbff1`). The four imported candidates match the recommended native silhouettes: rounded basalt, taller fissured cinder, short dark emberglass cluster and leafless ashwood. No clipped neighboring sprite, truncated branch or invented molten ground ring is visible. Their opaque ground contacts align on the study baseline while original translucent shadows remain below it. Independently ran the exact source-RGBA/anchor test: 1/1 passes across all four full crops.

No blocker in this bounded import/contact study. Emberglass is deliberately smaller and darker than cinder; its visibility on actual basalt terrain is still a necessary scene check. The isolated aligned baseline does not prove resource collision placement, canopy culling, depth/light receivers or tree-to-stump continuity. Assets remain draft/unapproved pending those rendering and native scene checks; this is not final art or patch acceptance.

### Bridge south-module transparent padding repair (2026-09-10)

Reviewed the importer and native-pixel regression; independently ran bridge asset and actual ground-layer depth tests, 2/2 pass. The three south modules now use a 16×16 canvas with their unchanged native 16×12 crop in rows0–11 and four transparent bottom rows. Anchor `(8,15)` and every native pixel coordinate remain unchanged, so the formerly out-of-bounds anchor becomes valid without visible displacement. Scenery pivot, one-row collision and prefab dimensions remain unchanged (`ceil(12/16)` and `ceil(16/16)` both equal one). Conservative transparent sprite bounds grow four pixels; atlas metadata must be rebuilt.

This proof is sufficient to restore the prior bounded source-art approval for the three repaired south assets. It does not grant new bridge lighting, live-map installation or release approval. No approval flags were edited by this reviewer.

Gathering metadata follow-up: verified cinder/emberglass now declare their actual native `#00000064` baked shadows, while basalt/ashwood use `#00000028`. Their native pixels did not change. Future lighting review must use these corrected per-asset shadow masks, not the earlier blanket opacity assumption.

### Runtime gathering art integration review (2026-09-10)

Independently ran the new engine art tests: 3/3 pass. Native mineral selection, explicit missing marker and direct anchor calls work in those isolated tests, but two production integration findings remain:

- The actual resource producer passes `resourceY - 4` to the full tree renderer and `resourceY` to the stump renderer. Removing the old tree renderer's internal +4 specifically for ashwood therefore moves full-tree roots four pixels north of its stump. The direct 100/100 test does not exercise these different producer arguments. Choose one shared contact convention and test the actual producer standing/depleted calls.
- Actual light collectors still select legacy art: basalt uses `poi_rock_small`, cinder/emberglass look up absent `art.oreNodes` entries, and mature ashwood uses `matureTreeLightAsset`'s ordinary-tree fallback. Native drawing and optical silhouettes must select the same asset/contact before this slice is complete. Prefer shared resource visual selection so both producer and collectors consume the same native bank and offsets.

The optional bank loader avoids requesting names absent from an older registry, and the stump clone preserves the native image while correcting its contact anchor. Those do not close the producer/optical findings above. No atlas rebuild, installed nodes, full scene or lighting acceptance is claimed.

### Actual ashwood producer contact regression (2026-09-10)

With explicit permission, added `packages/client/src/hearth-resource-painter.test.ts` only. It executes the actual resource producer and engine tree/stump draw functions, reading native dimensions/anchors from source assets. Weather sway and the Canvas drawing sink are the isolated boundaries. At camera `(7,9)` and zoom2, full ashwood, its depleted stump and defensive immature stump all place the measured opaque root contact at the same resource baseline. The old producer y−4 call would displace the full-tree result eight screen pixels and fail. Source image identity, frame rectangle, one queued/drawn group and depth tie are also checked.

The two tests pass independently; client typecheck and targeted lint pass. The production caller now supplies `resourceY` specifically for ashwood, preserving legacy tree call offsets. The shared native visual selector is also used by the inspected mineral and mature-tree optical selections, replacing their prior legacy/missing lookups. This closes the identified selection/contact code findings, but actual alpha-shadow geometry, native tree/stump terrain capture and full lighting acceptance remain open.

### First actual-site resource art study (2026-09-10)

Viewed both active and depleted six-site native terrain captures. Basalt, fissured cinder and leafless ashwood are recognizable; ashwood and its fresh-cut stump retain aligned opaque ground contact in both site panels. The small emberglass crop `(96,16,16,32)` is too easily mistaken for incidental rubble against the repeating basalt texture, so its isolated candidate readability does not carry through to the scene.

Recommend replacing emberglass with the complete taller unlit jagged crystal crop `(0,16,16,32)`, anchor `(8,29)`, native baked shadow `#00000064`. It keeps the narrow footprint but supplies a stronger vertical outline; cinder remains distinguished by orange fissures. The alternative `(64,112,32,32)` reads as broad columnar basalt/tower-like geology and would weaken material distinction while adding a larger visual base. Rerender the taller candidate on the actual site before art approval. Broader ground dressing, characters/tool approaches and lighting are still absent, so these unlit panels remain a limited contact/readability study.

### Four gathering source assets: bounded art approval (2026-09-10)

Viewed the refreshed actual-site active study, image SHA `2ed91ad8a1f13438d413919d27a315106fd8fbc915fdcf3f989278289cfd86ca`. The taller emberglass crop now has a clear vertical outline on the basalt floor and reads as a deliberate node. Its unlit dark crystal remains distinguishable from orange-fissured cinder, rounded basalt and leafless ashwood. Together with the previously viewed depleted contact study and unchanged source provenance, this closes the source crop/readability/contact findings.

Independently reran exact source-pixel, actual engine draw and actual producer contact suites: 6/6 pass. Approve the four `resource_cf_hearth_{basalt,cinder,emberglass,ashwood}` assets for their bounded source-art gate, with emberglass specifically `(0,16,16,32)` anchor `(8,29)`. Approved draft hashes before any flag change: basalt `97460e3a3323ce935f8f1806570ffe3e30bd888a395b17077b830e63537c0e05`; cinder `cb06dd6939a97d0f46645e96924245352c43ab645aa5a75b2cef26340c181280`; emberglass `b9bc2fea18eb1fb875eb9ab524dc2098cc2db49465860c772f0b12fab2734743`; ashwood `812dfcfdbaa398226eeb0a3835a243ebfe0ab10d86263db000d5052d448d5923`.

This approval permits closing these source asset draft flags only. Dynamic lighting/shadows, populated terrain composition, actor/tool approaches, node installation, live gathering and full patch/release acceptance remain open. Reviewer did not edit approval flags or publish assets.

### Forty-five Hearth gear icon source-art approval (2026-09-10)

Independently audited all 45 current `icon_gear_hearth_*` assets against their four native Raven source sheets. The exact comparison checked 11,520 pixels (visible RGBA plus transparent occupancy), with no mismatch. Generated and visually inspected `output/doc60/gear-source-art-review.png`: each cell shows the actual source crop on the left and imported asset on the right. The adjacent JSON records all 45 asset hashes, source rectangles and source-file hashes. Rows are common, uncommon, rare, epic, legendary; columns are sword, bow, head, body, hands, legs, feet, shield; the last row contains grower/prospector/angler/forester/wayfarer pendants. The inspection script is `/tmp/astra-gear-review.ts` for this session.

All icons are readable complete native crops with coherent silhouettes and palette treatment. Helm, torso armor, gauntlet, taller greave and short boot crops convey their intended slots; weapons/shields and the five pendant selections are recognizable. No adjacent sprite intrusion, cut-off equipment, fabricated rotation or recoloring was found. Some weapon tiers share blue/yellow families and similar native bow silhouettes, so exact rarity remains communicated by the existing quality/name UI rather than artwork alone. This is acceptable for the source-art gate.

Approve bounded source-art flags for all 45 current icons represented by the adjacent per-asset hash manifest. Prior P2 findings concerned stats, action integration and sustained balance, not unresolved defects in these now-inspected source crops; those broader gates are not waived. This approval does not cover modular worn-avatar correspondence, live inventory/shop journeys, combat balance, atlas publication or whole-patch release. Reviewer did not flip flags or rerun the gear content authoring importer.

### Five material icon source-art approval (2026-09-10)

Viewed `output/doc60/hearth-material-icons.png` and checked the native source metadata for all five icons. Basalt is a dark grouped stone, ashwood the previously corrected clearly grained gray-blue log, cinder ore a rough warm-orange mineral cluster, emberglass small bright faceted shards, and the guardian seal a gold medallion/token. Their silhouettes distinguish the five material roles; the seal does not read as another ore pile. No clipping or unintended neighboring sprite is visible. Independently ran `hearth-icon-assets.test.ts`: its full 50-icon exact native-pixel comparison passes, including all five materials.

Approve the bounded source-art gate for these five current native icons. Reviewed hashes before flag changes: ashwood `b8ef2f6170a34f75e7790ae3428aefa8579c35466f17bbc2bb695009785b172e`; basalt `0f5ecd801eddff6bfc6716ac1319c62cd5ab5ec40641517392cb50c563faddb0`; cinder ore `47d767c5811519500fa65bf24a65243a8884c60c6ca361d5eeafd61f99d5fa92`; emberglass `02869016d3c2c264c0bd35b6a9beafa4ad1c2c61334380b5b8deba3bf6ceb069`; guardian seal `9a3170ba9052b57bd79cd87c45a1430013164de86e41ebf7ae7d83d95fc754fc`.

This source-art approval does not alter prior material economy/custody requirements, guardian-seal unsellability, world-node lighting or live harvesting/release gates. No asset flags or content were edited by this reviewer.

### Native pavement source-art gate (2026-09-10)

Viewed the original Kenmi `core/Tiles/Pavement_Tiles.png` and `output/doc60/willowharbour-arrival.png`. The four 16×16 variants are the source sheet's top-left 32×32 quartet: (0,0), (16,0), (0,16), (16,16). Warm brick courses join coherently in the actual path rendering, with modest native chips rather than conspicuous repeating gaps or neighboring-sheet contamination. The warm paving remains distinguishable from grass and the cooler stone quay.

Independently ran `packages/tools/src/hearth-pavement-assets.test.ts`: 1/1 passes, checking all 1,024 opaque pixels against the declared native source regions and exact source palette. Reviewed asset hash before approval flag change: `545de2041773a52d10c61d2410c140de02a1259ce2035711f48de04ca63be9f9`; original PNG hash: `9de8d464b0e13252e417c54f162744488448790a182717d281f526611959ce06`.

Approve the bounded source-art gate for `tile_cf_hearth_pavement`. No asset edits by this reviewer. This closes source crop/tiling fidelity only; it does not approve all village composition, lighting, live map installation, or publication of the patch.

### Gathering generated-atlas study review (2026-09-10)

The `--atlas` branch in `render-hearth-gathering-study.ts` uses actual `loadOverworldArt()` and skips the source-pixel fixture construction, retaining `releaseReady:false`, `liveData:false`, and `sourceAssetFixture:false`. This is the correct bounded evidence route.

One integrity issue remains before treating a successful capture as proof of a complete native atlas bank: the current five-entry check tests only presence, while `loadGeneratedAsset` can return a loaded placeholder after an ordinary page/record failure. Require each bank entry's actual `assetId` to equal the generated registry ID for its exact required native name, including the stump; reject any mismatch. Merely finding the requested name in `assetsById` does not prove that asset was loaded. Also correct the provenance's hardcoded six draw count: depleted mode renders two stump resources, not six resource sprites. Findings sent to root; no production or asset edits.

### Gathering atlas integrity follow-up closed (2026-09-10)

Re-read the corrected atlas branch: every required resource name now resolves to its registry ID, each loaded bank entry must carry that exact ID, and the placeholder ID explicitly fails. Actual resource draw closures increment the reported count. Both final provenance files contain all five expected IDs, six active draws/two depleted draws, `sourceAssetFixture:false`, `liveData:false`, and `releaseReady:false`. This closes the two bounded findings above.

Viewed `gathering-sites-active-atlas.png` and `gathering-sites-depleted-atlas.png`: the tall emberglass, orange-fissured cinder, basalt and ashwood retain the reviewed silhouettes and contact; depleted trees leave aligned native stumps and minerals disappear. Independently hashed both atlas images against the existing source-fixture counterparts: each pair is byte-identical (active `2ed91ad8a1f13438d413919d27a315106fd8fbc915fdcf3f989278289cfd86ca`; depleted `2e0d236dcbb80a80c6e999bb8ddef14dabc4efb509e451272267ca338b21fbfb`). This establishes the bounded generated-loader/native-render correspondence at atlas revision `79e7ab84d7e4c616595e`; it does not establish installed resource authority, populated encounters, lighting or live harvesting acceptance. No publication approval.

### Guarded six-site gathering installation design (2026-09-10)

Reviewed the current manifest, `generatedWorldResourceRow`, `reconcileGeneratedSurvivalResources`, `outdoorCollisionMap`, encounter controller and quiet respawn path. Recommend a separate bounded installer; do not use legacy reconciliation as its entry point. Reconciliation correctly preserves matching reserved Hearth rows but still deletes topside rows outside the original generated set, which is outside an installation transaction's scope.

Before any write, validate all six reserved IDs against the exact immutable site identity (kind, space, coordinates, chunk, spawnSiteId). Matching existing rows are preserved byte-for-byte, including partial work, health, depletion, activation ordinal, claim columns, private mining claims and depletion observations. A missing resource with an orphan private claim/depletion row is a conflict, not permission to create a full node or delete custody. A wrong reserved ID in another space also aborts. Do not reconstruct existing rows from generated defaults. Prefer a small persisted installation receipt/version so later disappearance of an already installed row becomes an explicit repair conflict rather than an automatic fresh-yield reset; the existing suppression mechanism must also prevent installation of missing suppressed IDs.

Activation prerequisites are the current authored map/terrain and hostile policy at each site's declared plane, active material/loot/tool content, associated exact camp records with no conflict, and reviewed generated asset availability. Server code cannot prove what atlas an arbitrary connected browser downloaded; use the tested release artifact/cohort as the activation prerequisite and retain the existing conspicuous client fallback for old clients. Do not accept a client-supplied asset-ready Boolean as authority. Local atlas review is satisfied separately; live map installation and occupancy survey are still required.

Use the current camp sight bound (camp square plus 176 tiles) to defer first insertion while any online player could see it. For associated camp state, allow known dormant, inactive active, or completed states; reject returning, engaged active and unknown states. Completed packs may retain `activated:true` and must not be treated as an active fight. Inspect all persisted player bodies locally, including offline characters, for overlap with the proposed bases: sight suppression for online players does not protect an offline reconnect inside a newly inserted obstacle. Inspect actual living NPC/mount bodies separately because `outdoorCollisionMap` does not include them as physical obstacles. Do not move actors, reset encounters, clear claims, or charge/grant anything to make an occupied site installable.

The 3×3 full-body envelope used by respawn is a useful conservative approach check, not the node's footprint. Build exact bases with `survivalResourceObstacle`: minerals are 12×8 pixels ending at tile south edge; ashwood uses the existing 8×6 pixel trunk ending four pixels north of that edge. Check every covered terrain cell at the declared plane and exact closed overlap with current fixed/resource/chest/placeable obstacles. Do not substitute sprite rectangles or make ashwood's 48×64 canopy a wall. Existing native art overhang is a separate visual concern. Then compose all missing node bases together with current collision and verify reachable, full-body-clear harvesting approaches using the shared access geometry with only the target base excluded. Preserve the authored ferry recovery route and camp member home clearance/return access under this combined layout. The six candidate sites are already in `outdoorCollisionMap`'s sampled regions; newly inserted nodes must be visible to any collision snapshot used by the subsequent controller step.

For a minimal first activation, preflight the whole missing cohort and commit only its inserts in one transaction when safe; temporary occupancy defers without writes, structural conflicts report a stable reason. If installed from the scheduled loop, run it after current encounter state reconciliation and do not reuse the encounter controller's pre-insert collision snapshot afterward. Bound retries to the existing one-second cadence and retain no growing revision cache. Create ashwood explicitly with mature-tree health and zero mining richness; create each mineral with manifest richness/health two, explicit mining class, exact spawnSiteId, ordinal zero and empty custody. Do not pass through random legacy richness defaults.

Required authority regressions: repeat install preserves a partially mined row and a depleted row plus both custody tables; wrong ID identity/orphan custody causes no writes; suppressed/missing-policy/wrong-plane/unknown camp state denies; online sight and offline body overlap defer; an offset thin obstacle intersecting the actual node base denies; combined node placement retains a reachable harvesting stance and camp homes; completed+activated does not deadlock; legacy resources and inventories remain unchanged. These are design recommendations, not approval of an implemented installer or live harvesting journey.

### First installer implementation audit (2026-09-10)

Reviewed `hearth-resource-installation.ts` and the actual `installHearthResourceSites`/owner reducer. Independently ran the pure installation suite: 3/3 passes. The explicit first-state construction, whole-cohort identity/orphan preflight, persistent receipt preventing recreation, matching-row preservation, offline player overlap, known-phase handling, and all-writes-last structure implement the intended custody boundaries. Initial ordinal one is acceptable as an explicit first generation.

Three concrete findings sent to root:

- The content loop passes `item:${kind}` into `runtimeItemDefinition`, but that helper indexes the compiled dictionary by bare slug (`compiled-projection.ts`). With the real registry this always returns null and rejects installation. Use the correct registry surface and exercise it in the authority fixture.
- Non-null compiled items alone cannot establish active gathering capability: they do not expose retirement, and the loop does not validate the four required active loot profiles or usable current tool capabilities. Validate the actual authored configuration, including non-retired output items and the intended harvest routes, before first installation.
- The eight adjacent harvest stances and their connected ring do not prove access from outside the site. An enclosing obstacle loop beyond that ring can isolate the node while all local checks, camp home point checks and ferry recovery point checks pass. Add an actual combined-collision full-body route from the shared safe arrival to at least one valid stance for each new site (bounded installation-time traversal), with an enclosing-obstacle regression. This is a current-map reachability gap, not a demand to turn native canopy pixels into collision.

No implementation edits or publication approval; parent is adding authority tests and corrections concurrently.

### Installer content admission implementation and route follow-up (2026-09-10)

At root's explicit request, reviewer implemented `sim/hearth-resource-content.ts` and its four-test suite, exported `hearthGatheringContentReady`, and replaced only the world installer's content loop/import. The helper checks authored active materials alongside correctly bare-slug compiled availability; four active deterministic loot profiles with intended items, quantities, ore flags and mature-tree final-hit conditions; and baseline common axe/pickaxe runtime action, durability, vigour and mining permissions. It deliberately rejects changed gathering contracts rather than installing nodes whose authored payout/access differs from the reviewed cohort. Existing compiled tool lifecycle dispatch remains the established lane; this helper is not a new lifecycle dispatcher.

Actual bootstrap-registry tests pass, including the old prefixed-lookup failure, missing/retired materials, absent/retired/rebound/conditional loot, removed ashwood conditions, missing/retired tools and removed mineral permissions. Sim typecheck and targeted lint pass. World changes were limited to calling the exported helper; root owns its actual reducer fixture and geometry.

Also read root's new `hearthResourceInstallationRoutes`: it traverses combined current collision from the actual sanctuary recovery point to the south stance of every missing node, checking both directions with full-body one-pixel edges and exact obstacle buckets. The finite Cinderwake bounds limit traversal. Together with the existing connected eight-stance ring, this closes the isolated-ring design finding. Independently ran both shared content and installation suites: 8/8 passes, including the new enclosing-obstacle negative case. This remains local implementation evidence, not a live installation or full harvest transaction acceptance.

Latest installer authority fixture also independently passes 4/4: it executes the actual installer and site-enabled helper with the real content registry/shared geometry, checking one-time receipt, preserved depletion/claims, orphan and identity conflicts, missing content, phase/suppression/occupancy failures, and unrelated-row preservation. World DB, policy, collision provider, camp-home and recovery boundaries remain mocked; the pure route tests separately exercise actual compiled terrain. No outstanding concrete blocker found within this bounded installer review after the content and route corrections. Release operations, live state survey and end-to-end harvest/refill acceptance remain open.

### Installer scope correction and ongoing content suspension design (2026-09-10)

Root's final audit correctly found that the camp-scoped `outdoorCollisionMap` cannot support a route proof over arbitrary Cinderwake detours: resources or chests outside collected camp chunks could be missed. Verified the installer now supplies full `collisionForSpace(ctx, TOPSIDE_SPACE_ID)` to combined installation geometry/routes. The explicit infrequent owner operation justifies full collection; ordinary tick/harvest scoped collision remains unchanged. This strengthens the earlier route closure; the prior scope limitation should not be inferred as accepted.

Recommend applying `hearthGatheringContentReady(contentRegistry(ctx))` to the existing shared `hearthResourceSiteEnabled` gate for ongoing content transitions. Harvest admission then refuses before node/cost/reward effects, and depleted-node observation treats invalid content as unsafe without rewriting resource state or custody. Restoring valid content must require fresh continuous 30-second quiet observation; it must not preserve an old nearly-complete quiet interval through the disabled period. Existing receipt retries can remain no-ops even during invalid content because they do not install or refill anything. Root is adding actual-registry transition regressions; this paragraph reviews the design, not unobserved test completion. No publication approval.

### Ongoing content transition gate verified (2026-09-10)

Verified `hearthResourceSiteEnabled` now calls the shared current-registry content contract before policy/collision access. Independently ran harvest access, resource respawn, installation and content suites: 22/22 passes. The actual extracted respawn controller tests retired basalt, missing cinder loot and removed pickaxe permissions at cooldown expiry; resource rows remain unchanged, claim deletion stays zero, and quiet observation clears. Restoring valid content at tick 12020 cannot refill through 12600; at 12620 it refills once, advances ordinal once and deletes the claim once. The harvest helper test confirms retirement rejects before collision work and restoration admits without changing the resource. These close the bounded content-transition finding. They remain fake-DB/controller evidence, not a live content publication or complete harvest action journey. No publication approval.

### Client content-target parity follow-up (2026-09-10)

Verified `targetResource` computes `hearthGatheringContentReady` from the current snapshot registry once per target query and passes it to the local filter. The helper returns early for genuine legacy IDs/kinds before the Hearth content gate, while reserved IDs or Hearth kinds still require exact identity and valid content. This Boolean is local preview data only; the server recomputes its own gate. Independently ran the actual-collision client targeting suite: 5/5 passes, including invalid-content Hearth rejection with legacy targeting retained. No concrete integration blocker found; private camp/claim state remains authority-only and this is not live harvesting acceptance.

### Cinderwake scenery foundation recommendation (2026-09-10)

Read the current archipelago, five encounter camps and six gathering sites, and viewed the native `Volcano_Rocks.png`, `Volcano_Plants.png`, `Volcano_Fence.png`, `Volcano_Tower.png`, and `Volcano_Bridge.png`. The island needs three legible landmarks rather than evenly scattered obstacles: a supplied safe landing, broken terrace masonry, and a northern caldera backdrop. Native crops/anchors and composed collision still require import/render review; the coordinates below are candidates, not approved installation points.

Protected landing: retain the broad clear ferry-to-arrival area around (644,207) through (652,211), including recovery alternatives. Put a modest supply grouping near (650,202), with a secondary barrel/sign grouping near (658,203), rather than on the arrival itself. A chest sprite alone does not implement the plan's supply cache; use a real storage/reward custody path before describing it as functional. Mark both actual sanctuary departures: the north road crosses y192 near x664, while the ash-shore route crosses the east boundary x668. Paired low markers around (660,192)/(668,192) and (668,201)/(668,213) can frame these approaches without blocking them. They are wayfinding candidates, not a substitute for explaining the exact sanctuary policy to players; the full rectangular boundary must not appear to be only one doorway.

Ash shore: first reserve every harvesting site's full eight-stance ring plus a margin (at least three logical tiles from the node anchor for scenery proposals, then inspect actual visual overhang). Keep the slime camp (678,204), radius six, open for its tell/recovery dance. Sparse plain boulder/plant groups near (672,216), (688,216), (696,202), and (730,218) are low-shore candidates with authored elevation zero. Use the plain bottom-row native boulders, not duplicates of the exact harvest-node silhouettes. Plants should be sparse small nonblocking accents; cool/dry forms read differently from the orange cinder node. Do not cover target foot positions with vegetation.

Terraces: use short broken grey fence/masonry fragments from the unlit native `Volcano_Fence` family to suggest a ruined court beside the main route, rather than boxing in the mixed camp. A western court around x693–701/y159–166 is a useful first search area away from the terrace-kiln fight centered (725,169). Its actual elevation, lava separation and full projected art must be compiled before choosing anchors. Keep the main four-tile ascent x704–707 clear, especially slope mouths at y180,150,138. Alternate paths must be visibly and physically connected; a decorative bridge over solid floor does not satisfy that requirement. The native horizontal volcano bridge is suitable only after selecting a real lava-channel crossing with level, reachable banks and matched terrain/rail collision. Do not pick a crossing from the sheet alone: the west channel curves and intersects terrace contours.

Caldera: preserve the Warden core, attack lanes, and summon pads (715,116)/(727,116). Use a single native tower or ruined masonry landmark north of the arena rather than large props inside it. A tower centered near (721,100) is a candidate to test above the arena, with its entire physical base on a valid terrace and its art projecting north; the earlier looser (721,103) suggestion should be moved north or rejected if it touches arena clearance. The full native tower is intact gothic architecture with apparent door openings, not a broken ruin; do not imply an enterable dungeon unless a real interaction exists. Broken wall fragments can carry the ruin language without that promise. A side candidate around (739,183) is elevation one in authored cells, while (746,183) is already elevation zero—this demonstrates why large buildings need full-base plane checks, not center-only checks.

Art shortlist: plain basalt boulders, low unlit broken grey masonry/posts, small cool/dry plants, one complete native tower if its composition works, and a genuine native bridge only for a proved crossing. Exclude the rocks with bright circular red ground rims from walkable decorative areas: they read as persistent vent/damage markers and would compete with the Warden's committed telegraphs. Avoid reusing the exact tall orange/dark gather crystal crops as inert scenery. Native lavafalls belong on actual lava edges with matching elevation/blocked cells, not across movement routes.

Bounded first slice should stop at the landing grouping, two boundary approaches, and a handful of shore groups, then run the actual six-site installation geometry/routes and camp/home/recovery checks against the composed map. A native populated scene must include player, ordinary tells and the gathering nodes so overlapping bases and visual competition are visible. This recommendation does not approve unimported art, scenery placement, a functional supply cache, or publication.

Root's proposed flora crops were additionally inspected on a nearest-neighbor enlarged source sheet: `Volcano_Plants` (0,0,32,48) and (48,0,32,48) are complete bright orange-foliage trees with visibly branching trunks; (32,80,16,16) is a complete small violet plant. These are appropriate draft import candidates. Keep the orange trees peripheral and sparse because their saturated crowns compete with orange attack cues, and do not imply that these decorative trees yield ashwood. This is candidate suitability, not final asset/placement/lighting approval.

### Six volcanic scenery crops and contact review (2026-09-10)

Viewed the imported native contact sheet and re-inspected enlarged source sheets. Found and rejected a real crop defect in the first large-blossom import: (48,0,32,48) removed its left crown (opaque pixels reach source x43) and left shadow (reaches x41). This corrects my earlier whole-sheet candidate statement that the initial rectangle was complete. Root changed it to (32,0,48,48), with anchor (22,41), preserving the same root world contact. Viewed the refreshed `volcano-scenery-candidates.png`: the left blossom and shadow now remain intact.

Approve bounded source-crop/contact fidelity for the six current candidates: small blossom (0,0,32,48), anchor (16,41); corrected large blossom (32,0,48,48), anchor (22,41); violet plant (32,80,16,16), anchor (7,13); column cluster (16,80,32,32), anchor (9,29); broad pillar (64,112,32,32), anchor (16,28); full tower (0,0,96,144), anchor (48,141). No adjacent sprite contamination or further cut foliage/masonry is visible. Their asymmetrical anchors are actual root/base contact and must not later be replaced by canvas-center placement assumptions.

Independently ran `hearth-volcano-scenery-assets.test.ts`: 1/1 passes, comparing every visible native RGBA pixel and transparency across all six, native shadow-color metadata, bottom opaque contact and the corrected large-tree rectangle. Review is source art and contact only: provisional placement footprints, map terrain/elevation, canopy occlusion, populated combat readability, tower interaction language and lighting remain unapproved. Reviewer did not change asset flags or publish.

### First Cinderwake scenery collision audit (2026-09-10)

Reviewed the fifteen-placement manifest and prefab construction. Sparse locations avoid the six immediate gathering rings and ordinary camp centers by inspection, and tower (721,100) remains north of the Warden core; these observations do not replace root's forthcoming composed-map tests/render.

Found a concrete native base/collision alignment error in the full-width even-sized foundations. Actual map rendering anchors art at `(object.tileX*16+8, (object.tileY+1)*16)`, while the new prefab foundation uses integer cells around `floor(anchorX/16)`. Tower anchor (48,141) therefore draws eight pixels east of its six-cell foundation: the last six opaque native rows span x3..92, with opaque eastern feet reaching 2–4 pixels into tile724 beyond the proposed x718..723 footprint. The broad pillar anchor (16,28) similarly has opaque base pixels x3..28 that extend 4–5 pixels beyond its two-cell eastern bound. This invalidates the claim that those whole-cell foundations conservatively cover the native bases.

Recommended deriving occupied base bounds relative to the actual anchored draw origin and expressing them with the existing 4×4 prefab mask cells, including partial eastern/western cells where needed; preserve reviewed art anchors and revalidate newly covered terrain planes. The asymmetrical column cluster's anchor (9,29) does not share the same half-tile assumption. Root notified with exact native opaque coordinates. Placement/collision approval remains pending correction and composed evidence; no source pixels or implementation changed by reviewer.

### Cinder scenery foundation correction implemented (2026-09-10)

At root's request, reviewer implemented the bounded foundation repair in `hearth-cinder-scenery.ts`: reviewed bottom-six-row opaque horizontal bounds (cluster x2..25, pillar x3..28, tower x3..92) are transformed through the actual native anchor and half-tile draw origin, then rounded outward to four-pixel collision masks. Physical depth remains conservative one tile for rocks and two tiles for the tower, ending at its contact baseline. Partial edge cells cover the former eastern spill without moving source art or pivots; prefab widths grow to three tiles for the pillar and seven for the tower. Also corrected native-name underscores in prefab IDs/references to parser-valid hyphens.

Appended an independent source-alignment regression to `tools/hearth-cinder-scenery.test.ts`. It measures actual opaque native base bounds, checks the entire conservative base is covered at every placement, rejects unnecessary expansion beyond the quantized edges, and verifies enlarged widths/parser-safe IDs. All three composed-map tests pass: complete foundations retain their authored open terrain planes, all six gathering rings and safe-arrival routes remain usable, and every authored camp member's body point stays clear. Sim typecheck and targeted lint pass. This closes the identified physical foundation defect; native populated composition/cue overlap and lighting still require the forthcoming captures. Reviewer made no asset edits or publication.

### Fifteen-object populated native scenery review (2026-09-10)

Viewed all four actual offline captures: `cinder-landing-scene.png`, `cinder-shore-scene.png`, `cinder-east-scene.png`, and `cinder-caldera-scene.png`. No new scenery overlap blocks the shown player, ordinary enemy tells, Warden vent or either summon pad. The orange shore trees remain peripheral in these compositions and are distinguishable from the dead harvestable ashwood. The corrected full tower is visible above and separate from the guardian's working floor. These observations support the bounded initial placement slice alongside the already-passing composed collision tests; they do not prove all moving actors/tells remain unoccluded through a fight or validate the study-only raised projection adapter against the live client.

Concrete remaining design requirements are visible. The landing is not yet recognizable as a ferry/supply station: there is no functional supply cache or coherent dock arrangement. Four identical natural pillars read as scattered boulders, not a protected/hostile boundary. Keep them as framing props if useful, but add an intentional, consistent gate/ground treatment and accurate danger communication at both actual policy crossings before calling the boundary complete. The current volcanic road writes effectively the same visible floor treatment as its surroundings, so the main ascent is not legible as a route.

The repeated cobbled floor overwhelms the sparse shore and east scenes; this is a playable spacing foundation rather than finished volcanic environment art. Add native ash/lava-edge variation and grouped peripheral dressing while retaining quiet floors under tells. The caldera's intact gothic tower is a useful distant landmark, but its apparent open doorways remain nonfunctional and it does not itself supply the planned ruined terraces, alternate route, native bridge or lavafall composition. Keep tower interaction claims honest; no invented entrance is implied by this review.

No immediate reason to move the fifteen existing props based on these frames. Next visual work should prioritize the functional/recognizable landing and sanctuary boundary, then one coherent terrace ruin/alternate crossing with real terrain and collision. Live travel, supply custody, moving combat, Dynamic/Basic lighting and whole-island acceptance remain open. No publication approval.

### Functional Cinder landing supply-cache design (2026-09-10)

Inspected current private stash schema, `hearthStashWithinReach`, `hearthStashSessionAvailable`, `openHearthStash`/close, generic menu load/write, sender-only stash views, client E targeting/frame selection, and `activeMerchantSession`. Recommend a second physical access point to the existing owner-private twenty-slot Hearth stash. Label it **Personal supply cache** and state that it shares contents with the Delve lobby. This supplies a genuine storage/retrieval function for prepared arrows, food and tools without inventing daily grants or a public chest that other players can empty. An initially empty personal cache must be described honestly; no free stock is promised by this design.

Use the existing `hearth_stash_slot` rows and `stash` container ID, keeping the single capacity and sender-only views. Generalize endpoint geometry into a shared resolver with fixed server-owned endpoints: current lobby point and a Cinder landing chest around (650,202), with an independently body-clear front interaction point around (650,203) to be validated against the actual chest art/base. The Cinder endpoint exists only when its exact enabled authored map object/prefab and expected sanctuary location are active; combat-region presence alone must not permit opening an invisible/deleted cache. Require source space, expected terrain plane, living settled stats, full-body source/frontage clearance, bounded reach and unobstructed interaction segment. Current `hearthStashWithinReach` is lobby-only and must not simply drop its space check.

Bind the private active stash session to endpoint identity as well as connection. A defaulted lobby endpoint preserves existing rows. Keep `openHearthStash` as the lobby route if API compatibility matters and add a thin fixed-endpoint landing reducer around a shared opener, rather than accepting arbitrary coordinates or a client-specified inventory owner. Both menu loading and writing must revalidate the exact active endpoint. Deleting/moving/disabling the cache or removing sanctuary access ends admission, without deleting any personal contents. Close/travel/disconnect/dialogue/frame-switch cleanup should reuse the current cursor-return and active-container lifecycle; failed cursor settlement must leave all custody unchanged.

Preserve current unique-quest-item deposit restriction, item metadata, stack/capacity rules and full-bag no-loss behavior. Validate existing action restrictions for the new outdoor endpoint: do not allow opening during Delve custody, mounted/carrying/exclusive defense or unpaid bow charge. Either refuse an active charge or use the existing committed cancellation settlement; opening a safe-hub menu must not bypass bow cost/recovery. Resource claims and pending expedition rewards are separate ledgers: opening storage must not claim rewards, reserve communal loot or refill depleted nodes. Two connections still access only the same owner's rows, with one connection-bound active session and transactional slot moves.

Client reuse points are `targetInteraction`/`activateInteraction`'s `hearth_stash` path, the existing network open/close wrappers, `snapshot.hearthStashOpen`, and `frame:hearth_stash`'s retained twenty slots. Give the landing target a distinct stable endpoint ID and truthful title/help text; keep the same inventory container mapping. Mirror visible current-map/plane/body/LOS eligibility where available. Server independently validates all conditions; no client ready Boolean or arbitrary object ID authorizes storage.

If actual purchasable replenishment is desired later, add a supply keeper through existing authored NPC/dialogue/shop materialization, using real arrow/torch/food offers at existing prices. `activeMerchantSession` already requires an admitted matching NPC/dialogue/shop and XY reach, but does not itself establish plane/LOS; do not claim those checks without implementing them for an outdoor keeper. No new NPC is necessary for the bounded personal-cache function.

Acceptance cases: owner isolation, shared lobby/landing inventory continuity, duplicate/late old-endpoint packets, two-connection session ownership, exact metadata round trips, full bags/cursor failure with unchanged contents, unique-quest deposit denial, endpoint removal/sanctuary removal/plane mismatch, combat/bow action restrictions, and ferry travel/disconnect closure. No implementation or publication performed by reviewer.

### Personal supply-cache endpoint implementation (2026-09-10)

At root's request, reviewer implemented the shared endpoint, authority session and client interaction slice. `sim/hearth-stash-endpoints.ts` validates the exact enabled Cinder object `hearth-cinder-supply-cache` at (650,202), untransformed elevation zero, matching revision-one `hearth-prop-cf-chest` prefab, stable native asset ID 2817144658, chest state and full-cell collision. Both chest and frontage require active sanctuary. Following root's actual body-clearance finding, frontage is (650,204), not the rejected (650,203).

Shared reach requires bounded range, matching plane and clear player/frontage bodies. Root identified that player-to-frontage alone could reach through a wall between the frontage and chest; corrected it to additionally check the segment to a point immediately outside the exact chest's south edge, retaining all obstacles. No equal-bounds obstacle exclusion is used. Shared and full-composed wall regressions now reject that obstruction.

World `openHearthSupplyCache` uses the same twenty owner-private slots and generic container transfer writer as the lobby. The old no-argument lobby reducer remains compatible through a shared opener. Active sessions add defaulted `endpointId:delve_lobby` and remain connection-bound; subsequent loads/writes revalidate that exact endpoint. The landing gate refuses dead/settled-dead, mounted, carrying, seated, bow-charging or defense/recovery states and existing Delve inventory lock. It never grants supplies, claims rewards or cancels an unpaid bow action. Cursor settlement precedes session/storage creation; failures preserve custody. Existing unique-quest deposit and item metadata rules are retained.

Client E/touch's shared activation route now has a distinct personal-supply-cache candidate, ordinary nearest-target priority, the new generated reducer wrapper and the existing private stash frame. Successful opening explains that contents are shared with the Delve lobby. Root performed local binding generation; no publication occurred.

Independently ran four relevant suites: 15/15 passes across shared endpoint geometry/identity, actual extracted stash authority, actual activation callback/target priority, and full composed Cinder scene. Coverage includes lobby-to-landing contents, exact metadata, owner isolation, connection replacement, endpoint deletion and blocked writes, cursor failure, action restrictions, exact native ID and a foreign wall. World workspace typecheck, client typecheck and targeted lint/diff checks pass. An initial root-level `npx tsc` invocation used the wrong compiler context and reported pre-existing missing Node types across world tests; the package's prescribed `npm run typecheck -w @orchard/world` passes. These are fake-DB/controller/native-composition tests, not a live storage persistence or ferry journey.

Viewed refreshed `cinder-landing-station.png`: the boat, paved arrival and raised cache spur now form a recognizable station, and the actual frontage player is visible below the chest without being hidden. The paving is bright and rectilinear but clearly separates the landing from volcanic ground. This improves the landing identity; the larger protected boundary, visible onward ascent, ruins, alternate crossing and lighting remain unfinished. No whole-island or publication approval.

### Exact sanctuary approach-gate treatment (2026-09-10)

Current `CombatRegionPolicy.contains` uses half-open continuous bounds: Cinder landing is x634≤x<669 and y192≤y<225. Thus the northern danger crossing is y192, and the eastern danger crossing is x669, not tile-center x668. Ground artwork must not shift these edges to the centers of the old decorative pillars.

Minimal coherent treatment: two open four-tile checkpoints using the already reviewed broad native pillars and short safe-side paved thresholds. North threshold: x664..667, y192..195, so its northern paving edge coincides exactly with y192. Candidate pillar anchors (662,192) and (669,192) replace the old overly wide pair and leave four open approach columns between the real partial foundations. East threshold: x665..668, y205..208, so its eastern edge coincides exactly with x669. Candidate pillar anchors (668,203) and (668,211) replace the old (668,201)/(668,213) pair and frame the four approach rows. These are proposed placements subject to composed full-body/native overhang checks, not automatically approved coordinates.

Connect the northern threshold back to the landing with a narrow safe-side path from roughly (655,205) toward (664,195), widening only at the checkpoint. Connect the eastern threshold from (657,207) toward (665,207). Keep all new paving cells inside the sanctuary. Do not carry the same threshold carpet/strip across the dangerous side or imply that every paved area anywhere in the game is safe. The landing already has paving for a functional station; these paths make its outbound connections legible while the policy-derived HUD explains the actual protection status, including unpaved protected ground.

No closed gate sprite, invisible gate collider, glowing red-ring rock or continuous fence enclosure is needed. The checkpoints frame the two intended routes; they do not claim those are the only ways to cross the rectangular policy boundary. The HUD's near-boundary notice must also work for a player walking off-route. Avoid a right-arrow sign at the north gate unless its direction actually describes a real turn; repeated neutral checkpoint construction is preferable to false wayfinding. Gate art must not encode a different boundary after map edits: derive/check its expected policy edge during composition validation.

Before accepting: prove both directions across north rows191/192 and east columns668/669 through all four lanes using full bodies; assert policy immediately on each side; rerun all six gathering rings, combined ferry routes and camp home/recovery clearance. In particular keep the east path from drifting toward the basalt site (674,207) or slime camp (678,204). Native player captures should show each gate in protected, near-danger and hostile HUD states. This is a bounded approach-marker design, not full perimeter, route/ruin or publication approval.

### Physical gate and policy notice initial review (2026-09-10)

Viewed `cinder-boundary-north.png` and `cinder-boundary-east.png`. Tightened pillars and safe-side paving now read as deliberate open checkpoints. The visible paving edge matches the intended y192/x669 route boundary; shown players and nearby attack rings remain unobscured by scenery. Standalone native banner lettering is legible and its protected/near-danger wording avoids claiming that paving itself controls combat. The shared classifier uses current installed policy, checks actual hostile territory beyond a sanctuary edge, and uses authoritative local coordinates in the client. Independently ran shared danger-notice plus composed-scene tests: 7/7 passes.

A concrete UI integration blocker remains: `drawHearthDangerNotice` always centers its panel at y4 and is called after the ordinary HUD. Existing `overworldUiLayout` puts the zone ribbon at x4/y2 with width up to220, and the minimap at x=viewportWidth−120/y4, size116×92. At compact320/360 logical widths the approximately180-pixel banner overlaps both existing surfaces, while their hit targets remain active beneath it. The standalone world captures omit those HUD elements and cannot establish live layout safety. Integrate notice placement with actual HUD reserved regions or use a compact combined status treatment, then inspect a complete compact HUD capture. Parent notified; no final banner-position or publication approval.

## Live revision 4 cave: conservative resource survey (2026-09-10)

The captured public `world_resource` query adds 29 rows around the candidate, including birch 348256 at (479,418) and spruce 344099 at (482,413). Health/depletion were unavailable after authentication expired, so this review assumes all 27 trees are grown and nondepleted; the two loose stones retain their actual nonblocking gatherable semantics. No live rows were changed.

Recompiled the actual saved map, retained saved landmark obstacles, and added the shared native tree-base collision for every surveyed tree. All 291 one-pixel vertical approach samples through columns 480,481,482 from actor-anchor Y416.5 to422.5 pass. Threshold (481,416) and return (481,418) remain body-clear on lower ground. This extends the earlier terrain-only result; it does not assert unsurveyed inventory/chest/player occupancy or current depleted states.

Inspected `output/doc60/live-survey-20260910-r4/cave-native-resources.png`, with actual generated-atlas tree/cave/avatar art and compiled raised terrain. Native resources use projected physical depth and the ordinary world-depth comparator. The southwest birch and upper spruce do not conceal the doorway or the shown central threshold actor. The candidate can preserve these resources. Keep the visible main path centred on columns 481–482; the western edge brushes the birch canopy even though its trunk collision leaves all three tested columns open. The old provisional standing-light location (479,417) falls within that birch's visual canopy region and should not be adopted without correction. Prefer fitted wall-mounted flank lights or choose new ground positions with a populated capture; do not suppress the tree simply to retain an earlier speculative decoration coordinate.

The facade (481,415), lower threshold (481,416), and return (481,418) receive bounded location/native-fit approval against these captured map/resource rows. Keep wall collision intact and reject a blanket 3×3 facade obstacle. Proper production facade placement/depth integration, portal admission from below versus above, lights/path/sign dressing, dynamic lighting, live journeys and remaining occupancy remain open. Evidence and archived diagnostic harnesses are beside the PNG in `cave-native-resources.provenance.json` and `cave-resource-geometry.json`; no release approval is implied.
