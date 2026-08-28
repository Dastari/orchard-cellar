# 41 — Tent Interior and Cellar Asset Catalogue

Date: **2026-08-26**. Status: **Phase 2 vertical slice in progress**. This document
implements doc 40 §8.2 and does not supersede the sanctuary/zoned-world direction.

## Reference-one: compact wooden home

| Visible feature | Licensed source match | Vertical-slice use |
|---|---|---|
| horizontal plank floor | `Buildings/Houses_Interiors/Wood_Floor_Tiles.png` | `tile_cf_wood_floor` |
| timber/brick/stone room boundaries and corner fillers | `Buildings/Houses_Interiors/Interior_Walls.png`, `Wood_Wall_Fillers.png` | timber boundary extraction |
| centered south door | `Buildings/House_Decor/Doors.png` | residence return portal marker |
| bed | `Buildings/House_Decor/Beds.png` | north-west furnishing |
| bookcase and wall shelving | `Buildings/House_Decor/BookShelves.png` | north-east furnishing |
| long table, desk and work surface | `Buildings/House_Decor/Tables.png` | existing workbench extraction; fuller variants later |
| stools and chairs | `Buildings/House_Decor/Chairs.png` | catalogued for furnishing phase |
| chest and storage | `Buildings/House_Decor/Chest_Anim.png`, `Furniture_Other.png` | existing chest plus later cupboards |
| furnaces/ovens and kitchen pieces | `Buildings/House_Decor/Furnaces.png`, `Kitchen.png`, `Kitchen_Furniture.png` | later placeable stations |
| candles, clocks, plants, carpets, lamps | `Indoor_Decor.png`, `Clocks.png`, `House_Plants.png`, `Carpets.png`, `Standing_Lamps.png` | later decorative furnishing pass |
| tent-shaped interior shell | `Buildings/Buildings/Tent/Tent_Interior.png` | catalogued; current technology demo deliberately uses a rectangular wood room |
| trapdoor / floor ladder | `Tiles/Cave/Cave_Floor_Ladder.png` | residence-to-cellar portal marker |

## Reference-two: generated underground space

| Visible feature | Licensed source match | Vertical-slice use |
|---|---|---|
| irregular excavated earth | `Tiles/Cave/Cave_Floor_1.png`, `Cave_Floor_2.png`, `Cave_Floor_Middle.png` | deterministic floor variants |
| rounded rock boundary | `Tiles/Cave/Cave_Walls.png` | north-facing boundary extraction |
| timber-supported openings | `Tiles/Cave/Cave_Support_1.png`, `Cave_Support_2.png`, `Cave_Wall_Support.png` | large support markers |
| ladder shaft / ladder up | `Other/Ladder.png`, `Tiles/Cave/Cave_Floor_Ladder.png` | cellar return marker |
| rails, corners and intersections | `Tiles/Cave/Rails.png` | catalogued for the rail-layout pass |
| minecart | `Outdoor decoration/Minecrats.png` | catalogued for the rail-layout pass |
| blue/green/orange crystals and ore | `Outdoor decoration/Cave_Decorations.png`, cave rock animations | catalogued for resource-node pass |
| loose stones, cracked earth and stalagmites | `Cave_Floor_Decoration.png`, `Cave_Decorations.png` | initial rocks; fuller decal scatter later |
| pool and rock-edged water | `Tiles/Cave/Cave_Water.png`, `Cave_Water_Animation.png` | catalogued for generated water chambers |
| small cave creatures | no direct static terrain tile; wildlife sheets require a later behavior review | intentionally deferred |

## Implemented structural contract

Each Homestead owns three coordinate spaces in one SpaceTimeDB database: exterior,
residence, and cellar. The residence is a 16×16 black-matte space with a bounded
10×10 wooden room. Its south door returns to the exterior; its trapdoor enters a
deterministic 1024×1024-tile cellar assembled from overlapping excavated chambers centred in solid rock. The cellar
ladder returns to the trapdoor. All four transitions are authoritative portal rows,
and child spaces inherit the Homestead access record.

The first pass proves zoning, collision, camera matte, portal routing, persistence,
and source-art rendering. It intentionally defers furniture placement authority,
rails, minecart motion, water chambers, resource depletion and hostile creatures.

## Cave autotile grammar correction (2026-08-28)

The first render incorrectly interpreted transparent decoration cells from
`Cave_Floor_1.png` as interchangeable ground. The reviewed grammar is now:

- `Cave_Floor_Middle.png` is the plain hollow cave floor matching the wall inset;
- `Cave_Floor_1.png` is an autotile grammar, not random floor variants: its lower
  3×3 cells transition plain floor into dense rocky floor, while its upper 2×2
  cells supply diagonal inset transitions;
- `Cave_Walls.png` contains a dark-backed 3×3 excavation ring, two 2×2 corner
  groups, and a 3×2 front-wall group. These are now mapped onto the same
  `edgeFrames`, `insetFrames`, and `faceProfiles` contract as Stone Cliff 1;
- multi-tile supports, tall mine faces and doorways elsewhere in the sheet are
  structures placed only by explicit topology rules, never random wall variants.

The exact reviewed cave contour mapping is:

| contour role | Cave_Walls frame |
|---|---:|
| top-left / top / top-right | 25 / 19 / 26 |
| left / right | 13 / 11 |
| bottom-left / bottom / bottom-right | 32 / 5 / 33 |
| inner top-left / top-right | 20 / 18 |
| inner bottom-left / bottom-right | 6 / 4 |
| upper face left / middle / right | 42 / 43 / 44 |
| lower face left / middle / right | 49 / 50 / 51 |

The cellar generator now emits a 1024×1024 binary excavation grid. Collision treats
`dug=1` as walkable and all other cells as solid. Presentation fills every dug cell
with the plain middle tile, derives rocky edge/corner transitions from the same
eight-neighbour mask used by path blending, and interprets solid rock as elevation
one. The ground cache now supplies only open-floor or solid-rock substrate; it no
longer bakes a competing 3×3 wall ring. The shared raised-terrain resolver derives
all cap stones, convex and concave corners, narrow side profiles, and two-course
front-facing walls from that elevation boundary. The two projected face courses are
the walk-behind depth of this one logical elevation change; they are not two cellar
levels. Long back
wall runs may receive the complete 5×2 `Cave_Wall_Support.png` overlay; partial
support fragments are never scattered as terrain. Untouched rock and the viewport
outside the finite generation array repeat the darkened underground rock tile. The
starter excavation occupies the central portion of that field; no contour is emitted
at the outer map edge, so zooming out cannot reveal a false rectangular perimeter wall.

Rooms and corridors can therefore be added or removed solely by changing the
excavation grid. Floors, projected walls, supports, visible bounds and authoritative
blocking update from that one mask, preserving the Dungeon Keeper-style hollowing
model without coupling collision to sprite pixels.
