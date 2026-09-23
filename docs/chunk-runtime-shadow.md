# Chunk runtime shadow phase

Status: implementation in `feat/chunk-runtime-shadow`, based on current main plus PR71 (`37dc1917`). Implements doc61 §2.5.2 step3 and reviewable prerequisites for step4. GoldCondor owns merges; no deployment or publication is authorized.

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
- The loader caps concurrent requests at two and verified bytes per response; reads time out after 15 seconds. A view that exceeds hard pin budgets fails explicitly. IndexedDB retains at most 256 entries / 64 MiB; storage failure falls back to verified network bytes. Tests use the upstream [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) implementation for transaction, persistence and eviction semantics; this is not a live-browser offline acceptance claim.

Prepare reviewed data without publishing:

```sh
npx tsx scripts/materialize-world-chunks.ts --input /private/reviewed-map.json --content-rows /private/reviewed-content.json --atlas-index packages/assets/generated/atlas.packs.json --output /tmp/chunk-materialization
npx tsx scripts/prepare-chunk-shadow.ts /tmp/chunk-materialization /tmp/chunk-shadow-bundle CONTENT_HASH EXPECTED_SHADOW_REVISION
```

Replace the final two arguments with the reviewed content hash and current shadow revision (0 for first publication). The second command verifies every source blob, writes `world/0/<hash>.bin` with gzip/Brotli variants and `shadow-publication.json`, and performs no network calls. Under separately authorized publication, serve the immutable files first with correct Content-Encoding and immutable caching, stage verified decoded bytes through the owner SDK, then send the CAS request. Do not treat a file copied locally as proof of remote availability. An interrupted staging operation exposes no new public head until publication succeeds. A changed map/content head requires rematerialization; the client fails closed on mismatched revisions.

Every game build emits `chunk-runtime-audit.json` from actual bundled module identities. `ORCHARD_REQUIRE_GENERATOR_FREE=1 npm run client:chunks:check` must fail while legacy generator/compiler modules remain; it becomes mandatory at retirement. The normal shadow/off build keeps those modules deliberately.

Versions: repository 0.27.1, sim 0.25.0, world 0.24.0, engine/client 0.22.0, bindings 0.18.0. Draft PR: https://github.com/Dastari/orchard-cellar/pull/83. Full repository check is running at `/tmp/orchard-chunk-check.log`.

Offline acceptance: all 169 bootstrap chunks passed complete source parity and preparation against the actual generated atlas index. Decoded payload bytes total 20,573,165; materializer gzip 456,307 and Brotli 370,110 bytes, plus a 22,591-byte manifest. These are local file sizes, not network/first-play claims. Prepared output is `/tmp/orchard-chunk-shadow-prepared`, never installed or published. This run found and fixed compatibility with the existing eight-hex-character content hash (`b3f30168`); immutable blob/asset-index hashes remain SHA-256. A direct controller lifecycle test also verifies regional-head waiting, actual asset-index hashing, diagnostic comparison and source-revision rejection.
