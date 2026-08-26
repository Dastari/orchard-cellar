# 30 — Terrain Generation Revamp: Semi-Infinite Chunked World, Biomes, and Curation

Binding owner-directed spec (2026-08-25). Status: **design approved, not implemented**.
Supersedes the fixed-island generation model of [20-survival-world.md](20-survival-world.md)
(its resource/transaction rules stay binding; its 320×320 island becomes the legacy
v1 world). Builds on [21-unified-renderer.md](21-unified-renderer.md) (chunk ground
cache), [22-netcode.md](22-netcode.md) (chunk subscriptions — unchanged in shape),
[26-underground-mines.md](26-underground-mines.md) (the `spaceId` dimension; this
doc defines space 0's generator and composes with it in either landing order), and
the shipped wildlife system of [29-wildlife.md](29-wildlife.md)
(`packages/sim/src/wildlife.ts` — extended by §6 here, not replaced).
Tile/biome art is bounded by the licensed packs per docs/18 §7.

**2026-08-26 legacy-island elevation slice:** implemented ahead of the full terrain
revamp. World version 26 repeatedly insets the island's four organic highland masks
into level-1/2/3 stepped mountains, generates one paired slope for every connected
contour, rejects every unconnected height change, reconciles generated resources by
stable id, regenerates wildlife homes, and interleaves raised terrain/entities through
elevation-aware painter depth. The same integer/semantic contracts support arbitrary
future levels and editor brushes. The infinite sampler, chunk terrain cache,
transition kinds beyond slopes, and owner editor UI remain in the phases below and
are not claimed as implemented by this note.

The mandate, in one sentence: **Minecraft's world model on our stack** — a
semi-infinite, seed-deterministic 2D world streamed in 16-tile chunks through
SpaceTimeDB, with large multi-biome landmasses (plains, valleys, savannas,
deserts, mountains), islands and volcano islands, smooth biome transitions,
biome-appropriate wildlife (down to color-variant preferences), **and** a
hand-crafted curation layer so the owner can edit terrain and place
entities/objects after generation without losing them to regeneration.

## 1. What carries over (the architecture is already right)

The current system's core invariant is the one Minecraft shares and we keep:
**terrain is never streamed — both sides generate it from the seed.** The client
renders and collides against locally generated terrain; the server materializes
only *mutable entities* (resources, items, chests, NPCs) as rows. Chunking
already exists end-to-end: 16-tile chunks, `by_chunk` btree indexes on every
spatial table, radius-based subscription queries with make-before-break
handover, and a chunk-keyed ground cache. The integer noise toolkit
(`hash`/`valueNoise`/`fractalNoise`), the raised-terrain autotiler, the wildlife
species/habitat system, and the resource-drop rules all survive intact.

What dies: the **fixed world size** and everything downstream of it — the
radial island falloff, whole-world byte arrays cached per seed, the
`tileY * SIZE + tileX` id bijection, publish-time materialization of every
resource row, and the `[0, SURVIVAL_CHUNK_COUNT−1]` clamps scattered through
subscriptions, camera, spawn, and bounds checks.

## 2. Coordinates and extent

- **Signed tile coordinates, origin = world spawn.** Tiles are `(x, y)` in
  `i16` range; chunks are `floor(tile/16)` in `i16`. This matches the columns
  already on every table (`tileX/Y: i16`, `chunkX/Y: i16`) — **no schema
  widening needed**.
- **Extent: ±32 000 tiles** (`WORLD_EXTENT_TILES`), ~2 000 chunks each way — a
  64k × 64k-tile world, ~4 million chunks. At walk speed that is hours of
  travel in any direction: "semi-infinite" in the Minecraft sense (a border
  nobody reaches in play). Beyond the extent, the sampler returns deep ocean
  forever — a soft, swimmable-looking but uncrossable border, no invisible
  walls. If a true i32 world is ever wanted, it is a versioned-table migration
  (docs/08), noted and deliberately not paid for now.
- The F3 overlay shows signed tile + chunk coordinates (the Minecraft F3
  habit); coordinates are the lingua franca for admin tools (§7).

## 3. The generation pipeline (pure, unbounded, both sides)

New module `packages/sim/src/terrain-gen.ts` replacing the island math in
`survival-world.ts` (which shrinks to resource/drop rules). Every function is a
pure integer function of `(seed, x, y)` — samplable at any coordinate with no
world-sized allocation. Five noise fields, Minecraft-multi-noise style, each
domain-warped and octaved from the existing primitives at different scales:

| Field | Scale (tiles/feature) | Drives |
|---|---|---|
| **Continentalness** C | ~1 500 | deep ocean → ocean → coast → lowland → inland → highland. Large landmasses *and* island chains (mid-C bands over ocean) |
| **Erosion** E | ~700 | flatness: high E = plains/valleys, low E = rugged relief |
| **Ridges** R | ~300, ridged | mountain chains and cliff/plateau contour levels; valley floors at ridge inversions |
| **Temperature** T | ~2 000 | cold ↔ temperate ↔ hot bands |
| **Moisture** M | ~900 | wet ↔ dry within a temperature band |

- **Biome selection is a data table**, `BIOME_TABLE`: quantize (C, E, R, T, M)
  into indexed cells → biome id. All 19 current biomes remap into it; new
  entries below. The table is the tuning surface (docs/06 mirror) and its
  quantization thresholds are what make transitions *smooth by construction*:
  adjacent tiles differ by at most one quantization step, so biome borders are
  always between neighbors in parameter space — desert grades through savanna
  into plains; it can never touch a cold biome because non-adjacent T cells
  never share an edge. This is the Minecraft guarantee, achieved the same way.
- **Elevation** composes C + E + R into an integer elevation field; the
  existing raised-terrain autotiler consumes its contours per level (the
  "resolve each level independently" design it was built for), and is
  exported as the integer `terrainHeightAt(x, y)` contract that lighting
  ([27-lighting-design.md](27-lighting-design.md) §5) and future systems
  consume — no consumer re-derives elevation. Mountains are
  3–5 stacked cliff levels of the existing stone-cliff tilesets; the current
  plateaus/terraces become the 1–2-level foothill case of the same math.
- **Nested contours are the only raised-terrain model.** Every tile stores one
  integer level. Each positive contour is resolved independently, so a level-2
  plateau inside level 1 and a level-3 summit inside level 2 work without nested
  shape rules. Tilesets supply face profiles; topology never depends on frame ids.
  Logical height, projected face rows, and blocking rows remain independent.
- **Terrain crossings are semantic data.** A crossing names its contour level,
  orientation, and kind (`slope`, `stairs`, `ladder`, or `rope`). Slopes/stairs make
  a traversable contour opening; ladders/ropes connect validated lower and upper
  anchors. Generation and the future editor place crossings, while the selected
  tileset only chooses their art.
- **Coasts:** every land/ocean border generates the beach/shore band from the
  current coast logic (generalized from radial `coastDepth` to a signed
  distance derived from C) — islands get beaches, cliffs get coastal-cliff
  faces, exactly as today but anywhere.
- **Feature biomes** ride a sixth rare-feature hash: **volcano islands** are
  mid-ocean island cells (island-band C) that pass a low-probability hash gate
  — the whole island re-themes to the Volcano tileset with a caldera
  (multi-level volcano cliffs), lava pools (blocking liquid, animated,
  doc 27 light emitters — warm pulse), lavafall faces on cliff edges, volcano
  rocks/plants; **oases** keep their current ring logic inside desert cells.
  ShroomLands is a reserved future feature biome (assets exist; not in v1).

**New/expanded biomes and their art** (all committed or extractable, licensed):

| Biome | Tiles | Status |
|---|---|---|
| plains / meadow / valley | existing grass family + tufts | committed |
| forest / woodland | existing grass + tree density | committed |
| savanna | `tile_cf_desert_grass` + acacia trees + dry tufts | committed |
| desert (interior, ridges, shore) | `tile_cf_desert*` family | committed |
| mountains | stone-cliff variants ×4, multi-level | committed |
| volcano island | `Volcano_Tiles`, `Volcano_lava_buble`, `Volcano_Lavafall`, rocks/plants/fence | **extraction needed** |
| beaches / coastal cliffs / freshwater / lakes | existing | committed |

## 4. Server persistence — lazy chunk materialization

Publish-time generation of every resource row cannot survive 4M chunks. The
world materializes **on first approach**, Minecraft-style:

- **New table `world_chunk`**: `{ chunkX: i16, chunkY: i16 (composite PK via
  by_chunk unique btree), generatedVersion: u16, curated: bool, populatedTick:
  u64 }`. A row means "this chunk's entities exist".
- **Materialization is server-driven**: each `stepWorld` tick, for each online
  player, any ungenerated chunk within `MATERIALIZE_RADIUS` (view-radius max +
  1) enters a queue; the tick materializes up to `CHUNKS_PER_TICK = 8`,
  nearest-first. Materializing a chunk deterministically generates its
  resources (trees/rocks/ore per biome density tables — the current per-tile
  hash gates and ore-zone logic rescoped to chunk windows) and its wildlife
  (§6), inserts the rows, and writes the `world_chunk` row. One transaction
  per chunk; two players racing into the same chunk is safe by PK.
- **Row ids become coordinate-stable without a bijection to a fixed width**:
  `resourceId(x, y) = (zigzag(y) << 16 | zigzag(x)) + 1` — with ±32k i16
  coords, zigzag fits u16 each, the id fits u32 inside the existing u64
  column, deterministic and collision-free; doc 26's per-space id band
  composes above bit 20 if spaces land. Wildlife keeps its ≥10 000 id band
  but moves to auto-inc (its ids never need to be derivable).
- **Ore distribution** replaces the fixed 3×2-zone layout with per-region
  zoning: the world divides into 64-chunk ore regions, each guaranteeing
  spaced nodes of region-appropriate kinds (depth/biome-weighted — desert and
  volcano regions favor gold/topaz/ruby; mountains iron/silver-tier), so ore
  stays deliberately placed, not white-noise.
- **Regeneration policy**: bumping the world version regenerates a chunk
  **only when** it is not `curated` and contains no player-modified rows
  (placed chests/placeables, soil, harvested-but-persistent state). Modified
  chunks keep their entities and only re-derive terrain-side data. This is
  what makes hand-crafting and player bases survive generator upgrades.

`stepWorld`'s existing full-table scans (collision rebuild, NPC stepping)
become chunk-scoped around online players as a prerequisite — at 4M potential
chunks this stops being an optimization (doc 26 §10 already flags it) and
becomes correctness.

## 5. Client — unbounded rendering

- Whole-world terrain arrays become a **chunk-keyed sample cache**: terrain
  bytes, cliff roles, and classification computed per 16×16 chunk (+1-tile
  apron for autotiling) on demand, LRU ~256 chunks, keyed
  `(seed, version, chunkX, chunkY)`. The ground cache above it is already
  chunk-keyed and needs only key plumbing.
- The chunk cache separates flat base pixels from sparse raised-structure
  foreground rows. Foreground terrain interleaves with world entities using an
  elevation-aware projected depth key: `footY - projectedHeight(elevation)`,
  with a sub-pixel plane bias ordering lower occupant, boundary, then upper
  occupant where they share a screen foot. This is
  2.5D projection, not freeform 3D: raised surfaces and their occupants render
  north by `elevation × faceRows`, while their logical/collision coordinates stay
  unchanged. The projected overlap lets lower actors walk behind the full rear
  cliff silhouette while actors standing on that cliff remain in front.
- Camera/zoom bounds decouple from world size (`minimumZoom` from viewport
  only; `cameraAxisOffset` unclamped); `subscriptionChunkBounds` and
  `viewRadiusForViewport` lose their `[0, COUNT−1]` clamps and clamp to the
  extent instead.
- The client additionally subscribes (same radius pattern) to `world_chunk`
  (to know curation state), `world_terrain_override` (§7), and — unchanged —
  all entity tables. Terrain for *unmaterialized* chunks still renders
  perfectly (it's pure math); only entities pop in with materialization,
  within one subscription radius — invisible in practice.

## 6. Wildlife — biome-affine spawning (extends the shipped system)

`wildlife.ts` already has species, habitats, variants, locomotion, sleep
cycles, hives, and chunk-radius activity gating — and even defines `camel`,
`scarab`, and `vulture` with a `desert` habitat. The revamp adds the two
missing dimensions — **where in the world** and **which variant where**:

- **`WildlifeSpeciesDefinition` gains `biomeWeights`**: a weighted biome list
  replacing implicit island placement. Weights, not absolutes — "vultures
  mostly in deserts": `vulture: { desert: 80, savanna: 15, badlands: 5 }`.
  Pasture/farmyard species weight to plains/meadow; freshwater fauna to
  lakes/wetlands anywhere; capybara to wetland; snails/mice to woodland;
  butterflies/bees to meadow and flower fields.
- **Variant pools per biome** (the color-affinity ask): a per-species optional
  `variantWeights: Record<biomeGroup, readonly variantIndex[]>` — the sheet's
  color rows are data: dark/brown sheep and cows weight to savanna, pale ones
  to meadow; brown/black scarabs to open desert, green to desert-grass edges;
  dust-colored chickens to savanna farmsteads, white to plains. Unlisted
  biomes fall back to the uniform pool, so it's pure data tuning.
- **Spawning joins chunk materialization**: each materialized chunk rolls its
  deterministic wildlife population from biome density tables (herd-clustered:
  one hash picks a herd anchor + species, members scatter around it — matching
  the existing wander-leash AI). Density caps per species per 3×3-chunk
  neighborhood prevent walls of pigs. A slow **repopulation sweep** (lazy,
  tick-delta driven like all our regen) tops chunks back toward baseline so
  hunted/scattered fauna recovers.
- **Art gap**: desert species definitions exist but sprites don't — extract
  `Camel_{1-3}`, `Vulture_{1-4}`, `Scarab_{Black,Brown,Green,Yellow}` from the
  Desert pack via the existing wildlife extractor. Volcano biome ships with no
  fauna in v1 (the pack's volcano creatures are enemies — combat era).

## 7. Hand-crafted curation — editing the world after the fact

The owner requirement that shapes the whole design: procedural first,
**hand-crafted forever after**. Three mechanisms, layered:

1. **Terrain overrides** — new table `world_terrain_override`:
   `{ id: u32 (same zigzag coordinate id), tileX/Y: i16, chunk btree,
   overrideKind: string }` where `overrideKind` names a biome/tile paint
   (`grass`, `path`, `water`, `desert`, `cliff_level_2`, …). **Precedence is
   absolute: override > procedural**, applied identically in the client
   sampler and the authority collision builder (both consume one shared
   `composedTileAt(x,y)` in sim, so render and collision cannot disagree —
   the standing single-array rule, preserved). Owner-only reducers
   `paintTerrain(x, y, kind)` / `eraseTerrainOverride(x, y)`, audited like
   `adminTeleport`.
2. **Entity placement** — owner reducers `placeWorldResource`, `placeWildlife`,
   `removeWorldEntity` insert/delete ordinary rows (ids from a reserved
   curated band so they never collide with generated ids). Placed rows live in
   materialized chunks and are immune to regeneration by the §4 policy. The
   in-game surface is an **owner editor mode** (hotbar-like palette over the
   existing admin gating); the docs/23 widget system supplies the UI.
3. **Stamps** — the dormant `.map.json` format becomes the **prefab format**:
   a legend + layers grid that an owner tool (`npm run world:stamp <map> <x> <y>`)
   compiles into a batch of override + placement reducer calls. This is how
   villages, ruins, or a hand-built cove get authored offline in text (the
   asset-pipeline ethos applied to level design) and applied to the live world.
   Stamping a chunk sets `curated = true`, freezing it against regeneration.

## 8. Migration — from the 320×320 island (world v2)

The legacy island is worldgen v1's output plus real player state. Migration
re-anchors rather than preserves terrain:

- Player positions, farms, soil, chests, placeables, and inventories translate
  by a fixed offset so the island's spawn plaza lands at **origin**; all
  translated chunks materialize as `curated` with their existing entity rows
  preserved verbatim.
- The island's *terrain* is replayed into overrides by a one-shot migration
  script (its generator is deterministic — sample v1, emit `paintTerrain`
  batches for every tile that differs from v2's procedural output at that
  coordinate). The familiar home island therefore survives pixel-perfect as
  the world's first curated region — and infinite ocean-then-continents now
  extends beyond its old edge, which is the diegetic reveal of the update.
- The spawn/knockout path keeps using the island plaza; new players start on
  the curated island and walk out into the generated world.
- One-way migration, tested against a copy of production data per docs/08.

## 9. Interplay with the other 2026-08-25 specs

- **Spaces (doc 26)**: this generator is space 0. If spaces land first, the
  sampler takes `spaceId` and this doc's tables gain the column on creation;
  if this lands first, doc 26 adds its column additively. Mines under a
  semi-infinite overworld later become per-region instances — explicitly
  deferred.
- **Lighting (doc 27)**: lava pools/falls register as static warm emitters
  with `pulse` flicker; volcano ambient stays clock-driven (it's outdoors).
- **Stats/combat (docs 25/28, now partially implemented)**: biome-weighted ore
  regions feed the smelting economy; savanna/desert fauna are flavor until the
  combat era adds threats. The shipped projectile system is untouched.
- **Weather/seasons**: unchanged and global in v1; per-biome weather (no rain
  in deserts, ash over volcanoes) is a listed later hook on the existing
  stateless weather functions.

## 10. Performance budgets (extends docs/21 §8)

- Chunk terrain sample (16×16 + apron, all fields + biome + cliff roles):
  ≤ 2 ms; ground-cache bake unchanged. Materialization: ≤ 8 chunks per 50 ms
  tick, each a single transaction ≤ 3 ms.
- Client memory: terrain LRU ≤ 256 chunks ≈ a few MB; ground cache stays 64.
- `stepWorld` with 8 online players spread across the world: collision +
  wildlife work scoped to their active chunk neighborhoods only; full-table
  iteration of any spatial table in the tick loop is a lint-level offense
  after this doc.
- F3 gains: current biome + noise-field values at the player, materialized
  chunk count, generation queue depth.

## 11. Phasing

**Prerequisite (2026-08-26):** the scalability audit of
[34-backend-scalability.md](34-backend-scalability.md) gates this plan —
its stages 1–2 (index discipline, subscription budget/`MAX_VIEW_RADIUS`,
wildlife-profile chunk columns, item expiry, player-cap lift) land before
phase 2 below, and its stage 3 (chunk-scoped `stepWorld` via Range scans)
lands with it. Doc 34 §2 is the findings register; nothing below repeats it.

1. **Pure sampler + parity** (sim only): `terrain-gen.ts` fields, biome
   table, elevation contours, semantic crossings, chunk-windowed sampling;
   golden determinism
   tests (client/server byte parity per chunk, 1 000 random chunks); the
   legacy generator stays live in-game.
2. **Infinite plumbing**: `world_chunk`, lazy materialization, id scheme,
   unclamped subscriptions/camera, chunk-scoped `stepWorld`, client chunk
   terrain cache. World v2 migration (§8). The world becomes infinite here,
   with current-quality biomes.
3. **New biomes**: mountains (multi-level), savanna, desert interiors at
   scale, volcano islands + Volcano tileset extraction, lava emitters.
4. **Wildlife**: biome weights, variant pools, herd spawning at
   materialization, repopulation sweep, desert species extraction.
5. **Curation**: overrides + paint reducers, owner editor mode, stamp tool,
   curated-flag regen policy (the island migration in phase 2 uses the
   plumbing; the editor UX lands here).
6. **Later hooks**: rivers, ShroomLands feature biome, generated structures
   (villages/ruins as auto-applied stamps), per-biome weather, i32 extent,
   per-region mine instances.

## 12. Out of scope

Freeform 3D coordinates/physics and arbitrary overhangs (integer 2.5D terrain strata
and elevation-aware occlusion are in scope); cave layers under the overworld (doc 26 owns underground);
hostile spawns (combat era); per-biome weather; rivers; structure generation;
player terraforming (curation is owner-only; player world-editing is fences
and placeables per doc 28); biome-based farming modifiers.

## 13. Tests and acceptance

- **Unit (sim):** per-chunk byte-parity goldens (named `30§3`) across seeds and
  far coordinates (±30k); biome-table adjacency invariant (enumerate all
  quantization-adjacent cell pairs — no forbidden pairings like desert/snow-
  tier, every land/ocean adjacency resolves to a shore band); autotiler
  resolvability on 1 000 random mountain chunks (no unresolvable contour);
  zigzag id round-trip + uniqueness across sign quadrants; ore-region spacing
  guarantees; wildlife density caps and variant-pool weighting distributions;
  override precedence in `composedTileAt` (render/collision agreement).
- **Elevation/depth:** nested level-1/2/3 contour goldens; raising and then lowering
  an editor fixture restores byte-identical plans; every supported tileset profile
  resolves the same topology; lower-behind/lower-in-front/upper-on-top ordering;
  transition openings affect exactly their named contour; no cross-level interaction
  through an unbroken cliff.
- **Reducer (world):** materialization idempotence (two players racing one
  chunk → one row set); regen policy (curated and modified chunks survive a
  version bump, pristine chunks regenerate); paint/place/erase happy + auth-
  failure paths, audited; migration script on a production copy — every
  pre-migration entity row present and correctly translated after.
- **Two-client:** both walk 1 000 tiles apart and back — identical terrain,
  entities consistent, no subscription churn regressions; one client watches
  the other's chunk materialize within one radius; painted terrain appears
  for both and collides identically.
- **Browser/perf:** walk continuously in one direction for 5 minutes — stable
  frame rate, bounded memory, no cache thrash; §10 budgets on the F3 overlay.

## 14. Bookkeeping

- **docs/06**: new tuning section — noise scales, biome-table thresholds,
  density tables, wildlife weights (numbers mirror there per policy).
- **docs/00**: doc-map row. **docs/14**: milestone entries for §11.
- **docs/20**: mark the island generator sections as superseded (v1 world);
  its resource/anti-dupe rules remain binding. **docs/21**: note the client
  chunk terrain cache replacing whole-world arrays.
- **DECISIONS.md** on adoption: (1) semi-infinite chunked generation with
  lazy server materialization and client-side pure terrain — extent ±32k
  tiles on existing i16 columns; (2) biome selection via quantized multi-noise
  table whose adjacency rules make transitions smooth by construction;
  (3) curation layer: overrides beat procedural, curated/modified chunks
  never regenerate; (4) legacy island preserved as the curated origin region
  via replay-into-overrides; (5) wildlife spawning becomes biome-weighted
  with per-biome variant pools.
