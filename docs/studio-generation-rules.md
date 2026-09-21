# Studio and game generation rules

Studio 0.9.0 / shared packages 0.16.0, 2026-09-21.

The map stores material, biome, height, family and explicit author overrides.
Derived art is resolved from neighbors by the simulation/compiler and shared game
renderer. Publication remains an explicit, revision-checked action. The UI's
**Auto surround** switch controls the minimum height footprint and object joining;
it never publishes a map. Exact terrain role overrides remain in the selection
inspector. Turning the switch off does not globally disable the game's terrain
compositor or collision rules.

## Terrain contract

- Paint changes surface, feature, collision defaults and biome in one undo entry.
  Explicit Plains overrides survive serialization over generated island terrain.
- Height is a signed logical level, not a sprite offset. At level N, Raise authors
  N+1 and Lower authors N-1. Only cells on the selected plane change; repeated
  strokes and neighboring higher/lower terrain are preserved. Auto surround uses
  the existing minimum 2×2 brush planner, constrained to that plane and map bounds. It tries neighboring 2×2 anchors and refuses an unsupported isolated contour with visible feedback.
- Terrain painting authors the selected level. Flood fill stays within a connected
  component with equal height, surface family, feature, surface and biome. It
  yields in bounded batches and cancels on tool/document changes or disposal.
- Surface boundaries resolve cardinal edges and diagonal insets. Water uses the
  existing shoreline/river banks. Grass palettes use their native matching fringe
  sheets; family seams use a stable family ordering and never cross height planes.
  Flat fringes use complete 16×16 frames: N/E/S/W = 1/18/33/16; adjacent NW/NE/SW/SE
  = 0/2/32/34; diagonal-only NW/NE/SW/SE = 65/64/49/48. Opposite or three/four
  cardinal neighbors use the separate opaque middle asset. Sheet frame 17 is
  transparent. These flat corners are distinct from raised ledge insets.
- Raised contours use the registered cap, face course, foot, inset, ledge and ramp
  roles. Each contour is resolved independently; the map-wide datum/projection
  remains consistent. Per-cell cave/dungeon/volcanic floor choices retain their
  substrate through compilation instead of reverting to grass.
- Gameplay collision still comes from the semantic terrain and prefab masks.
  Changing a visual does not grant a player permission to bypass placement rules.

| Palette material | Semantic recipe / shared rendering |
| --- | --- |
| Grass 1–4 | Plains + matching surface and stone cliff family; matching grass fringe |
| Dirt / Path | Dirt terrace substrate; Path adds the path feature |
| Farmland | Dry visual farmland only; soil moisture/crops remain runtime state |
| Beach | Sand + beach shoreline and water-facing insets |
| Ocean | Water biome, ocean boundary and wave rules |
| Fresh water | Water surface + river feature, freshwater banks/insets |
| Meadow / Highland | Grass 2 / Grass 3 fill respectively |
| Forest / Valley / Ridge | Vegetated semantic biome; registered cliff topology |
| Desert / Desert ridge / Desert shore | Sand with desert cliff/shoreline roles |
| Oasis / Savanna | Desert grass substrate and its native edge/inset banks |
| Oasis water / Waterfall | Water surface + river feature; biome-specific water presentation |
| Coastal cliff | Sand substrate beneath transparent coastal rock faces |
| Dirt ridge | Dirt substrate and dirt ridge/terrace contour rules |
| Volcanic ash | Volcanic floor and registered volcanic cliff family |
| Lava | Hazardous, blocked volcanic material with authored lava variation |
| Paving | Stone substrate, pavement repeat and neighboring grass fringes |
| Cave / Dungeon 1–2 / Volcanic interior | Interior floor artwork and matching wall family |

## Cliff family audit

`packages/sim/src/terrain-tilesets.ts` and the live tileset registry are authoritative.
The compiler consumes runtime definitions, so new registered families need no
second editor-only set of adjacency rules.

| Family | Source contract |
| --- | --- |
| basic | Flat topology; intentionally no raised wall projection |
| stone_1…4 | Full caps, insets, repeated wall courses, feet, ledges and native ramps |
| desert_1…3 | Full desert cap/inset/face/ledge/ramp banks |
| cave | Interior wall contours and cave floor substrate |
| volcanic | Outdoor cliff caps/insets/face/ledge/ramp banks |
| volcanic_interior | Interior volcanic wall/floor contract |
| dungeon_1…2 | Interior dungeon wall/floor contract |
| shroomlands | Caps, repeated faces, ledges, ramps and waterfall; source lacks tall inverse corners |
| snow | No reproducible source cliff sheet; unavailable in the material palette |

Native art limits remain explicit: shroomlands has no tall inverse-corner bank;
its salmon floor quartet is not interchangeable cliff art. Lava has decorative
frames, not a dedicated liquid shoreline bank. Native crossings support north/up
ramps at the registered minimum width; other directions, stairs, ladders and rope
are capability-gated rather than fabricated from unrelated frames. Mixed cliff
families share contour geometry but retain their own material on each face.

## Fence and hedge contract

`packages/sim/src/connected-objects.ts` resolves N/E/S/W bits 1/2/4/8. All sixteen
masks (isolated, ends, straights, elbows, tees, crosses) select native frames from
`Fences.png`, `Fence_Big.png`, `White_Fence.png`, both stone-fence sheets, or `Hedge_Tiles.png`. Reproduce sheets with
`npx tsx packages/tools/src/import-connected-objects.ts`, then `npm run assets:build`.

Only compatible families at the same logical height and in the same space join.
Map layer visibility and viewport culling do not change topology. Disabled objects
and carried runtime objects do not participate. Gates participate as neighbors
but retain their gate animation. Multi-placement prefabs and scaled objects retain
authored art. Moving/removing an object recomputes affected visual connectivity
from the immutable document or current runtime snapshot.

With Auto surround off, Studio embeds a uniquely identified prefab tagged
`studio.connection.manual`, preserving its authored variant through export and
publication. That override has no player-facing control. The runtime player
painter always derives joins from authoritative placement state. Existing native
art remains the fallback while topology sheets load; failed loads retry with a
bounded delay.

## Ground/source inventory

Every checked-in tile asset is listed below. Registered terrain banks are consumed
by semantic terrain rules; repeated room floors and decorative patterns are also
available as authored ground objects. A decorative frame is not automatically a
new biome or a substitute for missing topology art. Source filenames and exact
crop coordinates remain in each asset's `sourcePath` / `sourceRegions` metadata.

103 tile assets audited.

| Asset | Frames | Role |
| --- | ---: | --- |
| `tile_cf_basic_cliff` | 18 | Registered contour/face bank or authored wall pattern |
| `tile_cf_beach` | 9 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_beach_inset` | 4 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_cave_floor` | 15 | Interior substrate, patch or authored repeating floor |
| `tile_cf_cave_floor_2` | 15 | Interior substrate, patch or authored repeating floor |
| `tile_cf_cave_floor_decoration` | 3 | Interior substrate, patch or authored repeating floor |
| `tile_cf_cave_floor_ladder` | 1 | Interior substrate, patch or authored repeating floor |
| `tile_cf_cave_floor_middle` | 1 | Interior substrate, patch or authored repeating floor |
| `tile_cf_cave_wall` | 56 | Registered contour/face bank or authored wall pattern |
| `tile_cf_cellar_rack` | 1 | Authored ground pattern/decorative object; no inferred biome |
| `tile_cf_desert` | 1 | Biome substrate or authored material variation |
| `tile_cf_desert_1_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_1_ramp_bank` | 9 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_2_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_2_ramp_bank` | 9 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_3_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_3_ramp_bank` | 9 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_cliff` | 143 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_cliff_2` | 143 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_cliff_3` | 143 | Registered contour/face bank or authored wall pattern |
| `tile_cf_desert_grass` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_desert_grass_edge` | 9 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_desert_grass_inset` | 4 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_desert_shore` | 9 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_desert_shore_inset` | 4 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_desert_waterfall_1` | 108 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_desert_waterfall_2` | 90 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_desert_waterfall_3` | 90 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_dungeon_1_wall` | 169 | Registered contour/face bank or authored wall pattern |
| `tile_cf_dungeon_2_wall` | 156 | Registered contour/face bank or authored wall pattern |
| `tile_cf_farmland` | 47 | Path, terrace or dry farmland bank |
| `tile_cf_farmland_grass_inset` | 47 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_farmland_wet` | 47 | Path, terrace or dry farmland bank |
| `tile_cf_freshwater` | 15 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_freshwater_inset` | 4 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_grass` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_1_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_1_middle` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_1_ramp_bank_stone` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_1_ramp_bank_wood` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_1_sheet` | 160 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_2_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_2_middle` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_2_ramp_bank_stone` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_2_ramp_bank_wood` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_2_sheet` | 160 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_3_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_3_middle` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_3_ramp_bank_stone` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_3_ramp_bank_wood` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_3_sheet` | 160 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_4_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_4_middle` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_4_ramp_bank_stone` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_4_ramp_bank_wood` | 16 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_4_sheet` | 160 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_cliff_edge` | 49 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_cliff_ramp` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_dirt_cliff_edge` | 47 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_dirt_cliff_ramp` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_grass_highland` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_meadow` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_grass_tuft` | 8 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_hearth_pavement` | 4 | Biome substrate or authored material variation |
| `tile_cf_hearth_townhouse_floor` | 1 | Interior substrate, patch or authored repeating floor |
| `tile_cf_hillside` | 1 | Authored ground pattern/decorative object; no inferred biome |
| `tile_cf_interior_wall` | 1 | Registered contour/face bank or authored wall pattern |
| `tile_cf_path` | 47 | Path, terrace or dry farmland bank |
| `tile_cf_path_decorated` | 1 | Path, terrace or dry farmland bank |
| `tile_cf_rogue_dungeon_floor` | 9 | Interior substrate, patch or authored repeating floor |
| `tile_cf_rogue_dungeon_wall` | 9 | Registered contour/face bank or authored wall pattern |
| `tile_cf_rogue_volcanic_floor` | 9 | Interior substrate, patch or authored repeating floor |
| `tile_cf_rogue_volcanic_lava` | 4 | Biome substrate or authored material variation |
| `tile_cf_rogue_volcanic_wall` | 9 | Registered contour/face bank or authored wall pattern |
| `tile_cf_savanna_grass_inset` | 47 | Surface fill, fringe, inset or raised grass bank |
| `tile_cf_shroomlands_cliff` | 108 | Registered contour/face bank or authored wall pattern |
| `tile_cf_shroomlands_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_shroomlands_ramp_bank` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_shroomlands_waterfall` | 90 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_stone_cliff_1_inverse_overlay` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_2` | 84 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_2_inverse_overlay` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_3` | 84 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_3_inverse_overlay` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_4` | 84 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_4_inverse_overlay` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_inverse_overlay` | 4 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_cliff_variants` | 84 | Registered contour/face bank or authored wall pattern |
| `tile_cf_stone_wall` | 1 | Registered contour/face bank or authored wall pattern |
| `tile_cf_volcanic_cliff` | 19 | Registered contour/face bank or authored wall pattern |
| `tile_cf_volcanic_interior_wall` | 19 | Registered contour/face bank or authored wall pattern |
| `tile_cf_volcanic_lavafall` | 270 | Biome substrate or authored material variation |
| `tile_cf_volcanic_ledge` | 12 | Registered contour/face bank or authored wall pattern |
| `tile_cf_volcanic_ramp_bank` | 9 | Registered contour/face bank or authored wall pattern |
| `tile_cf_water` | 1 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_water_ripples` | 1 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_water_rock_flow` | 8 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_waterfall` | 15 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_waterfall_flow` | 6 | Water/shore fill, boundary, inset or decoration bank |
| `tile_cf_wood_floor` | 1 | Interior substrate, patch or authored repeating floor |
| `tile_grass` | 1 | Surface fill, fringe, inset or raised grass bank |
| `tile_path` | 47 | Path, terrace or dry farmland bank |
| `tile_soil` | 1 | Authored ground pattern/decorative object; no inferred biome |
