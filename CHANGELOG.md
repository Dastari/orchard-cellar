# Changelog

One heading per game version, newest first. Parallel branches that bumped to the same version are merged under one heading, with a subsection per change. Workspace-only bumps (assets, sim, Studio) sit under the game version they were integrated and released with. Release records and narrative history are in the wiki: [Operations/Releases](https://wiki.orchard.dastari.net/Operations/Releases) and [History/Releases](https://wiki.orchard.dastari.net/History/Releases).

## Root 0.85.1 / Engine 0.30.2 — Native ground emission

- **BUG-086:** preserve native emissive spans before item alpha and cutaways in Canvas ground lighting and WebGL ground-field partitions. Keep cooled pixels lit, partial alpha intact and rotated/reflected ground light coordinates correct.

## Root 0.85.0 / Studio 0.20.0 / Sim 0.37.1 / Assets 0.26.0 / Tools 0.26.0 — Authoring and native art batch

- Select, move, duplicate and delete authored prop groups as one undoable operation. Preserve relative transforms, complete-footprint bounds, locked/hidden safety, joined-fence geometry and guarded publication.
- **BUG-081:** compact Items library header controls so the complete publication footer stays reachable at 720×540 with the workspace toolbar.
- **BUG-083:** retain the same author's staged Items draft, selection and note across verified heads and reconnects; preserve conflict/rebase/acknowledgement checks and publish through the current authorized adapter.
- **BUG-082:** mark item `onUse` optional only in the authoring field graph so valid omitted arrays can be edited; preserve runtime parser defaults and reject malformed present values.
- Register native volcanic banks/scenery, complete shrub and column crops, foam, and exact lavafall emission masks. Add editable island design exports, actual engine captures and a lighting proof; visual drafts do not replace the published world or implement playable slopes.
- Add reproducible natural-cliff/slope movement and native-rendering investigation fixtures. Preserve existing golden recorder digests, terrain rules, live map/content and database schema.
- Integrate owner-reviewed PRs #318, #319, #320, #321, #322 and #324 with original branch ancestry; reconcile package/lock metadata and retain the reviewed Studio UI-kit build guard.

## Root 0.84.1 / Studio 0.19.1 — Readable startup status

- **BUG-085:** put connection, sign-in and failure text on the reviewed neutral UI-kit frame, wrap status messages within a responsive card and retain keyboard-operable retry. Connected sessions keep the workspace open while the map displays its own verified-loading status; other authoring tools remain reachable.

## Root 0.84.0 / Studio 0.19.0 — Studio workspace controls

- Expose canvas workspace view, command and layout controls, including narrow-screen Library/Inspector switching, named layouts and reset. Keep connected content tools reachable while the map loads; map startup presents its own verified progress and retry state.

## Root 0.83.1 / Studio 0.18.2 — Verified Studio startup recovery

- **BUG-079:** exclude immutable chunk and atlas-index requests from Studio dynamic proxy limits while retaining protected-route limits. Retain verified chunks across retries of the same publication and separate map loading errors from content/connection readiness.

## Root 0.83.0 / Client 0.57.0 / UI 0.55.0 — Illustrated player guide

- Refresh the help book into 27 player-facing topics across Basics, Crafting, World and Adventures. Explain current activities, storage, equipment, gathering, food, weather, travel, trade, progression and expeditions; remove administrative commands and server/debug details.
- Illustrate all processing stations, workbench and anvil with existing lazy-loaded item art and readable process captions. Narrow pages stack figures and captions. Recipe patterns remain in the recipe book; ordinary crafting and special learned requirements are explained without ingredient formulas.

## Root 0.82.0 / World 0.34.0 / Sim 0.37.0 / Assets 0.25.0 — Basic starter recipe guides

- New characters begin with book entries for planks, sticks, four wooden tools and a workbench. Knowledge is authored beside the starter loadout, validated against active recipes and granted once during creation. Returning characters and starter items are unchanged; ordinary pattern crafting and special learning requirements retain their current rules.

## Root 0.81.9 / Client 0.56.4 / UI 0.54.6 — Remove Rewards and Character menu entries

- The Escape menu no longer offers Rewards or Character. Reward collection remains available with O; the Character book remains available with P and its other existing controls.

## Root 0.81.8 / Client 0.56.3 / UI 0.54.5 — Stable hold-Tab player roster

- **BUG-077:** a roster opened by holding Tab consumes Tab key repeats without cycling focus; a roster opened through the HUD retains keyboard focus navigation. Releasing the held key still closes only a hold-open roster.

## Root 0.81.7 / Client 0.56.2 / UI 0.54.4 — Contained crafting requirement

- **BUG-076:** missing-station and skill requirements wrap within the crafting pattern pane, keeping the bench width stable when a locked result appears.

## Root 0.81.6 / World 0.33.2 / Tools 0.25.6 — Map restore preserves advancing time

- **BUG-075:** guarded map restore excludes only the two clock fields it never writes from its operation comparison, so normal ticks no longer stale its preview. All other world fields, map/archive identity, authorization, fingerprint, expiry, atomic publication and audit guards remain enforced; other admin world operations retain their full clock guards.

## Root 0.81.5 / Tools 0.25.5 — Guarded rehearsal restore preview retries

- **BUG-074:** the isolated history rehearsal retries only a definite reducer revision conflict with a fresh preview and mutation id, at most five attempts. Auth, invalid fingerprints, unknown failures and ambiguous timeouts stop immediately; bounded diagnostics identify admin codes, preview/commit/audit phases and attempts. Server guards are unchanged.

## Root 0.81.4 / Tools 0.25.4 — Safe history rehearsal failure diagnostics

- **BUG-073:** isolated history acceptance records fixed operation/row phases and recognizes exact known SDK and timeout codes. Unknown error text, bodies and credentials remain redacted; primary failures survive reconnect cleanup, and acceptance gates stay strict.

## Root 0.81.3 / Tools 0.25.3 — Rejoin capture across public map retirement

- **BUG-072:** rejoin capture explicitly selects the old public map HTTP SQL transport or the new public digest view from deployed schema, retaining all 44 continuity surfaces, exact document digests and audit pins. New private map bodies are never a fallback.

## Root 0.81.2 / World 0.33.1 / Sim 0.36.2 / Tools 0.25.2 / Studio 0.18.1 — Exact authored history across runtime hydration

- **BUG-071:** authored chunk archives retain historical landmark roles and suppression representation separately from current-content runtime values. Restore and audited inverse validate current content before retaining exact archived authoring identity; completeness and hash gates remain strict.

## Root 0.81.1 / Tools 0.25.1 — Isolated history inputs for repository tests

- **BUG-070:** repository tests no longer inherit the release's static-history opt-in/report. The actual isolated schema-only rehearsal keeps those inputs and its complete history gates.

## Client 0.56.1 / World 0.33.0 / Sim 0.36.1 / World bindings 0.22.0 / Tools 0.25.0 / Studio 0.18.0 — Static world S7c: private map base and chunk-manifest history

**Schema migration with verified history conversion.** Option C retains one private server map base; public clients and Studio read chunks. Content remains unchanged. Client chunk runtime stays on.
- **Public retirement (#302):** `live_map_document` becomes private. A metadata-only `liveMapHead` view supplies exact document SHA-256 and audit pins for strict reconnect continuity; authorized tooling reads the private base through an admin procedure.
- **Manifest history:** private archives retain stable revision IDs and shared blob references. Backfill reconstructs exact historical bytes before clearing old document copies. Restore and undo atomically repin the map and serving chunks; stale content/art refuses until rematerialization.
- **Copy retirement:** restore audit bodies become verified history references; obsolete restore preview receipts clear only after exact archive verification. Counts/checks reject missing archives, remaining copies and empty history.
- **Studio:** remove the whole-document subscription/fallback, reconstruct from verified chunks, retry a failed head with bounded backoff, cap HTTP/SDK reads and abort stale sibling work. World Control uses stable history IDs.
- **Operations:** guarded isolated history/backfill/restore/inverse/privacy/reconnect rehearsal runs after the unchanged production parity capture when `WORLD_RESTORE_STATIC_MAP_HISTORY=run`. Failures stop before production; long backfills rotate credentials through the shared lock.
- **Compatibility:** the shared reconstruction helper uses a SpacetimeDB-compatible property check. Generator drafting and other spaces (S8) remain outside this release.
- Workspace 0.81.0. Design, migration acceptance and exact commands: [S7c option C](https://wiki.orchard.dastari.net/Roadmap/Static%20World%20S7c%20Option%20C), [Private server map base](https://wiki.orchard.dastari.net/Decisions/SW-D4%20Private%20Server%20Map%20Base).

**Release acceptance:** full retained CI, guarded schema-only MIGRATION with fresh backup/rehearsal, complete production history check, signed-in Studio/game proof and `world:static:readiness -- --require step6`. Restore the compatible verified migration backup for rollback.

## Root 0.80.1 / Tools 0.24.11 — Quiesced static history rehearsal atlas

- **BUG-069:** the isolated S7c history rehearsal reads the validated local candidate atlas while the public frontend is stopped. It records the exact atlas digest and refuses malformed, redirected or changed bytes before production can publish.

## Client 0.56.0 / World 0.32.0 / Sim 0.36.0 / World bindings 0.21.0 / Tools 0.24.10 / Studio 0.17.0 — Static world S7b: Studio publishes the island and its chunks together

**Schema-only migration release.** Adds the atomic map/chunk reducer, a member blob-read procedure and the private staging table. Content is unchanged. Client chunk runtime remains on.
- **Server chunk authority (#294):** published chunks are the only topside source. Unservable publications freeze topside safely; traversal-policy lag keeps serving the pinned publication. Fresh-world resource seeding ignores planted and hearth rows.
- **Browser materializer (#295):** Studio builds the same verified chunks as the host, in a browser worker; the parity bytes remain unchanged.
- **Atomic publication (#296):** map revision and complete chunk heads commit in one transaction. Staging has per-sender quotas and expiry; blob reads are member-only and bounded. Map-grant holders retain the authorized default publication right.
- **Client blob fallback (#297):** missing host-served blobs load from the database and are verified before caching, with bounded requests and the current connection.
- **Publishing tools (#299):** install database-backed blobs on the host; authored-document chunk publications reconstruct editable maps. The first authored republish changes all 169 blob hashes.
- **Studio Publish (#298):** prepare, build, check, upload changed chunks and go live together, with the progress-button renders shown on the wiki. Failed publishes retain the draft and leave the live world unchanged.
- **Studio reads chunks (#300):** verified chunk publications reconstruct the editable map. The whole-document fallback remains until the separately reviewed S7c privacy/history migration.
- Workspace 0.80.0. Design and review: [Static World Conversion](https://wiki.orchard.dastari.net/Roadmap/Static%20World%20Conversion), [Owner Review 2026-09-30](https://wiki.orchard.dastari.net/Roadmap/Owner%20Review%202026-09-30), [S7b review](https://wiki.orchard.dastari.net/Roadmap/Static%20World%20S7b%20Review%202026-09-30).

**Rollback:** restore the previous compatible module/client or the verified pre-migration backup. Server chunk authority off is a maintenance freeze; a pre-S6 client alone is no longer a rollback target after #294.

## Client 0.55.0 / Engine 0.30.1 / World 0.31.3 / Sim 0.35.3 / UI 0.54.3 / Tools 0.24.9 / Studio 0.16.22 — Static world S6: true chunk streaming and art by need

**Routine release: client and world code, no schema change.** Chunk heads are republished, because the atlas index changes.
- **Generator-free leaves (#278):** survival rules move into a generator-free leaf, and terrain imports are sampling-only. No behaviour change.
- **Server keeps serving the pinned chunks (#279):** while the map or content lags, the server serves the pinned chunk publication (SW-D2). `stale_generator` still refuses.
- **Client retirement (#280):**
  - The client no longer subscribes to the whole `live_map_document` and no longer bundles the terrain generator; CI enforces a generator-free bundle.
  - Topside draws and collides only from the chunks around the player.
  - When the chunk runtime can't serve, players see "WORLD UPDATING" with a 5 s retry, never a frozen or broken world. During a republish, the previous revision keeps serving.
  - Homesteads read the published chunks, on both server and client.
  - Owner accepted two apple trees replacing birches beside a lake at homestead 10000.
- **Atlas packs (#282):** world art comes from per-area packs, prefetched from the chunks around the player, instead of one consolidated atlas.
- **Art by need (#284, owner approved as measured):**
  - Startup loads only the UI, the player body and the missing-item icon. Everything else loads when first drawn.
  - The 27 MB player pack is split.
  - Decoded atlas memory at spawn falls from 110 MB to 67 MB.
  - Cold first arrival may take a few seconds longer.

**Rollback** after this release is server chunk authority `off` plus the last pre-S6 client dist (Client 0.54.1). An `off` or `shadow` build of S6 code only shows "world updating", and the lanes refuse it.

## Client 0.54.1 / UI 0.54.2 / Sim 0.35.2 / World 0.31.2 / Studio 0.16.21 / Assets 0.24.2 / Lifecycle authoring 0.16.4 — Uncapped Storage step 5 (part 2): 65,535 ceiling, Traveller's Pack

**Routine release: content, client and world code. No reducer signature change, no schema change, no data migration.**
- **Ceiling raised (#290):** chest and placeable slot counts, stash capacity and bag capacity all accept up to 65,535. The equipped bag alone sets backpack capacity: 8 with no bag, and debug slots still count. Trade, merchant and inventory panes are sized from it and stay virtualised, with at most 25 slot nodes even for a 1,000-slot bag.
- **Traveller's Pack (#291, owner approved):** a 32-slot uncommon back-slot bag, made at the workbench from the Starter Backpack, 5 leather, 2 rope and 1 chain links, selling for 185. Its pane scrolls.
- **New-player loadout by container (#289):** the starter kit is placed by container and index rather than the legacy global slot numbers. New characters get the same kit in the same cells. Content may also author `cell` / `selectedCell`.

## Client 0.54.0 / UI 0.54.1 / Sim 0.35.1 / World 0.31.1 / World bindings 0.20.1 / Studio 0.16.20 / Assets 0.24.1 / Tools 0.24.8 / Lifecycle authoring 0.16.3 — Uncapped Storage step 5 (part 1): whole-container panes, barrel scrolling, no global-slot adapters

**Routine release: content, client and world module together; no schema change or data migration.** Inventory protocol 3: open tabs from before this release get UPDATE REQUIRED for inventory actions and must reload.
- **Container-addressed carried cells (#287):**
  - Loadouts, expedition readiness, bow ammunition (hotbar first, then backpack by index), the merchant deed check and behaviour item references read `player_container_cell` rows directly.
  - `use_selected` sends `equipmentIndex` (0–9) instead of the legacy global slot.
  - `legacy-global-slots.ts` and the world's legacy-slot adapters are deleted. The deed check now also sees backpack cells past 20.
- **Whole-container panes (#285):** the chest, barrel and hearth stash frames bind `entitySlots: 'all'`, so each window shows every slot its object has (16, 8 and 20 today; nothing changes on screen). Clients from 0.52.1 onwards parse this.
- **Content refresh (#285):** a client that can't parse live content now offers **RELOAD** ("GAME CONTENT HAS CHANGED. / RELOAD TO UPDATE.") instead of a retry that could never succeed.
- **Barrel scrolling (#286):** a station's multi-cell pane with more cells than its authored columns × rows scrolls like a chest's contents. Today's 8-slot barrel is unchanged.

## Client 0.53.0 / UI 0.54.0 / Sim 0.35.0 / World 0.31.0 / World bindings 0.20.0 — Uncapped Storage step 4: container-scoped storage (migration release)

**Schema migration release: new tables, with a one-time migration of all items.** The migration lane runs with `WORLD_RELEASE_CONTAINER_CELL_MIGRATION=run`.
- **Storage addressing (#274, #275):** every container (hotbar, backpack, equipment, crafting, stash and each placeable) has its own `u32` index space, in the new sparse tables `player_container_cell` and `placeable_container_cell`. Only occupied cells are stored.
  - Equipment keeps fixed indices, and the main hand stays selected slot 33 as a named constant.
  - This removes the fixed global slot layout, so a bigger bag no longer shifts other slots.
- **Migration (#275):** players are moved on connect or by an owner/admin batch in one transaction, including old hotbar and equipment layouts. Placeables are copied with receipts (counts and fingerprint).
  - Independent legacy-versus-cell fingerprints for players and placeables must match the rehearsal before traffic returns.
  - The old tables are kept but no longer written; nothing is deleted.
  - Backpack and stash stacks past capacity spill to overflow. Retired or over-max stacks are handled without stalling a player or the tick.
- **Protocol 2 (#275, #276):** older clients are refused and see "Update required" with a Reload button.
- **Client (#276):** the global-slot references are replaced by container addressing, and the bindings are regenerated with `u32` indices.
- **No visible change at 20 slots.**
- **Rollback:** after traffic returns, rollback means restoring the pre-publish backup; never republish the previous module.
- Workspace 0.78.0.

## Client 0.52.1 / UI 0.53.1 / Sim 0.34.0 / World 0.30.6 / Studio 0.16.18 — Uncapped Storage step 3: whole-container panes, 256-slot ceiling

- **Uncapped Storage step 3 (#272):**
  - **Whole-container panes:** frames can bind `entitySlots: 'all'`, a pane over every slot of the open chest, barrel or stash, scrolling with the authored `rows` as the visible rows. The server derives each container's size from its own content registry and applies frame slot rules to exactly those slots.
  - **Backpack pane:** it binds the whole accessible capacity.
  - **Ceiling:** a placeable's `container.slotCount` and the stash's `stashCapacity` accept up to 256, the storage limit until the step-4 migration. The Studio field help explains the range.
  - **Trade and merchant sell:** they guard each cell as currently bound, so large scrolling panes work.
  - **Content unchanged:** the chest, barrel and stash frames keep their slot lists. Switching them to `'all'` ships later with a client refresh.
- **Legacy chests:** legacy `world_chest` rows are always sized by the fixed chest storage (16).
- Workspace 0.77.0.

## Client 0.52.0 / UI 0.53.0 / World 0.30.5 / Studio 0.16.17 / Tools 0.24.6 — One player-inventory pane everywhere; scrolling storage grid

- **BUG-067: every window that shows the player's inventory uses the one shared pane (#264, #265, #266, #269), as the owner decided.**
  - The hearth stash, trade and merchant Sell join the inventory, chest, crafting and station windows. All of them have the same filter and sort, empty cells always visible, and the same footer hotbar showing the selected slot.
  - Trade disables items that can't be traded and greys the sort button during a live trade.
  - Merchant Sell picks from your bag, capped at what you carry.
  - Stash sort is enabled.
  - Any entity window, including new Studio-authored frames, is drawn by the kit; the legacy host-drawn inventory windows are deleted.
  - A boundary test fails if any surface draws the player's inventory another way.
- **Uncapped Storage step 2 (#270):**
  - The kit inventory grid virtualises large containers: a 1000-cell pack keeps about 25 slot nodes.
  - Keyboard paging (PageUp/PageDown, Home/End, arrow keys) and gamepad shoulder paging.
  - Drop-check verdicts are keyed by container and index.
  - The host slot model is keyed by container and index, with no fixed caps.
  - Nothing looks different at 20 slots.
- Workspace 0.76.0.

## Client 0.51.0 / UI 0.52.1 / Sim 0.33.7 / World 0.30.4 — Static world: the client runs on chunks (S5c activation); bow arrows from reachable cells

- **Static world S5c activation (#259).**
  - The client is built with the chunk runtime `on` (`CHUNK_RUNTIME_ACTIVATION_RELEASE = s5c-client-activation-20260928`). It follows the server's `chunkAuthority`, which has been `on` since 2026-09-27 21:35Z.
  - With a matching publication, terrain, collision and map records come from the published chunks, through the bounded chunk store.
  - Rollback: server `off` makes clients fall back at once. The previous client can be restored from the release rollback directory.
  - The repository's `orchard-frontend.service` gains `ORCHARD_WORLD_CHUNK_DIR`, matching the host drop-in.
  - Every later release must state the client chunk mode explicitly (G6).
- **BUG-068: a bow draws arrows only from the hotbar and the accessible backpack (#261),** as expedition readiness counts them. It never draws from the crafting grid or from cells stranded past a smaller bag.
- Workspace 0.75.0.

## Client 0.50.0 / UI 0.52.0 / Engine 0.30.0 / Sim 0.33.6 / World 0.30.3 / Studio 0.16.16 — Chest filters, Basic object light, one capacity rule

- **BUG-064: windows don't trap the keyboard in a text field (#253).**
  - Opening a chest no longer focuses its Filter.
  - The focus ring shows only for keyboard use and fits the whole field.
  - DOM focus returns to the game when a window or the chat input closes, so E, I and Escape keep working.
- **BUG-065: each inventory pane has its own filter and sort (#254),** the same component as the inventory window. Filtering hides only non-matching items; empty cells always stay visible as places to put something (owner decision).
- **BUG-066: a failing retained screen no longer aborts the whole frame in production (#255).** It is skipped, reported once to error telemetry, and still fails loudly in development and tests.
- **BUG-061: Basic lighting keeps object light (#260).** Light sources get cheap, hard-edged, two-step, world-anchored pools, with no blur and no flicker (owner-approved look).
- **BUG-056: one backpack capacity rule (#258).** The recipe book, expedition preparation, trade and merchant sell all use `accessibleBackpackCapacity` (Uncapped Storage step 1). The expedition part is server-side.
- **Release lanes (#256):** the guarded full lane scopes and asserts the client chunk-runtime mode, like the routine lane. The served-audit fetch retries.
- **Tests only (#239, #249):** the static-world S4g browser acceptance harness and the S5c rollback drill.
- Workspace 0.74.0.

## Client 0.49.0 / UI 0.51.0 / Studio 0.16.15 — Chest and workbench fixes, Escape, alt-tab, flash, chat icon

- **BUG-058: chest window didn't open after "Chest opened" (#251).** Replacing an active placeable session (for example workbench to chest, or chest to chest) delivered the new session before the old one's removal, and the client cleared both. Removals now only clear the placeable that is still current, so chest windows open reliably.
- **BUG-059: using a workbench opens the crafting grid (#247).**
- **BUG-060: Escape closes the topmost open surface (#252)** before opening the menu: window, trade, NPC, roster, build palette or chat input. A closing chest or station isn't reopened.
- **BUG-062: coming back to a hidden tab no longer shows "Restoring your world" (#250).**
  - The client keeps its presence heartbeat for up to 4 minutes hidden, so the player stays in the world, like an AFK player.
  - A longer hide goes offline once, not repeatedly, and resumes at once on return.
  - A socket that died while hidden now surfaces about 6 s after return.
- **BUG-063: the statistics chapter survives a statistic listed twice (#248).** Stop-gap: duplicates are merged, and both row ids are logged once to find the cause.
- **BUG-057: the public chunk-runtime audit lists modules relative to the repository (#244).** No host paths.
- **The refused-drop flash is drawn above the held stack (#245),** as in the owner's mock.
- **The HUD chat button is a ghost icon (#246):** glyph only. The CHAT hint sits beside it, clear of the chat log.
- **Item slot S4 (#234):**
  - trade items that can't be offered are disabled;
  - locked slots show their red corners on hover;
  - backpacks show exactly their capacity (owner decision).
- **Release lane (#243):** the routine release scopes and asserts the client chunk-runtime mode (static world S5c G3/G6).
- Workspace 0.73.0.

## Workspace 0.72.0 — Static world S5c operator tooling (scripts only)

- **`npm run world:chunks:authority` (#240).** A new operator tool for chunk authority:
  - `status`: shows the mode, the publication and the generator stamp.
  - `audit --report`: runs `auditChunkAuthority`.
  - `set <mode>`: switches the mode. It needs an exact confirmation string and waits for the flag row to change.
  - `dump`: writes the manifest and the heads.
  - `logs`: summarises the module-log shadow events.

  It uses the dev-account token file and accepts only the canonical host for production. Reports are written 0600, and tokens are redacted. A lost connection or a missed deadline fails with a non-zero exit, never 0. The README documents where the module logs are.
- **Stale publications and parity (#241):**
  - `world:chunks:publish check` reports a missing or wrong generator stamp as stale (`generator`), matching the server's `stale_generator`.
  - The parity gate gains `--require-published`.
  - The publish pipeline gains `--candidate-out DIR`, which saves the exact candidate that gets staged.
- No game, world or client change.

## Client 0.48.5 / Sim 0.33.5 / World 0.30.2 — One backpack capacity rule (BUG-054); client follows the chunk authority switch (BUG-053, BUG-055)

- **BUG-054 (#235).** The client and the world server now use one shared rule for backpack capacity, sim `accessibleBackpackCapacity`. It gives at least 8 cells and at most 20, with developer debug slots capped at 20.
  - **Before:** the client used `min(20, bag ?? 8)`. It would have hidden cells the server allows for a bag with fewer than 8 cells, and it didn't cap debug slots.
  - **Server:** its behaviour is unchanged, exhaustively tested against the old formula. No live item is affected.
- **BUG-053: the chunk runtime never activated (#236).** A client built with the chunk runtime `on` now subscribes to the space-0 `space_admin_flag` row and follows the server's `chunkAuthority` switch. It uses the same parser as the server, which moved to the generator-free `@orchard/sim/chunk-authority-mode`. Server `off` rolls the client back to `off`. Builds with the chunk runtime `off` (production) don't subscribe and are unchanged.
- **BUG-055: chunk collision and map records never served (#237).** The connection's authority gate no longer turns the controller's "no gate" (`null`) into `not_on`. With a matching publication in `on`, collision and map records now serve from chunks.
- Workspace 0.71.2.

## World 0.30.1 — Admin respawn honours resource placements (BUG-052)

- **BUG-052 (#232).** The admin resource respawn inserted each resource at its generated tile and ignored the map's resource placements. Admin respawn and reconcile now share one helper, `placedLiveIslandResources`, so a respawned resource lands exactly where reconcile would place it. The respawn area also matches resources by that tile. Reconcile itself is unchanged, and the live map has no placements today, so no production resources move.
- Workspace 0.71.1.

## World 0.30.0 — Static world S3c: resource placements and generation from chunk records

- **S3c (#230).** Resource reconcile and the admin respawn now take resource placements and the generated resource set from the runtime the dispatcher selects, through a new `generatedResources()`:
  - **Off (production):** the compiled runtime runs the same generator call as before, so writes are unchanged.
  - **On:** the resources are rebuilt from the `authority.resource` chunk records.
- **Fails closed:**
  - Chunk assembly checks the resource records and placements against the digests in the manifest. Any mismatch marks the runtime incomplete, so it is never served and never used to delete rows.
  - Chunk publications now carry a generator stamp (world seed and `SURVIVAL_WORLD_VERSION`). A publication with a missing or different stamp is stale (`stale_generator`) and falls back to compiled, so a world-version bump can't reconcile from records an old generator made.
  - The shadow compare now covers the generated resource list.
- **Also:** the hearth stash and hearth harvest resolve the runtime once per call.
- **Readiness:** static-world readiness goes to 2 for `server.whole-map-compile` and 1 for `server.generated-resources`.
- No schema change. Workspace 0.71.0.

## World 0.29.0 / Sim 0.33.4 — Static world S3b: static document consumers through the chunk dispatcher

- **S3b (#225).** Four more server reads of the map now use the runtime the dispatcher selects:
  - the hearth supply cache;
  - the object-growth biome;
  - generated-resource suppression;
  - the town streetlamp plans.

  With chunk authority `off` (production), they get the compiled runtime's own values, so behaviour is unchanged. `shadow` compares every one of them, including the biome at every cell. `on` serves them from the published chunks.
- **Performance:** streetlamp ticks, hearth respawn probes and tool swings resolve one runtime instead of one compiled lookup per site.
- **Sim:** `mapStreetlampPlans` accepts any document shape with `objects` and `prefabs`.
- **Readiness:** static-world `server.whole-map-compile` readiness goes from 7 to 3.
- **Nightly parity:** a new nightly parity file pins the generated resources (5,981, with a digest) and the production map's `authority.resource` records ahead of S3c.
- No schema change. Workspace 0.70.0.

## Client 0.48.4 / UI 0.50.0 / Studio 0.16.14 — Item slot S3: held stack and drag feedback in the kit

- **Item slot S3 (#226).** The kit draws the held stack and the drag feedback the owner approved; the host's own painters are deleted:
  - **Pack cross:** shown over a slot that refuses the held item.
  - **Dimmed refusers:** slots that can't take the held item fade while a stack is held.
  - **Refused-drop flash:** two frames of 150 ms each, shown on a local refusal and when the server rejects a drop or spread.
  - **Spread corners:** kit slots draw them.
- **Same rule as the server.** Refusal uses the same rule as the server, so a swap onto an occupied slot is never shown as refused.
- **Performance.** Drop checks are cached per held item and per slot, so idle frames re-check nothing. Slot lookup is O(1).
- Workspace 0.69.0.

## World 0.28.0 — Static world S3a: server combat policy through the chunk dispatcher

- **S3a (#220).** Every server read of the combat-region policy now goes through `liveIslandCombatPolicy(ctx)`: hearth harvest and installation, the ferry, encounter activation, outdoor enemy damage, the hazard knockout, and projectiles, outdoor encounters and resource respawns in `stepWorld`.
  - With chunk authority `off` (production), it returns the compiled runtime's own policy object, so behaviour is unchanged.
  - `shadow` also compares declared regions and the region at every tile centre.
  - `on` serves the policy built from the published chunks.
- The tick reuses the topside runtime that the collision stage already resolved. Resource respawns no longer compile once per depleted site.
- Static-world readiness: `server.whole-map-compile` goes from 15 to 7.
- New nightly parity file `world-chunk-combat-policy-parity.test.ts` pins the production Hearth regions (digest and tile counts) for v1 and v2 blobs.
- No schema change. Workspace 0.68.0.

## Client 0.48.3 / UI 0.49.0 / Studio 0.16.13 — Item slot S2: one slot controller; equipment rules match the server (BUG-050)

- **Item slot S2 (#222).** The inventory's drag, click, spread and quick-move handling moved out of the game host into the kit as `UiSlotController`. Behaviour is the same, except:
  - **Shift** held at pointer-down now quick-moves even if it is released before pointer-up, unless the press turned into a spread, which then commits as before.
  - **A double-click** also counts when the second press starts within 500 ms of the first click and is a quick, still click.
- **BUG-050: equipment slots accepted any item on the client (#222).** The client checks each slot with the same rule the server applies: equipment slots use the equipment restrictions, entity panes use their frame rules, and the player's own panes have none.
- The inventory window footer's hotbar shows the selected slot.
- Workspace 0.67.0.

## Client 0.48.2 / UI 0.48.0 / Sim 0.33.3 / World 0.27.2 / Studio 0.16.12 — Item slot S1 states; admins can switch chunk authority

- **Item slot component S1 (#219).** Frames now pass their slot rules, take-only flags and placeholders to each slot. The slot paints the states the owner approved on 2026-09-27:
  - **Disabled:** the pack's grey face, with the item at 50% and its count still shown.
  - **Locked:** the grey face with a red blocked mark. Hovering a locked slot shows red corners.
  - **Placeholders:** station and paper-doll slots show a flat silhouette of what goes in them while they are empty.
  - **Cooldown:** a draining shade over the icon, reserved for later use.
  - Slot rules are checked by the same function the server uses. Drag feedback comes in S2 and S3.
- **Chunk authority for admins (#218).** `setChunkAuthority` and `auditChunkAuthority` now accept an owner or an admin, the same gate as map, content and chunk publishing, so the dev account can run static-world activation. Moderators and players are still refused. No schema change.
- Workspace 0.66.0.

## Client 0.48.1 / UI 0.47.1 / Sim 0.33.2 / World 0.27.1 / Studio 0.16.11 / Tools 0.24.5 — Bug fixes: toasts, slot rules, take-only slots, prompt clipping

- **BUG-043: long toasts are cut off at 42 characters (#214).**
  - The whole message now shows: long toasts word-wrap onto two balanced lines, and short toasts are unchanged.
  - A toast longer than two lines ends in "..." after a whole word.
  - It also fixes a clipped second line on 320-wide screens.
- **BUG-045: crafting fill takes ingredients from read-only hotbar slots (#211).** "Place in grid" never takes ingredients from take-only slots. Taking items out of station outputs still works.
- **BUG-046: hearth stash and chests ignore frame slot rules on the server (#212).** The server now applies the frame's slot rules (allow, required types, deny) when items are put into the hearth stash and legacy chests. Stored items that break a rule can still be taken out.
- **BUG-047: frame rules on the player's own panes are client-only (#213).** A slot rule on a pane bound to the player's own containers is an error for newly authored or edited content, and only a warning for content already published. Restores and unchanged rows are never refused.
- **BUG-048: merchant sale takes from take-only slots (#215).** Sales skip take-only carried slots, and a sale that can't be covered otherwise fails cleanly.
- **BUG-049: a prompt label with a glyph clips wrapped lines (#216).**
  - **Fix:** kit rows now measure children at the width they are actually given, which fixes the clipped gateway error notice.
  - **Speed:** a second measurement cache slot keeps layout faster than before overall.
- Workspace 0.65.0.

## World 0.27.0 / World bindings 0.19.0 / Sim 0.33.1 — Static world S2: chunk authority switch, server dual-read, audit (migration release)

**Schema-only migration release (new reducer and procedure; no table changes).** Chunk authority stays `off`, so gameplay is unchanged.

- **S2a (#162).** The owner-only `setChunkAuthority({ mode: off | shadow | on })` reducer stores the switch in `space_admin_flag`, which clients can read. It writes an audit entry, and the undo guard keeps the owner's setting.
- **S2b (#174).** `liveIslandCollisionRuntime(ctx)` serves collision by mode:
  - `off`: the compiled runtime, exactly as today;
  - `shadow`: compiled stays authoritative, with bounded comparisons against the chunk runtime;
  - `on`: collision is served from the published chunks.

  It falls back to compiled on stale, incomplete, missing or policy-mismatched chunks.
- **S2c (#186).**
  - **Audit:** the owner-only `auditChunkAuthority` procedure takes a snapshot in a short transaction, then compares outside it, so ticks keep running.
  - **Soak and parity gate:** the local soak harness and the live-row parity gate.
  - **Error codes:** `stageWorldChunkBlob` / `publishWorldChunkShadow` now report their `chunk_*` refusal codes to the client, instead of "fatal error".
- Workspace 0.64.0.

## Client 0.48.0 / UI 0.47.0 / Engine 0.29.2 / Assets 0.24.0 / Studio 0.16.10 — Slot icon position B and eight new item icons

The owner approved both on 2026-09-26 (wiki Roadmap/Item Slot Component, "Owner decisions 2026-09-26").

- **Slot icon position B (#208).** In every item slot, the icon sits 1px higher (6px down instead of 7), and the wear bar and stack count move up 1px to match. The slot stays 28×31. The kit slot, HUD hotbar, character doll and the older game UI painters all move together.
- **Eight new 16×16 item icons (#208).**
  - **The icons:** apple, cherries, peach, pear, arrow, pebble, emberglass and guardian seal replace the small ground-drop art that was used in slots. They are project-drawn in the pack palette, with sources in `art/custom/small-item-icons/`.
  - **Content R22:** eight `icon.asset` upserts.
  - **Ground drops:** apple, pear, peach, cherry, pebble and arrow keep their small ground-drop sprites. Emberglass and guardian seal drop as their new icons.
- Also deploys item slot component S0 and slot deny lists (#206, merged via #207; see Client 0.47.2).
- Workspace 0.63.0.

## Client 0.47.2 / UI 0.46.0 / Sim 0.33.0 / World 0.26.10 / Studio 0.16.9 — Item slot component S0 and slot deny lists

No visual change, no database schema change and no content change (the item slot plan is on the wiki at Roadmap/Item Slot Component).

- **Item slot component S0 (#206).** This is groundwork for the owner's rule that one kit slot is the only thing that shows or handles items.
  - **Opaque art:** the `UiSlotArt` resolver means surfaces can pass item art to a slot but can't draw it.
  - **Typed state:** slot props carry rules, state (enabled, locked, selected, pending), cooldown, drag and placeholders. Only today's looks are painted; the new states wait for owner PNG approval.
  - **Shared rules:** the slot's accept/refuse check calls the same `slotAcceptsItem` as the server.
  - **Boundary test:** a test with an allowlist counted per site (19 files, each mapped to its migration step), which can only shrink.
  - **Wording:** a refused slot says "THAT ITEM DOESN'T GO IN THAT SLOT".
- **Slot deny lists (owner requirement).**
  - **New fields:** frame slot restrictions gain `rejectedItems` and `rejectedTags`. They are enforced by the shared sim rule on every server path, and a deny always wins.
  - **Studio:** the frame editor shows both fields.
  - **Validation:** an unknown tag in a slot rule is a validation warning, never an error.
- Workspace 0.62.0.

## Client 0.47.1 / UI 0.45.1 — Window sections top-align (item 8); chat on the hunger strip

- **Item 8 (#202, owner-approved 2026-09-26, including station windows).** Side-by-side window sections share a top edge: EQUIPMENT lines up with BACKPACK, and station panels (furnace, barrel, cooking, press, fermentation, crafting) start level with BACKPACK.
- **Chat in the narrow keyboard HUD (#203).** Below 480 px logical width, the chat stands on the hunger strip instead of floating 37 px above it, so it shows more history lines. Touch play is unaffected.
- Workspace 0.61.1.

## Client 0.47.0 / UI 0.45.0 / Sim 0.32.1 / World 0.26.9 / Studio 0.16.8 — One slot look, caps in game windows, recipe placement clears the grid

The owner approved each change (wiki Roadmap/Game UI Redesign, "Owner decisions, 2026-09-25"). BoldBridge wrote the PRs, and SilverSquirrel finished them after review.

- **One item-slot look everywhere (#188, owner items 9, 6 and 7).**
  - **Slots:** every slot is drawn by the same kit slot as the HUD hotbar: a 16 px icon well, the stack count in dark ink with a light halo, a 3 px wear bar and hotkeys. Icons are no longer faded or over-scaled.
  - **Tooltip:** the inventory tooltip sits centred above the hovered slot. Details that don't fit above open below it, and never overlap the slot.
  - **Wear bars:** they use the live content registry, so published and Studio items get correct bars in the hotbar, character equipment and inventory menus.
- **Caps font in game windows and books (#189, owner item 10).**
  - **In caps:** labels, buttons, tabs and list rows inside game windows and books.
  - **As written:** dialogue (NPC text and the player's numbered replies) and wrapped paragraphs (hints, status, errors, tips). Search placeholders stay as rendered.
  - **Studio:** unchanged.
- **"Place in grid" clears the grid (#190, owner decision on the BUG-037 follow-up).**
  - **The rule:** placing a recipe moves grid items the recipe doesn't use back to the hotbar and backpack (merging first, then empty slots), in the same transaction. If they don't all fit, nothing moves, and the message is "NO ROOM TO CLEAR THE CRAFTING GRID". Cells already holding the right item are kept and topped up.
  - **Other fixes:** a crafting mismatch reads "THE GRID DOESN'T MATCH THE RECIPE". Only the latest placement can roll back the selection, and closing or dismissing the window retires in-flight placements.
  - **Tests:** a seeded 2,000-case property test checks that no items are duplicated or lost.
- Workspace 0.61.0.

## Client 0.46.1 / Engine 0.29.1 / Sim 0.32.0 / World 0.26.8 — Compact chunk obstacle tables (BUG-044); ships S7a

No gameplay, schema or content change. The chunk runtime stays `off`, and no chunk heads are published.

- **BUG-044: production chunk blobs exceed the 1 MiB runtime cap (#199).**
  - **Cause:** the production map's 5,104 prefab collision sub-cell obstacles were written as JSON records three times per chunk, so chunk (2,6) came to 2.9 MB.
  - **New format:** chunks now use `authoritySchema: 2` with a per-chunk `obstacleTable`. Each box and source id is stored once, delta-coded, and the lists are index rows. The decoder expands the table back into exactly the same records.
  - **Result on production:** the largest blob drops from 2.9 MB to 556 KB, and decode time drops from 14 to 3.3 ms, within the 4 ms budget.
  - **Checks:** parity with the server oracle is exact.
  - **Hardening:**
    - a 65,536-row limit is checked before any record is built;
    - out-of-range coordinates fall back to JSON records;
    - an unknown future `authoritySchema` is tolerated by consumers, which fall back;
    - a nightly density regression test asserts every blob is 1 MiB or less.
  - **Compatibility:** v2 is the materializer default, and builds before this one reject v2. Nothing publishes chunks until S5c.
- **S7a chunk round trip (#198, merged earlier via #200):** first deployment. See Sim 0.31.0 below.
- Workspace 0.60.0.

## Sim 0.31.0 — Static world S7a: chunk round trip (option off)

No gameplay, server, schema, content or published-byte change.

- **S7a round trip (#198).** `@orchard/sim/world-chunk-document` rebuilds the live map document losslessly from the chunks plus the manifest, with no generator.
  - **Extension:** it relies on a new additive `documentSchema: 1` chunk extension:
    - per chunk, palette-encoded authored cells plus the sparse generated base biomes;
    - in the manifest, the document fields, key-order variants, the FNV semantic hash and a full-text SHA-256.
  - **Off by default:** the materializer option `includeAuthoredDocument` (`--authored-document`) is off, so published chunk bytes are unchanged.
  - **Decoders:** decoders ignore unknown `documentSchema` versions; only the rebuild requires version 1.
  - **Idempotence:** recompiling the rebuilt document over the baked chunk base reproduces every channel without the generator, so schema 2 does not need pre-overlay base channels.
- Workspace 0.59.0.

## Client 0.46.0 / Engine 0.29.0 / Sim 0.30.1 — Static world S4e: map drawing from chunk records (dormant)

The chunk runtime stays `off` in production. No server, schema or content change.

- **S4e wiring (#196).**
  - **Chunk records:** in `on`, decorations, map objects, lights, light occluders, the supply cache, ferry regions, pond ties and farm soil come from the served chunk window's records. The new `engine/src/chunk-map-records.ts` builds them, and `client/src/topside-map-records.ts` is the one switch point.
  - **One source:** records serve only with that window's chunk collision. If the records fail, the whole window falls back to legacy, so drawing and collision always share a source.
  - **Staging:** records and the decoration caster pass are two new S4f stages. Staged p95 is 3.8–4.5 ms, and serving frames about 0.2 ms.
  - **Parity:** 181 of 181 views match the document path on the bootstrap and authored fixtures, including edge coverage against the whole document and committed negative controls.
  - **Unchanged:** `off` and `shadow` are byte-identical (pinned before the change).
  - **Reach check:** the largest prefab plus light reach must fit the 32-tile window margin. It is checked at build time and at publish time (`materializeWorldChunksFromRows`, used by the S5b pipeline).
- Workspace 0.58.0.

## Client 0.45.1 / Engine 0.28.0 / Sim 0.30.0 / World 0.26.7 / Studio 0.16.7 / Tools 0.24.4 — Compact collision planes; chunk publish pipeline (off)

No gameplay change, no schema change, and no content change. The chunk runtime stays `off` in production.

- **Compact collision planes (#193).**
  - **Planes converted:** per-cell flag planes are `Uint8Array` (0/1) instead of `boolean[]`. That covers `CollisionMap.blocked` and `horseJumpableTerrain`; `TerrainArray.blocked`, `horseJumpableTerrain` and `residenceEnvelopeBlocked`; the compiled map, rogue room and hearth lobby `blocked`; and the traversal admission and projectile planes.
  - **New helper module:** `@orchard/sim/cell-flags`.
  - **Reads:** they test for non-zero, with the same out-of-range defaults.
  - **Unchanged outputs:** goldens, parity and all 169 chunk heads are byte-identical.
  - **Memory:** a chunk window's data drops from about 10.8 to 4.0 MiB, and the staging peak from 28–31 to 16–18 MiB, under the 24 MiB budget. This meets a condition before `on`.
  - **Speed:** server collision build and tick costs are within ±2%, and precomputed collision decodes about twice as fast.
- **Static world S5b: chunk publish pipeline (#194, off by default).**
  - **Commands:** `npm run world:chunks:publish -- plan|publish|check` materialises chunks from the live map and content rows, installs them content-addressed into `ORCHARD_WORLD_CHUNK_DIR`, verifies them over the public origin, stages the blobs and CAS-publishes the heads.
  - **Dry run is the default.** `publish` needs `WORLD_CHUNKS_PUBLISH_CONFIRM=publish:<manifest>:<registry content hash>:<db>`. Stale heads exit 3, errors exit 1, and a report is always written, with tokens redacted.
  - **Release hook:** `world:release:routine` gains an optional hook, `WORLD_RELEASE_CHUNKS=off|check|publish` (default `off`), which runs after the web restart and never rolls back a deployment.
- Workspace 0.57.0.

## Client 0.45.0 / Engine 0.27.0 / Sim 0.29.1 / UI 0.44.3 / Studio 0.16.6 — No flicker between our pages; static world S4f (dormant)

- **No flicker between our own pages (#185, GrayOx, owner item 5).**
  - **Save:** before the game navigates between its own pages (sign-in launch, entering the world, quit to title), it saves a downscaled snapshot of the current frame (WebP, or JPEG on Safari; capped in size, 15 s lifetime, used once).
  - **Paint:** a small boot script paints that snapshot on the next page until the loading screen takes over. It never paints over gameplay.
  - **Scope:** no handoff on sign-out or the Keycloak hop.
  - **Result:** the bare island no longer flashes on each step.
- **Static world S4f, dormant (#191).** Production still refuses the chunk runtime's `on` mode, and there is no server or schema change.
  - **Window moves:** in `on`, the next chunk window is prepared ahead of the view, one stage per frame (chunks, window, collision, light, traversal), then served in one step. Light preparation reuses unchanged tiles. Staged frames measure 4.5–4.7 ms p95, meeting the 8 ms gate, and every served window equals a synchronous build.
  - **Spawn readiness:** a new "MAPPING THE SHORE" loading stage. In `on`, movement waits until the player's chunk and its ring are in the served window. There is a light "ARRIVING" note on topside travel, and failed chunks never block.
  - **Loading order:** chunks load nearest first. The first revision serves once the spawn ring is resident. Atlas packs load only with `?atlasPacks=1`.
  - **Memory:** a regression test holds live windows to 3 or fewer.
  - **Sim:** the traversal difference list is computed on first read; the server shares this code and results are identical.
  - **Unchanged:** `off` and `shadow` behave as before.
  - **Before `on`:** see the wiki Roadmap/Static World Conversion, "Conditions before `on`". In particular, the `Uint8Array` blocked planes are needed for the memory peak.
- Workspace 0.56.0.

## Client 0.44.0 / Engine 0.26.0 / Sim 0.29.0 / UI 0.44.2 / World 0.26.6 / Studio 0.16.5 — Static world S6a and S4d (dormant)

**Nothing is activated.** Production builds still refuse the chunk runtime's `on` mode, the server's chunk authority is `off`, and there is no schema or content change.

- **S6a, module split (#169, no behaviour change).**
  - Generator-free sim leaf modules and `@orchard/sim/<module>` subpath exports. For example, `SURVIVAL_BIOMES` no longer lives in `survival-world.ts`.
  - Non-island generation moves to `engine/src/space-terrain.ts`, and `TerrainArray` and the sampling helpers move to `terrain-array.ts` and `terrain-sampling.ts`.
  - The client and UI import from subpaths. Subpath identity and generator-free boundary tests guard the split.
- **S4d, client chunk-native collision (#184).**
  - **Collision from chunks:** in `on`, topside collision is built from the resident chunk window's authority channels and records, using the same composition the server uses. A single `@orchard/sim/chunk-collision` builder serves both the client and the S1b server assembler.
  - **Origin-aware lookups:** collision maps can carry a window origin. Movement, projectiles, tile targeting and the hearth helpers read through one bounds-checked helper, and whole maps behave exactly as before.
  - **Fallbacks:** the client falls back to legacy collision under the same conditions as the server's dispatcher: stale content or map, a superseded revision, incomplete authority, missing ground fields, a traversal policy mismatch, and the size and base guards.
  - **Parity:** 921,600 cells and 47,432 movement samples per fixture match the server composition.
  - **Faster traversal admission:** `mediumTraversalCollision` now resolves admission once per medium (a 320² admission drops from about 26 ms to 1 ms). The results are identical, and the server shares this path.
  - **Before `on`:** the window-move rebuild must reach 8 ms p95; it is 24–27 ms today. This is a hard gate, S4f.
- Workspace 0.55.0.

## Client 0.43.0 / Engine 0.25.0 / UI 0.44.1 / World 0.26.5 / Studio 0.16.4 — Static world S4c (dormant) and owner bug fixes

- **Rejected swings cost a miss (#177, BUG-042).** A swing whose only contacts resist the tool (a Wooden Pickaxe on a gold vein, a depleted node) now pays the empty-swing vigour charge and doesn't wear the tool, the same as swinging at air. `tool_whiffs` and `tool_uses` count the same way. The Tool Whiffs statistic description says so (Assets 0.23.3, a content upsert).
- **Returning to the tab keeps the world on screen (#178, BUG-040).** A brief re-sync after alt-tabbing no longer shows the full loading screen. The last world frame stays, and RECONNECTING appears only if the gap lasts longer than 1.5 s. Explicit recovery states show at once, as before.
- **Reticles ignore world lighting (#179, owner item 2).** Tile reticles, the selected-entity marker, the aim guide and debug overlays draw after the lighting composite, so night no longer dims them. World sprites are lit as before.
- **Book art without seams (#180, owner item 1).** Book frame patches snap to whole device pixels, which removes the hairlines at 125% and 150% display scaling.
- **Wrapping rows measure at their content width (#181, BUG-036).** Fitted windows around a centred wrapping row, such as crafting on a phone, no longer grow to the viewport.
- **Refused recipe placement is reported (#182, BUG-037).** Placing a recipe into a grid holding other items says "CLEAR THE CRAFTING GRID FIRST" every time, and the selection rolls back.
- **Static world S4c, render window (#175, dormant).** With the chunk runtime `on`, topside terrain renders from a bounded window of at most 5×5 chunks, pinned from the camera, through the new `client/src/world-source.ts`. `GroundChunkCache.invalidateRegion` redraws only changed tiles. Terrain helpers are origin-aware. `off` and `shadow` render exactly as today, and production builds still refuse `on`. There is no server or schema change. Draw lists match at all 169 chunk centres, and the p95 rebuild is 3.18 ms.
- Workspace 0.54.0. The stored schema is unchanged.

## Client 0.42.0 / UI 0.44.0 / Studio 0.16.3 — Owner UI feedback: scrollbars, mining feedback, hotbar tooltip

The owner approved each change from rendered PNGs (wiki `Roadmap/Game UI Redesign`).

- **Proportional scrollbars (#170, BoldBridge).** Scrollbars in the game and Cellar Studio share one style: a brown rail with an orange thumb sized to the visible content, at least 12 px.
- **Mining feedback (#171, BoldBridge).**
  - A vein shakes on every successful hit.
  - A tool that can't work a vein glances off with a dull clink and a spark. It shows no text and only glances when no hit landed. It uses the server's reach, elevation and line-of-sight rules.
  - The vein hover card shows the pickaxe tier needed.
  - Negative toasts are trimmed: "SWING", "TOOL IS NOT READY", "PROSPECTOR REVEALS YIELD ODDS", the tree regrowing and growing prompts, and "NO X USE ACTION YET". Error messages remain only for deliberate actions, in real words. The anvil still says "SELECT A DAMAGED TOOL".
- **Hotbar tooltip (#172, BoldBridge).** The item name shows in capitals, centred above the hovered or focused slot, and resizes for each item.
- **Gear catalogue (#173, GrayOx).** The generated wiki table never writes an empty cell.
- Also ships the dormant static-world waves 1 and 2 (entries below). Workspace 0.53.0, Assets 0.23.2 (new `tool_clink` sound) and Tools 0.24.3. The stored schema is unchanged.

## Client 0.41.3 / World 0.26.4 / Sim 0.28.1 — Static world wave 2 (dormant)

**Nothing is activated.** Production builds refuse the chunk runtime's `on` mode, and no server path reads chunks yet.

- **S1b, chunk runtime assembler (#167).** A new pure `packages/world/src/content/chunk-authority-runtime.ts` builds the server's live-island runtime from chunk authority data: collision, combat policy, suppressions, base obstacles and a static view.
  - It matches the compiled runtime exactly on the bootstrap and authored fixtures, including live base obstacles through the real server composition.
  - Missing or corrupt chunks come out void and solid, and are reported.
  - Chunk decoding now hashes each blob once, so a 169-chunk rebuild takes about 170–230 ms instead of about 300 ms. All integrity checks are unchanged.
- **S4a, client chunk runtime core (#166).** The runtime mode can now be `off`, `shadow` or `on`.
  - `on` needs a committed activation release that matches the build environment. Preview builds go to `dist-chunk-preview`, and the production validators reject an unapproved `on` artifact.
  - The new `chunk-runtime-controller` follows the server's authority (`off` is the rollback), swaps revisions in one step, and shows stale heads as a status rather than a lock-out.
  - The IndexedDB cache moves to v2, with separate metadata, cursor eviction (256 entries / 64 MiB) and per-space pruning.
  - Two new readiness probes.
- Workspace 0.52.0. The stored schema is unchanged.

## Client 0.41.2 / Studio 0.16.2 / World 0.26.3 / Sim 0.28.0 — Static world wave 1 (dormant)

These are the groundwork steps of the static-world conversion (wiki `Roadmap/Static World Conversion`, SW-D1..D3). **Nothing is activated**: the chunk runtime stays off, and no chunk heads or blobs are published.

- **S1a, chunk authority channels (#163).** World chunks gain an additive `authoritySchema: 1` extension. Existing schema-1 decoders ignore it, and a frozen copy of the deployed decoder proves that. The extension carries the server's full static collision:
  - ground and water collision, elevations, terrain planes, horse-jump and combat regions;
  - ordered base and authored obstacle records, transitions, walkable tiles and suppressed obstacle keys;
  - complete resource records anchored at their effective tile, and non-generated placements.

  Parity against a fuller server oracle covers every cell of all 169 chunks. A drift guard pins the server code the oracle mirrors. The waterfall cells are boat-enterable (SW-D1), and the water horse-jump mask is dropped.
- **S4b, terrain indexing (#161).** One `terrainIndexAt` / `terrainContains` helper replaces hand-written terrain indexing, and `TerrainArray` gains an optional origin. Output is byte-identical, pinned by goldens recorded on the previous code.
- **S4e, map-object presentation split (#164).** Object drawing, lights, occluders and asset readiness move to `map-object-presentation.ts`, which takes plain records. It is fed through unchanged adapters, and a golden is recorded on the previous code. Generator-free sim leaf modules come with new subpath exports.
- **S5a, chunk serving (#160).** `/world/<space>/<hash>.bin` is served from `ORCHARD_WORLD_CHUNK_DIR` with strict paths, precompressed br/gzip, immutable caching, per-encoding ETags and real 404s. It is inactive until configured. The client static validator gains an opt-in chunk check.
- Workspace 0.51.0, Engine 0.24.3 and Tools 0.24.2. The stored schema is unchanged. The world module rebuilds with the extended chunk codec.

## Client 0.41.1 / UI 0.43.1 / Studio 0.16.1 — Classic HUD restore

- **Owner-approved HUD restore (PR #159, BoldBridge).** Each change was approved from kit-rendered PNGs.
  - **HUD layout:**
    - M, B, C and the main hand are round buttons anchored bottom-left.
    - On touch screens the thumb stick or button bank rests above them. The buttons are raised and bevelled, and the stick has a thumb knob.
    - The layout is the classic one, with the purse bottom-right and a two-row hotbar on narrow screens.
    - The purse never truncates.
  - **Target frame:** the classic 72×29 frame, with the name just above it and no clear button. The player frame matches.
  - **Zone name:** shown on the classic flat location banner, and never clipped.
  - **Classic looks restored:**
    - the quest tracker as yellow outlined text with the chevron on the left;
    - white-on-black nameplates with an inline [offline];
    - the parchment hover card, with the crop timer only;
    - the /say and /yell speech bubbles;
    - the settings window, in capitals.
  - **Unchanged:** behaviour, commands and the BUG-027/029/034/038 fixes. Content and world are unchanged.

## Client 0.41.0 / UI 0.43.0 / Studio 0.16.0 / World 0.26.2 — Game UI redesign and recipe recosting

- **Game UI redesign (UI-D1, PRs #148–#156 by BoldBridge).** Every in-game surface is rebuilt to owner-approved kit-rendered designs (`Roadmap/Game UI Redesign` on the wiki). The redesign is presentation-level: authoritative command paths, pointer custody and the BUG-017..029 fixes are unchanged.
  - Foundations: wood-and-parchment chrome with ribbon headings in the top board, a wooden close button, slot selectors and silhouettes, dark auto-sized item and hint tooltips, filled fields, and a slider fill fix.
  - Windows fitted to their content: inventory, chest, the processing stations, and crafting with a separate recipe book. Shift-click moves stacks between containers.
  - The HUD, with the quest tracker as outlined text on the world, the minimap frame, touch discs and pad, and the chat plaque.
  - The player book (Character, Skills, Quests, Records) and the Help book.
  - Dialogue, the merchant, and player trade.
  - The game menu and vertical-tab settings.
  - The title flow, name prompt, the update, delve and trader dialogs, the build palette, and online players.
  - Dark notices, nameplates, the hover card and the chat panel.
  - All of it scales to phone layouts.
  - Review fixes: touch sort for the barrel, and visible reasons for locked recipes. The dodge disc shows its real key (R). Desktop keyboard players get the approved one-row HUD. The game menu has a Character entry, arrow keys work in settings and the shop, and prices drop zero denominations. The redesign art's licensed Kenmi derivation is stated.
  - Faded chat history lets world clicks through (BUG-038). Hover still reveals it (BUG-034).
- **Recipe recosting (Craft-D2, PR #152 by GrayOx).**
  - Buildings are costed by footprint; the barn is built from a coop item.
  - Components: a timber frame takes 4.5 wood, and a stone foundation 6 stone.
  - Stations are re-priced: the spit, the stone-ring fire, the anvil recipe, and the barrel with nails.
  - Furniture now uses glass, brick and beeswax.
  - Stone costs 4 pebbles.
  - The bronze bar is worth more than copper.
  - Coal becomes a furnace fuel.
  - No crafted output sells for more than its inputs.
- **Versions.** Workspace 0.50.0, Assets 0.23.0, Tools 0.24.1 and Engine 0.24.2 reconcile the combined source. The stored schema is unchanged. The world module rebuilds with the recosted bootstrap pack.

## Client 0.40.5 / Studio 0.15.5 / World 0.26.1 — Materials foundation

- Add 47 crafting materials with icon art, even before they have a source (Craft-D2, Prog-D1, PR #147). The groups are hides and textiles, metals and metalwork, building materials, magic, cut gems, gem dusts and essences. There are 23 shaped workbench and anvil recipes and 4 single-input furnace and barrel processes. For example: sand to glass pane, clay to brick, copper plus tin to bronze, and raw hide to leather.
  - Items with no source yet are recorded in the `crafting_material_pending_source` inert group.
  - No recipe sells for more than its inputs.
  - The furnace's shared smelt time stays at 6000 ticks.
- Import 29 `icon_craft_*` icons from the licensed Kenmi and Clockwork Raven sheets. The source is hash-pinned, and a guard rejects any crop that is pixel-identical to an existing sprite.
- Fiber now shows a fiber icon instead of a bone (BUG-035).
- The content payload cap rises from 617 KiB to 1 MiB (Content-D1). The pack measures 651,943 bytes across 1,021 definitions.
- Workspace 0.49.0, Assets 0.22.0 and Tools 0.24.0 reconcile the combined source. The stored schema is unchanged. The world module rebuilds with the new bootstrap pack, and the content head gains the new definitions.

## Client 0.40.4 / UI 0.42.1 / Studio 0.15.4 / World 0.26.0 — Gear stat budgets and per-item gear foundation

- Equipment may grant the six attributes, maximum mana, health/mana/vigour regeneration and flat Health (Gear-D3, PR #136). Each rule is keyed by stat and layer with a per-item cap (content validation, which also sums an item's same-stat modifiers) and a separate loadout cap; the ten pre-existing rules keep one shared range and behave exactly as before. Placeholder caps await the owner's balance pass. Equipment tooltips show attribute points, regeneration per second and flat Health in their own units.
- Add the per-copy `ItemGear` record, deterministic item-level effect derivation, naming and sell value, and a `gear` content kind (Gear-D1/D2, PR #139). The rollout is reader-first: the committed pack carries no gear rows (`gear.json` is `[]`), so content, payload and older readers are unchanged; the 145-row catalogue is a test fixture. Instanced gear stacks never merge or split. No stored schema, grants or gear gameplay are activated.
- Workspace 0.48.0, Sim 0.27.0, Tools 0.23.1 and Assets 0.21.1 reconcile the combined source. Content R18 and stored schemas are unchanged; the world module is rebuilt with the new sim.

## Client 0.40.3 / UI 0.42.0 / Studio 0.15.3 — Reviewed rendering and UI foundations

- Render actor shadows at native pixel resolution with prepared sun-angle fades. Preserve receiver lighting, contact shadows and existing Canvas/WebGL boundaries.
- Add the authored dark tooltip frame, quality inks, item-tooltip and currency kit components, plus an offline gear rig/catalogue renderer. These additive exports do not replace production equipment tooltips or activate instanced gear gameplay.
- Add static-world readiness probes with strict arguments and validated build-audit envelopes. Report manual gates separately; D6 remains shadow and chunks remain off. Correct the diagnostic's client build command.
- Retain the reviewed passive-chat drawing/hit-area correction from Client0.40.2. Workspace0.47.0, Engine0.24.1, Assets0.21.0 and Tools0.23.0 reconcile the combined source. World0.25.0, contentR18 and stored schemas are unchanged by this batch. PR136/139 are excluded pending their separate integration.

## Client 0.40.2 / UI 0.41.2 / Studio 0.15.2 — Passive chat scrollbar

- Hide the closed chat history scrollbar and its thumb hit area together when history is not expanded. Preserve recent passive messages, stored history, draft, focus and scroll offset; show normal scroll controls on desktop hover or open input.
- Workspace0.46.5. Regression coverage exercises actual chat drawing and touch input. No world module, content, schema or inventory-command changes.
- The preceding coordinated release is now live from mergedfc1a7b7f: Game0.40.1, Studio0.15.1, world0.25.0/contentR18/hash3cc75c4a. Its older preparation headings below retain their historical status wording; current installation and rollback evidence are recorded in the wiki and local installed-release records.

## Workspace 0.46.4 — Accurate production guide recipes

- Read the guide's crafting costs, outputs and shaped patterns from the same reviewed content used by the game. Show the Greenhouse's five Timber Frames, two Iron Fittings and two Stone Foundations, plus component procurement patterns.
- Replace obsolete Build-control positioning instructions and label generated source/date honestly. The guide remains a separate documentation artifact; application versions and runtime behavior are unchanged.

## Workspace 0.46.3 — Licensed premium import verification (not yet deployed)

- Preserve the original21 premium imports and check all19 approved weapon/component imports against their exact committed manifest names. Retain pixel comparisons for every premium asset; no artwork or content changes.
- Correct the stale count that blocked the combined release check. Game0.40.1, Studio0.15.1 and world0.25.0 remain the proposed application versions.

## Workspace 0.46.2 — Studio staging after documentation retirement (not yet deployed)

- Allow guarded Studio staging from current reviewed source without the retired root UI reference directory. If legacy references are present, copy and fingerprint them with symlink and mutation checks intact.
- Preserve mandatory source trees, the UI-kit guard, locked dependencies and source-before/after equality. Game0.40.1, Studio0.15.1 and world0.25.0 remain the proposed application versions.

## Client 0.40.1 / UI 0.41.1 / Studio 0.15.1 — Compact chat keyboard clearance (not yet deployed)

- Keep the complete native chat editor and command suggestion row visible when compact touch controls and the software keyboard share a short viewport. Preserve active composition, completion, dismissal and command ownership.
- Workspace0.46.1. World0.25.0 and the reviewed content candidate remain unchanged; complete combined checks, CI and guarded publication remain required.

## Client 0.40.0 / World 0.25.0 — Approved crafting and basic stair content (not yet deployed)

- Add shaped crafting patterns, nine weapons and three structure components with reviewed weapon art. Preserve explicit selected-recipe priority where a shaped fiber rug also matches the shapeless string recipe.
- Apply approved balance/content updates: starter wooden bow damage12.5/durability180, iron sword damage16/buy500, crafted resale caps at material cost, and common Shorehand leather armour26 per set. No food/alchemy gameplay changes.
- Make the reviewed two-lane basic cliff stair transition available to Studio authoring. Keep existing authored terrain rules and all eight live island stair courses unchanged.
- Publish lifecycle bundle19 with157 handlers and947 bundled definitions; the next live content-head revision is determined by guarded compare-and-swap, not the lifecycle revision. Workspace0.46.0, Assets0.20.0, Sim0.26.0, Tools0.22.0. UI0.41.0/Studio0.15.0 and Engine0.24.0 retain the reviewed UI and terrain stack. Publication requires full-schema parity, reviewed content candidate, checked rollback, final CI and same-identity reconnect verification.

## Client 0.39.0 / UI 0.41.0 / Studio 0.15.0 — Shared contextual feedback (not yet deployed)

- Adopt shared nameplates, quest markers, combat feedback, fishing progress, public/private speech, contextual hints, notifications and skill notices. Preserve camera projection, recipient filtering, authoritative timing and permission checks; retire replaced production drawing and pointer paths together.
- Keep equipment inspection above inventory slots and damage above world hints. Scope notice actions to the current identity, connection and notice; preserve the K shortcut and authoritative expiry. Compact rejection messages take precedence when no readable notice space remains.
- Complete central adoption of all 33 migration surfaces, including shared touch actions in Studio's UI lab. Workspace0.45.0; final browser, combined CI and signed-in release acceptance remain gates. Engine0.24.0, Sim0.25.1 retain the merged terrain release.

## Client 0.38.1 / UI 0.40.1 — Responsive touch and HUD composition (not yet deployed)

- Fit touch controls beside the actual compact HUD and pinned quests so Block and the joystick remain reachable. Preserve hotbar slot authority, full status information through shared scrolling, saved placement preferences and single-primary HUD gesture policy.
- Fit full player/target status around touch capture areas in wide and portrait layouts; preserve non-touch geometry and saved preferences. Workspace0.44.1. BUG-029 browser acceptance and final combined checks remain required before publication.

## Client 0.38.0 / UI 0.40.0 — Shared touch controls (not yet deployed)

- Use the same five-action touch composition as Studio, preserving eight-way movement, deadzone, action timing, held block and independent pointer custody. Central retained capture owns all thumb-control tails while world pinch and hold gestures keep their existing authority.
- Keep all controls onscreen at compact sizes and maximum saved offset (BUG-027); preserve swap preferences and cancel stale movement/holds on resize, modal takeover or recovery. Retire legacy touch drawing and input together.
- Render the ordinary collision-height diagnostic in font_5x7. Workspace0.44.0.

## Client 0.37.0 / UI 0.39.0 — Shared online-player roster (not yet deployed)

- Adopt the shared roster with real identities, online/idle status, roles and owner permissions. Keep role cycling distinct from remove-and-kick and recheck current scope, role and authority before transport.
- Resolve touch scrolling before membership commands (BUG-026); retain scroll/focus on harmless updates, cancel stale gestures and preserve hold-Tab versus sticky HUD opening. Retire legacy roster drawing/input together. Workspace0.43.0.
- Fix BUG-028: preserve chat dismissal ownership before synchronous native blur, so the first outside click closes chat without also triggering a world action.

## Client 0.36.0 / UI 0.38.0 — Shared account and loading gateways (not yet deployed)

- Adopt the shared account composition and all three loading hosts with responsive safe-area bounds and font_5x7. Keep native name editing, profile validation, OIDC navigation and music under their existing authorities; cancel duplicate and stale commands while busy.
- Preserve the permanent startup canvas, one animation loop, loading-stage projection and accessible pre-asset status. Retire the account's legacy input and drawing together. Workspace 0.42.0 / Engine 0.24.0.

## Client 0.35.0 / UI 0.37.0 — Shared chat and native editing (not yet deployed)

- Adopt the shared chat composition with existing message/whisper commands, arrival-based fade, history, unread state, draggable position, suggestions and 240-character editor. Preserve drafts through deferred failures, touch keyboard transitions and harmless authority updates.
- Use the central native editing and retained pointer ownership for IME, clipboard and captured gesture completion. Keep desktop dismissal and touch continuity scoped to chat; retire its separate HTML input and legacy drawing/pointer path together. Workspace 0.41.0.

## Client 0.34.0 / UI 0.36.0 — Shared game HUD (not yet deployed)

- Adopt shared zone/minimap, hotbar/resources, target/effects compositions using existing inventory selection commands, actual registry art, equipped-watch authority and projected status timers.
- Preserve keyboard/pointer/touch and cancel stale gestures across target, connection or modal changes. Retire the replaced legacy drawing and hit paths together.
- Give default tracked quests compact space above target controls; temporarily collapse the map, let explicit map inspection hide quests, restore wide layout and preserve saved tracker anchors during resize. Match foreground paint and input ordering. Workspace 0.40.0.

## Client 0.33.0 / UI 0.35.0 — Shared Delve and update overlays (not yet deployed)

- Adopt shared Delve confirmation, current run rewards/status and update-ready compositions. Reward commands remain pending until authoritative state changes; rejection permits a scoped retry without fabricating currency or progression.
- Give update decisions their own highest input priority and synchronous service-worker readiness, even while rendering is paused. Preserve Later for the current availability interval, cancel superseded gestures and retire replaced production overlay input/drawing together. Workspace 0.39.0.

## Client 0.32.0 / UI 0.34.0 — Shared skill tree (not yet deployed)

- Adopt the shared skill graph, authored node art, details, track navigation and progression actions using subscribed ranks, requirements, equipment contributions and reset costs.
- Keep pan, zoom, selection and focus through harmless updates and resize. Cancel stale held actions when selection, authority or connection changes; retire legacy skill drawing and input together. Workspace 0.38.0.

## Client 0.29.1 / UI 0.31.1 — Touch slider intent (not yet deployed)

- Prevent vertical touch scrolling over audio or developer time sliders from sending a preference or world command before scroll intent is resolved (BUG-024). Intentional taps and horizontal drags retain their commands; desktop drag, keyboard and wheel controls are unchanged. Workspace 0.35.1.

## Client 0.31.0 / UI 0.33.0 — Shared dialogue and merchant windows (not yet deployed)

- Adopt the shared NPC dialogue and merchant compositions with authoritative offers, inventory capacity, currency and transaction results. Native filter editing uses the central text bridge.
- Preserve recipe exchanges, village orders and furniture inspection. Cancel stale held gestures when the session, selected cart or offer changes; fix pending transactions locking a reopened conversation (BUG-020).
- Retire replaced NPC drawing and input paths together. Workspace 0.37.0. Browser acceptance and final CI remain release gates.

## Client 0.30.1 / UI 0.32.1 — Readable compact statistics and table paging (not yet deployed)

- Keep horizontal table scrollbar hit areas below the pagination controls, so native center pointer/touch presses reach Next and Previous (BUG-025).
- Reclaim compact statistics frame padding to retain a complete readable row alongside its header and pager. Preserve table identity, sort, page, focus and saved browsing state through resizing. Workspace 0.36.1.

## Client 0.30.0 / UI 0.32.0 — Shared character and lifetime records (not yet deployed)

- Adopt the shared character and statistics windows with real appearance, equipment, authored attributes and bigint lifetime records. Preserve navigation, focus and responsive scrolling through the central input runtime.
- Fix BUG-022: follow authoritative appearance changes and roll rejected current previews back without allowing stale completions to overwrite newer intent. Keep equipment read-only and draw authoritative durability once.
- Retire legacy character/statistics drawing and pointer paths together. Workspace0.36.0.

## Client 0.29.0 / UI 0.31.0 — Shared game settings and developer menus (not yet deployed)

- Mount the shared game menu, all six settings pages, and current world/render developer controls through the central canvas input runtime.
- Preserve audio restore, touch placement, lighting quality/model, world scale, presentation cap, experimental backend, updates, fullscreen and administration callbacks. Cancel stale held actions on permission or availability changes.
- Use font_5x7 and scrollable bounded layouts; retire production legacy menu drawing and hits together. Workspace0.35.0.

## Client 0.28.1 / UI 0.30.1 — Quest window bounds (not yet deployed)

- Fix BUG-023: the production quest window uses host-owned responsive bounds. Remove its manual resize handles so edge drags cannot push Track/Drop outside compact viewports; lab resizing remains explicitly available. Workspace0.34.1.

## Client 0.28.0 / UI 0.30.0 — Shared quests and guide (not yet deployed)

- Render the production quest log and help guide with the shared kit, preserving real quest pin/drop callbacks, deep links, selection, reading navigation and parent close policies.
- Keep stable roots and focus across authoritative updates and resizing; retire old frame drawing and coordinate input together. Preserve captured-pointer cancellation, secondary-touch rejection and repeated activation guards.
- Use font_5x7 for ordinary chrome and quest text; book page headings retain their explicit long-form reading role. Workspace0.34.0.

## Client 0.27.1 / UI 0.29.1 — Nonmodal pointer ownership (not yet deployed)

- Honor single-pointer ownership within nonmodal palette controls while preserving fresh outside world gestures and independent scopes (BUG-021).
- Keep cancelled tails owned through release, clear retired ownership, and handle fresh presses after a missing release without sending a second command. Workspace0.33.1.

## Client 0.27.0 / UI 0.29.0 — Shared build palette (not yet deployed)

- Adopt the shared build palette using real furniture, construction, upgrade and residence models; preserve existing transport and authoritative rejection handling.
- Route pointer, touch, wheel and keyboard actions through the common retained runtime, including held-key deduplication and scope cancellation. Retire the legacy palette draw/input paths together.
- Preserve compact/wide layout, font_5x7 chrome and world input outside the palette. Workspace0.33.0.

## Client 0.26.0 / UI 0.28.0 — Shared processor windows (not yet deployed)

- Adopt the shared authored furnace, cooking, press and fermentation compositions through their actual content-window routes, retaining the existing inventory authority and slot restrictions.
- Preserve extraction-only outputs, furnace fuel, cooking batch actions and authoritative running/paused/settlement timing. Keep sorting on the backpack; processor output panes do not offer unsupported sorting.
- Forward authored process progress without creating client deadlines or granting outputs locally. Workspace 0.32.0; 11 of 33 surfaces are wired in combined source, with browser/final CI/live acceptance pending.

## Client 0.25.3 / Studio 0.14.3 — Full-height terrain stairs (deployed 2026-09-24)

- Draw stair flights continuously from the cliff rim through its visible wall to the ground contact row; restore the basic terrain family's matching two-lane brown-rim stair block.
- Studio permits new stairs only along a straight cliff edge with room beside the bank. Existing courses still load and report placement warnings; this release does not move live stairs or publish world, map or content changes.
- Rebuild wiki terrain plans from the same reviewed engine rules. Workspace 0.32.1, Engine 0.23.1, Sim 0.25.1; UI remains 0.27.2. The static release includes previously merged inventory/storage, trade, shared typography and pointer fixes through main 687373eb, but excludes pending UI PRs.

## Client 0.25.2 / UI 0.27.2 — Cancelled pointer ownership (not yet deployed)

### Workspace 0.32.0 / Engine 0.23.0 — Terrain plan recorder (PR113; source only)

- Expose the real game/Studio terrain draw plan to wiki tooling through a recording canvas, including projected walls, raised ground and stair courses.
- Add a browser bundle and matching atlas manifest so wiki tile layouts use the engine's rules. The optional engine canvas factory preserves default runtime behavior. No world, map or content publication.

- Fix BUG-019: a captured list row that disappears or moves during an update cannot pass its old release to a replacement row. Explicit scope/reconnect cancellation also suppresses the old pointer tail.
- Keep suppression per pointer until release, cancellation or a fresh press; retain valid scrollbar and touch-scroll ownership. Workspace 0.31.2.

## Client 0.25.1 / UI 0.27.1 — Trade keyboard hints (not yet deployed)

- Request numeric keyboards for all three trade money fields through the shared native editor bridge; ordinary fields reset the hint to text.
- Keep sanitization, bigint limits, IME/clipboard and single-command submission authoritative. Workspace0.31.1.

## Client 0.25.0 / UI 0.27.0 — Shared player trade (not yet deployed)

- Use the shared trade composition with live escrow, revision and wallet models; retain server authority and one command per gesture.
- Preserve exact bigint money, draft focus through ordinary updates, stale-revision rejection, touch ownership and reconnect draft reset. Remove the old trade renderer and three native input paths.
- Exclude inaccessible equipment/crafting/backpack slots from trade offers (BUG-018). The actual production wrapper is checked against a two-identity reducer harness.
- Workspace 0.31.0. Seven of 33 surfaces are wired in the combined source; browser, final CI and live acceptance remain pending.

## Client 0.24.0 / UI 0.26.0 — Shared inventory and storage windows (not yet deployed)

- Bind inventory, crafting, chest and barrel windows to the shared kit compositions while retaining the existing inventory authority, cursor prediction and command transport.
- Keep the crafting grid at 3×3, chest at 16 slots and barrel at 8. Search never renumbers slots; shared chest filtering, cursor-aware sort, restrictions and authoritative timing remain intact.
- Resolve touch scrolling before pickup, preserve one pointer owner across slots and background, and retain filter Escape/Enter behavior through resize and reconnect.
- Keep roster controls responsive above inventory and suppress repeated activation keys without affecting text editing.
- Workspace 0.30.0. Six of 33 surfaces are wired in the combined source; final checks and live acceptance remain pending in the [release ledger](https://wiki.orchard.dastari.net/Roadmap/UI%20UX%20Release%20Acceptance%202026-09-24).

## Client 0.23.0 / UI 0.25.0 — Retained name gate and quest tracker (not yet deployed)

- Use the shared kit's character-name gate and quest tracker in the game with real naming and pinned-quest models. Keep pending/error handling, required naming, focus, tracker collapse and saved position across resizing.
- Route retained input within the existing game canvas and frame loop, preserve native IME/clipboard, and cancel captured gestures without replaying releases through recovery or other overlays.
- Game 0.23.0 / UI 0.25.0. These are the first two production hosts in the [33-surface migration](https://wiki.orchard.dastari.net/Roadmap/UI%20UX%20Release%20Acceptance%202026-09-24); remaining hosts and live acceptance are pending.

## 0.28.1 — Touch inventory fix (not yet deployed)

- Fixed gradual vertical touch swipes picking up an inventory item before scrolling began. Horizontal dragging, taps, scroll boundaries and held-cursor interactions retain one command per gesture.
- Game 0.22.3 / UI 0.24.1. Regression and local reproduction tracked in [BUG-017](https://wiki.orchard.dastari.net/Bugs/BUG-017%20Inventory%20pickup%20can%20precede%20touch%20scroll%20ownership).

## 0.28.0 — UI release integration (not yet deployed)

- Preserve pointer type and modifiers, scope dispatch around remaining legacy surfaces, and admit concrete shared kit modules while excluding Studio and lab factories from game bundles.
- Add a game-only retained UI entry and shared input routing contract. Pointer ownership survives leaving a window, modal takeover cancels unfinished gestures, and world-origin releases cannot activate UI controls. Keyboard-opened panels can claim focus while unhandled keys still reach the game; covered hosts clear stale hover and tooltips.
- Add a two-identity trade authority harness covering escrow, revisions, rejection, full destinations and reconnect recovery; no production reducer behavior changes.
- UI 0.24.0. Production surface migration and deployment remain tracked in the [September 24 acceptance ledger](https://wiki.orchard.dastari.net/Roadmap/UI%20UX%20Release%20Acceptance%202026-09-24).

## Client 0.22.2 / UI 0.23.1 — 2026-09-24

- Version mutable atlas index requests by client build so returning players controlled by an older service worker load matching index/category metadata after deployment. Keep existing revision checks and immutable asset caching.

### Studio 0.14.2 — lamp presentation fix (not yet deployed)

- Draw a materialized town lamp once in Studio using its authoritative live state at the authored draft position. Preserve both records and use the verified published map binding for draft moves, picking and fallback behavior.
- Regression and local visual evidence: [BUG-010](https://wiki.orchard.dastari.net/Bugs/BUG-010%20Studio%20draws%20both%20copies%20of%20a%20streetlamp).

## 0.27.2 — 2026-09-23 — integrated runtime release

### Published and verified

- Publish merged `78665a40` through the guarded schema-only lane; content R17 / `0e741b0f`, 921 definitions, no deletions. Restored and production reconnect parity passed for one account across 42 durable tables.
- Preserve D6 shadow and chunk default-off behavior; food/alchemy delivery remains artwork groundwork.
- Record the corrected returning-client service-worker/atlas startup and successful browser acceptance in [the release record and handoff](https://wiki.orchard.dastari.net/History/Release%202026-09-23).
- Record authorized disk cleanup and a proposed current/previous verified-backup retention policy; no automated pruning introduced.

### Chunk runtime shadow phase

- Add owner-only CAS chunk shadow staging, additive regional heads and verified private collision blobs.
- Add bounded view/ring chunk loading, IndexedDB caching with connection teardown and revision-pinned diagnostic subscriptions behind a default-off flag.
- Add offline static bundle preparation compatible with existing eight-character content hashes and a generator retirement build gate; live terrain and movement remain unchanged.

### Food/alchemy P0 icons — assets 0.19.1, tools 0.21.2

- Add 205 reviewed exact native icons from owner-approved doc 63; retain 10 additional mapping defects in the manifest only, held for correction before import or gameplay use.
- Add reproducible imports, pixel parity tests and a 35-item missing-art manifest; no gameplay definitions or deployment.

### Food/alchemy core artwork — assets 0.19.2

- Add 18 reviewed bespoke 16×16 icons: seven fruit-specific must jugs and pomace baskets, wool, wing dust, raw game and roast game, following approved doc 63 §§3/8.
- Preserve the closed Orchard palette, (8,15) anchors, existing asset IDs and gameplay data; no source PNGs or generated atlases are committed.
- Record native-size, dark-background, silhouette and neighbor review evidence in [the core art handoff](https://wiki.orchard.dastari.net/Art/Sprites). Client asset publication precedes future gameplay references; no world publish is needed for this art-only change.

### Collection and apiary inventory art — assets 0.19.3

- Add eleven native-palette inventory icons from approved doc 63: six live specimens in ventilated jars, capture net, empty specimen jar, apiary frame, honeycomb and beeswax.
- Record native-size/neighbor review and integration mapping in [the art review](https://wiki.orchard.dastari.net/Art/Sprites). No gameplay data, world artwork or publication changes.
- Candidate version coordinated after food/alchemy P0 0.19.1 and core art 0.19.2; preserve the higher compatible asset version when integrating parallel PRs.

### Food and alchemy station artwork — assets 0.19.4

- Add eight native station/habitat sprites and seven inventory icons from doc 63, with stable state groups, anchors and four-frame working loops at 5 fps.
- Add reproducible contact sheets and complete state-filmstrip review via `scripts/render-food-alchemy-station-review.mjs` (station art contract on [Art/Sprites](https://wiki.orchard.dastari.net/Art/Sprites)); existing station art and content definitions are unchanged.
- Asset-only preparation: no world publication, deployment or gameplay activation.

### Food/alchemy semantic artwork — assets 0.19.5

- Add nine reviewed native 16×16 replacements for held butter, curd, sugar, salt, bandage compound, salve, animal feed, pumpkin pie and roast potato source mappings from approved doc 63.
- Preserve the exact planned icon keys, closed Orchard palette and existing gameplay data. Record shape/material review in [the correction art handoff](https://wiki.orchard.dastari.net/Art/Sprites).
- No licensed source pixels, generated PNGs, gameplay references or deployment are included; the client asset bundle must precede later content activation.

## 0.26.0 — 2026-09-23

### Object state runtime

- Persist authored object state and growth anchors with bounded lazy catch-up, historical weather/calendar epochs and isolated scheduled transactions. Route spawn/place, interaction and explicit state mutations through approved lifecycle callbacks and transition graphs.
- Resolve sprite, footprint, light, shadow, global-light reception and interaction availability from ordered state overrides. Replace map light asset lists and tree-prefix shadow inference with authored object bindings.
- Add dual-read resource/crop object projections while preserving legacy row identities, harvest/farming authority and stage artwork. Keep all schema changes additive; no deployment or destructive migration.
- See [object runtime specification and handoff](https://wiki.orchard.dastari.net/Content/Objects%20%26%20Machines) for validation, integration and migration boundaries.

### D6 runtime consumers and percentage hazards

- Wire shared medium admission to prediction, authority movement, NPC AI, projectiles and gameplay placement while preserving independent geometry and explicit legacy/shadow modes. The authored bootstrap policy remains shadow.
- Author boat/mount/creature/enemy grants and approved lava 10% / shroom-water 2% maximum-health damage each second. Boat/water-walk admission is separate from toxin immunity.
- Add private fractional hazard state, existing knockout/rogue recovery and environmental encounter completion without synthetic player credit. Offline ticks never accrue exposure.
- Add generated/compiled/chunk medium parity and authority persistence/recovery regression tests; document policy bounds, editor boundary and release gating on the wiki page [World/Traversal](https://wiki.orchard.dastari.net/World/Traversal).
- Content: 920 definitions, 585,179 runtime bytes (a69b62bf), +2,461 bytes; measured guard 572 KiB.

### Shared growth timing

- Extend shared timing to crops, tree regrowth, fruit ripening and authorized generic lifecycle snapshots. Dry/dormant crops display paused reasons; conditional growth budgets are distinguished from finish deadlines.
- Inspect projected crop tiles and authored resource targets independently of action reach, with row-revision spatial caches and unchanged authority settlement. Preserve Soil Whisperer water details.
- Reuse stateful lifecycle deadline math without exposing private anchors or adding scheduled writes. Client 0.22.0, sim 0.24.0, UI 0.23.0.

## 0.25.2 — 2026-09-23 — reviewed source integration

- Combine sparse music, multi-space reads, authored progression, reviewed lifecycle hooks and blob47 rules.
- Require world-operation scope for spatial reads and loot/progression scope for progression authoring.
- Regenerate combined contracts, pin the historical migration snapshot, and measure the 604 KiB content budget.
- Production source matches the passing PR87 rehearsal; no deployment or later runtime activation.

## 0.25.1 — 2026-09-23 — lifecycle object and narrative hooks

- Add v2 reviewed object, NPC, dialogue and quest lifecycle callbacks with typed engine capabilities, bounded execution and exact-source hash approval. Preserve v1 item artifacts.
- Bind object event/state transition callback references to their owning definition; raise state exit/enter and action-objective notifications from existing world authority paths. Add graph event verbs and regenerate form schemas.
- Reject type assertions, interpolated string expansion and bigint operations that could evade the callback AST budget.
- Validate v2 source, generated code, metadata and provenance in lifecycle build/integrity gates. New checked-in bundle is empty; release remains separately reviewed. See [F3 specification and handoff](https://wiki.orchard.dastari.net/Studio/Authoring%20Suite).

## 0.25.0 — 2026-09-23

### D6 traversal authoring groundwork

- Add authored `world_rules` traversal policies, explicit actor/mount/effect grants, independent hazard cadence, and a shared medium predicate/classifier.
- Add a bounded cached collision projection with explicit legacy/shadow/active results and immutable shadow differences for integration. No gameplay call site switches in this groundwork.
- Keep the bootstrap policy collection empty pending owner hazard balance/access decisions. D6 runtime integration, terrain-role coverage and live activation remain incomplete; see [World/Traversal](https://wiki.orchard.dastari.net/World/Traversal).
- Sim 0.23.0; tools 0.21.0. Existing definitions and saved rows retain compatibility.

### Blob47 farmland and native fringe rules

- Move blob47 farmland and native grass fringe frame selection/composition into authored catalogue data, preserving all pre-migration pixels. Hoed and authored farmland share the same resolver; wet occupancy remains independent.
- Add optional masked neighbour matches and ordered independent layers to the generic interpreter, with strict validation and compiled terrain lookups. Regenerate Studio field schemas.
- Pin complete farmland/fringe layer goldens and update the measured content envelope to 602 KiB (616,383 runtime bytes).

### Shared workstation timing

- Restore authored countdown/status panes for furnaces, cooking fires, presses, fermentation vessels and barrels using one read-only timing projection. Closed station completion is estimated until settlement confirms output.
- Inspect processor timers across their authored target/footprint without action-reach restrictions. Cache definition metadata, projections and formatted labels without per-object intervals or timer writes.
- Share kit timing presentation between game frames and hover while preserving the independent Studio bundle boundary. Client 0.21.0, sim 0.23.0, UI 0.22.0.

## 0.24.1 — 2026-09-23

### Simulation clock for workstation and job progress

- Fix workstation and private-job progress using calendar offsets: elapsed time now uses the authoritative simulation clock exclusively, while date/weather/moon displays retain calendar time. Client 0.20.2.
- Document the shared timing delivery plan and add large-offset, reconnect and UI clock-wiring regressions.

- Integration: sim 0.22.2 includes catalogue field schemas; 14 reviewed cliff
  golden hashes now track PR62 while every other resolver hash stays unchanged.

### Studio 0.14.1 space metadata retry

- Studio 0.14.1 retries read-only space metadata when the shell connects or its signed-in identity/role changes.

## 0.24.0 — 2026-09-23

### Content-addressed atlas pages and asset packs

- Build content-addressed atlas pages, deduplicate identical seasonal/shadow variants, and retain unchanged atlas files across worker releases in a bounded immutable cache.
- Add opt-in semantic asset packs, lazy per-pack metadata, and chunk-prefetch APIs. Keep consolidated gameplay/Studio loading as the default pending the separate spawn-dependency/runtime migration.
- Tools 0.20.0, UI 0.21.0, client 0.21.0; full sprite/season/shadow-omit pixel parity verified.

### Rule catalogue, D6 medium metadata, permission scopes and schema forms

- Add optional per-role traversal medium metadata (D6), with no runtime movement switch.
- Add the versioned, validated tileset rule catalogue and deterministic mask/role interpreter. Existing cliff content stays unchanged.
- Fence/hedge compatibility assets and frames are authored data; live Studio and game objects join by definition membership and `connectsTo` IDs/tags. Runtime content can replace join art without changing code.
- Keep complete formatted catalogue definitions in the Tiles JSON editor instead of clipping them at 32 KB.
- Pin pre-migration resolver outputs for raised terrain, transition/shore, blob47/farmland, waterfall lanes, cave patches and connect4 masks.

- Add server-enforced Studio domain scopes with additive grant overrides, legacy access compatibility, audited previews, stale-state protection and idempotent audit receipts.
- Check all content kinds in publishes, deletions and restores, and gate administration families. Studio mirrors private scope state in tool access.
- Bind script review records to artifact hashes and authenticated authors; require a separately scoped approver. Reviewed warm-build release gates remain required.

- Integrate object-archetype form schemas, omitting excluded optional-never keys;
  arrange the schema specimen beside data controls to avoid district overlap.

- Studio 0.14.0 replaces leaf-only definition fields with schema forms, optional components, array add/remove/reorder, enum choices and typed references. Items, Narrative and World Tables retain advanced JSON and existing validation/publish gates.
- UI 0.21.1 adds reusable schema forms, array editors, reference pickers with preview and used-by panels. Sim 0.22.1 exports type-derived schemas for all 25 content kinds with regeneration and bootstrap parity checks.
- New item/recipe actions create local drafts; references open the selected definition, using World Tables for kinds awaiting specialized selectors.

### Studio multi-space reads

- Studio 0.14.0 uses per-space viewport subscriptions, all-space presence, authoritative space metadata and bounded server entity pages including crops. Adds F5 picker sources and a read-only runtime-space route/data boundary for the later World Map canvas.
- Sim 0.22.0 shares static, homestead/residence/cellar and rogue space resolution with portal links. World 0.21.0 and bindings 0.16.0 add admin-gated registry and indexed cursor paging without exposing private run state or reviving retired farm parcels.

### Named balance and progression content

- Author named combat, world-policy and residence balance fields with legacy tuple compatibility.
- Move XP curve, level cap, respec ladder and 16 activity awards into validated progression content; live world and character/skill UI read published tuning.
- Expose balance and progression through Studio World Tables; preserve current runtime values with migration parity tests.

### Chunk materialization groundwork — sim 0.22.3 / engine 0.20.3

- Integrate typed sparse cell-part reconstruction and reuse the catalogue
  medium contract; retain generated-world and authored-part round-trip parity.
- Add versioned per-cell medium and independent solid blockers for D6; retain
  unchanged walking/boat parity channels until the later ability-based runtime.
- Add SHA-256-addressed 64×64 static world chunks with one-cell halos, signed
  elevations, ordered authored/generated records, exact generated resource IDs,
  and an optional cell-part section.
- Add an offline materializer and actual-server parity oracle, plus a compatible
  `ChunkTerrainStore`. Runtime subscriptions and world schema are unchanged.
- Preserve independently captured client/server collision channels; validate
  bootstrap goldens and the local authored-map snapshot before runtime migration.
- See [materialization procedure](https://wiki.orchard.dastari.net/World/Chunks%20%26%20Streaming) for commands,
  format details, asset-index integration, and the subsequent streaming boundary.

### Studio 0.13.3 — ownership marker token integration

- Preserve P0 ownership and P1 exact terrain parts under the kit gate; move all
  live-marker colours to spatial tokens and remove the temporary controller exception.

## 0.23.2 — 2026-09-22

- Correct desert, shroomland and volcanic cliff courses; restore native shroomland inverse corners and per-family cap/floor references (sim 0.21.1).
- Studio 0.13.2 repairs conflicting diagonal insets only around Smart Placement strokes; Exact Placement and existing maps remain valid. Stone cliff brushes select matching grass 1–4.
- Engine 0.20.1 renders explicitly authored desert/shroomland cap materials from the selected native family.
- Regenerate independently reviewed native examples with corrected diagonals, matching grass/desert/volcanic ground, cyan oasis water, and explicit withheld interior assemblies where source roles remain unverified.

## 0.23.1 — 2026-09-22

- Studio 0.13.1 paints newly loaded palette thumbnails while the placement-mode menu stays open, preserving its selection and drawer scroll.

## 0.23.0 — 2026-09-22

- Studio 0.13.0 restores Marlow's live camp path under Generated Base and removes the proven duplicate 47-frame path bank from Exact Placement without deleting saved IDs.
- Assets 0.18.0 imports 38 exact paving variants and repairs empty desert grass/interior wall imports with complete native source coverage. Tools 0.19.0 adds deterministic import and atlas audit tooling.
- Adds the source-linked atlas inventory and visual terrain joining guide: all 1,320 registered assets, 1,233 source files, 22 runtime biomes and 8,448 neighbour-mask cases, with explicit unimported/unverified source gaps.
- Includes the Studio 0.12.1 legacy joined-fence drag footprint repair; records the read-only live-map duplicate audit.

## 0.22.1 — Legacy fence movement

- Match older automatically joined fence and hedge selection/placement footprints to their one-cell rendered segments. Moving a legacy segment back into a joined row now commits correctly.
- Save one-cell geometry for only the edited instance, with atomic undo and small-delta publication; retain Exact pieces, gates, scaled objects, and untouched legacy prefabs.

## 0.22.0 / Studio 0.12.0 — Smart placement and stable object editing

- Use compact parchment tooltips, persistent drawer scrolling, larger tool buttons, native scrollbar art and uncropped layer eyes.
- Select object silhouettes, delete through a right-click menu, and edit labelled properties without a redundant Selection dropdown.
- Group joinable objects and terrain materials in Smart placement; expose individual pieces in Exact placement. White picket fences use one-cell geometry and local connections; reject new same-layer object overlap.
- Share typed object appearance and growth rules between Studio and the game renderer. Publish live resource growth and health edits as atomic, conflict-checked deltas applied once, preserving subsequent gameplay growth.
- Invalid map geometry remains allowed. No whole-map placement repair or new database schema is introduced.

## 0.21.3 — Clearer workbench artwork

- Published with the Update Ready dialog spacing fix through PR57; all 5,992 release tests and strict reconnect checks passed. See [History/Releases 0.21](https://wiki.orchard.dastari.net/History/Releases%200.21) for artifacts and observer-milestone recovery evidence.

- Rework the crafting workbench for its native 32-pixel width: quieter wood, clear plank seams, a readable mallet and a connected iron vise. Preserve the two-tile size, collision and interactions.
- Retain the original high-resolution artwork alongside the revised AI source and reproducible sprite import.

## 0.21.2 — Update dialog spacing

- Raise Refresh Now and Later inside the Update Ready dialog so both buttons clear the bottom frame; pointer targets follow their visible position.

## 0.21.1 — September 22 integrated release

- Combine Studio freeze recovery, atomic map deltas, responsive terrain and Canopy selection with NPC camera alignment, world interaction registration, the two-tile crafting workbench and picked-fruit visuals.
- Preserve all six PR histories and their highest workspace versions; release scope and verification are recorded in [the release handoff](https://wiki.orchard.dastari.net/History/Releases%200.21).
- Record the owner-approved workbench relocation with unchanged chest contents and the dedicated development account’s verified Admin publishing access.

## 0.21.0 — Picked fruit disappears from trees

- Picking apples, pears, peaches, or cherries now shows the matching fruitless tree until fruit ripens again.
- Reuse the existing native fruitless sprite, preserving tree position, scale, sway, and sapling/stump states.
- Select visuals from shared authoritative harvest state so reconnects and other players see the same fruit availability.

## 0.20.0 / Studio 0.11.0 — Responsive terrain and selection

- Keep hover outlines and palette tooltips stable through control rebuilds; size inventory reticles to each palette button and center compact layer rows.
- Show selected tree/object sprites and the resolved tile composition. Move Canopy resource trees in local drafts, with atomic placement deltas that preserve identity, harvest state, and generator reconciliation.
- Keep material painting at the existing elevation, create complete 2×2 height footprints, and continue grass-water banks with Auto surround. Limit assistance to each placement and its immediate neighbors; preserve manual geometry and make whole-map design checks opt-in and advisory.
- Avoid repeated whole-island cliff generation and whole-document work during a stroke; coalesce draft persistence after drawing and flush it on navigation.

## 0.19.0 / Studio 0.10.0 — Atomic map delta publication

- Publish only changed map entries and removals against a verified live base; deleting a tree no longer uploads the entire map or exceeds the server's payload limit.
- Apply deltas atomically on the authority with revision/hash conflict checks, full map validation, retry receipts and existing history/game subscriptions. Existing snapshot callers remain supported without a database schema change.
- Keep rejected drafts and show visible publish failures with retry/dismiss controls. Preserve edits made while a previous publication is awaiting its live receipt.

## 0.18.4 — World interactions and crafting workbench

- Empty hotbar rows no longer show missing-item question marks; real unknown items retain fallback artwork.
- Nearby E actions, including picking ripe fruit, remain visible alongside selected-item F hints.
- Route nearby interaction selection through a provider registry supporting UI-opening and action callbacks, deterministic proximity, unregistering and exclusive dismount. Existing adapters retain their authority/reach rules.
- Replace the table-derived workbench with dedicated AI pixel art, a two-tile footprint, carry/placement support and three-hit axe dismantling that returns its four planks. Validate and target both occupied tiles.
- Document current direct anvil repair, its material/currency cost, and the unshipped repair panel. Client 0.18.2; UI 0.18.1.

## 0.18.3 — NPC camera alignment

- Keep resting and sleeping animals fixed to the ground while the player moves by aligning all world layers to the same camera pixel grid.
- Preserve NPC/player movement interpolation and stabilize actor rounding at higher rendering resolutions.
- Record the measured cause, regression coverage and release handoff in [the investigation](https://wiki.orchard.dastari.net/Architecture/Client).

## 0.18.2 / Studio 0.9.3 — Live map freeze recovery

- Load the player appearance/held-light, enemy, mount and wildlife artwork used by Studio's live map before rendering actors, fixing repeated missing-art exceptions that froze the canvas.
- Store map drafts with lossless compact JSON so the published town fits browser storage. Storage failures preserve the open map and previous saved draft, show an export warning once, and no longer interrupt checkout or editing.
- Preserve explicit conflict resolution and existing local drafts; no map or content publication is part of this Studio update.

## 0.18.1 — Ripe fruit when a tree is chopped

- Chopping a ripe apple, pear, peach or cherry tree again drops its fruit, the Orchard Seed Saver seed roll and Farming XP along with the wood.
- Chopping a tree whose fruit was already picked still drops wood or sticks only, until that fruit ripens again.
- Picking with E or touch is unchanged.

## 0.18.0 / Studio 0.9.2 — Integrated town and live editor

- [Player-facing notes for 21 September](https://wiki.orchard.dastari.net/History/Willowharbour%20Town%20Passes) cover the integrated gameplay, town, artwork and Studio updates; publication evidence is linked there.

- Combine the refined town, persistent streetlights and connected scenery with Studio’s local draft editing, native joins and incremental rendering.
- Preserve both shared rendering paths and the canonical content validation and serial timing-test gates.

### Release verification

- Regenerate canonical space/object property ordering and check exports early in CI;
  definition values and the approved content hash are unchanged.

- Preserve a separately reviewed Studio artifact during guarded schema migrations
  after source-manifest, installed-output, UI-kit and generated API checks.
- Document the encrypted dedicated development account and verified Content
  Editor grant for future agents.

- Run CPU-heavy town/Studio fixtures and UI timing budgets in the serial,
  non-coverage test lane, preserving all assertions and existing timing limits.
- Allow guarded same-schema world releases to preserve the independently reviewed
  installed Studio artifact with exact manifest and static validation.

## 0.17.1 — Willowharbour headwaters and finishing details

- Make streetlamps 3.5× brighter within their existing light radius and use the matching bright native lantern frame.
- Complete bridge undersides with native stone arches over animated river water.
- Connect an upper freshwater lake to the town river with a complete animated waterfall anchored on the cliff plane.
- Keep fences off shallow turf shelves and flowers out of fence cells and gateway approaches.

## 0.17.0 — Connected town scenery and inhabited rooms

- Resolve native wooden, large wooden, picket, stone, large stone and hedge boundaries from cardinal neighbours; player-built wooden fences now use all sixteen native joins.
- Close shallow bank contours with native inner/outer corners and two-cell returns; repair the farm gateway and remove decorative Willowharbour chests.
- Persist streetlamp Auto/On/Off modes through ordinary world objects and interactions; synchronize native artwork and emitted light with world time.
- Join native interior wall caps and sides, place supported windows, and redesign all ten interiors around their room functions and clear circulation.
- Record independent Astra visual acceptance and saved-map upgrade rehearsal.

## 0.16.1 / Studio 0.9.1 — Immediate local map editing

- Enlarge object and terrain palettes, use generated pixel tools on one row, native inventory reticles and framed in-game category icons. Keep footer chrome intact and place explicit Publish below Auto.
- Support right-drag panning, dragging objects from the palette and immediate artwork movement while dragging placed objects. Draft edits remain local until Publish.
- Update sparse terrain cells and affected ground chunks without blanking the map; preserve terrain picking, inherited materials and undo behavior.
- Load all tree growth/depletion artwork, retain resource definition identities and keep tree sprites visible at overview zoom.
- Split selection preview/properties and compact layer rows into independent right-hand panels.
- Add local browser fixture and regression coverage for tree rendering, terrain parity, cache retention, drag/drop and footer layout.

## 0.16.0 / Studio 0.9.0

### Live map authoring (Studio 0.9.0)

- Require sign-in and a verified live map before opening the Studio workspace; remove offline/connect toolbar controls.
- Replace map drawer dropdowns with six tools, searchable virtual object/material icon grids, category filters, reticles, height controls and an Auto surround preference. Simplify each layer to visibility and selection.
- Put authored and live resource trees under Canopy and render resources at overview and detail.
- Preserve material, biome and collision together; constrain raise/lower to the active plane, generate local footprints, and retain interior floor and grass-family rendering.
- Share height-aware native fence/hedge joins between Studio and gameplay, with persisted editor overrides. Audit all tile assets and native art limits in [generation rules](https://wiki.orchard.dastari.net/World/Tiles%20%26%20Rules).
- Studio deploys independently; game/authority updates remain subject to a separate release.

### Willowharbour river town refinement

- Continue the river through the town to a sandy estuary, with four traversable bridges and preserved door/return routes. Add shallow native turf banks, cultivated flower beds, mature garden trees, white picket garden returns, connected hedge corners and a cobbled civic square.
- Add streetlights at bridges and public junctions using the shared warm authored light component.
- Separate domestic interior wings with capped and vertical wall faces; give the inn, barn, greenhouse, shop and smith distinct functional envelopes and preserve room/service access.
- Fix freshwater-to-ocean bank transitions and lock mature tree species independently of the decorative asset catalog.
- Preserve current-main integration and document independent Astra reference comparison.

## 0.15.0 / Studio 0.8.1 — Branch integration

- Integrate the reviewed Studio editor, six connected gameplay slices, Willowharbour,
  hoe/fish fixes, action baselines, catalogs and operational/design audits.
- Preserve Agent Mail startup guidance and all feature histories; refresh combined
  content and action baselines with independent Studio versioning.
- Consolidate review through one integration PR and retire stale worktrees only
  after preserving their committed work and non-reproducible local evidence.

### Publishing guidance (2026-09-17)

- Documented release-lane selection, encrypted shared-preview credential handoff,
  refresh validation, content equality and signed-in verification for future agents.

### Planning

- Specify unified tool/spell actions, modifiable targeting and resource costs, exact
  G-debug limits, and a dedicated repair UI with atomic output-to-cursor collection.
  Record phased delivery and anti-duplication gates; no runtime changes.

### Documentation

- Audit current and planned gameplay loops against source, identify weak links and
  stale design status, and propose an estate → outing → return progression network.
  See the [gameplay loop dependency audit](https://wiki.orchard.dastari.net/Roadmap/Gameplay%20Loop%20Connections).
  No gameplay behavior or balance values change.

### Frontend asset delivery audit

- Document measured frontend payloads, live cache/compression behavior, and
  prioritized asset-loading improvements for catalog growth. Include validation
  criteria and implementation handoff; no runtime or deployment changes.

### Icon audit

- Audit 336 item definitions and 66 skill nodes against the new Kenmi premium
  icons. Prioritize the hammer and six shovel tiers, plus 13 other first-pass
  replacements, a cellar bottle candidate, verified
  source coordinates, and keep/defer decisions without changing runtime artwork.

### Reference library

- Refresh stale Cute Fantasy catalog paths after the prior library reorganization
  and classify existing generated tool-progression references as concept-only.

- Index Kenmi’s 6,982 premium icons across nine native category sheets, with
  complete vendor-number-to-sheet coordinate lookup and source licence provenance.
  Verify redundant individual/scaled exports against retained native artwork and
  preserve the original archive in a local backup outside the indexed library.

## Studio 0.8.0 — Integrated reviewed editor

- Bring the reviewed Studio canvas UI kit and tools into the repository while
  keeping the game UI and Studio build/service independent.
- Share current runtime packages and canonical UI symbols; replace the external
  source overlay with a reproducible single-repository staged build.
- Retain live-map verification, draft safety, UI-kit checks, and rollback evidence;
  archive and retire the external source, remove six merged worktrees, and preserve
  active work plus checked rollback artifacts.

## 0.14.0 — Connected estate progression

- Train Farming with fishing catches (5 XP) and ordinary pool depletion (+10 XP), including Farming XP for tutorial catches. Preserve existing Explorer XP and all purchased skills.
- Price the East and South residence expansions at 60,000 and 180,000 bronze respectively (240,000 combined), retaining existing rooms and all bottle values, Vintage multipliers and first-bottle quest rewards.
- Add a source-derived production pacing report and make village-order comparisons read the same housing quotes as the game.

## 0.13.0 — 2026-09-21

- Completing all 12 Delve rooms and claiming the final guardian boon now permanently reveals the Delver Memorial Planter recipe, an optional residence keepsake crafted with stone, fiber and sunflowers.
- Track full Delve victories independently of temporary boons/currency. Content-disabled rewards are repaired on reconnect; death and abandonment grant no completion reward.
- Preserve completion receipts across quest resets and restore run-entry vitals as before.
- Keep the earned planter nonbuyable in authored commerce; reject purchase prices, including zero, in reward validation.

## 0.12.0 — 2026-09-21

- Mature apple, pear, peach and cherry trees now offer renewable E/touch fruit picking every game day, with ripening countdowns and existing seed-saver rolls. Picking preserves the tree; axe felling yields forestry materials only.
- Require a living player, current inventory protocol and unlocked persistent inventory before picking; rejected attempts leave the harvest and its rewards untouched.
- Persist readiness independently of tree health with an additive defaulted schema migration; inventory overflow uses the existing reserved drops.

## 0.11.0 — Village order specialist meals

- Learn Pantry Lunch after delivering two distinct raw products and one preserved product; learn Cellar Supper after two raw, two preserved and one bottle delivery. Repeat orders retain existing bronze payments.
- Track the next permanent recipe directly in Village Orders and receive a learned-recipe notice. New meals combine preserved produce with fresh crops to restore 36/48 hunger.
- Persist bounded private progress and grant recipe knowledge atomically with delivery receipts. Existing orders begin the new milestones at zero because historical receipts do not retain product diversity.

## 0.10.0 — Preserved expedition provisions

- Eat any preserved crop to restore 12–23 Hunger during outdoor work and expeditions. Full Hunger leaves the portion untouched; successful consumption records the existing food statistic. Preserving, prices and village orders retain their current behavior.

## 0.9.0

### Willowharbour town and interiors

- Round the western island into coves and headlands with varied beaches and northern stone shelves. Replace grid-based trees with deterministic mixed-age groves and undergrowth.
- Add native grass transitions to stone and rural dirt paths; furnish the inn garden, market, pond, craft yards, cottage gardens and farm with streetlamps, well, troughs, crops and livestock.
- Design furnished interiors for all ten buildings, including both cottages, barn and greenhouse; connect every door in both directions and add room-specific floor materials.
- Add a conflict-checked offline upgrade against a reviewed prior map export. Preserve the main island, Cinderwake and the Studio renderer guard.
- Measure the expanded content at 546,411 bytes (+1.81%) and set its subscription budget to 534 KiB.

### Pomace compost

- Handcraft four Pomace and one Fiber into Compost. Select it and use F or the primary pointer action on a growing crop to advance its growth by 25%, once per planting.
- Record one lifetime `compost_applied` statistic per successful treatment for future quest/milestone connections, with no treatment XP.
- Settle elapsed growth before treatment, cap progress at maturity, and keep failed, unauthorized or repeated applications free of inventory changes. The new crop marker defaults to false for existing plantings.

## 0.8.5

### Unified action baseline tooling

- Begin P0 with a generated inventory of every live bootstrap item variant, current action owner, lifecycle triggers and numeric authored values. Add `actions:baseline -- --check|--write` and make drift a normal test failure.
- Add current-main geometry and bow charge goldens for the future tool/spell migration, plus ownership validation tests.
- Record the repair cursor/escrow requirements, pending gameplay PRs and remaining P0 audits in [the implementation handoff](https://wiki.orchard.dastari.net/Roadmap/Unified%20Actions%20%26%20Repair%20UI). This slice does not enable the new action system or repair UI.

### Hoe and swimming fish fixes

- Route F with a hoe to tilling, crop uprooting, or soil restoration instead of
  an entity-only swing. Both the swing and direct-use shortcuts yield to the
  farming action; damaged tools still repair at a faced anvil.
- Draw fishing pools with the fish sprite’s `sway` animation. The earlier art
  lookup fix found the correct sheet but requested its nonexistent `base` frame,
  leaving randomly spawned pools invisible. Depleted pools remain hidden.

## 0.8.4 — Anvil repair release

- Repair tools at an anvil again. Since the facing-swing change, F swung any tool
  with an authored swing, which is every pickaxe, axe and hoe, before the anvil
  branch could run. A damaged tool faced at an anvil now repairs; an undamaged
  one, or one facing anything else, still swings.
- Increase the measured content payload budget to 525 KiB for the existing heavy-station carry definitions.

## 0.8.3

- Carry placed barrels, fermentation casks, fruit presses, furnaces and anvils
  again. The content pack authored no carry policy for them, so F did nothing and
  the authority answered "not carryable". Each is now a heavy station: it is
  carried in both hands as the same world entity, contents and all, and never
  enters the inventory. Faced heavy stations show a `[F] CARRY` hint.
- Climb the cellar ladder from the tile directly below its bottom rung. The
  ladder art is drawn from its foot, so it stood three floor rows above the
  climb tile; the exit portal and the trapdoor arrival now sit on the chamber's
  first two floor rows and existing homesteads are repaired on connect.

- Repair mining after the facing-swing change. A pick swing measured a resource's
  contact point from the feet while the point itself is authored at chest height,
  which cost an upward swing more than half its reach; and the swing key returned
  before the cellar-wall strike it cannot perform, so cellar walls could not be
  mined with F at all. Swing reach and arc are unchanged.
- Draw fishing pools from their authored nature artwork again. A resource whose
  visual names a decoration family resolved to no atlas entry and rendered the
  placeholder "?" tile.
- Rain now waters crops. While a shower runs, every crop tile in an open-air space
  — the island and every homestead, never a residence or cellar — is topped up on
  the weather sweep, with growth settled first so no progress is lost. Tilled soil
  without a crop keeps its own decay timer.
- Climb a cellar ladder only from the tile at its foot while facing it. The prompt
  no longer reaches sideways or diagonally past nearby objects, and the reducer
  enforces the same tile and facing.
- Count a placed anvil as the crafting station its recipes require. Anvil recipes
  such as the watch reported "REQUIRES AN ANVIL WITHIN 2 TILES" even while the
  player stood against one, because a placed anvil reported no station at all.

- Draw fishing pools from their authored nature artwork again. A resource whose
  visual names a decoration family resolved to no atlas entry and rendered the
  placeholder "?" tile.
- Rain now waters crops. While a shower runs, every crop tile in an open-air space
  — the island and every homestead, never a residence or cellar — is topped up on
  the weather sweep, with growth settled first so no progress is lost. Tilled soil
  without a crop keeps its own decay timer.
- Climb a cellar ladder only from the tile at its foot while facing it. The prompt
  no longer reaches sideways or diagonally past nearby objects, and the reducer
  enforces the same tile and facing.
- Count a placed anvil as the crafting station its recipes require. Anvil recipes
  such as the watch reported "REQUIRES AN ANVIL WITHIN 2 TILES" even while the
  player stood against one, because a placed anvil reported no station at all.

## 0.8.2

- Add a hammer button above the crafting spanner to toggle the build menu without a
  keyboard. Move the weapon shortcut above it to keep touch targets separate.

- Account for the published content hash in village-order quote verification while
  still checking every price, quantity, receipt and player-state field.

- Keep first world connection, subscription hydration and initial retries in the
  normal gateway loading window. Show Reconnecting only after an entered world
  loses its connection; retain update, offline and sign-in recovery actions.

## 0.8.1

- Correct horse/boat interaction reach from 32 tiles to 2, horse dismount distance
  from 18 tiles to 1.125, and horse wander radius/speed to their original units.
- Prioritize dismounting on E while mounted, including beside homestead entrances,
  and use authored mount reach consistently in client targeting and server checks.
- Resolve wildlife and enemy action targets through their active creature/enemy
  definitions so valid sword/axe targets no longer fail as missing NPC definitions.
- Interpolate NPC/mob positions between rendered frames using the same frame
  fraction as the camera and players.
- Swing axes, swords, picks and hoes in the player's facing direction without a
  selected target. Hit every contact in the authored arc; spend stamina once and
  apply durability wear per contact, completing the swing before a tool breaks.
- Use a shorter, narrower pick arc. Preserve mining tiers, ownership and loot
  rules; left-click retains explicit cellar excavation and farming operations.
- Show a single-line tool name immediately, then detailed information after a
  short hover in a bounded panel above the hotbar, including current durability.
- Publish corrected NPC/item content and generated lifecycles with the module/client update.
  No stored schema changes; existing player and horse positions are preserved.

## 0.8.0

- Regenerate world client bindings for the five existing legacy-farm admin endpoints
  so the guarded release can verify exact module/client API parity.

- Mature apple, pear, peach and cherry tree harvests can drop a matching plantable
  seed (5% base chance). Orchard Seed Saver adds 10 percentage points per rank,
  reaching 35% at rank three. Plant on clear grass or tilled soil in the homestead or
  overworld; the matching sapling grows and regrows normally. Tilling is optional.
- Advance the fruit-tree harvest ordinal for fresh rolls after regrowth and
  preserve player-planted trees during generated-world reconciliation.
- Publish module, resource/item/skill content and generated lifecycle artifacts
  together. No database schema migration.

## 0.7.1

- Narrow the cellar wall ladder's interaction reach to the tile column in front of it.
  The ladder no longer claims the prompt from chests, crops or furniture placed a tile
  to either side. Prompt and authority share one reach contract.

- Run exhaustive procedural-terrain and survival-world suites without coverage
  profiling as part of `npm test`; retain every test and enforce unchanged source
  coverage thresholds in the remaining suites.

- Remove repeated world-module parsing from the cooking release gate and avoid
  parsing files without protected table names; retain mutation checks and test deadlines.

- Allow authorized content editors to repair verified historical packs before gameplay initialization; preserve strict publication results and isolate recovery disconnects.

- Preserve rotated release credentials through signing-key outages while withholding unverified identity tokens.

- Repair hosted CI prerequisites, dry-run portability and portable Keccak hashing;
  retain local licensed-art checks and pin reviewed imports for public CI.

- Allow verified historical content to be read during upgrades while strictly
  validating the candidate and preserving conflict checks and live-only content.
- Explain incompatible game content instead of labeling it a reconnect failure.
- Restore Sort & Stack for both chest and backpack panes in authored chest windows.
- Add shared chest inventory search by item name or ID, preserving physical slot
  routing for filtered items. Search stays above the hotbar when resized.

## 0.7.0

- Mining payout and depletion XP now goes to Farming, matching its skill branch.
  Historical XP is preserved. Integration review and validation: [PR #6](https://github.com/Dastari/orchard-cellar/pull/6).

- Efficient Strikes now improves cave-wall excavation as well as ore-node mining.
  Fresh walls take 5–6 / 4–5 / 3 hits at ranks 0 / 1 / 2. Mixed-rank contributions
  and existing partial wall progress are preserved.
- Rockhound applies the same authored bonus-fragment roll to ordinary rocks,
  basalt and completed cave walls. Mother Lode also rewards eligible rich pure
  cinder and emberglass veins without replacing their primary material payout.
- Silver Pickaxe durability is 1,500, twice Iron Pickaxe. Its other stats and full
  repair cost (one Silver Bar plus five bronze) are unchanged.
- The private cellar_dig_progress table gains an appended default-zero work
  column. Release module and content together; no production deployment is part
  of this PR. Existing Silver tools gain the new maximum on repair.

### Harvest and cellar repairs

- Estate barrel/vintage upgrades apply in the cellar and residence, with an
  accessible upgrade menu in all home spaces.
- Clarify preserving barrels versus fermentation casks; preserve existing IDs,
  inventory and recipes.
- Implement Green Thumb, Seed Saver, Bountiful Harvest, Tender Hand, Soil
  Whisperer, Barreling, Master Grower and Harvest Festival. Enable the existing
  Sprinkler Engineering and Greenhouse Charter unlocks with prerequisite checks.
- Keep visitor growth/timing displays aligned with the active estate's skills
  and upgrades. Fix preserving timing when inputs occupy a nonzero slot.
- Add deterministic probability, daily boundary, authority, input restriction,
  processor and UI regression coverage.
