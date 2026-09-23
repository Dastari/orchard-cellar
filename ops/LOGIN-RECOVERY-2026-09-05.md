# Login recovery: 2026-09-05

At incident onset, production authentication succeeded, but the served game stopped
at “The ferry could not dock” because `LiveContentRegistry` reported
`content_hash_mismatch`. The signed-in browser received the original character
profile, survival row, inventory slots, known recipes and quests before that failure.
No production database or content writes were performed during diagnosis.
The guarded forward release has since completed; browser gameplay acceptance is
still in progress and is not certified by the deployment result.

## Cause and source repair

The captured pre-release content head was revision 1, engine version 1, with 459 definitions and
durable hash `ba28da55`. The original public content payloads recovered from the
retained backup reproduce that hash. The exact served parser adds `onUse: []` to
159 item definitions and produces normalized registry hash `98c13e41`. Comparing
that runtime projection hash to the saved head incorrectly rejects unchanged
production content.

`contentDefinitionRowsHash` verifies canonical original JSON before parser
defaults, while `buildContentRegistry` independently validates and projects its
semantics. The client still checks engine version, definition count, schema,
references, and identities; tampered unknown fields also change the durable hash.
The repair also applies this contract to authority cache validation and release
capture verification. Content publication preserves untouched durable rows and
hashes the rows it actually persists. The historical fixture at
`packages/sim/src/content/fixtures/stage-a-content-459.json` must not be
regenerated with the current bootstrap pack.

Focused client, simulation, authority cache/publication, and release capture tests
pass, including adoption of the historical payloads, cache restoration, and
rejection of corruption. This evidence does not mean that every migration or
repository release gate is complete.

## Retained frontend recovery candidate

The retained backup is
`/home/toby/backups/orchard/20260904T054800Z-interaction-hotfix`.
Its rollback bundle records capture time `2026-09-04T06:35:29Z`. Both outer
rollback checksums and all 653 extracted file checksums pass. The archived
frontend's own parser produces exactly 459 definitions with hash `ba28da55`.
Its 85 bound table/view schemas match the live database, including wire field
order and recursive types. All 157 archived reducer bindings also match live
names and positional parameter types, and all 14 archived procedure signatures
match. Its compiled chunk boundary check passes.

The candidate entry is `/assets/index-DgJf6Hi_.js`; its `index.html` SHA-256 is
`5f934f8f17dc101c503898f895dcf857249d71a81d2aca194c0a63a253c6ff98`.
The retained frontend was not installed; its inspection did not establish
authenticated gameplay acceptance.

The signed-in browser retains a private before-recovery snapshot in session
storage for comparison after refresh. It covers identity, character profile,
position, equipment, inventory, recipes, quests, and skills. Its SHA-256 is
`5de95a7842bd715c8ff7369ada0b6a1bdf70ca9ee36e67bddd3b2045d7f02a63`.
No credential is included, and the private row payload was not printed or copied
into the repository.

## Forward recovery and release status

The retained frontend was inspected but was not restored. The user chose forward
migration. Repairing the durable hash check alone was insufficient: the incident
frontend's reducer bindings also disagreed with the old live module (`use_selected`
had 12 client arguments versus 7 server arguments; `harvest_crop_tile` was absent
on the old module). The guarded release therefore published matching client,
world module and content-head artifacts together.

The latest 2026-09-05 Tier-B decision requires the owner's chat approval for the
specific release, following repository checks and a short description of the live
change. The former owner-confirmation record, digest approval environment gate,
candidate spool, handoff CLI and loopback build service are removed. Build hashes
remain integrity evidence. The policy decision did not itself approve a release.
The owner subsequently gave “Go” for the specific forward deployment completed
below; continuity, backup and rehearsal gates still ran before publication.

Earlier, the global legacy cooking-job count failed with
`authentication_invalid_issuer` for the existing database-owner CLI credential.
Zero outstanding jobs was never established. That empty-table release requirement
is now superseded by the implemented in-place escrow claim migration described
below. Neither the historical authentication failure nor the new compatibility
gate implies that production has zero jobs.

The saved owner OIDC session initially failed refresh with HTTP 400. The owner
subsequently signed back in; the renewed refresh-capable credential passes the
guarded authentication preflight. The live content head was captured privately
for independent merge review, and the guarded release subsequently completed.

Client and Studio `dist` directories are served by production preview processes.
Validation builds must use isolated output directories until the controlled
release. This release completed repository gates, specific owner chat approval,
fresh backup/capture, restore rehearsal, no-delete/merge checks and server-side
parity before reopening the services. Browser gameplay acceptance remains separate.

## Repository verification after chat-approval removal, before cooking recovery

All seven requested typechecks pass. Lifecycle integrity and content validation
pass (revision 10, 89 callbacks, 70 reviewed-inert items; 484 content definitions).
The full repository run passes 3,019 tests in 519 files; lint and diff checks pass.
Client and Studio builds succeeded in isolated `/tmp` directories, and the checked
SpacetimeDB build succeeds without the earlier circular-dependency warning.
Acceptance-manifest source lines were recomputed and its tests pass.

The cooking-count rejection originated in the pre-release module's connection policy:
both the private job count and a public clock query returned the same issuer error.
SpacetimeDB 2.8.2 runs `client_connected` before SQL authorization, so database
ownership does not bypass the required production OIDC issuer. The unchanged
restore module has the same boundary. No supported existing offline count or
compatible owner credential was established. Do not weaken production account
authorization or infer zero from this failure. At that point, a diagnostic or
preserved job-completion migration was still needed. The subsequent in-place
migration below addresses job accessibility without bypassing account authorization
or requiring a private global scan.

## Deployed cooking recovery; gameplay acceptance in progress

The original private `player_cooking_job` schema and rows remain ingredient escrow.
No bulk conversion, deletion, recipe recomputation or connection-time migration is
performed. New cooking continues through generic processors. Authored frame
`onInvoke` callbacks dispatch a bounded `claimProcessJob` effect for the caller's
saved batch. Collection uses its exact output, quantity and ready tick, validates
the original lit/reachable station, and preserves archived farming progression.
Inventory cancellation returns its exact input even after moving away or losing
the fire. Full-inventory failure leaves escrow untouched; a successful grant,
resolution receipt and escrow removal form one transaction, preventing duplicate
collection. The original landmark fire's numeric ID, location and placeable alias
are preserved.

Independent review also found and fixed inventory edge cases: claimed food now
uses canonical durable `lit` metadata so it can merge with existing compatible
food stacks. Merge headroom is clamped to zero for existing stacks above a newly
lowered authored maximum; those over-cap rows remain intact instead of producing
negative transfer quantities. Regression fixtures cover both cases and atomic
no-loss failure.

The cooking compatibility command passes its source/capability and runtime
fixture checks. It verifies retained escrow and receipt schemas, the authorized
claim path, recovery callbacks and historical landmark mapping. Prospective merged
content heads must also preserve recovery, saved item kinds and historical
progression, so a live content override cannot silently remove those promises.
Authenticated `ownCookingJob` rejoin snapshots retain every original job field,
including both timestamps. The gate does not inventory private production rows
or certify global zero. Escrow retirement remains a separate operation requiring
verified zero remaining jobs.

The final repository run for this change passes 3,050 tests in 523 files. All seven
typechecks, lifecycle integrity, validation of 484 content definitions, checked
world build, isolated client/Studio builds and lint pass. The requested focused
suites pass 82 tests in 18 files; the cooking gate passes 21 tests in four files.
All 50 acceptance-manifest source references were recomputed against their actual
paragraphs and its six tests pass. The earlier totals above describe the preceding
repository checkpoint. Fresh verified backup, restored-state rehearsal and
automated same-identity production parity subsequently passed as recorded below.
Interactive gameplay acceptance remains in progress.

The final coverage run also passed all 3,050 tests in 523 files: statements 88.19%,
branches 81.41%, functions 92.65% and lines 92.2%. A preceding engine test-fixture
typecheck failure was corrected in that fixture; the broad typecheck then passed.

## Guarded release evidence

The existing guarded release script completed successfully at approximately
12:17 Australia/Hobart on 2026-09-05. It took and verified the fresh 6.5 GB backup
at `/home/toby/backups/orchard/20260905T015400Z-cooking-lifecycle`, including its
rollback artifacts. The isolated restore rehearsed both chest migration stages
and passed rejoin comparisons across 38 tables for the authenticated identity.
Production publication used `--delete-data=never`, applied the independently
reviewed content candidate and passed its own 38-table parity comparison.

The deployed content head is revision 2, engine version 1, with 484 definitions
and durable hash `fa1a3fc3`: 184 existing definitions updated, 25 added, 275 left
untouched, zero deleted and no merge conflicts. Production remains at verified
`placeable_reads`, retaining all 11 legacy chests, 176 legacy slots and 11 mappings.
The isolated rehearsal drain was not performed in production. Do not finalize or
remove chest compatibility before the separate retirement and gameplay gates pass.

Both public sites returned HTTP 200 and all three production services were active
after release. Same-identity browser login and reconnect subsequently passed,
preserving the original character, position, inventory, recipes, quests and skills.
Two simultaneous clients observed matching state. The owner confirmed gameplay
worked. The crafting layout fix was then verified in the live browser. Original
chest/processor operation, recipe-book use and sustained reducer/CPU health still
need their separate acceptance evidence. Remaining authority debt in
The runtime authority audit (now summarised on [History/Audits](https://wiki.orchard.dastari.net/History/Audits)) is unchanged.

Evidence remains on disk; private snapshot contents and credentials are not copied
into this document. SHA-256 references:

| Artifact | SHA-256 |
| --- | --- |
| `/home/toby/.local/state/orchard-release-20260905/release-attempt-2.log` | `d3d10209478f24fef72e8c469468fa74dd42e5bca2abc481d2b824dfc8e4f362` |
| `/home/toby/.local/state/orchard-release-20260905/live-content-head.json` | `4e7942b942e53ed8b7eb36baa174da2f0cde8a8e6439f0a85a00588e1920dae7` |
| `/home/toby/.local/state/orchard-release-20260905/content-candidate.json` | `72e093de126ef1123c3b8534078f784d4a60bd5385d10d9e1e6b0b6820ccc4ad` |
| `/home/toby/.local/state/orchard-release-20260905/production-pre-drain.json` | `450db8c48be9542843f3c741bbf9de95a66897a1650e90a06075b2108fc5b0af` |
| Backup `spacetime-data.tar.gz`, recorded in `SHA256SUMS` | `c87965de19428a274223feddf6428e465826073c305517328a9c33461d27d485` |
| Backup `rollback-artifacts.tar.gz`, recorded in `ROLLBACK-SHA256SUMS` | `95254608c4962e35cdd439d5dab0754928b8a8d87f5c00f6f0299d8681f29dfd` |

The backup also retains `DEPLOYED-PROGRAMS.sha256` and the three
`chest-migration-{rehearsal-pre-drain,rehearsal-post-drain,production-pre-drain}.jsonl`
logs. The private release directory retains `pre-drain-expected.json` and
`post-drain-expected.json` for the restored-state comparisons.

## Routine fixes and migration-gate stop

The selling/cache candidate passed all 3,058 tests in 523 files with coverage
(statements 88.2%, branches 81.42%, functions 92.65%, lines 92.2%). Two earlier
metadata-only Studio tests timed out because they repeatedly compiled the full
island; their small fixtures now preserve every assertion while the separate
full-island tests remain unchanged. An expired release credential was renewed
through the existing owner browser sign-in.

The full migration rehearsal then stopped with `chest_migration_active_custody`:
the saved world retained one active legacy chest session and one active generic
session. The same-schema module update itself succeeded only on the isolated
restore. No production module or content publication occurred. The unchanged
authority restarted, and both prior static builds were restored from verified
rollback artifacts; both sites returned 200 at 13:26 Australia/Hobart.

The verified backup is
`/home/toby/backups/orchard/20260905T024300Z-selling-cache`. Failure and restoration
evidence is retained in
`/home/toby/.local/state/orchard-selling-release-20260905/release-attempt-3.log`
and its `static-recovery` directory. No chest session, chest row or container
contents were removed to make the migration gate pass.

The owner subsequently assigned host backups to Proxmox and waived fresh
application backups for routine updates. The new routine release path rejects
any full private schema change, retains exact live module/static rollback bytes,
and compares same-identity state without invoking chest migration or retirement.
The routine deployment completed successfully. All 3,077 tests in 527 files,
workspace and release typechecks, lint, lifecycle integrity, content validation,
checked world build, and both static builds passed. The complete private/public
schema matched the actual deployed module. The guarded non-destructive publish
installed module `b41b1526493e209ba7a84838709f0aa6a771d966e438815e17be05c7e36dbf65`
and content revision 3, hash `bcedc3e3` (484 definitions, two upserts, zero deletes).
The authored changes are the string icon and workbench presentation scale;
server fixes cover expanded-backpack selling, canonical stack metadata, removal
of recurring starter-arrow backfill, and lazy registry row enumeration.

Same-identity parity passed across all 38 captured tables, allowing only the
reviewed content-head update. Both canonical sites passed exact static checks.
The owner reconnected in the browser with their existing inventory. A subsequent
sale attempt correctly returned `npc_out_of_range` because the character had
moved away from Marlow; that attempt changed no items or wallet. A successful
post-fix sale through the live UI still needs an in-range check.

Evidence: `/home/toby/.local/state/orchard-live-fixes-20260905/deployment-2.log`
and its `deployment-2` directory, including exact live code/static rollback bytes,
schema comparisons, source pins, and rejoin snapshots. The post-release read-only
sample measured 24.6% of one CPU core and 19.28 authority ticks/second, compared
with 96% and 13.86 before the cache fix, despite a larger active workload.
No legacy chest compatibility was drained or retired.

## Version 0.2.4 routine release

The guarded 0.2.4 deployment completed successfully. All 3,093 tests in 529 files,
workspace and release typechecks, lint, lifecycle integrity, validation of 484
content definitions, the checked world build, and client/Studio static builds
passed. Complete private and public schema comparisons matched the actual prior
live module. Same-identity parity passed across all 38 captured tables with only
the exact reviewed content-head adjustment permitted.

The live content head is revision 4, hash `1fd79ee9`, with 484 definitions. The
candidate applied one sword Vigour-cost upsert and zero deletes. The published
module's Keccak-256 hash is
`36ea36e65ec971a67594b3be551d43d16a613962503b1e6dfe110c930491fe4c`.
The original database identity remains
`c200af6ca3e4663bde9be65c18114d5d296f4b811bf0fa35d3771f8fdba89c21`.
No chest migration, custody cleanup, stored-schema conversion or retirement ran.

The successful log is
`/home/toby/.local/state/orchard-024-20260905/deployment-2.log`, SHA-256
`9d3bc888aa111b0578805bbdcab1b56149b835e795d0f93d8ab443ea2b81d740`.
Its sibling `deployment-2` evidence directory records status `deployed` and retains
verified prior module/static rollback files, source pins, full schema comparisons,
`live-program-after.json`, and the before/expected/after rejoin snapshots.

Both simultaneous browser tabs connected with content ready at revision 4 and
loaded the deployed `index-C8AkI4wo.js`. Their normalized identity, 48 inventory
rows, wallet, quests, skill tracks/nodes, known recipes and cooking job matched
exactly, SHA-256
`bca76365e65298e83076b43ab512a8b62286de2e1e7f176d9eb6c1763ece1a2e`.
Crafting alignment and nameplate preference persistence across reload were
confirmed earlier. The actual update prompt displayed the native default cursor.
A real Refresh Now click in tab 5 changed navigation `performance.timeOrigin`
from `1788581973855.5` to `1788582020190` and reconnected without F5. A separate
presentation-only prompt over inventory, using an `applyUpdate` spy, dispatched
exactly one refresh and left the inventory window unchanged; all temporary fields
were restored. These observations do not claim a successful live sale or the
remaining original chest/processor contents, quest completion, recipe-book
behavior and sustained multi-client/load acceptance checks.

## Version 0.2.5 publication and parity stop

The guarded 0.2.5 candidate passed all 3,113 tests in 530 files, workspace and
release typechecks, lint, lifecycle integrity, content validation, the checked
world build, and both static builds. Complete public/private schema comparisons
matched the previously deployed module. Publication installed module
`7df486cf57fde9c5bf5d66a9961a82e4b3c1b6fcd7ed2fc2528dd2c2ff37130a`
and content revision 5, hash `8d549120`, with 484 definitions. Exactly two
upserts changed furnace fuel admission to use the active process policies and
removed its conflicting object-level fuel tag restriction; no definitions were
deleted. The authority also makes completed fishing reels idempotent, while the
client avoids repeating pending or acknowledged reels. No stored-schema change,
chest migration, custody cleanup or legacy retirement ran.

The release stopped web traffic after publication because its strict comparison
found one change: owner Vigour increased from 966 to 3966. All other fields in
all 38 captured tables matched the expected published state. Independent review
found the gain consistent with normal regeneration; the normalized snapshots
omit the regeneration cursor, so exact historical elapsed ticks cannot be
reconstructed. The original failed comparison remains intact.

A fresh same-identity capture and reconnect verification passed the unchanged
strict comparator across all 38 tables, with Vigour at its normal cap of 10000.
Relative to the original expected snapshot, only Vigour and the stored action
changed: `swing_pickaxe` became `none`, consistent with presence-expiry cleanup.
Coordinates, action start time, equipment and all other fields remained exact.
The root agent reviewed these two specific changes using independent agent evidence. A private verifier pins
the original artifacts and permits only those exact field transitions; it
rejects unrelated stat, position or action changes. This does not weaken the
repository comparator or claim every original gameplay acceptance scenario.

Evidence is retained under
`/home/toby/.local/state/orchard-025-20260905/deployment-2`, including original
`rejoin-{before,expected,after}.json`, the strict fresh
`recovery-rejoin-{before,after}.json` pair, and the independent
`transient-parity-review.json` receipt. The original guarded run is recorded in
`/home/toby/.local/state/orchard-025-20260905/deployment-2.log`.

The separate offline/update UI correction passed 111 focused checks, client
typecheck, lint, its isolated static build and reachable-asset verification.
Static recovery then completed: both canonical sites passed exact HTML and chunk
checks, and the world, client and Studio services were active. Final fresh
reconnect parity passed all 38 tables; live module, content-head and world-source
pins were rechecked. The published world source and schemas remained unchanged
by this frontend correction. Recovery evidence is retained in the sibling
`static-recovery-corrected-ui` directory, whose status is
`corrected-ui-static-recovery-complete`. The installed client manifest SHA-256 is
`56feef41dbbae180d8a5978a88cbc7bb2a09b517b6864b0778f519444ad791a3`.
The shared browser still running 0.2.4 reproduced the original failure during an
actual update arrival: the worker was waiting, update status was available and
the native cursor was correct, but the disconnected canvas stayed frozen without
its modal. The screenshot was taken before any manual render. Activating that
waiting worker and navigating once loaded the corrected 0.2.5
`index-BcFAHEU7.js`. The same Dastari identity reconnected with no connection
error, content ready at revision 5/hash `8d549120`, 48 inventory rows and Vigour
10000. Already-loaded old code requires one reload to acquire this repair; that
reload is complete in the shared browser.

A controlled presentation-only check on the new build temporarily supplied a
disconnected network view and available/activated update state. The actual render
path drew the modal over the retained world with the native default cursor. A
real preview click at `(657, 616)` invoked the `applyUpdate` spy exactly once;
16 overlay paints were observed. All overrides and update state were restored,
and the connection remained healthy. This verifies rendering and click routing;
it does not claim a new live server disconnect or a real waiting-worker arrival
on 0.2.5. Integration tests cover waiting-worker activation and reload.

Live furnace fueling, fishing completion, successful in-range selling, original
processor contents/progress, quests, recipe-book behavior and sustained
multi-client gameplay acceptance remain separate checks.

Detailed browser evidence is retained in
`/home/toby/.local/state/orchard-025-20260905/static-recovery-corrected-ui/browser-acceptance.json`.
The subsequent read-only sample measured 21.0% of one CPU core and 19.486 authority
ticks/second, with no errors observed in the 120-second log window.

## Version 0.2.6 client walking performance release

The client-only 0.2.6 update is deployed. All 3,122 tests in 531 files, lint,
client/engine/UI/Studio typechecks, the checked world build, and the isolated
client production build passed. The checked world build was validation only:
no world module or content was published, and Studio continues serving its
0.2.5 artifact. Installation verified unchanged live module, content head and
Studio bytes, retained prior client assets and rollback files, and checked exact
canonical HTML, worker and reachable chunks. Evidence is under
`/home/toby/.local/state/orchard-026-20260905`, including `root-release-review.json`,
`client-staged/checks.json` and `client-install`; full test/lint/world-build logs
are in `/home/toby/.local/state/orchard-026-walking-20260905`.

The repair reuses unchanged terrain work and smooths reconciliation continuously.
A repeated Node workload covering ground/water/projectile masks and terrain light
classification on an 832-by-832 island with 1,309 regional resources improved
from 51.02 ms to 1.97 ms median. It includes fresh dynamic obstacles but excludes
dynamic light trunks, Canvas/GPU rendering and network work; these figures are
not browser frame times or an overall FPS claim.

The actual waiting-worker update prompt appeared automatically in the 0.2.5
shared browser. A real Refresh Now click at `(657, 616)` reloaded it, changing
navigation time origin from `1788584434993.6` to `1788585546880.3`, and loaded
`index-CEm2Katl.js`. The same Dastari identity reconnected with no connection
error and content ready. The user confirmed that the slight walking jitter/delay
was fixed. This browser result supplements the scoped benchmark; the remaining
original gameplay acceptance scenarios are unchanged.

## Version 0.3.0 authored resource discovery release

The guarded 0.3.0 world, client and Studio release is deployed. Attempt 1 stopped
before publication because five native skill icons were missing; after their
repair, attempt 2 passed all 3,165 tests in 535 files, lint, every workspace and
release typecheck, and checked world/client/Studio builds. The complete private
and public schemas are unchanged. The sole `skill_tree:farming` upsert adds five
discovery nodes and two connecting edges, preserving the other 483 definition
payloads and all 484 IDs with zero deletes. Live content is revision 6, hash
`9d5ace3c`, with 65 skill nodes.

Evidence is under `/home/toby/.local/state/orchard-030-discovery-20260905`.
The reviewed `content-candidate.json` SHA-256 is
`136514d4930bd8de914dd86f3dc51797ba2a534c9bf19bb317d7b81fb369712f`.
Published module Keccak-256 is
`8de4143e65b51f172c5147e678b2a6e7bff5858534ee711120ba23d54b15f3d4`.
`deployment-2/independent-release-review.json`, SHA-256
`495a2c5df222481aebc9f43bc5cb0aa6ca352e02e1b83895b8cc12461d0a9f08`,
independently verifies schema equality, exact original rollback bytes, database
identity, prepublication module checks and published candidate equality. Its
strict reconnect comparison reports zero differences across 38 tables for the
same owner identity, with only the reviewed content-head change applied to the
expected snapshot. No transient-field exception was needed. Original module,
client and Studio rollback artifacts remain in `deployment-2/rollback`; canonical
HTML and reachable static artifacts passed validation for both sites.

In the shared browser, a real Refresh Now click at `(657, 616)` loaded
`index-DmtcITOL.js` with navigation time origin `1788587506969.1`. The same Dastari
identity connected with no error and content ready, showing all five new nodes
and 48 inventory rows. It initially owned none of the new ranks. Agents did not
purchase or reset skills; positive live ore overlays, distant hover and minimap
markers remain unverified, alongside the previously listed legacy gameplay
acceptance scenarios. The user-confirmed walking repair remains recorded above.

A five-second post-release read-only sample measured 14.6% of one CPU core.
The 120-second log window contained zero errors and a tick p95 of 18.344 ms;
that window spans the deployment gap and does not establish a steady tick rate.


## Version 0.4.0 material tools and mobile controls release

The guarded 0.4.0 world, client and Studio release is deployed. Deployment 2
passed all 3,203 tests in 542 files, every workspace/release typecheck, lint,
content validation, lifecycle integrity, validation of 1,020 assets, and the
checked SpacetimeDB module plus both frontend builds. Public and private schema
bindings match their pre-release captures byte for byte. No-delete publication
applied 53 upserts and zero deletes, retained all 484 prior content IDs, and
installed 531 definitions at content revision 7/hash `8cfe4746`. The pack has
181 items, 61 recipes and 37 processes; lifecycle revision 11 partitions them
into 109 callback-owned items and 72 reviewed-inert items, with source SHA-256
`3b9cd7a8dd00e1c92a1dc5a27164f89886b962b59fb0fe58933110453997b57f`.

Evidence is retained under
`/home/toby/.local/state/orchard-040-tools-20260905/deployment-2`.
Published module Keccak-256 is
`76697414537df61f97de56b6b3a1ff9a0dc8406100b1dd1e95c9dfc086b8051f`.
The independent final review is `independent-review-final.json`, SHA-256
`6e875f6155285f098006cda4c69af6d75dff40aca44b3e194faf51548f1003d4`;
the release log SHA-256 is
`413afaf3b9a55a17b3dbdd89cbde468e83ce9e95e924975de5d20fec2e446a9d`.
The same owner identity passed exact 38-table expected/after reconnect parity;
before/after differs only by the reviewed content head, with the other 37 tables
and identity unchanged. Original module/static rollback bytes, installed static
artifacts and retained prior asset URLs were verified. Both canonical sites
returned 200 and all three services were active. The separate
`art-mobile-independent-review.json` in the parent evidence directory records
presentation/input review and its specific runtime-test limits.

Hoe targeting, its visual range and authority share the same tile centre and
authored two-tile reach. Authored recipes cover 24 axe/hoe/pickaxe/shovel and
material combinations while retaining old item IDs and stored wear. Copper has
wooden durability and iron mining capabilities; gold has wooden mining
capabilities. The wood/stone/copper/gold/silver/iron durability multipliers
1/1.5/1/2/2.5/3 are provisional implementation defaults; the silver balance
question remains unanswered. Iron's primary payout is preserved alongside an
authored 10% secondary silver-ore chance and a new silver smelting process.
Shovels retain their repair-only lifecycle and have no new digging action.
Mobile input separates taps, two-finger pinch zoom and 250 ms long-press ownership,
preserves bow holds, excludes UI/joystick touches from pinch recognition, and
rechecks chat/modal ownership before deferred actions. Movement/action side
swapping and bottom offset persist as browser/device preferences.

Art provenance is reproducible. The exact four built-in ImageGen prompts are in
`references/generated/tool-progression/prompts.json`; their retained outputs are
`wood-axe.png`, `wood-shovel.png`, `wood-hoe.png` and `wood-pickaxe.png` in the
same directory, each 1254×1254. Each prompt requests one transparent wooden tool
on a logical 16×16 grid, warm brown/tan colours, clear padding and no outer black
or white outline. These are concept sources; the actual native game icons are
16×16. `packages/tools/src/build-tool-progression-art.ts` samples the wooden
silhouettes, applies explicit head masks and material palettes, and writes the
24 `art/custom/tool-progression/icon_tool_{material}_{tool}.png` sources with
matching `packages/assets/ui/*.sprite.json` definitions. The 18
`tool_{material}_{axe|hoe|pickaxe}.png` swing sheets preserve licensed Kenmi
geometry: each is 64×1152, containing eighteen 64×64 frames. Matching character
assets are in `packages/assets/characters/`. `item_silver_ore.png` and
`item_silver_bar.png` are native 16×16 palette derivatives with definitions in
`packages/assets/props/`. `CREDITS.md` and `art/custom/README.md` record ownership
and derivation. The completed item-icon audit resolved 181 active items to 150
icons: 143 source-backed icons across 63 sources and seven native icons, with no
outlined source variant remaining. Legacy hammer/shovel now use plain originals;
the fishing rod's white halo was removed without changing rod/line pixels.

The actual waiting-worker prompt on 0.3.0 accepted a real Refresh Now click at
`(657, 616)`, loading `index-C0Vu-_QU.js` with navigation time origin
`1788589819396.3`. The same Dastari identity reconnected with no error, content
ready at revision 7/hash `8cfe4746`, and 48 inventory rows. A mobile preview preset
changed the shared browser to 514×1110 CSS pixels; this is not a real-phone
hardware test. Real Controls interactions persisted swapped sides and a bottom
offset of 60; restoration of defaults is a separate follow-up. Pinch and
long-press behavior are covered by automated input tests, with no real-phone
gesture acceptance claimed. The user reported that the deployed wooden icons
appear as thin diagonal sticks with indistinct heads at inventory scale; a
separate art correction is being prepared. The icon provenance and integrity
audit above does not imply visual acceptance.

A five-second read-only post-release sample measured 6.8% of one CPU core.
The 120-second log window had zero errors and tick p95 14.629 ms; the window spans
the publication gap and does not establish a steady tick-rate baseline. The
previously listed processor contents/progress, quests, recipe-book behavior,
positive discovery overlays and sustained multi-client gameplay acceptance remain
separate obligations. Broad Studio styling remains deferred.


## Version 0.4.1 approved tool-icon correction (deployed)

The owner approved all 24 icons in the inventory-scale preview
`references/generated/tool-progression/review-v2/shovel-redraw-inventory-preview.png`
and requested replacing the existing tools. The selected native 16×16 axe, hoe
and pickaxe geometry derives from licensed Kenmi No Outline art; the shovel is
an original project-authored pixel drawing. `classic-geometry.json` supplies the
three retained tool families, `shovel-redraw.json` supplies the new shovel and
`shovel-redraw-palettes.json` records the approved six material palettes and
wooden handle colours. `alternative-geometry.json` and the earlier classic
shovel remain unselected comparison artifacts.

The 0.4.0 generated wooden concepts and prompts remain historical provenance;
their sampled silhouettes are superseded by this approved native geometry. The
installed 0.4.1 frontend-only release replaces existing icon assets with their
IDs intact, leaving the world module, content head, gameplay definitions and
swing animations unchanged.

Evidence is retained in `/home/toby/.local/state/orchard-041-tools-20260905`.
`repository-checks.json` records the 1,020-asset build/validation, unchanged
531-definition content hash and lifecycle source digest, tools/client/UI/engine
typechecks, full repository lint and diff checks. Focused checks passed 60 tests
in seven files, followed by 33 engine/fruit-press tests in two files; the full
repository test suite was not repeated for this frontend artwork patch.
`approved-icons-independent-review.json` independently verifies all 24 native
icons against the approved geometry and palettes, all 96 seasonal atlas copies,
and the unchanged 18 swing/two silver sources and descriptors.

The production-mode client build, clean and retained static graphs, source
pins and asset collisions passed in `client-staged/checks.json`.
`candidate-independent-review.json` verifies each manifest entry, 94 retained
old hashed assets, existing fruit-press atlas/metadata continuity, Studio
continuity and exact authority source/bindings against the prior release (only
SemVer fields were normalized). The installed static manifest SHA-256 is
`e6b37acc0b67e3c7e700d2166c9a98105fc84f283f058a3bd19de8ff3cef4532`;
the source manifest SHA-256 is
`a3460823fe7ea7232eef5cdec8b850e1630518cddc513ca94fc484fa810063c8`.
The new entry is `index-BtpMA4H1.js`, with service-worker cache
`orchard-0.4.1-mto1b95s`. Existing rollback artifacts and old URL availability
remain preserved.

`client-install/status` records
`frontend041-deployed-world-and-studio-unchanged`. Authenticated before/final/after
checks matched module
`76697414537df61f97de56b6b3a1ff9a0dc8406100b1dd1e95c9dfc086b8051f`
and content revision 7/hash `8cfe4746`/531 definitions exactly. Public static
validation passed. A real Refresh Now click at `(213, 616)` in a 794×1052
CSS-pixel viewport loaded `index-BtpMA4H1.js`, with navigation time origin
`1788593392098.2`. The same Dastari identity rejoined with no error, content ready
and 48 inventory rows. Before/after inventory, character, skill tracks, skill
nodes and quests matched exactly. Player coordinates changed while live, and
the known-recipes cache had zero entries before versus 29 after without a
pre-capture readiness proof; neither exact position nor recipe-state parity is
claimed from that comparison. The four approved wooden icons were visually
verified in the inventory and hotbar. The user subsequently reported line
artifacts above hotbar icons at fractional scaling; that is a separate follow-up,
not a verified correction in this release. Remaining gameplay acceptance
obligations are unchanged.


## Version 0.4.2 fractional-scale icon repair and separate map cleanup

The frontend-only 0.4.2 release is deployed. Cached isolated inventory frames
prevent neighboring atlas pixels from entering fractional-scale samples;
nine-slice uses the same cache. The Chrome pixel proof covered 768 cases, with
157 bleeding cases before and zero after, using 24 unique cached frames.
`/home/toby/.local/state/orchard-042-scalingatlas-20260905/release-result.json`
records 157 focused tests in six files, client/UI typechecks, lint, validation
of all 531 content definitions, unchanged lifecycle source, the production
build, static checks and verified rollback. Authenticated before/final/after
module/content checks were exact; this frontend release did not publish world
code or content. Full repository tests were not claimed for this bounded patch.
The stage-check receipt SHA-256 is
`7fe1112fd8949349cd1c8bb6891fa8267734ee3e61902070460d3e1fdd55f4e0`;
the install log SHA-256 is
`0245a012844a5dad96a0b2cdb48926f9d954e361782c9ef4d464a26395c37e50`.

A real Refresh Now click at `(213, 616)` loaded `index-xF_puAhK.js`, with
navigation time origin `1788594160790.8`. The same Dastari identity connected
with no error, content ready and 48 inventory rows. Hotbar icons were visually
clean at DPR 1.6431677341461182, UI scale 1 and a 604×800 CSS-pixel viewport.
This bounded visual check does not replace outstanding gameplay acceptance.

The separately authorized accidental map-object removal used the existing
owner-only `publishLiveMapDocument` reducer, not a world module deployment or
a resource-table delete. Evidence is in the sibling `map-removal/` directory.
Read-only capture preserved the exact original row and raw/canonical map. The
raw document SHA-256 was
`312ddb01a9f48398e6e8d07c4c5957d2cfb8bb57930d2ee8d08394a0a8d17b89`.
The reviewed candidate removed only object
`asset-3132196081-animation-base-0-404-316-1` at tile `(404, 316)` and advanced
the document revision. Its shared apple-tree prefab's pivot caused 12 fully
blocked tiles over x404–406/y313–316, drawn as 192 debug collision subcells.
The normal oak resource `263318` at `(405, 316)` and Fisher hut landmark
`3200000001` at `(403, 315)` were separate entities and were preserved.

`map-removal/result.json` records the successful revision-2/hash `740ba8d4` to
revision-3/hash `9b04389a` compare-and-swap at `2026-09-05T07:45:17.616Z`.
The observed full canonical result matched the candidate exactly: five other
objects, the shared prefab, all 184 landmarks, 22 transitions, two suppressions
and terrain remained unchanged. `map-removal/post-apply-review.json` separately
recomputes that exact comparison from the raw captured artifacts; its reviewer
also authored the operation script and does not claim independent authorship.
The shared browser observed revision 3/hash `9b04389a`, target absent, five
remaining objects and 184 landmarks. Original map bytes and server revision
history remain available for rollback. No wider map cleanup was performed;
remaining interaction/animation reports are separate work.


## Version 0.4.3 tool actions and cosmetic timing (deployed)

The frontend-only 0.4.3 release is installed. Missing decorative campfire
custody no longer intercepts selected-item input; optional contextual secondary
interaction requires a real row and active authored metadata. Local action
presentation uses ordered pending requests and a monotonic local clock so
delayed echoes cannot replay completed swings. Exact rejected tokens are removed
for tool, pickup, drop and bow requests; held bow presentation does not consume
a fire echo. Tool poses come from the active item equipment metadata. Cosmetic
weather phase advances only with rendered time and pauses without relocating
clouds; authority still selects real weather, wind and calendar state.

Evidence is in `/home/toby/.local/state/orchard-043-tool-actions-20260905`.
The final `focused-tests.log` records 59 tests in five files, including all six
phase-zero extraction checks after recomputation with the existing AST tool.
The actual structural seam digest is
`bf802ace1cb14a6b11ba4c1414c47a66c44e185c36235f05b703f3f42575405b`.
Client/UI typechecks, lint, content validation and lifecycle integrity passed.
`source-independent-review.json` records independent interaction, action, weather
and release-preparation review; it is source review rather than a claim of live
animation acceptance. Full repository testing is not claimed for this patch.

The production client build and static/retained-asset checks passed. The source
manifest SHA-256 is
`bcd8f554b716adbab017798985dd727e3617ed2808c6ed8cdee9b9f1cf384484`;
the installed static manifest SHA-256 is
`178f92638811607a8780ca6b23b5263f2f762c2dbaf8aeabc80b4549e8702e20`.
The entry is `index-86irvacy.js`, with PWA cache `orchard-0.4.3-mto3ki5j`.
`client-install/status` reports
`frontend043-deployed-world-and-studio-unchanged`; guarded before/final/after
checks matched the deployed world module and content head exactly, with Studio
unchanged. The prior 0.4.2 client is retained for rollback and prior immutable
asset URLs remain available. A real Refresh Now click loaded the new entry with
navigation time origin `1788595597839.3`. After hydration,
`browser-parity.json` confirmed the same identity connected with no error and
exact before/after equality of inventory slots, character profile, skill tracks,
skill nodes and quests. Positive live animation checks remain separate from
this completed rejoin comparison; no additional position or recipe parity is
claimed.

The separate requested removal of the tree at `(376, 350)` used the existing
owner-only `publishLiveMapDocument` reducer after a fresh read-only capture.
`map-removal-376-350/result.json` records target
`asset-3132196081-animation-base-0-376-350-1` removed by revision-3/hash `9b04389a`
to revision-4/hash `21a3c554` compare-and-swap at `2026-09-05T08:04:57.919Z`.
The complete canonical result matched the candidate with only that object
removed and the revision advanced. Four other objects, the shared prefab, all
184 landmarks, transitions, suppressions and terrain remained intact. The
browser observed revision 4, target absent, four objects and 184 landmarks.
Captured original map bytes and server revision history remain available for
rollback. No server module was published for either this map operation or the
frontend update.

The Fisher hut's left collision column and 54 remaining outlined item icons
were outside this 0.4.3 release and were subsequently released in 0.4.4, recorded
below.


## Version 0.4.4 plain icons and Fisher hut collision (deployed)

The guarded 0.4.4 world, client and Studio release is deployed. The first
attempt stopped before publication with one stale precomputed-collision
assertion among 3,237 tests. The shared generator was then restored as
`npm run world:collision:generate -w @orchard/tools` and its fixed-seed ground,
water and air equivalence checks passed. Deployment 2 passed all 3,238 tests
in 546 files, every workspace/release typecheck, lint, content validation,
lifecycle integrity, 1,020-asset validation, the checked SpacetimeDB build and
both frontend builds.

The icon correction maps 54 native crop, seed and mineral frames, referenced by
77 active item IDs, to licensed plain source cells. The prior filename-based
audit missed visible contours in generically named sheets. The explicit
`packages/tools/src/assets/fixtures/plain-item-icon-sources.json` mapping is
shared by crop/ore importers and pixel regression checks. The approved 24
material-tool icons, fruit-press art and all pixels outside the changed frames
remain exact. This is a source-cell correction, not a blanket removal of white
onion-bulb or mineral-highlight pixels.

The hut change opens only its transparent left column at x400/y313–314, retaining
the solid facade at x401–405 across those two rows. Reversing only the reviewed
source comment and left-bound expression reproduces the complete deployed-0.4.0
`survival-world.ts` hash. The generated server artifact differs from that prior
version in one field: `GROUND_OBSTACLES[104].left`, 102400→102656; all other file
bytes match. The regenerated artifact SHA-256 is
`da56062edc23765365457bfd2cbdb6d11ffb8f2c676526c1e41d2b29d473ad57`.

Evidence is under `/home/toby/.local/state/orchard-044-plainicons-hut-20260905`.
The fresh content candidate SHA-256 is
`c308c9ccc1616b24f08d8c8d105b3ae1fd47f29cbdc9dc17abbe40eefc188b2b`;
its expected head matches the fresh capture, unlike the historical 0.4.0
candidate. It applied zero upserts and zero deletes, retaining all 531 content
definitions at revision 7/hash `8cfe4746`. The published module Keccak-256 is
`8b79bfd18b26148dfdb4f1a242ef8e7962f7038ea243d5ad26c15b589d321c40`.
The final world-source manifest SHA-256 is
`0f957656de782ea087482e613ad4fd89a1b7744d6e98cde8f63212bf5981a08b`;
the deployment-2 log SHA-256 is
`bef3308eaab0417f754b82a94f732d93a8f9c7037a96f9b87c02f6dd4aecb5cc`.

No-delete publication retained unchanged public/private schemas. The same owner
passed exact before/expected/after parity across all 38 tables, with rejoin-after
SHA-256 `b119580773bb135b630b60ec8f734fcf7087af4b1a367c7bef60e1882f2d5710`.
`deployment-2/post-release-independent-review.json`, SHA-256
`6bb3372f67ace65075b54ab2f01ae3937b53c5adc47c0b037a4a3105336b3ad5`,
independently verified those snapshots, schema equality, compiled/published module
equality, exact rollback bytes and both installed static trees against their
staged manifests. The earlier source review was superseded by
`source-independent-review-regenerated.json` after the generated collision fix.

A real Refresh Now click at `(213, 616)` loaded `index-BjcxJFRJ.js`, navigation
time origin `1788596485912.8`. `browser-after.json` records completed hydration,
the same Dastari identity connected with no error, and 48 inventory rows. Live
map revision 4 still has four objects and 184 landmarks, with the previously
removed `(376, 350)` tree absent. The read-only 43-second health sample recorded
13.26% of one CPU core and zero critical journal matches. There is no claim of
actual walking along the repaired hut or sustained weather playback. Those and
the earlier outstanding gameplay acceptance scenarios remain separate from
this successful release/rejoin evidence.

### 0.4.5 chest collision fix — checked, not deployed

The prepared fix replaces the generic open-placeable collision bypass with
shared authored state evaluation. Chests and barrels stay solid when opened;
only the fence gate gains `collision.when: { state: "open", equals: false }`.
`setCollision` applies a supported condition through the existing state writer,
rejecting unsupported or malformed state. Idempotent static-container effects
preserve the exact existing state, including compatibility columns. Players
already overlapping an obstacle can walk outward only with strictly improving
penetration and no new/increased obstacle overlap; terrain, elevation, spawn and
jump-landing checks remain strict. Legacy chest compatibility and custody are
preserved, with no stored-data deletion or compatibility retirement.

The final combined chest, durability and reconnect run passed 3,368 tests in
562 files, all workspace/release typechecks, full lint, lifecycle integrity,
content validation and the checked SpacetimeDB build. Client and Studio builds
passed with both default and actual release profiles. The private schema is
identical. The generated
export remains 531 definitions in 21 files, now hash `dfdf555b`; comparison with
the approved 0.4.4 candidate confirms the fence-gate condition is the sole content
change. Lifecycle revision 11 and 109 callback-owned / 72 reviewed-inert items
are unchanged.

Private evidence is under
`/home/toby/.local/state/orchard-045-chest-collision-20260905`.
The independent source review is `source-independent-review.json`, SHA-256
`20a991a40898c5cdfd56a7aca80b9af3a810d5e56a54083bfe15f1e9ead569e0`.
That review records source hashes, direct state-preservation/rejection checks,
the exact content difference and its release-evidence limits.

The pending 0.4.5 client also corrects durability bars for the 20 newer material
tool variants. Their authored durability limits and authoritative wear were
already present; live inventory, hotbar and shared slot presentation now read
the active registry rather than the old static tool list. All 24 material tools
show full, worn and broken states, and an unspecified stored durability is
presented consistently as full in bars and tooltips. This presentation fix
changes neither item balances nor stored durability. The focused regression
checks include authored maximum overrides and items without durability; the
combined focused run passed 115 tests in three files, and all six extraction-seam
checks passed. This release remains undeployed while fresh owner sign-in is
outstanding.

The full-suite count includes concurrent lighting-agent tests, so it is not a
count of changes confined to the chest/durability/reconnect work. Full lint initially found two
generated lighting review bundles; only those two generated paths were excluded.
The source `build-review.mjs` received an explicit console import and remains
linted. Full lint then passed. These checks do not imply any additional world
publication.

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

No 0.4.5 publication or static installation has occurred. The owner OIDC session
expired; a fresh owner sign-in is pending. Fresh capture, content-head candidate
review/CAS, guarded publication and same-identity rejoin/chest acceptance must
still complete. Production remains at 0.4.4, module
`8b79bfd18b26148dfdb4f1a242ef8e7962f7038ea243d5ad26c15b589d321c40`,
content revision 7/hash `8cfe4746`. No live chest recovery is claimed.

Local recovery-overlay visual evidence is in `recovery-visual/desktop.png`,
`recovery-visual/portrait.png` and `recovery-visual/review.json` under the private
0.4.5 evidence directory. The review receipt SHA-256 is
`4dee4854a4f993cf75ce274bcc51717b6f9f254d41b29fcac9630124fc4016f9`.

The final combined full-suite evidence is `recovery-checks/full-tests-final.log`
(3,368 tests / 562 files), and full lint evidence is
`recovery-checks/lint-final-2.log`. These are local gate results, not evidence of
publication or production/device acceptance. Fresh owner sign-in is still
required before the guarded release can proceed.

## 2026-09-06 — island gateway background prepared

The real island now supplies the background for loading/account pages, pre-world
recovery/update panels, all 38 native PWA launch images, and provider login, register
and recovery forms. Canonical PNG 1536×1024 SHA
`2ab9a8df83b3254684058b9f80aa9f22d7d41f431868dd77e2749a1cdedce621`.
Reproduction/provenance: `art/custom/login-island/README.md` and `provenance.json`.
Actual isolated desktop/portrait account/loading and Keycloak-form captures pass;
stationary background redraws reuse the viewport bitmap. Native app icons unchanged.

Evidence is in `/home/toby/.local/state/orchard-045-island-login-20260906/visual-review/`
and `output/playwright/island-keycloak-20260906/review.json`. Shared browser owner
session renewed and content head captured privately; no release yet. Latest full suite:
3373passed/1failed: the external lighting agent changed the default solver while
the existing lighting test still requires Classic. Preserve that work and resolve
the shared source readiness before guarded publication. Earlier 3368 green result
belongs to the prior chest/durability/reconnect checkpoint.

Latest 2026-09-06 checkpoint: the lighting author updated the old default
assertion and advanced the shared package version to 0.5.0. Full suite now passes
3374 tests / 563 files. Typechecks, lint, content/lifecycle checks, checked world
build and both application builds pass. No deployment or Keycloak restart yet;
coordinating readiness with the lighting author. Owner session remains in the
shared browser; no refresh credential was transferred to a release process.
The private one-upsert content candidate and independent review are ready at
`/home/toby/.local/state/orchard-045-island-login-20260906/`.

### 2026-09-06 — ordinary-wind tree sway (prepared, not deployed)

Automatic seasonal wind tops out at 0.42; the previous crown-offset calculation
produced at most 0.309 world pixels and rounded every component to zero. Sparse
leaf particles still emitted, explaining moving leaves around motionless trees.
The shared engine now preserves fractional offsets and uses a square-root ease
above the existing 0.3 threshold, with the same 1.8-pixel maximum crown bend.
The existing foot anchor, cosmetic clock, weather authority, and leaf emission
are unchanged. Calm weather remains still.

Verification: engine typecheck and focused ESLint pass; 39 weather/netcode tests
pass, including ordinary wind, direction, calm, bounded gusts, and resumed-frame
timing. An isolated Chrome check used the actual oak atlas and drawing function
at 1x–4x: ordinary wind previously yielded one static frame in every case; at
2x–4x the corrected renderer produces 3–33 distinct frames across the sampled
cycle. At 1x some gentle motion remains below a raster pixel. Evidence is in
`output/playwright/tree-wind-20260906/`. No production data or deployment changed;
this fix joins the pending release after the owner confirms the other agent's
lighting work is ready. The shared pending app version remains 0.5.0.

## Guarded 0.5.1 deployment, 2026-09-06

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

Release log: `/home/toby/.local/state/orchard-051-20260906/release-4.log`,
SHA-256 `93ad94d72a6c12886dccdca2a0899d8158e0defe8112e376c18cb02bc373c6f5`.
Published module Keccak-256:
`82e566438482f72cdf0f46136e046c0d8ec1d60a9a4482485b2fb817d33d949c`.
The evidence directory retains the verified code/static rollback artifacts,
before/after schemas, and original rejoin snapshots; no world data was deleted.

Theme installation: `/home/toby/.local/state/orchard-island-theme-20260906/status.json`
reports `deployed`. Independent live review receipt `live-review.json` in the same
directory has SHA-256
`3df19ec6d7f0a3f3cc5431440bf8d77fd4a5471dba2045313ef136136cca1348`.
Its six screenshots are in `output/playwright/island-keycloak-live-20260906/`.
Only Keycloak restarted for the theme; PostgreSQL retained its original start time
`2026-09-04T11:12:51.65518489Z`. The visual session was isolated and closed after
verification, leaving the owner's shared browser credentials untouched.
