# 61 — World Editor Model, Object Archetypes, Rule Catalogue, and UI-Kit Enforcement

Plan, **2026-09-23**. Status: **proposed; owner decisions in §9 are open**. No
code changes accompany this document.

**Relationship to other plans**

- [50](50-unified-elevation-terrain-plan.md): `raised-terrain-autotile.ts` stays
  the canonical cliff resolver. §4 turns its family tables into authored data.
- [55](55-game-authoring-suite.md): the content registry, data graphs and
  publish pipeline are reused unchanged. §3 completes 55's unfinished §6.1
  (`growth`/`loot` components). It also folds resources and crops into `object:`.
- [56](56-orchard-studio.md): Studio shell and admin API are unchanged.
- [57](57-shared-canvas-ui-kit.md): §5 replaces 57's Phase 5 "complete" claim
  with an enforced gate. It also schedules Phase 6 (game migration).
- [43](43-procedural-sanctuary-and-signed-coordinates.md): §2.5 **supersedes
  43's world-replacement proposal**. The current world is preserved whole.

**Owner migration invariant (inherited from 55):** the existing world is never
disposable. Every migration below is additive, dual-read/backfill/verify/retire.
None of them may use `--delete-data`. Existing invalid geometry stays legal.
Loading never "repairs" a map.

## 1. Findings (verified against `origin/main` 2e1d9a4f and PR #62)

### 1.1 Editor layers mix four unrelated properties

`MAP_CONTENT_LAYER_IDS` (`packages/sim/src/map-document-v3.ts:55`) is one list:
`generated_base, terrain, ground, objects, gameplay, player_owned, canopy,
anchors`. It mixes origin (generated), kind (terrain, anchors), ownership
(player-owned) and draw band (ground, canopy). Studio presents it as a
Photoshop-style layer stack, so every question the owner asked in the
2026-09-23 review comes back to this list.

### 1.2 Exact path/edge tiles have nowhere to live as terrain

`MapCellOverride` (`packages/sim/src/map-document.ts:41`) stores these fields:

- `surface`
- `feature` (`none|path|river|farmland`)
- `cliffFamily`
- `surfaceFamily`
- `ledge`
- **one** `terrainOverride`

`TerrainOverride` (`:33`) is contour-scoped: `{contourLevel, role?,
frameIndex?, family?}`. `map-compiler.ts:291-312` applies it only to a
`contour.*`/`crossing.*` layer. The path layer is always the fixed
`tile_cf_path` frame.

So an exact path-edge, shore or grass-fringe frame cannot be stored as terrain.
`selectExactTile` (`packages/studio/src/tools/map/editor-controller.ts:958`)
therefore switches the workspace to objects and the layer to `ground`. The
result is a Ground Details object that looks like terrain. **This is a data-model
gap, not a UI bug.**

### 1.3 Ownership is guessed, and live objects are locked

`mapEditorLiveMarkers` (`editor-controller.ts:571-600`) hard-codes
`layer: 'player_owned'` for every live placeable, chest and homestead. It never
reads the owner. That layer is `editable: false` (`map-document-v3.ts:81`), so
world-owned town lamps are unmovable.

A lamp can also exist twice: once as an authored map object and once as a live
`world_placeable`. Studio can pick the locked copy.

### 1.4 No ordering within a band; overlap ignores solidity

There is no per-object draw-order field. The painter tie uses layer rank
(`authoredMapContentPainterTie`, `map-document-v3.ts:171`) under spatial depth.
The occupancy check rejects any two objects on the same cell, even flat decals
such as a door mat on paving.

### 1.5 Objects: four unrelated families

| Family | Where | States | Per-state art | Footprint | Light/shadow |
|---|---|---|---|---|---|
| Placeables (~60) | `content/object-definition.ts:191` | bool/enum/counter | animation name by state | 4×4 mask; `collision.when` on/off only | conditional `light`; `occludesLight` |
| Resources (trees, rocks, ore) | `content/resource-definition.ts:30` | fixed columns: `growthStage` 1–3, `health`, `depleted` | fixed slots (small/medium/depleted) | one rect | none |
| Crops | `crops.ts:16` | `CROP_STAGE_COUNT = 4`, hard-coded | assets found by naming convention | n/a | n/a |
| Map prefabs | `map-prefab.ts:46` | `presentation` rules | yes | per-cell mask, not per state | hard-coded table (`live-map-runtime.ts:398`) |

- Tree regrowth is a hard-coded world-tick sweep (`world/src/index.ts:24135`,
  `tree-regrowth.ts`). The generic `growth.ts` maths is never fed by a
  definition.
- Growth-stage prefabs are *derived from asset-name suffixes*
  (`smart-object-prefabs.ts:5-37`).
- Column shadows are chosen by `assetName.startsWith('tree_')`.
- `packages/world/src/index.ts` has ~132 `kind === '…'` branches;
  client/engine have ~53.
- `lifecycle-authoring` supports only item `onUse`.
- Object data graphs never receive `tick`; only NPCs raise it.
- Doc 55 §6.1's `growth` and `loot` components were never built.

What already works: clicking a live tree in Studio edits `growthStage`,
`health` and `depleted`, but only inside the fixed three-stage schema.
Placeable interactions are genuinely data-driven.

### 1.6 Tileset rules are TypeScript, and the guide only reflects them

| Rules | Where they live |
|---|---|
| Cliff families | `terrain-tilesets.ts`. A partial data form, `packages/assets/content/tilesets.json`, maps role→frame only; behaviour flags still come from the TS literal. |
| Beach, shore, freshwater, waterfall, grass/sand/paving transitions | Engine code in `packages/engine/src/terrain.ts` |
| Farmland | `ground-cache.ts` |
| Blob47 | `tilemap.ts` |
| Cave floor/walls | `cave-*-autotile.ts` |
| Fence joins | `connected-objects.ts`, by asset-name regex |

- The terrain guide (`scripts/render-terrain-catalogue.ts`) *imports the
  resolvers and renders their output*. It is a mirror, not a source of truth.
- The Studio Tiles tool edits cliff role→frame maps only.
- Smart Placement (`local-terrain-insets.ts`, PR #62) is Studio-only.
- The server applies no connection rules. Placement checks reach, footprint and
  soil only.
- Authored farmland, hoed soil and landmark paths each use a different
  resolver.
- There is no player "lay path" action.

### 1.7 UI kit: Studio mostly compliant, gate toothless, game untouched

The prebuild check `packages/studio/scripts/verify-ui-kit.mjs` checks only two
things:

- the kit index exists;
- `app.ts` contains `ui.workbench(`.

`canvas-shell-policy.test.ts` catches DOM elements and raw draws in `app.ts`
only. Nothing catches these:

- hand-built `new UiElement({ paint, onPointer })` components;
- direct calls to engine painters;
- raw draws in other files;
- hex colours.

`@orchard/ui/studio` still re-exports the whole legacy API.

Known Studio violations:

- `tools/map/canvas.ts`: the layer row (`:2105-2114`), the palette reticle
  (`:1431`), the height arrow (`:1628`) and the tile-composition element
  (`:1980`);
- `pixel-tool-icons.ts` (raw `new Image()`/`drawImage`);
- `operate-canvas.ts` (hand layout);
- legacy `studioTabStrip`/`buildStudioTableView` in `shell/kernels.ts`.

The game client imports **no** kit components. Doc 57's header still reads
"not started"; Phase 6 has not begun.

## 2. World and editor model

### 2.1 Five independent properties

Every placed thing answers five questions independently:

| Property | Values | Surfaced as |
|---|---|---|
| **Kind** | terrain part, decoration, object, anchor/zone | Tool and palette |
| **Band** (draw) | ground → path/floor → ground-decal → standing (y-sorted) → overhead | Layer panel |
| **Order** | integer within flat bands only | Bring forward/send back |
| **Origin** | generated, authored, player action | Inspector badge and filter |
| **Control** | world, player, guild, plus permissions | Inspector and edit lock |

"Generated Base" and "Player-Owned" stop being layers. They become filters and
inspector facts. The layer panel shows draw bands only, each with
visibility/lock/opacity.

### 2.2 Cell part stack (the core change)

Replace the single `terrainOverride` with an ordered list of **parts**. Each
part is a semantic component with an optional exact appearance override:

```ts
interface CellPart {
  readonly slot: 'surface' | 'path' | 'farmland' | 'water' | `contour:${number}` | `fringe:${string}`;
  readonly family?: string;          // rule-catalogue family id
  readonly exact?: { readonly frame: number; readonly transform?: 0|1|2|3|'flipX' };
}
```

- **Smart mode** sets `family` and lets the resolver derive the frame from
  neighbours.
- **Exact mode** sets `exact` on the *same part*.
- **"Revert"** deletes `exact`.

A path edge is part of the path, not a Ground Details object. The existing
`terrainOverride` migrates losslessly to `{slot: 'contour:N', exact}`. The
compiler reads both forms during dual-read.

### 2.3 Flat-band ordering and overlap policy

- Objects in flat bands (path/floor, ground-decal) carry `order: number`.
  Bring Forward/Send Back swap order with the next overlapping item in the band.
- Standing objects remain y-sorted and never take `order`.
- Occupancy uses the definition's `collision.solid`. Two solid objects conflict.
  A decal over anything is allowed. An exact duplicate (same definition, cell
  and transform) is rejected. This keeps the anti-stacking rule.

### 2.4 One logical object for authored + live

A world object has one identity. The map placement (authored position/transform)
and the live row (state, contents) are linked through `packages/world-bindings`.
Studio picks the logical object; the inspector shows both halves. Moving it
writes the authored placement and, through the admin API, the live row, in one
audited change.

### 2.5 World growth: generation is a draft, not a layer

- The world is stored as **chunks** (proposed 64×64 cells) of saved cell parts
  and objects.
- The generator (`procedural-terrain.ts`, signed coordinates already supported)
  produces a chunk **once** into saved data, pinned to a generator version.
  After that, Studio, the server and players see only saved data. "Generated
  Base" disappears as a concept.
- The current 832×832 world is materialized into chunks with its effective
  terrain, overrides, objects, removals and identity bindings unchanged. Hashes
  are verified before and after.
- New land can arrive in two ways: curated (generate in Studio, edit, publish a
  region) or frontier (generate on first approach, persist). Both use one
  pipeline; §9 D1 chooses the policy.
- Streaming and active-area simulation follow. Dormant growth settles from
  timestamps, as crops already do.

**The cell part stack (§2.2) is stored per chunk from the start**, so the map is
migrated once, not twice.

### 2.6 Shared placement function

`packages/sim` exports one deterministic function:

```ts
applyPlacement(world: ChunkView, change: PlacementChange, rules: RuleCatalogue)
  -> { cells: CellPatch[]; objects: ObjectPatch[]; rejected?: Reason }
```

- It is bounded to the change plus the neighbourhood that the catalogue declares
  (cliff faces may declare more than one tile).
- Studio strokes, player fence/path/hoe/build actions and the server all call
  it.
- The server additionally checks permissions, cost and occupancy before
  committing.
- Exact mode bypasses resolution for the edited part only.
- Whole-map validation is an explicit authoring command, never a load step.

## 3. Object archetypes, state machines, and lifecycle hooks

### 3.1 One definition type

Resources, crops and map-prefab presentation fold into `ObjectContentDefinition`
(`object:` ids). Trees, crops, rocks, lamps, fences and decorations become the
same kind of thing with different components. Existing ids get aliases;
dual-read continues until the retire step.

### 3.2 Declared states and per-state overrides

```jsonc
{
  "id": "object:apple_tree",
  "states": {
    "growth": { "type": "enum", "values": ["sapling", "young", "mature", "stump"], "default": "sapling" },
    "fruiting": { "type": "bool", "default": false }
  },
  "base": {
    "sprite": "tree_apple",
    "footprint": { "mask": "..." },
    "lighting": { "receivesGlobal": true, "castsShadow": "column" },
    "blocksMovement": true
  },
  "overrides": [
    { "when": { "growth": "sapling" }, "sprite": "tree_apple_sapling", "footprint": { "mask": "1x1" }, "blocksMovement": false },
    { "when": { "growth": "stump" },  "sprite": "tree_apple_stump", "lighting": { "castsShadow": "none" } }
  ]
}
```

- Overrides can replace these fields: sprite/animation, footprint, collision,
  light emission, `receivesGlobal`, `castsShadow`, `occludesLight`, interaction
  availability and target rect.
- This replaces the fixed resource visual slots, the asset-name suffix
  generator, the `tree_` shadow prefix and the `MAP_LIGHT_VISUALS` table.

### 3.3 Transitions (the state machine)

```jsonc
"transitions": [
  { "from": { "growth": "sapling" }, "to": { "growth": "young" }, "after": { "growthProgress": 1.0 } },
  { "on": "break", "from": { "growth": "mature" }, "to": { "growth": "stump" }, "run": "graph:drop_logs" },
  { "from": { "growth": "stump" }, "to": { "growth": "sapling" }, "after": { "hours": 24 } }
]
```

- Timed transitions are settled lazily from timestamps, like the existing crop
  maths. They are **not** a per-tick sweep.
- The `growth` component supplies the rate and modifiers (season, water,
  fertiliser) from `growth.ts`.
- Event transitions fire on `use/secondary/useWith/place/break/walkOnto/timer`
  plus new `spawn`/`despawn`/`stateEnter`/`stateExit` events.
- Transitions may run a data graph (doc 55) or an object lifecycle callback
  (see below).

### 3.4 Lifecycle hooks

- **Data graphs** (doc 55) remain the default. They publish immediately.
- For logic that graphs cannot express, extend `lifecycle-authoring` from item
  `onUse` to object hooks: `onSpawn`, `onStateEnter`, `onInteract` and
  `onBreak`. These go through the reviewed warm-build pipeline, as item
  callbacks do.

### 3.5 Studio

- **Object Studio:**
  - a States tab (declare states, values and defaults);
  - an Appearance tab (a grid of state combinations × art, with a live
    preview);
  - a Footprint tab (per-state mask painter);
  - a Lighting tab (emit, receive, shadow);
  - a Transitions tab (graph view);
  - an Interactions tab (existing).
- Raw JSON remains an advanced tab only.
- **Map inspector:** clicking any object shows its declared states as kit
  controls. Changes are published as `entityStates` edits against the current
  value, extended from resources to all objects.
- **Acceptance:** author a new tree in Studio with four growth states and
  per-state art/footprint/shadow. Place it, set its state in the inspector, and
  watch it grow in game. No TypeScript change, no module rebuild.

## 4. Authored rule catalogue (tilesets and connections)

### 4.1 Rule families as data

`packages/assets/content/tilesets.json` grows from cliff role maps into a
versioned catalogue. It covers every family kind that exists today:

| Rule kind | Current code it replaces |
|---|---|
| `raised` (cliff, ramp, stair, ladder courses, face rows) | `terrain-tilesets.ts`, `raised-terrain-autotile.ts` tables |
| `transition` (grass↔sand, paving↔grass, savanna) | `engine/terrain.ts:540-575` |
| `shore` (nine-grid plus insets, water) | `engine/terrain.ts:496,615,642` |
| `blob47` overlay (farmland, fringe) | `tilemap.ts`, `ground-cache.ts`, `farmland.ts` |
| `lane` (waterfall) | `engine/terrain.ts:799` |
| `patch` (cave floor/walls) | `cave-*-autotile.ts` |
| `connect4` objects (fence, hedge) | `connected-objects.ts` regex; uses `connectsTo` from the definition |

Each family declares these things:

- neighbour predicate;
- cardinal or 8-way topology;
- mask→role→frame table with fallback precedence;
- per-role behaviour (`blocksMovement`, `blocksLight`);
- allowed transforms;
- weighted variants;
- seasonal remaps;
- Smart halo/formations;
- compatible neighbour families;
- explicit `unavailable: reason` entries.

The resolvers become generic interpreters of these kinds. Golden-image tests
pin today's output pixel-for-pixel before each family moves.

### 4.2 Studio Tiles tool

Import an atlas, then create a family of any kind. Paint the mask→frame table
on a visual grid (the current guide layout, made editable). Declare
compatibility, then preview formations live. Publish uses the content pipeline.

**The terrain guide is regenerated from the catalogue.** It becomes the
read-only rendering of the same data Studio edits.

## 5. UI-kit enforcement

1. **Narrow the entry point.** `@orchard/ui/studio` exports only `ui`, `UiRoot`,
   types and asset loaders.
2. **Add an ESLint rule** for `packages/studio/**` (later `packages/client/**`).
   It bans:
   - `new UiElement`;
   - `paint`/`paintOverlay`/`onPointer` properties;
   - `draw*`/`layoutUi*` imports;
   - raw `ctx.*` draws outside an allowlist of viewport renderers
     (`editor-renderer.ts`, `active-overlays.ts`);
   - hex/`rgba` literals outside token files.
3. **Add a runtime tree test.** Mount every Studio route headlessly and fail on
   any element kind not produced by a kit factory.
4. **Fix the known violations** listed in §1.7. Where the kit lacks something
   (layer row with eye/lock, a canvas icon from a PNG), add it **to the kit**,
   with a UI Lab specimen.
5. **Replace `verify-ui-kit.mjs`** with the lint and tests above. Correct
   doc 57's status header.
6. **Game migration (57 Phase 6)** follows, screen by screen. Each screen swaps
   to its existing `ui.gameSurface` composition and deletes the hand-drawn
   original.

## 6. Editor feature gaps

| Feature | State |
|---|---|
| Terrain/decoration/object tools that don't cross categories | Missing (§2.2) |
| Per-cell composition inspector (part stack, revert) | Missing |
| Bring forward / send back in flat bands | Missing (§2.3) |
| Intentional decal overlap | Blocked (§2.3) |
| Multi-select (marquee, shift/ctrl), group move/rotate/delete | Missing |
| Copy/paste of selections; reusable stamps | Missing |
| Rectangle, line and ellipse tools; random-variant brushes | Missing |
| Select-through / cycle overlapping picks | Missing |
| Capability-driven rotate/mirror (footprint, collision and facing art together) | Inconsistent |
| Layer (band) visibility, lock, opacity, solo | Partial |
| Select all of this definition | Missing |
| Validation panel (rule violations, clickable) | Missing |
| Minimap and chunk/region navigator | Missing |
| Play-test from cursor | Missing |
| Unified authored/live object inspection | Partial (§2.4) |

Keep these existing features: undo/redo, drafts, flood fill, eyedropper, clone,
height/collision overlays, publish CAS/conflicts.

## 7. Phases

| Phase | Scope | Depends on |
|---|---|---|
| **P0 quick fixes** | Ownership-aware live markers (world-owned objects editable); decal overlap by solidity; PR #62 merged | none |
| **P1 cell parts** | §2.2 schema, compiler dual-read, `terrainOverride` migration, Exact tiles write parts; no chunking yet, but the schema is chunk-keyed | P0 |
| **P2 object archetype** | §3.1–3.3 schema and validation, `growth` component, per-state overrides, lazy transitions; trees then crops migrated behind dual-read | none (parallel to P1) |
| **P3 UI-kit gate** | §5.1–5.5 | none (parallel) |
| **P4 rule catalogue** | §4.1 data plus generic interpreters, family by family with golden images; guide from data | P1 |
| **P5 shared placement** | §2.6 `applyPlacement`, wired to Studio and to world fence/path/hoe/build actions | P1, P4 |
| **P6 editor rework** | §2.1 band panel, §2.4 unified objects, §6 features, §3.5 editors | P1, P2, P3 |
| **P7 world chunks** | §2.5 materialization, then generation, streaming | P1, D1 |
| **P8 game UI migration** | Doc 57 Phase 6 | P3 |

**End-to-end acceptance:**

1. Paint a path and pick an exact edge frame.
2. Put a mat above it.
3. Move a town lamp.
4. Join a fence.
5. Author a new four-stage tree and set its stage.

Then confirm the same results in game, including a player placing a fence and
hoeing next to the path.

## 8. Risks

- **Pixel regressions when resolvers become interpreters.** Mitigation: per-family
  golden images from the current guide before each move.
- **Dual representations during migration** (resources ↔ objects,
  `terrainOverride` ↔ parts). Mitigation: dual-read with parity tests; retire
  only after verification on a restored production snapshot.
- **World chunk materialization touches every cell.** Mitigation:
  effective-terrain hashes before and after; restore rehearsal.
- **Lifecycle callbacks for objects widen the reviewed-code surface.**
  Mitigation: graphs remain the default.

## 9. Owner decisions

- **D1 World growth policy:** curated regions, frontier generation on approach,
  or both. *Recommendation:* build the shared pipeline and launch curated first;
  frontier is a policy flag later.
- **D2 Chunk size:** 64×64 proposed.
- **D3 Fold resources and crops into `object:`:** *recommended yes*. The
  alternative keeps three families with duplicated state editors.
- **D4 Object hooks:** graphs only, or graphs plus TypeScript object callbacks
  (§3.4). *Recommendation:* both, graphs first.
- **D5 Studio deployment during parallel lanes:** lanes land as separate PRs.
  *Recommendation:* deploy Studio only from `main` after merge, so concurrent
  branch builds don't overwrite each other in `packages/studio/dist`.
