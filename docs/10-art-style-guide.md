# 10 — Pixel Art Style Guide (The Style Bible)

Every sprite, tile, animation, and UI element must follow this document. It exists so
that assets drawn by different agents in different sessions look like one artist made
them. The reference mood is Stardew Valley's farm exterior: warm, saturated, cozy,
readable. We do not copy Stardew assets — we match its *discipline*. Six benchmark
screenshots live in `references/art-inspiration/` (its README maps each to the
milestones it judges); visual milestones are compared against them side-by-side.

Companion docs: [11-asset-pipeline.md](11-asset-pipeline.md) (how assets are authored
and built) and the `pixel-art` skill in `.claude/skills/` (working instructions).

## 1. Hard constants

| Constant | Value |
|---|---|
| Tile size | **16×16 px** |
| Avatar/NPC body | 16×32 px (2 tiles tall), feet anchored to tile bottom |
| Trees (mature) | 48×64 px (3×4 tiles), trunk base occupies 1 collision tile |
| Buildings | multiples of 16 in both axes |
| Virtual resolution | 480×270 (30×~17 tiles on screen), integer-scaled |
| Palette | `packages/assets/palette.json` — **56 colors, closed** (see §2) |
| Transparency | binary only — a pixel is a palette color or fully transparent; no alpha blending inside sprites |
| Outlines | 1 px, **not pure black** — use the palette's darkest hue-relative color (see §3) |

Adding a palette color is a design decision requiring an explicit doc update + user
sign-off. Everything ships from these 56.

## 2. The palette — "Late Summer Orchard"

Defined canonically in `packages/assets/palette.json`; hex values below are the source
of truth until that file is generated from this table (generate it verbatim).

Organized as ramps (dark → light). Shade *within a ramp*; jump ramps only at outlines.

| Ramp | Name | Hexes (dark → light) |
|---|---|---|
| R1 | Bark & soil | `#2b1d0e #4a2f17 #6b4423 #8a5a2b #a97744` |
| R2 | Warm earth / paths | `#c68a53 #dba15f #edb96f #f7d08a` |
| R3 | Foliage green | `#1a3b25 #2d5a27 #3f7d32 #58a346 #7ec850 #b4e07c` |
| R4 | Cool green (shade grass) | `#173a33 #26594a #3b7d5e #57a374` |
| R5 | Fruit red / accents | `#5c1423 #8c2333 #c03a2b #e85d3d #ff8f5e` |
| R6 | Orchard gold (fruit, UI accent) | `#7a4a12 #b3781e #e0a62d #f7c94b #ffe98a` |
| R7 | Sky & water | `#1e3a5c #2d5f8a #4a90c2 #7cc0e8 #c8ecf4` |
| R8 | Stone & metal | `#2e2c33 #4a4750 #6e6a75 #969099 #c4bec6` |
| R9 | Wine & blossom | `#3d1230 #6b2154 #a03a6e #d4699b #f0a8c4` |
| R10 | Cream & parchment (UI, skin lights) | `#fff6e0 #f2e3c2 #d9c49a` |
| R11 | Skin tones | `#5a3a2a #8a5b3c #c68e63 #eab98f #f6d7b0` |
| R12 | Night/shadow tint | `#141420 #232338` |
| — | Deep outline | `#1a1210` (warm near-black; the only "black") |

Rules:
- **No pure `#000000` or `#ffffff` anywhere.**
- Shadows are *cooler and darker*, highlights *warmer and lighter* (hue-shift, never
  plain darken/lighten). E.g. foliage shadow dips from R3 into R4; wood highlight
  leans from R1 into R2.
- Cast shadows on the ground: R12 `#232338` at 40% dither (checkerboard), never solid.

## 3. Drawing rules

1. **Outlines**: 1 px on characters, animals, items, and interactive objects. Use the
   darkest step of the object's own ramp on top/lit edges, `#1a1210` on bottom/ground
   contact. Terrain tiles and background foliage have **no** outline (they read as
   texture, not object).
2. **Light source**: top-left, always, ~45°. Highlight top-left facets, shade
   bottom-right.
3. **Cluster shading ("banding" ban)**: shade in irregular clusters following form
   (clumps of leaves, planks of wood), never in even 1-px concentric bands and never
   pillow-shading (ringing the outline).
4. **Dithering**: sparingly, checkerboard only, for large soft gradients (sky, soil).
   Never on characters or items.
5. **Readability at 1×**: every object must be identifiable as a silhouette. Fill the
   silhouette test: flood the sprite to one color — if you can't tell what it is, redraw.
6. **Anti-aliasing**: only *internal* AA (buffer pixels between two internal colors on
   long diagonals). Never AA against transparency.
7. **Noise floor**: no single stray pixels of a color; minimum cluster is 2 px except
   deliberate sparkle/eye highlights.
8. **Texture economy**: large flat areas get 2–3 texture clusters per 16×16, not full
   noise. Stardew reads clean because most pixels are flat color.

## 4. Characters

- 16×32, head ≈ 40% of height (chibi proportion: big head, small legs — matches the
  reference image), eyes are 2×2 px with 1 px highlight, no mouth except emotes.
- **4 facing directions** (down/up/left/right — left is right mirrored *except* held
  tools and hair asymmetry, which must be redrawn).
- Walk cycle: 4 frames per direction at 8 fps (contact–pass–contact–pass). Head bobs
  1 px on pass frames.
- Tool-use (tend/harvest/press): 3 frames per direction at 10 fps + 1 recovery frame.
- Idle: 1 frame; blink every ~4 s (2-frame overlay).
- Avatar customization: skin (R11 index), hair color (any ramp's mid step), shirt and
  pant recolors via palette-swap at load — draw base character with *marker colors*
  documented in the pipeline doc, never hand-recolor variants.

## 5. The world

- **Trees are the heroes.** Fruit trees get the biggest color budget: R3 canopy with
  R4 shadow mass, R1 trunk, fruit dots (3×3 px, R5 or R6) that visibly appear as the
  tree matures — growth stages: sapling (16×16) → young (16×32) → mature (48×64) →
  fruiting (48×64 + fruit overlay) → each is its own sprite, no scaling.
- Terrain uses **47-blob autotiles** for grass/path/tilled-soil edges (the pipeline
  tool generates the 47 variants from a 5-tile template — see 11).
- Seasons recolor the world: each season has a palette *remap table* (R3→autumn
  oranges etc.) applied at atlas build; do not draw four copies of anything unless
  the silhouette actually changes (bare winter trees do).
- Buildings: timber-frame style, R1/R2 wood, R5 dulled (`#8c2333`) roof shingles,
  2.5D front-facing like the reference image (front face + 30% roof plane).

## 6. Animation standards

| Thing | Frames | FPS |
|---|---|---|
| Walk | 4/direction | 8 |
| Tool use | 3+1 | 10 |
| Tree sway (ambient) | 2 | 1.5 |
| Water shimmer | 4 | 3 |
| Butterflies/birds | 3 | 6 |
| UI coin/fruit pickup | 6 (arc + squash) | 12 |
| Press/cask working | 4 loop | 5 |

Ambient motion budget: every screen should have ≥3 idle animations (sway, birds,
smoke) — this is what makes it feel alive — but nothing that loops faster than 3 s.

## 7. UI art

- Panels: 9-slice, parchment fill `#f2e3c2`, 2 px wood border (R1 `#6b4423` outer,
  `#2b1d0e` inner edge), corners rounded by 3 px steps.
- Bitmap font: 2 sizes — `font-5x7` (body) and `font-8x12` (headers), both authored
  as sprites in the pipeline; charset: printable ASCII + `×→♪♥☀❄`. Text color
  `#2b1d0e` on parchment, `#fff6e0` on dark.
- Icons: 12×12 inside a 16×16 cell, 1 px outline, one accent ramp per resource
  (Fruit=R5, Pomace=R2, Must=R9, Bottles=R9 light, Terroir=R6, Seeds=R3).
- Cursor/highlight: animated 16×16 corner brackets in R6 gold, 2-frame pulse.

## 8. Review checklist (every asset PR)

- [ ] Only palette colors (CI `validate-assets` enforces; do not bypass)
- [ ] Correct canonical size; anchored to tile grid
- [ ] Silhouette test passes at 1×
- [ ] Light from top-left; no pillow shading; no banding
- [ ] Outline rule followed for its category
- [ ] Rendered next to 3 existing approved assets in the preview tool — same world?
- [ ] Animation timed per §6 table
