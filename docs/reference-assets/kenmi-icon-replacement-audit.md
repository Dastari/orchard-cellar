# Kenmi icon replacement audit

Audit date: 2026-09-21. Scope: repository-authored content and native art, not the
live database or a deployed browser session. This is a recommendation report;
no runtime assets, item definitions, skill definitions or deployments changed.

Reviewed all **336 item definitions and 66 skill nodes**, resolved their referenced
sprite assets, rendered current skill/art candidates, and inspected all nine new
Kenmi category sheets. All item and skill asset names resolve: the main issue is
semantic clarity and intentional placeholder reuse, not missing asset files.
Of 66 skill nodes, 63 use Clockwork Raven sources, two use existing Kenmi art,
and one reuses the hand-authored fishing rod. Different provenance alone does not
make a sprite temporary or a good replacement candidate.

## User-prioritized hammer and shovels

Following direct user feedback, replace the hammer and all six shovel-tier icons
before the other recommendations. The current hammer comes from the original
extra-tools sheet; the current shovels use the custom tool-progression geometry.

**Hammer: Tools #351**, zero-based row 35 / column 0, crop `[0, 560, 16, 16]`.
This is the compact claw-hammer silhouette, with a clearer head and claw than the
current blocky shape. Prefer it to the larger mallet-like alternatives for the
ordinary Iron Hammer. `packages/ui/src/overworld-ui.ts` draws `itemArt.hammer` for
the build-menu button, so the same replacement covers that button and inventory.

**Shovels: Tools row 8**, the long-handled spade family. Their longer shaft and
more distinct blade separate the tool from the current short, scoop-like shape.
Keep one silhouette across the six tiers:

| Tier | Vendor source | Crop | Treatment |
| --- | --- | --- | --- |
| Wood | #83, row 8 / col 2 | `[32, 128, 16, 16]` | Geometry reference; create a wood palette variant. Do not present the copper-looking native crop as finished wooden art. |
| Stone | #82, row 8 / col 1 | `[16, 128, 16, 16]` | Geometry reference; create a matte stone palette distinct from iron. |
| Copper | #83, row 8 / col 2 | `[32, 128, 16, 16]` | Native warm copper candidate. |
| Iron | #82, row 8 / col 1 | `[16, 128, 16, 16]` | Native dark steel candidate. |
| Silver | #81, row 8 / col 0 | `[0, 128, 16, 16]` | Native bright silver candidate. |
| Gold | #84, row 8 / col 3 | `[48, 128, 16, 16]` | Native gold candidate. |

The JSON labels wood/stone as derivative-required; their source rectangles are
not a claim that the final recoloured artwork exists. The local options board is
`output/icon-audit/hammer-shovel-options.png`; the focused current-versus-proposed
hammer/iron-shovel comparison is `output/icon-audit/hammer-shovel-comparison.png`.

Preserve `icon_cf_hammer` and the six `icon_tool_*_shovel` keys so all existing
consumers benefit. `build-tool-progression-art.ts` currently regenerates the old
shovel geometry, and `extract-original-tool-icons.ts` regenerates the old hammer.
Update those source-of-truth import paths together with the descriptors. The
shovel generator explicitly skips avatar swing overlays, and these hammer/shovel
item definitions have no `avatarActionAsset`; do not manufacture an animation
migration for this icon change. Keep other tools' animation art unchanged.

## Other recommended first-pass changes

Replace **nine skill icons and four fruit-tree seed icons**. Exact source paths,
SHA-256s, 16×16 crop rectangles, vendor icon numbers, current asset names and
reasons are in [the recommendation manifest](kenmi-icon-replacement-audit.json).
These are proposed mappings, not approved runtime imports.

| Target | Current image / problem | Proposed native icon | Vendor number |
| --- | --- | --- | ---: |
| Farmcraft | Apple; skill reduces hoeing/watering effort | Tools: hoe | 51 |
| Mining Endurance | Anvil; skill reduces pickaxe/shovel effort | Tools: pickaxe | 1 |
| Tender Hand | Small water-drop status symbol | Tools: watering can | 321 |
| Rural Crafts (`farming_root`) | Small, sparse grain marks | Farming: wheat head | 1 |
| Seed Saver | Small sprout | Farming: crop seed packet | 2 |
| Orchard Seed Saver | Reuses Seed Saver art | Farming: apple-labelled seed packet | 102 |
| Woodcutting Endurance | Log; communicates output rather than tool effort | Tools: axe | 121 |
| Ore Dressing | Container; weak connection to ore sorting | Resources: ore fragments | 32 |
| Mother Lode | Coins; implies money rather than rich ore | Resources: rich ore outcrop | 124 |
| Apple Seed | Shared generic green seeds | Farming: apple-labelled packet | 102 |
| Peach Seed | Same generic green seeds | Farming: peach-labelled packet | 105 |
| Pear Seed | Same generic green seeds | Farming: pear-labelled packet | 108 |
| Cherry Seed | Same generic green seeds | Farming: cherry-labelled packet | 111 |

The ore candidates use copper/gold representative colours, not new material or
reward rules. The orchard skill can deliberately share the apple packet motif
with the apple seed item; it remains distinct from the general crop-seed skill.

A local comparison image is at `output/icon-audit/recommended-comparison.png`.
It contains actual current sprites beside proposed native crops. Additional local
sheets show all current skills, suspected item placeholders and all nine new
categories. These licensed-art previews are not committed.

## Other items and UI opportunities

| Area | Evidence | Recommendation |
| --- | --- | --- |
| Estate Bottles | `item:bottles` uses the hand-authored `icon_resource_bottles` | Review Food #127, a wine-style bottle, as the next direct replacement. It is the 14th manifest entry, marked for cellar review rather than first-pass adoption. |
| Fresh Must and Pomace | `icon_resource_must` and `icon_resource_pomace` are hand-authored and lack vendor source pointers | Deserve a dedicated cellar-art pass. No confident direct substitute found. A potion flask could imply a consumable, and a bucket of blue water would misrepresent grape juice. |
| Preserved crops | All 22 `item:preserved_*` definitions reuse their raw crop's asset, despite distinct preservation-process outputs | Use a consistent preserve container plus the crop identity. Farming/Food contain jars, but replacing every output with the same generic jar loses crop recognition. This needs reviewed composed variants, not a blind sheet swap. |
| Seven equipment prototypes | Boots, gloves, helm, necklace, pants, shield and tunic use `ui_cf_equipment_slot_icons` silhouettes | Armor provides head/body/legs/hands/feet art; Weapons provides shields; Treasure & Keys provides pendants. These definitions are tagged `item.prototype`, have no `equip` field, and have no references in the other authored content JSON files. Prioritize after active content. Changing art does not implement equipment behavior. |
| Plans and books | 69 plan items and three books share `icon_cf_marlow_book` | A real discovery problem, but this pack has no obvious book/blueprint family. Retain until a document-icon design can preserve both plan identity and item family. |
| Fishing rod, raw fish, cooked fish | Hand-authored sprites with no vendor source path; Fishing Endurance reuses the rod | Review against the existing fishing reference library. No clear rod/raw-fish/whole-cooked-fish replacement found in this new pack; sushi or a hoe is not a substitute. |
| Existing tool progression | Axe/pickaxe/hoe items have authored material-tier art and corresponding avatar-action assets | Keep those families for now. Hammer and shovels are specifically prioritized above; preserve tier clarity and update their generators. |
| Existing Hearth equipment/materials | Already have dedicated native icons, many from Clockwork Raven | Optional future style-unification work, not established placeholder defects. Preserve rarity, silhouette and material distinctions. |
| Existing crop and ore icons | Already use Kenmi's core native icon art | Keep unless a specific readability improvement is demonstrated. New pack availability alone is not a reason to replace them. |
| Empty equipment slots | Silhouettes are appropriate for actual empty slots | Keep `ui_cf_equipment_slot_icons` as empty-slot UI; any prototype-item replacements need their own icon assets. |
| Diagnostic missing-asset fallback | UI loader deliberately resolves missing assets to a visible fallback | Keep diagnostic behavior. It is not an inventory illustration to replace. |
| Fruit/PWA branding | `icon_resource_fruit` is used by the PWA asset builder | Treat separately as branding; lack of a vendor source does not make it a temporary gameplay icon. |

## Skill coverage and limits

The combat tree already uses action glyphs for charge, recovery, volleys and
conditioning. New weapon inventory pictures would erase those distinctions.
Keep those glyphs. Likewise, retain eyes, maps, terrain and animal motifs when
the new pack does not provide a closer semantic match.

Five mining/fishing discovery nodes reuse explorer artwork: Ore Sense/Keen Senses,
Deep Ore Sense/Cave Whisperer, Ore Identification/Night Eyes,
Ore Mapping/Cartographer, and Fishing Mapping/Field Notes. Distinguishing them
would help, but it needs a reviewed ore/fish-plus-awareness/map composition.
A lone gemstone does not communicate detection range or mapping.
Stable Hand uses a pet-face motif for horse riding; review it against horse art in
the existing library. The new pack does not offer a clear horse replacement.

| Skill node | Current asset | Disposition |
| --- | --- | --- |
| `combat_root` | `icon_skill_combat_root` | Keep current; no stronger direct match established |
| `archery_basics` | `icon_skill_archery_basics` | Keep current; no stronger direct match established |
| `blade_training` | `icon_skill_blade_training` | Keep current; no stronger direct match established |
| `battle_conditioning` | `icon_skill_battle_conditioning` | Keep current; no stronger direct match established |
| `steady_draw` | `icon_skill_steady_draw` | Keep current; no stronger direct match established |
| `critical_eye` | `icon_skill_critical_eye` | Keep current; no stronger direct match established |
| `quick_recovery` | `icon_skill_quick_recovery` | Keep current; no stronger direct match established |
| `power_swing` | `icon_skill_power_swing` | Keep current; no stronger direct match established |
| `shield_discipline` | `icon_skill_shield_discipline` | Keep current; no stronger direct match established |
| `battle_hardened` | `icon_skill_battle_hardened` | Keep current; no stronger direct match established |
| `piercing_shot` | `icon_skill_piercing_shot` | Keep current; no stronger direct match established |
| `multishot` | `icon_skill_multishot` | Keep current; no stronger direct match established |
| `blade_dancer` | `icon_skill_blade_dancer` | Keep current; no stronger direct match established |
| `perfect_volley` | `icon_skill_perfect_volley` | Keep current; no stronger direct match established |
| `explorer_root` | `icon_skill_explorer_root` | Keep current; no stronger direct match established |
| `trailblazer` | `icon_skill_trailblazer` | Keep current; no stronger direct match established |
| `measured_stride` | `icon_skill_measured_stride` | Keep current; no stronger direct match established |
| `keen_senses` | `icon_skill_keen_senses` | Keep current; no stronger direct match established |
| `pathfinder` | `icon_skill_pathfinder` | Keep current; no stronger direct match established |
| `surefooted` | `icon_skill_surefooted` | Keep current; no stronger direct match established |
| `cliff_climber` | `icon_skill_cliff_climber` | Keep current; no stronger direct match established |
| `second_wind` | `icon_skill_second_wind` | Keep current; no stronger direct match established |
| `night_eyes` | `icon_skill_night_eyes` | Keep current; no stronger direct match established |
| `cave_whisperer` | `icon_skill_cave_whisperer` | Keep current; no stronger direct match established |
| `field_notes` | `icon_skill_field_notes` | Keep current; no stronger direct match established |
| `steeplechase` | `icon_skill_steeplechase` | Keep current; no stronger direct match established |
| `horizon_chaser` | `icon_skill_horizon_chaser` | Keep current; no stronger direct match established |
| `cartographer` | `icon_skill_cartographer` | Keep current; no stronger direct match established |
| `deep_pockets` | `icon_skill_deep_pockets` | Keep current; no stronger direct match established |
| `farming_root` | `icon_skill_farming_root` | Replace: first-pass manifest |
| `green_thumb` | `icon_skill_green_thumb` | Keep current; no stronger direct match established |
| `tender_hand` | `icon_skill_tender_hand` | Replace: first-pass manifest |
| `farmcraft` | `icon_skill_farmcraft` | Replace: first-pass manifest |
| `seed_saver` | `icon_skill_seed_saver` | Replace: first-pass manifest |
| `bountiful_harvest` | `icon_skill_bountiful_harvest` | Keep current; no stronger direct match established |
| `soil_whisperer` | `icon_skill_soil_whisperer` | Keep current; no stronger direct match established |
| `grafting` | `icon_skill_grafting` | Keep current; no stronger direct match established |
| `barreling` | `icon_skill_barreling` | Keep current; no stronger direct match established |
| `sprinkler_engineering` | `icon_skill_sprinkler_engineering` | Keep current; no stronger direct match established |
| `greenhouse_charter` | `icon_skill_greenhouse_charter` | Keep current; no stronger direct match established |
| `master_grower` | `icon_skill_master_grower` | Keep current; no stronger direct match established |
| `harvest_festival` | `icon_skill_harvest_festival` | Keep current; no stronger direct match established |
| `mining_endurance` | `icon_skill_mining_endurance` | Replace: first-pass manifest |
| `prospector` | `icon_skill_prospector` | Keep current; no stronger direct match established |
| `efficient_strikes` | `icon_skill_efficient_strikes` | Keep current; no stronger direct match established |
| `ore_dressing` | `icon_skill_ore_dressing` | Replace: first-pass manifest |
| `rockhound` | `icon_skill_rockhound` | Keep current; no stronger direct match established |
| `mother_lode` | `icon_skill_mother_lode` | Replace: first-pass manifest |
| `fishing_endurance` | `icon_skill_fishing_endurance` | Review existing fishing library; no direct new-pack match |
| `seasoned_angler` | `icon_skill_seasoned_angler` | Keep current; no stronger direct match established |
| `master_angler` | `icon_skill_master_angler` | Keep current; no stronger direct match established |
| `woodcutting_endurance` | `icon_skill_woodcutting_endurance` | Replace: first-pass manifest |
| `timber_sense` | `icon_skill_timber_sense` | Keep current; no stronger direct match established |
| `master_forester` | `icon_skill_master_forester` | Keep current; no stronger direct match established |
| `animal_bond` | `icon_skill_animal_bond` | Keep current; no stronger direct match established |
| `stable_hand` | `icon_skill_stable_hand` | Review existing horse art; no direct new-pack match |
| `animal_friend` | `icon_skill_animal_friend` | Keep current; no stronger direct match established |
| `herd_keeper` | `icon_skill_herd_keeper` | Keep current; no stronger direct match established |
| `beekeeping` | `icon_skill_beekeeping` | Keep current; no stronger direct match established |
| `hive_keeper` | `icon_skill_hive_keeper` | Keep current; no stronger direct match established |
| `ore_sense` | `icon_skill_ore_sense` | Needs a composed discovery symbol; no direct swap |
| `deep_ore_sense` | `icon_skill_deep_ore_sense` | Needs a composed discovery symbol; no direct swap |
| `ore_identification` | `icon_skill_ore_identification` | Needs a composed discovery symbol; no direct swap |
| `ore_mapping` | `icon_skill_ore_mapping` | Needs a composed discovery symbol; no direct swap |
| `fishing_mapping` | `icon_skill_fishing_mapping` | Needs a composed discovery symbol; no direct swap |
| `orchard_seed_saver` | `icon_skill_seed_saver` | Replace: first-pass manifest |

## Implementation boundaries for the follow-up

1. Integrate the reference metadata from [PR #21](https://github.com/Dastari/orchard-cellar/pull/21)
   before relying on its coordinate catalog. The source archive was subsequently
   deleted at the owner's request; native sheets and the complete extraction remain.
2. Update `packages/tools/src/extract-skill-icons.ts` for selected skill sources,
   preserving existing `icon_skill_*` keys. Its current generic source-crop branch
   hardcodes `source.clockwork_raven`; Kenmi crops must receive the correct tag.
   Orchard Seed Saver currently aliases `icon_skill_seed_saver`, so it needs a
   distinct asset and `iconAsset` mapping in `packages/assets/content/skill-trees.json`.
   Inspect extractor coverage before running it: the crop list does not currently
   contain a separate `orchard_seed_saver` entry.
3. Give the four orchard seed items distinct icon assets and update only their
   `icon.asset` fields in `packages/assets/content/items.json`. Keep item IDs,
   capabilities, drop behavior and economy unchanged.
4. Use exact native palettes and reviewed source regions. Do not overwrite the
   shared equipment-slot sheet, world sprites or the existing tool-action assets.
5. Rebuild/validate reviewed asset fingerprints and atlases; run skill/content
   integrity checks. Inspect the result at native UI size against normal, hovered,
   locked and selected states. This audit preview uses enlarged sprites on a neutral
   background and does not replace in-game visual verification.
6. Item/skill references are authored content consumed by content-art sync; verify
   the content publication path as well as the client asset build when implementing.

## Validation and handoff

- Resolved all 336 item and 66 skill icon asset names against local sprite files.
- Verified every proposed source hash, 16×16 crop, nonempty alpha and vendor-number
  mapping against the intake coordinate index; inspected all 21 candidate mappings visually (wood/stone treatment still requires authoring).
- Recorded all 66 skill nodes above, including keep/defer decisions.
- Verified prototype reachability against other authored content files, not against
  live inventories or historical database rows.
- No runtime tests/build/deployment required for this documentation-only audit.
- Next action: implement the hammer and six shovel tiers first, then the other 13
  first-pass mappings, with the UI and content checks above. The cellar bottle
  remains a separate review candidate. Total: 20 priority targets plus one bottle.
