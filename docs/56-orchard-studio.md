# 56 — Orchard Studio: One Development and Operations Environment

Plan, **2026-09-03**. Status, **2026-09-04**: **in progress; sole-canvas production
Studio and Stage A through verified `placeable_reads` are complete; authenticated
live-tool acceptance and chest finalization/retirement remain as formal release
gates, while the Map Editor still has explicitly recorded repository refinement
work**. Owner
decisions 2026-09-03: Studio lives at its own hostname; every editor surface moves,
including Character Studio and the audio preview; the game keeps **no** `/editor`
routes; the `support` grant ships in Phase 2; Studio keeps the Map Editor's visual
language and side rail, adopts Godot's dock workflow (§4.2), and treats live-world
editing as the normal case (§4.3). Companion to
[55](55-game-authoring-suite.md), which specifies *what* is authored (content
registry, behaviour graphs, frames). This document specifies *where* it all lives:
a separate Studio application that unifies map, object, tile, behaviour, quest, and
content authoring with live player support, world administration, and observability,
and the backend administration API that the operator tools need.

**Relationship to [55](55-game-authoring-suite.md):** one application. This document
is the application: package split, shell, visual language, deployment, administration
API, and operator tools, and it is the plan that removes `/editor`. Doc 55 is the
content and behaviour system that Studio's Author mode edits; its studios register as
Studio tools (§4.2, §6.2) and have no routes of their own.

**Owner migration invariant (2026-09-03):** any amount of planned downtime is acceptable; loss or replacement of the original world is not. Before a Studio, binding, authentication, administration, or content rollout returns traffic, operators verify a restorable backup, publish without `--delete-data`, compare durable state before and after migration, and prove that existing clients can reauthenticate and resubscribe with inventories, equipment, wallets, quests, homesteads, placed objects and their contents/process state, positions, and all other durable rows intact except for intentional migrations.

Builds on [09](09-auth.md) (roles, audited owner reducers), [42](42-world-editor.md)
(Map Editor, Object Studio, live publish), [50](50-unified-elevation-terrain-plan.md)
§4 and §7 (tileset family registry; editor as terrain test bench), [53](53-spacetimedb-optimization-plan.md)
(index discipline, T8 CLI-only admin reducers), [34](34-backend-scalability.md)
(subscription budget), [08](08-database.md) (private-by-default tables, views).

## 1. Goal

One application, one login, one live session, that an owner, admin, or granted
editor opens to do all of the following without SSH, `spacetime call`, or a rebuild:

- **Build** the world: terrain, elevation, tiles and tileset families, authored map
  objects, prefabs, landmarks, spaces, portals, spawn rules.
- **Author** content: items, recipes, prices, processes, object components and
  behaviour graphs, frames, NPCs, dialogue, quests, loot, crops, creatures, balance.
- **Operate** the live world: find a player, see exactly what they have and where they
  are, fix what is stuck, grant or correct gold, stats, skills, and quests, inspect and
  repair chests and stations, move or replace objects, relocate players and NPCs,
  change time and weather, post notices, manage membership.
- **Observe**: who is online, tick telemetry, audit history, revision history, errors.

Every operator action is authoritative, audited with a reason, previewed before
commit where it changes a player's state, and reversible where the inverse is
well-defined.

## 2. Findings (pre-extraction baseline, 2026-09-03)

This section records the repository state that motivated the plan. It is historical;
the authoritative current implementation boundary is §13.

### 2.1 The editor at plan start

Five surfaces (Map Editor, Object Studio, UI Lab, Character Studio, and the
uncommitted Item & Recipe Studio) live inside `packages/client` as extra routes of
the game bundle: `main.ts` dispatches `/editor/*` to dynamic imports, and a second
`editor.html` document boots the Map Editor without the game. Total editor code is
~16,800 lines plus ~1,700 lines of tests. The workbench rail, route parser, session
autosave, icon registry, and live connection wrapper are already shared shell pieces.

### 2.2 Coupling is downward, not lateral

Nothing in `src/render`, `src/ui`, or `src/editor` imports game state; the only
reference to `overworld-main.ts` anywhere is the dynamic import in `main.ts`. The
editor's live-world coupling is confined to `editor-live-connection.ts` (three OIDC
symbols, generated bindings, two reducers). Extracting the editor therefore costs
moving shared *presentation* code, not untangling game logic:

| Shared code a separate Studio needs | Lines |
|---|---:|
| render core (`terrain`, `ground-cache`, `raised-terrain-depth`, `terrain-inspector`, `assets`, `renderer`, `pixel-ui`, `sprite`, actor catalog) | ~7,000 |
| `overworld-art.ts`, `display.ts`, `loading-screen.ts` | ~4,000 |
| UI design system and widgets (`src/ui/*`) | ~7,000 |
| generated SpaceTimeDB bindings (`src/net/generated`) | ~6,400 |
| OIDC (`src/auth/*`) | ~600 |

Three awkward edges: the game's `live-map-runtime.ts` depends on the editor's
`editor-terrain.ts`; `main.ts` routes to studios; and the atlas build writes to
`packages/client/public/generated`, which a second app must also serve.

### 2.3 The backend has almost no administration surface

- Only four reducers can touch another player's state: `grantPlayerGold` (add only),
  `adminTeleport`, `adminMoveHomestead`, and `approveMember`/`revokeMember`. Every
  inventory, cursor, overflow, wallet debit, stat, vitals, skill, quest, statistic,
  effect, profile, and spawn write is caller-scoped.
- Every per-player table is private and exposed only through zero-argument `own*`
  views. SpaceTimeDB 2.8.2 views cannot take parameters, and `.where()` filters apply
  only to public tables, so an admin cannot subscribe to another player's rows at all.
- **Procedures are unused but fully supported** on both sides: typed parameters, typed
  return values, `connection.procedures.<name>(args)`. They are the missing primitive
  for parameterized admin reads and are also the clean replacement for the
  `requestLastConnections` / `requestBalanceTop` "synthetic row" views.
- `world_admin_audit` has no indexes and free-form `value` strings.
- The client gates admin UI on `role === 'owner'` while the server accepts `owner ||
  admin`; the editor uses the server rule. Reconcile before building on the flag.
- The active Map Editor projects a read-only subset of runtime rows: placeables,
  homesteads, resources, surfaces, and combat targets. Chests, NPCs, and players are
  not yet projected there, and the canvas does not mount spawn, despawn, move,
  repair, or replace controls for runtime entities.
- No respawn, unstick, kick, admin quest reset, cursor/overflow clear, or `player_spawn`
  writer exists. Ops today means SSH plus `spacetime call` on the loopback host.

## 3. Decision: a separate Studio package in the monorepo

Studio becomes `packages/studio`, its own Vite application with its own HTML entry,
route tree, CSP, and deployment, depending on shared workspace packages and never on
`@orchard/client`. It is **not** a separate git repository: bindings, sim, assets,
and the module must change in lockstep, and a second repository would drift on every
schema or content change. "Separate project" here means separate build, bundle,
origin, and release cadence, with one source of truth.

Extraction produces these packages (all `private`, all `@orchard/*`):

| Package | Contents | Consumers |
|---|---|---|
| `@orchard/engine` | render core, `overworld-art`, display, loading screen, `editor-terrain` (moved out of the editor), live-map runtime compile | client, studio |
| `@orchard/ui` | design system, widgets, skin, storage frames, compositions, container bindings | client, studio |
| `@orchard/world-bindings` | generated SpaceTimeDB bindings (`world:dev` and `generate` scripts retarget here) | client, studio, scripts |
| `@orchard/auth` | OIDC PKCE, token storage, session peers | client, studio |
| `@orchard/studio` | shell, all studios and operator tools | deployed app |
| `@orchard/client` | the game only; `/editor/*`, `editor.html`, and `audio-preview.html` are deleted in Phase 1, not redirected | deployed app |

Assets: `build-atlas.ts` emits to a shared `packages/assets/generated/` and both apps
declare it as Vite `publicDir` input (symlink in dev, copy on build). No paid source
sheets enter either bundle; the licensed-owner sidecar of doc 42 §8 stays dev-only.

Deployment (decided): Studio is served at `https://cellar.dastari.net/` by a
second systemd unit, proxying `/v1` to the same loopback SpaceTimeDB host. Keycloak
gets a second public client `orchard-studio` with that origin as redirect URI; the
module's `OIDC_CLIENT_IDS` gains it. Studio never shares the game's service worker or
CSP. The game origin serves no editor path at all; the reverse proxy may answer legacy
`/editor/*` requests with a redirect to Studio for a transition window, but the game
bundle, router, and tests no longer know those routes exist. The production frontend
currently runs the Vite dev server; Studio ships as a static `vite build` behind the
same reverse proxy, and the game should follow.

## 4. Studio architecture

```text
 +------+--------------------------------------------------------------------+
 | icon | route-owned full canvas (map/table/graph can paint edge to edge)    |
 | rail |  + floating controls +                 + floating Inspector +       |
 |      |  | route title once  |                 | selection only       |     |
 |      |  +-------------------+                 +----------------------+     |
 +------+--------------------------------------------------------------------+
```

The rail is the only region that participates beside the route canvas. The two
drawers are inset overlays anchored over that canvas; they are not columns that shrink
or divide it. There is no permanent application header, footer, status bar, or bottom
dock consuming workspace pixels. Tool-specific status, history, validation, animation,
audio, telemetry, and console surfaces appear in a drawer, route canvas, split workspace, or floating plate.

### 4.1 Visual language (owner-directed)

Studio looks and behaves like the game and current Map Editor, not like a generic
DOM admin panel. All visible shell and tool chrome is rendered on canvas through the
production `@orchard/ui` frame, layout, widget, button, slot, text, selector, and skin
primitives proven in UI Lab. The document body has exactly one UI element: the root
canvas. There are no DOM controls, transparent semantic overlays, hidden inputs, or
native file/select/text controls. Navigation, buttons, fields, tables, graphs,
scrolling, selection, focus, caret and text editing all use retained `@orchard/ui`
canvas widgets and input models. The canvas exposes a stable keyboard-operable focus
model and current control label. A tool must not copy the historical editor renderer,
create a lookalike CSS control family, or open a second rendering/control system. The
retained information architecture is the Teams-style main-tool rail, a route-owned
full canvas, and floating active-tool and context-selection drawers:

- the far-left rail contains the 20 registered main tools as large icon-only route
  buttons using the reviewed semantic `STUDIO_TOOL_ICONS` catalog; there is no second
  stack of route names or full-width route buttons. The rail scrolls when necessary,
  retains active/hover/focus state, and shows a canvas-drawn tooltip and accessible
  focus label for every icon;
- the left drawer contains controls for the active route only, the route's real
  canvas/table/graph workspace extends beneath both floating drawers, and the right
  drawer contains only the current selection's contextual properties and actions.
  Camera fitting and important content bounds account for the opaque overlays even
  though the route retains the full paint surface. The route label appears
  once, in the left drawer, rather than repeating above the workspace. Both drawer
  edges are retained-canvas resize handles with a 12-pixel hit band, pointer capture,
  180–420 pixel clamps, keyboard adjustment/reset, and session-retained widths;
- all framed regions declare named slots through `layoutUiFrameSlots` and shared flex
  containers, using the authored `uiFrameContentRect` metrics. Shell and tool code may
  not guess padding, sequence freehand `x`/`y` offsets, or paint beyond its clipped
  overflow viewport. The shell owns each major region frame; tools remove redundant
  same-weight top-level frames and use `thin` only for true nested groups. Major
  editing surfaces use the shared traditional alpha checkerboard beneath their actual
  map, graph, sprite, frame, or table content rather than another decorative frame;
- actions prefer shared compact glyph/icon controls where their meaning is
  unambiguous, use short text only where needed, retain success/danger/disabled/active
  semantic variants, and expose canvas tooltips on hover and keyboard focus;
- old `tools/**/view.ts` DOM projections are not an alternate implementation: they
  are retired as each canonical retained canvas builder lands, and final acceptance
  rejects HTML/SVG/control construction anywhere in Studio tool source;

- tools remain grouped by Build, Author, Operate and Observe mode for permissions and
  shortcuts, but mode names are not route controls in the main rail;
- status-badge and session-summary models exist for unsaved drafts, validation, live
  sync, identity/role and head revisions, but the sole-canvas shell does not mount a
  fixed session card at the bottom of the rail. Session/connect controls will return
  in a compact overlay or route-owned surface after their placement is reviewed;
- keyboard chords (`Ctrl+1..4` for modes, `Ctrl+K` palette, `Ctrl+Shift+F` search
  everywhere) are shown on hover.

New visual families go into `@orchard/ui` and the icon registry, never into a tool.
`/editor/ui-lab` becomes the Studio design catalogue so every new control is reviewed
against the same neighbours before use.

### 4.2 Workflow model: Godot-derived docks, Orchard-specific tools

Doc 42 §8.1 already adopted Godot's TileMap and TileSet ideas. Studio adopts the rest
of Godot's editor workflow where it transfers, and keeps the Orchard-specific tools
(items, recipes, frames, behaviour graphs, quests, operator tools) as first-class
citizens of the same layout:

| Godot editor concept | Studio contract |
|---|---|
| Main-screen switcher (2D / 3D / Script / AssetLib) | Teams-style icon-only main-tool rail, grouped internally by Build / Author / Operate / Observe permissions and shortcuts |
| Scene dock (Local tree) | The Map route mounts a Canvas-native **World Outliner** for its draft space → layers → authored objects, landmarks, and anchors. Search retains matching ancestor paths, standard tree keys move real Canvas focus, and guarded object/landmark reparent plus layer reorder produce one undo entry. Eligible live-NPC selection hands current/home relocation to the receipt-bound Canvas action; prefab and functional spawn-rule nodes remain target extensions. |
| Scene dock (Remote tree while the game runs) | The Map route mounts a Canvas-native **Live Outliner** built from subscribed runtime rows. Its grouping/selection path is repository-tested; authenticated deployed-browser population remains an acceptance gate. |
| Inspector dock | The right floating drawer is mounted. Map owns a rich visual selection view, a complete read-only projection of schema values/types/read-only/error/pin/reset availability/WHY metadata, and its separate Layers stack. Generic schema mutation and global route coverage remain targets. |
| FileSystem dock | **Content Browser** (definitions, references-to/by) and **Asset Library** (reviewed registry with coverage states) |
| Bottom panel (Output, Debugger, Animation, Audio, Shader) | no permanent bottom bar; these become route-owned drawer/workspace tabs or temporary floating plates: Validation, Audit tail, Live sync log, Animation preview/scrubber, Audio mixer, Telemetry, Console |
| Node signals and script attachment | **Behaviour** tab on any object definition: the doc 55 event list with attached handlers (data graph or read-only compiled entry) |
| Scene instancing and inherited scenes | prefabs and object definitions; instances show overrides against the definition in the Inspector |
| Undo/redo history dock | History dock listing the command stack of the active document and, for live edits, the audit entries with "undo this action" |
| Editor layouts (save/load dock arrangement) | The Canvas shell mounts icon-only named-layout save/restore and split-workspace controls. Each route/document persists its split route, direction, and bounded ratio independently while the default Map layout remains a full canvas behind floating drawers. |
| Editor settings and project settings | Studio settings (theme, shortcuts, UI scale, environment) and World settings (balance groups, space flags) as ordinary Inspector pages |
| Plugins / EditorPlugin | `registerStudioTool({ id, mode, icon, routes, docks, commands })`: every tool, built-in or future, registers through one API so the rail, palette, and search discover it |
| Search everywhere / command palette | `Ctrl+K` palette over commands, definitions, players, entities, spaces, and docs sections |
| Run / play with remote debugging | **Preview** (client with the draft overlay in a second tab) and **Observe** (telemetry, presence) |

What does not transfer: Godot's scene-file-on-disk model (documents publish to
SpaceTimeDB heads with compare-and-swap), GDScript (behaviour is the doc 55 graph),
and per-node script editing (handlers attach to definitions, not instances).

### 4.3 Live world connection

Connecting to and editing the live world is the normal case, not a special mode.

- **Environment switcher** in the planned session control surface: local development host or production
  (`cellar.dastari.net` proxies the production database). Production shows a
  persistent coloured banner and requires the OIDC session; local may use development
  profiles per doc 09 §3.
- **Target live workflow.** Build tools publish documents to live heads with
  compare-and-swap (doc 42 §7); Author tools publish content change sets (doc 55 §5.4);
  Operate tools call audited reducers directly. The Map Editor's player-owned layer and
  Canvas Live Outliner consume the shared adapter; authenticated browser proof remains open.
- **Draft/live presentation.** The Map controls drawer switches among Palette, World
  Outliner, and Live Outliner views. Its explicit publish/conflict surface is mounted;
  a richer structural publish diff remains a target.
- **Authority is unchanged.** Studio never writes tables except through reducers, never
  trusts its own cache for validation, and never constructs a live adapter for an
  anonymous session.

- **One live session.** `StudioConnection` (grown from `editor-live-connection.ts`)
  owns the SpaceTimeDB connection, membership role, content head, map head, staged
  subscriptions, procedure calls, and a typed `AdminApi` facade. Tools never open their
  own connections. Anonymous mode remains a local sandbox that constructs no adapter
  (doc 42 §1) and shows Build and Author only.
- **Documents and drafts.** Map documents, prefab workspaces, and content change sets
  are documents with autosave, base revision, conflict detection, and publish, using
  the existing `MapEditHistory` and the doc 55 `ContentChangeSet` kernels. Operator
  actions are not documents; they are audited transactions with a preview step.
- **Shell services** shared by every tool: command palette, keyboard map, selection
  bus (a player, object, tile, or definition selected in one tool is available to
  others: select a player in Player Manager, press "go to" in Map Editor), notifications,
  validation panel, audit tail, revision history, and a `WorldPicker` control (click a
  tile or entity in any canvas to fill a coordinate or id field).
- **Canvas kernel.** The Map Editor and Object Studio canvas, picking, camera, and
  overlay code become the shared `StudioCanvas`; Dialogue Graph and Behaviour Graph
  use the same kernel with node rendering instead of tiles.
- **Table kernel.** Items, prices, loot, crops, players, audit, and telemetry use one
  retained canvas table component (sortable, filterable, inline validation, bulk edit,
  CSV export) drawn with the shared authored frame, selector and bitmap-text assets.
  It has bounded visible rows, hard viewport clipping, hit records, keyboard focus and
  line/page/home/end scrolling; it never creates an HTML table or input.

## 5. Backend administration API

### 5.1 Principles

- **Reads are procedures, writes are reducers.** A procedure returns a typed
  snapshot for a target identity or entity in one call and never mutates. A reducer
  mutates one target in one transaction and always appends an audit row with a
  machine-readable `reason` and before/after payload.
- **Every admin reducer takes `targetIdentity` or `entityId` explicitly** and rechecks
  `requireWorldOwner` and the target's existence; there is no ambient "act as" state.
- **Preview before commit.** Reducers that change player state accept `dryRun: true`
  and return the planned change through a paired procedure so Studio can show the
  diff first.
- **Bounded and indexed.** Audit gains `by_actor`, `by_target`, and `by_occurred_at`
  indexes and a typed `payload` JSON column; list procedures page by cursor.
- **Notify the affected player.** Relocation, inventory change, or quest change for an
  online player writes a `connection_notice` so the client explains what happened.
  Silent teleport stays forbidden (doc 42 §7.2).

### 5.2 Roles

| Role | Build | Author | Operate | Observe | Membership |
|---|---|---|---|---|---|
| `owner` | yes | yes | yes | yes | all |
| `admin` | yes | yes | yes | yes | none (unchanged) |
| `content_editor` (doc 55 grant) | yes | yes | read-only | yes | none |
| `support` (new grant) | no | no | player remedies, not economy edits | yes | none |
| `moderator` | no | no | kick, notice, chat tools | presence, audit | friends only |

The client's `canAdministerWorld` flag is reconciled to `owner || admin` in the same
change that adds these grants.

### 5.3 Procedures (reads)

| Procedure | Returns |
|---|---|
| `adminFindPlayers(query, cursor)` | display name, identity, role, online, space, tile, last seen |
| `adminPlayerSnapshot(identity)` | profile, position, spawn, wallet, stats, vitals, effects, skill tracks and nodes, quests with baselines, statistics, membership, current homestead, active dialogue, mount |
| `adminPlayerInventory(identity)` | hotbar, backpack, equipment, crafting grid, cursor, overflow, with definitions resolved |
| `adminContainerContents(entityId)` | chest or placeable slots, processor state, owner, position |
| `adminEntitiesInArea(spaceId, x0, y0, x1, y1)` | placeables, chests, NPCs, items, resources, surfaces with ids and states |
| `adminHomestead(spaceId)` | rows, members, upgrades, portals, occupancy |
| `adminAuditPage(filter, cursor)` | audit rows with payload |
| `adminConnectionsPage(identity?, cursor)` | connection audit, replacing `requestLastConnections` |
| `adminTelemetry()` | tick timing, rows touched, scan counters, subscription counts |
| `adminValidateWorld()` | orphaned rows, portals without pairs, players inside collision, definitions referenced by rows but retired |

The procedure-host capability gate passed on 2026-09-03 against SpacetimeDB 2.8.2
on an isolated `127.0.0.1:3111 --in-memory` host. The full Orchard module published
to disposable database `orchard-w1-procedure-spike`, and `spacetime describe`
reported all ten client-callable procedures. A minimal transactional procedure was
then published to disposable database `orchard-w1-host-capability` and
`spacetime call` returned `"procedure-ok:W1"`. Calling the full module anonymously
was correctly rejected by its production OIDC issuer policy; no live host, database,
bindings, or world data were touched. If a future target host regresses this
capability, the fallback remains an `admin_target` row per admin plus zero-argument
views that project the targeted player; the `AdminApi` facade hides which one is in
use.

### 5.4 Reducers (writes), all audited with `reason`

**Players**: `adminSetWallet(identity, deltaBronze)` (signed; replaces add-only gold),
`adminSetStats(identity, patch)`, `adminSetVitals(identity, patch)`,
`adminGrantSkillPoints(identity, track, points)`, `adminResetSkillTree(identity)`,
`adminSetQuestState(identity, questId, state)`, `adminResetQuests(identity)`,
`adminGiveItems(identity, stacks[])` (preflights capacity like merchant purchases),
`adminRemoveItems(identity, stacks[])`, `adminClearCursor(identity)`,
`adminDrainOverflow(identity)`, `adminSetSlot(identity, slot, stack | null)`,
`adminSetSpawn(identity, spaceId, tile)`, `adminRespawn(identity)` (to spawn, clears
mount and carry), `adminUnstick(identity)` (nearest validated walkable tile in the same
space, then spawn), `adminTeleportPlayer(identity, spaceId, tile)` (typed form of
`adminTeleport`), `adminSetDisplayName`, `adminKick(identity, notice)` (presence
delete without revocation), `adminNotify(identity | all, body)`.

**Objects**: `adminSpawnEntity(definitionId, spaceId, tile, state?, owner?)`,
`adminDespawnEntity(entityId, spillContents: bool)`, `adminMoveEntity(entityId,
spaceId, tile)`, `adminSetEntityState(entityId, patch)`, `adminSetContainerSlot(
entityId, slot, stack | null)`, `adminRepairEntity(entityId)` (reset damage and
processor state), `adminReplaceEntity(entityId, definitionId)` (same position and
contents), `adminRelocateNpc(npcId, spaceId, tile)` (generalizes the horse reducer),
`adminRespawnResources(spaceId, area)`.

**World**: existing time, weather, wind, MOTD, map publish and restore, homestead move;
plus `adminSetSpaceFlags(spaceId, patch)`, `adminRepairPortalPair(portalId)`, and
`adminRunWorldRepair(reportId)` which applies a validated fix list from
`adminValidateWorld`.

Each reducer's inverse is recorded in the audit payload where one exists (wallet
delta, slot before/after, position before), and Studio offers "undo this action" as a
new audited reducer call. `grantDebugSkillPoints`, `adjustDebugBackpackSlots`,
`debugUsePortal`, `resetMyQuestProgress`, and `grantPlayerGold` retire once their
typed replacements land (closing doc 53 T8).

## 6. Tool inventory

### 6.1 Build

| Tool | What it does | Backend |
|---|---|---|
| Map Editor | as doc 42; complete authored/live overlays, exact allowlisted preview/commit "spawn here", and safe annotation-anchor painting are mounted; functional spawn-rule authority remains a target integration and §13 records the exact current boundary | existing publish; `adminSpawnEntity` |
| Object Studio | as doc 42; gains the doc 55 Behaviour tab | content publish |
| **Tile Editor** | the doc 50 §4 tileset family registry and §7 terrain test bench as a first-class tool: define a family (blob/cliff/path/river roles), map roles to reviewed assets, audition frames, validate role coverage, preview autotile output on fixtures, publish the family as a `tileset` content definition | content publish (`tileset` kind) |
| Space Manager | list spaces, portals, homesteads; create authored spaces from map documents; edit flags and environment | `adminSetSpaceFlags`, portal repair |
| Asset Library | the reviewed registry with coverage states from doc 42 §8; pick sprites, animations, states for any definition | read-only |
| **Character Studio** | the existing paper-doll and rig lab becomes the character tool: rig layers, equipment overlays, animation groups, appearance presets; authors `wearable`/`rig` content definitions once doc 55 lands and previews any player's appearance from Player Manager | content publish; `adminPlayerSnapshot` |
| **Audio Studio** | the audio preview grows into the `game-music` authoring tool: song (`*.song.json`) and SFX (`*.sfx.json`) editing with the Web Audio sequencer/synth, mixer bus levels, ambience beds per space, and assignment of `sfx`/`music` ids to definitions and spaces | asset files in git via export; `audio` content definitions for assignments |

### 6.2 Author (doc 55)

Items and Recipes, Frame Designer, Behaviour Graph (the "script editor": node canvas
over events, conditions, effects; compiled-handler entries shown read-only with their
source link), NPC Studio, Dialogue Graph, Quest Editor, World Tables, Pack. All share
the content browser, validation, history, preview overlay, and publish.

### 6.3 Operate

| Tool | What it does |
|---|---|
| **Player Manager** | search; profile card; tabs for Position (map thumbnail, go-to, teleport, unstick, respawn, set spawn), Inventory (all containers rendered with the game's own frame renderer, drag to edit, give/remove, clear cursor, drain overflow), Wallet and Stats (edit with preview), Vitals and Effects, Skills (points, nodes, reset), Quests (state per quest, reset), Statistics, Membership and Connections, Notices; every edit shows the planned diff and requires a reason |
| **Container Inspector** | any chest, station, or barrel by click or id: slots, processor progress, owner, damage; edit slots, repair, spill, move, replace |
| **Object Manager** | entities in the viewed area with filters; spawn from any object definition; despawn, move, replace, set state; bulk select; "replace all retired definitions" repair |
| **NPC Manager** | list authored NPCs and wildlife with position and state; relocate, reset AI, respawn; edit definition link |
| **World Control** | time, day, season, weather, wind, MOTD, global notice, space flags, resource respawn, homestead relocation |
| **Membership** | approve, role changes, revoke, block, grants for `content_editor` and `support` |
| **Playbooks** | guided remedies: "player stuck", "lost items after crash", "chest disappeared", "quest cannot progress", "wrong homestead position"; each is a sequence of the reads and writes above with the preview step built in |

### 6.4 Observe

Online players with space and chunk; presence and connection history; tick telemetry
from `scalability.ts` counters; content and map revision timelines with diff and
restore; audit log with filters by actor, target, action, and time; world validation
report; client error reports (a small `client_error_report` table written by an
audited reducer with rate limits).

## 7. Safety rules for operator tools

- Every write carries a `reason` of at least eight characters; Studio refuses to submit
  without one.
- Preview is mandatory for inventory, wallet, stats, skill, and quest edits on any
  player; the reducer runs the same validation in `dryRun` and the commit re-validates.
- Edits on online players are allowed but always notify them; relocation waits for a
  movement-settlement boundary the way `adminTeleport` does.
- Economy edits are rate-limited per actor per hour and summarized in Observe.
- Give/remove never bypasses stack rules, capacity, or `item.quest_unique` policy;
  overflow custody is used when capacity is short.
- `support` cannot change wallet, stats, or skills beyond configured caps; caps are
  `balance` definitions in the content registry.
- Deleting a player's object spills contents as world items or into overflow custody
  unless the operator explicitly chooses destruction, which is a separate reason field.
- No tool can act on the last active owner's membership (existing rule).

## 8. Phases

### Phase 0 — shared packages (game unchanged)

Create `@orchard/engine`, `@orchard/ui`, `@orchard/world-bindings`, `@orchard/auth`;
move files with `git mv`; retarget `world:dev` and `generate`; shared
`packages/assets/generated`; the game builds from the new packages with no behaviour
change. Reconcile `canAdministerWorld` in the client.
**Done when:** `npm run check` passes, the game bundle chunks are unchanged in
content, and `packages/client/src` contains no render, ui, auth, or generated code.

**Progress, 2026-09-03:** lane 56-X0 is complete: the five shared/Studio workspace
packages exist, package-boundary lint rules are active, and atlas output now has one
ignored source at `packages/assets/generated` consumed by both Vite applications.
Lanes 56-X1 through X4 are also complete: all 198 generated files now live behind
`@orchard/world-bindings`, generation/scripts/imports target that package, and the
OIDC/token/session-peer implementation now lives behind `@orchard/auth`; the complete
UI tree and its required `assets`, `sprite`, and `pixel-ui` rendering primitives now
live behind `@orchard/ui`. The UI package keeps only structural lighting/trade types
and the PWA presentation contract, so it has no client, engine, auth, or bindings
dependency. Render, overworld art, display, loading, and the shared editor-terrain
adapter now live behind `@orchard/engine`; bindings enter only through narrow
structural row contracts at the client boundary, and the lazy diagnostics keep their
separate chunks. X5 is complete: the shared simulation policy now defines world
administration as `owner || admin`, and every game presentation/command gate consumes
that predicate. A deterministic extraction test keeps all 82 non-seam sources under
shared package ownership and locks the five reviewed structural seams to their
reconciled forms; a post-build check verifies the six stable runtime chunks and keeps terrain
inspection and render benchmarks lazy. `npm run check`, the client production build,
the chunk check, and the package-boundary audit pass. Phase 0 repository work is
complete; browser login acceptance was not performed in X5 and remains an explicit
Phase 1/operator gate.

### Phase 1 — Studio shell and existing studios

`packages/studio` with the shell of §4, `StudioConnection`, the workbench rail, the
command palette, and the Map Editor, Object Studio, UI Lab, Character Studio, Item
Studio, and audio preview moved in. `editor.html`, `audio-preview.html`,
`editor-main.ts`, `audio-preview.ts`, the `/editor/*` branches of `main.ts`, the
`editor:dev` script, and their route tests are deleted from the client; `csp.test.ts`
and `vite.config.ts` lose their editor carve-outs. Second Keycloak client, systemd
unit, and proxy.
**Done when:** every doc 42 verification-log scenario passes in Studio at
`cellar.dastari.net`, the game bundle and router contain no editor code or
routes, and an anonymous Studio load constructs no live adapter.

**Progress, 2026-09-03:** the repository portion of lane 56-S4 is complete: the
separate exact-origin Keycloak client and audience, static Studio build/preview,
production CSP and security headers, loopback `/v1` proxy, query-free edge logging,
rate limits, systemd unit, and operator runbooks are checked in and tested. The live
NPM and HAProxy edge is now backed up and configured for `cellar.dastari.net` with a
valid certificate, exact SNI admission, WebSockets, HTTP/2, HSTS, query-free logging,
rate limits, and the reviewed security headers. The built unit is installed and
enabled on `10.0.1.150:5174` and was verified publicly with TLS validation, HTTP/2
200, HSTS, no-store, and the reviewed CSP/security headers. A 300-request edge probe
produced 156 HTTP 429 responses at the configured threshold. The otherwise
query-bearing generated NPM host log was changed only for proxy 33 to the query-free
format after a checksumed backup; a synthetic callback code appeared in neither
active log, and an idempotent reconciler covers future NPM regeneration. The
Keycloak reconcile and its backup/restore proof are complete as recorded in the
authentication-readiness note below; the non-destructive world publish and
authenticated clean-browser acceptance remain operator gates. A
pre-reconcile Keycloak/PostgreSQL backup was created and round-trip verified
against the encrypted off-machine destination at
`/home/toby/backups/orchard-auth/20260903T081358Z`; the removed bootstrap administrator
correctly cannot authenticate. The checked-in named-admin reconciliation command
updates only the exact `orchard-studio` public PKCE client and validates accepted and
rejected redirects without storing its password. S1, S2, and S3 are
repository-complete. S5 is repository-complete: the client editor documents,
entries, router branches, scripts, styles, CSP fixtures, route tests, and Vite inputs
are deleted. Its production build emits no Studio tool document or chunk, while the
engine-owned game audio and lazy terrain/render diagnostics remain intact. The client
chunk audit, focused Phase 1 tests, and package-boundary scan pass. Phase 1 repository
work is complete; authenticated clean-browser acceptance remains the operator gate.

**Progress, 2026-09-03:** lane 56-S0 is complete in `@orchard/ui`: the Map
Editor-derived wood/parchment Studio skin now includes the main-tool rail, session
summary model, status badges, dock frames, accessible tab strips, typed Inspector
property rows with reset/pin/why states, and a sortable/filterable/validatable table
skin with immutable bulk-edit planning and CSV export. The deterministic anonymous
UI Lab models and statically renders every §4.2 workflow surface at UI scales 1, 2,
and 3 beside its Map Editor, canvas-frame, and Item Studio table references. Focused
tests, UI typecheck/build, scoped lint, and diff checks pass. The current shell
consumes the rail/frame/table primitives; route-specific and global mounting boundaries
are called out explicitly in the corrected S1 note below.

**Progress, 2026-09-03, corrected 2026-09-04:** lane 56-S1 provides the mounted
icon rail, floating drawers, route canvas/table builders and command palette, and
registers every Phase 1 tool through `registerStudioTool`. Shared selection,
notification, conflict, Inspector, World/Live Outliner and named-layout kernels exist
as tested service/model contracts. The Map route mounts the World/Live trees and a
complete read-only schema projection beside its visual selection view. The shell now
mounts named-layout save/restore and an opt-in, resizable split workspace; generic
property mutation and other-route dock coverage remain integration work.
The exact owner/admin/content-editor/support access matrix is model-tested,
including support remedies without economy or membership authority. The application
has no client import. Its connection/auth/bindings implementation is a separate
dynamic chunk constructed only after an explicit Connect action; anonymous startup
constructs no adapter. A local production-build browser check covered the anonymous
Build/Author shell, mode routing, production warning, command palette, accessible
canvas controls and role-gated live routes/actions. Live-host subscription acceptance and
browser login were not performed; the mounted Live Outliner path is covered with
deterministic mock rows and remains an environment/operator acceptance gate.

**Canvas-shell migration, superseded slice and replacement, 2026-09-03; floating-drawer layout reconciled 2026-09-04:** the earlier
DOM-to-canvas overlay adapter was superseded and physically deleted. Studio now boots
from a sole root canvas and expresses the original editor roles with the shared
UI-Lab layout primitives. Its current shell contract is an icon-only 20-tool route
rail beside a route-owned full canvas, with the active-tool-controls drawer and
contextual Inspector floating over that canvas.
Every framed region uses named `layoutUiFrameSlots` plus shared flex layouts and
authored frame-content metrics; route icons come from semantic `STUDIO_TOOL_ICONS`,
and hover/focus help is a shared canvas tooltip. It paints wood/parchment frames,
bitmap text, fantasy buttons/tabs, fields, selectors and inventory-slot chrome through
production `@orchard/ui` canvas primitives. Shared DOM-free `CanvasFocusManager` and `CanvasTextEditor` models provide
roving focus, stable labels, keyboard activation, selection/caret, clipboard and IME
state; the shared bounded canvas table supplies row/cell layout, hit records and
scrolling. Rendering is invalidation-driven (no idle loop), DPR-capped,
ResizeObserver-aware, hidden-page paused and fully disposed on shell teardown. A lazy
canvas-tool builder registry clips and caps per-tool scenes without importing their
view modules into the shell. Source-policy tests require the one-canvas document and
reject copied editor draw primitives and per-tool connections. Pure desktop/narrow
layout tests retain the rail, full route canvas, inset drawers, and overlapping resize
targets without turning the drawers back into layout columns.
A dated clean production-build browser run at 1280×720 and 720×540 proves the retained
sole-canvas invariants of a sole body
canvas and sole body node, zero HTML UI controls, keyboard focus labels, the retained
canvas command palette, routing without reload, DPR-sized backing stores and bounded
action counts. It covers the 20-tool icon rail, hover tooltip,
Object alpha-grid workspace, Items retained table selection and wheel/page scrolling,
compact selection projection, 270→330 pixel pointer resize with session persistence,
and the compact narrow overlay layout without console errors or warnings. All 20
tool routes now have canonical lazy retained-canvas builders; their DOM `view.ts` and
legacy Studio projections are physically removed, and source policy rejects their
reintroduction. Authenticated Operate/Observe and live mutation flows remain the
explicit OIDC/operator browser gates described below.

**Progress, 2026-09-03, expanded 2026-09-04:** lane 56-S2's repository implementation is complete. The
tracked Map Editor and Object Studio implementations and focused tests were moved
with history into `packages/studio/src/tools/{map,object}`; their active Studio routes
now use the shell-owned `StudioCanvas`, selection, notification, validation, draft
persistence, and single explicit live-adapter seams. World/Live Outliner models are
not mounted. Map now has pannable/zoomable production terrain. The shell-wide `G`
preference controls the shared alpha grid and the gray/white grids drawn by both Map
Editor and Object Studio. Map's searchable palette follows the selected layer and
offers terrain controls/surfaces, biome paint choices, or semantic prefabs derived
from subscribed object definitions with reviewed generated-catalog fallbacks.
It supports elevation-aware strokes, prefab placement, authored-only one-tile Arrow-key
nudge, rotate/flip/scale/clone/hide/delete, and one-entry deterministic scatter. Object
selection, drag previews, and finite-map clamping use the exact rotated/flipped/scaled
prefab footprint, including disabled or non-blocking cells; a completed drag remains
one undoable edit. Clicking overlapping content auto-picks the topmost visible entity
using layer order and stable painter order independently of the current placement
target. Its lower right drawer is a compact topmost-first Layers panel with
separate eye visibility and row-target actions, a clear primary active state, type thumbnails,
non-interactive lock/unlock status, wheel scrolling, and a visible `start-end/total`
range in the Ribbon whenever the stack is clipped. Shift selects a contiguous row range,
Ctrl/Meta toggles additive rows, and compact bulk eye/lock actions affect only that layer
row set. The primary row remains the sole placement/authoring target, so map entity
selection remains independent and single-target. Editable authored layers now have undoable rename and
adjacent reorder commands while generated and player-owned layers remain locked. The
compact command row exports the current local draft through a deterministic,
schema-round-tripped V3 JSON payload with live-aligned content and size ceilings. Its
icon-only action explicitly reports whether the browser accepted or could not provide
a download bridge; the temporary anchor and object URL are released on every path. Its
selection-only upper drawer reports
authored/generated provenance, resolved biome/surface/elevation/collision, semantic
WHY hierarchy, exact exposed production visual roles, object metadata, and a
generated-resource suppression action when a canonical suppression id is available.
This is a substantial repository implementation, not a claim of full legacy Map
Editor or authenticated live-publish parity. Object Studio keeps
its 128×96 canvas, additive/toggle/marquee selection, grouping/explode, pivots,
transforms, collections, layer visibility, signed height, 4×4 collision, draft
round-trip, and prefab export contracts. The focused map suite passes, as do the
recorded Studio/client/UI/engine typechecks, builds, scoped lint, package-boundary and
stale-path scans. Local anonymous browser checks rendered `/build/map` and `/build/object`
without constructing a live adapter; production login, subscriptions, and publication
remain operator acceptance gates. The client editor route/entry shims were
subsequently removed by S5, while Item Studio landed through S3.

**Progress, 2026-09-03:** lane 56-S3's repository implementation is complete. The
tracked UI Lab and audio preview, the existing Character Studio and Item Studio
implementations, and their focused models/tests now live under
`packages/studio/src/tools/{ui-lab,character,items,audio}`. The reusable game audio
bus moved once into `@orchard/engine`; both the game and Studio consume that shared
implementation. All four Author routes are registered and lazy-mounted by the shell.
Character Studio uses the shared on-demand `StudioCanvas`, exposes keyboard-accessible
action/direction/equipment controls, and audits every core/hair/shirt/pants/shoes rig
catalogue. Audio constructs no `AudioContext` until an explicit cue and tears down its
meter timer on unmount. Items consumes content head, definitions, revisions, publish,
and restore solely through the one explicitly connected `StudioConnection`; anonymous
and disconnected mounts construct no live adapter. Focused model tests, Studio/client/
engine typechecks and builds, scoped lint, package-boundary/stale-path scans, and local
anonymous browser checks of all four routes pass. Live playback and authenticated
publish/restore remain operator acceptance gates. S5 subsequently removed the
temporary client HTML/router/script carve-outs; only the separately managed proxy
transition can redirect an old route.

**Canvas adapter progress, 2026-09-03:** Map Editor's map, terrain-lab and
procedural-world workspaces, Object Studio and its Behaviour Graph, Tiles,
Character Studio, Audio Preview, and UI Lab/Frame Designer now have canonical,
lazy canvas-tool builders. Each builder divides controls and preview work between
the shell-provided drawer and workspace bounds without adding a duplicate top-level
frame; true nested groups use the production thin frame with `layoutUiFrameSlots`,
and shared flex containers drive their flow. Each builder caps retained nodes/actions
at 200 and supplies
stable tool-prefixed hit targets, keyboard labels, semantic active/success/danger/
disabled controls, non-overlapping 40×40-or-larger actions, and canvas tooltip text.
Maps, prefab/behaviour graphs, tile
fixtures, character rigs, audio meters, and designed frames render through the
shell's clipped, invalidation-driven draw layer with no private animation loop or
DOM/SVG surface. Focused adapter/model tests cover all eight route variants,
separate control/workspace placement, minimum hit targets, retained state, draw
callbacks, node budgets, and the no-HTML source policy. Their former `view.ts` and
`legacy-*` implementations are physically deleted; canonical barrels expose only
canvas/model surfaces.

### Phase 2 — administration API and Player Manager

Procedure spike on the deployed host (gate); audit table indexes and payload; the
`content_editor` and `support` grants with the §5.2 matrix and §7 caps as `balance`
definitions; the §5.3 procedures and the player reducers of §5.4 with `dryRun`,
notices, and inverse payloads; Player Manager, Membership, and the first three
playbooks; Observe with audit and connections.
**Done when:** a stuck player is found, inspected, unstuck, and refunded from Studio
with a reason, the player sees a notice, the audit row carries the inverse, and the
CLI-only reducers are retired.

**Progress, 2026-09-03:** lane 56-W0's first contract slice is implemented: typed
procedure snapshots and reducer mutations, normalized eight-character reasons,
stable error codes, versioned/invertible audit payloads, and deterministic bounded
before/after previews. W1–W3 and the Studio transport have since integrated these
contracts; deployment remains the gate before an operator tool may write live state.

**Progress, 2026-09-03:** lane 56-W1 is implemented and its local procedure-host
gate passes. `world_admin_audit` retains its legacy columns and rows while appending
defaulted `occurredAtMicros`, `targetKey`, and typed payload storage plus actor,
target, operation, and occurrence-time indexes. All ten §5.3 reads are registered
as owner/admin-authorized transactional procedures, use direct or indexed candidate
sets, enforce bounded pages/areas, and report a procedure-specific `*RowsScanned`
counter. Five focused admin test files (21 tests), world typecheck, and the
SpacetimeDB module build pass. The generated-binding and game-client parity pass is
now complete: `requestLastConnections` and `requestBalanceTop` are removed, while
their bounded typed procedure replacements remain available to Studio. No publish
to any shared/live database occurred.

**Retirement progress, 2026-09-03:** the game-only mutation paths
`grantDebugSkillPoints`, `adjustDebugBackpackSlots`, `debugUsePortal`,
`resetMyQuestProgress`, `grantPlayerGold`, `adminTeleport`, and
`adminRelocateHorse` are removed from authority exports, generated bindings,
network wrappers, chat commands, and developer UI. Studio retains the typed,
reasoned, audited replacements (`adminGrantSkillPoints`, `adminResetQuests`,
`adminSetWallet`, `adminTeleportPlayer`, and `adminMoveEntity`). Strict absence
tests cover both source and generated paths; the checked authority build and full
world/client/UI suites pass. This is repository verification only, not a live
publication.

**Progress, 2026-09-03:** lane 56-W2a is implemented. The five inventory reducers
share one deterministic planning kernel and one authoritative commit path. Gives
preflight the exact accessible hotbar/backpack capacity; removals cover physical
slots, cursor, and overflow without partial commits; set-slot enforces equipment,
stack, durability, and quest-unique constraints; clearing a cursor preserves excess
items in overflow; and draining overflow retains any remainder. A private,
caller-filtered preview receipt binds client mutation id, current inventory hash,
operation fingerprint, and a 60-second expiry, so commit rejects missing, changed,
expired, or stale previews. Successful commits atomically write inventory state, an
invertible typed audit payload, and per-connection notices for online targets.
Owner/admin authorization, support grants plus authored hourly/item caps, preview/
commit parity, capacity, stack, unique-item, inverse, notice-registration, and role
failure cases are covered by focused tests. Generated bindings are present; live
publication and two-client acceptance remain integration gates.

**Progress, 2026-09-03:** lane 56-W2b is implemented. Seven economy/progression
reducers share a pure planner and one authoritative commit path for signed wallet
adjustments, bounded attribute/vital patches, bonus skill points, cost-free
administrative skill-tree reset, explicit quest transitions, and complete quest
reset. Dry runs bind the full progression-state hash, normalized mutation, exact
after-state fingerprint, and 60-second receipt; commits reject stale or changed
previews before writing. Successful commits reconcile only the targeted durable
wallet, stats, survival, skill, quest, baseline, and quest-owned rows, append a
typed inverse audit payload, and notify every online target connection. Support
authority reads the six live authored caps and counts all support-authorized audit
operations in the preceding rolling hour. Focused tests cover all seven operations,
field/overflow validation, dry-run parity, inverse payloads, role failures, authored
caps, rolling-window boundaries, reducer registration, audit, and notice wiring.
Generated bindings are present; publication and two-client acceptance remain
integration gates.

**Progress, 2026-09-03:** lane 56-W2c is implemented. Seven position/session
reducers share a deterministic dry-run/commit planner and the private 60-second
preview receipt: set spawn, respawn, unstick, typed player teleport, display-name
change, kick, and targeted/global notice. Stateful commits bind the exact player,
spawn, movement, custody, name, and presence hash; the initial dry run may discover
that hash when no dedicated position-version read is available, but commit must
present it unchanged with the exact preview fingerprint. Relocation validates the
authored space collision map, rejects occupied destinations, cancels trade and
settles input/actions/interactions at the same boundary as normal teleport. Unstick
searches deterministic same-space Manhattan rings before the durable spawn fallback;
respawn releases mounts and carried chests, targets, and placeables without deleting
them. Spawn rows gain an additive defaulted space id, preserving every legacy topside
spawn. Commits append typed inverse audit payloads where meaningful, deliver private
per-connection notices, and kick only live presence rows without revoking membership.
Owner/admin/support/moderator authority and support relocation/hourly caps are
covered by focused planner and registration tests. Generated bindings are present;
publication and live movement/two-client acceptance remain integration gates.

**Progress, 2026-09-04:** live player undo is implemented end to end. Every newly
committed player mutation writes a private caller-scoped receipt containing its exact
audit id and operation-specific committed version; Studio reads that receipt directly
instead of searching a bounded audit page. Invertible inventory actions retain a
complete snapshot or exact slot state, progression retains a complete snapshot, and
position actions retain their typed inverse. `adminUndoPlayer` requires a current authorized role, normalized reason,
matching target and source audit, exact slice-version CAS, support ownership and hourly
cap compliance, and a previously unused source audit. It restores state, appends a
second audit with the reversed diff, records a durable single-use marker, and notifies
each online target session in the same transaction. An exact same-mutation-id retry is
a successful no-op and resolves the original receipt; mismatched retries fail closed.
Generated bindings and Studio's live adapter/model are integrated. Focused parser,
planner, schema, transport, and model tests pass; the live two-client exercise remains
an operator release gate.

**Progress, 2026-09-03:** W3's role and cap foundation is implemented. A new
additive caller-private `support_grant` table sits beside the existing content
editor grant; four owner-only grant/revoke reducers require an eight-character
reason and mutation id and append typed, invertible audit payloads. Player summary
procedures project active grants. The exact role matrix is shared with reducer
kernels: support receives remedies plus capped item, wallet, statistic, skill, and
same-space relocation operations, never membership changes or session kick;
moderator keeps kick/notice only. Six authored `balance:admin_support_*`
definitions provide conservative per-mutation and rolling-hour caps, with a shared
fail-closed evaluator. The bootstrap validates 303 definitions across 11 files.

**Progress, 2026-09-03:** lane 56-U1's repository implementation is complete behind
the W0 contracts. `AdminApi` is a typed transport facade with no generated-binding or
connection dependency, allowing W1 to decode procedure transport payloads behind the
adapter. Its deterministic mock supplies searchable cursor pages, full player and
inventory snapshots, connection pages, immutable dry-run previews, exact preview-to-
commit matching, base-version conflicts, audit rows, player notices, and audited undo.
Player Manager is lazy-registered at `/operate/players` with profile/search/paging and
all nine §5.3 tabs and nineteen §5.4 player operations. Every write normalizes an
eight-to-500-character reason, exposes its field diff before commit, and resolves an
operation-level owner/admin/support/moderator/content-editor disabled state. Anonymous
startup still constructs no live or mock adapter. Focused API/model/view/registration
tests pass; the W1/W2 bindings and live adapter are integrated, while deployed
two-client acceptance remains outstanding.

**Progress, 2026-09-03:** lane 56-U3 now provides the first three guided remedies:
player stuck, lost items after a crash, and a disappeared chest. Each runs a strict
inspect → preview → audited commit → verify state machine, requires a normalized
reason before reading or writing, preserves the preview token/base version through
commit, verifies the new authority version and affected-player notice, and exposes
the resulting audit id. Player remedies consume only `AdminApi`; missing-container
recovery uses a narrow W4 adapter with deterministic offline custody parity. The
lazy Operate route is role-gated and six focused model/registration tests cover all
three seeded workflows. W2/W4 registrations and the exact missing-container adapter
are integrated; live execution remains an operator acceptance gate.

**Progress, 2026-09-03:** lane 56-U2's repository models and views are implemented.
Membership is an owner-only, reasoned preview/commit workflow for roles, approval,
blocking, revocation, and the `content_editor`/`support` grants; it binds commits to
the preview fingerprint and prevents removal of the final owner. Observe exposes
bounded audit and connection pages alongside presence, tick telemetry, validation,
and content-revision summaries without granting mutation authority. Both tools are
lazy-registered in the Studio shell, keep anonymous construction transport-free, and
have deterministic adapters covering authorization, paging, stale previews, and
registration. Focused tests, Studio typecheck, and the production build pass. Their
generated bindings and live transports are integrated; deployment of the compatible
Phase 2 module remains the operator gate.

### Phase 3 — objects, containers, world control

Target scope: object reducers of §5.4; Container Inspector, Object Manager, NPC
Manager, World Control; complete Map Editor overlays and mounted "spawn here"; world
validation and repair. The progress notes below and §13 distinguish the implemented
manager/model work, the mounted allowlisted Map placement flow, and the live-only
operator gates.

**Done when:** a missing chest is replaced with its contents restored from the audit
payload, a placed station is moved without losing processor state, and validation
reports zero orphans on the live world.

**Progress, 2026-09-03:** lane 56-W4 is implemented. Nine typed object authority
reducers share one immutable planner and private 60-second preview receipt for
spawn, safe despawn, movement, authored state patches, container slots, repair,
definition replacement, NPC relocation, and bounded resource respawn. Exact base
versions and preview fingerprints bind every commit. Despawn refuses to discard
non-empty custody unless the operator chooses deterministic world-item spill or
provides an explicit destruction reason; repair resets damage and processor state,
while replacement preserves position, slots, and in-flight processor custody.
Chest slot rows remain the live authority and are neither serialized into a new
table nor normalized as a side effect of an admin read. Successful commits append
typed inverse audit payloads and notify online owners. Focused planner and schema
tests cover all operations, role policy, stale receipts, collision/area bounds,
spill determinism, and container/processor continuity. Generated bindings are
present; publication and live two-client acceptance remain integration gates.

**Progress, 2026-09-03:** lane 56-U4 is implemented. Container Inspector exposes
every authoritative slot alongside owner, position, object state, and in-flight
processor custody; Object Manager provides bounded area/type/text paging, multi-row
selection, spawn, safe despawn, move, state, replace, repair, and bulk preview;
NPC Manager provides bounded authored/wildlife filtering and position/home
relocation. Every write is a reasoned dry run followed by an exact base-version and
fingerprint commit, and non-owner/admin Operate access remains read-only. The three
tools register as lazy routes and consume one injectable `AdminObjectsApi`; only the
anonymous sandbox and tests construct its deterministic mock, while connected
sessions fail closed until the generated W4 adapter is present. The reusable Map
`MapSpawnHereModel` proves the reasoned preview, exact base-version/fingerprint commit,
and fail-closed authority contract in focused tests. The active Map canvas mounts an
icon-only allowlisted chest/fruit-press/fermentation-cask flow with an authority-issued
dry-run receipt and separate explicit confirmation; stale, disconnected, anonymous,
and unsupported-kind paths fail closed. Its read-only overlay projects placeables,
chests, homesteads, resources, surfaces, combat targets, NPCs, and players onto their
semantic layers. Focused model,
registration, role, paging, custody, and bridge-model tests pass. Generated bindings
are present; authenticated live execution and two-client acceptance remain gates.

**Integration progress, 2026-09-03:** the final generated admin surface is now
wired through the shell's single authenticated `StudioConnection`. Player Manager
and player remedy playbooks use live bounded procedures and typed reducers;
Membership Manager uses live player/member reads and owner-only membership/grant
writes; World Observe uses live audit, connection, telemetry, validation, presence,
and bounded client-error feeds; and the U4 managers use live object/container
procedures and all nine W4 reducers. Procedure JSON is structurally validated at
the transport boundary. The caller-private preview table is part of the one shared
subscription, and commit paths retain the exact authority-issued base version and
fingerprint. Object creation/resource discovery alone may submit an empty base on
dry-run; the returned exact receipt is mandatory for commit, and empty commits are
rejected before transport. Connected tools fail closed if their service is absent;
deterministic mocks remain sandbox/test-only. Missing-container restoration remains
fail-closed unless a matching server-authored despawn inverse, exact original entity
id, owner/custody authority, capacity, unblocked destination, fresh preview receipt,
and authorized role all agree. Owner/admin and the bounded `support` remedy may then
restore the exact slots, processor state, damage, custody, and construction
provenance; content editors and moderators remain denied. No lossy spawn fallback is
used.

**Progress, 2026-09-03:** lane 56-W5 is implemented. `adminValidateWorld` takes one
deterministic, bounded snapshot (4,096 rows and 512 issues), checks missing-space
and collision-bound players, portal endpoints and pairs, orphaned parent rows,
custody holders/parents/claim counts, and missing or retired content definitions,
then stores a caller-private report with its exact world version, fingerprint, and
60-second expiry. Space-flag changes, single missing portal-pair repair, and report-
selected repairs share the private preview receipt and reject changed, expired, or
stale worlds before commit. The writer is deliberately narrower than the validator:
it can add a missing reverse portal, relocate a player while settling movement and
trade, release invalid carried custody, or upsert additive space flags; it never
deletes or rewrites a reported legacy/orphan row. `ownerOnly` and `buildAllowed`
overrides are enforced by live portal/build authority, while the public flag row
also carries presentation weather. Successful commits append typed inverse audit
payloads and notify active game connections. Focused planner, schema, procedure,
contract, authority, bounds, parity, and non-deletion tests pass. Generated bindings
are present; publication and validation against the preserved live world remain
release gates.

**Progress, 2026-09-03:** lane 56-U5's repository implementation is complete.
World Control is lazy-mounted at `/operate/world` with a bounded Space Manager,
time, weather, wind, MOTD, global notice, bounded resource respawn, map-history
restore, homestead relocation, and the W5
validation/repair workflow. Validation issues are navigable and distinguish safe
actions from diagnostic-only legacy findings; report repair requires every safe
action to remain explicitly selected. Every write requires an owner/admin role and
normalized reason, displays an immutable diff, and binds commit to the exact world
version, preview fingerprint, and—when repairing—a caller-private report id and
fingerprint. The result surface shows the new version, audit id, and player notice.
Its injectable `AdminWorldApi` creates deterministic data only in sandbox; connected
sessions use the single Studio live adapter and fail closed if authority-issued
preview discovery or receipt-backed commit support is absent. Focused API/model/
registration/anonymous-boundary/live-service tests, Studio typecheck, production
build, and scoped lint pass. Live two-client acceptance remains an operator gate.

The seven remaining World Control writes have a shared authority
kernel in `packages/world/src/admin/world-controls.ts`. It normalizes and validates
time, weather, wind, MOTD, global notice, map restore, and homestead relocation;
derives an operation-relevant base version; enforces exact dry-run/commit fingerprint
parity; emits typed inverse audits; and restricts all seven operations to owner/admin.
The homestead plan includes paired portal settlement and consumes the adapter's
transaction-local collision result. Their reducers, generated live bindings, exact
preview discovery, receipt-backed commits, and Studio live-service decoding are
registered and covered by world schema and Studio live-service tests.

### Phase 4 — Tile Editor and Author tools

Tile Editor per doc 50 §4/§7 publishing `tileset` definitions; the doc 55 studios
land in Studio as their phases complete; Behaviour Graph is the script editor.
**Done when:** a new tileset family is authored and used by a published map without a
rebuild, and every doc 55 studio runs inside Studio.

**Progress, 2026-09-03:** the dependency-safe sim/content portion of lane 56-T1 is
complete. `tileset` is a schema-v1, engine-versioned content kind with stable family
ids, a complete asset manifest, explicit edge/inset/ledge roles, face profiles, and
explicit available-or-reasoned-unavailable ramp/stair/ladder transitions. The
bootstrap is deterministically derived from all 14 available runtime terrain families
and exported as `packages/assets/content/tilesets.json`; `snow` remains reserved
because the checked source pack has no cliff sheet. Parser, missing-variant,
transition, asset/terrain-reference, retirement, ordering/hash, legacy-role parity,
and shared-registry tests pass without changing terrain behavior.

The T1/T2 repository dependencies are now complete: content authority, history,
subscription and generated bindings carry `tileset`; the live-map compiler and game
terrain runtime resolve the published default, per-cell family, and override fields;
and T2 is mounted with its asset picker, role/transition forms, terrain-lab fixture,
and CAS publish workflow. The remaining gate is deliberately live-facing: publish a
new family and use it in a map without a rebuild.

**Progress, 2026-09-03:** lane 56-T2's repository tool is implemented under
`tools/tiles`. The Build workspace edits projection settings and the complete edge,
inset, ledge, face, ramp, stair, and ladder banks; missing banks require an authored
reason. Its asset picker is derived from reviewed tileset manifests, frame audition
lists every authored bank, and an 11-case terrain-laboratory topology matrix resolves
the compiler's semantic layers to the draft's exact asset/frame assignments. Family
cloning enforces stable IDs, validation runs after each edit, anonymous mode remains a
fully local sandbox, and authenticated publication emits one revision-CAS `tileset`
upsert. Focused tests and Studio typecheck pass. Shell mounting and the runtime
registry consumer are integrated; the live publish→map proof remains the acceptance
gate.

**Owner-directed lifecycle authoring, 2026-09-05:** the Canvas-only Items route now
edits the selected item's single TypeScript `onUse` callback alongside its normal
definition. It exposes the callback prompt, the canonical `secondary`,
`equipmentUse`, `worldItemUse`, `useWith`, `useAt`, `aimedUse`, and `place`
invocation contexts, a multiline source editor, restricted-AST diagnostics, local
revisioned drafts, and deterministic source-bundle import/export/download. The
parser, compiler, Studio model, and Canvas creation action all reject a second
callback for the same item. Compact icon actions, tooltips, Ribbon headers, thin
frames, shared flex layout and the shared Canvas text editor keep this inside the
game UI system; no HTML form control is introduced.

The Items panel exports a deterministic source bundle for repository authoring.
There is no candidate build mode, loopback service, candidate spool, handoff CLI,
owner-confirmation record, or digest-confirmation environment variable. Agents
validate the restricted AST before materializing source, run normal repository
typechecks and tests, and build the world module. Generated code-free metadata
continues to supply client prompts; only the server executes lifecycle callbacks.

Operational acceptance requires the owner's chat approval for the specific live change.
The agent first gives a short description of what will change in the world. The
owner replies with “Go” or gives advance approval for that particular release;
that approval never carries to another release. Under the owner's later
2026-09-05 backup policy, routine code/UI updates rely on owner-managed Proxmox
backups and retain checked code rollback, non-destructive publication and
same-identity reconnect checks. Agents do not set up application backups or
require a fresh application backup/rehearsal for every routine update; host
backup setup remains with the owner and is not asserted complete here. Actual
stored-data migrations retain the guarded fresh verified backup, isolated
restoration rehearsal, `--delete-data=never` publication and state-parity checks.
If any required preservation check fails, stop and tell the owner. Passing
repository checks alone never authorizes publication.

This latest 2026-09-05 decision supersedes the owner-session and typed-digest release
workflow. The solo project's control is the owner's chat approval; revisit if a
second person ever joins. Ordinary Studio account authorization is unchanged.

### Phase 5 — polish

Session layouts, split views, keyboard map, offline sandbox parity, client error
reports, and static-build deployment for the game.

**Progress, 2026-09-03:** the Phase 5 client-error authority contract is integrated.
Authenticated game clients may append only self-owned, idempotent, normalized error
reports through a rate-capped reducer; the private additive table has no update
path and rejects secrets, query-bearing routes, invalid clocks, kinds, and
fingerprints. World maintenance trims expired reports in bounded batches after the
14-day retention period. Observe receives an owner/admin-only, scan-capped procedure
with a timestamp/id cursor. Focused contract and registration tests cover validation,
rate limits, idempotency, privacy, immutability, retention, and read authorization.
Generated bindings are present; deployed-console acceptance remains a gate.

**Progress, 2026-09-03, corrected 2026-09-04:** the first polish slice implements and
tests a versioned named-layout model with a bounded horizontal/vertical two-workspace
split and safe pre-split migration. The sole-canvas shell now mounts compact icon-only
save, restore, and split controls, and persists the split route, direction, and ratio
per route/document. The documented mode, palette, and global-search keyboard
map is normalized, conflict-checked, remappable, and persisted independently of
world state. A game-side error reporter is installed before lazy chunks load; it
redacts credential-shaped text, strips query/fragment data, bounds and deduplicates
reports, enforces a local rolling limit, and retains a 16-entry session queue until
an authenticated reducer adapter attaches. The matching authority planner rejects
secrets and malformed reports and enforces six reports per identity per minute with
14-day retention. W4 now integrates its additive private table, reducer, bounded
retention trim, and owner/admin Observe read. Finally, the game has the same static Vite
preview contract as Studio—prebuilt artifact guard, production environment template,
same-origin `/v1` HTTP/WebSocket proxy, and a systemd unit that never serves source.
Focused tests, client and Studio typechecks, and a production game build pass; live
error transport remains gated on the compatible deployed module. The static service
cutover is complete; the split-shell integration boundary is corrected below.

**Progress, 2026-09-03, corrected 2026-09-04:** split geometry, secondary-route
mounting primitives, keyboard integration, and route/document-scoped session state
are mounted in the Canvas shell. The split remains opt-in so Map opens as its full
canvas behind floating drawers. Compact icon-only controls open/close it, rotate its
direction, select its secondary route, save/restore a deterministic named layout, and
resize adjacent retained panes through an invisible overlapping hit band. All documented
keyboard chords now resolve through the remappable persisted shortcut map, rail
tooltips display the effective chords, and command/search results navigate to the
owning accessible tool. The Studio environment template and connection resolver now
agree on the explicit local and production SpaceTimeDB variables while retaining the
legacy same-origin fallback. Focused shell tests and scoped lint pass; final live
authenticated browser acceptance remains a release gate. The public anonymous
`cellar.dastari.net` static-service check now passes its built-artifact, CSP,
query-free logging, edge-limit, `/v1/ping`, sole-canvas, and zero-console-error gates.

The sole-canvas split path divides only the central `toolBounds`, filters secondary
controls from the active left drawer, and clips the secondary workspace/table/draw/actions
to its region. Its panes share an edge rather than consuming space with an inserted
resize bar, retain a 240-pixel minimum where space permits, and deterministically restore
their bounded ratio. Unit and shell-policy tests cover geometry, session isolation,
route selection, naming, restoration, and controls. Fresh deployed-browser acceptance
for opening, resizing, naming, and restoring a split layout is not claimed.

The game-side reporter is also attached only after the authenticated overworld
connection succeeds and calls the generated `reportClientError` reducer with the
bounded credential-free fields. Both connection failure paths detach it and retain a
redacted queued diagnostic for a later authenticated retry. This keeps account/login
failures local while making in-world client failures available to the owner/admin
Console procedure.

**Progress, 2026-09-03:** production continuity/release tooling is repository-complete.
Pre/post identity snapshots now include exact public map/content heads and space-flag
revisions beside profiles, positions/spawns, inventories, progression, homesteads,
owned/open containers, and processor custody. The release gate verifies a quiesced,
checksumed backup by restoring it to a disposable loopback authority and running the
same-identity comparator before any explicitly non-delete publish. A no-side-effect
release dry run and focused tests enforce ordering, non-delete syntax, credential
redaction, archive/path safety, and isolated teardown. Studio gains a static/NPM
validator for its prebuilt-only unit, canonical TLS route, same-origin `/v1` health,
CSP/security headers, rate limits, and query-free logs. Detailed world, Studio, and
edge rollback remains traffic-closed until exact parity passes.

The legacy chest retirement is a separate, staged continuity operation rather than
an ordinary schema cleanup. Its first no-delete publish keeps `world_chest`,
`world_chest_slot`, and `world_chest_damage`, adds a persisted collision-safe mapping
to unified placeables, runs only bounded owner-controlled backfill/verification,
enables dual-write, and switches both game and Studio reads. Under quiescence, every
drain batch must exactly match owner, signed position, carrier/open state, slots,
quantity, durability, lighting, and damage and must find no active legacy session.
The second no-delete publish may remove declarations only after exact verification
and drain receipts match and all four legacy chest/session tables report literal
zero rows. The installed SpaceTimeDB 2.8.2 behavior—empty removal succeeds while a
non-empty removal is refused—has been reproduced on an isolated loopback database;
it is a safety backstop, not permission to bypass the two-stage gate.
The Studio connection now derives the chest overlay from `world_placeable` only and
keeps the container/object services as model-level contracts for the in-game canvas
shell; it does not open a legacy chest subscription or introduce a DOM-only
transport. The guarded `world:chest-migrate` runner records every
status/verification/drain receipt and requires an explicit Studio consumer
acknowledgement before draining.
The guarded release is split at the acceptance boundary. Stage A backs up, rehearses
both `placeable_reads` and `drop_ready` on an isolated restore, publishes the transition
without deletion, and stops production at verified `placeable_reads` with legacy rows
and dual-write mappings retained. It then reopens game and Studio for the required
authenticated visual/two-client/reconnect checks. The finalizer re-quiesces traffic,
takes a fresh accepted-state backup, rehearses its pre/post drain using only the exact
deployed module bytes restored from that backup, verifies live pre-drain parity, drains
to `drop_ready`, verifies post-drain parity, and only then reopens traffic. Each phase
emits a separate owner-only JSONL receipt; no stale pre-acceptance snapshot is used to
approve the live drain.
The later declaration-removal publish is now isolated behind
`world:release:retire-chests`. That third maintenance wrapper requires a fresh
rollback-bundled leave-stopped backup, literal-zero `drop_ready` receipts from the
restored and live transition authorities, a pinned source tree whose regenerated
bindings are genuinely free of legacy chest/session/mapping surfaces, and v2
generic-placeable rejoin parity for the same identities on both sides of each
`--delete-data=never` publish. It verifies that the retired schema no longer exposes
the legacy names and keeps the authority plus both browser routes closed on any
post-publish failure. The automation is repository-ready, but source declaration
removal and any live invocation remain intentionally outstanding.

**Authentication readiness, 2026-09-04:** the exact-origin public
`orchard-studio` Keycloak client was created through the named-master-admin
reconciler. Its allowed Studio callback returned 200 while the game-origin and
localhost callbacks returned 400. `orchard-web` and `orchard-studio` are each present
exactly once. The post-change backup at
`/home/toby/backups/orchard-auth/20260904T002917Z` completed the encrypted off-machine
round trip, and an isolated PostgreSQL/Keycloak restore verified both client rows,
health, and discovery. Repository and service-log secret scans passed.

## 9. Tests and acceptance

**Strict acceptance audit, 2026-09-03; expanded 2026-09-04:**
`scripts/docs-55-56-acceptance-manifest.json` now records each docs 55/56 test and
Done-when as `repository_verified`, `browser_verified`, `external_required`, or
`repository_open`. `scripts/docs-55-56-acceptance-manifest.test.ts` validates unique
source references, real evidence files, and explicit prerequisites for every
credential-dependent claim. The current combined manifest has twenty-five repository,
five browser, seventeen external, and one open entry. The seven exact World Control
planners, authority reducers, generated bindings, connected adapter dispatch, and
focused parity tests are integrated. The sole repository-open **manifest** entry is the
aggregated Phase-6 lifecycle/content retirement, including the intentionally gated
legacy chest-table declaration removal: the chest portion cannot be completed safely
until the external restored-data rehearsal and live dual-write/backfill/verify/drain
gate proves all legacy chest/session tables empty. It is not an ordinary unfinished
adapter or source-retirement task and may never be bypassed with a destructive
publish.

A clean Chrome 152 production-preview run is captured in
`scripts/studio-browser-acceptance-evidence.json` and guarded by
`packages/studio/src/acceptance.test.ts`. All 14 anonymous Build/Author routes
rendered, every sandbox Connect button remained disabled, all eight directly entered
Operate/Observe routes failed closed to the local Map shell, and no `/v1`, OIDC,
console-error, or page-error event occurred. The retained evidence covers
command-palette and global-search shortcuts, search navigation to Tile Editor, and
mode navigation to Items. This is historical, narrow invariant evidence rather than a
snapshot of the current exact shell: its split-layout fields, and the fixed session-card
field in `scripts/studio-canvas-browser-evidence.json`, describe UI that has since been
superseded. It does not prove a currently openable named or split layout, the current
floating-drawer composition, or any later Map feature. The audit
removed `frame-ancestors` from the fallback `<meta>` CSP because Chromium correctly
reported it as ignored there; it remains enforced by the preview and edge response
headers. The canonical public static validator passed CSP, no-store, referrer,
content-type, and same-origin `/v1/ping` assertions at `cellar.dastari.net`.

Authenticated acceptance remains deliberately unclaimed. It requires a named
`orchard-studio` PKCE/OIDC account with the role appropriate to the operation, a
second distinct authenticated game identity for notification/rejoin/two-client
proofs, a deployed module matching the generated bindings, permission to mutate and
undo disposable player/content/map/object fixtures, and rollback/maintenance access.
Continuity verification additionally requires the exact saved OIDC tokens for every
sampled identity, a permission-restricted pre-state snapshot, and a quiesced backup.

For Stage A, `world:stage-a:acceptance` provides a read-only two-client/reconnect
preflight over only the required live map, content, generic-placeable chest, and
caller-player surfaces. It requires a mode-`0600`, refresh-capable credential file and
emits a new mode-`0600` redacted artifact with hashes/counts/revisions/timestamps but no
tokens or raw identities. Passing this preflight is not authenticated Studio acceptance:
the artifact keeps visual canvas, mutable admin/undo, content publication/rollback,
and gameplay interaction fields at `not_run` until their operator evidence exists.

- Package boundary lint: `@orchard/studio` and `@orchard/client` may not import each
  other; `@orchard/engine` and `@orchard/ui` may not import bindings or auth.
- Every admin reducer: happy path, auth failure for `friend` and `moderator`, `support`
  cap enforcement, `dryRun` parity with commit, audit row with inverse, notice written
  for online targets.
- Every procedure: owner and admin succeed, others rejected, paging terminates, no
  unindexed scan (assert with the `*RowsScanned` counters).
- Studio logic tests at the model layer: selection bus, preview diff rendering, reason
  enforcement, playbook step ordering, content-head conflicts, and the Map Editor's
  verified live-head adoption, clean advance, dirty-conflict, and checked-out-base CAS
  behavior.
- Two-client acceptance: operator edits an online player's inventory; the player's
  client updates and shows the notice; undo restores the exact stack.
- World continuity acceptance: before any Studio/binding/auth/administration rollout,
  run the permission-restricted `world:rejoin-smoke capture`; after the additive
  publish/restore, run `verify` with the exact same saved OIDC tokens before returning
  traffic. The version-2 read-only targeted subscriptions compare all mandated player
  state, owned generic-placeable rows, their complete slot/damage state, and process
  state exactly and fail closed on missing views,
  rows, identity drift, subscription errors, or mismatch. The only observer-effect
  exclusions are presence/notice/session UI state, the public online/activity fields,
  and `connections_opened`, `world_entries`, and `time_played`, which reconnect itself
  changes; all other statistics remain exact. An authority-side quiesced snapshot can
  remove the three-statistic exception. Follow `ops/BACKUP-RESTORE.md`.
- The repository module and generated bindings include the additive caller-private
  `ownPlayerSpawn`, `ownPlacedPlaceableSlots`, and `ownPlacedPlaceableDamage` views.
  Back up and publish the production module non-destructively before capture; a stale
  deployment still fails closed, never justifying a bypass.
- Security review per doc 15 before Studio is exposed on a public hostname: CSP, no
  token leakage, redirect URI exactness, rate limits.

## 10. Risks and open questions

- **Procedure deployment parity.** The isolated 2.8.2 capability proof in §5.3
  passed and the generated procedure bindings are present. Stage A must still prove
  the same calls against the deployed production module; the documented
  `admin_target` fallback is only for a future host regression.
- **Extraction regression.** The package move is complete. Boundary lint, stale-path
  tests, production builds, and chunk-content checks remain the guards against code
  drifting back into the game client.
- **Two origins, one identity.** Session peers already exist for the popup login; test
  that a Studio login does not disturb a game session in another tab.
- **Operator power.** The `support` role and caps exist so day-to-day help does not
  require an owner; keep economy edits visible in Observe.
- **Decided (owner, 2026-09-03):** hostname `cellar.dastari.net`; all
  surfaces move, including Character Studio and audio; no `/editor` routes remain in
  the game.
- **Decided (owner, 2026-09-03):** the `support` grant lands in Phase 2 with the
  administration API and Player Manager.

## 11. Work breakdown for parallel agents

Lanes follow [15](15-agent-workflow.md) §8.1. The extraction phase is dominated by
import rewrites, so its lanes are ordered by the import graph rather than by size.

### 11.1 Phase 0 extraction lanes

| Lane | Depends on | Owns | Done when |
|---|---|---|---|
| **56-X0 package scaffolds** | — | `packages/{engine,ui,world-bindings,auth,studio}/package.json`, `tsconfig.json`, eslint boundary rule ("client and studio may not import each other; engine and ui may not import bindings or auth"), shared `packages/assets/generated` output in `build-atlas.ts` and both Vite `publicDir`s | `npm run typecheck` passes with empty packages; boundary lint fails on a deliberate bad import |
| **56-X1 bindings** | X0 | `git mv packages/client/src/net/generated` → `packages/world-bindings/src`; retarget root `world:dev` and world `generate` scripts; client imports rewritten | bindings regenerate into the new path; game builds |
| **56-X2 auth** | X0 | `git mv src/auth/*` → `packages/auth/src`; client imports rewritten | login, refresh, popup peer flow unchanged in browser check |
| **56-X3 ui** | X0 | `git mv src/ui/*` (design system, widgets, skin, storage frames, compositions, bindings) → `packages/ui/src`; client imports rewritten | UI tests pass in the new package; no `src/ui` remains in client |
| **56-X4 engine** | X3 (art draws through ui skin) | `git mv src/render/*`, `overworld-art.ts`, `display.ts`, `loading-screen.ts`, `editor/editor-terrain.ts` → `packages/engine/src`; `live-map-runtime.ts` re-pointed | render tests pass; game chunk contents unchanged except paths |
| **56-X5 client reconcile** | X1–X4 | `canAdministerWorld` = `owner || admin`; chunk-content check script | Phase 0 Done-when |

X1 and X2 run in parallel; X3 then X4; X5 is the integrator.

### 11.2 Phase 1 Studio lanes

| Lane | Depends on | Owns | Done when |
|---|---|---|---|
| **56-S0 Studio design language** | X3 | `packages/ui/src/studio/*`: rail, dock frames, tab strips, inspector property rows, badges, table kernel skin, reviewed in the UI Lab against Map Editor neighbours (§4.1) | every §4.2 dock has a reviewed specimen at UI scales 1–3 |
| **56-S1 shell** | X0–X4, S0 | `packages/studio/src/shell/*`: rail, routes, session state, environment switcher, `StudioConnection` (from `editor-live-connection.ts`), `registerStudioTool`, floating-drawer layout manager with saved widths/layouts, World and Live Outliners, Inspector kernel, route-owned validation/history surfaces, command palette, selection bus, notifications, table kernel, `StudioCanvas` kernel from `editor-viewport`/`editor-picking`/`editor-overlays` | shell loads anonymously with no adapter; role gating tests; layout save/restore tests; Live Outliner shows live rows on a local host |
| **56-S2 map and object** | S1 | `git mv` Map Editor + Object Studio into `packages/studio/src/tools/{map,object}`; adapt to shell | every doc 42 verification-log scenario passes in Studio |
| **56-S3 lab, character, items, audio** | S1 | UI Lab, Character Studio, Item Studio, audio preview moved to `tools/{ui-lab,character,items,audio}` | each tool loads; audio preview plays; character studio renders rigs |
| **56-S4 deployment** | — | Keycloak client `orchard-studio` in `ops/orchard-auth/realm`, `OIDC_CLIENT_IDS`, `ops/orchard-runtime/systemd/orchard-studio.service`, proxy fragment, Studio CSP and `vite build` | Studio reachable at `cellar.dastari.net` with login |
| **56-S5 client deletion** | S2, S3 | delete `editor.html`, `audio-preview.html`, `editor-main.ts`, `audio-preview.ts`, `main.ts` editor branches, `editor:dev`, editor carve-outs in `vite.config.ts` and `csp.test.ts`, route tests | game bundle contains no editor code; Phase 1 Done-when |

S4 can run from day one alongside X lanes.

### 11.3 Phase 2 administration lanes

| Lane | Depends on | Owns | Done when |
|---|---|---|---|
| **56-W0 admin contracts** | — | `packages/world/src/admin/contracts.ts`: procedure return types, reducer arg types, `AdminReason`, audit `payload` schema, error codes; `packages/sim/src/admin/*` pure diff/preview helpers | types and fixtures merged; procedure spike result recorded in §5.3 |
| **56-W1 procedures and audit** | W0 | `packages/world/src/admin/procedures.ts`, audit indexes and `payload` column, `adminAuditPage`, `adminConnectionsPage`, retirement of the two `request*` views | each procedure's auth and paging tests; `*RowsScanned` assertions |
| **56-W2a inventory reducers** | W0 | `admin/inventory.ts`: give, remove, set slot, clear cursor, drain overflow | dryRun parity, audit inverse, notice tests |
| **56-W2b economy and progression reducers** | W0 | `admin/progression.ts`: wallet, stats, vitals, skills, quests | same, plus `support` cap tests |
| **56-W2c position and session reducers** | W0 | `admin/position.ts`: spawn, respawn, unstick, teleport, kick, notify | same, plus movement-boundary test |
| **56-W3 roles and grants** | W0 | `content_editor` and `support` grant tables/reducers, `auth-policy.ts` matrix, caps as `balance` definitions | matrix tests per role per reducer family |
| **56-U1 AdminApi and Player Manager** | W0 (mock adapter until W1/W2) | `studio/src/admin/api.ts`, `tools/players/*` with all tabs, preview diff, reason enforcement | model-layer tests; two-client acceptance with W lanes merged |
| **56-U2 Membership and Observe** | W1, W3 | `tools/membership`, `tools/observe/{audit,connections,presence,telemetry}` | Phase 2 Done-when with U1 |
| **56-U3 playbooks** | U1 | `tools/playbooks/*` for the first three remedies | each playbook runs end to end against a seeded world |

W1, W2a–c, and W3 are independent after W0 and own separate new files; the integrator
merges their `index.ts` registration blocks and regenerates bindings once.

### 11.4 Phase 3 and 4 lanes

| Lane | Depends on | Owns |
|---|---|---|
| **56-W4 object reducers** | W0, doc 55 lane B0 (entity ids) | `admin/objects.ts`: spawn, despawn, move, state, slots, repair, replace, NPC relocate, resource respawn |
| **56-W5 world validation and repair** | W1 | `adminValidateWorld`, `adminRunWorldRepair`, space flags, portal repair |
| **56-U4 container, object, NPC managers** | W4 | `tools/{containers,objects,npcs}` plus the mounted correctly layered Map overlays, allowlisted preview/confirm placement flow, runtime object actions, and guarded NPC current/home relocation; authenticated execution remains open |
| **56-U5 World Control** | W5 | `tools/world` |
| **56-T1 tileset registry** | doc 50 §4 | `packages/sim/src/terrain/tileset-registry.ts`, `tileset` content kind (coordinate with doc 55 lane A2) |
| **56-T2 Tile Editor** | T1, S1 | `tools/tiles` |
| **56-U6 doc 55 studios** | doc 55 lanes E, F, G, H, I | move each studio into `tools/*` as it lands |

### 11.5 Parallelism map

```text
X0 ─┬─ X1 ─┐
    ├─ X2 ─┼─ X3 ─ X4 ─ X5 ─┬─ S1 ─┬─ S2 ─┐
    │      │                │      └─ S3 ─┼─ S5
S4 ─┘      │                │             │
W0 ─┬─ W1 ─┼──────────────── U2 ──────────┤
    ├─ W2a ┤                              │
    ├─ W2b ┼─ U1 ─ U3                     │
    ├─ W2c ┤                              │
    └─ W3 ─┘                              │
         W4 ─ U4     W5 ─ U5     T1 ─ T2 ─┘
```

Wave 1: X0, S4, W0 (three agents); S0 starts as soon as X3 merges. Wave 2: X1, X2, then X3, X4 (two agents, two
steps). Wave 3: X5, S1, W1, W2a–c, W3 (up to six agents; W lanes are world-only and do
not conflict with S1). Wave 4: S2, S3, U1, U2. Wave 5: S5, U3, W4, W5, T1. Wave 6: U4,
U5, T2, U6.

### 11.6 Conflict rules specific to this plan

- During Phase 0 no lane changes logic; a lane that finds a bug files a
  `TODO(56-X5)` and the integrator decides.
- Import rewrites are done by script (a single `sed`/codemod committed with the lane)
  so a rebase can re-run them rather than hand-merge hundreds of lines.
- `packages/world/src/index.ts` follows the doc 55 §18.4 registration-block rule; admin
  reducers live in `packages/world/src/admin/*` and only their registrations touch
  `index.ts`.
- Studio tools may not import from each other; anything two tools need moves into
  `studio/src/shell` and is owned by S1, which stays open as a maintenance lane.
- Ops files under `ops/` are owned by S4 alone; other lanes request changes there.

## 12. Bookkeeping

- DECISIONS.md: 2026-09-03 entries record the Studio hostname, full move, route
  removal, and the Phase 2 `support` grant as decided.
- docs/00 gains this document; docs/14 gains milestone M5.16.
- On Phase 0 start: update docs/02 (repository layout and package table), docs/09
  (roles and grants), docs/42 (routes move to Studio), docs/53 T8 (retirements),
  ops/orchard-runtime/README.md (second unit and client), docs/24 (second OIDC client).

## 13. Current completion boundary and remaining work (audited 2026-09-04)

The production shell/deployment and Stage-A module deployment are complete. The
latest successful interaction-hotfix release used the fresh mode-`0600` backup at
`/home/toby/backups/orchard/20260904T054800Z-interaction-hotfix`, proved the isolated
restored transition/drain, passed version-2 same-identity rejoin parity across 38
durable tables, and left production reversibly at verified `placeable_reads`. The
`orchard-world`, `orchard-frontend`, and `orchard-studio` services returned healthy.
Production intentionally retains 11 legacy chest rows and 176 legacy slot rows beside
their verified generic-placeable mirrors; rehearsal and production retained
`chest-verification:6d0c7263`, while only the isolated rehearsal reached literal-zero
`drop_ready`. The evidence contains no private credentials.

Backup and restore descendants now run as background maintenance by default.
`backup-world.sh`, `restore-world-rehearsal.sh`, and the retirement rehearsal inherit
`WORLD_MAINTENANCE_NICE_LEVEL=15` plus Linux idle I/O scheduling (`ionice -c 3`) for
checksums, archive compression, extraction, and disposable authorities. The override
is range-checked, priority failures warn explicitly, and the release-continuity tests
cover the three guarded entry points. A subsequent read-only checksum pass verified
the retained 6.26 GB world archive, rollback archive, and both manifests again while
the live authority stayed healthy; no maintenance or publish process remained.

The same release deployed generic-chest frame compatibility and exact faced-tile
station targeting. Migrated generic chests resolve `frame:chest` from their chest kind
or `object:chest` definition id, while station interactions no longer use the radial
reach check that rejected valid cardinal/facing targets. The inspect-first
`scripts/placeable-interaction-acceptance.ts` harness is repository-tested for exact
owned chest, fruit-press, and fermentation-cask targets, complete durable-slot
comparison, guaranteed close cleanup, and explicit production confirmation. It has
since been complemented by a signed-in production game-browser check: a Stage-A
migrated generic chest opened and closed without any item movement, retained its
contents, and produced no observed client or reducer error. No press or fermentation-
cask interaction was attempted in production.

The later repository-only frame-topology slice makes Studio's Frame Designer output
the direct game presentation contract rather than a name-based client convention.
Frame definitions now carry surface/custody metadata and conditional pane visibility;
the Canvas game lays out every verified definition by its stable id, and an active
object selects the frame through `components.frame.ref`. Titles, pane order, slot
bindings/restrictions, progress bars, button tones/actions/visibility, hotbars, and
resize policy therefore travel with the authored frame. Existing schema-v1 revisions
without the new optional presentation metadata retain the compiled continuity view
and gain no capability. A renamed lunar-apparatus fixture covers the generic client
adapter and UI action path. This does not publish a content revision, change a world
row, or satisfy the authenticated Frame Designer/browser acceptance gate.

Processor behavior was subsequently exercised only on a disposable loopback restore
of the same checksum-verified interaction-hotfix backup. Legacy empty-definition fruit
press `4131` opened its press frame with all three slots visible, closed, and retained
the exact slots, idle processor fields, and closed state with zero item movement. The
only restored legacy fermentation cask, `4129`, contains an active `must` batch and
was deliberately never opened, because opening invokes processor settlement before
frame activation. An owner-scoped empty cask fixture `9223372036854792204` was instead
created through the clone's existing admin preview/fingerprint authority; it opened
the fermentation frame with both slots visible, closed, and retained its slots, idle
processor fields, and closed state with zero item movement. The temporary authority,
data, fixture, and clone-only credentials were destroyed afterward. Production was
neither contacted nor mutated. This is restored-clone evidence, not production
processor acceptance; focused runtime tests separately prove that empty-definition
press/cask rows resolve their compatibility definitions and frame handlers.

The harness distinguishes generic-chest two-tile radial reach from exact faced-tile
processors, derives runtime definitions for legacy rows whose `definitionId` is empty,
and explicitly reports why a non-owner target can be inspected but cannot safely be
used by this harness.

Anonymous sole-canvas browser evidence and exact-origin Keycloak/static-edge evidence
are also complete. The signed-game chest check does not constitute authenticated
Studio, content-publication, processor, or two-client acceptance; those remain
deliberately unclaimed.

Repository map route/session foundations are implemented. The route-owned map canvas
extends beneath two floating drawers and the global icon rail; there is no permanent
top navigation or footer. The drawers resize through overlapping edge hit bands rather
than inserted layout bars. Wheel zoom, middle-button drag, and Space+primary drag pan
the same retained camera. State is keyed by canonical route and document id and
restores camera, workspace, terrain tool and terrain-palette mode, selected surface and
cliff families, active and hidden layers, per-session editable-layer locks and one
editable-layer solo target, prefab/biome selection, active elevation, scatter density,
palette query, and palette scroll. Exact per-cell override choices are
re-derived from current topology rather than persisted as stale authority.
`/build/map/procedural-world` opens its own 400×400 seed-preview document instead of
aliasing the live island, but its signed procedural plane is not presented as a finite
resizable map. Versioned validation, write de-duplication, fail-soft storage, and route
teardown of interaction state, pending terrain work, workers, timers, and renderer
resources protect startup and navigation.

The current canvas implements the Terrain/Biomes split, elevation-aware picking,
object transforms and one-entry scatter, transformed-footprint selection/drag
previews, and topmost-visible auto-picking. Its searchable palette defensively parses
subscribed `ObjectContentDefinition` rows and merges each usable, non-retired reviewed
sprite with the generated-catalog fallback while preserving display name,
container/processor/frame tags, placement layer, and collision footprint. Authored
objects and landmarks support move, nudge, rotate/flip/scale, clone, hide, and delete.
Projected homesteads, surfaces, combat targets, NPCs, and players remain read-only; generated
resources retain reversible document suppression, while eligible live placeables and generic chests
use receipt-bound actions. Palette/World/Live views mount windowed Canvas Outliners in one thin Ribbon card. Both trees have a retained-canvas search field; matching rows keep their ancestor path without changing authored expansion state. Arrow, Home/End, Enter, and Space implement standard tree navigation with actual shell focus handoff. The route/document session retains the World query, expansion, focus, selection, and active view, while volatile Live state is deliberately session-ephemeral. Typed world and live rows
select through the shared bus. Authored objects and landmarks can move to another compatible visible/unlocked object layer through a compact layer-row action, and Ctrl+Up/Down reorders an eligible focused layer; access, conflict, active publish, schema parent/order, cycle, system-lock, hidden/solo, compatibility, and boundary checks fail closed before the model creates exactly one undo entry. Live rows remain explicitly read-only. The separate Selection card switches between composed
visual details and every schema-kernel field, including value/type, access/error,
pin/reset availability, and WHY help, without fabricating generic property mutation.
The compact Photoshop-style Layers card is topmost-first and clipped; when selection is
empty it uses the full drawer. Eye, active target, per-session lock, and solo are separate
icon actions. Hidden, locked, and non-solo targets reject mutation; system locks stay
immutable. Shift-range and Ctrl/Meta-additive selection keeps one primary authoring target;
bulk eye/lock excludes immutable locks. World-object selection stays a separate target.
Authenticated Live Outliner population remains unclaimed. The Canvas mounts tested authority-issued dry-run plus explicit-confirm placement for allowlisted chests and processors.
Selected live placeables/chests also expose icon-only move, repair, and safe-despawn actions:
each re-reads authority state, rejects stale projected identity/kind/position, previews without
mutation, forwards the exact base/fingerprint on confirmation, requires a matching audit receipt,
and warns before changing player-owned custody. Escape, route disposal, and map conflicts cancel pending
work; authenticated deployed execution and production actions remain unclaimed. Eligible live NPC rows expose
one compact current/home relocation action: the operator picks a destination, receives an authority-issued
`relocate_npc` dry-run receipt, and must explicitly confirm the exact base version and fingerprint. The Canvas
requires the matching entity id, operation, mutation id, committed audit, and inverse-audit NPC id plus
the exact original space and current tile before
reporting success. A newer authority state fails stale, late previews cannot resurrect cancelled work, and
Escape, route disposal, selection loss, custody changes, and map conflicts cancel the pending action. Player
entities, player-owned layers, currently ridden NPCs, generated wildlife and boats, non-overworld spaces, and callers
without live write authority fail closed. The Live Outliner remains honest to its bounded camera region; global
player/homestead metadata enriches those bounded rows without widening the seven spatial subscriptions.

Terrain authoring includes endpoint/width validation and one-entry undo for transition
gestures, but it no longer treats traversal semantics as proof that matching art
exists. One shared registry-backed capability check is used by Studio planning, engine
authoring, map validation, and the repository world publication path. New content may
use only a two-lane north/up slope whose selected family registers the matching ramp
bank. New/imported stairs, ladders, ropes, other directions, one-lane banks, and
artless families remain visible as invalid previews with exact reasons and cannot be
published. The original generated island's six version-30 stair tuples retain their
existing slope-bank compatibility through a named warning pinned to the exact map id,
832x832 base, seed/version, stone family, endpoints, grouping, and tuple fingerprints;
any near miss fails closed. This keeps the unchanged live world republishable without
generalizing its historical art substitution.

Shift+surface fill
discovers the four-connected resolved-surface region in fixed 2,048-cell event-loop
batches, commits one deterministic terrain command only after completion, and cancels
without a partial edit on new input, tool/layer change, undo, or route disposal.
Finite authored documents can grow any edge immediately or preview a one-tile crop
with explicit loss counts and danger confirmation; terrain/biome overrides, objects,
landmarks, transitions, stairs, scenery, and anchors translate or crop together as one
undoable edit. The canonical live island is deliberately **not resizable** because its
832×832 dimensions are fixed by server authority, and the procedural signed world has
no finite edge. The Canvas source now exposes searchable surface/cliff-family modes,
topology-compatible exact atlas overrides, and dry visual-only authored farmland. The
Inspector applies or clears per-cell family and exact overrides and can set the document
surface-family default; the eyedropper arms the exact composed cell for one stroke.
Runtime wet-soil and crop authority remain separate, and this newly integrated terrain
palette is covered by dedicated Canvas/model/controller interaction tests. Its own
fresh deployed-browser acceptance is still not claimed.
The Anchors layer also exposes safe Canvas-native annotation
authoring: `poi` and `label` can be placed, selected, dragged, nudged, relabelled, and
deleted as ordinary draft edits, while functional runtime anchor kinds remain visibly
unavailable with their authority-bound reason.

The initial terrain compiler/validator and edited-map picking use bounded module-worker
paths; overview rendering uses level-of-detail omission, a capped backing store, and
stable terrain/live-marker identities. Subscription callback bursts are coalesced,
unchanged live projections are ignored, and moving player/NPC projections are capped
at approximately 5 Hz while content/head/control updates remain immediate or
microtask-coalesced. Projection state has per-table dirty flags and stable arrays,
dependency-keyed identity/profile/appearance indexes, and one `world_placeable` scan
for placeables and chests. Seven high-volume spatial tables now use one bounded,
indexed camera-chunk rectangle each, with two-chunk overscan, a one-chunk hysteresis
margin, and 140 ms debounce. Handoffs subscribe first and retire the previous region
only after apply; global player/homestead metadata labels the bounded Live Outliner.

The optional `H` height and `C` collision overlays are independent of the global `G`
grid. At readable zoom they inspect only the projected visible tile range; at distant
zoom their 832x832 semantic masks are built after input returns in jobs capped at
8,192 tiles, uploaded in bounded row strips, cancelled independently when hidden, and
retained for a later single visible-source blit. Terrain replacement, plane changes,
and route disposal cancel stale jobs and release their canvases. The gray/white grid
and overlays were exercised manually on the canonical public Studio route with the
normal state restored afterward. One operator observation over two seconds delivered
102 animation callbacks and reported a 27.1 ms final toggle repaint. Those numbers are
observational until recaptured in a source/build-hashed evidence artifact; they are not
authenticated publishing acceptance.

The interaction-hotfix Stage-A release installed the semantic object palette,
shell-wide grid preference, topmost-visible picker, and initial terrain-worker paths.
Later work has separate states: repository-tested source, a production-mode artifact
written to the static service's `dist`, and a fresh canonical-browser verification.
Transition, async-fill, lifecycle, expanded-overlay/layer, resize, projection-cache,
and overlay-job work reached the first two states; the H/C/G exercise above is the
narrow current-route observation. One such build
briefly exposed a missing `shield-x.svg` collision icon as a fail-closed blank Canvas;
the Studio public asset was added and a manifest test now requires every preloaded
Canvas icon to resolve to an existing, unique SVG (including
`collision -> shield-x.svg`). The canonical route rendered normally after rebuilding.
None of this closes authenticated Studio publication or full doc-42 production
acceptance.

The Map Editor's live-head checkout is now repository-tested as well. `/build/map`
parses the subscribed canonical document and verifies its map id, revision, and full
content hash before adoption. A clean checkout adopts the initial head and follows a
later clean remote advance; a locally changed checkout instead preserves its document,
undo history, and stored draft and raises one explicit conflict when a different head
advances. Revision-independent semantic hashes allow an authority-assigned revision to
acknowledge submitted content without producing a false conflict. Draft envelope
version 2 persists the checked-out base revision, base semantic hash, and dirty state;
version-1 drafts migrate conservatively and remain dirty until an exact authoritative
head proves otherwise. Publish captures that checked-out base and passes it unchanged
through `StudioConnection` as the reducer's compare-and-swap `expectedRevision`; the
adapter no longer substitutes the latest subscription revision after the model has
checked its draft. Focused model/live-sync tests cover initial adoption, clean advance,
dirty preservation, semantic acknowledgement, and stale-base rejection. Publish
remains explicit: its compact icon-only Canvas command exposes exact CLEAN, DIRTY,
PUBLISHING, and CONFLICT states and a precise disabled reason. A conflict opens a small
thin-frame/Ribbon plate. `Keep Local` only dismisses that plate while preserving the
publish block; `Reload Latest` discards local work only after the subscribed map id,
revision, and hash all verify. The normal command row and conflict plate can download
the current local draft as bounded, canonical V3 JSON without changing live state.
Unsupported browser previews and rejected download requests produce explicit errors;
success means that a download was requested, not that a file was silently saved. A new
remote revision reopens a dismissed conflict. An icon-only automatic-publication
command now shares that exact model/CAS path. It defaults off when a route session has
no explicit setting, persists an author's opt-in per route/document, and publishes only
the latest dirty edit after 250 ms of quiet. Pending or failed validation, a newer live
head, subscription synchronization, disconnection, read-only access, missing authority,
or a missing publisher blocks the timer with a precise tooltip. One request may be in
flight; intervening edits coalesce behind it, a failed edit is not hammer-retried, the
manual Publish action uses the same single-flight gate, and route disposal cancels
pending work. This is repository-tested orchestration, not a claim that an authenticated
automatic publication was executed against production.

The repository world publication path now runs full terrain validation against the
pinned bootstrap tileset registry before commit or restore. Missing/malformed overrides, arbitrary or
out-of-range frames, topology-incompatible edge/inset/ramp/face roles, invalid face
rows/joins, unavailable or dynamic families, and reserved snow fail closed. Legacy
frame-only overrides remain valid only when the renderer's precedence infers one exact
semantic target. The server continues to enforce the canonical 832x832 size,
generator seed/version, content caps, role authority, compare-and-swap revision, and
mutation-idempotency boundaries.

Gameplay anchors are hardened at the same repository boundary. Parsing reconstructs
only the six registered kinds, bounded stable
ids and labels, integer in-bounds coordinates, elevation -32..32, terrain-height
agreement, and cross anchor/object/landmark id uniqueness. Publication caps anchors at
4,096 and accepts only inert `poi` and `label` annotations. Functional `spawn`,
`portal`, `npc`, and `resource` anchors fail `live_map_anchor_kind_not_bound` before
commit, with tests proving publication does not mutate portal, NPC, resource, or player
authority tables. The Canvas palette mirrors that boundary: it enables only POI and
Label tools, derives deterministic ids, resolves the tile's exact terrain elevation,
and renders disabled icon tools with precise runtime-authority tooltips for the other
four kinds. Authored annotation anchors are viewport-culled, disambiguated from live
entities by the `map-anchor` selection kind, and have no scale/rotate/flip/hide actions.
Their compact Inspector action uses the shared Canvas text editor; Enter/confirm creates
one undo entry, Escape creates none, and invalid text leaves the draft visible for
correction. This prevents a decorative editor marker from masquerading as live gameplay
authority after the next guarded world release; the stricter world validator is not
claimed as deployed production authority yet.

The canvas Map Editor also has a repository-tested, undo-free eyedropper. Its compact
icon sits beside palette search, `I` toggles it, and `Escape` cancels it. A successful
one-shot sample clears the palette query/scroll without changing the map revision or
hash. In Terrain/Biomes it reads the composed cell: supported surface, path, ledge,
collision, biome, and elevation semantics become the active palette choice, and a
sample taken while viewing generated base returns the target to the editable Terrain
layer. In Objects/Scatter it checks visible authored objects across their transformed
footprints, then selects that object's embedded prefab and actual authored layer.
Player-owned and other live/generated rows are never converted into editable prefabs
or mutated by this workflow. Terrain sampling preserves exact surface, feature,
collision, cliff/surface family, `terrainOverride`, and ledge semantics as a one-stroke
patch instead of choosing an approximation; the dry farmland feature does not create
wet-soil or crop state. Terrain/painter and integrated Canvas interaction tests cover
the exact data and control boundary; deployed-browser eyedropper/terrain-palette
acceptance remains open.

The game client's canonical live-island startup also has a behavior-preserving fast
path for the sparse unedited map document. It reuses the generator's terrain arrays,
including the exact elevation, biome and blocked classifications, together with the
shared generated plane-collision bytes; authored objects, landmarks and suppressions
remain overlay data and do not disqualify reuse. Any authored terrain difference—cell,
stair, transition or base-family/default change—fails the eligibility check and
automatically takes the full document compiler path. On the recorded repository
benchmark this reduced total preparation from 7.57 seconds to 4.15 seconds and the
live-overlay portion from 3.565 seconds to 2.08 milliseconds. Identity-reuse and
authored-edit fallback tests cover the decision boundary. These timings and tests do
not substitute for the still-open authenticated same-identity browser rejoin proof.

The game launch path is hardened independently of those terrain timings. Collision
and light-occlusion compilation now waits for connection, identity, world seed,
clock, environment, and authoritative player position. The fixed-step RAF loop caps
catch-up at four updates, discards excess stalled-frame time, stops while the document
is hidden, and resumes with a fresh timestamp. The revisioned PWA worker returns
successful navigation and static-asset network responses before a best-effort
`CacheStorage.put`, registers that write synchronously through `waitUntil`, and keeps
cache-hit plus offline app-shell fallback semantics. Focused readiness, accumulator,
stalled-cache, typecheck, lint, and production-build checks pass; this repository
evidence is not a new remote signed-in rejoin measurement.

Separately, the Studio Map Editor's initial live-island overview now moves its
832×832 terrain preparation into a dedicated module worker. The exact canonical
bootstrap reuses a generator-derived golden of the production island's 22 crossings;
a parity test compares the entire bootstrap document with
`createLiveIslandMapDocument`, so a future generator change must update the golden
explicitly. Only that exact untouched production terrain bypasses the redundant full
map validator. Authored or noncanonical documents continue through
`validateMapDocument` and `terrainArrayForMapDocument`. The worker reuses the gameplay
`terrainForWorld` arrays, byte-packs dense traversal fields, sends typed arrays through
transferables, represents the otherwise dense null override array sparsely, and
expands traversal bytes in 32,768-cell event-loop chunks. The overview also reuses the
already verified canonical crossings instead of starting the generator again on the
main thread. In a fresh local Chromium observation, the pre-change production Studio
route recorded one 1,648 ms main-thread long task; the patched local production build
recorded zero tasks over the 50 ms long-task threshold during the first four seconds.
The exact terrain was observed becoming available asynchronously after approximately 0.8 seconds,
leaving the canvas responsive while it was prepared. Selection now reuses that exact
completed renderer terrain instead of compiling an edited or noncanonical 832×832 map
inside the pointer event, and edited-map validation is debounced through a bounded
module-worker queue. Browsers or non-browser render hosts without module-worker
support retain the synchronous compatibility path. The interaction-hotfix Stage-A
release installed the initial terrain-worker path; later selection and validation
changes were rebuilt separately as static Studio artifacts. These timing numbers are
operator observations without a source/build-hashed evidence artifact, not a
machine-backed remote-browser benchmark, and are independent of the preceding
7.57-to-4.15-second game-client preparation observation.

The manifest's sole `repository_open` acceptance item is Phase 6, but it explicitly
aggregates the 2026-09-05 lifecycle-ownership audit as well as the intentionally gated
chest declaration removal. Registered events without live raisers, specialized
processor/frame commands, exact-kind tool/loot/NPC/quest paths, and incomplete object
components remain real repository migration work. The editor's authored `onUse`
callback remains the capability boundary; these authority seams must consume its
validated effects rather than become parallel item behavior. Separate Studio refinement
includes Outliner search/reparent,
generic Inspector mutation and non-Map coverage, deployed regional-subscription measurement,
the optional automatic command-publish mode, and generic NPC spawn-rule editing. The mounted
runtime object and NPC relocation actions still require authenticated deployed acceptance. The integrated terrain-family/exact/farmland
palette still needs browser acceptance, but its dedicated repository interaction suite
is complete.
Missing cardinal transition,
stair, and ladder art/runtime contracts are explicit external capabilities, not code
silently approximated by this backlog.

The current repository now exposes the small commerce-policy portion of item
authoring without exposing transaction code: purchase skill requirement, bounded
homestead-claim grant, bounded estate-vintage premium selection, world-drop policy,
and equipped carried capacity are validated item fields. Studio/pack validation rejects
unknown grant/premium adapters, missing skill-node references, non-back capacity, and
capacity beyond the allocated 20 rows. Arbitrary renamed-definition tests cover all
four live decisions, including the negative case where descriptive metadata alone
does not activate them. No live pack was published in this slice, so the release
operator must promote and verify the matching content revision before deploying the
consumer cutover; existing player, inventory, wallet, homestead, and claim rows are
unchanged.

The remaining formal external and retirement gates recorded by
`scripts/docs-55-56-acceptance-manifest.json` are:

1. `56-phase-1-authenticated-deployment`, `56-phase-1-live-outliner`,
   `56-phase-1-live-audio`, and `56-tests-login-session-isolation`: complete a clean
   named-account PKCE login, live subscriptions/Outliner, audio playback, all doc-42
   Map scenarios, and prove a Studio login does not disturb a game session.
2. `56-phase-2-player-remedy` and `56-tests-two-client`: from authenticated Studio,
   inspect and remedy an online second identity with preview, reason, notice, audit,
   and exact undo. Include one deployed call through each bounded procedure family;
   repository tests alone do not prove production procedure execution.
3. `56-phase-3-world-objects`: retain the completed signed-game generic-chest
   open/close proof and the restored-clone processor evidence, then run the
   inspect-first harness and separately confirmed production interactions on safe
   owned, idle fruit-press and fermentation-cask fixtures. Also exercise
   container/object/NPC/world-control preview and commit paths on disposable fixtures,
   preserve custody/process state, undo where defined, and run live-world validation
   to zero actionable orphans.
4. `56-phase-4-authoring`: perform the doc-55 authenticated authoring flows and publish
   a disposable tileset family used by a map without a rebuild.
5. `56-phase-5-live-error-console`: send an authenticated in-world client error and
   verify its bounded owner/admin Console projection without leaking credentials.
6. `56-tests-world-continuity-next-rollout`: retain the successful Stage-A
   release/rejoin operational record, create the separate read-only Stage-A acceptance
   artifact, complete its four
   currently `not_run` visual/mutable/gameplay scenarios, then run the guarded
   finalizer. Phase 6 must also complete the audited lifecycle-ownership migrations and
   arbitrary-definition semantic tests. After literal-zero `drop_ready`, remove legacy
   declarations and execute the separate retirement release; all of that work is
   represented by the one aggregated repository-open Phase-6 entry.

The 2026-09-03 progress paragraphs remain useful implementation history. Any statement
there that the compatible module or static application had not yet been deployed is
superseded by this boundary; no phase-specific authenticated scenario is promoted
without its own evidence.


### Runtime recovery priority, 2026-09-05 (not deployed)

The current work prioritizes a matching game/module release and preservation of the
original production world. Studio and UI placeable/build palettes now receive active
registry projections; farming skill eligibility and mount interactions consume the
same authored capabilities as the server. Live Studio checkout verifies original
stored JSON against the durable head before constructing normalized draft models.
Parser defaults therefore cannot invalidate an unchanged production content head,
and draft acknowledgements remain tied to their own semantic content.

No broad canvas or shell styling is included in this recovery. The forward release
remains gated on repository validation and specific owner chat approval,
content-head merge/CAS review, backup restoration and same-player continuity. The
historical Stage-A acceptance evidence above does not certify this unreleased
migration. Directed editor priorities should be requested only after runtime and
production acceptance are complete.


### Preserved cooking escrow lifecycle, 2026-09-05 (not deployed)

The runtime migration adds authored frame actions for existing personal cooking
jobs. The cooking frame presents only the caller's exact matching station job;
the inventory frame provides cancellation even after a station is removed. Both
use the generic frame action command and primitive state bindings. The client
does not choose rewards or execute callbacks. The server preserves stored input,
output, quantity and timestamps, and records an atomic resolution receipt. New
cooking still uses authored generic processors. These repository changes require
normal release, backup, parity and reconnect acceptance before deployment is claimed.


### Routine release follow-up, 2026-09-05

The earlier not-deployed recovery sections are historical: preserved cooking and
both routine code releases are now deployed. Version 0.2.4 includes the game-input
and registry-authored entrance changes; both browser tabs reconnected with content
ready after the guarded release. The deployed revision-4 pack contains 484
definitions in 21 files, hash
`1fd79ee9`; Studio's pack fixture for that release was generated from its export.
All 3,093 tests in 529 files, typechecks, lint, content and build gates passed;
full public/private schema equality and 38-table same-identity parity also passed.
These runtime fixes do not resume broad Studio or map-editor visual refinement.


### Version 0.2.5 runtime publication, 2026-09-05

The published revision-5 pack contains 484 definitions in 21 files, hash
`8d549120`. Studio's fixture was regenerated from that export. Furnace fuel
acceptance follows the same active process policies as authority. All 3,113
tests in 530 files and the original repository/build gates passed with unchanged
public/private schemas. Web traffic remained stopped after publication while a
strict Vigour mismatch was reviewed; fresh same-identity reconnect parity then
passed all 38 tables. The original failed comparison and the exact reviewed
regeneration/presence-action exceptions are retained.

The separate offline/update UI correction passed 111 focused checks, client
typecheck, lint, isolated build and asset checks. Static recovery completed with
exact HTML/chunk checks on both canonical sites, all three services active and
final strict 38-table reconnect parity. Module, content-head and world-source
pins remained unchanged. The shared browser loaded the corrected 0.2.5 build,
rejoined the same identity and received revision-5 content with 48 inventory rows.
A controlled presentation-only disconnected/update-state check verified the
actual modal render, native cursor and one refresh dispatch from a real click;
all temporary state was restored. A new live server disconnect and real worker
arrival on 0.2.5 were not exercised. The remaining gameplay acceptance checks are
recorded separately in the recovery log. These runtime fixes do not resume broad
Studio or map-editor visual refinement.

### Client walking performance release, 2026-09-05

The client-only 0.2.6 terrain-reuse and reconciliation-smoothing repair is deployed.
All 3,122 tests in 531 files, lint, client/engine/UI/Studio typechecks, the checked
world build and isolated client build passed. No module or content was published;
the live module, content head and Studio's 0.2.5 artifact remained unchanged. The actual
waiting-worker prompt accepted a real Refresh Now click, loaded the new build
and rejoined the same identity with content ready. The user confirmed the slight
walking jitter/delay was fixed. The scoped Node collision/light refresh benchmark
improved from 51.02 ms to 1.97 ms median; it excludes Canvas/network work and is
not a browser FPS measurement. Evidence and remaining gameplay acceptance limits
are recorded in `ops/LOGIN-RECOVERY-2026-09-05.md`. Broad Studio/map-editor visual
refinement remains deferred.


### Resource discovery authoring, 2026-09-05 (deployed 0.3.0)

The 0.3.0 source pack contains 484 definitions and 65 skill nodes, hash
`9d5ace3c`; its manifest is generated from the canonical export. Optional
prerequisites and bounded passive discovery metadata are parsed and validated
through the existing skill-tree content path. The shared canvas skill UI now
receives active registry nodes and applies the same purchase eligibility rules
as authority. The five new mining/fishing discovery nodes add no persisted
tables or reducers. The guarded deployment passed 3,165 tests in 535 files,
lint, all workspace/release typechecks and checked world/client/Studio builds.
Private/public schema equality, zero deletes, retained rollback artifacts and
exact 38-table reconnect parity were verified. The live content head is revision
6, hash `9d5ace3c`, with all 484 definitions retained.

The real shared-browser update loaded `index-DmtcITOL.js` and reconnected the
same Dastari identity with content ready, no error, the five new nodes and 48
inventory rows. No new ranks were initially owned, and agents performed no skill
purchase or respec. Positive live overlay/hover/minimap behavior and the remaining
legacy gameplay acceptance checks are still unverified. This work does not
resume broad Studio styling; release evidence is in
`ops/LOGIN-RECOVERY-2026-09-05.md`.


### Material-tool authoring and mobile controls, 2026-09-05 (deployed 0.4.0)

The current repository export contains **531 definitions in 21 files**, hash
`8cfe4746`, including **181 items, 61 recipes and 37 processes**. Lifecycle
revision **11** owns 109 item callbacks and explicitly reviews 72 items as inert;
its generated source SHA-256 is
`3b9cd7a8dd00e1c92a1dc5a27164f89886b962b59fb0fe58933110453997b57f`.
The guarded 0.4.0 world/client/Studio release passed 3,203 tests in 542 files,
all typechecks, lint, content/lifecycle integrity, validation of 1,020 assets and
checked builds. Full public/private schemas remain identical. No-delete
publication retained all 484 previous content IDs and installed revision 7,
hash `8cfe4746`, with 531 definitions. The strict same-owner reconnect matched
all 38 tables after the reviewed content-head change.

The authored tool catalog covers 24 material/tool recipes: axe, hoe, pickaxe and
shovel in wood, stone, copper, gold, silver and iron. Existing item IDs and wear
are preserved. Hoe previews and authority share one tile-centre calculation and
authored two-tile reach. Mining capabilities, repair materials and durability
remain content properties; copper combines wooden durability with iron mining
capabilities, and gold keeps wooden mining capabilities. The per-tool durability
multipliers 1/1.5/1/2/2.5/3 are provisional implementation defaults in that material
order, including the unanswered silver balance choice. Shovels remain repair-only
and do not acquire an invented digging lifecycle. Authored secondary iron loot
adds a 10% silver-ore chance while preserving its primary payout, with a separate
silver smelting process.

The game client adds pinch zoom with a 250 ms long-press ownership boundary,
keeps UI/joystick touches separate from world gestures, and persists movement/action
side swapping and bottom clearance through existing retained Controls settings.
Mouse-wheel zoom is unchanged. This does not resize or restyle Studio windows.
The authored presentation batch covers 24 tool icons, 18 swing sets and two silver
item images. The completed audit resolves 181 items to 150 icons with no outlined
source variants; the atlas contains 1,020 assets. Exact prompts and four 1254×1254
ImageGen wooden concepts are in `references/generated/tool-progression/`.
`packages/tools/src/build-tool-progression-art.ts` produces 16×16 native icons
and silver images under `art/custom/tool-progression/`, plus 64×64 swing frames
packed in 64×1152 sheets with licensed Kenmi geometry preserved.

Independent release review passed. A real Refresh Now click loaded
`index-C0Vu-_QU.js`; the same Dastari identity rejoined with content ready at
revision 7/hash `8cfe4746`, no error and 48 inventory rows. The real Controls
toggle and slider persisted swapped sides and a bottom offset of 60 in a
514×1110 CSS-pixel browser preview; real-phone and pinch-gesture validation remain
open. The user found the deployed wooden icons indistinct at inventory scale,
and a separate art correction is being prepared. Outstanding legacy gameplay
acceptance remains incomplete. Evidence and exact
art provenance are recorded in `ops/LOGIN-RECOVERY-2026-09-05.md`. Broad
Studio/map-editor refinement remains outside this batch.


### Approved native tool-icon replacement, 2026-09-05 (deployed 0.4.1)

After reviewing all six materials at the game's actual inventory scale, the
owner approved all 24 replacement icons and requested installation. Axe, hoe
and pickaxe retain licensed Kenmi No Outline native silhouettes; the shovel is
an original project-authored 16×16 drawing. The selected geometry and material
palettes are recorded in `references/generated/tool-progression/review-v2/`,
including the approved `shovel-redraw-inventory-preview.png`. The earlier
ImageGen wooden concepts remain historical provenance, not the current approved
silhouettes.

The frontend-only 0.4.1 art release is installed. Asset validation, relevant
workspace typechecks, focused tests, full lint and the staged production client
build passed. Independent review verified the approved native pixels, all four
seasonal atlas copies, unchanged swing/silver art, retained prior asset URLs and
the static graph. Authenticated checks before, immediately before and after
installation matched the deployed module and revision-7 content head exactly;
Studio also remained unchanged. The installed entry is `index-BtpMA4H1.js`, with
PWA cache `orchard-0.4.1-mto1b95s`. A real Refresh Now click loaded that entry;
the same Dastari identity rejoined with no error, content ready and 48 inventory
rows. Inventory, character, skill tracks, skill nodes and quests matched the
pre-refresh snapshot exactly. All four approved wooden icons were visually
verified in inventory/hotbar. Position and recipe-cache parity are not claimed;
a subsequently reported line artifact at fractional hotbar scaling is a separate
follow-up. Remaining gameplay acceptance obligations are unchanged. Exact
evidence and check limits are in `ops/LOGIN-RECOVERY-2026-09-05.md`.


### Native icon sampling and targeted legacy-editor cleanup, 2026-09-05 (deployed 0.4.2)

The frontend-only 0.4.2 repair isolates inventory atlas frames in a reusable
cache before scaling; nine-slice rendering shares that cache. A Chrome pixel
comparison covered 768 scale/placement cases: 157 showed neighboring-atlas
bleed before the fix and none afterward, using 24 cached frames. The release
passed 157 focused tests in six files, client/UI typechecks, lint, content
validation, the production build, static checks and rollback verification. The
world module and content head matched before, immediately before and after
installation. A real Refresh Now click loaded `index-xF_puAhK.js`; the same
Dastari identity rejoined with content ready, no error and 48 inventory rows.
The hotbar icons were visibly clean at the observed DPR 1.6431677341461182 and
UI scale 1. These checks do not establish general gameplay parity.

Separately, the owner requested removal of one accidental legacy-editor apple
tree beside Fisherman Fin's hut. The existing owner-only map publication reducer
removed only object `asset-3132196081-animation-base-0-404-316-1`, using an exact
revision-2 compare-and-swap after capturing the original row/document. Live map
revision 3/hash `9b04389a` matched the expected document exactly: the other five
objects, shared prefab, all 184 landmarks, transitions, suppressions and terrain
were unchanged. This removed its 12-tile/192-subcell collision footprint without
deleting the nearby normal resource tree or hut. Original map bytes and server
revision history remain available. Release and operation receipts are recorded
in `ops/LOGIN-RECOVERY-2026-09-05.md`; other interaction/animation reports remain
separate follow-up work.


### Runtime action presentation and second targeted map cleanup, 2026-09-05 (deployed 0.4.3)

The frontend-only 0.4.3 release requires a real subscribed campfire row and
active authored secondary interaction before a contextual action can intercept
the selected tool. Local action presentation now keeps one monotonic timeline
through delayed server echoes, including overlapping swings; rejected requests
remove their own presentation token. Held bow previews and release echoes remain
separate, and selected tool poses use the active registry's equipment metadata.
Cosmetic weather phase no longer jumps when authority rows hydrate or a tab
resumes; actual weather, wind and calendar selection remain authoritative.

The release passed 59 focused tests in five files, client/UI typechecks, lint,
content/lifecycle checks and the staged production client build. The structural
extraction seam was recomputed with its existing AST algorithm; all six seam
tests are included in the passing focused suite. Guarded installation preserved
the world module, revision-7 content head and Studio, with the prior client and
old asset URLs retained. A real Refresh Now click loaded `index-86irvacy.js`.
After hydration the same identity reconnected with no error; inventory, character,
skill tracks, skill nodes and quests matched the pre-refresh snapshot exactly.
Positive live animation acceptance remains separate from that rejoin proof.

A separate owner-authorized map compare-and-swap removed only accidental object
`asset-3132196081-animation-base-0-376-350-1`. The exact result advanced live map
revision 3/hash `9b04389a` to revision 4/hash `21a3c554`, retaining four other
objects, the shared prefab, all 184 landmarks, transitions, suppressions and
terrain. The browser confirmed the target absent with four objects and 184
landmarks. Original map bytes and server history remain available. Evidence is
in `ops/LOGIN-RECOVERY-2026-09-05.md`.

The Fisher hut's left collision column and replacement of 54 remaining outlined
item icons were scheduled separately and subsequently released in 0.4.4, recorded
below. They were outside 0.4.3; broader Studio refinement remains deferred.


### Reviewed plain icon imports and shared hut collision, 2026-09-05 (deployed 0.4.4)

The 0.4.4 world/client/Studio release replaces 54 remaining outlined crop, seed
and mineral icon frames used by 77 active item IDs with reviewed native plain
source cells. Earlier filename-based audits missed contours baked into generic
sheets; the correction uses explicit source/region mappings and exact pixel
checks. Crop and ore importers consume that same mapping so regeneration keeps
the selection. All 24 approved tool icons, fruit-press art and pixels outside
the 54 changed frames remain intact; the atlas still contains 1,020 assets.

The Fisher hut's transparent left collision column is now open at tiles
`(400, 313)` and `(400, 314)`, while the five-by-two facade remains solid. Client
and world authority share the same geometry. The fixed-seed server projection
was regenerated with `npm run world:collision:generate -w @orchard/tools`; its
only byte change is ground obstacle 104's left bound from 102400 to 102656. The
first release attempt stopped before publication when the full suite detected
the stale generated artifact. After regeneration, deployment 2 passed all 3,238
tests in 546 files, all typechecks, lint, content/lifecycle/asset checks and the
checked world plus both frontend builds.

Public/private schemas remained identical, no-delete publication preserved the
world, and the same owner's 38-table before/expected/after comparison was exact.
The reviewed content candidate had zero upserts/deletes, retaining revision 7,
hash `8cfe4746`, and all 531 definitions. The new world module is
`8b79bfd18b26148dfdb4f1a242ef8e7962f7038ea243d5ad26c15b589d321c40`.
A real Refresh Now click loaded `index-BjcxJFRJ.js`; the same Dastari identity
rejoined with no error and 48 inventory rows. Live map revision 4 still had four
objects and 184 landmarks, with the separately removed `(376, 350)` tree absent.
Read-only health sampling found no critical journal matches. Actual walking
along the hut and sustained weather playback remain unverified; the automated
checks and rejoin do not imply those results. Evidence is in
`ops/LOGIN-RECOVERY-2026-09-05.md`. Broad Studio styling remains deferred.

### Chest collision and embedded-player recovery, 2026-09-05 (0.4.5 pending release)

The prepared fix keeps chests and barrels solid while their lids are open.
Walk-through behavior now requires an authored collision state condition;
`object:fence_gate` declares collision while `open` equals `false`. Client
prediction and world authority resolve the same active definition and state.
The existing `setCollision` effect now updates that declared condition through
the state planner. Unsupported state changes, malformed state and explicit
unavailable definitions are rejected; an idempotent static-container effect
preserves the original state exactly. Container contents, custody and legacy
chest migration compatibility remain intact.

A player already embedded in an object can walk outward only while reducing
penetration without increasing overlap with another obstacle or entering a new
one. Ordinary collision, terrain/elevation restrictions and strict spawn/jump
landing checks remain in place; this introduces no teleport or destructive
world repair. The generated content export still has 531 definitions in 21
files, with hash `dfdf555b`; the only authored change is the fence-gate collision
condition. Lifecycle revision 11 and its 109 callback-owned / 72 reviewed-inert
items are unchanged.

The combined chest, durability and reconnect source passed all 3,368 tests in
562 files, all workspace and release typechecks, full lint, lifecycle integrity,
content validation and the checked world build. Client and Studio builds passed
with both default and actual release profiles. Private schema comparison was
identical. The full-suite count includes concurrent lighting work in the shared
worktree. Independent review confirmed that the gate condition is the only
content change and that static-container collision effects preserve valid state.

The pending 0.4.5 client also corrects durability bars for the 20 newer material
tool variants. Their authored durability limits and authoritative wear were
already present; live inventory, hotbar and shared slot presentation now read
the active registry rather than the old static tool list. All 24 material tools
show full, worn and broken states, and an unspecified stored durability is
presented consistently as full in bars and tooltips. This presentation fix
changes neither item balances nor stored durability. The focused regression
checks include authored maximum overrides and items without durability; the
combined focused run passed 115 tests in three files, and all six extraction-seam
checks passed. This release remains undeployed; the owner session was renewed
and the live content head captured on 2026-09-06.

The pending client now also provides canvas connection recovery: reconnecting
and offline states expose Retry, while an expired session exposes Sign In.
Each modal frame restores the retained world image before drawing its backdrop;
the update prompt retains priority. Recovery blocks world input even when the
HUD is hidden, clears stale movement/touch/bow prediction, and supports keyboard
activation. Visibility, page-cache restore and online/offline events share the
connection lifecycle without starting a hidden-page render loop. Eleven focused
overlay/lifecycle tests passed. An isolated local Chrome canvas harness verified
fully visible copy and button geometry at 1280×800 and 390×844 with UI scale 2;
real local pointer clicks reached Retry and Sign In callbacks. This uses the
actual gameplay UI assets, not a live authentication session or phone hardware.
The final combined gates include this reconnect work. This remains a prepared
fix, with no deployment, live reconnect acceptance or device-resume acceptance
claimed.

This release has not been deployed. The owner session was renewed and the live
content head captured on 2026-09-06. Reviewed content-head CAS, guarded publication
and same-identity chest acceptance remain outstanding. The concurrent lighting-default assertion has now been updated by its author;
the latest full run passed 3,374 tests in 563 files. Shared runtime release
coordination is still outstanding before publishing the combined client. Production remains on
0.4.4 with content revision 7/hash `8cfe4746`. No chest compatibility retirement
or live recovery is claimed. Evidence and the authentication blocker are recorded
in `ops/LOGIN-RECOVERY-2026-09-05.md`. Broad Studio styling remains deferred.

### Generated island gateway background, 2026-09-06 (next release prepared)

The game account and loading screens, pre-world recovery/update overlays, OIDC
login/registration/recovery pages, and all 38 native PWA launch screens now share
a static 1536×1024 render of the real generated island. The camera includes
Marlow's camp and Fin's lake/hut at zoom 1. Seed, source hashes, atlas revision and
image SHA are recorded in `art/custom/login-island/provenance.json`; two complete
renders produced identical bytes. No live account/player data is used.

The client loads the image without blocking sign-in and caches the cover-scaled,
tinted viewport by size and DPR. Twenty stationary frames caused zero source
resamples; a viewport or DPR change caused one. The same local image is packaged
with the Keycloak theme under content-hashed URLs; provider form behavior, fonts,
and accessibility remain intact. All seven native app icons are byte-identical.
Desktop and portrait screenshots verified the actual loading/account screens
and all three real provider forms. Actual Safari/PWA acceptance remains pending.

Regenerate all background/theme/splash artifacts with `npm run login:background`.
This presentation change is prepared for the pending release; no public deployment
or authentication-service restart is claimed by these local browser checks.

The shared package version was advanced to 0.5.0 by the concurrent lighting work
during these checks. The island changes remain prepared alongside the earlier
0.4.5 fixes; neither the game nor the Keycloak theme has been published here.
Owner sign-in and an independently reviewed one-upsert content candidate are
ready. The final repository run passed 3,374 tests in 563 files, with typechecks,
lint, content/lifecycle checks, checked world build and both application builds
passing. Publication is held for coordination with the lighting author, rather
than publishing their active work without a readiness handoff.

### Guarded 0.5.1 deployment, 2026-09-06

The pending chest, durability, connection recovery, island gateway, tree sway and
lighting work recorded above shipped together in guarded release 0.5.1. This
supersedes those earlier preparation-only checkpoints. All 3,386 tests in 565
files passed, along with the workspace/release typechecks, lint, lifecycle and
content validation, checked world build, and staged client/Studio production builds.
The verified deployment evidence is
`/home/toby/.local/state/orchard-051-20260906/deployment-4/`.

The release preserved the complete public/private schema and passed exact
same-identity parity across 38 tables. Publication used the no-delete guard;
all 531 content definitions were retained, with zero deletions and one reviewed
`object:fence_gate` collision-condition upsert. The resulting live content head
is revision 8, hash `dfdf555b`. The bounded lighting receiver pool fix is included:
all five source hashes in `output/lighting-lockup-20260906/fix-source.sha256`
match the deployed source manifest. Legacy chest compatibility remains retained.

The generated-island Keycloak theme is also live. Independent checks verified the
exact staged file manifest and served CSS/image hashes. All six fresh actual
login/registration/recovery desktop and portrait captures were byte-identical to
the approved previews. Keycloak and PostgreSQL are healthy; PostgreSQL's container
and start time were unchanged. No credentials or forms were submitted in those
anonymous visual checks. Evidence is recorded in
`ops/LOGIN-RECOVERY-2026-09-05.md`.

Physical iPad/Safari background-resume, sustained lighting and complete live
reconnect/UI acceptance remain open, as do the outstanding processor, quest and
chest gameplay scenarios. The shared T3 preview had advanced only one animation
frame; manually invoking update/render immediately drew the Basic scene. That
observation does not yet establish a production renderer failure or a successful
device recovery. Broad Studio visual refinement remains deferred.

### Reviewed canvas authority release, 2026-09-11

The reviewed Cellar source now carries fail-closed connected readiness, durable
Outliner identities, active tileset palette/worker invalidation and active
object/NPC/creature/combat marker presentation. Blank pre-schema durable IDs retain
only the documented compatibility path. Every mounted Studio tool remains canvas
native and uses the reviewed UI kit; the kit guard is byte-identical at
`425a634fc8e88722a151e3c58ee969cc0f534ab747c4b2811e0562c6ee97e9e9`.

The guarded overlay build, Studio typecheck and production build passed. The later
runtime-authority compatibility build `/assets/index-gsnD1vQM.js` was installed with
a checksum-backed rollback after porting only the reviewed UI's appearance,
durability and Delve callsites to the current authored APIs. Local and public
static/security/proxy validation passed. Because the shared
T3 preview was explicitly unavailable to this harness, a separate anonymous real
browser verified the public Canvas workbench: one canvas, the exact deployed bundle,
and zero console warnings/errors. This release did not publish the world module,
content head or map and did not mutate player/world rows. Authenticated live Outliner,
two-identity remedies, mutable object/processor scenarios and same-identity world
continuity remain the explicit external acceptance gates.

### Runtime-authority freeze before further editor shaping, 2026-09-11

Per owner direction, broad editor refinement remains paused while the game-side
authoring migration is closed. The final audit moved homestead mechanics and all
eight Delve boons into active upgrade definitions, made legacy rogue combat fail
closed without active enemy content, and removed the last bootstrap lookup from
client melee prediction. The bootstrap candidate is now 895 definitions, hash
`6af0522c`, with a 531,228-byte runtime payload under the unchanged 532,480-byte
ceiling. The editor consumes these same parsed definitions; no alternate HTML,
legacy renderer or editor-owned behavior catalog was introduced.

This checkpoint is repository-only. It does not publish the new module/content head,
does not drain compatibility tables, and does not change any live player or world row.
The next live step remains a specifically owner-approved guarded release with fresh
backup/restore rehearsal, exact identity/state parity and authenticated same-identity
rejoin. Only after that acceptance may the separately gated chest/farm finalizers run.
