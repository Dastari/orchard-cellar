# Kenmi Cute Fantasy premium icons

The owner-supplied `Cute_Fantasy_Icons_Premium.zip` contains **6,982 numbered icons**
across nine categories. The local library retains nine native 16×16 contact sheets
and the vendor's `read_me.txt` under `references/art/kenmi/cute-fantasy/icons/`.
Vendor category directories and sheet filenames are unchanged.

The [coordinate index](kenmi-premium-icons-index.json) maps every vendor icon number
to its matching sheet cells and records the archive and retained-sheet SHA-256s.
The [Cute Fantasy index](cute-fantasy-index.md) and
[complete library index](reference-library-index.md) also cover every retained sheet.

## Categories

Paths below are relative to `references/art/kenmi/cute-fantasy/icons/`.

| Category | Numbered icons | Sheet dimensions | Native sheet |
| --- | ---: | --- | --- |
| Armor | 1,850 | 160×2960 | `Cute_Fantasy_Icons_Armor/16x16/Armor_all_16x16.png` |
| Farming | 205 | 160×336 | `Cute_Fantasy_Icons_Farming/16x16/Farming_all_16x16.png` |
| Food | 194 | 160×320 | `Cute_Fantasy_Icons_Food/16x16/Food_all_16x16.png` |
| Monster Drops | 210 | 160×336 | `Cute_Fantasy_Icons_Monster_Drops/16x16/Monster_Drops_all_16x16.png` |
| Potions | 676 | 208×832 | `Cute_Fantasy_Icons_Potions/16x16/Potions_all_16x16.png` |
| Resources | 950 | 160×1520 | `Cute_Fantasy_Icons_Resources/16x16/Resources_all_16x16.png` |
| Tools | 553 | 160×896 | `Cute_Fantasy_Icons_Tools/16x16/Tools_all_16x16.png` |
| Treasure & Keys | 704 | 128×1408 | `Cute_Fantasy_Icons_Treasure&Keys/16x16/Treasure&Keys_all_16x16.png` |
| Weapons | 1,640 | 160×2624 | `Cute_Fantasy_Icons_Weapons/16x16/Weapons_all_16x16.png` |

## Finding an individual icon

Select a category in the JSON. `iconCells[n - 1]` gives the zero-based row-major
sheet cells matching vendor icon number `n`; the original filename is given by
`iconFilenamePattern`. For cell `i`, crop `(x, y, width, height)` as
`((i % columns) * 16, floor(i / columns) * 16, 16, 16)`.
Multiple cells mean pixel-identical authored duplicates; any listed cell is valid.
Icon numbers are vendor identifiers, not semantic item names. Inspect the artwork
before assigning gameplay meaning. Blank sheet cells are not additional icons.

For example, to find the cells for Weapons icon 42:

```sh
jq '.categories[] | select(.category == "Weapons") | {source, columns, cells: .iconCells[41]}' docs/reference-assets/kenmi-premium-icons-index.json
```

## Retention and verification

- All 20,974 archive files passed ZIP CRC verification.
- Every one of the 6,982 native single-icon exports was matched against the
  retained sheet using all RGBA bytes.
- All 13,982 larger PNGs (single icons and full sheets) were verified pixel by
  pixel as exact nearest-neighbour enlargements of their native 16 px sources.
- The library omits those redundant exports. This compact-sheet exception applies
  to this verified icon pack; other Cute Fantasy source layouts remain intact.
- The original ZIP is preserved locally at
  `output/kenmi-premium-icons/Cute_Fantasy_Icons_Premium.zip`, outside the indexed
  library. The full extraction and verification report are beside it.
- The included premium source note permits commercial/noncommercial use and
  modification and prohibits redistribution/resale. Source PNGs and the archive
  remain ignored by Git; only discovery metadata is tracked.

Regenerate the existing family/global catalogs with
`npm run document:references -w @orchard/tools`, then run
`npm run check:references -w @orchard/tools`. The coordinate index records this
specific archive revision; regenerate its pixel matches if the vendor pack changes.
