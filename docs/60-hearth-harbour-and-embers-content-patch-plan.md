# 60 — Hearth, Harbour & Embers: next content patch

Investigation and proposed implementation plan, **2026-09-06**. Design proposal;
no gameplay changes or live publication are made by this document. Working title
and all new names, counts, prices, timings, and balance values are proposals.

## 1. Patch identity and recommendation

Expand Orchard & Cellar into a three-island archipelago: the existing home island,
a complete inhabited village island, and a dangerous volcanic island. Give players
reasons to travel between them: earn money, buy plans and furnishings, build a home,
prepare an expedition, and bring back materials for equipment and decorations.
Move the public-facing Delve approach into a cave in the **current island's
northeastern cliff**, with a proper safe dungeon lobby behind it.

Equipment should combine **fixed authored stats** with **selected +1 skill-node
ranks**. Epic and legendary items can push eligible nodes above their trained cap.
Keep earned track levels, skill points, prerequisites, and tool unlocks independent
of equipment. Ship named, fixed items first; randomized affix instances would add
considerable persistence and balance work without being necessary for this patch.

Deliver this as one content update assembled in gated slices. Lighting readiness
includes the applicable performance recovery work in [59](59-client-render-performance-recovery-plan.md),
not just the visuals in [58](58-seasonal-lighting-and-baked-shadow-plan.md).

## 2. What the repository actually supports

This is a working-tree review, not verification of the deployed game's state.
Several older design documents describe systems that later work has superseded.

| Area | Evidence in the current tree | Work still needed |
| --- | --- | --- |
| Map | `survival-world.ts`: original 320×320 island inside an 832×832 world, offset by 256 tiles; comment explicitly reserves the ocean for later islands | Compose two additional island masks, routes, terrain, POIs and policy; preserve the existing island and positions |
| Combat | `combat.ts`, world combat reducers, `roguelike.ts`, doc 49: damage, ranged/melee resolution, run enemies, waves, guardians, knockback, boons and three themes | Shared outdoor hostile encounters, clearer timing/feedback, safe boundaries, rewards and progression balance |
| Gear | `item-containers.ts`: all five quality tiers and definition-level modifiers already exist; `activePlayerModifiers` reads valid equipment | Weapon identity/stats, more usable slots, chest armor, skill-rank bonuses and comparison UI |
| Skills | `skill-trees.ts`: Combat/Explorer/Farming tracks cap at 50; nodes have their own ranks and implementation flags | Separate trained and effective ranks; authored over-cap policy and effects |
| Homes | Doc 35 and existing build paths: prefab palette, five footprints, role checks and refund-safe removal | Furniture catalogue, placement layers/rotation, room construction and usable residential interiors |
| Shops/NPCs | Content files for shops, NPCs, dialogues, quests, recipes, frames and objects | A full village and its service/content definitions |
| Delves | Doc 49 and runtime: private 32×32 rooms, cave/volcanic/dungeon acts, saved return/vitals, run-only rewards | Cliff portal, safe lobby, relocated entrance and tested return handling |

Do not implement doc 32's old “no XP” or “hostile combat not implemented” statements
literally. Existing skill progression, hunting and Delve code are the starting point.
Outdoor hostiles still require work; a run enemy is not yet a persistent island encounter.

## 3. World expansion and travel

### Layout

Keep the original island's origin, seed, terrain, landmarks and player-owned rows
stable. Use the ocean apron first. The playable land expands without needing to
increase the 832×832 bounding square or adopt the experimental v7 generator.

Initial layout envelopes, inclusive tile coordinates, for an offline map study:

| Destination | Candidate envelope | Character |
| --- | --- | --- |
| Existing island | Existing local island envelope at 256–575 on both axes | Home, familiar progression, northeastern Delve cave |
| **Willowharbour** village | X 64–223, Y 320–479; up to 160×160 | Western island; compact town with cultivated outskirts |
| **Cinderwake** volcano | X 608–799, Y 48–239; up to 192×192 | Northeastern island; ash shore, caldera terraces and ruins |

These are candidate authoring bounds, not surveyed free land or final portal
coordinates. Check current sparse map edits, water travel and occupied rows before
selecting them. Give both islands irregular coastlines and actual walkable terrain;
the overview must show the landmasses, docks, paths and named destinations.

Use ferry interactions between docks for the first release: explicit destination,
instant departure after selection, no real-time waiting, and a free return route.
Keep existing travel mechanics compatible. Player-owned boats are a later addition.
Town arrival should be a short walk from the square, not a long empty traverse.

### Safe and dangerous areas

Recommend keeping both new islands geographically present on the shared map.
This requires an explicit amendment to doc 40's space-wide sanctuary rule:
**only the authored volcanic combat region permits hostile player damage**.
All unclassified surface tiles remain peaceful. The village, home island, ferry
docks and Delve lobby stay protected. Preserve existing hunting/training exceptions.

Add authored region policy resolved by `(spaceId, logical tile position)` with
stable region IDs. Reject overlapping contradictory regions at content validation;
explicit safe dock areas take precedence over volcanic danger. A biome colour or
client flag must never authorize damage.

Authority must apply that policy to spawn sites, aggro, melee attacker and target,
projectile travel/impact, AoE cells, knockback destinations, resource rewards and
knockout recovery. A projectile crossing into safety expires; monsters leash before
the dock. No attacking out of safety, dragging enemies home or killing across a
boundary. Teleport/arrival briefly protects a player until they leave the dock.

If shared-map region policy proves too invasive, the fallback is a dedicated volcano
space reached by ferry with its landmass represented in the archipelago overview.
That is a topology change to this proposal and must be called out before implementation;
do not quietly deliver a map marker in place of the requested island.

Avoid broad generator rewrites. Compose bounded island contributions over the stable
base and invalidate only affected chunks. Profile existing full-world mask creation
before increasing world dimensions; a larger extent would multiply those costs.

## 4. Willowharbour: a whole village

Use the attached references for composition: timber houses with varied rooflines,
a substantial inn, stone streets, narrow garden paths, hedges, bridges, a pond,
market awnings, working farmyards, chimneys and richly furnished interiors.
“Full tileset” means using the breadth of the appropriate architecture and decor
families coherently; not filling every tile or importing every sheet cell.

Target **10 exterior buildings, 6 enterable service interiors, 8 service NPCs and
4 residents**. Named services below are proposed roles, not existing NPC promises.

| Building/service | Purpose and stock | Visual treatment |
| --- | --- | --- |
| Harbour office | Free return ferry, local introduction, travel directions | Dock, crates, lamps, noticeboard |
| Carpenter's workshop | House/room plans, basic furniture plans, construction materials | Timber yard, saw area, furnished showroom |
| Furnisher/tailor | Ready-made furnishings, textiles, lamps, rotating cosmetic variants | Colourful shop and furnished room displays |
| Smith/armorer | Starter weapons/armor, recipes, material exchange and existing repair service where applicable | Forge, anvil, cooling trough, racks |
| Inn and kitchen | Food, dialogue, gathering place, first village contract | Large reference-style inn, dining room and guest rooms |
| General store | Everyday supplies and existing farming products | Dense shelves, counters and planter frontage |
| Guild/archivist | Expedition contracts, equipment explanations, skill-bonus tutorial | Maps, bookshelves, training courtyard |
| Farmyard, greenhouse and homes | Residents, village stories and visual life | Barn/coop, fenced pens, crops, private gardens |

Combine harbour/general-store service in one NPC if needed to keep eight service
roles. The ten-building count includes the residential/agricultural buildings.
Every enterable shop needs an interior and a real catalogue; avoid convincing
facades backed by empty rooms. Decorative doors should look distinct from entrances.

Keep core shops available whenever the player visits. NPC schedules may move a
resident or change dialogue but must not lock essential progress behind time of day.
Use existing NPC identities carefully: retain starter services or branch their
dialogue/quest roles, rather than duplicating an existing named character in town.

Include six introductory contracts: travel to town, meet the carpenter, furnish a
room, prepare expedition gear, clear a volcanic outpost, and return a specialist
material. Farming/cellar orders should fund home building without compulsory combat.

## 5. Building, crafting and furniture

Build on the existing Homestead `B` palette and permission system. Public village
construction is authored scenery; player construction belongs to owned estates.

### First-release scope

- A starter cottage/residence plus **two purchasable room expansions**; keep the
  current five agricultural prefab types and add usable residence transitions.
- Modular floors, internal walls, doorways and windows **inside the purchased
  residence envelope**. Room expansion increases that envelope. Freeform exterior
  roof engineering and multi-storey construction can follow later.
- **32 furniture definitions**: 6 seating, 4 tables/desks, 4 beds/storage pieces,
  4 shelves/cabinets, 4 rugs, 4 lighting/hearth pieces, 3 kitchen/bath pieces and
  3 plants/wall ornaments. Separately budget wall/floor variants and architecture.
- Two style families at launch: rustic timber and village townhouse. Add four
  expedition trophy/reskin variants to those 32 definitions, rather than a third
  complete furniture range.
- Buy a finished item or buy/earn its reusable recipe and craft it. Both routes
  produce the same placeable. Show materials, footprint and appearance before purchase.

Placement uses a ghost, grid snap, clear valid/invalid feedback and supported
orientation cycling. Only offer rotations with suitable source art. Layers include
floor/rug, floor-standing object, tabletop decoration, and wall attachment. Authored
footprints/colliders differ from visible canopies, backs and overhangs.

Validate ownership/role, space, inventory, collision, attachment support and an
escape path to the exit in the same placement transaction. Reserve doors, portals,
stairs and public approaches. Keep walls from trapping occupants; reject demolition
of a support until attached objects are moved. Preview the reason for rejection.

Pick up/move furniture without loss. Placing consumes one item only after success;
removal returns that same definition once. Full inventory rejects removal or uses
an explicit estate recovery store, never silent loss. Nonempty storage cannot be
demolished. Existing builder permissions apply; visitors cannot steal furnishings.
Undo is an authoritative inverse action, not client-only inventory reimbursement.

Functional furniture is bounded: chairs sit, lamps switch, storage stores, and
existing cooking/crafting capabilities can be attached to appropriate stations.
Decorative beds/baths do not introduce new global sleep/time or survival systems.
Avoid a stackable “comfort gives combat stats” system in this patch.

Economy starting points: basic chair/rug costs roughly one ordinary local sale;
a full starter room roughly three to five village orders; an expansion roughly
eight to twelve. Measure those against actual crop/bottle income before assigning
coin values. Finished furniture costs more than its direct materials, with a modest
convenience premium. Never permit buy → salvage/craft → sell loops to mint money.

## 6. Northeastern cliff Delve entrance and lobby

Place the entrance on a **south-facing/front-facing wall of the northeastern cliff
area of the existing island**, approached from the lower ground. Do not place it on
the cliff cap or on the new volcanic island. Final logical coordinates need a live
map/editor survey of existing overrides; the generator's plateau centres alone do
not establish the intended visual location.

The exact imported family already exists:
`packages/assets/props/prop_cf_stone_cliff_{1,2,3,4}_cave_entrance.sprite.json`.
Use the matching cliff palette and course height. Match the reference's recessed
doorway; frame it with rock, two lights, a short path and a discreet Delve sign.
The 48×48 entrance composition is not automatically a 3×3 walkable hole: keep the
wall collision intact except for the logical approach/interaction threshold.
Test Y-sorting, elevated ground, shadows and interaction reach from below/above.

Behind it, create a **24×24 safe lobby**, using cave stone near the opening and
dungeon masonry deeper inside: arrival alcove, supply counter, benches/stash,
practice corner, a sealed descent doorway and a visible outside exit.
No hostile damage, lava or accidental run creation in this room.

Flow: outside cave → lobby → inspect loadout → interact with descent doorway →
**Begin Delve** confirmation → existing run. Cancel creates nothing. Victory,
knockout and voluntary exit return to the lobby and preserve doc 49's vitals/run
cleanup contract. Reconnect restores the correct lobby/run context.

Make this the primary entrance. Marlow can give directions; retire new trapdoor
admission only after all saved runs returning to the tent remain supported.
Do not rewrite return positions for active runs. A party gathering area is useful,
but co-op Delve admission is a separate feature: doc 49 currently admits only the owner.

Keep Delve boons/run currency ephemeral in this patch. Persistent equipment enters
with the player and is fixed for the run. Volcano rewards supply permanent gear.
A later Delve meta-reward proposal can add a guarded, once-per-completion grant;
do not let changing the entrance silently alter run isolation or duplicate rewards.

## 7. Cinderwake and the combat pass

### Encounter progression

1. **Protected landing:** return ferry, supply cache and visible danger boundary.
2. **Ash shore:** spaced beginner packs and gathering sites; room to retreat.
3. **Basalt terraces:** mixed melee/ranged packs, ruins and alternate paths.
4. **Caldera:** telegraphed vents, elite camps and a guardian arena.

Use existing volcanic terrain, bridges, lavafalls, plants and rocks. Lava channels
are visually and physically unwalkable. Vents are discrete telegraphed hazards on
walkable ground. Skip a continuous heat meter and compulsory resistance set; danger
should come from decisions and enemy patterns, not a preparation tax.

Four ordinary enemies and one guardian are sufficient for a strong first island:

| Enemy | Behaviour | Counterplay |
| --- | --- | --- |
| Ember Slime | Visible compression, short hop, landing pulse | Step out of the landing marker; attack during recovery |
| Ember Cowling | Wind-up then committed charge | Sidestep; punish the wall/ground recovery |
| Cowling Pyromancer | Slow aimed bolt, occasional marked ground burst | Move after the tell or interrupt during the exposed phase |
| Cinder Skull | Approach/orbit, telegraphed dive and retreat | Hold spacing; strike when it commits |
| Caldera Warden | Existing Cowling art/guardian presentation with a distinct three-phase pattern | Charge lanes, spaced vent bursts and bounded adds; clear recovery windows |

The three volcanic Delve kinds already exist. Reuse their art and relevant attack
components, but author the outdoor encounter profiles separately from room/wave state.
The proposed slime variant and guardian pattern need animation/hitbox review.
Rare elite variants change one pattern and presentation cue, not just health colour.

### Combat work before difficulty tuning

- Audit input-to-action latency, facing/aim agreement, sword contact frames, bow
  charge/release, target selection and terrain/elevation collision. Keep immediate
  local animation, authoritative hit/damage, and the existing 20 Hz authority rate.
- Give every enemy attack explicit tell → active → recovery phases. Initial tells
  of 400–700 ms, sampled on authority ticks, are tuning candidates for standard attacks.
  Test on touch and delayed connections before shortening them for elites.
- Queue at most one follow-up swing in a short input buffer. Define action cancel
  rules so healing, item switching and repeated packets cannot skip recovery.
- Add a short dismounted dodge with a visible Vigour cost, committed direction,
  collision checks and a server-timed invulnerability window. Tune it first against
  a single test enemy; no dodge while carrying, building or incapacitated.
- Shields provide a held frontal block with Vigour drain. Bow use suppresses block
  and hand-held light while drawn; no second active off-hand effect from the backpack.
  A perfect-parry system and new weapon families can wait.
- Distinct confirmed hit/miss/block feedback, enemy intent cues, health visibility,
  knockback limits and readable projectiles. No mandatory screen shake. Damage
  numbers follow actual applied health changes, not predicted hits.
- Cap simultaneous committed attackers initially at three per player; limit adds,
  avoid doorway/spawn camping, and use obstacle-aware return/leash paths. Steer clear
  of permanent stun loops and repeated instant hits after arrival.
- Knockout follows existing no-item/no-currency-loss principles, recovering at the
  safe volcanic dock with the established recovery state. Verify there is a usable
  return route even with empty Vigour or a full inventory.

### Rewards and repeatability

Volcanic mobs give appropriate Combat XP and authored material drops; reward one
encounter completion once, independently of client hit notifications. Use existing
reserved-loot conventions, with credited participants eligible by bounded damage
or useful support contribution. Mere proximity is insufficient; last-hit stealing
must not decide the reward. Persist claim identity and encounter generation so
reconnects, leashes, simultaneous killing blows and restarts cannot reroll a kill.

Start with ashwood, basalt, emberglass, cinder ore and guardian seals as candidate
materials, consolidating with existing material IDs wherever possible. Gathering
uses established mining/tool gates; common gear must be enough for the shore.
Cleared camps remain quiet for a useful gathering visit. Replenish only outside
player sight and away from arrivals; use bounded lazy population, not ticking the
entire island. Guardian seals provide a deterministic route to a chosen legendary
recipe after several clears; low-probability bonus drops supplement that route.

## 8. Equipment and skill system

### Fixed named gear, five qualities

Use existing `quality` values and the Raven icons. Rarity describes an authored
item's budget and acquisition route; it is not a random numerical roll on each copy.
Armor/weapons are nonstackable. Existing durability policy remains item-specific;
new armor has no degradation initially. Do not add randomized affixes, sockets,
enchantment rerolls or set bonuses to this release.

| Quality | Item budget | Skill contribution | Acquisition |
| --- | --- | --- | --- |
| Common | Functional base stat | None | Village stock; simple crafted gear |
| Uncommon | Base + one small fixed bonus | None | Specialist recipes; shore materials |
| Rare | Base + two modest bonuses, or base + one bonus + a skill rank | +1 eligible node, up to its trained cap | Mixed-island recipes; elite contracts |
| Epic | Base + two bonuses; selected items trade one bonus for a skill rank | +1 eligible node; permits one over-cap rank | Caldera recipes and elite rewards |
| Legendary | Comparable base to Epic + a defining, bounded signature | +1 selected node; up to two over-cap ranks across the loadout | Named recipe unlocked with guardian seals |

Rarity does not multiply every stat. A signature may be the useful over-cap rank
itself; legendary items do not need a new special-effect subsystem. Target a
complete legendary combat loadout at roughly **25–35% more sustained damage than
a comparable rare loadout**, with modest defense improvements, then validate actual
time-to-kill. Skill/gear/boon combinations must be measured, not balanced by tooltip totals.

Launch catalogue: **45 definitions** — sword and bow at each quality (10), head,
body, hands, legs and feet at each quality (25), plus five shields and five utility
neck pieces. Use armour families visually, but allow mixed equipment. Utility neck
pieces serve farming, mining, fishing, woodcutting and exploration so gear supports
the whole game. Do not assume every icon needs a mechanically distinct item.

### Slots, weapon ownership and visuals

The current nine positions include Watch and Pack but no body armor. Retain both;
add a **Body** slot, activate head/hands/legs/feet/neck and use the existing main-hand
position for the equipped sword/bow. Keep Off Hand for shield/torch/lantern.
No extra ring slots in this patch.

Hotbar tools stay familiar. Equipping a weapon moves its actual item into Main Hand;
a hotbar shortcut selects that weapon without duplicating it. Selecting another
tool suppresses the weapon's attack-specific modifiers. Only the active weapon
contributes weapon bonuses; armor and utility passives follow explicit slot policy.
Current base sword/bow damage must become definition-driven across ordinary and
Delve combat rather than changing only an inventory icon.

Adding Body changes the current contiguous inventory layout: the new equipment
index conflicts with the old first crafting slot. Version and atomically migrate
the nine crafting slots to their new offsets, including in-progress crafting and
cursor state; verify item counts and metadata before/after. Do not simply increase
`EQUIPMENT_SLOT_COUNT` against existing rows. Update bindings, slot filters, UI
frames, persistence/restore and old-client version handling together.

Raven's expanded collection provides **inventory icons**, not animated armor for
the Cute Fantasy player. Bind selected gear families to verified compatible player
layers where available; use existing sword/bow animations with deliberate, compatible
visual variants. Inspect any separate modular character library before promising
wearable art. Never render an inventory icon as worn armor. Fully distinct wearable
looks for all 45 definitions are not a launch requirement; tooltips are explicit.

### Trained versus effective skill ranks

There are two different caps: earned track level (currently 50) and each node's
purchasable rank (e.g. Blade Training 5). Equipment affects the latter's **effect**.

Add authored `gearBoostable`, `gearBonusCap`, `overcapLimit` and effects-per-rank
metadata for selected implemented numeric nodes. Initially whitelist Blade Training,
Archery Basics, Battle Conditioning and supported specialist endurance nodes.
Exclude roots, recipe/permission unlocks, discovery capabilities, specialization
eligibility, unimplemented nodes and one-off ability unlocks.

Resolution proposal for each eligible, trained node:

```text
T = validated trained rank (must be at least 1)
M = authored trained maximum
B = sum of valid equipped +rank contributions, capped at 2 for this node
O = min(node overcapLimit, highest equipped permission for this node)
    permission: Rare 0, Epic 1, Legendary 2
effective rank = min(T + B, M + O)
```

Rare+Legendary can therefore supply two bonus ranks and Legendary grants permission
for both to exceed M. One Legendary item still contributes only +1. Cap total active
gear-granted ranks across the loadout at **4**, with player-selected priority among
eligible nodes; excess bonuses display as inactive. These limits are balance proposals.
Untrained nodes receive no effect, and an item cannot qualify itself for use.

Example using today's implemented Blade Training (+3% melee power per rank):

| Trained state and equipment | Effective result |
| --- | --- |
| 4/5 + Rare +1 | 5 effective: +15% from this skill |
| 5/5 + Rare +1 | 5 effective: bonus capped, visibly indicated |
| 5/5 + Epic +1 | 6 effective: +18% |
| 5/5 + two +1 items, one Legendary | 7 effective: +21% |
| 0/5 + Legendary +1 | Inactive until trained |

Show “5 trained + 2 equipment = 7 effective (maximum 7)”. A respec or unequip
immediately recomputes effects without changing XP or refunding fictional points.
Use trained ranks for purchases, prerequisites, quest gates and tool-quality checks.
Never pass over-cap ranks into `ownedSkillNodesWithPrerequisites`, which rejects
ranks beyond the authored cap today. Keep effective ranks in a separate projection.

### Stat math and balance controls

Reuse the existing integer-centi stats and basis-point modifier pipeline; **100 bp
= 1%**. Flat stats are flat; percentage bonuses share the appropriate additive
bucket rather than multiplying each item independently. Critical chance bonuses
are labelled in percentage points and enter a supported absolute chance path.
Never apply a percentage-of-zero modifier expecting it to grant flat crit chance.

Compile rank effects once, then equipment stats, active effects and permitted run
boons through the shared resolver. +1 Blade Training supplies its +3% once; do not
also add a duplicate “skill power” modifier. Existing toolVigour and swingSpeed
targets have cost/interval semantics: author and test signs/units explicitly.

Initial equipment-only caps for tuning: +30% melee/ranged power, +20% health,
+10 percentage points crit, 25% attack-interval reduction, 30% relevant Vigour-cost
reduction, and no generic movement-speed item bonus. Trained skills and Delve boons
still resolve with their own rules; test maximum combined builds for free actions,
near-invulnerability, runaway attack cadence and restoration exploits. Do not use
the modifier system's large technical maxima as acceptable gameplay budgets.

Damage/mitigation balancing must include flat armor's interaction with small hits.
Compare baseline, common, rare and capped legendary builds against each enemy and
guardian, with and without strong Delve boons. Gear improves choices; no required
legendary set and no enemy health scaling to the player's currently equipped gear.

### Named examples (illustrative, subject to budgets)

- **Ashguard Blade — Rare:** sword base, +4% melee power, +1 Blade Training.
- **Caldera Bow — Epic:** bow base, +6% ranged power, +1 Archery Basics with over-cap permission.
- **Warden's Cuirass — Legendary:** armor base, +6% maximum health, +1 Battle Conditioning with over-cap permission.
- **Prospector's Pendant — Rare:** +1 Mining Endurance and +5% maximum Vigour;
  no mining-tier unlock or extra detection capability.
- **Hearthkeeper's Shoes — Uncommon:** modest armor and +4% maximum Vigour;
  village crafting route with no combat-only ingredient.

Village stock guarantees common equipment. Crafted uncommon/rare equipment forms
the progression backbone; epic and legendary recipes consume volcanic materials.
Offer a seal exchange toward a chosen missing piece so repeated bad drops cannot
block a build. Sell-back and salvage values stay below acquisition inputs. Preview
exact stats and effective skill changes before spending, crafting or equipping.

## 9. Asset findings and import work

The reference images supplied with this request were reviewed for composition.
The local cliff entrance, volcanic terrain, Raven equipment-set sheet and furniture
sheet were also visually inspected. Other families below were located by inventory;
they still need semantic crop/animation review before import.

| Content | Located source/runtime assets | Required work |
| --- | --- | --- |
| Village architecture | `references/art/kenmi/cute-fantasy/core/Buildings/Buildings/`, including house families; imported agricultural buildings | Choose coherent house parts, roofs, doors and authored town prefabs |
| Furniture | `core/Buildings/House_Decor/`: Beds, Chairs, Tables, Carpets, BookShelves, Kitchen, Bathroom_Furniture, Standing_Lamps, Furniture_Other | Crop catalogue, orientation groups, icons, interaction/attachment/collision definitions |
| Cave facade | `core/Tiles/Cliff/Stone_Cliff_*_Cave_Entrance.png`; four imported matching props | Match the actual cliff; author portal and lower-ground approach |
| Lobby | Imported cave/dungeon doorway, wall/floor and interior prop families | Compose room, collisions, lights and transitions |
| Volcano | `references/art/kenmi/cute-fantasy/volcano/`; imported volcanic tile banks and enemy actors | Island composition, semantic lava/hazard roles, enemy animation audit |
| Equipment | `references/art/clockwork-raven/equipment/`: armor-500, weapons-800, equipment-sets, accessories-400, epic-armory; premium Epic Weapons 3 update | Select 45 semantic icons, names, quality treatment and explicit wearable-art mappings |

The Raven index lists 34 packs/44 native sheets; that is a discovery inventory,
not a count of ready-to-ship distinct equipment. Some Cute Fantasy index paths still
use the old `references/Cute_Fantasy/` layout; resolve the actual `art/kenmi` files
and refresh catalogs in the asset slice. Preserve provenance and import selected
regions through the existing asset pipeline. Source sheets do not ship wholesale.

## 10. Implementation slices and acceptance

| Slice | Deliverable | Exit gate |
| --- | --- | --- |
| P0 — Baseline and authoring study | Map survey, island layouts, cave placement, asset shortlist, dependency audit and balance baseline | Existing positions stable; chosen layout reviewed; doc 58/59 performance baseline recorded |
| P1 — Combat foundation | Reusable outdoor attack components, timing/feedback, dodge/block, region policy and test encounters | Two players and touch controls handle one melee and one ranged enemy reliably; protected areas cannot be damaged |
| P2 — Equipment foundation | Slot migration, authored weapon stats, five qualities, trained/effective ranks and comparison UI | Every item survives inventory/craft/storage/trade/reconnect paths; over-cap and negative tests pass |
| P3 — Map and Delve entrance | Both island landmasses and ferries; cliff facade, safe lobby and existing-run routing | Three islands visible/reachable; no saved-position drift; cancel/rejoin/victory/death/exit returns are correct |
| P4 — Village and homes | Complete village, service interiors, NPCs, 32 furniture items, cottage/expansions and internal construction | Buy → craft → place → rotate/move → store/remove works for two authorized builders and rejects visitors |
| P5 — Volcano and economy | Four enemy kinds, guardian, resource/loot tables, all 45 gear definitions and progression contracts | Shore playable in common gear; chosen legendary attainable predictably; retries cannot duplicate rewards |
| P6 — Release review | Content continuity, lighting/performance, migration/restore rehearsal and representative play sessions | All patch journeys pass on desktop/touch and under latency; baseline performance budgets hold |

P1/P2 feed the volcano; furniture authoring and island composition can proceed
independently once P0 fixes their contracts. Do not infer a calendar estimate from
the existing content volume: hostile regions, inventory migration and room building
are systems work. Estimate durations after the first combat and furnishing slices.

### Persistence and authoring contract

Extend existing definition registries for gear, skill boost policy, furniture,
recipes, NPCs/shops, loot and region profiles. New runtime capabilities require a
world-module release; routine content changes should then use the authoring suite.
Do not hide new mechanics in special-cased item names.

Furniture placement rows need stable identity, owning space, definition, logical
position, orientation, attachment and state. Reuse placeables/containers where
their contracts fit. Keep frequently changing combat state separate from encounter
definitions/reward eligibility. Index by actual space/chunk, owner and encounter
lookup paths. Keep private inventory/claim data private with caller-appropriate
projections; region subscriptions should not stream every shop interior or enemy.

Fixed authored gear needs no random-affix instance ledger. If randomized gear is
introduced later, it needs unique item identity and immutable rolled data carried
through inventory, cursor, ground, chest, crafting, trading, backup and restore;
current stacks contain only item kind, quantity, durability and light state.

### Meaningful verification

- Map compatibility: unchanged old-island terrain/landmarks and persistent player
  positions; new coastline seams, ferry arrivals, disconnected terrain and paths.
- Combat: authority replay, latency/touch input, tell/hit alignment, projectile
  crossing, protected docks/NPCs, leash reset, maximum attacker caps and restart.
- Gear: all five qualities, valid slots, body/crafting migration, inactive hotbar
  bonuses, bow/off-hand behavior, trained/effective rank caps, untrained and
  unimplemented nodes, respec, gear swapping, no self-qualification or double buffs.
- Homes: obstructed exits, wall attachments, rotated footprints, simultaneous
  placement/removal, full inventory, nonempty storage, unauthorized actors and restart.
- Economy: atomic payment/output, inventory-full results, concurrent purchases,
  duplicate encounter claims, sell/salvage loops and access to noncombat home progress.
- Delves: old tent returns, new lobby admission, equipment lock, exact resource
  restoration, no persistent boon leakage and cleanup after reconnect/exit/death.
- Visual/performance review at **https://orchard.dastari.net/**: village square,
  furnished home, cliff approach/lobby, volcanic group fight and fully equipped player
  in Basic/Dynamic lighting at day/night. Use doc 59's matched-device/viewport protocol
  and adopted budgets; include actual iPad evidence and bounded encounter/subscription
  load, not only screenshots or a desktop FPS counter.

## 11. Proposed decisions and remaining survey work

Recommended defaults are: real shared-map islands with a bounded volcanic danger
region; fixed named gear; +node ranks with controlled over-cap effects; permanent
rewards from the volcano; run-only Delve rewards; modular interiors within residence
envelopes; and a primary Delve entrance on the current island's northeastern cliff.

Before implementation, settle the exact cave coordinates and island outlines against
the current authored map, confirm the required performance milestones have landed,
and review one sample village block, furnished room and readable enemy encounter.
Those are concrete design checks, not reasons to hold the planning work open.
This proposal does not mark any feature complete or supersede adopted specs until
its relevant decisions are taken into implementation.
