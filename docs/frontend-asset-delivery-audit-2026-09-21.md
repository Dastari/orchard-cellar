# Frontend asset delivery audit — 2026-09-21

Status: investigation and recommendations; no runtime changes or deployment.
Source baseline: upstream main `1d2462cd`, production 0.8.4.

The highest-value work is to make startup depend on the player's immediate needs
and make unchanged files reusable across visits and releases. Atlas paging and gzip
already exist. Adding a CDN or changing all image formats alone would leave the
large eager dependency graph and broad art startup gate intact.

## Evidence and limits

Inspected current source, installed systemd commands, both deployed `dist` trees,
the reviewed Studio source, and ordinary public GET responses on
`https://orchard.dastari.net/` and `https://cellar.dastari.net/`.
[HTTP observations](frontend-asset-delivery-http-2026-09-21.json) record response
headers and body sizes with `Accept-Encoding: br, gzip`; no cookies or credentials.

T3 browser inspection reached the anonymous game account screen with an existing
service worker, and Studio's anonymous shell without a service worker. These are
resource inventories, **not cold-load timings or authenticated time-to-play
benchmarks**. Most Orchard resources reported zero transferred bytes from cache.
Studio's observation was of its shell, not a fully loaded authenticated map.
No caches were cleared, authenticated state changed, load tests run, or services
restarted. Actual mobile and remote-user latency still needs measurement.

All sizes below are decimal bytes unless explicitly labelled MiB. Raw JavaScript
is not compressed transfer size; RGBA page sizes are memory estimates, not wire
bytes or measurements of resident browser memory.

| Observation | Evidence | Implication |
| --- | --- | --- |
| Game HTML eagerly references 8 JS files totalling 1,827,700 bytes | Deployed `index.html`; browser requested simulation, game UI, canvas rendering, SDK, world bindings and client network on the account route | The 4,350-byte entry does not represent the initial dependency cost. Local gzip-9 estimate for these 8 files is 420,112 bytes. |
| Simulation chunk alone is 897,074 bytes raw, 173,782 bytes over the sampled gzip response | Live `/assets/simulation-Ckh36Dxd.js` | Content/runtime growth reaches even anonymous startup. |
| Studio shell observed 15 JS requests, 362,235 encoded / 1,599,015 decoded bytes | Browser Resource Timing | Investigate tool/model dependencies crossing the shell boundary; this excludes later editor tool loading. |
| Studio JS, JSON and PNG samples all return `Cache-Control: no-store` | Public GETs; checked-in NPM fragment | Repeat visits cannot rely on HTTP storage for these files. |
| Orchard samples return `no-cache`, with ETags | Public GETs | HTTP caching requires revalidation; the existing service worker can independently satisfy repeat static requests. |
| JS and JSON samples already use gzip | Both public origins, even when Brotli was offered | Compression is enabled; Brotli is an incremental experiment, not the principal missing optimization. Sampled `Vary` is only `Origin`; validate `Accept-Encoding` handling before introducing a shared cache. |
| Atlas index: 104,281 raw / 22,463 live gzip bytes; 1,182 assets, 41 pages per season | Live and installed generated index | Bootstrap metadata still scales with the complete catalog. |
| Character metadata: 2,864,722 raw / 126,771 live gzip bytes | Installed and live category manifest | Requesting one character asset loads and parses the whole character category. Props and tiles are another 390,101 and 407,788 raw bytes respectively. |
| Current index references 264 original/omit seasonal PNG filenames, 8,781,147 bytes, but only 74 distinct byte contents | SHA-256 grouping of files referenced by the index | 6,200,531 bytes are duplicate output. This is build/storage duplication, not a claim that every client downloads every season. |
| All 41 original pages for one season represent 124,016,640 RGBA bytes (~118.3 MiB) | Sum of page descriptors | A 4 MiB per-page cap does not bound total retained memory; actual loaded subset must be measured. |
| Account visit requested the 349,287-byte legacy backdrop plus three generated backdrop pages totalling 158,749 bytes | Browser inventory and HTML preload | Remove redundant login-background delivery after verifying any remaining consumer and PWA install requirement. |
| Account visit requested a 2,305,462-byte title MP3 | Browser inventory; AudioBus uses media elements | Check audio start timing and range delivery under fresh-user conditions; one existing-profile observation does not prove first-visit blocking. |

Do not use whole `dist` directory size as startup payload: installed outputs retain
older hashed JS for active sessions, and include unused/generated variants. The
release routine explicitly retains old assets. Cleanup must respect that policy.

## Ranked recommendations

### 1. Make caching match resource identity

**First delivery fix:** allow long-lived HTTP caching for genuinely hashed JS/CSS
on both clients. Preserve the appropriate private/non-cacheable policy for auth,
API and personalized responses; keep HTML and mutable release pointers fresh.
Studio's blanket `no-store` is in
[`orchard-studio.conf`](../ops/orchard-runtime/npm/orchard-studio.conf); its static
validator currently requires that policy on the document, so test document and
asset headers separately when changing the configuration.

**Growth fix:** emit atlas pages and metadata under content-addressed filenames,
with a small release manifest referencing those exact immutable files. Hash the
actual page/metadata content independently. Currently
[`atlasSourceRevision`](../packages/tools/src/assets/source-revision.ts) hashes
the entire art source and [`atlasImageUrl`](../packages/ui/src/atlas-page-loader.ts)
adds that one revision to every page URL. Category metadata also embeds the global
revision. A tiny art edit changes keys for otherwise unchanged resources.

Do not merely add `immutable` to today's mutable `/generated/*.png?rev=...` paths:
the origin serves the current filename regardless of the requested old revision.
Retain old content-addressed artifacts while supported sessions reference them,
publish dependencies before switching the release pointer, and test rollback and
an old tab fetching a previously unseen page after deployment. Keep release/content
compatibility checks separate from per-file identity; preserve current revision
validation until the new manifest contract replaces it safely.

The game worker currently names its entire cache by timestamped build ID and deletes
older Orchard caches on activation. Split a small versioned shell cache from a
bounded immutable-asset cache that survives releases. Define byte/entry limits and
pruning, with graceful quota failure. Only immutable URLs get this persistent
cache-first policy; the mutable atlas index needs an explicit release freshness
strategy. Changing cache policy alone must not allow mixed-version metadata.

**Success:** a repeat visit downloads no unchanged hashed bodies; after one art edit,
unchanged page URLs remain identical. Test both HTTP-only and service-worker paths.

### 2. Keep gameplay code out of account/loading startup

[`main.ts`](../packages/client/src/main.ts) dynamically imports gameplay, but the
built HTML still preloads large shared chunks. The loading screen imports shared
UI/engine code, and [`vite.config.ts`](../packages/client/vite.config.ts) groups
simulation, rendering, UI and networking broadly. Named chunks are not proof of
lazy loading: inspect the transitive graph and emitted HTML.

Give the account/loading shell a small dependency surface (font, panels, account
controls), then split gameplay and heavy data according to actual entry needs.
Avoid replacing this with hundreds of tiny modules. Extend
[`check-client-build-chunks.ts`](../scripts/check-client-build-chunks.ts), which
currently checks named chunk boundaries and lazy diagnostics/WebGL, to check the
account entry's transitive graph and compressed startup budget. In the reviewed
Studio source, similarly separate shell dependencies from tool implementations
and full content authoring models.

**Success:** anonymous account startup has no game-network/world-bindings/whole
simulation dependency; cold shell bytes remain stable when unrelated game content
is added. Establish a measured budget before setting a hard numerical threshold.

### 3. Load the visible world first

[`overworld-main.ts`](../packages/client/src/overworld-main.ts) awaits
`loadOverworldArt()` before constructing `OverworldConnection`.
[`overworld-art.ts`](../packages/engine/src/overworld-art.ts) waits on the complete
player clothing maps, wildlife, mounted variants, rogue enemies, item/crop icons,
and broad terrain art. This makes first play depend on much more than the current
view, despite page-based image loading.

Split requirements into shell, current player/nearby entities/current terrain,
and anticipated nearby content. Overlap authentication/connection/content readiness
with independent critical art loading, then derive the visible requirements from
authoritative state. Prefetch neighboring areas with lower priority. Preserve
collision/content correctness independently of art readiness and avoid visible
placeholders by gating the first playable view on its complete required set.
Load inventory, crafting, customization and editor palette previews on demand.

Preserve bounded concurrency and deduplication, but add request priority and cancel
obsolete speculative work. The current FIFO queue starts at most one request per
40 ms, so 100 starts require at least 3.96 seconds even before final completion.
Its comment cites Studio's old 30/s edge limit, while checked-in NPM rules now
exclude `/assets`, `/generated`, and `/ui` from that bucket. Verify the deployed
exemption before tuning pacing; removing throttling without evidence is unsafe.

**Success:** adding assets for an unseen biome or unused outfits does not increase
bytes/requests before the same spawn becomes playable. Measure new-region pop-in
and cache reuse as well as initial loading.

### 4. Make metadata and memory bounded as the catalog expands

Move frame, animation, baked-shadow and recoloring metadata to page/pack-sized
files; keep a small asset-to-pack lookup and load authoring catalogs only on the
relevant Studio tools. Shard the lookup only when its measured growth warrants it.
The present category split and separate marker manifest are useful foundations.

Use semantic packs (shell, common terrain, player core, specific biome/enemy groups)
with stable packing so inserting a name early in one category does not repack
unrelated pages. Preserve semantic asset IDs; never store generated atlas rectangles
as content identity. Deduplicate identical seasonal and omit PNG contents through
the manifest, while retaining each variant's meaning.

The loader's module-level `imagePromises` map strongly retains resolved images;
there is no total page eviction policy. After visibility-based loading, add an
ownership-aware budget that pins visible/in-flight pages and releases unused image
and renderer references. Deleting a map entry alone will not free an image still
referenced by `LoadedAsset` or GPU resources. Keep the existing page limits and
quality-variant consistency/fallback behavior from doc 59.

**Success:** long exploration reaches a bounded retained set; no visible-page
thrashing; all selected art, recolors and shadows render identically.

### 5. Tune encoding and hosting after the loading boundaries

Experiment with lossless WebP versus current PNG on representative pixel-art
pages. Require exact decoded RGBA, nearest-neighbor rendering, alpha/marker/shadow
correctness, and measured decode behavior on target devices. Existing small PNGs
may already perform well. Do not use lossy sprite conversion as a blanket fix.

Test precompressed Brotli for JS/JSON and remove confirmed redundant backdrop
requests. Evaluate shorter/lower-bitrate title audio only with an audio quality
check and proof it competes with startup. Range requests currently bypass the
service worker; preserve valid partial-response behavior.

Both installed services use `vite preview`. Plan a dedicated static-serving layer
with compression, validators, immutable caching, atomic release switching and
retention, preserving same-origin `/v1` HTTP/WebSocket routing and existing security
headers. Vite documents preview as a local preview tool, not a production server.
A CDN can then cache immutable public files when geographically remote latency or
origin bandwidth warrants it; keep credentials/API/WebSocket traffic outside that
public cache policy. An extra asset hostname also requires explicit CSP/CORS and
cache-key review. Same-origin delivery is the lower-complexity starting point.

## Verification before implementation is called successful

Capture cold first visit, warm reload, and warm visit across a release separately
for anonymous account, authenticated spawn, a biome transition, and Studio map/tool
opening. Use a dedicated fresh browser profile plus a retained profile, a pinned
spawn/appearance/content revision, one desktop and one representative phone, and
a stated throttled network profile. Record request/body totals, compressed bytes,
JS execution/long tasks, index/category parsing, image readiness, loaded-page decoded
estimates, first usable shell, first visible complete world, and first accepted input.
Use repeated runs and report medians/tails with sample counts; existing image
`readyMs` is request-through-onload and cannot be labelled decoder CPU time.

Add an unrelated content pack and repeat the identical spawn test. Its critical
payload should remain unchanged apart from a bounded release lookup. Repeat with
one edited sprite: only affected packed files/metadata should lose cache reuse.
Exercise two releases with an old open tab, offline shell/update flow, failed fetch,
quota exhaustion, and rollback. Preserve full gameplay/content checks and the
reviewed Studio guard for implementation PRs.

## Follow-up handoff

This is a completed audit, not an implemented optimization or a promised speedup.
Branch: `docs/frontend-asset-delivery-audit`, based on `1d2462cd`. Deliver via a
GitHub PR; do not merge without instruction. The first bounded implementation
should fix hashed static-file caching and add header acceptance checks, alongside
a baseline of the entry graph. Content-addressed atlas delivery and visible-world
loading need their own reviewed design/spec before implementation.

Studio editor work must use `/home/toby/projects/orchard-cellar-studio-release`
and the guarded staged integration procedure in
[`ops/orchard-runtime/README.md`](../ops/orchard-runtime/README.md). Main contains
the retired renderer. Do not rebuild/deploy it by bypassing its prebuild guard.
The primary checkout had unrelated AGENTS/changelog/icon-audit work; this audit uses
an isolated worktree and does not include those edits.

Validation for this documentation PR: public GET sampling; installed output size,
manifest and SHA-256 analysis; browser resource inventory; source cross-checks;
relative documentation-link and evidence assertions; `git diff --check`.
Application tests/builds are not rerun for documentation-only changes. No release,
service configuration, asset bytes, version, or stored world state is changed.

## External references checked for this audit

- [MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching): immutable caching requires stable resource identity; `no-cache` permits storage with revalidation, unlike `no-store`.
- [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control): long-lived caching for hashed static URLs.
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): browser-managed cache storage is quota-limited and can be evicted.
- [Vite static deployment](https://vite.dev/guide/static-deploy): `vite preview` is not intended as a production server.
