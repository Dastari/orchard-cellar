# Game UI redesign art (2026-09-24)

Original Orchard pixels for controls the Cute Fantasy UI sheets do not supply, drawn
in Kenmi's palette and anatomy under the kit rule in decision Gear-D4. Each PNG is a
left-to-right strip of the sprite's frames in `frameKinds` order; the matching
`packages/assets/ui/*.sprite.json` holds the same pixels with an exact source palette.

- `ui_orchard_equipment_silhouettes.png`: one flat silhouette per equipment slot
  (backpack, head, watch, body, off hand, feet, main hand from Kenmi's brown
  equipment tiles with their backing removed; legs, neck and hands drawn to match).
  Ink `#cc885f`, the slot face blended with its shadow.
- `ui_orchard_glyphs.png`: search, sort, next/previous page, plus/minus, a small
  red cross for book tabs and the hammer HUD glyph (copied from `icon_cf_hammer`).
  Dark ink `#743f39` matches the button glyph sheet's peach palette.
- `ui_orchard_close_wood.png`: the wooden close plaque (idle, hover, pressed) in
  the `ui_cf_panel_wood` ramp with a carved cross that lights in parchment on hover.
- `ui_orchard_logo_apple.png`: the brand apple, sampled cell by cell from the PWA
  app icon (`packages/client/public/pwa/icons/apple-512.png`) for the title sign.

The owner approved these in the design review batches of 2026-09-24.
