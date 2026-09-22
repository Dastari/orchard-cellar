# Atlas inventory audit

Atlas revision: `cee74122708a407f5d63`. Deterministic artifact: [inventory.json](inventory.json).

Complete frame rows are in [frames.jsonl.gz](frames.jsonl.gz), one JSON object per line after gzip decompression. `frameEvidence` records the uncompressed SHA-256 and count. [Duplicate evidence](duplicate-evidence.html) displays every complete-sequence duplicate cohort. [Reviewed findings](findings.md) preserves pre-correction evidence.

Reproduce from the repository root (source corpus is owner-local):

```sh
npx tsx scripts/audit-atlas.ts --source-root /path/to/references
npx vitest run scripts/audit-atlas.test.ts
```

The default source root is `references`; `--source-root` replaces that directory, not `references/art`. Generated atlas files must exist. The script only reads source/atlas inputs and writes this report directory. Missing inputs are recorded and yield a failing exit status. Unsupported source formats are explicit coverage gaps.

## Reconciled coverage

- registryAssets: **1320**
- processedAssets: **1320**
- sourceAssetFiles: **1320**
- metadataAssets: **1320**
- expectedFrames: **27161**
- sourceExpandedFrames: **27161**
- processedFrames: **27161**
- expectedSeasonFrames: **108644**
- processedSeasonFrames: **108644**
- atlasPageSeasons: **164**
- expectedAtlasPageSeasons: **164**
- discoveredSourceFiles: **1233**
- processedSourceFiles: **1233**
- indexedSourceFiles: **1173**
- missingIndexedFiles: **0**
- missingReferencedFiles: **0**
- duplicateGroups: **3296**
- wholeAssetDuplicateGroups: **59**
- emptyFrames: **1221**
- unresolvedSourceCropFrames: **2165**
- errors: **0**

## Findings and priorities

1. Resolve source crop mismatches, invalid bounds and missing files before claiming provenance parity; every failure is preserved in `errors` or `sourceLedger.cropComparisons`.
2. Review exact cross-asset duplicates before changing palette choices. Stable asset IDs must remain. Same declared source crops are provenance aliases, not automatic permission to merge IDs.
3. Fill unimported and partially mapped source sheets; inspect `uncoveredVisiblePixels` and unresolved crops. Sheet-level registration is not complete frame coverage.
4. Review all transparent frames and repeated sequence frames in their animation/state context. Empty pixels do not prove redundant assets.

### Duplicate classifications

- cross-asset-exact-pixels-review: 758 groups
- same-asset-repeated-frame-or-season: 2301 groups
- same-source-crop-alias: 233 groups
- transparent-empty: 4 groups

Complete sequence duplicate groups: 59. Cross-asset candidate groups: 758. Full membership is in the inventory JSON; every frame/season fingerprint is in frames.jsonl.gz.

### Source coverage

- declared-crops-cover-visible-sheet: 350 files
- mapped-sheet-partial-or-unverified: 213 files
- non-image-reference: 105 files
- unimported-source-gap: 552 files
- unsupported-raster-source-gap: 1 files
- unsupported-source-format-gap: 12 files

Each discovered file has a content hash. PNGs additionally have dimensions, exact decoded pixel hash, registered asset links and crop coverage. Non-raster documentation/audio/font files have explicit exclusions. Aseprite and other undecoded formats remain gaps. The stored reference index is reconciled against live discovery; index-only paths appear in `missingIndexed`.

### Cross-asset examples

- action_cf_shirt_farmer_orange, player_cf_shirt_farmer_orange (10 identical frame records)
- horse_cf_bramble_mounted, wildlife_cf_horse_mounted_01 (2 identical frame records)
- prop_cf_join_stone_large_fence, prop_cf_willow_boundary_stone_large_0 (2 identical frame records)
- tile_cf_stone_cliff_2, tile_cf_stone_cliff_3, tile_cf_stone_cliff_4, tile_cf_stone_cliff_variants (4 identical frame records)
- action_cf_pants_farmer_red, player_cf_pants_farmer_red (24 identical frame records)
- action_cf_pants_farmer_green, rider_cf_pants_farmer_green (6 identical frame records)
- wildlife_cf_capybara_01_dive, wildlife_cf_capybara_01_emerge, wildlife_cf_capybara_01_idle, wildlife_cf_capybara_01_look (5 identical frame records)
- horse_cf_bramble_mounted, wildlife_cf_horse_mounted_01 (2 identical frame records)
- tile_cf_shroomlands_cliff, tile_cf_shroomlands_ledge (3 identical frame records)
- wildlife_cf_chicken_02, wildlife_cf_chicken_04, wildlife_cf_chicken_06, wildlife_cf_chicken_08, wildlife_cf_chicken_10, wildlife_cf_chicken_12, wildlife_cf_chicken_14, wildlife_cf_chicken_16, wildlife_cf_chicken_18 (9 identical frame records)
- tile_cf_stone_cliff_2, tile_cf_stone_cliff_3, tile_cf_stone_cliff_4, tile_cf_stone_cliff_variants (4 identical frame records)
- tile_cf_path, tile_path (2 identical frame records)
- enemy_cf_desert_bow_01, enemy_cf_desert_bow_02 (2 identical frame records)
- action_cf_shoes_blue, player_cf_shoes_blue (69 identical frame records)
- tile_cf_dungeon_1_wall, tile_cf_rogue_dungeon_floor (3 identical frame records)
- tile_cf_desert_waterfall_1, tile_cf_desert_waterfall_2, tile_cf_desert_waterfall_3 (3 identical frame records)
- prop_cf_join_wood_small_fence, prop_cf_willow_boundary_wood_8 (2 identical frame records)
- action_cf_shirt_farmer_orange, player_cf_shirt_farmer_orange (23 identical frame records)
- action_cf_shirt_farmer_blue, rider_cf_shirt_farmer_blue (2 identical frame records)
- action_cf_base, rider_cf_base (4 identical frame records)
- nature_cf_grass_03, tile_cf_grass_tuft (2 identical frame records)
- hands_cf_lantern_idle, hands_cf_lantern_running (3 identical frame records)
- action_cf_shoes_black, player_cf_shoes_black (53 identical frame records)
- action_cf_hair_6_brown, player_cf_hair_6_brown (61 identical frame records)
- tile_cf_desert_waterfall_1, tile_cf_desert_waterfall_2, tile_cf_desert_waterfall_3 (3 identical frame records)
- wildlife_cf_goose_01, wildlife_cf_goose_02, wildlife_cf_goose_03, wildlife_cf_goose_04, wildlife_cf_goose_05, wildlife_cf_goose_06 (6 identical frame records)
- action_cf_pants_farmer_blue, rider_cf_pants_farmer_blue (4 identical frame records)
- prop_cf_join_wood_small_fence, prop_cf_willow_boundary_wood_0 (2 identical frame records)
- action_cf_hair_4_ginger, rider_cf_hair_4_ginger (4 identical frame records)
- action_cf_hair_1_brown, player_cf_hair (3 identical frame records)

## Interpretation limits

- Pixel equality is exact, dimension-sensitive RGBA including alpha and hidden RGB. Transparent frames are separately classified. Matching spring alone never collapses seasonal variants.
- Duplicate groups compare all seasons; whole-asset sequence groups also preserve kind, group, frame order and duration. Placement/collision/tag differences still require human semantic review.
- A matching source crop establishes pixel provenance; differing crops may be intentional masks/transforms and are review findings, not automatic bugs. Source regions missing from old imports remain explicitly unresolved.
- Source coverage uses the union of declared crop rectangles over visible pixels. It does not invent a cell size for unknown sheets or claim every semantic tile arrangement is supported.
- This audit covers registered original atlas pages. Shadow-omission derivatives, backdrop composites, audio and runtime recolour combinations are not independent registered tile/object variants.
- All source files are inventoried; unsupported decoding or missing source files is never counted as successfully inspected pixels.

## Errors

None.

Local custom art is also discovered from `art/`. In an isolated worktree with ignored owner-local source files, pass `--custom-root /path/to/canonical/art` alongside `--source-root /path/to/canonical/references`. Paths in the ledger retain their repository-relative provenance.

Exact source-sheet RGBA duplicate groups: **12**. Full paths and hashes are in `sourceDuplicateGroups`; byte hashes remain separate. Source duplicates do not justify deleting licensed provenance records.

## Empty-frame classifications

- empty-frame-unresolved-provenance: 19
- reviewed-transparent-overlay-centre: 3
- source-empty-animation-component-slot: 64
- source-empty-grid-slot: 1135

A source-empty grid slot is demonstrably empty native padding, but whether it should remain a selectable variant still needs semantic review. Source-empty animation component slots preserve authored timing; this does not assert that every animation is visually correct. Unresolved empties are never described as intentional.
