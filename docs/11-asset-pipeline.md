# 11 — Asset Pipeline: How Agents Author Art

Agents cannot push pixels in an image editor, so **assets are text**. Every sprite is
a JSON pixel grid referencing the palette by index; a build tool compiles them into
PNG atlases the engine consumes. This makes art diffable, reviewable, lintable, and —
critically — style-enforceable by CI.

The build emits a compact `atlas.meta.json` index, one
`atlas_<category>.meta.json` frame/placement manifest per category, and a separate
`atlas.markers.json` for optional palette recolouring pixels. Routes fetch only the
categories whose assets they request; the design studio explicitly loads the complete
catalogue. A call that supplies marker overrides lazily fetches the marker manifest and
verifies that its revision matches the runtime atlas before recolouring. Do not merge
category records or marker pixels back into the bootstrap index: they are intentionally
off the first-frame path.

## Licensed Cute Fantasy source discovery

Before searching the purchased source folders manually, search
[`docs/reference-assets/cute-fantasy-index.md`](reference-assets/cute-fantasy-index.md)
or its machine-readable companion
[`cute-fantasy-index.json`](reference-assets/cute-fantasy-index.json). The index
covers every `references/Cute_Fantasy*/**/*.png`, records search aliases, sheet
geometry, known animation families, reviewed semantic crops, intended tile/entity
usage, collision recommendations, duplicate sheets, and environment tileset
contracts. Regenerate it after changing the reference corpus with:

```sh
npm run document:cute-fantasy -w @orchard/tools
```

The companion `references/Player_Aseprite_Files/Player_Main_All.aseprite` metadata
is also captured there for modular-player layer order. It has no named frame tags;
the 56-row table below remains the semantic animation authority.

## 1. Sprite source format (`*.sprite.json`)

```jsonc
{
  "name": "tree_apple_mature",
  "size": [48, 64],                  // must match a canonical size from 10-art-style-guide.md
  "anchor": [24, 62],                // foot point, px; where it sits on the tile grid
  "collision": [[1, 3, 1, 1]],       // tile-space AABBs [x,y,w,h] relative to sprite
  "layers": ["base", "fruit"],       // optional overlays composited at runtime
  "frames": {
    "base": [
      [
        "................:contains 48 chars per row, 64 rows",
        "...aab......."
      ]
    ],
    "fruit": [ ["..."] ]
  },
  "fps": 1.5,                        // if >1 frame
  "markers": {"W": "N"},            // build-time default palette color, see §4
  "markerRamps": {"W": ["W", "P"]} // runtime swap group's grid chars, dark→light
}
```

Pixel rows are strings, one character per pixel:
- `.` = transparent
- `0-9 a-z A-Z` = palette index 0–61 (we use 0–54 + marker slots)

The palette (`packages/assets/palette.json`) maps chars → hex, generated from the
table in 10-art-style-guide.md §2, ordered ramp by ramp (R1 dark first). The build
fails on any character not in the palette. **This is the style-consistency enforcement
point — never widen it casually.**

Reviewed owner-licensed imports may add `"sourcePalette": {"b":"#3e8948", "s":"#091b1528", ...}`.
Those values override the global color for that asset only, preserving the source
pack's native ramps without committing PNG sheets or abandoning inspectable text
grids. Values are six-digit RGB or eight-digit RGBA hex and keys must already be
valid grid characters. RGBA is allowed only to retain nonzero alpha found in the
licensed source; seasonal palette remaps do not alter native source ramps.
The importer assigns every distinct nontransparent source RGBA value its own grid key and
does not run orphan-pixel cleanup on licensed inputs. A same-size semantic crop must
therefore render pixel-for-pixel like its source region rather than collapsing nearby
dark shades through the global Orchard palette.

Tiles use the same format with `"size": [16,16]` (`*.tile.json`), plus optional
`"autotile": "blob47"` — the tool then expects the 5-tile template (center, edge,
outer corner, inner corner, isolated) and generates all 47 blob variants.

Maps (`*.map.json`) are layer grids of tile names + object placements + walkability
overrides; the farm map spec lives in 03-gameplay-core.md.

### Raised cliff metatile contract

Raised cliffs and walls are layered metatiles, not one independently selected tile
per map cell. Every matching natural cliff tileset must follow this draw order:

1. base terrain fill;
2. the continuous rear structure (top cap, side wall, south cap, and projected face);
3. a transparent foreground inverse-corner overlay at a stepped turn;
4. ramps and natural decals; then normal world objects.

Never replace a straight side-wall frame with an inverse-corner frame. At a stepped
turn the straight wall continues behind the foreground corner. A map cell may therefore
have several projected face depths in the background and its own cap/side role in the
foreground; return every applicable face and draw deepest-to-nearest. The licensed
face frames' translucent shadow pixels expose the wall behind the nearer wall. Do not
collapse those layers into a single chosen frame. The inverse-corner foreground extract
must contain only the corner's edge, stone, and shadow pixels: remove the source
sheet's flat-ground pixels rather than drawing its opaque 16x16 quadrant directly.
Otherwise it erases the rear wall and produces a false green strip. Collision and
elevation come from the semantic cliff role and are independent of both draw layers.

The shared resolver is `packages/sim/src/raised-terrain-autotile.ts`. It accepts a
`RaisedTerrainGrid` occupancy contour plus a `RaisedTerrainTileSet` and returns a
`RaisedTerrainTilePlan` containing the ordered face layers, rear edge, inverse-corner
overlays, ramp, and collision semantic for one cell. World generation and rendering
must call this resolver instead of adding shape-specific frame tests.

Editors should store integer elevation, not selected cliff frames. Adapt each contour
with `raisedTerrainContourGrid(elevationAt, contourLevel)`, resolve every affected cell,
and redraw the returned plan. Raising or lowering one cell therefore automatically
recomputes its caps, sides, convex/concave turns, rear overlaps, faces, and shadows.
Resolve every level independently to stack multi-level terrain.

The editor-facing operation is deliberately only `setElevation(tile, level)` (with
raise/lower brushes as `+1`/`-1`). A level-2 island inside level 1, then a level-3
island inside level 2, is ordinary data rather than a special nested-cliff shape.
The editor must preview the same shared resolver used by the game; it never stores a
selected wall frame or asks the author to repair corners after a brush stroke.

Face height is tileset data. `RaisedTerrainTileSet.faceProfiles` contains an ordered
list of face rows with left/middle/right frames and collision behavior. A tall profile
can contain `wall`, `lower_wall`, and nonblocking `foot` rows; a one-cell-high profile
can contain only its compact wall row. Switching profiles changes the projected height
without changing topology code. Do not obtain a short cliff by sprinkling exceptions
through generation or rendering.

Logical height, projected height, and collision thickness are separate values. The
current tall profile raises terrain by one logical level and projects two
height-bearing rows (`wall`, `lower_wall`). Its third authored `foot` row is
nonblocking ground-contact shadow/trim (`contributesHeight: false`): it extends the
sprite but neither raises the surface nor casts a structural light shadow. Movement
blocks at the semantic elevation contour, using the actor's complete foot width; it
does not turn the projected face or baked shadow pixels into occupancy.

Crossings are semantic contour transitions, not frame overrides. A transition records
its contour level, orientation, and kind (`slope`, `stairs`, `ladder`, or `rope`). A
walkable slope/stair cuts the matching opening from that one contour; ladder/rope
transitions keep the wall solid and connect explicit lower/upper interaction anchors.
The selected tileset maps that semantic transition to art. Replacing a cliff tileset
must therefore never require rewriting elevation or transition data.

Cliff structure assets must not bake in a terrain fill. Import the stone rim, face,
edge vegetation, and translucent shadow as an overlay, making the sheet's broad grass
or sand fill colours transparent. Draw that structure over the cell's semantic base
terrain. The same cliff topology can then sit over grass, sand, snow, or editor-painted
ground without producing a rectangular colour slab. A tileset may retain small authored
moss/tuft accents, but its empty cap area must reveal the base layer.

The 14-column Cute Fantasy Stone Cliff topology used by
`STONE_RAISED_CLIFF_TILE_SET` is:

| Semantic role | Frame indices |
| --- | --- |
| north cap (left, middle, right) | 1, 2, 3 |
| rear side (left, right) | 15, 17 |
| south cap (left, middle, right) | 29, 30, 31 |
| upper face (left, middle, right) | 43, 44, 45 |
| lower face (left, middle, right) | 57, 58, 59 |
| foot (left, middle, right) | 71, 72, 73 |
| authored inverse-corner source quadrants | 19, 20, 33, 34 |

For a descending step where a face arrives from the west, composite source quadrant
20 over rear side 15; mirror it with source quadrant 19 over rear side 17 when the
face arrives from the east. The runtime foreground asset stores source quadrants 19
and 20 as frames 0 and 1 with flat-ground pixels knocked out. Matching cliff
sheets should declare their own `RaisedTerrainTileSet`, retaining this semantic
topology while using an overlay extracted from that sheet's own palette. Do not mix
frames from differently colored cliff sheets within one boundary.

Select inverse overlays from plateau occupancy, not from the names of neighboring
edge roles. For an occupied cell, emit an inner corner whenever both orthogonal
neighbors are occupied but their shared diagonal is empty: north+west without
northwest, north+east without northeast, south+west without southwest, and
south+east without southeast. Check all four cases independently because a pinched
organic shape can require two overlays in one cell. This is the same diagonal rule
used by blob/autotile renderers and covers short steps, tall steps, consecutive
outward steps, and their mirrors without special cases.

Inverse overlays are visual joins on the walkable plateau cell and never add
collision themselves. The neighboring semantic `left`, `right`, `top_*`, `bottom_*`,
and projected face roles remain the blocking boundary. Keep the inset cell walkable;
blocking it would turn a partial visual corner into an invisible full-tile obstacle.
The final `foot_*` row is also visual overlap: it renders the wall base and shadow but
does not block movement. Players can walk onto that approach tile and stand directly
against the blocking wall/lower-wall row. Keep resources and decorations off foot cells
despite their walkable collision state.
An inset cell also terminates any projected face crossing that cell, including the
remaining lower face and foot/shadow frames in that projection column. Its transparent
quadrant must reveal the plateau top, not an older rear face; wall-behind-wall layering
remains active on the neighboring semantic edge and wall cells.

Procedural generation does not cut ramps into any contour. Ramp roles and tiles remain
available to future editor tooling, but a ramp exists only when explicitly authored.
For an authored two-row ramp, anchor its top row one tile inside the plateau
(`boundaryY - 1`) and its bottom row at `boundaryY`; omit projected wall roles below
the opening. Art, collision, resource exclusion, and debug overlays must all consume
those same roles.

The shallow dirt formation is a lowered inset rather than raised terrain. Its blob
edge is visual only and remains walkable from both sides; it must not be classified as
a solid cliff or require a ramp. Keep resources and decorations off its edge cells so
the transition remains readable.

### Natural shoreline and biome-transition contract

Natural boundaries are layered autotiles, never hard switches between two solid
ground fills. Store semantic biome/elevation data and derive these frames at render
time from the same eight-neighbour mask used by collision and world generation.

For water against sand, draw the water/sand outer 3x3 shoreline frame first. If
both cardinal neighbours remain land but the intervening diagonal is water, draw
the matching inward-corner frame from the sheet's following 2x2 block. The authored
frame order is southeast, southwest, northeast, northwest. This second layer is
required for coves and must not be replaced with a square center tile.

For grass against beach, sand is the base and the canonical 47-frame grass fringe
is the foreground. Ocean counts as part of the sand mask so grass is emitted only
on the landward edge, never over water. Desert uses its own olive 3x3 edge and 2x2
inverse-corner sheets so the savanna palette remains coherent. Remove one-cell
spurs and diagonal pinholes from generated masks before resolving art; do not solve
invalid topology by adding one-off frame exceptions.

A noisy coast-depth band is not an elevation contour and must never select cliff
frames directly. Keep generated coast cells as beach, then place ocean cliffs only
from a deliberate height contour resolved by the shared layered-cliff utility.
Perspective sheets with a downward-projected face also require a coherent broad
south-facing section; use beach on east/west sides until matching side-facing art is
mapped. This prevents isolated rock dashes and perspective-invalid wall fragments.

### Cute Fantasy modular player animation rows

The pack creator's canonical player-sheet map was supplied from their Discord by the
asset owner on 2026-08-25. Treat it as authoritative for
`Player/Player_Base/Player_Base_animations.png` and matching modular hair, clothing,
hands, and equipment sheets. These sheets are 576×3584: nine 64×64 frame cells across
and 56 animation rows down. A row may use fewer than nine cells; import exactly the
declared frame count and never infer it from the sheet width. `side` is authored facing
right and is mirrored at runtime for left-facing characters.

| Rows | Animation | Directions | Frames |
| --- | --- | --- | --- |
| 0–2 | `idle` | down, side, up | 6 |
| 3–5 | `walk` | down, side, up | 6 |
| 6–8 | `attack_1`, `attack_2`, `attack_3` | down | 4 |
| 9–11 | `attack_1`, `attack_2`, `attack_3` | side | 4 |
| 12–14 | `attack_1`, `attack_2`, `attack_3` | up | 4 |
| 15 | `collapse` | none | 4 |
| 16 | `climb_ladder` | none | 6 |
| 17–19 | `dodge` | down, side, up | 8 |
| 20–22 | `hold_idle` | down, side, up | 1 |
| 23–25 | `hold_walk` | down, side, up | 5 |
| 26–28 | `jump` | down, side, up | 6 |
| 29–31 | `ranged_weapon` | down, side, up | 6 |
| 32–34 | `tool_axe` | down, side, up | 6 |
| 35–37 | `tool_pickaxe` | down, side, up | 6 |
| 38–40 | `tool_hoe` | down, side, up | 6 |
| 41–43 | `tool_watercan` | down, side, up | 6 |
| 44–46 | `fish_cast` | down (9), side (8), up (9) | varies |
| 47–49 | `fish_reel` | side, down, up | 8 |
| 50–52 | `mount_idle` | down, side, up | 2 |
| 53–55 | `mount_walk` | down, side, up | 6 |

Modular body-layer runtime extracts use the centered 32×40 character crop from each
64×64 cell; held tools and effects retain the full 64×64 cell. All composited layers
must select the same semantic row and frame index. In particular, do not substitute
an `attack_*` row for a tool row or truncate the six-frame tool sequences.

## 2. Build tool (`packages/tools`)

- `npm run assets:build` — packs every sprite/tile into `atlas_<category>.png` +
  `atlas.meta.json` (frame rects, anchors, fps, collision). Deterministic packing
  (sorted by name) so diffs are stable.
- `npm run assets:validate` — CI gate:
  - only palette chars; canonical sizes; anchor inside sprite
  - no pure black/white in bespoke art; outline rule heuristics (border pixels of character-category
    sprites must be dark-ramp indices)
  - orphan-pixel lint (single-pixel color islands → error, allowlist for eye
    highlights via `"lintAllow": ["sparkle"]`)
  - seasonal remap completeness (every R3/R6 index has a mapping in each season table)
- `npm run assets:preview` — dev page rendering any asset at 1×/4×/8× on light/dark
  checkered ground, alongside pinned "anchor set" of approved assets, with animation
  playing. **Agents must screenshot this (see `/run` workflow) and eyeball every new
  asset before committing.**

### 2.1 Authoring catalogue and reusable stamps

The committed `packages/assets/**/*.sprite.json` and `*.tile.json` definitions are
the canonical asset sources. `packages/client/public/generated/atlas_*.png`,
`atlas.meta.json`, and `asset-registry.json` are disposable build output; atlas frame
coordinates may change whenever packing changes. The ignored licensed `references/`
directory is source discovery input only and must never enter the runtime catalogue,
map files, exports, or public repository.

Editor palettes enumerate the generated registry so preview and runtime resolve the
same reviewed assets. Reusable layouts serialize as `MapStampDocumentV1`: placements
carry stable numeric asset id, asset name, named state/variant/animation plus frame
index, logical tile/elevation/layer, transform, and pivot. They do **not** persist
atlas rectangles or generated filenames. Renaming or retiring a shipped asset will
therefore require an explicit alias/proxy migration rather than silently reusing its
id. Stamps remain offline assets until the world editor's validation and authenticated
publication phases land.

## 3. Authoring workflow for an agent

1. Read 10-art-style-guide.md §for the asset's category. Open 2–3 approved
   `*.sprite.json` neighbors as reference (start from `references/anchor-set/` once
   milestone A1 creates it).
2. Block the silhouette first: fill with one mid-ramp index, check shape at 1× in the
   preview tool.
3. Add the 3-tone shading pass (base, shadow, highlight from the object's ramp),
   light top-left.
4. Outline per rules; run validate; run preview; compare against neighbors.
5. Commit source JSON only — atlases are build artifacts (gitignored).

During the initial M2 anchor bootstrap, a category with fewer than three approved
neighbors uses every available same-category anchor plus three supplied style
benchmarks. Once three anchors exist in that category, the normal three-neighbor
requirement applies. This exception cannot be used for post-M2 asset production.

Budget guidance: a 16×16 tile is ~10 min of agent effort; don't gold-plate. A hero
asset (mature tree, farmhouse) deserves iteration; a rock does not.

## 4. Palette-swap markers (character customization, seasons)

Characters are drawn once using four **marker groups**: `W`=skin, `X`=hair,
`Y`=shirt, `Z`=pants. `"markers"` maps a reserved group character to its closed-palette
default for atlas generation. `"markerRamps"` declares every grid character belonging
to that runtime swap group, ordered dark→light; ramps may contain two or three shade
steps (the base avatar uses two for skin/hair and three for shirt/pants). The atlas
metadata preserves each marker pixel and its shade index, then the client substitutes
the player's chosen ramp at load. Seasonal recolors are palette remap tables in
`packages/assets/seasons.json` applied at atlas build (four atlas variants). Never
hand-duplicate a sprite to recolor it.

## 5. The iteration loop: agents must SEE their work

Coding agents can read PNG files into their context. The pipeline exploits this —
**no asset is ever authored blind**:

- `npm run assets:render <name>` — writes `build/review/<name>.png`: the asset at
  8× (and 1× inset), on light/dark checker ground, **beside 2–3 approved anchor-set
  neighbors of the same category**, plus an animation filmstrip (every frame in a
  row, 4×) if animated.
- The authoring agent Reads that PNG after *every* pass (silhouette pass, shading
  pass, outline pass — see the `pixel-art` skill), critiques it against
  [10-art-style-guide.md](10-art-style-guide.md), edits the grid, re-renders.
- Cap: ~3 look-critique-edit cycles for ordinary assets, more only for hero assets
  (avatar, mature trees, farmhouse, title art). Perfectionism on rocks is waste.
- The review PNG for each **new** asset is attached to its PR/commit; the reviewer
  (agent or human) judges from the same image. `build/` is gitignored.

This render→Read→edit loop is the project's answer to "how does a text-only agent
do art." It works because critique is a much easier visual task than generation:
the model reliably *sees* banding, missing outlines, wrong light direction, and
style mismatch against the neighbors strip, even when it wouldn't have avoided them
while writing rows of characters.

## 6. Generated images & public assets (policy)

**Image generation (DALL-E/SD/etc., or a harness's native image tool):**
- Allowed as **concept reference only** — silhouette ideas, color mood, "what does
  a foudre look like." Save concepts under `references/art-inspiration/`. That
  folder also holds the owner-supplied **visual benchmarks** (see its README): six
  Stardew screenshots that are the mandatory quality-comparison bar for visual
  milestones — study and compare against them, never copy pixels from them, never
  ship them. Never ship generated output directly either: diffusion
  "pixel art" is off-grid, anti-aliased, and off-palette, and it cannot hold one
  style across an asset set.
- Optional assisted path: `npm run assets:import <img> --size WxH --name foo` —
  nearest-neighbor downscale to the canonical size, snap every pixel to the nearest
  palette color (Oklab distance), delete orphan pixels, emit a `*.sprite.json`
  **draft**. A draft is a starting point, never a deliverable: it still needs the
  full outline/shading/cleanup passes and the same review loop before it counts.
  Expect imports to work occasionally for props and poorly for characters.

**Public/CC0 asset packs (Kenney, Sprout Lands, LPC, OpenGameArt):**
- Not shipped. Use them the same way as generated concepts: downloaded into
  `references/art-inspiration/` for study (the agent Reads them while drawing —
  "how does this pack do tree canopies at 16px?").
- Rationale: our content is bespoke (10 species × growth stages, presses, ceremonies,
  seasonal remaps), so pack adoption still means pixel-editing — in someone else's
  style — and mixing packs destroys coherence, which is this project's whole art bet.
- Sanctioned fallback (requires a DECISIONS.md entry + user sign-off): if the M2
  anchor set proves too slow, ONE coherent CC0 pack may be adopted for *terrain
  tiles only*, palette-remapped to ours by the import tool. Characters, trees, and
  buildings stay authored regardless.

**Owner-licensed paid packs:** may be used when the owner explicitly supplies and
approves them. Purchased source sheets remain ignored local authoring inputs and are
never committed or redistributed. Only reviewed semantic extracts, converted to the
text-grid format and validated through the normal palette/review pipeline, ship.

**Project decision (2026-08-24):** the owner-supplied Sprout Lands Basic Pack and
owner-purchased Cute Fantasy collection are approved for this private build. Cute
Fantasy is the primary coherent source for terrain, characters, vegetation,
buildings, props, and UI. Assets may be cropped into committed text grids through
`assets:import`; reviewed Cute Fantasy extracts retain native per-asset ramps rather
than being flattened into the Orchard palette. Original packs remain ignored and are
not redistributed. Credit Cup Nooble and Kenmi Art in the game.


## 7. Asset inventory & naming

Names: `category_thing_variant_state`, snake_case — e.g. `tile_grass_summer`,
`tree_apple_sapling`, `avatar_base_walk_down`, `ui_panel_9slice`, `icon_resource_must`.
The master inventory (what to draw, priorities, sizes) is the Asset List appendix in
[14-roadmap.md](14-roadmap.md). Check off items there as they land.
