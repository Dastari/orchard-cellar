# 50 — Unified Elevation Terrain & Editor Plan

Status: proposed (2026-08-31). Companion reading: `references/documents/design/2.5d-multi-elevation-terrain-system.md`
(external concept doc — largely adopted, with the divergences noted in §2), docs 11, 20, 30, 41, 42, 43.

## 1. Where we actually are (audit summary)

The repo does **not** contain several competing elevation engines. It contains **one canonical
grammar** plus a ring of legacy/dead/parallel paths that were never retired, and a large art gap.

### The canonical core (keep, converge on)

- **Integer elevation field** per space (`TerrainArray.elevations`, `Uint8Array`), documented as
  "the editor/generator source of truth; every raised contour is derived independently from it"
  (`packages/engine/src/terrain.ts:82`).
- **Shared autotile resolver** `packages/sim/src/raised-terrain-autotile.ts`: per contour level
  `k` (region = `elevation >= k`), 8 edge roles + 4 stackable inset (concave) roles + multi-row
  face profiles with left/middle/right joins, seam underlays, ramp roles, `faceClearanceRows`.
  Consumed by island mountains, cellar walls, roguelike rooms, the map compiler, and the editor.
- **Tileset-as-data** (`RaisedTerrainTileSet`): frames per role, face rows with
  `blocksMovement/blocksLight/contributesHeight`. Two exist: `SURVIVAL_RAISED_CLIFF_TILE_SET`
  (Stone Cliff 1, `survival-world.ts:233`) and `CAVE_RAISED_CLIFF_TILE_SET`
  (`cave-autotile.ts:20`).
- **Walk-behind already works and scales with height.** A cliff's face lives on plane `L−1` and
  y-sorts against lower actors; its cap lives on plane `L` and unconditionally covers the
  lower plane (`raised-terrain-depth.ts:281`). Visual offset = `L × projectedRows × 16px`;
  collision for face rows is re-projected north by the same amount
  (`survival-world.ts:1268`), so the logical rows behind an N-high cliff stay walkable — exactly
  the "walk behind by the same number of blocks" requirement, already proportional to height.
- **Lowered terrain already has a working model: the cellar inverse.** Rock = elevation 1,
  dug floor = 0 (`baseDatum` 0); rock is an ordinary raised plateau whose surface, rim and
  wall courses are displaced north by the wall height. Lower-plane collision clears displaced
  rock coverage and writes both blocking front-wall courses at their projected destinations,
  while the first excavated floor row south of the artwork stays open and the raised plane
  retains the full rock footprint. The former
  `visualProjectionRows = 0` underground special case is gone (2026-09-02); `interior`
  now only means "solid outside the array, opaque rims, capped faces".
- **Edge-based traversal**: `TerrainTransition` (slope/stairs/ladder/rope) is the only legal
  height crossing; everything else fails closed (`movement.ts:130`, `terrain-elevation.ts`).
- **Editor foundation**: `MapDocumentV2` (sparse per-cell `elevation/surface/feature/collision`,
  signed `Int16Array` in the compiler), offline editor with raise/lower polygon brushes,
  undo/redo, WHY-THIS-TILE trace; CLI `map:contour` already supports arbitrary ±N deltas.

### The divergent ring (retire or wire up)

| # | Item | Where | Disposition |
|---|---|---|---|
| 1 | Legacy island cliff-role classifier (`SURVIVAL_CLIFF_ROLES`, 22 flattened roles, level-1 only) | `survival-world.ts:193-216, 1336-1413` | Retire; migrate consumers to elevation queries |
| 2 | Legacy 4-neighbour cave wall resolver (test-only dead code) | `cave-autotile.ts:111-158` | Delete |
| 3 | Coastal/desert cliff frame arithmetic baked into ground chunks (biome-driven; `coastal_cliff` never emitted) | `terrain.ts:1252-1287` | Delete (violates docs/11 §229) |
| 4 | Hardcoded 2-way tileset switch | `terrain.ts:810` `raisedCliffTileSetFor` | Replace with family registry (§4) |
| 5 | `plateaus` deprecated alias; dead loaded art (`cliff2/3/4`, `grassCliffEdge`, ~300 frames) | `terrain.ts:91`, `overworld-art.ts:137,858` | Remove |
| 6 | Orphaned legacy `packages/assets/maps/*.map.json` format + bespoke validator | `validate-assets.ts:75` | Delete or migrate to MapDocumentV2 |
| 7 | `procedural-terrain.ts` v6 (`logicalElevation`, `cliffFamily`, 8-bit masks) — disconnected from live game | `procedural-terrain.ts` | Keep as future generator; adopt its `cliffFamily` enum now (§4) |
| 8 | Dirt terraces (separate role enum, blob47, ramp stub returns `[]`) | `survival-world.ts:270,1177` | Keep cosmetic; out of unification scope |
| 9 | Known small divergences: inspector misses `roguelike` (`terrain-inspector.ts:224`), argless `terrainProjectedRowsPerLevel()` in `editor-picking.ts:44,65`, client/authority roguelike collision channel mismatch, `terrainPlaneCollisionCellAt` cellar-only, light occluders gated to topside + maxElevation>1 | various | Fix in Phase 1 |

### The art gap

Only Stone Cliff 1 and Cave Walls have role mappings. Desert cliff art (143 frames) is imported
but unmapped; ShroomLands cliffs (9×12 sheet) unextracted; Volcano and Dungeon "walls" were
extracted as flat 3×3 field fills with wrong metadata (`placement.layer: "object"`,
`blocksMovement: false` — `extract-cute-fantasy-nature.ts:405`). The generator already defines
`PROCEDURAL_CLIFF_FAMILIES = [temperate_stone, desert_cliff_1..3, shroomlands, volcanic]`
(`procedural-terrain.ts:77`) — no renderer consumes it. The editor's 12-entry TERRAIN FAMILY
dropdown is dead UI state.

## 2. Philosophy: where we agree/disagree with the reference doc

Adopt: elevation as source data, cliffs as derived edge deltas, contour-per-level resolution,
composable wall rows, logical-vs-visual-vs-depth separation, edge-based traversal, editor paints
elevation not sprites, derived data never persisted. All of that is already how the core works.

Diverge:

1. **Do not rebuild cliff topology around the 47-blob mask.** The doc recommends blob47 for
   contour shape. Our cliff art (Cute Fantasy) is authored as caps/faces/insets in role-shaped
   sheets, and the existing role grammar composes multi-height stacks, seam underlays, and
   face clearance — things blob47 doesn't express. Keep blob47 where it's used today (surface
   fringes, paths, farmland, terraces); keep the role grammar for elevation contours. The doc's
   own §25 ("hybrid") supports this reading.
2. **Signed elevation: adopt, but as a widening, not a rewrite.** The map compiler is already
   `Int16Array`; the live contract is `Uint8Array` with the cellar modeling "lower" as
   rock-datum-1/floor-0. We widen the shared contract to signed and keep the cellar unchanged
   (it's just base-datum 1).
3. **Edge traversal overrides**: `TerrainTransition` already is the doc's `TerrainEdgeOverride`
   for the crossings we need. Don't add a parallel override table.
4. **Surface stacks (bridges/caves-under-mountains)**: defer, as the doc itself recommends.
   Separate spaces already cover under-ground play.

## 3. Phase 1 — Converge on one implementation (no new features)

Goal: after this phase there is exactly one cliff/elevation code path in the live game.

1. Retire the legacy classifier (#1): move biome classification and resource exclusion to
   elevation-based queries; delete `cliffRoles` bytes; remove the contour-1 legacy ramp fallback
   (`terrain.ts:846-855`) after asserting `survivalTerrainTransitions` covers every generated
   ramp (test exists: `raised-terrain-depth.test.ts:229`).
2. Delete dead code (#2, #3, #5, #6) and their tests; drop dead art from the atlas/load set.
3. Fix the small divergences (#9), including making authority and client build roguelike
   collision through the same plane-indexed path.
4. Replace generator-string checks (`=== 'cellar' || === 'roguelike'`) with data:
   add `projectionStyle: 'raised' | 'interior'` (and `fixedPlane`) to the tileset/space
   contract so `visualProjectionRows`, surface-run suppression, OOB-elevation=1, and plane
   pinning all derive from declared data instead of name checks.
5. Golden tests: island seed contour counts (docs/14 goldens), raise-then-lower byte-identical
   round trip (exists, `terrain.test.ts:466`), walk-behind band height == `L × projectedRows`
   for L = 1..3, cellar breach-immediately-traversable.

## 4. Phase 2 — Tileset family registry (the "pick a tileset" requirement)

1. New module `packages/sim/src/terrain-tilesets.ts`: registry
   `TERRAIN_CLIFF_FAMILIES: Record<CliffFamilyId, RaisedTerrainTileSet>` covering every family
   in §4.3 (superset of `PROCEDURAL_CLIFF_FAMILIES`). Each entry declares edge/inset frames,
   one or more face profiles, transition art (ramp + stair, see §6), `faceClearanceRows`,
   `projectionStyle`, and its atlas asset id.
2. Replace `raisedCliffTileSetFor` with a family lookup. Family source: a per-tile
   `cliffFamilies: Uint8Array` channel on `TerrainArray` (sparse-defaulted per space), fed by
   the generator (island → `stone_1`, cellar/rogue → `cave`, rogue themes → their families
   instead of per-pixel recolour where art exists) and by map documents.
3. **Full import matrix.** Requirement: every Cute Fantasy terrain set below ends up available
   in the registry and selectable in the editor. Status per set (sheet dims verified against
   the source PNGs; layouts per `docs/reference-assets/cute-fantasy-index.json`):

   | Source sheets | Family id(s) | Style | Today | Work |
   |---|---|---|---|---|
   | `Stone_Cliff_{1,2,3,4}_Tile.png` (14×6 each) | `stone_1..4` | raised | all 4 imported as 84-frame assets; only 1 role-mapped, 2–4 loaded-but-dead | registry entries only — same layout as stone_1, near-zero art work. Include `Stone_Cliff_x_Cave_Entrance` (3×3) as doorway decor |
   | `Grass_Tiles_{1,2,3,4}.png` (16×10 each) + `Grass_{1..4}_Middle.png` | `grass_1..4` surface families | surface fringe + ledge | Grass 1 partially extracted (ground, blob47 fringe, 1-block ramp); 2–4 untouched | extract per-variant ground/fringe/ramp/**stair** banks; each sheet also carries tall repeatable wall-course columns and brick wall strips (extract as composable face rows / wall props) |
   | `Desert_Cliff_Tiles_{1,2,3}.png` (13×11 each) + `Desert_Cliff_Waterfall_{1,2,3}` | `desert_1..3` | raised | sheet 1 imported (`tile_cf_desert_cliff`), unmapped; 2–3 raw-only | map desert_1 (art present), extract+map 2–3 (identical layout); wire waterfall strata like stone |
   | `Cave_Walls.png` (7×8) | `cave` | **interior only** — correct, the sheet has no raised/outdoor bank; do not fabricate one | mapped, live | add its transition art: `Cave_Floor_Ladder` as the ladder crossing (cave currently has `rampFrames: {}` and therefore zero height crossings) |
   | `ShroomLands_Cliff_Tiles.png` (9×12) + `ShroomLands_Grass_{Green,Blue,Purple}` + waterfall | `shroomlands` (+ 3 surface variants) | raised | nothing extracted | extract + map cliff set; surface variants map to the SHROOM GREEN/BLUE/PURPLE dropdown entries |
   | `Volcano_Tiles.png` (29×9 mixed) + `Volcano_Lavafall` | `volcanic` **and** `volcanic_interior` | both raised and interior banks exist in the sheet | mis-extracted as flat 3×3 fills (floor and wall are the same 9 rects) | re-extract as semantic subsets: raised cliff bank → `volcanic`, interior wall bank → `volcanic_interior`, lavafall as the waterfall analog |
   | `Dungeon_1.png` (13×13), `Dungeon_2.png` (13×12) + sewer sheets | `dungeon_1..2` | interior | mis-extracted as flat fills | extract wall grammar (edges/insets/faces), `projectionStyle: 'interior'`. **`Dungeon_3/` is empty in references** — no source art exists; acquire the pack file before promising `dungeon_3` |
   | `references/art/kenmi/cute-fantasy/free/Tiles/Cliff_Tile.png` (3×6), Christmas/snow pack | `basic`, `snow` | raised | raw-only | optional follow-ons (SNOW is already in the editor dropdown; keep the id reserved) |

   Order of leverage: stone_2–4 (mapping only) → desert_1 (art present) → grass variants +
   stairs (unblocks §6 art) → shroomlands → volcanic re-extract → dungeon 1–2 → desert_2/3 →
   basic/snow.
4. Fix extractor metadata: structural tiles get `blocksMovement: true`, `layer: 'ground'`,
   semantic `terrain.cliff.*` tags; stop the one-boilerplate-block-for-everything in
   `extract-cute-fantasy-nature.ts`.
5. Validation + review harness: `assets:validate` rule "every declared role frame index exists
   in the referenced tile asset"; a `render:cliff-family <id>` review renderer (pattern:
   `render:cave-autotile`) that renders the §7 shape matrix for a family to PNG for eyeballing.

## 5. Phase 3 — Signed elevation and true lowered terrain

1. Widen the contract to signed: `Int16Array` elevations in `TerrainArray` and the sim;
   plane-indexed collision indexed by `elevation − minElevation`; remove the negative-value
   throw in `terrainProjectedDepthOffset`; visual offset becomes
   `(elevation − baseDatum) × rows × 16` so negatives shift down-screen.
2. Lowered terrain = the same resolver, unchanged: for a pit at −2 in ground at 0, contours
   k = 0 and −1 resolve regions `elevation >= k`; the surrounding ground projects faces into
   the pit exactly as cellar rock does, and the south rim's cap (higher plane) covers a player
   inside the pit — the doc's "foreground rim" falls out of the existing plane sort. Verify,
   don't assume: add occlusion tests (player in pit behind south rim; walk-behind band inside
   the pit == depth × rows).
3. N-block raise/lower is already structurally supported (stacked contours, per-level collision
   projection); lift the per-system caps (`island 3`, `procedural 4`, `terrain-lab 6`) into one
   constant, and add tests for 0→5, 5→0, and pit-inside-plateau (doc §37) shapes.
4. Multi-height wall art: one logical elevation contributes one structural course. The lowest
   exposed contour contributes `lower_wall + foot`; higher exposed contours contribute the
   repeatable `wall` row. Thus L1 is one wall tile high, L2 is `wall + lower_wall`, and the
   cosmetic foot never changes projection depth. Profile data remains a tileset lever.
5. Raised and excavated contour footprints have a 2×2 semantic minimum. Point elevation
   brushes stamp 2×2, edits prune one-cell-wide remnants, and procedural contour masks pass
   through the same union-of-2×2 filter before autotiling.

## 6. Phase 3b — Transitions: 1-block ramps and N-block stairs

Current state (verified): transitions are auto-placed, single-level, and grass-only.

- `TerrainTransition` crosses **exactly one contour** by design (`terrain-elevation.ts:9-17`);
  the island generator places one deterministic two-tile south slope per connected contour
  component (`survivalPlateauRamps`, `survival-world.ts:1128`). Climbing a 3-high mountain
  means finding three separate ramps, one per terrace.
- The renderer draws every ramp with the grass 2×2 ramp art unconditionally
  (`art.grassCliffRamp`, `raised-terrain-depth.ts:427`) — wrong for every non-grass family.
- Cave declares `rampFrames: {}`, so cellars/rogue rooms have **no height crossings at all**
  (ladder/rope kinds exist in the type but nothing emits or renders them).
- The editor command layer already has `add_transition`/`remove_transition`
  (`map-editing.ts:33`), but no UI tool drives them.

Plan:

1. **Per-family transition art in the tileset defs.** Keep `rampFrames` (the small
   ramp/"path" cut, 1-block only, e.g. `Grass_Tiles_*` 2×2) and add `stairFrames`: a 2-wide
   stair strip decomposed as top / repeatable-middle / bottom courses. Source art exists per
   family — e.g. the wooden step strips in `Grass_Tiles_{1..4}.png` (one dirt-lipped, one
   stone-lipped variant per sheet), and equivalents in the desert/shroomlands/volcano sheets;
   `Cave_Floor_Ladder` covers the interior families. Where a family genuinely lacks stair art,
   the registry entry says so explicitly (no silent borrowing, per the cute-fantasy-index
   rule).
2. **Multi-level stairs without touching the movement guard.** Author/generate a
   `StairRun { x, y, direction, fromLevel, toLevel }`; the compiler expands it into a chain of
   existing single-level `TerrainTransition`s, one per course row, so
   `movementCrossesBlockedElevation`, lane rules, and the continuous foot-Z interpolation all
   work unchanged. Collision lanes are punched through every crossed plane (the per-level
   punch already exists; it just needs to run for each chained level).
3. **Rendering.** Stair strata replace the cliff face strata for their columns, exactly the
   way waterfalls already hijack cliff rows (`raisedTerrainWaterfallFrameIndex`,
   `raised-terrain-depth.ts:256`) — same mechanism, new frame source, so depth/occlusion
   behavior is inherited.
4. **Generation.** Keep automatic placement but make it height-aware: a 1-level boundary gets
   the family ramp; an N-level boundary component gets an N-course stair run (replacing the
   current one-ramp-per-terrace chain where the terraces stack). Fix the hardcoded grass ramp
   to resolve through the family registry. Give cellars their ladder crossings.
5. **Validation.** A stair run must span exactly the elevation delta of the boundary it sits
   on; the map validator flags runs orphaned by later elevation edits (same staleness rule as
   manual autotile overrides).

## 7. Phase 4 — Editor as the terrain test bench

All work in the offline editor (`/editor/terrain/<id>`) + `MapDocumentV2` + CLI.

1. **Wire the family dropdown for real**: add `cliffFamily` (per-cell override + per-map
   default) to `MapDocumentV2`; thread through compiler → `editor-terrain.ts` → registry
   lookup. Add brushes for the schema surfaces that lack them (`sand`, `stone`, `cave_floor`)
   and an "interior/excavation" paint mode that authors the cellar-style inverse.
2. **Raise/lower by N**: delta stepper (±1..±8) on the raise/lower tools feeding
   `change_elevation_polygon` (the command already takes arbitrary deltas — only the UI
   hardcodes ±1 at `offline-editor.ts:622`); add `Set Elevation` and `Flatten` tools; keep the
   drag-path polygon but add a closable lasso + preview-before-commit.
3. **Manual repair of wrong autotile picks** (the AI-fix requirement): add a sparse
   `MapCellOverride.terrainOverride?: { role?: RaisedTerrainRole; frameIndex?: number;
   family?: CliffFamilyId }` honored by the resolver as a final substitution step. UX: the
   existing WHY-THIS-TILE inspector gains "replace this piece" — pick any role/frame from the
   active family's palette for the selected cell/contour. Overrides are authoritative data
   (doc §46) and survive re-autotiling; a validate pass flags overrides that became
   topologically stale after later elevation edits.
4. **Ramp/stair placement tool**: a transition tool driving the existing
   `add_transition`/`remove_transition` commands — click a boundary edge, pick
   ramp/stair/ladder; N-level boundaries place a `StairRun` (§6). Auto-placed generator
   transitions render distinctly from authored ones in the overlay.
5. **Default route**: make `/editor` land somewhere paintable (or clearly signpost the
   read-only procedural inspector), fixing the biggest usability trap.
6. **Regression matrix**: extend `sim/terrain-lab.ts` into the doc-§91 matrix — isolated cell,
   strips, all convex/concave corners, T-junctions, donut, peninsula; heights 0→1/2/5,
   4→1, 0→−1/−3; plateau-in-plateau, pit-in-plateau, peak-in-pit; ramp + N-course stair
   crossings; one lab map per cliff family. Snapshot the compiled plans (JSON goldens) and
   render PNGs via the Phase-2 harness.

## 8. Phase 5 — Live island & publish path (separate track)

- Island keeps generating elevations; it just resolves through the registry with
  `stone_1`. No visual change expected — assert the docs/14 seed goldens hold.
- Map publish to SpacetimeDB (docs/42 Phase 4: replicated `SetElevation`-style edits, derived
  data regenerated client-side per docs §97) and convergence with procedural-terrain v6 are
  real projects on their own; they are explicitly **not** blockers for unification and should
  not be smuggled into this plan.

## 9. Working notes for implementers

- **Verify with**: `npm run check` (build world + typecheck + lint + `vitest run` + asset
  validation). Art changes additionally need `npm run assets:build` before the client sees
  them. Manual inspection: `npm run editor:dev` → `http://localhost:5174/editor/terrain`
  (the default `/editor` route is the read-only procedural inspector until Phase 4.5); review
  renderers live in `@orchard/tools` (`npm run render:cave-autotile -w @orchard/tools` is the
  pattern to copy for `render:cliff-family`).
- **Ship order within a phase**: each numbered item is intended to be one reviewable change;
  don't batch deletions (Phase 1) with behavior changes.
- **Definition of done per phase**: Phase 1 — grep finds no consumer of `SURVIVAL_CLIFF_ROLES`,
  `cliffRoles`, `plateaus`, or generator-string checks in render paths; island seed goldens
  (docs/14: 1770 L1 / 918 L2 / 191 L3 tiles, 22 transitions) unchanged. Phase 2 — every §4.3
  family with art resolves through the registry and renders a clean §7.6 matrix PNG. Phase 3 —
  a pit map (negative elevations) compiles, renders rims, and passes the occlusion tests.
  Phase 3b — a 3-level stair is climbable in one walk on the island and in terrain-lab, with
  family-correct art. Phase 4 — the §7 editor items each demoed in `terrain-lab`; goldens
  snapshot compiled plans, not pixels, except the per-family PNGs.
- **Do not** hand-edit `packages/world-bindings/src/**` (SpacetimeDB codegen) or
  `packages/client/public/generated/**` (atlas output).
- The working tree currently carries unrelated in-flight changes (see `git status`); branch
  from `main` per phase and leave unrelated modified files alone.

## 10. Sequencing & risk

Phases 1→4 are ordered by dependency; 2 and 3 can interleave (registry doesn't need signed
heights; the editor family work needs the registry; stairs (3b) need the registry's
per-family transition art but not signed heights). Biggest risks: (a) retiring the legacy
island classifier touches biome/resource placement — gate on seed goldens; (b) signed widening
touches the collision plane indexing shared by authority and client prediction — land behind
the existing shared `movementPositionAllowed` tests plus new plane-offset tests; (c) new
tilesets are mapping-heavy and easy to get subtly wrong — that's what the per-family render
harness and the editor override tool are for.
