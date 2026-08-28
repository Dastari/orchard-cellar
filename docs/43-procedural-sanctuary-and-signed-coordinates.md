# 43 — Procedurally Assisted Sanctuary and Signed World Coordinates

Owner-directed plan, adopted **2026-08-27**. Status: **signed coordinate kernel,
multi-noise semantic sampler, chunk halos, unbounded offline seed canvas, and headless seed-map foundation are
implemented offline; live streaming/materialization is not started**. This document reactivates the useful Minecraft-style parts of
[30](30-infinite-terrain.md) under the safe-world direction in
[40](40-sanctuary-overworld-and-zoned-world.md): the topside sanctuary is a large,
seed-deterministic generated world which normal players cannot destructively edit,
while approved admin authorship composes permanent sparse overrides over that base.

The result is **procedurally assisted**, not a finite hand-painted sanctuary and not a
destructible survival wilderness. Near spawn, the owner can curate roads, settlements,
POIs, terrain, and scenery until the world feels authored. Farther out, untouched
chunks remain pure seed output and appear without anyone manually painting them.

This plan also amends [42](42-world-editor.md)'s original zero-based finite coordinate
assumption. Finite interiors, fixtures, and stamps keep explicit bounds, but all spaces
share one signed coordinate algebra.

## 1. Binding outcome

- Space `0` is the generated sanctuary surface. Its terrain is a pure function of
  `(worldSeed, generatorVersion, tileX, tileY)` plus sparse curated overrides.
- Normal players may travel, socialize, trade, discover POIs, and enter destination
  spaces there. Doc 40's prohibition on ordinary harvesting, combat, farming,
  terraforming, dropped clutter, and freeform construction remains binding.
- Admin/editor changes are semantic—raise terrain, change a material, add a river,
  place a road/POI/scenery—not stored atlas frames. The shared compiler regenerates
  every shore, bank, cliff face, inset, path join, collision mask, light role, and
  depth layer affected by the edit.
- Untouched terrain is never stored tile-by-tile. A distant chunk can render from the
  seed before the server has materialized any mutable rows there.
- World creation materializes only a central spawn-readiness square. The initial
  target is radius **12 chunks** (25×25 chunks / 400×400 tiles), which covers the
  maximum nine-chunk client view plus a three-chunk approach buffer. This is a
  generated land region selected through seed preview—not a forced island or an
  authored rectangular terrain boundary.
- Beyond that square, the authority materializes chunks only as exploration approaches
  them. It never generates the full possible extent at publish/startup.
- Generated mutable content is appropriate only for the space profile. Sanctuary
  chunks generate immutable scenery and sparse POI candidates; harvestable resources
  and hostile encounters remain in typed forest/cave/mine destinations.
- Generator upgrades never silently rewrite curated fields. Each override pins the
  generator baseline it was authored against and wins until deliberately rebased or
  erased.

## 2. Coordinate model

Use a signed, Cartesian-style **world grid**, while retaining the screen-friendly
direction already used throughout the engine:

```text
                     -tileY / north
                            ^
                            |
          -tileX / west <-- (0,0) --> +tileX / east
                            |
                            v
                     +tileY / south

                 elevation increases upward
```

This is deliberately not mathematical `+Y = north`. Flipping the existing Y axis
would invert rendering, painter order, cardinal topology, movement, and authored art
for no generation benefit. It is the usual 2D game/world grid: signed X/Y on the
ground plane, with elevation as the independent vertical axis.

### 2.1 Origin policy

- The topside origin is the canonical world-spawn/arrival plaza. Seed search may
  choose a suitable spawn region, but once a world is created the selected origin and
  seed/version are durable and never drift after a generator update.
- Finite destination spaces use the same signed coordinates. Their author chooses a
  useful origin—normally spawn, doorway, map centre, or another stable anchor—and an
  explicit rectangular extent which may cross zero.
- Portable stamps use stamp-local coordinates plus an explicit placement anchor.
  Applying a stamp translates them into the destination space; the stamp itself never
  pretends its local origin is the world's origin.
- Screen, camera, projected cliff-face, and atlas coordinates remain presentation
  values and are never persisted as logical terrain coordinates.

### 2.2 Chunk algebra

All packages use one pure implementation:

```ts
chunkX = floorDiv(tileX, 16);
localX = floorMod(tileX, 16); // always 0..15
tileX = chunkX * 16 + localX;
```

The same applies to Y. JavaScript remainder is not floor-modulo: `-1 % 16 === -1`,
so raw `% 16` is forbidden for world-to-chunk conversion. Required goldens include:

| tile | chunk | local |
| ---: | ----: | ----: |
|  -17 |    -2 |    15 |
|  -16 |    -1 |     0 |
|   -1 |    -1 |    15 |
|    0 |     0 |     0 |
|   15 |     0 |    15 |
|   16 |     1 |     0 |

Introduce plain structural types/functions in pure sim rather than converting every
number into a nominal class:

```ts
interface SpaceTilePoint {
  spaceId: number;
  tileX: number;
  tileY: number;
}
interface SpaceTileBounds {
  minTileX: number;
  minTileY: number;
  width: number;
  height: number;
}
interface ChunkPoint {
  spaceId: number;
  chunkX: number;
  chunkY: number;
}
interface ChunkLocalPoint {
  localX: number;
  localY: number;
}
```

APIs carrying more than one coordinate domain accept these objects so local tile,
world tile, fixed position, projected pixel, and screen pixel values cannot be
silently interchanged.

### 2.3 Extents and storage widths

The first generated sanctuary keeps doc 30's existing **playable extent of ±32,000
tiles**. That is roughly 64,000 tiles across and sixteen million possible chunks—large
enough that normal travel feels unbounded—while fitting the signed `i16` tile columns
already used by spatial tables. The existing signed `i32` fixed-point position stores
comfortably cover that extent.

`SpaceDefinition` replaces the assumption that every space is a zero-based square:

```ts
type SpaceExtent =
  | { kind: "finite"; bounds: SpaceTileBounds }
  | { kind: "seeded"; minimum: -32_000; maximum: 32_000 };
```

Code must ask the extent policy rather than read `sizeTiles` or assume zero is an
edge. If a later measured need justifies i32 tile coordinates, docs/08 requires
versioned replacement tables, dual-write/backfill, binding regeneration, and a
controlled switch. It is not necessary for the first vast world.

## 3. Seed generation pipeline

The public unit is a chunk-window sampler, not a whole-world array:

```ts
sampleTerrainChunk(seed, generatorVersion, chunkX, chunkY): SemanticTerrainChunk
```

It is pure, deterministic, and shared by client, world authority, tools, tests, and
the editor. Internally it samples global coordinate fields; a chunk border never
restarts a random stream.

### 3.1 Generate meaning before art

Generation runs in ordered semantic passes:

1. continentalness and major land/ocean shape;
2. temperature, moisture, erosion, ridges, and elevation;
3. biome/material selection and biome-transition bands;
4. global hydrology—watersheds, lakes, rivers, tributaries, mouths, waterfalls;
5. macro features and routes—volcanoes, valleys, settlements/POI candidates, roads;
6. local deterministic variation and immutable scenery candidates;
7. curated semantic overrides;
8. topology resolution into visual roles, collision, lighting, and painter depth;
9. theme mapping from roles to reviewed runtime assets/animation groups.

The generator never emits a hand-picked `frame 58` as terrain authority. It emits
roles such as `river.bank.inner_ne`, `path.t_join_west`,
`contour.right.wall.middle`, or `shore.convex_sw`; the selected complete terrain
theme maps those roles to art.

### 3.2 Cross-chunk continuity

Every requested chunk samples an **apron/halo** around its 16×16 payload. The halo is
derived from the largest registered topology dependency: at least the eight-neighbour
ring, plus the maximum authored cliff-face projection/depth needed by the active
terrain family. Only the central 16×16 semantic payload is cached as that chunk.

This guarantees that independently generated adjacent chunks choose identical:

- biome transition and coast tiles;
- animated water body, banks, insets, mouths, and waterfalls;
- path ends, straights, corners, T/cross joins, and surface transitions;
- nested contour caps, side joins, face rows, foot rows, and crossings;
- collision/light roles on both sides of a boundary; and
- deterministic scenery exclusion/spacing decisions.

Rivers, roads, and mountain chains are never rolled as unrelated per-chunk shapes.
They derive from global continuous fields or deterministic macro-region graphs whose
ownership is stable across chunk borders. A feature receives a coordinate-stable id
from `(seed, version, feature domain, macro coordinate)`.

Generation time and order cannot affect a seam. Chunk `(4,7)` generated at world
creation and neighbouring chunk `(5,7)` generated months later sample the same global
fields and each other's halo coordinates. Their shared coastline, river bank, path,
biome blend, contour face, collision, light, and depth roles must therefore match
byte-for-byte. No pass seeds a random stream from “current chunk then iterate”; every
sample and feature owner is derived from absolute signed coordinates.

### 3.3 Generator versions

Seed alone is insufficient. Every world records a generator version and content/theme
compatibility version. The same pair must produce byte-identical semantic chunks on
client and authority forever. Changing generation creates a new previewable version;
it never mutates the active world merely because new code was deployed.

The editor gains a seed-map view inspired by Minecraft seed browsers: seed/version,
space/dimension, pan/zoom, low-detail biome/elevation/hydrology layers, feature
toggles, coordinate search, and “open this region in the detailed editor.” Overview
levels sample deterministic summaries; they do not materialize or persist every tile.

### 3.4 Terrain-role and transition completeness

Every supported terrain family publishes a versioned semantic-role manifest. It maps
surface, border, inset/outset corner, shore/bank, cliff cap/face/foot, crossing, path,
river, animated-water, and lighting/depth roles to reviewed runtime assets. Terrain
generation asks only for those roles; it never guesses a nearby atlas coordinate or
uses transparent padding as an accidental transition.

A compatibility matrix declares which material pairs may touch and which transition
family resolves each supported adjacency. The validator exhaustively renders the
registered cardinal/diagonal neighbourhood masks, every crossing, every elevation
delta, and every declared material pair—including cases split across a chunk seam. A
theme may explicitly inherit a reviewed fallback role, but missing roles, animation
groups, collision roles, or depth roles are publication errors rather than silent
substitutions.

The composed-tile inspector remains the debugging authority: it shows the semantic
inputs, selected role, every visual layer/underlay, source asset id, collision/light/
depth output, and final composition. Licensed source sheets remain ignored under
`references/`; cataloguing them does not make unreviewed pixels runtime assets.

The initial biome-to-family contract is:

| Generated ecology                         | Terrain family                              | Licensed source family to extract/review                                                                   |
| ----------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| meadow                                    | `temperate_meadow`                          | Grass 1 + Water Tile 1                                                                                     |
| woodland/wetland                          | `temperate_woodland`                        | Grass 2 + Water Tile 2                                                                                     |
| flat plains                               | `temperate_plains`                          | Grass 3 + Water Tile 3                                                                                     |
| high/arid grass                           | `temperate_highland`                        | Grass 4 + Water Tile 4                                                                                     |
| cold elevation-4 summit / later snowfield | `snow_highland`                             | Grass 4 substrate plus reviewed snow roles from `Cute_Fantasy_Christmass/Decorations/Christmass_Grass.png` |
| ordinary coast                            | compatible temperate family + `beach` shore | Cute Fantasy Beach sheets                                                                                  |
| desert                                    | `desert_1..3`                               | matching Desert Beach, Water, Cliff, and Waterfall sets 1–3                                                |
| Shroomlands                               | `shroom_green/blue/purple`                  | matching ShroomLands grass; ShroomLands cliff/waterfall roles                                              |
| volcanic                                  | `volcanic`                                  | Volcano terrain, lava/lavafall, bridge, and later prop roles                                               |

The sim sampler emits `terrainFamily`, `shoreFamily`, and `cliffFamily` separately.
Thus a lake retains the family of the biome surrounding it, and a desert shoreline
cannot accidentally resolve through temperate Beach/Water art. Missing Shroomlands or
Volcano water roles require an explicit reviewed fallback until their complete family
is extracted; they may not silently borrow an atlas neighbour.

The Christmas sheet is an overlay/decoration source, not evidence that every snow
shore, river bank, cliff, inset and crossing role already exists. `snow_highland`
therefore composes snow coverage over a compatible Grass 4/temperate-stone substrate
and remains incomplete for publication until the terrain-family coverage matrix is
green. Generator v2 may emit the semantic family at cold elevation-4 summits so seed
previews and future extraction have a stable target. Snow is cosmetic for collision;
it must not introduce a second height plane.

No reviewed snowy-tree family exists yet. Permanent summit snow uses an explicit
tree-line rule (no ordinary green tree generation above it) rather than pretending a
summer tree is snow-covered. Lower snowy woods remain disabled until matching tree
art is acquired or deliberately adapted and reviewed. The same snow roles may later
support winter accumulation, but seasonal coverage is a render/theme mask and cannot
change the seed biome, elevation, collision, or curated override provenance.

## 4. Procedural base plus permanent curation

Composition for one cell is:

```text
seeded semantic base
  -> curated chunk-field overrides
  -> semantic crossings/collision exceptions
  -> immutable scenery, anchors, POIs and protected regions
  -> shared topology/theme compiler
```

Overrides are sparse 16×16 chunk payloads with per-field masks. Painting a road does
not freeze unrelated elevation; raising terrain does not freeze unrelated biome
decoration. A “freeze complete chunk” action remains available for deliberately
hand-authored landmarks, but it is explicit rather than the result of touching one
cell.

An edit invalidates every touched chunk plus the compiler dependency halo. Adjacent
chunks re-resolve their transition roles, so a river or cliff painted up to a chunk
edge cannot leave the neighbour visually stale. Erasing the last override restores
the exact current pinned generator result.

The live authority stores revision headers, override chunks, crossings, scenery,
anchors, and audits—not generated terrain pixels or frame ids. Untouched chunks need
no terrain database row. `world_chunk` materialization tracks generated mutable/static
entity state and curation/version metadata, not whether terrain is visible.

### 4.1 Exploration-triggered materialization

Chunk lifecycle is explicit:

1. **Unseen:** no `world_chunk` row exists. Terrain is still derivable from the
   seed/version at any time.
2. **Queued:** an approaching player's bounded interest window plus generation buffer
   requests the chunk. Duplicate requests collapse onto one `(spaceId, chunkX,
chunkY)` job.
3. **Materialized:** one idempotent transaction writes the chunk version/checksum and
   any allowed deterministic static entities, POI state, or spawn manifests. It does
   not write 256 terrain rows.
4. **Curated:** sparse semantic overrides and authored objects compose over the same
   pinned generated baseline permanently.

The server maintains a small priority queue ordered by distance from connected
players. It prepares chunks before they enter the visible/subscribed region, respects
the per-tick generation budget, and applies backpressure rather than hitching the
world tick. If two players approach the same unseen chunk, the indexed lifecycle row
and deterministic stable ids make the race exactly-once and harmless.

Terrain sampling itself may be evicted and recomputed because it is a pure function;
“generated once” refers to durable materialization of mutable/static entity state.
This avoids storing an enormous immutable tile map while guaranteeing that revisiting
or restarting produces the same ground and never duplicates entities.

## 5. Editor bounds and resize interaction

### 5.1 Infinite/generated spaces

The sanctuary has no editable canvas edge. Its camera can pan and zoom across signed
coordinates up to the configured soft extent. Admin edits create sparse override
chunks under the viewport or within a selection. A selected region/stamp has resize
handles; the world itself does not.

The implemented offline seed preview exposes that unbounded signed plane directly.
A bounded 25×25 terrain composition slides beneath the detailed camera as a renderer
cache, while distant viewports receive dynamically bounded semantic overview rasters;
neither is a world or editor boundary. The recursive grid shows individual chunks
nearby, groups them in powers of four at seed-map zoom, and emphasizes both zero axes.
It renders locally materialized payloads and retains a one-pixel-per-tile semantic
preview for every unmaterialized chunk even at editing zoom. **Generate Chunk** from
the selected chunk inspector atomically replaces that preview with full tile
composition. This action only fills the browser's deterministic preview cache; future
live materialization remains an authenticated authority operation.

Seeds in editor URLs and durable world identity are canonical unsigned 32-bit
integers. A legacy textual preview seed is hashed once into its numeric input value so
the normalized terrain remains byte-identical. Randomizing a seed is a destructive
local-preview reset: the editor warns about unsaved changes, replaces the seed, clears
the materialized set, regenerates origin chunk `0,0`, and performs no live write.

### 5.2 Finite maps, interiors, fixtures, and stamps

Replace the individual W/E/N/S resize buttons with a visible bounds frame:

- four edge handles resize one side; four corner handles resize two sides;
- handles remain screen-readable at every zoom and are hit-tested before terrain;
- drag previews snap to whole tiles and labels the proposed signed bounds/dimensions;
- Shift snaps in eight-tile/chunk-friendly increments;
- Alt/Option resizes symmetrically around the authored origin;
- zoom is viewport/memory bounded, never map-size bounded, and the free camera may
  show matte/grid space beyond every edge;
- cropping authored cells, transitions, scenery, or anchors shows a destructive
  preview and requires release/confirmation; undo restores it exactly; and
- resizing bounds preserves stable space coordinates. Moving/rebasing all content is
  a distinct explicit command, never an accidental side effect of pulling an edge.

`MapDocumentV3` adds signed bounds and imports V2 as `{ minTileX: 0, minTileY: 0 }`.
V2 remains readable; export writes V3 after migration. Cell keys, transitions,
scenery, and anchors use signed space coordinates. Canonical ordering is numeric by
Y then X—not lexical string order—so negative coordinates remain deterministic.

## 6. Current-system impact register

| Area                 | Current assumption                                  | Required change                                                                      |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| sim terrain          | 832×832 arrays and `tileY * size + tileX`           | chunk/window data with an origin and local indexing                                  |
| coordinate helpers   | scattered floor/division/bounds math                | one `floorDiv`, `floorMod`, tile/chunk/local conversion contract                     |
| movement/collision   | zero-based `CollisionMap.width/height`              | origin-aware collision windows or accessors used identically by prediction/authority |
| space registry       | square `sizeTiles`                                  | finite signed bounds or seeded extent policy                                         |
| renderer/camera      | clamps to `0..worldPixels`                          | unclamped seeded-space camera; finite bounds only for finite spaces                  |
| terrain/ground cache | non-negative chunks and whole terrain identity      | signed `(spaceId,seed,version,chunkX,chunkY)` keys; no zero clamp                    |
| raised terrain       | arrays bounded at zero                              | chunk apron plus world-origin-aware sampling/depth entries                           |
| subscriptions        | bounds clipped to `0..chunkCount-1`                 | signed rectangular ranges clipped only to seeded extent                              |
| authority tick       | whole collision/world scans remain in paths         | doc 34 stage 3 active-neighbourhood Range scans before cutover                       |
| spatial tables       | signed i16 tiles/chunks, i32 fixed positions        | widths already fit; enforce extent and negative-coordinate tests                     |
| stable ids           | fixed-width `tileY * size + tileX`                  | domain-separated signed-coordinate encoding/hash with collision tests                |
| resources/wildlife   | publish-time whole-island generation                | lazy deterministic chunk materialization appropriate to space profile                |
| homestead founding   | samples current island coordinates                  | samples signed sanctuary coordinates; founding seed/version/signature remain frozen  |
| portals/POIs         | tile columns already signed                         | remove non-negative validation and validate against destination extent               |
| lighting/weather     | reads a whole terrain array                         | reads the same visible semantic chunk window; global clock remains unchanged         |
| editor documents     | V2 zero-based dimensions, resize translates content | V3 signed bounds; handle resize preserves coordinates; explicit rebase command       |
| tools/tests          | enumerate one whole map                             | chunk fixtures, negative quadrants, seam pairs, seed overview, migration reports     |

The change is broad but the foundations are suitable: spatial schema is already
signed and chunk-indexed, `spaceId` already partitions worlds, regional subscriptions
are already rectangular and bounded, the ground cache is already chunk-keyed, and
the terrain compiler already separates semantic height from its visual face rows.

## 7. Existing-world transition recommendation

Build the new generator **from scratch** rather than stretching the radial legacy
island algorithm. Preserve player/account value, not every flaw in the beta terrain.
This amends doc 30 §8's earlier requirement to replay the entire island pixel-perfect
as production overrides.

The migration is still controlled and non-destructive to durable player data:

1. Freeze the legacy seed/version and export its terrain, POIs, portals, and authored
   state as a reviewable V3 map/stamp plus rendered evidence. Keep its pure generator
   as a regression fixture.
2. Generate and review many candidate v2 seeds in the overview tool. Select one spawn
   region and persist its signed origin transform.
3. Curate the new spawn region in the editor. Import only approved legacy landmarks
   or compositions as stamps; do not import the 256-tile ocean apron or automatically
   freeze the entire old island.
4. Preserve identities, memberships, profiles, appearance, inventories, progression,
   statistics, commerce, dialogue, and owned destination spaces unchanged.
5. Re-home connected/durable topside positions to validated arrivals near the new
   origin. Translate approved POIs/Homestead entrances through an explicit reviewed
   mapping; their destination `spaceId` contents do not move.
6. Reconcile legacy mutable overworld resources, soil, drops, projectiles, wildlife,
   chests, and placeables according to doc 40's sanctuary rules. Nothing is silently
   copied to an invalid or destructive sanctuary context.
7. Rehearse the additive/versioned migration against a populated database copy,
   export before/after manifests, then cut over by generator version. Do not reset the
   production database or infer ownership from names.

If the owner later wants the complete old island in the new world, it can be applied
as one curated stamp at a chosen coordinate. It is an option, not a migration burden.

## 8. Implementation phases

### Phase A — signed coordinate kernel and parity

- Add pure coordinate, bounds, floor-div/mod, stable signed key/id helpers.
- Add origin-aware terrain/collision window contracts and `SpaceExtent`.
- Convert finite code paths behind adapters without changing the live island output.
- Add negative-quadrant, chunk-boundary, fixed-position, portal, and query goldens.

**Gate:** the current world remains byte-identical and client/authority movement still
agrees before any new sampler becomes live.

### Phase B — editor camera, signed bounds, and handles

- Add MapDocumentV3 import/export and numeric canonical ordering.
- Let the editor pan/zoom beyond finite bounds; render the origin, signed grid labels,
  bounds frame, eight drag handles, crop preview, and explicit rebase command.
- Remove the individual resize buttons after handle/browser acceptance.
- Add tests across zoom/DPR/elevated picking and every handle/corner/negative bound.

### Phase C — pure seed sampler and overview

- Implement doc 30's multi-noise semantic fields through a chunk-window API.
- Add macro feature ownership, hydrology, biome transition bands, nested elevation,
  and cross-chunk topology halos.
- Add the seed-map overview with layer/feature toggles and detail-editor handoff.
- Compare candidate seeds without touching live world state.

### Phase D — unbounded client plumbing

- Replace whole-world terrain arrays with a bounded signed chunk LRU.
- Remove topside camera/ground-cache zero clamps and fixed-size subscription clamps.
- Compose visible chunks plus halos through the existing renderer, lighting,
  inspector, and collision prediction paths.
- Prove bounded memory during long travel and no seam across negative chunk borders.

### Phase E — authority materialization and scalability

- Complete doc 34 stage 3's chunk-scoped scheduled work.
- Add `world_chunk` and lazy, idempotent materialization queues.
- Materialize the radius-12 spawn-readiness square during world-version creation,
  then use player-interest look-ahead for every chunk beyond it.
- Generate immutable sanctuary scenery/POI candidates, while destination profiles own
  harvestable or hostile populations.
- Add per-chunk version/curation policy and signed Range-query fixtures.

### Phase F — migration rehearsal and sanctuary cutover

- Produce legacy export and populated-database before/after manifests.
- Select/curate a v2 spawn, map approved POIs, and run the reconciliation policy.
- Verify two clients, reconnect, backup/restore, portal returns, Homesteads, renderer
  budgets, and a long signed-coordinate traversal before switching active version.

### Phase G — live curation

- Land doc 42's authenticated revision schema and editor grants.
- Publish sparse semantic chunk overrides with conflict/rebase/audit/revert.
- Invalidate only touched chunks plus halo and prove normal clients never receive
  editor sessions or revision history.

Do not combine the phases into a flag-day rewrite. Phases A–C can land while the
legacy island stays live; D–F are the controlled world switch; G makes the generated
sanctuary permanently authorable afterward.

### Development database isolation

All phase A–E authority experiments publish only to the local
`orchard-cellar-procedural-dev` database through `npm run world:procedural-publish`.
They do not republish, migrate, regenerate bindings against, or stop the current
`orchard-cellar-world` database. A production cutover requires phase F's explicit
populated migration rehearsal and owner approval; merely completing the generator is
not a cutover instruction.

### 2026-08-27 foundation verification

- `packages/sim/src/world-coordinates.ts` implements the signed floor-div/mod kernel.
- `packages/sim/src/procedural-terrain.ts` implements versioned domain-warped
  continentalness, erosion, peaks/valleys, temperature, moisture, elevation,
  biome-family selection, oceans/coasts, lakes, ponds, and continuous river channels.
- Every 16×16 payload is resolved from a four-tile global-coordinate apron and emits
  eight-neighbour surface/biome/family/water/elevation masks plus cardinal traces.
- `npm run terrain:seed-map` renders ignored PNG/JSON biome, family, elevation, water,
  continentalness, temperature, moisture, or erosion reviews without reading atlas
  frames or writing live state.
- Focused sim coordinate/generator tests: **20 passed**, including delayed-neighbour
  seams through rivers, lakes, ponds, coast, biome-family transitions, and contours.
  A 100-chunk warm sampler run averaged **1.26 ms/chunk** on the development host.
  The first biome/family seed
  reviews and their metadata are under ignored `packages/assets/review/`; no licensed
  reference source was copied or added to version control.
- The world module built and published successfully to the newly created local
  `orchard-cellar-procedural-dev` database. `spacetime list --server local` confirms it
  exists alongside the still-active `orchard-cellar-world`; the current database was
  not published, migrated, stopped, or regenerated.
- Repository verification passed: SpaceTimeDB module build, all workspace typechecks,
  ESLint, **122 test files / 763 tests**, and validation of **556 art assets**, three
  songs, ten SFX, two maps, 55 palette colours, and four seasonal remaps.
- `/editor` opens the same sampler without authentication or
  SpaceTimeDB code. The origin payload is visible; neighbouring payloads are outlined
  until selected and generated. Browser verification on `https://orchard.dastari.net`
  generated signed chunk `1,0`, persisted `0,0;1,0` locally, reported no render error, and recorded zero
  SpaceTimeDB/API resources.

### 2026-08-27 generator v2 scale and snow semantics

- Generator v2 narrows minor-river scalar bands from the v1 14–15-tile editor scale
  to a normal 2–3 walk-tile target. The representative
  `orchard-sanctuary-20` cross-section at `tileY=-196` is exactly two river cells;
  v1 uses its original threshold and remains explicitly reproducible.
- Cold elevation-4 summits emit `snow_highland` while retaining `cold_grass` as their
  material substrate. Seed/biome previews render them as snow; the runtime terrain
  family will compose reviewed Christmas snow overlays over Grass 4 only after its
  required-role coverage is complete.
- The newly available premium Christmas source remains ignored at
  `references/Cute_Fantasy_Christmass/`. Its license permits use/modification but not
  redistribution, so only reviewed semantic extracts may enter public assets. The
  current pack supplies snow overlays/decorations but no complete snowy-tree family.

### 2026-08-27 generator v3 river-width and material-preview correction

- Generator v3 replaces the raw minor-river field threshold with an approximate
  signed distance to the continuous river centreline. The reviewed diagonal fixture
  stays two to three walk tiles wide through every sampled bend instead of collapsing
  to a one-tile water sliver; v1 and v2 remain explicitly reproducible.
- The editor's temporary legacy-material adapter now resolves desert before generic
  sand/coast. Desert rivers/lakes use the oasis-water family, cardinal desert banks
  use desert-shore, and ordinary desert remains desert, so preview art no longer
  substitutes beach-with-grass transitions or temperate freshwater substrate.
- A 100-chunk warm v3 sampler run averaged **1.44 ms/chunk** on the development host.
  Focused goldens cover the two-to-three-tile bend width, generator-version pinning,
  and desert/desert-shore/oasis-water conversion.
- Temperate freshwater rendering now keeps the cardinal water frame as its base and
  composes each required inverse bank as a transparent overlay. A narrow diagonal
  bend may need two opposite corners on one cell; composing both removes the exposed
  square-water protrusions and remains continuous when that cell lies on a chunk seam.

### 2026-08-27 generator v4 minimum river-core correction

- Generator v4 raises minor-river half-width from 1.1 to 1.45 sampled tiles. Reviewed
  diagonal sections are therefore 3–4 semantic water cells wide rather than 2–3,
  leaving visible water between the composed banks and removing bank-only pinches.
- V4 deliberately reuses V3's field seed. Continents, elevation, climate, biome
  families, and river centrelines remain identical for a given world seed; only the
  river-width classification changes. V1–V3 remain reproducible.
- The diagonal golden covers repeated bends across a chunk-scale sample, requires
  every cross-section to remain 3–4 cells wide, and rejects opposing inverse-corner
  pinches of the form that produced the visually closed channel.

### 2026-08-27 generator v5 waterfall crossings

- A river crossing from a higher northern cell into a lower southern cell now emits
  a semantic waterfall strip instead of allowing the ordinary river and projected
  stone face to overlap. The raised-terrain compositor replaces the cap, two physical
  wall rows, and cosmetic foot row with the corresponding waterfall atlas rows; the
  editor and game therefore use the same depth-aware composition.
- V5 deliberately reuses V3/V4's field seed and V4's 3–4-cell river width. Continents,
  climates, biomes, elevations, and river centrelines remain unchanged. The golden at
  `(275,-1000)` covers all four waterfall rows and verifies identical classification
  in independently sampled neighbouring chunk aprons.
- The current art family faces south. Side/rear crossings are not silently rotated;
  the planned hydrology/contour repair pass must reroute them to a representable face
  or select a future directional waterfall family.
- A terrain-validity finding remains open around chunks `(-186,-41)` through
  `(-184,-39)`: long diagonal and concave elevation signatures can request sharp rear
  rock edges or ambiguous multi-boundary intersections that the present cliff grammar
  cannot represent cleanly. Resolve this with a deterministic representable-contour
  validation/repair pass, not coordinate-specific frame substitutions.
- Inset-only rear caps no longer draw an opaque middle-stone seam underlay beneath
  their inverse overlay. True exposed side joins retain the underlay, removing the
  pale rock block visible in both the editor inspector and live game.

### 2026-08-27 generator v6 representable waterfall repair

- V6 keeps V5's continental, climate, biome, elevation, and raw river fields, then
  performs a deterministic local repair when a river reaches a one-level,
  south-facing drop. The repaired water runs straight south through a fixed
  **3-tile-wide by 4-row** fall rather than carrying a diagonal river mask down the
  projected cliff face.
- The cliff crest is forced flat across the waterfall width plus a two-tile land
  shoulder on each bank, so both wall joins meet the fall on the same horizontal
  row. The first waterfall row stays on the upper elevation and the remaining three
  visible rows use the lower elevation. Each approach starts at three rows and may
  extend deterministically to sixteen when a fast diagonal centreline needs more
  space to preserve cardinally connected water. The abandoned diagonal cells are
  removed and banks re-form around one continuous channel.
- Repair lookup is expressed entirely in signed world coordinates and is included in
  apron sampling. The waterfall fixture crossing chunks `(16,-63)` and `(17,-63)`
  verifies that independently sampled neighbours classify every shared cell
  identically. Pinned V1-V5 worlds retain their previous semantics.
- The client ground cache now defers every elevation-crossing waterfall cell to the
  raised-terrain compositor. This removes the duplicate unprojected waterfall sheet
  that previously appeared beneath the depth-aware four-row fall.
- A 100-chunk general sampler averaged **7.11 ms/chunk** on the development host;
  twenty waterfall-region chunks averaged **10.54 ms/chunk**. Contiguous chunk
  sampling discovers and rasterizes repairs once per window rather than repeating
  the crest search for every cell. Multi-tile overview pixels intentionally sample
  the unchanged macro fields because a three-tile waterfall is sub-pixel at that
  scale; detailed previews and materialized chunks use exact repaired semantics.

### Follow-up: tile-friendly contour regularization

Keep V6 reproducible. A later generator version should compare its raw semantic
fields with a contour-regularized alternative that preserves the same large-scale
landforms while preferring longer cardinal runs, minimum straight-run lengths, and
deliberate corners. Rivers, shores, elevation bands, and biome boundaries should be
natural at overview scale but constrained to shapes representable by the selected
pixel tileset. The editor should render both versions from the same seed side by side
before this becomes a materialization default.

## 9. Acceptance suite

- Same seed/version/chunk yields byte-identical semantics on client, authority, CLI,
  and editor across 1,000 coordinates including all sign quadrants.
- Adjacent chunks generated independently have byte-identical shared apron results.
  Golden seams cover coast, every biome transition, river/bank, road/path, every
  raised contour role, ramps, caves, and animated terrain.
- The same seam goldens pass when one neighbour is materialized during world creation
  and the other is materialized later, in either order and after a server restart.
- Every enabled terrain theme reports complete semantic-role, transition-pair,
  animation, collision, light, and depth coverage; deleting one required mapping
  makes validation fail with the exact missing role and neighbourhood fixture.
- Generating chunks in a different order does not change any result or feature id.
- An override crossing a chunk boundary updates both sides and erasing it restores
  the exact seed result.
- Teleporting to a signed coordinate derives the correct biome, elevation, collision,
  light blockers, and subscription region without prior traversal/materialization.
- Walking across `-17/-16/-1/0/15/16` tile and chunk boundaries produces no cache,
  collision, subscription, rendering, or reconciliation discontinuity.
- Seed overview zoom levels agree with detailed chunks at sampled coordinates and do
  not allocate a whole-world terrain array.
- Editor bounds handles work at every corner, zoom, DPR, and signed bound; cropping is
  explicit and exactly undoable.
- A pristine far chunk has zero terrain rows; first approach materializes its allowed
  entity state once even when two players race it.
- A fresh world contains only the configured spawn-readiness chunks; walking outward
  grows materialization near connected players without generating unrelated regions.
- Curated chunks survive generator preview/version changes; untouched chunks switch
  only during an explicit world-version migration.
- The populated migration preserves every retained account/destination row and emits
  an explicit disposition for every legacy spatial row.
- F3 reports signed tile/chunk/local coordinates, seed/generator version, biome/noise
  values, terrain/materialization cache sizes, queue depth, and override provenance.

## 10. Non-goals

- Mathematical `+Y = north`, freeform 3D, arbitrary overhangs, or voxel destruction.
- Storing generated terrain rows or map-sized arrays for the new sanctuary.
- Letting ordinary players terraform or harvest the sanctuary.
- Generating final frame ids before semantic topology resolution.
- Making every finite Homestead/interior infinite merely because the topside is vast.
- Preserving the complete beta island as mandatory production terrain.
