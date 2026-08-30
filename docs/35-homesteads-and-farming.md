# 35 — Homesteads: Farming, the Gold Loop, Building, and Guest Access

Binding owner-directed spec (2026-08-26, crop amendment 2026-08-28). Status:
**the Shared Spaces demo, owner-farm/gate slice, complete first-pass crop loop,
quest-awarded Tier-1 land expansion, data-driven build palette, five prefab footprints,
refund-safe removal, Rich Soil/Selective Seeds/Barrel Cellar/Estate Vintage ladders,
offline-derived sprinklers, Homestead-wide greenhouse winter growth, direct online-roster
role management, and authoritative guest/worker/builder roles are implemented.
The access-request workflow, dedicated roster, shared output chest, and additional
land tiers remain future work**. This is
the farming update — a core pillar. It realizes the
"permissioned estates" promise of [07-multiplayer.md](07-multiplayer.md) and
doc 21's "farms return as instanced interiors" on the systems that now exist:
the spaces/portal model of [26-underground-mines.md](26-underground-mines.md)
(amended below — homesteads are the per-player instances), placement from
[28-crafting.md](28-crafting.md) §7, the coin purse + merchant commerce of
[31-npc-dialogue-and-commerce.md](31-npc-dialogue-and-commerce.md), the
statistics contract of [33-player-statistics.md](33-player-statistics.md), the
curation/overworld rules of [30-infinite-terrain.md](30-infinite-terrain.md),
and the scalability law of [34-backend-scalability.md](34-backend-scalability.md).
All tuning numbers mirror into [06-progression-economy.md](06-progression-economy.md).
Art is bounded by the licensed packs (docs/18 §7) — every asset named here is
sheet-verified (§11).

**Newer world-direction amendment (2026-08-26):**
[40](40-sanctuary-overworld-and-zoned-world.md) supersedes literal-scale overworld
farmhouses, generic flat Homestead generation, and the later overworld planting/build
hooks. A compact symbolic tent/estate POI leads to a generated Homestead exterior
whose surrounding landscape reflects its founding site; the full residence sits at
the exterior's north and has a separate furnishable interior space. The immediate
delivery scope is doc 40 §8's spaces technology demo, not all phases below.

The shape in one sentence: **an incremental-game loop wearing a cozy farm** —
plant → grow → harvest → barrel → sell for gold → reinvest in land, speed,
yield, and automation — running inside a private, instanced homestead that the
player establishes on the shared overworld, extends with gold, builds on with
a dedicated build mode, and opens to friends through explicit, owner-controlled
access.

## 1. The loop

```
        ┌──────────────────────────── gold ────────────────────────────┐
        ▼                                                              │
  buy seeds (merchant) → plant (hoe+plot) → grow (real time, watered) ─┤
        ▲                                                              │
        │                harvest → loose sale (quick, cheap)           │
        │                        └→ barrel → cure → bulk sale (premium)┘
        │
  reinvest: land expansion · growth % · yield % · sprinklers ·
            greenhouse · barrel cellar · (later: helpers, coops)
```

Incremental discipline applies: every sink/faucet is a `balance.ts` constant
mirrored in docs/06, upgrade costs use the existing `repeatCost(base, owned,
growth)` curve, and pacing targets get a docs/06 table (first expansion within
one session; sprinklers are the first "the game plays while I sleep" beat).

## 2. Establishing a homestead

- **The deed** is bought with gold through Marlow's merchant dialogue. It uses
  the plain-envelope cell from licensed `Cute_Fantasy_UI/UI/UI_Icons.png`, is
  stack-one/non-transferable, and is offered only while the character owns no
  Homestead. A failed placement never consumes gold or deed.
- **Siting**: the player places a compact Homestead POI on the overworld with a
  dedicated ghost. It must occupy reachable, unclaimed sanctuary ground without
  intersecting water/cliffs/protected scenery, another POI, spawn, or Marlow's camp.
  It reserves only its symbolic footprint—never the literal Inn dimensions. Site
  rules are pure sim functions shared client/authority; the reducer re-validates.
- **What appears on the map**: tier zero is a normal compact tent POI, later replaced
  by reviewed symbolic compositions for Shed → Fisherman's House → Blacksmith House
  → Inn. These represent the destination at world-map scale; they are not literal
  buildings and are the only player-created POI exception to the static overworld.
- **The POI entrance** is a doc 26 portal into the owner's Homestead exterior, gated
  by §8 access control. Knock/request happens there. The exterior's southern path
  returns to the overworld POI; its northern residence door enters a separate indoor
  child space.

## 3. The homestead space

- A per-player **instanced space** via the doc 26 `spaceId` dimension. Two
  amendments to doc 26 (recorded there + DECISIONS): `spaceId` widens from
  `u8` to `u16` *before* spaces implementation (cheap now, painful later), and
  per-player instances are explicitly in-model for homesteads (doc 26's
  "no per-player instancing" applied to *mines*, and still does).
- **New table `homestead`**: `{ exteriorSpaceId: u16 pk, residenceSpaceId: u16,
  owner: identity (unique), sizeTier: u8, establishedTick, poiTileX/Y,
  foundingWorldVersion, generatorVersion, siteSeed, siteProfile, namePlate,
  gateOpen: bool }`
  plus `homestead_upgrade { exteriorSpaceId, upgradeKind, rank }`. A normalized
  relation may replace the two explicit IDs before multi-floor residences, but both
  destinations must be durable and server-allocated.
- **Size/residence tiers**: 32² Big Tent → 48² Shed → 64² Fisherman's House →
  80² Blacksmith House → 96² Inn, bought with gold at steepening `repeatCost`.
  Expansion grows outward around stable paths/anchors and increases the residence
  interior's spatial furnishing capacity. Existing builds, crops, and furniture are
  never moved or invalidated.
- Exterior terrain is generated from a frozen magnification of the founding site's
  surrounding biome, water, forest, and elevation signals while guaranteeing a usable
  central farm/build clearing. The residence is generated/curatable through indoor
  build mode. Homesteads never mutate sanctuary-overworld terrain/curation rows.

### 3.1 SpaceTimeDB deployment and residency contract

“Instanced” means a separate **coordinate world**, not a separate SpaceTimeDB
database. One friends-server deployment owns one authoritative database and all
homesteads live in its shared tables, partitioned by `spaceId`. Do not deploy a
database/module instance per homestead: portal travel must remain one atomic
player-position transaction followed by a subscription handover, and inventory,
permissions, moderation, migrations, and backups must retain one authority.
The deed reducer allocates the `u16` ID server-side from a durable allocator,
skipping static/reserved IDs and relying on the `homestead.spaceId` primary key
plus owner uniqueness; clients never propose IDs, and exhaustion fails cleanly.

SpaceTimeDB keeps the authoritative table state memory-resident and persists
committed transactions. Leaving a homestead therefore does **not** unload its
rows from server memory. The bounded lifecycle is instead:

1. the portal reducer validates access and writes the player's destination
   `spaceId` and local coordinates atomically;
2. the client observes its own position, subscribes to the destination
   space/chunk rectangle, and only after `onApplied` unsubscribes the old
   rectangle (make-before-break);
3. unsubscribe evicts the old rows from that client's cache; it is bandwidth
   and client-memory lifecycle, not server persistence or authorization;
4. authority simulation considers a homestead active only while an online
   player occupies that `spaceId`; crops and curing still derive from timestamps
   and require no catch-up tick loop;
5. generated terrain/render/collision products may be recreated on demand and
   must use bounded caches with explicit eviction. Persistent mutation rows
   remain in SpaceTimeDB.

The `homestead` row is the dynamic definition source for
`spaceDefinitionFor(spaceId, homesteadRow)`. Every authority and client path
that resolves a non-static space must first obtain that row; calling
`spaceDefinitionFor(spaceId)` alone is valid only for static spaces. The dynamic
definition table/lookup and make-before-break subscription ordering are implemented;
later phases extend the same row rather than adding a second instance mechanism.

### 3.2 Implemented owner-farm and gate slice (2026-08-27)

- The owner may till and otherwise mutate the playable exterior plot. Every
  destructive reducer re-checks the caller against the authoritative Homestead
  row; visitors cannot farm, harvest, place, remove, open storage, or mutate
  furniture merely because their client can see the space.
- Homestead gates are closed by default. Only the owner, while in that exterior
  and within interaction range, can toggle the gate with `F`. An open gate admits
  visitors; a closed gate rejects entry. Exit portals never trap a visitor.
- A mounted player may travel between the sanctuary and a Homestead exterior and
  the authority moves the ridden horse in the same transaction. Indoor residence,
  tent, cellar, cave, and underground destinations keep the `no_horses` rule.
- This deliberately does not implement §8's member roles or requests yet. The
  owner/open-gate contract is the secure guest-access baseline those phases will
  extend.

## 4. Crops — implemented water-gated, zero-tick-write growth

The complete two-sheet catalogue is authoritative in `packages/sim/src/crops.ts`:
wheat, tomato, carrot, turnip, corn, pumpkin, parsley, cabbage, cucumber, hot
pepper, red/yellow/green peppers, watermelon, sunflower, garlic, potato,
strawberry, beetroot, onion, leek, and grapes. Every definition has four growth
stages, a sign, seed packet, produce icon, display name, duration, yield, and
merchant values. `Crops_2.png` is pixel-identical to the final eight groups of
`Crops.png`; the importer deliberately records it as the source for those groups.

- Marlow stocks all 22 seed packets through the exhaustive shared commerce
  registry. Planting consumes one selected packet and requires an empty tilled
  `world_soil` tile.
- Planting is supported on mutable sanctuary-overworld soil and on the owner's
  Homestead exterior. This explicit 2026-08-28 direction supersedes doc 40's
  blanket overworld-farming prohibition; it does not permit arbitrary building,
  resource destruction, or visitor mutation.
- Tilled and watered ground are sparse authoritative overlays. Clients derive
  their complete blob47 edge/corner topology from neighbouring rows, including
  a separate topology for the currently watered subset; no edge frame is stored
  in the database. Removing an overlay reveals the unchanged generated terrain.
- Empty overworld soil decays after seven game days from its most recent till,
  watering, or harvest. Planted soil never decays, and Homestead soil is
  permanent. Private one-shot timers enforce the deadline without scanning all
  farms on the movement tick; stale timers no-op after later care.
- `world_crop` stores crop kind, owner, tile/space/chunk, planted tick, settled
  watered-growth ticks, and its last boundary tick. Live progress is a shared
  pure function. There is no scheduled crop loop and no per-tick crop write.
- One watering lasts one game day (15 real minutes). Growth advances only during
  a watering window, pauses when it expires, and resumes from settled progress
  after watering again. Nothing withers, regresses, or dies. Current durations
  run 8–30 real minutes of watered time: quick crops complete in one care window,
  while premium crops require one return visit without blocking an entire session.
- Outdoor crops grow from spring through autumn and pause harmlessly in winter.
  A placed greenhouse removes that seasonal pause for its entire Homestead. This
  estate-wide rule is intentional: the authored greenhouse is a solid prefab whose
  occupied footprint cannot also contain reachable farmland.
- The client derives one of the four authored stages. Hovering any crop shows
  its name, watered/needs-water state, remaining real time, and a 16-step timer
  taken from `Cute_Fantasy_UI/UI/Loading_Icon.png`.
- A mature owner-grown crop harvests atomically into carried inventory, records
  crop/item statistics, and clears the crop while retaining tilled soil. Full
  inventory rejects before crop deletion. At any growth stage, the owner can use
  a hoe to dig up the crop without produce or harvest XP; this spends normal tool
  Vigour/durability and leaves the tile tilled. The first slice is single-harvest;
  regrowing varieties and fertilizer remain registry-compatible follow-ups.
  Tilling, watering, planting, harvesting,
  sealing/curing barrels, and cooking now award Farming XP at their authoritative
  completion points.
- The dormant `farm_parcel`/`crop_patch` demonstration is superseded. Its
  docs/08-compliant data retirement remains a separate migration.

## 5. Barreling and selling

- **Loose sale**: crops sell to any merchant at registry price
  (`commerce.ts` gains every crop + seed; doc 31's drift test keeps it
  exhaustive).
- **Barreling**: place a barrel, load 4–24 units of exactly one crop kind, and
  seal it. The immutable batch cures after 30 real minutes from `sealedTick`;
  settlement is timestamp-derived and works offline without per-tick writes.
  It becomes a stack of preserved produce worth +50% per unit. The preserved
  stack may then be removed and sold through ordinary merchant commerce.
  Sealing and completion award Farming XP; an incomplete or mixed batch is
  rejected atomically.
- Wallet math is doc 31's bronze/silver/gold; the coin icons already exist
  (`icon_cf_coin_*`).

## 6. The incremental layer (gold sinks)

Per-homestead upgrades, each `repeatCost`-laddered, all in the docs/06 mirror:

| Upgrade | Effect | Automation? |
|---|---|---|
| Land expansion (3 tiers) | more plots, room to build | — |
| Rich soil (ranks) | +growth rate % (modifier-pipeline `pctAdd`) | — |
| Selective seeds (ranks) | +yield % / bonus-crop chance | — |
| **Sprinkler** (placeable, tiered radius) | auto-waters coverage daily | ✓ works offline |
| **Greenhouse** (prefab building) | out-of-season growth across its Homestead | ✓ works offline |
| Barrel cellar (ranks) | +barrel capacity, faster curing | ✓ |
| Estate vintage (ranks) | longer aging for 2× / 4× / 8× Bottle value | ✓ |
| Scarecrow (placeable) | reserved for the doc 30 wildlife/bird-event hook | — |

Upgrade effects flow through the doc 25 modifier pipeline (`source: 'skill'`
equivalent — a new `'homestead'` source) so growth/yield math has one home.
Helpers/hired-hands automation and prestige interplay (docs/04–06 Vintage
heritage) are named later hooks, not v1.

## 7. Build mode — the `B` key

Implemented: `B` enters a non-modal data-driven build palette for owners and builders.
It keeps the hotbar visible, draws full-footprint valid/invalid ghosts, and shares
authoritative placement/collision rules with `F`. Five licensed prefabs use multi-tile
bottom-centre footprints. Removal returns the intact object inside five minutes and
deterministic 50% recipe materials afterwards; active or stocked processors cannot be
removed. Rotation and freeform terrain/furniture layers remain future extensions.

- `B` toggles build mode **inside a homestead where the player has `builder`+
  rights** (and on the overworld solely for the one-time deed placement).
  Build mode = palette window (docs/23 widgets) + tile grid overlay + ghost
  preview with valid/invalid tinting; rotation where art variants exist
  (fence orientations already committed).
- **Two build layers**:
  1. **Freeform tiles/props** — fences, gates, paths, wood floors, interior
     walls, doors, furniture (beds, tables, chairs, bookshelves, carpets,
     lamps), stations, torches, barrels: doc 28's `world_placeable`
     generalized with `spaceId`, paid in **materials** (doc 28 chains — wood,
     plank, stone, bars) exactly like crafting.
  2. **Prefab buildings** — barn, coop, shed, greenhouse, silo (pack
     `Unique_Buildings/` sheets, color variants): multi-tile footprint
     stamps paid in **gold + materials**, placed through the same ghost with
     footprint validation. Interiors of prefabs are walk-in visual shells in
     v1 (greenhouse is functional per §6; coop/barn become functional with
     the future ranching update).
- Removal refunds materials fully within 5 real minutes of placement
  (undo-grace), 50% after (cozy, but placement still matters).
- The build palette is data: one registry entry per buildable (art key,
  footprint, costs, layer, requires-tier) — content additions are rows, not
  code.

## 8. Access control — locked by default

- **Roles** (per homestead, stored `homestead_member { spaceId, identity,
  role, grantedBy, grantedTick }`): `guest` (enter, walk, chat), `worker`
  (guest + farm verbs: plant/water/harvest/barrel), `builder` (worker +
  build/remove), owner implicit. Harvest by workers goes to the **homestead's
  shared output chest**, not the worker's pockets — helping is helping.
- **Request flow**: a non-member at the door uses the interact prompt →
  "REQUEST ACCESS" → `homestead_request` row → the owner gets a toast +
  a persistent requests entry in a small homestead panel (docs/23 window):
  approve-as-role / deny / ignore. Requests expire after 3 real days.
  Owners can also invite proactively by name (doc 31's dialogue-modal
  input patterns).
- **Enforcement is authoritative**: the door portal reducer checks
  membership; every farm/build reducer re-checks role + spaceId (privacy via
  caller-filtered views for member lists and requests — doc 33-style, only
  the owner sees their roster). Revoke and **kick** (teleport to the door
  exterior, generalized teleport helper) are owner verbs, audited like admin
  actions. Blocking a player silently auto-denies their future requests.
- The world `owner`/admin role (docs/09) can enter any homestead for
  moderation; entries are audited.

## 9. Statistics registration (doc 33 contract — mandatory)

New `PLAYER_STATISTIC_DEFINITIONS` entries, recorded in the same transactions
as their outcomes: crops planted/harvested (subject: crop kind), water
applications, barrels filled/cured, gold earned selling (subject: item kind),
gold spent on upgrades (subject: upgrade kind), homestead expansions, guests
hosted, build placements (subject: buildable kind). Milestone thresholds per
doc 33 conventions; no UI in this doc's scope.

## 10. Scalability & netcode conformance (binding)

- **No per-tick farm work.** Crop stages and barrel curing are derived; the
  only scheduled touch is a slow (≥ 1-minute cadence, doc 34 multi-schedule)
  sweep for request expiry. Full-table iteration in the tick loop stays
  banned (doc 34).
- Homestead tables are `spaceId`-scoped and chunk-indexed; a client
  subscribes to homestead rows only when inside one (the doc 26 subscription
  swap). Hot-tick and overworld-subscription cost of N offline homesteads is
  their overworld building footprints only; their durable sparse rows still
  occupy shared server database memory.
- The homestead registry row needed to resolve the destination is subscribed
  before or with the regional handover. The destination subscription becomes
  renderable only after both its definition and regional snapshot are applied;
  only then may the old region subscription be released.
- Server-side occupancy is derived from online `player_position` rows grouped
  by `spaceId`. No offline homestead may participate in the 20 Hz movement,
  collision, NPC, projectile, crop, or automation loops. Slow global work must
  use an index/schedule and may not scan every homestead.
- **Bounded generated-data caches are a launch gate.** The current
  `SPACE_TERRAIN_COLLISION` process-level `Map` has no eviction. Homestead work
  must replace it with a capacity-bounded LRU and/or eviction when a space loses
  its final occupant; simple homestead terrain should prefer compact procedural
  collision over retaining a full array per farm. Client terrain/ground caches
  obey the same bounded-key rule. Persistent table rows are never treated as a
  cache and are not deleted when a player leaves.
- Subscription predicates are interest management, never authorization. Public
  spatial rows are readable by any approved connected friend even when their
  normal client is elsewhere. Roster, requests, permissions, inventories, and
  private storage use private tables plus caller-filtered views; every reducer
  independently validates sender, membership role, and target `spaceId`.
- All farm/build verbs are inputs-not-values reducers (docs/22): the client
  sends tile + action; stages, yields, cure levels, and costs are always
  server-recomputed. Ghost previews are pure client cosmetics.

## 11. Art inventory (sheet-verified, licensed)

Houses ×99 variants + Barn/Coop/Shed/Greenhouse/Silo/Windmill
(`Buildings/`); interior walls/floors/stairs + full furniture set
(`House_Decor/`); `Crops.png`/`Crops_2.png` stage strips + committed
`crop_cf_*` matures + `Grapes_Bower.png`; seed-packet icons
(`Other_Icons_2` sheet — seen and verified); fences/gates/paths committed;
barrels committed; sprinkler: no dedicated sprite in packs — use the
`Water_Troughs.png`/well family or commission a small original (flagged, the
one art gap); scarecrows (`Scarecrows.png`). Extraction follows docs/11/18 +
`pixel-art` skill.

## 12. Phasing

1. **Shared Spaces technology demo (doc 40 §8; phase 1 implemented):** dynamic-definition
   lookup/subscription, bounded caches and occupied-space hot work; add test forest,
   cave and deeper-underground destinations; have Marlow sell a deed that atomically
   places a compact tent POI leading to an owner-only tier-zero exterior. Add the
   authored tent-interior child space. The 2026-08-27 owner-farm, outdoor mounted
   travel, and owner-controlled gate slice is also implemented (§3.2). Doc 40 §8.0
   remains authoritative that the tent-interior/cellar child-space phase and the full
   demo acceptance are unfinished.
2. **Homestead core after the demo:** freeze the founding environmental profile,
   generate the site-reflective exterior/path/northern residence, add the explicit
   residence-interior space, implement the five residence/land tiers, and retire
   legacy farm tables.
3. **Crops + gold loop**: seeds in commerce, plant/water/harvest, derived
   growth, loose selling, first upgrades (soil/seeds ranks). *The
   incremental loop closes here.*
4. **Barreling + automation**: crop-preservation barrels, curing, timestamp-derived
   sprinklers, greenhouse winter override, and the Barrel Cellar ladder are
   implemented. The fruit→Must→Bottle production chain is doc 46.
5. **Build mode**: palette, prefab footprints and refunds are implemented; rotation
   and the authored terrain/furniture catalogue remain.
6. **Access control**: role enforcement, direct grant/change/revoke/kick authority and
   caller-filtered streaming are implemented. The Online Players roster provides
   direct role cycling and revocation; requests/notifications, a dedicated estate
   roster, shared output chest, and moderation entry remain.
7. **Later hooks**: ranching (coops/barns functional — the wildlife
   variants are ready), helpers, farm-gate sales, bird-raid events + scarecrow,
   prestige/Vintage interplay, and Homestead visiting showcases. Overworld planting
   and general overworld building are permanently excluded by doc 40.

## 13. Out of scope

Animal husbandry; food/cooking execution (doc 31's campfire placeholder +
doc 28 gating stand); PvP or player-to-player trade UI (drop-trading and
shared chests remain); homestead-to-homestead fast travel; decor scoring;
seasonal crop festivals; prestige integration.

## 14. Tests and acceptance

- **Unit (sim):** stage derivation goldens per crop (named `06§<mirror>`)
  incl. watering boundaries, season pauses, greenhouse override, regrow
  counts; cure curve; upgrade cost ladders; site-validation fixtures; build
  registry footprint/cost integrity; commerce drift test extended to crops/
  seeds/barrels.
- **Reducer:** every farm/build/access verb happy + role-rejection +
  auth-failure; deed idempotence (one homestead per character); expansion
  preserves existing rows; worker harvest routes to shared chest; kick/
  revoke; request expiry; statistics recorded transactionally (doc 33
  test pattern).
- **Two-client:** owner + guest walkthrough — request, approve as worker,
  co-farm, harvest-to-shared-chest, revoke mid-visit (verbs die instantly,
  presence persists until exit), kick teleports; non-member door rejection;
  builder places/removes with refunds while owner watches.
- **Browser:** full loop playthrough — deed → plant → water → harvest →
  barrel → cure → sell → buy expansion — in one session; build-mode ghost
  validity feedback; B-key mode across UI scales; offline growth (clock
  advance) correctness.
- **Perf:** zero farm writes during idle ticks with 10 populated homesteads
  (doc 34 counters); subscription swap on door transit within one handover;
  create/visit/leave at least 1,000 synthetic homesteads under a small cache
  capacity and prove terrain/collision memory returns to its configured bound;
  prove an unoccupied farm contributes zero rows to every hot-tick working set.

## 15. Bookkeeping

- **docs/06**: new "Homestead economy" section — every §4/§5/§6 number.
- **docs/26**: amendments — `spaceId: u16`; homesteads as sanctioned
  per-player instances (mines stay shared). **docs/28**: §7 note that build
  mode is the placement system's second consumer. **docs/31**: commerce
  registry gains crops/seeds/barrels (drift test covers it). **docs/07**:
  mark permissioned estates as realized by this doc.
- **docs/00** map row; **docs/14** milestone entries for §12.
- **DECISIONS.md** on adoption: (1) homesteads are per-player instanced
  spaces on the doc 26 model with `spaceId` widened to u16; (2) crop growth
  and curing are derived from rows, never ticked — zero-write growth is
  binding; (3) farming is Homestead-only; sanctuary-overworld planting prohibited;
  (4) access is role-tiered (guest/worker/builder) with owner-controlled
  requests, and worker harvests route to the homestead's shared chest;
  (5) nothing withers — unwatered and out-of-season crops slow or pause,
  never die.
