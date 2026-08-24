# 20 — Generated Survival World

Binding owner-directed foundation for the friends MMO. This replaces the authored
road-grid overworld target; orchard estates and the existing press/progression loops
become later homestead content inside this world.

## 1. World contract

- One deterministic **192×192 tile** island, seed `0x4f434852` (`OCHR`).
- A radial coast plus low-frequency seeded noise produces water, beach, plains,
  meadow, forest, valley, highland, and impassable ridge terrain.
- The generator lives in pure `packages/sim`; server collision and client rendering
  call the same functions. SpaceTimeDB stores seed/version and mutable entities, not
  36,864 duplicated terrain rows.
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

- Water and ridge tiles block movement. Beaches, plains, meadow, forest floor,
  valleys, and highlands are walkable.
- Live tree resource bases block one tile; depleted trees do not. The authority
  validates movement against terrain and the current resource table. Client
  prediction begins from the deterministic resource layout and applies subscribed
  depletion updates, then reconciles as usual.
- The player body uses a compact 8×6 px foot box ending at the authoritative foot
  point. The `G` diagnostic draws that exact box in cyan over terrain/resource
  collision, so canopy depth and blocked trunk bases can be checked independently.
- Render ground first. Sort resource sprites and player sprites by their foot-point Y;
  canopy pixels naturally cover actors north of a tree and actors south of it cover
  the trunk/canopy. HUD is never part of world sorting.

## 4. First survival transaction

Private survival state contains Wood, Stone, and selected hotbar slot. A private slot
table has nine slots. New players receive Axe, Pickaxe, Hoe, and Watering Can in slots
0–3; slots 4–8 are empty. Caller-dependent SpaceTimeDB views expose only the caller's
survival row and slots.

The reviewed Cute Fantasy tool strip is semantically ordered Bow, Arrow, Pickaxe,
Axe, Sword, Hoe, Watering Can, Fishing Rod, Lantern, Torch. Runtime crops use those
declared meanings rather than visual filename inference.

`harvest_resource(resourceId)` is atomic and authoritative:

1. sender exists and has selected the required tool;
2. sender's authoritative position is within two tiles;
3. resource is live and tool/resource pairing is valid;
4. each Axe hit removes one of three tree health; the final hit marks it depleted and
   grants exactly 3 Wood once.

No client-supplied quantity, position, owner, damage, or reward is accepted. Resource
respawn and durability are deliberately deferred.

## 5. Client UX

- `1`–`9` selects a hotbar slot; the server persists selection.
- Mouse-wheel up/down selects the previous/next slot with wraparound. It never zooms
  the world.
- `E` uses the selected tool on the faced resource. Prompt names the action or states
  which tool is required.
- The bottom-center nine-slot hotbar uses parchment/wood pixel UI, short item labels,
  and a visible selected bracket. The HUD shows Wood and Stone counts.
- The three render scales are shown relative to the intended default: source scale 2
  is `1×`, with `0.5×` and `1.5×` steps on `-`/`+`. `Shift -`/`Shift +` changes the
  HUD by whole-pixel scale when the current window can fit it.
- `F` has no fullscreen binding. Double-clicking the canvas retains fullscreen.
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
