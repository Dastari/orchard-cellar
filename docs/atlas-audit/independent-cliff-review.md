# Independent terrain visual review

Reviewer: ScarletOwl. Date: 2026-09-22. Baseline: merged PR #61, before the cliff correction branch. This review is independent of the implementation agent. It compares native source sheets, registered frame contact sheets, all 14 available cliff formation strips and all seven flat formation strips with the user's reference scenes. It does not certify unsupported source art or alter live maps.

## Pass 1: defects observed

| Family | Observed defect / disposition |
| --- | --- |
| basic | The diagonal pinches where opposing inset blocks occupy one cell. Rectangular flat rim is visually continuous; no authored tall face exists. |
| stone_1 | Continuous matching grass fill in the baseline, but diagonal still overlaps insets. |
| stone_2 | Grass 1 is used under the brighter Grass 2 rim, making a darker rectangular centre; diagonal overlaps. |
| stone_3 | Green Grass 1 centre and surrounding fill conflict with the olive Grass 3 rim/foot; diagonal overlaps. |
| stone_4 | Green Grass 1 centre conflicts with teal Grass 4 rim/foot; diagonal overlaps. |
| desert_1 | Green backdrop and transparent centre; disconnected face and foot courses. South edge incorrectly names the terminal lip/foot bank. |
| desert_2 | Same assembly defects as desert_1, with a distinct native desert palette that also needs a matched fill. |
| desert_3 | Same assembly defects as desert_1, with a distinct native desert palette that also needs a matched fill. |
| cave | Baseline cave colour is plausible. The generic raised-island examples do not demonstrate excavation, wall clearance, room passage joins or full projected gameplay geometry. Diagonal has unsupported paired inset demand. |
| shroomlands | Green centre/backdrop, detached faces, and the south edge is actually a shadow-only row. No primary inset bank is registered. The source has a separate compact ledge bank that must not be confused with primary wall height. |
| volcanic | Green centre/backdrop; terminal column feet reused as south rim, then repeated as the foot course. This produces disconnected/duplicated columns. |
| volcanic_interior | Cave-brown floor conflicts with volcanic rock; the formation strip has visibly discontinuous/alternating pillar courses. Full projected inverse-room geometry needs validation, not an outdoor island fixture alone. |
| dungeon_1 | Cave-brown floor is unrelated to the masonry set. Generic solid-island strip does not show room/corridor clearance. Opposing insets also appear in diagonal. |
| dungeon_2 | Same background and incomplete interior validation as dungeon_1. Source masonry lower contact strips are distinct and must be preserved rather than applying an indiscriminate common row pattern. |

The fifteenth family, snow, is reserved/unavailable. A snow floor is not evidence of a native snow cliff sheet.

## Concrete source evidence

- `scripts/render-terrain-catalogue.ts` fills every non-interior cell with `tile_cf_grass_1_middle`, then draws raw logical face/edge/inset plans without the engine's contour projection. This causes both mismatched opaque centres and invalid-looking spacing. All interiors receive `tile_cf_cave_floor_middle`, regardless of family.
- `packages/sim/src/terrain-tilesets.ts` maps desert south edges to frames 79–81, also used as feet. In the 13-column native desert sheet these are row 6, columns 1–3: compact lip pieces. They are not the first full rock face (row 3, columns 1–3 = 40–42). Desert source frames 30–31 are inverse arch corners, not a substitute straight south crest. The native source does not follow the stone grass-topped row contract.
- Shroomlands source has rim row 0, side/fill row 1, crest/upper rock row 2, continuing rock row 3, lower rock row 4, and shadow-only row 5. Frames 45–47 are row 5 and cannot stand for the south crest. Native fill is gray (for example frame 39), with separate tan path and coloured grass banks.
- Volcanic registered frames are an extracted three-column bank, not offsets into the full wide source sheet. Frames 3–5 include sides and cracked centre; 6–14 are vertical columns and terminal feet. Reusing 12–14 as both rim and foot duplicates a physical course. The native cracked surface must fill the plateau.
- Independent inspection with the mapping agent found a second volcanic defect: `tile_cf_volcanic_interior_wall` base frames 0–14 are cropped from source columns 22–24, rows 0–4: the staircase bank. Its middle frames 1, 4, 7 and 13 are visibly stair treads. The inverse cracked rim at source columns 1–3, rows 6–8 and the outdoor column faces are native alternatives, but a complete inverse tall-room assembly needs validation before being labelled supported.
- `raisedTerrainInsetRolesAt` intentionally enumerates every qualifying inset independently. That is a runtime representation of historical data, not proof that every authored bank can overlap. Local Smart Placement needs to alter the new patch so paired opposing insets do not share one cell. Exact placement and old maps remain valid data.

## Flat joining families

| Family | Baseline visual finding |
| --- | --- |
| beach | The six formation silhouettes are continuous; this alone does not establish every raw mask as valid authored geometry. |
| freshwater-river | The diagonal is a pinched chain caused by opposing inset overlays. Other examples demonstrate the existing bank but remain very narrow at the minimum. |
| desert-shore | Native cyan shore/water edge surrounds an unrelated blue water centre, creating a hard square cyan band. `oasis_water` is incorrectly displayed using the ocean base in the guide. |
| desert-grass | Matching olive ground is present, but the diagonal pinches from opposing inset overlays. |
| grass-sand | Rectangles/concave shapes join visually; diagonal must still obey the local one-inset constraint, not be accepted just because its fringe looks continuous at this scale. |
| paving-grass | The example shows grass fringe against paving, not native stone kerbs. Paving kerb/ring/stair art remains a separate role gap. |
| savanna-grass | Ground colours are appropriate; visual continuity alone does not replace local diagonal inset validation. |

## Missing evidence and rules to retain explicitly

1. Native multi-material examples: desert cliff/desert floor/oasis water; shroomland cliff/gray floor/coloured ground/tan path; volcanic cliff/cracked floor/lava. A family-coloured backdrop is necessary but is not a substitute for showing the actual joins.
2. Repeated-height face courses, ramps, wall-foot contact and waterfall interfaces must be assembled, not just listed as individual roles. Source role enumeration alone previously let wrong course assignments pass.
3. Interior families need room and corridor examples using the real inverse/projection contract. An arbitrary black fill inside a ring is not native floor evidence.
4. All rotations/reflections of a diagonal must be checked for more than one inset at the same coordinate. The test should check resolved roles and affected cell bounds, not only image hashes.
5. The visual guide must distinguish corrected Smart Placement from preserved unsupported raw masks. It must not describe every raw resolver result as a supported arrangement.
6. No whole-map repair is required or authorised. Checks and assistance are local to edited cells and immediate neighbours.
7. Grass 1–4 ledges, grass family-to-family borders, dry/wet farmland and cave-floor material masks also need assembled multi-cell scenes. The baseline supplies mask grids for these, which show individual resolver choices but cannot expose seams between neighbours. This review does not certify unassembled masks as valid whole patches.

## Follow-up review

Pending regenerated corrected output. Pass 1 findings above describe the baseline and remain as the review trail; a later pass must identify which findings were fixed and which remain unsupported.

## Pass 2: corrected output review

Reviewed regenerated outdoor strips and all seven flat strips after the first mapping/preview correction. Stone 1–4 now have continuous matching plateau fill. Their widened diagonal has no visible paired-inset pinch. All seven flat strips now have continuous silhouettes; the oasis cyan/blue mismatch is fixed. Volcanic's outdoor column courses are now continuous. These observations certify the displayed examples, not every possible raw mask or arbitrary authored geometry.

Two defects still block approval of the displayed outdoor set:

- **Desert:** frames 79–81 are the top of a separate compact ledge bank, not a tall-cliff foot. The first tall bank ends at frames 66–68. The rendered examples show an isolated arc separated by a blank strip below the rock face. Remove this unrelated terminal course; preserve the true lower wall.
- **Shroomlands:** rectangles now have continuous rim/rock/shadow, but diagonal, T and cross have open contour gaps because primary inset roles still resolve to no frame. Merely preventing multiple insets leaves a single missing inset unsupported. Source columns 3–4, rows 0–1 (frames 3, 4, 12, 13) contain an inverse arch bank and need separate role/height verification; the compact ledge bank and tan path artwork are not interchangeable with it.

Interior assembled previews are now explicitly withheld because verified opaque rock fill/full-room assembly is missing, and volcanic interior still points at the known unverified import. This removes a false visual claim but does not complete the missing interior system.

Still missing: native multi-material scenes matching the user's desert/oasis and shroomland/path references, plus assembled grass-family borders, soil states, ramps and waterfall interfaces. Family-coloured backgrounds alone do not prove the interaction rules.

The source ledger gives a concrete shroomland gap: all six `ShroomLands_Grass_{Blue,Green,Purple}_Tiles.png` and `ShroomLands_Tall_Grass_{Blue,Green,Purple}_Tiles.png` sheets have no reviewed asset registrations. The gray floor and tan path are present within the full cliff source sheet, but are not dedicated semantic surface families. The user's colourful shroomland scene therefore contains genuine missing palette/joining support, not just a preview background error.

## Pass 3: final displayed-family review

All ten outdoor and seven flat formation strips were visually reopened after removal of the desert pseudo-foot and addition of the native shroomland inverse bank. The scope of a pass below is the six displayed formations: minimum, rectangle, concave, locally widened diagonal, T and cross. It is not an assertion that all 256 raw masks, every mixed material junction, or deployed live content is correct.

| Family | Final displayed-example result |
| --- | --- |
| basic | Pass: continuous flat rim and widened diagonal; still correctly has no invented tall face. |
| stone_1 | Pass: matching Grass 1 fill; continuous edges, faces and diagonal. |
| stone_2 | Pass: matching Grass 2 fill removes dark centre; continuous edges/faces. |
| stone_3 | Pass: matching olive Grass 3 fill and foot surroundings. |
| stone_4 | Pass: matching teal Grass 4 fill and foot surroundings. |
| desert_1 | Pass: native desert cap/base, continuous rock, unrelated detached lip removed. |
| desert_2 | Pass: same corrected course contract with its native warmer palette. |
| desert_3 | Pass: same corrected course contract with its native muted palette. |
| shroomlands | Pass: gray cap/base, connected rock/shadow; native inverse frames 3, 4, 12, 13 now close diagonal/T/cross gaps. |
| volcanic | Pass: native cracked fill and continuous structural column courses. |
| beach | Pass: continuous shoreline across the six shown silhouettes. |
| desert-shore | Pass: cyan oasis fill now matches the shore; no blue square centre. |
| freshwater-river | Pass: repaired diagonal no longer forms a pinched chain. |
| desert-grass | Pass: repaired diagonal and native olive/sand boundary are continuous. |
| grass-sand | Pass: continuous six-shape fringe examples. |
| paving-grass | Pass: continuous grass-fringe examples; this does not certify missing native pavement kerb rules. |
| savanna-grass | Pass: continuous six-shape palette-matched examples. |
| cave, volcanic_interior, dungeon_1, dungeon_2 | Withheld: guide explicitly identifies missing verified room/rock-fill assembly instead of presenting invented examples as supported. Volcanic interior's staircase import remains an identified source defect. |
| snow | Reserved: no authored cliff sheet is registered. |

The mapping correction and the renderer/Studio update are separate from publishing live content. `bootstrapTilesetDefinitions` derives role data from the source registry, but a live content registry may retain older server-supplied role definitions until the applicable content release runs. This review does not claim that a static Studio deployment alone updates those server rows or repairs saved maps. Verify the actual live content definitions before claiming runtime parity.

The local-assistance code review also found and prompted fixes for surface-family-blind grouping, ambiguous inverse material donors and final biome writes beyond the original one-cell halo. The revised code includes surface family in material identity, rejects ambiguous donor material sets with explicit Studio feedback, and clips final updates to the original halo. Runtime rendering and historical invalid terrain are not globally normalised.

Remaining source/import/assembly gaps listed above are retained deliberately. No live map mutation, content publication or service deployment was performed by this reviewer.
