# 35 — Homesteads: Farming, the Gold Loop, Building, and Guest Access

Binding owner-directed spec (2026-08-26). Status: **design approved, not
implemented**. This is the farming update — a core pillar. It realizes the
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

- **The deed** is bought with gold through merchant dialogue (Marlow v1; an
  estate-agent NPC is a later hook). One homestead per character.
- **Siting**: the player places their farmstead on the overworld with the
  build-mode ghost (§7): footprint must be on flat, buildable, unclaimed land
  (no cliffs/water/resources/curated-protected chunks; minimum distances from
  spawn, other homesteads, and Marlow's camp). Site rules are pure sim
  functions shared client/authority — prediction shows a valid/invalid ghost,
  the reducer re-validates.
- **What appears on the map**: a farmhouse (pack `Houses/` sheets — owner
  picks a style/color variant at purchase) with a door portal and a name sign.
  The footprint occupies real overworld tiles (rows in the placeable/building
  tables, collision like any structure) so friends walk past your house on
  the shared map — presence is the point.
- **The door** is a doc 26 portal into the owner's homestead space, gated by
  §8 access control. Knock/request happens here.

## 3. The homestead space

- A per-player **instanced space** via the doc 26 `spaceId` dimension. Two
  amendments to doc 26 (recorded there + DECISIONS): `spaceId` widens from
  `u8` to `u16` *before* spaces implementation (cheap now, painful later), and
  per-player instances are explicitly in-model for homesteads (doc 26's
  "no per-player instancing" applied to *mines*, and still does).
- **New table `homestead`**: `{ spaceId: u16 pk, owner: identity (unique),
  sizeTier: u8, houseStyle, establishedTick, doorTileX/Y (overworld),
  namePlate }` plus a `homestead_upgrade` table `{ spaceId, upgradeKind,
  rank }`.
- **Size tiers**: 32² → 48² → 64² → 80², bought with gold at steepening
  `repeatCost`. Expansion extends the space's generated flat farmland (the
  space generator is a trivial doc 26-style generator: tilled-ready soil,
  border hedge, the farmhouse interior anchor). Existing builds/crops are
  never moved by expansion — the space grows outward.
- Interior terrain is generated + curatable by the owner through build mode,
  not hand-authored — homesteads never touch the overworld curation tables.

## 4. Crops — zero-write growth

Six crops at launch, all with committed or sheet-verified stage art
(`Crops.png` 112×704 stage strip + committed `crop_cf_*_mature`):

| Crop | Seasons | Stages / real time | Notes |
|---|---|---|---|
| wheat | spring/summer/autumn | 4 / 40 min | cheap starter, fiber by-product |
| carrot | spring/autumn | 4 / 30 min | fastest, lowest margin |
| tomato | summer | 5 / 60 min | **regrows** (3 pickings) |
| corn | summer/autumn | 5 / 80 min | high yield |
| pumpkin | autumn | 5 / 120 min | premium single |
| grapes | summer/autumn | 5 / 90 min | bower prop art; regrows; the cellar-heritage crop |

- **Growth is derived, never ticked** (doc 34 law): a planted crop row is
  `{ spaceId, tileX/Y, kind, plantedTick, wateredUntilTick, pickingsLeft }`;
  the current stage is a pure function of `(authorityTick, row, upgrades)`
  computed identically by client (render) and authority (harvest validation).
  **Zero writes while growing** — planting, watering, and harvesting are the
  only mutations. Offline growth is therefore free and full-rate (cozy;
  sprinklers exist to remove the watering chore, not to gate offline play).
- **Watering** (can or sprinkler coverage) halves stage time while
  `wateredUntilTick` holds (one real day per watering). Unwatered crops grow
  at base rate — **nothing withers, nothing dies** (docs/06 §10 floor).
  Out-of-season crops pause growth unless under greenhouse cover.
- Planting requires a homestead plot in v1 (owner or `worker`+ role).
  Overworld planting stays a later hook — the shared-map soil verbs remain as
  today. Existing dormant `farm_parcel`/`crop_patch` tables are superseded;
  their docs/08-compliant retirement is part of phase 2.
- Vigour costs apply to hoe/water/harvest per doc 25 §4 — farming and the
  vitals economy stay one system.

## 5. Barreling and selling

- **Loose sale**: crops sell to any merchant at registry price
  (`commerce.ts` gains every crop + seed; doc 31's drift test keeps it
  exhaustive).
- **Barreling**: place a barrel (doc 28 placeable — finally load-bearing),
  fill with up to 64 of **one** crop kind; a full barrel **cures** — derived,
  zero-write, from `sealedTick` — reaching +50% unit value at 24 real hours
  (soften-curved, no further gain). Selling a barrel's contents needs a
  merchant visit with the barrel carried (chest-carry mechanics reused) or
  farm-gate pickup as a later hook. Cured bulk beats loose by enough to make
  logistics an *optimization decision* — the incremental player's first
  routing puzzle.
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
| **Greenhouse** (prefab building) | out-of-season growth inside footprint | ✓ |
| Barrel cellar (ranks) | +barrel capacity, faster curing | ✓ |
| Scarecrow (placeable) | reserved for the doc 30 wildlife/bird-event hook | — |

Upgrade effects flow through the doc 25 modifier pipeline (`source: 'skill'`
equivalent — a new `'homestead'` source) so growth/yield math has one home.
Helpers/hired-hands automation and prestige interplay (docs/04–06 Vintage
heritage) are named later hooks, not v1.

## 7. Build mode — the `B` key

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
  swap). Overworld cost of N homesteads = their building footprints only.
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

1. **Spaces prerequisite** (shared with doc 26 phase 1, whichever lands
   first): `spaceId: u16` plumbing, portals, per-space collision/subscription.
2. **Homestead core**: deed, siting, farmhouse on overworld, instanced space,
   door lock (owner-only), expansion tiers. Retire legacy farm tables.
3. **Crops + gold loop**: seeds in commerce, plant/water/harvest, derived
   growth, loose selling, first upgrades (soil/seeds ranks). *The
   incremental loop closes here.*
4. **Barreling + automation**: barrels, curing, sprinklers, greenhouse.
5. **Build mode**: palette, freeform layer, prefabs, refunds.
6. **Access control**: roles, requests/notifications, shared output chest,
   revoke/kick, moderation entry.
7. **Later hooks**: ranching (coops/barns functional — the wildlife
   variants are ready), helpers, farm-gate sales, overworld planting,
   bird-raid events + scarecrow, prestige/Vintage interplay, homestead
   visiting showcases.

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
  (doc 34 counters); subscription swap on door transit within one handover.

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
  binding; (3) farming v1 is homestead-only; overworld planting deferred;
  (4) access is role-tiered (guest/worker/builder) with owner-controlled
  requests, and worker harvests route to the homestead's shared chest;
  (5) nothing withers — unwatered and out-of-season crops slow or pause,
  never die.
