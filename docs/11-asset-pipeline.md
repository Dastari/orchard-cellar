# 11 — Asset Pipeline: How Agents Author Art

Agents cannot push pixels in an image editor, so **assets are text**. Every sprite is
a JSON pixel grid referencing the palette by index; a build tool compiles them into
PNG atlases the engine consumes. This makes art diffable, reviewable, lintable, and —
critically — style-enforceable by CI.

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
