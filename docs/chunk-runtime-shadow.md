# Chunk runtime shadow phase

Status: implemented in `feat/chunk-runtime-shadow`, based on current main plus PR71 (`37dc1917`). Implements doc61 §2.5.2 step3 and reviewable prerequisites for step4. GoldCondor owns merges; no deployment or publication is authorized.

## Decision and contract

Keep gameplay on the current map/compiler/generator path. Opt-in shadow consumers fetch immutable `/world/<space>/<hash>.bin` data from additive public chunk heads. The owner stages bytes and a revision using compare-and-swap against the current map/content revision; verified private bytes feed server chunk-local collision queries. No reducer enables live chunk authority. Blobs must be served before publishing heads. The server cannot assume static CDN availability from an uploaded hash.

A new chunk-native store owns only bounded decoded chunks; the existing full-array `ChunkTerrainStore` remains the golden compatibility adapter. View plus one ring is pinned; total bytes and count are hard limits, including pins (oversized views fail explicitly). Fetch concurrency and pending work are bounded. Immutable IndexedDB entries are keyed by hash and independently evicted; corruption is discarded and fetched again. Missing chunks return void/solid and never authorize movement. Stale requests cannot install into a newer revision. Atlas pack dependencies are exposed for prefetch; no first-play savings claimed while legacy loading remains.

Server shadow queries return authored medium/solid and preserved legacy channels. D6 alone owns ability and hazard policy. Dynamic objects remain authoritative live data. Signed chunk coordinates and one-cell halos remain format contracts. No generator or document retirement occurs in this phase.

## Activation gates

Before gameplay activation: publish exact map/content/asset-pinned blobs and heads under the guarded release procedure; collect client/server parity across every cell and dynamic overlays; resolve known boat differences using approved D6 semantics; prove bounded-memory view churn and offline/cache invalidation; adapt live rendering and collision consumers to chunk-native reads without whole-world arrays; integrate spawn-pack prefetch and movement readiness; switch server/client together with rollback evidence. Only after those gates remove generator/compiler imports and enforce the generator-free bundle check. Retiring documentJson additionally requires Studio chunk authoring and a separate reviewed migration.

## Validation plan and handoff

Tests cover hash/revision rejection, partial staging/CAS, signed halo samples, bounded pins/LRU, persistent corruption/failure, async races, regional subscriptions and shadow isolation. Run workspace typecheck/lint, affected tests, world/bindings/client builds and repository gates. Update this document with exact results, versions, PR and pending activation decisions before handoff.

## Implemented APIs and operation

- `@orchard/sim/chunk-runtime`: validated manifest/head verification, immutable URL construction, signed chunk-local medium/solid/elevation and legacy plane sampling. `BoundedChunkTerrainStore` in engine holds at most 25 chunks / 16 MiB encoded bytes by default; decoded channel arrays and records belong only to those resident chunks. This is a retention budget, not a measured JavaScript heap bound. The old whole-array compatibility adapter remains for golden tests.
- `stageWorldChunkBlob` accepts one verified blob (maximum 1 MiB); `publishWorldChunkShadow` verifies every referenced staged blob and exact source revision/content hash plus expected shadow revision before replacing regional heads. The manifest is capped at 4096 heads / 1 MiB JSON, publication payload at 128 MiB. All writes require the existing world-owner policy. `inspectWorldChunkShadow` uses an immutable 25-chunk cache and is also owner-only. Staged private blobs are retained; pruning requires a separate reviewed retention operation.
- This phase supports publication for `live-island` / topside space 0. Other spaces require the F4 map-to-space authority contract. Asset revision is a SHA-256 hash of the exact `atlas.packs.json` bytes. The client checks the served index against the manifest before fetching terrain.
- `VITE_CHUNK_RUNTIME_MODE=shadow` enables regional heads, fetching and diagnostic comparison only; the default is `off`, and other mode values fail the build. The comparison observes the current collision map, so dynamic blockers can legitimately differ from static blobs; its counters alone are not the activation parity gate. No gameplay readiness or movement result is changed.
- The loader caps concurrent requests at two and verified bytes per response; reads time out after 15 seconds. A view that exceeds hard pin budgets fails explicitly. IndexedDB retains at most 256 entries / 64 MiB; storage failure falls back to verified network bytes. Controller disposal closes its owned database handle. Tests use the upstream [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) implementation for transaction, persistence and eviction semantics; this is not a live-browser offline acceptance claim.

Prepare reviewed data without publishing:

```sh
npx tsx scripts/materialize-world-chunks.ts --input /private/reviewed-map.json --content-rows /private/reviewed-content.json --atlas-index packages/assets/generated/atlas.packs.json --output /tmp/chunk-materialization
npx tsx scripts/prepare-chunk-shadow.ts /tmp/chunk-materialization /tmp/chunk-shadow-bundle CONTENT_HASH EXPECTED_SHADOW_REVISION
```

Replace the final two arguments with the reviewed content hash and current shadow revision (0 for first publication). The second command verifies every source blob, writes `world/0/<hash>.bin` with gzip/Brotli variants and `shadow-publication.json`, and performs no network calls. Under separately authorized publication, serve the immutable files first with correct Content-Encoding and immutable caching, stage verified decoded bytes through the owner SDK, then send the CAS request. Do not treat a file copied locally as proof of remote availability. An interrupted staging operation exposes no new public head until publication succeeds. A changed map/content head requires rematerialization; the client fails closed on mismatched revisions.

Every game build emits `chunk-runtime-audit.json` from actual bundled module identities. `ORCHARD_REQUIRE_GENERATOR_FREE=1 npm run client:chunks:check` must fail while legacy generator/compiler modules remain; it becomes mandatory at retirement. The normal shadow/off build keeps those modules deliberately.

Versions: repository 0.27.2, sim 0.25.0, world 0.24.0, engine 0.22.0, client 0.22.1, bindings 0.18.0. PR: https://github.com/Dastari/orchard-cellar/pull/83, ready for review after local validation; hosted CI remains a separate coordinator merge gate.

Offline acceptance: all 169 bootstrap chunks passed complete source parity and preparation against the actual generated atlas index. Decoded payload bytes total 20,573,165; materializer gzip 456,307 and Brotli 370,110 bytes, plus a 22,591-byte manifest. These are local file sizes, not network/first-play claims. Prepared output is `/tmp/orchard-chunk-shadow-prepared`, never installed or published. This run found and fixed compatibility with the existing eight-hex-character content hash (`b3f30168`); immutable blob/asset-index hashes remain SHA-256. A direct controller lifecycle test also verifies regional-head waiting, actual asset-index hashing, diagnostic comparison and source-revision rejection.

Broad validation initially found one existing region-subscription extraction harness unable to parse an inline `import.meta` expression. The flag now evaluates once in connection initialization; all 110 network/shadow tests across 15 files pass. The superseded broad run was stopped after that diagnosis and is not reported as clean. Final full check completed successfully at `/tmp/orchard-chunk-check-final.log`.

## Final validation and integration handoff

`npm run check` exited 0 on source `3ab8a9f9ca9967bc035621204c3b4af4f9aca065`: lifecycle integrity, 919 content definitions, checked world build, workspace typecheck/lint, 995 coverage files / 6209 passing tests / one skip, seven exhaustive files / 101 passing tests, and asset validation (1320 art, 3 songs, 10 SFX, 55 colors). Coverage: statements 89.02%, branches 84.41%, functions 94.52%, lines 93.05%. Coverage took 1124.86 seconds and exhaustive tests 162.54 seconds.

Latest default-off and shadow client builds, normal bundle boundary checks, generated bindings and guarded Studio production build passed. The explicit generator-free gate rejects the retained five legacy modules as intended. All 110 focused network/shadow tests passed, including the subscription regression and database teardown.

Real bootstrap view churn visited all 169 chunk centers, kept every view plus ring ready, and retained at most 25 decoded chunks representing 4,529,870 encoded bytes. This proves the configured retention limits for that traversal, not browser heap usage or first-play timing. No files were installed into live delivery and no staging reducer was called.

Worktree: `/home/toby/projects/orchard-chunk-runtime`; branch `feat/chunk-runtime-shadow`, stacked on PR71 `37dc1917`. Production source is frozen at the tested commit; the final follow-up records results only. GoldCondor confirmed owner-only CAS and topside shadow scope in Agent Mail319. Coordinate later integration with D6 PR80 `cd5009d3`: retain its optional `hasTraversalChannels` compatibility metadata, actor policy and independent hazard table. Combine additive schemas and bindings with PR81 without altering object-state anchors. OrangePike has shared additive access for timer work in a separate worktree.

Next action is coordinator review/CI reconciliation and a separately authorized publication rehearsal. Live activation still needs chunk-native renderer/collision integration, D6 parity, spawn-pack readiness, browser offline/cache acceptance and rollback evidence. Generator and document retirement remain prohibited until the listed gates are met. No merge, publish or deploy was performed.


## Coordinated source integration

This refresh consumes source #81 `1626a476` and #80 `47583aee` over reviewed main
`df509125`. Its production files exactly equal fullgreen runtime rehearsal #88
`b6e37eb382cdb27e826d013339c3c466c76cff57` (exclude docs/** and CHANGELOG only).
That snapshot passed 6,389 coverage tests across 1,022 files, one skip, all 101
exhaustive tests, integrity/content/world/types/lint and assets. Independent source-prefix checks passed: 52 focused tests / eleven files,
regenerated bindings, checked world build, all workspace types, lint and guarded
Studio production build. Fresh hosted CI remains a separate coordinator gate.
This does not integrate timer PRs #84–86; combined runtime/timer PR93 owns that
separate gate. All shadow/owner-only/private-schema boundaries remain unchanged.
No merge, publication, deployment, live activation or generator removal occurred.

Hosted CI follow-up: incorporate source #81 `6caf5d5e` without runtime changes.
The cell-part parity regression uses the actual target-chunk adapter instead of
repeating the full-world golden comparison and decoding every blob again. Full
169-chunk golden coverage, hashes and 120-second limits remain unchanged. See the
object-state handoff for both hosted failures and measured coverage before/after.
The propagated source #83 parity file passed both tests; ESLint passed. Fresh
hosted checks remain pending after this test-only propagation.
