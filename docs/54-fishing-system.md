# 54 — Fishing System

Historical phase-one design (2026-08-31). The live fishing system now uses authored item lifecycles; this document retains the original implementation plan below. The 0.14.0 progression amendment is current.
Builds on docs 20 (survival world), 22 (netcode), 25 (stats & vitals), 28
(crafting), 33 (statistics), 45 (hunger/cooking loop), 48 (mining loop — the
spawn-system template).

## Design intent

Fishing is a calm, low-interaction gathering verb: walk to a pond, cast at a
fish pool, watch a small progress bar fill, collect the catch. **There is no
minigame** — no bite timing, no tension meter, no reeling input. The single
progress bar during the cast is the entire mechanic. Depth comes from the loop
around it (pool spawns, rarity ladder, cooking, random treasure), not from
execution skill.

Much of the plumbing already exists dormant and this doc promotes it:

| Already shipped | Where |
|---|---|
| Rod vigour cost (600 centi, 6-tick swing) | `sim/src/balance.ts:192` |
| Rod durability (160 uses, wood repair) | `sim/src/balance.ts:213` |
| `fishing_wait` looping avatar action | `sim/src/actions.ts:18` |
| `fishingCatchQuality()` common/good/rare check vs Dexterity | `sim/src/checks.ts:52` |
| Reserved `fish_caught` statistic (subject: fish kind) | `sim/src/player-statistics.ts:37` |
| Animated fish shadow sprite (16f `sway` @5fps) | `assets/props/nature_cf_fish_shadow_01.sprite.json` |
| Pond predicates `pondWaterBiome` + `waterSquareAt` | `sim/src/survival-world.ts:2089–2101` |
| `fish_cast` / `fish_reel` player animation rows (44–49) in the source sheet | `docs/11-asset-pipeline.md:264` |
| Wooden rod held-tool sheet | `references/art/kenmi/cute-fantasy/core/Player/Tools/Fishing_Rod/Wooden_Fishing_Rod.png` |
| Reserved crafting recipe: 3 stick (diagonal) + 2 fiber → rod | `docs/28-crafting.md:211` |

## Player loop

Craft or buy a wooden fishing rod, find a fish shadow in a pond, cast at it,
wait ~4 seconds while the progress bar fills, receive raw fish (and sometimes a
bonus item), cook the fish at any cooking fire, eat or sell it. Pools deplete
after a few catches and relocate elsewhere in the pond system, so fishing spots
rotate the way surface ore does.

## The fishing rod (item)

- New `ITEM_DEFINITIONS` entry `fishing_rod` (`sim/src/item-containers.ts:75`):
  display name "Fishing Rod", maxStack 1, tags `item.tool`, `gear.hand`, icon
  `item_cf_fishing_rod`. Durability/vigour rows already exist in balance.
- Crafting: implement the reserved recipe from docs/28 — **3 stick (diagonal) +
  2 fiber → 1 fishing_rod** in `sim/src/recipes.ts`. This is the first tool
  recipe; it makes the rod reachable without money on day one.
- Merchant: add to `TOOL_MERCHANT_OFFERS` and `ITEM_ECONOMY`
  (`sim/src/commerce.ts:134`, `:45`) at **400 bronze buy / 160 sell**, matching
  the watering-can tier. `ITEM_ECONOMY` is contractually exhaustive over
  `KnownItemKind`, so the price entry is mandatory, not optional.
- Repair: anvil, 5 bronze + wood, via the existing `repairSelectedToolAtAnvil`
  path — no new code.
- Wear: 1 durability per **completed** cast (not per whiff), like tools.

> Known bug to fix while here: `sim/src/merchant-cart.ts:78` hard-codes the
> purchase check to `TOOL_MERCHANT_OFFERS` regardless of shop. Harmless for the
> rod (it lives in that list) but wrong for every other shop; take the offer
> set as a parameter.

## Fish pools — spawn system (mirrors mining, docs/48)

Fish pools are **authoritative rows**, not decorations. The existing decorative
`nature_fish_shadow` pond roll (`sim/src/survival-world.ts:2232`) is removed;
from now on every fish shadow a player sees IS a fishable pool driven by a
server row. This satisfies the docs/25 warning against silently promoting the
cosmetic shadow into gameplay: the shadow becomes the render of real state.

Reuse `world_resource` with a new kind rather than a new table — the mining
columns map cleanly and the respawn sweep already exists:

- `kind: 'fish_pool'`, placed on pond water; `richness` = catches remaining,
  `maximumRichness` from a deterministic 2–4 roll; `depleted` + `respawnAtTick`
  + `spawnSiteId` + `activationOrdinal` exactly as surface ore uses them
  (`world/src/index.ts:1516–1528`).
- **Candidate sites**: a `buildFishPoolSpawnSites()` sibling of
  `buildSurfaceOreSpawnSites()` (`sim/src/survival-world.ts:2306`) that walks
  pond tiles, requires `waterSquareAt(tile, 2)` (the same 5×5 all-water rule
  the decorative shadow used), and rejects tiles within reach of spawn
  landmarks. Sites are simulation data, never streamed.
- **Active cap**: 24 active pools topside, minimum spacing 10 tiles, selected
  by the same lowest-hash ordering as `buildRareOreLayout()`
  (`sim/src/survival-world.ts:2343`), with stable slot ids from a new
  `FISH_POOL_RESOURCE_ID_BASE`.
- **Respawn**: handled inside the existing `respawnMiningResources` 5-second
  sweep (`world/src/index.ts:4946`) — a depleted pool waits a deterministic
  **3–8 minutes** (`statelessRoll` on slot + ordinal, label
  `'fishing.respawn'`), then relocates to the first unoccupied candidate, same
  as surface ore relocation. Shorter than ore because a pool yields less per
  visit.
- Homestead/instanced spaces: none in phase one; pools are topside-pond only.

Client render: a `world_resource` row of kind `fish_pool` draws the existing
`fish_shadow` sprite with its `sway` animation at the pool tile (flat lighting,
non-blocking, exactly like today's decoration). No new art needed for pools.

## Casting — the whole mechanic

Server model is the **bow-charge two-phase pattern** (`bow_charge`,
`world/src/index.ts:608`, `:11566`) because it is tick-scan-free and the
authority never trusts client timing (doc 53's rule: no new per-tick sweeps).

1. **`castFishingRod(poolId, targetTileX, targetTileY)`** (modeled on
   `harvestResource`'s preamble): requires an equipped `fishing_rod` with
   durability and a clear water tile within the same three-tile range as the
   watering can. A pool only counts when it occupies that exact tile. It
   spends rod vigour via `spendToolVigour`, faces the player toward the tile,
   writes `actionKind: 'fish_cast'` (new one-shot) which the client chains into
   the `fishing_wait` loop, and inserts a private one-row
   **`fishing_cast`** table row: `identity pk, poolId, startedTick,
   targetTileX, targetTileY`. Casting at ordinary open water (`poolId = 0`)
   is the half-Vigour whiff path: its line and bobber remain visible until the
   automatic reel, but it produces no catch and wears no durability.
2. **Wait**: cast duration is a flat **80 ticks (4 s)** constant
   (`FISHING_CAST_TICKS`) known to both sides. Movement, damage, or equipping
   another slot deletes the cast row and clears the action
   (`fishing_wait.interruptibleByMovement` is already true; add the same
   cleanup hooks bow charge has at disconnect `:6531`).
3. **`reelFishingRod()`**: deletes the cast row (single-use token, like
   `fireBow`), and validates authoritatively: `authorityTick - startedTick >=
   FISHING_CAST_TICKS`, pool still exists and not depleted. On success:
   resolve the catch (below), decrement pool richness, mark depleted +
   `respawnAtTick` when it hits zero, wear the rod, record statistics, grant
   XP, play `fish_reel` as the finishing one-shot action. The client calls
   this automatically when its local bar fills — there is no player input
   between cast and catch.

**Progress bar**: the first real consumer of the shipped-but-unused
`drawProgressBar` widget (`packages/ui/src/progress-bar.ts`,
`GREEN_PROGRESS_PALETTE`). A ~20×3 px bar floats above the player's head only
while a `fishing_cast` row exists for the local player, filled by
`(renderTick - actionStartedTick) / FISHING_CAST_TICKS` — fully client-derived
from replicated state, no extra networking. Other players see the
`fishing_wait` pose but no bar.

**Bobber/line**: per docs/22:246, NOT action state. Phase one ships without a
bobber; the cast pose + shadow + bar carry the read. A client-side particle
line is a later polish item.

**Multiplayer**: no claim lease in phase one. Two players can cast at the same
pool; richness decrements per catch first-reel-first-served. (Mining-style
30-second leases are an extension if contention becomes hostile.)

## Catch resolution — rarity and random rewards

All rolls are `statelessRoll`/`hashSeedParts` (`sim/src/checks.ts`) seeded on
`worldSeed, identity, poolId, richnessRemaining, 'fishing.catch'` — fully
deterministic, testable, and server-only. A new pure helper
`resolveFishingCatch()` in `sim/src/fishing.ts` mirrors `resolveMiningYield()`
(`sim/src/mining.ts:95`):

- Quality ladder: the dormant `fishingCatchQuality(seed, dexterity)`
  (`sim/src/checks.ts:52`) — Dexterity's first live hook, exactly as
  docs/25 planned.
  - **common** → 1× `raw_fish`
  - **good** → 2× `raw_fish`
  - **rare** → 2× `raw_fish` + a bonus-table roll
- Bonus table (weighted, rolled out of 1000 like rogue rarity,
  `sim/src/roguelike.ts:277`): 400 `fiber`, 250 `wood`, 150 `stone`, 120
  `bottles`-tier junk→`pebble`, 60 `copper_fragment`, 20 `gem_fragment`-tier
  surprise. Every pool's **final** catch is guaranteed at least *good* (the
  mining pity-rule pattern, `sim/src/mining.ts` luck protection).
- Delivery: `insertPlayerCarriedItem` straight to hand; on full inventory fall
  back to `dropWorldItemStack` at the shoreline with the standard 10-second
  `reservedFor` reservation.
- Statistics: un-reserve `fish_caught` (subject `raw_fish`); count whiffs
  under the existing `tool_whiffs`.
- Progression (0.14.0): successful catches grant **5 Farming XP**, with **10 additional Farming XP** when an ordinary pool depletes. Personal tutorial catches award 5 Farming XP without the depletion bonus. Farming contains the Angler's Rhythm, Seasoned Angler and Fishing Mapping specializations. Previous Explorer XP and purchased ranks are preserved; failed/cancelled casts award nothing.

## Fish as food — cooking integration

One species in phase one: `raw_fish` → `cooked_fish`. The entire integration
is five entries in `sim/src/food.ts` (no schema or migration work — cooking
job rows store recipe/item kinds as strings):

| Entry | Value |
|---|---|
| `FOOD_ITEM_DEFINITIONS` | `raw_fish`, `cooked_fish` — maxStack 32, tags `food.raw`/`food.cooked` + `item.consumable`, icons `item_cf_raw_fish` / `item_cf_cooked_fish` |
| `RawFoodKind` / `CookedFoodKind` unions | extend both |
| `CAMPFIRE_COOKING_RECIPES` | `cook_fish`: raw→cooked, **40 s/item**, 5 Farming XP/item |
| `FOOD_RESTORE_CENTI` | `cooked_fish: 2400` (between chicken 2800 and crops; raw fish stays inedible like raw meat) |
| `FOOD_ECONOMY` | raw 16 sell / cooked 32 sell, buy `null` — the established raw×2 rule |

Adding the recipe entry alone lights up **both** cooking paths (campfire batch
job and the two-slot cooking-fire station) plus their existing progress UI —
no client cooking work at all. Icon loading is automatic once the sprites
exist (`loadItemIconArt` iterates `ITEM_DEFINITIONS`).

## Art & animation (pixel-art skill for authored pieces)

| Asset | Source | Work |
|---|---|---|
| Player `fish_cast` (3 dirs) + `fish_reel` (3 dirs) | rows 44–49 of `Player_Base_animations.png`, already documented in docs/11 | extend `animationRows` in `tools/src/extract-cute-fantasy-player-actions.ts:43` — extracts across all 23 modular clothing layers at once |
| Held rod action sheet | `Fishing_Rod/Wooden_Fishing_Rod.png` (64×64 modular grid) | import via the held-tool compositing precedent; register in `art.actionAssets` (`client/src/overworld-art.ts:981`) and `AVATAR_ACTIONS` (`fish_cast` one-shot; add `equippedKind: 'fishing_rod'` so `avatarActionForEquippedKind` resolves) |
| `item_cf_fishing_rod` icon (16×16) | none in icon sheets | **hand-author** (crop/redraw from the rod sheet's held frame) |
| `item_cf_raw_fish` / `item_cf_cooked_fish` icons (16×16) | **no fish icon exists anywhere in the reference pack** (verified against all four icon sheets) | **hand-author both**, matching the raw/cooked meat icon language (raw: cool blue-grey fish on its side; cooked: browned fillet on the same silhouette) |
| Fish pool | existing `nature_cf_fish_shadow_01` | no work |
| Progress bar | existing `ui/progress-bar.ts` widget | no art work |

Animation contract per the netcode doc: `fish_cast` is a one-shot
`actionKind`, `fishing_wait` a loop, `fish_reel` a one-shot; the client
animation controller (`client/src/net/netcode.ts:443`) already handles all
three playback shapes.

## Explicitly out of scope (phase one)

- Bite-timing minigame, tension meter, exclamation-mark reactions — **never**,
  by design, not just deferred.
- Bait/tackle (the `REQUIRED_AMMUNITION` pattern exists if ever wanted).
- Multiple fish species, fish size records, aquariums, legendary fish.
- Ocean/deep-water fishing and fishing from the boat (pond pools only; boat
  fishing interacts with the mount restrictions and needs its own pass).
- Pool claim leases and party fishing.
- Fisherman Fin NPC (sprite exists, unwired) — natural future rod/fish
  merchant and quest-giver, separate doc.

## Implementation phases

1. **Sim foundations** — `sim/src/fishing.ts` (`resolveFishingCatch`,
   constants), food.ts entries, item/economy/recipe registrations,
   `buildFishPoolSpawnSites` + layout in survival-world.ts. Pure functions,
   fully unit-testable, no schema changes.
2. **Authority** — `fishing_cast` table + `castFishingRod`/`reelFishingRod`
   reducers, `fish_pool` rows through the existing respawn sweep, decorative
   shadow roll removed, cleanup hooks, statistics/XP. Schema tests pin the
   cast-row auth pattern (guarded like `bow_charge`).
3. **Client** — animation extraction + action wiring, pool shadow render from
   resource rows, auto-reel timer, progress bar, hover panel text
   ("FISH POOL — 3 CATCHES LEFT" in the mining hover-panel style).
4. **Art** — three hand-authored icons, review renders beside the meat icons.

## Definition of done

- [ ] Rod craftable at a workbench and buyable from the tool merchant; repairs
      at the anvil; wears 1/catch; `merchant-cart.ts:78` shop-gating bug fixed.
- [ ] Casting at a pool shows the progress bar and yields deterministically
      seeded catches; casting at open water whiffs vigour only; moving cancels.
- [ ] No new per-tick scans: cast resolution is client-triggered +
      authority-validated; pool respawn rides the existing 5 s mining sweep.
- [ ] Every visible fish shadow is a fishable pool; pools deplete, wait 3–8
      min, and relocate; decorative-only shadows no longer spawn.
- [ ] `raw_fish` cooks to `cooked_fish` at both cooking paths; cooked fish
      restores 2400 centi hunger; raw fish is rejected by `eatSelectedFood`.
- [x] `fish_caught` statistic live; Farming XP on catch/depletion, never on
      whiffs; `fishingCatchQuality` exercised by unit tests across Dexterity
      ranks.
- [ ] All three icons pass `assets:validate` and the style-bible review render
      beside the meat icons.
