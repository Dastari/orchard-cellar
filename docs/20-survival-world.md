# 20 — Generated Survival World

Binding owner-directed foundation for the friends MMO. This replaces the authored
road-grid overworld target; orchard estates and the existing press/progression loops
become later homestead content inside this world.

## 1. World contract

- One deterministic **320×320 tile** legacy island, seed `0x4f434852` (`OCHR`),
  translated intact into the centre of an **832×832 tile** surface world. A
  256-tile ocean apron surrounds every side for long-distance boat travel and
  future islands.
- A radial coast plus low-frequency seeded noise produces water, beach, plains,
  meadow, forest, valley, highland, and impassable ridge terrain.
- The generator lives in pure `packages/sim`; server collision and client rendering
  call the same functions. SpaceTimeDB stores seed/version and mutable entities, not
  hundreds of thousands of duplicated terrain rows.
- Surface coordinates are migrated by the same fixed +256-tile offset when the
  ocean apron is installed. Players, NPC/home positions, farms/soil/crops,
  chests, loose items, and hives therefore stay on their original relative
  island tile; only deterministic resources are regenerated for the new version.
- The purchased Cute Fantasy atlas supplies water, path/sand, grass detail,
  hillside, tree, character, and UI visuals. Missing biome-specific tiles use quiet
  palette fills until reviewed semantic extracts land.

## 2. Spawn and homesteads

There are 25 deterministic clearings on a 5×5 interior grid. A durable identity is
assigned one slot transactionally on first survival-world entry and returns there only
for initial spawn/recovery. Each radius-5 clearing is forced walkable plains and has no
generated resources. Narrow resource-free plains trails connect the clearing grid so
forest generation can never enclose a player; forests remain dense visual regions but
tree occupancy is capped below wall-forming density. Claiming, building, and farm ownership inside/around a clearing
remain M7a work; the M5.7 slice does not grant land permissions.

## 3. Terrain and resource collision

- Collision is resolved by a shared traversal medium. `ground` actors are blocked
  by water and ridges; `water` actors and future boats may cross calm ocean,
  freshwater, and oasis water but are blocked by every shoreline/land tile,
  waterfalls, and authored water rocks; `air` actors ignore terrain while still
  remaining inside world bounds. Add future movement types through this semantic
  rule rather than bypassing collision in entity-specific code.
- Beaches, plains, meadow, forest floor, valleys, and highlands are walkable for
  ground actors. Shoreline blends remain land for water collision, so boats and
  swimmers cannot visually overlap a bank.
- Live tree resources use an 8×6 px trunk box at the lower center of their tile;
  depleted trees do not block. The authority
  validates movement against terrain and the current resource table. Client
  prediction begins from the deterministic resource layout and applies subscribed
  depletion updates, then reconciles as usual.
- The player body uses a compact 8×6 px foot box ending at the authoritative foot
  point. The `G` diagnostic draws that exact box in cyan over terrain/resource
  collision. Live trunk boxes appear amber, so canopy depth and blocked bases can
  be checked independently without treating the full art tile as solid.
- Render ground first. Sort resource sprites and player sprites by their foot-point Y;
  canopy pixels naturally cover actors north of a tree and actors south of it cover
  the trunk/canopy. HUD is never part of world sorting.

## 4. First survival transaction

Private survival state contains the selected hotbar slot; legacy Wood/Stone columns
remain migration-only while all usable possessions live in the nine private slots.
New players receive Axe, Pickaxe, Hoe, and Watering Can in slots
0–3; slots 4–8 are empty. Caller-dependent SpaceTimeDB views expose only the caller's
survival row and slots.

The reviewed Cute Fantasy tool strip is semantically ordered Bow, Arrow, Pickaxe,
Axe, Sword, Hoe, Watering Can, Fishing Rod, Lantern, Torch. Runtime crops use those
declared meanings rather than visual filename inference. Item registration, paid-pack
art sourcing, and recipes now live in [28-crafting.md](28-crafting.md); its phases
1–3 implement sticks, fiber, torch, and the workbench/placeable tier without pulling
the later weapon or metal mechanics forward.

`harvest_resource(resourceId)` is atomic and authoritative:

1. sender exists and has selected the required tool;
2. sender's authoritative position is within two tiles;
3. resource is live and tool/resource pairing is valid;
4. each Axe hit removes one of three tree health; the final hit marks it depleted,
   leaves a persistent stump, and atomically creates one shared Wood ×3 ground stack.
   Sparse apple, pear, peach, and cherry trees occur only beside river corridors and
   additionally drop Fruit ×2 matching the visible tree.

Generated inland-water decoration requires a complete 3×3 water neighbourhood; fish
shadows and all swimming wildlife require 5×5 clearance. Lakes use a sparse mix of
single and grouped lily pads/flowers, cattails, grasses, rocks, and fish shadows rather
than filling every interior tile. Two subtle animated surface families are scattered
only across full 3×3 ocean tiles, never across shoreline blends.

`pickup_world_item(itemId)` checks authoritative reach and stacks into a matching or
empty private slot before deleting the shared row. `drop_selected()` takes no item,
quantity, owner, or position from the client: it moves the complete selected stack to
a shared ground row in front of the server-owned player position and facing. A full
inventory rejects pickup without deleting the item.

No client-supplied quantity, position, owner, damage, or reward is accepted. Resource
respawn and durability are deliberately deferred.

## 5. Client UX

- `1`–`9` selects a hotbar slot; the server persists selection.
- Mouse-wheel up/down zooms the world. Unshifted `-`/`+` provide the same stepped
  world zoom; `Shift -`/`Shift +` scale UI chrome independently.
- `E` picks up a faced ground item, `F` uses the selected tool on a faced resource,
  and `Q` drops the selected slot in front of the player.
- The bottom-center nine-slot hotbar uses parchment/wood pixel UI, centered native-size
  icons, stack quantities, click selection, hover names, and a visible selected bracket.
  There is no parallel resource counter: Wood appears only in the nine slots until a
  backpack exists.
- Continuous world zoom moves in eased 0.25 steps; source scale 2 is labelled `1×`.
  Player nameplates live in the world pass, scale with world zoom, and use a compact
  translucent backing instead of DOM/UI overlays. Double-click retains fullscreen.
- The in-canvas top-right weather test frame can scrub the 54,000-tick day and override
  rain without mutating authority state. Licensed diagonal rain and its seven-frame
  impact animation share an exact endpoint, move opposite camera travel, and scale
  with world zoom around the source-scale-2 reference. Velocity scales with the same
  ratio and close views thin the active pool to preserve apparent rainfall density.
  Each drop and splash sorts at its ground-impact foot Y, so weather landing north of
  a tree passes behind its canopy while southern impacts pass in front. Rain and
  day/night are composable; spatial weather regions/cloud emitters remain future work.
- The licensed character sheet has cardinal walk poses only. Diagonal travel remains
  true diagonal movement and uses the mirrored side pose so it does not falsely read
  as straight-up walking.

## 6. Required tests

- Same seed yields byte-identical terrain/resource classifications; a different seed
  differs. Island border is all water and all 25 spawn clearings are walkable/resource-free.
- Biome fixture points cover coast, forest, meadow, valley, and highland; the generated
  map contains every required biome above a nontrivial tile count.
- Authority movement rejects water, ridge, and live-tree entry and permits a depleted
  tree base.
- Inventory views are sender-filtered. Wrong tool, out-of-range, depleted, and racing
  final-hit paths fail without duplicate Wood.
- Hotbar selection and y-sort ordering have client logic tests; browser verification
  exercises movement, collision, three hits, pickup, reconnect, zoom, and two spawns.
