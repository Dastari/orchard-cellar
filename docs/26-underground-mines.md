# 26 — Underground Mines: Spaces, Cave Generation, Zoning, and Darkness

Binding owner-directed spec (2026-08-25). Status: **phase 1 (spaces plumbing)
implemented — shared with docs/35**.
The immediate next use of this plumbing is [40](40-sanctuary-overworld-and-zoned-world.md)
§8's Shared Spaces technology demo: a test forest, cave, deeper underground sample,
and dynamic deed-created Homestead. Full mine progression remains deferred. Doc 40
also broadens the space model to safe/resource/danger/social zone profiles while
keeping this document's one-database, `spaceId`, portal, and subscription contracts.
Builds on [20-survival-world.md](20-survival-world.md) (deterministic generation,
resources, collision), [21-unified-renderer.md](21-unified-renderer.md) (lighting,
chunk cache, the "farms return as instanced interiors" promise this doc finally
designs), [22-netcode.md](22-netcode.md) (subscriptions, prediction split),
[25-stats-and-vitals.md](25-stats-and-vitals.md) (Vigour-paced mining, future
combat hooks), [08-database.md](08-database.md) (schema evolution rules), and
[18-visual-style-addendum.md](18-visual-style-addendum.md) §7 (pack extraction
and licensing). Owner reference shot: the Cute Fantasy cave mock — log-palisade
walls, rail lines with ore carts, lanterns, crystal clusters, a bridged lower
gallery, a ladder, and a water pool.

Two questions this doc answers structurally, because nothing in the codebase
answers them today:

1. **SpaceTimeDB has no native "maps".** One module = one set of tables, and every
   chunk-indexed table is implicitly the single island. Separate areas are a
   *convention we define*: a `spaceId` dimension on rows + per-space local
   coordinates. §2–3 define it once, for the mines **and** for every future
   interior (farmhouses, the diegetic cellar, docs/03's "stairs to deeper
   levels").
2. **"Random" must still be deterministic.** The whole architecture (docs/20,
   docs/22) rests on client and authority generating identical terrain from
   `world_seed` — tiles are never streamed. Caves are therefore **procedurally
   generated but seed-deterministic and shared-persistent**: every player sees the
   same mine, mined-out nodes stay mined for everyone (co-op mining is a pillar),
   and "new caves" come from explicit regeneration events, not per-visit rerolls.

## 1. Vision

Beneath the island is a mine of 3 levels, dug generations ago and gone dark.
It is the island's ore source made diegetic: richer nodes than the surface,
crystal clusters found nowhere else, and the risk-free-but-tense feeling of
darkness managed by torchlight. Levels get darker, richer, and stranger as you
descend. It is a shared co-op space — you can see a friend's torchlight coming
down a corridor before you see them. Combat creatures arrive in the combat era
(doc 25 §12); v1 mines are peaceful, paced by Vigour and light.

## 2. Spaces — the instancing model

A **space** is a self-contained coordinate world inside the same SpaceTimeDB
database: its own size, terrain generator, collision, ambient light, audio bed,
and camera bounds. Static spaces are data in `packages/sim/src/spaces.ts`;
dynamic homesteads are resolved from their `homestead` registry row (doc 35):

```ts
export interface SpaceDefinition {
  readonly spaceId: number;              // u16; 0 = overworld, stable forever
  readonly name: string;
  readonly sizeTiles: number;            // square, multiple of SURVIVAL_CHUNK_TILES
  readonly generator: 'island' | 'mine' | 'homestead' | 'debug_flat';
  readonly generatorParams?: MineParams; // depth level, richness, water chance…
  readonly ambient: 'clock' | RgbColor;  // 'clock' = day/night; literal = fixed
  readonly weather: boolean;             // rain/audio; false underground
  readonly audioBed: 'estate' | 'cave' | 'homestead' | 'debug';
}

export const SPACES: readonly SpaceDefinition[] = [
  { spaceId: 0, name: 'island',  sizeTiles: 320, generator: 'island', ambient: 'clock', weather: true,  audioBed: 'estate' },
  { spaceId: 1, name: 'mine_1',  sizeTiles: 96,  generator: 'mine',   ambient: MINE_AMBIENT_1, weather: false, audioBed: 'cave' },
  { spaceId: 2, name: 'mine_2',  sizeTiles: 96,  generator: 'mine',   ambient: MINE_AMBIENT_2, weather: false, audioBed: 'cave' },
  { spaceId: 3, name: 'mine_3',  sizeTiles: 80,  generator: 'mine',   ambient: MINE_AMBIENT_3, weather: false, audioBed: 'cave' },
];
```

- **Shared-persistent, not per-player.** One copy of each mine level for the
  whole friends-server. Per-player/per-party instancing is a deliberate
  non-goal — it fights the social pillar and the deterministic-seed
  architecture. (Recorded in DECISIONS.)
- **Seeds derive, they don't multiply.** `spaceSeed(worldSeed, spaceId, mineVersion)
  = hash(worldSeed ⊕ mix(spaceId, mineVersion))` using the existing integer
  `hash()`. `world_seed` stays a single row; a new `mineVersion: u16` column on
  it (additive) lets the owner "collapse and re-dig" all mine levels without
  touching the island. Bumping `SURVIVAL_WORLD_VERSION` continues to regenerate
  everything, mines included.
- **Coordinates are space-local.** Every space starts at tile (0,0). Row-id
  collisions between spaces are prevented by a per-space id base:
  `resourceId(space, x, y) = spaceId * 1_048_576 + y * sizeTiles + x + 1`
  (the island's 320×320 = 102 400 ids fit far under the 2²⁰ band; ids are u64).

## 3. Schema and migration (follows docs/08 to the letter)

Additive columns, with one honest caveat about indexes:

- **`spaceId: u16` (default 0)** added to `player_position`, `world_resource`,
  `world_item`, `world_chest`, `world_npc`, `world_soil`, `world_speech`.
  Existing rows are all legitimately space 0, so the default *is* the backfill.
- **`by_chunk` btree indexes become `['spaceId','chunkX','chunkY']`.** Index
  reshape on a populated table must be verified against SpaceTimeDB 2.8's
  migration rules before phase 2 starts (indexes are derived structures, not
  data, so this is expected to pass `spacetime publish`). **Fallback if it does
  not:** the docs/08 versioned-replacement playbook — and note that
  `world_resource` regenerates wholesale on version bumps already, so the worst
  case for the biggest table is a version bump, not a dual-write.
- **`world_seed` + `mineVersion: u16`** (additive, default 0).
- **New table `space_portal`** — authored by generation at publish/init time so
  both sides agree, but small and public so the client needn't re-derive it:
  `{ id: u32 pk, kind: 'cave_mouth'|'ladder_down'|'ladder_up'|'mine_shaft',
  fromSpace: u16, fromTileX/Y: u16, toSpace: u16, toTileX/Y: u16 }`. Portals are
  bidirectional pairs (two rows).
- **New reducer `usePortal(portalId)`**: reject if mounted (`no_horses_underground`
  — horses stay topside, the pack has no cave horse and neither should we),
  reject unless the player's tile is within 1 tile of `fromTile`
  (`portal_out_of_range`). Then perform the **generalized `adminTeleport` body**
  (extracted to a shared helper): write x/y/spaceId + recomputed chunk, clear
  moving/action/jump, settle `player_input` so prediction doesn't rubber-band,
  audit nothing (player-initiated). Arrival tile is pre-validated at generation
  time to be walkable.
- **Space-aware reads:** `visibleWorldSpeech` adds `spaceId` equality to its
  range check (else chat bubbles bleed between overlapping local coordinates);
  `useFarmTile` and horse reducers reject outside space 0; knockout/respawn and
  `naturalSpawnTile` stay overworld-only (fainting underground wakes you topside
  at your spawn — diegetically, friends carried you out).
- **Authority collision goes per-space:** the `SURVIVAL_TERRAIN_COLLISION`
  module singleton (`world-rules.ts:40`) becomes a bounded per-`spaceId` lazy
  cache, with LRU/final-occupant eviction rather than permanent retention;
  `stepWorld` partitions online players by space and builds collision only for
  occupied spaces, filtering resource/chest scans by `spaceId` instead of
  full-table iteration (a scoped win over today's per-tick full scan).

## 4. Cave generation — `packages/sim/src/mine-world.ts`

Pure, integer-only, seeded by `spaceSeed` — the same `hash`/`valueNoise`/
`fractalNoise` primitives and the `buildOrganicFeatureMask` toolkit (organic
lobes, smoothing, spur removal, flood-fill connectivity) that shaped the island.
Generated once per (seed, version), cached like island terrain, byte-identical
on client and authority.

Pipeline per level (all thresholds in `balance.ts` + docs/06 mirror):

1. **Rooms.** `ROOMS_PER_LEVEL = 7±2` seed points by lowest-hash with min
   spacing; each grows an organic blob (radius 6–14 tiles) via the mask builder.
   One room is designated **entry hall** (holds the up-portal), one **deep room**
   (holds the down-ladder; farthest by BFS distance).
2. **Corridors.** Minimum-spanning connection of room centers plus 1–2 extra
   loop edges, carved as 2–3-tile-wide noisy L-paths. A flood-fill pass asserts
   every floor tile reaches the entry hall; unreachable pockets become solid
   wall (no teasing sealed rooms — anything visible is reachable).
3. **Walls.** Everything not carved is wall. Wall/floor contour feeds the
   existing `raised-terrain-autotile` resolver with a new **cave tileset
   profile** (one face row, `blocksMovement: true` throughout — cave walls
   read as the log-palisade rings of the reference shot, not tall cliffs).
   Interior wall mass beyond 1 tile from any floor renders as void-dark fill.
4. **Rails.** The longest corridor spine per level gets a rail line: rails are a
   detail-layer autotile (straight/curve/cross frames from `Rails.png`),
   non-blocking, purely cosmetic to walk on. `CARTS_PER_LEVEL = 2–4` minecarts
   placed on rail tiles by hash (empty + ore-fill variants for flavor);
   v1 carts are blocking decor props — a rideable/storage cart is a future hook.
5. **Supports and lanterns.** Corridor mouths and rail spines get wood support
   beams (`Cave_Support_*`) at intervals; `LANTERNS_PER_LEVEL = 4–6` wall
   lanterns placed in rooms **so that lit pools cover ≈15% of the floor** —
   they are the landmarks you navigate between in the dark. Being deterministic
   decoration, lanterns need **no rows**: the client derives their positions
   and feeds them into the point-light list; the authority ignores them.
6. **Mining nodes.** The reason to be here. Per level, the zone-partition
   placement from the island (`buildRareOreLayout` generalized) distributes:
   existing ore kinds with **depth-weighted richness** (level 1: copper/tin/iron;
   level 2: iron/silver/gold; level 3: gold/mythril-tier), node reserves 1.5×
   surface, plus **crystal clusters** — new resource kinds
   `crystal_{verdant,azure,violet,amber}` (the reference shot's glowing
   clumps), pickaxe-mined, dropping new gem items, found only underground.
   Crystals emit a faint colored point light (client-side, from the resource
   row — the one light source that *is* row-driven, so it disappears when mined
   out).
7. **Water and dressing.** Low-elevation pockets in 1–2 rooms fill as still
   cave pools (`Cave_Water` + animation frames; blocking, no horse-jump).
   Stalagmites, rock piles, mushroom clusters, bone/root decals by per-tile
   hash gates, sparse (the shot is readable because it's mostly floor).
8. **Portals.** Down-ladder in the deep room links to the next level's entry
   hall; level 1's entry hall links to the surface (§5). Portal rows and
   arrival-tile walkability are emitted here.

## 5. Zoning — entrances and transitions

**Surface entrances (2 in v1), placed deterministically by the island generator:**

- **Cave mouth** — a dark doorway composited onto an existing stone plateau
  cliff face. The pack ships `Cave_Entrance.png` overlays *matched to the four
  stone cliff sheets we already extracted*, so this is an overlay frame on the
  existing cliff renderer, not new topology. Site selection: the straightest
  3-wide south-facing cliff wall segment of the largest plateau.
- **Mine shaft** — a weathered ladder-head prop on a dirt terrace elsewhere on
  the island (`Ladder_Down` frames), giving a second, distant way in.

Both lead to mine level 1's entry hall. Underground, ladders link levels
(`Cave_Floor_Ladder`). Standing on/adjacent to a portal shows the standing
interact prompt ("ENTER THE OLD MINE" / "CLIMB THE LADDER"); the existing
interact input triggers `usePortal`.

**Client transition sequence** (all cosmetic, authority is the row write):

1. On prompt-accept: play a 250 ms fade-to-black overlay + descend SFX, call
   `usePortal`.
2. Own-row `spaceId` change arrives → swap the active `SpaceDefinition`:
   terrain object for that space (terrain cache re-keyed by
   `(spaceId, seed, version)`), collision map, camera bounds/zoom minimum
   (today's hardcoded `SURVIVAL_WORLD_SIZE * 16` literals become
   `space.sizeTiles * 16` — this is the cleanup that unblocks every future
   interior), audio bed crossfade, ambient source (§6).
3. Chunk subscription rebuilds with the `spaceId` term using the existing
   make-before-break handover; `GroundChunkCache` keys gain the spaceId so
   surface chunks survive a quick trip below (cache capacity may need +16).
4. Fade back in from the arrival tile.

Remote players in another space are simply **not subscribed** (the spaceId term
does this for free) — no ghost nameplates, no cross-space speech.
This is client interest management only: all spaces still share one authoritative
database, and access-controlled data/reducers must not trust subscription scope.

## 6. Darkness and light — the point of the whole feature

The lighting system (docs/21, `render/lighting.ts`) already does everything the
mines need *except* darkness itself: per-tile multiply lightmap, per-channel-max
point lights with linear falloff, and torch/lantern emission wired to the
equipped item kind for both local and remote players. What changes:

- **Per-space ambient.** `lightmap.draw` already takes ambient as an argument;
  in space 0 it stays `ambientAtTick` (with its deliberate comfort floor of
  89/channel). Mine spaces pass their fixed `SpaceDefinition.ambient` literal,
  **below** that floor: `MINE_AMBIENT_1 = #2a2a33`, `MINE_AMBIENT_2 = #1c1c26`,
  `MINE_AMBIENT_3 = #12121c`. Not absolute black — the multiply pass keeps
  silhouettes barely legible so players are never lost, but reading ore kinds,
  spotting items, and seeing more than ~2 tiles genuinely requires light.
  Weather/rain dimming does not apply underground.
- **The torch becomes a real item** (finally activating the dormant path):
  `torch` in `ITEM_DEFINITIONS`, hotbar icon `icon_cf_torch`, carried art from
  the pack's `Torch_Idle/Running` player sheets, radius 3 tiles at
  `TORCH_LIGHT #ffb868` — all constants already exist in `lighting.ts`.
  Craftable cheap (wood + plant fiber) by hand (docs/28 phases 1–3); **does not burn out**
  (cozy rule — darkness is atmosphere, not a fuel tax). The `lantern` item
  follows in a later phase: radius 5, crafted with iron, and — because lights
  follow `equippedKind` — the meaningful upgrade is that holding a torch
  occupies your hand-slot logic today, and the lantern is the same but brighter.
  A "lit while hotbarred, not held" rule is deliberately deferred to keep v1
  honest: **you hold your light or you swing your pickaxe, not both** — that
  tension is the mine's core rhythm, and it composes with Vigour pacing
  (doc 25 §4).
- **Static lights:** generated lanterns (§4.5) and crystal glows feed the same
  `pointLights` array. Entrance/exit portals emit a soft glow so the way out is
  always findable.
- **No occlusion in v1.** Light bleeding through a thin wall is accepted;
  docs/21's deferred BFS-flood occlusion design remains the sanctioned future
  fix ("do not invent a raycaster" still binds). Cave layouts mitigate it by
  keeping ≥2-tile wall mass between adjacent rooms (§4.3 does this naturally).
- **Entering without a torch** is allowed — one toast on first darkness
  ("IT'S DANGEROUSLY DARK IN HERE") and the entrance glow behind you. You can
  always feel your way back out. No damage, no fail state (doc 25 §11 floor
  applies).

## 7. Art extraction plan (docs/11 + docs/18 §7 workflow; `pixel-art` skill)

All sources are in the licensed paid packs; run the catalog tool, then hand
recipes per the ores-extractor shape. Target inventory:

| Source sheet | Assets | Notes |
|---|---|---|
| `Tiles/Cave/Cave_Walls.png` | `tile_cf_cave_wall` (ring autotile), `tile_cf_cave_wall_top` | feeds the §4.3 cave tileset profile |
| `Tiles/Cave/Cave_Floor_1/2/Middle.png` | `tile_cf_cave_floor` (+variants) | base floor + edge blend |
| `Tiles/Cave/Cave_Floor_Decoration.png` | `tile_cf_cave_floor_decor` | hash-gated decals |
| `Tiles/Cave/Rails.png` | `tile_cf_rail` (straight/curve/cross frames) | detail layer, non-blocking |
| `Tiles/Cave/Cave_Support_1/2.png`, `Cave_Wall_Support.png` | `prop_cf_mine_support`, `prop_cf_mine_wall_support` | corridor dressing |
| `Tiles/Cave/Cave_Water.png` + `_Animation.png` | `tile_cf_cave_water` (anim frames) | matches freshwater renderer pattern |
| `Tiles/Cave/Cave_Doorway_1.png` | `prop_cf_cave_doorway` | interior portal framing |
| `Tiles/Cave/Cave_Floor_Ladder.png` | `prop_cf_mine_ladder` | inter-level portals |
| `Tiles/Cliff/Cave_Entrance.png` + `Stone_Cliff_*_Cave_Entrance.png` | `tile_cf_stone_cliff_cave_mouth` (per cliff variant) | surface entrance overlays |
| `Outdoor decoration/Minecrats.png` | `prop_cf_minecart` + `_full_{copper,gold,…}` variants | 2 facings × fill variants |
| `Outdoor decoration/Cave_Decorations.png`, `Rock_Animations/Cave_Rock_*` | `prop_cf_stalagmite_*`, `prop_cf_cave_rock_*` | sparse dressing |
| crystal sources (pack crystals; catalog to locate exact sheet) | `resource_cf_crystal_{verdant,azure,violet,amber}` + `item_cf_gem_*` | new mineable kinds §4.6 |
| `Other/Lantern_Torch.png`, `Player/Tools/Other/Torch_*.png` | `item_cf_torch`, `icon_cf_torch`, player carry frames; lantern later | activates the dormant light path |
| `Outdoor decoration/Lantern.png` / torch anims | `prop_cf_wall_lantern` (anim) | static light landmark |

Standing rules apply: text-grid extracts with `sourcePalette` + `importedFrom`,
never committed source sheets, render→review loop per asset, seasonal remaps
N/A underground (mines are season-invariant — one less axis to author).

## 8. Audio (game-music skill; docs/12)

- `audioBed: 'cave'` — a sparse dark-ambience bed (drips, low air, distant
  creaks) replacing the estate bed underground; the audio bus's dormant
  `location` enum finally gets its second real value, and its hardcoded
  `'estate'` call site becomes space-driven.
- Footsteps: new `'stone'` surface variant (the cellar footstep set is the
  starting point).
- New SFX: ladder climb, cave mouth descend/ascend sting, pickaxe-on-crystal,
  lantern hum proximity loop (optional, quiet).

## 9. Interplay with doc 25 (stats) and the combat era

- Mining underground uses the same Vigour costs and swing gates — no special
  cases. Depth-3 nodes are richer, not cheaper: the pacing lever stays Vigour.
- Darkness is the mines' "difficulty" until combat lands. When it does (future
  doc), mines are the natural first hostile biome: cave creature statlines via
  doc 25 §8, aggro leashed to rooms, and light radius becomes tactically
  meaningful for free. Nothing in this doc needs reworking for that — that is
  the point of speccing spaces + statlines first.
- Knockout underground follows doc 25 §11 unchanged (wake at your surface spawn).

## 10. Single-map assumption — cleanup checklist

The codebase bakes "one island" into specific places; phase 2 owns this list
(from the audit, ranked by coupling):

1. `world-rules.ts` collision singleton → bounded per-space lazy cache with
   eviction (§3); a plain unbounded `Map<spaceId, CollisionMap>` is not complete.
2. `movePlayer` bounds + scattered `SURVIVAL_WORLD_SIZE` literals (authority:
   `adminTeleport`, `useHands`, collision-map builders; client:
   `visibleWorldBounds`, `minimumZoom`, `cameraAxisOffset` call sites) → read
   the active `SpaceDefinition`.
3. `stepWorld` full-table resource/chest scans → `spaceId`-filtered.
4. Client terrain + `GroundChunkCache` cache keys → include `spaceId`.
5. Subscription builder chunk clamps (`subscriptionChunkBounds`,
   `viewRadiusForViewport`) → clamp to the active space's chunk count.
6. Spawn/knockout paths assert space 0 explicitly rather than implicitly.
7. Audio bus location hardcode → space-driven (§8).

## 11. Phasing

1. **Spaces plumbing (no content):** `spaces.ts`, schema additions + index
   migration verified on a scratch module, per-space collision/bounds/camera,
   subscription spaceId term, `usePortal` + generalized teleport helper. Done
   when: an owner-only debug portal moves a player to an empty flat test space
   and back, with two clients seeing correct presence/isolation.
   **Implemented 2026-08-26:** `spaceId` is `u16`; the owner-only debug space
   remains the verification vehicle and contains no mine or homestead content.
2. **Mine generation + art:** `mine-world.ts` levels 1–3, cave tileset/props
   extraction, ground-cache cave rendering path, rails/carts/supports/water,
   portals placed by generation, surface entrances on the island (island
   version bump). Done when: all three levels generate connected, decorated,
   and walkable from both surface entrances, byte-identical client/authority.
3. **Darkness + torch:** per-space ambient, torch item/craft/icon/carry art,
   static lantern + crystal lights, portal glow, first-darkness toast, cave
   audio bed + footsteps. The user-visible payoff ships here.
4. **Mining content:** depth-weighted ore distribution, crystal resources +
   gem items, richer reserves, docs/06 tuning mirror + goldens.
5. **Later hooks:** lantern item; rideable/storage minecarts; light occlusion
   (docs/21 BFS design); hostile cave creatures (combat-era doc); per-farm
   interiors reusing the space system; owner "collapse and re-dig"
   (`mineVersion` bump reducer with confirmation).

## 12. Out of scope

Per-player/party instancing; procedural rerolls per visit; light occlusion;
fuel/burn-out mechanics; fall damage or darkness damage; hostile creatures;
minecart riding; farming underground; horses underground; weather underground;
seasonal cave variants.

## 13. Tests and acceptance

- **Unit (sim):** mine generation determinism (same seed twice → identical
  bytes; golden hash per level named `26§4`); connectivity invariant (every
  floor tile BFS-reaches the entry hall; every portal arrival tile walkable);
  room/corridor/rail/node counts within declared bands across 100 seeds; id
  bijection non-overlap across spaces; `spaceSeed` derivation goldens.
- **Reducer (world):** `usePortal` happy path (position + spaceId + chunk +
  settled input), `portal_out_of_range`, `no_horses_underground`, auth-failure;
  `useFarmTile`/horse reducers rejected outside space 0; harvest works on cave
  nodes with the same Vigour gates; speech view never crosses spaces.
- **Two-client:** A underground and B topside see neither each other's avatar,
  nameplate, nor speech; both meet in the mine and see each other's torch
  light; a node A mines out is depleted for B (shared persistence).
- **Browser:** full transition sequence both directions (fade, terrain swap,
  camera bounds, ambience crossfade, subscription handover with no ghost
  entities); mine renders at all zoom/UI scales; darkness gradient across
  levels; torch/lantern/crystal/portal lights render and die correctly when
  the source leaves.
- **Perf (docs/21 §8 budgets):** ground-cache rebuild on space swap within one
  frame budget; lightmap cost unchanged (same texel path); no subscription
  churn regressions (make-before-break preserved).

## 14. Bookkeeping

- **docs/06**: new tuning section — mine generation bands, ore depth weights,
  crystal/gem values, torch recipe.
- **docs/00**: add the doc-map row for 26.
- **docs/14**: milestone entry for phases §11.1–4 with Done-whens.
- **docs/20**: note that `SURVIVAL_WORLD_SIZE` is now space-0's size (and fix
  its stale 192 reference while in there); **docs/21**: note per-space ambient
  override and that "instanced interiors" now have a designed mechanism;
  **docs/22**: note the spaceId subscription term.
- **DECISIONS.md** on adoption: (1) spaces via `spaceId` columns + per-space
  local coordinates, not coordinate-band hacks or separate modules; (2) mines
  are shared-persistent and seed-deterministic, never per-visit random;
  (3) underground darkness bypasses the surface ambient floor, torches don't
  burn out, and entry without light is permitted (comfort rules); (4) hold-to-
  light: your light occupies your active slot in v1 — mining and lighting are
  mutually exclusive by design.

## Amendment (2026-08-26, docs/35)

Two changes from the homestead design
([35-homesteads-and-farming.md](35-homesteads-and-farming.md)):
`spaceId` is **u16**, not u8 (widen before implementation — per-player
homestead instances need the range), and per-player instancing is sanctioned
**for homesteads specifically**. The §2 rule stands for mines: shared,
never per-player.

The phase-1 populated migration rehearsal published the additive columns and
reshaped all eleven affected `by_chunk` indexes in place on SpaceTimeDB 2.8.2.
The fallback replacement-table migration was not required; see `DECISIONS.md`.
