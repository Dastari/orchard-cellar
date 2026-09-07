# 59 — Client Render Performance Recovery Plan

Implementation plan, **2026-09-06**. Status: **adopted — owner confirmed decisions A1, B2 and C (experimental WebGL2 toggle) on 2026-09-06; implementation in progress; P0–P2 desktop checkpoints recorded below**.
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
2. `CelestialReceiverScene` keeps the static coverage field per (level, sky
   geometry key, 4-px window). Per frame, copy it into a working field and blit
   only moving casters. Contact coverage follows the same split.
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
frame. Exit counter: `groundSourceOperations` is zero in steady state and at
most the visible run count on a plane revision change. A-1's workload must
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
