# 18 — Visual & Audio Style Addendum: The Island Estate

Owner-directed refinements (2026-08-24) after reviewing the M2/M3 build against the
reference packs in `references/asset-pack/` (Sprout Lands) and
`references/Cute_Fantasy*/`. This addendum *extends* [10-art-style-guide.md](10-art-style-guide.md)
and [12-audio-design.md](12-audio-design.md); where it is more specific, it wins.
New benchmarks: `benchmark-curved-edges-cutefantasy.png`, `benchmark-rounded-paths-simple.png`.

## 1. The estate is an island

The estate map is reframed as a **coastal island**: the 64×64 exterior is ringed by
sea (`tile_water`, animated shimmer) with a beach apron (`tile_sand`) on the south
and east, low cliffs (`tile_cliff`) on the north, and the farm plateau inside.
Visitors arrive at the **dock pier** (`prop_dock_pier`, south beach) instead of a
road gate — update the arrival flavor in [07-multiplayer.md](07-multiplayer.md)
("the ferry" replaces "the carriage") when M7 lands. The well/pond stays inland.

Map-integration note (deliberately deferred): `estate.map.json` is NOT edited in
this pass because M4 is actively placing press-yard objects in it. Whoever next
owns the map applies this island ring + shore decor; all tiles and props it needs
already exist and validate. Checklist for that pass:
- Water ring 3–6 tiles thick on all sides; no walkable tile touches the map border.
- Coastline follows **curve rules** (§2): no straight runs longer than 5 tiles,
  vary bay/headland rhythm; beach on S/E, cliff lip on N, grass-over-cliff on W.
- Dock pier centered on the south beach, path from dock → farmhouse.
- Scatter: shells/driftwood on sand (1 per ~40 beach tiles), lily pads + cattails
  at the pond, tufts/flowers/rocks per §3 densities.

## 2. Terrain curve rules (the "rounded" look)

The reference packs read soft because their terrain blobs are *round*. Binding rules
for all autotile templates and map painting:

1. **Outer corners curve with a 4–6 px radius** (a 3–4 step pixel arc on a 16px
   tile), never a hard 90° step. The blob47 outer-corner template tile is where
   this lives.
2. **Double rim:** every material meeting another gets a 1 px rim one shade darker
   than its fill on the inside of the edge (path→dark-path rim, sand→wet-sand rim,
   water edge→foam light line). Grass additionally **overhangs**: 1–2 px grass-blade
   clusters intrude over path/sand edges every few tiles — edges are eaten, not cut.
3. **Map-level curvature:** when painting regions, avoid axis-aligned runs >5 tiles
   without a 1-tile jog; prefer blob shapes (like Sprout Lands' grass islands) over
   rectangles. Paths meander — a path between two points should have ≥1 bend per
   8 tiles unless it's the formal farmhouse approach.

## 3. De-patterning grass (killing the repeat)

- The base `tile_grass` center tile stays *quiet* (sparse asymmetric clusters).
  Variation comes from the map layer, not louder tiles:
  - sprinkle `tile_grass_lush` at ~1 per 12 grass tiles, never adjacent to another;
  - decor props (`prop_grass_tuft_*`, `prop_flowers_*`, `prop_rock_small_*`,
    `prop_mushroom_red`) at ~1 per 8–10 open grass tiles, clustered near edges,
    trees, and fences rather than uniform;
  - placement uses a deterministic hash of tile coords (seeded per map), not a
    repeating stamp.
- Rule of thumb from the benchmarks: open grass should never show the same 3×3
  neighborhood twice within one screen (480×270 ≈ 30×17 tiles).

## 4. Building style (timber-frame island vernacular)

Adopt the pack lesson without the pack pixels: buildings read as **frame + fill**.
- Visible corner/edge posts in dark wood (R1 `#4a2f17`/`#2b1d0e`), plank or wattle
  fill two shades lighter, 1 px `#1a1210` at ground contact.
- Roofs: dulled red shingles (`#8c2333` base, `#c03a2b` sparse highlight courses,
  ridge line in R1 dark) with a 30% visible roof plane; eaves overhang walls by
  2 px and cast a 1 px shadow line on the wall.
- Every building gets one *life detail*: window glow at night, vine on a corner
  post, mushrooms at the foundation shade side, or a birds' nest.
- Machines (presses) follow the same frame+fill grammar in wood/iron so yard and
  buildings feel like one carpenter made them.

## 5. Animation: nothing anchored ever moves

Codifying the tree-sway fix as a general rule (it applies to all future flora/props):
- **Anchored pixels are immortal.** For any swaying object, the trunk/stem/base
  rows are pixel-identical across all frames; only the upper portion leans
  (1 px, lossless — no silhouette pixel may appear/disappear at the sprite edge).
  Trees: canopy rows only (implemented: rows 0–35 of 64 lean, seam tapered).
  Tufts/reeds: top ~60% only. Floating things (lily pads) are exempt — they drift.
- CI intent: a future validator rule should assert bottom-25%-rows equality across
  frames for category `trees` and swaying props (`lintAllow: ["float"]` opt-out).
  Until then it's review-checklist item: "filmstrip — does the base jitter?"

## 6. Music arrangement arc (extends 12 §2)

Flat 4-channel loops read as wallpaper. Every theme now follows an **arc template**
across its 12 four-bar slots:
- Slots 1–4: core (pad + bass + melody statement).
- Slots 5–8: texture enters (pluck arpeggios, shaker pulse, string swells).
- Slots 9–12: fullest statement, then strip back for the cadence slot so the loop
  breathes before repeating.
- Texture channel volumes stay low (pluck ≤0.3, shaker ≤0.15, strings ≤0.2);
  chord tones only for arpeggios; the shaker drops out for the final phrase.
`theme_night` inverts it — sparse throughout, motif in bells at half speed, strings
only breathing at phrase ends. Every song requires the game-music skill's listening
pass in the shared-browser preview before being considered done (flagged in each
song's `iterationNotes`).

## 7. Reference pack licensing (binding)

- **Sprout Lands Basic** (`references/asset-pack/`, by Cup Nooble): license allows
  style reference and modification but **non-commercial use only and no
  redistribution of the pack**. Our policy is stricter and keeps us clean: study
  only, zero pack pixels shipped. The one prior exception — `tile_path` was
  bootstrapped via `assets:import` from `Paths.png` (`importedFrom` field) — has
  now been fully redrawn in this pass (curved template, grass overhang), but if
  any imported-from-pack pixels are ever shipped, the non-commercial term binds
  the whole game. **Rule: nothing with `importedFrom` pointing at a pack file may
  remain in `packages/assets/` at M9** — redraw or delete; CI should eventually
  assert it.
- **Cute Fantasy paid packs** (`references/Cute_Fantasy*/`, excluding
  `Cute_Fantasy_Free`, by Kenmi Art): the included paid-pack licenses permit
  commercial and non-commercial project use and modification, and prohibit
  redistribution or resale. The owner explicitly approved them as this private
  build's primary coherent visual source.
- **Cute Fantasy Free** (`references/Cute_Fantasy_Free/`, by Kenmi Art): its bundled
  terms are non-commercial only. The current `avatar_cf_farmer` derives from its
  `Player.png`, which is permitted for this private non-commercial game but must be
  replaced or separately licensed before any commercial release. Purchased/source
  sheets remain ignored local inputs; only reviewed text-grid semantic extracts with
  validated native ramps under `packages/assets/` ship.
