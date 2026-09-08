# 59 — Client Render Performance Recovery Plan

Implementation plan, **2026-09-06**. Status: **adopted — owner confirmed decisions A1, B2 and C (experimental WebGL2 toggle) on 2026-09-06; Canvas recovery implemented with measured residuals; A-19 Canvas release deployed on 2026-09-08 after explicit owner Go, P8 general sampling/hardware performance still open; see §9**.
Companion to [21](21-unified-renderer.md) (Canvas composition),
[47](47-rendering-lighting-performance-plan.md) (performance program, M9 atlas
pages, M11 backend gates), and
[58](58-seasonal-lighting-and-baked-shadow-plan.md) (seasonal lighting and
baked-shadow omission, whose 0.5.x releases this plan optimises).

This plan responds to a code and evidence review of the shipped seasonal
lighting system. It fixes every issue that review found, in dependency order,
with measurable exit gates. It does not change gameplay, authority state, art
pixels, or the visual contract of Dynamic and Basic lighting except where a
milestone says so explicitly and the owner has approved it in §3.2.

## 1. Goal and scope

Return the client to a sustained 60 Hz presentation with Dynamic lighting on the
desktop reference device, and to a playable, non-degrading frame rate on the
owner's iPad, without giving up the exact-pixel shadow omission, moving sun/moon
shadows, per-receiver RGB, or Basic fallback delivered in doc 58.

Proposed budgets on the doc 47 reference protocol (5-second warm-up, 30-second
active-rAF sample, matched viewport/DPR/zoom/content):

| Measurement | Today (0.5.0 evidence) | Canvas target after P6 | WebGL2 default-on gate (P8) |
|---|---|---|---|
| Basic whole-frame p95, desktop 1280×720 | 13.4 ms | ≤ 6 ms | doc 47 §15: ≥ 25 % below Canvas |
| Dynamic whole-frame p95, desktop 1280×720 | 21.5 ms | ≤ 10 ms | doc 47 §15: ≥ 25 % below Canvas |
| Dynamic whole-frame p95, physical iPad | unmeasured | ≤ 16 ms | no low-end p95 regression > 5 % |
| Long tasks ≥ 50 ms during play | unmeasured | 0 | 0 |

The "today" numbers are CPU submission times from
`output/lighting-58-20260906/release/performance.json`; GPU completion and
physical low-end results were explicitly not claimed there. P0 establishes them.

Out of scope: WebGPU, normal maps, new lighting features, authority changes,
Studio rendering (it may adopt the same engine changes later), and audio.

## 2. Findings

### 2.1 Measured

- Basic, with **all** lighting work bypassed, already spends 11.4 ms p50 and
  13.4 ms p95 per frame. Lighting is therefore at most a third of the problem;
  fill rate and per-sprite Canvas 2D work are the rest.
- The local light flood is not the cost: 568 texels visited and 0.1 ms in the
  Dynamic sample, despite 661 field rebuilds over 1,489 frames.
- The evidence records whole-frame percentiles and lightmap counters only. The
  `painterDraw`, `ground`, `uiDraw` and `finalWorldComposite` stages exist in
  `RenderMetrics` but were not captured, so the 8 ms Dynamic delta has never
  been attributed to a stage.
- The iPad regression fixed in 0.5.1 was canvas exhaustion from the tint cache.
  Physical iPad confirmation is still outstanding in every 0.5.x ledger entry.

### 2.2 Read from the code

| # | Finding | Where | Effect |
|---|---|---|---|
| F1 | World pass renders at `ceil(zoom × dpr)` integer scale, up to 4096×2304. Every sprite draw, multiply plane and tint copy runs at device pixels. | `packages/engine/src/renderer.ts` `worldPassLayout` | At zoom 3 / DPR 2 this is 36× the pixels of a 1× world pass. Dominant on iPad. |
| F2 | `atlas_characters_*.png` is 512×52032 (106 MB decoded RGBA). | `packages/assets/generated/`, `packages/tools/src/build-atlas.ts` | Exceeds common GPU texture height limits and iOS canvas area limits; forces software paths or tiling. Doc 47 M9 already planned 512×2048 / 4 MiB pages. |
| F3 | Baked-shadow omission copies each frame into its own canvas at runtime (up to 512 surfaces, 8 MiB, LRU, pinning, streaming, fallback-to-Basic). | `packages/ui/src/asset-frame-source.ts` | Per-sprite source switching defeats draw batching; the machinery caused the 0.5.5 flicker and needed 0.5.6. |
| F4 | Receiver tint copies each (frame, exact RGB) into its own canvas with a three-pass composite (copy, multiply, destination-in); 256 surfaces, 4 MiB. Sun/moon visibility per sprite is continuous and sky RGB drifts, so keys churn. | `packages/engine/src/receiver-frame-source.ts` | More source switching; rebuild bursts when the sky colour steps. |
| F5 | Any change to the caster array reference clears every prepared height and coverage field. The renderer swaps the array whenever a caster's fractional position changes, i.e. every frame while anyone walks. | `receiver-lighting.ts` `prepare`, `world-lighting-renderer.ts` `begin` | The full ground coverage raster (all casters × mask area) is rebuilt every moving frame. |
| F6 | Ground planes call `rasterize` directly and allocate a new `ImageData` and `putImageData` every frame; `rasterizeCached` exists and is unused. | `world-lighting-renderer.ts` `plane` | Redundant merge and upload per level per frame. |
| F7 | Each projected cap run performs three canvas operations into a scratch canvas every frame with no cache. | `world-lighting-renderer.ts` `groundSource`, `ground-cache.ts` `drawProjectedRun` | Proportional to visible runs, every frame. |
| F8 | Every non-flat sprite loops all casters at its height in `scene.sample`. | `receiver-lighting.ts` `sample` | O(sprites × casters) mask samples per frame although a rasterised coverage field already exists. |
| F9 | Per-frame string work: caster placement signature (join of every caster position), moving-caster signature, `lightingOwner` template strings per sprite and per caster, tint and mask cache keys, a `Set` of static owners. | `world-lighting-renderer.ts`, `overworld-main.ts` ≈5474–5479 | Allocation and hashing on the hot path. |
| F10 | Painter overhead present in Basic: two `save`/`restore` per sprite, a regex on `item.tie` per enqueue, array copy plus `localeCompare` in the depth sort, `context.filter` for dimmed and hit-flash sprites. | `overworld-main.ts` `enqueueWorldDepth`, `renderer.ts` `compareWorldDepthItems`, `overworld-art.ts` ≈1326/3420, `overworld-ui.ts` ≈3592/3976 | `filter` forces a slow path in Chromium and WebKit; the rest is per-item CPU. |
| F11 | Display and world contexts are created with `getContext('2d')` and no attributes. | `renderer.ts` constructor | `alpha: false` on the display canvas lets the compositor skip blending the page behind it. |
| F12 | The HUD redraws fully into the display context every frame regardless of change; there is no low-end frame-rate option. | `overworld-main.ts` uiDraw stage, `loop.ts` | Battery and thermal cost on mobile; avoidable work. |
| F13 | Doc 47 M11 gates WebGL2 on optimised Canvas still violating the 4 ms renderer budget. Basic alone is at 13.4 ms. | doc 47 §15 | The gate condition is already met; the decision is when, not whether, to evaluate it. |

## 3. Decisions and invariants

### 3.1 Binding for this plan

1. **Measure before and after every milestone.** A milestone is complete only
   when its ledger entry records stage p95s on the desktop reference and, from
   P1 onward, on the physical iPad. Whole-frame numbers alone are insufficient.
2. **Visual contract preserved.** Dynamic keeps exact declared-pixel omission,
   moving sun/moon/contact shadows, per-receiver RGB and the blue full-moon
   palette. Basic keeps original art and one uniform tint. Existing pixel
   goldens and accepted review artifacts remain the acceptance reference.
3. **Original artwork remains immutable at runtime.** No milestone mutates a
   loaded atlas image (doc 58 D4 stands regardless of §3.2 decision A).
4. **Zero per-frame surface allocation in steady state** for both qualities.
   Counters, not assertions, prove it.
5. **Delete replaced machinery.** When a milestone removes the need for a cache,
   budget, or fallback path, the code and its tests are removed in the same
   change, not left dormant.
6. **Doc 47 §15 technical rules stay in force for WebGL2.** Capability
   interfaces first, nearest-filtered inputs, no GPU→CPU readback, context-loss
   restoration, explicit disposal, Canvas fallback, and the §15 adoption
   numbers before WebGL2 may become the default. This plan changes only the
   *entry* condition: the backend is built as an owner-approved experimental
   feature rather than waiting for a Canvas budget failure.
7. **Canvas 2D remains the reference implementation and the default** until
   the doc 47 §15 adoption gate passes and DECISIONS.md records the change.
   P0–P6 proceed regardless of WebGL2 progress; the Canvas path is what most
   players run and what the goldens define.

### 3.2 Owner decisions (confirmed 2026-09-06)

**A. Shadowless artwork delivery (P3): A1 adopted.** The atlas builder emits,
per page, a second PNG with the declared spans cleared. The client loads exactly
one variant per page for the active quality and reloads on quality change.
Download grows by roughly the compressed size of the affected pages (all 36
atlases total 4.6 MB today; cleared pages compress smaller). This amends doc 58
D1 and D3: there is still one authored asset, one asset ID and one source PNG;
the variant is disposable build output derived from the sole colour
declaration, exactly as the spans are. `AssetFrameSourceCache`, its budget,
pinning, streaming preparation and fallback states are deleted in P3. The
rejected alternative (one-time runtime page copies) is not kept as a fallback.

**B. World-pass resolution (P1): B2 adopted.** Default world pass is 1× world
pixels with a two-stage upscale. Video gains a "World scale" option
(`1×` default, `2×`, `Native`) so a player who prefers device-pixel sprite
motion can restore it. The option persists with the other Video settings.

**C. WebGL2 (P8): experimental client-side feature, adopted.** A WebGL2 world
pass is built behind a Video toggle labelled **Experimental: WebGL renderer**,
off by default, persisted per client. It is not gated on P6 failing and may be
developed in parallel with P4–P6 once P0 and P2 exist. Turning it on swaps
only the world pass; the HUD stays on Canvas 2D (doc 47 §15 topology A). Any
failure (no WebGL2, shader compile error, unrecovered context loss, budget
throw) reverts that session to Canvas, records the reason in diagnostics and
the Video footer exactly as the Dynamic fallback does today, and leaves the
toggle on so the player can see why. Making WebGL2 the default is a separate
decision under doc 47 §15's adoption numbers. Per §15, docs/01 and docs/21 are
updated to name the experimental backend before prototype code lands.

## 4. Target architecture

- **World pass** renders at world resolution (or a small integer multiple) into
  a bounded canvas; one nearest-neighbour integer upscale plus one fractional
  smooth composite present it. HUD stays on the display context as today.
- **Artwork sources** are bounded atlas pages (≤ 512×2048, ≤ 4 MiB). Dynamic
  draws from build-time shadowless `.omit` pages. There is no runtime
  filtering and no per-frame frame-surface cache.
- **Directional coverage** is two fields per level: a cached static field keyed
  on quantised sky geometry and 4-px camera window, and a per-frame moving
  overlay containing only actors. Sprite receivers sample the merged field at
  their foot in O(1).
- **Receiver tint** is quantised to 5 bits per channel and served from a few
  shared tint pages (shelf-packed 512×2048 canvases) so consecutive sprites
  draw from the same source. Pre-dimmed and hit-flash variants come from the
  same pool, replacing `context.filter`.
- **Cap runs** draw untinted into a per-level cap layer that receives one
  multiply of its plane, replacing per-run composites.
- **Painter** uses numeric sort keys and a kind enum; one `save`/`restore` per
  item.
- **Metrics** attribute every millisecond to a stage and expose per-frame
  counters for source switches, tint builds, coverage rebuilds and allocations.
- **Experimental WebGL2 world pass** behind a Video toggle: the same painter
  order and the same scene inputs (pages, coverage fields, lightmap, receiver
  RGB) drive a sprite batcher and one fragment shader instead of Canvas
  composites. Canvas stays the reference; the backend boundary is a
  `WorldPassBackend` interface implemented by both.

## 5. Milestones

Dependencies: `P0 -> P1`; `P0 -> P2 -> P3`; `P0 -> P4 -> P5`; `P0 -> P6`;
`P1 + P6 -> P7`; `P0 + P2 -> P8` (experimental backend), and
`P1..P7 measured + P8 shipped -> P8 default-on decision`. P1, P2/P3, P4/P5,
P6 and P8 are independent and may proceed in parallel after their inputs.

Each milestone records changed files, commands, artifact paths, unresolved
failures and measured counters in §9.

### P0 — Attribution and device baseline

**Files:** `packages/engine/src/metrics.ts`, `overworld-main.ts` metrics
snapshot (≈8092), `receiver-frame-source.ts`, `asset-frame-source.ts`,
`receiver-lighting.ts`, `world-lighting-renderer.ts`,
`render-benchmark-scenarios.ts`, new Playwright capture under `output/`.

1. Add per-frame counters: distinct `drawImage` sources, tint builds/reuses,
   filtered-frame builds, coverage field rebuilds, prepared-height rebuilds,
   `groundSource` operations, `ImageData` allocations, `save`/`restore` pairs.
   Reset per frame; expose in diagnostics and the metrics snapshot.
2. Capture stage p50/p95/p99 for every `RENDER_STAGE_IDS` entry in the
   performance script, not just whole-frame and lightmap counters.
3. Add a benchmark scenario that reproduces the 0.5.0 gameplay sample
   (visible caster count, sprite count, cap runs, one walking actor).
4. Run the protocol on the desktop reference and the physical iPad for Basic,
   Classic and Dynamic. Record device, OS, browser, DPR, zoom, resolution.

**Exit:** ledger table of stage p95s and counters per mode per device. This is
the baseline every later milestone diffs against.

**2026-09-06 implementation amendment:** the retained 0.5.0 evidence has no
camera/placement replay or caster/cap-run counts, and the supplied implementation
is already 0.5.7. Use the newly captured live 0.5.7 stationary/walking workload
as the forward comparison baseline, retaining the old 13.4/21.5 ms numbers as
historical reference only. Report workload counts and route limitations rather
than claiming an exact 661-item reconstruction. The nested-terrain golden is
the cap visual reference; a representative cap performance sample remains an
explicit qualification gap to close before claiming P7's cap improvement.
This evidence limitation does not change the performance targets or A1/B2/C.


### P1 — World-pass resolution (decision B2)

**Files:** `renderer.ts` (`worldPassLayout`, `worldPassCapacity`,
`compositeWorld`), `renderer.test.ts`, `display.ts`, `overworld-main.ts`
(`integerScale` consumers, ≈4169), Video settings in `overworld-ui.ts`,
`lighting-quality.ts` Basic tint (still one fill, now at world size).

1. Add a world-pass scale policy: `1x` (default), `2x`, `native` (today).
   Expose it in Video as "World scale" and persist next to lighting quality.
2. Two-stage present: nearest-neighbour upscale to the largest integer factor
   that fits the display, then one smooth `drawImage` for the fractional
   remainder. Zoom animation must not reallocate (keep `worldPassCapacity`).
3. Audit every draw that rounds to `scale` (sprites, chunks, runs, planes,
   weather, cutaway) so nothing assumes `scale ≥ 2`.
4. Multiply planes, tint pool and cap layers inherit the smaller size for free.

P1 implementation amendment (2026-09-06): the P0 capture's display metadata
must now report the selected scale and active world pixels rather than its
original hard-coded Native label. The first nine-policy/mode walking review
also exposed that four 500-ms legs do not close over a 35-second protocol;
use four 625-ms legs (fourteen complete squares) and pin the presentation-only
camera/sky for the controlled desktop comparison. Retain the first captures
as unmatched visual evidence. This minimally extends P1 to
`gameplay-render-protocol.ts`, `render-protocol-walk.ts` and the UI structural
seam test; it changes no shared world state or settled rendering decision.

**Tests:** layout tests for all three policies at DPR 1/2/3 and fractional
zoom; pixel golden at 1× against today's native output downsampled; no
capacity growth during a zoom sweep.
**Exit:** world-pass pixel count and `finalWorldComposite`/`painterDraw` p95
recorded per policy on both devices; visual review of walking motion in each
policy accepted or B revised.

### P2 — Bounded atlas pages (doc 47 M9 page format)

**Files:** doc 47 §13 primary files; the immediate driver is
`build-atlas.ts` (`ATLAS_WIDTH = 512`, single page per category) and
`packages/ui/src/assets.ts` (`manifest.atlases[category:season]`).

1. Execute doc 47 M9 page-format items 1, 2, 3, 5 and 7: cap pages at
   512×2048 and 4 MiB decoded; keep one asset on one page; add page identity to
   built records with dual readers before writers; validate; build one page at
   a time.
2. First target is `characters` (106 MB decoded → about 27 pages). `props`,
   `tiles` and `ui` are 3.6–4.9 MB and sit at the cap; split if over.
3. Loading follows doc 47 M9 loading items as far as needed to keep startup
   equal or better; content addressing and service-worker retention (items 6
   and 8) proceed under doc 47 on its own gate and are not required for P3.

P2 implementation amendment (2026-09-06): include loaded-page dimensions,
decoded bytes and image request-to-ready timings in the existing one-button
protocol JSON. This minimally extends `gameplay-render-protocol.ts`; the data
comes from the new page loader and does not run in the steady-frame path.
Desktop decoder-only CPU timings are captured separately with Chromium trace
events, rather than mislabelling request/onload latency as pure decode time.

P2 decoded-image amendment (2026-09-06): the first paged startup capture
found the client sign-in backdrop at 1536×1024 / 6 MiB. Include
`packages/ui/src/orchard-backdrop.ts` and new backdrop tile loader/builder/tests
to compose its original pixels from three 512×1024 generated tiles. Preserve
the original PNG used by existing Keycloak/PWA tooling. This closes the same
4-MiB decoded-image cap; it adds no new artwork or service-worker retention scope.

**Tests:** builder rejects an asset larger than a page; every page under both
caps; manifest round-trip through old and new readers; all 36 current PNGs'
frame pixels reproduced byte-exact on their new pages.
**Exit:** no decoded image over 4 MiB in the running client; startup decode
time and memory recorded; iPad no longer reports texture or canvas limits.

### P3 — Shadowless page variants (decision A1)

**Files:** `build-atlas.ts`, `packages/tools/src/assets/baked-shadow.ts`,
`packages/tools/src/validate-assets.ts`, `packages/ui/src/assets.ts`,
`asset-frame-source.ts` (delete), `world-asset-presentation.ts`,
`world-lighting-renderer.ts` (`WorldShadowAssets`, delete), `overworld-main.ts`
(`shadowAssets`, readiness and fallback paths ≈4080–4092, 4155),
`lighting-quality.ts`, `pwa-service-worker.ts` (variant discovery),
doc 58 §3 D1/D3 and §5.1 amendment notes.

1. Builder emits `<page>.png` and `<page>.omit.png` (declared spans cleared,
   everything else byte-identical) with one shared frame table; the manifest
   lists both. Pages with no declared assets have no variant. The builder
   asserts that the variant differs from the original only inside declared
   spans.
2. Loader selects the variant by requested quality. A quality change reloads
   affected pages behind the existing generation guard and keeps the previous
   complete presentation until every page is ready (doc 58 D10). Classic and
   Basic never load `.omit` pages.
3. Delete `AssetFrameSourceCache`, `WorldShadowAssets`, `prepareVisible`, the
   filtered-frame budget, pinning, streaming fallback, the `filteredFrames`
   diagnostic and their tests. Dynamic readiness reduces to "variant pages
   loaded". UI thumbnails and Studio keep using original pages.
4. Update doc 58 D1/D3 text with the amendment and cross-reference this plan.

**Tests:** pixel comparison of every declared frame equals original minus
declared spans (reuse the 344-asset comparison from 0.5.5); zero filtered
surfaces allocated during 600 frames of walking; quality switch shows no
mixed frame.
**Exit:** distinct-source counter for artwork equals loaded page count, not
sprite count; `painterDraw` p95 delta recorded.

**2026-09-06 P3 implementation scope amendment:** deletion also updates the
UI index exports and structural-seam digest, removes/replaces old engine cache
tests, and migrates `lighting-review.ts`, `celestial-shadow-review.ts` and
`world-lighting-review.ts` to builder-produced omit inputs/page cohorts. These
are required consumers of the deleted classes. Review-only historical inputs
retain their original PNGs/frame tables; the same builder span assertion emits
their tiny omit PNGs offline. No runtime filtering compatibility implementation
is retained. Existing PWA generated-prefix discovery already accepts `.omit.png`
and preserves revision query keys; a new executable test proves this, so no
service-worker retention or content-addressing work is added.

### P4 — Directional coverage: static/moving split and O(1) receivers

**Files:** `receiver-lighting.ts`, `world-lighting-renderer.ts`,
`directional-shadows.ts`, `overworld-main.ts` (≈4293–4322 moving casters,
≈5462–5481 begin), `receiver-lighting.test.ts`, `world-lighting-review.ts`.

1. `begin` accepts `static` and `moving` caster lists. Static identity is the
   occlusion map plus 128-px bounds key already computed; do not rebuild it on
   moving changes.
2. `CelestialReceiverScene` keeps the static coverage field per level and sky
   geometry key in a retained window padded by 128 world pixels per side and
   aligned to 64 pixels (A-11 supersedes the original 4-px window key). Copy
   exact viewport texels into the working field and blit only moving casters.
   Contact coverage follows the same split.
3. ~~Merged-field lookup~~ Amended by §8 A-3: spatial index over caster
   bounds feeding the unchanged sample loop; result bit-identical.
4. Use `rasterizeCached` (or reuse one `ImageData` per level) so the RGB merge
   and `putImageData` run only when the coverage, local-light revision or sky
   signature changed.
5. Replace string signatures with numeric hashes (`mixLightHash` pattern from
   `lighting.ts`): placement, caster signature, owner identity, mask keys.
   Owner comparison becomes an integer.
6. Keep `prepareHeights` for pre-warming, generation-guarded as today.

**Tests:** static field byte-identical before and after a moving actor passes;
moving overlay contains exactly the moving casters; receiver sample from the
field equals the loop result within one 8-bit step on the review fixture;
zero coverage rebuilds over 600 walking frames with a fixed sky; zero string
allocations in `begin`/`sample` (count via a test seam).
**Exit:** `lightingReceiver`, coverage rebuilds and `painterDraw` p95 recorded.

P4 implementation OPEN (2026-09-06): step 3's proposed merged-field lookup
failed the one-byte accuracy gate in three measured representations (4-px
bilinear, 1-px bilinear, and 1-px strongest/runner-up owner fields; maximum
RGB errors 85, 87 and 50 respectively over 76,800 samples each). The
`client/performance` OPEN entry in `DECISIONS.md` records the reproducer and
requires retaining the accurate per-caster sample loop. Independent static/moving
coverage reuse and numeric-key work proceeds; constant-time ground sampling
and complete P4 acceptance remain open.

P4 implementation scope extension (2026-09-06): `lighting-types.ts` admits
numeric owner identities; `lighting.ts` exposes a monotonic local-receiver
revision that advances on rebuild and reset; the existing renderer lifecycle
test adopts the split begin API. The new upload test checks stationary and
moving 600-frame reuse and window changes. Seasonal receiver sampling, raster
merge (including coverage) and upload timings are added to the corresponding
existing stage values, so the remaining accurate caster loop is attributed.

### P5 — Tint pool and cap-layer consolidation

**Files:** `receiver-frame-source.ts`, `ground-light-source.ts`,
`world-lighting-renderer.ts` (`groundSource`, `compositeGround`),
`ground-cache.ts` (`drawProjectedRun`), `raised-terrain-depth.ts`,
`overworld-art.ts` dimmed/hit-flash draws, `overworld-ui.ts` filter uses.

1. ~~Five-bit quantisation~~ Amended by §8 A-4: exact RGB keys on tint pages;
   measure the sky-step burst per A-1.
2. Replace per-entry canvases with shelf-packed tint pages (512×2048). Key is
   (page identity, frame rect, quantised RGB). Evict by page generation, not
   per entry. Consecutive sprites with the same tint share one source.
3. Add `dim` and `hitFlash` as tint-pool variants (pre-multiplied brightness
   and saturation) and remove every `context.filter` use in world drawing.
   Gate amended by §8 A-5 (two steps). HUD skin filters are out of scope.
4. ~~Per-level cap layer~~ Amended by §8 A-6: keep per-run commands in
   painter order; cache tinted runs by (chunk, run, level, plane revision).

**Tests:** tinted pixel equals `round(src × rgb / 255)` for the quantised rgb;
no `filter` assignment in engine world code (lint rule or grep test); one
multiply per level per frame; cap-run output pixel-equal to today's within one
step on the terrain review fixture.
**Exit:** tint builds per frame ≈ 0 in steady state; `groundSource`
operations = 0; `painterDraw`/`ground` p95 recorded.

P5 feasibility OPEN (2026-09-06): three uniform five-bit representations
failed the existing one-step celestial artwork golden: nearest 32 levels,
bit replication and multiples of eight produced maximum channel errors
4, 5 and 59, with 23,028 / 25,852 / 65,540 channels above one respectively.
See the P5 OPEN decision and `output/perf-59-20260906/P5/quantization-comparison.json`.
Retain exact RGB for tint-page pooling; quantization is not accepted and P5
is not complete. The four-colour / 40-call fixture is accuracy evidence only.

P5 filter-removal OPEN (2026-09-06): three CPU brightness/saturation
representations still exceed the one-step dimming golden (maximum two, with
72 / 72 / 1,124 channels above one). Two formulas match the tested hit flashes
within one step. See `P5/filter-feasibility/filter-comparison.json` and the
DECISIONS entry; no runtime replacement or complete filter-removal claim is made.

### P6 — Painter and context hot path

See §8 A-7 for the added **P6b — retained painter commands** milestone.

**Files:** `renderer.ts` (`compareWorldDepthItems`, constructor),
`overworld-main.ts` (`enqueueWorldDepth`, `enqueueRaisedTerrainDepth`
callers), `overworld-art.ts` `drawSprite`, `renderer.test.ts`.

1. `WorldDepthItem` gains `kind: WorldItemKind` (enum) and `sortKey`
   (packed elevation/underlay/depth/phase as a float or two ints) computed at
   enqueue; `tie` becomes a numeric hash with the string kept only for debug.
   Sort in place on a reused array.
2. Remove the per-enqueue regex; use `kind` for the moving-caster test.
3. One `save`/`restore` per item: the enqueue closure sets transform, and
   `drawSprite` draws without its own save when called from the painter.
4. `getContext('2d', { alpha: false })` for the display canvas; measure
   `desynchronized: true` and adopt only if input-to-submit p95 improves with
   no tearing in the review capture.
5. Keep `renderItems` and add per-frame `save`/`restore` counts to P0
   counters.

**Tests:** sort order identical to today for a recorded frame's items
(golden); `save` count per frame equals item count; display context has
`alpha: false`.
**Exit:** Basic `painterSort` + `painterDraw` p95 recorded; Basic target from
§1 met or the gap explained.

**2026-09-06 implementation amendment:** P6 also changes the authored-map
sprite closure in `live-map-runtime.ts`, which is nested under the same painter
item and otherwise adds a second native state pair. The reviewed source-shape
digest in `phase-zero-extraction.test.ts` is deliberately recaptured for that
change; its independent package-ownership assertions remain unchanged. Legacy
queue producers retain an adapter into numeric identities so their established
lexical tie order and exact fractional foot-depth order remain stable.

### P7 — Frame pacing and HUD caching

**Files:** `loop.ts`, `overworld-main.ts` uiDraw stage (≈6179–6690),
`overworld-ui.ts`, `renderer.ts` `beginUi`/`endUi`, Video settings.

1. Optional 30 Hz presentation cap (absolute deadlines select presentations
   on 60/120/144 Hz displays while simulation keeps 60 Hz fixed steps and
   interpolation on every rAF). Default off on desktop, on when
   the P0 iPad baseline shows sustained > 16 ms.
2. HUD layer: draw the HUD into its own canvas only when its model changes
   (`uiModel`/`uiLayout` already separate model from draw); composite the
   cached layer otherwise. Nameplates and cursor overlays stay per frame.

**Tests:** 30 Hz cap halves `uiDraw`/world submissions without changing fixed
update count; HUD golden identical between cached and direct paths.
**Exit:** iPad sustained p95 and battery/thermal trace recorded per doc 47.

P7 implementation scope extension (2026-09-06): the mechanically extracted
`gameplay-loop.ts` applies the persisted policy and cross-tab changes; the existing
`gameplay-renderer.ts` and protocol capture include the applied preference.
`metrics.ts` retains skipped-rAF work until submission, with a focused attribution
test. `render-operation-counters.ts` and the protocol describe the exact interval:
first rAF after the previous submission through the current submission; earlier
async work remains excluded as in P0. Compact Video windows omit informational
placeholder rows so the three actionable controls stay clear of the footer.
The structural UI seam digest is recaptured for that reviewed control addition.
The physical iPad baseline is pending, so the default remains off on all devices.
The HUD cache retains three ordered static sections (status/watch, currency,
hotbar) while live callbacks stay direct. Native display coordinates require
three display-sized backings; renderer disposal releases their weakly registered
ownership. HUD diagnostics are recorded but excluded from configuration matching.

### P8 — Experimental WebGL2 world pass (decision C, Video toggle)

**Files:** `renderer.ts` (extract `WorldPassBackend` interface; Canvas
implementation is the existing code), new `packages/engine/src/webgl/`
(`world-pass-webgl.ts`, `sprite-batch.ts`, `shaders.ts`, `texture-pages.ts`,
`context-loss.ts` and tests), `overworld-main.ts` (`renderFrame` draws through
the backend; fallback bookkeeping beside `lightingQuality`), `overworld-ui.ts`
Video panel and footer, `lighting-quality.ts` (persistence pattern),
`metrics.ts` (`worldPassBackend` label, GPU timer query when available),
docs/01 and docs/21 (name the experimental backend before code lands).

**2026-09-07 P8 cutaway ownership extension:** the authenticated ground-plane
checkpoint identifies `terrain-cutaway.ts` Path2D clipping as a remaining
backend operation. P8 also owns that bounded hook plus `webgl/canvas-adapter.ts`,
`webgl/geometry.ts`, `webgl/shaders.ts`, `webgl/world-pass-webgl.ts` and relevant
or new tests/modules for registering and sampling reusable terrain clip masks.
These masks contain only clip coverage; original and `.omit` artwork stay
immutable. Keep Canvas geometry/order exact and retain fallback for unknown
paths. No GPU readback, CPU-resolved lighting texture or lighting intermediate
framebuffer is permitted; prove bounded memory, 600-frame surface reuse,
context restoration and the A-8 pixel/HUD gate before enabling the known paths.

Inputs: P0 counters and fixture; P2 pages (≤ 4 MiB, so every page is a
legal texture on the minimum supported GPU). P3's `.omit` pages are used as-is;
no runtime mask is needed.

1. **Backend seam first.** `WorldPassBackend` exposes begin/composite, sprite
   draw with source rect, destination, flip, receiver RGB and variant, cap-run
   and chunk draws, plane multiply, and weather/particle hooks. The painter
   and depth sort are shared; only submission differs. Canvas implements it
   with today's code and stays pixel-identical (golden-tested).
2. **WebGL2 implementation.** Pages upload once as nearest-filtered textures
   (invalidated by page revision). One interleaved vertex buffer per frame:
   position, uv, receiver RGB, variant flags. Batches break only on page
   change. Ground planes, directional coverage fields and the local lightmap
   upload as small textures each frame (they are already CPU rasters at 4-px
   or tile resolution) and are sampled in the fragment shader, so the tint
   pool (P5) and cap layer multiply are not used on this backend. Framebuffer
   is the world pass at the P1 policy size; the final present is one textured
   quad into the display canvas via `drawImage` of the WebGL canvas, or the
   WebGL canvas is the world layer under an `alpha: true` HUD canvas
   (topology A). Measure both presents; keep one.
3. **Failure policy.** No WebGL2, shader compile/link failure, `OES`/`EXT`
   requirements missing, context lost and not restored within one frame, or
   any backend throw → revert that session to Canvas, record
   `worldPassFallbackReason`, show it in the Video footer, keep the toggle
   value. Restoration re-creates textures from the same page and raster caches;
   no readback anywhere.
4. **Settings.** Video row "Experimental: WebGL renderer" (off by default,
   persisted with the other Video settings, developer diagnostic shows the
   active backend and fallback reason). Switching backends mid-session is
   allowed at frame boundaries and releases the inactive backend's GPU
   resources.
5. **Parity fixtures.** Each lighting review fixture renders on both backends.
   Gates amended by §8 A-8: experimental-enable gate two steps / 0.5 % /
   HUD exact; default-on gate one step. Add a context-loss test using
   `WEBGL_lose_context`.
6. **Default-on decision.** Separate from shipping the toggle. Requires doc 47
   §15 adoption numbers on the P0 fixture on both devices, the battery/thermal
   trace, and a DECISIONS.md entry. Until then Canvas is default.

**Tests:** backend interface goldens (Canvas unchanged); WebGL parity
fixtures; fallback reasons for each failure class; resource counts return to
zero on backend switch and dispose; no `readPixels`/`getImageData` in the
backend (grep test).
**Exit:** toggle shipped off by default; both backends' stage p95s, GPU
timings where available, and memory recorded on both devices in the ledger.

P8 accuracy OPEN (2026-09-06): three translucent shader representations fail
the one-step Canvas gate, with sprite maxima2 and4,144 /3,064 /840 channels above
one. The corrected ground residual is maximum2 /160 channels above one. The
first attempt's separate coordinate bug and all original results are preserved
under P8/webgl. Production must reject unverified receiver/ground/multiply and
source-downsampling operations, with a visible session Canvas fallback; the
internal fixture switch is never a Video option. Actual unlit source-over and
the existing seasonal fixture qualify within one step, but this does not close
the full P8 lighting/parity gate. No fourth approximation is attempted.

P8 presentation choice (2026-09-06): retain Canvas-copy. On the matched synthetic
SwiftShader fixture it is slower (composite p95 7.1ms vs layer0.5ms) but has exact
presentation pixels; the CSS pixelated layer differs by up to82 steps at the
required fractional upscale. Hardware gameplay and iPad results remain pending.

P8 integration scope extension (2026-09-06): the extracted gameplay renderer, lighting-fallback and protocol modules own client policy without further main-file logic edits. The existing receiver/ground source adapters, receiver scene and world-lighting renderer carry immutable source/RGB/raw-field metadata to the GPU hook; atlas presentation releases GPU cohorts. These bounded producer changes are needed to bypass CPU tint/scratch surfaces. Metrics and Video row helpers carry backend diagnostics. No schema, dependency or deployment changes.

P8 seam scope extension (2026-09-06): `world-pass-present.ts` gains explicit
backing disposal so the extracted Canvas backend owns its complete resource
lifetime. The existing gameplay compatibility context stays available while
semantic sprite/chunk/cap/plane/weather/particle submissions are connected to
the experimental implementation. Canvas consumes the existing prepared sprite
source; the common command also carries immutable artwork, receiver RGB and
variant metadata for GPU submission. No WebGL code or toggle ships in the
Canvas extraction commit.

## 6. Verification

Automated (run the relevant subset per milestone, all at P6):

```sh
npx vitest run packages/engine/src/renderer.test.ts packages/engine/src/metrics.test.ts
npx vitest run packages/engine/src/receiver-lighting.test.ts packages/engine/src/directional-shadows.test.ts packages/engine/src/world-lighting-renderer.test.ts
npx vitest run packages/ui/src/assets.test.ts packages/tools/src/assets
npx vitest run packages/engine/src/render-benchmark.test.ts
npm run assets:validate && npm run assets:build
npm run typecheck && npm run lint && npm test && npm run build
```

Browser and device, per milestone: doc 47 protocol on the desktop reference
and the physical iPad; stage p95 table; counter table (source switches, tint
builds, coverage rebuilds, allocations, `save` count); pixel goldens for
lighting review fixtures (`lighting-review.ts`, `celestial-shadow-review.ts`,
`world-lighting-review.ts`, terrain review); six Basic/Classic/Dynamic cycles
with zero retained lighting bytes in Basic.

Hard structural gates carried from doc 58 §10 remain: Basic does zero lighting
work; Dynamic steady state allocates no surfaces; mode changes invalidate once
per generation; directional masks rebuild only on quantised dependencies.

## 7. Release and rollback

Each milestone ships as a compatible patch or minor client release under the
2026-09-05 versioning decision, static frontend only, no world module change.
P2 follows doc 47 M9 dual-reader ordering so old sessions keep loading. P3
keeps original pages published so Basic, Classic, Studio and rollback need no
asset republish. Video policies (P1 world scale, P7 pacing, P8 WebGL toggle)
persist per client and default to the Canvas 1× path, so a regression is
recoverable by the player without a release. The WebGL2 backend is off by
default and self-reverts to Canvas on any failure, so shipping it carries no
default-path risk. Checked rollback is the previous `client-dist` as in every
0.5.x release.

## 8. Amendments after the first implementation pass (2026-09-06)

Owner-approved on 2026-09-06 after reviewing the P0–P8 ledger, the OPEN
decisions and `output/perf-59-20260906/release/authenticated-resume.md`. These
amend the milestone text above; where they conflict, this section wins. The
settled decisions A1, B2 and C are unchanged. Targets in §1 are unchanged.

State at amendment: 0.6.0 candidate `5205f9d6`, desktop 1× p95 Basic 9.5 ms
(from 13.4), Dynamic 10.5 ms (from 21.5), zero long tasks, tint/filtered/
coverage/ground-source/ImageData counters all zero in steady state, distinct
draw sources 24–26. `painterBuild` is 5.1 ms p95 in every mode and is now the
dominant cost. WebGL2 backend integrated, off by default, lit paths latched to
Canvas fallback; measured only on SwiftShader.

**A-1 Benchmark repeatability (P0).** The comparison workload is pinned:
fixed seed, fixed season (asset URLs must match the label), fixed camera
route with the local player visible and walking, content that includes cliff
cap runs, a pond, at least one carried light and at least 150 static casters.
Item count must match within ±2 % between any two samples that are compared;
otherwise the samples are reported side by side and no improvement is
claimed. Asset request logs attribute each request to the *effective* quality
at request time, not the protocol's requested mode. A sky-step frame (the
first frame after the sky RGB changes) is captured separately so tint rebuild
bursts are measured, not hidden by steady-state percentiles.

**A-2 "Zero lighting work" is a Basic requirement only.** Classic is the
legacy solver and keeps its live lightmap, ImageData allocations on bounds
change and retained lightmap bytes, exactly as doc 58 §3 D6 scoped it. Any
sentence in this plan or its kickoff prompt that extended the requirement to
Classic is withdrawn. Classic is still measured and must not regress.

**A-3 Receiver sampling (P4 step 3).** The merged-field lookup is withdrawn;
the three measured representations changed the reference result by up to 87
steps because max composition and bilinear interpolation are not the
per-caster resolve. Replace it with a spatial index over caster mask bounds
(uniform grid keyed on the 4-px window) that yields candidate lists per
receiver. The existing sample loop, its owner exclusion and its evaluation
order run unchanged over the candidates, so the result is **bit-identical**
to the full loop and the test is equality, not tolerance. No O(1) claim; the
exit is `lightingReceiver` p95 and candidate count per sample recorded.

**A-4 Tint keys stay exact RGB (P5 step 1).** Five-bit quantisation is
withdrawn. Exact RGB with shelf-packed tint pages is the accepted design; the
steady-state counters already show zero builds. The remaining risk is the
sky-step burst; A-1 measures it. If the burst exceeds 2 ms p95 on the
reference device, the accepted mitigation is to spread rebuilds across at
most two frames by drawing the previous page for one frame, recorded as a
one-frame lag in the ledger, never a colour change.

**A-5 Dim and hit-flash variants (P5 step 3).** `context.filter` output is
itself browser-specific. The gate for the CPU-derived `dim` and `hitFlash`
variants is amended to **within two 8-bit steps per channel** against the
Chromium filter reference, HUD witness exact. The formula that matched hit
flash within one step and dimming within two (brightness clamped before
saturation, 0.88 opacity in alpha) is accepted. World `context.filter` uses
are then removed; HUD skin filters are out of scope.

**A-6 Cap runs stay in painter order (P5 step 4).** Per-level flattening is
withdrawn because translucent cap artwork depends on painter order. Keep
per-run commands. Cache each tinted run by (chunk, run, level, plane revision)
so the three-operation composite runs once per plane change instead of per
frame. Exit: native `groundSourceOperations` remains zero for unchanged source/lighting
inputs in steady state. For cliff caps, the new logical `capRunComposites` counter
is at most the visible run count on a plane revision change. Record flat-sprite
composites separately; the historical counter counts three native draws per
composite across both producers and its old values must not be relabelled. A-1's workload must
contain cap runs so this is actually measured.

**A-7 Retained painter commands (new P6b).** `painterBuild` at 5.1 ms p95 is
the largest remaining stage and is present in Basic. Steps: (1) extract
painter build out of `overworld-main.ts` into a module in a no-logic-change
commit; (2) profile its producers individually (terrain projection sampling,
presentation resolution, closure and item creation, string ties, regex,
light collection) and record the split in the ledger; (3) retain per-entity
draw commands across frames keyed by entity identity, updating only position,
animation frame, terrain projection and visibility from revisions, with no
per-frame closures or string ties; (4) keep the depth sort on the retained
array. Target `painterBuild` p95 ≤ 2 ms on the A-1 workload. Golden: the
sorted command sequence for a recorded frame is identical before and after.

**A-8 WebGL2 parity gates split (P8 step 5).** Do **not** emulate the Canvas
2D operation sequence with GPU intermediate passes; Canvas 2D output already
differs between browsers by one to two steps, and reproducing Skia's
premultiplied 8-bit rounding on the GPU is not a bounded task. Two gates:

- *Experimental-enable gate* (lets a lit path run when the toggle is on):
  maximum two steps per channel on lit artwork, at most 0.5 % of channels
  above one step, zero channels above two, HUD exact. The current sprite
  (max 2) and corrected ground (max 2, 160 channels) residuals pass this
  gate. The celestial diagnostic (max 63) and source downsampling (max 138)
  are **bugs**, not rounding, and must be fixed before those paths enable.
- *Default-on gate* (unchanged): one step per channel plus the doc 47 §15
  adoption numbers on hardware. Not part of this run.

Paths that fail the enable gate keep latching Canvas with a visible reason.

**A-9 GPU performance evidence.** SwiftShader numbers are functional
evidence only. WebGL2 timing, like the iPad rows, is **owner to run** on
hardware with the release README capture steps. The ledger must not present
software-GPU timings as backend performance.

**A-10 Environment.** Authenticated capture requires an owner sign-in that
stays valid for the capture window, and the shared preview must deliver
active rAF. When either is unavailable, the agent records the block and
continues with offline goldens without relabelling them as gameplay
measurements, as it has done. Release remains **HOLD** until §1 desktop
targets are met or the residual gap is attributed per stage. The owner’s
2026-09-07 instruction, "please continue with fixes then deploy once complete",
authorizes the completed 0.6.0 client deployment after the remaining gates pass;
this supersedes the earlier stop-before-deployment boundary. Prepare and record
the exact candidate, rollback and live commands before applying that authorization.

Order of work after this amendment: A-1 → A-7 → A-3, A-6, A-5 (exact Canvas
work, any order) → A-8 bug fixes and enable-gate qualification → allocation
attribution (whole-client `surfaceAllocations` p95 1 must be owned) → final
desktop capture → owner-run iPad and GPU captures → release request.


### 8.1 Second-pass amendments (2026-09-07)

State: candidate `0685bc82`, A-1 diagnostic workload (no pond), desktop 1×
p95 Basic 6.3 / Classic 7.8 / Dynamic 16.2 ms; `painterBuild` 1.4 ms in every
mode (A-7 achieved); Dynamic `lightingMerge` 7.5 ms p95 against 1.8 ms p50;
WebGL2 lit paths latched to Canvas on clip paths, downsampling and filters.

**A-11 Static coverage hysteresis (Dynamic merge spike).** The static
coverage field is keyed on the camera's 4-px window, so each 4-px camera step
re-blits every caster. Key it instead on a padded window (viewport plus 128
world px per side, aligned to 64 px) and reuse it while the camera stays
inside; the working copy still covers the viewport. Same masks, same texels:
the result is exact. Exit: static coverage rebuilds only on 64-px boundary
crossings; `lightingMerge` p95 recorded.

**A-12 Local-light dirty rectangles.** `receiverRevision` advances on every
quarter-pixel lightmap rebuild and forces a full plane RGB merge. The
lightmap exposes the changed world bounds per rebuild (union of changed
lights' radii). The plane merge re-merges only texels inside that rectangle
plus one texel of bilinear margin; `localRevision` advances only when the
rectangle intersects the plane. Exact. Exit: Dynamic `lightingMerge` p95
≤ 1.5 ms on A-1; Dynamic whole-frame p95 remeasured against the 10 ms target.

**A-13 Present pass.** When the fractional remainder of the two-stage upscale
is exactly 1 (integer device zoom), skip the smoothing pass; the pixels are
identical. Exit: `finalWorldComposite` p95 recorded (currently 2.0 ms Basic).

**A-14 WebGL sampling gates.** Integer-ratio draws are the supported set and
must be exact via integer texel arithmetic (`texelFetch`), never interpolated
UVs. Non-integer-ratio nearest draws are a sampling-rule difference, not a
colour error: for the *experimental-enable* gate they qualify under a
texel-shift rule (source texel index differs by at most one on the
coordinate-coded probe; colour steps are not the measure). The *default-on*
gate remains exact. Add a per-producer counter of non-integer-ratio world
draws on the A-1 workload and record it; where a producer can become
integer-ratio without changing Canvas output, do so.

**A-14a Coordinate-coded probe domain (2026-09-08 owner amendment).**
The probe excludes destination phases within 1e-4 px of a half-pixel tie.
At origins 80/272/464/656 plus 0.49999/0.50001, float32 in the GPU attribute
path and Skia matrix cannot reliably represent the distinction, and rasteriser
tie rules differ. Of the original 38/720 failures, 35 collapse to an exact .5
on at least one axis; the remaining 3 have only a 2e-5-source-texel margin on
a 2× downsample axis. The unchanged investigation harness passes 864/864 at
phases 0.4, 0.45, 0.499, 0.501, 0.55, 0.6. This corrects the probe domain,
not the sampler or pixel gate: integer-ratio draws remain exact via integer
texel arithmetic; noninteger nearest draws retain the ≤1-source-texel-shift
rule with zero coverage failures. No new colour tolerance. Production sprite
producers round destinations; the preserved route tables have zero
noninteger-ratio/non-axis-aligned sprite draws. The original 2026-09-08 A-14
OPEN/third-approach conclusion is **resolved by this amendment**: the near-tie
probe defect is not a third failed sampler approach and docs15§9 does not
bar qualification/integration of the unchanged prototype. Original evidence
under P8/A14 remains untouched; new evidence goes under P8/A14a. The toggle
stays in Developer until A-14a/A-15/A-16/A-17 pass on one candidate; moving
it to Video requires a separate owner decision.

**A-15 Cutaway edges.** For the experimental-enable gate only: within a 1-px
band around clip-path edges, at most four steps; outside the band at most two;
at most 1 % of channels above one overall; HUD exact. Residuals must be shown
to lie in the band (attribution image). The Canvas cutaway path is unchanged.

**A-16 Dim and hit flash.** CSS filters unpremultiply with 8-bit rounding, so
translucent pixels cannot match a premultiplied derivation. CPU variants: at
most two steps on opaque pixels, at most eight on pixels with alpha below
255. WebGL draws the CPU-derived variant pages as textures instead of
deriving brightness and saturation in the shader; parity with the Canvas path
is then by construction.

**A-17 Fallback accounting.** Session latching on an unverified operation
stays. After A-14 to A-16, the A-1 workload must encounter zero fallback
reasons with the toggle on; record the encountered set per run. The toggle
is useless while any gameplay path latches.

**A-18 Workload and review.** Two pinned routes are acceptable: the cliff and
carried-light route already in use, and a pond route. Report both. The shared
browser is not required for visual review; Playwright screenshots under
`output/` are the evidence and the owner reviews them.

**A-19 Release decoupling (owner decision, pending "Go").** Canvas gains ship
as 0.6.0 independently of WebGL parity. Until the experimental-enable gates
pass, the WebGL toggle moves from Video to Developer settings so no player
sees a control that always falls back. Per the 2026-09-08 follow-up, a later
move back to Video requires a separate owner decision; passing the functional
gates does not itself authorize that UI change.

Order: A-11, A-12, A-13 (exact Canvas, remeasure Dynamic) → A-16 → A-14 →
A-15 → A-17 qualification on A-1 → release request per A-19.

## 9. Bookkeeping and execution ledger

### 2026-09-06 — plan authored

Sources: doc 58 §12 ledger (0.5.0–0.5.6), `output/lighting-58-20260906/release/`
(`performance.json`, README), and a code read of `renderer.ts`,
`world-lighting-renderer.ts`, `receiver-lighting.ts`, `directional-shadows.ts`,
`receiver-frame-source.ts`, `ground-light-source.ts`, `asset-frame-source.ts`,
`ground-cache.ts`, `lighting.ts`, `build-atlas.ts` and the `renderFrame` path
in `overworld-main.ts`. Atlas dimensions read from the generated PNG headers.

Indexed in docs/00; amendment pointer added to doc 47.

### 2026-09-06 — owner decisions confirmed

The owner confirmed A1 (build-time `.omit` page variants, amending doc 58
D1/D3), B2 (1× world pass default with a Video "World scale" option), and
directed that WebGL2 ship as an experimental client-side Video toggle, off by
default, rather than waiting on a Canvas budget failure. §3.2 and P8 were
rewritten accordingly; DECISIONS.md records the three decisions; doc 58 §3
carries the D1/D3 amendment note. Nothing implemented yet. Next step is P0.

### 2026-09-06 — P0 preflight

The supplied workspace is version 0.5.7 with 2,212 modified/untracked/staged
paths. Integration uses `/home/toby/projects/orchard-cellar-perf59` on
`perf59-integration`, seeded from current source; the original index is untouched.
Snapshot commit `3cfbf395` is a preservation checkpoint, not a qualified release.
The initial `npm run check` passed lifecycle integrity, world build and types,
then failed with 778 lint errors exclusively in historical `output/playwright/`
artifacts. The bounded preflight exception excludes that directory in ESLint;
new `output/perf-59-*` harnesses and application source remain checked.
Evidence: `output/perf-59-20260906/P0/check-initial.log`,
`preexisting.patch`, `preexisting-status.txt`, `integration-baseline.txt`.
P0 is not complete; no performance or visual acceptance is claimed.

P0 gameplay access is OPEN after three approaches: the existing development
database never completes current clock/environment subscriptions; a fresh
`orchard-cellar-dev-perf59` database built from unchanged authority source rejects
the local profile (`authentication_invalid_issuer`); canonical shared-browser
sign-in requires credentials with no active OIDC session. No auth policy was
changed. The sub-millisecond loading-screen readings (zero world items/chunks)
are rejected as baseline evidence. `P0/local-start.png` records that state.

The isolated worktree also exposes three release dry-run tests that require the
canonical repository path (`P0/release-continuity.log`). Therefore verified task
edits are mirrored into the original workspace for `npm run check`, with its
pre-existing index preserved. Commits stay on the integration branch.

P0 status: **incomplete, blocked at authenticated gameplay baseline**. No renderer
code, counter instrumentation, capture button, or 0.6.0 release candidate has
landed. P1–P8 are unstarted because their P0 dependency has no measured exit.
The complete preflight handoff is `output/perf-59-20260906/P0/README.md`.

| Device / modes | Stage p50/p95/p99 | Per-frame counters | Status |
|---|---|---|---|
| Local Linux Chromium, Basic/Classic/Dynamic | not measured in gameplay | not instrumented | blocked; loading-screen results rejected |
| Shared desktop Chromium, Basic/Classic/Dynamic | not measured | not instrumented | signed out; credential form reached |
| Physical iPad, Basic/Classic/Dynamic | owner to run | owner to run | protocol button and exact steps still pending implementation |

Original PNG verification: **36/36 unchanged**; largest decoded image remains
106,561,536 bytes. No later milestone's structural or timing gate is claimed.

The canonical preflight check finished in 803.12 s: **564 suites / 3,403 tests
passed; three suites / four tests failed**. All four are stale baseline
assertions: farmcraft now uses the existing exact Cute Fantasy apple, two shadow
tests still expect the pre-0.5.6 unprepared-frame error, and the structural seam
digest predates the current shared export/Video selector. The bounded test-only
correction records exact apple provenance, synchronous frame build/reuse and
surface-unavailability semantics, and re-pins the preserved 0.5.7 seam digest.
Every seam matches snapshot `3cfbf395`; individual source hashes are in
`P0/structural-baseline-hashes.json`. No runtime, artwork or auth change is made.

The first focused correction exposed two further existing derived skill icons
(anvil and fishing rod). The provenance fixture now explicitly checks the three
approved source-asset references; all other icons retain their native source
region/provenance assertions. No artwork is changed.

Preflight commands (no production publish):

```sh
npm run check
npx vitest run packages/tools/src/assets/skill-icons.test.ts packages/client/src/phase-zero-extraction.test.ts packages/engine/src/shadow-presentation.test.ts
npx eslint packages/tools/src/assets/skill-icons.test.ts packages/client/src/phase-zero-extraction.test.ts packages/engine/src/shadow-presentation.test.ts
VITE_ENABLE_LOCAL_PROFILES=true VITE_SPACETIMEDB_DATABASE=orchard-cellar-dev npm run dev -w @orchard/client -- --port 5180
spacetime publish orchard-cellar-dev-perf59 --no-config --server http://127.0.0.1:3000 --module-path packages/world --delete-data=never --yes
VITE_ENABLE_LOCAL_PROFILES=true VITE_SPACETIMEDB_DATABASE=orchard-cellar-dev-perf59 npm run dev -w @orchard/client -- --port 5180
```

The focused corrected fixtures pass **3 suites / 10 tests**, and scoped lint
passes (`P0/preflight-corrections-2.log`). Full verification of the settled
files is recorded separately in `P0/check-settled-preflight.log`.

Final settled preflight gate: **`npm run check` exit 0**, **567 suites /
3,407 tests passed**, test duration **817.95 s**; sim line coverage **92.38%**.
Lifecycle integrity, checked world build, all workspace typechecks, lint,
coverage thresholds and validation of **1,021 art assets, 3 songs, 10 SFX,
55 palette colours and four seasonal remaps** pass. The four edited code/test
files stayed unchanged throughout this gate; **36/36 original atlas PNGs remain
byte-identical**. Evidence: `P0/check-settled-preflight.log` and
`P0/settled-task-hashes.json`. This is preflight qualification only: P0 has no
gameplay stage measurements or instrumentation, and its authenticated-session
blocker remains OPEN. No 0.6.0 version bump, candidate build, or production
deployment was performed.

### 2026-09-06 — P0 resumed: attribution implementation

Owner login resolved the previous authentication entry. Canonical gameplay was
confirmed with 729 render items and 28 resident ground chunks. Those rolling
60-frame metrics are an access check, **not** a protocol baseline. The private
candidate preview is `https://orchard.tail7a58a6.ts.net:5181/`; canonical visual
reference remains `https://orchard.dastari.net/`. No production service or
served build was replaced. A temporary Tailscale certificate lives under
`/tmp/orchard-perf59-tls/`, outside artifacts and version control.

Mechanical extraction `a7070426` moves only gameplay metrics state/snapshot
access into `gameplay-render-diagnostics.ts`. Its full `npm run check` passed
**567 suites / 3,407 tests**, duration **827.66 s**, with asset validation green.
Evidence: `P0/check-diagnostics-extraction.log`. Instrumentation work follows
that commit in the extracted/new modules.

The P0 scope includes the minimal Render-panel UI hook and its reviewed
structural seam digest, as recorded in DECISIONS.md. New counters distinguish
exact tint cache hits (`tintReuses`) from recycled tint canvases
(`tintSurfaceReuses`). Native Canvas counters cover the whole client, including
HUD and offscreen construction; their support flag is false outside an active
probe. Semantic counters remain available. The 16,384-frame capture buffer
copies completed-frame timings, resets inactive stages each rAF, accumulates
repeated fixed updates, and rejects overflow, hidden tabs and loading frames.
The three reserved solve stages remain explicitly unsupported.

The earlier `release/gameplay-acceptance.json` supplies a 661-item reference
and Linux Headless Chrome provenance. It supplies neither visible caster/cap
run counts nor exact placements. The new `client-0.5.0-recovery` descriptor
preserves that limitation explicitly; exact old-content reproduction is not
claimed. Current live-scene measurements must retain their own content counts.

Shared-browser qualification currently remains OPEN: explicit open/show still
reports `visible:false`; focusing the page does not deliver an active rAF;
resizing times out. Screenshot calls also fail. Manual `update`/`render` can
produce 403 items in the candidate, proving data/render availability, but is
excluded from protocol measurements. Local Playwright runs the real client;
no CPU throttling is substituted for physical iPad results.

Physical iPad: **owner to run**. On the candidate, open the gameplay System
menu → Developer → Render → **Run protocol + copy JSON**. Keep the PWA visible
for all three modes (5-second warm-up + 30-second capture each). The action
closes the panel, runs Basic/Classic/Dynamic and restores prior lighting. It
copies JSON on completion; if Safari rejects deferred clipboard writing,
reopen Render and tap **Copy capture JSON**. Record iPad model and Safari/iPadOS
version alongside the exported browser/DPR/resolution metadata. No desktop
throttling result is an iPad result.

#### P0 preliminary stationary desktop sample (not the walking exit gate)

Device: orchard, AMD Ryzen 9 9955HX; Linux 6.17.2-1-pve; Headless Chrome 152.0.7977.64; 1280×720 CSS, DPR 1, browser zoom 100%, world zoom 2, Canvas native world policy. No CPU throttling. Source: instrumented worktree based on `adae7adc` with mechanical extraction `a7070426`; this preliminary sample predates the walking driver. Artifact: `P0/desktop-local.json`, `P0/local-device.json`, `P0/local-authenticated.png`, command `node output/perf-59-20260906/P0/capture-local.mjs`.

| Stage (ms p50 / p95 / p99) | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 11.900 / 14.200 / 16.400 | 14.700 / 16.800 / 18.900 | 17.100 / 20.000 / 23.300 |
| snapshotPrepare | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.100 |
| ground | 0.300 / 0.500 / 0.500 | 0.300 / 0.400 / 0.500 | 0.300 / 0.500 / 0.600 |
| painterBuild | 4.500 / 5.700 / 6.800 | 4.300 / 5.400 / 6.200 | 4.400 / 5.300 / 6.100 |
| painterSort | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 |
| painterDraw | 1.600 / 2.100 / 2.400 | 1.600 / 2.100 / 2.400 | 2.400 / 3.100 / 4.000 |
| weather | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.200 / 0.300 |
| lightingBoundsResize | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.100 | 0.000 / 0.000 / 0.100 |
| lightingOcclusionRaster | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingSolve | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.200 / 0.200 |
| lightingMerge | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 |
| lightingUpload | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.100 |
| lightingReceiver | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingComposite | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.100 | 0.000 / 0.000 / 0.000 |
| lightingStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingDynamicSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| finalWorldComposite | 0.600 / 0.800 / 1.000 | 4.000 / 4.600 / 5.100 | 3.100 / 3.600 / 4.000 |
| uiModel | 0.500 / 0.600 / 0.700 | 0.400 / 0.600 / 0.700 | 0.400 / 0.600 / 0.700 |
| uiLayout | 0.500 / 0.700 / 0.800 | 0.500 / 0.600 / 0.800 | 0.500 / 0.600 / 0.900 |
| uiDraw | 3.300 / 4.400 / 4.800 | 3.200 / 3.700 / 4.100 | 3.100 / 3.600 / 4.300 |
| fixedUpdate | 0.200 / 0.300 / 0.400 | 0.100 / 0.200 / 0.300 | 0.100 / 0.200 / 0.300 |
| catchUp | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.200 / 0.300 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter (p50 / p95 / maximum) | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1713 / 2043 / 2044 | 1715 / 1715 / 1716 | 1716 / 1717 / 1847 |
| distinctDrawImageSources | 39 / 40 / 40 | 41 / 41 / 41 | 118 / 123 / 163 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 1 / 69 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 311 / 311 / 311 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 52 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 1 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 1 / 1 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 1 / 1 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 1 / 1 |
| saveCalls | 653 / 660 / 660 | 654 / 654 / 654 | 654 / 654 / 654 |
| restoreCalls | 653 / 660 / 660 | 654 / 654 / 654 | 654 / 654 / 654 |
| saveRestorePairs | 653 / 660 / 660 | 654 / 654 / 654 | 654 / 654 / 654 |
| surfaceAllocations | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 42 |

Samples: Basic 1,800 frames; Classic 1,795; Dynamic 1,626. All three recorded zero long tasks ≥50 ms. Lighting bytes after capture: Basic **0**, Classic **170,752**, Dynamic **4,574,577**. Basic/Classic semantic tint/filter/coverage/ground-source counters are all zero; Classic still executes its existing lightmap stages, so zero total Classic lighting work is **not** claimed. Dynamic still builds filtered frames (maximum 1/frame), tint frames (maximum 69/frame), coverage (1/frame), ImageData (1/frame), and surfaces (maximum 42/frame). These are measured baseline failures for the later milestones.

The current scene has 375 render items, below the earlier 661-item reference. This stationary sample does not satisfy the required walking/content-matched exit, and no target improvement is claimed from the whole-frame difference against 0.5.0. The zero `groundSourceOperations` counter also means this live scene does not exercise projected cap runs. Required fixture/golden and walking qualification remains in progress.

#### P0 fixture comparison

`P0/golden-comparison.json` records **zero changed channels** for all four
boards: lighting (1280×1224), seasonal lighting (1280×900), celestial shadows
(1920×1260), and production world lighting/nested terrain (1920×1680). All
12 world-lighting HUD witnesses remain exactly `[255,255,255,255]`. The world
board was visually inspected for sun/moon movement, elevated cliff caps, Basic
baked shadows, lantern fill and the white HUD witness. Source baseline is the
preserved `a7070426` implementation; candidate differs by P0 instrumentation.

The unadapted world fixture failed **before drawing** with `budget-exceeded`
(`P0/run-goldens.log`): its old setup bulk-prepares all loaded animation frames,
where current gameplay uses 0.5.6 immediate preparation. The golden builder
applies the same `frames.beginFrame()` setup to both baseline and candidate;
no runtime renderer change or budget increase is made. This compatibility
adapter is explicit in `P0/build-goldens.mjs` and the passing rerun log is
`P0/run-goldens-current-preparation.log`. The unadapted fixture failure remains
recorded; the pixel-equivalence result applies to the current-preparation
fixtures, not to the obsolete bulk-preparation setup.

Commands: `node output/perf-59-20260906/P0/build-goldens.mjs`,
`node output/perf-59-20260906/P0/run-goldens.mjs`,
`npm exec tsx -- output/perf-59-20260906/P0/compare-goldens.ts`.
Artifacts include `baseline-run*.png`, `candidate-run*.png`, corresponding
JSON evidence, and `P0/golden-baseline-source.json`. The CPU-source-only
readback grep passes (`world-readback.test.ts`); whole-client runtime Canvas
sources are scanned, with four explicitly pinned CPU asset preprocessing
reads and no permitted world/lightmap/present readback.

The first full attribution gate reached **569 suites / 3,411 tests** and caught
one new scenario registry ordering error (568 suites / 3,410 tests passed).
The scenario definition order now matches the ID order; no assertion was
weakened. The focused rerun passes **5 suites / 20 tests**. Logs:
`P0/check-attribution.log`, `P0/focused-attribution.log`. The settled full gate
is rerun after the walking sample so its CPU load is excluded from measurement.
Generated golden bundles live in `P0/dist/`, covered by the existing generated
`dist` lint exclusion; authored capture/build/compare scripts pass scoped lint
(`P0/artifact-lint.log`). No new broad lint exclusion was added.

#### P0 walking desktop protocol

Source commit **`a7070426b9218c9dcf2b8bade6b1d0256b0ac2d1`**, dirty source diff SHA-256 `acb65184005bf6197c3c1e6e0103300107dd71919df5bd4c529f02350caa50a5`; individual source hashes in `P0/walking-source-hashes.json`. Same Linux Ryzen/Chrome device, 1280×720, DPR 1, 100% browser zoom, world zoom 2 and Canvas native policy as above. Capture command: `node output/perf-59-20260906/P0/capture-local.mjs`. Artifacts: `P0/desktop-walking.json`, `P0/capture-walking.log`. No concurrent full check or CPU throttling during this run.

The driver moves one actor through the normal keyboard path (right/down/left/up, 500 ms per leg), without teleporting or changing shared content/time. The camera follows the actor; server collision applies. This samples actual moving gameplay, with naturally varying visible items. The earlier exact 661-item layout remains unavailable and is not represented as reproduced.

| Stage (ms p50 / p95 / p99) | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 11.900 / 14.400 / 16.300 | 13.500 / 15.900 / 18.700 | 18.700 / 21.500 / 23.900 |
| snapshotPrepare | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 |
| ground | 0.300 / 0.400 / 0.500 | 0.300 / 0.400 / 0.500 | 0.400 / 0.500 / 0.600 |
| painterBuild | 4.700 / 5.800 / 7.000 | 4.800 / 6.000 / 7.200 | 4.800 / 5.800 / 6.800 |
| painterSort | 0.100 / 0.100 / 0.200 | 0.100 / 0.100 / 0.200 | 0.100 / 0.100 / 0.200 |
| painterDraw | 1.500 / 2.000 / 2.300 | 1.400 / 1.900 / 2.200 | 2.300 / 3.200 / 3.800 |
| weather | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.200 / 0.300 |
| lightingBoundsResize | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.100 |
| lightingOcclusionRaster | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingSolve | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingMerge | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.200 |
| lightingUpload | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.100 |
| lightingReceiver | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingComposite | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.100 | 0.000 / 0.000 / 0.000 |
| lightingStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingDynamicSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| finalWorldComposite | 0.700 / 0.900 / 1.100 | 2.400 / 2.700 / 3.000 | 3.200 / 3.800 / 4.300 |
| uiModel | 0.500 / 0.600 / 0.700 | 0.500 / 0.600 / 0.700 | 0.500 / 0.600 / 0.700 |
| uiLayout | 0.500 / 0.700 / 0.800 | 0.500 / 0.700 / 0.800 | 0.500 / 0.700 / 1.100 |
| uiDraw | 3.400 / 4.500 / 5.100 | 3.300 / 4.000 / 4.500 | 3.300 / 4.000 / 4.400 |
| fixedUpdate | 0.200 / 0.300 / 0.400 | 0.200 / 0.300 / 0.400 | 0.200 / 0.300 / 0.500 |
| catchUp | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.300 / 0.400 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter (p50 / p95 / maximum) | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1698 / 2082 / 2093 | 1694 / 1756 / 1777 | 1708 / 1731 / 1836 |
| distinctDrawImageSources | 34 / 36 / 36 | 35 / 37 / 37 | 125 / 138 / 174 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 12 / 64 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 311 / 324 / 325 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 12 / 64 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 1 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 1 / 1 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 1 / 1 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 2 / 2 | 1 / 3 / 3 |
| saveCalls | 664 / 685 / 692 | 627 / 665 / 668 | 629 / 656 / 656 |
| restoreCalls | 664 / 685 / 692 | 627 / 665 / 668 | 629 / 656 / 656 |
| saveRestorePairs | 664 / 685 / 692 | 627 / 665 / 668 | 629 / 656 / 656 |
| surfaceAllocations | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 1 / 3 |

Basic **1,798 frames**, Classic **1,798**, Dynamic **1,479**; zero long tasks ≥50 ms in all three samples. Visible render-item p50/p95: Basic **359/371**, Classic **347/371**, Dynamic **361/376**. The final Dynamic → Basic transition reaches **0 retained lighting bytes** (`afterRestore` in the JSON). Basic has zero tint/filter/coverage/ground-source/ImageData work. Classic retains its existing lightmap behavior, including up to two ImageData allocations when moving bounds change. Dynamic still has filtered-frame builds (maximum 1/frame), tint builds (p95 12/frame), coverage/prepared-height rebuilds (1/frame), and ImageData allocations (p95 3/frame). These remain baseline failures for P1–P7.

Whole-frame target gaps at P0 are **8.4 ms** for Basic (14.4 vs ≤6 ms) and **11.5 ms** for Dynamic (21.5 vs ≤10 ms). Largest measured stage p95s: painterBuild **5.8/6.0/5.8 ms**, painterDraw **2.0/1.9/3.2 ms**, finalWorldComposite **0.9/2.7/3.8 ms**, uiDraw **4.5/4.0/4.0 ms** (Basic/Classic/Dynamic). Stage percentiles overlap and must not be summed. No GPU-completion timing is claimed.

Remaining qualification gaps: exact historical content cannot be reconstructed from the retained release evidence; this live walking route contains no projected cap runs; the shared preview still fails active-rAF/screenshot automation (a later `visible:true` status also failed the rAF probe). The nested-terrain fixture covers cap pixels but is not substituted for a gameplay cap performance sample. iPad remains **owner to run**, using the capture steps above.

#### P0 committed attribution gate

Settled **`npm run check` exit 0**: **569 suites / 3,411 tests passed**,
duration **823.25 s**, sim line coverage **92.38%**; lifecycle/world build,
workspace types, lint, coverage and all asset validation pass. Evidence:
`P0/check-attribution-settled.log`. Authored artifact scripts also pass lint.
All measured source files stayed unchanged during this gate; **36/36** original
atlas PNGs remain byte-identical (`P0/attribution-atlas-integrity.json`).

Changed runtime files: `packages/engine/src/{metrics,receiver-frame-source,
receiver-lighting,render-benchmark-scenarios,world-lighting-renderer}.ts`,
`packages/ui/src/{asset-frame-source,overworld-ui}.ts`, and the extracted
`packages/client/src/gameplay-render-diagnostics.ts`. New modules are
`packages/ui/src/{render-operation-counters,render-protocol-action}.ts`,
`packages/engine/src/render-protocol-buffer.ts`, and
`packages/client/src/{gameplay-render-protocol,gameplay-render-protocol-launcher,
render-canvas-probe,render-protocol-walk}.ts`. New tests are
`render-protocol-buffer.test.ts` and `world-readback.test.ts`; the existing
client structural seam digest is reviewed for the UI capture action.
All new source modules are below 400 lines. Docs/14, this ledger and DECISIONS.md
record the scope and measurement qualifications. P0 attribution is landed;
physical iPad and shared-preview visual qualification remain explicitly open.

### P1 — World-pass resolution, 2026-09-06 (codex)

Claim: `1d8abe11`. Mechanical extraction: `350aa9c7` moves renderer construction
and display diagnostics out of `overworld-main.ts` before any policy logic.
`npm run check` passed on that extraction (`P1/check-renderer-extraction.log`,
569 suites / 3,411 tests). The policy implementation lives in the extracted
module and the shared renderer. Gameplay defaults to persisted Canvas 1×;
Video cycles 1× / 2× / Native. Non-game users of the shared renderer retain
Native until they choose a policy. The nearest intermediate is retained;
identity copies are elided when the final upscale is exactly integral.
Backing capacity is reserved at resize/policy changes, not during zoom.

Changed files: `packages/engine/src/{renderer.ts,renderer.test.ts}`,
`packages/ui/src/overworld-ui.ts`, and
`packages/client/src/{overworld-main.ts,gameplay-render-protocol.ts,
render-protocol-walk.ts,phase-zero-extraction.test.ts}`. New modules/tests:
`packages/engine/src/world-pass-present.ts`,
`packages/client/src/{gameplay-renderer.ts,render-protocol-walk.test.ts}`,
`packages/ui/src/{world-scale-setting.ts,world-scale-setting.test.ts}`.
The protocol and structural-test scope amendment is recorded above and in
DECISIONS.md. Every new source module is below 400 lines.

Artifact root: `output/perf-59-20260906/P1/`. `scale-audit.md` records all
integer-scale consumers (chunks, sprites, projected runs, light planes,
weather, cutaway, overlays and HUD). Layout/present tests cover DPR 1/2/3
and fractional zoom; a full forward/backward 2–8 zoom sweep makes no backing
store grow. Fresh-client and reload checks for every setting are recorded in
`video-settings.json` and `video-{default-1x,1x,2x,native}.png`.

The first nine live-route captures, `desktop-world-scales.json`, remain
**unmatched visual evidence**: the original 500-ms walking legs finish halfway
through a square after 35 seconds, and the additional walking review moves
the actor again. Their changing camera/content/sky must not be presented as a
controlled speed comparison. The revised 625-ms legs close fourteen squares;
`check-walk-closure.log` proves zero net directional input and key release.
The controlled matrix below is `desktop-matched-scales.json`, using the same
presentation-only camera and spring-sunrise sky for all policies and modes.
Render-item p50/p95 is **376/376 in every sample**. The driver's exact preview
and initial fixed-point player coordinates are stored in its `metadata.presentation`.
It uses normal walking input and never changes shared time or terrain.

Device: orchard, AMD Ryzen 9 9955HX 16-Core Processor, Linux 6.17.2-1-pve,
Headless Chrome 152.0.7977.64, 1280×720 CSS/display resolution, DPR 1,
100% browser zoom, world zoom 2, UI scale 2, Canvas 2D. No CPU throttling.
The integrator's full check starts only after all timed samples finish.
Measured source: base `350aa9c705de2a361d10f5a0728770fad77dde32` plus the
captured diff hash in the JSON; `matched-source-hashes.json` includes all new
source files as well as tracked changes. Each sample is five seconds of
warm-up followed by thirty seconds of active rAF, with every stage and counter.

#### P1 desktop controlled scale matrix

All timings are milliseconds; cells are p50/p95/p99. Counters use p50/p95/max.

**World scale 1x, Canvas 2D**

| Stage | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 11.200/13.200/14.900 | 11.600/13.300/14.500 | 16.800/18.900/21.300 |
| snapshotPrepare | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.100/0.200 |
| ground | 0.300/0.400/0.500 | 0.300/0.400/0.500 | 0.300/0.400/0.500 |
| painterBuild | 4.100/5.100/6.000 | 4.100/5.000/5.800 | 4.200/5.000/5.700 |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.100/0.200 |
| painterDraw | 2.100/2.500/2.800 | 2.200/2.500/2.800 | 2.600/3.200/3.700 |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.200 |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 |
| lightingStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingDynamicSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| finalWorldComposite | 0.100/0.200/0.300 | 0.700/0.800/0.800 | 1.800/2.000/2.200 |
| uiModel | 0.400/0.500/0.600 | 0.400/0.500/0.600 | 0.400/0.500/0.600 |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.600/0.900 |
| uiDraw | 3.400/4.200/4.700 | 3.300/3.800/4.300 | 3.300/4.000/4.400 |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.300/0.400 | 0.200/0.300/0.400 |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.300/0.400 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1713.000/2043.000/2043.000 | 1714.000/1714.000/1714.000 | 1714.000/1728.000/1740.000 |
| distinctDrawImageSources | 32.000/33.000/33.000 | 33.000/33.000/33.000 | 118.000/122.000/127.000 |
| tintBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/13.000 |
| tintReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 341.000/341.000/341.000 |
| tintSurfaceReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/13.000 |
| filteredFrameBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| coverageFieldRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| preparedHeightRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| groundSourceOperations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| imageDataAllocations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| saveCalls | 676.000/683.000/683.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| restoreCalls | 676.000/683.000/683.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| saveRestorePairs | 676.000/683.000/683.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| surfaceAllocations | 0.000/1.000/1.000 | 0.000/1.000/1.000 | 0.000/1.000/1.000 |

| Sample | Frames | Active world pixels | Render items p50/p95 | Long tasks ≥50ms |
|---|---:|---:|---:|---:|
| basic | 1800 | 230400 | 376/376 | 0 |
| classic | 1800 | 230400 | 376/376 | 0 |
| dynamic | 1641 | 230400 | 376/376 | 0 |

**World scale 2x, Canvas 2D**

| Stage | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 13.200/15.200/16.700 | 14.900/17.200/19.600 | 20.400/22.500/25.800 |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.100 | 0.000/0.100/0.200 |
| ground | 0.300/0.400/0.500 | 0.300/0.400/0.500 | 0.300/0.400/0.500 |
| painterBuild | 4.200/5.200/6.200 | 4.300/5.300/6.200 | 4.500/5.200/6.100 |
| painterSort | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 |
| painterDraw | 4.100/4.800/5.300 | 4.100/4.800/5.300 | 2.500/3.200/3.700 |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 |
| lightingStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingDynamicSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| finalWorldComposite | 0.300/0.400/0.500 | 1.900/2.100/2.300 | 5.300/5.900/6.500 |
| uiModel | 0.400/0.500/0.600 | 0.400/0.500/0.600 | 0.400/0.600/0.700 |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.600/1.000 |
| uiDraw | 3.100/3.700/4.100 | 3.100/3.700/4.500 | 3.100/3.700/4.200 |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.300/0.400 | 0.200/0.300/0.400 |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.200 | 0.000/0.300/0.400 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1713.000/1713.000/1713.000 | 1714.000/1714.000/1714.000 | 1714.000/1728.000/1738.000 |
| distinctDrawImageSources | 32.000/32.000/32.000 | 33.000/33.000/33.000 | 118.000/121.000/124.000 |
| tintBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/9.000 |
| tintReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 341.000/341.000/341.000 |
| tintSurfaceReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/9.000 |
| filteredFrameBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/6.000 |
| coverageFieldRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| preparedHeightRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| groundSourceOperations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| imageDataAllocations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| saveCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| restoreCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| saveRestorePairs | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| surfaceAllocations | 0.000/1.000/1.000 | 0.000/1.000/1.000 | 0.000/1.000/12.000 |

| Sample | Frames | Active world pixels | Render items p50/p95 | Long tasks ≥50ms |
|---|---:|---:|---:|---:|
| basic | 1799 | 921600 | 376/376 | 0 |
| classic | 1781 | 921600 | 376/376 | 0 |
| dynamic | 1369 | 921600 | 376/376 | 0 |

**World scale native, Canvas 2D**

| Stage | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 17.100/19.700/22.100 | 19.400/21.500/23.400 | 25.700/28.500/31.000 |
| snapshotPrepare | 0.000/0.100/0.100 | 0.000/0.100/0.200 | 0.000/0.100/0.200 |
| ground | 0.300/0.400/0.500 | 0.300/0.400/0.400 | 0.300/0.500/0.500 |
| painterBuild | 4.300/5.200/5.900 | 4.400/5.200/6.200 | 4.500/5.400/5.900 |
| painterSort | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.100/0.100/0.200 |
| painterDraw | 7.700/8.900/9.600 | 7.800/8.600/9.700 | 2.700/3.500/4.100 |
| weather | 0.000/0.100/0.200 | 0.000/0.200/0.200 | 0.500/1.100/1.300 |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 |
| lightingStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingDynamicSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| finalWorldComposite | 0.400/0.600/0.800 | 2.500/2.700/2.900 | 9.500/10.600/11.500 |
| uiModel | 0.400/0.600/0.700 | 0.400/0.600/0.700 | 0.500/0.600/0.900 |
| uiLayout | 0.500/0.600/0.900 | 0.500/0.600/0.800 | 0.500/0.600/1.100 |
| uiDraw | 3.200/3.900/4.400 | 3.200/3.900/4.300 | 3.400/4.100/4.800 |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.300/0.400 | 0.300/0.400/0.500 |
| catchUp | 0.000/0.300/0.400 | 0.000/0.300/0.400 | 0.200/0.400/0.500 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1713.000/1713.000/1715.000 | 1714.000/1714.000/1715.000 | 1942.000/1959.000/1988.000 |
| distinctDrawImageSources | 32.000/32.000/32.000 | 33.000/33.000/33.000 | 125.000/128.000/132.000 |
| tintBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/9.000 |
| tintReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 567.000/581.000/595.000 |
| tintSurfaceReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/9.000 |
| filteredFrameBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/2.000 |
| coverageFieldRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| preparedHeightRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| groundSourceOperations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| imageDataAllocations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| saveCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| restoreCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| saveRestorePairs | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| surfaceAllocations | 0.000/1.000/2.000 | 0.000/1.000/2.000 | 0.000/1.000/2.000 |

| Sample | Frames | Active world pixels | Render items p50/p95 | Long tasks ≥50ms |
|---|---:|---:|---:|---:|
| basic | 1614 | 921600 | 376/376 | 0 |
| classic | 1438 | 921600 | 376/376 | 0 |
| dynamic | 1098 | 921600 | 603/616 | 0 |

#### P1 comparison and unresolved work

P0's walking Native reference was Basic **11.9/14.4/16.3 ms** and Dynamic
**18.7/21.5/23.9 ms** (p50/p95/p99). P1 default 1× in the controlled matrix is
Basic **11.2/13.2/14.9 ms** and Dynamic **16.8/18.9/21.3 ms**. These historical
rows have different routes and are labelled accordingly. Within the controlled
P1 matrix, active world pixels are **230,400 at 1×**, **921,600 at 2×/Native**.
Basic `painterDraw` p95 is **2.5/4.8/8.9 ms**, and `finalWorldComposite` p95
is **0.2/0.4/0.6 ms** at 1×/2×/Native. Dynamic `painterDraw` p95 is
**3.2/3.2/3.5 ms**; the exact final-composite and every other stage are above.

Native reserves a **2048×1152** backing store to cover its ceil(zoom×DPR)
thresholds without allocating during zoom, versus **768×432** at initial 1×
and **1280×720** at 2×. This changes Native's backing cost from P0; the measured
Native whole-frame p95 (**19.7 ms Basic, 28.5 ms Dynamic**) is a regression,
not an optimization claim. The matrix shows the cost of the larger backing
alongside the unchanged active-pixel count at zoom 2. World filters and
submission work still need P5/P6; default 1× also remains **7.2 ms over the
Basic target and 8.9 ms over the Dynamic target**. Painter construction,
painter submission and HUD draw dominate the residual, as the stage table shows.
No ≥50-ms long task occurred in any of the nine controlled samples. The
unmatched Native/Dynamic walking sample has **one 52-ms long task**; it is
retained as a failure in the original JSON. The preliminary progress update
preceded that final result and is corrected here.

Basic has zero measured tint/filter/coverage/ground-source/ImageData work and
zero retained lighting bytes after each of six switch cycles
(`lighting-switch-cycles.json`) and after the matrix (`afterRestore`). Classic
has zero directional/tint counters in this fixed scene; its legacy lightmap
implementation still exists and must not be described as deleted lighting work.
Dynamic still rebuilds coverage/prepared heights once per frame, allocates one
ImageData per frame, and retains the filtered/tint machinery. Those are P3–P5
failures, not P1 successes. Native/2×/1× retain the world backing across policy
switches by design; these world surfaces are not lighting bytes. Cap performance
workload qualification from P0 remains open (the live route has no cap runs).

#### P1 pixels, visual review and device follow-up

`golden-comparison.json`: all four existing review boards are byte-identical,
including the nested-terrain board used as the release's terrain review.
The P0 fixture-only compatibility adapter for obsolete bulk shadow preparation
is applied identically to both baseline and candidate. `scale-golden-comparison.json`
compares the actual UnifiedRenderer at 1×/2×/Native on the twelve lighting/terrain
panels, downsampling Native with a 2×2 area average. Maximum difference is **1**
8-bit step at 1×, **0** at 2×; every HUD witness is exact. The additional actual
pond/shimmer path in `pond-golden-comparison.json` has the same result.
`atlas-integrity.json` proves all **36/36** original PNGs byte-identical.
No runtime world readback was introduced; PNG comparisons use the tools' CPU decoder.

Local real-client Playwright walked for one minute in each of the nine
policy/mode combinations (35-second protocol plus 25-second review), producing
`{1x,2x,native}-{basic,classic,dynamic}-walking-{start,mid,end}.png`.
The integrator inspected the screenshots, scale/pond boards and Video panel:
world-pixel motion at 1×, Native motion, moving sun/moon shadows, cliff caps,
pond water and the exact post-world HUD witnesses meet the local visual contract.
Shared `/run` preview remains **OPEN: technical**, as recorded in P0: the
canonical `https://orchard.dastari.net/` tab is authenticated but does not
provide active rAF/screenshots through the shared-preview service. Local
screenshots do not substitute for a completed shared-preview acceptance.
No live deployment or authentication-policy change was made.

Physical iPad: **owner to run**, for each policy. Once this candidate is served
to the iPad through an approved preview/release, open Video, select World scale
1×, leave world zoom 2 and browser zoom 100%, then open System → Developer →
Render → **Run protocol + copy JSON**. Keep the tab foreground for 105 seconds;
the button runs Basic/Classic/Dynamic and restores the prior quality. If deferred
clipboard permission fails, reopen Render and tap **Copy capture JSON**.
Repeat for 2× and Native. Keep the exported JSON with physical model, iPadOS
and Safari version; it includes DPR, resolution, world scale, backend, active
pixels, stages/counters and build commit. No desktop throttling substitutes for
these rows. Shared-preview and physical-device review remain qualifications
before release approval.

Commands: `npm run check` (mechanical extraction and final milestone gate);
`npm exec vitest run packages/engine/src/renderer.test.ts packages/ui/src/world-scale-setting.test.ts packages/ui/src/overworld-ui.test.ts packages/client/src/phase-zero-extraction.test.ts`;
`npm exec vitest run packages/client/src/render-protocol-walk.test.ts`;
`npm run typecheck --workspace @orchard/client`;
`node output/perf-59-20260906/P1/{capture-local,capture-matched,review-video}.mjs`
(each separately, with private existing-session input deleted immediately);
`node .../P1/{build-goldens,run-goldens,run-scale-goldens}.mjs`;
`npm exec tsx .../P1/{compare-goldens,compare-scale-goldens}.ts`;
`PERF59_POND=1` for the pond runner/comparison;
`npm exec eslint -- output/perf-59-20260906/P1`.
Final gate: **PASS**, `P1/check-world-scale.log`: **571 suites / 3,416 tests**,
822.41 seconds for coverage; all typechecks, lint, world/lifecycle checks and
asset validation pass (1,021 art assets, three songs, ten SFX, 55 palette
colors, four seasonal remaps). `matched-source-hashes.json` still matches all
measured/gated runtime and test files. Later artifact-only additions pass
`P1/artifact-lint.log`. P1 implementation and desktop qualification are complete;
the named shared-preview and physical-iPad qualifications remain open.


### P2 reader gate — in progress, 2026-09-06

The page readers precede the writer switch. New index v4, category v3,
marker v2 and compact registry v4 readers retain the supplied legacy versions.
Page identity is category-scoped; declared and decoded dimensions are checked
against 512×2048 / 4 MiB, including cached-image reuse. The complete-asset
shelf packer rejects oversized assets and never splits an asset across pages.
The preview reader and existing gameplay protocol understand page identities;
protocol JSON adds loaded-page sizes and request-to-ready latency. Decoder-only
CPU timing is measured separately with Chromium trace events.

Files: `packages/ui/src/{assets,atlas-page-format,atlas-page-loader}.ts`, their
new format/loading tests, `packages/tools/src/assets/atlas-pages.ts` and its
test, `packages/tools/src/preview.ts`, `packages/client/src/gameplay-render-protocol.ts`,
and the P2 lane briefs. Reader review findings and fixes are in
`output/perf-59-20260906/P2/reader-review.md`; focused reader/cache/marker
checks pass (12 tests), as do client typecheck and scoped lint. The full
reader gate passed (`P2/check-readers.log`); the writer is authorized only
after this reader commit.

Pre-writer cold startup (`P2/startup-legacy.json`): 5,124.200 ms to first
gameplay, 10 images, 126,623,744 decoded bytes total, largest image
106,561,536 bytes. Chromium's `Decode Image` events total 70.263 ms across
10 events. The other nested trace event groups are retained separately and
are not summed into that CPU figure. Device/browser/settings and commit
identity are in the artifact. This is startup evidence, not a frame-stage
measurement; the complete matched stage/counter tables follow at P2 exit.

Physical iPad: **owner to run**. On an approved candidate, open
System → Developer → Render and use the protocol/copy-JSON action, keeping
Safari foregrounded throughout the 5-second warm-up plus 30-second sample
for each Basic, Classic and Dynamic capture. Record iPad model, iPadOS/Safari,
DPR, zoom, resolution, commit, world scale and backend. Retain the JSON's
asset page dimensions and decoded-byte totals; report any texture/canvas
limit error. No desktop throttle result substitutes for this row.

Unresolved: P2 writer, original/frame-pixel comparison, paged startup,
full stage/counter capture and physical-iPad result remain pending. The shared
preview rendering failure remains OPEN as recorded in P0/P1. No P2 exit is
claimed by this intermediate reader entry.


### P2 — Bounded atlas writers and desktop qualification, 2026-09-06

Reader commit `5de3e736` landed before the writer format switch. Writers now
emit index v4, category v3, marker v2 and registry v4, with stable category/page
identities and local frame coordinates. The 1,021 assets occupy 39 pages per
season / 156 PNGs; characters are the first target and occupy 30 pages per
season. Props use two; other categories fit one each. Every page is at most
512×2048 / 4,194,304 decoded bytes; whole assets never span pages. The builder
holds one output page at a time. Content addressing and service-worker
retention remain out of scope. Existing generated-asset discovery serves the
page files. Original legacy PNGs remain present and immutable.

The decoded-image audit also found a 6-MiB sign-in backdrop. The documented
P2 amendment splits it into three 512×1024 images, reconstructing the original
crop only while building the retained UI viewport cache. That temporary
6-MiB **Canvas** backing is released in `finally`; it is not a decoded image
and is not created by steady world drawing. Independent fractional tile draws
and a shared-transform attempt failed the exact backdrop golden; the final
single-crop reconstruction is exact at four viewport/DPR combinations. The
superseded failure artifacts remain in P2 for audit.

Files: reader files listed above plus `packages/tools/src/build-atlas.ts`,
`validate-assets.ts`, `assets/{types,asset-registry.test}.ts`, new
`assets/atlas-page-validation{,.test}.ts`, `build-backdrop-pages{,.test}.ts`,
`packages/ui/src/orchard-backdrop.ts` and new `backdrop-pages{,.test}.ts`.
Root docs/roadmap and lane notes record the format ordering and scope amendment.
Generated files are build outputs, not edits to any of the 36 source PNGs.

Artifacts are under `output/perf-59-20260906/P2/`. `page-pixel-comparison.json`
proves 36/36 original hashes unchanged, 105,076 frames / 117,681,744 pixels
reproduced exactly and 6,648 semantic marker pixels preserved. All 1,021
assets have page IDs in marker metadata, including assets with no markers.
`packer-counts.json` records every page height and decoded size. The corrected
builder measurement is 10.26 seconds / 477,104 KiB peak RSS for the whole
catalog build; this is process RSS, not just the page buffer.

| Startup measurement | Legacy | Paged including backdrop |
|---|---:|---:|
| First gameplay, ms | 5124.200 | 5233.000 |
| Loaded images | 10 | 39 |
| Total decoded image bytes | 126623744 | 116514816 |
| Largest decoded image bytes | 106561536 | 4194304 |
| Chromium Decode Image CPU, ms | 70.263 | 33.578 |
| Decode Image events | 10 | 28 |
| Physical iPad | owner to run | owner to run |

`startup-{legacy,paged}.json` and `capture-startup.mjs` retain device/settings
and numeric trace groups. Different nested decoder groups are not added to
one another. First gameplay is **108.800 ms slower (+2.12%)** in these single
cold samples; startup equal-or-better latency is not proven, despite lower
recorded decode CPU and decoded bytes. `startup-paged-before-backdrop.json`
is the superseded cap failure, not the final result.

Desktop frame samples use Chrome 152.0.7977.64, Linux 6.17.2-1-pve,
AMD Ryzen 9 9955HX, 1280×720, DPR 1, browser zoom 100%, world zoom 2, UI scale 2,
Canvas 2D. Source identity is `82187fea` plus the recorded diff/source hashes.
Each mode receives the required 5-second warm-up and 30-second active-rAF
walking sample. A 30-second initial settle precedes the protocol to exclude
startup/HUD fade-in. Fixed review camera is (5701,6178), spring day 3.5,
07:00, full lunar illumination, cloud cover 0. No CPU throttling is used.
`desktop-legacy-before-pages.json` and `desktop-matched-scales.json` contain
all samples. The earlier cold/settling capture remains explicitly named
`desktop-legacy-before-pages-cold.json` and is not the comparison baseline.

**Matching qualification:** viewport/DPR/zoom/sky and camera match; the live
world continues to change. Legacy Basic render items are p50/p95 382/386,
paged Basic 376/376. Paged Native Classic p95 is 382 and Native Dynamic
p50/p95 is 380/384. Other rows are mostly 376. Accordingly these before/after
numbers do not establish a perfectly content-controlled causal speedup.

#### P2 pre-page versus paged 1× stage measurements

Cells are original milliseconds p50/p95/p99. Live content differs as qualified below.

| Stage | Basic before → after | Classic before → after | Dynamic before → after |
|---|---:|---:|---:|
| Whole frame | 12.000/14.000/16.000 → 9.400/11.500/12.700 | 12.000/13.800/15.400 → 10.600/12.800/14.800 | 16.900/19.300/21.300 → 15.200/20.500/26.800 |
| snapshotPrepare | 0.000/0.100/0.100 → 0.000/0.100/0.200 | 0.000/0.100/0.200 → 0.000/0.100/0.200 | 0.000/0.100/0.100 → 0.000/0.100/0.200 |
| ground | 0.300/0.400/0.500 → 0.300/0.500/0.600 | 0.300/0.400/0.500 → 0.300/0.500/0.600 | 0.300/0.400/0.500 → 0.400/0.600/0.700 |
| painterBuild | 4.400/5.400/6.600 → 4.600/5.800/6.800 | 4.400/5.300/6.300 → 5.100/6.500/7.900 | 4.300/5.200/6.000 → 5.100/7.400/9.500 |
| painterSort | 0.100/0.100/0.200 → 0.100/0.100/0.200 | 0.100/0.100/0.200 → 0.100/0.100/0.200 | 0.100/0.100/0.200 → 0.100/0.200/0.200 |
| painterDraw | 2.600/3.000/3.500 → 0.500/0.700/0.800 | 2.200/2.600/3.000 → 0.600/0.700/0.900 | 2.600/3.200/3.700 → 2.300/3.200/4.400 |
| weather | 0.000/0.200/0.300 → 0.000/0.100/0.200 | 0.000/0.100/0.200 → 0.000/0.100/0.200 | 0.000/0.200/0.300 → 0.000/0.200/0.300 |
| lightingBoundsResize | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.100 → 0.000/0.000/0.100 | 0.000/0.000/0.100 → 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.100 → 0.000/0.100/0.100 | 0.000/0.100/0.100 → 0.000/0.100/0.100 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingStaticSolve | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| lightingDynamicSolve | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 |
| finalWorldComposite | 0.200/0.300/0.300 → 1.600/2.000/2.200 | 0.700/0.800/0.900 → 2.100/2.600/3.000 | 1.800/2.000/2.300 → 1.400/2.200/2.800 |
| uiModel | 0.400/0.500/0.600 → 0.400/0.600/0.700 | 0.400/0.500/0.600 → 0.500/0.600/0.700 | 0.400/0.600/0.700 → 0.500/0.800/1.100 |
| uiLayout | 0.500/0.600/0.700 → 0.500/0.600/0.700 | 0.500/0.600/0.700 → 0.500/0.700/0.800 | 0.500/0.600/0.800 → 0.500/0.700/1.100 |
| uiDraw | 3.400/4.000/4.500 → 1.300/1.900/2.100 | 3.300/3.900/4.400 → 1.400/1.900/2.100 | 3.300/3.900/4.300 → 1.400/2.100/2.500 |
| fixedUpdate | 0.200/0.400/0.400 → 0.200/0.300/0.400 | 0.200/0.300/0.400 → 0.200/0.400/0.500 | 0.200/0.300/0.400 → 0.200/0.400/0.600 |
| catchUp | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.000/0.000 → 0.000/0.000/0.000 | 0.000/0.300/0.400 → 0.000/0.400/0.500 |
| Physical iPad | owner to run | owner to run | owner to run |

#### P2 desktop controlled scale matrix

All timings are milliseconds; cells are p50/p95/p99. Counters use p50/p95/max.

**World scale 1x, Canvas 2D**

| Stage | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 |
| lightingStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingDynamicSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1739.000/1753.000/1753.000 | 1740.000/1754.000/1754.000 | 1740.000/1754.000/1754.000 |
| distinctDrawImageSources | 42.000/42.000/42.000 | 43.000/43.000/43.000 | 111.000/118.000/120.000 |
| tintBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/1.000 |
| tintReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 334.000/341.000/341.000 |
| tintSurfaceReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| filteredFrameBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| coverageFieldRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/1.000/1.000 |
| preparedHeightRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/1.000/1.000 |
| groundSourceOperations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| imageDataAllocations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| saveCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 667.000/676.000/676.000 |
| restoreCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 667.000/676.000/676.000 |
| saveRestorePairs | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 667.000/676.000/676.000 |
| surfaceAllocations | 0.000/1.000/1.000 | 0.000/1.000/1.000 | 0.000/1.000/1.000 |

| Sample | Frames | Active world pixels | Render items p50/p95 | Long tasks ≥50ms |
|---|---:|---:|---:|---:|
| basic | 1800 | 230400 | 376/376 | 0 |
| classic | 1800 | 230400 | 376/376 | 0 |
| dynamic | 1542 | 230400 | 375/376 | 1 |

**World scale 2x, Canvas 2D**

| Stage | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 11.000/13.900/17.100 | 13.300/15.700/17.900 | 18.500/21.100/23.100 |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 |
| ground | 0.300/0.400/0.600 | 0.300/0.400/0.500 | 0.400/0.500/0.600 |
| painterBuild | 4.600/5.900/8.100 | 4.800/5.900/7.400 | 4.800/5.700/6.700 |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.100/0.200 |
| painterDraw | 0.500/0.700/0.900 | 0.600/0.700/0.900 | 2.300/3.000/3.500 |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.200 | 0.000/0.100/0.100 | 0.000/0.000/0.000 |
| lightingStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingDynamicSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| finalWorldComposite | 3.500/4.200/4.900 | 5.300/6.000/6.900 | 5.100/5.800/6.600 |
| uiModel | 0.500/0.600/0.800 | 0.500/0.600/0.800 | 0.500/0.700/0.800 |
| uiLayout | 0.500/0.700/0.800 | 0.500/0.700/0.800 | 0.500/0.600/1.000 |
| uiDraw | 1.300/1.800/2.100 | 1.300/1.800/2.200 | 1.300/1.900/2.000 |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.300/0.400 | 0.200/0.400/0.400 |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.300 | 0.000/0.300/0.400 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1739.000/1753.000/1753.000 | 1714.000/1754.000/1754.000 | 1740.000/1754.000/1776.000 |
| distinctDrawImageSources | 42.000/42.000/42.000 | 43.000/43.000/43.000 | 118.000/126.000/133.000 |
| tintBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/11.000 |
| tintReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 334.000/341.000/341.000 |
| tintSurfaceReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/7.000/11.000 |
| filteredFrameBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/1.000 |
| coverageFieldRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| preparedHeightRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| groundSourceOperations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| imageDataAllocations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| saveCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| restoreCalls | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| saveRestorePairs | 676.000/676.000/676.000 | 676.000/676.000/676.000 | 676.000/676.000/676.000 |
| surfaceAllocations | 0.000/1.000/1.000 | 0.000/1.000/1.000 | 0.000/1.000/3.000 |

| Sample | Frames | Active world pixels | Render items p50/p95 | Long tasks ≥50ms |
|---|---:|---:|---:|---:|
| basic | 1785 | 921600 | 376/376 | 0 |
| classic | 1763 | 921600 | 376/376 | 0 |
| dynamic | 1401 | 921600 | 376/376 | 0 |

**World scale native, Canvas 2D**

| Stage | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| Whole frame | 15.800/17.700/19.800 | 14.300/20.500/22.700 | 19.500/25.900/28.400 |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 |
| ground | 0.300/0.500/0.500 | 0.300/0.500/0.500 | 0.400/0.500/0.600 |
| painterBuild | 4.900/5.900/6.700 | 4.900/6.200/7.300 | 4.800/5.800/7.100 |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.100/0.200 |
| painterDraw | 0.500/0.700/0.800 | 0.500/0.700/0.900 | 2.400/3.100/3.600 |
| weather | 0.000/0.100/0.200 | 0.000/0.200/0.200 | 0.100/0.200/0.300 |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 |
| lightingStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| lightingDynamicSolve (unsupported) | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| finalWorldComposite | 7.600/8.500/9.600 | 5.300/11.000/12.100 | 4.900/10.600/11.900 |
| uiModel | 0.500/0.700/0.800 | 0.500/0.700/0.800 | 0.500/0.700/0.800 |
| uiLayout | 0.500/0.700/0.800 | 0.500/0.700/0.800 | 0.500/0.700/1.000 |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.200 | 1.300/1.900/2.200 |
| fixedUpdate | 0.200/0.400/0.400 | 0.200/0.400/0.400 | 0.300/0.400/0.500 |
| catchUp | 0.000/0.300/0.400 | 0.000/0.300/0.400 | 0.000/0.400/0.500 |
| Physical iPad | owner to run | owner to run | owner to run |

| Per-frame counter | Basic | Classic | Dynamic |
|---|---:|---:|---:|
| drawImageCalls | 1713.000/1753.000/1753.000 | 1740.000/1754.000/1763.000 | 1747.000/1773.000/1796.000 |
| distinctDrawImageSources | 42.000/42.000/42.000 | 37.000/44.000/44.000 | 172.000/185.000/196.000 |
| tintBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 4.000/13.000/22.000 |
| tintReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 285.000/293.000/297.000 |
| tintSurfaceReuses | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 4.000/13.000/22.000 |
| filteredFrameBuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/1.000 |
| coverageFieldRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| preparedHeightRebuilds | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| groundSourceOperations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 |
| imageDataAllocations | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 1.000/1.000/1.000 |
| saveCalls | 676.000/676.000/676.000 | 670.000/679.000/682.000 | 672.000/681.000/683.000 |
| restoreCalls | 676.000/676.000/676.000 | 670.000/679.000/682.000 | 672.000/681.000/683.000 |
| saveRestorePairs | 676.000/676.000/676.000 | 670.000/679.000/682.000 | 672.000/681.000/683.000 |
| surfaceAllocations | 0.000/1.000/1.000 | 0.000/1.000/1.000 | 0.000/1.000/2.000 |

| Sample | Frames | Active world pixels | Render items p50/p95 | Long tasks ≥50ms |
|---|---:|---:|---:|---:|
| basic | 1609 | 921600 | 376/376 | 0 |
| classic | 1553 | 921600 | 376/382 | 0 |
| dynamic | 1233 | 921600 | 380/384 | 0 |


#### P2 residuals, visual evidence and device follow-up

Default 1× Basic p95 is 11.500 ms (5.500 ms above target); Dynamic p95 is
20.500 ms (10.500 ms above target). Dynamic records **one 51-ms long task**;
all eight other rows record zero. The observer does not attribute that task
to one renderer stage, so no unsupported GC/browser/decoder cause is asserted.
Basic painter build remains 5.800 ms p95, while painter draw is 0.700 ms;
Dynamic painter build/draw are 7.400/3.200 ms. Later milestones must address
those costs and the remaining HUD/composite costs shown above.

Basic and Classic have zero filtered-frame, tint, coverage and ImageData
counter work in this scene. Classic's legacy lightmap path still exists;
this is not proof of zero lighting for every Classic scene. No `.omit` pages
exist or load yet; they are P3. After restoring Basic, retained lighting bytes
are **zero** (`afterRestore`). Dynamic still allocates one ImageData each
frame and surface allocations p95 is one at every policy. The surface probe
covers the whole client, so zero world allocation is not claimed without
attribution. Runtime filtering remains present until P3; tint pool/coverage
work remain P4/P5. The live route has no cap runs, retaining P0's cap-workload
qualification. The run's performance and allocation Definition of Done is
not yet satisfied.

`golden-comparison.json`: all four lighting boards have zero changed channels,
including exact HUD witnesses. `paged-terrain-comparison.json`: nested caps
and pond fixtures at each of 1×/2×/Native exactly match P1 at the same policy.
`backdrop-golden-comparison.json`: zero differences at 1280×720 DPR1,
997×733 DPR1, 720×1280 DPR2 and 853×479 DPR3. No world readback was introduced;
comparisons decode exported PNGs in the CPU tools. `video-settings.json` and
`video-{default-1x,1x,2x,native}.png` verify the existing controls and persistence.
All six cycles in `lighting-switch-cycles.json` restore Basic to zero retained
lighting bytes; the Video footer retains the lighting explanation pending P8.

Local authenticated Playwright drove 35 seconds of protocol walking plus
25 seconds of additional walking in every policy/mode. All 27 start/mid/end
screenshots are retained. The integrator viewed each combination and the
lighting/cap/pond boards: artwork, directional shadows and HUD retain the
prior local contract. Shared `/run` acceptance is still **OPEN: technical**;
the canonical authenticated tab does not yield active frames/screenshots.
Local browser evidence does not close that shared-preview requirement.

Physical iPad: **owner to run**. Serve this candidate through an approved
preview/release, select Video → World scale 1× with world zoom 2 and browser
zoom 100%, then System → Developer → Render → **Run protocol + copy JSON**.
Keep Safari foreground for 105 seconds while Basic/Classic/Dynamic run;
if the deferred clipboard write is refused, tap **Copy capture JSON** after
completion. Repeat at 2× and Native. Save model, iPadOS and Safari versions
with each JSON; DPR/resolution/commit/backend/world scale, all stages/counters
and loaded image sizes are captured. Report any texture or Canvas limit.
No desktop throttle sample substitutes for the physical result.

Commands (each separately): `npm run check`; `npm run assets:build`;
`npm run assets:validate`; focused Vitest reader, page packer/validation,
asset registry and backdrop tests; UI/tools/client typechecks and scoped ESLint;
`npm exec tsx .../P2/compare-page-pixels.ts`;
`node .../P2/capture-startup.mjs`, `capture-before-pages.mjs`,
`capture-matched.mjs`, `review-video.mjs`, `build-goldens.mjs`, `run-goldens.mjs`,
`run-scale-goldens.mjs`, `run-backdrop-review.mjs`;
`npm exec tsx .../P2/compare-goldens.ts`, `compare-paged-terrain.ts`,
`compare-backdrop.ts`; `python3 .../P2/render-ledger.py`.
Auth input is a short-lived existing session, privately passed then deleted;
no authentication-policy or live deployment changes occurred.

Full writer gate: **PASS**, `P2/check-writers.log`: **577 suites / 3,440 tests**,
913.13 seconds for coverage; all typechecks, lint, lifecycle/world checks and
asset validation pass (1,021 art assets, three songs, ten SFX, 55 palette colors
and four seasonal remaps). Captured source hashes still match the gated sources. Read-only independent review found no blocking code defect;
its measurement qualifications are incorporated above. P2 desktop page-size,
pixel and memory requirements are met; physical-device/shared-preview and
startup-latency qualifications remain open.

### 2026-09-06 — P3 implementation checkpoint; desktop acceptance pending

Status: **IN PROGRESS**, not a completed milestone. The filtered-frame machinery
is deleted and the page controller is integrated. The P3 full gate **passes** (`P3/check-runtime.log`: 584 suites / 3456 tests,
838.65 seconds, all typechecks/lint/lifecycle/asset gates green);
authenticated before/after stage measurement and gameplay review are blocked by
the expired session recorded in `P3/authenticated-capture-block.json`. No local
fixture timings are substituted for the mandatory real-client active-rAF sample.

All artifacts below are under `output/perf-59-20260906/P3/`. Exact changed
source paths and hashes (including deletions) are in `integrated-source-hashes.json`.
They cover the atlas builder, UI page cohort/loader and marker overrides, shared
frame metadata/export, engine world presentation and deleted cache consumers,
review fixtures, gameplay transition controller, PWA discovery test and structural
seam test. The mechanical main extraction is `cfce3e6f` (577 suites / 3,440 tests,
837.52 seconds). The earlier artifact-lint failure is retained as
`check-orchestration-artifact-lint-failed.log`; the corrected gate is green.

Builder revision `229a1a14e0bb036547be` emits 100 omit PNGs: 25 affected pages
in each of four seasons. `omit-pixel-comparison.json` verifies 441 declared
assets / 12,221 frames per season: 1,619,888 declared pixels cleared across
four seasons and 330,113,344 outside-span bytes unchanged. The historical
344 loaded instances (341 unique names) remove exactly 16,100 pixels per season,
with zero unexpected changes. `integrated-original-pages.json` verifies all
36 legacy PNGs and all 156 bounded normal pages remain byte-identical.

The controller requests the complete affected cohort once, retains the current
complete Classic presentation while Dynamic loads, and commits pages plus model
at a frame boundary. Basic/Classic cancel outstanding page requests and release
omit images/marker backings. Original `LoadedAsset.image` remains available for
UI; normal images and active omit pages therefore have separate ownership and
can coexist in memory. The frame selector retains rectangle metadata only.
The old filtered-frame cache, budgets, pins, streaming preparation, fallback
states and `filteredFrames` diagnostic are removed together with their tests.
`filteredFrameBuilds` remains only as the requested zero-valued protocol counter.

`transition-tests.log`: five page-transition tests plus six structural tests pass.
`runtime-focused-tests.log`: 24 tests across five suites pass.
`loader-cancellation-tests.log`: 25 tests across five suites pass. The resolved
recolour/reset/publication interleaving formerly retained 131,072 bytes; now its
backing is explicitly zeroed, while a newer cohort sharing that backing survives.
`pwa-omit-discovery-tests.log` proves existing generated-prefix service-worker
coverage with distinct normal/omit/revision keys, so no retention or content
addressing change is added.

`omit-walking.json` runs 600 real engine sprite-pose draws, with **zero Canvas
surface allocations**, three distinct artwork sources matching three used page
identities, and omit decoded bytes **0 → 72,515,584 → 0** for Basic → Dynamic →
Basic. These are resource counts, not real-client stage timings. The fixture
uses no marker overrides; those retain separately counted immutable page
backings, so source-count equality is not asserted for arbitrary recoloured
assets. `omit-walking-restored-basic.png` was visually reviewed. The loader's
600-read unit case is also retained and is not described as walking evidence.

`golden-comparison.json`: all four lighting boards have **zero changed channels**.
`paged-terrain-comparison.json`: nested terrain and ponds at 1×/2×/Native match
P2 exactly, including the HUD witness. The immutable-source readback guard remains
in the full gate. No world readback path was introduced.

The table below preserves the measured P2 1× comparison baseline in original
milliseconds p50/p95/p99. Every P3 after cell is explicitly unmeasured pending
fresh authentication; source compilation and fixture speed do not satisfy the
P3 painterDraw exit. P2 scene/content qualifications still apply.

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P3 after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

Per-frame real-client counters after P3: **unmeasured**, for the same reason.
The preceding P2 table retains all measured baseline counters; the fixture
counts above prove their stated paths only. No P3 long-task result is claimed.
Basic/Dynamic desktop budget acceptance and shared minute-per-mode/policy visual
acceptance remain open. `capture-matched.mjs` and `review-video.mjs` are ready
to resume against the integrated local client after authentication returns.

Physical iPad: **owner to run**. In an approved candidate preview, set Video →
World scale 1×, world zoom 2 and browser zoom 100%, then System → Developer →
Render → **Run protocol + copy JSON**. Keep Safari foreground for 105 seconds
through Basic/Classic/Dynamic; if clipboard completion is refused, tap **Copy
capture JSON** afterwards. Repeat at 2× and Native. Record model/iPadOS/Safari
versions alongside JSON; commit/backend/policy/DPR/resolution/stages/counters
are embedded. No desktop throttle result substitutes for this row.

Commands: `npm run check`; UI/engine/client/tools typechecks and scoped ESLint;
focused Vitest builder/page/cohort/marker/transition/presentation/structural/PWA
suites; `npm run assets:build`; `npm run assets:validate`;
`tsx .../P3/compare-omit-pages.ts`; `node .../P3/build-goldens.mjs`,
`run-goldens.mjs`, `run-scale-goldens.mjs`, `run-omit-walking.mjs`;
`tsx .../P3/compare-goldens.ts`, `compare-paged-terrain.ts`;
SHA-256 verification of the original and bounded normal page manifest.

### 2026-09-06 — P4 implementation checkpoint; sampling and desktop acceptance open

Status: **IN PROGRESS**. Static/moving coverage reuse, numeric identities and
retained uploads are integrated; constant-time receiver sampling remains OPEN
under the three-attempt rule above. Full canonical gate: **PASS**, `check-runtime.log`, 587 suites / 3,466 tests,
854.58 seconds; typechecks, lint, lifecycle checks and asset validation green.
All paths below are under `output/perf-59-20260906/P4/`; exact changed source
paths/hashes are in `integrated-source-hashes.json`. The gameplay celestial
orchestration was mechanically extracted in `cfce3e6f` before changing its logic.

The renderer now separates static and moving caster arrays, retains the static
field for each cached camera window, and reuses working/RGB buffers. The local
lightmap exposes a monotonic receiver revision, including reset. Upload validity
includes lightmap identity, raster identity and raster generation. An upload
holds only a weak reference to its source raster so it cannot retain an evicted
coverage field outside the scene budget. Reset releases the complete lighting
state; upload byte accounting includes both Canvas and ImageData backings.

`receiver-lane-counters.json` is a 600-frame **unit workload**, with fixed sky
and a retained 256×256 window at step four, not a desktop timing sample:

| Counter | After warm-up, 600 moving frames |
|---|---:|
| Static coverage builds | 0 |
| Moving coverage blits / moving casters blitted | 600 / 600 |
| RGB merges | 600 |
| Static field changed bytes | 0 |
| Static / working / RGB arrays retained | all three |
| String / numeric cache-key lookups | 0 / 1803 |
| Retained mask / coverage / RGB bytes | 7744 / 24576 / 16384 |
| Retained bytes after reset | 0 |

`integrated-tests.log` passes five suites / 25 tests. Its upload test performs
600 stationary frames with one Canvas, one ImageData and one upload total,
then 600 moving frames with no additional Canvas/ImageData allocation or static
coverage rebuild and 600 uploads. Window changes, local-light reset and replacing
a lightmap with an equal numeric revision all refresh the correct image.
A new, uncached 4-px camera window still requires static rasterization; these
counts do not claim zero coverage work while travelling through arbitrary terrain.

`golden-comparison.json` records **zero changed channels** on all four lighting
boards after integration with P3 omit pages. `paged-terrain-comparison.json`
records exact terrain and pond output at 1×/2×/Native, including the HUD witness.
The world-lighting board was visually inspected. Earlier pre-P3 captures remain
under `pre-p3-integration/`; they are not substituted for the integrated goldens.

Seasonal receiver sampling, raster merge (including coverage preparation) and
pixel upload are now attributed to the existing lightingReceiver/Merge/Upload
stages. Split-scene preparation and Canvas/ImageData allocation remain in their
parent stages, not these three sub-timers. The accurate O(casters) sample loop
remains: the three field approximations had maximum RGB errors 85, 87 and 50
on 76,800 samples each (`raster-accuracy-experiment.json`). No tolerance was
relaxed, and no constant-time sampling or completed P4 exit is claimed.

The following table retains the last measured real-client P2 baseline in
milliseconds p50/p95/p99. P3 and P4 real-client after samples remain unmeasured
because the canonical browser session expired; see P3's authenticated capture
block. No offline fixture timing substitutes for an active-rAF sample.

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P4 after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

Real-client per-frame counters, long tasks and lightingReceiver/painterDraw p95
after P4 are **unmeasured — authentication required**. All 14 original counters
remain in the protocol export. Basic zero retained lighting bytes is covered by
renderer reset tests, but a fresh real-client mode-switch counter proof is still
required. The shared minute-per-mode/policy gameplay review also remains open.

Physical iPad: **owner to run**. In the approved candidate preview, choose Video
→ World scale 1×, world zoom 2, browser zoom 100%; open System → Developer →
Render → **Run protocol + copy JSON**. Keep Safari foreground for the full
105-second Basic/Classic/Dynamic run; tap **Copy capture JSON** if clipboard
completion is refused. Repeat at 2× and Native. Attach model/iPadOS/Safari
versions; the export includes commit/backend/policy/DPR/resolution/stages and
counters. No desktop throttling substitutes for the physical device.

Commands: `npm run check`; focused engine/client Vitest suites and typechecks;
scoped ESLint; `node .../P4/build-goldens.mjs`, `run-goldens.mjs`,
`run-scale-goldens.mjs`; `tsx .../P4/compare-goldens.ts`,
`compare-paged-terrain.ts`; `tsx .../P4/receiver-lane-counters.ts`;
`tsx .../P4/raster-accuracy-experiment.ts` (the earlier three failed approaches).

### 2026-09-06 — P6 implementation checkpoint; desktop and global pair gate open

Status: **IN PROGRESS**. Numeric queue preparation, retained arrays and sprite
state ownership are integrated; the real-client sort/draw exit and literal
one-native-pair-per-item gate remain open. Full canonical gate: **PASS**, `check-runtime.log`, 590 suites / 3,475 tests,
915.89 seconds; typechecks, lint, lifecycle checks and asset validation green.
Artifacts are under `output/perf-59-20260906/P6/`; exact integrated source paths
and SHA-256 values are in `integrated-source-hashes.json` (base `f5f8e053`).
Mechanical enqueue/sort extraction `3ad33cb1` and painter-effect extraction
`ec23d536` precede behavior changes; their check logs are retained here.

Queued items now carry numeric kind, identity and prepared plane/depth keys.
A reused array sorts in place. Lexical tie ranks preserve the existing comparator,
including stable collation-equivalent strings and exact fractional depth inside
a packed bin. The retained identity cache prunes expired projectile identities
and enforces a 4,096-entry bound after sorting; an oversized current queue keeps
its correct prepared order and releases cached identities afterwards. Legacy
producers still construct string ties, so this is not a claim of zero producer
string allocation. Hot enqueue classification and the sort no longer run their
former regular expression and locale comparison on every item/comparison.

The outer gameplay sprite wrapper owns native state save/restore. Anchored,
banded, swaying, rotated and flipped helpers restore only their changed state
inside that ownership; callers outside it retain native isolation. Authored-map
sprite closures adopt the same helper. Display Canvas creation requests
`alpha:false`. `desynchronized` remains false: its input-to-submit driver is
prepared but authenticated measurement and physical tearing review are unavailable.
Transforming helpers still allocate DOMMatrix snapshots; no zero-heap claim is made.

`integrated-tests.log`: five suites / 27 tests pass; client typechecking passes.
The recorded 283-item frame sorts identically to the previous comparator, with
additional fractional-bin, streaming-insertion and collation-tie cases.
A 600-frame identity churn test retains three active keys, peaks at five and
retires 1,198 expired identities. A 64-item frame under a 32-key test limit
preserves order and leaves zero cached identities afterwards.

`painter-context-comparison.json` draws 19 actual sprite/effect cases: **86 → 19
native pairs**, **zero changed channels**, including rotated landmarks and wildlife
hit flash. This fixture was inspected visually. These counts exclude terrain,
ground and HUD; they are not per-frame real-client totals. Current integrated
`golden-comparison.json` has zero changed channels on all four lighting boards
against P4, and `paged-terrain-comparison.json` has exact terrain/pond output
and HUD witnesses at 1×/2×/Native. Earlier private-worktree captures are retained
under `pre-p4-integration/`.

`cutaway-state-feasibility/` records a remaining technical constraint: Canvas
clip regions intersect and cannot be reopened without restoring state. The
current three-pass cutaway requires three independent clips. A one-pair
accumulating-clip witness changes 11,498 channels (maximum 130); flattening two
overlapping cliff subframes into a preallocated scratch and masking once changes
15,500 channels (maximum 34), because alpha no longer applies per subframe.
The HUD witness remains exact. This is a clipping-semantics fixture, not a full
terrain benchmark. Necessary clipping pairs and remaining transform-only terrain
pairs are retained; the literal one-pair-per-logical-item test is not claimed.

The last measured desktop baseline is preserved below in original milliseconds
p50/p95/p99. P6 after cells and all 14 real-client counters remain unmeasured
pending authentication. Basic's ≤6ms budget and the stage residual cannot yet
be assessed for this integrated change; no long-task result is claimed.

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P6 after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

Physical iPad: **owner to run**. In the approved candidate preview, select Video
→ World scale 1×, world zoom 2 and browser zoom 100%; System → Developer →
Render → **Run protocol + copy JSON**, keeping Safari foreground for 105 seconds.
Use **Copy capture JSON** if clipboard completion is refused; repeat at 2× and
Native. Attach device/iPadOS/Safari versions to the export, which includes
commit/backend/policy/DPR/resolution, every stage and every counter. No desktop
CPU throttle is substituted. Shared minute-per-mode/policy play is also pending
the authenticated session.

Commands: `npm run check`; `npm exec vitest run` for painter-depth,
painter-context, renderer, gameplay-painter and structural-seam tests;
client typecheck and scoped ESLint; `node .../P6/build-goldens.mjs`,
`run-goldens.mjs`, `run-scale-goldens.mjs`; `tsx .../P6/compare-goldens.ts`,
`compare-paged-terrain.ts`, `compare-painter-context.ts`; the recorded-frame,
19-sprite and cutaway fixture commands/provenance alongside their artifacts.
`capture-desynchronized.mjs` has not run; it is not listed as a passed check.

### 2026-09-06 — P5 tint-page checkpoint; filters, cap consolidation and measurements open

Status: **IN PROGRESS**. The exact-RGB page pool is integrated; five-bit
quantization, filter removal, cap-layer consolidation and the real-client stage
exit remain open. Full canonical gate: **PASS**, `check-tint-runtime.log`, 590 suites / 3,478 tests,
873.58 seconds; typechecks, lint, lifecycle checks and asset validation green. Artifacts are under
`output/perf-59-20260906/P5/`; `integrated-source-hashes.json` identifies both
changed engine files, `receiver-frame-source.ts` and its replacement tests.
The old per-entry Canvas/LRU implementation and obsolete tests are removed.

Receiver frames now shelf-pack into 512×2048 pages, keyed by collision-checked
numeric tuples for source identity, emission identity, frame rectangle and exact
RGB. The default four-MiB budget permits one page. A full page evicts its complete
generation and reuses its backing; returned frame rectangles include packed
x/y offsets and retain the immediate-draw scratch contract. Each build clips its
copy/multiply/destination-in/emission sequence to its own rectangle, so adjacent
entries survive. Source artwork stays immutable; no filter or readback is added.
Reset zeros every backing and releases all cached entries and counted bytes.

Constructor `surfaceLimit` now limits pages; `tintSurfaceReuses` and public
`reuses` count page-generation recycling. A budget below four MiB or a frame
wider than 512 / taller than 2048 throws the existing receiver_frame budget
error; white passthrough remains allocation-free. No production caller supplies
a sub-page custom budget. Cached access checks for context loss; unavailable,
lost or failed draw surfaces release the affected page and use the established
failure prefix. No smaller hidden per-frame cache remains.

`tint-pool-tests.log`: nine tests pass, including 20,000-colour churn through
one page/four rollovers, stale-generation lookup, context loss and reset.
Engine typechecking and source/artifact ESLint pass. `tint-pool-comparison.json`
compares a Chromium source-isolation/translucency/emission/rollover board and all
four lighting boards: **zero changed channels**, including the exact HUD witness.
The unchanged previous cache is substituted for the reference bundle only.
Current integrated goldens and terrain/pond scale comparisons are recorded
separately as `golden-comparison.json` and `paged-terrain-comparison.json`.

The following are **browser fixture counts**, not real-client stage timings:

| Workload | Before | Page pool |
|---|---:|---:|
| Six warm exact-colour frames: sources | 6 | 1 |
| Same warm set: retained bytes | 24576 | 4194304 |
| 600 repeated frames × 12 reads: new surfaces | 0 | 0 |
| Same 600 frames: new tint builds | 0 | 0 |
| 12 large changing-colour frames: sources | 4 | 1 |
| Same churn: retained bytes | 4194304 | 4194304 |
| Same churn: tint builds | 12 | 12 |
| Same churn: surface / page-generation reuses | 8 | 2 |
| Reset bytes / surfaces | 0 / 0 | 0 / 0 |

The fixed page increases memory for tiny working sets, while staying within the
existing four-MiB pixel budget. Constant colours in the warm fixture do not prove
zero tint builds under continuous moving-shadow RGB changes. Exact RGB remains
because the three five-bit approximations exceed the one-step artwork gate.
The three dim derivations also exceed it; hit-only CPU feasibility does not yet
remove the runtime effects. Every original world filter still needing replacement
is an unresolved P5 requirement, not a passed grep gate.

`cap-review/design.md` records why a single flattened viewport layer changes
current semantics: flat entity artwork interleaves with actors; cutaway opacity
applies to individual overlapping subframes; transformed landmarks sample their
light field before their transform. A packed source-command atlas could retain
that order, but needs collection seams, explicit overflow bounds and base-ground
integration. A two-level 512×2048-slot design plus shared scratch would retain
12 MiB; eight levels would retain 36 MiB. This design is not implemented and no
one-multiply or zero-groundSource claim is made. Existing accurate cap rendering
remains, and its counters must be measured after authentication is restored.

Last measured real-client baseline, original milliseconds p50/p95/p99:

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P5 after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

All 14 real-client after counters, long-task counts and painterDraw/ground p95
remain **unmeasured — authentication required**. Basic/Dynamic desktop budgets
and shared minute-per-mode/scale gameplay review therefore remain open.

Physical iPad: **owner to run**. In the approved candidate preview, choose Video
→ World scale 1×, world zoom 2 and browser zoom 100%; System → Developer →
Render → **Run protocol + copy JSON**, keeping Safari foreground for 105 seconds.
If clipboard completion is refused use **Copy capture JSON**; repeat at 2× and
Native. Attach model/iPadOS/Safari versions; commit/backend/policy/DPR/resolution,
stages and counters are in the JSON. No desktop throttle substitutes for it.

Commands: `npm run check`; `npm exec vitest run packages/engine/src/receiver-frame-source.test.ts`;
engine typecheck and scoped ESLint; `node .../P5/tint-pool-build.mjs`,
`tint-pool-run.mjs`; `tsx .../P5/tint-pool-compare.ts`; integrated
`build-goldens.mjs`, `run-goldens.mjs`, `run-scale-goldens.mjs`,
`compare-goldens.ts`, `compare-paged-terrain.ts`. Formula experiments and their
original failed comparisons remain alongside `quantization-comparison.json`
and under `filter-feasibility/`; no fourth approximation was attempted.

### 2026-09-06 — P8 Canvas ownership/submission seam checkpoint

Status: **IN PROGRESS**, Canvas seam only. Prerequisite experimental-backend
wording in docs01/02/21 was committed as `485edbbc` before prototype work.
No WebGL code, toggle, GPU timing or WebGL parity is claimed at this checkpoint.
Full canonical gate: **591 suites / 3,482 tests passed**, 872.53 seconds
(`check-canvas-seam.log`); typecheck, lint and asset validation pass. Artifacts are under
`output/perf-59-20260906/P8/`; `seam-source-hashes.json` records the five changed
engine files against `96c9b6c0`.

`WorldPassBackend` owns world/present capacity, begin/composite and disposal,
and names sprite, cap-run, chunk, smooth-plane, weather and particle submissions.
The Canvas implementation retains the existing frame reset/composite sequence.
Sprite commands carry immutable artwork plus RGB/variant metadata and the exact
prepared Canvas source. The gameplay painter still uses its existing Canvas
compatibility context; this is not yet a complete backend-neutral submission
migration. HUD drawing remains on the display Canvas. Backend switching and
client teardown still need to call the new disposal boundary in the later
experimental integration.

`seam-tests.log`: two suites / 17 tests pass. Six hundred begins retain two
surfaces; explicit disposal releases all world/present backing bytes and rejects
new semantic submissions. The display context is validated before allocating
backend surfaces; a failed world context releases partial backings. Semantic
submissions require begin first. Review found and corrected an initially missing
smooth-sampling setting for quarter-resolution light planes and missing partial
constructor cleanup; both now have focused tests. Engine typecheck and scoped
ESLint pass. Duplicate old world ownership/composite code is removed from
UnifiedRenderer rather than retained as a second implementation.

`golden-comparison.json` and `paged-terrain-comparison.json` record exact four
lighting boards and six terrain/pond policy views. Their direct-context route
alone does not prove the new semantic methods, so `seam-submission-review.ts`
adds a browser fixture calling sprite/flip/cap/chunk/multiplyPlane/weather/particles
explicitly. `seam-submission-comparison.json` has **zero changed channels** and
an exact HUD witness. That fixture retains **5,013,504 → 0 bytes** on disposal.
Its external screenshot includes a four-pixel transparent strip below the
1280×720 drawing surface, forcing RGBA PNG output for the existing CPU decoder;
viewport metadata is accurately 1280×724. No world pixel readback or new image
decoder dependency is introduced. Initial opaque RGB screenshot decoding and
a probe for unavailable optional Pillow are fixture-tooling failures, not
rendering or pixel-approximation results.

The last measured desktop baseline remains P2, in original milliseconds
p50/p95/p99. Authentication is still required for P8 Canvas seam overhead and
real-client stage/counter captures. Neither the three-percent dormant abstraction
ceiling nor any WebGL adoption/presentation claim is inferred from compilation.

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P8 Canvas seam after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

Real-client per-frame counters and long-task results after this seam remain
**unmeasured — authentication required**. There is no experimental backend yet,
so both WebGL presentation topologies, context-loss restoration, automatic
fallback reasons, Video persistence and backend parity are outstanding P8 work.

Physical iPad: **owner to run**. In the approved candidate preview set World
scale 1×, world zoom 2 and browser zoom 100%; System → Developer → Render →
**Run protocol + copy JSON**, keeping Safari foreground for all 105 seconds.
Use **Copy capture JSON** if clipboard completion is refused and repeat at
2×/Native. Attach model/iPadOS/Safari versions; commit/backend/policy/DPR/resolution,
stages and counters are embedded. Repeat for WebGL only after that implementation
exists. No CPU-throttle sample or local fixture replaces physical capture.

Commands: `npm run check`; focused renderer/world-pass-backend Vitest suites;
engine typecheck and scoped ESLint; `node .../P8/build-goldens.mjs`,
`run-goldens.mjs`, `run-scale-goldens.mjs`, `run-seam-submission.mjs`;
`tsx .../P8/compare-goldens.ts`, `compare-paged-terrain.ts`,
`compare-seam-submission.ts`. The first private-worktree fixture route lacked
generated assets; its failure log is retained and the corrected harness reads
the same integrated generated pages as the reference. Primary Khronos API
references for upcoming work are recorded in `primary-api-references.json`.


### 2026-09-06 — P7 presentation pacing checkpoint

Status: **IN PROGRESS**. P1 and P6 implementation inputs are merged, but
physical iPad acceptance and authenticated after-captures remain outstanding.
HUD cache is an independent lane and is not claimed by this pacing checkpoint.
Artifacts: `output/perf-59-20260906/P7/`. Full pacing gate: **596 suites / 3,495 tests passed**, **879.21 seconds**
(`check-pacing.log`); typecheck, lint and asset validation pass.

Mechanical main extraction `1e63a449` moves only loop construction into new
`gameplay-loop.ts`; `loop-extraction-source-hashes.json` asserts the exact two
main replacements. Its canonical check passes **591 suites / 3,482 tests** in
**848.56 seconds**, with types/lint/asset validation green
(`check-loop-extraction.log`). The subsequent pacing implementation changes
16 source/test files listed and hashed in `pacing-source-hashes.json`: loop and
new cadence/policy modules, gameplay renderer/protocol metadata, Video rows,
metrics attribution, focused tests and the reviewed structural seam digest.

Video gains **30 Hz cap**, persisted per client and off by default. It applies
on a frame boundary, including cross-tab storage changes, while all rAFs still
advance the same fixed-step accumulator and interpolation. Absolute deadlines
avoid turning a purported 30 Hz cap into 60/72 Hz on high-refresh displays.
Suspend/resume resets the presentation deadline; overdue presentations are
skipped rather than replayed. Storage denial retains a consistent session
choice without interrupting gameplay. The iPad automatic default remains off
because the physical P0 baseline has not been supplied.

`pacing-integrated-tests.log` records **8 suites / 132 focused UI/loop/metrics/seam tests** passing.
`cadence-controlled.json` exercises the actual FixedStepLoop with deterministic
timestamps; these are functional counts, **not device performance**:

| Controlled display Hz | 10-second rAF count | Fixed updates off / on | Submissions off / on, including initial |
|---|---:|---:|---:|
| 60 | 600 | 600 / 600 | 601 / 301 |
| 120 | 1,200 | 600 / 600 | 1,201 / 301 |
| 144 | 1,440 | 600 / 600 | 1,441 / 301 |

Every capped submission has the same interpolation/update state as the
corresponding uncapped rAF. Metrics preserve skipped-rAF update time and native
source counts until the next submission. The exact scope starts at the first
rAF after the preceding submission; async Canvas work before that rAF remains
excluded as in P0. The focused witness records update time **2 + 3 = 5 ms**,
two draws from one distinct source, then resets to **1 ms / zero draws** on the
next interval. These injected times test attribution and are not benchmark data.
Capture JSON now includes the cap in display and top-level metadata.

Review found and fixed compact layout overlap, discarded skipped-rAF metrics
and cross-tab preference/active-rate mismatch. `pacing-fixture/` contains real
OverworldUi/skin/font browser captures and persistence results. Chrome
152.0.7977.64 on Linux, DPR1, browser zoom100%, headless/no throttle, UI scale2;
1280×720 display Canvas in a 3200×1600 browser viewport. The compact fixture
uses a 720×360 Canvas / 360×180 logical UI. Root viewed both on and compact
screenshots. Clicking enables the cap, reload retains it, and a second click
disables it. Compact Video omits informational rows so controls stay above the
fallback/footer text; bounds tests include 240×140 through 640×360 logical UI.
This isolated UI fixture is not authenticated gameplay or shared-preview review.

The last measured real-client desktop baseline remains P2, in original
milliseconds p50/p95/p99. No after-stage improvement, long-task result, walking
visual result or battery/thermal result is inferred from controlled timestamps.

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P7 pacing after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

Real-client per-frame counters after pacing remain **unmeasured — authentication
required**. Canvas/lighting/terrain goldens are repeated at the P7 implementation
boundary; full shared-browser walking, all scale/mode combinations and physical
acceptance remain outstanding. No global zero-lighting Classic claim is made.

Physical iPad: **owner to run**. In the candidate preview, choose Canvas,
World scale1×, world zoom2 and browser zoom100%. Set Video → 30 Hz cap OFF;
System → Developer → Render → **Run protocol + copy JSON**, keep Safari visible
for105 seconds, then repeat with cap ON and at2×/Native. Use **Copy capture JSON**
if clipboard completion is refused. Record iPad model/iPadOS/Safari and a matched
battery/thermal trace per doc47 §19; the JSON embeds commit, policy, cap, DPR,
resolution, all stages and counters. No desktop CPU throttle replaces this row.

Commands: `npm run check`; focused Vitest loop/policy/Video/metrics/UI/seam tests;
client typecheck and scoped ESLint; `node .perf59-pacing-review/review-video.mjs`;
`tsx .perf59-pacing-review/cadence-review.mjs`. Private replay workspace and exact
UI fixture input copies are documented in `pacing-fixture/README.md`.


### 2026-09-06 — P7 ordered HUD cache integration checkpoint

Status: **IN PROGRESS**. Full HUD `npm run check` passes: **600 suites / 3,509 tests**, **815.24 s** Vitest duration; types, lint and asset validation pass (`P7/check-hud.log`). The P7 stage table above
also applies to this checkpoint: every real-client after stage/counter and the
physical iPad battery/thermal result remain **unmeasured — authentication required**
or **owner to run**, respectively. No isolated HUD count is a gameplay p95.

`hud-integrated-source-hashes.json` records 11 files against `e0a92b1d`:
OverworldUi, new HUD section/cache-key and weak display-ownership modules/tests,
renderer disposal/diagnostics and a failing-disposable test, gameplay display and
protocol diagnostics, a configuration-matching test and structural seam digest.
`hud-integrated-tests.log`: **7 suites / 139 tests pass**, client typecheck and
scoped lint pass. The protocol excludes changing HUD build/reuse telemetry from
its viewport/policy equality check, while retaining that telemetry in before/after
JSON; otherwise every successful reuse would invalidate a capture.

Status/watch/moon, currency and hotbar composite at their existing positions in
the UI draw order. Minimap, portraits, vitals, blinking effects, menu/crafting
buttons, windows, notifications, tooltips, cursor and scene overlays stay direct.
Keys retain and compare semantic scalar values, exact transforms/geometry and
asset/image/revision identities; no model JSON is allocated. Explicit artwork
invalidation covers in-place authored metadata changes. The direct reference
path disposes caches when disabled; unsupported transforms/alpha/filter remain
direct. Obsolete direct section calls are replaced in their original positions.

The initial tight-crop prototype changed nearest-neighbour edge decisions:
maximum **165** over **204 channels** at1×, **235** over **492 channels** at1.25×.
The accepted version keeps the original display backing dimensions/transform and
copies only the section rectangle. This retains three RGBA surfaces, **12 bytes
per display pixel**, or **11,059,200 bytes at1280×720**. This is HUD memory, not
lighting memory. At644×364 the stationary fixture retains **2,812,992 bytes**.

`hud-integrated/capture.json`, `comparison.json`, bundled source and45 PNGs
repeat the actual-art browser matrix after integrating the pacing control and
ownership bridge: **45/45 exact comparisons, zero changed channels**, actual
browser DPR1/1.25/2 and effective UI scales through2.625. Watch/moon, real apple
and pickaxe art, independent durability changes, hover, live translucent minimap
and portrait callbacks, vitals/effect blink, inventory open/close and disposal
are included. Root viewed the fractional-scale side-by-side capture. Source-root,
base commit, dirty source hashes, requested asset hashes, OS/browser, viewport,
DPR, transforms and backend are recorded; these are isolated UI fixtures.

| 600 stationary draws | Direct | Cached |
|---|---:|---:|
| drawImage calls total | 148,200 | 48,000 |
| drawImage calls per draw | 247 | 80 |
| New cache builds | n/a | 0 |
| Cache reuses | n/a | 1,800 |
| New cache Canvas allocations | 0 | 0 |
| Live minimap calls per UI | 600 | 600 |
| Live portrait calls per UI | 600 | 600 |

The registered display owner releases every cache. `hud/ownership.json` proves
**3 caches / 4,395,300 bytes → 0 / 0** on an805×455 backing at browser DPR1.25;
UI-own retained bytes also reach0, repeated disposal is safe, and later drawing
constructs three fresh caches. Registry entries are weak and pruned. Renderer
disposal uses finally so a failed generic HUD disposable cannot strand the
world/present surfaces; the owning client now invokes renderer disposal on HMR.

`golden-comparison.json`: all four integrated lighting boards are exact against
the preceding Canvas seam. `paged-terrain-comparison.json`: all six terrain/pond
policy views are exact at1×/2×/Native, including the HUD witness. These do not
replace the missing minute-per-mode/scale authenticated gameplay review.

Commands: full `npm run check` in canonical workspace; focused HUD/UI/renderer/
protocol/seam Vitest suites; client typecheck/scoped ESLint; HUD `measure-hud.mjs`
and `compare-hud.ts`; P7 `build-goldens.mjs`, `run-goldens.mjs`,
`run-scale-goldens.mjs` (also with `PERF59_POND=1`), `compare-goldens.ts` and
`compare-paged-terrain.ts`. Agent fixture evidence is preserved under `hud/`;
the integrated replay is under `hud-integrated/`. iPad remains **owner to run**
using the preceding P7 cap-OFF/cap-ON protocol steps and physical battery trace.


### 2026-09-06 — P8 experimental backend integration checkpoint

Status: **IN PROGRESS**. Initial integration check passes **610 suites /3,558 tests**, **888.03s** Vitest duration, plus types/lint/assets (`P8/check-webgl.log`). Final 0.6.0 check also passes: **610 suites / 3,560 tests**, **818.90s**, with types, lint and asset validation (`release/check-0.6.0.log`). The persisted Video
control defaults off; Canvas 1× remains the client default. Known unsupported
lighting/downsampling operations deliberately latch Canvas with a visible
`worldPassFallbackReason`. Full GPU lighting parity and authenticated desktop
acceptance are OPEN, not waived by the experimental label.

`P8/integrated/source-hashes-before-final-ownership.json` identifies40 initial runtime/test files against
`556999ba`: lazy client backend controller and tests, frame retry handling,
metrics/protocol metadata, Video policy/layout, renderer ownership, source
adapters, retained raw coverage/local fields,16 new WebGL modules/tests and
Canvas present cleanup. The backend seam was already committed separately.
No new dependencies. All new modules remain below400 lines. `world-readback.test.ts`
recursively checks engine/client/UI runtime sources, including WebGL; only
existing CPU source-art preprocessing is explicitly allowed.

The shared painter submits directly through the strict GPU context adapter.
Page textures are nearest filtered; immutable images upload once per revision;
mutable Canvas sources require a matching frame/revision. Receiver RGB is vertex
data. Ground metadata carries the three coverage byte fields plus local RGBA,
with shader corner-max resolve before interpolation. The Canvas producer path
remains unchanged. GPU ground source preparation bypasses the tint pool, scratch
Canvas and ImageData. Raw fields retain at most8 entries /16MiB including their
coverage references, and use monotonically increasing upload revisions even
across entry eviction/reset. Review caught and fixed a repeated-revision texture
staleness case. A600-moving-update test retains the same arrays, samples local
RGB only on local revision changes, performs zero CPU RGB merges, and releases
all scene bytes on reset. Dynamic destination multiply currently rejects before
creating a Canvas lighting plane; it does not conceal the parity gap with a CPU
flattened world upload.

Toggle transitions occur at frame boundaries. Stale asynchronous module loads
are ignored; disabling releases the GPU backend. Every backend failure latches
Canvas for the session while preserving the stored choice. World errors retry
a complete frame once; lighting failure can independently retry once. HUD
errors are outside the world phase and retain their original exception. Resize,
constructor/import/shader/resource/extension/restore failures have explicit
tests. Cleanup attempts every buffer, VAO, program, shader, texture, query, event
listener and backing axis even when another release throws. Restoration rebuilds
GPU objects from retained CPU page/field sources.

`P8/integrated/focused-tests.log`:18 suites /82 tests pass before the final
raw-revision regression assertion; that assertion also passes in its3-test suite.
Engine/client typechecks and scoped lint pass. Agent ownership/release followups
have28 focused tests plus real-browser loss/restoration probes. Full canonical
`npm run check` is recorded in `P8/check-webgl.log`.

`P8/integrated/golden-comparison.json`: all four Canvas lighting review boards
exact, zero changed channels. `paged-terrain-comparison.json`: all six terrain
and pond views exact at1×/2×/Native, HUD witness exact. The integrated Video
fixture clicks ON, reloads to confirm persistence, activates a real WebGL2
backend, invokes `WEBGL_lose_context`, renders the next boundary on Canvas and
shows **CANVAS: CONTEXT LOST** while the toggle staysON. The actual lost backend
releases **10,190,852 bytes →0**, textures1→0, buffer/program/VAO1→0 each. Root
viewed normal and compact screenshots. Evidence: `P8/integrated/video/` and
`dist/video-review.js`; isolated UI/world fixture, not authenticated gameplay.

The software-GPU device is Chrome152.0.7977.64 / Linux6.17.2-1-pve / Ryzen9955HX,
ANGLE Vulkan SwiftShader, no throttling. `P8/webgl/device.json` records this;
there is no hardware-GPU or iPad performance claim. Both present candidates use
1280×720, DPR1, zoom3, world1×427×240,600 unlit sprites,5-second warm-up and
30-second active-rAF sample,1,802 frames each:

| Synthetic present stage, ms p50/p95/p99 | Canvas copy (kept) | CSS world layer (rejected) |
|---|---:|---:|
| GPU CPU-side submission | 0.300/0.500/0.600 | 0.300/0.500/0.600 |
| Final present | 5.700/7.100/8.000 | 0.300/0.500/1.200 |
| Whole synthetic frame | 6.100/7.500/8.300 | 0.600/0.900/1.500 |
| Retained bytes | 5,181,768 | 1,495,368 |
| Texture count / uploads / batches per frame | 2 /2 total /2 | 2 /2 total /2 |
| Bytes after dispose | 0 | 0 |

Canvas copy preserves the P1 nearest-then-smooth contract exactly. The CSS layer
changes194,053 channels above one step, maximum82, on the matched presentation
fixture, with HUD exact. Therefore its faster synthetic number is not accepted.
`P8/webgl/present-*.json` preserves original timings and pixel results.

The three lighting attempts and original residuals are preserved in
`P8/webgl/attempt-{1,2,3}.json` and `rounding-attempts.md`: sprite channels above
one4,144 /3,064 /840 (maximum2); corrected ground channels568 then160
(maximum2). Attempt1 also had a coordinate bug, maximum156. Unlit source-over
qualifies within one; the actual seasonal board qualifies within one in the
internal diagnostic mode, but full GPU lighting does not. Source downsampling
has a separate maximum138 edge discrepancy. Production rejects these unverified
paths and shows Canvas fallback; no fourth approximation is attempted.

Metrics label the active backend and reason. Optional disjoint timer queries
retain at most8 reusable queries and poll only available, non-disjoint results;
this software device reports unavailable, **not zero GPU time**. Protocol JSON
separates Canvas native counters from GPU batches/resources and records latest
completed GPU times observed during the active sample (batched completions may
not all be represented). GPU scope excludes Canvas final present/HUD.

The last real-client desktop baseline remains P2. Every stage below is original
ms p50/p95/p99; neither synthetic present timings nor unit-test injections are
substituted for after-stage gameplay measurements.

| Stage | Basic P2 before | Classic P2 before | Dynamic P2 before | P8 Canvas / WebGL after |
|---|---:|---:|---:|---|
| Whole frame | 9.400/11.500/12.700 | 10.600/12.800/14.800 | 15.200/20.500/26.800 | unmeasured — authentication required |
| snapshotPrepare | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.100/0.200 | unmeasured — authentication required |
| ground | 0.300/0.500/0.600 | 0.300/0.500/0.600 | 0.400/0.600/0.700 | unmeasured — authentication required |
| painterBuild | 4.600/5.800/6.800 | 5.100/6.500/7.900 | 5.100/7.400/9.500 | unmeasured — authentication required |
| painterSort | 0.100/0.100/0.200 | 0.100/0.100/0.200 | 0.100/0.200/0.200 | unmeasured — authentication required |
| painterDraw | 0.500/0.700/0.800 | 0.600/0.700/0.900 | 2.300/3.200/4.400 | unmeasured — authentication required |
| weather | 0.000/0.100/0.200 | 0.000/0.100/0.200 | 0.000/0.200/0.300 | unmeasured — authentication required |
| lightingBoundsResize | 0.000/0.000/0.000 | 0.000/0.000/0.100 | 0.000/0.000/0.100 | unmeasured — authentication required |
| lightingOcclusionRaster | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingMerge | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingUpload | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingReceiver | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingComposite | 0.000/0.100/0.100 | 0.000/0.100/0.100 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingAnimatedStaticSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| lightingDynamicSolve | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.000/0.000 | unmeasured — authentication required |
| finalWorldComposite | 1.600/2.000/2.200 | 2.100/2.600/3.000 | 1.400/2.200/2.800 | unmeasured — authentication required |
| uiModel | 0.400/0.600/0.700 | 0.500/0.600/0.700 | 0.500/0.800/1.100 | unmeasured — authentication required |
| uiLayout | 0.500/0.600/0.700 | 0.500/0.700/0.800 | 0.500/0.700/1.100 | unmeasured — authentication required |
| uiDraw | 1.300/1.900/2.100 | 1.400/1.900/2.100 | 1.400/2.100/2.500 | unmeasured — authentication required |
| fixedUpdate | 0.200/0.300/0.400 | 0.200/0.400/0.500 | 0.200/0.400/0.600 | unmeasured — authentication required |
| catchUp | 0.000/0.000/0.000 | 0.000/0.000/0.000 | 0.000/0.400/0.500 | unmeasured — authentication required |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

Real-client per-frame counters after P8 are **unmeasured — authentication
required**. GPU fixture resource counts above and raw-field allocation tests
are separate evidence. No zero-lighting Classic claim or desktop6/10ms target
claim is made. Shared-preview walking and minute-per-mode/scale/backend visual
review remain blocked by the expired authenticated session.

Physical iPad: **owner to run**. Open the candidate preview after signing in;
Video → World scale1×, 30Hz cap OFF, Experimental WebGL OFF; use System → Developer
→ Render → **Run protocol + copy JSON** and keep Safari visible for105 seconds.
Repeat with WebGL ON, preserving any fallback reason (a Canvas fallback sample
is not a GPU sample), then2×/Native and cap ON. Record iPad model/iPadOS/Safari,
DPR, browser zoom100%, resolution and a matched battery/thermal trace. JSON
contains commit, all stages/counters, actual backend and optional GPU timing.
Use **Copy capture JSON** if automatic clipboard copy is refused.

Commands: canonical `npm run check`; focused Vitest suites; engine/client
`tsc --noEmit`; scoped ESLint; private P8 `build-goldens.mjs`, `run-goldens.mjs`,
`run-scale-goldens.mjs` (also `PERF59_POND=1`), `compare-goldens.ts`,
`compare-paged-terrain.ts`, `review-video.mjs`; agent parity/present/loss scripts
listed in `P8/webgl/handoff.md`. No deployment or production-dist build occurred.


P8 literal-fixture follow-up: `P8/webgl/all-fixtures/` runs30 jobs against the
current integration, with no automatic Canvas fallback in the harness. All
Canvas baselines complete. Production GPU rejects unverified multiply in
Seasonal/Celestial and legacy Lighting, and ground composite in World plus all
six terrain/pond boards. Diagnostic GPU completes Seasonal16panels (maximum1,
zero channels above1) and Celestial9panels (**maximum63,229,351 channels above1**);
Celestial platform tops/shadows visibly differ. Legacy Lighting stops after two
modes on unsupported `context.filter`; World/terrain retain the ground guard.
Native Canvas board labels are exact on both completed GPU boards, but neither
contains an explicit HUD witness. There is no completed GPU World/terrain HUD
witness comparison. These results explicitly fail P8's full parity gate; no
fourth shader approximation was attempted. Source hashes, original per-job
results, PNGs and reproduction commands are included.


P8 final packaging/ownership checkpoint: the build probe initially placed GPU
implementation code in the eager Canvas chunk despite the dynamic client import
(Canvas chunk254.39kB). A dedicated `webgl-world` group excluding recursive
dependency capture keeps27.75kB of GPU implementation lazy; Canvas chunk226.66kB.
`scripts/check-client-build-chunks.ts` now traverses static imports to reject any
eager path to the GPU implementation. This minimally extends P8 scope to the
existing Vite config/chunk gate. Build warning thresholds for unrelated existing
UI/simulation chunks are unchanged. Version-only manifest/lock changes prepare
0.6.0 as requested; no dependency versions change.

Final ownership review also found that the disposed GPU wrapper reported zero
managed bytes while its geometry object still retained540,672 CPU staging bytes.
Geometry now releases that array and separately accounts the equally sized GPU
buffer; backend disposal clears adapter state too. Active geometry bytes remain
1,081,344; both allocations reach0 after disposal, including injected deletion
failure. The final browser context-loss replay includes that fix. GPU resource
telemetry is refreshed after the current world composite, so per-frame batch
counts do not lag a submitted frame. `final-ownership-tests.log`:10 suites /56
tests pass, including source-boundary checks. All rendering methods/shaders
remain unchanged by disposal fixes. Final full 0.6.0 gate passes below.


The final frozen source set is `P8/integrated/source-hashes.json`:55 explicit
files against556999ba, including13 version-only manifests/lockfiles and the two
packaging files. Both canonical/integrator source hashes matched the initial
passed gate before this final update. The final full gate is
`release/check-0.6.0.log`: **PASS**, 610 suites / 3,560 tests, 818.90 seconds Vitest duration; types, lint and asset validation pass. All 55 source hashes match canonical, integrator and private build roots.
The release request, rollback artifact and exact proposed live commands are in
`output/perf-59-20260906/release/README.md`, explicitly **HOLD**. The request does
not authorize deployment or waive any OPEN acceptance requirement.


Final release lockfile correction: the initial broad version bump also touched
`packages/world/node_modules/typescript`, whose pre-existing version field was
0.5.7 despite a5.6.3 resolved tarball/integrity and installed compiler. Restore
that field to5.6.3; only root/workspace manifests become0.6.0. No resolved
dependency, integrity or declaration changes. The interrupted initial0.6.0
check is preserved as `release/check-0.6.0-pre-lock-fix.log`; it is not a pass.
The final gate was restarted after this correction and passed.


Release preparation: isolated `npm run build` passes (`release/build-0.6.0-final.log`); the production-mode client build and chunk-isolation gate pass. All 323 regenerated files are byte-identical. Static artifact smoke has zero browser exceptions and loads neither omit pages nor the GPU implementation on sign-in; this is not authenticated gameplay evidence. The final committed build is sealed as `release/client-0.6.0.tar`, with `client-0.6.0.sha256` and `candidate-manifest.json` recording its exact commit, source and file hashes. The 384-file rollback archive is `release/client-dist-before-0.6.0.tar`; production remains unchanged. Archive completion and exact gate/build provenance are recorded in the linked release README. P3–P8 acceptance remains OPEN, so this is a held candidate, not a completed release.


### P8 follow-up — mutable Canvas source correction (2026-09-07)

P8 remains IN PROGRESS under its existing claim. The 2026-09-07
client/rendering DECISIONS row records the bounded ordering exception while
authenticated repeatability capture is unavailable; remaining follow-up work
keeps the amended order. Source correction:
`packages/engine/src/webgl/world-pass-webgl.ts` and new
`packages/engine/src/webgl/world-pass-mutable-source.test.ts`. A Canvas rewritten
between two draws previously reused the frame's first texture upload. Unversioned
mutable canvases now force a flush and upload on every draw; explicit producer
revisions keep caching. The obsolete implicit frame counter is removed. No
shader, accuracy guard, Video default, dependency or live file changed.

Artifacts: `output/perf-59-20260907/P8/cache-confirm/README.md`, original probe
under `P8/cache-probe/`, full Canvas replays under `P8/canvas-goldens/`, and
`P8/sampling-results.md` plus its linked diagnostic directories. Source hashes,
Chrome/OS/GPU metadata, original JSON, PNGs, commands and limitations are retained.
Base commit 5205f9d6 plus the hashed correction; the existing sealed 0.6.0 archive
contains the base commit only. It has not been silently replaced.

| Pixel check | Before max / channels >1 | Corrected max / channels >1 |
| --- | ---: | ---: |
| One mutable source, red then blue | 255 / 2,048 | 0 / 0 |
| Existing seasonal fixture | 1 / 0 | 1 / 0 |
| Existing celestial fixture | 63 / 229,351 | 2 / 484 |

All ten Canvas reference boards are byte-identical: seasonal, celestial, legacy
lighting, world lighting and all six scale/pond terrain boards. Board labels are exact, but
these two fixtures have no explicit HUD witness; celestial remains outside the
original one-step gate. Visually inspected celestial and before/after mutable
source boards. Texture uploads for the complete fixtures: mutable 1→2,
seasonal 7→7, celestial 62→70; GPU draw calls seasonal 122→122 and celestial
93→93. These are whole-fixture counts, not per-frame gameplay counters.
Unversioned unchanged sources also refresh each draw; no speedup is claimed.

Real WEBGL_lose_context replay: 1,091,588 active/restored managed bytes, zero
after dispose; upload count 1→2 on restoration. Thirteen failure reasons are
recorded; frame-failure disposal returns managed bytes to zero. All 36 original
atlas PNG hashes still match P0. Production accuracy fallbacks remain enabled.

| New protocol evidence, all RENDER_STAGE_IDS | p50 | p95 | p99 | Per-frame counters |
| --- | --- | --- | --- | --- |
| Desktop Basic / Classic / Dynamic | not captured | not captured | not captured | not captured |
| Physical iPad | owner to run | owner to run | owner to run | owner to run |

These synchronous SwiftShader fixtures are functional evidence, not active-rAF
or hardware performance samples. Last desktop stage tables remain in
`output/perf-59-20260906/release/authenticated-resume.md`, with their original
workload qualifications; no new comparison or allocation claim is made here.
Shared browser tab_5 currently shows Account. Dedicated-account setup awaits a
distinct email because the provided email belongs to the owner's existing
Orchard login. Existing credentials/roles were not modified. iPad steps: sign in
on the candidate, use the fixed visible-player route/content, select scale and
backend in Video, open diagnostics, press Run render protocol, keep foreground
for all three 35-second mode captures, copy JSON; record device/OS/browser,
resolution/DPR/zoom. Repeat for each scale/backend and reject fallback samples
as GPU evidence. These steps are expanded in the artifact README.

Sampling investigation stays separate from the source fix. Explicit nearest tie
selection made the prior 600-sprite downscale fixture exact with Canvas-copy
(HUD exact); CSS layer still differs by 82 steps. A 120-case 4 MiB atlas sweep
then rejected both the simple tie rule (24 failed, max249, 6,846 changed channels)
and the relative-crop-coordinate variant (22 failed, max249, 6,510 changed).
The current sampler fails 70 cases, max249, 51,036 changed. Neither prototype
enters runtime; no third attempt or new lighting-rounding approximation was
made. The general downsample guard and existing P8 OPEN remain.

Commands: focused WebGL tests (7 suites /33 tests), final independent
HTMLCanvasElement/OffscreenCanvas regression (4 pass; unpatched source failed
3/4), actual-source Chrome fixtures, lifetime/failure replay, source/artifact
ESLint, P0 atlas-hash comparison, and canonical `npm run check`. The first full
run was interrupted to correct the OffscreenCanvas test's class independence;
the next failed artifact lint because generated bundles were outside `dist`.
Both logs are preserved; bundles were moved to `dist` without rule exceptions.
A subsequent run terminated with exit143 after approximately fifteen minutes
without test results; the final run uses a detached runner and exit-status file.
Isolated production-mode client build, lazy chunk boundaries and static artifact
smoke pass; all 56 relevant source hashes match the three working roots.
Final gate: PASS — 611 suites / 3,564 tests; Vitest 1,075.49 seconds; lifecycle, world build, types, lint, coverage thresholds and asset validation pass (`P8/cache-probe/check.log`, exit0).

This is a tested correctness follow-up, not P8 exit or a release approval.
Remaining gates include cropped/fractional sampling, full GPU fixture parity,
matched visible-player gameplay captures and painter-build recovery. Release
remains HOLD; no deployment request is advanced while these remain unresolved.

Independent allocation finding (no runtime change): the exact existing minimap
callback allocates 29 canvases for 29 tile transitions over 600 calls, and zero
while stationary after warm-up. The isolated terrain-stub replay and source
hash are under `output/perf-59-20260907/P7/minimap-probe/`; it does not attribute
every earlier gameplay allocation or replace the required main-file extraction.


### A-1 / P0 follow-up claim — 2026-09-07

Claimed in M7.3 before implementation. Adopt the owner’s pending first-pass
amendments as the binding follow-up scope. The latest instruction authorizes
deployment once fixes and gates are complete; no live action occurs at this
claim. Runtime remains b72f683d, whose full check passed 611 suites /3,564 tests
with unchanged code after that gate. Authenticated A-1 capture remains pending
while shared tab_5 shows Account; offline preparation continues under A-10.

### A-1 diagnostics extraction checkpoint — 2026-09-07

Before extending the gameplay capture API, mechanically moved its existing
on-demand diagnostic expression into the new 68-line
`packages/client/src/gameplay-diagnostic-snapshot.ts`; `overworld-main.ts`
now supplies the same inputs to that function. No render, cache or lighting
policy changes are part of this checkpoint. The TypeScript AST printer emits
identical diagnostic expressions before and after; evidence is
`output/perf-59-20260907/P0/diagnostics-extraction/mechanical-equivalence.json`.
This satisfies doc 15 §8.1 before the subsequent diagnostic API wiring.

Commands: focused ESLint, AST equivalence comparison, canonical `npm run check`
(detached runner to avoid the tool session timeout). The full gate passed:
**611 test files, 3,564 tests, 1080.30 s Vitest duration**, exit **0**; all asset
validation passed. Logs and exit status are in the same artifact directory.
The later A-1 capture changes are being developed separately in the integrator
and are excluded from this extraction commit and its gate claim.

| Evidence | Desktop | iPad |
| --- | --- | --- |
| All 22 render-stage p50/p95/p99 values | not captured at this mechanical checkpoint | owner to run |
| All 14 per-frame operation counters | not captured at this mechanical checkpoint | owner to run |

No new performance or visual improvement is claimed. The shared canonical
preview still exposes the Account screen and no gameplay API, so authenticated
A-1 timings and the minute-per-setting review remain OPEN: technical under
A-10. Earlier disqualified measurements remain preserved in the preceding
ledger; this checkpoint does not relabel them as a baseline. The iPad procedure
remains System → Developer → Render → Run protocol + copy JSON, keep Safari
visible, repeat every world scale, and record the device/iPadOS/Safari/DPR/zoom/
resolution and client commit; the forthcoming A-1 update adds workload and
sky-step qualification. A-1 is not complete and release remains HOLD.

### A-1 capture implementation scope — 2026-09-07

After mechanical extraction `524c3d1e`, the follow-up adds optional painter
observation in `gameplay-painter.ts` and extends the existing gameplay protocol
modules. This is the narrowly recorded P0 file-scope extension in DECISIONS.md;
sorting and drawing are unchanged. New bounded modules own request attribution,
RGB-step recording, workload validation, the camera route, pond identity mapping,
and presentation restoration. The launcher pins the artwork season from actual
atlas filenames, a sunset clock, a camera square and lantern preview, closes the
diagnostics window while walking, and restores the original UI/Video/preview
settings. No shared clock or player-position mutation is used.

The capture rejects causal comparison when the actual rendered player is absent,
not walking, or outside the viewport; when cap/pond/light/caster content is absent;
when scene revisions change; or when measured camera paths/item populations do
not match. Dynamic preflight caster density is retained only as a scalar witness
for Basic/Classic, which do not retain Dynamic surfaces for this measurement.
Every Image.src request is tagged with its effective and requested quality at
queue dispatch, including suite preflight and restoration. A deterministic sunset
RGB step occurs ten seconds into the active sample; its first and following frame
have independent complete stage/counter distributions.

The implementation gate and browser evidence are pending below. These additions
prepare A-1; they do not claim that the currently signed-out shared tab has yielded
a qualified scene or performance sample. The authenticated workload and P6b remain
open under A-10, and release remains HOLD.

### A-1 authenticated repeatability checkpoint — 2026-09-07

Owner sign-in resolved the access blocker. The isolated production candidate ran the real client against the live world at the canonical origin through local Playwright routes; no served frontend changed. Candidate label `524c3d1e-a1-route-clock`, base commit `524c3d1e`; exact 24-file scope/hashes and commands are in `output/perf-59-20260907/P0/repeatable-capture/`. The added ESLint exclusion covers only generated rollback bundles at `build/releases/**/previous-dist/**`, as recorded in DECISIONS.md.

Reference device: orchard / AMD Ryzen 9 9955HX, Linux 6.17.2-1-pve x86_64 (glibc 2.43), Headless Chrome 152.0.0.0, CSS 1280×720, DPR 1, browser zoom 1, world zoom 2, Canvas, presentation cap off, no CPU throttling. Every JSON includes metadata. Fixed seed 1329809490, summer asset URLs, day 10.5 sunset, camera origin (5369.875, 5442.3125), 20-pixel square, normal authoritative walking and presentation-only lantern. Every mode has 5-second warm-up and 30-second active-rAF sampling.

The original route-clock comparison normalized each recording independently to its first and last rAF; uneven cadence falsely shifted comparisons. The fix records the actual submitted camera route clock and compares common elapsed times. A regression test checks unequal cadence/boundary offsets and still rejects a two-pixel route change. Earlier `canvas-*-route-clock-diagnostic.json` results and their source manifest remain preserved and disqualified from causal comparison.

**Canvas 1x: milliseconds p50 / p95 / p99.** Artifact: `P0/repeatable-capture/canvas-1x.json`.

| Stage | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| whole frame | 9.700 / 12.000 / 14.800 | 11.400 / 14.700 / 21.400 | 23.400 / 32.100 / 42.200 |
| snapshotPrepare | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 |
| ground | 0.400 / 0.500 / 0.600 | 0.400 / 0.600 / 0.700 | 0.400 / 0.600 / 0.800 |
| painterBuild | 4.800 / 6.300 / 7.700 | 5.000 / 6.900 / 10.800 | 5.100 / 7.500 / 11.200 |
| painterSort | 0.100 / 0.200 / 0.200 | 0.100 / 0.200 / 0.200 | 0.100 / 0.200 / 0.300 |
| painterDraw | 1.500 / 1.900 / 2.500 | 1.500 / 2.000 / 3.200 | 11.300 / 16.900 / 21.500 |
| weather | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.200 / 0.300 |
| lightingBoundsResize | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.200 |
| lightingOcclusionRaster | 0.000 / 0.000 / 0.000 | 0.000 / 0.300 / 0.400 | 0.000 / 0.400 / 0.500 |
| lightingSolve | 0.000 / 0.000 / 0.000 | 0.100 / 0.200 / 0.200 | 0.200 / 0.300 / 0.300 |
| lightingMerge | 0.000 / 0.000 / 0.000 | 0.100 / 0.200 / 0.200 | 7.200 / 10.300 / 13.200 |
| lightingUpload | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.100 / 0.300 / 0.400 |
| lightingReceiver | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 2.400 / 3.500 / 5.100 |
| lightingComposite | 0.000 / 0.000 / 0.100 | 0.000 / 0.100 / 0.100 | 0.000 / 0.000 / 0.000 |
| lightingStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingDynamicSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| finalWorldComposite | 0.400 / 0.500 / 0.600 | 1.700 / 2.000 / 2.700 | 0.400 / 1.200 / 1.800 |
| uiModel | 0.500 / 0.600 / 0.800 | 0.500 / 0.700 / 1.100 | 0.600 / 0.900 / 1.400 |
| uiLayout | 0.500 / 0.700 / 0.900 | 0.500 / 0.700 / 1.200 | 0.600 / 0.800 / 1.300 |
| uiDraw | 1.200 / 1.800 / 2.100 | 1.300 / 1.900 / 2.400 | 1.300 / 2.000 / 2.600 |
| fixedUpdate | 0.200 / 0.400 / 0.500 | 0.200 / 0.400 / 0.800 | 0.300 / 0.500 / 0.900 |
| catchUp | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.400 | 0.200 / 0.500 / 0.800 |

| Counter: p50 / p95 / p99; mean per frame | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| drawImageCalls | 1767.000 / 1791.000 / 1791.000; 1771.5620 | 1768.000 / 1792.000 / 1792.000; 1772.5611 | 2107.000 / 2130.000 / 2138.000; 2089.1834 |
| distinctDrawImageSources | 34.000 / 34.000 / 35.000; 34.0256 | 35.000 / 35.000 / 36.000; 35.0260 | 40.000 / 40.000 / 41.000; 39.7641 |
| tintBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 7.000; 0.2264 |
| tintReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 56.000 / 56.000 / 63.000; 54.7192 |
| tintSurfaceReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| filteredFrameBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| coverageFieldRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 3.000; 0.0573 |
| preparedHeightRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0029 |
| groundSourceOperations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 336.000 / 336.000 / 336.000; 312.3266 |
| imageDataAllocations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 2.000; 0.0543 | 0.000 / 0.000 / 2.000; 0.0917 |
| saveCalls | 426.000 / 447.000 / 447.000; 428.2198 | 428.000 / 449.000 / 449.000; 430.2460 | 429.000 / 449.000 / 449.000; 431.0067 |
| restoreCalls | 426.000 / 447.000 / 447.000; 428.2198 | 428.000 / 449.000 / 449.000; 430.2460 | 429.000 / 449.000 / 449.000; 431.0067 |
| saveRestorePairs | 426.000 / 447.000 / 447.000; 428.2198 | 428.000 / 449.000 / 449.000; 430.2460 | 429.000 / 449.000 / 449.000; 431.0067 |
| surfaceAllocations | 0.000 / 1.000 / 1.000; 0.0874 | 0.000 / 1.000 / 1.000; 0.0577 | 0.000 / 1.000 / 1.000; 0.1223 |

| Mode | Cap runs min | Pond min | Carried light min | Static casters min | Lighting bytes | Long tasks ≥50ms |
| --- | --- | --- | --- | --- | --- | --- |
| basic | 1 | 1 | 1 | 277 | 0 | 0 |
| classic | 1 | 1 | 1 | 277 | 164864 | 0 |
| dynamic | 1 | 1 | 1 | 276 | 91539386 | 10 |

Request dispatch attribution (variant / effective quality / requested quality / effective model → count): omit/basic/dynamic/classic → 22; omit/basic/dynamic/unified → 22; omit/dynamic/dynamic/classic → 22. All requested atlas URLs are summer. Preparation can dispatch omit pages while complete Basic/Classic is still presented; no omit request is attributed to requested Basic.

**Canvas 2x: milliseconds p50 / p95 / p99.** Artifact: `P0/repeatable-capture/canvas-2x.json`.

| Stage | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| whole frame | 12.400 / 24.200 / 28.100 | 15.800 / 20.700 / 23.900 | 28.000 / 34.100 / 38.100 |
| snapshotPrepare | 0.100 / 0.200 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 |
| ground | 0.500 / 0.900 / 1.100 | 0.400 / 0.600 / 0.800 | 0.400 / 0.600 / 0.700 |
| painterBuild | 5.800 / 12.100 / 15.400 | 5.300 / 7.600 / 9.900 | 5.100 / 6.100 / 6.900 |
| painterSort | 0.100 / 0.200 / 0.300 | 0.100 / 0.200 / 0.300 | 0.100 / 0.200 / 0.300 |
| painterDraw | 2.600 / 4.400 / 6.100 | 2.300 / 3.300 / 4.100 | 15.700 / 19.400 / 22.000 |
| weather | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.200 / 0.300 |
| lightingBoundsResize | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 |
| lightingOcclusionRaster | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.400 | 0.000 / 0.300 / 0.400 |
| lightingSolve | 0.000 / 0.000 / 0.000 | 0.100 / 0.200 / 0.200 | 0.200 / 0.300 / 0.300 |
| lightingMerge | 0.000 / 0.000 / 0.000 | 0.100 / 0.200 / 0.200 | 9.300 / 13.400 / 15.100 |
| lightingUpload | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.100 / 0.300 / 0.400 |
| lightingReceiver | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 2.300 / 3.100 / 3.500 |
| lightingComposite | 0.000 / 0.000 / 0.100 | 0.000 / 0.100 / 0.100 | 0.000 / 0.000 / 0.000 |
| lightingStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingDynamicSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| finalWorldComposite | 0.500 / 0.800 / 1.200 | 4.600 / 5.500 / 6.400 | 0.500 / 0.700 / 0.900 |
| uiModel | 0.600 / 1.200 / 1.600 | 0.600 / 0.900 / 1.200 | 0.600 / 0.800 / 1.000 |
| uiLayout | 0.600 / 1.000 / 1.500 | 0.600 / 0.800 / 1.200 | 0.600 / 0.700 / 1.100 |
| uiDraw | 1.400 / 2.700 / 3.900 | 1.300 / 2.100 / 2.600 | 1.300 / 1.900 / 2.200 |
| fixedUpdate | 0.300 / 0.600 / 1.600 | 0.200 / 0.400 / 0.500 | 0.300 / 0.400 / 0.500 |
| catchUp | 0.000 / 0.600 / 1.600 | 0.000 / 0.400 / 0.500 | 0.300 / 0.400 / 0.500 |

| Counter: p50 / p95 / p99; mean per frame | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| drawImageCalls | 1800.000 / 1817.000 / 1823.000; 1798.0603 | 1801.000 / 1818.000 / 1824.000; 1799.0220 | 2170.000 / 2188.000 / 2194.000; 2158.2998 |
| distinctDrawImageSources | 34.000 / 36.000 / 37.000; 34.8381 | 35.000 / 37.000 / 38.000; 35.8188 | 41.000 / 43.000 / 44.000; 41.4315 |
| tintBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 1.000 / 1.000; 0.0899 |
| tintReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 50.000 / 55.000 / 56.000; 49.1563 |
| tintSurfaceReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| filteredFrameBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| coverageFieldRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 4.000 / 4.000; 0.9293 |
| preparedHeightRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 4.000; 0.1071 |
| groundSourceOperations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 363.000 / 372.000 / 372.000; 356.8908 |
| imageDataAllocations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 2.000; 0.0640 | 0.000 / 2.000 / 2.000; 0.1028 |
| saveCalls | 422.000 / 440.000 / 440.000; 423.6406 | 424.000 / 442.000 / 442.000; 425.7422 | 424.000 / 442.000 / 443.000; 425.6210 |
| restoreCalls | 422.000 / 440.000 / 440.000; 423.6406 | 424.000 / 442.000 / 442.000; 425.7422 | 424.000 / 442.000 / 443.000; 425.6210 |
| saveRestorePairs | 422.000 / 440.000 / 440.000; 423.6406 | 424.000 / 442.000 / 442.000; 425.7422 | 424.000 / 442.000 / 443.000; 425.6210 |
| surfaceAllocations | 0.000 / 1.000 / 1.000; 0.0648 | 0.000 / 1.000 / 1.000; 0.0666 | 0.000 / 1.000 / 1.000; 0.1113 |

| Mode | Cap runs min | Pond min | Carried light min | Static casters min | Lighting bytes | Long tasks ≥50ms |
| --- | --- | --- | --- | --- | --- | --- |
| basic | 5 | 1 | 1 | 278 | 0 | 2 |
| classic | 5 | 1 | 1 | 278 | 164864 | 0 |
| dynamic | 5 | 1 | 1 | 278 | 89245654 | 1 |

Request dispatch attribution (variant / effective quality / requested quality / effective model → count): omit/basic/dynamic/classic → 22; omit/basic/dynamic/unified → 22; omit/dynamic/dynamic/classic → 22. All requested atlas URLs are summer. Preparation can dispatch omit pages while complete Basic/Classic is still presented; no omit request is attributed to requested Basic.

**Canvas native: milliseconds p50 / p95 / p99.** Artifact: `P0/repeatable-capture/canvas-native.json`.

| Stage | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| whole frame | 11.300 / 15.400 / 18.100 | 17.000 / 19.500 / 21.700 | 28.500 / 34.200 / 39.300 |
| snapshotPrepare | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.100 |
| ground | 0.400 / 0.600 / 0.800 | 0.400 / 0.500 / 0.600 | 0.400 / 0.500 / 0.600 |
| painterBuild | 4.900 / 7.100 / 8.900 | 5.000 / 6.100 / 7.000 | 4.900 / 5.800 / 6.900 |
| painterSort | 0.100 / 0.200 / 0.200 | 0.100 / 0.200 / 0.200 | 0.100 / 0.200 / 0.200 |
| painterDraw | 2.800 / 3.800 / 4.700 | 2.800 / 3.500 / 4.200 | 16.200 / 19.900 / 23.900 |
| weather | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.000 / 0.200 / 0.200 |
| lightingBoundsResize | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.100 |
| lightingOcclusionRaster | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.400 | 0.000 / 0.300 / 0.400 |
| lightingSolve | 0.000 / 0.000 / 0.000 | 0.100 / 0.200 / 0.200 | 0.200 / 0.300 / 0.300 |
| lightingMerge | 0.000 / 0.000 / 0.000 | 0.100 / 0.100 / 0.200 | 9.300 / 13.200 / 14.900 |
| lightingUpload | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.100 / 0.300 / 0.400 |
| lightingReceiver | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 2.300 / 3.100 / 3.600 |
| lightingComposite | 0.000 / 0.000 / 0.100 | 0.000 / 0.100 / 0.100 | 0.000 / 0.000 / 0.000 |
| lightingStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingDynamicSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| finalWorldComposite | 0.600 / 0.800 / 1.100 | 5.700 / 6.400 / 7.100 | 0.800 / 1.000 / 1.200 |
| uiModel | 0.500 / 0.800 / 0.900 | 0.600 / 0.700 / 0.900 | 0.600 / 0.700 / 0.800 |
| uiLayout | 0.500 / 0.700 / 0.900 | 0.500 / 0.700 / 1.000 | 0.600 / 0.700 / 1.100 |
| uiDraw | 1.300 / 1.900 / 2.300 | 1.300 / 1.900 / 2.200 | 1.300 / 1.900 / 2.200 |
| fixedUpdate | 0.200 / 0.300 / 0.500 | 0.200 / 0.300 / 0.400 | 0.300 / 0.400 / 0.600 |
| catchUp | 0.000 / 0.000 / 0.300 | 0.000 / 0.300 / 0.400 | 0.300 / 0.400 / 0.600 |

| Counter: p50 / p95 / p99; mean per frame | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| drawImageCalls | 1800.000 / 1817.000 / 1819.000; 1798.0934 | 1801.000 / 1818.000 / 1820.000; 1799.0944 | 2170.000 / 2188.000 / 2202.000; 2158.5780 |
| distinctDrawImageSources | 34.000 / 36.000 / 37.000; 34.8267 | 35.000 / 37.000 / 38.000; 35.8333 | 41.000 / 43.000 / 44.000; 41.4133 |
| tintBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 1.000 / 1.000; 0.1232 |
| tintReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 50.000 / 55.000 / 57.000; 49.6761 |
| tintSurfaceReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| filteredFrameBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| coverageFieldRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 4.000 / 4.000; 0.9466 |
| preparedHeightRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 4.000; 0.1091 |
| groundSourceOperations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 363.000 / 372.000 / 372.000; 356.8659 |
| imageDataAllocations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 2.000; 0.0661 | 0.000 / 2.000 / 2.000; 0.1047 |
| saveCalls | 422.000 / 440.000 / 440.000; 423.7565 | 424.000 / 442.000 / 442.000; 425.6811 | 424.000 / 442.000 / 443.000; 425.6619 |
| restoreCalls | 422.000 / 440.000 / 440.000; 423.7565 | 424.000 / 442.000 / 442.000; 425.6811 | 424.000 / 442.000 / 443.000; 425.6619 |
| saveRestorePairs | 422.000 / 440.000 / 440.000; 423.7565 | 424.000 / 442.000 / 442.000; 425.6811 | 424.000 / 442.000 / 443.000; 425.6619 |
| surfaceAllocations | 0.000 / 1.000 / 1.000; 0.0544 | 0.000 / 1.000 / 1.000; 0.0654 | 0.000 / 1.000 / 1.000; 0.1047 |

| Mode | Cap runs min | Pond min | Carried light min | Static casters min | Lighting bytes | Long tasks ≥50ms |
| --- | --- | --- | --- | --- | --- | --- |
| basic | 5 | 1 | 1 | 278 | 0 | 0 |
| classic | 5 | 1 | 1 | 278 | 164864 | 1 |
| dynamic | 5 | 1 | 1 | 278 | 89245654 | 2 |

Request dispatch attribution (variant / effective quality / requested quality / effective model → count): omit/basic/dynamic/classic → 22; omit/basic/dynamic/unified → 22; omit/dynamic/dynamic/classic → 22. All requested atlas URLs are summer. Preparation can dispatch omit pages while complete Basic/Classic is still presented; no omit request is attributed to requested Basic.

All nine scene witnesses qualify; all six within-scale Basic/Classic/Dynamic comparisons pass both population and actual route gates. These are new populated-scene baselines, not improvements over the earlier offscreen-player/flat-scene captures. Stages can nest and percentile values must not be summed.

At 1×, Basic retains **zero lighting bytes**, and every tint/filtered/coverage/ground-source/ImageData lighting counter is zero. Classic retains 164,864 legacy lightmap bytes under A-2. Dynamic exposes **336 ground-source operations p95**, painterDraw **16.9 ms p95** with nested lightingMerge **10.3 ms p95**, lightingReceiver **3.5 ms p95**, and ten long tasks. A-7 painterBuild, A-3 receiver indexing, A-6 cap-run caching and the previously identified minimap allocation remain necessary. The performance gates have not passed.

Dynamic sky-step first/following frames retain every stage/counter separately in each JSON. At 1× the first observed step costs **27.000 ms**, with 3 coverage rebuilds, 3 prepared-height rebuilds, 336 ground-source operations, zero tint builds and zero surface allocations. One induced step per capture is not a multi-run sky-burst p95 qualification. Basic/Classic explicitly have no observed Dynamic RGB-revision step.

Verification: seven focused suites / **23 tests** pass after the camera-clock correction; client typecheck, private production build and lint pass. The first full gate failed one existing 15-second map-editor timeout; the focused retry passed that test in 13.08 seconds but failed global coverage when run alone, so it is diagnostic only. The next full gate stopped at 58,244 generated-backup lint errors; the narrow exclusion fixed lint. `check-route-clock.log` is the new full gate, running after all captures with the private browser stopped. No full-pass claim is made until its exit file is recorded.

All **36 original atlas PNGs** match P0 in both source and private workspaces (`original-atlases.json`). All ten Canvas golden PNGs matched the previous reference byte for byte (`golden-comparison.json`); the later correction changes capture evidence only. Screenshots `authenticated-candidate-world.png`, `route-search.png` and `route-trial-view.png` show the actual game and pond/cliff route. They do not complete the pending shared-candidate minute-per-setting review.

| Device | Stage/counter evidence | Status |
| --- | --- | --- |
| Physical iPad | owner to run | owner to run |
| Hardware WebGL2 | owner to run | owner to run; software GPU is functional evidence only |

iPad steps: on the candidate walk to the recorded pond/cliff area, keeping the local player visible. System → Developer → Render → **Run protocol + copy JSON**. Keep Safari visible for all three modes; the action closes the panel and restores prior presentation settings. If clipboard permission is rejected, reopen Render and tap **Copy capture JSON**. Repeat World scale 1×, 2× and Native, and record iPad model, iPadOS/Safari version and browser zoom alongside exported DPR/resolution/commit/backend metadata. An unqualified workload is not comparison evidence. No desktop CPU throttling substitutes for this row.

Release remains **HOLD**. Authentication is resolved; remaining failures are rendering/performance and pending full-gate/device review, not a request for another owner approval.

Shared candidate visual review remains **OPEN: technical** after three documented origin approaches, recorded in DECISIONS.md and `shared-preview-origin-block.json`. The Windows T3 browser reaches the Tailnet static preview with active visibility, but account-refresh CORS, then production self-only CSP, then the world-token CORS preflight prevent private-origin gameplay. Only the private harness response was amended for the CSP diagnostic; no live security setting or production file changed. The private preview was stopped and temporary capture credentials removed. Canonical login and all nine local Playwright captures are successful. Continue under A-10; do not label these failed loading views as gameplay review.

Full settled A-1 gate: **`npm run check` exit 0**. Test Files  618 passed (618); Tests  3587 passed (3587); Duration  984.65s (transform 8.70s, setup 0ms, import 112.17s, tests 769.69s, environment 45ms). Lifecycle integrity, world build, all workspace typechecks, lint, coverage and asset validation pass (1,021 art assets). Scoped lint also passes for the later private-preview harness. `decoded-image-limits.json` proves the maximum decoded image is exactly 4,194,304 bytes in all nine samples. Source render behavior is unchanged by this instrumentation checkpoint; performance/device failures listed above remain open.

### A-7 / P6b claim — 2026-09-07

Claimed in M7.3 before source implementation. First extract all painter producers from `overworld-main.ts` in a mechanical no-logic-change commit, then profile and retain commands in the new bounded modules. The A-1 populated route is the comparison baseline; Basic/Classic/Dynamic 1× painterBuild p95 is 6.3 / 6.9 / 7.5 ms. Target remains ≤2 ms. This documentation claim reuses the immediately preceding green full gate with unchanged runtime sources; it makes no optimization, performance-exit or release claim.


### P6b verification prerequisite — isolated release dry-runs, 2026-09-07

The release-script tests now execute the candidate script by absolute path using its required canonical operational working directory. No production shell script, target guard, or token assertion changes. This lets the isolated integration worktree run the same complete gate while unrelated Studio work continues in the canonical checkout. Files: `scripts/release-continuity.test.ts`, `packages/tools/src/world-release-script.test.ts`. Focused tests: 17 passed; scoped lint passes. Complete `npm run check` passes in the isolated worktree; Test Files  618 passed (618); Tests  3587 passed (3587); Duration  1011.81s (transform 8.52s, setup 0ms, import 110.26s, tests 816.60s, environment 41ms). Evidence: `output/perf-59-20260907/P6/painter-extraction/check-worktree.log`, `release-worktree-tests.log`, `release-worktree-lint.log`. The concurrent mechanical extraction is covered by that frozen gate and is committed separately next; this test-only prerequisite makes no rendering performance or deployment claim.

A-1 provenance correction found during the P6b extraction capture: the first A-1 1× suite actually pinned camera origin **(5436.875, 5475.3125)**; the 2×/Native suites pinned **(5369.875, 5442.3125)**. The JSON workload identities and table counts are the authoritative records. The earlier prose calling all nine samples one origin was incorrect. All within-scale mode comparisons still pass, but no cross-scale improvement comparison involving that 1× suite is valid. The external driver now waits two active rAFs after setting the camera and asserts the reported origin. Product render/capture code is unchanged by this driver correction. The first extraction capture at (5457.875, 5494.3125) lost pond/cap visibility and is preserved as `P6/painter-extraction/canvas-1x-camera-setup-diagnostic.json`, explicitly unqualified.

### A-7 / P6b mechanical painter extraction checkpoint — 2026-09-07

Moved the setup, decoration, resource/crop/item, projectile, placeable, NPC and player producers into seven new modules, with three shared input types in `gameplay-painter-inputs.ts`. Main falls from 8,088 to 6,698 lines; the largest new module is 284 lines. No producer statement, depth key, draw body or sort changes. Explicit frame inputs and result transfers preserve the late-bound receiver and chest animation state. `mechanical-equivalence.json` confirms exact TypeScript statement trees for all seven bodies against `a7d2880d`; transfers and call order were reviewed separately.

Files: `packages/client/src/overworld-main.ts`, `gameplay-painter-{setup,decorations,resources,projectiles,placeables,npcs,players,inputs}.ts`, and the existing authored-object structural test (`content/object-presentation.test.ts`) retargeted to the moved functions. Its original sprite/light checks remain and main-to-producer calls are also asserted. The exact ten source hashes are in `output/perf-59-20260907/P6/painter-extraction/source-files.json`; DECISIONS.md records the test scope.

Commands: TypeScript AST extraction/equivalence tools; client typecheck; scoped ESLint; nine relevant structural/probe suites (34 tests initially passed, one stale source-location assertion was corrected and passed on retry); production client build with `VITE_RENDER_COMMIT=a7d2880d-painter-extraction`; ten existing Canvas fixture replays; real-client protocol; canonical `npm run check`. Full gate is running in `P6/painter-extraction/check.log` after the local browser stopped; no full-pass claim yet.

The first gameplay capture failed pond/cap qualification because the external driver read the camera before its pending preview rendered. Its original results remain in `canvas-1x-camera-setup-diagnostic.json`. The corrected driver waits two active rAFs and asserts the reported origin. The settled capture below uses the actual fixed origin (5369.875, 5442.3125), seed 1329809490, summer day 10.5 sunset, CSS 1280×720, DPR 1, world zoom 2, Canvas 1×, browser zoom 1 and uncapped presentation; AMD Ryzen 9 9955HX / Linux 6.17.2-1-pve / Headless Chrome 152.0.0.0. Full provenance is in `canvas-1x.json`.

**Settled Canvas 1×: milliseconds p50 / p95 / p99.**

| Stage | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| whole frame | 8.500 / 10.700 / 12.500 | 9.900 / 11.900 / 13.700 | 23.400 / 30.400 / 47.900 |
| snapshotPrepare | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.100 |
| ground | 0.400 / 0.500 / 0.600 | 0.400 / 0.500 / 0.600 | 0.400 / 0.500 / 0.700 |
| painterBuild | 3.700 / 4.900 / 6.300 | 3.700 / 4.700 / 5.700 | 3.700 / 4.800 / 8.000 |
| painterSort | 0.100 / 0.200 / 0.200 | 0.100 / 0.200 / 0.200 | 0.100 / 0.200 / 0.300 |
| painterDraw | 1.600 / 2.000 / 2.500 | 1.600 / 2.000 / 2.300 | 13.000 / 17.600 / 27.500 |
| weather | 0.000 / 0.100 / 0.200 | 0.000 / 0.100 / 0.200 | 0.100 / 0.200 / 0.500 |
| lightingBoundsResize | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.100 / 0.100 |
| lightingOcclusionRaster | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.400 | 0.000 / 0.300 / 0.400 |
| lightingSolve | 0.000 / 0.000 / 0.000 | 0.100 / 0.200 / 0.200 | 0.200 / 0.300 / 0.400 |
| lightingMerge | 0.000 / 0.000 / 0.000 | 0.100 / 0.100 / 0.200 | 8.800 / 13.100 / 18.600 |
| lightingUpload | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.200 | 0.100 / 0.300 / 0.400 |
| lightingReceiver | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 2.300 / 3.100 / 4.600 |
| lightingComposite | 0.000 / 0.000 / 0.000 | 0.000 / 0.100 / 0.100 | 0.000 / 0.000 / 0.000 |
| lightingStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingAnimatedStaticSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| lightingDynamicSolve (unsupported) | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| finalWorldComposite | 0.300 / 0.500 / 0.600 | 1.600 / 1.900 / 2.200 | 0.400 / 0.600 / 1.100 |
| uiModel | 0.400 / 0.600 / 0.700 | 0.400 / 0.600 / 0.700 | 0.500 / 0.700 / 1.100 |
| uiLayout | 0.500 / 0.700 / 0.800 | 0.500 / 0.600 / 0.700 | 0.500 / 0.700 / 1.200 |
| uiDraw | 1.200 / 1.800 / 2.200 | 1.200 / 1.700 / 2.000 | 1.200 / 1.800 / 2.300 |
| fixedUpdate | 0.200 / 0.400 / 0.400 | 0.200 / 0.300 / 0.400 | 0.300 / 0.500 / 1.000 |
| catchUp | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 0.200 / 0.500 / 0.900 |

| Counter: p50 / p95 / p99; mean per frame | Basic | Classic | Dynamic |
| --- | --- | --- | --- |
| drawImageCalls | 1800.000 / 1817.000 / 1819.000; 1798.0589 | 1801.000 / 1819.000 / 1824.000; 1800.3206 | 2174.000 / 2193.000 / 2201.000; 2163.7747 |
| distinctDrawImageSources | 34.000 / 36.000 / 36.000; 34.8256 | 36.000 / 38.000 / 38.000; 36.1100 | 42.000 / 44.000 / 45.000; 42.4134 |
| tintBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 1.000 / 2.000; 0.2747 |
| tintReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 45.000 / 49.000 / 50.000; 44.4451 |
| tintSurfaceReuses | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| filteredFrameBuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 |
| coverageFieldRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 4.000 / 4.000; 0.8082 |
| preparedHeightRebuilds | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 4.000; 0.0931 |
| groundSourceOperations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 0.000; 0.0000 | 363.000 / 372.000 / 372.000; 356.6648 |
| imageDataAllocations | 0.000 / 0.000 / 0.000; 0.0000 | 0.000 / 0.000 / 2.000; 0.0533 | 0.000 / 0.000 / 2.000; 0.0894 |
| saveCalls | 422.000 / 440.000 / 440.000; 423.7444 | 424.000 / 442.000 / 444.000; 426.0211 | 426.000 / 443.000 / 446.000; 427.1052 |
| restoreCalls | 422.000 / 440.000 / 440.000; 423.7444 | 424.000 / 442.000 / 444.000; 426.0211 | 426.000 / 443.000 / 446.000; 427.1052 |
| saveRestorePairs | 422.000 / 440.000 / 440.000; 423.7444 | 424.000 / 442.000 / 444.000; 426.0211 | 426.000 / 443.000 / 446.000; 427.1052 |
| surfaceAllocations | 0.000 / 1.000 / 1.000; 0.0722 | 0.000 / 1.000 / 1.000; 0.0689 | 0.000 / 1.000 / 1.000; 0.0987 |

| Mode | Cap runs min | Ponds min | Lights min | Static casters min | Retained lighting bytes | Long tasks ≥50ms |
| --- | --- | --- | --- | --- | --- | --- |
| basic | 5 | 1 | 1 | 278 | 0 | 0 |
| classic | 5 | 1 | 1 | 278 | 164864 | 0 |
| dynamic | 5 | 1 | 1 | 278 | 89058932 | 15 |

All three workload witnesses and both within-suite comparisons pass. The corrected camera and per-connection resource-revision component differ from earlier A-1 identities, so these figures are a **new pre-optimization baseline**, not evidence that extraction improved performance. Stage intervals can nest. Basic retains zero lighting bytes and performs zero tint/filtered/coverage/ground-source/ImageData lighting work. Dynamic still performs cap composites and has fifteen long tasks: A-7, A-3/A-6 and allocation work remain open.

All ten Canvas PNGs are byte-identical to A-1 (`goldens/golden-comparison.json`). `mechanical-candidate-world.png` was inspected: the player, cliff caps, pond, trees and HUD remain correctly drawn. This is actual local-client verification; it does not claim the blocked shared-origin minute-per-setting review. No authority logic, atlas pixels, quality defaults, backend policy or deployment changed.

| Device | Stage/counter status |
| --- | --- |
| Physical iPad | owner to run |
| Hardware WebGL2 | owner to run |

iPad capture steps remain System → Developer → Render → **Run protocol + copy JSON**, with Safari visible through all three modes; reopen Render → **Copy capture JSON** if deferred clipboard fails. Repeat World scale 1×/2×/Native and record device/iPadOS/Safari/browser zoom alongside exported DPR/resolution/commit/backend. Use a pond/cliff route with a visible walking player and check the JSON workload qualification. Shared private-origin review remains OPEN under A-10 and the three documented origin failures.

This checkpoint is the required mechanical move only. Producer attribution, retained commands, the ≤2 ms painterBuild target and release gates are not complete.

Extraction full-gate follow-up: `check.log` exited 1 after **872.92 s**, with 609/618 files and 3,576/3,587 tests passing. Seven failed assertions were stale locations after the mechanical move. Six audit tests now read main plus its seven invoked producers through `packages/lifecycle-authoring/src/gameplay-painter-audit.test-support.ts`, which also verifies each producer import/call; the inventory manifest's portable-light presentation anchor follows `gameplay-painter-players.ts`. No authority assertion was removed. Exact additional files: `retargeted-audits.json`; focused retry: **6 files / 27 tests passed** in `audit-retry.log`.

The other four assertions failed in concurrent Studio changes outside the integration branch. Canonical Studio sources changed during that gate. A canonical focused retry already reduced these to one failure, while the isolated branch's unchanged Studio plus lifecycle-integrity tests pass **4 files / 38 tests** (`isolated-prerequisites.log`). Lifecycle integrity also passes directly in the isolated worktree (`isolated-integrity.log`); it does not require the canonical working directory. Run the full gate against the stable integration worktree, retaining all tests, in `check-isolated.log`. No unrelated Studio edits were copied, reverted or committed. Rendering source hashes and all ten pixel goldens remain unchanged by these audit-location fixes.

The initial isolated invocation (`check-isolated.log`, exit 2) rejected the new audit helper location at the lifecycle package `rootDir` boundary. The helper now resides within that package as test support; focused lifecycle typecheck, lint and the same 27 assertions pass (`audit-typecheck.log`, `audit-lint.log`, `audit-relocation-tests.log`). Full gate retry: `check-isolated-ready.log`; checked source manifest: `check-source-files.json`. No renderer source changed during this correction.

The next isolated full run exposed four release-tool cwd assumptions: `scripts/release-continuity.test.ts` and `packages/tools/src/world-release-script.test.ts` invoked relative scripts from the worktree, but the existing operational guards require `/home/toby/projects/orchard-cellar`. Tests now invoke **the candidate script by absolute path** with that required cwd. No production shell file, target restriction, token assertion, or publication behavior changed. The existing **17 tests pass** (`release-worktree-tests.log`), including target override rejection; scoped lint passes. This verification-only correction will be committed separately from the mechanical painter extraction after the complete gate passes. Do not confuse the earlier isolated lifecycle-integrity success with permission for the operational scripts to run from another cwd.

Release continuity note: `output/perf-59-20260907/release/README.md` records the already granted conditional deployment authorization and marks the old 5205f9d6 archive stale. `live-entrypoint-continuity.json` confirms all 221 checked live entrypoint/JavaScript/service-worker files still match the old rollback manifest. This is a read-only subset check, not a fresh complete rollback gate or a deployment.

`check-isolated-ready.log` completed with **616/618 files and 3,583/3,587 tests passed in 904.93 s**, the four cwd failures above only. The corrected complete gate is running as `check-worktree.log`; exact checked files are `check-worktree-source-files.json`. This is not yet a full-pass claim.

Mechanical extraction complete gate: **`npm run check` exit 0** in the isolated integration worktree. Test Files  618 passed (618); Tests  3587 passed (3587); Duration  1011.81s (transform 8.52s, setup 0ms, import 110.26s, tests 816.60s, environment 41ms). Lifecycle integrity, checked world build, all workspace typechecks, ESLint, coverage and asset validation pass. `check-worktree-source-files.json` still matches every checked source/test byte. The only changes after the frozen runtime capture were audit locations and release-test cwd handling. Producer attribution and optimization are next; no P6b performance-exit or deployment claim.

### A-7 producer attribution preparation — 2026-09-07

Mechanical extraction is committed as **8e557732**, following isolated release-test prerequisite **52a3d81a**. The complete frozen gate passed **618 files / 3,587 tests in 1,011.81 s** with all remaining check stages green. New opt-in producer timing now wraps the seven extracted functions with a disabled-path null check; normal drawing bodies are unchanged. The existing capture module installs/disposes the bounded collector only for `profilePainter: true`. Scope is the new modules plus this existing protocol seam required by A-7 step 2. Artifacts: `output/perf-59-20260907/P6/producer-profile/`; source hashes: `source-files.json`. CPU/heap sampling is supplementary diagnostic evidence and must not be presented as unprofiled release timings.

Current authentication state: the earlier captured owner sessions expired during validation. The game SSO flow, both cached admin consoles, and the existing admin CLI session do not provide renewed authentication; exact outcomes are in `auth-renewal-block.json` and the OPEN decision. No test account was created and no auth policy changed. A renewed admin login was requested asynchronously so the already-authorized dedicated test account can remove repeated owner-session dependence. Continue offline checks; do not label an offline fixture as a completed gameplay protocol. Prior measured tables remain valid, and the current attribution/capture exit remains pending.

### A-3 / P4 offline follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. After the three recorded A-7 session-renewal failures, apply docs/15 §9 and A-10: work on independent exact receiver indexing while authenticated producer profiling remains open. This is a temporary ordering exception, recorded in DECISIONS.md, not completion of A-7. The ten optional profiler sources (plus the unchanged effects module) are preserved byte-for-byte in `output/perf-59-20260907/P6/producer-profile/deferred-sources/manifest.json` and adjacent `.txt` files; runtime has been restored to the fully checked 8e557732 mechanical checkpoint. Its 618-file / 3,587-test `npm run check` pass remains the unchanged runtime gate for this documentation claim.

Scope: `packages/engine/src/receiver-lighting.ts`, its existing test and new spatial-index modules/tests. Use conservative 4-pixel cells, fixed-then-moving candidate order, exact existing per-caster sampling and owner exclusion, bounded fallback and explicit reset. Compare equality against the full loop including fractional mask fringes. Artifacts: `output/perf-59-20260907/P4/receiver-index/`. Desktop stage tables and candidate counts remain pending authenticated capture; iPad **owner to run** using the existing System → Developer → Render → Run protocol + copy JSON, repeating World scale 1×/2×/Native with device/iPadOS/Safari/browser zoom recorded. No gameplay measurement or milestone exit is claimed by offline tests.

### A-3 exact receiver index implementation checkpoint — 2026-09-07

The 4-pixel candidate grid preserves fixed-then-moving caster order and the original owner exclusion / per-mask area sampling / max resolve. Bounds include half-pixel mask fringes and the exact contact ellipse support. CSR typed buffers reuse moving storage; indices use at most 2 MiB per cohort and 8 MiB per scene, otherwise the full ordered loop runs. Geometry changes and reset retire indices. Their retained bytes are included in lighting memory. No world surface, atlas, filter, readback or authority path changed.

Files: `packages/engine/src/receiver-lighting.ts`, new `receiver-candidate-index.ts` and `.test.ts`, and `packages/ui/src/render-operation-counters.ts` (scope amendment in DECISIONS). New exported frame counters: `receiverSamples`, `receiverCandidates`, `receiverFullLoopCandidates`; candidates are counted before owner exclusion, matching the original loop's potential visits. Artifact directory: `output/perf-59-20260907/P4/receiver-index/`, exact runtime/test hashes in `source-files.json`.

Focused validation: `npx vitest run packages/engine/src/receiver-candidate-index.test.ts packages/engine/src/receiver-lighting.test.ts` passes **2 files / 12 tests**, including **4,800 exact full-loop comparisons** plus the existing fractional comparison grid, **600 storage-reuse updates**, contact-only, owner exclusion, empty/oversized/non-finite fallback, RGB reuse and reset. Engine typecheck and scoped ESLint pass. All **ten Canvas golden PNGs are byte-identical** to the mechanical checkpoint (`goldens/golden-comparison.json`), including the HUD witnesses. I inspected `goldens/world-canvas.png`: seasonal shadows, cliff caps, artwork and white witnesses match. The first fixture build only failed because copied `mutation-review.ts` retained worktree-relative imports; resolving these to the pinned private engine fixed it (`goldens-build-ready.log`, `goldens-run.log`). No fixture drawing logic changed.

Supplementary **Node synthetic diagnostic only**, not active-rAF gameplay: 300 fixed plus one moving caster, 400 receivers per iteration, 50 warm iterations and 200 measured, alternating reference/indexed order on AMD Ryzen 9 9955HX / Linux 6.17.2-1-pve. Reference source is pinned to 8d7b094f. Timings are original milliseconds per batch:

| Diagnostic interval | Original p50 / p95 / p99 | Indexed p50 / p95 / p99 |
| --- | --- | --- |
| 400 receiver samples | 1.152901 / 2.558747 / 3.083151 | 0.397385 / 0.757760 / 1.361062 |
| prepare + first receiver | 0.005139 / 0.023323 / 0.030227 | 0.006813 / 0.042099 / 0.052569 |

Across the complete diagnostic including warm-up: 100,250 samples visited 1,411,447 candidates (**14.0793/sample**) versus 30,175,250 full-loop visits (**301/sample**). Retained coverage/index storage: **897,408 bytes**. Source, driver and raw results are `reference-receiver-lighting.ts`, `sample-benchmark.ts`, `run-sample-benchmark.mjs`, `synthetic-sampling.json`. This supports the mechanism but makes no `lightingReceiver` gameplay p95 claim; both preparation cost and sample cost are recorded.

| Required device evidence | Status |
| --- | --- |
| Desktop active-rAF full stage table and per-frame counters | pending renewed authenticated session; earlier P6 pre-optimization table remains the last qualified baseline |
| Physical iPad | owner to run — System → Developer → Render → Run protocol + copy JSON; repeat 1×/2×/Native, record iPadOS/Safari/browser zoom |

The user reported signing back in, but a newly opened controlled Keycloak tab still shows the password form. The controlled browser reports Windows/T3 Code; an exact-tab clarification is pending. This is an access/session mismatch, not an approval block. A-7 profiling and A-3 gameplay exit remain open; no deployment. Full integration gate is next (`check.log`).

Additional A-3 checks: the existing world-readback guard and sky-step capture tests pass **2 files / 3 tests** (`capture-readback-tests.log`); all 36 original atlas SHA-256 values still match the baseline in both canonical and private build workspaces (`original-atlases.json`). I also inspected `goldens/terrain-1x-pond-canvas.png`. The private diagnostic client build passes in **907 ms** with label `8d7b094f-receiver-index-painter-profile`; its only differences from the integration runtime are the preserved optional painter profiler wrappers (`private-candidate-differences.json`) and their new profiler module. This debug build is for attribution, not the sealed release artifact. The isolated test-account login harness is prepared and lint-clean, but the private account record explicitly remains `created: false`; no Keycloak account or role was changed.

A-3 implementation complete gate: **`npm run check` exit 0**, **619 files / 3,592 tests passed in 907.42 s** (tests 738.13 s), with lifecycle integrity, world build, all workspace typechecks, ESLint, coverage and asset validation green. Checked source hashes still match `check-source-files.json`. Artifact: `check.log`. This is a verified implementation checkpoint, not completion of the authenticated desktop stage/counter exit or the shared minute-per-setting review.

### A-6 / P5 follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. Exact receiver indexing is committed as **d9d5ac92**, full check **619 files / 3,592 tests** green; authenticated exits stay pending under A-10. Continue the independent A-6 Canvas fix without marking A-7/A-3 complete. Scope: `packages/engine/src/world-lighting-renderer.ts`, new run-cache modules/tests and `packages/ui/src/render-operation-counters.ts` for separate native/cap/sprite attribution. Keep every run in painter order, retain shared bounded pages, key source rectangles and world placement exactly, and verify raster identity/revision/window changes. Where a plane changed, compare its retained CPU texels over the run's complete smoothing support before repainting; unchanged local input can reuse exact pixels without world readback. Fixtures must prove alpha/cutaway composition, window edges and moving changes. No source artwork changes.

`output/perf-59-20260907/P5/ground-run-cache/` will contain source hashes, exact goldens, allocation/counter evidence and the repeated authenticated stage tables when access returns. iPad **owner to run** through System → Developer → Render → Run protocol + copy JSON for 1×/2×/Native with device/iPadOS/Safari/browser zoom. The preceding unchanged runtime full gate is the gate for this documentation claim. A-6's old counter-unit contradiction is corrected explicitly in §8 and DECISIONS, preserving historical raw values.

A-6 validation scope correction: `world-lighting-renderer.test.ts` now asserts the explicit `false` cap-run argument for flat artwork. The initial focused run passed 12/13 tests and exposed only this old four-argument spy expectation; all existing rectangle, source-scope and no-anchor-tint assertions remain. No production lighting behavior was changed to satisfy the test.

A-6 first implementation finding: all ten existing PNG goldens were byte-identical, but the additional overlapping translucent-run fixture found maximum **2 steps / 1,855 changed channels** at 1× for its initial frame, with 2×/3× exact. Artifacts and source snapshots: `P5/ground-run-cache/shared-page-attempt/`. Shared ground-run tint pages therefore do not satisfy the added exact fixture. Retain bounded original-size canvases per run and recycle them on eviction, preserving the old whole-canvas draw path; keep the existing sprite tint pages. This source-count/performance tradeoff requires the pending gameplay measurement and is recorded in DECISIONS.

### A-6 original-size ground cache implementation checkpoint — 2026-09-07

Each immutable cap/flat-art source now retains its tinted result at its original canvas dimensions and source rectangle. Exact numeric keys include source identity/rectangle, world placement, level and sampling step. A retained CPU-texel proof covers the complete smoothing support; unchanged local samples reuse the result even when a different lighting raster/window has the same revision, or a remote moving shadow changes the global plane. The proof never reads a world surface. Bounds: **8 MiB including pixel proofs, at most 512 cached surfaces, each at most 512×2048**. Eviction reuses an old surface; reset releases every canvas and byte. The three original tint operations and painter order remain unchanged. The WebGL raw-field path remains separate and unchanged.

Files and exact hashes: `output/perf-59-20260907/P5/ground-run-cache/source-files.json`. This change removes the old per-call run scratch code in `world-lighting-renderer.ts`; new modules are `ground-run-cache.ts` and `ground-run-light-stamp.ts`, with `ground-run-cache.test.ts`. The existing world lifecycle test now asserts flat-source attribution explicitly. Shared render counters preserve `groundSourceOperations` as native three-draw work and add cap/flat request and composite counts plus ground-source reuses. New modules remain below 400 lines.

Focused final validation: **4 files / 14 tests pass** (`tests-final.log`), including 600-frame reuse, revision/identity collision, local versus remote raster updates, window edges, sampling phase, source/level keys, byte/surface eviction, context loss, painting failure, reset and the existing world-readback grep guard. Engine typecheck and scoped lint pass. The first original-size test retry only exposed an assertion still counting one shared page's calls; the corrected assertion counts all owned surfaces and retains the expected total of 9 / 12 draws. No runtime code changed for that correction.

All **ten standard Canvas PNGs are byte-identical** to A-3 (`goldens/golden-comparison.json`). The added real-Chromium fixture `cache-pixel-review.ts` compares every channel of overlapping translucent runs, an actor behind cutaway alpha, window/identity collisions, in-place lighting updates and the HUD witness at three draw scales. Final result: **18/18 comparisons exact, maximum 0 steps**, including the HUD. I inspected `cache-pixel-review.png` (reference left, cache right); the matching images support the byte comparison. Source/runner/result: `cache-pixel-review.ts`, `run-cache-pixels.mjs`, `cache-pixel-review.json`. These are **offline fixture results**, not active-rAF gameplay or a minute-per-setting review.

| Offline fixture, per frame unless stated | Native ground operations | Cap composites | Flat composites | Reuses |
| --- | ---: | ---: | ---: | ---: |
| Original reference: eight runs every frame | 24 | 4 | 4 | 0 |
| Cached initial frame | 24 | 4 | 4 | 0 |
| Cached unchanged frame | 0 | 0 | 0 | 8 |
| Changed raster window, colliding revision | 3 | 0 | 1 | 7 |
| Nearby in-place light change | 9 | 2 | 1 | 5 |
| New raster identity, equal contents | 0 | 0 | 0 | 8 |
| Sampling-phase change | 24 | 4 | 4 | 0 |

Each draw scale also ran **600 unchanged frames**: **0 new cache surfaces**, **0 composites**, **4,800 source reuses**. The cache retained **13,120 bytes / 8 surfaces**, then reset to **0 bytes / 0 surfaces**. These are cache-specific allocation diagnostics; native Canvas probes and whole-client surface allocation measurement are explicitly disabled in this fixture. Standard active-rAF capture must still measure distinct sources, whole-client allocations and all stages. Retaining eight full-size sources replaces one shared page/scratch source in this fixture; that source-count tradeoff is disclosed, not assumed to improve batching.

| Required device evidence | Status |
| --- | --- |
| Desktop stage p50/p95/p99 and all per-frame counters | pending authenticated capture; no fixture timings substituted |
| Physical iPad | owner to run — System → Developer → Render → Run protocol + copy JSON; repeat 1×/2×/Native, record device/iPadOS/Safari/browser zoom |

The shared-page attempt and its two-step failure are preserved in `shared-page-attempt/`; the original-size replacement is exact. A-6 implementation validation proceeds with `npm run check` in `check.log`; authenticated exits, A-7 producer attribution and release remain open. No live deployment.

A-6 full gate: **`npm run check` exit 0**, **620 files / 3,598 tests** pass; Vitest duration **897.46 s** (tests 743.15 s). All workspace typechecks, ESLint, lifecycle integrity, checked world build, coverage and asset validation pass. The six frozen source/test hashes still match `check-source-files.json`. The implementation checkpoint is green; authenticated all-stage/counter exits remain pending.

### A-7 authentication recovery — 2026-09-07

The owner’s shared admin session is now reachable. The authorized dedicated test account was created in the **orchard** realm with only **default-roles-orchard**, a permanent private password and verified email. Normal PKCE login succeeds; the world automatically assigns the existing **friend** membership, and the character **Renderer Test** is named and playable. No administrator grant, realm-policy edit, owner-account change or deployment occurred. `output/perf-59-20260907/P6/producer-profile/test-account-ready.json` records the sanitized identity and result; credentials remain outside the repository.

The first harness callback loaded live 0.5.7 HTML after the authentication redirect, while asset requests were routed to the private candidate. It stalled on mismatched chunk URLs. The harness now immediately reloads the callback through its candidate route, completes the ordinary PKCE exchange and presses Enter at the account desk. `candidate-browser.mjs`, `candidate-browser-ready.json` and `test-account-daylight.png` record recovery. The old failed startup artifacts are retained. This supersedes the A-7 session-renewal OPEN; the separate shared private-origin review OPEN remains. Fresh-account workload identity differs from the owner’s earlier captures, so no causal before/after claim crosses those identities. Move the character through normal input to the required pond/cliff route before profiling.

### A-7 route preparation limitation — 2026-09-07

The ordinary test character starts on a terrain region disconnected from the target pond under its current walking rules, and has no jump skill. Manual cardinal travel and exact collision-solver route searches at 8- and 4-pixel spacing found no path. The latter explored 4,977 reachable positions; a diagnostic ignoring object obstacles still found no terrain route (5,373 positions). These attempts are recorded OPEN per docs/15 §9. `P6/producer-profile/navigation/` contains the read-only private Vite injection, route finder and raw diagnostics. The injection exposes existing collision inputs and movement functions; it changes no renderer body or authority state and is excluded from production. The first fixture build accidentally omitted `--mode client-production`; its log is preserved, the corrected build uses that mode, and normal dedicated-account login was reverified.

Continue producer CPU/heap attribution and all-stage captures in the authenticated spawn scene, explicitly **unqualified for A-1 because the pond is absent**. Such data can identify work to optimize but cannot close a milestone's required scene exit. No claim compares this new character/content identity to the earlier owner capture. The navigation helper stays idle during timing samples. No role grant, teleport, world mutation or deployment was used to bypass qualification.

### A-7 authenticated spawn attribution; A-3/A-6 diagnostic stages — 2026-09-07

Candidate runtime is c44c6227 plus the preserved optional producer timer and an idle private navigation reader. Exact sources: `P6/producer-profile/spawn-source-files.json`; differences from the integrator are the eight profiler wrappers/protocol files, the new profiler module and one private test-file-only lag. The navigation injection is recorded in `navigation/vite.config.ts`. Build uses `--mode client-production`. Device: AMD Ryzen 9 9955HX, Linux 6.17.2-1-pve, Headless Chrome 152.0.7977.64, 1280×720 CSS and screen, DPR 1, browser zoom 1, world zoom 2, Canvas 1×, uncapped, no throttling. Fixed camera origin (7088, 6146), summer day 10.5, sunset 17→17.25 and normal square keyboard walking. All three samples explicitly fail A-1 with **no_pond**; they are authenticated attribution, not milestone exits.

Unprofiled 5-second warm-up / 30-second active-rAF samples: `spawn-canvas-1x.json`. All original values remain in the JSON; table entries below are **p50 / p95 / p99 milliseconds**, rounded to four decimals. Stages may nest.

| Stage | Basic | Classic | Dynamic |
| --- | ---: | ---: | ---: |
| whole frame | 7.9000 / 9.6000 / 10.9000 | 8.7000 / 10.4000 / 11.5000 | 20.4000 / 29.7000 / 34.3000 |
| snapshotPrepare | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 |
| ground | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 |
| painterBuild | 3.4000 / 4.3000 / 5.1000 | 3.4000 / 4.3000 / 5.1000 | 3.7000 / 4.4000 / 5.0000 |
| painterSort | 0.1000 / 0.2000 / 0.3000 | 0.1000 / 0.2000 / 0.3000 | 0.2000 / 0.2000 / 0.3000 |
| painterDraw | 1.0000 / 1.3000 / 1.5000 | 1.0000 / 1.3000 / 1.4000 | 11.2000 / 18.9000 / 22.9000 |
| weather | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 |
| lightingBoundsResize | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.1000 | 0.0000 / 0.0000 / 0.1000 |
| lightingOcclusionRaster | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.2000 / 0.3000 | 0.0000 / 0.3000 / 0.4000 |
| lightingSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.2000 | 0.1000 / 0.2000 / 0.2000 |
| lightingMerge | 0.0000 / 0.0000 / 0.0000 | 0.1000 / 0.1000 / 0.2000 | 8.9000 / 14.9000 / 16.8000 |
| lightingUpload | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.1000 | 0.1000 / 0.2000 / 0.3000 |
| lightingReceiver | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.4000 / 0.8000 / 1.0000 |
| lightingComposite | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.0000 / 0.0000 |
| lightingStaticSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| lightingAnimatedStaticSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| lightingDynamicSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| finalWorldComposite | 1.9000 / 2.5000 / 2.6000 | 2.6000 / 3.1000 / 3.5000 | 1.1000 / 2.4000 / 2.7000 |
| uiModel | 0.3000 / 0.4000 / 0.4000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.5000 / 0.5000 |
| uiLayout | 0.4000 / 0.5000 / 0.6000 | 0.4000 / 0.5000 / 0.6000 | 0.4000 / 0.5000 / 0.9000 |
| uiDraw | 0.4000 / 0.8000 / 1.1000 | 0.4000 / 0.8000 / 1.0000 | 0.4000 / 0.9000 / 1.2000 |
| fixedUpdate | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 |
| catchUp | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.3000 / 0.4000 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Basic | Classic | Dynamic |
| --- | ---: | ---: | ---: |
| drawImageCalls | 944.0000 / 968.0000 / 970.0000 | 945.0000 / 968.0000 / 971.0000 | 975.0000 / 1117.0000 / 1171.0000 |
| distinctDrawImageSources | 30.0000 / 30.0000 / 31.0000 | 31.0000 / 31.0000 / 32.0000 | 400.0000 / 415.0000 / 415.0000 |
| tintBuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 7.0000 / 7.0000 |
| tintReuses | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 101.0000 / 106.0000 / 109.0000 |
| tintSurfaceReuses | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| filteredFrameBuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| coverageFieldRebuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 4.0000 / 4.0000 |
| preparedHeightRebuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| groundSourceOperations | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 30.0000 / 168.0000 / 213.0000 |
| imageDataAllocations | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 2.0000 | 0.0000 / 2.0000 / 2.0000 |
| capRunRequests | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 118.0000 / 122.0000 / 122.0000 |
| flatSourceRequests | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 257.0000 / 275.0000 / 275.0000 |
| capRunComposites | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 7.0000 / 26.0000 / 32.0000 |
| flatSourceComposites | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 4.0000 / 39.0000 / 52.0000 |
| groundSourceReuses | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 359.0000 / 389.0000 / 393.0000 |
| receiverSamples | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 301.0000 / 312.0000 / 312.0000 |
| receiverCandidates | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 840.0000 / 875.0000 / 878.0000 |
| receiverFullLoopCandidates | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 102942.0000 / 106704.0000 / 106704.0000 |
| saveCalls | 590.0000 / 613.0000 / 614.0000 | 591.0000 / 612.0000 / 615.0000 | 583.0000 / 611.0000 / 614.0000 |
| restoreCalls | 590.0000 / 613.0000 / 614.0000 | 591.0000 / 612.0000 / 615.0000 | 583.0000 / 611.0000 / 614.0000 |
| saveRestorePairs | 590.0000 / 613.0000 / 614.0000 | 591.0000 / 612.0000 / 615.0000 | 583.0000 / 611.0000 / 614.0000 |
| surfaceAllocations | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 |

| Mode | Frames | Long tasks ≥50 ms | Retained lighting bytes after sample |
| --- | ---: | ---: | ---: |
| basic | 1800 | 0 | 0 |
| classic | 1800 | 0 | 161280 |
| dynamic | 1241 | 0 | 97242815 |

Basic retains zero lighting bytes and does zero lighting work. A-3 receiver timing and candidate counters are now measured in this scene, but no causal comparison is made to the different owner scene. A-6 native/cap/flat counters likewise describe this scene only. The original p95 targets are still missed; painterBuild and nested lightingMerge/painterDraw remain the leading costs.

Supplementary Basic CPU/heap and producer profiling: `spawn-cpu-heap.json`, `.cpuprofile`, `.heapprofile`, `spawn-attribution.json`; original source maps retained in `baseline-source-maps/`. Profiling overhead is included and these values do not replace unprofiled gate timings. 1,799 sampled frames; per-producer **p50 / p95 / p99 milliseconds**:

| Producer | Timing |
| --- | ---: |
| setup | 0.8000 / 1.1000 / 1.4000 |
| decorations | 2.9000 / 3.8000 / 4.6000 |
| resources | 0.1000 / 0.2000 / 0.2000 |
| projectiles | 0.0000 / 0.0000 / 0.1000 |
| placeables | 0.0000 / 0.0000 / 0.1000 |
| npcs | 0.0000 / 0.1000 / 0.1000 |
| players | 0.0000 / 0.1000 / 0.1000 |

The statistical profile assigns 6,891.672 ms sampled CPU and an estimated 2,873,868,632 allocated bytes to the decoration producer entry over the profiled window. That source-map position is the function entry, so it is not a measured split between individual statements. Code inspection identifies full-cohort suppression-string checks before visibility rejection as a hypothesis to validate by an exact spatial query and retained commands. Setup includes 1,271.472 ms in `raisedTerrainProjectionRowsPerLevel`; projection/plan work is separately visible. Native/unmapped work and GC are not reassigned to a producer. The analyzer categories describe source sites, not proven allocation types.

Physical iPad: **owner to run**. System → Developer → Render → **Run protocol + copy JSON**, keeping Safari visible through all three modes; use Copy capture JSON if needed. Repeat World scale 1×/2×/Native and record device/iPadOS/Safari/browser zoom. Select a pond/cliff route with the visible walking player and verify workload qualification. Hardware GPU is also owner to run under A-9. The shared private-origin visual limitation remains OPEN.

### A-7 decoration retention checkpoint — 2026-09-07

Decorations now index immutable source cohorts in 256-world-pixel cells, compute suppression membership only when that cohort changes, and query artwork/light bounds while preserving original numeric source order. Exact per-point visibility, mutable campfire state and painter order remain unchanged. Visible decoration items retain their three draw callbacks and source ties, read the current frame’s art/animation/light state, and retire after two unseen frames; the pool is bounded to 4,096 commands. A changed source/map cohort retires the prior pool. The queue now retains projection/receiver wrappers by source-command identity, updating exact fractional geometry every enqueue; duplicate submissions still produce independent items and terrain replacement clears wrappers. Other entity producers and terrain commands still create their source commands and remain follow-up work.

Files: `gameplay-painter-decorations.ts`, `gameplay-painter.ts`, its existing test, new `gameplay-decoration-index.ts`, `gameplay-decoration-commands.ts`, their tests and `gameplay-painter-command.ts`, all under packages/client/src. Exact hashes and commands/artifacts: `output/perf-59-20260907/P6/producer-profile/decoration-retention/`. Focused **3 files / 6 tests** pass, including 300 fractional-window sequence comparisons, suppression spellings, offscreen light candidates, 600 retained frames, changing art/camera/lighting, culling, duplicate submission, fractional projection and terrain replacement. Client typecheck and scoped ESLint pass.

The output-only A/B Vite fixture pins the original decoration producer and queue to c44c6227. Both versions run in the **same authenticated connection**, with all other runtime sources identical. `command-frame.json` replays all producers against one captured frame’s inputs: all **580 sorted command tuples match exactly**. This proves the recorded command order/geometry, not callback pixel identity. The ten standard Canvas fixture PNGs are also **byte-identical** (`goldens/golden-comparison.json`), and I inspected the paired gameplay screenshots for cliff edges, walking character, tree overlap and HUD. The shared private-origin minute-per-setting review is still OPEN; this local view does not replace it. The private transform intentionally lacks source maps for its injected wrappers, so no new source-site CPU attribution is claimed from that A/B bundle.

The paired 5-second warm-up / 30-second active-rAF captures use the same reference host/browser/DPR/zoom/settings as the spawn attribution above, with camera (7088, 6146), seed 1329809490, summer and content identity dfdf555b:21a3c554:4:371. Both remain **unqualified: no_pond**. These are diagnostic before/after timings, not an A-1 milestone-exit claim. All original values are retained in `legacy-canvas-1x.json` and `retained-canvas-1x.json`. Entries below are **p50 / p95 / p99 milliseconds**; stages can nest.

| Stage | Original Basic | Retained Basic | Original Classic | Retained Classic | Original Dynamic | Retained Dynamic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| whole frame | 7.9000 / 9.5000 / 10.7000 | 5.9000 / 7.4000 / 8.8000 | 9.0000 / 11.0000 / 12.6000 | 6.6000 / 7.8000 / 9.1000 | 20.6000 / 29.3000 / 34.3000 | 18.4000 / 27.1000 / 32.2000 |
| snapshotPrepare | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.2000 | 0.0000 / 0.1000 / 0.2000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 |
| ground | 0.3000 / 0.4000 / 0.4000 | 0.3000 / 0.5000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 |
| painterBuild | 3.5000 / 4.4000 / 5.2000 | 1.1000 / 1.6000 / 1.9000 | 3.6000 / 4.7000 / 5.8000 | 1.1000 / 1.5000 / 1.7000 | 3.7000 / 4.5000 / 5.2000 | 1.1000 / 1.5000 / 1.8000 |
| painterSort | 0.2000 / 0.3000 / 0.3000 | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.3000 / 0.3000 | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 |
| painterDraw | 1.0000 / 1.2000 / 1.4000 | 1.0000 / 1.4000 / 1.8000 | 1.0000 / 1.3000 / 1.6000 | 1.0000 / 1.3000 / 1.6000 | 11.5000 / 18.5000 / 23.2000 | 11.8000 / 19.0000 / 23.6000 |
| weather | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.0000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.0000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 |
| lightingBoundsResize | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.2000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 |
| lightingOcclusionRaster | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.2000 / 0.3000 | 0.0000 / 0.2000 / 0.3000 | 0.0000 / 0.3000 / 0.3000 | 0.0000 / 0.3000 / 0.4000 |
| lightingSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.2000 | 0.0000 / 0.1000 / 0.2000 | 0.1000 / 0.2000 / 0.2000 | 0.1000 / 0.2000 / 0.2000 |
| lightingMerge | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.1000 / 0.1000 / 0.2000 | 0.1000 / 0.1000 / 0.2000 | 9.1000 / 15.4000 / 16.8000 | 9.4000 / 15.7000 / 17.8000 |
| lightingUpload | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.1000 / 0.2000 / 0.3000 | 0.1000 / 0.2000 / 0.3000 |
| lightingReceiver | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.4000 / 0.7000 / 0.9000 | 0.4000 / 0.7000 / 0.9000 |
| lightingComposite | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.1000 / 0.1000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| lightingStaticSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| lightingAnimatedStaticSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| lightingDynamicSolve | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| finalWorldComposite | 1.7000 / 2.3000 / 2.5000 | 1.9000 / 2.5000 / 2.9000 | 2.4000 / 3.1000 / 3.6000 | 2.5000 / 3.1000 / 3.6000 | 0.9000 / 2.0000 / 2.4000 | 1.0000 / 2.3000 / 2.6000 |
| uiModel | 0.3000 / 0.4000 / 0.4000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 | 0.3000 / 0.4000 / 0.5000 |
| uiLayout | 0.4000 / 0.6000 / 0.7000 | 0.4000 / 0.6000 / 0.7000 | 0.5000 / 0.6000 / 0.7000 | 0.4000 / 0.6000 / 0.7000 | 0.5000 / 0.6000 / 0.8000 | 0.4000 / 0.6000 / 0.8000 |
| uiDraw | 0.4000 / 0.8000 / 1.1000 | 0.4000 / 0.9000 / 1.2000 | 0.4000 / 1.0000 / 1.2000 | 0.4000 / 0.8000 / 1.0000 | 0.4000 / 1.0000 / 1.2000 | 0.4000 / 1.0000 / 1.2000 |
| fixedUpdate | 0.2000 / 0.4000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.4000 / 0.4000 | 0.2000 / 0.4000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 | 0.2000 / 0.3000 / 0.4000 |
| catchUp | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.3000 / 0.4000 | 0.0000 / 0.3000 / 0.4000 |

All per-frame counters, **p50 / p95 / p99**:

| Counter | Original Basic | Retained Basic | Original Classic | Retained Classic | Original Dynamic | Retained Dynamic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| drawImageCalls | 943.0000 / 965.0000 / 969.0000 | 944.0000 / 964.0000 / 968.0000 | 956.0000 / 1018.0000 / 1024.0000 | 946.0000 / 965.0000 / 969.0000 | 972.0000 / 1117.0000 / 1170.0000 | 972.0000 / 1113.0000 / 1171.0000 |
| distinctDrawImageSources | 31.0000 / 31.0000 / 32.0000 | 30.0000 / 31.0000 / 31.0000 | 31.0000 / 33.0000 / 34.0000 | 32.0000 / 32.0000 / 33.0000 | 402.0000 / 415.0000 / 415.0000 | 402.0000 / 415.0000 / 415.0000 |
| tintBuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 7.0000 / 8.0000 | 0.0000 / 7.0000 / 8.0000 |
| tintReuses | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 99.0000 / 105.0000 / 105.0000 | 99.0000 / 105.0000 / 105.0000 |
| tintSurfaceReuses | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| filteredFrameBuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| coverageFieldRebuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 4.0000 / 4.0000 | 0.0000 / 4.0000 / 4.0000 |
| preparedHeightRebuilds | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 |
| groundSourceOperations | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 30.0000 / 168.0000 / 222.0000 | 30.0000 / 168.0000 / 213.0000 |
| imageDataAllocations | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 2.0000 | 0.0000 / 0.0000 / 2.0000 | 0.0000 / 2.0000 / 2.0000 | 0.0000 / 2.0000 / 2.0000 |
| capRunRequests | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 118.0000 / 120.0000 / 120.0000 | 118.0000 / 120.0000 / 122.0000 |
| flatSourceRequests | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 255.0000 / 273.0000 / 273.0000 | 255.0000 / 273.0000 / 273.0000 |
| capRunComposites | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 7.0000 / 24.0000 / 33.0000 | 7.0000 / 24.0000 / 29.0000 |
| flatSourceComposites | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 5.0000 / 39.0000 / 55.0000 | 5.0000 / 39.0000 / 53.0000 |
| groundSourceReuses | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 358.0000 / 387.0000 / 389.0000 | 358.0000 / 387.0000 / 391.0000 |
| receiverSamples | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 301.0000 / 312.0000 / 312.0000 | 302.0000 / 313.0000 / 313.0000 |
| receiverCandidates | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 840.0000 / 872.0000 / 877.0000 | 841.0000 / 872.0000 / 878.0000 |
| receiverFullLoopCandidates | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 0.0000 / 0.0000 / 0.0000 | 102942.0000 / 106704.0000 / 106704.0000 | 103284.0000 / 107359.0000 / 107359.0000 |
| saveCalls | 577.0000 / 610.0000 / 612.0000 | 576.0000 / 610.0000 / 611.0000 | 578.0000 / 606.0000 / 612.0000 | 578.0000 / 611.0000 / 612.0000 | 577.0000 / 604.0000 / 611.0000 | 578.0000 / 605.0000 / 611.0000 |
| restoreCalls | 577.0000 / 610.0000 / 612.0000 | 576.0000 / 610.0000 / 611.0000 | 578.0000 / 606.0000 / 612.0000 | 578.0000 / 611.0000 / 612.0000 | 577.0000 / 604.0000 / 611.0000 | 578.0000 / 605.0000 / 611.0000 |
| saveRestorePairs | 577.0000 / 610.0000 / 612.0000 | 576.0000 / 610.0000 / 611.0000 | 578.0000 / 606.0000 / 612.0000 | 578.0000 / 611.0000 / 612.0000 | 577.0000 / 604.0000 / 611.0000 | 578.0000 / 605.0000 / 611.0000 |
| surfaceAllocations | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 | 0.0000 / 1.0000 / 1.0000 |

| Mode | Original → retained mean item count | Difference | Original → retained long tasks ≥50 ms | Retained lighting bytes |
| --- | ---: | ---: | ---: | ---: |
| basic | 718.8222 → 718.0622 | -0.1057% | 0 → 0 | 0 |
| classic | 718.0000 → 718.4867 | 0.0678% | 0 → 0 | 161280 |
| dynamic | 717.7712 → 718.0877 | 0.0441% | 1 → 2 | 97452352 |

Painter building is now 1.5–1.6 ms p95 in this diagnostic, while whole-frame p95 remains 7.4 / 7.8 / 27.1 ms. Dynamic painterDraw remains 19.0 ms p95, including expensive lightingMerge, and two long tasks remain. No work was moved from build to draw to claim the improvement; all stages are disclosed. Basic keeps zero lighting bytes/work. A-6’s increased distinct source count and remaining plane-change composites are preserved in the counters. Further retained entity work, world filters, allocation ownership and required-scene qualification remain open.

Physical iPad **owner to run**: System → Developer → Render → Run protocol + copy JSON, with Safari visible through all modes; use Copy capture JSON if deferred clipboard fails. Repeat World scale 1×/2×/Native, recording device/iPadOS/Safari/browser zoom and requiring the visible walking player, pond and cliff witnesses. No throttled-desktop substitution.

Full repository gate is running in `check.log`, with source freeze `check-source-files.json`. No deployment or completed A-7 claim.

Decoration checkpoint complete gate: **`npm run check` exit 0**, **622 files / 3,603 tests** pass; Vitest duration **885.05 s** (tests 723.90 s). All workspace typechecks, ESLint, lifecycle integrity, checked world build, coverage and asset validation pass. All eight frozen runtime/test hashes still match `check-source-files.json`. This is a committed A-7 substep; remaining entity retention and all previously disclosed scene/release gates stay open.

### A-7 entity source-command retention checkpoint — 2026-09-07

Base **8b10d5b4**; active A-7 claim continues. The six extracted entity producers now retain their source commands, source ties and draw callbacks in per-context, per-producer pools. Typed capture records receive current row/art/camera/animation state before enqueue. Keys separate producer call sites, entity identities and instance artwork kinds; duplicate same-frame submissions remain independent. Terrain replacement/revision clears ownership, three unseen frames retire entries, and each producer is bounded to 4,096 retained commands. Placeable retirement runs before returning animation state. Wildlife retains its hit-flash predicate and raw draw callbacks as well. The projectile helper is module-level; its bigint authority IDs and numeric prediction tokens remain distinct. No surfaces belong to these pools.

Files: the six `gameplay-painter-{decorations,resources,projectiles,placeables,npcs,players}.ts` modules, new `retained-frame-commands.ts`, and three new focused test modules. All new modules remain below 400 lines (largest producer: 338). Original per-frame source-command bodies are replaced in production. The output-only legacy fixture pins all six producers plus the queue to **8b10d5b4**. Artifact directory: `output/perf-59-20260907/P6/producer-profile/entity-retention/`; exact runtime hashes `source-files.json`, complete check source freeze `check-source-files.json`.

Validation: scoped ESLint and client typecheck pass; **6 focused files / 12 tests** pass, including 600-frame resource and wildlife draws with current state, stable wildlife effect callbacks, duplicate isolation, terrain invalidation and bounded retirement. `command-frame.json` replays the entire recorded frame: **555 sorted command tuples exactly equal**. All ten standard Canvas goldens are byte-identical to 8b10d5b4 (`goldens/golden-comparison.json`); all **36 original atlas PNGs remain byte-identical** in both canonical and private assets (`original-atlases.json`). The paired local gameplay screenshots were inspected for actor/tree overlap, cliff caps and the HUD. This is not the still-open shared minute-per-setting review.

Measurement commands: private `npx vite build --config <artifact>/vite.config.ts --mode client-production`; `python3 <artifact>/capture.py spawn-legacy-canvas-1x --legacy`, then `python3 <artifact>/capture.py spawn-retained-canvas-1x`. Same authenticated test connection, content **dfdf555b:21a3c554:4:371**, seed 1329809490, summer, camera **(7088, 6146)**, walking square at 625 ms per leg, matched sunset steps. AMD Ryzen 9 9955HX, Linux 6.17.2-1-pve, HeadlessChrome 152.0.7977.64, 1280×720, DPR 1, browser zoom 1, world zoom 2, Canvas 1×, cap off, no CPU throttling. Each mode has the required 5-second warm-up and 30-second active-rAF sample. Both suites remain **unqualified: `no_pond`**; these are authenticated spawn diagnostics, not an A-1 exit. Runtime is frozen for both variants; timing samples ran without build/check/CPU-profile contention. The private A/B injection lacks source maps, so no new source-site CPU allocation attribution is claimed.

All stage timings in milliseconds, **p50 / p95 / p99**. Intervals can nest; do not sum percentiles.

| Stage | Before Basic | Before Classic | Before Dynamic | Retained Basic | Retained Classic | Retained Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 6 / 8.299999 / 9.5 | 6.5 / 8.5 / 10.099998 | 18.799999 / 29.700001 / 38.6 | 5.5 / 7.1 / 8.1 | 6.6 / 9.700001 / 12.300001 | 17.400002 / 27.700001 / 33.700001 |
| snapshotPrepare | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.700001 | 0.300001 / 0.5 / 0.6 |
| painterBuild | 1.1 / 1.799999 / 2.200001 | 1.1 / 1.6 / 1.900002 | 1.1 / 1.699999 / 2.200001 | 1 / 1.5 / 1.799999 | 1.1 / 1.799999 / 2.200001 | 1.1 / 1.699999 / 2.300001 |
| painterSort | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.4 / 0.400002 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.4 / 0.5 |
| painterDraw | 1.099998 / 1.599998 / 1.9 | 1 / 1.400002 / 2 | 11.799999 / 20.300001 / 28 | 1 / 1.4 / 1.6 | 1.099998 / 1.699999 / 2.200001 | 11.1 / 19.1 / 23.200001 |
| weather | 0 / 0.1 / 0.1 | 0 / 0 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.199999 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.200001 / 0.4 | 0 / 0.299999 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.4 | 0 / 0.299999 / 0.4 |
| lightingSolve | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 9.299999 / 16 / 19.200001 | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 9.000002 / 15.800001 / 17.799999 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0.1 / 0.299997 / 0.300001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.799997 / 0.999996 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.799999 / 1 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.800001 / 2.5 / 3 | 2.4 / 3.1 / 3.599998 | 1.1 / 2.5 / 3 | 1.700001 / 2.4 / 2.700001 | 2.5 / 3.4 / 4.5 | 0.800001 / 2.200001 / 2.700001 |
| uiModel | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.700001 |
| uiLayout | 0.4 / 0.6 / 0.700001 | 0.4 / 0.599998 / 0.6 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.6 / 0.9 |
| uiDraw | 0.400002 / 1 / 1.200001 | 0.4 / 0.9 / 1.1 | 0.4 / 1 / 1.299999 | 0.4 / 0.9 / 1.1 | 0.4 / 0.9 / 1.1 | 0.4 / 0.900002 / 1.299999 |
| fixedUpdate | 0.200001 / 0.4 / 0.5 | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.4 / 0.5 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.5 | 0.200001 / 0.300001 / 0.5 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.4 / 0.5 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.300001 / 0.5 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | Retained Basic | Retained Classic | Retained Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 944 / 961 / 965 | 945 / 966 / 970 | 974 / 1115 / 1172 | 946 / 965 / 969 | 947 / 966 / 970 | 959 / 1108 / 1150 |
| distinctDrawImageSources | 31 / 31 / 32 | 32 / 32 / 33 | 400 / 416 / 416 | 31 / 31 / 32 | 32 / 32 / 33 | 403 / 415 / 416 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 7 / 8 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 1 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 101 / 105 / 109 | 0 / 0 / 0 | 0 / 0 / 0 | 98 / 110 / 110 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 30 / 165 / 210 | 0 / 0 / 0 | 0 / 0 / 0 | 27 / 162 / 195 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 2 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 122 | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 120 / 120 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 256 / 273 / 275 | 0 / 0 / 0 | 0 / 0 / 0 | 253 / 271 / 273 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 24 / 29 | 0 / 0 / 0 | 0 / 0 / 0 | 5 / 23 / 29 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 5 / 39 / 51 | 0 / 0 / 0 | 0 / 0 / 0 | 5 / 38 / 50 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 359 / 388 / 393 | 0 / 0 / 0 | 0 / 0 / 0 | 361 / 381 / 389 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 303 / 314 / 314 | 0 / 0 / 0 | 0 / 0 / 0 | 303 / 314 / 314 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 843 / 874 / 879 | 0 / 0 / 0 | 0 / 0 / 0 | 842 / 872 / 879 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 103929 / 108016 / 108016 | 0 / 0 / 0 | 0 / 0 / 0 | 103929 / 108016 / 108016 |
| saveCalls | 578 / 603 / 605 | 579 / 606 / 612 | 579 / 611 / 616 | 578 / 611 / 612 | 579 / 608 / 613 | 572 / 604 / 606 |
| restoreCalls | 578 / 603 / 605 | 579 / 606 / 612 | 579 / 611 / 616 | 578 / 611 / 612 | 579 / 608 / 613 | 572 / 604 / 606 |
| saveRestorePairs | 578 / 603 / 605 | 579 / 606 / 612 | 579 / 611 / 616 | 578 / 611 / 612 | 579 / 608 / 613 | 572 / 604 / 606 |
| surfaceAllocations | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 1 / 1 |

| Evidence | Before Basic | Before Classic | Before Dynamic | Retained Basic | Retained Classic | Retained Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1799 | 1310 | 1800 | 1794 | 1451 |
| Long tasks ≥50 ms | 0 | 0 | 3 | 0 | 0 | 1 |
| Maximum long task ms | 0 | 0 | 57 | 0 | 0 | 58 |
| Render items p50/p95/p99 | 717 / 739 / 739 | 717 / 739 / 739 | 717 / 739 / 739 | 717 / 739 / 739 | 717 / 739 / 739 | 717 / 739 / 739 |
| Lighting retained bytes at end | 0 | 161280 | 97377689 | 0 | 161280 | 97380073 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |

Basic ends with zero lighting bytes and all tint, filtered-frame, coverage, ground-source and ImageData lighting counters zero. Basic/Classic omit-page ownership is zero; Classic retains its amended legacy lightmap. Every decoded page is ≤4 MiB. Dynamic still has whole-client surface allocations and ground-run composites during walking. Source-command retention is not a claim of zero whole-frame allocations.

The remaining gap is explicit: retained Basic whole-frame p95 **7.100000 ms**, Dynamic **27.700001 ms**; Dynamic has one **58 ms** long task. `painterBuild` p95 is **1.5 / 1.8 / 1.7 ms** across the three modes in this diagnostic scene, but Classic whole-frame p95 rose from **8.5 to 9.700001 ms** and no uniform speedup is claimed. Dynamic `lightingMerge` remains **15.8 ms p95**, nested in `painterDraw` **19.1 ms p95**. The earlier decoration optimization remains the substantial measured producer win. Remaining A-7 work includes nested entity draw callbacks, terrain producer closures and the qualified A-1 scene; these are not silently counted as complete.

| Device gate | Status |
|---|---|
| Desktop A-1 pond/cliff scene | OPEN: route qualification, diagnostic scene only |
| iPad | **owner to run** |
| Hardware WebGL | **owner to run**; Canvas measurements above |

Owner capture: in the pond/cliff scene with the carried lantern visible, open System → Developer → Render, choose **Run protocol + copy JSON**, enter device/OS/browser/zoom metadata and the candidate commit, then save the copied JSON under this artifact directory. Repeat at 1×, 2× and Native. This one-button capture performs warm-up, active-rAF sampling, walking and sky steps; retain failed workload witnesses as failures. Physical iPad and hardware GPU results cannot be substituted with CPU throttling.

Full `npm run check` is running in `check.log`, status file `check.exit`; no deployment or completed A-7 claim. Runtime and test files are frozen in `check-source-files.json`. The release remains HOLD on the disclosed technical gates, under the owner's existing conditional deployment authorization.

The first full check found one obsolete allocation-shape assertion in `packages/studio/src/tools/map/live-world-schema.test.ts`: it required the literal `enqueueWorldDepth(x, y, {`, which disappears when the source command is retained. That assertion is replaced, not weakened, by `gameplay-homestead-retention.test.ts`: it executes the producer and checks ground contact (24,48), tent entrance depth 32, current artwork draw arguments, then changed row contact (56,80), depth 64 and stable command identity. The remaining five Studio authority/schema checks stay intact. This minimal test-only scope extension is recorded in DECISIONS. The first full run is preserved as `check-obsolete-allocation-assertion.log` (624 files / 3,608 tests passed, one failed; 996.54 s). Production runtime bytes and the recorded captures/goldens are unchanged. The complete check is rerun after this test correction.

Entity checkpoint complete gate: **`npm run check` exit 0**. Test Files  626 passed (626); Tests  3609 passed (3609); Duration  990.85s (transform 9.19s, setup 0ms, import 100.03s, tests 806.79s, environment 39ms). All workspace typechecks, lint, lifecycle integrity, checked world build, coverage and asset validation pass. All **12** frozen runtime/test hashes match `check-source-files.json`. The replacement homestead behavior test and remaining Studio schema tests pass (2 focused files / 6 tests); its initial missing `liveMapDocument: null` fixture is preserved in `homestead-test-incomplete-fixture.log`. The fixture was corrected before the complete run reached its test phase; final source hashes are recorded. Runtime bytes remain identical to the measured candidate. A-7 is still an incomplete milestone for the previously listed nested-callback and scene gates; this commits the source-command retention substep only.

### A-5 post-lighting source diagnostic and shared transport recovery — 2026-09-07

Entity retention is committed as **db82f63f**, full check **626 files / 3,609 tests** green. Two output-only diagnostics ran during that gate; neither changed production runtime nor constitutes a gameplay timing sample.

A-5: `output/perf-59-20260907/P5/filter-post-lighting/README.md` and `comparison.json` preserve three attempts to reconstruct native receiver-tinted pixels from decoded immutable PNG bytes, then apply the accepted dim/hit formula. Floating reconstruction fails at max4 / 1,248 channels above two; rounded premultiplied integer reconstruction max4 / 3,844; ceiling blend max5 / 15,816. Each has 144 cases across original/omit artwork, four receiver RGBs, three effects and a synthetic 256-alpha × 32-colour fixture; HUD error is zero. Existing artwork-only cells pass within two, but the stress fixture exposes an unsupported transparency case. The native-tint control followed by the accepted effect stays max2/HUD exact. Its offline readback cannot be moved into production. The first forced-CPU reference and its corrected default-context replay are both preserved; results are identical. Stop this reconstruction approach after three failures under docs/15 §9; the existing world filters remain an explicit release block. The accepted effect formula itself is not reversed. Commands: artifact `prepare.ts`, `run.mjs`, `inspect-rounding.mjs`. No new runtime stage table is claimed; current stage/counter values are the entity-retention table above. iPad remains **owner to run**.

Shared transport: `output/perf-59-20260907/P0/shared-proxy/` contains an output-only fixed-endpoint HTTPS relay and preview fetch adapter. A real-browser probe connects the ordinary Renderer Test account, renders **612 items**, and reports **zero page errors**; the game websocket-token upstream returns HTTP 200. There is no live auth/CORS change, credential persistence, cookie forwarding, Origin rewriting or owner-session use. This resolves the direct cross-origin token transport limitation. Shared `tab_a` still reports hidden; snapshot, evaluate and resize time out at 15 seconds each. Stop active-frame qualification under §9, retain that separate environment OPEN, and park the test tab on its sanitized status page. Canonical owner tab `tab_5` stays untouched. No shared minute-per-setting or performance claim.

### A-6 light-plane coordinate sampling follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. While the three-attempt A-5 reconstruction path is OPEN, continue independent exact Canvas work. Source inspection finds the light-plane sampler calls `mapper.projectedY(y, level)` for every texel, which recomputes the same terrain projection and allocates a filtered profile-row array each time. Profile Dynamic before changing it, then hoist only the frame-constant level projection outside the raster callback in `world-lighting-renderer.ts`; verify exact pixel fixtures and matched stages/counters. This is within the existing A-6 renderer ownership. Artifacts will be `output/perf-59-20260907/P5/plane-sampling/`. The minimap/placement mechanical extraction is prepared outside the checked tree and remains subsequent work; no logic in main has changed.

A-6 attribution scope refinement: `plane-before-profile.json`, `.cpuprofile`, `.heapprofile` and `before-attribution.json` show **8,133.833 ms sampled self CPU** at `raisedTerrainProjectionRowsPerLevel`, **1,347.934 ms** at raster `merge`, and **421.483 ms** at `sampleReceiverLight`; CPU/heap profiling overhead is included and these are not unprofiled stage percentiles. The profile workload also reports `local_player_not_walking` and `no_pond`, so it is not an exit sample. Engine/sim source maps are archived in `before-dist/`; private producer wrapper maps remain unqualified for source-site attribution. Alongside projection hoisting, remove the per-texel channel closure and add an optional caller-owned RGB destination to `lighting.ts`, with a new numeric helper. Existing ordinary callers keep independent result objects. Plane raster callbacks reuse one scratch RGB and consume it synchronously. This minimal scope extension is recorded in DECISIONS; interpolation order and zero/outside-plane behavior must remain exact.

### A-6 synchronous light-plane sampling checkpoint — 2026-09-07

Artifacts: `output/perf-59-20260907/P5/plane-sampling/`. Files: `packages/engine/src/lighting.ts`, `world-lighting-renderer.ts`, new `receiver-rgb-sampling.ts`, `receiver-rgb-sampling.test.ts`, `world-lighting-plane-sampling.test.ts`.

The synchronous Canvas plane raster now computes the terrain projection once per level and reuses one RGB result. `lighting.ts` retains independent objects for ordinary callers. The extracted numeric helper preserves the previous bilinear arithmetic order and rounding exactly. Runtime base is 3789fae0; `source-files.json` records the five changed runtime/test files. No world state, shader, source artwork or filter changes.

Focused validation: five files / eleven tests pass, including 600 moving frames, two levels with a signed terrain datum, 43,200 checked sample coordinates, one RGB destination and bounded projection calls. Engine types and scoped lint pass. All ten standard Canvas fixture PNGs are byte-identical to db82f63f (`goldens/comparison.json`), including the HUD witness; all 36 original atlases are unchanged in both canonical and private assets (`original-atlases.json`). The world fixture and local gameplay screenshot were visually inspected. This is not the pending shared minute-per-setting review.

Measurement commands: private `npx vite build --config <artifact>/vite.config.ts --mode client-production`; `python3 <artifact>/capture.py plane-before-canvas-1x --legacy`; then `python3 <artifact>/capture.py plane-after-canvas-1x`. The output-only A/B module swaps the previous and current class prototype methods before warm-up; there is no per-texel selection branch. Both variants run in the same authenticated ordinary test connection. No build, full check or CPU/heap sampler ran during these timing captures.

Device: AMD Ryzen 9 9955HX, Linux 6.17.2-1-pve, HeadlessChrome 152.0.7977.64, 1280×720, DPR 1, browser zoom 1, world zoom 2, Canvas 1×, presentation cap off, no CPU throttling. Each mode uses a five-second warm-up and thirty-second active-rAF sample, summer, seed 1329809490, camera (7088,6146), 625-ms walking legs and the protocol sunset RGB step. Exact device/source/settings metadata accompanies every JSON.

**Comparison rejected:** the earlier suite detects content revision changes from `dfdf555b:21a3c554:4:398`, plus an obstructed walking witness in Dynamic. The updated suite has stable revision `dfdf555b:21a3c554:4:405` and passes walking; both lack the required pond. Therefore these are side-by-side diagnostics, not an A-1 exit or a causal speedup claim. The updated suite records Basic / Classic / Dynamic whole-frame p95 5.799999 / 6.600000 / 16.800001 ms, Dynamic merge p95 7.400000 ms, and zero ≥50-ms long tasks in all three modes. The earlier diagnostic records 6.099998 / 7.199999 / 23.500000 ms and Dynamic merge 14.700001 ms. All 22 stages and 22 counters are in `tables.md`, with original JSON precision retained in the capture files.

The separate CPU/heap diagnostics (`plane-{before,after}-profile.*`, `{before,after}-attribution.json`) confirm the targeted terrain-profile function is no longer a dominant sampler site: sampled self CPU is 8,133.833 ms in the 40,204.494-ms before window and 14.912 ms in the 40,181.999-ms after window. These include profiling overhead and differ in world workload; they are attribution, not wall-stage performance measurements. The next large mapped site is the raster merge itself (2,324.335 ms sampled self CPU after), followed by terrain depth and shadow sampling. Source maps for the original capture are archived in `before-dist/`; private wrapper mappings are not used to claim producer allocation types.

Basic has zero retained lighting bytes and zero lighting-work counters; Basic and Classic own no omit pages. Classic keeps its amended legacy lightmap. Maximum decoded page size remains 4 MiB. Dynamic still has walking-dependent ground composites and whole-client surface allocations; the minimap allocation remains pending. No whole-frame allocation-free claim.

The renewal helper initially reported `Expected ordinary sign-in page` because the test client was already connected after reload. A direct state check confirmed an authenticated world and the installed A/B module; no credentials or owner session were needed. The owner's canonical shared tab is connected but reports `document.visibilityState === 'hidden'`; active-rAF qualification remains unavailable there.

Physical iPad: **owner to run**. In the pond/cliff scene with a carried lantern, open System → Developer → Render → **Run protocol + copy JSON**, enter device, OS, browser, zoom and candidate commit, and save the JSON here. Repeat at 1×, 2× and Native. Keep any failed workload witnesses. Hardware WebGL is also owner to run; these samples use Canvas.

Full `npm run check` is running in `check.log`, with result in `check.exit`. Source hashes are frozen in `source-files.json`. Release remains HOLD for the disclosed technical gates; deployment authorization is already recorded.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | Updated Basic | Updated Classic | Updated Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5 / 6.099998 / 7.300001 | 5.799999 / 7.199999 / 8.700001 | 15.4 / 23.5 / 26.5 | 4.9 / 5.799999 / 6.700001 | 5.6 / 6.6 / 8.199999 | 9.299999 / 16.800001 / 20.9 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| painterBuild | 1 / 1.4 / 1.6 | 1 / 1.4 / 1.700001 | 0.900002 / 1.300001 / 1.6 | 0.9 / 1.299999 / 1.5 | 0.900002 / 1.300001 / 1.6 | 0.900002 / 1.300001 / 1.699999 |
| painterSort | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 |
| painterDraw | 1.299999 / 2 / 2.4 | 1.4 / 2 / 2.5 | 9.799999 / 15.699999 / 17.799999 | 1.299999 / 1.9 / 2.199999 | 1.4 / 1.900002 / 2.299999 | 5 / 11.699999 / 14.6 |
| weather | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.200001 / 0.4 | 0 / 0.299999 / 0.4 | 0 / 0 / 0 | 0 / 0.199999 / 0.4 | 0 / 0.200001 / 0.4 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 8.300001 / 14.700001 / 16.299997 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 1.9 / 7.4 / 8.200003 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.900002 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.9 |
| lightingComposite | 0 / 0 / 0.099998 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.200001 / 1.699999 / 1.9 | 1.799999 / 2.300001 / 2.900002 | 0.6 / 1.9 / 2.1 | 1.199999 / 1.6 / 1.800001 | 1.700001 / 2.200001 / 2.599998 | 1.1 / 2.4 / 2.6 |
| uiModel | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 1 | 0.4 / 0.700001 / 1.1 | 0.4 / 0.699999 / 1 | 0.4 / 0.6 / 1 | 0.4 / 0.6 / 1 | 0.4 / 0.6 / 1.099998 |
| fixedUpdate | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.200001 / 0.300001 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | Updated Basic | Updated Classic | Updated Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 943 / 1004 / 1018 | 937 / 994 / 1019 | 954 / 1082 / 1132 | 931 / 956 / 956 | 932 / 957 / 957 | 957 / 1104 / 1159 |
| distinctDrawImageSources | 30 / 32 / 32 | 31 / 33 / 33 | 398 / 407 / 408 | 30 / 30 / 31 | 31 / 31 / 32 | 398 / 415 / 417 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 7 / 8 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 99 / 110 / 110 | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 109 / 110 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 132 / 192 | 0 / 0 / 0 | 0 / 0 / 0 | 21 / 138 / 192 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 118 / 118 | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 122 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 253 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 253 / 271 / 273 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 3 / 21 / 29 | 0 / 0 / 0 | 0 / 0 / 0 | 3 / 20 / 27 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 35 / 50 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 37 / 50 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 362 / 381 / 381 | 0 / 0 / 0 | 0 / 0 / 0 | 363 / 385 / 390 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 312 / 312 | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 312 / 312 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 840 / 870 / 877 | 0 / 0 / 0 | 0 / 0 / 0 | 839 / 870 / 877 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 106704 / 106704 | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 106704 / 106704 |
| saveCalls | 565 / 583 / 584 | 565 / 584 / 585 | 565 / 584 / 584 | 564 / 583 / 583 | 565 / 584 / 584 | 570 / 604 / 608 |
| restoreCalls | 565 / 583 / 584 | 565 / 584 / 585 | 565 / 584 / 584 | 564 / 583 / 583 | 565 / 584 / 584 | 570 / 604 / 608 |
| saveRestorePairs | 565 / 583 / 584 | 565 / 584 / 585 | 565 / 584 / 584 | 564 / 583 / 583 | 565 / 584 / 584 | 570 / 604 / 608 |
| surfaceAllocations | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 |

| Evidence | Before Basic | Before Classic | Before Dynamic | Updated Basic | Updated Classic | Updated Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1797 | 1799 | 1670 | 1800 | 1799 | 1790 |
| Long tasks ≥50 ms | 1 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 51 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 |
| Lighting retained bytes at end | 0 | 161280 | 94664978 | 0 | 161280 | 97242815 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | seed_season_or_content_changed, no_pond | seed_season_or_content_changed, no_pond | seed_season_or_content_changed, local_player_not_walking, no_pond | no_pond | no_pond | no_pond |

Plane sampling checkpoint complete gate: Full `npm run check` **passes (exit 0): 628 files / 3,612 tests**, 865.60 s (704.36 s tests). Lifecycle integrity, world build, all types, lint, coverage and asset validation pass. All five frozen source hashes still match the measured candidate. Release remains HOLD for the disclosed technical gates; deployment authorization is already recorded.

### P7 minimap allocation follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. The plane-sampling checkpoint is committed as **63268865**, full check **628 files / 3,612 tests** green. Continue the independently identified whole-client allocation fix while A-5 post-lighting reconstruction and A-8 general source-downsampling remain OPEN. First mechanically move only the minimap callback/cache from `packages/client/src/overworld-main.ts` to new `gameplay-minimap-painter.ts`, preserving current body statements and late-bound input reads; commit with no logic change under docs/15 §8.1. Then reuse its canvas across terrain-key changes in a separate change, with explicit repaint on scene/zoom/size changes, current tracking/resource markers, 600-frame allocation/pixel checks and gameplay counters. The prepared homestead-grid extraction is not part of this scope. Artifacts: `output/perf-59-20260907/P7/minimap-extraction/` and `P7/minimap-reuse/`. Source-changing full checks remain separate; this documentation-only claim uses the unchanged 63268865 runtime gate. Physical iPad and hardware GPU remain **owner to run** using the existing one-button diagnostics protocol.

### P7 minimap mechanical extraction checkpoint — 2026-09-07

Artifacts: `output/perf-59-20260907/P7/minimap-extraction/`. Files: `packages/client/src/overworld-main.ts` and new `gameplay-minimap-painter.ts`.

Base 705b94a9. Move the existing minimap terrain cache and draw callback into `packages/client/src/gameplay-minimap-painter.ts` (101 lines), with `overworld-main.ts` supplying getters for current gameplay state. Remove only the now-unused `terrainColorAt` import. The homestead-grid code stays untouched. This change does not reuse canvases yet.

`mechanical-proof.json` confirms identical normalized callback body hashes before and after (`696e15ca1ebc9b37654ec73a5831d2e627f38823dce15316b8326f66c10a82e6`); `source-files.json` freezes both changed source files. The getter facade preserves late binding, including the ore palette defined later in the entrypoint. Scoped ESLint and client typecheck pass. Phase-zero extraction boundaries and protocol display tests pass: 2 files / 7 tests. No new performance improvement is claimed by a mechanical move.

Current measured stage/counter reference is `../../P5/plane-sampling/tables.md` and its full JSON, not a newly measured sample: Canvas 1× 1280×720 Basic / Classic / Dynamic p95 5.8 / 6.6 / 16.8 ms, no long tasks, unqualified for the missing pond. The subsequent canvas-reuse checkpoint will repeat gameplay counters after the full check, without concurrent measurement/check contention. All ten Canvas review boards and original atlas hashes belong to the unchanged engine source in 63268865; this extraction's specific callback equivalence is checked separately.

Full `npm run check` passes (exit 0): **628 files / 3,612 tests**, 841.39 s (694.44 s tests). Lifecycle integrity, world build, all types, lint, coverage and asset validation pass. Both frozen source hashes still match. The private production build also passes; the renewed ordinary test account connects and renders 643 items, with no connection error (`gameplay-smoke.json`, visually inspected `gameplay.png`). The expired-session and connecting states are retained separately; they are not gameplay evidence. The harness still has its previously documented service-worker-blocking callback errors; none is attributed to the extraction.

Physical iPad: **owner to run**. System → Developer → Render → Run protocol + copy JSON in the pond/cliff/carried-lantern scene; record device, OS, browser, DPR, zoom, resolution, candidate commit, world scale and backend. Repeat 1×, 2× and Native. Shared active preview remains unavailable because the connected canonical tab reports hidden; no shared minute-per-setting claim. Deployment remains conditional on the remaining technical gates, with owner authorization already recorded.

### P8 ground-plane submission follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. The output-only `P8/guard-subset-probe/` removes just the previously tested receiver/ground/multiply guards and preserves downsampling rejection. Seasonal (16 panels) and celestial (9 panels) complete with PNGs byte-identical to the earlier diagnostics (maximum1 and maximum2/484 channels above one, respectively). All ten Canvas boards stay exact. Legacy lighting still rejects the unsupported `filter` property after two panels. World lighting and all six terrain/pond/scale fixtures stop before panel one at `webgl_accuracy_unverified_ground_composite`: `WorldLightingRenderer.compositeGround` has no GPU submission yet. This is an implementation gap independent of the known source-downsampling discrepancy. No production guard has changed, no fixture has been relabelled as gameplay, and the two completed boards still have native labels rather than an explicit HUD witness. The first unused mutation-fixture import/build failure is preserved in the artifact README; the corrected probe build/run and scoped lint pass.

Next bounded P8 step: add a raw coverage/local-light multiply-plane submission through the backend capability boundary and existing coverage textures, resolving it in one fragment pass. Keep the Canvas branch golden-identical, avoid CPU-resolved lighting uploads and GPU intermediate rounding passes, and qualify the A-8 maximum-two/0.5-percent/HUD-exact gate before enabling any path. Existing downsampling/filter rejection and all failure/disposal behavior remain binding. Ownership: `world-pass-backend.ts`, `world-lighting-renderer.ts`, `webgl/world-pass-webgl.ts`, `webgl/shaders.ts`, their relevant tests and new modules as needed; no main-file logic edit. Artifacts will be `output/perf-59-20260907/P8/ground-plane/`. Finish the current P7 canvas-reuse checkpoint before integrating this source change. Current checked runtime is 786285af (628 files / 3,612 tests green); this documentation-only claim reuses that unchanged gate. iPad and hardware GPU remain **owner to run** via the documented one-button protocol.

### P7 minimap canvas reuse checkpoint — 2026-09-07

Artifacts: `output/perf-59-20260907/P7/minimap-reuse/`. Base fd9b289b; runtime source and tests frozen in `source-files.json`. Files: `packages/client/src/gameplay-minimap-painter.ts`, new `gameplay-minimap-painter.test.ts`, roadmap and this ledger.

Reuse the mechanically extracted minimap's backing canvas when terrain, camera, scene, seed or zoom changes; resize only when dimensions change and clear before repainting. Tracking and resource markers still read current state. The 600-frame offline callback comparison is pixel-exact (maximum 0): previous callback creates 40 canvases, updated callback creates one initial canvas. Two focused tests pass, covering 600 moving then 600 stationary frames, live markers, scene/seed/zoom changes and resize. Client typecheck and scoped ESLint pass. All ten freshly rendered Canvas review boards are byte-identical to P5/plane-sampling, including the exact HUD witnesses. All 36 original atlas hashes match in canonical and private build roots (`original-atlases.json`). The gameplay screenshot was visually inspected: character, cliff caps, foliage and minimap/HUD render normally; it does not supply the missing pond or shared minute-per-setting review.

Commands: `npx vitest run packages/client/src/gameplay-minimap-painter.test.ts --coverage.enabled=false`; scoped ESLint; client typecheck; `node <artifact>/build.mjs` and `run.mjs`; private `npx vite build --config <artifact>/vite.config.ts --mode client-production`; `python3 <artifact>/capture.py minimap-before-canvas-1x --legacy`, `minimap-after-canvas-1x`, `minimap-after-classic-repeat --mode=classic`, `minimap-before-classic-repeat --mode=classic --legacy`; `node <artifact>/goldens/build.mjs` and `run.mjs`; `python3 <artifact>/report.py` and `repeat-report.py`; full `npm run check`. Every full JSON preserves original timing precision and all 22 stages/counters.

The output-only A/B wrapper chooses the original or reused callback before warm-up, with the same explicit-argument forwarding call in both variants. Both use one authenticated ordinary test connection. Capture protocol: 5-second warm-up, 30-second active-rAF sample, AMD Ryzen 9 9955HX, Linux 6.17.2-1-pve, Chrome 152.0.7977.64 headless, CSS 1280×720, DPR1, browser zoom1, world zoom2, Canvas 1×, frame cap off, no CPU throttle or profiler. No build/full check/CPU profiler overlaps active timing. Seed1329809490, summer, content dfdf555b:21a3c554:4:386, camera route square-camera-v1:7088:6146 remain matched. All eight mode captures fail only `no_pond`; they are diagnostic, not A-1 exit evidence.

Repeated per-frame surface allocations fall to exactly zero in all three updated walking captures (p50/p95/p99/maximum/mean), including Dynamic. This does not claim zero ImageData allocation: lighting-bound changes still appear in the ImageData counter. Initial whole-frame p95 Basic/Classic/Dynamic is 6.5/7.4/17.1 ms before and 8.1/9.9/17.7 ms updated. The updated Classic sample has five long tasks, maximum128ms; all other initial samples have zero. The reverse-order Classic repeat is updated7.9ms then original7.6ms, both zero long tasks. Preserve both results: allocation elimination is proven; a whole-frame speedup or Classic non-regression is not. Dynamic remains above10ms, chiefly painterDraw11.6ms p95 with nested lightingMerge7.6ms; Basic remains above6ms with painterBuild1.6ms, painterDraw1.5ms and finalWorldComposite2.6ms. These nested stages must not be summed. Timing variation includes unrelated stages and no causal regression attribution is established by this small pair.

Six Basic→Classic→Dynamic cycles (`mode-cycles.json`) pass, with zero Basic lighting bytes/work, no Basic/Classic omit-page ownership and final Basic zero retained lighting bytes. Classic retains its amended legacy lightmap. Largest decoded page is4MiB. Filtered-frame builds remain zero. Functional cycle evidence was captured during full checks and carries no timing claim.

Preflight failures retained: the dedicated old browser closed before timing with `Target page, context or browser has been closed`; restart artifacts are under `browser-restart/`. A fresh ordinary PKCE test-account session connected without touching owner tabs. Cause of closure is unknown. The first A/B build failed its post-transform import boundary; `enforce: pre` fixes the output-only Vite plugin (`build-post-transform-boundary.log`, successful `build.log`). No source-site CPU profile attribution is drawn from this wrapper build, whose main transform lacks a sourcemap.

Physical iPad: **owner to run**. At the pond/cliff scene with a carried lantern, System → Developer → Render → **Run protocol + copy JSON**; enter device, OS, browser, DPR, browser zoom, resolution, candidate commit, world scale and backend. Save JSON here and repeat 1×, 2× and Native. Shared minute-per-setting review remains OPEN because the connected canonical preview reports hidden. Hardware WebGL remains owner to run; this checkpoint uses Canvas. Release remains HOLD for technical gates; deployment is already authorized once they pass.

Full `npm run check` passes (exit 0): **629 files / 3,614 tests**. Vitest duration 920.93 s (750.07 s tests). Lifecycle integrity, world build, all types, lint, coverage and asset validation pass. Both frozen source hashes still match.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | Updated Basic | Updated Classic | Updated Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.4 / 6.5 / 7.5 | 6.200001 / 7.4 / 8.299999 | 10 / 17.1 / 20.700001 | 5.800001 / 8.099998 / 10.200001 | 7.1 / 9.9 / 14.799999 | 10.4 / 17.699999 / 22.700001 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.400002 / 0.5 |
| painterBuild | 0.9 / 1.300001 / 1.5 | 1 / 1.4 / 1.6 | 1 / 1.4 / 1.700001 | 1 / 1.6 / 1.9 | 1.1 / 1.700001 / 2.5 | 1 / 1.4 / 1.700001 |
| painterSort | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.5 | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.4 |
| painterDraw | 1 / 1.200001 / 1.400002 | 1 / 1.200001 / 1.400002 | 5.4 / 11.299999 / 14.299999 | 1.099998 / 1.500002 / 2.6 | 1.1 / 1.699999 / 3.1 | 5.799999 / 11.6 / 15 |
| weather | 0 / 0.099998 / 0.1 | 0 / 0 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.200001 / 0.4 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.200001 / 0.4 | 0 / 0.200001 / 0.4 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 1.800003 / 7.500002 / 8.5 | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 1.899998 / 7.600002 / 8.500002 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.899998 | 0 / 0 / 0 | 0 / 0 / 0 | 0.400002 / 0.799999 / 0.999998 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.799999 / 2.299999 / 2.6 | 2.4 / 2.9 / 3.299999 | 1.099998 / 2.4 / 2.6 | 1.900002 / 2.6 / 3.599998 | 2.700001 / 3.6 / 4.9 | 0.900002 / 2.400002 / 2.700001 |
| uiModel | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.300001 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.5 / 0.6 / 0.799999 | 0.4 / 0.5 / 0.699999 |
| uiDraw | 0.4 / 0.799999 / 1 | 0.4 / 0.9 / 1 | 0.4 / 0.9 / 1 | 0.4 / 0.799999 / 1 | 0.5 / 0.800001 / 1.1 | 0.4 / 0.799999 / 0.900002 |
| fixedUpdate | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.4 / 0.5 | 0.200001 / 0.300001 / 0.5 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | Updated Basic | Updated Classic | Updated Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 943 / 964 / 968 | 946 / 965 / 969 | 963 / 1101 / 1163 | 945 / 964 / 968 | 946 / 965 / 969 | 962 / 1092 / 1157 |
| distinctDrawImageSources | 30 / 30 / 31 | 31 / 32 / 32 | 400 / 415 / 415 | 31 / 31 / 32 | 32 / 32 / 33 | 402 / 415 / 415 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 6 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 7 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 105 / 106 | 0 / 0 / 0 | 0 / 0 / 0 | 98 / 108 / 110 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 153 / 210 | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 150 / 192 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 122 | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 122 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 258 / 273 / 273 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 273 / 273 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 3 / 21 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 3 / 20 / 26 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 38 / 53 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 37 / 50 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 367 / 388 / 390 | 0 / 0 / 0 | 0 / 0 / 0 | 366 / 389 / 390 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 313 / 313 | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 313 / 313 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 838 / 868 / 874 | 0 / 0 / 0 | 0 / 0 / 0 | 838 / 869 / 876 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 107359 / 107359 | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 107359 / 107359 |
| saveCalls | 585 / 605 / 611 | 591 / 606 / 607 | 591 / 606 / 609 | 588 / 605 / 606 | 591 / 606 / 607 | 581 / 606 / 612 |
| restoreCalls | 585 / 605 / 611 | 591 / 606 / 607 | 591 / 606 / 609 | 588 / 605 / 606 | 591 / 606 / 607 | 581 / 606 / 612 |
| saveRestorePairs | 585 / 605 / 611 | 591 / 606 / 607 | 591 / 606 / 609 | 588 / 605 / 606 | 591 / 606 / 607 | 581 / 606 / 612 |
| surfaceAllocations | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 1 / 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | Updated Basic | Updated Classic | Updated Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1796 | 1799 | 1772 | 1790 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 5 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 128 | 0 |
| Render items p50/p95/p99 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 |
| Lighting retained bytes at end | 0 | 161280 | 97357969 | 0 | 161280 | 97360985 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

Reverse-order Classic repeat, same scene/connection; table columns preserve before/updated meaning while capture order was updated then before:

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Repeat before Classic | Repeat updated Classic |
|---|---|---|
| whole frame | 6.200001 / 7.6 / 8.699999 | 6.4 / 7.9 / 8.9 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 |
| ground | 0.300001 / 0.5 / 0.5 | 0.300001 / 0.5 / 0.599998 |
| painterBuild | 1 / 1.4 / 1.6 | 1.1 / 1.5 / 1.700001 |
| painterSort | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 |
| painterDraw | 1.099998 / 2.099998 / 2.5 | 1.1 / 2.1 / 2.4 |
| weather | 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 |
| lightingBoundsResize | 0 / 0.099998 / 0.199999 | 0 / 0.099998 / 0.199999 |
| lightingOcclusionRaster | 0 / 0.200001 / 0.4 | 0 / 0.200001 / 0.4 |
| lightingSolve | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 |
| lightingMerge | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 |
| lightingUpload | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingComposite | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 2.1 / 2.699999 / 2.900002 | 2.199999 / 2.800001 / 3.200001 |
| uiModel | 0.300001 / 0.400002 / 0.5 | 0.300001 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.6 / 0.6 | 0.400002 / 0.6 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 1.099998 | 0.4 / 0.699999 / 0.9 |
| fixedUpdate | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.400002 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Repeat before Classic | Repeat updated Classic |
|---|---|---|
| drawImageCalls | 938 / 963 / 963 | 939 / 964 / 964 |
| distinctDrawImageSources | 31 / 31 / 32 | 32 / 32 / 33 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 |
| imageDataAllocations | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 |
| saveCalls | 573 / 599 / 599 | 574 / 600 / 600 |
| restoreCalls | 573 / 599 / 599 | 574 / 600 / 600 |
| saveRestorePairs | 573 / 599 / 599 | 574 / 600 / 600 |
| surfaceAllocations | 0 / 0 / 1 | 0 / 0 / 0 |

| Evidence | Repeat before Classic | Repeat updated Classic |
|---|---|---|
| Captured frames | 1799 | 1800 |
| Long tasks ≥50 ms | 0 | 0 |
| Maximum long task ms | 0 | 0 |
| Render items p50/p95/p99 | 716 / 738 / 738 | 717 / 739 / 739 |
| Lighting retained bytes at end | 161280 | 161280 |
| Omit-page decoded bytes at end | 0 | 0 |
| Largest decoded page bytes | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond |

### P8 qualified raw ground-plane submission checkpoint — 2026-09-07

Artifacts: `output/perf-59-20260907/P8/ground-plane/`. Base **d4134843**, after the green P7 minimap checkpoint; changed source and tests frozen in `source-files.json`. Files: `packages/engine/src/world-pass-backend.ts`, `world-lighting-renderer.ts`, `receiver-raw-field.test.ts`, `webgl/world-pass-webgl.ts`, `webgl/shaders.ts`, new `webgl/world-pass-raw-plane.test.ts`; roadmap, doc47, DECISIONS and this ledger.

Add the optional raw-field multiply-plane capability at the backend boundary. WorldLightingRenderer shares its raw coverage/local RGB plane between ground sprites and the ground composite. The GPU submits one rectangle using existing raw textures, resolves the per-corner channel maximum in one fragment pass and interpolates that result; no CPU-resolved lighting upload or GPU intermediate pass is added. The plane samples full field UVs rather than snapping them to the white source texture. Canvas retains its existing exact branch. Raw local sampling reuses the retained RGB destination and computes terrain projection once per field request. Qualified receiver-tint, per-source ground and multiply guards are removed after the tests below; source downsampling, filters, unverified variants and resource/failure guards remain.

The temporary overlay is first built only outside the checked worktree (`primitive/`, `fixtures/`). After the P7 commit, integrate the same behavior and repeat against **untransformed production engine code**, with no `allowUnverifiedLighting` opt-in (`production-primitive/`, `production-fixtures/`). Review transformations replace only fixture world contexts/flushes with the backend. The world fixture's explicit `ctx.getImageData` HUD readback is omitted from the GPU wrapper only; its drawn witness is compared in the exported PNG. No GPU readback is added to the client. All ten Canvas boards remain byte-identical to P7; the engine world-readback grep test passes.

Production-engine PNG results (counts are RGBA channels on panel artwork regions, excluding labels):

| Fixture | Completed panels | Maximum channel step | Channels above one | Channels above two | Above-one percent | HUD witness |
|---|---:|---:|---:|---:|---:|---|
| Seasonal | 16 | 1 | 0 | 0 | 0 | No explicit witness in existing fixture; labels exact |
| Celestial | 9 | 2 | 484 | 0 | 0.005471% | No explicit witness in existing fixture; labels exact |
| World lighting | 12 | 1 | 0 | 0 | 0 | Exact |
| Terrain 1× dry | 12 | 1 | 0 | 0 | 0 | Exact |
| Terrain 1× pond | 12 | 1 | 0 | 0 | 0 | Exact |
| Terrain 2× dry | 12 | 1 | 0 | 0 | 0 | Exact |
| Terrain 2× pond | 12 | 1 | 0 | 0 | 0 | Exact |
| Terrain Native dry | 12 | 1 | 0 | 0 | 0 | Exact |
| Terrain Native pond | 12 | 1 | 0 | 0 | 0 | Exact |
| Legacy lighting | 2 before rejection | — | — | — | — | Unsupported filter; no completed-board claim |

The 36 separate raw-plane cases cover scales1/2/3, camera fractions0/.25/.5/.75, uniform sky, coverage gradients and varying local RGB over high-contrast backgrounds: maximum2, at most0.4231770833% above one, no channels above two, exact HUD. These qualify the A-8 experimental-enable subset; the one-step default-on gate is not claimed. Plane edges are padded outside the viewport as in production; arbitrary exposed fractional-edge antialiasing is not qualified. The terrain/pond board was visually inspected for shadow direction, nested cliff caps, pond and HUD witness.

Real-browser 600-frame raw-plane lifetime test: zero new surfaces and ImageData; five textures/3,595 texture bytes and five uploads stay fixed, total managed bytes1,109,519 unchanged. A field revision adds exactly four uploads; disposal returns all managed bytes/resources to zero. Unit tests also exercise full plane UVs, signed terrain levels, one retained local RGB, upload failure state restoration, downsampling/filter rejection and disposal. Six scoped test files /26 tests pass; engine typecheck and scoped ESLint pass. First upload-failure injection hit the white page and correctly returned its wrapped error; move the injection after initial upload to test raw-field failure specifically. The original assertion failure is retained in `focused-white-upload-injection.log`.

The updated original browser failure fixture records receiver/ground/multiply as three successful submissions, and all ten remaining failure classes as explicit failures (variant, downsample, copy, destination-in, clip, page size, unavailable WebGL, shader compile, link and buffer allocation). Every created backend releases all managed resources. `WEBGL_lose_context` also restores and reuploads the new raw plane before drawing again, then disposes to zero (`lifecycle/`). Captured browser warnings include an internal GPU stall message during Canvas presentation and the deliberately failed shader cleanup warning; neither is an application `readPixels` call. Existing Canvas-copy-vs-layer presentation evidence remains in `P8/present-tie-probe`: Canvas-copy is exact on that downscale still, CSS layer differs by up to82 with exact HUD; retain Canvas-copy. No SwiftShader timing is used as GPU performance evidence.

Authenticated desktop Canvas sample: `ground-plane-canvas-1x.json`, 5-second warm-up +30-second active-rAF per mode, no build/check/profile overlap. AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152.0.7977.64 headless, 1280×720, DPR1, browser zoom1/world zoom2, Canvas1×, presentation cap off, no throttle. Seed1329809490, summer, content dfdf555b:21a3c554:4:386, camera square7088:6146. All three captures fail only `no_pond`; scene qualification remains OPEN. Latest whole-frame p95 is8.3/10.4/18.5ms Basic/Classic/Dynamic, zero long tasks in every mode and zero per-frame surface allocations (including maximum). Previous P7 diagnostic was8.1/9.9/17.7ms with five Classic long tasks; this is a renewed-session observation, not a causal before/after comparison or speedup claim. Basic's residual includes painterBuild1.7ms, painterDraw2.4ms and finalWorldComposite2.5ms p95. Dynamic has nested painterDraw12.3ms, lightingMerge7.8ms and finalWorldComposite2.4ms p95; do not sum nested stages. Full original distributions and counters follow.

Basic retains zero lighting bytes/work and Basic/Classic own no omit pages; Classic keeps its amended legacy solver. Filtered-frame builds remain zero, largest decoded page4MiB. Lighting bounds changes can still allocate ImageData; no whole-client zero-allocation claim. The test account needed ordinary session renewal for the initial capture; `gameplay-ready.json` preserves the sign-in state, `session-renewal.log` and `gameplay-ready-renewed.json` show the successful ordinary login. Owner tabs and live files are unchanged.

The initial authenticated WebGL request succeeds in Basic (`gameplay-webgl-request.json`). A subsequent gameplay downsampling operation latches Canvas with `webgl_accuracy_unverified_downsample`, as required. The shared canonical preview still reports hidden (tab_5); headless movement review is supplementary and cannot qualify shared active-rAF review. Output-only visual replay initially misread diagnostic snapshot.players as a Map; its movement counters are invalid and preserved under `visual-replay-invalid-position-probe/`. The interrupted harness also left an rAF callback; abort its replacement before accepting results, reload the page, add explicit cancellation/timeout and use the existing predictedPosition diagnostic. The discarded preflight is under `visual-replay-orphan-preflight/`. No candidate runtime code changed for these harness corrections. Movement/Video review completion: **18 headless 60-second cases complete**, all nine world-scale/lighting combinations with Canvas selected, then all nine with WebGL requested. Ordinary predicted walking is confirmed in every case. All Canvas-selected cases have no backend failure; the first WebGL walking case reaches `webgl_unsupported_clip_path`, and that Canvas fallback correctly stays latched for the rest of the session. These are Canvas fallback reviews, not nine successful GPU runs or GPU timings. All18 screenshots were visually inspected: cliff caps, tree depth, dynamic directional shadows and HUD render normally at1×/2×/Native. The actor moves toward the minimap in later fixed-camera cases, so full actor visibility/motion quality is not claimed throughout. The missing pond remains covered only by deterministic golden fixtures. Early cases overlap the full check; no timing inference is made from any replay. The Video screenshot explicitly shows **CANVAS: UNSUPPORTED CLIP PATH**, with Native and the experimental preference ON (`video-footer.png/json`). After review the test client is returned to Canvas1×/Basic, with zero retained lighting and omit bytes (`after-review.json`). The owner shared tab is reopened with open/show but still reports hidden (`shared-preview-status.json`); no shared active-review claim. The terrain cutaway's three Path2D clips are the next concrete unsupported operation to address; general downsampling/filter paths remain separate OPENs.

Physical iPad and hardware WebGL: **owner to run**. At a pond/cliff scene with a carried lantern, System → Developer → Render → **Run protocol + copy JSON**. Record device, OS, browser, DPR, browser zoom, resolution, candidate commit, world scale and requested/effective backend. Save JSON here and repeat1×/2×/Native, Basic/Classic/Dynamic. Hardware WebGL samples must state any fallback reason; Canvas fallback is not a GPU timing result. Do not substitute CPU throttling or software GPU timings.

Commands: scoped `npx vitest run ... --coverage.enabled=false`, engine typecheck, scoped ESLint; `node <artifact>/{production-primitive,production-fixtures,lifecycle}/build.mjs` and `run.mjs`; primitive `lifetime.mjs` and `compare.ts`; fixture `compare.ts`; private `npx vite build --mode client-production`; `python3 <artifact>/capture.py ground-plane-canvas-1x`; `python3 <artifact>/report.py`; `python3 <artifact>/visual-replay.py`; full `npm run check`. Full `npm run check` passes (exit 0): **630 files / 3,618 tests**. Vitest duration897.06s (725.54s tests). Lifecycle integrity, world build, all types, lint, coverage and asset validation pass. All six frozen source hashes and all36 original atlas hashes in both roots still match. Release remains HOLD for the disclosed technical gates; deployment authorization is already recorded.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Basic | Classic | Dynamic |
|---|---|---|---|
| whole frame | 6.299999 / 8.299999 / 9.1 | 7.200001 / 10.4 / 11.5 | 10.699999 / 18.5 / 23.6 |
| snapshotPrepare | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.6 / 0.699999 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 |
| painterBuild | 1.1 / 1.700001 / 1.9 | 1.199999 / 1.9 / 2.200001 | 1 / 1.5 / 1.9 |
| painterSort | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.4 / 0.400002 | 0.200001 / 0.300001 / 0.4 |
| painterDraw | 1.200001 / 2.400002 / 2.9 | 1.300001 / 2.6 / 3.1 | 5.700001 / 12.300001 / 17.1 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.200001 / 0.5 | 0 / 0.199999 / 0.4 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.199999 / 0.200001 | 2 / 7.800003 / 9.299997 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0.099998 / 0.200001 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.399998 / 0.700001 / 0.900002 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.700001 / 2.5 / 2.900002 | 2.4 / 3.799999 / 4.200001 | 1.1 / 2.4 / 2.699999 |
| uiModel | 0.4 / 0.599998 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.599998 |
| uiLayout | 0.5 / 0.6 / 0.700001 | 0.5 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.699999 |
| uiDraw | 0.5 / 0.799999 / 1.099998 | 0.5 / 0.799999 / 1.1 | 0.4 / 0.799999 / 1 |
| fixedUpdate | 0.200001 / 0.4 / 0.5 | 0.200001 / 0.4 / 0.400002 | 0.200001 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0.199999 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Basic | Classic | Dynamic |
|---|---|---|---|
| drawImageCalls | 937 / 962 / 962 | 938 / 965 / 965 | 965 / 1096 / 1154 |
| distinctDrawImageSources | 30 / 31 / 32 | 31 / 32 / 33 | 400 / 414 / 415 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 7 / 8 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 99 / 109 / 110 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 150 / 204 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 120 / 120 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 258 / 271 / 271 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 3 / 21 / 25 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 37 / 53 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 367 / 385 / 388 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 313 / 313 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 838 / 871 / 876 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 107359 / 107359 |
| saveCalls | 573 / 598 / 598 | 574 / 604 / 604 | 588 / 604 / 606 |
| restoreCalls | 573 / 598 / 598 | 574 / 604 / 604 | 588 / 604 / 606 |
| saveRestorePairs | 573 / 598 / 598 | 574 / 604 / 604 | 588 / 604 / 606 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Basic | Classic | Dynamic |
|---|---|---|---|
| Captured frames | 1800 | 1800 | 1782 |
| Long tasks ≥50 ms | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 |
| Render items p50/p95/p99 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 |
| Lighting retained bytes at end | 0 | 161280 | 97393001 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond |

### P8 terrain cutaway clip follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. Ground-plane checkpoint **7fff5781** passes630 test files /3,618 tests, all ten Canvas boards and the A-8 qualified lighting subset. Eighteen60-second headless reviews expose `webgl_unsupported_clip_path` during normal movement, and Video displays the retained Canvas reason. The next bounded fix registers the existing terrain cutaway's inside/outside/stipple geometry, rasterizes small reusable clip masks and samples their coverage in the world fragment shader while preserving the three painter calls. Unknown paths and unsupported operations retain fallback. Ownership is extended in P8's Files section and DECISIONS in this same documentation commit; no main-file logic change. Test coordinate transforms, cropped bounds/AA, camera fractions, signed levels, cutaway depth/order, all scales,600-frame surface/ImageData/texture lifetime, upload failures and context loss before enabling. Artifacts: `output/perf-59-20260907/P8/cutaway-clips/`. No implementation or parity success is claimed yet. This claim reuses the unchanged7fff5781 full runtime gate. Physical iPad and hardware GPU are **owner to run** via the existing one-button protocol with full device/commit/settings metadata. A-5 reconstruction, general downsampling, the missing pond and shared active preview remain separate OPENs.

### P8 cutaway coverage result — OPEN, 2026-09-07

Three bounded implementations fail A-8, so the prototype is removed and the exact checked7fff5781 runtime restored under docs/15 §9. Original sources, manifests, commands, raw pixels and results are in `output/perf-59-20260907/P8/cutaway-clips/README.md` and its linked directories. No clip runtime change ships from this follow-up.

| Representation | Cases | Maximum | Worst channels >1 | Failures | HUD maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Filled geometry + byte alpha |72|4|0.7999420166%|68|0|
| Actual Canvas clip raster + byte alpha |72|3|0.7995605469%|68|0|
| Actual clip raster + combined float alpha/coverage |72|4|1.4221191406%|72|0|
| iPad / hardware GPU | owner to run | — | — | — | — |

A separate24-case attribution shows receiver tint/global-alpha differences even without clipping; the three-pass composition compounds residuals. The initial mismatched-smoothing fixture is preserved as invalid and is not an algorithm attempt. Initial focused checks pass6 files /23 tests, but parity prevents enablement. Every attempt disposes backend bytes to zero;600-frame and restoration gates remain unqualified. No world readback is added. All source changes were restored, including deletion of the new path-clips module; this documentation-only result uses unchanged full check630 files /3,618 tests green. Files committed are roadmap, DECISIONS and this ledger; output evidence is external to git.

No reverted prototype timing is presented as a milestone gain. The latest full22-stage p50/p95/p99 and counter table is the ground-plane table above and `P8/ground-plane/tables.md`: Basic/Classic/Dynamic whole p95 8.3/10.4/18.5ms, zero long tasks and surface allocations, Basic zero lighting bytes, Basic/Classic zero omit bytes, largest decoded page4MiB. That sample is still no_pond and not A-1 qualified. Shared canonical tab_5 remains available but hidden after reopening in response to the latest sign-in; no further sign-in is needed. Physical iPad/hardware GPU remain **owner to run** using System → Developer → Render → Run protocol + copy JSON, with full device/OS/browser/DPR/zoom/resolution/commit/backend/world-scale metadata and required scene/modes. Continue independent painter allocation work; release remains HOLD for technical gates.

### A-7 nested receiver callback follow-up claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. After the three cutaway coverage failures, continue independent A-7 command allocation work. Scope is `packages/client/src/gameplay-painter-placeables.ts`, `gameplay-painter-npcs.ts` and new tests: retain the merchant, chest, archery target, placeable, surface and hive receiver callbacks in their existing entity command lifetimes, reading refreshed captures. Preserve animation sampling before lighting for chests and the current direct/receiver branches, painter depth/ties and synchronous receiver semantics. No main-file edit, rendering formula change, terrain plan caching or receiver-pixel workaround. Test600-frame callback identity/current-state behavior and scene/retirement changes, then original goldens, sorted command witness, quiet desktop protocol and functional scale/mode review. Artifacts `output/perf-59-20260907/P6/receiver-callbacks/`. The claim uses unchanged7fff5781 runtime full630/3618 green. Remaining player/resource/terrain allocations and other technical gates stay open. Physical iPad/hardware GPU remain owner to run with the existing one-button protocol.

### A-7 nested entity receiver callbacks — checkpoint, 2026-09-07

Base702676d4; files changed: `packages/client/src/gameplay-painter-placeables.ts`, `gameplay-painter-npcs.ts`, new124-line `gameplay-receiver-callbacks.test.ts`, roadmap and this ledger. Six receiver callbacks now live with their retained entity commands, reading current captures. Chest animation remains sampled before receiver entry, and authored animation remains sampled during drawing. No main-file logic edit, surfaces, source-tie/painter-order changes or lighting formula changes. Player/resource/terrain callbacks remain outside this bounded checkpoint.

Artifact directory: `output/perf-59-20260907/P6/receiver-callbacks/`. Commands: client workspace typecheck; scoped ESLint; `npx vitest run packages/client/src/gameplay-receiver-callbacks.test.ts packages/client/src/retained-frame-commands.test.ts --no-coverage`; full `npm run check`; private client `npx vite build --mode client-production`; artifact `capture.py before` / `capture.py after`, `report.py`, `goldens/build.mjs`, `goldens/run.mjs`, `visual-replay.py`, `video-footer.py`; replay Vite config and one-frame trigger. All raw results, source manifests and logs are retained.

Validation: **631 files /3,622 tests pass**,852.51s Vitest /697.08s tests, full check exit0. Three frozen source hashes match. Focused2 files /8 tests pass, including600-frame callback identity/current state, direct Classic paths, pre-receiver chest sampling, duplicate isolation, culling and terrain revision. Initial test failure was an incorrect mock-argument index and is preserved; no runtime workaround. All **ten Canvas boards are byte-identical**, all **36 original atlas PNGs** unchanged in canonical/private assets, and **555 recorded sorted command tuples exact** against the two old producers. No world readback is added. All251 tracked client/engine/UI non-test TS/CSS sources match the plain private build.

Before/after metadata: same ordinary account, AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152 headless,1280×720,DPR1,browser zoom1,world zoom2,Canvas1×,cap off; seed1329809490,summer,contentdfdf555b:21a3c554:4:386,route7088:6146. The samples use the same inherited disabled setup-profiler wrapper and optional disabled protocol hooks, now preserved under `capture-instrumentation/`; profiling is OFF. Those hooks were removed before the functional review. The account was renewed normally on capture reload; owner session untouched. All captures have **no_pond**, so this is diagnostic attribution and not A-1 qualification. Item counts match within2%. No whole-frame speedup is established by6.8/7.6/16.3→7.3/7.4/16.1ms p95. Basic remains above6ms; Dynamic above10ms, chiefly draw10.4ms with nested merge7.3ms.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.699999 / 6.799999 / 7.5 | 6.5 / 7.6 / 8.6 | 9.700001 / 16.300001 / 18.199999 | 6.1 / 7.300001 / 8.200001 | 6.299999 / 7.4 / 8.200001 | 9.5 / 16.099998 / 17.6 |
| snapshotPrepare | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.300001 / 0.5 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| painterBuild | 1 / 1.4 / 1.6 | 1 / 1.400002 / 1.6 | 1 / 1.300001 / 1.5 | 1 / 1.4 / 1.6 | 1 / 1.4 / 1.5 | 1 / 1.300001 / 1.5 |
| painterSort | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 |
| painterDraw | 1.1 / 1.300001 / 1.5 | 1.1 / 1.300001 / 1.5 | 5.400002 / 10.900002 / 12.299999 | 1.1 / 1.400002 / 1.6 | 1 / 1.299999 / 1.5 | 5.299999 / 10.4 / 11.4 |
| weather | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.200001 / 0.4 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.200001 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 1.799999 / 7 / 7.799999 | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 1.800001 / 7.299999 / 8.300001 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.899998 | 0 / 0 / 0 | 0 / 0 / 0 | 0.300001 / 0.600002 / 0.800001 |
| lightingComposite | 0 / 0 / 0.099998 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 2 / 2.400002 / 2.800001 | 2.6 / 3.1 / 3.5 | 1.099998 / 1.699999 / 2.199999 | 2.299999 / 2.700001 / 3.199999 | 2.5 / 2.9 / 3.4 | 1 / 1.299999 / 1.400002 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 |
| uiLayout | 0.4 / 0.5 / 0.5 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.5 | 0.4 / 0.5 / 0.5 |
| uiDraw | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.700001 / 0.9 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.799999 / 1.099998 | 0.4 / 0.700001 / 0.9 | 0.4 / 0.699999 / 0.800001 |
| fixedUpdate | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 944 / 965 / 967 | 944 / 965 / 968 | 964 / 1098 / 1157 | 955 / 1355 / 1368 | 945 / 967 / 969 | 965 / 1100 / 1159 |
| distinctDrawImageSources | 31 / 31 / 32 | 31 / 32 / 32 | 402 / 415 / 415 | 32 / 34 / 34 | 32 / 32 / 33 | 403 / 416 / 416 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 1 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 99 / 103 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 98 / 103 / 103 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 156 / 207 | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 153 / 207 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 122 | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 124 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 271 / 271 | 0 / 0 / 0 | 0 / 0 / 0 | 256 / 271 / 271 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 22 / 27 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 22 / 27 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 37 / 51 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 37 / 51 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 367 / 384 / 386 | 0 / 0 / 0 | 0 / 0 / 0 | 367 / 386 / 388 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 313 / 313 | 0 / 0 / 0 | 0 / 0 / 0 | 303 / 313 / 313 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 839 / 870 / 879 | 0 / 0 / 0 | 0 / 0 / 0 | 840 / 871 / 879 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 107359 / 107359 | 0 / 0 / 0 | 0 / 0 / 0 | 103929 / 107359 / 107672 |
| saveCalls | 589 / 604 / 607 | 591 / 604 / 607 | 588 / 604 / 607 | 594 / 612 / 618 | 591 / 606 / 608 | 592 / 605 / 608 |
| restoreCalls | 589 / 604 / 607 | 591 / 604 / 607 | 588 / 604 / 607 | 594 / 612 / 618 | 591 / 606 / 608 | 592 / 605 / 608 |
| saveRestorePairs | 589 / 604 / 607 | 591 / 604 / 607 | 588 / 604 / 607 | 594 / 612 / 618 | 591 / 606 / 608 | 592 / 605 / 608 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1797 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 717 / 739 / 739 | 716 / 738 / 739 | 716 / 738 / 738 | 725 / 746 / 750 | 717 / 739 / 740 | 717 / 739 / 739 |
| Lighting retained bytes at end | 0 | 161280 | 97470088 | 0 | 161280 | 97426091 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

All allocation percentiles are zero, but before Basic has9 single-surface allocation frames, after Basic12 and Classic8 (max1). Those outliers are not newly attributed; Basic/Classic are not called allocation-free. **Dynamic has zero surface allocations including maximum/mean** in both captures. Basic ends with zero lighting bytes/work; Basic/Classic zero omit bytes; every decoded page≤4MiB. Classic retains its approved legacy lightmap. All six samples have zero long tasks≥50ms.

All **18 headless60-second movement cases complete**, all scales/modes with Canvas selected then WebGL requested,586–599 moving100ms samples each, connected/visible. Every screenshot was inspected with the actor-follow camera: actor,cliffs,shadows and HUD normal. Nine requested-WebGL cases remain effective Canvas with the latched `webgl_accuracy_unverified_downsample` reason. Video visibly displays **CANVAS: ACCURACY UNVERIFIED DOWNSAMPLE** with Native/experimental ON; client returned to Canvas1×/Basic. This is functional fallback review during checks, not GPU timing or shared active review. Six subsequent mode cycles show Basic zero retained lighting and Basic/Classic zero omit ownership. The one-frame replay uses an output-only build, then the plain private build is restored. Its first build used the wrong directory; its renewal helper expected a form when SSO had already connected. Both harness issues are recorded, and neither is a current auth or production error.

| Device/exit | Status |
| --- | --- |
| Desktop pond-qualified A-1 | OPEN: no_pond; stage attribution above only |
| Shared active preview | OPEN: available but hidden; no headless substitution |
| iPad | **owner to run** |
| Hardware GPU | **owner to run**; no SwiftShader timing claim |

Owner steps: on the candidate, in the pond/cliff/carried-lantern scene, System → Developer → Render → **Run protocol + copy JSON**, with device/OS/browser,DPR,zoom,resolution,commit,backend and world-scale metadata; repeat each mode/scale. Three failed cutaway approaches stay OPEN, as do A-5 post-lighting transparency reconstruction/filter removal and general sampling. The root release `rollback-continuity.json` now verifies all384 current served files and the previous rollback tar byte-for-byte (SHA2567fa8d720be56039a58bd99c1a6d0e825d48cf1716f2047bb0d3aa1fc265bf3ac); static-only/public-route checks pass. This is read-only code rollback evidence, not a data backup or release-specific reconnect claim. No live change; release remains HOLD under the existing conditional authorization.

### A-7 remaining player/resource callback claim — 2026-09-07

IN PROGRESS: codex, 2026-09-07. Six nested callbacks ship at16dfdf43 with full631 files /3,622 tests green. Continue the same independent allocation fix in `packages/client/src/gameplay-painter-players.ts`, `gameplay-painter-resources.ts` and new/relevant tests. Retain the player draw and rock/ore receiver callbacks in their existing entity commands; preserve all animation and shake sampling before receiver entry using per-command scratch values. Retain carried-object predicates and replace the mount lookup predicate with an equivalent first-match iteration. No main-file edit, pixel math, gameplay/authority change or terrain-plan cache. Test600-frame identity/current animation/effect state, mounted/carried variants, repeated synchronous receiver calls and scene retirement; repeat goldens, recorded painter order and diagnostic captures. Artifacts `output/perf-59-20260907/P6/remaining-entity-callbacks/`. This documentation-only claim uses unchanged16dfdf43 full runtime check. A-5, general sampling, cutaway coverage, missing pond and shared active review remain OPEN; iPad/hardware GPU owner to run.

### A-7 remaining player/resource callbacks — checkpoint, 2026-09-07

Base **b67d21c3**. Files: `packages/client/src/gameplay-painter-players.ts`, `gameplay-painter-resources.ts`, new `gameplay-player-callbacks.test.ts` and `gameplay-resource-callbacks.test.ts`, roadmap and this ledger. The player, rock and ore drawing callbacks and carried-object predicate now live with the retained entity command. Per-command scratch preserves animation and shake sampling before synchronous receiver entry, including repeated receiver draws. First-match mount iteration preserves KeyedStore order. No main-file logic, lighting math or source/painter identity change.

Artifacts: `output/perf-59-20260907/P6/remaining-entity-callbacks/`. Commands: scoped client typecheck and ESLint; focused three-file/six-test Vitest run; `npm run check`; isolated `npm run build`; private client production-mode Vite builds; `capture.py before` / `capture.py after`, `report.py`, golden build/run drivers, `visual-replay.py`, `video-footer.py`, `verify-runtime.py`, `mode-cycles.py` and `reverse-classic.py`. Logs, source hashes, raw stage/counter JSON, PNGs and replay inputs remain in that directory.

**Full check passes: 633 files / 3,627 tests**, exit0, 896.431907654s overall,848.34s Vitest /695.18s tests. Four frozen source hashes match. An initial tool process ended with SIGTERM143 before a summary; the preserved incomplete run is neither counted as passing nor as an assertion failure. The detached rerun checked identical source. Focused tests pass, covering600 changing frames, callback/predicate identity, repeated drawing, mount/carried/fishing branches, pre-receiver sampling and retirement. The private full build also passes (35.957651854s); all323 regenerated files and all36 original PNGs match canonical assets. Ten Canvas boards are byte-identical. The recorded frame has **544 sorted command tuples, all exact**. The plain production build is restored after replay and all251 checked production TS/CSS sources match.

Capture metadata: AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152 headless,1280×720,DPR1,browser zoom1,world zoom2,Canvas1×,cap off; same ordinary account, seed1329809490,summer,contentdfdf555b:21a3c554:4:386,route7088:6146. Both captures use plain production source; all our checks/builds/profilers were idle during them. All samples remain **no_pond**, so these are diagnostic attribution, not A-1 qualification. Item counts match within2%. Basic is0.3ms above its6ms target; Dynamic is6.2ms above10ms, chiefly painterDraw10.7ms including merge7.5ms. Initial Classic p95/p99 increase7.6/8.5→7.8/9.9; no uniform speedup or Classic non-regression is established by that pair.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.5 / 6.599998 / 7.299999 | 6.4 / 7.6 / 8.5 | 9.800001 / 16.6 / 18.5 | 5.199999 / 6.299999 / 7.199999 | 6 / 7.800001 / 9.9 | 9.300001 / 16.200001 / 18.700001 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.5 / 0.5 | 0.300001 / 0.5 / 0.5 | 0.300001 / 0.5 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 |
| painterBuild | 1 / 1.400002 / 1.6 | 1 / 1.4 / 1.700001 | 1 / 1.4 / 1.6 | 1 / 1.4 / 1.6 | 1 / 1.400002 / 1.9 | 1 / 1.4 / 1.699999 |
| painterSort | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 |
| painterDraw | 1 / 1.699999 / 2 | 1.199999 / 1.800001 / 2.1 | 5.4 / 10.699999 / 12.200001 | 1 / 1.200001 / 1.5 | 1 / 1.4 / 1.700001 | 5.1 / 10.699999 / 12.1 |
| weather | 0 / 0 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.4 | 0 / 0.199999 / 0.4 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.200001 / 0.4 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 1.799999 / 7.4 / 8.200001 | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 1.799999 / 7.499998 / 8.300001 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.9 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.699999 / 0.800003 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.700001 / 2.200001 / 2.4 | 2.4 / 2.800001 / 3.300001 | 0.900002 / 2.5 / 2.799999 | 1.6 / 2 / 2.299999 | 2.200001 / 2.9 / 3.5 | 0.799999 / 2.4 / 2.6 |
| uiModel | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.400002 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.5 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 0.9 | 0.4 / 0.699999 / 0.9 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.799999 / 1 | 0.4 / 0.700001 / 1 | 0.4 / 0.699999 / 0.9 |
| fixedUpdate | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 944 / 963 / 964 | 951 / 972 / 976 | 972 / 1111 / 1168 | 942 / 1274 / 1286 | 940 / 957 / 961 | 964 / 1095 / 1153 |
| distinctDrawImageSources | 31 / 31 / 32 | 33 / 33 / 34 | 402 / 415 / 416 | 30 / 31 / 31 | 31 / 31 / 32 | 399 / 414 / 415 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 1 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 1 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 81 / 90 / 92 | 0 / 0 / 0 | 0 / 0 / 0 | 99 / 108 / 110 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 159 / 210 | 0 / 0 / 0 | 0 / 0 / 0 | 21 / 156 / 204 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 122 / 122 | 0 / 0 / 0 | 0 / 0 / 0 | 118 / 120 / 122 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 255 / 273 / 273 | 0 / 0 / 0 | 0 / 0 / 0 | 255 / 271 / 271 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 21 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 26 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 38 / 50 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 38 / 50 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 364 / 388 / 393 | 0 / 0 / 0 | 0 / 0 / 0 | 363 / 383 / 386 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 314 / 314 | 0 / 0 / 0 | 0 / 0 / 0 | 302 / 312 / 312 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 837 / 868 / 877 | 0 / 0 / 0 | 0 / 0 / 0 | 835 / 867 / 873 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 108016 / 108016 | 0 / 0 / 0 | 0 / 0 / 0 | 103284 / 106704 / 106704 |
| saveCalls | 587 / 599 / 601 | 590 / 604 / 606 | 590 / 608 / 612 | 577 / 591 / 596 | 578 / 595 / 595 | 584 / 598 / 600 |
| restoreCalls | 587 / 599 / 601 | 590 / 604 / 606 | 590 / 608 / 612 | 577 / 591 / 596 | 578 / 595 / 595 | 584 / 598 / 600 |
| saveRestorePairs | 587 / 599 / 601 | 590 / 604 / 606 | 590 / 608 / 612 | 577 / 591 / 596 | 578 / 595 / 595 | 584 / 598 / 600 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1799 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 717 / 739 / 739 | 724 / 747 / 749 | 725 / 746 / 751 | 716 / 738 / 738 | 716 / 738 / 738 | 716 / 738 / 738 |
| Lighting retained bytes at end | 0 | 161280 | 97601756 | 0 | 161280 | 97242815 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

All six captures have zero long tasks≥50ms. Allocation percentiles are zero throughout, but the before samples have1/2/8 single-surface allocation frames in Basic/Classic/Dynamic; after samples have **zero surface allocations including maximum and mean in every mode**. This callback-only change creates no surfaces, so the earlier outliers are not causally attributed to it. Basic retains zero lighting bytes/work; Basic/Classic zero omit-page bytes; largest decoded page4MiB. Classic preserves the approved legacy lightmap.

All18 headless60-second movement cases complete,573–599 moving100ms samples each; all screenshots inspected with normal actor-follow camera. Actor, cliff caps, shadows and HUD render normally at each scale and mode. All nine WebGL-requested cases latch to Canvas with **webgl_unsupported_clip_path**. Video visibly shows **CANVAS: UNSUPPORTED CLIP PATH**. Return to Canvas1×/Basic is verified. Six settled mode cycles show Basic zero lighting ownership and Basic/Classic zero omit bytes; all Dynamic transitions finish ready. Earlier rapid-switch samples caught pending Dynamic loads and remain separately labelled. These reviews overlapped full checks and are functional evidence only, not GPU timings or shared-browser review.

Reverse-order Classic repeat, after all checks/builds were idle during each capture: updated first **6.100000381 /7.299999237 /8ms**, old second **6.100000381 /7.200000763 /7.900001526ms** (p50/p95/p99). Both1800 frames,739 items p95,zero long tasks and zero surfaces including maximum. Seed/season/content/route match; both still no_pond. The difference is small but repeats in the same direction, so Classic non-regression remains unproven; this is not relabelled as a speedup. Full repeat stages/counters are below and in `reverse-summary.json`. Current plain sources/build are restored.

| Repeat stage (ms p50 / p95 / p99) | Updated first | Old second |
| --- | --- | --- |
| whole frame | 6.1 / 7.299999 / 8 | 6.1 / 7.200001 / 7.900002 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 |
| painterBuild | 1 / 1.5 / 1.699999 | 1 / 1.4 / 1.6 |
| painterSort | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 |
| painterDraw | 1 / 1.299999 / 1.400002 | 1 / 1.200001 / 1.4 |
| weather | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.1 |
| lightingBoundsResize | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingOcclusionRaster | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0.099998 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 |
| lightingMerge | 0.099998 / 0.1 / 0.200001 | 0.099998 / 0.1 / 0.200001 |
| lightingUpload | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingComposite | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 2.299999 / 2.800001 / 3.1 | 2.299999 / 2.799999 / 3.1 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.700001 / 1 |
| fixedUpdate | 0.199999 / 0.299999 / 0.4 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 |

| Repeat per-frame counter (p50 / p95 / p99) | Updated first | Old second |
| --- | --- | --- |
| drawImageCalls | 944 / 962 / 968 | 949 / 1281 / 1292 |
| distinctDrawImageSources | 32 / 32 / 33 | 32 / 33 / 33 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 |
| imageDataAllocations | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 |
| saveCalls | 588 / 599 / 604 | 586 / 601 / 606 |
| restoreCalls | 588 / 599 / 604 | 586 / 601 / 606 |
| saveRestorePairs | 588 / 599 / 604 | 586 / 601 / 606 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 |


| Device / gate | Status |
| --- | --- |
| Desktop pond-qualified A-1 | OPEN: no_pond; original stage/counter attribution above |
| Shared active browser | OPEN: canonical preview available but hidden; authentication works |
| Physical iPad | **owner to run** |
| Hardware GPU | **owner to run**; SwiftShader functional evidence only |

Owner capture steps: on the candidate, with the pond/cliff/carried-lantern scene visible, System → Developer → Render → **Run protocol + copy JSON**. Record device, OS, browser, DPR, zoom, resolution, candidate commit, world scale and backend; repeat required modes/scales. A-5 world filter removal, general WebGL downsampling and cutaway pixel parity remain OPEN. This bounded callback checkpoint does not complete those gates or authorize deployment before they pass. No live change has occurred; the existing conditional release authorization remains recorded in A-10.

### Checked 0.6.0 artifact refresh — HOLD, 2026-09-07

The remaining callback change is committed as **92a4adf2**; its reverse-order Classic tables are recorded by docs-only **0685bc82**. The initial report formatter treated the stages array as a map, so the completed repeat was inserted in that separate documentation commit; raw captures were already complete and no source changed. The same633-file/3,627-test full gate covers this documentation-only artifact record.

A new held static candidate embeds **0685bc82aba7930890ce536e5d8de2329a5e2fa9**: `output/perf-59-20260907/release/client-0.6.0-0685bc82.tar`, SHA256 **045be414726a3bf7029e0b0e4996dd7f2b50497e0a56f323d82c2557d659c666**, 36239360 bytes. Production-mode build and chunk check pass;2,046 build-input files match the integrator. All439 archived static files match the manifest. Private normal-account reconnect preserves identity, position,48 inventory slots and wallet, and returns to Canvas1×/Basic. This proves candidate reconnect only, not a future live postflight.

Read-only live validation at2026-09-07T11:22:41Z confirms all384 served files still match the original0.5.7 rollback, with no extra files. The rollback tar also matches its manifest, SHA2567fa8d720be56039a58bd99c1a6d0e825d48cf1716f2047bb0d3aa1fc265bf3ac, retained at `output/perf-59-20260906/release/client-dist-before-0.6.0.tar`. Public/static validation passes. The refreshed `release/README.md` records P0–P8 scope/gaps, every artifact and the already-existing conditional deployment authorization; `release/commands.md` contains exact proposed build/publication/rollback commands. **None of the live commands ran.** A-5/A-8 pixel failures, scene/shared review and unproven Classic non-regression keep release HOLD; iPad/hardware GPU remain owner to run. Current full stage/counter tables are the preceding checkpoint and reverse repeat, with no new timing claim for packaging.

### A-11 padded static coverage claim — 2026-09-08

IN PROGRESS: codex,2026-09-08. Apply the owner-provided §8.1 and matching2026-09-07 DECISIONS row. Basic6.3ms is accepted as meeting its target; painterBuild1.4ms meets A-7's timing target. Dynamic lightingMerge1.8ms p50/7.5ms p95 is the first priority. A-11 owns `receiver-lighting.ts`, `receiver-coverage.ts`, their tests and new bounded modules: retain a128-world-pixel padded static field aligned to64px, crop identical texels for viewport working coverage, keep moving masks unchanged, and preserve invalidation/budget/disposal. Test camera motion, grid phases, signed coordinates/heights, sky/static revisions and exact direct-blit comparison before measured before/after capture. Artifacts `output/perf-59-20260908/P4/A11/`. No main-file edit. The documentation claim includes the owner's already-present uncommitted amendment files and reuses the unchanged633-file/3627-test runtime gate. A-18 replaces shared-browser qualification with Playwright screenshot evidence and permits two pinned routes. A-19 remains preparation pending owner Go; do not deploy.

### A-11 padded static coverage — measured checkpoint, 2026-09-08

Runtime based on claim commit **820d8357**, exact changed-file hashes in `output/perf-59-20260908/P4/A11/after-source-files.json` and `check-source-files.json`. Files: `packages/engine/src/receiver-lighting.ts`, its existing test, new `receiver-static-coverage.ts` (68 lines) and its test. Static coverage retains a 128-world-pixel pad aligned to64px, copies the unchanged sample centres into viewport coverage, and rebuilds at camera bucket boundaries. Incompatible sample phases use the original direct blit. Moving casters still blit only into working coverage. Static/sky geometry changes reset padding; sky RGB and actor movement do not. The existing8MiB coverage budget is partitioned into6MiB viewport fields plus2MiB padded fields; the separate receiver-index budget is unchanged. No new surface, readback, filter or asset mutation.

Artifacts and commands: `output/perf-59-20260908/P4/A11/`; `prepare-candidate.py before|after`, `connect.py`, `capture.py before-clear|after-clear`, the same captures with `--route=pond`, `report.py cliff|pond`; focused `npx vitest run packages/engine/src/receiver-static-coverage.test.ts packages/engine/src/receiver-lighting.test.ts packages/engine/src/world-lighting-renderer.test.ts` passes3 files/16 tests. A fourth nonexistent `receiver-coverage.test.ts` argument in the logged invocation matched no file; the report lists the three tests actually executed. `npm run check` is collected by detached `run-check.py`; `node goldens/build.mjs`, `node goldens/run.mjs`, `npx tsx goldens/compare.ts`; `python3 visual-replay.py`. Final full-check and movement-review status is appended below before the boundary commit.

Matched desktop: AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152 headless, 1280×720 CSS, DPR1, browser zoom1, world zoom2, Canvas1×, cap off. Every capture uses5s warm-up and30s active rAF; no CPU throttling and no simultaneous checks/builds/profiles. Seed1329809490, summer, content `dfdf555b:21a3c554:4:386`. Both private before/after builds pin cosmetic weather to clear/tick0/north through the same output-only `weather.ts` argument transform; source hashes and exact transformation are in `prepare-candidate.py` and `*-clear-source-files.json`. No server weather or live files change. The plain source is restored before functional reviews and goldens. Both route comparisons pass seed/season/content/route and render-item mean/p50/p95/p99 within2%; these are new matched A-18 measurements, not a relabelling of the older A-1 baseline.

**Basic6.3ms is accepted as met**, per §8.1. The matched clear-weather cliff route now measures Basic5.5→5.5, Classic6.199999→6.799999, Dynamic15.6→10.5ms p95. Dynamic `lightingMerge` is1.800001/8.299999/9.5→1.799997/2.200001/2.600002ms p50/p95/p99. Coverage rebuilds p95 fall4→0 (mean0.508889→0.002222; maximum4 in both), leaving one four-plane invalidation in the after sample. `painterDraw` p95 is10.5→6.1ms. Classic's whole-frame rise remains recorded: painterBuild1.300001→1.5, painterDraw1.9→2.099998, finalWorldComposite1.299999→1.300001ms p95. No Classic speedup or non-regression is claimed from this pair; A-11's coverage path is Dynamic-only. A-12 still must reduce merge p95 to1.5ms and remeasure whole frame against10ms.

Cliff/carried-light route `square-camera-v1:7344:6080`: the actor walks normally with a bounded horizontal keyboard route at x7650..7690. All1800 frames per mode keep the actor visible,674 items p95, at least327 static casters and68 cap runs. Legacy `no_pond` is expected for this role under A-18; the separate pond route supplies water review evidence. No teleport, admin mutation or collision override.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 4.5 / 5.5 / 6.599998 | 5.1 / 6.199999 / 7.1 | 8.099998 / 15.6 / 17.4 | 4.6 / 5.5 / 6.200001 | 5.599998 / 6.799999 / 8.4 | 8.5 / 10.5 / 12.200001 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| painterBuild | 0.9 / 1.4 / 1.6 | 0.9 / 1.300001 / 1.5 | 0.9 / 1.300001 / 1.599998 | 0.9 / 1.300001 / 1.5 | 1 / 1.5 / 1.700001 | 1 / 1.400002 / 1.700001 |
| painterSort | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 |
| painterDraw | 1.5 / 1.9 / 2.200001 | 1.5 / 1.9 / 2.1 | 4.700001 / 10.5 / 11.5 | 1.599998 / 1.900002 / 2.200001 | 1.6 / 2.099998 / 2.5 | 4.9 / 6.1 / 7 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 1.800001 / 8.299999 / 9.5 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 1.799997 / 2.200001 / 2.600002 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.300001 / 0.6 / 0.799999 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.9 |
| lightingComposite | 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.5 / 0.699999 / 0.799999 | 1.1 / 1.299999 / 1.5 | 0.4 / 0.5 / 0.6 | 0.5 / 0.699999 / 0.700001 | 1.199999 / 1.300001 / 1.6 | 0.400002 / 0.599998 / 0.699999 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.400002 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.6 / 0.799999 | 0.4 / 0.599998 / 0.799999 | 0.4 / 0.6 / 0.799999 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.599998 / 0.799999 |
| fixedUpdate | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.4 | 0.1 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 867 / 880 / 886 | 868 / 881 / 889 | 892 / 971 / 1023 | 869 / 1200 / 1210 | 868 / 881 / 887 | 892 / 974 / 1022 |
| distinctDrawImageSources | 34 / 34 / 35 | 35 / 35 / 36 | 347 / 357 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 357 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 111 / 159 | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 108 / 159 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 22 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 22 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 874 / 911 / 912 | 0 / 0 / 0 | 0 / 0 / 0 | 874 / 911 / 912 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 530 / 542 / 542 | 531 / 543 / 543 | 531 / 543 / 543 | 530 / 544 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| restoreCalls | 530 / 542 / 542 | 531 / 543 / 543 | 531 / 543 / 543 | 530 / 544 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| saveRestorePairs | 530 / 542 / 542 | 531 / 543 / 543 | 531 / 543 / 543 | 530 / 544 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 96792971 | 0 | 161280 | 97288331 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

Pond route `square-camera-v1:5368:5440` has visible water and cliff caps, verified in the Playwright screenshots. It is a sparse pond-only camera view; the ordinary actor remains on the cliff route. Consequently the old combined-scene witness reports `invalid_frame_evidence` (no drawn actor coordinates), `local_player_not_visible`, `local_player_not_walking`, `no_carried_light`, and `fewer_than_150_static_casters`. Those flags remain in raw JSON. This route is reported separately under A-18 and is not substituted for the populated cliff timing target. Pond Basic4.299999→4.800001, Classic5.800001→5.9, Dynamic7.900002→7.5ms p95; see the exact raw values below.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 3.5 / 4.299999 / 4.900002 | 4.800001 / 5.800001 / 6.599998 | 5 / 7.900002 / 9.099998 | 3.9 / 4.800001 / 5.699999 | 4.9 / 5.9 / 6.9 | 5.099998 / 7.5 / 10 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.5 / 0.599998 | 0.300001 / 0.5 / 0.599998 | 0.300001 / 0.5 / 0.5 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.5 |
| painterBuild | 0.799999 / 1.199999 / 1.4 | 0.800001 / 1.200001 / 1.400002 | 0.800001 / 1.200001 / 1.4 | 0.9 / 1.300001 / 1.6 | 0.800001 / 1.200001 / 1.5 | 0.800001 / 1.200001 / 1.4 |
| painterSort | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.5 / 0.700001 / 0.800001 | 0.5 / 0.700001 / 0.9 | 1.1 / 2.5 / 2.9 | 0.599998 / 0.799999 / 0.900002 | 0.5 / 0.700001 / 0.9 | 1.200001 / 2.599998 / 3.6 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 2.200003 / 2.9 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 1.699999 / 4.599998 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.199999 / 0.299997 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.199999 / 0.4 / 0.5 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.500002 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.700001 / 0.900002 / 1 | 1.9 / 2.199999 / 2.5 | 1.200001 / 1.4 / 1.6 | 0.799999 / 1 / 1.199999 | 1.9 / 2.200001 / 2.6 | 1.200001 / 1.400002 / 1.6 |
| uiModel | 0.200001 / 0.300001 / 0.4 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.300001 / 0.400002 |
| uiLayout | 0.300001 / 0.5 / 0.5 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.5 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.5 |
| uiDraw | 0.300001 / 0.599998 / 0.799999 | 0.300001 / 0.599998 / 0.799999 | 0.300001 / 0.5 / 0.799999 | 0.4 / 0.6 / 0.800001 | 0.300001 / 0.6 / 0.800001 | 0.300001 / 0.599998 / 0.799999 |
| fixedUpdate | 0.1 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.4 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.4 | 0.1 / 0.299999 / 0.300001 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 715 | 693 / 708 / 713 | 695 / 754 / 772 | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1799 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 88064076 | 0 | 164864 | 88596300 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |

All six cliff captures record zero long tasks≥50ms and zero surface allocations, including maxima. Basic ends with zero lighting ownership; Basic/Classic retain zero omit bytes; Dynamic owns72,515,584 decoded omit bytes and every decoded page is≤4MiB. Classic retains its approved legacy lightmap (161,280 bytes); this is not reported as zero legacy lighting. Filtered-frame builds remain zero. All10 Canvas fixture boards compare byte-exact, including the explicit HUD witnesses, against the previous checked candidate (`goldens/comparison.json`). All36 original PNGs match their prior SHA256 values. All323 generated files, including295 PNGs, match between integrator and tested private build (`generated-pages.json`); the initial artifact script incorrectly expected323 PNGs before being corrected to the recursive file count, with no content change.

Rejected evidence retained: `before.json`/`after.json` have unmatched weather and674 vs915–918 items p95, so their timing delta is not used. `before-rejected-player-edge.*` has49 offscreen Dynamic frames and is rejected. `before-stale-entrypoint.log` records a private stale HTML/hash navigation failure resolved by a fresh query navigation; it was not an account or permission failure. These harness corrections do not change runtime behavior.

| Device / gate | Status |
| --- | --- |
| Desktop cliff/carried-light | Matched A-18 role; merge2.200001ms p95, A-12 target pending |
| Desktop pond | Separate sparse route; legacy actor witness flags retained |
| Physical iPad | **owner to run** |
| Hardware WebGL GPU | **owner to run**; this step changes Canvas coverage |

Owner iPad capture: on the candidate, use System → Developer → Render → **Run protocol + copy JSON** on the cliff/carried-light route, then on the pond route; retain the JSON from each. Record device, OS, browser, DPR, browser zoom, resolution, commit, world scale and backend. Repeat Basic/Classic/Dynamic and required scales. No desktop throttling substitutes for this row. A-18 uses Playwright screenshots under this artifact directory; shared-browser qualification is superseded. A-19 remains pending owner Go: **no deployment**.

A-11 full gate completed: `npm run check` exit0, **634 files /3,631 tests**,937.007995 seconds overall (Vitest888.76s, tests723.03s). Type checking, lint, world lifecycle integrity/build and validation of1,021 art assets/3 songs/10 SFX pass. Changed source/test hashes still match `check-source-files.json`. The required runtime readback grep is included in this passing suite. Final movement review and mode cleanup evidence follows before commit.

A-11 final review: all18 Playwright60-second movement runs complete and remain connected (562–599 moving100ms samples per run). All18 screenshots, pond/cliff screenshots and Video footer were inspected. All nine WebGL-requested cases retain the pre-existing `webgl_unsupported_clip_path` Canvas fallback; the footer visibly says **CANVAS: UNSUPPORTED CLIP PATH**. This is recorded for A-15/A-17, not claimed as WebGL qualification. Six settled Basic/Classic/Dynamic cycles prove Basic zero lighting bytes and Basic/Classic zero omit bytes; every Dynamic transition reaches ready. Return to Canvas1×/Basic and WebGL preference off is verified, with the session's reason retained diagnostically. See `visual-inspection.json`, `visual-replay/results.json`, `mode-cycles.json`, `video-footer.*`, `after-review.json`. Functional reviews overlapped the full check, so their elapsed/frame numbers are not performance samples. **A-11 complete**; A-12 remains next. No deployment.

### A-12 local-light dirty rectangles claim — 2026-09-08

IN PROGRESS: codex,2026-09-08, after checked A-11 **c78ce97a**. Own `lighting.ts`, `world-lighting-renderer.ts`, `receiver-lighting.ts`, their tests and new bounded helper modules under the P4 scope extension and A-12. Record old/new changed-light support per real rebuild; expose world damage with reset/window/occlusion/resize/source-change and history-gap invalidation. Re-merge only intersecting texels plus one bilinear texel margin, while preserving exact moving-shadow and sky updates. Local plane revisions advance only for intersecting local changes. Test removals, returning cached windows, signed levels, shadow changes outside the light rectangle and reset/disposal against forced-full reference output. Target merge p95≤1.5ms from A-11's2.200001ms, whole≤10ms from10.5ms. Repeat matched clear-weather cliff and separate pond captures, full stages/counters and exact fixtures under `output/perf-59-20260908/P4/A12/`. This docs-only claim reuses A-11's unchanged passing634-file/3631-test gate. No main-file edit or deployment.

### A-12 local-light dirty rectangles — measured checkpoint, 2026-09-08

Base **c20cfc28** (A-11 c78ce97a plus claim). Runtime files: `lighting.ts`, `receiver-lighting.ts`, `world-lighting-renderer.ts`, new `local-light-damage.ts` and `receiver-raster-merge.ts`; tests: new `local-light-damage.test.ts`/`receiver-damage.test.ts`, updated `receiver-raw-field.test.ts`/`world-lighting-upload.test.ts`. No main-file edit. New modules remain below400 lines. Artifacts: `output/perf-59-20260908/P4/A12/`, with exact source hashes in `after-clear-source-files.json`/`check-source-files.json`.

The lightmap records old/new support for changed lights per actual rebuild, retaining512 revisions and bounded snapshots for at most4,096 lights. Raw light positions are compared because a different moving light can restamp a source within its unchanged quarter-pixel signature bucket. Support includes the flood's facing shift, clamped origin, strength-dependent radius and discrete seed extent. Each plane adds one bilinear texel margin. Window/occlusion/model changes invalidate the union of **all** old/new light footprints: they cannot create local RGB elsewhere. Reset, source replacement, nonfinite inputs and missing history retain full invalidation. Journals release backing storage on reset and remain empty for Classic. Their bytes are included in existing lighting ownership diagnostics.

A plane retains packed prior sun/moon/contact coverage alongside its RGBA. It re-merges a texel only when coverage changes, sky/static revision changes, or the local rectangle covers it. Moving shadows outside the light rectangle therefore remain exact. Observed source revisions advance independently from each plane's applied local revision; the latter advances only on an intersecting rectangle. Returning cached windows accumulate missed damage. The old full merge and its unconditional movement-upload expectation are replaced in the same change; a forced-full pixel reference now verifies all600 movement frames while allowing unchanged uploads to be reused. The raw GPU field path retains its conservative update policy; this step targets the default Canvas merge.

The existing16MiB raster budget now accounts for both RGBA and packed coverage; its count limit increases64→128 so the20-position, four-height route fits without FIFO churn. A600-revisit test proves all80 rasters remain resident within the byte budget. New cumulative diagnostics count raster allocations, merged texels and full merges. The existing gameplay snapshot aliases the scene diagnostic object, which protocol cleanup resets; therefore serialized `receiverCoverage` cumulative fields can be zero. **Do not interpret those zeros as no merges.** Authoritative per-frame `RenderOperationCounters` and stage samples are independently retained. Separate copied diagnostic arrays establish full-merge causes; changing the unowned snapshot module is outside this step.

Commands: `prepare-candidate.py before|after`, `connect.py`, `capture.py before-clear|after-clear` and `--route=pond`, `report.py cliff|pond`; focused Vitest over the seven receiver/lightmap/upload files passes **7 files/20 tests**, plus the final occlusion follow-up passes1 file/2 tests. Engine type check and scoped ESLint pass. `run-check.py` collects `npm run check`; `node goldens/build.mjs`, `node goldens/run.mjs`, `npx tsx goldens/compare.ts`; `visual-replay.py`, `mode-cycles.py`, `video-footer.py`. Final full-check/review result follows below before commit.

The first measured implementation lowered merge p50 to0.5ms but left p95 at2.300001ms and whole-frame10.200001ms. Retaining128 rasters alone left p95 at2.299999ms and whole10.299999ms. Both unmet results are preserved in `attempt-1/` and `attempt-2/`. A separate diagnostic-only CPU profile found1,439 lightmap rebuilds,114 full invalidations,6,100 merges,152 base invalidations and1,128 full-local merges (976 without a base change). Lightmap dimensions cycled180×112,184×112,184×116,180×116 at tile boundaries. `diagnostic-reasons.json`, `diagnostic-summary.json`, the instrumented source copies and CPU profile retain that evidence; their timings are **not qualified samples**. Replacing whole-plane window invalidation with the exact all-light support union is the third measured implementation, and meets the target. No fourth approach is taken.

Matched desktop: AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152 headless,1280×720 CSS, DPR1, browser zoom1/world zoom2, Canvas1×, cap off.5s warm-up/30s active rAF, no CPU throttling or concurrent builds/tests/profiles. Both private builds use the same output-only clear/tick0/north cosmetic-weather pin, removed before plain build and functional review. No authority weather/live change. Seed1329809490,summer,content `dfdf555b:21a3c554:4:386`; all item mean/p50/p95/p99 comparisons stay within2% on both roles.

**Cliff/carried-light A-18 role: Dynamic lightingMerge1.799999/2.200001/2.5→0.5/0.9/2ms p50/p95/p99; whole-frame9.900002→8.9ms p95. Both A-12 targets met.** Whole p99 is10ms; maximum32.299999ms, with no long tasks≥50ms. Basic5.6→6.199999 and Classic7.6→6.700001ms p95 are recorded without attributing unrelated stage variation to the Dynamic merge. **Basic6.3ms remains accepted as met** per §8.1. The pinned route is `square-camera-v1:7344:6080`, normal bounded keyboard walking x7650..7690,674 render items p95, and no offscreen actor frames. Legacy `no_pond` belongs to this role; water is reviewed on the separate route.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 4.5 / 5.6 / 6.5 | 5.400002 / 7.6 / 10.300001 | 8.1 / 9.900002 / 11.1 | 4.9 / 6.199999 / 7.299999 | 5.299999 / 6.700001 / 8.199999 | 7.1 / 8.9 / 10 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.6 | 0.299999 / 0.4 / 0.5 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.599998 | 0.300001 / 0.5 / 0.5 |
| painterBuild | 0.9 / 1.300001 / 1.599998 | 1 / 1.6 / 2.1 | 0.9 / 1.300001 / 1.599998 | 1 / 1.4 / 1.6 | 0.9 / 1.4 / 1.699999 | 0.9 / 1.300001 / 1.6 |
| painterSort | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 |
| painterDraw | 1.5 / 1.9 / 2.200001 | 1.6 / 2.200001 / 3.200001 | 4.700001 / 5.799999 / 6.6 | 1.6 / 2 / 2.5 | 1.5 / 2 / 2.6 | 3.800001 / 5 / 5.6 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.099998 / 0.199999 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.099998 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.099998 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 1.799999 / 2.200001 / 2.5 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.5 / 0.9 / 2 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.399998 / 0.699999 / 0.800003 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.9 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.5 / 0.699999 / 0.799999 | 1.199999 / 1.400002 / 1.800001 | 0.4 / 0.5 / 0.6 | 0.599998 / 0.700001 / 0.800001 | 1.1 / 1.300001 / 1.6 | 0.400002 / 0.599998 / 0.6 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.599998 / 0.799999 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.599998 |
| uiDraw | 0.4 / 0.699999 / 0.9 | 0.4 / 0.699999 / 0.9 | 0.4 / 0.599998 / 0.700001 | 0.4 / 0.799999 / 1 | 0.4 / 0.6 / 0.799999 | 0.4 / 0.6 / 0.799999 |
| fixedUpdate | 0.199999 / 0.299999 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.1 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 870 / 1200 / 1210 | 868 / 926 / 930 | 892 / 971 / 1022 | 869 / 1200 / 1210 | 868 / 881 / 887 | 892 / 971 / 1026 |
| distinctDrawImageSources | 34 / 36 / 36 | 35 / 37 / 37 | 346 / 357 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 346 / 357 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 108 / 159 | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 108 / 159 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 22 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 22 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 35 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 873 / 911 / 912 | 0 / 0 / 0 | 0 / 0 / 0 | 874 / 911 / 912 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 530 / 545 / 549 | 531 / 543 / 544 | 531 / 543 / 543 | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| restoreCalls | 530 / 545 / 549 | 531 / 543 / 544 | 531 / 543 / 543 | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| saveRestorePairs | 530 / 545 / 549 | 531 / 543 / 544 | 531 / 543 / 543 | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1799 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 97288331 | 0 | 161280 | 103133827 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

Pond role `square-camera-v1:5368:5440`: Basic4.6→4.5,Classic9.9→7.1,Dynamic7.800001→8.299999ms p95. This sparse camera view contains the pond/cliff evidence while the ordinary actor remains on the populated cliff route. Old combined-scene flags (`invalid_frame_evidence` from missing drawn-actor coordinates, `local_player_not_visible`, `local_player_not_walking`, `no_carried_light`, `fewer_than_150_static_casters`) remain explicit and are not used as a populated A-1 performance claim. Both before/after route identities and item distributions match.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 3.6 / 4.6 / 5.200001 | 5.6 / 9.9 / 13.1 | 5.300001 / 7.800001 / 10.700001 | 3.699999 / 4.5 / 5.300001 | 5.300001 / 7.1 / 9.1 | 5.4 / 8.299999 / 11.299999 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.5 / 0.599998 | 0.4 / 0.700001 / 0.900002 | 0.300001 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.6 / 0.700001 |
| painterBuild | 0.800001 / 1.200001 / 1.400002 | 1 / 2 / 3.699999 | 0.9 / 1.299999 / 1.6 | 0.800001 / 1.200001 / 1.4 | 0.900002 / 1.4 / 2.099998 | 0.9 / 1.4 / 1.700001 |
| painterSort | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.300001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.5 / 0.700001 / 0.9 | 0.6 / 1.200001 / 1.700001 | 1.200001 / 2.6 / 3.799999 | 0.5 / 0.700001 / 0.9 | 0.599998 / 0.799999 / 1 | 1.200001 / 2.799999 / 3.799999 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.199999 | 0 / 0 / 0.199999 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.299999 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.299999 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 1.700003 / 4.599998 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 1.800001 / 4.599998 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.199999 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.599998 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.5 / 0.6 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.700001 / 1 / 1.1 | 2.1 / 3.4 / 4 | 1.200001 / 1.5 / 1.799999 | 0.700001 / 0.900002 / 1 | 2 / 2.5 / 3.700001 | 1.299999 / 1.5 / 2.1 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.6 / 0.700001 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.6 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.400002 / 0.700001 / 0.900002 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.4 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.300001 / 0.6 / 0.800001 | 0.4 / 0.799999 / 1.099998 | 0.300001 / 0.599998 / 0.799999 | 0.300001 / 0.599998 / 0.800001 | 0.4 / 0.6 / 0.900002 | 0.4 / 0.6 / 0.800001 |
| fixedUpdate | 0.199999 / 0.299999 / 0.300001 | 0.200001 / 0.400002 / 0.699999 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.4 / 0.5 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 | 692 / 707 / 712 | 693 / 708 / 713 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1799 | 1800 | 1800 | 1799 | 1799 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 88596300 | 0 | 164864 | 93471620 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |

All six matched cliff captures have zero long tasks≥50ms. Before Basic has a maximum of one surface allocation with zero percentiles; all after modes have maximum0, and Dynamic is maximum0 both before/after. Basic retains zero lighting bytes; Basic/Classic no omit bytes; Classic retains its approved161,280-byte legacy lightmap. Dynamic loads72,515,584 omit-page bytes, with every decoded page≤4MiB. Filtered-frame builds remain zero. The entire10-board Canvas fixture comparison is **byte-exact**, including HUD witnesses (`goldens/comparison.json`). All36 original PNGs and all323 generated files are unchanged from A-11 and agree with the tested private candidate.

| Device / gate | Status |
| --- | --- |
| Desktop cliff/carried-light | **Met:** merge p950.9ms≤1.5; whole p958.9ms≤10 |
| Desktop pond | Separate sparse A-18 role, full stages/counters above |
| Physical iPad | **owner to run** |
| Hardware WebGL GPU | **owner to run**; Canvas-priority step, raw GPU policy unchanged |

Owner iPad steps: candidate System → Developer → Render → **Run protocol + copy JSON**, first on cliff/carried-light, then pond. Retain both JSON captures; record device, OS, browser, DPR, zoom, resolution, commit, scale and backend; repeat Basic/Classic/Dynamic and required scales. No CPU throttling substitutes for iPad. Playwright screenshots are A-18 review evidence. Full check and the18 minute-long scale/mode/backend-request reviews run after qualified timing, with diagnostic code removed. A-19 remains pending owner Go; no deployment.

A-12 functional review completed: `visual-replay/results.json` contains all18 requested backend/scale/mode combinations, each60 seconds with563–599 moving position samples. All18 screenshots, the pond endpoint and Video footer were visually inspected; cliff caps, shadow silhouettes, walking sprites and HUD remain intact. All nine WebGL-requested runs encounter `{webgl_accuracy_unverified_downsample}` and render through Canvas; this is recorded as an unresolved A-14/A-17 gate, not GPU parity. `visual-inspection.json` records the review. An existing Video lighting badge overlaps its lower option rows; fix this in the A-19 settings relocation. Six settled Basic/Classic/Dynamic cycles pass: every Basic switch retains0 lighting bytes, Basic/Classic retain0 omit pages, and Dynamic restores its ready cohort. The final client state is Canvas1× Basic with the experimental preference off.

The first full check failed only the incremental/full comparison test's15-second timeout:635 files/3635 tests passed, one failed after17.961 seconds; original suite duration950.808825969 seconds. No pixel mismatch was reported. Preserve `check-deep-comparison-check.*`. The test now compares the same120 frames×3 signed levels using native byte equality over zero-copy Buffer views instead of a deep typed-array matcher; neither inputs nor timeout nor coverage thresholds changed. Its focused coverage run passes3 tests in907ms (2.34s total), while the partial-run command correctly exits1 for unmet repository-wide sim coverage. `check-retry.json` records the full gate retry against unchanged runtime hashes. Final retry result follows before the boundary commit.

A-12 boundary gate: full `npm run check` **PASS**,636 files/3636 tests,961.452287912 seconds total (Vitest914.30s; tests750.07s), unchanged coverage thresholds and asset validation1021 art/3 songs/10 SFX/55 palette colours/four seasonal remaps. `check.exit` is0 and every runtime/test hash matches `check-source-files.json`. Ten Canvas review boards are byte-exact against A-11, including every HUD witness. All36 original atlas PNGs and323 generated files remain byte-identical. Both measured A-12 exits are met: Dynamic merge p95 **0.899999619ms**, whole-frame p95 **8.899999619ms**, zero long tasks≥50ms. The third measured approach succeeded; no fourth attempt or new OPEN is needed. No deployment.

### A-13 identity present claim — 2026-09-08

IN PROGRESS: codex, 2026-09-08. A-12 runtime is `a5234585`. Inspection finds the A-13 shortcut already implemented in `world-pass-present.ts`: exact integer upscales draw nearest directly to the target, while fractional remainders retain two-stage presentation. Verify the production implementation against a private output-only reference that removes only `|| present.exact` from that branch. Do not introduce duplicate runtime code. Own P1 presentation scope and new output fixtures; no main-file edit. Matched clear-weather cliff/carried-light and pond captures record every stage/counter and finalWorldComposite p95. Ten Canvas boards, screenshot review and original asset hashes remain binding. Artifacts `output/perf-59-20260908/P1/A13/`. The docs-only claim reuses A-12's unchanged green `npm run check` (636 files/3636 tests). Basic6.3ms remains accepted as met; iPad owner to run. No deployment.

### A-13 existing identity shortcut — measured verification, 2026-09-08

Runtime unchanged from `a5234585`; claim `7a1ca798`. `world-pass-present.ts` already skips the identity smoothing copy. This step adds evidence, not a duplicate optimization. Private reference removes only `|| present.exact`; both builds retain A-11/A-12 and identical clear-weather overrides. Commands and hashes: `output/perf-59-20260908/P1/A13/{prepare-candidate.py,capture.py,report.py,run-step.py,*-clear-source-files.json}`; same5s warm-up/30s active rAF, Chrome152 headless/AMD9955HX/Linux6.17.2-1-pve,1280×720,DPR1,browser zoom1/world zoom2,Canvas1×,cap off,no throttling. Both cliff and pond identity/item-distribution comparisons pass. No test/build/profile overlaps timing captures.

Cliff `finalWorldComposite` p95 Basic/Classic/Dynamic **1.600000381/2.200000763/1.600000381→0.800001144/1.899999619/0.600000381ms**. Whole-frame **7.399999619/7.600000381/10.900001526→7.899999619/10.700000763/10.5ms**; these mixed whole-frame results are not a blanket speedup. Basic6.3ms remains accepted as met. Dynamic merge remains0.900001526ms p95. Relative to A-12's8.899999619ms whole-frame result, this unchanged-runtime sample is above10ms; its residual is outside merge: painterBuild and painterDraw timings are retained in the full table. Basic/Classic painterDraw rises2.100000381/2→2.899999619/3.899999619ms and painterBuild1.399999619/1.399999619→1.799999237/2.200000763ms. The cause of that cross-stage variability is not established; do not attribute it to the shortcut or silently discard it. All six cliff captures have674 render items p95 and zero long tasks≥50ms.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.9 / 7.4 / 9.4 | 6.5 / 7.6 / 8.799999 | 8.699999 / 10.900002 / 13 | 5.4 / 7.9 / 12.199999 | 6.700001 / 10.700001 / 15.4 | 7.599998 / 10.5 / 12.599998 |
| snapshotPrepare | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.5 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.799999 | 0.300001 / 0.5 / 1.699999 | 0.299999 / 0.400002 / 0.5 |
| painterBuild | 1 / 1.4 / 1.800001 | 1 / 1.4 / 1.6 | 1 / 1.5 / 1.800001 | 1.1 / 1.799999 / 2.799999 | 1.200001 / 2.200001 / 4 | 1 / 1.699999 / 2.299999 |
| painterSort | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 1 | 0.200001 / 0.300001 / 0.4 |
| painterDraw | 1.699999 / 2.1 / 2.9 | 1.6 / 2 / 2.5 | 4.200001 / 5.599998 / 6.800001 | 1.700001 / 2.9 / 5 | 2 / 3.9 / 6.099998 | 4 / 5.800001 / 7.299999 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.199999 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.4 | 0 / 0.199999 / 0.299999 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.500002 / 0.900002 / 2.1 | 0 / 0 / 0 | 0 / 0.199999 / 0.200001 | 0.500002 / 0.900002 / 2.1 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.400002 / 0.700003 / 0.900002 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.799997 / 1 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.300001 / 1.6 / 2.1 | 1.9 / 2.200001 / 2.6 | 1.200001 / 1.6 / 1.9 | 0.6 / 0.800001 / 1.199999 | 1.300001 / 1.9 / 3.700001 | 0.5 / 0.6 / 0.800001 |
| uiModel | 0.300001 / 0.5 / 0.599998 | 0.300001 / 0.400002 / 0.5 | 0.300001 / 0.400002 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.799999 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.400002 / 0.6 / 1 | 0.5 / 0.700001 / 1.599998 | 0.4 / 0.6 / 0.699999 |
| uiDraw | 0.400002 / 0.800001 / 1.099998 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.6 / 0.800001 | 0.400002 / 0.800001 / 1.200001 | 0.400002 / 0.799999 / 1.4 | 0.4 / 0.6 / 0.9 |
| fixedUpdate | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.4 / 0.700001 | 0.200001 / 0.4 / 1.1 | 0.200001 / 0.300001 / 0.400002 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 881 / 1267 / 1277 | 869 / 882 / 890 | 893 / 975 / 1023 | 869 / 1200 / 1210 | 868 / 881 / 889 | 892 / 966 / 1022 |
| distinctDrawImageSources | 35 / 37 / 38 | 36 / 36 / 37 | 347 / 358 / 358 | 34 / 35 / 35 | 35 / 35 / 36 | 346 / 357 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 111 / 159 | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 108 / 159 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 22 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 26 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 874 / 911 / 912 | 0 / 0 / 0 | 0 / 0 / 0 | 874 / 911 / 912 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 531 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| restoreCalls | 531 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| saveRestorePairs | 531 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1799 | 1797 | 1798 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 102650215 | 0 | 161280 | 103135303 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

Separate pond route (same A-18 sparse-scene limitations retained):

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 4.799999 / 5.599998 / 6.800001 | 6 / 7 / 8.4 | 6.700001 / 10 / 14.400002 | 4.099998 / 5.299999 / 7.1 | 5.199999 / 6.1 / 7.1 | 5.4 / 7.900002 / 11.099998 |
| snapshotPrepare | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.5 / 0.700001 | 0.300001 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 |
| painterBuild | 0.9 / 1.300001 / 1.5 | 0.9 / 1.300001 / 1.6 | 1 / 1.5 / 2.5 | 1 / 1.400002 / 1.9 | 0.900002 / 1.4 / 1.599998 | 0.9 / 1.4 / 1.6 |
| painterSort | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.599998 / 0.700001 / 0.9 | 0.599998 / 0.700001 / 0.800001 | 1.300001 / 3 / 4.9 | 0.6 / 0.800001 / 1 | 0.599998 / 0.700001 / 0.9 | 1.200001 / 2.700001 / 4.099998 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199997 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 1.9 / 5.1 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 1.799999 / 4.799999 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.199999 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.5 / 0.600002 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.5 / 0.6 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.5 / 1.9 / 2.200001 | 2.700001 / 3.1 / 3.9 | 2.1 / 2.799999 / 3.5 | 0.800001 / 1.1 / 1.300001 | 2 / 2.200001 / 2.699999 | 1.299999 / 1.5 / 1.799999 |
| uiModel | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.6 / 0.800001 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.699999 / 1 | 0.4 / 0.6 / 0.9 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.6 / 0.800001 |
| fixedUpdate | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.5 | 0.200001 / 0.4 / 0.400002 | 0.199999 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.400002 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 701 / 759 / 766 | 694 / 709 / 714 | 696 / 755 / 773 | 692 / 707 / 715 | 693 / 708 / 713 | 695 / 754 / 772 |
| distinctDrawImageSources | 25 / 27 / 27 | 24 / 26 / 27 | 148 / 150 / 151 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 367 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 367 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 367 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 93107804 | 0 | 164864 | 93107804 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |

Ten Canvas fixture boards compare byte-exact both against the forced-copy reference and against A-12, including all HUD pixels (`goldens/comparison*.json`). All36 original PNGs and323 generated files remain unchanged. No production source/test changed; the complete A-12 green check (636 files/3636 tests,961.452287912s) applies to exactly these runtime/test hashes. A-12's18 minute-per-setting screenshots remain the completed motion review for this unchanged runtime. The supplementary A-13 small-square playback was interrupted after the owner's cliff-stall clarification; preserve partial `visual-replay/results.json` and `owner-cliff-priority.json`, and do not claim18 new A-13 playbacks.

Harness correction: first private sign-in callback loaded live HTML after the one permitted candidate reroute, leaving seven missing module/preload files. `connection-attempt-1.json` preserves the failure; bounded additional callback reroutes restore the expected private module and ordinary test account. No authentication policy, realm role or live artifact changed. This is not a game performance failure.

Physical iPad: **owner to run**. At the cliff location and separately the pond, open Developer → Render, choose the desired scale/lighting mode and run the existing protocol/copy JSON action; wait through5s warm-up and30s active sampling per mode, then retain JSON with device/OS/browser/DPR/zoom/resolution/commit/scale/backend. Repeat after the update with matching location/content. No CPU throttling substitute. Larger cliff approaches are the next supplementary acceptance test following the owner's clarification. No deployment.

### Cliff-stall regression claim — 2026-09-08

IN PROGRESS: codex, 2026-09-08. Owner clarification: the important failure is the game grinding to a halt near cliff faces, rather than small general-performance differences. Add a supplementary normal keyboard approach/departure route with actor-follow camera and crossings of64/128px coverage/chunk bounds. Capture worst frames, long tasks, correlated render stages/counters and actual movement; compare private pre-A11/A12 and current Canvas. No teleport/collision override and no relabelling of the small pinned A1 route. Output-only fixtures under `output/perf-59-20260908/P4/cliff-stall/`; no production runtime edit is claimed at this point. Reuse the unchanged636-file/3636-test gate for this docs-only claim. A-16→A-14→A-15→A-17→release preparation still follows; no deployment. iPad remains owner to run.

Cliff-stall diagnosis checkpoint: `reconnaissance.json` records current Canvas1× Dynamic p50/p95/p99/max8.100000381/14.600000381/28.700000763/52.699998856ms, one54ms long task, merge max23.899997711ms. The actual camera traverses240px horizontally and31px vertically, with at least52 visible cap runs. The worst frame coincides with the intentional sunset step; many other22–24ms merge spikes coincide with four coverage and four prepared-height rebuilds. Raw trace retains warm-up frames separately. The legacy A1 validator reports no_pond and streamed resource revision changes; these remain explicit, not silently treated as a qualified static A1 scene.

`diagnostic-profile.json`/`diagnostic.cpuprofile` include CPU/heap profiling overhead and are diagnostic only (204.4ms maximum is not an unprofiled game-performance claim). `invalidations.json` from a private two-file instrumented build records12 camera-bucket changes,10 occlusion-source changes, one initial combined reset and one subsequent sky-geometry reset. Registry/map identity stays `dfdf555b:21a3c554:4`, while streamed resource revision changes are preserved in `contentRevisions`. The whole static cohort currently invalidates on every new map identity, even if its relevant caster data is unchanged.

Implement the first bounded correction in `gameplay-celestial-pass.ts`, its test and a new exact caster multiset comparator. Retain the previous caster array and static revision only when every rendering input matches, including duplicate owners and silhouette bytes/identity; otherwise perform the existing invalidation. Scope is recorded in the matching2026-09-08 DECISIONS row. No main-file edit. Subsequent before/after cliff captures hold sky/weather fixed to isolate movement and streaming, alongside the unchanged A1 sunset protocol. Artifacts remain `output/perf-59-20260908/P4/cliff-stall/`. This scope claim uses the unchanged green636-file/3636-test gate; new runtime work must pass its own full gate. No deployment.

### Cliff-stall targeted corrections — implementation checkpoint, 2026-09-08

The first matched baseline is **a0136a17, including A-11/A-12/A-13**, rather than the pre-A11/A12 comparison proposed in the claim. This isolates the additional cliff corrections against the current candidate. All nine scale/mode runs use ordinary keyboard movement, actor-follow camera, constant17:00 sky and privately pinned clear weather. Streaming resource revisions deliberately change on this longer route, so the existing static A1 validator reports `seed_season_or_content_changed`; its separate pond witness is also absent. Preserve both issues, actual camera ranges and64/128px crossings. Do not relabel this supplementary route as the original static A1 workload.

First correction: retain the exact static-caster multiset across equivalent map/bucket refreshes. At1× Dynamic, whole-frame p95/p99/maximum is14.799999237/29.5/38.199998856→13.799999237/17.200000763/33.399999619ms. Lighting merge p99 falls20.899995804→2.5ms, but its maximum remains22.899997711→23.100000381ms when the actual cohort changes. At2× whole-frame p95/p99/max is16.899999619/21.5/38.5→18/24.799999237/37ms; this mixed result is retained. Native is19.600000381/34.100000381/49.799999237→17.399999619/20.600000381/38.600000381ms, and its one baseline long task≥50ms becomes zero. All first-after runs have zero long tasks. Complete raw captures and all-stage/counter tables are preserved under `output/perf-59-20260908/P4/cliff-stall/attempt-1-cohort/`; original baseline captures remain in the parent. These are improvements to reproduced hitches, not proof of the owner's entire severe halt being resolved.

Second bounded correction: reuse the **exact** area-sample bytes of immutable static shadow masks when genuine coverage fields need rebuilding. Supported integral grids and half-pixel caster phases use the cache; every unsupported grid retains the original sampler. OneMiB is reserved for these samples inside the existing2MiB padded-field allowance; viewport working coverage retains its6MiB allowance. No source mask is retained by a sample entry, and full scene reset still releases all bytes. Files and scope are recorded in the matching DECISIONS row. Focused tests cover signed translations, receiver heights, holed silhouettes, existing maximum contributions, clipping, unsupported grids, eviction and disposal. New modules remain under400 lines. Final numbers, full gate and pixel/movement evidence follow before a runtime boundary commit.

A capture preparation attempt stopped at `cliff_anchor_unreachable` because the ordinary character was blocked by a tree at world7536,6279. The measurement had not started. Normal northward then eastward keyboard movement restored the approach; no authority/collision override was used. Preserve `after-1x-basic-anchor-failure.log`, `anchor-recovery.json` and the diagnostic screenshot. This is a route-preparation failure, not a renderer failure or a qualified timing result. iPad: **owner to run** using the existing Developer → Render → Run protocol + copy JSON button; record device/OS/browser/DPR/zoom/resolution/commit/scale/backend and both pinned routes. No deployment.

### Cliff-stall second correction — measured route evidence, 2026-09-08

All nine supplementary after captures completed with zero long tasks≥50ms, at least52 visible cap runs, and ordinary camera motion across64/128px boundaries. Dynamic merge p50/p95/p99/max, milliseconds:1× **0.599998474/2.399999619/20.899995804/22.899997711→0.299999237/2.199998856/2.5/6.899997711**;2× **0.5/2.399999619/2.799999237/23.600002289→0.600000381/2.5/3.800001144/7.399999619**;Native **0.600000381/2.400001526/21.099998474/25.100000381→0.600000381/2.500001907/3.600000381/7.199998856**. These larger-route p95 values are separate from the original A1≤1.5ms target. All original per-frame data and all22 stage tables follow below.

The same prescribed route does not produce identical trajectories through collision:1× Dynamic crosses64/128px boundaries20/12 times before and9/5 after, although both cover the same roughly239-world-pixel horizontal range. Its item mean also changes636.819→650.888. Thus its percentile reduction is corroborating evidence, not a perfectly matched motion comparison. At2× the crossings are19/8→29/12;Native28/12→25/12, with near-identical Native item means636.511→636.717. A repeat of1× is warranted to check the reduced rebuild peak at a more comparable crossing count; preserve the original sample regardless of the repeat. No static-A1 qualification waiver is inferred.

The largest after1× whole frame is34ms: `painterDraw`28ms, `lightingMerge`2.599996567ms, zero coverage rebuilds,23 tint builds and14 cap composites. Native's largest frame is32.299999237ms: painterDraw26.600000381ms, merge0.699995041ms, zero coverage rebuilds. The targeted coverage spike is substantially reduced; these remaining drawing spikes and the unreproduced complete halt remain explicit limitations. No blanket claim that all cliff stalls or all scale targets are resolved.

World scale **1x**. All timings/counters **p50 / p95 / p99 / maximum**. Nested stages must not be summed.

| Stage / counter | Before basic | Before classic | Before dynamic | After basic | After classic | After dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.299999 / 6.5 / 7.6 / 17.200001 | 6 / 7.199999 / 8.299999 / 15.4 | 8.299999 / 14.799999 / 29.5 / 38.199999 | 5.299999 / 6.400002 / 7.299999 / 10.800001 | 6.200001 / 7.6 / 9 / 16.299999 | 7.700001 / 13.199999 / 16.6 / 34 |
| snapshotPrepare | 0 / 0.1 / 0.199999 / 0.300001 | 0 / 0.1 / 0.1 / 0.300001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.300001 |
| ground | 0.299999 / 0.400002 / 0.5 / 1.599998 | 0.299999 / 0.400002 / 0.5 / 1.1 | 0.299999 / 0.4 / 0.5 / 1.4 | 0.299999 / 0.400002 / 0.5 / 1.799999 | 0.299999 / 0.400002 / 0.5 / 1 | 0.299999 / 0.400002 / 0.5 / 6 |
| painterBuild | 1 / 1.400002 / 1.700001 / 6.4 | 1 / 1.4 / 1.699999 / 3.300001 | 1 / 1.4 / 1.6 / 4.6 | 1 / 1.5 / 1.700001 / 2.6 | 1.1 / 1.5 / 1.800001 / 8.9 | 1 / 1.5 / 1.800001 / 4.799999 |
| painterSort | 0.199999 / 0.299999 / 0.300001 / 3.200001 | 0.199999 / 0.300001 / 0.300001 / 0.5 | 0.199999 / 0.299999 / 0.300001 / 0.700001 | 0.199999 / 0.300001 / 0.4 / 2.5 | 0.200001 / 0.300001 / 0.300001 / 0.800001 | 0.200001 / 0.300001 / 0.300001 / 2.300001 |
| painterDraw | 1.5 / 2 / 2.4 / 4.200001 | 1.5 / 2 / 2.4 / 9.9 | 4 / 10.299999 / 19.5 / 26.800001 | 1.5 / 2 / 2.5 / 4.800001 | 1.5 / 2.1 / 2.5 / 7.900002 | 3.5 / 8.6 / 11.799999 / 28 |
| weather | 0 / 0.099998 / 0.1 / 0.199999 | 0 / 0.099998 / 0.1 / 0.1 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.5 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 / 0 | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0 / 0 | 0 / 0.099998 / 0.1 / 0.300001 | 0 / 0.099998 / 0.1 / 0.300001 |
| lightingOcclusionRaster | 0 / 0 / 0 / 0 | 0 / 0.199999 / 0.300001 / 0.400002 | 0 / 0.199999 / 0.300001 / 0.4 | 0 / 0 / 0 / 0 | 0 / 0.200001 / 0.300001 / 0.5 | 0 / 0.199999 / 0.299999 / 0.4 |
| lightingSolve | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 / 0.300001 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.299999 | 0 / 0.200001 / 0.200001 / 0.5 |
| lightingMerge | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.599998 / 2.4 / 20.899996 / 22.899998 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.299999 / 2.199999 / 2.5 / 6.899998 |
| lightingUpload | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.200001 / 0.299999 / 0.400002 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.1 / 0.199999 | 0 / 0.200001 / 0.300001 / 1.200001 |
| lightingReceiver | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0.399998 / 0.699999 / 0.800001 / 1.200003 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0.399998 / 0.699999 / 0.800003 / 2.5 |
| lightingComposite | 0 / 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 / 0.1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0.1 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1.200001 / 1.9 / 2.200001 / 7.1 | 1.800001 / 2.5 / 2.800001 / 6.299999 | 1 / 2.299999 / 2.5 / 4 | 1.200001 / 1.900002 / 2.1 / 5.300001 | 1.800001 / 2.6 / 3 / 4.9 | 1.099998 / 2.5 / 2.799999 / 6.200001 |
| uiModel | 0.299999 / 0.4 / 0.5 / 2.4 | 0.299999 / 0.4 / 0.400002 / 0.9 | 0.299999 / 0.4 / 0.5 / 1 | 0.299999 / 0.4 / 0.400002 / 0.6 | 0.299999 / 0.4 / 0.5 / 0.700001 | 0.299999 / 0.4 / 0.5 / 0.6 |
| uiLayout | 0.4 / 0.5 / 0.6 / 8.599998 | 0.4 / 0.5 / 0.5 / 1.6 | 0.4 / 0.5 / 0.5 / 3.1 | 0.4 / 0.5 / 0.6 / 2.699999 | 0.4 / 0.5 / 0.6 / 2.700001 | 0.4 / 0.5 / 0.6 / 1 |
| uiDraw | 0.4 / 0.700001 / 1 / 10.199999 | 0.4 / 0.699999 / 0.800001 / 1.400002 | 0.4 / 0.700001 / 0.800001 / 3.9 | 0.4 / 0.699999 / 0.800001 / 1.200001 | 0.4 / 0.700001 / 0.9 / 1.4 | 0.4 / 0.6 / 0.800001 / 2 |
| fixedUpdate | 0.199999 / 0.300001 / 0.400002 / 5.5 | 0.199999 / 0.300001 / 0.4 / 6.300001 | 0.199999 / 0.299999 / 0.400002 / 6.6 | 0.199999 / 0.300001 / 0.4 / 2.200001 | 0.199999 / 0.300001 / 0.4 / 1.800001 | 0.199999 / 0.300001 / 0.4 / 6.199999 |
| catchUp | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0.1 / 0.300001 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0.299999 |
| long tasks ≥50ms | 0 | 0 | 0 | 0 | 0 | 0 |
| drawImageCalls | 866 / 1192 / 1202 / 1219 | 866 / 886 / 896 / 915 | 899 / 990 / 1045 / 1140 | 865 / 885 / 895 / 914 | 867 / 886 / 896 / 908 | 916 / 993 / 1072 / 1145 |
| distinctDrawImageSources | 34 / 35 / 35 / 36 | 34 / 35 / 35 / 36 | 335 / 357 / 361 / 364 | 33 / 34 / 35 / 35 | 34 / 35 / 36 / 37 | 341 / 362 / 364 / 365 |
| tintBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 7 / 8 / 22 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 3 / 8 / 23 |
| tintReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 81 / 87 / 89 / 90 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 84 / 90 / 90 / 93 |
| tintSurfaceReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 4 / 4 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 4 / 4 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 |
| groundSourceOperations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 18 / 114 / 138 / 177 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 6 / 114 / 174 / 204 |
| imageDataAllocations | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 |
| capRunRequests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96 / 104 / 108 / 108 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96 / 104 / 108 / 108 |
| flatSourceRequests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 214 / 234 / 234 / 234 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 220 / 236 / 236 / 236 |
| capRunComposites | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 4 / 19 / 28 / 35 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 2 / 15 / 20 / 35 |
| flatSourceComposites | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 2 / 16 / 28 / 40 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 18 / 39 / 40 |
| groundSourceReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 300 / 335 / 338 / 338 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 316 / 340 / 340 / 340 |
| receiverSamples | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 297 / 300 / 308 / 308 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 296 / 303 / 303 / 308 |
| receiverCandidates | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 859 / 896 / 916 / 916 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 842 / 870 / 898 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 97940 / 99900 / 102564 / 102564 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 97680 / 99990 / 99990 / 102564 |
| saveCalls | 542 / 564 / 573 / 575 | 545 / 562 / 570 / 572 | 545 / 564 / 577 / 579 | 544 / 561 / 569 / 571 | 545 / 562 / 570 / 570 | 549 / 575 / 575 / 582 |
| restoreCalls | 542 / 564 / 573 / 575 | 545 / 562 / 570 / 572 | 545 / 564 / 577 / 579 | 544 / 561 / 569 / 571 | 545 / 562 / 570 / 570 | 549 / 575 / 575 / 582 |
| saveRestorePairs | 542 / 564 / 573 / 575 | 545 / 562 / 570 / 572 | 545 / 564 / 577 / 579 | 544 / 561 / 569 / 571 | 545 / 562 / 570 / 570 | 549 / 575 / 575 / 582 |
| surfaceAllocations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 21 |

World scale **2x**. All timings/counters **p50 / p95 / p99 / maximum**. Nested stages must not be summed.

| Stage / counter | Before basic | Before classic | Before dynamic | After basic | After classic | After dynamic |
|---|---|---|---|---|---|---|
| whole frame | 6.4 / 7.800001 / 8.900002 / 11.4 | 8.4 / 9.9 / 11.300001 / 19.199999 | 10.700001 / 16.9 / 21.5 / 38.5 | 6.5 / 8.200001 / 9.4 / 18.1 | 8.6 / 10.6 / 12.4 / 18.199999 | 11.5 / 18.6 / 21.6 / 37.800001 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.4 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 / 0.6 | 0 / 0.1 / 0.199999 / 0.400002 | 0 / 0.1 / 0.1 / 0.200001 |
| ground | 0.299999 / 0.400002 / 0.5 / 0.9 | 0.299999 / 0.400002 / 0.5 / 9.5 | 0.299999 / 0.400002 / 0.5 / 3.699999 | 0.299999 / 0.400002 / 0.5 / 4.200001 | 0.299999 / 0.400002 / 0.5 / 3.099998 | 0.299999 / 0.4 / 0.5 / 3.5 |
| painterBuild | 1 / 1.4 / 1.6 / 2.4 | 1 / 1.4 / 1.6 / 4 | 1.099998 / 1.5 / 1.700001 / 6.9 | 1.1 / 1.6 / 1.800001 / 9.799999 | 1.1 / 1.5 / 1.800001 / 2.6 | 1.1 / 1.5 / 1.9 / 5.1 |
| painterSort | 0.199999 / 0.299999 / 0.300001 / 0.900002 | 0.199999 / 0.299999 / 0.300001 / 0.5 | 0.199999 / 0.300001 / 0.300001 / 11.6 | 0.200001 / 0.300001 / 0.300001 / 1.9 | 0.200001 / 0.300001 / 0.4 / 4.200001 | 0.200001 / 0.300001 / 0.4 / 3.200001 |
| painterDraw | 2 / 2.800001 / 3.300001 / 6.1 | 2 / 2.800001 / 3.299999 / 7.5 | 5.4 / 11.799999 / 15 / 25.799999 | 2 / 3 / 3.400002 / 4.700001 | 2 / 3 / 3.6 / 5.1 | 6.1 / 13.1 / 15.099998 / 24.800001 |
| weather | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.099998 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.299999 | 0 / 0.1 / 0.1 / 0.300001 |
| lightingBoundsResize | 0 / 0 / 0 / 0 | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0 / 0 | 0 / 0 / 0.1 / 0.299999 | 0 / 0 / 0.1 / 0.200001 |
| lightingOcclusionRaster | 0 / 0 / 0 / 0 | 0 / 0.200001 / 0.300001 / 0.400002 | 0 / 0.199999 / 0.300001 / 0.400002 | 0 / 0 / 0 / 0 | 0 / 0.200001 / 0.300001 / 0.5 | 0 / 0.200001 / 0.300001 / 0.700001 |
| lightingSolve | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.299999 | 0.099998 / 0.200001 / 0.200001 / 1.599998 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 / 1.200001 |
| lightingMerge | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.5 / 2.4 / 2.799999 / 23.600002 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.9 | 0.6 / 2.5 / 3.800001 / 7.4 |
| lightingUpload | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.200001 / 0.200001 / 0.300001 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.200001 / 0.299999 / 0.4 |
| lightingReceiver | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0.300001 / 0.699999 / 0.800003 / 2.100002 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0.4 / 0.699999 / 0.800001 / 4 |
| lightingComposite | 0 / 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 / 0.1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0.1 | 0 / 0.1 / 0.1 / 0.1 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1.800001 / 3.299999 / 3.799999 / 5 | 3.799999 / 5.1 / 5.800001 / 11.5 | 1.799999 / 5.4 / 6 / 12.4 | 1.900002 / 3.299999 / 3.799999 / 10 | 3.800001 / 5.299999 / 6 / 7.6 | 1.799999 / 5.300001 / 5.800001 / 13 |
| uiModel | 0.299999 / 0.4 / 0.400002 / 0.700001 | 0.299999 / 0.4 / 0.5 / 5.900002 | 0.299999 / 0.400002 / 0.5 / 1.5 | 0.299999 / 0.4 / 0.5 / 0.700001 | 0.299999 / 0.400002 / 0.5 / 1.6 | 0.299999 / 0.4 / 0.5 / 4.199999 |
| uiLayout | 0.4 / 0.5 / 0.6 / 2.1 | 0.4 / 0.5 / 0.6 / 1.4 | 0.4 / 0.5 / 0.6 / 1.5 | 0.4 / 0.5 / 0.6 / 1.199999 | 0.4 / 0.5 / 0.6 / 1.299999 | 0.4 / 0.599998 / 0.6 / 1.1 |
| uiDraw | 0.4 / 0.699999 / 0.9 / 1.1 | 0.4 / 0.699999 / 0.9 / 1.199999 | 0.4 / 0.699999 / 0.9 / 3.400002 | 0.4 / 0.700001 / 0.9 / 1.200001 | 0.4 / 0.700001 / 0.9 / 1.5 | 0.4 / 0.700001 / 0.9 / 1.299999 |
| fixedUpdate | 0.199999 / 0.299999 / 0.4 / 11.299999 | 0.199999 / 0.299999 / 0.400002 / 9.700001 | 0.199999 / 0.299999 / 0.4 / 7.200001 | 0.199999 / 0.300001 / 0.4 / 5.599998 | 0.200001 / 0.300001 / 0.4 / 3.300001 | 0.199999 / 0.300001 / 0.799999 / 6.9 |
| catchUp | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0.199999 / 0.300001 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0.200001 / 5.9 |
| long tasks ≥50ms | 0 | 0 | 0 | 0 | 0 | 0 |
| drawImageCalls | 862 / 886 / 897 / 905 | 866 / 886 / 896 / 915 | 881 / 959 / 1021 / 1074 | 863 / 885 / 897 / 916 | 866 / 886 / 896 / 905 | 892 / 985 / 1032 / 1126 |
| distinctDrawImageSources | 33 / 34 / 35 / 35 | 34 / 35 / 36 / 36 | 339 / 361 / 362 / 362 | 33 / 34 / 34 / 35 | 34 / 35 / 36 / 36 | 330 / 352 / 363 / 364 |
| tintBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 6 / 8 / 17 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 7 / 8 / 24 |
| tintReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 84 / 90 / 91 / 91 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 81 / 90 / 91 / 91 |
| tintSurfaceReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 |
| groundSourceOperations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 9 / 117 / 168 / 177 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 18 / 105 / 138 / 177 |
| imageDataAllocations | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 |
| capRunRequests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96 / 104 / 104 / 108 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96 / 104 / 108 / 108 |
| flatSourceRequests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 220 / 236 / 236 / 236 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 211 / 236 / 236 / 236 |
| capRunComposites | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 3 / 19 / 27 / 35 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 4 / 19 / 28 / 35 |
| flatSourceComposites | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 18 / 28 / 40 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 2 / 16 / 24 / 39 |
| groundSourceReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 313 / 340 / 340 / 340 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 297 / 331 / 340 / 340 |
| receiverSamples | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 296 / 303 / 308 / 308 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 297 / 303 / 308 / 308 |
| receiverCandidates | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 853 / 870 / 916 / 916 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 859 / 898 / 916 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96903 / 99900 / 102564 / 102564 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 98235 / 99990 / 102564 / 102564 |
| saveCalls | 541 / 564 / 573 / 573 | 545 / 562 / 570 / 572 | 548 / 574 / 574 / 577 | 543 / 561 / 569 / 575 | 545 / 562 / 570 / 570 | 545 / 565 / 575 / 576 |
| restoreCalls | 541 / 564 / 573 / 573 | 545 / 562 / 570 / 572 | 548 / 574 / 574 / 577 | 543 / 561 / 569 / 575 | 545 / 562 / 570 / 570 | 545 / 565 / 575 / 576 |
| saveRestorePairs | 541 / 564 / 573 / 573 | 545 / 562 / 570 / 572 | 548 / 574 / 574 / 577 | 543 / 561 / 569 / 575 | 545 / 562 / 570 / 570 | 545 / 565 / 575 / 576 |
| surfaceAllocations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 21 |

World scale **native**. All timings/counters **p50 / p95 / p99 / maximum**. Nested stages must not be summed.

| Stage / counter | Before basic | Before classic | Before dynamic | After basic | After classic | After dynamic |
|---|---|---|---|---|---|---|
| whole frame | 7.5 / 9.1 / 10.1 / 18.700001 | 10 / 11.799999 / 13.299999 / 23.4 | 12.6 / 19.6 / 34.1 / 49.799999 | 7.799999 / 10 / 11.799999 / 41.300001 | 10.5 / 12.4 / 13.700001 / 22.700001 | 13.200001 / 19.700001 / 22.700001 / 32.299999 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 1.4 | 0 / 0.1 / 0.1 / 0.700001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.700001 | 0 / 0.1 / 0.199999 / 1.5 | 0 / 0.1 / 0.1 / 1.5 |
| ground | 0.300001 / 0.400002 / 0.5 / 3.4 | 0.299999 / 0.400002 / 0.5 / 0.800001 | 0.299999 / 0.400002 / 0.5 / 1 | 0.299999 / 0.400002 / 0.599998 / 6 | 0.299999 / 0.400002 / 0.5 / 0.799999 | 0.299999 / 0.400002 / 0.5 / 0.699999 |
| painterBuild | 1 / 1.5 / 1.700001 / 2.5 | 1 / 1.5 / 1.699999 / 4.400002 | 1 / 1.400002 / 1.799999 / 6.700001 | 1.1 / 1.5 / 1.800001 / 4.9 | 1.1 / 1.5 / 1.799999 / 3.799999 | 1.1 / 1.5 / 2 / 6.9 |
| painterSort | 0.199999 / 0.299999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.300001 / 3 | 0.199999 / 0.300001 / 0.300001 / 0.599998 | 0.200001 / 0.300001 / 0.4 / 1.200001 | 0.200001 / 0.300001 / 0.4 / 0.599998 | 0.200001 / 0.300001 / 0.4 / 3.799999 |
| painterDraw | 2.800001 / 3.900002 / 4.5 / 6.199999 | 2.799999 / 3.9 / 4.5 / 14.800001 | 7 / 14 / 21.6 / 35.6 | 2.9 / 4.299999 / 5 / 28.199999 | 2.9 / 4 / 4.5 / 9.299999 | 7.300001 / 13.9 / 15.9 / 27.300001 |
| weather | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 / 0 | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0 / 0 | 0 / 0 / 0.1 / 0.300001 | 0 / 0 / 0.1 / 0.200001 |
| lightingOcclusionRaster | 0 / 0 / 0 / 0 | 0 / 0.200001 / 0.300001 / 0.4 | 0 / 0.200001 / 0.300001 / 0.4 | 0 / 0 / 0 / 0 | 0 / 0.200001 / 0.300001 / 0.400002 | 0 / 0.200001 / 0.300001 / 0.400002 |
| lightingSolve | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 / 0.400002 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 / 0.300001 |
| lightingMerge | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.299999 | 0.6 / 2.400002 / 21.099998 / 25.1 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.200001 / 0.200001 | 0.6 / 2.500002 / 3.6 / 7.199999 |
| lightingUpload | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.200001 / 0.299999 / 0.400002 | 0 / 0 / 0 / 0 | 0 / 0.1 / 0.1 / 1.6 | 0 / 0.200001 / 0.300001 / 0.400002 |
| lightingReceiver | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0.4 / 0.699999 / 0.800003 / 1.5 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0.4 / 0.700001 / 0.900003 / 6.699999 |
| lightingComposite | 0 / 0 / 0 / 0.1 | 0 / 0.1 / 0.1 / 0.1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0.1 | 0 / 0.1 / 0.1 / 0.1 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 2.1 / 4.4 / 4.9 / 14.5 | 4.599998 / 6.799999 / 7.400002 / 13.700001 | 2 / 6.5 / 7 / 7.799999 | 2.200001 / 4.300001 / 5 / 7.9 | 4.699999 / 7 / 7.800001 / 14.4 | 2 / 6.5 / 7.299999 / 11.400002 |
| uiModel | 0.299999 / 0.4 / 0.5 / 0.700001 | 0.299999 / 0.400002 / 0.5 / 1.299999 | 0.299999 / 0.400002 / 0.5 / 5.800001 | 0.299999 / 0.400002 / 0.5 / 3.800001 | 0.299999 / 0.400002 / 0.5 / 10.5 | 0.300001 / 0.400002 / 0.5 / 5 |
| uiLayout | 0.4 / 0.5 / 0.5 / 1.799999 | 0.4 / 0.5 / 0.5 / 3.200001 | 0.4 / 0.5 / 0.6 / 5.199999 | 0.4 / 0.599998 / 0.699999 / 2.5 | 0.400002 / 0.6 / 0.700001 / 2.200001 | 0.400002 / 0.6 / 0.6 / 5.6 |
| uiDraw | 0.4 / 0.699999 / 0.9 / 1.4 | 0.4 / 0.699999 / 0.800001 / 1.1 | 0.4 / 0.700001 / 0.9 / 5.200001 | 0.4 / 0.700001 / 0.9 / 1.200001 | 0.4 / 0.700001 / 0.9 / 2.699999 | 0.4 / 0.700001 / 1 / 4.800001 |
| fixedUpdate | 0.199999 / 0.300001 / 0.300001 / 6.4 | 0.199999 / 0.299999 / 0.4 / 6.4 | 0.199999 / 0.299999 / 0.4 / 6.4 | 0.199999 / 0.300001 / 0.4 / 2.1 | 0.199999 / 0.300001 / 0.4 / 2.400002 | 0.199999 / 0.299999 / 0.800001 / 8.1 |
| catchUp | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0.200001 / 5.900002 | 0 / 0 / 0 / 0.4 | 0 / 0 / 0 / 0 | 0 / 0 / 0.200001 / 0.4 |
| long tasks ≥50ms | 0 | 0 | 1 | 0 | 0 | 0 |
| drawImageCalls | 865 / 885 / 895 / 904 | 866 / 886 / 896 / 905 | 881 / 951 / 994 / 1085 | 865 / 885 / 895 / 914 | 866 / 886 / 896 / 915 | 882 / 951 / 995 / 1085 |
| distinctDrawImageSources | 33 / 34 / 35 / 35 | 34 / 35 / 36 / 36 | 333 / 354 / 361 / 362 | 33 / 34 / 35 / 35 | 34 / 35 / 36 / 36 | 333 / 354 / 361 / 362 |
| tintBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 7 / 8 / 22 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 7 / 8 / 22 |
| tintReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 81 / 88 / 91 / 91 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 81 / 88 / 90 / 91 |
| tintSurfaceReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 4 / 4 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 4 / 4 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 4 |
| groundSourceOperations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 18 / 114 / 138 / 177 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 18 / 114 / 138 / 177 |
| imageDataAllocations | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 |
| capRunRequests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96 / 104 / 108 / 108 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 96 / 104 / 108 / 108 |
| flatSourceRequests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 212 / 234 / 236 / 236 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 214 / 234 / 236 / 236 |
| capRunComposites | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 4 / 19 / 28 / 35 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 4 / 19 / 28 / 35 |
| flatSourceComposites | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 2 / 16 / 28 / 40 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 2 / 16 / 28 / 40 |
| groundSourceReuses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 297 / 335 / 340 / 340 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 298 / 335 / 340 / 340 |
| receiverSamples | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 297 / 300 / 308 / 308 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 297 / 300 / 308 / 308 |
| receiverCandidates | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 859 / 898 / 916 / 916 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 859 / 896 / 916 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 98010 / 99900 / 102564 / 102564 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 98235 / 99900 / 102564 / 102564 |
| saveCalls | 544 / 561 / 569 / 569 | 545 / 562 / 570 / 570 | 545 / 563 / 575 / 582 | 544 / 561 / 569 / 571 | 545 / 562 / 570 / 572 | 545 / 564 / 574 / 582 |
| restoreCalls | 544 / 561 / 569 / 569 | 545 / 562 / 570 / 570 | 545 / 563 / 575 / 582 | 544 / 561 / 569 / 571 | 545 / 562 / 570 / 572 | 545 / 564 / 574 / 582 |
| saveRestorePairs | 544 / 561 / 569 / 569 | 545 / 562 / 570 / 570 | 545 / 563 / 575 / 582 | 544 / 561 / 569 / 571 | 545 / 562 / 570 / 572 | 545 / 564 / 574 / 582 |
| surfaceAllocations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 22 |

A1 regression preparation found an unmatched retained-capacity state after the Native runs: display metadata reports2048×1152 world backing at1×, versus768×432 in A-13, despite identical230,400 active pixels and matching item distributions. Preserve these captures in `a1-regression/retained-native-capacity/` as a diagnostic, not a matched A1 comparison. Dynamic whole p95 is11.800001144ms, merge0.900003433ms, finalWorldComposite2.699998856ms; the latter was0.600000381ms in A-13. Reconnect a fresh1× private candidate before repeating both pinned routes. Retained canvas capacity is existing policy; no presentation code is changed in this cliff correction, and causal attribution beyond the observed capacity/timing difference remains unproven.

### Cliff-stall A1 regression, repeat and pixel checkpoint — 2026-09-08

The first connection-only retry did not reload an already-current document; preserve it under `a1-regression/connection-without-reload/` with its interrupted pond capture. The corrected harness explicitly reloads, waits for normal authentication and asserts768×432 backing before starting. `fresh-client.py` and `a1-regression/fresh-display.json` prove this precondition. Fresh cliff and pond comparisons now pass identity, item-distribution, viewport/DPR/zoom/world-scale and backing-dimension checks.

On fresh1× A1, Basic/Classic/Dynamic whole p95 is7.899999618530273/10.700000762939453/10.5→6.600000381/7.700000763/10.899999619ms. **Basic6.3ms remains accepted as met.** Dynamic merge p95 stays0.900001526ms; maximum falls19.600002289→6.5ms. Whole-frame maximum falls30.300001144→19.5ms, with zero long tasks≥50ms. The10ms whole-frame target has a0.899999619ms residual in this run: finalWorldComposite p95 is0.600000381→2.200000763ms, while painterBuild improves1.699998856→1.399999619 and painterDraw5.800001144→5.600000381ms. Presentation code is unchanged and the cause of this remaining timing variation is unestablished. Do not claim a whole-frame target pass from this run or attribute all variation to capacity. Full original stage values follow.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.4 / 7.9 / 12.199999 | 6.700001 / 10.700001 / 15.4 | 7.599998 / 10.5 / 12.599998 | 5.4 / 6.6 / 7.699999 | 6.199999 / 7.700001 / 8.9 | 8 / 10.9 / 15.299999 |
| snapshotPrepare | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.5 / 0.799999 | 0.300001 / 0.5 / 1.699999 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.599998 | 0.300001 / 0.5 / 0.599998 |
| painterBuild | 1.1 / 1.799999 / 2.799999 | 1.200001 / 2.200001 / 4 | 1 / 1.699999 / 2.299999 | 1 / 1.4 / 1.6 | 1 / 1.400002 / 1.699999 | 1 / 1.4 / 1.6 |
| painterSort | 0.200001 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 1 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 |
| painterDraw | 1.700001 / 2.9 / 5 | 2 / 3.9 / 6.099998 | 4 / 5.800001 / 7.299999 | 1.699999 / 2.1 / 2.5 | 1.699999 / 2.199999 / 2.6 | 3.9 / 5.6 / 10.6 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.4 | 0 / 0.199999 / 0.299999 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.199999 / 0.200001 | 0.500002 / 0.900002 / 2.1 | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 0.599998 / 0.900002 / 1.900002 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.799997 / 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.300001 / 0.600002 / 0.799997 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.6 / 0.800001 / 1.199999 | 1.300001 / 1.9 / 3.700001 | 0.5 / 0.6 / 0.800001 | 1.099998 / 1.299999 / 1.400002 | 1.699999 / 2 / 2.300001 | 1 / 2.200001 / 2.5 |
| uiModel | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.799999 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.400002 / 0.6 / 1 | 0.5 / 0.700001 / 1.599998 | 0.4 / 0.6 / 0.699999 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.599998 |
| uiDraw | 0.400002 / 0.800001 / 1.200001 | 0.400002 / 0.799999 / 1.4 | 0.4 / 0.6 / 0.9 | 0.4 / 0.700001 / 0.9 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.6 / 0.800001 |
| fixedUpdate | 0.200001 / 0.4 / 0.700001 | 0.200001 / 0.4 / 1.1 | 0.200001 / 0.300001 / 0.400002 | 0.199999 / 0.299999 / 0.4 | 0.199999 / 0.299999 / 0.4 | 0.1 / 0.299999 / 0.300001 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 869 / 1200 / 1210 | 868 / 881 / 889 | 892 / 966 / 1022 | 879 / 1209 / 1218 | 878 / 891 / 898 | 898 / 982 / 1030 |
| distinctDrawImageSources | 34 / 35 / 35 | 35 / 35 / 36 | 346 / 357 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 94 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 24 / 108 / 159 | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 100 / 100 / 100 | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 210 / 219 / 219 | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 16 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 19 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 319 / 319 | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 326 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 874 / 911 / 912 | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 | 553 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| restoreCalls | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 | 553 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| saveRestorePairs | 530 / 545 / 549 | 531 / 543 / 543 | 531 / 543 / 543 | 553 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1797 | 1798 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 103135303 | 0 | 161280 | 103164678 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

Separate pond route (same sparse-view limitations as A-13; no populated-A1 claim):

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 4.099998 / 5.299999 / 7.1 | 5.199999 / 6.1 / 7.1 | 5.4 / 7.900002 / 11.099998 | 3.699999 / 4.6 / 5.4 | 5 / 6 / 7.299999 | 5.199999 / 6.800001 / 8.099998 |
| snapshotPrepare | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.700001 | 0.300001 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| painterBuild | 1 / 1.400002 / 1.9 | 0.900002 / 1.4 / 1.599998 | 0.9 / 1.4 / 1.6 | 0.800001 / 1.200001 / 1.5 | 0.800001 / 1.299999 / 1.5 | 0.800001 / 1.300001 / 1.5 |
| painterSort | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.6 / 0.800001 / 1 | 0.599998 / 0.700001 / 0.9 | 1.200001 / 2.700001 / 4.099998 | 0.5 / 0.700001 / 0.800001 | 0.5 / 0.700001 / 0.800001 | 1.1 / 2.099998 / 2.5 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.199999 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 1.799999 / 4.799999 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.900002 / 1.299999 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.299997 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.5 / 0.6 | 0 / 0 / 0 | 0 / 0 / 0 | 0.199999 / 0.400002 / 0.500002 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.800001 / 1.1 / 1.300001 | 2 / 2.200001 / 2.699999 | 1.299999 / 1.5 / 1.799999 | 0.700001 / 1 / 1.1 | 1.900002 / 2.200001 / 2.799999 | 1.200001 / 1.400002 / 1.699999 |
| uiModel | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.5 | 0.300001 / 0.5 / 0.5 | 0.4 / 0.5 / 0.5 |
| uiDraw | 0.4 / 0.6 / 0.9 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.6 / 0.800001 | 0.300001 / 0.6 / 0.800001 | 0.300001 / 0.6 / 0.800001 | 0.300001 / 0.6 / 0.800001 |
| fixedUpdate | 0.200001 / 0.4 / 0.400002 | 0.199999 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.300001 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 715 | 693 / 708 / 713 | 695 / 754 / 772 | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 93107804 | 0 | 164864 | 96640430 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |

The extra1× Dynamic approach/departure repeat crosses64/128px boundaries16/9 times (baseline20/12), over the same horizontal range. It records whole p50/p95/p99/max8.199998856/15/17.800001144/31.699998856ms, merge0.500001907/2.399999619/2.700000763/6.899999619ms and zero long tasks≥50ms. It corroborates the reduction in the rebuild peak at a more comparable crossing count; retain its15ms p95 as well as the first after13.199998856ms. No selective replacement of the first sample.

Repeat comparison; p50 / p95 / p99 / maximum.

| Stage / counter | Before Dynamic1× | Additional after repeat |
|---|---|---|
| whole frame | 8.299999 / 14.799999 / 29.5 / 38.199999 | 8.199999 / 15 / 17.800001 / 31.699999 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 |
| ground | 0.299999 / 0.4 / 0.5 / 1.4 | 0.300001 / 0.5 / 0.5 / 1 |
| painterBuild | 1 / 1.4 / 1.6 / 4.6 | 1 / 1.5 / 1.800001 / 5.4 |
| painterSort | 0.199999 / 0.299999 / 0.300001 / 0.700001 | 0.199999 / 0.300001 / 0.300001 / 0.5 |
| painterDraw | 4 / 10.299999 / 19.5 / 26.800001 | 3.9 / 10.4 / 12.200001 / 25.700001 |
| weather | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0.1 / 0.200001 | 0 / 0 / 0.199999 / 0.200001 |
| lightingOcclusionRaster | 0 / 0.199999 / 0.300001 / 0.4 | 0 / 0.200001 / 0.300001 / 0.400002 |
| lightingSolve | 0.1 / 0.200001 / 0.200001 / 0.300001 | 0.1 / 0.200001 / 0.200001 / 0.299999 |
| lightingMerge | 0.599998 / 2.4 / 20.899996 / 22.899998 | 0.500002 / 2.4 / 2.700001 / 6.9 |
| lightingUpload | 0 / 0.200001 / 0.299999 / 0.400002 | 0 / 0.200001 / 0.299999 / 0.300001 |
| lightingReceiver | 0.399998 / 0.699999 / 0.800001 / 1.200003 | 0.399998 / 0.699999 / 0.800003 / 6.100002 |
| lightingComposite | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1 / 2.299999 / 2.5 / 4 | 1 / 2.4 / 2.700001 / 3.5 |
| uiModel | 0.299999 / 0.4 / 0.5 / 1 | 0.299999 / 0.5 / 0.599998 / 0.800001 |
| uiLayout | 0.4 / 0.5 / 0.5 / 3.1 | 0.4 / 0.5 / 0.6 / 1 |
| uiDraw | 0.4 / 0.700001 / 0.800001 / 3.9 | 0.4 / 0.699999 / 0.800001 / 1.1 |
| fixedUpdate | 0.199999 / 0.299999 / 0.400002 / 6.6 | 0.199999 / 0.299999 / 0.4 / 7.199999 |
| catchUp | 0 / 0 / 0.1 / 0.300001 | 0 / 0 / 0 / 0.299999 |
| drawImageCalls | 899 / 990 / 1045 / 1140 | 890 / 993 / 1056 / 1099 |
| distinctDrawImageSources | 335 / 357 / 361 / 364 | 339 / 361 / 362 / 362 |
| tintBuilds | 0 / 7 / 8 / 22 | 0 / 7 / 8 / 23 |
| tintReuses | 81 / 87 / 89 / 90 | 82 / 90 / 90 / 90 |
| tintSurfaceReuses | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 4 / 4 | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 4 / 4 | 0 / 0 / 0 / 4 |
| groundSourceOperations | 18 / 114 / 138 / 177 | 15 / 99 / 153 / 177 |
| imageDataAllocations | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 |
| capRunRequests | 96 / 104 / 108 / 108 | 96 / 104 / 108 / 108 |
| flatSourceRequests | 214 / 234 / 234 / 234 | 220 / 236 / 236 / 236 |
| capRunComposites | 4 / 19 / 28 / 35 | 3 / 19 / 28 / 35 |
| flatSourceComposites | 2 / 16 / 28 / 40 | 0 / 17 / 28 / 40 |
| groundSourceReuses | 300 / 335 / 338 / 338 | 310 / 340 / 340 / 340 |
| receiverSamples | 297 / 300 / 308 / 308 | 296 / 303 / 308 / 308 |
| receiverCandidates | 859 / 896 / 916 / 916 | 855 / 896 / 916 / 916 |
| receiverFullLoopCandidates | 97940 / 99900 / 102564 / 102564 | 97569 / 99900 / 102564 / 102564 |
| saveCalls | 545 / 564 / 577 / 579 | 548 / 574 / 575 / 577 |
| restoreCalls | 545 / 564 / 577 / 579 | 548 / 574 / 575 / 577 |
| saveRestorePairs | 545 / 564 / 577 / 579 | 548 / 574 / 575 / 577 |
| surfaceAllocations | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 21 |

Ten complete Canvas boards are **byte-exact** against A-12 (also exact against A-13 by its transitive comparison), including every HUD pixel. `goldens/comparison.json` records zero changed channels on each board. Lighting, celestial, world and1× pond boards were visually inspected at this checkpoint. No original artwork, world readback or surface-allocation path was added. Full `npm run check` and18 minute-long functional cliff movement reviews are running on the plain candidate, with the private clear-weather override removed. These functional timings overlap the full gate and are not performance samples.

| Device / gate | Status |
|---|---|
| Desktop cliff approach/departure | All nine after runs: zero≥50ms long tasks; rebuild maxima6.9–7.4ms; shorter drawing spikes and unreproduced complete halt remain explicit |
| Desktop A1 cliff/carried light | Merge p950.900001526ms meets1.5ms; whole p9510.899999619ms has the per-stage residual above |
| Desktop pond | Separate sparse-view evidence and all stages above; original workload issues preserved |
| iPad | **owner to run** |

Owner iPad steps: on the candidate use System → Developer → Render → **Run protocol + copy JSON**, first on cliff/carried-light then pond; record device, OS, browser, DPR, browser zoom, resolution, commit, world scale and backend; repeat the required modes/scales. The button captures the existing pinned protocol. The supplementary larger approach trace is output-only and is not silently substituted for that protocol on the device. No CPU throttling substitutes for iPad. A-16→A-14→A-15→A-17→release preparation still follows. No deployment.

Cliff correction full gate: `npm run check` **PASS**,638 files/3642 tests,925.416284800 seconds total (Vitest875.90s, tests718.36s). Type checks, lint, world lifecycle integrity/build and validation of1021 art assets/3 songs/10 SFX pass. Unchanged coverage thresholds pass; the world-readback grep test is included. Every runtime/test hash still matches `check-source-files.json`. Fifteen of18 minute-long screenshots have been opened and inspected at this checkpoint; the remaining Native fallback reviews and final cleanup precede the boundary commit.

Cliff correction final review: all18 minute-long scale/mode/backend-request runs completed, remain connected and have210–518 moving100ms samples. Every screenshot, both pond views and the Video footer was opened and inspected; caps, shadow silhouettes, actor cutaways and HUD remain intact. Requested WebGL encounters exactly `webgl_unsupported_clip_path` in all nine cases and renders through Canvas. The Video footer visibly reads **CANVAS: UNSUPPORTED CLIP PATH**. This is an unresolved A-15/A-17 gate, not GPU parity.

Six settled Basic/Classic/Dynamic cycles pass: Basic retains0 lighting bytes, Basic/Classic retain0 omit-page bytes, Dynamic reaches ready. All36 original atlas PNGs and323 generated files remain byte-identical in integration and private candidates. Ten Canvas boards are exact. Final state is Canvas1× Basic, experimental preference off, with the session fallback reason retained diagnostically. Evidence: `visual-inspection.json`, `visual-replay/results.json`, `pond-review.json`, `video-footer.json`, `mode-cycles.json`, `original-atlases.json`, `generated-pages.json`, `after-review.json`.

**This bounded cliff correction is complete**: retain identical caster cohorts and reuse exact static-mask area samples, with925.416284800-second green full gate and unchanged checked source hashes. The larger route reproduces hitches and shows materially lower rebuild peaks; it has not reproduced or proved elimination of the owner's complete halt. Remaining drawing spikes, the A1 whole-frame residual and experimental backend guards are recorded above. No third failed implementation approach or new OPEN is needed; both exact corrections are useful and verified. A-16 is next under the binding order. No deployment.

Cliff boundary file/command inventory: `packages/client/src/gameplay-celestial-pass.ts`, its test, new `static-caster-cohort.ts`/test; `packages/engine/src/receiver-coverage.ts`, `receiver-lighting.ts`, `receiver-static-coverage.ts`, new `receiver-static-mask-samples.ts`/test; roadmap, this ledger and DECISIONS. No main-file edit. New runtime modules are43 and76 lines. Commands include focused `npx vitest run` on the caster/cohort, coverage and receiver-damage suites (5 files/18 tests), the final3-test silhouette replay, client typecheck, `npm run check`, output-only `prepare-candidate.py`, `run-candidate.py`/`resume-after.py`, `capture.py`, `report.py`, `fresh-client.py`, `run-a1.py`, both A1 report routes, `prepare-plain.py`, `node goldens/build.mjs`, `node goldens/run.mjs`, `npx tsx goldens/compare.ts`, `visual-replay.py`, `mode-cycles.py`, `verify-assets.py`, `pond-review.py` and `video-footer.py`. Logs and source hashes reside under the same cliff-stall artifact directory. Desktop device: AMD Ryzen9 9955HX/Linux6.17.2-1-pve/Chrome152 headless,1280×720,DPR1,browser zoom1/world zoom2,Canvas,1×/2×/Native as labelled,cap off,no throttling. Samples label base commit a0136a17 plus exact source manifests; the boundary commit is recorded separately in the artifact directory.

### A-16 CPU dimming and hit-flash variants — claim, 2026-09-08

IN PROGRESS: codex, 2026-09-08, after checked cliff correction **8ffdef5c**. Apply §8.1: CPU effect variants may differ by at most two steps on opaque pixels and eight on translucent pixels; normal artwork and the HUD retain their exact gates. Requalify the preserved immutable-source floating reconstruction under this settled gate, including the256-alpha stress fixture, rather than reading mutable world/tint canvases. Effects follow receiver tint and retain the original scope/opacity order. WebGL submits these CPU pages as textures, with no shader brightness or saturation.

First extract the owned homestead preview and monolithic artwork drawing into new modules in one mechanical no-logic-change commit. Then implement bounded variant-page reuse, explicit disposal and filter-free world drawing. The matching DECISIONS row names the minimal client, asset-presentation, receiver-source, WebGL and immutable-source readback-test integration scope. Delete replaced filter code/tests in the implementation change; new modules stay below400 lines. Verify source alpha classes separately, original/omit art, exact normal fixtures, mode cleanup, page bounds, source mutation/upload/disposal and failure restoration. Repeat both pinned routes with all stages/counters and Playwright movement screenshots under `output/perf-59-20260908/P5/A16/`; iPad and hardware GPU remain **owner to run**. The claim is documentation only and reuses the unchanged638-file/3642-test green runtime gate. A-14 → A-15 → A-17 → release request follow. No deployment.

### A-16 mechanical extraction checkpoint — 2026-09-08

Moved anchored/rogue sprite drawing and the homestead build-grid body into `world-anchored-draw.ts` (152 lines) and `gameplay-homestead-build-grid.ts` (107 lines). The existing main function forwards positional dependencies; the public artwork API remains intact. This commit changes module ownership only; existing filters remain for the subsequent implementation. The exact immutable stone-source reader exception moved with its function. Files: those two new modules, `overworld-art.ts`, `overworld-main.ts`, `world-readback.test.ts`, and this ledger.

`npm run check` passes **638 files / 3642 tests**, **920.989067554 seconds**; checked source SHA-256s are unchanged. Client typecheck/build and all ten Canvas fixture comparisons pass with **zero changed channels**, including the HUD. Commands: `python3 extraction/run-extraction.py`, its detached `run-check.py`, private client build/connect, and the existing golden build/run/compare drivers. Evidence: `output/perf-59-20260908/P5/A16/extraction/{check.log,check.exit,check-duration.json,check-source-files.json,mechanical-move.json,goldens/comparison.json}`. This ownership-only checkpoint reuses the original cliff/A1 timings and per-frame counters immediately above; it makes no performance claim or A-16 exit claim. iPad: **owner to run** with the same diagnostics button and metadata steps. No deployment.

A-16 implementation budget (under qualification): retain the existing4 MiB tint page and add a lazily allocated CPU effect workspace, bounded to12 MiB (4 MiB immutable-source pixel FIFO,4 MiB fixed original-only reader,4 MiB reusable upload ImageData). White art effects outside receiver lighting use a separate16 MiB maximum cache. Combined maximum32 MiB; normal tint-only operation keeps the old4 MiB behavior. This explicit28 MiB worst-case extension is recorded in DECISIONS in the same change. Presentation changes and backend disposal clear the white cache; Dynamic renderer reset clears the receiver workspace. Diagnostics expose white art bytes separately and include every omit-derived byte in retained lighting bytes. Basic must still retain0 lighting/omit bytes. No mutable receiver/world surfaces are read. Existing producers apply effects after a single upright receiver RGB; flat field/cap producers have no effect scope. The former runtime baked-shadow filtered-frame machinery remains deleted.

A-16 implementation qualification checkpoint: the production CPU cache passes432 dim/enemy-hit/wildlife-hit cases across12 original/omit/alpha-stress inputs, four receiver RGBs and three parent alpha values;864 cases additionally exercise emissive source-over restoration;288 cases exercise both placement effects at actual parent opacity1/.62/.42. Maximum opaque difference2 steps, translucent4 for dim/hit and3 for placement, HUD0. The production default-gated WebGL receiver/effect path passes240 cases with Canvas-copy presentation: CPU-to-GPU maximum1, old native-filter-to-GPU opaque2/translucent4, HUD0, no fallback. GPU evidence is headless functional qualification only; hardware GPU remains owner to run. No brightness/saturation shader was added.

Evidence: `output/perf-59-20260908/P5/A16/runtime-qualification/` contains the bundled production imports, CPU comparison JSON, `gpu-comparison.json` and five native/CPU/GPU screenshot strips. Source-alpha classification uses intrinsic original artwork alpha before effect opacity. Screenshots are decoded outside the runtime; no world/GPU readback is added. The immutable source reader is the single exact new grep-test exception. The five focused suites pass30 tests, including600 warm repetitions, decoded-source FIFO eviction, page reuse, nested/throwing scope restoration, cohort cleanup and mutable GPU page upload ordering. Initial focused failure was a missing `setTransform` in the new mock, corrected without changing behavior.

Preserved harness diagnostics: the repository RGBA-only importer rejected RGB Playwright screenshots; requesting transparency still produced RGB. An output-only RGB/RGBA decoder then succeeded. The first decoded GPU board exposed CSS flex stretching of the canvases; fixed512×136 CSS/backing sizes and asserted element rectangles removed that harness mismatch. These failures and their original outputs remain under `gpu-harness-*`; they are not renderer timing or parity results. The CPU effect algorithm qualified on its first implementation approach. Ten full-scene Canvas boards remain byte-exact. The full check and18 minute-long functional route reviews are still in progress; no A-16 exit or deployment is claimed.

Counter interpretation: the shared page pool's existing `tintBuilds`/`tintReuses` counters include CPU art effects; white Basic art effects are not celestial/lightmap work. `artEffects.bytes` reports their original-art storage, `artEffects.omitBytes` reports the subset retained from Dynamic, and the latter is included in lighting retention. Mutable CPU pages currently use the established safe per-draw GPU refresh path; stable-page GPU upload reuse is not claimed by this checkpoint.

A-16 native-browser warm-cache proof: `runtime-qualification/warm.json` draws20 receiver/effect combinations for600 active-rAF frames with the native Canvas probe. Cold preparation:20 builds,2 surfaces,2 ImageData allocations,12,588,032 retained bytes. Every warm frame:20 reuses,1 distinct source,0 builds,0 surface allocations,0 ImageData allocations,0 filtered-frame builds and0 save/restore pairs. Reset:0 bytes/0 surfaces. These are functional allocation counters captured during repository checks, not gameplay timings.

A-16 full gate: `npm run check` **PASS,639 files/3650 tests,941.297210932 seconds**. Lifecycle integrity/build, workspace typechecks, lint, unchanged coverage thresholds and asset validation pass. Runtime/test hashes remain identical to `check-source-files.json`; every new module is below400 lines. A direct source scan finds no remaining `context`/`ctx` filter access or any `.filter =` assignment in non-review/non-test engine/client runtime. Sixteen of18 movement screenshots have been opened and inspected at this checkpoint. Both pinned-route measurements follow the complete functional review, with builds/tests stopped. No deployment.

### A-16 final measured checkpoint — 2026-09-08

CPU dim/hit/placement pages replace every gameplay world filter. The shared receiver page includes effect identity and reconstructs post-receiver pixels from immutable art; nested effects replace enclosing effects and restore on exceptions. WebGL consumes the CPU page with white receiver RGB, preventing double tint; its explicit sprite seam also consumes `canvasSource` for effects. Existing mutable-page refresh and all unrelated accuracy guards remain. The new pixel, immutable-source workspace and effect-scope modules are50,65 and21 lines; the new test is92 lines. `world-anchored-draw.ts` and the homestead body were extracted first in **fd684009**, with the separate checked mechanical ledger above.

Files/commands: `implementation-files.json` lists the exact runtime/test/doc scope. Changed runtime includes `receiver-frame-source.ts`, `world-asset-presentation.ts`, `world-anchored-draw.ts`, `lighting-quality.ts`, Canvas/WebGL backend disposal/submission, `gameplay-painter-effects.ts`, extracted `gameplay-homestead-build-grid.ts`, and `gameplay-diagnostic-snapshot.ts`; new `world-frame-effect.ts`, `world-effect-pixels.ts`, `world-effect-source-pixels.ts` and scope/cache tests. Existing mutable-source and readback tests are extended. Main is unchanged after extraction. Commands: focused `npx vitest run` (5 files/30 tests), client typecheck, targeted ESLint, full `npm run check`, private `npm run build -w @orchard/client -- --mode client-production`, output-only production CPU/WebGL build/comparison and warm-cache scripts, `run-validation.py` (goldens,18 movement reviews,6 mode cycles, pond/footer, asset hashes), and `run-measurement.py` (fresh before/after builds and12 mode/route captures plus the larger cliff route). No builds, tests or profiling overlap qualified captures.

Desktop: AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152 headless,1280×720,DPR1,browser zoom1/world zoom2,Canvas1×,cap off,no throttling. Both candidates explicitly reload to the same768×432 reserved backing (230400 active world pixels). Baseline is **fd684009** before effect implementation; candidate has the checked source hashes in `after-source-files.json`. Private clear weather/tick0/north override is identical and never committed. Sample metadata records the base hash and source manifest; the boundary hash is recorded separately. All before/after seed,season,content,viewport,DPR,zoom,backing and render-item comparisons pass on both routes. Preserve the original `no_pond` cliff witness and sparse pond's actor/carried-light/caster/invalid-frame evidence flags; A-18 permits separate routes, not a claim that the pond is populated A1.

Pinned cliff/carried light: Basic/Classic/Dynamic whole-frame p95 **7.100000381/8/11.299999237 → 6.700000763/9.699998856/11.399999619 ms**. Dynamic merge p50/p95/p99 **0.600000381/0.900001526/1.899999619 → 0.600000381/0.900003433/1.900001526 ms**; maximum6.399999619→6.400001526. Both candidates have zero≥50ms tasks. The A-11/A-12 merge target stays met. Dynamic whole-frame has a1.399999619ms residual over10ms: painterDraw p955.799999238→5.899999619, painterBuild1.5→1.399999619, finalWorldComposite2.299999238→2.300001144, UI model/layout/draw about0.4/0.5/0.7. These nested percentile intervals are not additive; no unmeasured causal attribution or whole-frame pass is claimed. **Basic6.3ms remains accepted as met under A-11's owner amendment**; fresh sample numbers are retained rather than substituted with that accepted baseline. No additional general-speed claim is made for this effect-removal step.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.5 / 7.1 / 8.400002 | 6.299999 / 8 / 10.199999 | 8.199999 / 11.299999 / 15.199999 | 5.300001 / 6.700001 / 8.599998 | 6.6 / 9.699999 / 11.6 | 8.200001 / 11.4 / 16.099998 |
| snapshotPrepare | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.4 / 0.599998 / 0.700001 | 0.300001 / 0.5 / 0.6 |
| painterBuild | 1 / 1.5 / 1.799999 | 1 / 1.5 / 1.9 | 1 / 1.5 / 1.799999 | 0.900002 / 1.400002 / 1.699999 | 1 / 1.700001 / 2 | 1 / 1.4 / 1.700001 |
| painterSort | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.300001 |
| painterDraw | 1.700001 / 2.200001 / 2.699999 | 1.700001 / 2.299999 / 2.900002 | 4 / 5.799999 / 10.4 | 1.6 / 2.199999 / 2.6 | 1.799999 / 2.6 / 3.299999 | 4 / 5.9 / 11.1 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.1 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.4 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.1 / 0.199999 / 0.200001 | 0.6 / 0.900002 / 1.9 | 0 / 0 / 0 | 0.1 / 0.200001 / 0.200001 | 0.6 / 0.900003 / 1.900002 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.800001 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.800003 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.1 / 1.300001 / 1.699999 | 1.700001 / 2 / 2.4 | 1 / 2.299999 / 2.6 | 1.099998 / 1.300001 / 1.6 | 1.799999 / 2.799999 / 3 | 1 / 2.300001 / 2.599998 |
| uiModel | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.699999 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.6 / 0.700001 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.699999 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.799999 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 0.900002 | 0.4 / 0.700001 / 0.9 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.700001 / 1 | 0.4 / 0.700001 / 1.099998 | 0.4 / 0.699999 / 0.9 |
| fixedUpdate | 0.199999 / 0.300001 / 0.5 | 0.199999 / 0.300001 / 0.5 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 878 / 1207 / 1211 | 883 / 942 / 951 | 897 / 982 / 1030 | 879 / 1209 / 1220 | 878 / 891 / 897 | 898 / 982 / 1032 |
| distinctDrawImageSources | 34 / 35 / 35 | 35 / 37 / 38 | 347 / 356 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 307 / 325 / 326 | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 325 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 553 / 567 / 569 | 555 / 567 / 570 | 554 / 566 / 572 | 555 / 568 / 570 | 554 / 566 / 569 | 554 / 566 / 572 |
| restoreCalls | 553 / 567 / 569 | 555 / 567 / 570 | 554 / 566 / 572 | 555 / 568 / 570 | 554 / 566 / 569 | 554 / 566 / 572 |
| saveRestorePairs | 553 / 567 / 569 | 555 / 567 / 570 | 554 / 566 / 572 | 555 / 568 / 570 | 554 / 566 / 569 | 554 / 566 / 572 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 102679590 | 0 | 161280 | 102679590 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |

Separate pond route, with the original sparse-view qualification flags retained:

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 4.099998 / 5.4 / 6.599998 | 5.200001 / 6.5 / 7.9 | 5.4 / 7.200001 / 8.299999 | 3.799999 / 4.799999 / 5.699999 | 5.200001 / 6.6 / 7.799999 | 5.199999 / 6.9 / 7.9 |
| snapshotPrepare | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.4 / 0.599998 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 |
| painterBuild | 1 / 1.4 / 1.700001 | 0.900002 / 1.4 / 1.700001 | 0.9 / 1.4 / 1.599998 | 0.9 / 1.300001 / 1.5 | 1 / 1.4 / 1.699999 | 0.9 / 1.300001 / 1.6 |
| painterSort | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.6 / 0.800001 / 1 | 0.6 / 0.799999 / 1 | 1.200001 / 2.199999 / 2.700001 | 0.599998 / 0.700001 / 0.9 | 0.599998 / 0.799999 / 1 | 1.199999 / 2.1 / 2.5 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.299999 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.900002 / 1.4 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.9 / 1.300003 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.499996 / 0.599998 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.500002 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.800001 / 1.1 / 1.299999 | 2 / 2.4 / 2.9 | 1.299999 / 1.5 / 1.799999 | 0.799999 / 1 / 1.1 | 2 / 2.4 / 2.800001 | 1.200001 / 1.5 / 1.700001 |
| uiModel | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 |
| uiLayout | 0.400002 / 0.6 / 0.799999 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.5 / 0.699999 | 0.300001 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.5 |
| uiDraw | 0.4 / 0.699999 / 0.9 | 0.4 / 0.699999 / 0.800001 | 0.300001 / 0.6 / 0.800001 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.699999 / 0.9 | 0.300001 / 0.6 / 0.800001 |
| fixedUpdate | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.1 / 0.299999 / 0.300001 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 715 | 693 / 708 / 716 | 695 / 754 / 772 | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 96640430 | 0 | 164864 | 96640430 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |

Supplementary cliff approach/departure follows the same ordinary keyboard route with actor-follow camera and a fixed17:00 sky. Earlier exact cliff correction versus A-16: whole p50/p95/p99/max **7.700001/13.199999/16.600000/34 → 8.400000/14.699999/17.5/30.100000 ms**; merge **0.299999/2.199999/2.5/6.899998 → 0.500002/2.299999/2.700001/7.500002 ms**. Both have zero≥50ms tasks and identical768×432 backing. Camera range remains approximately7213..7457 ×6083..6114, but collision-dependent trajectories and streamed content vary; this is supplementary evidence, not a perfectly matched static A1 capture. The streaming identity flag and `no_pond` remain. Surface allocations have p99=0 but max21 during new chunk preparation, and ImageData max2; these are not reported as zero-allocation streaming. Steady pinned A1 has zero surface allocations in every captured mode/frame, while Dynamic/Classic ImageData allocations reach2 on rebuilds.

| Stage ms / per-frame counter | Earlier cliff correction p50 / p95 / p99 / max | A-16 p50 / p95 / p99 / max |
|---|---|---|
| whole frame | 7.700001 / 13.199999 / 16.6 / 34 | 8.4 / 14.699999 / 17.5 / 30.1 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 0.300001 | 0 / 0.1 / 0.1 / 0.300001 |
| ground | 0.299999 / 0.400002 / 0.5 / 6 | 0.300001 / 0.5 / 0.6 / 0.900002 |
| painterBuild | 1 / 1.5 / 1.800001 / 4.799999 | 1.099998 / 1.5 / 1.800001 / 5.799999 |
| painterSort | 0.200001 / 0.300001 / 0.300001 / 2.300001 | 0.199999 / 0.300001 / 0.300001 / 3.799999 |
| painterDraw | 3.5 / 8.6 / 11.799999 / 28 | 3.900002 / 9.9 / 12.1 / 22.800001 |
| weather | 0 / 0.1 / 0.1 / 0.200001 | 0 / 0.1 / 0.1 / 0.700001 |
| lightingBoundsResize | 0 / 0.099998 / 0.1 / 0.300001 | 0 / 0 / 0.1 / 0.300001 |
| lightingOcclusionRaster | 0 / 0.199999 / 0.299999 / 0.4 | 0 / 0.199999 / 0.300001 / 0.400002 |
| lightingSolve | 0 / 0.200001 / 0.200001 / 0.5 | 0.1 / 0.200001 / 0.200001 / 1.900002 |
| lightingMerge | 0.299999 / 2.199999 / 2.5 / 6.899998 | 0.500002 / 2.299999 / 2.700001 / 7.500002 |
| lightingUpload | 0 / 0.200001 / 0.300001 / 1.200001 | 0 / 0.200001 / 0.299999 / 0.6 |
| lightingReceiver | 0.399998 / 0.699999 / 0.800003 / 2.5 | 0.4 / 0.700003 / 0.900002 / 3.800001 |
| lightingComposite | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1.099998 / 2.5 / 2.799999 / 6.200001 | 1.1 / 2.4 / 2.6 / 8.1 |
| uiModel | 0.299999 / 0.4 / 0.5 / 0.6 | 0.299999 / 0.5 / 0.5 / 0.800001 |
| uiLayout | 0.4 / 0.5 / 0.6 / 1 | 0.4 / 0.5 / 0.6 / 5.5 |
| uiDraw | 0.4 / 0.6 / 0.800001 / 2 | 0.4 / 0.699999 / 0.9 / 1.4 |
| fixedUpdate | 0.199999 / 0.300001 / 0.4 / 6.199999 | 0.199999 / 0.299999 / 0.400002 / 7.6 |
| catchUp | 0 / 0 / 0 / 0.299999 | 0 / 0 / 0 / 0.400002 |
| drawImageCalls | 916 / 993 / 1072 / 1145 | 882 / 954 / 1021 / 1091 |
| distinctDrawImageSources | 341 / 362 / 364 / 365 | 339 / 361 / 362 / 363 |
| tintBuilds | 0 / 3 / 8 / 23 | 0 / 7 / 8 / 22 |
| tintReuses | 84 / 90 / 90 / 93 | 83 / 90 / 90 / 90 |
| tintSurfaceReuses | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 4 | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 / 4 | 0 / 0 / 0 / 4 |
| groundSourceOperations | 6 / 114 / 174 / 204 | 15 / 114 / 159 / 177 |
| imageDataAllocations | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 |
| capRunRequests | 96 / 104 / 108 / 108 | 96 / 104 / 108 / 108 |
| flatSourceRequests | 220 / 236 / 236 / 236 | 220 / 236 / 236 / 236 |
| capRunComposites | 2 / 15 / 20 / 35 | 3 / 19 / 27 / 35 |
| flatSourceComposites | 0 / 18 / 39 / 40 | 0 / 17 / 30 / 40 |
| groundSourceReuses | 316 / 340 / 340 / 340 | 310 / 340 / 340 / 340 |
| receiverSamples | 296 / 303 / 303 / 308 | 296 / 303 / 308 / 308 |
| receiverCandidates | 842 / 870 / 898 / 916 | 855 / 896 / 916 / 916 |
| receiverFullLoopCandidates | 97680 / 99990 / 99990 / 102564 | 98010 / 99990 / 102564 / 102564 |
| saveCalls | 549 / 575 / 575 / 582 | 548 / 574 / 575 / 577 |
| restoreCalls | 549 / 575 / 575 / 582 | 548 / 574 / 575 / 577 |
| saveRestorePairs | 549 / 575 / 575 / 582 | 548 / 574 / 575 / 577 |
| surfaceAllocations | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 21 |

Final evidence:639 files/3650 tests pass in941.297210932s; all checked runtime/test hashes remain unchanged. All10 full Canvas boards are byte-exact, HUD included. All18 minute-long reviews remain connected with205–526 moving100ms samples; every screenshot, both pond views and Video footer was opened and inspected. Every requested WebGL gameplay run encounters exactly `{webgl_unsupported_clip_path}` and visibly falls back; footer says **CANVAS: UNSUPPORTED CLIP PATH**. The isolated240-case GPU effect gate has no fallback, but this does not clear A-15/A-17. Six mode cycles retain0 Basic lighting bytes,0 Basic/Classic omit bytes, and every Dynamic cohort reaches ready. All36 original atlas PNGs and323 generated files are unchanged in both integration/private builds. Maximum decoded asset page is4194304 bytes. Filtered-frame builds remain0. `artEffects` is0 bytes on the pinned workload (no active dim/hit/placement effect); the isolated600-frame native proof exercises the actual effect cache and proves zero warm allocations plus full disposal. Source hashes, raw counters, original timings and screenshots live under `output/perf-59-20260908/P5/A16/`. The private weather override is removed and the checked plain candidate rebuilt/reconnected.

| Device / gate | Result |
|---|---|
| Desktop A-16 CPU effects / GPU page submission | PASS under amended2 opaque /8 translucent limits; HUD exact |
| Desktop A1 Dynamic merge | p950.900003433ms, meets1.5ms |
| Desktop whole-frame / cliff stalls | Whole p9511.399999619ms residual recorded; expanded-route maximum30.100000381ms, no≥50ms tasks; owner's complete halt still unreproduced |
| iPad | **owner to run** |
| Hardware GPU | **owner to run**; headless functional evidence only |

Owner iPad steps: on this candidate open System → Developer → Render → **Run protocol + copy JSON**, first on cliff/carried-light then pond; retain both JSON captures. Record device,OS,browser,DPR,browser zoom,resolution,commit,world scale and backend; repeat required lighting modes/scales. No CPU-throttled substitute. **A-16 complete** under its amended effect gate; A-14 sampling → A-15 cutaways → A-17 fallback accounting → A-19 release request follow. Remaining whole-frame/drawing spikes and the unreproduced complete halt are explicit. No deployment.

### A-14 sampling and per-producer world counters — claim,2026-09-08

IN PROGRESS: codex,2026-09-08, after **283d3067** (A-16). Apply the binding §8.1 gate: integer-ratio draws are exact through integer texel arithmetic, while noninteger nearest draws qualify by source-index displacement≤1 on the coordinate-coded probe. Preserve Canvas output and existing guards until their tested domain passes. First replay the preserved cropped-page sweep with explicit integer source/destination mapping; expand through flips, quarter turns and actual producer ratios. Record per-producer noninteger world draws on both A1 routes, excluding HUD and CPU source construction. Do not silently make a producer integer-ratio if Canvas pixels change.

Scope: existing WebGL geometry/shader/submission and world-pass/asset/ground submission seams, bounded new sampling/diagnostic modules and tests, and the opt-in Canvas protocol probe/report plumbing required for the owner-requested counters. Any main/renderer monolith logic first follows the mechanical extraction rule. No new dependency, world readback, color-rounding change, default backend change or deployment. Reuse the unchanged639-file/3650-test full gate for this docs-only claim; implementation exit still requires full check, goldens, both route tables/counters and movement screenshots. Keep iPad **owner to run** with the existing diagnostics capture steps. A-15→A-17→A-19 follows.

A-14 mechanical extraction checkpoint: `renderer.ts` reexports the unchanged queue drawing functions from new32-line `world-depth-draw.ts`. The moved block hash and source manifests are under `output/perf-59-20260908/P8/A14/extraction/`. Commands: `python3 extraction/run-check.py` (`npm run check`), `node extraction/goldens/build.mjs`, `node extraction/goldens/run.mjs`, `npx tsx extraction/goldens/compare.ts`. Full639 files/3650 tests pass in944.885931253s; all10 Canvas boards are byte-exact, HUD included, and the world board was opened. No new performance claim for the mechanical move; original22-stage/per-frame-counter tables remain the preceding A-16 section until the instrumented candidate capture. iPad **owner to run** using the same System → Developer → Render → Run protocol + copy JSON steps on both pinned routes. No sampler logic or deployment in this checkpoint.

A-14 sampling **OPEN**, third approach stopped under docs15§9. Original lower-neighbor/crop-relative approaches failed24/120 and22/120 respectively (`output/perf-59-20260907/P8/sampling-results.md`). The explicit integer quotient prototype passes120 cropped cases and576 quarter-pixel/rotation/flip cases. A further720 cases at phases1/8,1/3,0.49999,0.50001,7/8 fail30 integer-exact cases and8 noninteger cases; maximum source shift1 on either axis, maximum37 differing coverage pixels in one case. Integer draws must be exact and the noninteger texel-shift rule does not waive geometry coverage. Source/probe/device manifests, all failures and screenshots are under `output/perf-59-20260908/P8/A14/`; `sampling-status.md` gives commands and limits. No production shader/geometry or guard changed. This is functional accuracy evidence, not a new timing sample. Full639-file/3650-test gate from bc80481f remains green; iPad/hardware GPU **owner to run**. Independent producer instrumentation continues before closing this step; Canvas cliff gains and A-19 preparation do not depend on this sampler.

### A-14 producer instrumentation exit — 2026-09-08

The independent counter work is complete; integer sampler remains **OPEN** under the three-strike entry above. Production sampling guards are unchanged. Files: `gameplay-render-protocol.ts`, `render-canvas-probe.ts`, new client `render-protocol-world-sampling.ts` and `world-sampling-canvas-probe.ts`; engine `ground-cache.ts`, `world-depth-draw.ts`, `world-pass-canvas.ts`, `webgl/world-pass-webgl.ts`, new `world-sampling-producers.ts`; UI `index.ts`, `render-operation-counters.ts`, new `world-sampling-counters.ts`, their tests and the reviewed phase-zero checksum. The preceding mechanical extraction owns the renderer reexport. Exact source hashes: `output/perf-59-20260908/P8/A14/check-source-files.json`.

Only opt-in diagnostics count world submissions. Native transform tracking uses reusable storage; producer scopes restore in `finally`, and HUD/presentation/source construction are excluded. The explicit `direct-world` remainder prevents silent omissions. GPU submission counts run before fallback guards. A bounded64-producer/16384-frame buffer retains20,971,520 diagnostic bytes only during a capture; registry overflow invalidates the result. Twelve native transform probes preserve every pixel and exclude HUD; nine new tests cover ratios, transforms, scope restoration and bounds.

Commands/artifacts under that directory: `python3 run-validation.py`, `python3 run-check.py`, `python3 run-measurement.py`, `python3 post-review.py`, `python3 sampling-report.py`; these invoke `npm run check`, private production builds, Playwright functional probes, ten-board comparisons,18 minute-long movement replays, both5s/30s protocols, six mode cycles and asset checks. The first full check had641 passing files/3658 passing tests and one structural checksum failure in942.350251197s: the new UI counter export changed the aggregate seam hash. The other four seam inputs were unchanged; the reviewed checksum was updated, without removing any behavioral assertion. Focused six seam tests passed; the full rerun passes **642 files/3659 tests in939.329070330s**. Runtime hashes stayed unchanged throughout. First failure and corrected evidence are retained separately.

Desktop Linux6.17.2-1-pve/x86_64, HeadlessChrome152,1280×720,DPR1,browser zoom100%,world zoom2,Canvas1×,768×432 backing,capoff,no CPU throttling. Every raw capture carries device/settings/content/commit metadata. Before baseline7c6164b3 and after candidate use source manifests because the same injected base commit label identifies the private build. Weather is identically pinned clear for these comparisons, then restored. **Every before/after pair reports different_contentRevision**; therefore these are original observed timings, not an isolated performance-gain or probe-overhead claim. The pond retains legacy player/carried-light/static-density/walking flags and is separate A-18 route evidence, not a populated A1 substitute. Cliff retains its explicit no_pond flag.

Basic/Classic/Dynamic whole p95: **6.5/8.799999237/13 →8.100000381/7.799999237/11.399999619ms**. Basic6.3ms remains accepted as met by owner amendment; the fresh8.1ms is not substituted for it. Dynamic merge **0.600002289/1.000001907/2.200000763 →0.600000381/0.999996185/2.099996567ms**, below1.5ms p95. Whole-frame residual1.4ms remains; after Dynamic painterDraw p956.1ms,painterBuild1.5ms,finalWorldComposite2.4ms are material contributors (nested stages are not additive). All12 captures have zero≥50ms tasks. Pinned surface allocations and filtered-frame builds are0 in every frame; Basic ImageData0,Classic/Dynamic ImageData maximum2 during rebuilds. Six transition cycles retain Basic lighting0 and Basic/Classic omit0; Classic's approved legacy lightmap remains. All36 original PNGs and323 generated files are unchanged in both roots; largest decoded page4194304 bytes.

Cliff and pond full22-stage/per-frame tables follow; machine originals and comparison flags are in `a1/*-comparison.json` and raw captures.

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.4 / 6.5 / 7.4 | 6.4 / 8.799999 / 10 | 8.5 / 13 / 16.900002 | 6.1 / 8.1 / 9.4 | 6.700001 / 7.799999 / 8.800001 | 8.799999 / 11.4 / 16.1 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.300001 / 0.5 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| painterBuild | 0.900002 / 1.4 / 1.6 | 1 / 1.6 / 1.799999 | 1 / 1.6 / 1.9 | 1.099998 / 1.699999 / 1.900002 | 1 / 1.400002 / 1.6 | 1 / 1.5 / 1.700001 |
| painterSort | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.300001 |
| painterDraw | 1.699999 / 2.099998 / 2.400002 | 1.700001 / 2.300001 / 2.700001 | 4.200001 / 6.6 / 11.5 | 2 / 2.6 / 3 | 2 / 2.4 / 2.9 | 4.400002 / 6.1 / 11.400002 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0.099998 / 0.199999 | 0 / 0.1 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.1 / 0.200001 / 0.200001 | 0.600002 / 1.000002 / 2.200001 | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 0.6 / 0.999996 / 2.099997 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700003 / 0.900002 | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.9 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.1 / 1.299999 / 1.5 | 1.799999 / 2.6 / 2.800001 | 1.099998 / 2.5 / 3.200001 | 1.199999 / 1.6 / 1.9 | 1.700001 / 2 / 2.299999 | 1 / 2.4 / 2.699999 |
| uiModel | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.400002 / 0.6 / 0.700001 | 0.4 / 0.599998 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 0.900002 | 0.4 / 0.699999 / 0.9 | 0.4 / 0.700001 / 0.9 | 0.400002 / 0.799999 / 1 | 0.4 / 0.700001 / 0.9 | 0.4 / 0.700001 / 0.9 |
| fixedUpdate | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.200001 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 877 / 1184 / 1211 | 878 / 891 / 899 | 897 / 984 / 1032 | 879 / 1209 / 1218 | 878 / 891 / 899 | 897 / 982 / 1030 |
| distinctDrawImageSources | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 326 | 0 / 0 / 0 | 0 / 0 / 0 | 307 / 325 / 326 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 553 / 565 / 568 | 554 / 566 / 569 | 554 / 566 / 572 | 554 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| restoreCalls | 553 / 565 / 568 | 554 / 566 / 569 | 554 / 566 / 572 | 554 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| saveRestorePairs | 553 / 565 / 568 | 554 / 566 / 569 | 554 / 566 / 572 | 554 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1799 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 103164678 | 0 | 161280 | 103164678 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |


Pond route:

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 3.799999 / 4.700001 / 5.4 | 5.4 / 7.6 / 8.4 | 5.300001 / 7.200001 / 8.5 | 4.4 / 6.200001 / 6.800001 | 5.599998 / 6.5 / 7.700001 | 5.799999 / 7.6 / 8.699999 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 |
| ground | 0.4 / 0.599998 / 0.6 | 0.4 / 0.6 / 0.699999 | 0.4 / 0.6 / 0.699999 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| painterBuild | 0.800001 / 1.200001 / 1.400002 | 0.9 / 1.5 / 1.699999 | 0.9 / 1.299999 / 1.5 | 1 / 1.6 / 1.799999 | 1 / 1.4 / 1.6 | 1 / 1.4 / 1.6 |
| painterSort | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.599998 / 0.799999 / 0.9 | 0.6 / 0.800001 / 0.900002 | 1.200001 / 2.299999 / 2.700001 | 0.700001 / 1 / 1.1 | 0.700001 / 0.900002 / 1.1 | 1.400002 / 2.400002 / 2.9 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.999998 / 1.500002 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 1 / 1.400002 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.499998 / 0.6 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.6 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.799999 / 1 / 1.099998 | 2.1 / 3.099998 / 3.200001 | 1.299999 / 1.5 / 1.700001 | 0.9 / 1.199999 / 1.300001 | 2.099998 / 2.300001 / 2.9 | 1.300001 / 1.599998 / 1.9 |
| uiModel | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.5 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.5 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 |
| uiLayout | 0.300001 / 0.5 / 0.5 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.400002 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.599998 / 0.6 |
| uiDraw | 0.300001 / 0.6 / 0.800001 | 0.4 / 0.699999 / 0.9 | 0.300001 / 0.699999 / 0.9 | 0.4 / 0.700001 / 1 | 0.4 / 0.699999 / 0.9 | 0.4 / 0.700001 / 0.9 |
| fixedUpdate | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.400002 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 715 | 693 / 708 / 716 | 695 / 754 / 772 | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 96640430 | 0 | 164864 | 97004246 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |


Producer totals on1800 frames: cliff Basic1,225,718,Classic1,227,540,Dynamic1,227,570 world draws, with **zero noninteger draws in every producer**. Pond totals917,676/919,476/921,276; only Dynamic has1800 noninteger draws, all smoothed `direct-world`, nearest noninteger0. A supplementary metadata-only three-second probe (`flame-source-attribution.json`) identifies `compositeFlameGlows`: its64×64 source intentionally draws80×80 at identity transform. Changing that halo diameter would change Canvas output, so it stays unchanged. Primary producer labels remain as captured; this supplemental attribution is not retroactively relabeled. Full per-producer p50/p95/p99/original totals:

### A-14 per-producer world submissions

Numbers are per-frame p50 / p95 / p99, followed by the original30-second total. These counters exclude HUD, final presentation and CPU page construction. `direct-world` is the explicit remainder outside named painter, weather and ground-cache groups; it is never omitted. Ratios include the active linear transform. No producer geometry is changed merely to make its ratio integral.

#### cliff/carried-light / basic

| Producer | All draws | Noninteger draws | Nearest noninteger | Smoothed | Non-axis-aligned |
|---|---:|---:|---:|---:|---:|
| 0-surface | 102 / 104 / 104; total 180216 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| 0-terrain | 268 / 279 / 279; total 485102 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| decoration | 164 / 179 / 179; total 299124 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| direct-world | 38 / 39 / 39; total 67692 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| ground-cache | 12 / 12 / 12; total 21600 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| player | 7 / 7 / 7; total 12600 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| resource | 88 / 91 / 91; total 159384 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |

#### cliff/carried-light / classic

| Producer | All draws | Noninteger draws | Nearest noninteger | Smoothed | Non-axis-aligned |
|---|---:|---:|---:|---:|---:|
| 0-surface | 102 / 104 / 104; total 180232 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| 0-terrain | 270 / 279 / 279; total 485108 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| decoration | 164 / 179 / 179; total 299124 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| direct-world | 39 / 40 / 40; total 69492 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 1 / 1 / 1; total 1800 | 0 / 0 / 0; total 0 |
| ground-cache | 12 / 12 / 12; total 21600 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| player | 7 / 7 / 7; total 12600 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| resource | 88 / 91 / 91; total 159384 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |

#### cliff/carried-light / dynamic

| Producer | All draws | Noninteger draws | Nearest noninteger | Smoothed | Non-axis-aligned |
|---|---:|---:|---:|---:|---:|
| 0-surface | 102 / 104 / 104; total 180270 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| 0-terrain | 268 / 279 / 279; total 485100 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| decoration | 164 / 179 / 179; total 299124 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| direct-world | 39 / 40 / 40; total 69492 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 1 / 1 / 1; total 1800 | 0 / 0 / 0; total 0 |
| ground-cache | 12 / 12 / 12; total 21600 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| player | 7 / 7 / 7; total 12600 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| resource | 88 / 91 / 91; total 159384 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |

#### pond / basic

| Producer | All draws | Noninteger draws | Nearest noninteger | Smoothed | Non-axis-aligned |
|---|---:|---:|---:|---:|---:|
| 0-surface | 26 / 26 / 26; total 44256 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| 0-terrain | 210 / 216 / 216; total 375000 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| decoration | 137 / 141 / 141; total 246036 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| direct-world | 110 / 124 / 124; total 207264 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| ground-cache | 6 / 8 / 8; total 12432 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| live-map | 18 / 20 / 20; total 32688 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |

#### pond / classic

| Producer | All draws | Noninteger draws | Nearest noninteger | Smoothed | Non-axis-aligned |
|---|---:|---:|---:|---:|---:|
| 0-surface | 26 / 26 / 26; total 44256 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| 0-terrain | 210 / 216 / 216; total 375000 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| decoration | 137 / 141 / 141; total 246036 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| direct-world | 112 / 126 / 126; total 210864 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 2 / 2 / 2; total 3600 | 0 / 0 / 0; total 0 |
| ground-cache | 6 / 8 / 8; total 12432 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| live-map | 17 / 19 / 19; total 30888 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |

#### pond / dynamic

| Producer | All draws | Noninteger draws | Nearest noninteger | Smoothed | Non-axis-aligned |
|---|---:|---:|---:|---:|---:|
| 0-surface | 26 / 26 / 26; total 44256 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| 0-terrain | 210 / 216 / 216; total 375000 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| decoration | 137 / 141 / 141; total 246036 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| direct-world | 112 / 126 / 126; total 210864 | 1 / 1 / 1; total 1800 | 0 / 0 / 0; total 0 | 2 / 2 / 2; total 3600 | 0 / 0 / 0; total 0 |
| ground-cache | 6 / 8 / 8; total 12432 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |
| live-map | 18 / 20 / 20; total 32688 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 | 0 / 0 / 0; total 0 |


Supplementary ordinary cliff approach/departure (`after-cliff.json/png`) records53 minimum cap runs,324 static casters,one carried light,zero offscreen frames,892 moving frames and861.6865px travelled. Its legacy local_player_not_walking flag means fewer than50% moving frames (892/1800), not no movement; streamed content identity also changes and no_pond remains. Actor-follow camera and collision-dependent trajectory prevent a matched historical claim. Whole p50/p95/p99/max **8/12.700000763/16.5/23.799999237ms**, merge **0.100000381/2.199998856/2.400003433/7ms**. Zero≥50ms tasks; rAF interval p50/p95/p99/max16.7/16.7/16.8/16.8ms. Earlier pre-cliff-fix maximum frame gap33.4ms and post-fix33.3ms are preserved in `cliff-frame-delivery-history.json`, not presented as identical trajectories. The owner's complete halt remains unreproduced. Streaming surface allocations max14 (p990),ImageData max2; zero steady-state allocation does not mean zero chunk-preparation allocation.

| Stage ms / per-frame counter | A-14 p50 / p95 / p99 / max |
|---|---|
| whole frame | 8 / 12.700001 / 16.5 / 23.799999 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 0.200001 |
| ground | 0.299999 / 0.400002 / 0.5 / 1.799999 |
| painterBuild | 1.099998 / 1.5 / 1.799999 / 7.1 |
| painterSort | 0.199999 / 0.300001 / 0.300001 / 1.400002 |
| painterDraw | 3.700001 / 7.199999 / 11.6 / 20.299999 |
| weather | 0 / 0.1 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0.099998 / 0.1 / 0.299999 |
| lightingOcclusionRaster | 0 / 0.1 / 0.300001 / 0.5 |
| lightingSolve | 0 / 0.200001 / 0.200001 / 0.299999 |
| lightingMerge | 0.1 / 2.199999 / 2.400003 / 7 |
| lightingUpload | 0 / 0.199999 / 0.200001 / 0.4 |
| lightingReceiver | 0.4 / 0.700001 / 0.800003 / 1.200001 |
| lightingComposite | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1.1 / 2.5 / 2.799999 / 9.299999 |
| uiModel | 0.299999 / 0.4 / 0.400002 / 0.800001 |
| uiLayout | 0.4 / 0.5 / 0.6 / 1.099998 |
| uiDraw | 0.4 / 0.6 / 0.800001 / 2.800001 |
| fixedUpdate | 0.199999 / 0.299999 / 0.4 / 6.4 |
| catchUp | 0 / 0 / 0 / 0 |
| drawImageCalls | 883 / 991 / 1074 / 1074 |
| distinctDrawImageSources | 340 / 361 / 362 / 362 |
| tintBuilds | 0 / 1 / 7 / 22 |
| tintReuses | 84 / 90 / 91 / 91 |
| tintSurfaceReuses | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 / 4 |
| groundSourceOperations | 0 / 114 / 177 / 177 |
| imageDataAllocations | 0 / 0 / 2 / 2 |
| capRunRequests | 96 / 104 / 104 / 104 |
| flatSourceRequests | 220 / 236 / 236 / 236 |
| capRunComposites | 0 / 15 / 20 / 35 |
| flatSourceComposites | 0 / 18 / 40 / 40 |
| groundSourceReuses | 316 / 340 / 340 / 340 |
| receiverSamples | 296 / 303 / 308 / 308 |
| receiverCandidates | 842 / 870 / 916 / 916 |
| receiverFullLoopCandidates | 97680 / 99990 / 102564 / 102564 |
| saveCalls | 550 / 574 / 575 / 576 |
| restoreCalls | 550 / 574 / 575 / 576 |
| saveRestorePairs | 550 / 574 / 575 / 576 |
| surfaceAllocations | 0 / 0 / 0 / 14 |


All ten Canvas boards are exact, HUD included. All18 minute-long scale/mode/backend-request screenshots were opened, with192–527 moving100ms samples per review. Every requested GPU review uses Canvas after `webgl_unsupported_clip_path`. Supplementary pond views, moving-cliff view and current Video footer were opened; the footer visibly reads **CANVAS: ACCURACY UNVERIFIED DOWNSAMPLE**. Across all reviews the encountered set is `{webgl_unsupported_clip_path, webgl_accuracy_unverified_downsample}`. These are not successful GPU gameplay runs. Plain checked candidate is restored and reconnected; no deployment.

| Device / gate | Result |
|---|---|
| Desktop producer counts / Canvas pixels | PASS; all nearest world draws integer-ratio on both captured routes |
| Desktop integer sampler | OPEN, third approach stopped; existing guard retained |
| Desktop A1 Dynamic merge / whole | p950.999996185ms /11.399999619ms; content mismatch retained |
| Desktop moving cliff | maximum23.799999237ms, no≥50ms tasks, no rAF gap over16.8ms in this sample; complete halt unreproduced |
| iPad | **owner to run** |
| Hardware GPU | **owner to run**; software functional probes do not qualify hardware |

Owner iPad steps: on the candidate, System → Developer → Render → **Run protocol + copy JSON**; capture cliff/carried-light and pond, recording device,OS,browser,DPR,browser zoom,resolution,commit,world scale/backend, and repeat required modes/scales. No throttled desktop substitute. A-15 cutaway qualification follows, then A-17 encountered-fallback accounting and A-19 Canvas release preparation.


### A-15 cutaway edge-band qualification — claim,2026-09-08

IN PROGRESS: codex,2026-09-08 after8a5357e1. Owner amendment permits≤4 steps within a1px clip-edge band,≤2 outside,≤1% channels above one and exact HUD. Re-evaluate preserved three cutaway prototypes; use the existing bounded raster-mask approach only if it passes attribution and current-runtime qualification. Keep A-16 CPU variant pages, A-14 counters and the still-unqualified sampling guards. Files: terrain-cutaway.ts and WebGL adapter/geometry/shaders/backend, new bounded path-clips module/tests. No monolith logic change, dependencies, world readback, default toggle change or deployment. Evidence under output/perf-59-20260908/P8/A15/. The unchanged642-file/3659-test A-14 gate supports this docs-only claim; runtime exit requires its own full check, pixel/resource/context-loss probes, both route timings/counters and screenshots. iPad owner to run using System → Developer → Render → Run protocol + copy JSON on cliff/carried-light and pond with device/settings/commit metadata.

### A-15 cutaway edge-band exit — 2026-09-08

The bounded raster-mask approach (preserved second prototype, re-evaluated under the owner amendment) now passes **72/72 current-source cases**: maximum3 steps inside the1px edge band,2 outside,0.799560546875% channels above one,HUD exact. `current-edge-comparison.json` attributes every residual; `current-edge-witness.png` was opened (Canvas/GPU/blue edge band/residuals; no>2 residual outside). The earlier primitive approach also passes the amended gate; combined-coverage still fails36/72 because outside-band maxima reach3 and above-one1.4221191406%. No fourth sampling or cutaway algorithm was attempted. Default-on exact gates remain unchanged, and A-14 sampling remains OPEN.

Files: `terrain-cutaway.ts`, WebGL `canvas-adapter.ts`, `geometry.ts`, `shaders.ts`, `world-pass-webgl.ts`, new81-line `path-clips.ts` and61-line test. The three-way port preserves A-16 CPU effect pages, A-14 counters, existing shader color rounding and all sampling/lighting guards. Three native local masks preserve the existing Path2D geometry; nearest integer fragment sampling uses texture unit5. Each page≤512×2048/4MiB; aggregate masks≤12MiB CPU plus12MiB GPU. Unregistered, nested/transformed, excessive and invalid geometry fails explicitly. No world/GPU readback. Ownership clears before all independent teardown attempts, including a throwing Canvas setter; no monolith logic was changed.

Commands/evidence under `output/perf-59-20260908/P8/A15/`: `node current/build.mjs`, `node current/run.mjs`, `npx tsx current/compare.ts`, `npx tsx analyze-current.mts`; `node resources/build.mjs`, `node resources/run.mjs`; focused five-file Vitest run25 tests; engine typecheck and scoped ESLint; `python3 run-validation.py`, corrected fixture setup then `python3 resume-validation.py`; `python3 run-check.py`, `python3 run-measurement.py`, `python3 post-review.py`. The first fixture build lacked two copied fixture dependencies; adding those output-only files completed the run. The old comparison console retains the superseded2-step/.5% threshold for raw-count calibration; the edge analysis is the amended gate. The first loss fixture requested restoration within the loss event turn and timed out; the existing100ms asynchronous scheduling pattern passes, with both attempts preserved. These harness corrections changed no runtime pixels or gates.

Full **643 files/3664 tests pass in946.930619478s**. The real600-rAF warm resource proof allocates0 canvases/0 ImageData, retains2,134,536 total bytes and five textures264,452 bytes, and performs1800 expected mask uploads. Actual WEBGL_lose_context rejects lost draws, restores textures/rendering and disposes all bytes/textures/buffers/programs/VAOs. Ten full Canvas boards are byte-exact including HUD. All18 minute-long movement reviews stay connected,74–507 moving100ms samples; all nine GPU-requested reviews actually remain WebGL with no fallback. Every screenshot, both supplementary pond views, current Video footer and world golden board was opened; the footer visibly reads **EXPERIMENTAL WEBGL ACTIVE**. A-17 still records the encountered set for each complete protocol run, rather than inferring it from these endpoint statuses.

Desktop AMD Ryzen9 9955HX,Linux6.17.2-1-pve,HeadlessChrome152,1280×720,DPR1,browser zoom100%,world zoom2,Canvas1×/768×432 backing,capoff,no CPU throttling. Before40709d3d and after private candidate use exact source manifests alongside that injected base commit. Identical clear-weather/tick0/north overrides are removed after measurement and the plain checked candidate is rebuilt/reconnected. This pair has **no before/after comparison issues** on either route. Cliff's legacy no_pond is expected under A-18. Pond's legacy absent-player/carried-light/static-density/walking flags remain explicit: it is separate pond evidence, not a populated A1 replacement.

Basic/Classic/Dynamic whole p95 **6.600000381/7.400001526/12.100000381 →6.799999237/7.699998856/11.599998474ms**. This is a GPU clip change; small Canvas timing differences are not claimed as its speedup. The owner-accepted Basic6.3ms remains met. Dynamic merge p95 **0.900001526→0.900001526ms**, below1.5ms. Whole residual1.6ms is recorded; painterDraw6.2,painterBuild1.4,finalWorldComposite2.3 and UI0.4/0.5/0.7ms p95 remain material contributors, with nested intervals not additive. All12 captures and the separate moving-cliff sample have zero≥50ms tasks. Pinned surface allocations and filtered-frame builds are0; Basic ImageData0,Classic/Dynamic maximum2 on rebuilds. Six mode cycles prove Basic lighting0, Basic/Classic omit0 and Dynamic ready; Classic keeps its approved legacy lightmap. All36 original atlas PNGs and323 generated files remain unchanged in both roots, largest decoded page4194304 bytes.

Full22-stage and per-frame counters, original p50/p95/p99:

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.6 / 6.6 / 8.1 | 6.300001 / 7.400002 / 8.5 | 8.5 / 12.1 / 15.6 | 5.6 / 6.799999 / 8.1 | 6.4 / 7.699999 / 9 | 8.4 / 11.599998 / 15.5 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| painterBuild | 1 / 1.4 / 1.700001 | 1 / 1.4 / 1.6 | 1 / 1.400002 / 1.700001 | 1 / 1.4 / 1.699999 | 1 / 1.5 / 1.700001 | 1 / 1.400002 / 1.6 |
| painterSort | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.299999 / 0.300001 |
| painterDraw | 1.800001 / 2.299999 / 2.699999 | 1.800001 / 2.299999 / 2.700001 | 4.200001 / 6 / 11 | 1.800001 / 2.299999 / 2.799999 | 1.800001 / 2.300001 / 2.800001 | 4.200001 / 6.199999 / 10.9 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.099998 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 0.6 / 0.900002 / 1.900002 | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 0.6 / 0.900002 / 1.999998 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.399998 / 0.700001 / 0.800003 | 0 / 0 / 0 | 0 / 0 / 0 | 0.399998 / 0.699999 / 0.800001 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.1 / 1.299999 / 1.599998 | 1.700001 / 1.9 / 2.299999 | 1 / 2.4 / 2.6 | 1.1 / 1.300001 / 1.5 | 1.700001 / 2 / 2.4 | 1 / 2.299999 / 2.5 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 0.9 | 0.4 / 0.700001 / 0.800001 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.700001 / 1 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.699999 / 0.800001 |
| fixedUpdate | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.300001 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 879 / 1209 / 1218 | 878 / 891 / 899 | 898 / 984 / 1030 | 879 / 1209 / 1218 | 878 / 891 / 899 | 897 / 982 / 1030 |
| distinctDrawImageSources | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 325 | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 325 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 555 / 568 / 571 | 554 / 566 / 569 | 554 / 566 / 572 | 553 / 567 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| restoreCalls | 555 / 568 / 571 | 554 / 566 / 569 | 554 / 566 / 572 | 553 / 567 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| saveRestorePairs | 555 / 568 / 571 | 554 / 566 / 569 | 554 / 566 / 572 | 553 / 567 / 569 | 554 / 566 / 569 | 554 / 566 / 572 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 102681066 | 0 | 161280 | 103164678 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |


Separate pond route:

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 3.9 / 4.799999 / 5.900002 | 5.299999 / 6.299999 / 7.299999 | 5.800001 / 8.4 / 11.1 | 4 / 4.9 / 5.700001 | 5.200001 / 6.299999 / 7.200001 | 5.799999 / 8 / 9.199999 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 |
| painterBuild | 0.9 / 1.4 / 1.6 | 0.9 / 1.300001 / 1.599998 | 1 / 1.5 / 2 | 0.9 / 1.300001 / 1.5 | 0.9 / 1.300001 / 1.5 | 1 / 1.4 / 1.700001 |
| painterSort | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.699999 / 0.9 / 1 | 0.699999 / 0.800001 / 1 | 1.400002 / 2.5 / 3.199999 | 0.699999 / 0.9 / 1 | 0.699999 / 0.800001 / 1 | 1.400002 / 2.5 / 3 |
| weather | 0 / 0.1 / 0.199997 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.199999 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 1.000002 / 1.6 | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 1 / 1.500002 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.6 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.599997 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.799999 / 1 / 1.1 | 2 / 2.200001 / 2.700001 | 1.300001 / 1.700001 / 2.200001 | 0.799999 / 1 / 1.1 | 2 / 2.200001 / 2.6 | 1.299999 / 1.6 / 1.9 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.6 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.700001 / 0.900002 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.6 / 0.800001 | 0.4 / 0.699999 / 0.9 |
| fixedUpdate | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.400002 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 715 | 693 / 708 / 716 | 695 / 754 / 772 | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1799 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 96640430 | 0 | 164864 | 96640430 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |


Producer counters are repeated in `sampling-tables.md`/`sampling-summary.json`: no nearest noninteger draws on either route; the only noninteger group remains the intentionally smoothed Dynamic flame halo in direct-world. No producer geometry changes.

The larger normal-movement cliff route records1794 frames,1560 moving frames,1548.318955px travelled,minimum52 cap runs/324 static casters/one carried light. It has changing streamed content and no_pond; its larger movement than A-14's892 moving frames prevents a matched historical comparison. Whole **8.700001/14.800001/17.600000/29ms** and merge **0.599998/2.400000/2.800001/7.000004ms** p50/p95/p99/max. rAF interval p50/p95/p99/max16.7/16.8/16.8/33.4ms; zero≥50ms tasks. Streaming surface allocations max21 with p990,ImageData max2. The after-cliff screenshot shows the route after the protocol restored Basic; the18 separate minute reviews provide Dynamic visual evidence. The complete halt reported by the owner remains unreproduced; a direct retained0.5.7 comparison is being prepared, including its first Dynamic transition near the cliff.

| Stage ms / per-frame counter | A-15 p50 / p95 / p99 / max |
|---|---|
| whole frame | 8.700001 / 14.800001 / 17.6 / 29 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 0.299999 |
| ground | 0.299999 / 0.400002 / 0.5 / 1.5 |
| painterBuild | 1.1 / 1.5 / 1.800001 / 5.200001 |
| painterSort | 0.199999 / 0.300001 / 0.300001 / 0.799999 |
| painterDraw | 4.200001 / 10.1 / 12.5 / 24.200001 |
| weather | 0 / 0.1 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0.1 / 0.299999 |
| lightingOcclusionRaster | 0 / 0.200001 / 0.300001 / 0.5 |
| lightingSolve | 0.1 / 0.200001 / 0.200001 / 0.300001 |
| lightingMerge | 0.599998 / 2.4 / 2.800001 / 7.000004 |
| lightingUpload | 0 / 0.200001 / 0.299997 / 0.399998 |
| lightingReceiver | 0.4 / 0.700001 / 0.800001 / 1.6 |
| lightingComposite | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1 / 2.300001 / 2.599998 / 3.599998 |
| uiModel | 0.299999 / 0.400002 / 0.5 / 0.6 |
| uiLayout | 0.4 / 0.5 / 0.5 / 1.300001 |
| uiDraw | 0.4 / 0.699999 / 0.800001 / 1.200001 |
| fixedUpdate | 0.199999 / 0.300001 / 0.400002 / 6.700001 |
| catchUp | 0 / 0 / 0 / 1.200001 |
| drawImageCalls | 880 / 950 / 995 / 1074 |
| distinctDrawImageSources | 328 / 352 / 361 / 362 |
| tintBuilds | 0 / 7 / 8 / 22 |
| tintReuses | 81 / 89 / 91 / 91 |
| tintSurfaceReuses | 0 / 0 / 0 / 1 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 4 |
| preparedHeightRebuilds | 0 / 0 / 0 / 4 |
| groundSourceOperations | 18 / 99 / 138 / 177 |
| imageDataAllocations | 0 / 0 / 2 / 2 |
| capRunRequests | 96 / 104 / 108 / 108 |
| flatSourceRequests | 207 / 236 / 236 / 236 |
| capRunComposites | 4 / 19 / 28 / 35 |
| flatSourceComposites | 2 / 16 / 28 / 39 |
| groundSourceReuses | 297 / 326 / 340 / 340 |
| receiverSamples | 297 / 303 / 308 / 308 |
| receiverCandidates | 860 / 898 / 916 / 916 |
| receiverFullLoopCandidates | 98235 / 99990 / 102564 / 102564 |
| saveCalls | 544 / 565 / 574 / 581 |
| restoreCalls | 544 / 565 / 574 / 581 |
| saveRestorePairs | 544 / 565 / 574 / 581 |
| surfaceAllocations | 0 / 0 / 0 / 21 |


| Device / gate | Result |
|---|---|
| Desktop A-15 cutaway edge gate | PASS72/72; band3/outside2/0.799560546875% above-one/HUD0 |
| Desktop resources / context loss / disposal | PASS600 warm frames,0 new canvases/ImageData; actual loss restoration;0 disposed bytes |
| Desktop A1 merge / whole p95 | 0.900001526ms /11.599998474ms; whole-stage residual explicit |
| Desktop moving cliff | max29ms,zero≥50ms tasks; complete halt unreproduced |
| iPad | **owner to run** |
| Hardware GPU | **owner to run**; software functional evidence only |

Owner iPad steps: System → Developer → Render → **Run protocol + copy JSON** on the candidate at cliff/carried-light and pond; record device,OS,browser,DPR,browser zoom,resolution,commit,world scale/backend and repeat required modes/scales. No CPU-throttled substitute. A-15 complete under the amended experimental-enable tolerance; A-17 encountered-fallback accounting follows. A-14 prevents moving the toggle out of Developer in the proposed A-19 release. No deployment.


### A-17 complete-run fallback accounting — claim,2026-09-08

IN PROGRESS: codex,2026-09-08 aftera93914dc. Each mode/route starts a fresh session with WebGL requested; capture the encountered set from enable/preparation through restoration and count actual backend submissions. Endpoint status alone does not qualify this gate. Use the unchanged checked A-15 runtime (643 files/3664 tests); output-only bounded observation wraps the existing diagnostics seam, with no new rendering algorithm or removal of guards. All22 stages/per-frame counters, original timings, route limitations and screenshots go under output/perf-59-20260908/P8/A17/. A-14 remains OPEN even if a particular route sees no fallback. iPad owner to run via System → Developer → Render → Run protocol + copy JSON on both routes, recording device/settings/commit metadata. No deployment; A-19 request follows.


### A-17 complete-run fallback accounting — measured checkpoint, 2026-09-08

**Encountered-fallback condition PASS; experimental performance FAIL on this software GPU.** No rendering code changed after a93914dc. Files changed: this ledger, roadmap and DECISIONS; output-only capture/report scripts and artifacts under `output/perf-59-20260908/P8/A17/`. Commands: `python3 .../A17/run.py`, `python3 .../A17/report.py`; six fresh-session five-second warm-ups plus30-second active-rAF protocols, no simultaneous builds/tests/profiles or CPU throttling. Reuse unchanged A-15 `npm run check`:643 files/3664 tests,946.9306194782257seconds, plus10 exact Canvas boards,18 minute movement reviews and actual context-loss/disposal checks. `checked-source-files.json` compares every tracked build input with the private candidate:zero differences. Protocol source commit a93914dc; injected build label40709d3d is stale and explicitly superseded by this source proof.

Desktop AMD Ryzen9 9955HX, Linux6.17.2-1-pve, Chrome152 headless,1280×720,DPR1,browser zoom1,world zoom2,world scale1×,WebGL requested,cap off. `gpu-driver.json` identifies ANGLE/Vulkan SwiftShader Device(Subzero), with no GPU timer support. These are software GPU measurements, not hardware GPU acceptance. Live weather is used; the first two raw metadata descriptions mistakenly retained the earlier clear-weather override wording. `capture-provenance-note.txt` corrects that description without rewriting captures. A-15 Canvas baselines used clear weather, so this is not a matched backend speed comparison.

The bounded observer records initial status, enable/preparation, every submitted frame through warm-up/sample/restoration and final status; each run's `*-encountered.json` preserves transitions. Encountered sets are **empty in all six runs** and observed submissions after enable are exclusively WebGL. A-14's general sampler remains OPEN; this workload does not qualify unsupported draw domains. No guard was removed to achieve these results.

Cliff whole-frame p95 Basic/Classic/Dynamic **62.200000763/80.900001526/93.899999619ms**, compared with the preceding Canvas route's **6.799999237/7.699998856/11.599998474ms** (different weather/backend, not isolated optimization). Cliff WebGL painterDraw p9519.9/21.6/30.9ms and finalWorldComposite39.9/58.9/60.3ms dominate. Pond whole p9537.100000381/69.600000381/65.800001144ms. The measured long tasks below are actual failures, not omitted warm-up work. Final Canvas-copy presentation waits on the software GPU; the existing two-present comparison still selects Canvas copy for exact pixels, while the CSS-layer alternative failed parity. No new present or sampler experiment is justified here; A-19 keeps this backend in Developer, off by default.

All timings ms, p50 / p95 / p99; nested stages must not be summed. Raw JSON retains original precision.

| Stage | cliff-basic | cliff-classic | cliff-dynamic | pond-basic | pond-classic | pond-dynamic |
|---|---|---|---|---|---|---|
| whole frame | 56.300001 / 62.200001 / 74 | 74.800001 / 80.900002 / 85.1 | 83.199999 / 93.9 / 104.1 | 33.200001 / 37.1 / 39.6 | 62.699999 / 69.6 / 73.5 | 57.9 / 65.800001 / 71.699999 |
| snapshotPrepare | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.199999 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.099998 / 0.1 / 0.200001 | 0.1 / 0.199999 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| ground | 1.799999 / 2.5 / 3.1 | 1.9 / 2.699999 / 3.699999 | 1.799999 / 2.400002 / 3.300001 | 1.4 / 1.9 / 2.5 | 1.4 / 1.800001 / 2.299999 | 1.4 / 2.200001 / 4.199999 |
| painterBuild | 1.1 / 1.6 / 2.200001 | 1.1 / 1.4 / 2.299999 | 1 / 1.400002 / 2.1 | 1 / 1.200001 / 1.9 | 1 / 1.200001 / 2.299999 | 1 / 1.300001 / 2.1 |
| painterSort | 0.200001 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.400002 | 0.200001 / 0.300001 / 0.400002 | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.300001 | 0.1 / 0.200001 / 0.300001 |
| painterDraw | 15.300001 / 19.9 / 25.699999 | 15.800001 / 21.599998 / 25.9 | 23.699999 / 30.9 / 49.200001 | 3.400002 / 4.799999 / 5.299999 | 3.200003 / 4.599998 / 5.4 | 6.5 / 9.1 / 11 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.199999 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.299999 / 0.300001 | 0 / 0.300001 / 0.400002 | 0 / 0 / 0 | 0 / 0.199999 / 0.200001 | 0 / 0.200001 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0.1 / 0.200001 / 0.299999 | 0.299999 / 0.4 / 0.400002 |
| lightingMerge | 0 / 0 / 0 | 0.099998 / 0.199999 / 0.200001 | 0.099998 / 0.1 / 0.200001 | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 0.1 / 0.199999 / 0.200001 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.499998 / 0.800001 / 1.000002 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.500002 / 1.000002 |
| lightingComposite | 0 / 0 / 0.1 | 0.299999 / 0.5 / 0.800001 | 0 / 0 / 0 | 0 / 0 / 0.099998 | 0.200001 / 0.4 / 0.400002 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 36 / 39.9 / 47.200001 | 53.6 / 58.900002 / 62.799999 | 53.6 / 60.299999 / 65 | 25.599998 / 28.5 / 31.299999 | 54.299999 / 60.800001 / 64 | 45.700001 / 51.699999 / 55.4 |
| uiModel | 0.400002 / 0.6 / 0.700001 | 0.5 / 0.6 / 0.799999 | 0.4 / 0.5 / 0.6 | 0.400002 / 0.599998 / 0.800001 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.5 / 0.6 |
| uiLayout | 0.5 / 0.6 / 1.400002 | 0.5 / 0.6 / 1.300001 | 0.5 / 0.6 / 1.099998 | 0.400002 / 0.6 / 1.299999 | 0.4 / 0.6 / 1.5 | 0.400002 / 0.6 / 0.800001 |
| uiDraw | 0.5 / 1 / 1.4 | 0.5 / 1.199999 / 1.5 | 0.599998 / 1.199999 / 1.800001 | 0.5 / 0.9 / 1.200001 | 0.5 / 1 / 1.4 | 0.5 / 1.1 / 1.4 |
| fixedUpdate | 0.4 / 0.5 / 0.800001 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.599998 / 0.700001 | 0.299999 / 0.4 / 0.5 | 0.4 / 0.5 / 0.799999 | 0.4 / 0.6 / 1.4 |
| catchUp | 0.4 / 0.5 / 0.800001 | 0.4 / 0.5 / 0.700001 | 0.4 / 0.599998 / 0.700001 | 0.299999 / 0.4 / 0.5 | 0.4 / 0.5 / 0.799999 | 0.4 / 0.6 / 1.4 |

| Per-frame counter | cliff-basic | cliff-classic | cliff-dynamic | pond-basic | pond-classic | pond-dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 193 / 523 / 523 | 193 / 212 / 523 | 193 / 523 / 523 | 180 / 510 / 510 | 180 / 510 / 510 | 180 / 510 / 510 |
| distinctDrawImageSources | 12 / 13 / 13 | 12 / 13 / 13 | 12 / 13 / 13 | 12 / 13 / 13 | 12 / 13 / 13 | 12 / 13 / 13 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 2 / 2 | 0 / 2 / 2 | 0 / 0 / 0 | 0 / 2 / 2 | 0 / 2 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 229 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 878 / 915 / 916 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 22 / 29 / 29 | 22 / 24 / 29 | 22 / 29 / 29 | 18 / 25 / 25 | 18 / 25 / 25 | 18 / 25 / 25 |
| restoreCalls | 22 / 29 / 29 | 22 / 24 / 29 | 22 / 29 / 29 | 18 / 25 / 25 | 18 / 25 / 25 | 18 / 25 / 25 |
| saveRestorePairs | 22 / 29 / 29 | 22 / 24 / 29 | 22 / 29 / 29 | 18 / 25 / 25 | 18 / 25 / 25 | 18 / 25 / 25 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | cliff-basic | cliff-classic | cliff-dynamic | pond-basic | pond-classic | pond-dynamic |
|---|---|---|---|---|---|---|
| Active sample frames | 501 | 383 | 344 | 839 | 456 | 486 |
| Observed GPU submissions including preparation | 741 | 586 | 482 | 1104 | 767 | 708 |
| Observed Canvas submissions | 0 | 0 | 0 | 0 | 0 | 0 |
| Encountered fallback reasons | [] | [] | [] | [] | [] | [] |
| Long tasks >=50 ms | 501 | 383 | 344 | 0 | 455 | 487 |
| Maximum long task ms | 87 | 91 | 124 | 0 | 79 | 82 |
| Retained lighting bytes | 0 | 161280 | 88683578 | 0 | 164864 | 83953014 |
| Omit decoded bytes | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Legacy workload issues | no_pond | no_pond | no_pond | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |


Per-producer totals for every run are in `sampling.json` and `sampling-tables.md`; nearest noninteger counts remain zero. These counters describe the observed workload only. Basic retains zero lighting bytes and Basic/Classic load zero omit bytes; Classic's small legacy field is the accepted A-2 exception. Filtered builds remain zero. All six route PNGs were opened; they are post-protocol Basic restoration screenshots, not separate Dynamic visual proof. A-15's18 minute reviews on unchanged runtime supply the per-setting evidence. The full Overworld banner, HUD, cliff caps and pond are visible; an initial suspected missing banner suffix was an inspection mistake, resolved by reopening the original images. No pixel or HUD change was made.

| Device / gate | Result |
|---|---|
| Desktop A-17 encountered fallback set | PASS: empty for all six runs,zero Canvas submissions after enable |
| Desktop experimental performance | FAIL on SwiftShader: cliff p9562.2–93.9ms and many≥50ms tasks |
| Canvas default | Remains checked A-15 runtime; accepted historical Basic6.3ms, Dynamic merge0.9ms, whole11.6ms residual |
| General WebGL enable | OPEN:A-14 sampler; software performance failure recorded, hardware performance unqualified |
| iPad | **owner to run** |
| Hardware GPU | **owner to run** |

Owner steps: System → Developer → Render → **Run protocol + copy JSON**, separately at cliff/carried-light and pond, with device,OS,browser,DPR,browser zoom,resolution,commit,world scale/backend. Repeat modes/scales; do not substitute CPU throttling. Next: direct retained0.5.7/current cold cliff frame-delivery comparison, then A-19 Canvas-only release preparation. No deployment.


### A-19 Canvas release preparation — claim,2026-09-08

IN PROGRESS: codex,2026-09-08 after77af54bf. Scope: owned Video/Developer render controls in packages/ui/src/overworld-ui.ts, mechanically extracted before behavior changes into bounded modules; video-rows.ts/tests and structural extraction audit; current rendering contract docs01/02/21/47/58/59/14/DECISIONS; new tests and release artifacts. Preserve Canvas1× defaults and persisted choice, keep fallback reason visible in Video, move experimental toggle into Developer until enable gates pass. No changes to gameplay authority, sampler or world pixels. Supplemental old0.5.7/current cliff cold-transition delivery evidence is separate from readiness-qualified all-stage protocols. Artifacts output/perf-59-20260908/P8/A19/ and output/perf-59-20260908/release/. Claim uses unchanged643-file/3664-test A-15 full gate; every runtime boundary will run npm run check. Version0.6.0 already set. Build/package/release request only; do not deploy.


### A-19 mechanical UI extraction and direct cliff delivery — checkpoint,2026-09-08

Extracted unchanged shared panel drawing, Video choice/footer drawing, Developer Render drawing and renderer-control node/layout policy into four bounded modules (24/31/44/78lines). Files: packages/ui/src/overworld-ui.ts plus new overworld-panel-drawing.ts,settings-choice-rows.ts,developer-render-panel.ts,world-render-controls.ts; reviewed packages/client/src/phase-zero-extraction.test.ts digest. No behavior or visibility change; WebGL still in Video in this mechanical commit. Source body comparison proves moved helpers exact and both painting blocks identical after this→view renaming. Other four structural seams unchanged; digest86dc3754a1729cfebc31c65e9b49b0936ec90dc0f9887de3b28189e1efa0aea4.

Artifacts output/perf-59-20260908/P8/A19/mechanical/. Commands: extraction/source comparison, UI typecheck, focused ESLint, npm run check, node build-panels.mjs/run-panels.mjs mechanical, and goldens build/run/compare. Full gate **643files/3664tests,926.2194895744324seconds**, green. Sixteen real settings/Developer panels byte-identical and10 complete world/lighting/terrain boards byte-identical, including HUD. First output-only terrain fixture mixed private/current UI singleton imports and rejected six cases; aligned its import to the same integrator root, then all10passed. No runtime change or relaxed assertion resolved that harness issue. Preferences fixture uses actual browser storage without forced init values:Canvas1×/WebGLoff defaults and all six scale/backend reload combinations pass.

The mechanical commit has no measured rendering optimization; A-15's full22-stage/counter tables remain its unchanged world-runtime reference. Fresh complete A-19 before/after protocols follow the actual control relocation. Supplemental cliff measurements below are raw delivery evidence, not substituted stage measurements. iPad **owner to run**, System→Developer→Render→Run protocol+copyJSON at cliff/carried-light and pond, device/OS/browser/DPR/zoom/resolution/commit/scale/backend recorded.

**Supplemental cold cliff delivery comparison**

Retained0.5.7 archive SHA256 `7fa8d720be56039a58bd99c1a6d0e825d48cf1716f2047bb0d3aa1fc265bf3ac` versus unchanged checked A15 runtime a93914dc. Private candidate source proof: ../../A17/checked-source-files.json. The old active entry imports overworld-main-DHM4IWZm.js; no production file or service changed. Metadata and all original timestamps/long tasks/positions/before-after diagnostics in evidence/*.json. All three PNGs opened: cliff caps, trees and HUD present; different end positions preclude pixel comparison.

Normal signed-in actor movement, same route and fixed17:00 sky,1280×720,DPR1,Chrome152/Linux/9955HX,zoom2,Canvas. Only one test client rendered at a time; no profiling,CPU throttle,tests or builds. Begin Basic at cliff, request Dynamic and move for35seconds. Final30seconds shown separately after5seconds warm-up. This is supplemental delivery evidence, not a replacement for readiness-qualified22-stage/counter protocol. Live weather/content/trajectory may differ. No matched isolated-change speedup claim.

| Run | Final30s frame gaps p50/p95/p99/max ms | Gaps≥50ms | Long tasks≥50ms | Cold35s max frame gap/task ms | Distance px |
|---|---|---|---|---|---|
| legacy-native | 33.30000000000291 / 50 / 50.10000000000218 / 50.10000000000582 | 157 | 1 | 116.69999999999982 / 127 | 1255.473146542499 |
| current-native | 16.69999999999709 / 16.799999999995634 / 16.80000000000291 / 33.400000000001455 | 0 | 0 | 150.0 / 153 | 1527.7761720402987 |
| current-1x | 16.69999999999709 / 16.799999999999272 / 16.80000000000291 / 33.30000000000291 | 0 | 0 | 133.30000000000018 / 136 | 733.605551275464 |

Sustained delivery improves on the candidate in both Native and1×; the first Dynamic activation still incurs a136–153ms task, versus127ms on the old client. Thus this evidence does not prove elimination of every hitch or reproduce the owner's full halt. Cold-transition work remains a residual separate from warm boundary-crossing merge spikes. All three runs remain connected and end effectively Dynamic; no authority/collision override. Browser restored to current candidate, Basic1×.

iPad: **owner to run**, System→Developer→Render→Run protocol+copyJSON on cliff/carried-light and pond, record device/OS/browser/DPR/zoom/resolution/commit/scale/backend. For the original symptom also record first entry with Dynamic selected and whether stalls repeat after first approach; no desktop throttling substitute.


A-15 artifact correction discovered during this audit: its cliff/pond screenshot helpers saved new images under producer-profile/a15 but copied from a14. Original files remain preserved. A15/after-cliff-corrected.png and pond-17-corrected.png/pond-18-corrected.png now preserve the actual A15 saved images; all three reopened. Raw A15 timing/counter JSON, separately captured A1 screenshots and all18 minute reviews are unaffected. See A15/cliff-screenshot-provenance-correction.txt. This supersedes any A15 attribution of the three earlier copied PNGs.

Read-only live preflight: public HTTP200 index and all384 local served files still match the retained0.5.7rollback. No deployment/service/world operation. Next commit relocates the experimental control; no release request or owner Go has been issued yet.


### A-19 Developer control relocation — measured checkpoint,2026-09-08

**Canvas release preparation implemented; no deployment.** After mechanical extraction9cd7fc14, the experimental toggle is in Developer→Render and absent from Video. The persisted key and default off are preserved; Canvas1× stays default. Video retains actual backend fallback status. Four Developer rows fit above the footer at240×140,360×180,480×270,640×360; compact layouts retain existing ellipsis. Retired Video parameters/row/branch removed. No world renderer, authority, shader, sampler, artwork or lighting formula change.

Files: packages/ui/src/world-render-controls.ts,developer-render-panel.ts,settings-choice-rows.ts,video-rows.ts and test; new world-render-controls.test.ts; minimal forwarded argument removal in overworld-ui.ts and reviewed structural digest in packages/client/src/phase-zero-extraction.test.ts. Docs01/02/21/47/58/59/14 and DECISIONS describe the current0.6.0 candidate and supersede historical Video/shared-preview/clip/filter blockers. All new modules≤400lines. Structural digest672835c2f078b9066f519d6b76c1a7fc587a3cd057e7bffc55b5bc0fd970ff31; other four seams unchanged.

Artifacts output/perf-59-20260908/P8/A19/. Commands: focused Vitest4files/18tests, UI typecheck, focused ESLint; **npm run check644files/3670tests,959.181298494339seconds,green**; private production client builds, panel build/run,10 original world/lighting/terrain goldens,18 minute movement reviews, six lighting cycles, asset hash checks, browser preference lifetime test, simulated actual-client WebGL capability failure, quiet before/after protocol and larger cliff capture. See individual logs/run-validation.py/run-measurement.py. Checked source hashes remained unchanged. Sixteen final panel fixtures and all18 movement PNGs plus pond17/18 and actual Video footer were opened. All9 ordinary GPU requests stay WebGL; all18 reviews remain connected and moving (minimum96 sampled movements). These functional reviews overlap repository checks and make no timing claim.

The separate simulated getContext(webgl2)=null test makes exactly one failed context request, preserves connection and falls back to Canvas with **worldPassFallbackReason=webgl2_unavailable** visibly rendered in Video. Native API restored immediately. The reason remains session-latched after turning the preference off; the subsequent fresh measurement session clears it. This deliberately injected failure is not part of A-17's normal-workload encountered set. Real context-loss restoration/disposal retains the checked A-15 gate. Browser storage without forced init defaults provesCanvas1×/WebGLoff plus all six persisted scale/backend reload combinations.

Desktop AMD Ryzen9 9955HX,Linux6.17.2-1-pve,Chrome152 headless,1280×720,DPR1,browser zoom1,world zoom2,Canvas1×,cap off. Five-second warm-up/30-second active-rAF, no simultaneous tests/builds/profiles, no CPU throttle. Both private builds use the same output-only clear-weather/tick0/north override, restored afterwards. Before is committed mechanical9cd7fc14; after is the uncommitted A-19 UI delta on that parent, explicitly identified by source manifests. Final release source manifest ties these bytes to the committed artifact. Comparison findings: {"cliff": [{"mode": "basic", "comparisonIssues": [], "beforeLegacyIssues": ["no_pond"], "afterLegacyIssues": ["no_pond"]}, {"mode": "classic", "comparisonIssues": [], "beforeLegacyIssues": ["no_pond"], "afterLegacyIssues": ["no_pond"]}, {"mode": "dynamic", "comparisonIssues": [], "beforeLegacyIssues": ["no_pond"], "afterLegacyIssues": ["no_pond"]}], "pond": [{"mode": "basic", "comparisonIssues": [], "beforeLegacyIssues": ["invalid_frame_evidence", "local_player_not_visible", "local_player_not_walking", "no_carried_light", "fewer_than_150_static_casters"], "afterLegacyIssues": ["invalid_frame_evidence", "local_player_not_visible", "local_player_not_walking", "no_carried_light", "fewer_than_150_static_casters"]}, {"mode": "classic", "comparisonIssues": [], "beforeLegacyIssues": ["invalid_frame_evidence", "local_player_not_visible", "local_player_not_walking", "no_carried_light", "fewer_than_150_static_casters"], "afterLegacyIssues": ["invalid_frame_evidence", "local_player_not_visible", "local_player_not_walking", "no_carried_light", "fewer_than_150_static_casters"]}, {"mode": "dynamic", "comparisonIssues": [], "beforeLegacyIssues": ["invalid_frame_evidence", "local_player_not_visible", "local_player_not_walking", "no_carried_light", "fewer_than_150_static_casters"], "afterLegacyIssues": ["invalid_frame_evidence", "local_player_not_visible", "local_player_not_walking", "no_carried_light", "fewer_than_150_static_casters"]}]}. Legacy no_pond at cliff and missing-player/carried-light/static-density pond flags are separate A-18 route limitations, not falsely claimed combined qualification.

Cliff whole-frame p95 B/C/D **6.600000381/7.400001526/11→6.700000763/7.299999237/12.299999237ms**. Dynamic merge **0.600000381/0.900003433/2.099998474ms** p50/p95/p99. The UI move does not optimize world drawing; report measured variation without an isolated speedup claim. The remaining whole-frame gap against10ms is 2.299999237ms. Largest measured stage p95s are painterDraw6.200000763, finalWorldComposite2.300001144, painterBuild1.399999619ms, with UI model/layout/draw0.4/0.5/0.7ms. Nested intervals and their percentiles must not be summed. Whole-frame p50 stays8.2ms; the before/after means8.519166651/8.592222207ms are close despite the changed tail. Historical Basic6.3ms remains owner-accepted as met; fresh values are not relabelled. Both complete22-stage/counter tables follow; raw JSON retains full precision.

**Cliff/carried-light route**

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 5.5 / 6.6 / 7.700001 | 6.200001 / 7.400002 / 8.700001 | 8.199999 / 11 / 15.199999 | 5.5 / 6.700001 / 7.799999 | 6 / 7.299999 / 8.5 | 8.199999 / 12.299999 / 16 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.300001 / 0.5 / 0.6 | 0.300001 / 0.5 / 0.5 | 0.300001 / 0.5 / 0.6 |
| painterBuild | 0.9 / 1.4 / 1.6 | 0.9 / 1.300001 / 1.599998 | 0.9 / 1.299999 / 1.5 | 0.9 / 1.200001 / 1.5 | 0.9 / 1.299999 / 1.5 | 0.9 / 1.4 / 1.699999 |
| painterSort | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.299999 / 0.300001 | 0.199999 / 0.300001 / 0.4 |
| painterDraw | 1.799999 / 2.200001 / 2.700001 | 1.800001 / 2.299999 / 3 | 4.1 / 6 / 10.799999 | 1.799999 / 2.200001 / 3 | 1.700001 / 2.200001 / 2.799999 | 4 / 6.200001 / 10.799999 |
| weather | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.099998 / 0.1 | 0 / 0.1 / 0.1 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0.099998 / 0.199999 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 | 0 / 0 / 0 | 0 / 0.199999 / 0.300001 | 0 / 0.199999 / 0.300001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| lightingMerge | 0 / 0 / 0 | 0.1 / 0.199999 / 0.200001 | 0.6 / 0.900002 / 1.9 | 0 / 0 / 0 | 0.099998 / 0.1 / 0.200001 | 0.6 / 0.900003 / 2.099998 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.200001 / 0.300001 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.4 / 0.700001 / 0.800003 | 0 / 0 / 0 | 0 / 0 / 0 | 0.399998 / 0.699999 / 0.800003 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 1.1 / 1.299999 / 1.5 | 1.700001 / 1.900002 / 2.200001 | 1 / 2.299999 / 2.5 | 1.099998 / 1.299999 / 1.5 | 1.6 / 1.9 / 2.299999 | 1 / 2.300001 / 2.800001 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.5 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.599998 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.700001 / 0.9 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.700001 / 1 | 0.4 / 0.6 / 0.799999 | 0.4 / 0.699999 / 0.800001 |
| fixedUpdate | 0.199999 / 0.300001 / 0.300001 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.300001 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 879 / 1209 / 1218 | 878 / 891 / 899 | 898 / 984 / 1030 | 879 / 1209 / 1218 | 878 / 891 / 899 | 898 / 984 / 1030 |
| distinctDrawImageSources | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 | 34 / 35 / 35 | 35 / 35 / 36 | 347 / 356 / 357 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 7 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 105 / 106 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 | 0 / 0 / 0 | 0 / 0 / 0 | 18 / 114 / 153 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 | 0 / 0 / 0 | 0 / 0 / 0 | 216 / 227 / 227 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 19 / 28 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 15 / 31 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 326 | 0 / 0 / 0 | 0 / 0 / 0 | 306 / 325 / 326 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 |
| saveCalls | 554 / 568 / 570 | 554 / 566 / 569 | 554 / 566 / 572 | 554 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 571 |
| restoreCalls | 554 / 568 / 570 | 554 / 566 / 569 | 554 / 566 / 572 | 554 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 571 |
| saveRestorePairs | 554 / 568 / 570 | 554 / 566 / 569 | 554 / 566 / 572 | 554 / 568 / 569 | 554 / 566 / 569 | 554 / 566 / 571 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 | 661 / 674 / 674 |
| Lighting retained bytes at end | 0 | 161280 | 102681066 | 0 | 161280 | 102681066 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | no_pond | no_pond | no_pond | no_pond | no_pond | no_pond |


**Separate pond route**

All stage timings in milliseconds, **p50 / p95 / p99**. Nested intervals must not be summed.

| Stage | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| whole frame | 3.800001 / 4.9 / 5.6 | 5.299999 / 6.400002 / 7.200001 | 6.1 / 8.800001 / 10.4 | 3.9 / 5.1 / 6 | 5.1 / 6.1 / 7.1 | 5.5 / 7.300001 / 8.799999 |
| snapshotPrepare | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 | 0 / 0.1 / 0.1 |
| ground | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.6 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.6 / 0.700001 |
| painterBuild | 0.800001 / 1.299999 / 1.400002 | 0.9 / 1.300001 / 1.5 | 1 / 1.6 / 1.799999 | 0.800001 / 1.299999 / 1.5 | 0.800001 / 1.200001 / 1.5 | 0.9 / 1.299999 / 1.5 |
| painterSort | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.299999 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 | 0.1 / 0.200001 / 0.200001 |
| painterDraw | 0.6 / 0.9 / 1.1 | 0.699999 / 0.9 / 1.1 | 1.5 / 2.700001 / 3.300001 | 0.699999 / 0.9 / 1.1 | 0.6 / 0.800001 / 1.099998 | 1.300001 / 2.299999 / 2.700001 |
| weather | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.200001 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.199999 | 0 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.099998 / 0.1 | 0 / 0 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0.1 | 0 / 0 / 0.1 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 | 0 / 0 / 0 | 0 / 0 / 0.200001 | 0 / 0 / 0.200001 |
| lightingSolve | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.4 / 0.400002 | 0 / 0 / 0 | 0 / 0.200001 / 0.200001 | 0 / 0.300001 / 0.4 |
| lightingMerge | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 1.199999 / 1.700003 | 0 / 0 / 0 | 0 / 0.1 / 0.200001 | 0 / 0.900002 / 1.4 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.1 / 0.199999 | 0 / 0.199999 / 0.299999 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0.199999 / 0.299999 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.5 / 0.600002 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200001 / 0.400002 / 0.500002 |
| lightingComposite | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0.1 / 0.1 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 0.799999 / 1 / 1.299999 | 2 / 2.4 / 2.700001 | 1.4 / 1.900002 / 2.1 | 0.799999 / 1 / 1.299999 | 1.900002 / 2.200001 / 2.6 | 1.299999 / 1.5 / 1.799999 |
| uiModel | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.5 / 0.5 | 0.299999 / 0.400002 / 0.5 | 0.299999 / 0.4 / 0.400002 | 0.299999 / 0.400002 / 0.5 |
| uiLayout | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.6 | 0.4 / 0.599998 / 0.700001 | 0.4 / 0.5 / 0.6 | 0.4 / 0.5 / 0.5 | 0.4 / 0.5 / 0.6 |
| uiDraw | 0.4 / 0.699999 / 0.800001 | 0.4 / 0.699999 / 0.9 | 0.4 / 0.700001 / 1 | 0.4 / 0.699999 / 0.9 | 0.300001 / 0.699999 / 0.800001 | 0.4 / 0.699999 / 0.800001 |
| fixedUpdate | 0.1 / 0.299999 / 0.300001 | 0.199999 / 0.299999 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.199999 / 0.300001 / 0.4 | 0.1 / 0.299999 / 0.300001 | 0.1 / 0.299999 / 0.4 |
| catchUp | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Per-frame counters, **p50 / p95 / p99**:

| Counter | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 692 / 707 / 712 | 693 / 708 / 716 | 695 / 754 / 772 | 692 / 707 / 715 | 693 / 708 / 713 | 695 / 754 / 772 |
| distinctDrawImageSources | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 | 22 / 24 / 25 | 23 / 25 / 26 | 147 / 149 / 150 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 7 / 7 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 57 / 93 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 | 0 / 0 / 0 | 0 / 0 / 2 | 0 / 0 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 5 / 7 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 14 / 24 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 | 0 / 0 / 0 | 0 / 0 / 0 | 121 / 124 / 124 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| restoreCalls | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| saveRestorePairs | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 | 359 / 366 / 366 | 361 / 368 / 368 | 361 / 368 / 368 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | Before Basic | Before Classic | Before Dynamic | After Basic | After Classic | After Dynamic |
|---|---|---|---|---|---|---|
| Captured frames | 1800 | 1800 | 1800 | 1800 | 1800 | 1800 |
| Long tasks ≥50 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Maximum long task ms | 0 | 0 | 0 | 0 | 0 | 0 |
| Render items p50/p95/p99 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 | 487 / 504 / 504 |
| Lighting retained bytes at end | 0 | 164864 | 97004246 | 0 | 164864 | 97004246 |
| Omit-page decoded bytes at end | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Workload failures | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |


**Larger normal-movement cliff route (supplementary)**

1800frames, 543moving frames, 504.75924683235996px travelled. Issues: seed_season_or_content_changed, local_player_not_walking, no_pond. rAF gaps p50/p95/p99/max 16.7 / 16.7 / 16.8 / 16.8ms; 0gaps≥50ms. 0long tasks≥50ms,maximum0ms. This is not a matched before/after route pair; collision-dependent trajectory/content can differ.

| Stage ms / per-frame counter | p50 / p95 / p99 / max |
|---|---|
| whole frame | 7.6 / 10.299999 / 14.6 / 19.599998 |
| snapshotPrepare | 0 / 0.1 / 0.1 / 1.5 |
| ground | 0.4 / 0.5 / 0.6 / 1.700001 |
| painterBuild | 1 / 1.5 / 1.699999 / 5.5 |
| painterSort | 0.199999 / 0.300001 / 0.300001 / 2.5 |
| painterDraw | 3.4 / 5.200001 / 6.9 / 13.199999 |
| weather | 0 / 0.1 / 0.1 / 0.200001 |
| lightingBoundsResize | 0 / 0.099998 / 0.1 / 0.299999 |
| lightingOcclusionRaster | 0 / 0 / 0.299999 / 0.400002 |
| lightingSolve | 0 / 0.199999 / 0.200001 / 0.299999 |
| lightingMerge | 0 / 0.700001 / 0.899998 / 6.899998 |
| lightingUpload | 0 / 0.1 / 0.200001 / 0.500002 |
| lightingReceiver | 0.399998 / 0.699999 / 0.899998 / 2.599998 |
| lightingComposite | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1.099998 / 2.5 / 2.9 / 11.1 |
| uiModel | 0.300001 / 0.400002 / 0.5 / 8 |
| uiLayout | 0.4 / 0.5 / 0.6 / 5.799999 |
| uiDraw | 0.4 / 0.6 / 0.799999 / 2 |
| fixedUpdate | 0.1 / 0.299999 / 0.300001 / 1.800001 |
| catchUp | 0 / 0 / 0 / 0 |
| drawImageCalls | 880 / 993 / 1074 / 1093 |
| distinctDrawImageSources | 340 / 361 / 362 / 363 |
| tintBuilds | 0 / 0 / 1 / 8 |
| tintReuses | 84 / 90 / 90 / 90 |
| tintSurfaceReuses | 0 / 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 / 0 |
| groundSourceOperations | 0 / 123 / 177 / 177 |
| imageDataAllocations | 0 / 0 / 2 / 2 |
| capRunRequests | 96 / 104 / 104 / 104 |
| flatSourceRequests | 222 / 236 / 236 / 236 |
| capRunComposites | 0 / 13 / 19 / 19 |
| flatSourceComposites | 0 / 28 / 40 / 40 |
| groundSourceReuses | 316 / 340 / 340 / 340 |
| receiverSamples | 296 / 303 / 303 / 303 |
| receiverCandidates | 823 / 870 / 870 / 870 |
| receiverFullLoopCandidates | 97680 / 99990 / 99990 / 99990 |
| saveCalls | 553 / 574 / 574 / 577 |
| restoreCalls | 553 / 574 / 574 / 577 |
| saveRestorePairs | 553 / 574 / 574 / 577 |
| surfaceAllocations | 0 / 0 / 0 / 0 |


Per-producer sampling totals in sampling-summary.json/sampling-tables.md remain explicit, with nearest noninteger draws separately counted. All36original atlas PNGs and323generated pages remain unchanged in both worktrees; largest decoded page≤4MiB. Six transition cycles prove Basic0 retained lighting bytes and Basic/Classic0 omit bytes; Classic keeps only its accepted legacy lighting field. Runtime filtered-frame machinery remains deleted. Ten complete Canvas boards are byte-exact, including HUD; A-16 CPU effects and A-15 GPU edges retain their amended independent gates.

The old0.5.7/current cold cliff comparison and partial CPU attribution are retained under cliff-legacy/. Sustained current Native/1×delivery improves versus old, but first Dynamic activation still has136–153ms unprofiled tasks; a separate profiled123ms task shows Canvas/native, whole-terrain occlusion initialization and first receiver work, without attributing its entire duration to one JS function. Complete owner-reported halt remains unreproduced. No fourth sampler or new lighting approximation was attempted. A-14 remains OPEN and SwiftShader GPU performance fails despite A-17's empty normal-workload fallback sets.

| Device / release gate | Result |
|---|---|
| Desktop Canvas code / goldens / controls | PASS,644files/3670tests,10 exact boards,16 panel fixtures,18 movement reviews |
| Desktop Basic | Owner-accepted6.3ms; fresh timings retained above |
| Desktop Dynamic | Merge target checked above; whole-frame residual reported per stage |
| Experimental WebGL enable | OPEN:A-14 sampling and hardware/performance qualification; Developer-only/off |
| iPad | **owner to run** |
| Hardware GPU | **owner to run** |

Owner capture: System→Developer→Render→**Run protocol+copyJSON** at cliff/carried-light and pond, record device/OS/browser/DPR/browser zoom/resolution/commit/world scale/backend and repeat required modes/scales. No CPU-throttled substitute. Packaging the committed0.6.0 static client and exact rollback/publication request follows. No world publish, Studio deploy or live change is authorized in this run; release-specific owner Go remains required under A-19 and ops/orchard-runtime/README.md.


### 2026-09-08 — A-19 release artifact and request prepared; not deployed

**Scope/status.** Static gameplay client 0.6.0 from runtime commit `fd0cb7e664bf41e752164bc47c5ca3950532c6fe`; Canvas 1× remains default, experimental WebGL remains off and confined to Developer → Render. No world publication, migration, Studio deployment, service change or live static swap. This entry closes release preparation only; it does not close the A-14 sampling, hardware GPU or physical iPad gates. The current request supersedes the September 7 request and its obsolete conditional-approval wording.

**Files/evidence.** Final tracked edits are this ledger and `docs/14-roadmap.md`. Runtime and the checked source bytes are unchanged. Artifacts are under `output/perf-59-20260908/release/`: `README.md` (release scope/gates/residuals), `commands.md` (exact proposed build/publication/rollback commands), `performance.md` / `performance.json` (all 22 stage p50/p95/p99 values and per-frame counters), `candidate.json`, source/static manifests, archive validation, build/static logs and same-account reconnect evidence. The A-19 milestone's original matched before/after stage/counter tables and minute-review evidence immediately precede this entry and remain under `output/perf-59-20260908/P8/A19/`; packaging is not a new runtime milestone or a new timing sample.

**Commands/results.** `npm run check` passed on the unchanged runtime: 644 test files / 3,670 tests, 959.181298494339 seconds. Packaging ran `npm run build`, the isolated client production build with `VITE_RENDER_COMMIT=fd0cb7e664bf41e752164bc47c5ca3950532c6fe`, `npm run client:chunks:check`, and candidate-specific `CLIENT_STATIC_DRY_RUN=true npm run client:static:validate`: all pass. Generic Vite 500 kB warnings remain; diagnostics/WebGL lazy-boundary checks pass. The validator defaults to the canonical checkout, so the first dry-run checked old live output; the corrected candidate dry-run explicitly sets `CLIENT_STATIC_REPOSITORY` and an output-only `CLIENT_STATIC_UNIT` path mirror. `static-validation-scope.txt` preserves that distinction. No unit was installed. Proposed publication/rollback shell blocks pass `bash -n` only and have not executed.

**Archive/continuity.** `client-0.6.0-fd0cb7e6.tar`, 36,259,840 bytes, SHA256 `f1908c6138255632e396bfac44f0191bc1832c88967077fa8bb7088e3dc5b290`; all 439 static files match the manifest, with safe archive paths/types. The source manifest pins 2,066 inputs in both the integrator and isolated build checkout. Post-build validation preserves all 36 original atlas PNGs and 323 generated pages. Private production-candidate reconnect preserves ordinary test identity, position, all 48 inventory slot rows and wallet. The actual candidate Video screenshot was opened: Canvas 1×, no experimental control in Video, readable HUD/footer. Basic is the selected test preference, not a lighting-default change. Read-only public preflight still matches all 384 retained live 0.5.7 files; no release was published.

Rollback artifact: `output/perf-59-20260906/release/client-dist-before-0.6.0.tar`, SHA256 `7fa8d720be56039a58bd99c1a6d0e825d48cf1716f2047bb0d3aa1fc265bf3ac`. Publication commands first verify both archives and live continuity, retain the exact old directory, stop/swap/start only the frontend, validate public static serving and require live same-account postflight. A failed required gate stops or rolls back. These commands are a reviewable request only; release-specific owner Go remains required by A-19 and `ops/orchard-runtime/README.md` §Lifecycle code checks and release approval.

| Final desktop evidence (ms) | p50 | p95 | p99 |
|---|---:|---:|---:|
| Pinned cliff Dynamic whole frame | 8.199998856 | 12.299999237 | 16 |
| Pinned cliff Dynamic lightingMerge | 0.600000381 | 0.900003433 | 2.099998474 |
| Larger cliff whole frame (supplementary) | 7.600000381 | 10.299999237 | 14.600000381 |
| Larger cliff lightingMerge (supplementary) | 0 | 0.700000763 | 0.899997711 |
| Larger cliff rAF gap (supplementary) | 16.7 | 16.7 | 16.8 |
| Physical iPad | owner to run | owner to run | owner to run |

The preceding original tables contain every stage and counter, device/OS/browser/DPR/zoom/resolution/commit/settings metadata, six matched route/mode comparisons and their qualification limits. All 12 warm before/after protocol captures have zero ≥50 ms tasks; surface allocations and filtered-frame builds are zero. Six mode cycles leave Basic with zero lighting bytes and Basic/Classic with zero omit bytes; Classic retains its approved legacy field. Historical Basic 6.3 ms is accepted as met; fresh Basic p95 6.700000763 ms remains recorded separately. Dynamic merge meets 1.5 ms, but whole-frame p95 remains 2.299999237 ms above 10 ms. Dominant stage p95 values are painterDraw 6.200000763 ms, finalWorldComposite 2.300001144 ms and painterBuild 1.399999619 ms; nested percentiles must not be summed.

**Cliff limitation and open gates.** The complete owner-reported halt remains unreproduced. The ordinary old/current cliff comparison improves steady delivery but still shows a first-Dynamic cold task of 136–153 ms (old 127 ms), separate from warm acceptance. Partial profiled attribution does not prove one sole cause. A-14 remains OPEN after three approaches; A-15/A-16 amended pixel gates pass and A-17's six normal-route fallback sets are empty, but SwiftShader WebGL cliff p95 62.2–93.9 ms fails performance. Canvas gains are prepared independently of these experimental enable gates. Ten complete Canvas golden boards are byte-exact including HUD; 16 control fixtures and 18 minute movement reviews are retained. The final release request explicitly records each residual rather than claiming the original full Definition of Done is satisfied.

**Owner capture.** iPad remains **owner to run**: on an accessible candidate, System → Developer → Render → **Run protocol + copy JSON**, separately at cliff/carried-light and pond, repeating lighting modes/world scales. Record device, OS, browser, DPR, browser zoom, resolution, commit and backend/scale with each sample. No CPU-throttled substitute. Hardware GPU qualification also remains owner to run. Release preparation is complete; deployment awaits an explicit Go for this reviewed artifact.


### 2026-09-08 — Owner-approved 0.6.0 gameplay deployment

Owner approved the specific reviewed release in chat: **Go for deployment**. Installed the unchanged `client-0.6.0-fd0cb7e6.tar` (SHA256 `f1908c6138255632e396bfac44f0191bc1832c88967077fa8bb7088e3dc5b290`) into the gameplay static directory and restarted only `orchard-frontend.service`. No source rebuild, world publication, data/schema migration or Studio deployment. All 2,066 source-manifest inputs remain identical to the fully checked runtime (644 files / 3,670 tests); this is an operational/docs checkpoint, not a new runtime implementation.

The first immediate public validation returned HTTP502 during service startup. Its error trap automatically restored0.5.7, and all384 old files/public serving were reverified. Reported the failed attempt before retrying. A bounded exact-public-HTML readiness wait resolved the Type=simple startup race; the second attempt deployed the same approved archive and passed the unchanged dry/public validator. No gate was bypassed. Logs, executed commands, readiness attempts and rejected first-attempt bytes are preserved under `output/perf-59-20260908/release/deployment/`.

All439 public files byte-match the candidate manifest. Actual canonical-origin ordinary-account reconnect preserves identity, position,48 inventory slots and wallet. Studio PID/start time, guard/package, AGENTS.md and `.git/cellar-ui-release.md` are unchanged. Reviewed actual-origin screenshots of Basic/Classic/Dynamic cliffs, caps/shadows, both pond sky witnesses, HUD and Video: Canvas1×, no fallback, WebGL off and absent from Video. No intercepted static routes; service workers disabled in the validation browser. Existing-client service-worker upgrade paths are not separately claimed by this deployment check.

Supplementary larger-route postflight: 5s warm-up +30s active-rAF, Canvas1×,1280×720,DPR1. Whole-frame p50/p95/p99/max: Basic5.5/6.800001144/8.099998474/14.700000763ms; Classic6.899999619/8.400001526/10.099998474/18.600000381ms; Dynamic8.799999237/15.799999237/18.399999619/24ms. Dynamic merge0.5/2.300003052/2.699998856/8ms. All three have zero≥50ms warm tasks. All22 stages and per-frame counters, device/commit/settings metadata and raw traces are in deployment/performance.md and live-cliff-*.json. Screenshot inspection adds overhead; Dynamic reports changed content and all routes retain the separate-pond qualification. These moving-route checks do not replace the pinned A1 merge target evidence. No claim that the cold136–153ms first-Dynamic hitch or owner's complete halt has been eliminated. Physical iPad remains **owner to run**, using the previously documented in-game capture steps; WebGL enable gates remain open/Developer-only.

Rollback retains the exact old directory at `output/perf-59-20260908/release/live-before-0.6.0/dist` and the previously hashed0.5.7 tar. `release/commands.md` retains exact rollback commands; `deployment/publish-with-readiness.sh` records the successful publication. Deployment is complete and supersedes the preceding awaiting-Go status. Canvas1× defaults and all experimental limitations remain unchanged.


### 2026-09-08 — F3 FPS and periodic shadow-direction pause: implementation claim

Owner requests an actual FPS counter in F3 and reports a slight pause whenever shadow directions update. Add delivered-frame cadence (count only submitted game frames, respecting30Hz cap), show frame gaps separately from CPU submission time, and retain visible spikes over a bounded recent window. Reset cadence around hidden-tab transitions rather than reporting a sleeping tab as a gameplay stall. First mechanically extract only the owned F3 timing row from overworld-main.ts with identical output. Then implement in bounded diagnostic/metrics modules and test60/120Hz, cap/skips, stalls and visibility. Attribute repeated celestial-direction updates with actual-client captures; preserve exact current masks/texels and atomic lighting transitions. All original artwork stays unchanged. Scope covers metrics/loop diagnostic seams, the extracted timing-row module and directional/receiver caches if measured evidence supports an exact fix; no WebGL gate relaxation. Evidence under output/perf-59-20260908/P0/fps-shadow-update/. Studio's guard and live artifact are untouched. A fresh release request follows any checked runtime change; prior Go covered only0.6.0.


**F3 mechanical checkpoint:** extracted only the timing snapshot call and existing FRAME row into `packages/client/src/debug-frame-timing.ts`; `overworld-main.ts` forwards to them. Reversing the import/calls reconstructs the original monolith byte for byte (`fps-shadow-update/mechanical-proof.txt`). No metric, text, layout or render behavior changed. `npm run check` passed,644 files/3,670 tests,891.9978466033936seconds; `git diff --check` passed. The pre-change F3 screenshot was opened. Direction-stress baseline and original22-stage/counter samples are under `output/perf-59-20260908/P0/fps-shadow-update/shadow-before.json`; accelerated sky0.03h/second is labelled diagnostic, not normal-time frequency. Warm whole-frame9/16.5/24.8999996185/max42.3999996185ms,zero≥50ms warm tasks; raw warm-up includes65.5999984741ms. Geometry-rebuild counters coincide with spikes; CPU/heap attribution is supplementary and includes profiling overhead. Pixel-equivalent mask and RGB-reuse prototypes remain output-only until feature checks. No deployment.

### 2026-09-08 — F3 delivered FPS and frame-gap display (0.6.1 follow-up)

**Implementation.** Following mechanical checkpoint8404ff7b, F3 now shows submitted game-frame FPS over one second, latest frame gap and maximum gap over five seconds, separately from CPU submission cost. It counts actual game renders at rAF timestamps, respects the30Hz presentation cap, and does not claim physical GPU scanout. The interval crossing the one-second boundary is prorated so rounded browser timestamps do not spuriously report31FPS under a30Hz cap. Hidden-tab/start/stop transitions reset cadence; real foreground stalls remain visible. Two fixed2048-entry Float64 rings retain32768bytes; recording allocates no objects or surfaces. F3 snapshots refresh at most four times per second, avoiding per-frame sorting of all diagnostic distributions.

**Files.** Engine `presentation-metrics.ts`, its tests and `metrics.ts`; client `debug-frame-timing.ts`, `presentation-visibility.ts`, `loop.ts`, `gameplay-loop.ts` and their bounded tests. Root/client version metadata and lockfile become0.6.1; other workspace versions and Studio remain unchanged. Doc21 documents the distinction between delivered FPS and CPU cost. No additional monolith logic edits follow its mechanical extraction.

**Commands/evidence.** `npm run check` passes on the complete final FPS+shadow working tree:650 test files /3688 tests,911.5909390449524seconds (`output/perf-59-20260908/P0/fps-shadow-update/final/check.log`, `check.exit`, `check-duration.json`). Focused corrected-FPS tests:4files/15tests; combined follow-up tests:10files/42tests, client typecheck and scoped ESLint pass. Earlier FPS check was deliberately interrupted after browser testing exposed whole-event boundary flicker; `fps/interrupted-check.json` and original logs are retained, not counted as a pass. Final check includes the corrected boundary tests. Tests cover30/60/120/144Hz, skipped/capped renders, rounded timestamps, stalls, duplicate timestamps, clock restart, visibility/listener disposal and snapshot throttling.

Actual private production-client F3 screenshots were opened: `f3-off.png`, `f3-30hz.png`, `f3-injected-spike.png`. Browser results in `fps-browser-validation.json`: uncapped60FPS at16.7ms latest gap; capped30.003003003FPS at33.2ms latest gap while underlying rAF remains59.880236785Hz. A deliberately injected120ms main-thread pause produces54FPS and116.7ms maximum gap (rAF phase); this is a counter demonstration, not a naturally occurring performance sample. Source hashes are in `fps-source-files.json`; the original incorrect screenshots/results are explicitly retained as `*-before-boundary-correction.*`. No performance claim is made from functional screenshots or reviews run alongside the full check.

The final shared before/after shadow capture below records every stage/counter with this same corrected FPS implementation in both variants. All10 normal Canvas golden boards remain byte-identical, including HUD; the intentional new F3 text is separately reviewed. Nine one-minute movement reviews cover each Canvas world scale and lighting mode, all connected and moving without fallback. Pond sky witnesses and all screenshots were opened (`visual-inspection.json`, `visual-replay/results.json`, `goldens/comparison.json`). Six mode cycles leave Basic with0 retained lighting bytes and Basic/Classic with0 omit bytes (`mode-cycles.json`). All36 original atlas PNGs and323 generated pages remain unchanged in both worktrees (`original-atlases.json`, `generated-pages.json`). Artifact root for every path in this entry is `output/perf-59-20260908/P0/fps-shadow-update/`.

| Device / counter validation | Result |
|---|---|
| Desktop, Ryzen9 9955HX, Linux6.17.2, Chrome152.0.7977.64,1280×720,DPR1, browser zoom1, world zoom2, Canvas1× | 60FPS uncapped;30.003003003FPS capped; injected stall visible |
| iPad | **owner to run** |

Owner capture: System→Developer→Render→**Run protocol +copyJSON**, at cliff/carried-light and pond, with F3 open to inspect FPS/gaps; repeat modes/scales and record device/OS/browser/DPR/browser zoom/resolution/commit/backend/world scale. No CPU-throttled substitute.0.6.1 is not deployed; prior Go covered0.6.0 only.

### 2026-09-08 — Exact shadow-direction work reductions; recurring pause remains a residual

**Files/change.** `packages/engine/src/receiver-lighting.ts` now retains plane RGB when only celestial geometry changes. Existing coverage-byte comparisons update the changed texels; static-caster content and sky RGB still invalidate the full plane. Geometry continues to invalidate projected masks, prepared heights and coverage, so no stale direction is displayed. `directional-shadows.ts` avoids `Math.hypot` outside the existing2–10px contact band: the old clamp is exactly0/1 there, with unchanged mask bytes and integrals. No changed shadow shape, temporal approximation, extra cache budget, surface, delayed update or world readback. New bounded `receiver-direction-update.test.ts` and `directional-shadow-golden.test.ts` pin full-merge equivalence/invalidation and the original320-case mask digest. Controlled30-direction fixture:144000→5268 RGB texels merged with exactly equal pixels; this is a work-count result, not a game-frame timing claim. The frozen1,880,710 mask bytes hash to `135b22553ce1fdc26f39a2127cdc2cd01966e98ffcbfa9cef5dfdd3dcf629cb1`.

**Gates.** Complete final FPS+shadow `npm run check`:650 files/3688 tests,911.5909390449524seconds, pass. Focused10files/42tests, client typecheck, scoped ESLint,10 byte-identical complete Canvas golden boards, nine one-minute connected/moving mode×scale reviews and two pond sky witnesses pass. Every screenshot was opened. All36 original atlas PNGs and323 generated pages remain unchanged; no runtime filtered-frame machinery returns. Source hashes still match the checked working tree. See the preceding FPS entry for exact files/commands/artifacts and mode-cycle byte counters. No fresh full check is claimed for each browser run; unchanged checked code is shared by all captures.

**Attribution and measurement limits.** The original accelerated-sky probe coincides with prepared-height/coverage rebuilds on four receiving layers. Supplementary CPU/heap sampling identifies terrain cap/flat-run collection and projection work; native Canvas work is substantial. This is partial attribution, not proof that a single function accounts for the entire hitch. Both exact reductions are retained, but RGB+geometry changes still require full recolouring and coverage reconstruction still bursts. No claim that periodic pauses, cold first-Dynamic136–153ms tasks, the previously reported complete halt, or all desktop targets are resolved.

Artifact root: `output/perf-59-20260908/P0/fps-shadow-update/`. `measure-directions.py` runs5s warm-up+30s active-rAF each for walking cliff/carried-light and a stationary cliff diagnostic, before then after; `repeat-measure-directions.py` repeats after then before because live content changed during the first updated walking run. Both variants use the same corrected0.6.1 FPS code and differ only in the two engine modules; their original parent hash8404ff7b plus2069-file manifests identify exact inputs. `candidate-source-manifest.json` identifies checked final source. Each raw JSON records commit, source variant, device/OS/browser, resolution1280×720,DPR1,browser zoom1,world zoom2,Canvas1×,cap off and sky0.03h/second. This deliberately accelerated cadence is a diagnostic, not normal celestial frequency or full A1 qualification. No concurrent agent check/build/profile ran during captures. World content and collision-limited motion remain live: each workload issue is retained, stationary samples intentionally report `local_player_not_walking`, and cliff samples retain `no_pond`; separate pond images satisfy visual review only. Reversed samples are additional evidence, not replacements for rejected/mismatched earlier results.

The first driver attempted browser RPC four seconds after launch, before ordinary PKCE sign-in finished. No measurement started. The same browser signed in normally and was reused with candidate reload; `*.startup-race` and `startup-race-note.txt` preserve the test-harness failure. There was no game authentication/production fault and no owner action was needed. `performance.json`/`performance.md` retain all original distributions, counters, unsupported-stage flags, sky-step first-frame timing, bounded warm prepared-height-rebuild subsets and separate raw warm-up maxima. Prepared-height counters are a proxy that can also include content/height changes; sky-step first-frame data identifies the protocol's changed-sky frame directly. Post-protocol screenshots show restored Basic, not the measured Dynamic state; actual Dynamic review remains in the nine-minute matrix.

The following tables use **p50 /p95 /p99 /maximum**, original milliseconds for stages and per-frame values for counters; nested percentiles must not be summed. First sequence is before→after; repeat is after→before. Exact source/qualification metadata accompanies every raw sample.

First sequence — columns before walking /after walking /before stationary /after stationary.

| Stage/counter | Before walk | After walk | Before still | After still |
|---|---|---|---|---|
| whole frame | 8.09999847412 / 14.8999996185 / 20.8000011444 / 45.4000015259 | 9 / 16.5 / 23.5 / 56.7999992371 | 6.90000152588 / 10.1999988556 / 20.7999992371 / 47.7000007629 | 7.69999885559 / 10.6999988556 / 20 / 59.6000003815 |
| rAF interval | 16.7 / 16.7 / 16.8 / 33.4 | 16.7 / 16.8 / 16.8 / 50 | 16.7 / 16.8 / 16.8 / 33.4 | 16.7 / 16.7 / 16.8 / 50.1 |
| snapshotPrepare | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.5 | 0 / 0.10000038147 / 0.10000038147 / 0.299999237061 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 |
| ground | 0.299999237061 / 0.39999961853 / 0.5 / 0.60000038147 | 0.299999237061 / 0.5 / 0.599998474121 / 0.700000762939 | 0.300001144409 / 0.5 / 0.60000038147 / 1.70000076294 | 0.300001144409 / 0.5 / 0.60000038147 / 0.799999237061 |
| painterBuild | 0.900001525879 / 1.30000114441 / 1.60000038147 / 7.60000038147 | 1 / 1.70000076294 / 2 / 5.69999885559 | 1 / 1.60000038147 / 1.89999961853 / 3.39999961853 | 1.10000038147 / 1.79999923706 / 1.90000152588 / 5.39999961853 |
| painterSort | 0.199998855591 / 0.300001144409 / 0.39999961853 / 1.5 | 0.199998855591 / 0.300001144409 / 0.300001144409 / 0.89999961853 | 0.199998855591 / 0.300001144409 / 0.300001144409 / 0.60000038147 | 0.199998855591 / 0.300001144409 / 0.300001144409 / 1.09999847412 |
| painterDraw | 4 / 10.2000007629 / 13.5 / 34.3000011444 | 4.39999961853 / 11.1000003815 / 16.4000015259 / 44.9000015259 | 3.20000076294 / 4.79999923706 / 11.5 / 35.8000011444 | 3.30000114441 / 4.69999885559 / 11.1000003815 / 49.1000003815 |
| weather | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 |
| lightingBoundsResize | 0 / 0.0999984741211 / 0.10000038147 / 0.200000762939 | 0 / 0 / 0.10000038147 / 0.200000762939 | 0 / 0 / 0.10000038147 / 0.10000038147 | 0 / 0 / 0.10000038147 / 0.10000038147 |
| lightingOcclusionRaster | 0 / 0.200000762939 / 0.300001144409 / 0.400001525879 | 0 / 0.200000762939 / 0.39999961853 / 0.5 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingSolve | 0.0999984741211 / 0.200000762939 / 0.200000762939 / 0.299999237061 | 0.10000038147 / 0.200000762939 / 0.200000762939 / 0.300001144409 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingMerge | 0.5 / 2.20000076294 / 8.80000114441 / 16.6000003815 | 0.60000038147 / 2.60000038147 / 8.89999961853 / 23.4000015259 | 0 / 0.10000038147 / 10.7999973297 / 17.6000022888 | 0 / 0.10000038147 / 10.2000007629 / 23 |
| lightingUpload | 0 / 0.199998855591 / 0.299997329712 / 0.400001525879 | 0 / 0.200000762939 / 0.299999237061 / 0.300001144409 | 0 / 0 / 0 / 0.200000762939 | 0 / 0 / 0 / 0.200000762939 |
| lightingReceiver | 0.399997711182 / 0.699998855591 / 0.799999237061 / 1.09999847412 | 0.39999961853 / 0.700000762939 / 0.900001525879 / 2.30000114441 | 0.399997711182 / 0.700000762939 / 0.89999961853 / 2 | 0.39999961853 / 0.700002670288 / 0.900001525879 / 2.80000114441 |
| lightingComposite | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1 / 2.29999923706 / 2.60000038147 / 3.70000076294 | 1.10000038147 / 2.5 / 3 / 3.5 | 1 / 1.5 / 1.70000076294 / 5.90000152588 | 1.20000076294 / 3.19999885559 / 3.5 / 4.5 |
| uiModel | 0.299999237061 / 0.39999961853 / 0.400001525879 / 0.5 | 0.299999237061 / 0.5 / 0.599998474121 / 1.39999961853 | 0.299999237061 / 0.400001525879 / 0.5 / 1 | 0.300001144409 / 0.5 / 0.5 / 0.799999237061 |
| uiLayout | 0.39999961853 / 0.5 / 0.60000038147 / 3.10000038147 | 0.39999961853 / 0.60000038147 / 0.700000762939 / 1.39999961853 | 0.39999961853 / 0.60000038147 / 0.699998855591 / 3.60000038147 | 0.39999961853 / 0.60000038147 / 0.700000762939 / 1 |
| uiDraw | 0.39999961853 / 0.700000762939 / 0.89999961853 / 4.39999961853 | 0.39999961853 / 0.800001144409 / 1.10000038147 / 1.80000114441 | 0.39999961853 / 0.60000038147 / 0.700000762939 / 1 | 0.39999961853 / 0.60000038147 / 0.799999237061 / 1.19999885559 |
| fixedUpdate | 0.199998855591 / 0.300001144409 / 0.39999961853 / 3.09999847412 | 0.199998855591 / 0.300001144409 / 0.5 / 8.70000076294 | 0.10000038147 / 0.299999237061 / 0.300001144409 / 1 | 0.10000038147 / 0.200000762939 / 0.300001144409 / 0.60000038147 |
| catchUp | 0 / 0 / 0 / 0.299999237061 | 0 / 0 / 0 / 0.5 | 0 / 0 / 0 / 0.200000762939 | 0 / 0 / 0 / 0.300001144409 |
| drawImageCalls | 885 / 1216 / 1323 / 1845 | 883 / 1215 / 1292 / 1774 | 855 / 855 / 874 / 1485 | 855 / 855 / 874 / 1485 |
| distinctDrawImageSources | 339 / 356 / 362 / 363 | 328 / 352 / 361 / 362 | 327 / 327 / 328 / 331 | 327 / 327 / 328 / 330 |
| tintBuilds | 0 / 7 / 8 / 23 | 0 / 7 / 8 / 27 | 0 / 0 / 0 / 24 | 0 / 0 / 0 / 24 |
| tintReuses | 99 / 113 / 116 / 119 | 98 / 114 / 115 / 117 | 97 / 110 / 114 / 114 | 101 / 110 / 114 / 114 |
| tintSurfaceReuses | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 |
| groundSourceOperations | 15 / 114 / 177 / 606 | 18 / 114 / 165 / 612 | 0 / 0 / 0 / 582 | 0 / 0 / 0 / 582 |
| imageDataAllocations | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| capRunRequests | 96 / 104 / 108 / 108 | 96 / 104 / 108 / 108 | 98 / 98 / 98 / 98 | 98 / 98 / 98 / 98 |
| flatSourceRequests | 218 / 236 / 236 / 236 | 207 / 236 / 236 / 236 | 205 / 205 / 205 / 205 | 205 / 205 / 205 / 205 |
| capRunComposites | 3 / 19 / 30 / 83 | 4 / 19 / 30 / 84 | 0 / 0 / 0 / 73 | 0 / 0 / 0 / 73 |
| flatSourceComposites | 0 / 18 / 39 / 124 | 2 / 17 / 34 / 127 | 0 / 0 / 0 / 121 | 0 / 0 / 0 / 121 |
| groundSourceReuses | 308 / 338 / 340 / 340 | 297 / 331 / 340 / 340 | 303 / 303 / 303 / 303 | 303 / 303 / 303 / 303 |
| receiverSamples | 297 / 303 / 308 / 308 | 297 / 303 / 308 / 308 | 300 / 300 / 300 / 300 | 300 / 300 / 300 / 300 |
| receiverCandidates | 744 / 843 / 858 / 876 | 741 / 867 / 879 / 882 | 742 / 872 / 877 / 877 | 742 / 872 / 877 / 877 |
| receiverFullLoopCandidates | 98010 / 99990 / 102564 / 102564 | 98235 / 99990 / 102564 / 102564 | 97500 / 97500 / 97500 / 97500 | 97500 / 97500 / 97500 / 97500 |
| saveCalls | 549 / 572 / 581 / 594 | 545 / 565 / 574 / 575 | 540 / 540 / 542 / 564 | 540 / 540 / 542 / 564 |
| restoreCalls | 549 / 572 / 581 / 594 | 545 / 565 / 574 / 575 | 540 / 540 / 542 / 564 | 540 / 540 / 542 / 564 |
| saveRestorePairs | 549 / 572 / 581 / 594 | 545 / 565 / 574 / 575 | 540 / 540 / 542 / 564 | 540 / 540 / 542 / 564 |
| surfaceAllocations | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| ≥50ms tasks (count) | 0 | 2 | 0 | 2 |
| sky-step first-frame CPU | 20.8000011444 / 36.3999996185 / 45.4000015259 / 45.4000015259 | 20.3000011444 / 52.5 / 56.7999992371 / 56.7999992371 | 21.5 / 36 / 36.8999996185 / 36.8999996185 | 20.3000011444 / 50.8999996185 / 59.6000003815 / 59.6000003815 |
| sky-step first-frame merge | 9.90000152588 / 16.4999961853 / 16.6000003815 / 16.6000003815 | 9.59999847412 / 22.0000038147 / 23.4000015259 / 23.4000015259 | 11.4999980927 / 16.1999988556 / 17.6000022888 / 17.6000022888 | 11.3000011444 / 22.6999988556 / 23 / 23 |

`direction-before-walking.json`: issues `no_pond`; 1 content revisions; 1795 warm frames.

`direction-after-walking.json`: issues `seed_season_or_content_changed, no_pond`; 12 content revisions; 1781 warm frames.

`direction-before-stationary.json`: issues `local_player_not_walking, no_pond`; 1 content revisions; 1791 warm frames.

`direction-after-stationary.json`: issues `local_player_not_walking, no_pond`; 1 content revisions; 1788 warm frames.


Reverse-order repeat — columns before walking /after walking /before stationary /after stationary.

| Stage/counter | Before walk | After walk | Before still | After still |
|---|---|---|---|---|
| whole frame | 8.10000038147 / 15 / 23.7999992371 / 55.8999996185 | 7.5 / 11.2000007629 / 19.5999984741 / 46.6999988556 | 6.89999961853 / 8.60000038147 / 20.3000011444 / 39.8999996185 | 7 / 9.70000076294 / 18 / 50.6999988556 |
| rAF interval | 16.7 / 16.8 / 16.8 / 49.9 | 16.7 / 16.8 / 16.8 / 33.4 | 16.7 / 16.7 / 16.8 / 33.4 | 16.7 / 16.7 / 16.8 / 50 |
| snapshotPrepare | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.39999961853 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 |
| ground | 0.300001144409 / 0.5 / 0.5 / 0.799999237061 | 0.299999237061 / 0.400001525879 / 0.5 / 0.700000762939 | 0.299999237061 / 0.400001525879 / 0.5 / 1.30000114441 | 0.300001144409 / 0.5 / 0.599998474121 / 1 |
| painterBuild | 1.09999847412 / 1.60000038147 / 1.89999961853 / 6.10000038147 | 1 / 1.5 / 1.79999923706 / 2.5 | 1 / 1.39999961853 / 1.69999885559 / 2.5 | 1 / 1.59999847412 / 1.70000076294 / 2.20000076294 |
| painterSort | 0.199998855591 / 0.300001144409 / 0.300001144409 / 0.5 | 0.199998855591 / 0.300001144409 / 0.300001144409 / 0.60000038147 | 0.199998855591 / 0.299999237061 / 0.300001144409 / 0.400001525879 | 0.199998855591 / 0.300001144409 / 0.300001144409 / 0.5 |
| painterDraw | 3.89999961853 / 8.89999961853 / 15.2000007629 / 43.5 | 3.5 / 6.20000076294 / 11.5 / 36.7999992371 | 3.20000076294 / 4.19999885559 / 11.6999988556 / 31.6000003815 | 3.29999923706 / 4.5 / 10.3999996185 / 34.2999992371 |
| weather | 0 / 0.10000038147 / 0.10000038147 / 0.300001144409 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.10000038147 / 0.60000038147 | 0 / 0.10000038147 / 0.10000038147 / 0.200000762939 |
| lightingBoundsResize | 0 / 0 / 0.10000038147 / 0.200000762939 | 0 / 0.0999984741211 / 0.10000038147 / 0.299999237061 | 0 / 0 / 0.10000038147 / 0.10000038147 | 0 / 0 / 0.10000038147 / 0.10000038147 |
| lightingOcclusionRaster | 0 / 0.199998855591 / 0.300001144409 / 0.5 | 0 / 0 / 0.300001144409 / 0.400001525879 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingSolve | 0 / 0.200000762939 / 0.200000762939 / 0.300001144409 | 0 / 0.199998855591 / 0.200000762939 / 0.300001144409 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingMerge | 0.399995803833 / 2.60000038147 / 9.10000228882 / 21.9999980927 | 0 / 2.09999847412 / 9.5 / 16.3999996185 | 0 / 0.10000038147 / 9.10000038147 / 16.8000011444 | 0 / 0.10000038147 / 8.59999847412 / 23.3999996185 |
| lightingUpload | 0 / 0.199998855591 / 0.299999237061 / 0.300001144409 | 0 / 0.10000038147 / 0.200000762939 / 0.39999961853 | 0 / 0 / 0 / 0.299999237061 | 0 / 0 / 0 / 0.299999237061 |
| lightingReceiver | 0.39999961853 / 0.700000762939 / 0.89999961853 / 1.4999961853 | 0.399997711182 / 0.699998855591 / 0.800001144409 / 1.30000114441 | 0.300001144409 / 0.699998855591 / 0.800003051758 / 5.30000114441 | 0.399997711182 / 0.700000762939 / 0.899997711182 / 1.59999847412 |
| lightingComposite | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| finalWorldComposite | 1.10000038147 / 2.29999923706 / 3 / 3.79999923706 | 1.10000038147 / 2.29999923706 / 2.59999847412 / 3.70000076294 | 1 / 1.20000076294 / 1.5 / 2.29999923706 | 1.10000038147 / 1.5 / 1.70000076294 / 4.60000038147 |
| uiModel | 0.299999237061 / 0.5 / 0.5 / 0.60000038147 | 0.299999237061 / 0.39999961853 / 0.5 / 1 | 0.299999237061 / 0.39999961853 / 0.5 / 3.5 | 0.299999237061 / 0.400001525879 / 0.5 / 6.10000038147 |
| uiLayout | 0.39999961853 / 0.599998474121 / 0.699998855591 / 7.39999961853 | 0.39999961853 / 0.5 / 0.699998855591 / 7 | 0.39999961853 / 0.5 / 0.60000038147 / 6.30000114441 | 0.39999961853 / 0.5 / 0.60000038147 / 0.800001144409 |
| uiDraw | 0.39999961853 / 0.800001144409 / 1.10000038147 / 1.69999885559 | 0.39999961853 / 0.700000762939 / 0.89999961853 / 1.30000114441 | 0.39999961853 / 0.5 / 0.699998855591 / 1 | 0.39999961853 / 0.60000038147 / 0.700000762939 / 0.89999961853 |
| fixedUpdate | 0.199998855591 / 0.300001144409 / 0.39999961853 / 8 | 0.199998855591 / 0.299999237061 / 0.39999961853 / 1.79999923706 | 0.10000038147 / 0.200000762939 / 0.300001144409 / 2.79999923706 | 0.10000038147 / 0.200000762939 / 0.300001144409 / 6.70000076294 |
| catchUp | 0 / 0 / 0 / 0.39999961853 | 0 / 0 / 0 / 0.39999961853 | 0 / 0 / 0 / 0.200000762939 | 0 / 0 / 0 / 0.299999237061 |
| drawImageCalls | 886 / 1218 / 1294 / 1761 | 886 / 1216 / 1350 / 1837 | 855 / 855 / 874 / 1485 | 855 / 855 / 874 / 1485 |
| distinctDrawImageSources | 340 / 361 / 362 / 363 | 340 / 362 / 362 / 363 | 327 / 327 / 328 / 330 | 327 / 327 / 328 / 331 |
| tintBuilds | 0 / 1 / 8 / 25 | 0 / 0 / 1 / 21 | 0 / 0 / 0 / 24 | 0 / 0 / 0 / 24 |
| tintReuses | 100 / 112 / 115 / 118 | 102 / 112 / 115 / 118 | 97 / 110 / 114 / 114 | 97 / 110 / 114 / 114 |
| tintSurfaceReuses | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 |
| preparedHeightRebuilds | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 | 0 / 0 / 4 / 4 |
| groundSourceOperations | 9 / 123 / 177 / 618 | 0 / 123 / 177 / 627 | 0 / 0 / 0 / 582 | 0 / 0 / 0 / 582 |
| imageDataAllocations | 0 / 0 / 2 / 2 | 0 / 0 / 2 / 2 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| capRunRequests | 96 / 104 / 108 / 108 | 96 / 104 / 104 / 104 | 98 / 98 / 98 / 98 | 98 / 98 / 98 / 98 |
| flatSourceRequests | 220 / 236 / 236 / 236 | 222 / 236 / 236 / 236 | 205 / 205 / 205 / 205 | 205 / 205 / 205 / 205 |
| capRunComposites | 3 / 18 / 28 / 84 | 0 / 13 / 19 / 84 | 0 / 0 / 0 / 73 | 0 / 0 / 0 / 73 |
| flatSourceComposites | 0 / 20 / 40 / 122 | 0 / 28 / 40 / 131 | 0 / 0 / 0 / 121 | 0 / 0 / 0 / 121 |
| groundSourceReuses | 316 / 340 / 340 / 340 | 316 / 340 / 340 / 340 | 303 / 303 / 303 / 303 | 303 / 303 / 303 / 303 |
| receiverSamples | 296 / 303 / 303 / 308 | 296 / 303 / 303 / 303 | 300 / 300 / 300 / 300 | 300 / 300 / 300 / 300 |
| receiverCandidates | 704 / 863 / 877 / 922 | 699 / 828 / 866 / 878 | 742 / 872 / 877 / 877 | 742 / 872 / 877 / 877 |
| receiverFullLoopCandidates | 97680 / 99990 / 99990 / 102564 | 97680 / 99990 / 99990 / 99990 | 97500 / 97500 / 97500 / 97500 | 97500 / 97500 / 97500 / 97500 |
| saveCalls | 550 / 574 / 575 / 583 | 555 / 574 / 581 / 595 | 540 / 540 / 542 / 564 | 540 / 540 / 542 / 564 |
| restoreCalls | 550 / 574 / 575 / 583 | 555 / 574 / 581 / 595 | 540 / 540 / 542 / 564 | 540 / 540 / 542 / 564 |
| saveRestorePairs | 550 / 574 / 575 / 583 | 555 / 574 / 581 / 595 | 540 / 540 / 542 / 564 | 540 / 540 / 542 / 564 |
| surfaceAllocations | 0 / 0 / 0 / 21 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| ≥50ms tasks (count) | 1 | 0 | 0 | 1 |
| sky-step first-frame CPU | 23.6000003815 / 47 / 55.8999996185 / 55.8999996185 | 20.1000003815 / 37.3999996185 / 39.7999992371 / 39.7999992371 | 21.5 / 38.3000011444 / 39.8999996185 / 39.8999996185 | 18.5 / 41.6000003815 / 50.6999988556 / 50.6999988556 |
| sky-step first-frame merge | 10.9000015259 / 18.3000011444 / 21.9999980927 / 21.9999980927 | 10.5999965668 / 14.3999996185 / 16.3999996185 / 16.3999996185 | 10.5000019073 / 16 / 16.8000011444 / 16.8000011444 | 9.99999809265 / 15.6999988556 / 23.3999996185 / 23.3999996185 |

`repeat-direction-before-walking.json`: issues `seed_season_or_content_changed, no_pond`; 3 content revisions; 1786 warm frames.

`repeat-direction-after-walking.json`: issues `seed_season_or_content_changed, local_player_not_walking, no_pond`; 3 content revisions; 1792 warm frames.

`repeat-direction-before-stationary.json`: issues `local_player_not_walking, no_pond`; 1 content revisions; 1793 warm frames.

`repeat-direction-after-stationary.json`: issues `local_player_not_walking, no_pond`; 1 content revisions; 1793 warm frames.

**Result/residual.** No reliable end-to-end speedup is established. First walking whole-frame p95 worsens14.8999996185→16.5ms with content changes, whereas reverse-order walking improves15→11.2000007629ms but fails matched walking/content qualification. Stationary p99 improves20.7999992371→20ms and20.3000011444→18ms, yet p95 worsens10.1999988556→10.6999988556ms and8.60000038147→9.70000076294ms; updated stationary maxima59.6000003815/50.6999988556ms remain above the original47.7000007629/39.8999996185ms. Updated runs have2/2/0/1 warm≥50ms tasks (first walking/stationary, repeat walking/stationary); this does not meet the zero-long-task objective. Retain all these original values rather than selecting only the favourable percentiles. The code proves fewer exact RGB operations in the controlled direction-only case and removes redundant distance evaluation; further work is needed to eliminate the visible pause when multiple layers and sky RGB refresh together. No fourth WebGL sampler attempt or lighting approximation was added. Historical owner-accepted Basic6.3ms remains accepted, not remeasured by these Dynamic diagnostics.

| Remaining device gate | Status |
|---|---|
| Desktop recurring shadow pause | Residual; exact work reductions pass, timing improvement unqualified |
| iPad | **owner to run** |

Owner capture: System→Developer→Render→**Run protocol +copyJSON**, separately at cliff/carried-light and pond with normal sky progression; inspect F3 recent maximum gap, repeat required lighting/world scales, and record device/OS/browser/DPR/browser zoom/resolution/commit/backend/scale. No desktop-throttling substitute.0.6.1 gameplay-only release preparation follows; no deployment is authorized by the previous0.6.0 Go.

### 2026-09-08 — Gameplay0.6.1 artifact and release request prepared; not deployed

FPS and exact shadow work reductions are committed in23f07407/d2b75e60. Packaged runtime `d2b75e60413dd0e6c399bf67522b08c5e7bbbc22` as `output/perf-59-20260908/fps-shadow-release/client-0.6.1-d2b75e60.tar`,36259840bytes,SHA256 `276e9da310c26f6bee4eb0e47915afab968fb92694c42c1f09fec8e8f6ae16d4`. All2069 source inputs match the checked runtime and isolated build; all439 archive files match the static manifest with safe paths/types. The final docs-only checkpoint changes no checked runtime bytes. The preceding original eight-capture stage/counter tables and all qualification failures remain binding; packaging is not a new performance sample or a claim that the recurring shadow pause is solved.

`package-candidate.py` ran the isolated gameplay-only production build with `VITE_RENDER_COMMIT=d2b75e60413dd0e6c399bf67522b08c5e7bbbc22`, `npm run client:chunks:check`, and candidate-specific `CLIENT_STATIC_REPOSITORY`/output-only `CLIENT_STATIC_UNIT`/`CLIENT_STATIC_DRY_RUN=true npm run client:static:validate`: pass. No root all-workspaces or Studio build; canonical Studio prebuild guard and its separate release-source reference are preserved. Complete unchanged code gate:650files/3688tests,911.5909390449524seconds. `reconnect.py` preserves ordinary identity, position,48 inventory rows and wallet. Final packaged F3/settings/Video screenshots were opened:60FPS, Canvas1×, cap off, no fallback and no WebGL control in Video. Basic is the test account preference, not a changed lighting default. All36 original atlas PNGs and323 generated pages remain unchanged after packaging.

`live-preflight.py` proves all439 current0.6.0 local static files and public HTML remain unchanged. Frontend/Studio PID/start times, Studio package/guard, AGENTS.md and `.git/cellar-ui-release.md` match preflight. `README.md`/`commands.md` contain concrete scope, gate results, original before/after timings and explicit residuals. Proposed publication and rollback scripts pass shell/Python syntax validation only; no live service action or static swap has executed. Publication uses a fresh ordinary-account witness, pinned archives, exact retained live directory, a bounded30s public HTML readiness wait,439-file public validation and same-player reconnect inside the rollback trap. The earlier test-browser startup race is resolved separately from this production readiness check.

Rollback for this new release is the **currently deployed0.6.0**, `output/perf-59-20260908/release/client-0.6.0-fd0cb7e6.tar`,SHA256 `f1908c6138255632e396bfac44f0191bc1832c88967077fa8bb7088e3dc5b290`; the old0.5.7 rollback is not the0.6.1 release rollback. No database publication/migration or Studio deployment. iPad remains **owner to run** via the preceding exact panel capture steps; no throttled substitution. Prior Go covered0.6.0 only. Prepared0.6.1 awaits a specific owner Go under `ops/orchard-runtime/README.md` §Lifecycle code checks and release approval.

### 2026-09-08 — P8 follow-up A: A-14a probe amendment claim and checkpoint

Claimed by codex after26e2b4e2. Read `output/investigation-webgl-20260908/README.md` first and accept its reproducible float32/probe and vfio-pci findings as established. Added§8.1 A-14a as explicitly directed by the owner: exclude phases within1e-4px of a half-pixel tie, preserve exact integer sampling and the noninteger≤1-texel/zero-coverage gate. Resolve the September8 A-14 OPEN row by this amendment, not by introducing another sampler approach. The35 collapsed-axis cases,3 marginal2× cases and864/864 independent non-tie sweep are the reason; no re-derivation or new tolerance.

Files: doc59,DECISIONS,roadmap. Output `P8/A14a/original-a14-manifest.json` pins all preserved original evidence; `A-unchanged-code-gate.json` verifies2069 runtime source hashes still match checked d2b75e60. `npm run check` remains green on unchanged code:650files/3688tests,911.5909390449524seconds. `git diff --check` passes. This is a docs-only checkpoint, not a new desktop timing sample; original stage/counter tables remain the preceding follow-up ledger. B reruns the unchanged prototype, then C integrates only if all requested gates pass; D records hardware unavailable. No deployment, world/schema change, backend default or toggle relocation. iPad remains **owner to run** through System→Developer→Render→Run protocol +copyJSON at both pinned routes with device/OS/browser/DPR/zoom/resolution/commit/backend/world scale recorded.

### 2026-09-08 — P8 follow-up B: unchanged prototype requalification claim

IN PROGRESS: codex, after2427f501. Copy the frozen A-14 browser bundle and probe sources into `output/perf-59-20260908/P8/A14a/prototype/`, hash-identical; never rebuild or overwrite originalP8/A14. Rerun120 crop,576 expanded and720 fractional cases, replacing only0.49999/0.50001 with0.499/0.501. Add a separate288-case sweep at0.4/0.6 so the requested two additional phases do not remove the original1/8,1/3,7/8 coverage or alter the720-case count. Integer-ratio draws must be exact and all noninteger draws must meet≤1 source-texel displacement with zero coverage failures. No production change or new tolerance; reused unchanged650file/3688test code gate. Checkpoint will retain original result counts, screenshot evidence and device/source manifests; SwiftShader accuracy only, hardware timing owner to run.

**B checkpoint PASS:** `npx tsx output/perf-59-20260908/P8/A14a/prototype/{run,expanded,fractional,additional-phases}.mts` passes120/120,576/576,720/720 and288/288 respectively. Integer-exact counts14/288/360/144; noninteger passing counts106/288/360/144; zero coverage failures in all1704 cases. The720-case fractional sweep changes only0.49999→0.499 and0.50001→0.501; the additional288 uses0.4/0.6. `B-result.json` and four full comparison JSONs preserve browser152.0.7977.64, Linux, DPR1/zoom1,1536×640/1536×768 viewports, source-parent0fd88267 and frozen-source hashes. `review.js` is byte-identical to the original; every originalA14 artifact hash still matches. The crop screenshot was opened. SwiftShader supplies functional accuracy evidence only, no stage timing/hardware performance claim. Unchanged650file/3688test runtime code gate and `git diff --check` pass. A-14a probe qualification is complete; C must requalify the integrated production candidate independently.

### 2026-09-08 — P8 follow-up C: guarded production integration claim

IN PROGRESS: codex, after773ca4af. Integrate the proven quotient mapping in bounded `webgl/geometry.ts`, `webgl/shaders.ts`, `webgl/world-pass-webgl.ts` plus a new bounded mapping module/tests. No monolith logic edits are needed; `renderer.ts` and `overworld-main.ts` stay untouched, so no new mechanical extraction is required. Retain every downsample, variant, composite and clip guard. Axis-aligned nearest integer-ratio image draws use integer texel selection; smoothed draws and raw ground planes retain texture(). Reuse the current clip shader's existing resolution uniform rather than duplicate the earlier prototype declaration. Geometry gains12 float attributes per vertex: capacity12288 vertices, CPU/GPU staging each1130496bytes instead of540672bytes, explicitly owned and disposed by existing geometry lifecycle; no new surface/readback/dependency.

Required same-candidate gates: full `npm run check`, A-14a production sweeps,10 byte-identical Canvas boards/HUD, A-15 edge attribution and A-16 CPU-variant gate, A-17 six fresh-session encountered sets. Keep Developer/off/default Canvas unchanged. All evidence underP8/A14a/production andP8/A14a/C; any gate failure stops C and leaves the production sampler out, while A/B/D still land. Existing preparation/deployment artifacts are not rebuilt or published by this task. Hardware timing remains owner to run; SwiftShader is functional evidence only.

### 2026-09-08 — P8 follow-up C checkpoint: production sampler and functional gates PASS

**C implementation/review.** Production changes are limited to `webgl/geometry.ts`, `shaders.ts`, `world-pass-webgl.ts`, new `integer-mapping.ts`/tests and two existing geometry-lifetime/raw-plane test assertions. The helper and shader quotient are byte-identical to the qualified prototype (`C/integration-proof.json`); the submission change only supplies the integer source rectangle and explicitly omits it for operation5 raw ground. Smooth/raw plane paths retain texture(); axis-aligned nearest integer-ratio image sampling uses texelFetch with integer arithmetic and the prototype's float32-aligned quad coverage. Every existing downsample, variant, composite and clip guard stays. Renderer/main monoliths are byte-identical, so no extraction was needed. No world/schema/default/toggle/deployment/dependency change.

Geometry capacity remains12288 vertices;23 floats per vertex replace11, making CPU and GPU staging each1130496bytes (formerly540672), total2260992bytes. Existing resource accounting/disposal owns both. New mapping tests exercise crop/independent ratios, quarter-turn/reflection, smooth/raw-plane and unsupported-domain selection. The first preliminary unit run still read the second vertex at the old stride11; `C/preflight-old-stride.log` preserves it. Before acceptance runs, the assertion was updated to the new stride23 with the same expected raw-plane UV/mode and an additional zero sampling-axis assertion. No rendering algorithm or tolerance was changed to fix that test adapter. Cleanup byte expectations likewise follow the explicitly recorded buffer growth. Focused10files/45tests and scoped ESLint pass.

**Same-candidate pixel gates.** Production built directly from the checked source, without the prototype build plugin, passes120/120 crop,576/576 expanded,720/720 amended fractional and288/288 additional phases (1704 total,806 integer exact/898 noninteger≤1-texel, all coverage failures0). Results under `production/` are distinct from `prototype/`; originalP8/A14 remains hash-identical. A-15 passes72/72: band maximum3, outside2, worst0.799560546875% channels above one, HUD0 and no outside-band>2 residual. `A15/current-edge-witness.png` shows Canvas/GPU/blue1px band/residual attribution and was opened; no pixel gate changed. A-16 production CPU/GPU variant240 cases: GPU/CPU maximum1, opaque reference maximum2, translucent4, HUD exact. Decoded-source432/emissive864/placement288 cases also pass the existing opaque≤2/translucent≤8 thresholds. All10 complete Canvas boards are byte-identical to the prior checked0.6.1/FPS baseline, including normal HUD; source/golden hashes retained.

**Lifecycle/allocation.**600 native effect-cache warm frames allocate0 surfaces/ImageData, with20 tint reuses and0 builds each frame, disposal0bytes/0surfaces.600 GPU clip-resource frames allocate0 surfaces/ImageData, preserve3314184 tracked bytes through actual WEBGL_lose_context restoration, and dispose to0 bytes/textures/buffers/programs/VAOs. Draw during loss is rejected and the deliberate loss reports only `webgl_context_lost`; this isolated injected failure is not included in the normal A-17 encountered sets. All36 original atlas PNGs and323 generated pages are unchanged in both roots. No runtime readback/filter/filtered-frame machinery is added; the full repository readback guard remains part of check.

**Measurement scope.** The actual canonical-origin client uses privately routed checked gameplay static files and the ordinary dedicated test account. Fresh-session A-17 captures cover cliff/carried-light and pond, each Basic/Classic/Dynamic,5s warm-up+30s active-rAF, Canvas reference/default unchanged and WebGL requested per session. Each JSON records commit-parent34ff2cfb plus exact candidate source hashes, device/OS/browser/DPR/zoom/resolution/backend/world scale, every22-stage distribution, counters, original timings and workload flags. These SwiftShader values are **software-rasterisation diagnostics only**, not a hardware timing pass/fail or a CPU-throttled substitute. No concurrent check/build/profile runs during the six A-17 captures. The minute-review matrix runs alongside check and makes no timing claim. The physical iPad and hardware GPU remain **owner to run**. The original stage/counter values follow; nested percentiles must not be summed.

All timings ms, p50 / p95 / p99; nested stages must not be summed. Raw JSON retains original precision.

| Stage | cliff-basic | cliff-classic | cliff-dynamic | pond-basic | pond-classic | pond-dynamic |
|---|---|---|---|---|---|---|
| whole frame | 66.2999992371 / 72.7000007629 / 78.1000003815 | 97.3000011444 / 105.699998856 / 111.5 | 111.200000763 / 126.700000763 / 138.300001144 | 45.3999996185 / 52.1999988556 / 56.6000003815 | 87.1000003815 / 94.5 / 99.8999996185 | 76.3999996185 / 84.1999988556 / 92.6000003815 |
| snapshotPrepare | 0.0999984741211 / 0.199998855591 / 0.200000762939 | 0.10000038147 / 0.200000762939 / 0.200000762939 | 0.10000038147 / 0.200000762939 / 0.200000762939 | 0.10000038147 / 0.199998855591 / 0.200000762939 | 0.10000038147 / 0.199998855591 / 0.200000762939 | 0.10000038147 / 0.200000762939 / 0.200000762939 |
| ground | 1.89999961853 / 2.5 / 3.5 | 2.20000076294 / 2.90000152588 / 3.5 | 2.29999923706 / 3.69999885559 / 8 | 1.69999885559 / 2.5 / 3.19999885559 | 1.79999923706 / 2.39999961853 / 3.40000152588 | 1.69999885559 / 2.5 / 5.10000038147 |
| painterBuild | 1.10000038147 / 1.39999961853 / 1.89999961853 | 1.20000076294 / 2 / 2.5 | 1.20000076294 / 2 / 2.39999961853 | 1.10000038147 / 1.89999961853 / 2.5 | 1.10000038147 / 1.70000076294 / 2.29999923706 | 1.10000038147 / 1.80000114441 / 2.40000152588 |
| painterSort | 0.200000762939 / 0.300001144409 / 0.39999961853 | 0.200000762939 / 0.39999961853 / 0.5 | 0.200000762939 / 0.39999961853 / 0.5 | 0.10000038147 / 0.200000762939 / 0.300001144409 | 0.10000038147 / 0.200000762939 / 0.299999237061 | 0.10000038147 / 0.200000762939 / 0.300001144409 |
| painterDraw | 15.7000007629 / 19.7999992371 / 22.5 | 18.5999984741 / 24.5 / 33.7000007629 | 29.3999996185 / 41.1999988556 / 51.2999992371 | 4.29999923706 / 6.39999961853 / 7.79999923706 | 4.09999847412 / 5.89999961853 / 8.19999885559 | 7.5 / 10.7000007629 / 18.1000003815 |
| weather | 0 / 0.10000038147 / 0.199998855591 | 0 / 0.10000038147 / 0.10000038147 | 0 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.200000762939 | 0 / 0.199998855591 / 0.200000762939 |
| lightingBoundsResize | 0 / 0 / 0 | 0 / 0.199998855591 / 0.200000762939 | 0 / 0.200000762939 / 0.200000762939 | 0 / 0 / 0 | 0 / 0.199998855591 / 0.200000762939 | 0 / 0.199998855591 / 0.200000762939 |
| lightingOcclusionRaster | 0 / 0 / 0 | 0 / 0.300001144409 / 0.400001525879 | 0 / 0.400001525879 / 0.5 | 0 / 0 / 0 | 0 / 0.200000762939 / 0.299999237061 | 0 / 0.200000762939 / 0.300001144409 |
| lightingSolve | 0 / 0 / 0 | 0.0999984741211 / 0.199998855591 / 0.200000762939 | 0.10000038147 / 0.200000762939 / 0.60000038147 | 0 / 0 / 0 | 0.10000038147 / 0.200000762939 / 0.300001144409 | 0.299999237061 / 0.5 / 1.20000076294 |
| lightingMerge | 0 / 0 / 0 | 0.10000038147 / 0.200000762939 / 0.200000762939 | 0.10000038147 / 0.200000762939 / 0.200000762939 | 0 / 0 / 0 | 0.10000038147 / 0.199998855591 / 0.200000762939 | 0.10000038147 / 0.200000762939 / 0.300001144409 |
| lightingUpload | 0 / 0 / 0 | 0 / 0.10000038147 / 0.199998855591 | 0 / 0.10000038147 / 0.200000762939 | 0 / 0 / 0 | 0 / 0.10000038147 / 0.200000762939 | 0 / 0.10000038147 / 0.200000762939 |
| lightingReceiver | 0 / 0 / 0 | 0 / 0 / 0 | 0.60000038147 / 1.0000038147 / 1.30000114441 | 0 / 0 / 0 | 0 / 0 / 0 | 0.200000762939 / 0.500001907349 / 0.699996948242 |
| lightingComposite | 0 / 0 / 0 | 0.39999961853 / 0.60000038147 / 1.29999923706 | 0 / 0 / 0 | 0 / 0 / 0 | 0.299999237061 / 0.5 / 0.60000038147 | 0 / 0 / 0 |
| lightingStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingAnimatedStaticSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| lightingDynamicSolve | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| finalWorldComposite | 45.6000003815 / 50.7999992371 / 53.3999996185 | 72.3000011444 / 79.3999996185 / 82.5 | 74.5 / 83.7000007629 / 94 | 36.1000003815 / 40 / 44.2000007629 | 77.3000011444 / 83.0999984741 / 85.8999996185 | 62.1000003815 / 68.5 / 70.5 |
| uiModel | 0.39999961853 / 0.5 / 0.89999961853 | 0.5 / 0.700000762939 / 1.10000038147 | 0.5 / 0.799999237061 / 1.69999885559 | 0.5 / 0.700000762939 / 0.800001144409 | 0.5 / 0.700000762939 / 0.800001144409 | 0.5 / 0.700000762939 / 0.89999961853 |
| uiLayout | 0.5 / 0.60000038147 / 0.89999961853 | 0.5 / 0.700000762939 / 1.29999923706 | 0.60000038147 / 0.900001525879 / 2 | 0.5 / 0.700000762939 / 1.10000038147 | 0.5 / 0.700000762939 / 1.5 | 0.599998474121 / 0.799999237061 / 1.10000038147 |
| uiDraw | 0.5 / 1.10000038147 / 1.5 | 0.60000038147 / 1.39999961853 / 1.60000038147 | 0.700000762939 / 1.5 / 2.10000038147 | 0.60000038147 / 1.29999923706 / 1.79999923706 | 0.60000038147 / 1.30000114441 / 1.70000076294 | 0.60000038147 / 1.30000114441 / 1.69999885559 |
| fixedUpdate | 0.39999961853 / 0.5 / 0.800001144409 | 0.39999961853 / 0.60000038147 / 0.60000038147 | 0.5 / 0.700000762939 / 1.5 | 0.39999961853 / 0.60000038147 / 0.800001144409 | 0.400001525879 / 0.60000038147 / 0.700000762939 | 0.400001525879 / 0.699998855591 / 1 |
| catchUp | 0.39999961853 / 0.5 / 0.800001144409 | 0.39999961853 / 0.60000038147 / 0.60000038147 | 0.5 / 0.700000762939 / 1.5 | 0.39999961853 / 0.60000038147 / 0.800001144409 | 0.400001525879 / 0.60000038147 / 0.700000762939 | 0.400001525879 / 0.699998855591 / 1 |

| Per-frame counter | cliff-basic | cliff-classic | cliff-dynamic | pond-basic | pond-classic | pond-dynamic |
|---|---|---|---|---|---|---|
| drawImageCalls | 193 / 523 / 523 | 193 / 212 / 523 | 212 / 274 / 523 | 199 / 510 / 510 | 180 / 510 / 510 | 180 / 510 / 510 |
| distinctDrawImageSources | 12 / 13 / 13 | 12 / 13 / 13 | 13 / 15 / 15 | 13 / 14 / 15 | 12 / 13 / 13 | 12 / 13 / 13 |
| tintBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| tintSurfaceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| filteredFrameBuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| coverageFieldRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| preparedHeightRebuilds | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceOperations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| imageDataAllocations | 0 / 0 / 0 | 0 / 2 / 2 | 0 / 2 / 2 | 0 / 0 / 0 | 0 / 2 / 2 | 0 / 2 / 2 |
| capRunRequests | 0 / 0 / 0 | 0 / 0 / 0 | 102 / 104 / 104 | 0 / 0 / 0 | 0 / 0 / 0 | 26 / 26 / 26 |
| flatSourceRequests | 0 / 0 / 0 | 0 / 0 / 0 | 218 / 227 / 227 | 0 / 0 / 0 | 0 / 0 / 0 | 95 / 98 / 98 |
| capRunComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| flatSourceComposites | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| groundSourceReuses | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| receiverSamples | 0 / 0 / 0 | 0 / 0 / 0 | 300 / 317 / 317 | 0 / 0 / 0 | 0 / 0 / 0 | 257 / 263 / 263 |
| receiverCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 879 / 915 / 916 | 0 / 0 / 0 | 0 / 0 / 0 | 52 / 72 / 72 |
| receiverFullLoopCandidates | 0 / 0 / 0 | 0 / 0 / 0 | 98400 / 103976 / 103976 | 0 / 0 / 0 | 0 / 0 / 0 | 23130 / 23670 / 23670 |
| saveCalls | 22 / 29 / 29 | 22 / 24 / 29 | 23 / 25 / 29 | 19 / 25 / 25 | 18 / 25 / 25 | 18 / 25 / 25 |
| restoreCalls | 22 / 29 / 29 | 22 / 24 / 29 | 23 / 25 / 29 | 19 / 25 / 25 | 18 / 25 / 25 | 18 / 25 / 25 |
| saveRestorePairs | 22 / 29 / 29 | 22 / 24 / 29 | 23 / 25 / 29 | 19 / 25 / 25 | 18 / 25 / 25 | 18 / 25 / 25 |
| surfaceAllocations | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

| Evidence | cliff-basic | cliff-classic | cliff-dynamic | pond-basic | pond-classic | pond-dynamic |
|---|---|---|---|---|---|---|
| Active sample frames | 432 | 297 | 259 | 613 | 329 | 374 |
| Observed GPU submissions including preparation | 650 | 463 | 365 | 798 | 546 | 528 |
| Observed Canvas submissions | 0 | 0 | 0 | 0 | 0 | 0 |
| Encountered fallback reasons | [] | [] | [] | [] | [] | [] |
| Long tasks >=50 ms | 431 | 297 | 258 | 132 | 329 | 373 |
| Maximum long task ms | 99 | 124 | 153 | 71 | 115 | 106 |
| Retained lighting bytes | 0 | 161280 | 88683578 | 0 | 164864 | 83953014 |
| Omit decoded bytes | 0 | 0 | 72515584 | 0 | 0 | 72515584 |
| Largest decoded page bytes | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 | 4194304 |
| Legacy workload issues | no_pond | no_pond | no_pond | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters | invalid_frame_evidence, local_player_not_visible, local_player_not_walking, no_carried_light, fewer_than_150_static_casters |

**Exit.** `npm run check` passes651 files/3691 tests in1054.214558424428seconds (`C/check.log`, `check.exit`, `check-duration.json`). All checked runtime/test hashes remain unchanged. Commands: `C/check.py`, `C/pixel-gates.py`, A15/resources build/run, private client production build, `npm run client:chunks:check`, `C/gameplay.py`, `C/footer.py`, `verify-assets.py`, `git diff --check`. The client build retains lazy diagnostics/WebGL boundaries. All18 one-minute reviews are connected/moving and retain the requested backend; every screenshot plus both pond witnesses and six protocol screenshots was opened. `C/result.json` ties all gates to the same source manifest. No required acceptance gate failed; C is retained.

All six normal A-17 encountered sets are `[]`, with0 Canvas submissions after enable and positive WebGL submissions. The exact submission counts and original22-stage/counter tables above are retained even when software timings exceed desktop targets. Both routes retain the existing workload limitations (cliff `no_pond`; pond sparse/offscreen-actor and other recorded flags), so they are not relabelled as a fully populated combined scene. GPU timer queries are unavailable, not zero-cost. Basic retains0 lighting bytes; Basic/Classic load0 omit bytes. All filtered-frame-build counters stay0. One cliff Dynamic frame reports1 surface allocation (p50/p95/p990); this live counter outlier is not attributed by the current probe and is not represented as zero. The fixed-input600-frame resource/cache proofs above remain0 allocations. No new surface-creation site is introduced by the sampler. Original cold cliff/FPS-follow-up residuals are not claimed fixed by this WebGL work.

The separate post-protocol WebGL2-unavailable injection correctly latches Canvas, remains connected and shows **CANVAS: WEBGL2 UNAVAILABLE** in the Video footer; its deliberate reason is not folded into the six normal sets. The override is removed and the test preference returned to Canvas/off. The toggle remains under Developer; a move back to Video requires a separate owner decision. No deployment, world publication/schema change or Studio change. Physical iPad/hardware GPU remain **owner to run**: System→Developer→Render→Run protocol +copyJSON at cliff/carried-light and pond, each lighting mode and desired world scale; record device/OS/browser/DPR/browser zoom/resolution/commit/backend/world scale. Hardware timing classification D follows this checkpoint.

### 2026-09-08 — P8 follow-up D: hardware-availability classification claim

IN PROGRESS: codex, after672c079f (C functional gates PASS). Record read-only `lspci -k`, the Radeon iGPU's vfio-pci binding and this host's unavailable graphics-device/module state under `P8/A14a/D/`. Accept the independent investigation as established; no attempt to optimize away software rasterisation or alter the hypervisor. Replace the current A-17 performance FAIL/OPEN wording with **hardware GPU unavailable on this host**. Preserve all old/new software timings as diagnostics, separately from the six same-candidate empty fallback sets. Hardware timing remains owner to run on iPad, the VM that already owns the GPU, or another desktop with hardware acceleration. Developer/off remains; no deployment or world/schema/Studio change. Docs-only step reuses unchanged C full651file/3691test pass,1054.214558424428seconds.

### 2026-09-08 — P8 follow-up D checkpoint: hardware GPU unavailable on this host

D is complete after C's qualified runtime672c079f. Read-only commands `lspci -k` and `lspci -D -s 01:00.0 -k` exit0; full output/stderr is preserved in `output/perf-59-20260908/P8/A14a/D/`. The exact device row is:

```text
0000:01:00.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Granite Ridge [Radeon Graphics] (rev d8)
        Subsystem: Device 1f4c:b021
        Kernel driver in use: vfio-pci
```

`hardware.json` records `/dev/dri` absent and `/sys/module/amdgpu` absent. `modinfo amdgpu` exits1 with “Module amdgpu not found” (`modinfo-amdgpu.txt`). A separate metadata-only browser context reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` in `chrome-driver.json`; it runs after normal captures and makes no timing claim. This records the owner's established investigation, not a new attempt to solve software rasterisation in application code.

The current A-17 timing classification is **hardware GPU unavailable on this host**, not FAIL. Original SwiftShader cliff p9562.2–93.9ms, finalWorldComposite36–60ms and painterDraw15–31ms remain software diagnostics. The current candidate's cliff p9572.7000007629/105.699998856/126.700000763ms and pond52.1999988556/94.5/84.1999988556ms are likewise software diagnostics, with all original22-stage tables/counters/long tasks preserved in the C entry and `A17/`. Their slow values do not constitute a hardware performance verdict. No CPU throttling, hardware substitution, driver rebinding or hypervisor proposal/change was made.

Files: doc59,DECISIONS,roadmap and the explicitly requested `output/perf-59-20260908/release/README.md` status rows. The previous release README is preserved as `D/release-README-before-A14a.md`; its deployed0.6.0 archive and every originalA14 artifact remain unchanged. The README distinguishes current source qualification from the old released archive, which does not acquire the new sampler without a separate build/release. The earlier0.6.1 FPS release artifact also remains unchanged. C's checked source hashes still match, full651files/3691tests pass in1054.214558424428seconds; docs-only D adds no new runtime timing sample. `git diff --check` passes. Current release blockers are correctly classified: A-14a/A-15/A-16/A-17 functional PASS on one candidate; hardware timing **owner to run**.

| Device / gate | Status |
|---|---|
| This host, hardware GPU timing | **hardware GPU unavailable on this host** |
| This host, SwiftShader accuracy/lifecycle/fallback | PASS; source672c079f,651files/3691tests,all four functional gates |
| iPad, GPU-owning VM, or another hardware-accelerated desktop | **owner to run** |

Owner capture: open the same candidate on the iPad, the VM that already owns the GPU, or another hardware-accelerated desktop. System→Developer→Render: explicitly enable Experimental WebGL, then **Run protocol +copyJSON**, separately at cliff/carried-light and pond. Repeat Basic/Classic/Dynamic and required world scales; include device/OS/browser/DPR/browser zoom/resolution/commit/backend/world scale and confirm hardware acceleration. Keep raw stage timings, counters, long tasks and encountered fallback sets. No CPU-throttled or SwiftShader timing substitute. Canvas remains default1×; WebGL stays off by default under Developer. Moving it to Video is a separate owner decision. No deployment, world/schema publication or Studio change occurred in A–D.


### 2026-09-09 — Gameplay 0.6.1 qualified P8 release claim

IN PROGRESS: codex. Owner explicitly requested **Deploy** after the A–D results, authorizing the qualified gameplay release. Source `672c079f` includes the prepared F3 FPS/shadow-work follow-up and A-14a sampler; no additional runtime change. Build/package in the private integration checkout, retain exact deployed 0.6.0 rollback, swap only gameplay static output, restart only orchard-frontend, verify every public asset and same-identity/position/inventory/wallet reconnect. Canvas 1× remains default; WebGL remains off under Developer. No world/schema or Studio change. Hardware timing remains owner to run; recurring shadow pause remains a residual. Evidence: `output/perf-59-20260909/release/`. Full check remains PASS: 651 files / 3691 tests, 1054.214558424428 seconds, all 2725 checked inputs hash-identical. Prior 10 exact boards and same-candidate A14a/A15/A16/A17 gates apply; release adds build/static/reconnect gates.


### 2026-09-09 — Gameplay 0.6.1 deployment checkpoint

**DEPLOYED** after the owner's explicit Deploy. Source `672c079f5b5918a2dad1e1a023f0c2e9329048a5`; archive `output/perf-59-20260909/release/client-0.6.1-672c079f.tar`, 36,259,840 bytes, SHA256 `afa99d77ddd55523842686bba609be6cc8a04fb62446da662e346c289b147115`. Includes F3 delivered FPS/frame gaps, exact shadow-work reductions and qualified guarded sampler. Canvas 1× remains default; experimental WebGL remains Developer-only/off.

Commands: `package-candidate.py` (private client-production build, client:chunks:check and static dry-run), safe archive/member/hash validation, `private-review.py`, `publish-approved.py` → `publish.sh` (checked old/new hashes, static swap, frontend restart, bounded readiness, public/static integrity, live reconnect), and final source/Studio/service/rollback hash checks. Full `npm run check` is unchanged PASS: 651 files / 3691 tests, 1054.214558424428 seconds; all 2725 checked inputs still match. No runtime change since the qualified candidate, so prior 10 byte-exact Canvas boards and A14a/A15/A16/A17 gates remain applicable.

All 439 public files and installed files match the reviewed archive. Both private-build and actual-origin post-publication reconnect preserve the same identity, position, 48 inventory slots and wallet. Live F3 reports 60 FPS with 16.700000000000728 ms latest gap; the immediate post-login capture retains a 2483.2 ms startup gap in the five-second maximum. These are functional screenshots, not a new stage-timing protocol or a claim that shadow pauses are fixed. Original stage timings/counters and hardware limits remain in the preceding entries. Candidate/live F3 and live settings screenshots were opened.

Only orchard-frontend restarted. The first readiness request returned transient HTTP502; the second returned exact HTTP200 candidate HTML within the existing bounded wait. All required gates passed, no rollback ran. Studio static hashes, guard/reference files and service PID/start are unchanged; world service PID/start unchanged, no world publication or schema change. The exact 439-file 0.6.0 directory is retained in `release/live-before-0.6.1/dist`; reviewed rollback tar remains `output/perf-59-20260908/release/client-0.6.0-fd0cb7e6.tar` (SHA256 `f1908c6138255632e396bfac44f0191bc1832c88967077fa8bb7088e3dc5b290`). Exact rollback command: `bash /home/toby/projects/orchard-cellar/output/perf-59-20260909/release/rollback.sh`.

Evidence: `output/perf-59-20260909/release/README.md`, `deployment-result.json`, `deployment.log`, `public-integrity.json`, `live-reconnect-result.json`, `live-display.json`, before/after service records and screenshots. Recurring shadow-direction pause remains a residual; hardware GPU unavailable on this host. iPad/hardware timings remain **owner to run**, using the existing Developer Render protocol at cliff/carried-light and pond with modes/scales/device metadata as described above. No hardware acceptance or default-backend change is inferred from deployment.
