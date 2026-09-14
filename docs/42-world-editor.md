# 42 — In-Game World Editor, Terrain Grammar, and Agent Sandbox

Implementation plan, **2026-08-27**, implementation update **2026-09-02**. Status:
**Map Editor and Object Studio naming/routes, `MapDocumentV3`, `MapPrefabV2`, semantic
editor icons/tooltips, content layers, object grouping/prefab authoring, biome/scatter
tools, generated-island curation, and authenticated compare-and-swap live publication
are implemented. The production island consumes the same published terrain/object
revision in rendering, client prediction, and server collision authority.** The
anonymous route remains a local draft surface; only an authenticated owner/admin
connection can publish a live revision. A connected owner/admin Map Editor is a
live-authoring session: completed edits are coalesced for 250 ms and automatically
published, while the Publish button remains an explicit flush-now control.

Adopted product language:

- **Map Editor** (`/editor/map`) is the world authoring surface. Its default document
  is `live-island`; the permanent terrain fixture remains `/editor/map/terrain-lab`.
- **Object Studio** (`/editor/object`) is the reusable prefab authoring surface.
  “World object” is the umbrella term for trees, fences, gates, cactus, buildings,
  farms, props, surfaces, and composed prefabs; “entity” is reserved for a runtime
  gameplay instance with mutable state.
- `/editor/terrain`, `/editor/offline`, and `/editor/design` remain compatibility
  aliases. New UI, docs, exports, and accessibility labels use the adopted names.

This plan builds on:

- [02](02-architecture.md): one Canvas client, pure deterministic `packages/sim`,
  and SpaceTimeDB as the live authority;
- [08](08-database.md) and [09](09-auth.md): additive schema, identity-derived
  authorization, permanent admin audit, and no reliance on client visibility;
- [11](11-asset-pipeline.md): semantic assets, the raised-cliff metatile contract,
  animation metadata, and the ignored owner-licensed source packs;
- [20](20-survival-world.md), [21](21-unified-renderer.md), and
  [27](27-lighting-design.md): one terrain classification for rendering,
  collision, depth, and light;
- [26](26-underground-mines.md) and [41](41-tent-interior-and-cellar-asset-catalog.md):
  space-aware generation and excavation-mask-to-cave-autotile composition;
- [30](30-infinite-terrain.md) §7: procedural base plus permanent hand-crafted
  curation, semantic crossings, and `.map.json` stamps;
- [34](34-backend-scalability.md): bounded chunk subscriptions, caches, and hot
  authority work;
- [35](35-homesteads-and-farming.md) §7: player build mode is a later consumer of
  the same placement metadata, but is not an admin terrain editor; and
- [40](40-sanctuary-overworld-and-zoned-world.md): the editor ultimately authors
  the immutable sanctuary, its POIs, and its destination spaces;
- [43](43-procedural-sanctuary-and-signed-coordinates.md): signed world coordinates,
  generated-space curation, seed overview, finite bounds, and resize handles.

Where an older document describes raw per-tile `overrideKind` strings, this plan
refines the representation into versioned semantic chunk overrides. It preserves
the binding rule that authored data beats procedural generation and that render and
authority collision consume the same composed result.

## 1. Goal and non-negotiable boundaries

The editor must let an owner or explicitly granted world editor:

- open the running game and switch from play to a free-camera creator mode;
- paint ordinary terrain and semantic features such as paths, rivers, shores,
  cave excavations, floors, and walls;
- draw a closed contour and raise or lower its interior, repeatedly, so nested
  level-1/2/3/... mountains, terraces, canyons, and quarries are ordinary data;
- add slopes, stairs, ladders, ropes, portals, collision overrides, scenery,
  objects, entity anchors, POIs, labels, and protected regions in later slices;
- switch a feature between compatible visual tile families without repainting its
  topology;
- inspect exactly why a cell chose each atlas frame, how its layers compose, which
  collision planes it affects, and how it enters painter depth and lighting;
- save small deterministic offline maps for fixtures and review, or publish a
  validated revision to an existing live `spaceId`; and
- expose the offline/test workflow to browser and coding agents without requiring a
  player account.

The following remain hard boundaries:

- **No anonymous live-world writes.** Authentication-free editor mode is an
  isolated map sandbox. It never constructs a live mutation adapter and never calls
  a world reducer.
- **No second map engine.** Generation, editor preview, live rendering, authority
  collision, lighting, and tests call the same pure terrain compiler.
- **No raw frame IDs as map authority.** Frames are outputs of semantic topology plus
  a visual theme. A draft-only frame audition tool may compare candidates, but a
  publishable map cannot depend on it.
- **No collision inferred from opaque pixels.** Terrain material, height boundary,
  crossing, and explicit object footprint determine gameplay collision. Alpha only
  determines visual composition and light silhouettes.
- **No paid source sheets in git, databases, exports, browser payloads, or map files.**
  The ignored `references/` corpus remains local. Only reviewed runtime assets allowed
  by [11](11-asset-pipeline.md) can appear in a published map.
- **No whole-world work per brush stroke or authority tick.** Recompile the dirty
  chunks plus the semantic dependency halo only.

## 2. One semantic map, three consumers

```text
                 editor commands / generator / map fixture
                                  |
                                  v
                         SemanticMapDocument
       elevation + surfaces + features + crossings + placements + overrides
                                  |
                       pure shared chunk compiler
                +-----------------+------------------+
                |                 |                  |
                v                 v                  v
        render composition   collision/height   validation/debug trace
        + animation roles    + light roles      + export/live patch
```

`packages/sim` owns coordinates, topology, semantic material rules, collision,
height, transitions, deterministic rasterization, dirty-region calculation, and
validation. It remains pure: no DOM, filesystem, SpaceTimeDB, timestamps, or atlas
images.

The client owns Canvas presentation, the creator UI, asset/frame lookup, animation
preview, free camera, and draft overlays. Tools own filesystem import/export,
headless editing, rendered review sheets, and fixture generation. The world module
owns live authorization, revision conflict checks, durable rows, audit, and atomic
publication.

### 2.1 Coordinates and map bounds

Doc 43 supersedes the original zero-based assumption in this section. All spaces use
a signed, spawn/anchor-centred game-world plane: `tileX` increases east/right,
`tileY` increases south/down, and elevation increases upward independently. This is a
Cartesian-style signed ground plane, not a mathematical `+Y = north` rewrite.

Chunks are 16×16 tiles and all consumers use the shared floor-division/floor-modulo
contract, so tile `-1` is chunk `-1`, local tile `15`. Screen, projected cliff-face,
camera, and atlas coordinates remain presentation-only and are never persisted as
logical terrain coordinates.

Generated spaces have a signed extent policy rather than a resizable map edge. Finite
spaces have explicit `{ minTileX, minTileY, width, height }` bounds which may cross
zero. `MapDocumentV2` remains the implemented compatibility format and imports as
`minTileX = 0, minTileY = 0`; planned V3 writes signed bounds.

Elevation is an independent absolute integer axis. Rendering projects an elevated
surface upward on screen, but never changes the surface's logical `(tileX,tileY)`.
Camera and screen coordinates are presentation-only and are not serialized.

V2's implemented resize operation translates content to preserve a selected relative
anchor. V3 deliberately replaces that behavior: dragging a finite map edge changes
the signed bounds while all retained world coordinates stay stable. Repositioning or
rebasing content is a separate explicit command. Cropped content receives a preview
and confirmation and remains exactly recoverable through undo.

### 2.2 Coordinate-derived height

Every composed cell has an absolute integer logical elevation. The public query is
conceptually:

```ts
terrainHeightAt(spaceId, tileX, tileY): number
```

It must return the same value after walking, portal arrival, teleport, reconnect, or
map reload. An entity is never considered to be “on level 2” merely because it crossed
a particular ramp earlier. Its logical foot coordinate resolves the level. The
selected cliff theme controls projected face rows, not logical height.

The movement query includes the actor plane and medium:

```ts
terrainTraversalAt(spaceId, tileX, tileY, elevation, medium): TraversalCell
```

It reports upper-plane cap-edge blockers, lower-plane projected face blockers,
walkable non-height foot/shadow rows, liquids, explicit crossings, and any expert
collision override. This is the same result used by client prediction and authority.

## 3. Versioned offline map document

Add a non-breaking `MapDocumentV2` alongside the two existing legacy `.map.json`
files. Small authored maps remain readable JSON; generated chunk products are build
artifacts and are not committed.

The source document contains:

| Layer            | Stored semantic data                                                                                   | Not stored                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| identity         | schema version, stable map id, title, dimensions, base generator/seed/version                          | database identity                               |
| elevation        | absolute integer level per authored cell, sparse over a procedural base                                | cliff frames, projected face pixels             |
| surface          | base material id such as `grass`, `sand`, `cave_floor`, `stone_floor`                                  | atlas coordinates                               |
| feature          | optional path, river, rail, soil, shore, lava, floor trim, or other overlay material                   | manually selected corner/edge frame             |
| crossing         | contour level, orientation, kind (`slope`, `stairs`, `ladder`, `rope`) and paired anchors where needed | holes painted into wall art                     |
| collision        | rare explicit override with reason (`inherit`, `force_block`, `force_walk`, medium mask)               | sprite-alpha guesses                            |
| scenery          | stable placement id, semantic asset id, anchor, rotation/state, base elevation, authored properties    | PNG data                                        |
| gameplay anchors | portal, spawn, NPC/event/resource blueprint, POI, label, protected-region references                   | mutable runtime entity state                    |
| provenance       | generator baseline and optional source stamp id                                                        | local `references/` paths in production exports |

Large layer grids use deterministic run-length encoded rows or 16×16 semantic chunks
inside the JSON source. The format must remain diffable: sorted keys, stable chunk
order, stable placement ids, and no base64 for normal authored maps. A compiled binary
cache may be generated under `build/`, but is always disposable.

Brush strokes and closed polygons are editor commands, not permanent rendering data.
The command rasterizes to semantic cells, records before/after values for undo, and
then disappears when the map is saved. This avoids making future rendering depend on
the original mouse sampling rate.

### 3.1 Procedural base plus sparse authorship

For generated spaces, composition is:

```text
generator result
  -> curated semantic chunk override
  -> explicit crossing/collision records
  -> static scenery and gameplay anchors
```

When a generator-backed cell is first edited, its authored values become absolute
for the touched fields. A later generator bump cannot silently rewrite a curated
chunk. Untouched fields may continue to inherit the pinned generator baseline. The
map validator rejects an override whose baseline version is unavailable rather than
guessing.

## 4. Semantic terrain and tile-family registry

The present asset registry already separates animations, variants, states, collision,
placement, and stable asset ids. Extend it with reviewed **terrain family manifests**
under `packages/assets/tilesets/`. A family maps semantic roles to runtime assets;
it does not contain topology algorithms.

Two registries stay deliberately separate:

1. `TerrainMaterialDefinition` in `packages/sim`: medium, walkability, default
   collision/light behavior, topology kind, and compatibility rules.
2. `TerrainThemeDefinition` in assets/client/tools: semantic role to
   `assetId + state/variant/animation` plus a cliff face profile or transition art.

This split lets the authority know that `fresh_water` blocks a ground actor without
knowing atlas coordinates, while the editor can switch `stone_cliff_blue` to
`stone_cliff_brown` without rewriting elevation or collision.

### 4.1 Required topology families

| Family             | Semantic outputs that every compatible theme must cover                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| flat surface       | fill variants, optional deterministic details, seasonal compatibility                                                               |
| blob boundary      | centre, cardinal edges, convex corners, concave/inset corners, isolated and pinched cases (canonical blob47 where appropriate)      |
| linear feature     | isolated/end/straight/corner/T/cross and width joins for paths, rails, fences, hedges                                               |
| river/liquid       | body animation, banks, cardinal/outer/inset corners, narrow joins, source/end, optional waterfall/bridge hooks                      |
| raised contour     | all edge and inset roles, ordered face-row profiles, seam underlays, non-height foot rows, slope/stair art, ladder/rope anchors     |
| cave excavation    | opaque floor variants, rock/void fill, excavation ring, wall profile, doorway/support hooks; decoration never substitutes for floor |
| stateful structure | closed/open/damaged states, authoritative collision state, rotation variants                                                        |
| animated terrain   | animation group, fps/loop from asset metadata, deterministic phase policy, collision/light independent of the current frame         |

The family validator must produce a role-coverage matrix. A theme is selectable only
when all mandatory roles for the chosen topology exist. Optional roles declare an
explicit fallback within the **same** theme; the compiler never borrows a corner from
a different cliff palette. Unknown or incomplete themes render the missing-asset
checker and block live publication.

The existing `raised-terrain-autotile` is the first implementation of this grammar.
Its topology should gradually stop carrying visual frame numbers: pure sim emits
edge/inset/face/join/underlay roles, while the selected terrain theme maps those roles
to frames. The change must preserve all current cliff goldens before another cliff
family is introduced.

### 4.2 Paths, rivers, and transitions

The path brush writes a path mask over the existing surface. The renderer always
draws the base material first and then the path transition, so the two authored edge
tiles blend cleanly into adjacent ground. A width-1 or wider stroke is rasterized,
cleaned for single-cell pinholes, and resolved through the same eight-neighbour mask
at every zoom and season.

The river brush writes a liquid body mask plus its bank material. Width, bank theme,
flow direction, and optional source/mouth are semantic properties. It must never
paint a water fill and then separately hand-place shore corners. River topology
selects body animation and bank/inset layers together; collision reads the liquid
mask, not the bank sprite.

The contour tool closes a lasso/polygon, fills its interior deterministically, and
adds or subtracts one elevation level. Repeating it inside an existing contour builds
a stepped mountain; repeating lower inside lower creates a quarry or canyon. The
compiler resolves every contour level independently and creates no crossing. The
author then places a slope/stair/ladder/rope explicitly, or accepts a separately
previewed transition suggestion.

## 5. Creator-mode UX

The editor is selected from the owner administration panel as **CREATOR MODE**. A
development shortcut may exist, but `B` remains homestead/player build mode and `G`
remains terrain diagnostics.

Entering creator mode:

- settles movement input and swaps gameplay controls for a free camera;
- leaves the avatar stationary and visible for scale unless “hide avatar” is chosen;
- opens dockable in-canvas panels using [23](23-ui-system.md) widgets;
- keeps the normal renderer, lighting, season, weather, and depth queue active;
- continuously autosaves an isolated local draft; a connected owner/admin session
  additionally synchronizes completed commands to the live head; and
- returns to play mode without publishing when the draft is discarded.

The default desktop composition follows a professional map-editor hierarchy while
retaining the game's wood, parchment, bitmap fonts, buttons, slots, and scrollbars:

- a compact floating map-information plate over the viewport owns map/seed/version,
  revision, chunk-materialization count, and later dirty/publish state;
- the left tool dock starts with a fixed history/file command group, followed by a
  separately scrollable tool palette. Terrain mode owns terrain families and topology;
  Object/Biome/Scatter modes own target-layer and the reviewed tile/pattern/prefab
  catalogue. Save/load/import/export use icons rather
  than consuming the dock width with labels;
- grid, height, and collision are stateful icon toggles in the tool palette rather
  than a permanent diagnostic text block; every command, tool, family, topology, and
  finite-resize control exposes contextual hover help in the bottom status plate;
- the terrain-family picker shows ground/water/cliff colour or asset previews and
  a second descriptive line at a touch-friendly row height, and filters to complete
  compatible manifests; incomplete families remain visible but disabled with their
  missing roles named;
- the right rail splits evenly between the clicked-selection inspector and a separate
  ordered content-layer stack: a world object shows its sprite, name, stable id, tile/elevation,
  content layer, visibility, prefab revision, rotation, horizontal flip, 1x/2x scale,
  collision/footprint metadata, and framed clone/delete/hide/rotate/flip/scale actions;
  a terrain cell shows final composition, layers, collision, and WHY trace; and
- the top map-information plate is the same thin HUD frame used by the in-game wallet,
  with one clipped, fitted, left-aligned bitmap-font line; the bottom plate owns the
  current tool, active plane, zoom, hover help, and transient operation status; and
- keyboard digits may remain accelerators, but they are shortcuts—not the primary
  visual language of the tool dock.

### 5.1 Initial tools

| Tool                | Behavior                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| select/pan          | box/lasso selection, move camera, copy/paste semantic cells                                                                                                     |
| eyedropper          | selects material/theme/feature/elevation from the composed cell                                                                                                 |
| surface brush       | pencil, line, rectangle, fill, noise/scatter, replace material                                                                                                  |
| path brush          | centreline plus width; resolves ends, joins, corners, and transitions automatically                                                                             |
| river brush         | centreline plus width/bank/flow; resolves water, banks, corners, and animation                                                                                  |
| contour raise/lower | closed lasso or filled brush applying `+1`/`-1`; supports nested levels                                                                                         |
| flatten/smooth      | sets one level or removes isolated height spikes under preview                                                                                                  |
| crossing            | places and validates slope, stairs, ladder, or rope at one named contour                                                                                        |
| collision           | expert-only force block/walk/medium override with a mandatory reason                                                                                            |
| resize bounds       | visible four edge/four corner handles on finite maps; drag in world space, Shift snaps eight tiles, Alt resizes symmetrically, retained coordinates stay stable |
| stamp               | place a versioned map prefab with rotation/mirroring allowed only when its contract permits                                                                     |
| scenery/anchor      | later phase: trees, rocks, props, POIs, portals, NPC/event/resource anchors                                                                                     |

Every drag is one undoable command. Undo/redo stores semantic before/after values,
not screenshots. The History panel names the tool, bounding box, affected chunk count,
and validation result. A save with unresolved errors is allowed offline as a draft;
Publish is not.

The topology switch defaults to **Auto Edges**. In that mode a water stroke writes a
semantic liquid/body mask and the compiler generates banks, corners, animation and
collision together; the author never paints shore art separately. **Manual Roles** is
an expert/draft mode for placing a registered semantic role at an arbitrary cell to
debug a family mapping. It is not permission to persist an atlas coordinate: raw
frame audition remains local-only, and a manual role cannot publish until its family
manifest resolves it to a reviewed runtime asset.

### 5.2 Layer and validation overlays

The layer panel can isolate or tint:

- surface and feature masks;
- absolute height as numbered/color bands;
- collision for the currently selected elevation and movement medium;
- all collision planes, separately toggled;
- crossings and their lower/upper anchors;
- light blockers/attenuators and emitter previews;
- authored overrides versus generator inheritance;
- chunk boundaries, dirty dependency halo, and cached/resident chunks; and
- scenery footprints, depth anchors, protected regions, portals, and spawn reachability.

The normal collision view should default to “current elevation” instead of a single
outline around a contour. Moving the preview actor or changing its elevation updates
the overlay immediately.

### 5.3 Tile composition inspector

The existing `G` click inspector becomes a pinned editor panel. For the selected
world cell it shows:

- an enlarged checkerboard-backed image of the **final composed tile**;
- a visual thumbnail of **every contributing tile/frame**, in actual back-to-front
  order;
- semantic material, topology family, neighbor mask, role, contour level, join,
  face row, underlay, asset name/id, group, frame index, and atlas revision;
- generator/override/stamp provenance and the exact rule that selected each layer;
- logical tile coordinate, projected draw coordinate, absolute elevation, depth key,
  alpha bounds, collision cells per plane, movement medium, and light-blocking role;
- animation group/fps/loop/current deterministic frame for animated cells; and
- alternative previews for every compatible terrain theme, with missing roles called
  out before selection.

A “WHY THIS TILE?” trace is essential. It should say, for example, “east side edge,
south-west diagonal occupied, rear wall continues one row, therefore add middle-wall
underlay then transparent right edge.” That turns the editor into the primary tool for
finding bad tileset mappings rather than requiring screenshots and source-code guesses.

Draft-only **frame audition** may temporarily replace a visual role to compare source
candidates. It cannot be exported or published until the candidate is registered as a
semantic theme mapping and passes the role validator.

### 5.4 Editor-wide semantic icon language

All editor routes use one semantic icon registry rather than choosing asset ids,
atlas cells, or generic SVG filenames independently inside each screen. The audit
covers the shared development rail and every button, tool, toggle, tab, layer action,
inspector action, and empty-state command in:

- the Map Editor at `/editor/map` (with `/editor` and `/editor/terrain` aliases);
- the Object Studio at `/editor/object` (with `/editor/design` as an alias);
- the UI Lab at `/editor/ui-lab`; and
- the Character Studio at `/editor/character-studio`.

The expanded [Clockwork Raven icon index](reference-assets/clockwork-raven-index.md)
is the primary discovery source for better domain-specific matches. Its 34 packs and
44 native 16 px sheets cover UI/menu states, places and biomes, general tools,
farming, trees, equipment, clothing, armour, magic, resources, and other concepts
which the former small command set could represent only with repeated or weakly
related symbols. Search the machine-readable companion when choosing candidates;
never browse the 20,656 source cells by guesswork. The global
[reference-library index](reference-assets/reference-library-index.md) remains the
fallback when the vendor or family is unknown.

Icon selection follows these rules:

1. Reuse an existing reviewed Orchard/Cute Fantasy runtime icon when it is already an
   exact semantic match.
2. Otherwise select the clearest matching native 16 px Clockwork Raven cell, preferring
   its authored outline/no-outline pair when both exist.
3. Use a bespoke Orchard icon when no licensed source communicates the action clearly.
4. Use a Lucide symbol for a small, universally recognised abstract command only when
   the expanded reference collection has no clearer reviewed/licence-cleared pixel
   match. Record that fallback in the registry so a later contact-sheet review can
   replace it deliberately. A generic symbol must not remain merely because it was
   wired first, and a decorative fantasy item must not replace a clearer abstract
   command symbol.

The initial audit includes, at minimum:

| Surface | Required distinct icon concepts | Reference families to inspect first |
| --- | --- | --- |
| shared rail and files | Map, Object, UI Lab, Character, new, save, load, import, export, undo, redo, copy, paste, duplicate, delete, search, filter, settings | Raven UI/menu states, Places and Seasons, General Items and Tools, armour/clothing |
| Map Editor | terrain, biome, surface brush, path, river, raise, lower, flatten, smooth, scatter, picker, selection, object placement, anchor/zone, layers, visibility, lock, solo, collision, grid, live preview, publish | Places and Seasons, Trees and Logs, Alchemy and Herbs, Farming/Food, Raven UI states |
| Object Studio | stamp, marquee, frame/collection, group, explode, pivot, move, rotate, flip, align, collision cells, ground/object/canopy layers, create prefab, publish prefab | General Items and Tools, Trees and Logs, Farming/Food, Raven UI states |
| UI Lab | controls, layout, typography, input, feedback, states, animation, accessibility, catalogue and reset | Raven UI/menu states; existing Cute Fantasy button, selector, slider, and icon catalogues |
| Character Studio | body, hair, head, chest, hands, legs, feet, armour, clothing, accessories, dye/material, animation, compare and export | Armour 500, Clothing 120, Accessories 400, Equipment Sets, Masks |

This table names concepts, not permanent source coordinates. Create stable semantic
ids such as `editor.tool.marquee`, `editor.display.visibility`, and
`editor.route.character`; map those ids to reviewed runtime assets in one registry.
Route code consumes the semantic id and cannot scatter raw row/column values or
reference paths. Intentional aliases such as Save across two editors share one entry;
unrelated actions may not reuse one icon simply to avoid importing a better match.

Reference sheets remain local source material. For each selected Raven cell, record
the pack, canonical sheet, zero-based row/column, source revision/hash, outline choice,
and licence/provenance status; import only the reviewed cell as a semantic
`packages/assets` definition. The browser, database, map files, prefab exports, and
public atlas never receive a composite reference sheet or a `references/` path. A
pack whose licence-use gate is unresolved remains a candidate rather than a runtime
dependency until that gate is cleared.

Icons render at their native pixel scale or integer multiples with image smoothing
disabled. Preserve the source palette; communicate hover, active, disabled,
destructive, and live states through the authored outline/state variant and button
chrome rather than arbitrary recolouring. Terrain-family rows and object palettes
continue to use actual material/object thumbnails where those are more informative
than an action glyph.

Every icon-only control retains the action label in its tooltip and accessibility
description. The common action definition owns semantic icon id, label, shortcut,
tooltip, disabled reason, and destructive/active state so the displayed icon cannot
drift from hover help or keyboard behavior.

## 6. Authentication-free agent sandbox

The shared client application gains a first-class editor route selected before
account startup:

```text
/editor
/editor/terrain
```

`/editor` opens the procedural seed-world editor. Named offline maps use
`/editor/terrain/<map-id>`. Query parameters may describe optional editor state such
as `?seed=...`; they must not decide whether the game or editor application starts.
The former `?mode=editor&source=offline&map=...` form is a redirect-only compatibility
alias and is removed from the address bar after resolution.

This route is safe to expose at `https://orchard.dastari.net` because it:

- does not create a SpaceTimeDB connection;
- imports only the offline editor adapter;
- can open shipped test maps, create a new local draft, import a user-selected map,
  and export/download a deterministic `.map.json` or patch;
- stores optional browser autosaves under an editor-specific IndexedDB key, never in
  the authoritative game store; and
- contains no live publish command, token fallback, or hidden reducer path.

Coding agents additionally receive a headless, dependency-free command surface over
the same pure command functions:

```text
npm run map:create -- <file> --size 96x96
npm run map:stroke -- <file> path <points...> --width 3
npm run map:contour -- <file> raise <polygon...>
npm run map:resize -- <input> <output> <width> <height> <north_west|north|north_east|west|center|east|south_west|south|south_east>
npm run map:validate -- <file>
npm run map:render -- <file>
npm run map:inspect -- <file> <x> <y>
npm run map:diff -- <before> <after>
```

The exact CLI syntax may be refined in implementation, but every operation must call
the same `MapEditorCommand` functions as the browser. Agent-created maps are therefore
previewable without authentication and remain ordinary reviewable files.

If collaborative anonymous testing is later needed, deploy a separate disposable
editor-test database containing no production accounts or world rows. Database
isolation, reset policy, and a conspicuous sandbox banner are the security boundary.
The production database must reject anonymous editor reducers even when a malicious
client forges the editor UI state.

## 7. Live-world editing and persistence

Live mode uses the same UI and compiler with a `LiveWorldEditorRepository`:

```text
/editor/live
```

The implemented client enters this mode by connecting from `/editor/map`. The route
does not acquire write authority merely by being open: it must have an authenticated
`owner` or `admin` membership. Once connected, object place/move/rotate/flip/scale,
generated-content suppression, terrain edits, undo, and redo all enter the same
debounced publish queue. The editor snapshots each submission, preserves any newer
local commands while that revision is in flight, and advances only after the
subscription observes the exact next revision and semantic hash. A different head is
a compare-and-swap conflict and stops automatic writes until the author reloads or
merges it.

The player authenticates normally. `owner` is implicitly allowed; an owner may grant
a dedicated `world_editor` capability in a new normalized private table. Do not
overload `friend`, Homestead `builder`, or `moderator` permission. Every editor
reducer rechecks the current grant and `ctx.sender`.

### 7.1 Additive schema target

Exact SpaceTimeDB payload types require a scratch binding/publish spike before this
phase. The intended normalized shape is:

| Table                      | Purpose and indexes                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `world_editor_grant`       | private identity PK, granted/revoked by owner; owner implicit                                                |
| `world_map_revision`       | one current revision/header per `spaceId`, generator baseline, content hash, published actor/time            |
| `world_map_chunk_override` | one sparse 16×16 semantic payload per touched chunk; `[spaceId,chunkX,chunkY]` unique/btree, revision/hash   |
| `world_terrain_transition` | sparse semantic crossings, indexed by `[spaceId,chunkX,chunkY]`                                              |
| `world_scenery`            | immutable authored visual/object placements, stable asset id, state/rotation/anchor/elevation, spatial index |
| `world_map_edit_session`   | private draft/session lease, base revision, touched chunks, expiry                                           |
| `world_map_revision_chunk` | private before/after chunk snapshots for verified rollback of the configured recent revision window          |

POIs, portals, NPC/resource/event anchors, and protected regions either use their
existing domain table or a typed new table; do not hide queryable gameplay data inside
the terrain payload. `world_placeable` remains player construction and is not reused
for immutable sanctuary scenery.

Chunk payloads contain compact semantic fields and an override bitset, not pixels or
atlas frames. Choosing bytes/arrays versus a deterministic string encoding is part of
the scratch binding test. The test must measure row size, generated binding behavior,
subscription updates, a populated additive publish, and a 64-chunk transaction before
the schema is accepted.

### 7.2 Draft, validation, and publish

1. Connecting subscribes to the public map head and binds the local draft to its
   current base revision. Browser autosave stores both the canonical draft and this
   base so a refresh can resume safely.
2. Editing continuously validates through pure sim and autosaves locally. In an
   owner/admin live session, completed commands enter a 250 ms coalescing queue;
   disconnected and unauthorized sessions remain local-only.
3. Automatic sync, or the explicit Publish flush, submits the canonical document with
   the expected base revision and a unique client mutation id.
4. Authority recomputes hashes and validates bounds, topology, collision, crossings,
   protected regions, assets, portal reachability, and occupied cells.
5. A stale base revision rejects with `map_revision_conflict`; the editor rebases or
   asks the author to resolve the changed chunks.
6. A valid bounded patch updates current chunk rows, transitions/scenery, revision
   header, rollback rows, and `world_admin_audit` in one transaction.
7. Subscribed clients receive one atomic cache change and invalidate only affected
   ground chunks plus the compiler-declared halo.

The dependency halo is topology-specific: blob/path/river usually need one neighbor;
projected cliffs need at least one neighbor plus the maximum face rows; a stamp declares
its footprint. Dirty calculation is pure and covered by tests.

Publishing defaults to rejecting a patch that would place an online player/NPC inside
new collision, sever a portal pair, cover a protected anchor, or make a required
entrance unreachable. A later explicit owner-only “relocate occupants” option may
move them to the nearest validated tile in the same space/elevation and must be
separately audited. Silent teleport is forbidden.

Large whole-map imports use staged chunks plus a reviewed maintenance publish; they
must not stretch an ordinary gameplay reducer into an unbounded transaction. The
scratch spike determines the safe chunk cap.

### 7.3 Revision and recovery rules

- Normal players see only the current revision and current chunk rows.
- Recent live revisions retain before/after chunk snapshots so Revert creates a new
  audited revision; history is never rewritten in place.
- Revision headers and `world_admin_audit` remain forever. The rollback-payload
  window is a named storage tuning value settled and mirrored in docs/06 before live
  implementation.
- Every successful publish can export the canonical offline map/patch so important
  authored worlds are reviewable and reproducible outside the database.
- Backup/restore acceptance includes map revisions, scenery, portals, grants, and a
  two-client reconnect to the same composition.

## 8. Animated tiles and broader licensed-asset coverage

The editor palette is generated from `asset-registry.json`, not a handwritten list.
It filters by review status, semantic tags, placement layer, topology, animation,
collision recommendation, and compatible terrain family. Animation preview uses
existing atlas metadata:

- loop/fps come from `animationMeta`;
- environmental animations use authority tick plus an optional coordinate hash phase,
  requiring no per-frame database write;
- stateful animations (gate, door, furnace) use authoritative object state;
- collision and light behavior do not oscillate with decorative animation frames; and
- the editor can scrub clock, season, animation time, and object state.

The exhaustive Cute Fantasy index is a **discovery ledger**, not a shipping manifest.
Add a generated coverage report with these states:

```text
catalogued source -> extraction mapped -> reviewed runtime asset
                  -> semantic family mapped -> editor available
```

This supports systematically increasing coverage instead of picking assets ad hoc.
However, importing an entire paid sheet into reconstructable committed text grids may
itself redistribute the pack. Before any bulk import, review the applicable license.
The public repository and production editor may contain only approved semantic
extracts. A local licensed-owner sidecar may show indexed source previews from
`references/`, but it is dev-only, gitignored, absent from production builds, and
never embedded in map exports. Keep Cup Nooble and Kenmi Art credited in the README
and in the in-game credits as required by [11](11-asset-pipeline.md).

### 8.1 Reusable layout studio and Godot TileMap lessons

`/editor/design` is the authentication-free first slice of the scenery/prefab
workflow. It is deliberately **not** the terrain/map painter at `/editor`. The map
painter owns chunks, procedural generation, semantic terrain, rivers, cliffs,
heights, and eventual placement of finished objects. The layout studio owns a
bounded transparent design board where artists assemble and catalogue the reusable
objects that the map painter can place later. Neither editor silently changes the
other's document.

The studio indexes the generated runtime registry, searches semantic names and
tags, previews variants/states/animations, and authors a versioned
`TileObjectWorkspaceV1`. Its top-level contents are:

- loose visual placements, each retaining stable numeric asset id plus asset name,
  named visual group/frame, logical tile position, elevation, layer, rotation, and
  mirror flag rather than an atlas rectangle;
- labelled, coloured collection frames such as Plants, Buildings, or Fences. These
  are an artist's visual filing system, not terrain regions or world authority;
- grouped tile objects which own placement and metadata-cell references, move as a
  unit, may be dragged into a collection frame, and can be exploded back into loose
  pieces without rasterizing or losing their source identities; and
- per-cell signed height plus an explicit row-major 4×4 collision mask. The mask
  represents full, horizontal-half, vertical-half, quarter, or finer authored
  collision without inferring physics from alpha.

Marquee selection turns loose pieces into a named object; Inspect drags a grouped
object as one unit; Explode returns it to editable pieces. A selected grouped object
can be normalized into `MapStampDocumentV1` as the explicit hand-off to the map
painter and later world placement. Atlas packing can therefore change without
invalidating a workspace or exported object. This route cannot publish to a map or
construct a live mutation adapter.

The first slice was checked against Godot's official
[TileMap workflow](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilemaps.html),
[TileSet workflow](https://docs.godotengine.org/en/latest/tutorials/2d/using_tilesets.html),
[TileSet resource](https://docs.godotengine.org/en/latest/classes/class_tileset.html),
and [atlas-source](https://docs.godotengine.org/en/stable/classes/class_tilesetatlassource.html)
contracts. Adopt the transferable ideas without copying Godot's engine-specific
storage:

| Godot capability | Orchard contract |
| --- | --- |
| reusable TileSet patterns | versioned semantic map stamps with a named pivot |
| atlas alternatives and animation frames | searchable visual choices; animations remain one timed semantic choice |
| atlas tiles versus scene-collection tiles | static tiles/sprites versus later entity or prefab templates with state |
| paint, line, rectangle, fill, picker, erase | share one command/history kernel; Ctrl-click picks and right-drag erases in the first slice |
| Connect and Path terrain modes | later semantic blob/path compilers; manual frame audition remains draft-only |
| multiple visible/locked layers | later explicit ground/object/canopy and collision/occlusion layer controls |
| physics, navigation, occlusion, custom data | reviewed asset metadata and inspector panels, never inference from pixels |
| tile proxies | planned stable asset aliases for renamed/retired ids during import and publication |

Next layout-studio slices add copy/paste, a saved object library, transform/pivot
editing, arbitrary 4×4 subcell painting, visible/locked visual and metadata layers,
and distinct stateful entity-template cards. Terrain Connect/Path authoring remains
part of map-editor phases 2–3; the layout studio must not create a second autotiler
or acquire chunk-generation controls.

## 9. Dynamic client delivery

Do not delay the offline editor on an asset-streaming rewrite. The current atlas
manifest and lazy image loading are sufficient for the first terrain laboratory.

Before broad asset coverage materially increases download size, evolve the build into
immutable content-addressed packs:

- asset source metadata gains a `packId` such as `core`, `surface-temperate`,
  `surface-desert`, `cave`, `interior-wood`, `editor-ui`;
- atlas output becomes `pack + category + season + content hash`;
- the manifest maps every stable asset id and terrain theme to its required pack(s);
- each map/space revision declares required packs, and optionally each sparse chunk
  declares extra packs for local scenery;
- the client loads definition plus required packs before revealing a space/revision,
  prefetches adjacent destination packs, caches immutable hashes, and uses the existing
  missing-asset fallback on an unknown id; and
- F3 reports requested/resident pack count, bytes, cache hits, and load stalls.

This is content delivery, not authority. SpaceTimeDB stores stable asset ids and
revision compatibility, never atlas pixels. A normal regional client subscription
gains at most one map-chunk query and remains rectangular/bounded by doc 34; asset
HTTP requests are hash-cacheable and independent of world extent.

## 10. Validation contract

`map:validate` and live Publish run the same checks:

- schema/version, finite bounds, stable ids, and integer-coordinate validity;
- every semantic material/theme/topology pair has complete required role coverage;
- all composed cells resolve without cross-theme frame borrowing;
- every animated role names an animation group and every static role names a
  state/variant group of the correct kind;
- elevation changes only through valid crossings; no orphan slope half, mismatched
  contour level, or ladder/rope without paired anchors;
- render/collision/light height agree, non-height foot rows remain walkable, and
  coordinate lookup determines the same level after teleport;
- current-plane cap edges and lower-plane wall faces block correctly while explicit
  ramps cut both masks;
- paths/rivers have no unresolved bank/corner cells and required water is connected
  unless the map explicitly permits isolated pools;
- portal pairs have walkable arrivals and required return reachability;
- scenery footprints stay in bounds, respect protected regions, and use approved
  runtime assets;
- required spawn/entrance routes remain reachable for the declared movement medium;
- no local source path, token, identity secret, database file, atlas build artifact,
  or `references/` content appears in an exported map; and
- compiler output and content hashes are deterministic on repeated runs.

Warnings include inaccessible decorative pockets, extreme isolated height spikes,
unreviewed local-only assets, collision overrides, missing optional theme roles,
over-dense scenery, and asset packs above their budget.

## 11. Test plan

### Pure sim and tooling

- command determinism; undo/redo and save/load round trips;
- closed-contour raise then lower restores byte-identical semantic chunks and compiled
  plans, including nested positive and negative elevations;
- path and river topology goldens for isolated/end/straight/corner/T/cross, every
  convex and inset corner, width changes, diagonal pinches, bridges, sources, and mouths;
- every registered terrain theme resolves one shared topology fixture to identical
  semantic roles and collision despite different visual assets;
- cave excavation add/remove round trip and complete floor-under-wall composition;
- dirty chunk/halo goldens across chunk boundaries and maximum cliff face depth;
- teleport-to-coordinate height, ramp-only height crossing, per-plane collision,
  water/ground movement-medium, and client/authority compiler equivalence;
- animation group validation and tick/frame determinism; and
- inspector trace order exactly matches the renderer depth/composition order.

### Editor client

- pointer-to-world coordinate conversion at every zoom/DPR and free-camera offset;
- one drag equals one history command; canceled drag changes nothing;
- composed preview and every per-layer visual thumbnail match the selected cell;
- palette filters and missing-role diagnostics;
- every editor action resolves one existing semantic icon and non-empty tooltip;
- the shared route rail uses four distinct, semantically reviewed icons, and unrelated
  actions do not accidentally alias one icon without an explicit registry alias;
- Map, Object, UI Lab, and Character icon contact sheets are reviewed at native 1×
  and integer-scaled sizes in idle, hover, active, and disabled states;
- production editor bundles, network requests, map files, and prefab exports contain
  no composite reference sheet or `references/` source path;
- unsaved-draft protection, autosave isolation, deterministic import/export; and
- the unauthenticated offline route creates no SpaceTimeDB/WebSocket connection and
  exposes no live-publish control.

Rendered review goldens may assert stable hashes and dimensions, but normal client
tests remain logic-layer tests per [15](15-agent-workflow.md). Browser acceptance
captures visual sheets at multiple themes/seasons rather than making fragile pixel
assertions in Vitest.

### Live authority

- owner and explicit grant happy paths; friend, Homestead builder, moderator without
  grant, revoked grant, anonymous, wrong issuer/audience, and stale-session failures;
- validation occurs before writes and rejected publishes add no rows or audit success;
- two editors changing one base revision produce one success and one deterministic
  conflict; rebase preserves unrelated chunks;
- subscribed clients see the old or new revision, never half a revision;
- occupant/protected-area/portal/reachability rejection and audited explicit revert;
- populated additive schema publish, backup/restore, and generated binding regeneration;
- one regional map query, bounded client cache, affected-chunk-only invalidation, and
  zero editor work in scheduled world ticks; and
- two clients in different `spaceId` values never receive each other's override,
  scenery, draft, or edit-session rows.

### Required terrain laboratory

Create `terrain-lab.map.json` early, before editing the live island again. It contains:

- a three-tier mountain and a three-tier lowered quarry/canyon;
- straight, stepped, pinched, concave, convex, one-cell, narrow-neck, and adjacent
  contour cases;
- crossings on every cardinally supported orientation and at every level;
- path widths and every join over grass, sand, cave floor, and raised surfaces;
- a winding river with pond, island, bank insets, bridge, source, mouth, and waterfall
  hooks;
- cave rooms/corridors, supports, water, rails, and animated floor/wall candidates;
- all compatible cliff/shore/path themes shown against a common topology; and
- players, trees, tents, walls, lights, and depth anchors positioned to exercise the
  known occlusion, z-order, and collision failure cases.

This map is the permanent regression surface for tileset work. World-version
regeneration is not the terrain renderer's test loop.

## 12. Performance budgets

- Interactive brush preview: target under 8 ms for a typical stroke update; never
  rebuild outside dirty chunks plus halo.
- Compiled 16×16 semantic chunk including topology/collision/trace: target under 2 ms
  on the docs/21 reference laptop.
- Undo memory is bounded by commands/changed cells; large fills checkpoint a compact
  chunk snapshot instead of one object per tile.
- Offline editor asset/map caches are capacity-bounded and visible in F3/editor
  diagnostics.
- Live gameplay adds no scheduled reducer work and at most one regional map-chunk
  subscription query. Normal clients do not subscribe to grants, sessions, rollback
  history, or other editors' drafts.
- A published patch invalidates only touched chunks plus dependency halo; unrelated
  ground-cache hit rate must not change.
- Asset packs have explicit compressed-byte budgets and no pack may silently turn
  editor-only source discovery data into a normal game download.

## 13. Phased implementation

### Phase 0 — contracts and compatibility spike

- Extract an asset-independent terrain-role result from the existing raised-terrain
  resolver without changing current output.
- Define `MapDocumentV2`, semantic material definitions, theme manifest schema,
  command/diff types, dependency halo, and validation result types in pure sim/tools.
- Prove existing island, cave, collision, lighting, and inspector goldens remain
  unchanged.
- Spike SpaceTimeDB chunk payload/binding/transaction limits, but add no live schema.

**Done when:** current terrain compiles through the semantic-role adapter with
byte-identical plans and a written scratch-spike result names the safe live patch
shape/cap.

### Phase 1 — offline editor and agent terrain laboratory

- Add the authentication-free offline route, free camera, palette/layer/history
  panels, save/load/import/export, surface pencil/fill, and pinned visual inspector.
- Add headless map commands and `terrain-lab.map.json` with the mountain/quarry and
  current cliff/cave fixtures.
- Show absolute height and current-plane collision overlays.

**Done when:** an unauthenticated browser/agent creates a map, edits it through both
CLI and UI, gets identical hashes, sees composed/per-layer visuals, and no
SpaceTimeDB/WebSocket connection is attempted.

### Phase 1.1 — signed document bounds and canvas handles

- Add doc 43's shared signed floor-div/mod coordinate kernel and `MapDocumentV3`
  import/export; V2 imports at signed minimum `(0,0)`.
- Allow camera pan and viewport/memory-bounded zoom beyond every finite map edge.
- Replace the resize button bank with a visible bounds frame and four edge/four corner
  drag handles. Preserve retained world coordinates; make whole-document rebase a
  separate command.
- Generated sanctuary spaces expose sparse editable regions rather than pretending
  the seed world has a resizable outer canvas.

**Done when:** handles pick correctly at every zoom/DPR/elevation, signed crops undo
exactly, negative-coordinate documents round-trip canonically, and the legacy V2
laboratory opens without visual or semantic drift.

### Phase 1.2 — offline seed-world materialization inspector

- The canonical `/editor` route defaults to the procedural sanctuary and can run on
  the same shared Vite application or its optional `npm run editor:dev` port.
- `/editor.html` remains a compatibility entry only and immediately canonicalizes to
  `/editor`; editor maps are pathname resources rather than query-selected apps.
- It displays an unbounded signed chunk plane backed by a sliding, bounded renderer
  composition cache. That cache is an implementation detail and never appears as a
  selectable, clipped, or stone-lined map edge. Seed-derived chunks are editor-local
  cache state, not authored map cells.
- Ungenerated chunks are matte-masked and outlined. Selecting one shows its signed
  chunk/world-tile coordinates and a **Generate Chunk** action.
- Generate evaluates that chunk's deterministic payload plus topology apron, retains
  the payload in local editor storage, and performs no WebSocket or database write.

**Done when:** a fresh editor shows the generated origin surrounded by outlined
unmaterialized chunks; Generate reveals the selected payload without a seam or fake
boundary cliff; reload preserves the local materialization set; the inspector reports
signed coordinates; and network evidence contains no SpaceTimeDB request.

### Phase 1.3 — editor-wide semantic icon audit

- Add the shared semantic editor-icon registry and move route rail, command strips,
  tools, layer controls, tabs, and inspector actions onto it.
- Audit Map, Object, UI Lab, and Character against §5.4, replacing repeated,
  misleading, or generic placeholders with reviewed exact matches from the expanded
  reference catalogue.
- Import only the selected native 16 px cells with provenance and licence status;
  retain Lucide only for documented gaps awaiting a clearer reviewed pixel icon.
- Generate per-route contact sheets showing icon, semantic id, label, tooltip, source,
  and all interactive states, and review them at 1× before accepting the mapping.

**Done when:** every editor action and route has a distinct or intentionally aliased
semantic icon, all icon-only controls have matching tooltips/accessibility labels,
all four route contact sheets pass review, and the production build contains no raw
reference sheet or local reference path.

### Phase 2 — semantic paths, rivers, and terrain-theme swapping

- Add path/river strokes, closed banks, blob/inset cleanup, theme manifests, role
  coverage matrix, alternate-theme preview, animation scrubber, and WHY THIS TILE
  traces.
- Map the current grass/path/shore/cave/cliff assets first; add other themes only
  after complete validation.

**Done when:** every topology in the laboratory swaps among compatible themes without
changing semantic/collision hashes, and path/river transitions require no manual edge
tile placement.

### Phase 3 — height authoring, crossings, and collision

- Add contour-lasso raise/lower, brush/flatten/smooth, nested negative/positive
  levels, all crossing kinds, current/all-plane collision views, and cave excavation.
- Route renderer, authority fixture collision, lighting height, and inspector through
  the shared compiled chunks.

**Done when:** three-tier mountain and quarry can be produced from flat ground,
raise/lower round-trip byte-identically, teleport resolves the correct height, and
client/authority movement agree at every edge/crossing.

### Phase 4 — authenticated live revisions

- Land the additive schema/bindings from §7 after the scratch spike; owner/grant
  administration; edit sessions; bounded publish; audit; conflict/rebase; revert;
  regional subscription; cache invalidation; backup/restore.
- Support editing existing sanctuary/test/live spaces, but keep ordinary players on
  the last published revision while a draft is open.

**Done when:** two authorized editors and two observing clients pass the conflict,
atomicity, auth-failure, restart, and cross-space fixtures; anonymous offline mode
still has no live adapter.

### Phase 5 — scenery, POIs, objects, and gameplay anchors

- Add static scenery placement, prefab stamps, portals/return validation, protected
  regions, spawn/NPC/event/resource anchors, labels, and sanctuary POI composition.
- Reuse asset placement metadata and keep player `world_placeable`/Homestead build
  permissions separate.

**Done when:** the editor authors a small sanctuary plus forest/cave/town destination
loop, all entrances have reachable returns, and live mutable entity state survives a
map revision without duplication or deletion.

### Phase 6 — coverage and dynamic delivery

- Add licensed-source coverage reports, reviewed batch extraction workflow, semantic
  family backlog, content-addressed asset packs, dependency loading/prefetch, budgets,
  and cache metrics.
- Run license review before any bulk paid-pack import; never commit or serve source
  sheets.

**Done when:** an active space downloads only core plus its declared packs, missing or
newer asset ids fail visibly but safely, and the public repository contains no
redistributable source corpus.

## 14. Recommended first slice

Implement **Phases 0–1 only** first. They deliver the most useful debugging surface
without schema, migration, authentication, or live-world risk:

1. semantic role trace around the current terrain compiler;
2. `MapDocumentV2` plus pure command/undo/validation functions;
3. the no-auth offline route and headless agent commands;
4. the permanent three-tier mountain/quarry terrain laboratory; and
5. the inspector's composed tile, per-layer visuals, collision planes, height, and
   WHY THIS TILE trace.

Then fix and validate current cliff mappings in the laboratory. Path/river brushes
come next, followed by live publication only after the compiler and sandbox are
boringly deterministic. This order avoids using the current live overworld as a map
editor test fixture and preserves the security and migration contracts while the
tool is still changing quickly.

## 15. Bookkeeping when implementation starts

- Add this document to [00](00-overview.md) and claim a new roadmap milestone in
  [14](14-roadmap.md) only when implementation begins; both files currently carry
  concurrent-agent work and were intentionally not edited for this planning draft.
- Add tuning values to [06](06-progression-economy.md) only when selected (history
  window, patch cap, asset-pack budgets), with matching golden tests.
- Update [11](11-asset-pipeline.md) for the final terrain-family schema and licensed
  import guard; [21](21-unified-renderer.md) for compiled authored chunks;
  [30](30-infinite-terrain.md) §7 for the refined chunk override shape; and
  [40](40-sanctuary-overworld-and-zoned-world.md) when live sanctuary authoring lands.
- Regenerate client bindings after every additive schema phase and rehearse against a
  populated scratch database per [08](08-database.md).
- Append `DECISIONS.md` only for adopted deviations. This planning document requires
  no deviation entry by itself.

## 16. Verification log

### 2026-08-27 — Phases 0–1 foundation / first runnable editor slice

- Added pure `MapDocumentV2`, semantic material and theme-role contracts, canonical
  serialization/hash, deterministic line/polygon/fill commands, undo/redo, dependency
  halos, height-plane collision, validation, and an asset-independent WHY trace around
  the shipped raised-terrain resolver. `packages/sim` remains DOM/filesystem/database
  free.
- Added the deterministic `terrain-lab` factory with a three-tier mountain, three-tier
  quarry, concave/pinched/stepped fixtures, and twelve validated two-lane transition
  endpoints. `npm run map:create -w @orchard/tools -- terrain-lab <file>` emits the
  canonical diffable `.map.json`; the checked source is the compact deterministic
  factory rather than a duplicated 143 KB generated file.
- Added `map:create`, `map:stroke`, `map:contour`, `map:validate`, `map:render`,
  `map:inspect`, and `map:diff`. The initial lab hash is `4d4e87e4`; headless validation
  reports zero issues and its SVG review render is disposable output.
- Added `/editor/terrain`. It branches before OIDC session
  discovery, loads no account/overworld/SpaceTimeDB module, exposes no reducer adapter,
  and supplies free camera, brush/fill, contour raise/lower, collision override,
  undo/redo, local save/load, JSON import/export, absolute-height/current-plane
  overlays, and a pinned composed/per-frame/WHY inspector.
- Shared-browser verification on `https://orchard.dastari.net` loaded the route with
  the loading screen dismissed and a non-empty Canvas, fetched no SpaceTimeDB or live
  client module, opened no WebSocket, and persisted a UI edit as revision 1 without an
  account. Focused sim/client tests cover canonical round-trip/hash, CLI/UI command
  rasterization, history, height collision, dependency halo, transition validation,
  semantic trace, route sanitization, and the no-live-import boundary.
- Repository verification passed `npm run check` (118 files / 733 tests, all
  typechecks, lint, SpaceTimeDB module build, coverage, and 556-asset validation) and
  the complete production build. Vite emits the editor as an 18.15 kB lazy chunk;
  normal account/overworld entry chunks are not dependencies of the offline route.
- No database schema, binding, reducer, live map write, licensed source-sheet path, or
  `references/` asset was added. The SpaceTimeDB payload-limit scratch spike, a checked
  serialized laboratory fixture, full cave/path/river topology coverage, theme
  swapping, and authenticated publication remain open follow-ups; phases 2–6 have not
  started.

### 2026-08-27 — Elevated picking, relative resize, and cliff seam follow-up

- Elevated pointer hits now invert the renderer's height projection and choose the
  topmost visible logical surface; a drag remains locked to its pointer-down plane.
- The offline editor can grow or crop each physical map edge by one tile, or eight
  with Shift. Cells, crossings, scenery, gameplay anchors, selection, and camera are
  translated together during the resize; the document change participates in exact
  undo/redo. The same
  operation is available through `map:resize` with all nine content anchors.
- Translucent side-cap tiles which overlap a projected cliff face now receive the
  matching rocky face-row underlay. Genuine exterior transparency remains intact and
  the cosmetic non-height foot/shadow row is never promoted into an underlay.

### 2026-08-27 — Procedural chunk inspection

- Added the standalone `editor.html` compatibility entry and `npm run editor:dev`
  port-5174 command.
- The seed preview opens with chunk `0,0` materialized inside a 25×25 signed chunk
  inspection window. Ungenerated chunks are masked, outlined, labelled, and selectable.
- The inspector reports signed chunk/world-tile coordinates and locally materializes
  a selected payload through **Generate Chunk**. Generated keys persist in local
  storage; deterministic apron samples prevent fake edge contours.
- Public-browser verification on `https://orchard.dastari.net/editor` generated
  chunk `1,0`, reported no Canvas render error, and fetched no SpaceTimeDB/API resource.
- `npm run check` passed: **123 test files / 768 tests**, all typechecks, ESLint,
  SpaceTimeDB module build, coverage, and 556-asset validation.

### 2026-08-27 — Seed overview and game-scale editor chrome

- The editor drawers now use the game's wood/parchment panels, ribbons, buttons, and
  supplied bitmap fonts at a 200% baseline. Both drawers reserve independent side,
  scrollbar, and bottom safe areas; clipped content scrolls without crossing the
  decorative frame.
- Procedural worlds expose no finite resize controls. Finite authored maps retain the
  existing grow/crop controls for interiors and test spaces.
- Procedural zoom now spans 1/32×–8×. Detailed terrain remains active while it fits
  the renderer's backing-store budget, then switches to a direct biome/chunk overview;
  chunk selection and the inspector retain materialization state without stretching a
  clipped world pass. Per-tile grid/height/collision overlays pause in this distant
  overview.
- Partial cache chunks no longer paint fallback water or cliff material beyond a
  finite authored map's width or height.
- Distant procedural overview now renders a cached 2×2-tile semantic seed raster
  across generated and ungenerated chunks. It shares the review-map biome and
  hydrology palette, so rivers, ponds, lakes, oceans, and biome boundaries remain
  continuous without materializing durable chunks. Repeated chunk veils, hatching,
  labels, and borders are hidden at this LOD; only the selected chunk is outlined.
- Public-browser verification at 0.182× and 0.03125× showed the continuous river and
  biome preview with no console errors. The 400×400-tile editor window samples to a
  cached 200×200 image; equivalent CLI generation completed in 0.39 seconds including
  npm/TypeScript startup. `npm run check` passes: **125 test files / 788 tests**, all
  typechecks, ESLint, SpaceTimeDB module build, coverage, and 556-asset validation;
  the production client build also passes.

### 2026-08-27 — Professional terrain dock and topology-scale follow-up

- Map identity moved out of the scrolling left drawer into a floating, game-skinned
  viewport plate. The left dock now uses a two-row icon toolbar backed by reviewed
  Cute Fantasy tool/cursor assets, a previewed terrain-family dropdown, and an
  explicit Auto Edges / Manual Roles topology control. Licensed discovery sheets
  remain under ignored `references/`; no bulk source sheet entered the browser build.
- The family dropdown covers Grass 1–4, Desert 1–3, ShroomLands variants, Volcano,
  and the snow-highland semantic family. Family colours are previews while complete
  role manifests and reviewed extracts remain the authority for publication.
- The owner-supplied `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/*.webp` sheets are a source-only
  icon intake backlog. Each chosen icon must be split on the art grid, have its flat
  preview background removed, receive a semantic asset id and provenance, and pass
  normal alpha/palette/render review; the editor never downloads or displays those
  composite sheets directly.
- Auto Edges remains the operational semantic brush path. Manual Roles is visibly
  draft-only until the role palette and completeness validator land, so it cannot
  masquerade as publishable raw frame authority.
- Verification passed with the SpaceTimeDB module build, all workspace typechecks,
  ESLint, **125 test files / 793 tests**, coverage, and validation of 556 art assets.

### 2026-08-27 — Fixed command strip and compact diagnostics follow-up

- Undo, redo, local save/load, and JSON export/import moved into a fixed two-row icon
  group above the left dock's scroll viewport. Scrolling a long terrain-family list
  no longer moves these commands off screen.
- Grid, height, and collision became stateful square icon toggles beside the editing
  tools (`G`, `H`, and `C`; legacy `B` remains a temporary collision shortcut).
  Permanent WASD/help/debug copy was removed from the drawer. Hover help for every
  compact control appears in the shared bottom status plate with tool, plane, and zoom.
- Terrain-family rows now have separate family and material-detail lines at nearly
  twice their former height. The top metadata and bottom status bars use the same
  `frameThin` helper as the in-game wallet, including safe content insets, clipping,
  fitted text, and left alignment.
- Repository verification passed `npm run check`: **125 test files / 802 tests**,
  all workspace typechecks, ESLint, SpaceTimeDB module build, coverage, and 556-asset
  validation. One wildlife test exceeded its timeout on the first loaded run, passed
  in isolation, and the complete gate then passed unchanged.

### 2026-08-27 — First-class editor pathname routes

- The shared client now resolves `/editor/terrain` and `/editor/terrain/<map-id>` before OIDC
  or account startup. `/editor` selects the procedural seed world; the terrain test
  map is `/editor/terrain`. Optional state such as `?seed=...` remains a
  query parameter, but application and map selection are pathname-owned.
- The former query-only URL and `/editor.html` remain compatibility entries and
  immediately replace themselves with the canonical pathname. `/editor/live` is
  reserved for the future authenticated repository and cannot inherit the anonymous
  bypass, even if legacy offline parameters are appended.
- Focused route tests pass (4/4), client typecheck and production build pass, and
  direct public-browser loads/refreshes of both canonical routes rendered without a
  Canvas error or account, overworld, or SpaceTimeDB resource request. The complete
  repository gate passes: **127 test files / 820 tests**, all workspace typechecks,
  ESLint, SpaceTimeDB module build, coverage, and 557-asset validation.

### 2026-08-27 — Unbounded seed canvas, recursive grid, and numeric seeds

- Removed the user-visible 25×25 inspection boundary. Detailed terrain now uses a
  25×25 composition cache which recentres beneath a signed world-space camera; distant
  overview rasters are generated for the current signed viewport. Neither path draws
  an artificial outer stone contour or grey overflow apron.
- Chunk selection has separate visible-flat and generated-elevated paths. Inverse
  height projection is accepted only when the source payload is generated; a hidden
  elevated apron can no longer redirect a click from chunk `10,-10` into `10,-9`.
- The chunk grid is on by default, recursively coarsens in powers of four as the
  editor zooms out, and gives the signed X=0 and Y=0 axes the strongest weight. The
  Grid toggle hides it explicitly; close zoom retains the ordinary per-tile grid.
- Editor seeds are canonical unsigned 32-bit integers. Legacy text seed
  `orchard-sanctuary-20` canonicalizes to `2098878576` while producing the identical
  normalized world. A compact Randomize command warns that unsaved work will be lost,
  resets local materialization to origin chunk `0,0`, updates the URL, and regenerates
  the overview without touching SpaceTimeDB.
- Ungenerated chunks retain their deterministic one-pixel-per-tile biome, surface,
  water, and elevation preview at every zoom level. Generate Chunk atomically swaps
  that preview for full tile composition; merely viewing it creates no durable data.
- Focused editor verification covers distant signed chunk materialization, sliding
  composition invariance, dynamic signed overview bounds, recursive grid intervals,
  numeric legacy-seed equivalence, and the apron-picking regression.

### 2026-08-28 — Asset palette and reusable layout-stamp foundation

- Added `/editor/design` and `/editor/design/<stamp-id>` as authentication-free,
  pathname-owned routes which branch before OIDC and load no SpaceTimeDB/live-world
  module. The existing `/editor` terrain workflow is unchanged.
- Added a generated-registry palette covering 291 authoring assets and 1,419 visual
  choices in the current 574-asset registry: 1,113 tile, 254 prop, 41 tree, 6 crop,
  and 5 building choices. Search includes semantic name, category, visual group, and
  tags; category filters and virtualized scrolling keep the full catalogue usable.
- Added an offline game-skinned design board with stamp/inspect/erase/pan, Ctrl-click
  picker, right-drag erase, asset and composed-layout previews, semantic metadata,
  zoom/pan, undo/redo, local autosave, portable import/export, and retained view,
  search, selection, tool, and palette state across refresh.
- Added pure `MapStampDocumentV1` parsing, validation, canonical ordering, no-op-aware
  placement updates, and tests. Saved layouts reference stable semantic asset and
  visual identities rather than disposable atlas coordinates.
- Godot's patterns, alternative tiles, terrain Connect/Path modes, scene-collection
  split, editor tools, metadata layers, and tile proxies were reviewed against the
  Orchard architecture. §8.1 records what landed now and what belongs in later
  palette, prefab, and terrain phases.
- Shared-browser verification at `https://orchard.dastari.net/editor/design/godot-study`
  loaded the complete palette with no OIDC, account, overworld, or SpaceTimeDB
  resource, placed a camp tent, and persisted the semantic draft plus view/search/
  selection session across refresh. `npm run check` passes: **143 test files / 925
  tests**, all workspace typechecks, ESLint, SpaceTimeDB module build, coverage, and
  validation of 574 art assets; the production client build also passes.

### 2026-08-28 — Tile-object layout workbench foundation

- Split the reusable-object workbench contract from the terrain painter explicitly:
  `/editor/design` stores `TileObjectWorkspaceV1`; `/editor` continues to store and
  compile map/terrain documents. No chunk, biome, river, cliff, seed, or live-world
  behavior was added to the layout studio.
- Added labelled coloured collection frames, loose-piece marquee selection, named
  grouped tile objects, unit movement, frame assignment on drop, and lossless
  explode back to editable pieces. Existing `MapStampDocumentV1` drafts import as
  loose pieces for compatibility; a finished grouped object exports through the
  map-stamp boundary rather than becoming terrain implicitly.
- Added per-object-cell signed height and explicit 4×4 fractional collision data,
  with quarter combinations for half/full masks in the first inspector UI. Canvas
  overlays show the selected cell's occupied subcells without reading sprite alpha.
- Added pure parsing, relationship validation, canonical serialization, move,
  group, explode, migration, and object-export tests. The authentication-free route
  continues to import no identity, account, SpaceTimeDB, connection, or reducer code.

### 2026-09-02 — Map Editor, Object Studio, and revisioned live-island implementation

- Canonical routes are now `/editor/map`, `/editor/object`, `/editor/ui-lab`, and
  `/editor/character-studio`. Map Editor defaults to the sparse `live-island`
  overlay; the old Terrain Editor fixture remains explicitly addressable as
  `/editor/map/terrain-lab`. Legacy path aliases are sanitized compatibility paths.
- `MapDocumentV3` adds ordered generated-base, terrain, ground, objects, gameplay,
  player-owned, canopy, and anchor layers; semantic biomes; embedded `MapPrefabV2` documents;
  transformed object instances; and reversible generated-object suppressions. A
  pinned `survival-island` provenance resolver keeps the 832×832 generated base
  implicit, so a live document serializes authored differences rather than hundreds
  of thousands of unchanged cells.
- `MapPrefabV2` is the shared Object Studio / Map Editor / server contract. It carries
  stable semantic asset references, a pivot, rotation/flip-safe 4×4 collision masks,
  elevation, tags, a coloured collection label, and allowlisted behaviour metadata.
  Map documents embed the exact prefab revision used by each instance; they never
  persist a bare sprite or atlas rectangle.
- Object Studio now provides a 128×96 general canvas, Shift-add and Ctrl/Cmd-toggle
  selection, marquee selection, batch movement, grouping/explode, pivot editing,
  rotate/flip, per-cell elevation and fractional collision, coloured labelled
  collection frames with drag/resize/rename/colour/delete, collection assignment by
  dropping an object into a frame, portable workspace import/export, and direct
  prefab export. Ground/object/canopy target layers have independent visibility and
  move the current selection when retargeted.
- Map Editor has explicit Terrain, Objects, Biomes, and Scatter workspaces; independent
  content-layer visibility; ground/object/gameplay/canopy placement targets; prefab
  collection/tag filtering; select/drag/rotate/flip/delete object editing; semantic
  biome paint and flood fill; and deterministic polygon scatter with density, biome,
  spacing, rotation, and flip constraints committed as one undoable command.
- Finite authored maps use the central canvas between the editor drawers as their
  camera viewport. `Home` or unmodified `F` frames the complete non-ocean island
  with a small water margin, undersized axes remain centred, and camera clamping
  prevents exposed backing-store void. Below 0.5x zoom the renderer switches off
  world-object sprites and selection handles; distant terrain uses a cached semantic
  overview raster instead of overflowing the detailed renderer's finite backing store.
- The live-island editor composes the existing generated terrain, scenery, and
  resources. Generated resources/decorations can be selected and suppressed without
  deleting generator data; undo restores them. Suppression is respected by editor
  preview, game rendering, light occlusion, client targeting/prediction, server
  collision, gathering, harvesting, and fishing.
- The shared editor-icon registry now owns route, workspace, command, display,
  visibility, and layer concepts. Reviewed Orchard/Cute Fantasy pixel icons are used
  for route/workspace identity; permissively licensed Lucide SVGs fill small command
  gaps (`undo`, `redo`, local save/load, import/export, seed randomize, grid, height,
  collision, auto-edge, layers, visibility, live connect, and publish). Every compact
  control supplies a matching hover tooltip; semantic ids prevent unrelated buttons
  from independently choosing the same “close enough” glyph. New icon choices must
  follow §5.4 and the expanded reference contact-sheet review before adding a fallback.
- Live publication uses public atomic `live_map_document` heads, private append-only
  `live_map_revision` history, canonical hashes, idempotent client mutation ids,
  compare-and-swap expected revisions, owner/admin authorization, behaviour/content
  limits, immutable rollback history, and permanent admin audit rows. An editor which
  has fallen behind refuses to publish until it reloads or merges the newer head.
- The ordinary game client subscribes only to the `live-island` head. A row update
  atomically recompiles terrain and embedded object collision, invalidates prediction
  and render caches, draws prefab instances in the world depth queue, and applies the
  same 4×4 object masks and generated suppressions on SpaceTimeDB authority. Invalid
  dimensions, seed/version provenance, prefab references, or behaviour archetypes are
  rejected before the head advances.
- Tests cover V2 migration, V3 canonical round trips and hashes, generated-base
  resolution, prefab transforms/collision, workspace grouping/collections, scatter
  determinism, routes, semantic icon completeness, UI hit targets/tooltips, live auth,
  compare-and-swap/audit schema shape, and client/server live collision wiring.
- Shared-browser verification at the canonical Orchard URL exercised all four Map
  workspaces, generated-base layer visibility, semantic hover help, and the complete
  Object Studio authoring path: draw and label a coloured collection, stamp multiple
  pieces, marquee-select them, and convert them into a named reusable object with
  generated 4×4 collision cells. The production build, SpaceTimeDB module build,
  all workspace typechecks, ESLint, and asset build pass. The final uninterrupted
  repository gate passes **232/232 test files and 1,475/1,475 tests**, with 90.6%
  statement / 94.56% line coverage and validation of 956 art assets.

### 2026-09-02 — Live command sync and selection-focused Map Editor follow-up

- Connected owner/admin sessions now automatically publish completed terrain and
  object commands after a 250 ms quiet period. In-flight snapshots are hash-checked;
  edits made during a reducer transaction remain queued for the next revision instead
  of being replaced by the arriving subscription update. The existing Publish icon
  flushes the queue immediately, and compare-and-swap still rejects a concurrently
  advanced head.
- Finite-map drafts autosave after terrain and object changes. The editor also stores
  the live base revision, so refreshing after hiding, moving, or deleting an object
  resumes against that same head. A genuinely newer server head produces a conflict
  instead of silently restoring or overwriting content.
- Object, Biome, and Scatter libraries now live exclusively in the left drawer. The
  upper half of the right drawer is a selection inspector: authored objects show a centred sprite,
  identity, coordinates, elevation, layer, prefab revision, rotation, flip, 1x/2x
  scale, visibility, footprint/tags/behaviours, and framed action buttons. Generated
  resources and decorations expose provenance and reversible suppression metadata;
  terrain selection retains its full composition/WHY inspector.
- The Map Editor semantic icon registry now covers every terrain tool, workspace,
  target layer, live/file command, visibility state, and object action with distinct
  reviewed runtime or documented Lucide SVG symbols. Text is no longer overlaid on
  icon buttons, button frames remain game-native, and every compact action has matching
  hover help.
- The reviewed map asset catalogue contributes 4,044 prefab visual entries in the
  current build. Catalogue sorting/model creation is cached and clipped palette tiles
  are virtualized so the expanded reference set does not become a per-frame Canvas
  cost.
- The full repository gate passed the SpaceTimeDB module build, all workspace
  typechecks, ESLint, **234/234 test files and 1,492/1,492 tests**, coverage thresholds,
  and validation of 956 art assets. The final disabled-control hover-help addition
  then passed client typecheck, 37 focused tests, and the production client build.
  Canonical-browser checks cover generated and authored selection inspectors, a
  1x-to-2x object transform, disabled-button hover help, the populated palette,
  autosave restoration across refresh, and zero console errors.

### 2026-09-03 — Editable authored landmarks and immediate object curation

- Farmer Bob's farm, Marlow's camp, and Fisherman Fin's camp are now explicit
  authored-landmark instances in `MapDocumentV3`. Each fixed prop keeps its
  specialized world artwork while gaining a stable map id, named group, layer,
  coordinate/elevation, rotation, flip, scale, and visibility. They can be selected,
  dragged, cloned, transformed, hidden, or deleted like other authored map content.
- Seeded nature dressing and resource spawns remain procedural. Their Delete and Hide
  actions both create a reversible suppression; they are never mislabeled as editable
  landmarks. Older live documents are upgraded on read, including translation of an
  existing landmark suppression into the landmark's persisted visibility.
- The game renderer replaces the legacy fixed-location stream with the published
  landmark instances, while client prediction and SpaceTimeDB authority remove the
  original landmark obstacles and install the edited collision silhouettes. Fisherman
  dock walkability follows the current authored dock position.
- Object-only commands no longer recompile the complete 832×832 terrain. Selection,
  autosave, and the local canvas update immediately; connected sessions still coalesce
  publication for 250 ms in the background. Terrain and biome commands retain the full
  terrain invalidation path.
- Full-size icon actions now use the shared semantic icon-button renderer. Its danger
  tone owns the deny frame and high-contrast white glyph treatment, so Delete behaves
  consistently in every canvas UI instead of hand-painting a red frame around a dark
  icon.

### 2026-09-03 — Live player placements and elevation-correct targeting

- A connected live-island Map Editor also subscribes to top-side homesteads, crafted
  placeables, chests, archery targets, and player-built surfaces. They render in the
  same elevation-aware depth queue as map content, have mint selection outlines, and
  expose identity, owner/state, tile, elevation, and persistence metadata in the
  Selection Inspector.
- Player placeables, chests, targets, and surfaces are deliberately read-only in the
  Map Editor. Their disabled clone/delete/hide/transform actions distinguish
  player-owned database authority from authored map-document content. Homesteads are
  the narrow exception: an owner/admin may drag their durable overworld marker using
  the audited relocation reducer described below.
- Pointer targeting now reverses the active terrain plane's visual projection before
  sending a logical tile to placement reducers. Placement reticles apply the matching
  projection when drawn. A tent placed on elevation L2 therefore previews, persists,
  collides, portals, and renders against one anchor instead of being stored two rows
  north and shifted north a second time during presentation.
- Existing homesteads created by the old projected-pointer path retain their persisted
  coordinates. They should be corrected as an explicit audited data repair after the
  affected owner/row is confirmed; the client does not guess and migrate every
  elevated homestead because facing-keyboard placements were already correct.

### 2026-09-03 — Audited homestead relocation and Photoshop-style content layers

- `admin_move_homestead` is an owner/admin-only SpaceTimeDB reducer. It validates the
  complete 3×4 marker reservation against map bounds, terrain collision, authored and
  dynamic obstacles, online players, named-location reservations, neighbouring
  homesteads, and a single flat terrain elevation. It then updates the homestead row,
  top-side entrance portal, and return portal atomically and appends a permanent world
  administration audit row. Any failed validation rolls the entire transaction back.
- In the connected Map Editor, selecting a homestead exposes owner, identity, space,
  access, coordinate, and elevation data. Owners/admins can drag it; the click offset
  is retained when grabbing the visible roof, and the preview outlines the complete
  reservation rather than jumping the anchor to the pointer. The subscription update
  makes the new location visible to every connected game and editor client without a
  map-document publish or page refresh.
- Player-owned live state has its own read-only `player_owned` content layer instead
  of sharing the authored gameplay layer. Older V3 documents acquire this default
  layer during normalization, so visibility and session state remain backward
  compatible.
- The right drawer is split into independent half-height frames: Selection Inspector
  above and an ordered content-layer stack below. The highest rendered layer appears
  at the top, the eye control toggles visibility without changing selection, and
  clicking the rest of a row makes it the active working layer. Read-only generated
  and player-owned rows can be inspected/hidden but cannot accept prefab placement.
- The left Object/Scatter library uses the actual first prefab sprite as a framed icon
  tile, with the semantic package icon only as a loading or missing-art fallback.
  Collection filters and hover tooltips retain the prefab name without turning the
  palette back into a wall of text.
- Verification passes the SpaceTimeDB module build, all workspace typechecks, full
  ESLint, the production client build, and **237/237 test files with 1,520/1,520
  tests**. The shared-preview automation endpoint was unavailable for the local route,
  so no visual-browser claim is made for this follow-up.

### 2026-09-04 — Canvas eyedropper parity boundary

- The Studio Map Editor now exposes an icon-only, tooltip-labelled eyedropper beside
  palette search, with `I` to toggle and `Escape` to cancel. Sampling is one-shot on
  success and changes only editor selection/tool state: document revision, hash, and
  undo history remain unchanged.
- Terrain/Biome sampling resolves the composed cell and can select represented
  surface, path, ledge, collision, biome, and elevation semantics. A generated-base
  sample targets the editable Terrain layer. Object/Scatter sampling uses visible
  authored objects' transformed footprints and selects the embedded prefab plus its
  actual authored layer; live/generated rows remain non-editable.
- Raw atlas `terrainOverride` substitutions and farmland are not represented by the
  current left palette or its commands. Those clicks deliberately leave the sampler
  armed rather than mapping to a visually similar but semantically different tool.
  Focused repository tests cover this boundary; no deployed-browser claim is made.
