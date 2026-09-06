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
