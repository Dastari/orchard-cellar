# Reviewed atlas inventory findings

The first full pass used atlas revision `d6c8a7e96f495c54aa45`: 1,320 assets,
27,062 frame records, 108,248 seasonal crops and 164 atlas page/season images.
These counts reconciled. The generated inventory/README reflect the latest rerun;
this file preserves the evidence that prompted corrective work.

## P1: two wholly transparent static imports

These were the **only two wholly empty assets**. They are defective or unresolved
imports, not evidence that desert grass and interior walls are interchangeable.
Neither declares an intentional hidden/inactive state.

- `packages/assets/tiles/tile_cf_interior_wall.tile.json` declared
  `sourceRegions.base[0] = [48, 0, 16, 16]`. The extractor in
  `packages/tools/src/extract-cute-fantasy-nature.ts` explicitly selected that
  rectangle. It is an entirely transparent gutter in
  `references/art/kenmi/cute-fantasy/core/Buildings/Houses_Interiors/Interior_Walls.png`
  (224 × 96). Fully painted wall cells occupy every 16 px column in rows beginning
  at y=48, 64 and 80. Native alternatives include plaster `[0,48,16,16]` and brick
  `[48,48,16,16]`; retain material semantics when assigning states/variants.
- `packages/assets/tiles/tile_cf_desert_grass.tile.json` contained one all-dot
  16 × 16 frame and an empty source palette. It linked
  `references/art/kenmi/cute-fantasy/desert/Tiles/Desert_Grass.png` (48 × 80), but
  recorded no source region. The ring centre `[16,16,16,16]` is empty; selecting
  that cell is a plausible historical cause, **not proven provenance**. The
  native sheet has 13 painted 16 px cells, including a fully opaque centre at
  `[32,48,16,16]`. The upper ring has painted edges/corners surrounding its hole.

The parent integration owns correction of these imports and the extractor,
preserving stable IDs. After correction, check the latest `emptyFrames`, each
asset’s `frames` references and the frame evidence to verify the static defects
are gone. Do not rewrite saved maps during this correction.

**Correction verified:** atlas revision `cee74122708a407f5d63` has 13 desert grass
frames and 54 interior wall frames, with no wholly empty asset remaining. The
paving correction has 38 authored frames. Registry/source/metadata counts now
reconcile at 27,161 frames and 108,644 seasonal crops with zero audit errors. Stable
asset IDs remain. The original evidence above is retained to explain the fixes.

## P2: duplicates require semantic classification

Confirmed identical complete pixel sequences include the grass centre aliases
(`tile_cf_grass` / `tile_cf_grass_1_middle`, meadow / grass_2_middle, highland /
grass_3_middle, hillside / grass_4_middle), `tile_cf_path` / `tile_path`,
`prop_cf_trapdoor` / `tile_cf_cave_floor_ladder`, and
`prop_cf_willow_waterfall` / `tile_cf_waterfall_flow`.

Matching pixels do not imply matching placement layers, collision, tags, animation
timing or saved-map semantics. The report separates same-source crop aliases,
same-asset repetitions, transparent frames, cross-asset review candidates, and
complete ordered sequences. Stable IDs must survive any palette consolidation.

## P2: source coverage gaps are real work

Most sheets are not fully covered by declared source rectangles. A provenance link
alone cannot prove all authored variants were imported. The source ledger records
every discovered file, partial/missing import coverage, unpainted gutters, unknown
crop origins and unsupported formats. Source transparency can retain hidden RGB:
strict RGBA mismatch is separated from a visible mismatch so normalized transparent
RGB is not misreported as a changed painted pixel.

The first pass found 1,223 empty frame records (1,141 variants, 80 animation frames,
two states). Current per-frame classifications distinguish empty native grid cells,
empty animation component slots, unresolved provenance and static defects. Only
exact source evidence justifies a padding/component-slot classification; the audit
does not claim inferred intent for unmapped empty frames.

The corrected build has 1,221 remaining empty frames: 1,135 verified native grid
slots, 64 verified empty animation component slots, three reviewed transparent
blob47 overlay centres, and 19 unresolved partial frames. The unresolved frames
are 16 `rider_cf_hands` mount frames, `tile_cf_desert_grass_edge` base variant 4,
and `tile_cf_freshwater` base variants 11/14. None makes its entire asset empty.
The grass/path fringe extractor explains why the fully surrounded overlay centre
has no edge to paint; it is not a missing base ground texture.

Final source accounting covers 1,233 files, with no missing indexed files or
missing registered source paths. There are 12 exact source-sheet pixel duplicate
groups. The 234 visibly different declared source crops remain explicit review
findings (including authored masks, recolours, scaled or composite art); another
112 strict differences affect only RGB under zero alpha. The audit never treats
these 346 strict mismatches as 346 unexplained visual defects.
