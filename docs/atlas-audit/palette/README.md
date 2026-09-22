# Exact palette coverage and pavement correction

The screenshot's four Hearth Pavement choices came from the four registered
`base` variants. `buildAssetPalette` already enumerated all static manifest
variants; the source import had omitted the remaining pavement artwork. The
four centres differ in native wear pixels and must remain separate choices.

The existing `tile_cf_hearth_pavement` asset keeps its ID, `base` frame order,
anchor and placement behavior. Its source-complete import now contains 38 exact
choices: four existing centres, four named curb corner quadrants, and 30 other
native source-grid pieces. These are static variants, never animation frames.
Map prefab titles now include their visual group and variant number so similar
thumbnails have distinguishable, searchable names. Persisted prefab IDs and
visual references are unchanged.

Run `npx tsx packages/tools/src/import-pavement-variants.ts` from the repository
root to regenerate the asset and [coverage ledger](pavement-source-coverage.json).
The licensed source is required at the asset's `sourcePath`. Changed sheet
dimensions or changed centre pixels fail explicitly. Build the atlas afterwards
with the normal asset build before inspecting the editor.

## Source reconciliation

The PNG is **144×128**, including its transparent padding: a 9×8 grid of 16px
cells, 72 cells total. Of these, 33 are fully transparent and excluded; 39 contain
art. Every nonempty cell resolves to an exact imported frame. Two native static
pieces have identical RGBA: `(48,0)` and `(16,48)`. They share the first piece's
choice, `source_row_1_column_4`, producing 38 choices. The ledger retains both
source locations and explicitly classifies the latter as a duplicate.

All other source cells are preserved, including thin fragments in the small
ring and the lower ground/stair composition. The top-right aligned ring's four
quadrants have `curb_corner_*` names. Coordinate-labelled `source_row_*_column_*`
pieces preserve source pixels without asserting unverified joining roles. The
smaller ring is off the 16px grid; those source fragments are not advertised as
a complete automatic joining bank. Joining metadata remains a separate audit.

## Duplicate policy and Smart Placement

Only byte-identical, newly imported static source pieces within this one asset
share a choice. Existing base variants and named corner roles do not participate
in that deduplication. Registry asset aliases, states, seasons and animations
remain intact even when their first frames look identical. No existing atlas
asset or saved map is deleted or rewritten.

Smart Placement retains its single `biome-paving` material. It renders the
existing paving centre and shared grass transition behavior; these source curb
pieces do not become invented automatic joins. Exact Placement exposes the
additional native art. The terrain guide records the distinction between grass
fringes and raised curbs.

## Validation

Regression tests preserve the original four source crops, compare every imported
frame and every covered source cell pixel-for-pixel including alpha, check all
72 cells and the sole duplicate mapping, and verify deterministic regeneration.
Palette tests preserve visually matching state/variant/animation groups; map
catalog tests verify distinguishable titles and stable persisted IDs. Full
asset build and browser checks are performed by the coordinating agent.
