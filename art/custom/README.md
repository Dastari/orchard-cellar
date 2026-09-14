# Project artwork

`tool-progression/` contains exact native RGBA sources for 24 material tool
icons, 18 swing overlays and two silver item icons. Reproduce them with
`node --import tsx packages/tools/src/build-tool-progression-art.ts`.
The approved 0.4.1 inventory icons use native licensed Kenmi **No Outline** axe,
hoe and pickaxe silhouettes and an original project-authored shovel. The exact
geometry and six material palettes are retained under
`references/generated/tool-progression/review-v2/`: `classic-geometry.json`,
`shovel-redraw.json` and `shovel-redraw-palettes.json`. The owner approved all
24 replacements in the inventory-scale PNG preview before implementation.
The four generated wooden concepts and exact prompts in the parent directory
document the superseded 0.4.0 sampling approach; they are retained as history
and are not the replacement icons' silhouettes.
Swing variants retain the licensed Kenmi tool geometry and frame timing;
silver item variants retain the existing plain iron icon geometry.

`string.png` is the approved 16×16 RGBA inventory sprite, with six source colors
and 160 fully transparent pixels. `packages/assets/props/item_string.sprite.json`
contains the matching pixels and palette used by the atlas pipeline.

The owner supplied `references/tmp/image.png`. The built-in image-generation tool
adapted it into a small, light beige twine ball without an outline. The selected
transparent intermediate is retained as `string-transparent.png`. Native-size
import used nearest-neighbor sampling and consolidated the sampled colors into
six shades before generating the final PNG and exact source palette.

The final background-extraction prompt was:

> Background extraction ONLY. The attached beige pixel-art twine ball currently
> has a baked white and pale-grey checkerboard background. Remove EVERY background
> checker square completely and export as true transparent PNG with an alpha
> channel. Keep the ball and curled tail unchanged, with opaque beige strands.
> Transparent pixels must surround the entire object and fill the space under its
> tail. Do not draw a checkerboard, white backdrop, black backdrop, or shadow. The
> output must have actual alpha=0 background pixels, not a picture of transparency.
> Retain pixel art edges and original position.
