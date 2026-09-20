# Kenmi tool, skill and orchard seed imports (0.8.5)

Implements the user-approved first pass from
[the icon audit, PR #22](https://github.com/Dastari/orchard-cellar/pull/22):
hammer, six shovel tiers, nine farming/mining skills, and four orchard seed icons.
Crafting and Build share one renderer for 24×24 button chrome, hover state and
16×16 icons inset by four pixels. Crafting uses the existing Kenmi wrench
(`ui_cf_icon_crafting`), distinct from Build's new hammer. Inventory remains
available through the original bottom-right gold/purse display.
The legacy `icon_cf_shovel` alias uses the same iron-spade artwork. Item IDs,
progression, rewards, prices and all swing animations are unchanged.

## Source crops

Source root: `references/art/kenmi/cute-fantasy/icons/`. All coordinates below are
zero-based `(column, row)` in 16×16 cells. Preserve vendor filenames.

| Family / file | Targets | Cells |
| --- | --- | --- |
| `Cute_Fantasy_Icons_Tools/16x16/Tools_all_16x16.png` | Hammer | `(0,35)` |
| Tools | Copper, iron, silver, gold shovels | `(2,8)`, `(1,8)`, `(0,8)`, `(3,8)` |
| Tools | Wood, stone shovels | Derived from `(2,8)`, `(1,8)`; blade palettes below |
| Tools | Farmcraft, Mining Endurance, Tender Hand, Woodcutting Endurance | `(0,5)`, `(0,0)`, `(0,32)`, `(0,12)` |
| `Cute_Fantasy_Icons_Farming/16x16/Farming_all_16x16.png` | Rural Crafts, Seed Saver, Orchard Seed Saver | `(0,0)`, `(1,0)`, `(1,10)` |
| Farming | Apple, peach, pear, cherry seed items | `(1,10)`, `(4,10)`, `(7,10)`, `(0,11)` |
| `Cute_Fantasy_Icons_Resources/16x16/Resources_all_16x16.png` | Ore Dressing, Mother Lode | `(1,3)`, `(3,12)` |

Native imports preserve every RGBA pixel. Wood and stone use the same shovel
silhouette and original handle/outline, replacing only four blade colours:

| Variant | Source ramp (dark to light) | Replacement ramp |
| --- | --- | --- |
| Wood | `#743f39 #b86f50 #e4a672 #ead4aa` | `#593019 #895024 #b77a37 #daa557` |
| Stone | `#424c6e #6c7c9d #8e9ab4 #c0cbdc` | `#424548 #606568 #80888a #a0a6a5` |

Their reproducible derivative PNGs remain local under
`art/custom/tool-progression/`; committed sprite descriptors retain their exact
palettes and derivative provenance. No raw licensed source images are committed.
The original archive was deleted at the owner's request; the extracted pack is
still available locally. See [PR #21](https://github.com/Dastari/orchard-cellar/pull/21)
for the complete reference index.

## Regeneration

```sh
npm run extract:premium-icons -w @orchard/tools
npm run extract:skill-icons -w @orchard/tools -- farmcraft mining_endurance tender_hand farming_root seed_saver orchard_seed_saver woodcutting_endurance ore_dressing mother_lode
npm run assets:build
npm run assets:validate
```

`build-tool-progression-art.ts` and the compatibility command
`extract-original-tool-icons.ts` now call the same premium-tool importer, so they
cannot restore the retired hammer or shovel geometry. The skill importer tags
Kenmi sources correctly. All unrelated skill mappings remain intact.

The hammer keeps `icon_cf_hammer`, which is also used by the build-menu button.
Shovels retain `icon_tool_<material>_shovel`. The four orchard seed definitions
reference distinct `icon_seed_<fruit>` assets. Orchard Seed Saver now references
`icon_skill_orchard_seed_saver`, rather than aliasing the crop-seed skill.

## Review and release

Local preview: `output/icon-audit/implemented-icons.png`, generated from the actual
committed sprite descriptors, showing 4× and native-size artwork plus the skill
UI's opacity states. `output/icon-audit/crafting-build-buttons.png` compares the
Build and Crafting button artwork at native size and 4×. These are sprite
reviews, not deployed browser screenshots.

Validation: the broad workspace run passed 4,726 tests and exposed two stale
bootstrap-content hash expectations after the five icon-reference changes. Both
expectations were refreshed and their tests pass. The final focused run passes
150 tests across seven files, and the exhaustive simulation run passes all 51
tests. Workspace typechecking/lint passed before the HUD follow-up; UI typechecking
and changed-file lint passed afterward. Assets validate/build, content validates,
and UI/tools/client builds pass. The client retains its existing chunk-size warning.

Tests verify exact source pixels, six distinct shovel palettes with identical
silhouette/handle, four distinct seed packets, complete skill/item coverage and
reviewed fingerprints usable by CI without licensed sheets. Import regeneration
must be byte-stable. Raw sources are needed only for regeneration/source-pixel
checks; public CI sets `ORCHARD_TEST_LICENSED_ART=0`.

Release requires the normal client build and authored-content publication path:
item/skill icon references are content definitions, not only client textures.
No content or application deployment is performed by these import commands.
Do not rebuild the retired Studio renderer or bypass its prebuild guard.

The optional cellar-bottle candidate, equipment prototypes, preserved-crop
composites and other deferred audit suggestions are not part of this change.

Crafting correction: narrow-screen layout, shared button rendering, hover state,
crafting activation and hiding the shortcut while a window is open are covered
by the HUD tests. The mistaken inventory-button changes were reverted.
