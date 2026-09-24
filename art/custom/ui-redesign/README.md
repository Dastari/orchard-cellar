# Game UI redesign art (2026-09-24)

Sprites for controls the Cute Fantasy UI sheets do not supply. Some are derived
from licensed Kenmi Cute Fantasy art and some are project-authored; each entry
below says which. Everything is drawn in Kenmi's palette and anatomy under the kit
rule in decision Gear-D4. Each PNG is a left-to-right strip of the sprite's frames
in `frameKinds` order; the matching `packages/assets/ui/*.sprite.json` holds the
same pixels with an exact source palette.

- `ui_orchard_equipment_silhouettes.png`: one flat silhouette per equipment slot.
  - **Derived (licensed Kenmi):** backpack, head, watch, body, off hand, feet and
    main hand are Kenmi's brown equipment tiles (`ui_cf_kit_equipment_brown`) with
    their backing removed and recoloured to one flat ink.
  - **Project-authored:** legs, neck and hands, drawn to match them.
  - Ink `#cc885f`, the slot face blended with its shadow.
- `ui_orchard_glyphs.png`: search, sort, next/previous page, plus/minus and a
  small red cross for book tabs are **project-authored**; the hammer HUD glyph is
  **copied unchanged from licensed Kenmi art** (`icon_cf_hammer`). Dark ink
  `#743f39` matches the button glyph sheet's peach palette.
- `ui_orchard_close_wood.png`: the wooden close plaque (idle, hover, pressed),
  **project-authored** in the `ui_cf_panel_wood` colour ramp with a carved cross
  that lights in parchment on hover.
- `ui_orchard_logo_apple.png`: the brand apple, **project-authored**, sampled cell
  by cell from the project's own PWA app icon
  (`packages/client/public/pwa/icons/apple-512.png`) for the title sign.

The derived sprites are used under the same licence as the rest of the Kenmi Cute
Fantasy art in this repository and are not separately licensed. The owner approved
these sprites in the design review batches of 2026-09-24.
