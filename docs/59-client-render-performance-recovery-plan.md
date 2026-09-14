# 59 — Client Render Performance Recovery Plan

Implementation plan, **2026-09-06**. Status: **adopted — owner confirmed decisions A1, B2 and C (experimental WebGL2 toggle) on 2026-09-06; implementation not started**.
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
failures and measured counters in §8.

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
3. Replace `sample()`'s caster loop for ground-level receivers with a bilinear
   read of the merged field at the sprite foot. Keep the loop only for heights
   with no rasterised plane, and rasterise those planes lazily.
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

### P5 — Tint pool and cap-layer consolidation

**Files:** `receiver-frame-source.ts`, `ground-light-source.ts`,
`world-lighting-renderer.ts` (`groundSource`, `compositeGround`),
`ground-cache.ts` (`drawProjectedRun`), `raised-terrain-depth.ts`,
`overworld-art.ts` dimmed/hit-flash draws, `overworld-ui.ts` filter uses.

1. Quantise receiver RGB to 5 bits per channel before keying (32 steps; below
   the visible threshold on the multiplied art). Measure distinct colours per
   frame; expect single digits in open light.
2. Replace per-entry canvases with shelf-packed tint pages (512×2048). Key is
   (page identity, frame rect, quantised RGB). Evict by page generation, not
   per entry. Consecutive sprites with the same tint share one source.
3. Add `dim` and `hitFlash` as tint-pool variants (pre-multiplied brightness
   and saturation) and remove every `context.filter` use in world drawing.
   HUD filter uses move to pre-rendered skin frames or are removed.
4. Cap runs: draw all runs for a level untinted into a per-level cap layer
   sized to the viewport, multiply the level's plane once, then composite the
   layer with its cutaway mask. Remove `groundSource` and the scratch canvas.
   Flat sprites (`withGroundSpriteSource`) draw into the same layer.

**Tests:** tinted pixel equals `round(src × rgb / 255)` for the quantised rgb;
no `filter` assignment in engine world code (lint rule or grep test); one
multiply per level per frame; cap-run output pixel-equal to today's within one
step on the terrain review fixture.
**Exit:** tint builds per frame ≈ 0 in steady state; `groundSource`
operations = 0; `painterDraw`/`ground` p95 recorded.

### P6 — Painter and context hot path

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

1. Optional 30 Hz presentation cap (render every other rAF while simulation
   keeps 60 Hz fixed steps and interpolation). Default off on desktop, on when
   the P0 iPad baseline shows sustained > 16 ms.
2. HUD layer: draw the HUD into its own canvas only when its model changes
   (`uiModel`/`uiLayout` already separate model from draw); composite the
   cached layer otherwise. Nameplates and cursor overlays stay per frame.

**Tests:** 30 Hz cap halves `uiDraw`/world submissions without changing fixed
update count; HUD golden identical between cached and direct paths.
**Exit:** iPad sustained p95 and battery/thermal trace recorded per doc 47.

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
5. **Parity fixtures.** Each lighting review fixture renders on both backends;
   difference must be within one 8-bit step per channel on lit artwork and
   zero on the HUD witness. Add a context-loss test using
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

## 8. Bookkeeping and execution ledger

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
