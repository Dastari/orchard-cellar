# Live map overlap audit — 2026-09-22

The supplied public snapshot of **live-island revision 9**, content hash
`64571628`, contains one exact authored hedge duplicate at **(127, 400)**.
The 35 streetlamp/world-row overlaps are intentional materialization, with one
active gameplay rendering path. A separate memorial at **(390, 371)** has a
source-derived duplicate-draw risk because both its legacy landmark and persistent
placeable retain a sprite path.

[Machine-readable findings and every overlap coordinate](live-map.json)

## Scope and reconciliation

| Checked | Count |
| --- | ---: |
| Map objects, all enabled | 2,125 |
| Prefabs | 209 |
| Landmarks, all enabled | 184 |
| Legacy scenery entries | 0 |
| Supplied public placeable rows | 45 |
| Authored streetlamp plans / matching persistent rows | 35 / 35 |
| Missing streetlamp rows / orphan streetlamp rows | 0 / 0 |
| Exact authored-object duplicate groups | 1 |
| Exact authored visual-placement duplicate groups | 1 |
| Shared object anchor coordinates | 15 |
| Same-layer occupied-cell overlap coordinates | 8 |
| Intersecting solid collision-mask coordinates | 2 |
| Duplicate landmark groups / object–landmark shared anchors | 0 / 0 |
| Persistent placeable rows sharing an anchor with another row | 0 |

The snapshot is 832×832 tiles. Its exact authored duplicate is two enabled
`prop_cf_join_hedge` objects at `(127,400)`, elevation 0, layer `objects`, same
prefab revision, visual, state, rotation, flip and scale. The renderer iterates
both objects without coordinate deduplication, so the source path queues two
sprites when this position is visible. Identical opaque pixels can hide the
second draw while transparent pixels/shadows can compound. No object was removed.

Fourteen of the fifteen shared-anchor groups combine a ground detail (bank or
cobble) with an object (flowers, stall, barrel, fern or fountain) on another
layer. These are consistent with intended composition, not exact duplicates.
Their coordinates and assets are retained in the JSON.

## Why streetlamps are not doubled

[mapStreetlampPlans](../../packages/sim/src/streetlamp.ts) derives one persistent
identity per authored lamp coordinate and rejects duplicate lamp positions.
[settleTownStreetlamps](../../packages/world/src/index.ts) inserts missing rows
and updates existing state, preserving manual mode. All 35 plans match exactly
one supplied `hearth_streetlamp` row; no lamp plan or row is unmatched.

[Gameplay setup](../../packages/client/src/gameplay-painter-setup.ts) passes
`materializedStreetlamps: true` to
[enqueueLiveMapObjects](../../packages/engine/src/live-map-runtime.ts), which
skips the map lamp sprite. [Gameplay decoration lighting](../../packages/client/src/gameplay-painter-decorations.ts)
passes the same flag to `liveMapObjectPointLights`, suppressing the map lamp light.
The persistent row supplies its sprite through
[the placeable painter](../../packages/client/src/gameplay-painter-placeables.ts)
and its light through the placeable-light loop. Editor/offline previews retain
the map lamp path. The two records serve authoring and persistent interaction.

## Other overlaps requiring different interpretations

| Coordinate(s) | Evidence | Interpretation |
| --- | --- | --- |
| `(127,400)` | Identical hedge objects; same solid cell | Exact authored duplicate; source queues both. |
| `(145,404)` | Streetlamp anchor overlaps carpenter footprint anchored at `(149,404)`; intersecting solid masks | Different objects sharing part of a footprint. Placement-review candidate, not a duplicate lamp record. |
| `(191,406)`, `(192,406)`, `(193,406)`, `(200,406)`, `(201,406)`, `(202,406)` | Two-cell legacy white-fence footprints touch the next fence/picket anchor | Legacy authored-footprint overlaps, not same-anchor duplicates. Connected art may be one-cell; this report does not rewrite geometry. |
| `(336,356)`, `(403,319)` | `camp_campfire` landmark plus persistent campfire | Intentional materialization: matching registry plan and coordinate suppress legacy campfire drawing. |
| `(390,371)` | `farm_grave` landmark plus `farmer_jane_memorial` persistent row | Source-derived duplicate-draw candidate: both use `prop_farmer_jane_grave`; no matching suppression was found. |

For the memorial, [topsideDecorations](../../packages/client/src/overworld-main.ts)
includes enabled map landmarks. The legacy decoration painter suppresses matching
campfires and resources, but the memorial is neither. Its map landmark has no
matching `generatedSuppressions` entry. The
[legacy asset binding](../../packages/engine/src/legacy-landmark-assets.ts) and
[object definition](../../packages/assets/content/objects.json) both reference
`prop_farmer_jane_grave`; the placeable painter also draws that authored object.
This is a code-and-snapshot finding, not captured live-frame instrumentation.

## Method and limitations

The parent session fetched the public map document and placeable coordinate/type
columns into `/tmp/atlas-live-map-audit-input.json`; this report retains no account
fields and **no world row IDs**. Some U64 values in that supplied browser-decoded
JSON had lost precision, so no identity conclusion depends on those values.
Coordinates, string definitions and map metadata remain exact.

The audit grouped enabled objects by prefab/revision/position/elevation/layer/
transform/state, expanded their visual placements, and grouped anchors. Every
object in this snapshot has identity transform, so expanded placement coordinates
are exactly object position plus placement offset minus prefab pivot. It used
`mapObjectOccupiedCells` for same-layer/elevation occupied cells and
`mapObjectCollisionCells` for solid cells; solid overlaps require intersecting
16-bit collision masks. Landmark duplicates and object/landmark anchors were
checked separately. The published JSON retains every matching candidate.

Existing streetlamp and map-light regression suites passed: **3 files, 9 tests**
(`packages/sim/src/streetlamp.test.ts`, `packages/world/src/streetlamp.test.ts`,
`packages/engine/src/live-map-lights.test.ts`). Streetlamp plan evaluation against
the supplied document produced exactly 35 unique positions.

This snapshot does not enumerate every procedurally generated decoration,
resource or player-world entity. Source review does not verify the exact deployed
client bundle or capture every live draw. Occupancy overlap alone does not establish
a visual defect. No world/map/runtime changes, geometry enforcement, cleanup or
publication were performed by this audit.
