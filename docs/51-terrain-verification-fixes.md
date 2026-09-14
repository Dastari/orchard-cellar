# 51 — Terrain Unification: Verification Report & Fix Task List

Status: verification of the docs/50 implementation, 2026-08-31. The implementation is the
uncommitted working tree (~11k insertions). Verified by: full `npm run check` (green),
definition-of-done greps, and three independent deep audits (sim/world phases 1+3+3b, tileset
registry+assets, editor+client render).

---

## Part A — Verification report

### Headline

**Substantially implemented, not done.** `npm run check` passes end-to-end (world build,
typecheck, lint, 800+ tests, 865 assets validated) — but the green CI is misleading: three of
the guard tests that would have caught the worst defects were neutralized rather than extended
(A-3 below), and one genuine gameplay-breaking bug shipped on the live island (T2). Treat this
as one solid milestone plus one mandatory fix pass before commit.

### Per-phase verdicts

| Plan phase | Verdict | Notes |
|---|---|---|
| §3 Phase 1 — convergence | **VERIFIED** | Legacy classifier, dead cave resolver, coastal/desert frame math, `plateaus`, orphaned map format: all gone, zero consumers. `projectionStyle`/`fixedPlane`/`baseDatum` are tileset data; all 11 former `=== 'cellar'` checks now derive from it. All four §1.9 divergences fixed. Client/authority roguelike collision parity restored. One accepted behavior drift: resource eligibility on L1 terraces under L2 faces narrowed (goldens still pass). |
| §4 Phase 2 — registry | **PARTIAL** | Registry (15 ids), validator frame-range rule, review harness, `cliffFamilies` channel, atlas integration: all real and wired. But ~half the family *mappings* are wrong art (T5–T11), the volcano sheet wasn't split (T8), grass surface families unregistered (T20). |
| §5 Phase 3 — signed elevation | **VERIFIED / partial end-to-end** | Int16 contract clean, no unsigned remnants, plane indexing offset by minElevation, pit render+occlusion tests pass. No collision producer for negative-elevation map documents yet (T18); per-system max-elevation caps still separate constants (T21 note). |
| §6 Phase 3b — transitions | **PARTIAL** | `StairRun` model, chained-transition expansion, per-plane lane punching, family-resolved ramp art, waterfall-style stair strata: all verified with tests. But the island's generated stair is unreachable (T2), cellar ladder is cosmetic-only (T19), editor tool authors half-ramps (T14). |
| §7 Phase 4 — editor | **PARTIAL** | Family dropdown genuinely wired (dead-UI bug fixed), ±N stepper real, override data model + staleness validation real, transition tool + overlays real, `/editor` defaults to terrain-lab. But override semantics buggy (T13), per-cell family painting is a no-op (T17), Flatten duplicates Set Elevation (T15), no JSON goldens / half the §7.6 matrix missing (T21). |

### A-3: The neutralized guard tests (why CI is green despite T1–T4)

1. **Seed goldens are self-fulfilling.** `promoteTerrainBoundaryPairs`
   (`survival-world.ts:1020`, called `:1096-1114`) mutates *unrelated island tiles* (measured:
   162 rows from the staircase) until the 1770/918/191 histogram matches, and **throws** if it
   can't — so `survival-world.test.ts:389` cannot fail. The 22-transition golden balances by
   construction (3 suppressed ramps × 2 == 6 stair transitions).
2. **Round-trip invariant is a tautology.** `terrain.test.ts:597-609` now asserts
   `expect(plan).toEqual(contour ?? plan)` — the function compared with itself.
3. **Water-transparency light test inverted.** `light-occlusion.test.ts:40-47` is still named
   "…water remain transparent" but now asserts the water tile is a hard blocker (its index
   coincides with a wall face row, so the water case is untested).

Full evidence and additional minor findings are in the task list below; each task carries its
file:line references.

---

## Part B — Fix task list

Ordering rule: **do T1 first** — it restores honest failure signals, so later fixes get caught
by tests instead of re-verification. Tasks are sized to be one reviewable change each.

### P0 — blockers (must fix before commit)

**T1. Un-rig the seed goldens and restore the three neutralized tests.**
- Remove `promoteTerrainBoundaryPairs` and the throw-on-mismatch (`survival-world.ts:1020,
  1096-1114`); let the stair carve change the histogram and update the golden numbers in
  `survival-world.test.ts:389,404` (and docs/14) to the *honest* post-stair values, with a
  comment explaining the delta.
- Restore a real round-trip/cross-check invariant in `terrain.test.ts:597-609` (the old
  generator-role vs resolver comparison lost its reference data when `SURVIVAL_CLIFF_ROLES`
  was retired — replace with a golden JSON of resolved plans for a fixed island window).
- Restore a genuine water-transparency assertion in `light-occlusion.test.ts:40-47` using a
  water tile that is not covered by a projected face row.
- Also: the promotion pass ignored `survivalSpawnProtectedAt` / landmark reservations — moot
  once removed, but if any compensation logic survives, it must respect them.
- **Done when:** deliberately changing a contour constant makes the golden test fail; the
  water test fails if `light-occlusion.ts` blocks water.

**T2. Island stair is carved into a sealed pit — a 734-tile mountain is unreachable.**
- `carveIslandStairRun` (`survival-world.ts:1062`) scores sites only by edit distance, so it
  cuts a pit whose 2-tile L0 foot is enclosed by L2 on all sides (live seed: stair at
  x=367,y=337). `survivalPlateauRamps` then suppresses that component's ramps
  (`:1255-1260`), orphaning the L1/L2/L3 component (734/281/41 tiles, zero remaining ramps).
- Fix: accept a stair site only if its foot tile is laterally connected to the surrounding
  datum plane (BFS/flood check), or carve an approach channel; only suppress a component's
  ramps when the stair foot is provably reachable from the ground plane.
- **Done when:** a walkability BFS from spawn reaches every contour component on the live
  seed (add this as a permanent test — it is the true replacement for the transition golden).

**T3. Interior-family tileset sampled at tile (0,0) as a map-wide global (8 call sites).**
- Painting one `cave_floor` cell at the origin flips the whole map: `raised-terrain-depth.ts:58`
  (surface caps vanish), `ground-cache.ts:353` (cave floor fill everywhere),
  `collision.ts:44,82,89` (map-wide `fixedTerrainPlane: 0`), `editor-picking.ts:45,69`,
  `terrain-inspector.ts:290`, `light-occlusion.ts:160`, `overworld-main.ts:3378`.
- Fix: these are per-map/per-space decisions — derive them from a declared per-space
  projection style (e.g. `TerrainArray.projectionStyle` set at construction), not from
  `raisedCliffTileSetFor(terrain, 0, 0)`. Per-cell family should only affect per-cell art.
- **Done when:** a map with default `stone_1` and one painted `cave` cell renders/collides
  normally everywhere except that cell's own art; add a test.

**T4. Topside water hard-blocks light.**
- `light-occlusion.ts:164-166` ORs `terrain.blocked[index]` for all spaces; island `blocked`
  includes every ocean/lake tile, so shoreline lights now cast hard shadows across water.
  The old topside branch used `surfaceTileBlocksLight` alone (comment "shores and water…
  light receivers" was deleted).
- Fix: keep the ungating (interior spaces need occluders) but for raised-style spaces use
  surface/face light flags, not the traversal `blocked` channel.
- **Done when:** restored water test from T1 passes; cellar walls still occlude.

### P1 — tileset mapping corrections (registry data + extraction)

**T5. Remap `shroomlands`** (`terrain-tilesets.ts:172-188`): the cliff bank is a 3-wide block
at cols 0–2 (row0 rim, rows1–4 wall, row5 foot); current mapping collapses it to 2 columns,
uses a wall course as `foot`, and points insets at unrelated salmon-colored frames.
Review PNG (`build/review/cliff-family-shroomlands.png`) is visibly broken.

**T6. Remap `basic`** (`terrain-tilesets.ts:136-151`): row2 cap ring is used as both
`bottom_*` edges and the entire wall profile; insets 11/14 are fully transparent frames.
Renders as a flat field with a border, no cliff.

**T7. Replace fabricated ramp/stair frames.**
- Desert `stairFrames` (`:168`) point at a solid sand ground field; shroomlands
  (`:182-186`) and volcanic (`:199-203`) ramps/stairs are plain ground fills; stone
  (`:68`) fakes a 3-course stair from the 4-frame 1-block ramp, violating the documented
  `stairFrames: null` contract (`raised-terrain-autotile.ts:71-73`).
- Fix: map the real stair strips (grass sheets carry two authored variants each — dirt-lipped
  and stone-lipped; desert/shroom/volcano sheets have their own); where a family truly lacks
  stair art, declare `stairFrames: null` honestly.

**T8. Split the volcano extraction; fix the rogue floor/wall duplicate.**
- `tile_cf_volcanic_cliff` and `tile_cf_volcanic_interior_wall` are byte-identical 29×9
  full-sheet extracts (261 duplicate atlas frames) — the plan required semantic subsets.
- `tile_cf_rogue_volcanic_floor` == `tile_cf_rogue_volcanic_wall` (identical 9 rects — the
  exact bug §4.3 named), and the floor still carries wildlife boilerplate metadata.
- Also fix `volcanic` role bugs: `sides` duplicate `wall`'s outer columns, `lowerWall`
  `[69,70,70]` should be `[69,70,71]`, insets are the four outer corners (`:190-205`).

**T9. Real concave insets for `dungeon_1/2` and `volcanic_interior`** — currently copies of
edge corners (`:210-213`) or `lower_wall` face frames (`:246-249`); concave corners render
convex art.

**T10. Desert row fixes** (`:152-171`): `foot`/`bottom` use `[66,67,68]` (a third wall
course) instead of `[79,80,81]` (ground-contact trim); `inner_bottom_left/right` (105/107)
are 3px/1px blanks — find the real inset frames.

**T11. Stone 2–4 inset palette**: they inherit `insetAssetId: 'tile_cf_stone_cliff_inverse_overlay'`
(stone_1's palette) via spread (`terrain-tilesets.ts:58`); extract per-sheet inverse overlays
or accept and document the tint mismatch.

**T12. Fix the review harness so T5–T11 are eyeball-verifiable.**
- `render-cliff-family-review.ts:104-108`: interior families render solid `baseDatum` outside
  the pattern, flooding the canvas with face rows (dungeon PNGs unreadable) — pad with a
  dug/open border.
- The harness never draws `stairFrames`/`ladderFrames`/waterfalls (`:126-146`) — add them
  (this is why T7 shipped unnoticed).
- Render the terrain-lab documents per family — `createTerrainLabDocumentsByFamily`
  (`terrain-lab.ts:182`) currently has zero consumers.
- **Done when:** every available family's PNG is regenerated and visually approved; check the
  PNGs into `build/review/` or attach to the PR.

### P2 — behavior fixes (editor / compiler / sim)

**T13. Terrain override scoping + UX.**
- `terrain.ts:969-972` applies one override to *every* contour plan of the tile; the compiler
  trace (`map-compiler.ts:236-249`) substitutes only the last layer — renderer and
  WHY-THIS-TILE disagree. Scope the override to a declared contour level.
- Replace the blind frame-cycling tool (`offline-editor.ts:767-786`) with the planned
  inspector flow: WHY-THIS-TILE panel gains "replace this piece" with a role/frame palette.
- Add a test for `terrain_override_stale` (`map-compiler.ts:355-384`, currently untested and
  only fires when `role` is set).

**T14. Transition tool authors half-ramps; non-north crossings render no ramp art.**
- `offline-editor.ts:740-757` emits a single-lane transition, but the resolver picks lanes by
  peer lookup one tile east (`terrain.ts:882-890`, `map-compiler.ts:135-137`) → every
  hand-placed ramp renders as the right half of a two-lane ramp. Author two-lane pairs like
  `terrain-lab.ts:98` does.
- `plateauRampRoleAt` skips unless `direction === 'up'` — either render ramp art for all four
  directions or restrict the tool to directions that have art.

**T15. `Flatten` duplicates `Set Elevation`** (`map-editing.ts:378-393`): both produce
`{ elevation: command.elevation }`. Make Flatten derive its target (elevation under first
click or polygon mode) or drop the command and tool.

**T16. Compiler robustness.**
- `compileMapDocument` throws on an invalid stair run (`map-compiler.ts:103` →
  `expandStairRun` RangeError) instead of reporting `stair_run_invalid`; `add_stair_run`
  (`map-editing.ts:340-352`) doesn't call `stairRunValid`; `parseMapDocument` doesn't
  validate `stairRuns` shape.
- `validateMapDocument` recompiles the whole map once per overridden cell
  (`map-compiler.ts:369` calls `semanticTerrainTraceAt` without the `compiled` arg) — pass
  the compiled document; stroke latency is currently O(overrides × area).
- OOB disagreement: `compiledMapElevationAt` returns `baseElevation` (`map-compiler.ts:122`)
  while the renderer's OOB returns 0 for raised families → phantom cliff ring on any
  non-zero-base document. Align them.
- Ladder transitions produce walkable `crossing.ramp_*` trace layers (`map-compiler.ts:134`
  doesn't filter kind) while collision correctly excludes them — filter the trace.

**T17. Family selection edge cases.**
- Per-cell family painting is a silent no-op: `canonicalPatch` drops `cliffFamily` equal to
  the map default (`map-editing.ts:83-84`) and the UI always sets the default first
  (`offline-editor.ts:1010-1023`). Either make the brush paint per-cell for real or remove
  the pretense.
- Reserved `snow` is selectable (`editor-ui.ts:180` uses unfiltered ids) and restorable from
  session state (`offline-editor.ts:204-205`) — filter to available families in both spots.
- `'basic'` is family ordinal 0, so a zero-filled `cliffFamilies` array silently means basic,
  not the default (`terrain-tilesets.ts:9`, `terrain.ts:806-810`) — reserve ordinal 0 as
  "unset" or make `stone_1` index 0.

**T18. Collision producer for signed map documents.** Pit maps compile and render but nothing
turns a compiled `MapDocumentV2` into a walkable `CollisionMap`; both existing
`terrainPlaneBlocked` producers hard-code min elevation 0
(`survival-world.ts`, `cave-autotile.ts:83-99`). Add a compiler-driven producer honoring
`terrainMinimumElevation` so the editor (and future published maps) can walk pits.

**T19. Traversable interior crossings.** The cellar's single ladder is the docs/49 descent
hatch and deliberately non-walkable; roguelike ships `terrainTransitions: []`. Decide the
gameplay rule (walkable ladders vs interior stairs) and give interior spaces at least one real
height crossing, with a movement test.

### P3 — cleanup, tests, polish

**T20. Register `grass_1..4` surface families** (§4.3 matrix item): sheets are extracted
(`tile_cf_grass_{1..4}_{sheet,middle}`) but there's no surface-family registry, no per-variant
fringe/ramp/stair banks, no editor selection.

**T21. Terrain-lab goldens + missing shapes.** Add the absent §7.6 patterns (isolated cell,
donut, peninsula, explicit corner enumeration, pit-in-plateau, peak-in-pit, 4→1) and a
`terrain-lab.test.ts` snapshotting compiled plans as JSON goldens. Also: unify or explicitly
document the still-separate max-elevation constants (`TERRAIN_ELEVATION_LIMIT = 8` vs
`SURVIVAL_TERRAIN_MAX_ELEVATION = 3` vs `PROCEDURAL_TERRAIN_MAX_ELEVATION = 4`).

**T22. Perf: `terrainElevationAt` resolves the tileset on every sample**
(`terrain.ts:709-720`, twice, inside the hottest resolver callback) — hoist per
tile/classification pass or short-circuit the bounds test first.

**T23. Dead surfaces.** Remove now-unconsumed `cliff2/3/4/desertCliff` art fields +
double-loads (`overworld-art.ts`); remove the permanently-undefined `rogueTheme` recolor path
(`raised-terrain-depth.ts:409,461-509`).

**T24. Metadata and validator hardening.** `tile_cf_cave_floor_ladder` + waterfall sheets
should not be `blocksMovement: true` (they reuse `structuralTerrain.placement`); teach the
validator to flag duplicate frames across roles, insets identical to edges, and
all-transparent frames (would have caught T5–T10); replace the hardcoded waterfall `[0,14]`
probe; add a `terrain-tilesets.test.ts` (registry shape, index↔id round-trip,
`cliffFamilyForProceduralFamily`).

**T25. Small editor polish.** Tool tooltips advertise shortcuts `(9)`–`(15)` that aren't
bound (`editor-ui.ts:722` vs `offline-editor.ts:1206-1218`); persist `elevationDelta` in
session state; add the missing `crossing.stairs` role to `ORCHARD_STONE_THEME`; fix the
`never`-typed return laundering in `map-editing.ts:378-379`.

**T26. Visual check: stair face suppression across contours.**
`raised-terrain-depth.ts:432` suppresses all strata at a stair endpoint's own contour but not
faces projected from other contours — stairs and ramps composite differently. Low confidence;
eyeball via the T12 harness before changing.

### Accepted (documented, no action)

- Resource/decor eligibility narrowed on L1 terraces under L2 faces (classifier retirement
  side effect; goldens pass).
- `stairFrames` on stone remains acceptable *only after* T7 replaces it with either real art
  or an honest `null`.

---

## Part C — Round 2 verification (2026-08-31, second fix pass)

The second pass also changed the projection model: raised families now project **1 tile row
per elevation level** (was 2) via a new `repeatRow` in face profiles
(`raised-terrain-autotile.ts:38-46`, `terrain-tilesets.ts:102-119`): a height-H boundary
emits H−1 repeated `wall` courses + one terminal `lower_wall` + one cosmetic `foot`, all on
the boundary's south tile, separated on screen by the per-contour offset. Interior families
keep their fixed 2-row banks with 0 visual projection. The migration is coherent across
depth sorting, picking, inspector, light occlusion, overlays, and tests (offsets now
[16,32,48]); `npm run check` fully green (869 assets).

### Round-1 status

Fixed and independently re-verified: **T1** (honest goldens + real resolver-plan golden with
checked-in fixture), **T2** (stair carves a reachable datum approach; re-measured — 0
unreachable components on the live seed, including plane collision), **T4** (water
transparent again with a real test), T5, T8 (one metadata miss), T10, T11, T12 (harness
fixed; PNGs regenerated post-`repeatRow` during this verification), T14, T15, T16 (except
perf), T17 (except the new decode bug), T19, T20, T21, T22, T24 (except content-based
duplicate detection), T25. T3 half-fixed (see R3). T6/T7/T9 partial. T23 partial
(double-loads remain). T13 partial. T26 untouched.

### Round-2 defects (ranked)

**R1 — P0: `cellFamilyAt` decodes the 1-based family ordinal as 0-based.**
`map-compiler.ts:263-270` indexes `TERRAIN_CLIFF_FAMILY_IDS` raw while the writer stores
`ordinal + 1` (0 = unset, `terrain-tilesets.ts:342-350`). Blast radius: unset decodes as
`basic` (empty face profile) so `terrainPlaneCollisionBytesForElevationGrid` emits **zero
face blockers** — both roguelike collision producers go through it (`world-rules.ts:146`,
client `terrain.ts:258`): shipped rogue rooms have no wall plane collision. Every set family
decodes one too high (`cave`→`shroomlands` flips interior→raised in editor collision;
`stone_1`→`stone_2` masked by identical geometry — which is why the goldens pass);
`dungeon_2`→reserved `snow` makes `validateMapDocument` **throw** on any override.
Fix: decode via `cliffFamilyAtIndex(...) ?? compiled.defaultCliffFamily`; add a test
comparing `cellFamilyAt` to the painted family (nothing asserts it today).

**R2 — P1: multi-level direct drops under-reserve walk-behind collision.** All H stacked
courses resolve on one tile but both producers block exactly one projected row
(`survival-world.ts:1398`, `map-compiler.ts:298-302`); rows y−2/y−3 of a 3-high face stay
walkable under drawn wall art. Island immune (no direct multi-level drops exist —
`survival-world.test.ts:305-307`); every editor map can hit it. Reserve `min(H, …)` rows to
match the art, or per-course blockers.

**R3 — P1: T3 half-converted.** `terrainProjectedRowsPerLevel` still samples the tileset at
tile (0,0) (`terrain.ts:1272-1285`) with five map-wide callers (`overworld-main.ts:3132,
4641`; `editor-picking.ts:47,68`; `terrain-inspector.ts:347`; `raised-terrain-depth.ts:472`),
and `raised-terrain-depth.ts:76,134` computes projection rows per cell — a painted `cave`
cell at origin doubles map projection; mixed-family maps offset cells differently. Derive
row count from the space's declared projection contract like the other eight sites now do.

**R4 — P1: fabricated transition art persists for stone/grass; desert ramps.**
Stone (and all four grass surface families) fake a 3-course stair from ramp frames
6,7/22,23 plus grass-field frames 38,39 (`terrain-tilesets.ts:134-137`), and
`terrain-tilesets.test.ts:36` pins the bad data. Desert `rampFrames` 98,99,111,112 are plain
sand fill. No family has a true left/right lane pair.

**Owner directive (2026-08-31): cliff crossings must use the WIDE RAMP BANKS, not the old
small 2×2 notch ramp.** The banks are the wide horizontal-course strips at approximately
columns 8–15 × rows 6–9 of each `Grass_Tiles_{1..4}.png` (two material variants per sheet:
wood-plank and stone-brick), each structured as: grass crest lip row → repeatable tread
courses → base row, with left rail / repeatable middle / right rail columns. That makes them
tileable to any width (≥2 lanes) and any height — a perfect match for `StairRun` and the
1-row-per-level model. Every tileset has its own variation of this bank in its source sheets
(desert/shroomlands/volcano); locate and extract each (verify by pixel content, not layout
assumption). Interior families keep ladders. The old `tile_cf_grass_cliff_ramp` 2×2 notch
frames are retired from cliff crossings entirely — generator, editor transition tool, and
renderer all resolve the bank via the family registry.

**R5 — P2: waterfall strata not rebalanced for 1-row** (`raised-terrain-depth.ts:223-231`
kept the 2-course row mapping; single-level falls skip sheet rows 1–2). Eyeball via the
regenerated harness, then fix the row map.

**R6 — P2: T13 residuals.** Trace substitutes the last layer at a contour instead of the
override's role slot (`map-compiler.ts:247`) — renderer and WHY-trace disagree on multi-layer
tiles and staleness doesn't fire; the override palette never offers the `repeatRow`
(`offline-editor.ts:711-722`), the most common wall course under the new model.

**R7 — P2: T26 still untouched** (`raised-terrain-depth.ts:234-241, 365-378` — own-contour,
stairs-only suppression; ramps composite differently).

**R8 — P2: degenerate interior banks + validator blind spot.** dungeon_2 `bottom`≡`top` and
`lower_wall`≡`wall` byte-identical; volcanic_interior `wall` is one frame ×3. The validator
compares frame indices, not pixel content, and skips stairs/ladders — add content hashing.

**R9 — P2: T16 perf remains O(overrides × area)** (`map-compiler.ts:172-176` rescans
elevations per trace call; `:490-496` spreads cells per override).

**R10 — P3 sweep:** `overworld-main.ts:3479` culling margin uses magic ×3 rows and ignores
`terrainMinimumElevation` (under-margins pit maps); `:3132`/`:4641` omit `baseDatum`;
`tile_cf_rogue_dungeon_floor` still has wildlife boilerplate metadata; `basic` silently has
zero elevation projection (`rows: []`); 5 terrain sheets double-loaded at startup
(`overworld-art.ts:825-849` vs `:924-929`); docs/14 golden numbers and the
`survival-world.test.ts:412` comment don't match the actual golden (1,770/906, not
1,764/912); the reachability BFS test should include `terrainPlaneBlocked`; stale
`FLATTEN TO ACTIVE LEVEL` label; dead `snow` UI branches; discarded authored wall courses
(shroomlands rows 2–3, desert row 5) worth wiring as `repeatRow` variants for vertical
variety; 1-wide plateaus render as half-width slivers for the 3-wide-bank families
(shroomlands/volcanic/desert `left`/`right` are wall silhouettes, not caps).

### Owner directive (2026-08-31): ledge ("½-height") terrain

Modeled after the pack author's example scenes (small raised beds drawn with only the
fringe/lip tiles — no wall course, no base row, no vertical offset). Implementation contract:
a per-cell **ledge overlay channel** — a mask autotiled through the existing 8-edge + 4-inset
role grammar, rendered as fringe/lip art at the surface with **zero visual projection, no
face rows, no collision planes**; cap-edge blocking by default so ledge shapes are barriers
crossed at gaps left in the shape, with optional ramp openings. NOT fractional elevation; it
must not disturb the per-space projection contract (R3). Art: the fringe banks in cols 0–4
of each `Grass_Tiles_N.png` / the blob edge sheets, with true per-biome lip art (not
re-packaged cliff rim frames). Editor: ledge paint/erase brushes; terrain-lab donut + notch
fixtures; review-harness coverage.

### Design note (user decision, not a defect)

Under 1-row-per-level, a 1-high stone cliff shows only the terminal `lower_wall` course —
the authored upper `wall` course (frames 43–45) appears only on 2+ high boundaries. The
regenerated renders read cleanly as terraced old-school rings, but the island's cliffs are
now visually half as tall as before; confirm this is the intended look on the live island.

---

## Part D — Round 3 verification (2026-08-31, third pass: R1–R10 + ramp banks + ledges + v7 Phase A)

Best round so far. R1, R3, R5–R10 verified with load-bearing tests (family decode round-trips
through trace and collision; roguelike walls block via a real movement test through
`terrainPlaneBlocked`; validation measured ~O(n); goldens honest and docs/14 synced; old
notch ramp fully retired; ledge feature genuinely built end-to-end). Full check suite green
(one load-flake timeout in `world-rules.test.ts` "26§13" — passes isolated in 5.5s but sits
near its 15s limit under load; worth a timeout bump or perf look).

### Round-3 blockers

**S1 — BLOCKER: v7 breaks sampling-path determinism.** The new river apron
(`procedural-terrain.ts:1374-1389`) resolves neighbours through a repair map whose coverage
depends on entry point (point: bare chunk `:1330-1339`; chunk: +halo `:1543-1558`; overview:
whole window `:1671-1681`). Measured: 75/1330 adjacent-chunk halo mismatches, 27
point-vs-chunk, 31 overview-vs-point (v6: zero on all three). The agreement test is pinned
to `generatorVersion: 1` (`procedural-terrain.test.ts:613-628`) and the halo-seam test uses
a waterfall-free pair — add v7 waterfall-region agreement tests. Fix by making the apron's
neighbour predicate bounds-independent. v1–v6 outputs verified byte-identical (version
gating is correct).

**S2 — P0: 4-column ramp banks mis-mapped.** `extractedRampBank`
(`terrain-tilesets.ts:57-74`) assumes `left|mid…|right`, but the authored 4-column layout is
`left-rail | middle | right-rail | standalone-1-wide` (pixel-proven). Affects grass_1..4
(wood+stone), stone_1..4, shroomlands: every 2-lane bank draws a rail down its centre seam;
4-lane banks split visually in two. Desert/volcanic (3-column) are correct.
`terrain-tilesets.test.ts:40-45` re-pins the wrong shape — replace with rail-semantic /
pixel assertions. Also: the "source row 9 is transparent" comment in
`extract-cute-fantasy-nature.ts:529-531` is false (row 9 is the 2px ground-contact trim;
grass tread≡base byte-identical) — decide whether row 9 becomes the real `base` course.

**S3 — HIGH: v7 biome diversity collapse.** Uniform table bins over [−1,1] vs centre-heavy
noise: 74% of land is woodland+meadow; plains 25%→0.9%; desert extinct (4 cells in 360k) —
which makes the "zero illegal adjacencies" gate vacuous. Fix: quantile-based bin edges from
the empirical field distribution; extend the table to cover (or guarantee adjacency against)
the if-chain biomes; implement the §3.5 minimum region sizes (measured: 616 isolated
single-tile biome cells per 5×384² windows).

### Round-3 remaining (ranked)

- **S4 (P1)**: desert/shroomlands/volcanic ledge banks are byte-identical re-packagings of
  their own cliff edge/inset frames (~36 duplicate atlas frames), whitelisted forever by the
  `correspondingLedgeRole` validator exemption (`validate-assets.ts:231-233`). Only grass
  has real lip art. Extract true per-biome lip art or accept + document.
- **S5 (P1)**: stair-run width is data-only — editor hardcodes `width: 2`
  (`offline-editor.ts:891-893`); east/west/south runs resolve no bank art
  (`terrainTransitionLaneAt` groups by equal `lowerTileY` + `direction === 'up'` while
  `expandStairRun` lays E/W runs along Y).
- **S6 (P2, new)**: projected face rows wrap into the adjacent collision plane for negative
  contours near the map's south edge — missing `projectedTileY < height` bound
  (`map-compiler.ts:349`); add a south-edge pit test.
- **S7 (P2, regressed)**: `basic` now declares `projectionRowsPerLevel: 1` with an empty
  face bank — projects with no wall art and no face collision, silently
  (`terrain-tilesets.ts:240-256`).
- **S8 (P2)**: R2 adjudication — per-course collision lands on plane L−1 per course, so a
  plane-0 actor stays free under 2nd/3rd courses (defensible walk-behind semantics, but the
  test name and docs overstate); decide and document.
- **S9 (P2)**: ledge blocking is whole-footprint rather than cap-edge; no test that an
  erased opening becomes walkable (`map-compiler.ts:130`).
- **S10 (P2)**: v7 gates need honest instrumentation — ocean fraction asserted over multiple
  disjoint windows (measured 55.3–61.0%; the pinned test uses the one window that passes);
  a real channel-width histogram; the adjacency metric measurable at doc scale
  (`--size ≤ 2048` caps it); refresh the two stale artifact JSONs still reporting
  `narrowWaterCellCount: 3`; undeclared +2-tile river widening from the apron should be a
  stated decision.
- **S11 (P3)**: content-hash exemption over-broad (`intentionalRoleFrameReuse` excuses whole
  duplicate groups); 2×2 minimum footprint is command-opt-in and unvalidated on import; R7
  suppression own-contour-only (no cross-contour test); no dedup/`dungeon_2`+override tests;
  seed-map `--report` undocumented; ~785MB heap per 1024² step-1 render (unbounded field
  memo).

### Standing owner decisions

1. Island cliffs are now one visual course tall (golden flipped with comment; renders read
   as clean terraced rings) — sign off or revert to a 2-course terminal profile.
2. Ledge art duplication for the 3 non-grass families (S4) — real lip art or accept.
3. R2 walk-behind semantics (S8).
4. v7's fragmented "lichen" archipelago (no macro hierarchy — expected until Phase B island
   stamps; confirm the interim look is acceptable for preview purposes).

---

## Part E — Round 4 verification (2026-09-01, S1–S11 pass)

Nearly clean. Full suite 207 files / 1,366 tests green, 897 assets. **Verified with
load-bearing evidence:** S2 (lane-columns fix pixel-matches the authored rail layout; row 9
wired as real base; rail-semantic tests replace the re-pin), S4 (real lip art, per-frame
exemptions, blanket `correspondingLedgeRole` rule deleted), S5, S6 (south-edge pit test),
S7, S9, S10 (envelope-asserted ocean gate, true width histogram, artifacts reproduced
byte-for-byte from code), most of S11. v1–v6 byte-identity re-proven (144/144 chunks,
2,400/2,400 points). No tests weakened.

### Still open

**E1 — P0 (the one remaining blocker): S1 point-path determinism residual.** Halo seams are
fixed (0/1480 pairs), but point-vs-chunk and small-window-vs-large-window still disagree on
11/196,608 cells. Proven root cause (repair-map diff): `horizontalMargin = 26`
(`procedural-terrain.ts:1426-1429`) assumes ≤1 tile/row approach drift, but
`waterfallConnection`'s fallback return (`:1206-1209`) hands back `rawCenterX` with up to
±6/row drift (observed 37-tile drift; anchor at centerX 988 missed by a scan ending at 987).
Fix: clamp the fallback's `rawCenterX` to `centerX ± WATERFALL_MAX_APPROACH_ROWS`, or derive
`horizontalMargin` from the true worst case (`CENTER_SEARCH × (MAX_APPROACH_ROWS+1) +
REPAIR_RADIUS`). Also E1b: the agreement test pins chunk (52,−128), which passes; the same
body fails on chunks (59,−145)/(60,−145) — sweep a chunk range, and note affected chunks may
contain no visible waterfall (corruption arrives from an anchor ~35 tiles away).

**E2 — P1: S3 biome gate is window-pinned.** Diversity itself is genuinely fixed (measured
across 12 disjoint windows: all seven majors present, desert 3.45%, woodland+meadow 32%,
zero illegal adjacencies), but `procedural-terrain.test.ts:731-737` asserts on one window
row; desert measures 0.10–0.32% (below the 0.5% bar) on other latitudes. Aggregate the gate
over the three disjoint windows already built at `:708-716` (and vary window latitude for
the ocean gate too).

**E3 — P1: §3.5 minimum region size is "≥1 peer", not minimum area** — 34–75 single-cell
4-connected biome regions per 256² window remain. Implement a real minimum-area rule or
amend docs/52 §3.5 to the peer rule deliberately.

**E4 — P2/P3 pins:** cross-family duplicate detection (volcanic ledge frames ≡
volcanic_interior_wall 15–18); test pinning `basic.projectionRowsPerLevel === 0`; dedup
test for `overworld-art.ts:934-941`; direct `bank.crest` mapping assertion; S5 refusal-path
test; ledge alpha threshold tightening (volcanic measures 150 vs <160 bar); docs/52:86
channel-width wording vs measured mode 5–6; field memo peaked at 1.1GB despite the
262,144-entry cap comment — verify the cap actually bounds it.
