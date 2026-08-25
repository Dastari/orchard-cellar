# 28 — Crafting Expansion: Materials, Stations, Recipes, and Placeables

Binding owner-directed spec (2026-08-25). Status: **design approved, not implemented**.
Builds on [23-ui-system.md](23-ui-system.md) (grid/recipe/container machinery — the
"recipes/content are a later milestone" it deferred is this doc),
[20-survival-world.md](20-survival-world.md) (resource drops, tool-strip roster),
[25-stats-and-vitals.md](25-stats-and-vitals.md) (equipment modifiers, INT quality
hook, `orchard_tea`), [26-underground-mines.md](26-underground-mines.md) (torch/
lantern/gem items this doc gives recipes to), and
[27-lighting-design.md](27-lighting-design.md) (placeable light emitters).
Recipe *numbers* mirror into [06-progression-economy.md](06-progression-economy.md)
per standing policy.

Design mandate: **Minecraft-style** — gather raw materials, refine them through
stations, craft tools/gear/placeables on a grid — with content **strictly limited
to art the licensed paid packs provide** (docs/18 §7; `Cute_Fantasy_Free` is
non-commercial and contributes nothing here). Every item in this doc is
art-verified against a pack sheet; the inventory sweep is §3/§11.

## 1. Baseline — what exists and what must be fixed first

Shipped today: 26 item kinds; a 3×3 crafting grid always available in the
inventory (`C`); shaped + shapeless recipe matching in `item-containers.ts`; the
`craftInventoryRecipe` reducer re-validating server-side (inputs-not-values);
chest containers end-to-end; `useHands` place/carry/pickup **hardcoded to
chests**. Exactly two recipes exist (`1 wood → 4 plank`, `8 plank → chest`).
There is **no ore sink at all** — eight ore kinds, 32 units per node, zero
consumers. Barrel is a UI shell (item + window, no table/recipe/placement).
Apples/grapes are defined but unobtainable. Fishing/bow/sword/lantern/torch from
the docs/20 tool strip don't exist as items.

Required fixes folded into phase 1 (each is a landmine for content authoring):

1. **Shaped matching becomes shift-invariant**: normalize a recipe to its
   bounding box and match at any grid offset (`recipeMatches` currently anchors
   at index 0, so a 2×2 recipe only matches top-left). No mirroring (like
   Minecraft, patterns are handed).
2. **One item registry, not four edit sites.** `ItemDefinition` gains
   `displayName` (and `iconKey` defaulting to `icon_cf_<kind>` /
   `item_cf_<kind>` by convention); `HOTBAR_LABELS`/`HOTBAR_NAMES` and the
   `OverworldUiItemArt` wiring derive from it. Adding an item becomes: one
   definition entry + sprite files.
3. **Delete the drifted `compositions.ts` crafting path** (its `dev_planks`
   recipe id doesn't exist) or re-point it at real ids — test-only, but rot.
4. **The "workbench" naming collision is resolved**: docs/06 §"Workbench…
   upgrades" (the fruit-currency upgrade *shop* of the retired farm scene) is
   renamed "farmhouse upgrade counter" in the docs; from this doc on,
   **workbench = the placeable crafting station**. Recorded in DECISIONS.

## 2. The design shape

Three chains, Minecraft's spine adapted to our verbs:

```
gather                refine                      make
──────                ──────                      ────
wood  ──────────────▶ plank ──▶ stick ──────────▶ tools, fences, signs, stations
stone ───────────────────────────────────────────▶ furnace, arrows
iron/copper/gold ore ─▶ (furnace + fuel) ─▶ bars ─▶ metal tools, plate gear, lantern
gem ores ────────────▶ (anvil) ─▶ cut gems ──────▶ jewelry (with gold bars)
fiber (tilling) ─────────────────────────────────▶ torch, bow, fishing rod
```

- **Grid crafting stays the one interaction.** No station has its own crafting
  UI except the furnace (which is stateful, §5.2). Stations gate recipes by
  **proximity**: a recipe tagged `station: 'workbench'` crafts in your normal
  3×3 grid only while a placed workbench is within reach (2 tiles — the chest
  reach rule). The result slot shows the match with a lock overlay and
  "REQUIRES WORKBENCH" tooltip when the station is missing. This keeps one UI,
  one reducer (now also checking station proximity server-side), and still
  makes placing your first workbench a real progression beat.
- **Hand recipes** (no `station` field) stay craftable anywhere — planks,
  sticks, torches, campfire: the "stranded on the beach" tier.
- **Placeables are the output that changes the world** (§7): stations, fences,
  barrels, signs, light sources — generalizing the chest placement path.

## 3. New items (all art-verified, paid packs only)

Existing 26 kinds keep their ids. New kinds, with art source:

| Item | Stack | Tags (new vocab in bold) | Art source |
|---|---:|---|---|
| `stick` | 99 | item.resource, material.wood | `Icons/Resources_Icons` sheet |
| `fiber` | 99 | item.resource, **material.fiber** | `Icons/Resources_Icons` sheet |
| `iron_bar`, `copper_bar`, `gold_bar` | 99 | item.resource, **material.bar**, metal.\<x\> | `Icons/Resources_Icons` (bar icons) |
| `gem_emerald/sapphire/topaz/ruby/amethyst` | 99 | item.resource, **material.gem** | `Icons/Resources_Icons`; mines doc's gem items |
| `torch`, `lantern` | 16 / 1 | item.tool, gear.hand, **emits.light** | `Player/Tools/Other/*`, `Lantern_Torch.png` (doc 26 §6) |
| `sword` | 1 | item.tool, gear.hand, **item.weapon** | `Player/Tools/Iron/Iron_Sword.png` + tool icon |
| `bow` | 1 | item.tool, gear.hand, item.weapon | `Bow/Wooden_Bow.png`, `Other/Bow_Stages.png` |
| `arrow` | 99 | **item.ammo** | tool icon strip |
| `fishing_rod` | 1 | item.tool, gear.hand | `Fishing_Rod/Wooden_Fishing_Rod.png` |
| `workbench` | 16 | item.placeable, item.crafted, **station.workbench** | `House_Decor/Tables.png` (worktable frame) |
| `furnace` | 16 | item.placeable, item.crafted, **station.furnace** | `House_Decor/Furnace_Anim.png`, `Furnaces.png` |
| `anvil` | 16 | item.placeable, item.crafted, **station.anvil** | `House_Decor/Anvil_Anim.png` |
| `campfire` | 16 | item.placeable, station.campfire, emits.light | `Other_Animations/Campfire_Anim.png` |
| `fence`, `fence_gate` | 99 / 16 | item.placeable, **build.fence** | committed `prop_cf_fence_*` + `Fence_Big_Gate*.png` |
| `sign` | 16 | item.placeable | `Outdoor decoration/Signs.png` |
| `standing_torch` | 16 | item.placeable, emits.light | `Torch_Anim.png`, `Lanter_Posts.png` |

Notes: the existing `*_ore` items for the five gem kinds read as "raw gem
chunks" and stay named as-is; cutting yields `gem_*`. The existing free-granted
tools remain; crafted tools are replacements/spares until tool tiers arrive
(§12 later hooks — the pack's single iron tool set means tiers need palette-swap
derivatives, which the license permits and assets-as-text makes cheap).
Gear items (`helm`…`shield`) finally become obtainable via §6 and carry doc 25
`modifiers` (small flat bonuses; numbers in the docs/06 mirror).

## 4. Recipe system upgrades (`packages/sim/src/item-containers.ts` → split out `recipes.ts`)

```ts
export interface RecipeDefinition {
  readonly id: string;
  readonly kind: 'shaped' | 'shapeless';
  readonly pattern?: ReadonlyArray<ReadonlyArray<string | null>>; // bounding-box, shift-invariant
  readonly inputs?: Readonly<Record<string, number>>;             // shapeless
  readonly output: { readonly itemKind: string; readonly quantity: number };
  readonly station?: 'workbench' | 'furnace' | 'anvil' | 'campfire';
}
```

- Furnace recipes are data here too, but execute through the smelting model
  (§5.2), not the grid.
- `craftInventoryRecipe` gains the station-proximity check: a `world_placeable`
  row of the required station kind within 2 tiles in the caller's space,
  else `station_required` SenderError.
- **INT quality hook (doc 25 §1) is reserved, not spent**: recipes have no
  quality rolls in v1. First use will be cooking quality when food lands.

## 5. Stations

### 5.1 Workbench, anvil, campfire — stateless proximity gates
Placeable props; no windows, no slots, no rows beyond their `world_placeable`
entry. Campfire and standing torch register in the doc 27 emitter table
(flame flicker, warm color) — placed light is a crafting output, which is the
mines' torch economy extended to bases.

### 5.2 Furnace — the one stateful station
Minecraft's furnace, on our lazy-tick pattern (no per-tick work):

- Interacting opens a 3-slot window (input / fuel / output) — the chest window
  machinery with a 3-slot container (`world_placeable_slot`, same shape as
  `world_chest_slot`).
- Row state: `smeltStartTick: u64 | null`. A smelt starts when input+fuel are
  valid; progress is derived from `authorityTick − smeltStartTick` at read
  time (`SMELT_TICKS = 200` = 10 s per unit, `advanceEconomy`-style catch-up
  for multiple units on reopen — walk whole units, consume fuel per unit,
  stop when input/fuel/output-space runs out).
- Fuel values: `wood = 1 smelt`, `plank = 1`, `stick = 0` (not fuel — keeps
  sticks for building). No coal exists in our ore set; wood **is** the fuel
  economy, which gives chopping a permanent sink.
- Client shows progress with the doc 25 bar assets (gold fill) — derived,
  not streamed.

## 6. Recipe list v1 (the content; numbers mirror to docs/06)

**Hand (anywhere):**

| Recipe | Inputs | Output |
|---|---|---|
| Planks | 1 wood | 4 plank *(exists)* |
| Sticks | 2 plank (vertical) | 4 stick |
| Torch | 1 wood + 1 fiber | 2 torch *(honors doc 26's wood+fiber recipe)* |
| Campfire | 3 wood + 3 stick | 1 campfire |
| Workbench | 4 plank (2×2) | 1 workbench |

**Workbench:**

| Recipe | Inputs | Output |
|---|---|---|
| Chest | 8 plank ring | 1 chest *(exists; moves behind workbench)* |
| Barrel | 7 plank (U + lid) | 1 barrel *(finally real — 8-slot container)* |
| Fence | 4 plank + 2 stick | 3 fence |
| Fence gate | 2 plank + 4 stick | 1 fence_gate |
| Sign | 6 plank + 1 stick | 1 sign |
| Standing torch | 1 torch + 1 stick | 1 standing_torch |
| Furnace | 8 stone ring | 1 furnace |
| Bow | 3 stick + 3 fiber | 1 bow |
| Arrows | 1 stick + 1 stone | 4 arrow |
| Fishing rod | 3 stick (diagonal) + 2 fiber | 1 fishing_rod |
| Axe / Pickaxe | 3 bar (iron) + 2 stick | 1 tool |
| Hoe / Sword | 2 bar (iron) + 1–2 stick | 1 tool |
| Watering can | 3 copper_bar | 1 watering_can |
| Lantern | 4 iron_bar + 1 torch | 1 lantern *(doc 26 "crafted with iron")* |

**Furnace (smelting):** `2 iron_ore → 1 iron_bar` · `2 copper_ore → 1 copper_bar`
· `2 gold_ore → 1 gold_bar` (each + fuel).

**Anvil:** gem cutting `2 <gem>_ore → 1 gem_<x>` · Anvil itself: 6 iron_bar
(workbench) · Plate gear: helm 5 / tunic 8 / pants 7 / boots 4 / gloves 2
iron_bar; shield 1 iron_bar + 6 plank · Jewelry: ring = 1 gold_bar + 1 gem;
necklace = 2 gold_bar + 1 gem (gem choice varies the doc 25 modifier).

**Gated on other systems (recipes authored, disabled until inputs exist):**
`orchard_tea` (doc 25 — needs obtainable apples), campfire cooking (the pack's
96 food icons are the ceiling; needs farming/foraging yields — docs/14 owns
sequencing). Listed so the docs/06 mirror shows the full intended tree.

## 7. Placement — generalizing the chest path

`useHands`' chest-only dispatch becomes tag-driven:

- **New table `world_placeable`**: `{ id: u64 pk, kind: string, tileX/Y: u16,
  chunkX/Y: i16, spaceId: u8, placedBy: Identity, facing? }` + `by_chunk`
  (spaceId, chunkX, chunkY) index and chunk subscription like `world_chest`.
  Chests stay in their existing table (migration not worth it); everything new
  goes here.
- Place: selected item has `item.placeable` → consume 1, insert row at the
  faced tile (walkable, unoccupied, in-bounds, same space). Pick up: `useHands`
  on a placeable you can reach returns the item (furnace/barrel must be empty;
  the chest carry-with-contents behavior stays chest-only).
- Collision: blocking per item definition (stations, fences block; standing
  torch doesn't). Client + authority collision maps add placeable AABBs
  exactly as chests do today. Fences render with the existing corner/
  horizontal/vertical sprites by neighbor-adjacency (fence-join rules, a mini
  autotile); gates toggle open/closed via interact (passable when open).
- Placeables are space-aware from day one (`spaceId`) — you can furnish a mine
  gallery with standing torches, which is doc 26's light economy working.
- Griefing scope: friends-only server, any member may pick up placeables;
  `placedBy` is recorded for a future permission pass — explicitly out of
  scope now.

## 8. New acquisition: fiber

One small addition closes the string/fiber gap every tool chain hits (no
animals, no coal, no spider-string in our world yet): **tilling a wild grass
tile with the hoe has a 30% (hash-gated, deterministic) chance to also drop
1 `fiber`** — cut roots and grass twine. It rides the existing `useFarmTool`
path, costs the normal Vigour, and gives the hoe a gathering identity beyond
farming. Mushroom/berry foraging stays with the farming/food milestone.

## 9. UI

- **Crafting window gains a recipe list** (lite recipe book): right of the
  grid, a scrollable list of all recipes whose station requirement is met,
  greyed when ingredients are missing; clicking one ghost-fills the grid
  pattern from inventory. Client-side only, from the sim recipe table. The
  pack's `Book_UI.png` full recipe book is a later polish item.
- Result-slot lock state + station tooltip (§2). Furnace window per §5.2.
- Icon debt paid via the §1.2 registry + `Icons/Outline` sheets: every item in
  §3 plus the currently icon-less `apple/grape/barrel/backpack` and gear kinds
  get `icon_cf_*` extracts (the Food/Resources/Tool icon sheets cover all of
  them — verified).

## 10. Schema additions (docs/08: all additive)

`world_placeable` + `world_placeable_slot` (+ views/subscriptions);
`smeltStartTick` on `world_placeable`; no changes to `inventory_slot`
(docs/23's generic-container migration remains outstanding and is *not*
blocking — this doc builds on the shipped offsets model). New SenderErrors:
`station_required`, `placement_blocked`, `placeable_not_empty`.

## 11. Art extraction plan (docs/11/18 workflow; `pixel-art` skill)

New extracts, all from paid packs: item + icon sprites for every §3 kind
(`Icons/Outline/{Tool,Resources,Food}_Icons`, `Iron_Sword/Iron_Tools`,
bow/rod/torch/lantern held overlays for the character action layers);
`prop_cf_workbench`, `prop_cf_furnace` (anim), `prop_cf_anvil` (anim),
`prop_cf_campfire` (anim), `prop_cf_sign`, `prop_cf_standing_torch` (anim),
`prop_cf_fence_gate` (open/closed); barrel already committed. Break
animations (`Barrel_1_Anim`, `Crate_Anim`) noted for a future
destructibility pass. The committed fence sprites are reused as the placeable
art directly.

## 12. Phasing

1. **Foundations:** shift-invariant matching, item registry consolidation
   (displayName/icon convention), recipe registry split, stale-composition
   cleanup. Pure sim + client, ships alone.
2. **Materials + hand tier:** stick/fiber items, fiber-from-tilling, hand
   recipes, icons for all existing icon-less items.
3. **Placement + workbench:** `world_placeable`, generalized `useHands`,
   workbench + proximity gating, fences/gates/signs/barrels-for-real,
   standing torch + campfire (doc 27 emitters).
4. **Metal + anvil:** furnace + smelting model, bars, anvil, metal tools,
   plate gear with doc 25 modifiers, gem cutting + jewelry. *The ore sink —
   the single biggest economy gap — closes here.*
5. **Weapons + rod:** sword/bow/arrow/fishing_rod items (usable swing for
   sword via the actions registry; shooting and fishing mechanics remain
   with their own milestones).
6. **Later hooks:** tool tiers via palette-swap ramps; cooking (96 food
   icons ceiling) once farming yields exist; recipe book UI; furniture/
   interior placeables (Beds/Tables/Chairs sheets) with the interiors
   milestone; destructible placeables; placement permissions.

## 13. Out of scope

Cooking/food execution (recipes pre-authored, disabled); farming/crop yield
fixes (separate milestone — but noted: crafting content assumes it lands);
trade/vendors; building placement (houses); the docs/23 generic-container
schema migration; combat mechanics for sword/bow; fishing mechanics; tool
durability (nothing degrades — cozy rule); quality/INT rolls.

## 14. Tests and acceptance

- **Unit (sim):** shift-invariant shaped matching goldens (2×2 pattern at all
  4+ offsets, non-match on mirror, null-cell strictness); every §6 recipe has
  a golden test named `06§<mirror-section>`; smelting catch-up math
  (multi-unit, fuel exhaustion, output-full stop); fiber drop hash
  determinism; fence-join adjacency resolution.
- **Reducer:** craft happy path per station + `station_required` at 3 tiles;
  place/pickup round-trip for each placeable kind; `placement_blocked` on
  occupied/unwalkable/cross-space; furnace slot auth (only reachable players);
  non-empty pickup rejection; auth-failure path each (docs/15).
- **Two-client:** A places a workbench, B crafts at it; B picks it up, A's
  in-flight craft rejects; furnace progress consistent across both clients'
  derived views; placed standing torch lights for both (doc 27 two-client
  test reused).
- **Browser:** recipe list filter/ghost-fill; lock tooltip; furnace window
  progress bar; fence auto-joining as segments are placed; full chain
  playthrough — chop → planks → workbench → furnace → smelt → anvil → sword —
  on one client session.

## 15. Bookkeeping

- **docs/06:** new section mirroring §6 recipes + smelt/fuel constants +
  gear modifier numbers; rename §"Workbench, capacity, and compost upgrades"
  to "Farmhouse upgrade counter" (content unchanged, retired-scene).
- **docs/00:** doc-map row. **docs/14:** milestone entry for §12 phases.
- **docs/20:** tool strip roster note pointing here for item sourcing.
- **docs/26:** §6 torch recipe confirmed (wood + fiber); gem items now §3/§6
  here.
- **DECISIONS.md** on adoption: (1) crafting expands Minecraft-style with
  proximity-gated stations and one grid UI (furnace excepted); (2) "workbench"
  names the placeable crafting station; docs/06's upgrade shop is renamed;
  (3) wood is the fuel economy (no coal ore exists by choice); (4) fiber
  enters via hash-gated tilling drops; (5) shaped recipes become
  shift-invariant, unmirrored.
