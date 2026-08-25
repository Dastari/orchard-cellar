# Orchard Originals — Extra Tool Icons

Backup masters for tool icons that do **not** exist in the licensed Cute Fantasy
packs, plus the pack sword for strip completeness. Committed to git (unlike
`references/Cute_Fantasy*/`, which is ignored) so these survive a wipe of local
pack archives, databases, or generated atlases.

Sheets (pack format, 16×16 cells, order: **Shovel, Sword, Hammer**):

- `Tool_Icons_Extra_Outline.png` — with the cream sticker ring (`#f2e3c2` /
  pack `#f9e6cf` for the sword), matching
  `Cute_Fantasy/Icons/Outline/Tool_Icons_Outline.png`.
- `Tool_Icons_Extra_NO_Outline.png` — same art minus the ring, matching the
  pack's `No Outline` sheets.

Provenance:

| Icon | Source of truth | Origin |
|---|---|---|
| Shovel | `packages/assets/ui/icon_cf_shovel.sprite.json` | **Original** (2026-08-25), global palette, drawn in the pack tool-icon style |
| Sword | `packages/assets/ui/icon_cf_sword.sprite.json` | **Pack extract** — `Tool_Icons_Outline.png` region [64,0,16,16], Kenmi Cute Fantasy (paid license: commercial OK, no redistribution — treat this file like pack content) |
| Hammer | `packages/assets/ui/icon_cf_hammer.sprite.json` | **Original** (2026-08-25), global palette |

To recreate the PNGs from the sprite JSONs: resolve each grid char through the
sprite's `sourcePalette` (sword) or `packages/assets/palette.json` (originals),
compose 16×16 cells side by side; the NO_Outline variant drops the ring char
(`7` for the sword, `J` for the originals). The originals carry no
`importedFrom`, so they are exempt from the M9 pack-redraw rule; the sword is
not.
