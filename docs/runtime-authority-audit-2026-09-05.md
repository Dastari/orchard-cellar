# Runtime authority audit, 2026-09-05

This is a source audit of the migration deployed through the guarded release on
2026-09-05, not completed production gameplay acceptance. Existing identities and
durable player/world rows remain protected by continuity and retirement gates.
Broad editor styling remains paused. The latest Tier-B policy is specific owner
chat approval after repository validation. Changing that policy did not itself
approve a release; the owner subsequently gave “Go” for this same forward
deployment. The guarded deployment succeeded; browser gameplay acceptance is in progress.

| Area | Classification | Remaining work or evidence |
| --- | --- | --- |
| Placeables and homestead builds | Registry authority migrated | Removed static API names have no remaining consumers. Explicit unknown durable definition IDs fail closed; legacy empty IDs use authored placement edges. UI and Studio receive registry projections. |
| Shop frames | Registry authority migrated for frame selection | Dialogue owns the frame reference; literal `frame:shop` authority branches are absent. |
| Boats and horses | Registry authority migrated for movement and lifecycle dispatch | Active NPC mount metadata owns adapter selection. Generic ground/water adapter discriminants remain valid. Durable rider, home and reconnect state are retained. |
| Sprinklers and greenhouses | Registry authority migrated | Authored irrigation radius, seasonal protection and recipe skill requirement drive server/client eligibility. |
| Resource/mining/fishing loot references | Gameplay authority debt | `packages/sim/src/behaviour/handlers/loot.ts` still selects loot IDs through `RESOURCE_LOOT_IDS` and resource-kind event branches. Move harvest/event profiles and loot edges into active authored definitions. |
| Resource eligibility and multi-drop gathering | Gameplay authority debt | `packages/sim/src/world-rules.ts` still chooses resource tool eligibility; `packages/world/src/index.ts` keeps a fixed gatherability list and destructures the first loot drop. Preserve resource IDs, richness, health, timing and yield progress while migrating. |
| Fishing statistics | Gameplay authority debt | The world counts only `raw_fish` for `fish_caught`. Authored alternate fish drops need registry metadata and their own statistic subject. The current loot interpreter alone does not establish this capability. |
| Wildlife rewards | Gameplay authority debt | `packages/sim/src/content/loot-bootstrap.ts` and loot handlers still choose static species loot edges and combat XP. Resolve these through active wildlife definitions. |
| Landmark footprints | Gameplay authority and prediction debt | `fisher_dock` walkability and `wooden_table` collision-width branches remain in world and client. Author collision/footprint metadata and preserve existing geometry. |
| Repair targets | Lifecycle metadata limitation | Revision-10 callbacks intentionally name `object:anvil`; the client prompt/dispatch repeats that ID while the server accepts the station tag. Generalize client target metadata when authoring alternate repair targets. |
| Resource glyphs and art | Pure presentation | Studio ore/fish glyphs and client fish-pool art/depth are presentation where they do not alter targeting, collision or interaction availability. |
| Loot operators and effect/target tags | Valid generic runtime discriminants | Weighted selection, scalar conditions and bounded effect categories describe engine operations rather than authored content identities. |
| Legacy chest fallback | Explicit retirement compatibility | Keep declarations and rows until verified global migration zero and guarded retirement acceptance. No cleanup to make migration pass. |
| Mining migration version | Compatibility preserving state | Versioned migration preserves durable node state; document a retirement condition before removing it. |
| Legacy cooking jobs | Deployed in-place lifecycle compatibility; gameplay acceptance pending | The unchanged private table remains escrow. Authored frame callbacks issue caller-owned collect/cancel effects; exact saved input/output, quantity and ready tick are preserved. Collection validates the original lit/reachable target and archived XP; inventory cancellation remains available after moving away or losing the fire. Atomic grant, receipt and resolution prevent loss or duplicate collection. The source/capability and fixture gate passes without requiring global zero; prospective content merges must retain recovery and historical obligations. |
| Admin NPC relocation | Gameplay authority defect | Studio filters some custody and simulation-controlled rows, but server `adminManagedNpc` / relocation planning does not yet bind rider/home custody and authored fixed-spawn eligibility. Fix server preflight and preview fingerprint before claiming safe relocation. |

The lifecycle partition remains 89 callback-owned items and 70 reviewed-inert
items at revision 10. Dispatch-coverage tests do not prove the resource and
collision migrations above are complete. Next runtime work should establish
registry-owned harvest profiles and loot edges, then authored collision footprints
and the admin relocation custody boundary. The fresh backup, rollback verification,
isolated rehearsal, no-delete publication and automated same-identity parity have
passed. Interactive reconnect and the requested gameplay checks remain in progress.

The earlier private cooking count failed because database-owner CLI authentication
was rejected; no global zero was established. That former release blocker is
superseded by accessible in-place claims, not by treating the failed query as an
empty table. `ownCookingJob` rejoin evidence preserves all original fields,
including `startedTick` and `readyTick`. No job is cleared or bulk-converted during
publication or connection. Removing this escrow compatibility still requires a
separate verified zero-job retirement gate.

Independent review fixed two inventory continuity issues in the claim path and
shared transfer kernel: food rewards carry canonical durable `lit` metadata, and
stack merge headroom cannot become negative after an authored maximum is lowered.
Existing over-cap stacks remain unchanged; full-inventory claims fail without
losing escrow. The final repository run passes 3,050 tests in 523 files; the cooking
compatibility command passes 21 tests in four files. All seven typechecks, lifecycle
integrity, validation of 484 definitions, checked world build, isolated client and
Studio builds, lint and acceptance-manifest checks pass. These results do not
replace live acceptance. Full coverage also passed: statements 88.19%, branches
81.41%, functions 92.65% and lines 92.2%. A preceding engine test-fixture typecheck
failure was corrected in the fixture and the broad typecheck then passed.

The saved owner OIDC refresh initially failed with HTTP 400. The owner signed back
in and the renewed session passed the authenticated gates. The existing release
script completed the approved forward deployment at approximately 12:17
Australia/Hobart. Both sites returned HTTP 200 and all three services were active.
The deployed head is revision 2, hash `fa1a3fc3`, with 484 definitions and no deleted
content IDs. Both restored chest stages and 38-table rejoin parity passed;
production passed its 38-table parity check while retaining `placeable_reads`,
11 legacy chests, 176 legacy slots and 11 mappings. Production was not drained.

The verified 6.5 GB backup is
`/home/toby/backups/orchard/20260905T015400Z-cooking-lifecycle`; its `SHA256SUMS`,
`ROLLBACK-SHA256SUMS` and chest migration logs retain restoration evidence. The
successful release log is
`/home/toby/.local/state/orchard-release-20260905/release-attempt-2.log`, SHA-256
`d3d10209478f24fef72e8c469468fa74dd42e5bca2abc481d2b824dfc8e4f362`.
The published candidate at the same private directory's `content-candidate.json`
has SHA-256 `72e093de126ef1123c3b8534078f784d4a60bd5385d10d9e1e6b0b6820ccc4ad`.
Additional evidence hashes and paths are recorded in
`ops/LOGIN-RECOVERY-2026-09-05.md`.

The owner completed browser sign-in and confirmed gameplay worked after the
cooking release. The subsequent routine live-fix release passed all 3,077 tests
and 38-table same-identity parity, and the owner reconnected with the original
inventory. The current deployed content head is revision 3, hash `bcedc3e3`, with
484 definitions and zero deletes. A post-cache sample reached 19.28 authority
ticks/second at 24.6% of one CPU core. Release evidence is recorded in
`ops/LOGIN-RECOVERY-2026-09-05.md`.

These checks do not establish original chest/processor contents through the UI,
quest completion, recipe-book behavior or sustained multi-client/reducer health. Retain chest compatibility and keep broad editor styling paused until the
corresponding acceptance and retirement conditions are satisfied.
