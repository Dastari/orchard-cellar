# 52 — Terrain Generation v7: Oceans, Chunky Landforms, Real Rivers

Status: proposed (2026-08-31). Scope: `packages/sim/src/procedural-terrain.ts` (the v6
generator) and its review tooling. Companion docs: 30 (infinite terrain), 43 (procedural
sanctuary + signed coordinates, including the unimplemented follow-ups this plan executes),
50/51 (elevation unification — v7 renders through the tileset family registry from docs/50;
the docs/51 fix list is a prerequisite for trusting the render path).

## 1. Audit summary — what v6 is and why it looks the way it does

v6 is a **pure per-tile noise sampler**: ten smooth value-noise fields
(`floatTerrainFields`, `procedural-terrain.ts:461-550`), and every feature is a threshold on
one of them. There is no shape machinery — no morphological cleanup, no minimum sizes, no
flow routing, no region planning. The only post-process is the bounded v6 waterfall repair
(`:839-1186`).

Measured on the live seed (`orchard-sanctuary-20`):

| Symptom | Measurement | Root cause |
|---|---|---|
| Sweeping curves, unreadable terraces | terrace run lengths median **151 tiles**; smallest wavelength in the height field is **40 tiles** (`detail`, `:489`) | elevation is a quantized slice (`:569-575`, uniform 0.18 steps) of one smooth scalar |
| No oceans | **20.5% ocean** over a 16k² sample (Minecraft ≈ 65–70%) | `SEA_LEVEL = −0.08` (`:316`) on continent-wavelength noise (`[2048,1024,512,256]`, `:471`) |
| Rivers are directionless loops | rivers are the zero-set of a noise field (`:749-762`), not paths | wrong primitive for a directed feature |
| No estuaries, no sources | nearest river cell is **34–300 tiles from the sea** (river gate `height ≥ SEA_LEVEL+0.055`, `:583`); rivers stop dead at the `elevation ≤ 2` ceiling (`:584`) | gates, not termination logic |
| Waterfalls only sometimes legal | of 16 contour crossings in a sample window, only the 6 south-facing 1-level drops are repairable (`:927-976`); side/rear crossings unresolved per docs/43:602-609 | crossings are accidents of the field, not choices |
| Beach plains hundreds of tiles deep | **53% of one coastal window is "coast"** | coast is a height slice (`:611`), width ∝ 1/‖∇height‖, unbounded |
| Lakes straddle cliff levels | one lake measured with 44 cells across an elevation boundary (surface at both L0 and L1) | lakes are an unrelated noise blob (`:586-587`, `lakeBasin > 0.48`), not basins |
| Biomes "not too bad" | biome runs median 223 tiles; an ordered threshold if-chain (`:607-631`) | coherent only because the noise is huge; shrinks badly (see §5.4) |

**What v6 gets right (protect these):**
- **Gradient-normalized river width**: `|river|/‖∇river‖ ≤ 1.45 tiles` (`:760-761`) — width
  as distance-to-contour, not field threshold. Measured: **zero** 1-tile water cells, zero
  zigzag. This is the pattern to generalize, and the reason scale changes don't break river
  width (docs/43:561-589 records the v3 failure that motivated it).
- **Strict elevation nesting**: L(N) ⊆ L(N−1) by monotone quantization — matches the
  renderer's no-overhang model for free.
- **Determinism discipline**: per-tile purity with bounded aprons, version-pinned seeds
  (`generatorSeed`, `:358-366`), chunk checksums (`:1356-1392`), and the v6 repair's
  world-coordinate-stable bounded search (effective apron ±26 tiles, `:1114-1186`) — proof
  that bounded post-passes fit the architecture.

**The counter-example we already own:** the live island (`survival-world.ts`) looks
old-school-RPG precisely because it is *not* noise-thresholded — placed centers →
organic mask stamps (`buildOrganicFeatureMask`, `:886-963`) → majority filters + spur
trimming + minimum footprints (`:694-747`) → mountains by per-level erosion with a 4-tile
inset and 24-tile minimum summit (`:1112-1136`, constants `balance.ts:180-181`). v7's thesis
is to promote that approach into the infinite generator.

## 2. Design thesis

> **Noise decides where and what. A deterministic regional plan decides shape.**

- Keep the v6 climate fields for placement and identity: continentalness picks where island
  stamps go, temperature/moisture pick biome, volcanism/strangeness pick specials.
- Add a **macro-plan layer**: a deterministic cache keyed by
  `(seed, version, domain, macroCoord)` — the regional plan cache docs/43:203-206 already
  mandates, with `cachedCoordinateWaterfallRepairs` (`:1194-1225`) as the in-code precedent.
  Per macro-cell (512×512 tiles, sized so any tile's value depends on a bounded set of
  neighboring cells), the plan holds: island stamps, eroded mountain contours, the river
  tree, lake basins. Tile sampling consults the plan; determinism and chunk checksums are
  preserved.
- Shapes obey **width-first minimums everywhere** (rivers ≥2–3, beach 3–4, terraces with
  inset margins), enforced by construction (stamps/strokes) plus morphological validation —
  never by hoping the noise stays smooth.
- Style rule reconciliation: docs/43:642-650 asks for "longer cardinal runs, minimum
  straight-run lengths, deliberate corners"; docs/18:42 says avoid axis-aligned runs >5
  without a jog. v7 standard: **cardinal runs of 3–6 tiles with mandatory jogs** — chunky,
  not rectangular. Update docs/18 with this clause when Phase 2 lands.

Non-goals: overhangs/bridges (docs/30 exclusion stands), simulation-grade hydrology
(Strahler-style orders are a look, not a model), migrating the live island itself (it stays
on its own generator until v7 is proven in the editor).

## 3. Phase A — Rebalance the fields (cheap, one version bump, ships alone)

All items are constant edits inside existing pure functions. One new generator version;
checksums churn (expected — that is how v3→v6 worked). The editor preview and seed-map tool
are the review surface.

1. **Ocean-dominant world**: raise `SEA_LEVEL` (`:316`) from −0.08 toward **+0.15…+0.25**
   (target 60–70% ocean, measured via the seed-map tool over a ≥16k² sample). Adjust the
   deep-ocean offset (`:769`) to keep a sensible shallow band. Interior highlands become
   island cores automatically.
2. **Smaller features**: divide the period lists (`:467-528`) by **3–4×**; raise `detail`'s
   weight in the height mix (`:533`, currently 0.09). Do not touch `halfWidthTiles`
   (`:760`) — the gradient normalization is what keeps rivers ≥2–3 wide at any scale.
   After waterfall repair, v7 deliberately stamps a one-cell apron on each
   river bank (+2 tiles across a channel). This final-semantic widening is what
   guarantees two cardinal water neighbours through diagonal turns; it is not
   an accidental replacement for the gradient-normalized raw width. The 2–3
   tile width describes the raw field core; the measured final channel-width
   histogram has its mode at 5–6 tiles after the two-bank apron is applied.
3. **Bounded beach band**: replace the `height < SEA_LEVEL + 0.07` coast test (`:611`) with
   the river trick: `|height − SEA_LEVEL| / ‖∇height‖ ≤ 3–4 tiles`.
4. **Water at altitude + more nesting**: lift the inland-water elevation ceiling (`:584`)
   to allow L3/L4 lakes; shrink lake periods (`:507-513`) for smaller lakes; loosen the pond
   gate (`:601`); tighten the elevation step (`:570-574`) and consider raising
   `PROCEDURAL_TERRAIN_MAX_ELEVATION` (`:15`) — nesting is guaranteed by monotonicity.
5. **Biome table**: implement docs/30:93-99's quantized `BIOME_TABLE` in place of the
   if-chain (`:607-631`), with legal-adjacency guarantees and a bounded **peer-support**
   pass: every visible table-biome cell must share its biome with at least one of its eight
   neighbours. This deliberately rejects isolated 8-neighbour singletons; it does **not**
   claim a minimum 4-connected component area. Finite-area region consolidation belongs to
   Phase B's macro-plan regularization. Required in the *same* version bump as item 2 — at
   4× smaller scale the unordered thresholds will start abutting desert against wetland.
6. **Review tooling**: add `river`, `lakeBasin`, `pondBasin`, `peaksValleys` layers to
   `render-procedural-seed-map.ts:16-19`; make hydrology review use `--step 1` (at the
   default step 16 the overview shortcut **skips v6 waterfall repairs entirely**,
   `procedural-terrain.ts:1535,1551` — review PNGs currently never show them). Add an
   ocean-fraction and width-histogram report mode so Phase A targets are measured, not
   eyeballed.

**Done when:** ocean fraction is reported across at least three disjoint 16k²
windows (Phase A's accepted fragmented field currently uses a 54–70% per-window
envelope, centred near 60%, rather than a cherry-picked 60–70% window); median terrace run ≤ ~40 tiles; beach band ≤ 4 tiles
everywhere; zero water cells with ≤1 cardinal water neighbour (keep the existing width
tests, `procedural-terrain.test.ts:500-568`); no illegal biome adjacency in a 16k² sample.

## 4. Phase B — Macro plan: island stamps, eroded contours, regularization

1. **Macro-plan cache**: deterministic per-cell plan keyed by
   `(seed, version, domain, macroCoord)`, LRU'd like the waterfall repairs. A tile reads the
   plans of its own cell + the 8 neighbors (bounded dependency, checksum-stable). Plans are
   pure functions of the seed — never persisted.
2. **Island stamps**: continentalness above threshold seeds island centers (jittered
   grid/Poisson within the cell); each grows an organic mask via the island generator's
   pipeline — port `buildOrganicFeatureMask` + majority/spur/min-footprint passes
   (`survival-world.ts:694-747, 886-963`) into shared sim code. Land = union of stamps;
   coastline chunkiness comes from the regularization pass (item 4), not from noise.
3. **Mountain contours by erosion**: per island, L1..Lmax masks by iterated erosion with
   per-level inset (≥4 tiles) and minimum area (≥24 tiles) — generalize
   `elevationMaskFor` (`survival-world.ts:1112-1136`) with support for multiple summit
   seeds per level (non-concentric nesting: two L2 mesas on one L1 shelf) and subtractive
   pit stamps (recessed ingress; renders via docs/50 Phase 3 signed elevation).
4. **Contour regularization** (docs/43:642-650): quantize every coast/terrace contour to
   cardinal runs of 3–6 tiles with deliberate corners, respecting minimum widths.
   Implemented as a bounded pass over the mask (fits the apron model; new halo constant).
   Acceptance is visual + statistical: run-length histogram concentrated in 3–6, zero 1-tile
   spurs, all shapes representable by the docs/50 role grammar (verify by resolving every
   boundary tile through `resolveRaisedTerrainContoursAt` with no fallback frames).

**Done when:** the editor's procedural preview shows chunky nested islands; a golden-seed
macro-plan JSON snapshot is pinned; chunk checksums are stable across sampling windows
(extend the existing point-vs-chunk agreement test).

## 5. Phase C — Rivers as a planned tree, basins, estuaries

1. **River tree per island** (planned in the macro cell): springs seeded on high terraces;
   trace descent through the *planned* contours to the coast; tributaries merge downstream
   (so walking upstream, large rivers split naturally). Width by accumulated flow:
   headwaters 2, mid 3, trunks 4–5 — rasterized as stroked paths (width-first), then the
   same morphological validation as everything else.
2. **Planned contour crossings**: a river crosses an elevation boundary only where the
   planner finds (or regularization provides) a **straight horizontal cliff run ≥ channel
   width + 2-tile shoulders**, entering perpendicular; it drops a waterfall stamp there —
   exactly the geometry the v6 repair enforces (`WATERFALL_*` constants, `:855-862`) and the
   waterfall art already renders through the cliff strata. Rivers meander on flat terraces
   only, staying ≥ inset margin from contour edges between crossings. The v6 reactive
   repair is then retired (the planner never generates an illegal crossing).
3. **Estuaries**: widen the trunk over the final N tiles into a funnel meeting the beach
   band; optional delta braiding (split into 2–3 channels) for the widest trunks; river
   mouth cells get shore/estuary surface treatment.
4. **Lakes as basins**: lake sites from the plan (fed/drained by river nodes where
   sensible), carved flat on a single terrace level — one water body, one elevation, always.
   Highland lakes are just basins on L2+ terraces. Ponds keep the Phase A stamp approach
   (they were already the one correctly-scaled feature).

**Done when:** on a golden seed, every river reaches the sea; every contour crossing is a
straight-run waterfall; width histogram ≥2 everywhere with flow-monotone growth; every lake
is single-elevation; a BFS along river banks from any spring reaches the coast. Pin these as
tests, not eyeball checks.

## 6. Working notes for implementers

- Verify with `npm run check`; hydrology/shape review via
  `npx tsx src/render-procedural-seed-map.ts` in `@orchard/tools` (after Phase A.6 gives it
  the missing layers) and the editor's procedural preview (`npm run editor:dev` →
  `/editor` procedural inspector).
- Seed-map measurements are printed with `--report`; for example,
  `npm run seed-map --workspace @orchard/tools -- --layer water --step 1 --size 1024 --report`.
  Step-one reports include the true orthogonal channel-width histogram. Macro
  reports sample real +1 cardinal pairs across the full rendered span, so a
  256×256 map at `--step 64` measures biome adjacency across 16k×16k tiles.
- Every phase is a generator **version bump**: extend `generatorSeed` (`:358-366`) mapping,
  re-pin chunk checksums, keep enum append-only (`:63`). Never change landforms without a
  version.
- Dependencies: Phase A is independent and ships first. Phase B needs docs/50 Phase 2
  (family registry) for per-biome cliff rendering in review; Phase C needs docs/51 T1/T2
  fixed first (honest goldens, reachability BFS test pattern) and reuses docs/50 Phase 3b
  stair/waterfall strata. The docs/51 fix pass is a prerequisite to trusting any visual
  verification of v7.
- The live island stays on `survival-world.ts` until v7 passes its Phase C gates in the
  editor; promotion of the topside world to v7 is a separate decision, out of scope here.
- Update docs/18:42 (style bible) with the reconciled "cardinal runs 3–6 with jogs" clause
  when Phase B.4 lands; update docs/43's follow-ups section to point here.

## 7. Sequencing & risk

A → B → C, each independently shippable behind a version. Risks: (a) Phase A exposes
biome-adjacency and beach-band defects immediately — that's why A.3/A.5 are bundled into the
same bump; (b) the macro-plan cache is the first regional (non-per-tile) machinery in this
file — keep the dependency set explicitly bounded (own cell + 8 neighbors) and prove
point-vs-chunk agreement like v6 did; (c) regularized chunky contours may fight the pixel
style bible — resolve with the 3–6-run-with-jogs rule and a side-by-side editor comparison
(the acceptance artifact docs/43 asked for); (d) river planning is the largest single piece —
land it after B so it plans against regularized contours, not raw noise.
