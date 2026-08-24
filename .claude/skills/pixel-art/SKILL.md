---
name: pixel-art
description: Author pixel-art sprites, tiles, animations, and maps for Orchard & Cellar. Use whenever creating or editing any visual asset (*.sprite.json, *.tile.json, *.map.json), the palette, seasonal remaps, or when reviewing art PRs. Enforces the style bible so all art looks like one artist made it.
---

# Pixel Art Authoring — Orchard & Cellar

You are drawing text-based pixel art for a warm, Stardew-inspired farm game.
Binding rules live in `docs/10-art-style-guide.md` (style bible) and
`docs/11-asset-pipeline.md` (formats & tools). This skill is the working procedure.

## Before drawing anything

1. Re-read the style bible section for your asset's category (characters §4,
   world §5, UI §7, animation §6).
2. Open 2–3 approved neighbor assets of the same category (start with the anchor
   set from milestone M2) and keep them beside you as reference.
3. Confirm the canonical size: tile 16×16, character 16×32, mature tree 48×64,
   buildings in multiples of 16. Never invent a new size without a DECISIONS.md entry.

## The iteration loop (never author blind)

After EVERY pass below, run `npm run assets:render <name>` and **Read the output
PNG** (`build/review/<name>.png` — the asset at 8× beside approved neighbors, plus
an animation filmstrip). Critique what you actually see before editing again:

1. Look → name the single worst problem in one sentence ("canopy shading is
   concentric banding", "outline missing on the basket rim", "reads as a bush next
   to the anchor tree").
2. Fix that one problem in the grid. Re-render. Re-Read.
3. Budget: ~3 critique cycles for ordinary assets; hero assets (avatar, mature
   trees, farmhouse, title art) may take more. If cycle 3 still fails the
   silhouette or neighbor test, restart from the silhouette rather than polishing.

Critique in the *seeing* direction is your strength — banding, wrong light, style
mismatch are all visible at 8× even when they weren't obvious while writing rows.
Trust the render over your mental image of the grid, always.

## Reference & generated images

- Study material lives in `references/art-inspiration/` (CC0 packs, concept
  images). Read them for silhouette/technique ideas while drawing. Never copy
  pixels from them into deliverables; never ship them.
- If you have image generation available, use it only for concept reference, or
  feed a generation through `npm run assets:import` to get a palette-snapped
  *draft* grid — a draft still requires every pass below plus the review loop.
  Policy details: `docs/11-asset-pipeline.md` §6.

## Drawing procedure (follow in order)

1. **Silhouette first.** Fill the shape with one mid-ramp index. Render and Read
   the review PNG; check the 1× inset. If the silhouette isn't identifiable,
   fix the shape before adding any detail.
2. **Three-tone pass.** Base color, shadow, highlight — all from the object's own
   ramp in `packages/assets/palette.json`. Light source is top-left at 45°, always.
   Shadows shift cooler (e.g. foliage R3→R4), highlights warmer.
3. **Outline pass.** Characters/items/interactives: 1 px outline — darkest step of
   the object's ramp on lit edges, `#1a1210` at ground contact. Terrain and
   background foliage: NO outline.
4. **Texture pass.** 2–3 irregular clusters per 16×16 of flat area. No even bands,
   no pillow shading, no single stray pixels (minimum cluster 2 px except eye
   highlights). Dither = checkerboard only, large gradients only, never on
   characters.
5. **Validate & compare.** `npm run assets:validate` must pass. In the preview
   tool, render next to the 3 reference neighbors: same world? If it pops out as
   different, find which rule you broke.

## Palette discipline

- 56 colors + markers `W X Y Z` (skin/hair/shirt/pants swap groups) — nothing else.
  The validator enforces this; never edit the palette to make a sprite pass.
- No pure black or white. The only near-black is `#1a1210`.
- Seasonal variants come from remap tables in `packages/assets/seasons.json`,
  never from hand-recolored duplicates.

## Animation

Frame counts/FPS are fixed per category (bible §6): walk 4 @ 8 fps, tool-use 3+1 @
10 fps, ambient sway 2 @ 1.5 fps, UI pickup 6 @ 12 fps. Character walk = contact/
pass/contact/pass with 1 px head bob on pass frames. Left = mirrored right EXCEPT
held tools and asymmetric hair — redraw those.

## Common failures to self-check

- Banding (even concentric shading) — the #1 amateur tell.
- Outlining terrain, or forgetting outlines on items.
- Light from the wrong side; flat un-hue-shifted shading.
- Overdetailing: Stardew reads clean because most pixels are flat color.
- Scaling sprites instead of drawing each growth stage.

Finish every asset task by filling in the checklist from `docs/10-art-style-guide.md`
§8 in your commit/PR message, with a preview screenshot.
