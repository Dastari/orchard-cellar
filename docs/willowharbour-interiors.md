# Willowharbour interiors

The town's ten authored buildings have independent, furnished indoor spaces.
The reference `references/town-reference/4FeNv9.png` guides the domestic plans:
connected kitchen/dining, sitting, sleeping and washing rooms; furniture groups
against the room edges; and contrasting floor finishes that explain room use.
Native sprites keep their original pixel scale. Buildings can be larger inside,
while the smaller cottages retain less floor area than the inn and the
conservatory keeps its broad, shallow plan.

| Building / space ID | Interior plan |
| --- | --- |
| The Willow Lantern / 65520 | Public dining hall, central kitchen/reception and two furnished guest suites with beds, bedside furniture and storage. |
| Harbour Provisions / 65521 | Shop counter, paired cupboard/cabinet aisles, rear stock chests and barrels, and a clear south vestibule. |
| Alder Workshop / 65522 | Front display/reception, stone working bay with two workbenches, and a furnished south drafting/seating area. |
| Thread and Timber / 65523 | Four linked showroom bays demonstrating bedroom, dining, sitting and washing furniture, including the supported dining-table lamp. |
| Ember and Iron / 65524 | Front sales and stock rooms, separated rear forge/workbench floor, anvils and grouped storage. |
| Wayfarers Archive / 65525 | Central reception/circulation spine, two library bays and two furnished reading rooms. |
| Foxglove Cottage / 65526 | Four distinct sitting, bathing, kitchen/dining and bedroom/study rooms connected by a central hall and cross-passages. |
| Applewood Cottage / 65527 | Shared north kitchen/dining/sitting room, twin sleeping room, south washing/storage room and a linked hall. |
| Orchard Grange / 65528 | Broad central work aisle and back gallery with four hay, provisions and work/storage bays. |
| Glassleaf Conservatory / 65529 | Potting and washing stations, four mixed planting beds, stone central/cross aisles and south seating/storage. |

## Content and travel

`packages/assets/content/spaces.json` owns geometry, native furniture references,
floor regions and portal pairs. `hearthInterior` retains the compact room and
furniture format. The four added kind codes are `h` (garden cottage), `o`
(orchard cottage), `b` (barn), and `p` (greenhouse). Coordinates are base36 digits;
rooms encode inclusive left/top/right/bottom rectangles.

All spaces preserve the shared arrival at `(16,24)` and exit at `(16,25)`.
Existing service NPC locations are unchanged. Each building owns an authored
entry/exit portal pair; the generic content portal installer and client prompt
resolver consume these definitions. Returns land one tile south of the external
door. The four new buildings are furnished public interiors, not additional
shops; their outdoor residents retain their existing positions and dialogue.

`hearthInteriorFloors` consists of `{bounds:[left,top,right,bottom],style}` regions.
Absent regions use rustic wood. Supported overrides are `townhouse`, `stone`,
and `soil`; later regions can overlay broader regions, for example the greenhouse
beds. `terrainForSpace` expands them into `hearthInteriorFloorStyles` bytes
(0 wood, 1 parquet, 2 stone, 3 planting soil). Only carved floor cells are painted.
The materials do not alter collision.

Furniture is resolved through active content by native sprite-art fingerprint.
When distinct assets share the compact fingerprint, an existing explicit
presentation suffix such as `!barrel` selects the exact native asset suffix.
Duplicated definitions for that same native art still fail closed. Fixed barrels
use the `container.barrel` capability and the existing barrel renderer; this does
not add mutable player storage rows to decorative interiors.

## Verification

The interior suites test player-body traversal from arrival to the exit and
service frontage, a continuous central route, access to every carved room,
three-course wall clearance, furniture footprints, supported tabletop objects,
and matching client/authority collision. Additional checks cover all ten
bidirectional portal pairs, client entry/exit labels, material validation and
wall exclusion, domestic furniture roles, and compact-art collision handling.

Render all ten rooms using the actual terrain, depth and furniture painters:

```sh
npx tsx packages/tools/src/render-hearth-study.ts --interiors output/west-town-interiors-final.png
```

The study canvas expands to four rows to include all ten rooms. A separate Astra
visual comparison of the reference and draft led to the denser shop aisles,
archive partitions, grouped barn stock, inn bedroom suites and greenhouse beds.
The final smith fixtures are set down on the workshop floor below the partition.
