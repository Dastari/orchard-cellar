# 47 — Rendering, Lighting, and Client Performance Execution Plan

Implementation plan for owner review (2026-08-29).

This document converts the renderer and lighting audit into a sequence that one
implementation agent can execute from beginning to end. It is deliberately more
operational than docs 21, 27, and 39: every milestone names its dependencies,
files, implementation steps, tests, performance gates, compatibility path, and
exit conditions.

This plan does not authorize an engine migration. TypeScript, Canvas 2D, the
fixed 60 Hz simulation, interpolated requestAnimationFrame presentation, the
deterministic painter queue, quarter-tile light grain, and the separate HUD pass
remain the baseline.

Implementation directive (owner, 2026-08-29): every M2–M6 lighting behavior
change ships first and remains switchable as `Unified V2` through the existing
Graphics lighting-model setting. `Classic` preserves the selected baseline for
live A/B comparison. Shared plumbing may run in both modes only when raw and
rendered Classic output remains identical; otherwise branch at the smallest
solver/compositor boundary. A stored mode survives reload, changing modes
invalidates every affected field/cache exactly once, and no authority or
simulation state depends on the selection.

## Execution ledger

### 2026-08-29 — implementation start / M0 baseline

- Owner direction selected the current shared workspace for implementation;
  pre-existing dirty changes remain owner work and are not reset, stashed, or
  attributed to M7.3.
- Git base: `2be8e90ffb3beb27f7656aac0d59b49b684ee46b` on `main`.
- Toolchain: Node 24.19.0, npm 11.17.0, Linux 6.17.2, Chrome 152.0.7977.64.
- Available host CPU: AMD Ryzen 9 9955HX; this virtualized development host is
  not yet adopted as either physical reference device.
- Baseline passed `npm run typecheck`, `npm run lint`, `npm test` (184 files,
  1,180 tests), targeted render tests (21 files, 163 tests),
  `npm run assets:validate` (701 art assets), and `npm run build`.
- The dirty tree already contained a Classic/Unified setting and partial
  face-light prototype before M7.3 implementation. It is preserved as existing
  work; M0 does not claim or visually change it.
- Exact primary/low-end physical devices, minimum-browser rows, energy/thermal
  instruments, and the 30-run/cycle benchmark evidence remain M0 exit gates.

## 1. Mandatory preconditions

### 1.1 Establish an owner-approved baseline

The working tree was heavily modified when this plan was written, including
overworld-main.ts, renderer.ts, lighting.ts, light-flood.ts, light-occlusion.ts,
UI code, assets, generated bindings, and untracked gameplay work. An
implementation agent must not stash, reset, discard, overwrite, or reinterpret
those changes.

Before implementation:

1. The owner selects and checkpoints the exact source state to use as the
   baseline. A commit or a separate worktree based on an owner-selected commit
   is preferred.
2. Record git status --short, the baseline commit, Node/npm versions, browser
   version, operating system, viewport, devicePixelRatio, and reference device.
3. Re-read AGENTS.md, docs/00-overview.md, the claimed entry in
   docs/14-roadmap.md, docs/15-agent-workflow.md,
   docs/01-engine-decision.md, docs/21-unified-renderer.md,
   docs/27-lighting-design.md, docs/39-lighting-v2.md, DECISIONS.md, and the
   current implementations. Binding docs and DECISIONS.md win for behavior;
   current source wins only for file names and line locations.
4. Run and save the baseline results for:

       npm run typecheck
       npm run lint
       npm test
       npx vitest run packages/client/src/render
       npm run assets:validate
       npm run build

5. Execution approval must explicitly authorize the roadmap-claim and
   checkpoint commits required by docs/15. If it does not, stop before coding;
   do not work around the project workflow by leaving an unclaimed dirty tree.
   The owner first adds and assigns the unique roadmap submilestone
   `M7.3 — Renderer, lighting, and client-performance hardening (docs/47)`;
   docs/47's internal M0–M13 labels are phases, not claims on roadmap M0–M13.
   Roadmap M8's existing "complete docs/27 lighting" scope must be explicitly
   narrowed or handed off in docs/14 even if M8 is not active, because it
   overlaps this plan by definition. Any other active claim overlapping M7.3's
   files—including progression, Homestead, UI, PWA, or roadmap M9 work—must be
   completed, handed off, or narrowed before the implementation agent claims
   M7.3.
6. If the selected baseline is already red, distinguish pre-existing failures
   from new ones in the execution log. Do not continue into behavioral changes
   until the relevant rendering tests and client typecheck are green.

### 1.2 Adopt or constrain the proposal

docs/39-lighting-v2.md is currently a proposal, not a recorded decision. Its
one-field, authored-height, finite-shadow design is the basis of milestones M2
through M5 below and must be adopted in DECISIONS.md before those milestones
replace production behavior.

The implementing agent must present the decision package and obtain explicit
owner approval before the first adoption commit; dependency order is not
permission to self-adopt it. M2 onward may proceed only after the owner adopts
or explicitly amends the core model. Rejecting a core item stops this plan and
requires a rewritten branch; the agent does not improvise an alternative. The
package must separately resolve per-receiver-level field slices (an amendment to the proposal's
"one-field" wording), fixed-point heights, point and directional caster kinds,
emissive data, scalar transmission, contact shadows, light/caster/receiver
masks, and Balanced/Low light-quality budgets. Scalar transmission alone may
be Deferred: in that branch its metadata, tests, and fast-path work are omitted
and transmittedDirect stays zero throughout. Record the accepted choices in
DECISIONS.md and update docs/27 and docs/39 in that same checkpoint.

The following recommendations conflict with current binding defaults and must
not be silently shipped:

| Topic | Existing default | Recommended treatment in this plan |
|---|---|---|
| Renderer | Canvas 2D only | Keep Canvas 2D as production. GPU work is a conditional, later experiment. |
| Light merge | Per-channel maximum | Preserve as the production model. Energy accumulation is deferred research unless a later owner decision opens it. |
| New Moon | Exact near-black #141420 | Preserve the authored default. Add an accessibility brightness control rather than changing the default scene. |
| Light texture | Four texels per tile, bilinear light-only upscale | Preserve. Two texels per tile is the documented low-quality tier. |
| Halos | Quantized additive ember bands; no smooth radial gradients | Preserve. Emissive masks and halos must remain pixel-grained. |
| Display DPR | Native device DPR | Any backing-pixel cap or separate HUD-canvas topology requires owner approval plus a DECISIONS/docs/21 amendment before M10, even when Native stays the default. Making Auto/Balanced the default is a separate decision. |
| WebGL | Deferred | Do not implement unless M11's measurement gate fires and the owner approves the experiment. |

### 1.3 Non-negotiable invariants

- Simulation remains authoritative and deterministic. Lighting is presentation
  data and must not alter shared movement, collision, combat, or network rules.
- Do not change packages/sim/src/movement.ts or the authority CollisionMap
  contract as part of this plan.
- World pixels stay nearest-neighbour. Only the final fractional world blit and
  the low-resolution light field may be smoothed.
- The HUD, menus, bitmap text, and accessibility controls draw after world
  lighting and remain legible.
- Every non-ground world drawable retains one deterministic elevation,
  phase, foot-Y, and stable-ID ordering contract.
- Light and weather behavior derives from authority/render ticks and seeded
  functions. Math.random is not introduced.
- Hot loops do not allocate per texel, per particle, or per visible entity in
  steady-state fixtures below preallocated capacity after warm-up.
- Caches have explicit identity, invalidation, byte or entry budgets, telemetry,
  and disposal.
- Each milestone lands green and visually comparable before the next begins.
  Do not stack several unverified rewrites and debug them at the end.

## 2. Target architecture

The completed client should have these boundaries:

    network snapshot + predicted presentation
                    |
                    v
       WorldFramePreparer (revision driven)
                    |
                    v
       reusable numeric WorldRenderRecords
                    |
          +---------+----------+
          |                    |
          v                    v
    CanvasWorldRenderer   LightFramePreparer
          |               - field bounds
          |               - receiver/caster metadata
          |               - static/dynamic fields
          |               - elevation/height fields
          |                    |
          +---------+----------+
                    v
          CanvasLightingCompositor
          - ambient/weather merge
          - multiply
          - emissive/halo
                    |
                    v
            one display blit
                    |
                    v
             screen-space HUD

Keep TileLightmap as the compatibility facade during migration, but separate
its eventual responsibilities:

- lighting-types.ts: shared records, fixed-point heights, receiver/caster
  classes, source mobility, masks, quality, and feature configuration.
- light-coordinate-mapper.ts: the only conversion from logical ground-foot
  coordinates/elevation to projected light-field coordinates.
- LightFieldSolver: DOM-free typed-array calculation and sampling.
- LightOcclusionProvider: chunked static terrain plus dynamic deltas.
- light-compositor.ts: backend lifecycle/capability interface.
- CanvasLightingCompositor: ImageData upload and Canvas composition.
- sky-lighting.ts: canonical ambient, clouds, accessibility lift, and global
  sky overrides.
- directional-shadows.ts: cached sun/moon ambient shadow masks.
- lighting-metrics.ts and lighting-debug.ts: observability outside the solver.
- WorldFramePreparer: transforms snapshot/game state into reusable render data.
- CanvasWorldRenderer: draws prepared records without rebuilding game indexes.
- HudPresenter: bounded native-DPR overlay canvases for crisp integer-scale UI
  independent of Balanced/Low world backing.

The minimum shared records should make coordinate and invalidation ownership
obvious:

    const LIGHT_HEIGHT_SUBUNITS_PER_LEVEL = 4;
    const MAX_SIMULTANEOUS_LIGHT_LEVELS = 8;
    const MAX_ACTIVE_LIGHT_CHANNELS = 2;

    type ReceiverClass = 'flat' | 'south' | 'omni';
    type PointCasterKind = 'none' | 'footprint' | 'silhouette' | 'column' | 'volume';
    type DirectionalCasterKind = 'none' | 'silhouette' | 'column';
    type LightMobility =
      | 'steady-static'
      | 'animated-static'
      | 'dynamic'
      | 'halo-only';

    interface PointLight {
      id: string;
      footWorldX: number;
      footWorldY: number;
      luminousOffsetX: number;
      luminousOffsetY: number;
      terrainLevel: number;
      emitterHeightSubunits: number;
      radiusTiles: number;
      color: RgbColor;
      fieldStrengthPerMille: number;
      haloStrengthPerMille: number;
      mobility: LightMobility;
      facing?: LightFacing;
      profile: 'steady' | 'flame';
      lightMask: number;       // uint16 channel mask
      qualityClass: 'required' | 'ordinary' | 'decorative';
    }

    interface PreparedPointLight extends PointLight {
      projectedFieldX: number;
      projectedFieldY: number;
      projectedReceiverFootY: number;
      activeChannelBits: number;
    }

    interface WorldLightingReceiver {
      receiver: ReceiverClass;
      logicalFootX: number;
      logicalFootY: number;
      receiverLevel: number;
      ownerOrdinal?: number;
      receiverMask: number;    // uint16 channel mask
      emission?: {
        maskHandle: number;
        localBounds: readonly [number, number, number, number];
        anchor: readonly [number, number];
        strengthPerMille: number;
        blend: 'lighter';
      };
    }

    interface WorldLightingCaster {
      pointCaster: PointCasterKind;
      directionalCaster: DirectionalCasterKind;
      pointCasterHeightSubunits: number;
      directionalCasterHeightSubunits: number;
      pointCasterMask: number; // uint16 channel mask
      directionalCasterMask: number;
      transmissionPerMille: number;
      shadowOpacityPerMille: number;
      maximumShadowTexels: number;
      maximumDirectionalShadowPixels: number;
      contactShadow: 'native' | 'none' | 'authored' | 'small' | 'medium' | 'large';
      ownerOrdinal: number;
    }

Hot samplers should return a packed RGB integer or write into a caller-owned
record. They must not allocate a colour object per sample.

Do not introduce a general ECS. These are purpose-built data boundaries around
the existing game.

## 3. Milestone dependency order

Execute in this order:

    M0 baseline, metrics, benchmark protocol
      -> M1 off-screen correctness and buffer capacity
      -> M2 one-field sampling and receiver semantics
      -> M3 height-aware receiver/caster model and finite shadows
      -> M4 authored asset metadata and complete occluder coverage
      -> M5 static/dynamic fields and chunked occlusion
      -> M6 ambient/direct/transmitted/emissive composition
      -> M7 revision-driven scene and UI preparation
      -> M8 weather, dynamic ground, and cellar locality
      -> M9 atlas paging and asset delivery
      -> M10 memory budgets, lifecycle, and loop hardening
      -> M11 conditional worker/GPU experiments
      -> M12 final verification, cleanup, and documentation
      -> M13 post-release compatibility retirement after the support window

The order is semantic, not merely convenient: M7 consumes M2/M4 receiver
records; M8 consumes M5 chunked occlusion and M7's prepared weather input; M9
establishes asset ownership used by M10; and M10 budgets caches introduced by
M5, M7, and M9. A single agent may prototype isolated helpers earlier, but may
not declare a dependent milestone complete out of order.

## 4. M0 — Trustworthy instrumentation and reproducible baselines

### Objective

Make every later performance decision evidence-based and create a repeatable
visual/performance scenario protocol.

### Primary files

- packages/client/src/render/metrics.ts
- packages/client/src/render/lighting.ts
- packages/client/src/overworld-main.ts
- packages/client/src/loop.ts
- packages/client/src/render/renderer.ts
- packages/client/src/main.ts
- packages/client/src/account-main.ts
- new packages/client/src/lifecycle-registry.ts
- new packages/client/src/lifecycle-registry.test.ts
- new packages/client/src/render/render-benchmark.ts
- new packages/client/src/render/render-benchmark-scenarios.ts
- relevant Vitest files

### Implementation

1. Replace the current aggregate LIGHT timing with non-overlapping stage
   timings:

   - field bounds/resize;
   - occlusion raster;
   - the existing field solve;
   - ambient/field merge;
   - ImageData upload;
   - receiver sampling/filter;
   - light composite.

   Reserve staticSolve, animatedStaticSolve, and dynamicSolve metric IDs now,
   but report them as unsupported/zero until M5 actually introduces those
   fields. Never relabel one current solve as three measured stages.

2. Add world timings for:

   - snapshot/index preparation;
   - ground cache lookup/bake/blit;
   - painter record build;
   - painter sort;
   - painter draw;
   - weather;
   - final world composite;
   - UI model update/layout/draw;
   - fixed update and catch-up steps.

3. Keep metrics allocation-free: fixed typed-array rings and numeric counters.
   Report count, p50, p95, p99, maximum, and rolling mean. Computing percentiles
   may copy/sort only when the debug view or external snapshot requests them,
   never inside every RAF.
4. Rename drawCalls to renderItems unless a counter genuinely tracks Canvas
   calls. Add separate counters for Canvas operations only where useful.
5. Estimate observed refresh from a robust RAF-interval window and report
   missed deadlines relative to observed refresh plus fixed 60, 120, and 144 Hz
   thresholds. Record
   accumulated update steps, deliberately discarded elapsed time, cache hits,
   misses, bakes, evictions, active/resident items, estimated bytes, and
   light-field rebuild causes. Record sampled input-to-render-submit latency,
   defined as trusted browser Event.timeStamp to the end of the first render()
   that consumes that queued input. This is not claimed as physical display
   presentation latency; M11 compares this exact metric before/after.
6. Add a debug-only PerformanceObserver for long tasks when supported. Do not
   make unsupported browser APIs a runtime requirement.
7. Extend window.__orchardOverworld with a versioned, JSON-serializable
   diagnostics snapshot. Existing debug hooks remain compatible.
8. Add a deterministic benchmark mode that can select a seed, space, camera,
   time, weather, light set, entity count, and fixed render alpha without
   depending on a live multiplayer session. Prefer a dynamically imported
   development route so production startup does not eagerly load benchmark
   fixtures.
9. Provide these named scenarios:

   - day-clear-baseline;
   - new-moon-player-lantern-dense-trees;
   - sixteen-steady-lights-one-moving-light;
   - forty-maximum-radius-blocked-lights;
   - rain-with-500-world-items;
   - three-level-nested-cliffs;
   - eight-level-two-channel-light-capacity;
   - repeated-cellar-excavation;
   - fifty-space-transitions;
   - cold-atlas-load.

10. Each steady-state render run warms for five seconds, then measures for
    30 seconds (1,800 frames is the expected minimum at 60 Hz, not an alternate
    early stop) and exports JSON containing build identity, scenario, viewport,
    DPR, zoom,
    browser/device information, stage percentiles, long tasks, cache statistics,
    and estimated memory.
11. Cold load uses 30 independent measured browser starts after one harness
    validation run so its p95 is meaningful. Fifty-transition runs use five
    complete 50-transition cycles (250 transition samples). Report per-run and
    per-transition distributions rather than applying a frame warm-up to the
    event.
12. Before any millisecond gate can pass, fill a checked-in reference-device
    record with exact CPU, GPU, RAM, OS, browser version, viewport, DPR, zoom,
    power mode, and thermal/charging conditions. "Total render" is exclusive
    wall time from render() entry through its return and includes scene
    preparation performed there, world, lighting, final blit, and HUD.
13. The same record names `primary-reference` and `low-end-reference` with
    exact physical models/specifications, and an adopted minimum-browser matrix
    with exact Chromium, Firefox, and Safari/WebKit versions plus oldest
    supported OS/device. “Low-end target” and “supported browser” elsewhere in
    this plan mean those named rows, never a developer's current laptop. If the
    owner cannot supply a low-end physical device or minimum version, gates
    using it remain explicitly external and M11 cannot ship.
14. Battery/thermal comparison is three alternating baseline/candidate
    15-minute runs after a five-minute warm-up, at fixed ambient temperature,
    brightness, charge state, fixture, and frame cap. Use the platform's energy
    counter/profiler and temperature sensor where available. Candidate median
    energy may increase at most 5% and peak temperature at most 2 °C; absent
    counters require an owner waiver and block an optional backend from shipping.
15. Keep timing enforcement out of ordinary shared CI unless it runs on fixed
    hardware. Functional benchmark-scenario tests remain in CI; reference-device
    budget enforcement is an explicit command or report.
16. Establish the minimal nested lifecycle primitive before later milestones
    allocate resources. AppLifetime owns account/PWA/update-shell resources;
    each WorldSessionLifetime child owns its network connection, renderer,
    input, world audio, art loader, timers, and optional worker/backend. Child
    dispose cannot tear down its parent. M10 extends and audits this registry;
    M1–M9 register ownership at resource creation rather than retrofitting it.

### Tests

- Metric rings wrap without allocation or percentile corruption.
- A fake-clock unit test proves exclusive stage ownership and order. In the
  browser report, nested/exclusive accounting may differ from total render by
  at most 2% or 0.05 ms per frame, whichever is greater; larger gaps fail the
  instrumentation check.
- LIGHT total excludes painter and cloud drawing.
- Benchmark scenarios produce deterministic entity/light/terrain descriptors.
- Diagnostics remain serializable and do not expose account tokens or private
  state.

### Exit gate

- Baseline reports exist for every scenario at DPR 1, 1.25, 1.5, 2, and 3 and
  at one integer and one fractional zoom.
- The exact primary/low-end device rows, minimum-browser matrix, and available
  energy/thermal measurement mechanism are owner-adopted; no later gate refers
  to an unnamed target.
- The documented reference render budget remains at most 4 ms.
- Normal night lighting has its own provisional p95 budget of 2 ms; the
  pathological forty-light scene is reported separately and must keep p95 at
  or below 16.67 ms with no long-task cascade.
- No visual behavior changes in M0.

## 5. M1 — Fix off-screen lights and light-buffer churn

### Objective

Eliminate edge-snapped lights and make field capacity stable while preserving
in-view output.

### Primary files

- packages/client/src/render/lighting.ts
- packages/client/src/render/light-flood.ts
- packages/client/src/render/camera.ts
- packages/client/src/overworld-main.ts
- packages/client/src/render/lighting.test.ts
- packages/client/src/render/light-flood.test.ts

### Implementation

1. Introduce a pure LightFieldBounds calculation. Inputs are the camera world
   rectangle, terrain bounds, active projected lights, texels per tile, and a
   one-texel sampling guard.
2. Cull lights using circle-versus-viewport intersection, not source-point
   inclusion alone.
3. Pad the solve rectangle far enough to contain the true origin of every
   intersecting light and every occluder between that origin and the visible
   rectangle. With the current bounded radii, a viewport padded by the maximum
   intersecting radius plus the sampling guard is the simple correct baseline.
4. Never clamp a valid light origin onto a light-field edge. Terrain-boundary
   clamping may apply to the field rectangle, not to an emitter that should be
   elsewhere.
5. Track an active field rectangle separately from backing capacity. Grow
   typed arrays and canvases in coarse buckets, reuse them across one-tile
   camera motion and eased zoom, and upload/composite only the active rectangle.
6. Include active field origin and size in sampling calculations and cache
   signatures.
7. Ensure lights outside the terrain or whose radius cannot intersect the
   viewport are skipped rather than moved.
8. Add rebuild-reason counters for bounds movement, light geometry, light
   energy, occlusion revision, ambient revision, quality, and backend.

### Tests

- A light just outside each screen edge produces the same visible crop as an
  equivalent larger centered field.
- A campfire ten tiles off-screen contributes only its true distant falloff.
- Shadow direction remains based on the true source.
- Crossing the previous two-tile boundary does not create an intensity pop.
- A non-intersecting light visits zero texels.
- One-tile camera movement within capacity does not reallocate arrays/canvases.
- Fractional zoom and terrain-edge cases remain finite and in bounds.

### Exit gate

- All four off-screen goldens pass.
- Existing in-view light goldens are byte-identical.
- Normal-scene p95 does not regress by more than 10%; if the larger correct
  solve window exceeds that, M1 stays behind its developer flag until M5
  recovers the cost. Continuing earlier requires an explicit owner waiver and
  an adopted interim p95 ceiling that remains below 16.67 ms; a promise of a
  later optimization is not an exit gate.

### Rollback

Retain a temporary developer-only legacy bounds flag until browser comparison
is complete. Remove it when M1 is accepted; do not leave two production
correctness models indefinitely.

## 6. M2 — One light truth and explicit receiver semantics

### Objective

Remove the independent per-sprite falloff model. Ground, faces, glints, rain,
and diagnostics must sample the same computed field.

This milestone corresponds to docs/39 v2.0.

### Primary files

- packages/client/src/render/lighting.ts
- packages/client/src/render/light-flood.ts
- packages/client/src/render/light-occlusion.ts
- packages/client/src/render/renderer.ts
- packages/client/src/overworld-main.ts
- packages/client/src/render/lighting.test.ts
- packages/client/src/render/light-flood.test.ts
- packages/client/src/render/renderer.test.ts

### Implementation

1. Add bilinear CPU-array APIs:

   - public sampleIlluminationAtFoot(receiverClass, logicalWorldX,
     logicalWorldY, receiverLevel, receiverMask);
   - public sampleFaceIlluminationLuma(faceClass, logicalWorldX, logicalWorldY,
     receiverLevel, receiverMask);
   - private/internal sampleProjectedField(fieldX, fieldY, fieldSlice).

   These read prepared typed arrays; they never call getImageData.
   Direct buffers start black and never contain ambient. During M2's bridge,
   the RGB public sampler returns component-wise
   `max(sky, direct, transmittedDirect)` for every receiver class; the required
   receiverClass argument reserves the settled API but does not select an RGB
   face slice yet. The luma-only face sampler returns
   `max(luma(sky), gatedDirectLuma, gatedTransmittedDirectLuma)` for M2's
   temporary draw ratio. M3 replaces that bridge with receiver-class RGB
   selection as specified there, ensuring sprites, clouds, directional
   shadows, CPU samples, and final composition share one illumination
   definition.
   Public logical-foot methods invoke light-coordinate-mapper.ts internally;
   callers never pre-project. If the field is prepared but the sample is out
   of bounds, combined illumination returns canonical sky/ambient while a
   direct-only or face-direct internal sample returns zero. Sampling before
   prepare throws in development and returns canonical ambient in production
   with a diagnostic counter.
   In M2's interim implementation, sky is the current canonical ambient,
   transmittedDirect is identically zero, and direct is the existing unsplit
   unified field. M4–M6 add the named layers without changing this public API.
2. During each light stamp, write a south-face luma buffer before the lossy RGB
   maximum merge. Apply the facing gate per contributor, not after all lights
   merge. This single-channel buffer is explicitly temporary M2 compatibility
   storage; M3 replaces it with the RGB format below.
3. Add LightingReceiverClass:

   - flat: receives only the screen/ground field;
   - south: samples the south-face field;
   - omni: samples the unrestricted field;

   Emission is orthogonal metadata, not a receiver class: a south or omni
   receiver may independently own an emissive mask.
4. Add receiver class, receiver elevation, and optional emission metadata to
   WorldDepthItem or its successor.
   Infer values matching current output during this milestone; authored values
   arrive in M4.
5. Replace southFacingReceiverBrightness and every per-receiver loop over
   lights with field sampling. For a south receiver compute
   `ground = sampleIlluminationAtFoot('south', x, y, level, mask)`,
   `face = sampleFaceIlluminationLuma('south', x, y, level, mask)`, and
   `brightness = clamp(face / max(luma(ground), 1), 0, 1)`. Apply that scalar
   once to the receiver draw so the later world multiply yields the gated
   target. Spatial cloud/directional sky and Night Visibility are already in
   both samples. Flat and omni receivers use brightness 1 because the global
   field is their intended illumination. Remove repeated octile/facing math
   from the draw path. This `face / ground` draw scalar is an M2-only
   compatibility bridge while one unsplit screen field is still multiplied
   over the whole world. M3 must remove this scalar rather than retain it.
6. Fix the existing competing-light test so it actually supplies a bright
   behind light and a dim front light.
7. Route future water glints and lit weather through
   sampleIlluminationAtFoot rather than a new lighting approximation. M2
   callers pass DEFAULT_LIGHT_MASK; M3 makes authored receiver masks active.
8. Remove superseded receiver falloff helpers from unified mode once comparison
   goldens pass, but keep the current classic model as the explicit rollback
   through M8 and at least one owner-reviewed release after unified becomes the
   accepted default.
9. Define coordinate ownership before migrating emitters:

   - PointLight stores logical ground-foot coordinates, a luminous offset,
     terrain level, and height;
   - light-coordinate-mapper.ts performs projection exactly once;
   - public sampling APIs clearly distinguish logical-foot sampling from any
     internal projected-field sampling;
   - no API accepts an ambiguous Y that callers may project twice.

10. Treat the current tree as a partial v2.0 migration: a south-face buffer
    exists, but there is no complete public RGB sampler, receiver classes are
    not authored, elevation handling remains incomplete, and the
    behind-dominant fixture is currently ineffective.

### Tests

- Exact texel-centre and bilinear half-texel sampling.
- Out-of-field combined sampling returns canonical ambient; direct/face-only
  sampling returns zero; an unprepared-field development call throws.
- Bright light behind plus dim light in front gives the face the dim front
  contribution, never the bright behind contribution.
- Flat, south, and omni fixtures differ only as specified; emission remains
  independent of receiver class.
- A wall between light and receiver blocks both ground and face contribution.
- Own-caster receiver masking does not create bright holes at alpha edges.
- Receiver sampling performs no per-light iteration.

### Exit gate

- Before/after screenshots of the supplied forest scene show ground and tree
  fronts agreeing.
- Receiver sampling/filter p95 does not regress by more than 3% in the dense-
  entity scene and its operation counter performs zero per-light iterations.
  If both values are below 0.05 ms timer resolution, exact operation/allocation
  counts replace the timing comparison rather than demanding noise-level speedup.
- No new per-entity arrays, closures, or strings are allocated.

## 7. M3 — Height-aware fields and finite, feathered shadows

### Objective

Make elevation affect both blockers and visible receivers, replace infinite
tree ribbons with finite projected shadows, and close cross-plane leakage.

This milestone combines docs/39 v2.1 and v2.3, with an explicit receiver-plane
solution that the current flattened field lacks. It intentionally brings v2.3
infrastructure before v2.2 metadata: M3 consumes current runtime collision and
alpha-derived contours as temporary inputs, and M4 replaces them byte-for-byte
with built metadata. The §1.2 owner decision must record both that reorder and
the per-level-field amendment before M3 begins.

### Primary files

- packages/client/src/render/lighting.ts
- packages/client/src/render/light-flood.ts
- packages/client/src/render/light-occlusion.ts
- packages/client/src/render/terrain.ts
- packages/client/src/render/raised-terrain-depth.ts
- packages/sim/src/map-compiler.ts
- packages/tools/src/validate-assets.ts
- packages/client/src/render/renderer.ts
- packages/client/src/overworld-main.ts
- related tests, exact field fixtures, and deterministic review screenshots

### Data contract

Use integer/fixed-point height units:

- LIGHT_HEIGHT_SUBUNITS_PER_LEVEL = 4;
- terrain level N has base height N times that constant;
- pointCasterHeightSubunits, emitterHeightSubunits, and receiverLevel are integers;
- reserve values for half-height fires and taller sconces/buildings without
  floating-point comparison drift.

Each rasterized light cell exposes:

- terrain level;
- blocking height above that terrain;
- a light-region ID plus cardinal containment-edge bits, distinct from finite
  caster coverage;
- flags for face receiver, finite caster, transmission, and owner presence;
- owner/depth identity where alpha silhouettes overlap.

Each authored/caller-facing PointLight exposes only:

- logical terrain level at its ground foot;
- emitter height units;
- logical luminous and receiver-foot offsets;
- masks and quality class.

light-coordinate-mapper.ts creates a private PreparedPointLight containing the
projected luminous/receiver coordinates exactly once. No producer may construct
or mutate projected coordinates directly.

Masks are unsigned 16-bit values allocated from one registry in
lighting-types.ts; bit 0 is the default world channel and all omitted masks are
0x0001. A point light interacts with a caster/receiver only when
`(lightMask & pointCasterMask) !== 0` / `(lightMask & receiverMask) !== 0`;
the directional pass uses its separately registered caster channel.
Unallocated bits fail asset validation, and the registry is documented so two
features cannot silently reuse one bit.
The rollout permits at most two simultaneously active channel bits and lazily
allocates only channels present in the current solve. The default scene uses
only bit 0. A light with multiple bits stamps each active channel; a receiver
samples the per-channel maximum for bits shared with its receiverMask.

### Implementation

1. Replace the five behavior-specific blocker meanings with height, region/
   containment edges, finite-caster flags, and owner data. Keep compatibility
   adapters until current fixtures are ported. A closed containment edge blocks
   propagation between logical regions/levels; finite caster coverage never
   becomes an infinite visibility wedge within one exterior region.
2. Define the exact comparison:

   - effectiveEmitterHeight = emitterTerrainLevel times
     LIGHT_HEIGHT_SUBUNITS_PER_LEVEL plus emitterHeightSubunits;
   - cellBaseHeight = cellTerrainLevel times
     LIGHT_HEIGHT_SUBUNITS_PER_LEVEL;
   - blockerTop = cellBaseHeight plus blockerHeightSubunits;
   - an upward terrain step hard-blocks when cellTerrainLevel is greater than
     emitterTerrainLevel;
   - an opaque structural boundary hard-blocks only when the propagation step
     crosses its closed containment edge into a different light region and
     blockerTop is greater than effectiveEmitterHeight with zero transmission;
   - a transmissive cell uses the M5 owner-boundary attenuation rule instead of
     the opaque branch, even when its geometry is wall-height.

   Retain hard recursive visibility only for those topology-containment cases.
   Exterior objects/building silhouettes on the same region use §3's finite
   volume and become lightable again beyond its authored end.
3. Do not use an infinite shadowcasting wedge for finite-height props. Build
   rasterized finite shadow volumes from precomputed caster runs/contours:

   - project away from the light using caster height, emitter height, and
     source-to-caster distance;
   - for integer texel deltas dx/dy, define sourceDistanceTexels as
     `ceil((2 * max(abs(dx), abs(dy)) + min(abs(dx), abs(dy))) / 2)`;
   - define riseSubunits as effectiveEmitterHeight minus casterTop and compute
     `rawLength = ceil(pointCasterHeightSubunits * sourceDistanceTexels /
     riseSubunits)` with an integer ceilDiv helper when riseSubunits is
     positive;
   - when riseSubunits is zero or negative, rawLength is the authored maximum;
     a zero-height/none caster emits no volume;
   - define MIN_SHADOW_TEXELS = 1 and clamp rawLength to
     `[MIN_SHADOW_TEXELS, maximumShadowTexels]`; the metadata validator requires
     a positive maximum for every finite caster;
   - continue the integer supercover ray from source through caster for that
     many texels; exact corner ties visit X then Y, and all octants share one
     tested transform;
   - the first `ceil(3 * length / 4)` texels use authored opacity, the remaining
     texels and one-texel side apron use `floor(opacity / 2)`;
   - merge opacity by maximum, not repeated multiplicative stacking, then
     compute that contributor's shadowed band as
     `floor(unshadowedBand * (1000 - maxOpacityPerMille) / 1000)` before the
     cross-light RGB maximum.

   Here casterTop is
   `casterTerrainLevel * LIGHT_HEIGHT_SUBUNITS_PER_LEVEL +
   pointCasterHeightSubunits`.
4. Tree column casters use the authoritative trunk footprint but the same
   finite projection. Remove constant 64-texel columns after parity fixtures
   pass.
5. Cliff faces and building walls may own two independent descriptors: a
   closed region/level edge for actual topology containment, and a finite
   exterior drop-shadow caster on the receiving region. The finite caster is
   never inserted into the hard-edge grid. Door/portal edges are open. Remove
   the independent cliff Bresenham relight when the unified receiver tests pass.
6. Add deterministic rim spill from a higher emitter over a downward face.
   For positive integer level delta D, spill length is `min(3, 1 + D)` light
   texels; texels 1/2/3 receive 750/500/250 per mille of that contributor's
   already-gated band, rounded down and max-merged. Lower/equal emitters never
   spill onto upper caps through a step.
7. Produce one unrestricted RGBA8 slice and one south-face RGBA8 slice per
   active receiver level and active light-channel bit; RGB channels are
   meaningful and alpha is fixed at 255. M3 deletes M2's single-channel face
   buffer. For each light contributor, first compute its unrestricted RGB
   candidate after quantized band, transmission, occlusion, and finite-shadow
   attenuation but before cross-light merge. Quantize the existing south-face
   factor as
   `faceGatePerMille = clamp(floor(faceFactor * 1000 + 0.5), 0, 1000)` and set
   each face candidate channel to
   `floor((unrestrictedCandidateChannel * faceGatePerMille + 500) / 1000)`.
   Component-wise maximum merges face candidates exactly as it merges
   unrestricted candidates; it never gates an already merged RGB field and
   never borrows hue from the unrestricted winner.

   Build low-resolution receiverLevelMap,
   receiverClassMap, and receiverMaskMap buffers in painter order. Keep two
   distinct coverage masks as docs/27 requires: any authored alpha greater
   than zero participates in owner/depth coverage so an owner's umbra cannot
   multiply over its visible edge; only fully opaque alpha 255 participates in
   face relighting/umbra bypass. Partial edge texels never become bright holes.
   Transparent coverage preserves the receiver already visible beneath it.
   Flatten by selecting the mapped level/class and maxing only channel slices
   admitted by receiverMask.
   The final screen field never max-merges unrelated elevations.
   This receiver-aware flattened field becomes the sole final multiply target:
   delete M2's `face / ground` pre-darkening, draw all non-emissive receiver
   pixels at brightness 1, and use the south-face slice selected by the coverage
   maps. Keeping both mechanisms is a test failure because it would attenuate a
   south face twice. From M3 onward,
   `sampleIlluminationAtFoot('south', x, y, level, mask)` returns the same
   bilinearly sampled component-wise
   `max(skyRgb, southFaceDirectRgb, southFaceTransmittedDirectRgb)` selected for
   that receiver and ultimately multiplied by the compositor. Flat/omni select
   their specified unrestricted RGB slices. `sampleFaceIlluminationLuma`
   derives only from that returned south RGB with
   `floor((2126 * r + 7152 * g + 722 * b + 5000) / 10000)`; it remains for
   diagnostics and explicitly face-reactive effects, not sprite pre-darkening.
   Support up to MAX_SIMULTANEOUS_LIGHT_LEVELS = 8. Build/map validation scans
   every deployable production space and rejects a greater simultaneous range;
   editor documents may author more but cannot publish until the cap and
   budgets are explicitly extended. There is no classic fallback for an
   unsupported production map.
8. Require receiverClass, receiverLevel, and receiverMask in
   sampleIlluminationAtFoot and require faceClass/level/mask in
   sampleFaceIlluminationLuma. Calls without intentional values are a type
   error outside M2 compatibility code.
9. Add F3 views for terrain level, blocking height, caster volume, receiver
   level, face class, per-level light field, shadow opacity, and rim spill.

### Tests

- Lower light cannot illuminate an upper cap.
- Upper light illuminates its cap and only the specified rim/face spill.
- Same-level doorway passes light; walls contain it.
- Nested levels 0 through 7 select the correct receiver field; production-map
  validation rejects a ninth simultaneous level.
- Two light channels illuminate only receivers whose masks admit them, both in
  CPU sampling and flattened world composition.
- Red-behind/blue-front and blue-behind/red-front fixtures prove the south-face
  RGB sample is byte-identical to the flattened compositor field, keeps the
  admitted contributor's hue, and is not derived from M2's luma buffer.
- Shadow length increases with caster height and source distance, decreases
  with emitter height, and respects authored caps.
- Penumbra bands and side apron are deterministic.
- Two overlapping receiver elevations choose the frontmost painter owner.
- Tree, cliff, building, and prop shadows use one projection contract.
- Exact field goldens and owner-review screenshots cover all cardinal source
  directions and fractional source movement.

### Performance gate

- A normal dense-tree lantern scene remains within the 2 ms lighting p95
  target on the reference machine.
- Each extra visible elevation reports its memory and solve cost.
- With eight active levels and two active channels, all lighting fields and
  scratch storage stay within a provisional 96 MiB Native / 24 MiB Low cap;
  the ordinary one-channel/four-level fixture must remain below half those
  values. M0 records and the owner adopts
  the final device-specific caps before M3 exits.
- The low-quality two-texels-per-tile tier stays below the normal budget on the
  low-end target.
- If receiver-level composition cannot meet budget in Canvas, preserve correct
  sampling for terrain/faces and keep M3 behind its rollback flag while M4/M5
  metadata/caching are developed against unified mode. Re-measure after M5. If
  it still fails, the owner either adopts a numerical temporary budget or opens
  an explicit `M3-E early containment experiment` decision using M11's worker/
  GPU evidence and adoption protocol. Any WebGL prototype first amends
  docs/01 and docs/21 plus DECISIONS.md. M3 cannot exit merely because an
  experiment was requested.

## 8. M4 — Authored lighting metadata and complete coverage

### Objective

Move optical behavior out of overworld-main.ts switches and collision inference
into validated asset/building/terrain data.

This milestone corresponds to docs/39 v2.2 and v2.4.

### Primary files

- packages/tools/src/assets/types.ts
- packages/tools/src/assets/load.ts
- packages/tools/src/validate-assets.ts
- packages/tools/src/build-atlas.ts
- packages/tools/src/assets/pipeline.test.ts
- packages/client/src/render/assets.ts
- packages/client/src/render/light-occlusion.ts
- packages/client/src/overworld-main.ts
- packages/assets/**/*.sprite.json
- packages/assets/**/*.tile.json
- homestead/building and terrain-definition modules

### Schema

Add an optional source light block that compiles into BuiltAssetRecord:

    light:
      pointCaster: none | footprint | silhouette | column | volume
      pointCasterHeight: nonnegative multiple of 0.25 terrain levels; required unless none
      directionalCaster: none | silhouette | column
      directionalCasterHeight: nonnegative multiple of 0.25 levels; required unless none
      casterShapeMask: alpha | authored | footprint
      receiver: flat | south | omni
      emissive:
        mask: alpha | authored
        strengthPerMille: integer
        blend: lighter
      transmissionPerMille: optional integer from 0 through 1000
      shadowOpacityPerMille: integer; required for either caster
      maximumShadowTexels: positive integer; required for a non-none pointCaster
      maximumDirectionalShadowPixels: positive integer; required for a non-none directionalCaster
      lightMask: optional integer
      pointCasterMask: optional integer
      directionalCasterMask: optional integer
      receiverMask: optional integer
      contactShadow: native | none | authored | small | medium | large

Tile/structure metadata additionally supports:

    light:
      occlude: none | wall | face
      height: nonnegative multiple of 0.25 terrain levels
      lightRegion: optional validated region key
      containmentEdges: optional N/E/S/W bitset
      directionalCaster: none | silhouette | column
      directionalCasterHeight: nonnegative multiple of 0.25 levels; required unless none
      maximumDirectionalShadowPixels: positive integer; required unless none
      transmissionPerMille: optional integer from 0 through 1000

The build converts authored pointCasterHeight, directionalCasterHeight, and
structural height to integer pointCasterHeightSubunits,
directionalCasterHeightSubunits, and heightSubunits using
LIGHT_HEIGHT_SUBUNITS_PER_LEVEL. Runtime records never compare floats.
Transmission is scalar and attenuates the direct contribution once when a ray
crosses a logical owner: 0 is opaque and 1000 is fully passing. Multiple
raster texels belonging to the same window/foliage owner do not compound; two
distinct owners do. The attenuated result is merged into transmittedDirect by
the normal per-channel maximum and is not bounce light or global illumination.

Caster geometry is exact rather than inferred at runtime:

- footprint rasterizes the explicitly authored ground-plane footprint spans;
- silhouette rasterizes only alpha-255 runs from the frame-local built caster
  mask at the asset anchor;
- column rasterizes the authoritative trunk/pole ground footprint with the
  authored height (never the canopy);
- volume is restricted to structures and uses a filled authored footprint for
  a bounded exterior drop shadow. A separate lightRegion/containmentEdges
  record handles closed topology; volume coverage itself never enters the
  infinite hard-edge grid.

The build materializes all shape/mask handles plus frame-local bounds and
anchor. It does not silently fall back from missing authored geometry to broad
collision. Mechanical migration writes every conditionally required value
explicitly; there are no category-dependent runtime defaults.

Generated contact-shadow presets are fixed row spans in authored game pixels,
centered on the logical foot (negative Y is north). Darkness merges by maximum:

| Preset | Relative spans `(y: xMin..xMax @ opacityPerMille)` |
|---|---|
| small | `-1: -1..1 @ 250` |
| medium | `-2: -1..1 @ 125`; `-1: -2..2 @ 250` |
| large | `-3: -1..1 @ 94`; `-2: -2..2 @ 157`; `-1: -3..3 @ 250` |

`native` generates nothing and asserts that approved art already contains the
contact shadow; `none` deliberately has neither. `authored` requires the built
contact-shadow mask/bounds/anchor path rather than changing these constants.

### Implementation

1. Extend source, built-manifest, and loaded-asset TypeScript types.
2. Validate enum values, nonnegative integer ranges, required heights, uint16
   mask ranges/registered bits, the two-active-channel limit, and contradictory
   combinations. `occlude: wall` requires a valid region transition and at
   least one containment edge; a same-region finite exterior caster may not be
   compiled as a hard wall.
3. Emit a build warning when movement-blocking world art has no explicit light
   metadata. Promote the warning to an error after the migration inventory is
   complete.
4. Generate a mechanical first pass from current production behavior so M4
   initially renders byte-identically:

   - ponds, crops, decals, and low relief: no point or directional caster;
   - players and NPCs: no point caster by default, but an authored directional
     silhouette and contact shadow remain independently allowed;
   - trees: point column plus directional silhouette and south receiver;
   - rocks/ore/stations/chests/fences: authored silhouette or footprint;
   - emissive fires/portals: no point self-caster unless explicitly separated;
   - cliff/building walls: height wall/face;
   - doors, portals, stairs, and slopes: open or explicit transition.

5. Add metadata for generated homestead surroundings and buildings, not only
   network resource rows. Collision and lighting inventories may share asset
   identity but do not infer optical behavior from one another.
6. Precompute/cache alpha masks, simplified contours, opaque runs, receiver
   coverage, contact-shadow masks, and optional emissive masks during atlas
   build. Store compact row spans/bitsets or a bounded binary sidecar rather
   than enormous uncompressed JSON cell arrays. Runtime getImageData remains
   only as a temporary fallback for unconverted content.
7. Carry page-independent mask/contour coordinates in generated metadata so
   M9 atlas paging does not invalidate lighting data.
8. Replace hand-written elevatedLightOccluders/treeLightOccluders switches with
   registry traversal. Delete fallback inference only when validation proves
   all production world assets are covered.
9. Before selecting or changing any source artwork, follow docs/15's
   `.claude/skills/asset-discovery` workflow; any sprite/tile/contact-shadow or
   authored emissive-mask change also follows `.claude/skills/pixel-art`,
   docs/10, and docs/11. Metadata-only migration may reuse approved masks but
   must still run asset validation and the visual-neighbour review.
10. Treat scalar transmission as Required only if the §1.2 decision adopts it;
    otherwise omit it from the production schema and fixtures. RGB
    transmission is Deferred for this plan.
11. Make the additive metadata migration explicit: before M4 writers change,
    land a category-manifest v2 reader that accepts v1 and registry v3 reader
    that accepts v2 through M13's minimum 30-day window. Index remains v3 and marker
    remains v1 in M4. Only then emit category v2/registry v3. M9 performs the
    later, separate paging migration.

### Tests

- Schema and manifest round trip every field.
- Invalid heights, masks, receiver/caster combinations, and missing required
  metadata fail with asset names and actionable messages.
- Every movement-blocking approved world asset declares an explicit optical
  choice.
- Generated surrounding trees, furniture, homes, hives, targets, chests, and
  placeables appear in the expected caster inventory.
- Emissive assets never self-shadow unless deliberately authored.
- Native painted contact shadows and generated contact masks are mutually
  exclusive, and point/directional caster choices remain orthogonal.
- When scalar transmission was adopted in §1.2, it attenuates once per logical
  owner and merges by maximum across separate lights; the deferred branch has
  no transmission fixture or buffer.
- Prebuilt alpha masks/contours match current runtime masks on representative
  assets.
- M3 numeric fields remain byte-identical after switches are removed and the
  before/after screenshots are owner-review artifacts.

### Exit gate

- No production optical behavior is selected by a kind-name switch in
  overworld-main.ts.
- Runtime atlas readback is absent from normal startup.
- Asset validation, atlas build, and client loading remain backward-safe for
  the selected migration version.

## 9. M5 — Static/dynamic light fields and chunked occlusion

### Objective

Ensure a moving torch or one resource update cannot rebuild every steady light
or scan/allocate whole-world occlusion arrays.

### Primary files

- packages/client/src/render/lighting.ts
- packages/client/src/render/light-sources.ts
- packages/client/src/render/light-occlusion.ts
- packages/client/src/render/terrain.ts
- packages/client/src/render/ground-cache.ts
- packages/client/src/overworld-main.ts
- new packages/client/src/render/light-occlusion-chunks.ts
- related tests

### Implementation

1. Classify visible emitters:

   - steady static: fixed lamps, lit structures, non-flickering portals;
   - animated static: campfires/standing torches with stable position;
   - dynamic: carried lights, projectiles, combat effects;
   - halo-only: short visual flashes that do not justify shadow geometry.

2. Maintain independent ground and face buffers for:

   - steady-static direct field;
   - animated-static direct field;
   - dynamic direct field;
   - transmittedDirect when owner-crossing transmission is adopted;
   - final combined field.

3. Cache visibility/path cost out to each emitter's authored maximum radius,
   separately from colour, current radius band, strength, ambient, and halo.
   Radius flicker remaps quantized bands within that cached visibility and does
   not rebuild geometry.
   The occlusion grid carries `transmissionOwner`. A propagation edge applies
   attenuation only when the neighbour owner is nonzero and differs from the
   current-cell owner; adjacent texels of one owner therefore do not compound,
   while leaving and later re-entering is a distinct crossing. Best-strength
   comparison uses the attenuated integer band and the normal deterministic
   cell tie.
4. Update animated-static field energy on authority-derived animation slots
   (20 or 30 Hz only when exactly divisible from the authoritative 60 Hz tick).
   Keep its visibility stable. Do not presentation-crossfade field revisions;
   the quantized slot and seeded profile must render identically for the same
   authority tick. The emissive/halo core may animate at presentation cadence
   only where docs/27 already permits interpolated presentation.
5. Replace durable whole-world occlusion arrays with a chunk provider aligned
   to terrain's 16×16-tile chunks. Each chunk records:

   - immutable terrain height/wall data;
   - authored static caster descriptors;
   - dynamic object deltas;
   - topology halo/version;
   - estimated bytes and last-use generation.

6. Rasterize only chunks intersecting the padded M1 solve rectangle. Cache
   elevation/receiver layers and prefix data by chunk revision and quality.
7. Track both chunk-to-affecting-lights and light-to-covered-chunks where it
   reduces invalidation. A changed door/tree/placeable invalidates its chunk
   and required halo neighbours, not the full terrain.
8. Make terrain/resource/placeable revisions granular. Do not rebuild terrain
   occlusion when unrelated chest contents, health, or UI state changes.
9. Pool/reuse per-elevation typed arrays and prefix buffers. Use generation
   stamps where they beat clearing large arrays.
10. Merge steady-static, animated-static, dynamic, and transmittedDirect
    buffers with the binding per-channel maximum.
    Ambient changes perform only combine/upload work, never a reflood.
11. Add rebuild counters by field and invalidation reason.

### Tests

- A moving held light rebuilds only the dynamic field.
- A flicker strength change reuses static visibility.
- An animated-static tick rebuilds only its energy field and is identical for
  equal authority ticks.
- A steady light addition/removal rebuilds the static field but not terrain
  occlusion.
- One tree/door/placeable invalidates only its chunk and halo neighbours.
- Camera travel reuses chunk occlusion and evicts by the configured budget.
- Chunk seams match a monolithic reference solve.
- Static-plus-dynamic merge matches a full uncached reference field.
- Ambient and cloud changes do not increment flood/visibility rebuild counts.

### Exit gate

- Sixteen steady lights plus one moving light stays within the normal lighting
  p95 budget.
- Occlusion-cache resident bytes never exceed its M0-adopted byte budget plus
  the single largest mandatory pinned chunk. In the five-minute travel trace,
  every over-budget insertion evicts within the same frame and the final two
  minutes' max-minus-min stays within two maximum-size chunks; aggregate
  process/canvas memory also passes §19's plateau protocol.
- Resource mutations cause no full-world typed-array allocation.

## 10. M6 — Correct composition and complete the visual feature set

### Objective

Separate sky, direct, transmitted-direct, emissive, and atmospheric work so each has the
right update cadence and ordering, while preserving the binding pixel-art
defaults.

### Primary files

- packages/client/src/render/lighting.ts
- packages/client/src/render/light-sources.ts
- packages/client/src/render/particles.ts
- packages/client/src/render/animated-terrain.ts
- packages/client/src/overworld-main.ts
- packages/client/src/overworld-art.ts
- new packages/client/src/render/light-frame-preparer.ts
- settings/UI modules for accessibility and render quality
- related tests and deterministic review-screenshot fixtures

### Required composition

The conceptual order is:

    baseSky = canonicalAmbient(day, moon, weather)
              * cloudAttenuation * directionalShadowMask
    sky = component-wise max(baseSky, lightningOverride)
    direct = max(steadyStatic, animatedStatic, dynamic, transmittedDirect)
    rawIllumination = component-wise max(sky, direct)
    illumination = nightVisibilityLut(rawIllumination)
    litWorld = worldColor multiplied by illumination
    finalWorld = litWorld plus quantized emissive and halo pixels
    HUD = drawn after the final world presentation

The binding maximum is component-wise RGB maximum, not arithmetic addition.
Energy accumulation/tone mapping is Deferred and is not work required by this
plan; a later owner-approved research branch must not complicate production.

### Implementation

1. Split preparation into two explicit stages:

   - Early solve: before terrain/weather/effect consumers draw, traverse the
     current visible state without drawing, collect emitters/casters plus
     camera/quality/sky revisions, map logical PointLights to
     PreparedPointLights, and solve every level/channel slice. Public samplers
     select those slices directly from explicit receiver level/class/mask, so
     glints and rain never read the previous frame.
   - Ordered resolve: while the complete painter queue draws, record broad
     owner coverage, opaque receiver coverage, receiver level/class/mask, and
     depth-aware emission. After the queue, flatten the already-solved slices,
     build the sky/direct branches, composite, then draw the HUD.

   M7 folds the early traversal into WorldFramePreparer so this staging does
   not remain a duplicate snapshot scan.
2. Move cloud attenuation into the sky/ambient branch. Local lanterns, fires,
   portals, and combat lights must remain able to illuminate cloud-shadowed
   ground. Remove or repurpose WeatherEffects.drawCloudShadows so it never
   multiplies cloud darkness into world albedo before local lighting.
3. Keep canonical ambient anchors byte-exact. Add Night Visibility as a
   client-only presentation setting:

   - Authentic: exact existing ambient values;
   - Lifted: derive `floorByte = round(12 * nightAmountPerMille / 1000)` from
     the same canonical day/night interpolation, then map each byte with
     `floorByte + round(input * (255 - floorByte) / 255)`;
   - conceptually apply that one monotonic LUT after sky/direct maximum and
     before world multiply; Canvas may apply it to both branch light values
     before their `lighten` merge because monotonic LUT(max(a,b)) equals
     max(LUT(a),LUT(b)); public combined samplers return the same lifted value,
     while raw direct/sky debug views remain unlifted;
   - never changes authority, detection, world time, other clients, or saved
     simulation state.

4. Add authored quantized emissive masks through a depth-aware emission
   surface. Emission is recorded in painter order; later opaque foreground
   receiver coverage erases earlier hidden emission before newer emission is
   added. Never replay every emitter after multiply, which would make a fire
   behind a tree glow through that tree. A visible flame can be emissive
   without automatically lighting the world; its associated PointLight
   remains the illumination source.
5. Preserve the current quantized ember halo. Do not introduce Canvas radial
   gradients or full-resolution generic blur.
6. Implement the directional sun/moon silhouette pass already sanctioned by
   docs/27:

   - azimuth and strength derive from authority time, weather, and lunar
     illumination;
   - shadows are whole-pixel, bounded, low-alpha, and ambient dressing;
   - cliffs use height bands; entities use authored caster masks;
   - native painted contact shadows remain valid and are not multiplied twice;
   - mines/fixed-ambient spaces may disable this pass.

   Put the following pure integer preset in directional-shadows.ts and record it
   in docs/27; do not tune it implicitly in draw code. For clear surface time
   from 04:00 through 19:00, let
   `t = clamp(round((clockMinutes - 240) * 1000 / 900), 0, 1000)`,
   `horizontal = -750 + round(1500 * t / 1000)`,
   `edge = abs(2 * t - 1000)`, and
   `pixelsPerLevel = 4 + round(12 * edge / 1000)`. For caster height H
   subunits, `length = min(authoredCap, ceil(H * pixelsPerLevel / 4))`,
   endpoint X is `round(length * horizontal / 1000)`, endpoint Y is
   `max(1, round(length * (1000 - floor(abs(horizontal) / 3)) / 1000))`,
   vertical flatten is 500 per mille, and clear base opacity is 250 per mille.
   Rasterize the affine silhouette with integer row spans/supercover ties.
   Let weatherStrength be
   `clamp(1000 - round(cloudShadow * 1000), 0, 1000)`, capped at 400 while
   raining. When weatherStrength is below 600, use fixed direction `(1, 1)`
   normalized by Chebyshev length (endpoint `(length, length)`) and four pixels
   per level; at or below 100, disable. Final opacity is
   `floor(baseOpacity * weatherStrength / 1000)`. Outside 04:00–19:00, use the
   same fixed `(1, 1)` direction, four pixels per level, and base opacity
   `floor(125 * lunarIlluminationPerMille / 1000)` before weather. All endpoint,
   cap, opacity, and tie values receive raw numeric goldens.

   Use a one-texel-per-authored-game-pixel Uint8 directional mask, rasterized
   from built spans and nearest-upscaled with the integer world scale into an
   alpha:true directionalShadowSurface, so skewed silhouettes retain whole
   game pixels. Keep the CPU mask as the sanctioned sampler source; never read
   it back from Canvas, and apply the same logical-coordinate mask value in
   sampleIlluminationAtFoot/sampleFaceIlluminationLuma. Maintain one raw
   directional-darkness mask per active receiver level, merge overlapping
   casters by maximum darkness, and never alpha-stack them. During ordered
   resolve, a base-resolution eligibility/receiver-level map starts eligible
   for visible flat ground; any later painter-owned alpha greater than zero
   from a non-flat/elevated receiver clears eligibility at that pixel. Final
   sky selects the raw mask for the visible flat receiver level only, so a
   caster's ground shadow and older background shadows cannot darken the caster
   or unrelated foreground sprites. CPU sampling applies the directional mask
   only for flat receivers; south/omni receiver sky remains eligible ambient.
   Canvas composition is
   exact: copy world colour to skySurface and multiply canonical/cloud light
   plus the directional mask; copy world colour to directSurface and multiply
   the smoothed low-resolution direct field; draw directSurface onto skySurface
   with `globalCompositeOperation = 'lighten'` (per-channel maximum); restore
   `source-over`, add depth-resolved emission/halos, present, then draw HUD.
   Never draw the directional mask into source albedo. Reuse bounded backing
   capacities and include both branch surfaces in M10 memory accounting.

7. For assets that lack a usable native ground shadow, add an authored contact
   shadow underlay paired with its owner's painter record. It draws immediately
   before the owner or in a tested shadow-underlay phase, never as a second
   point-light occluder system.
8. Implement water glints, lit rain/splashes, and other light-reactive effects
   through sampleIlluminationAtFoot with an intentional receiver class, level,
   and mask. They do not draw into pre-multiply world colour. Instead, their
   painter records write a depth-aware reactiveEffectSurface during ordered
   resolve; later opaque foreground coverage erases older pixels exactly like
   emission. After world lighting, composite it with `lighter` before the
   authored emission/halo surface. For authored effect RGB C, quantized alpha
   A, and sampled illumination L, write each channel as
   `floor(C[channel] * L[channel] / 255)` at alpha A—do not also scale A and do
   not multiply the result by the global lightmap again. Water glints and
   ground splashes use `flat` at their terrain level; rain streaks use `omni`
   at their ground-impact depth/level. These pixels never feed the light field
   and are not gameplay emitters.
9. Implement deterministic lightning, portal rays, and canopy shafts only
   within docs/27 limits. All flashes honor reduceFlashes; nonessential motion
   honors prefers-reduced-motion. lightningOverride is zero outside its seeded
   envelope and otherwise enters the sky maximum after cloud/directional
   attenuation, so it can outshine point lights. reduceFlashes caps the
   override to exactly two quantized bands above the current unmodified sky.
10. Add light/caster/receiver masks to the production data path. If §1.2
   adopted scalar transmission, add it here as well: windows and foliage can
   transmit while low ground relief remains open. RGB transmission is a separately benchmarked developer
   extension and needs an adopted colour-model decision before becoming
   production behavior. RGB transmission is Deferred, not an optional task for
   the one-shot agent.
   The no-occlusion/LUT fast path is allowed only when the solve rectangle has
   no height blocker or finite caster and, in the adopted branch, no nonzero
   transmission owner.
11. Implement deterministic light prioritization only in developer comparison
   mode and Balanced/Low after the §1.2 owner decision; Native/unified renders
   every currently approved shadowed light:

   - hero lights: full finite shadows and receiver fields;
   - ordinary lights: normal field solve;
   - decorative/transient lights: halo/emissive only when appropriate;
   - selection is deterministic by gameplay importance, distance, stable ID,
     and configured budget;
   - enter/leave thresholds use a documented distance/budget hysteresis band
     and hold selection for a minimum authority-tick window, so camera jitter
     cannot pop shadows.

12. Add comparison/debug views for canonical ambient, clouded sky, direct
    steady-static, direct animated-static, direct dynamic, transmittedDirect,
    receiver level, final field,
    emissive, and overdraw.
13. Any new/changed emissive or contact-shadow art follows the
    asset-discovery/pixel-art workflow required in M4. Reuse current approved
    source art where metadata suffices.

### Tests

- Clouds attenuate sky but not local direct light.
- Authentic Full Moon and New Moon anchors remain exact.
- Lifted mode matches the exact LUT at dawn/day/night anchors, is monotonic,
  local-only, persistent, reversible, and identical between compositor and CPU
  samplers.
- Emissive pixels survive darkness but do not create unintended field energy.
- Balanced/Low selection is stable for identical state, camera, quality, and
  iteration order; hysteresis fixtures show no threshold pop. Native drops no
  approved light.
- Directional shadows use the same caster metadata and remain bounded.
- The full-resolution directional mask affects sky only; local direct light
  fills it through the `lighten` branch, and lightning overrides both cloud and
  directional darkness with the reduceFlashes cap.
- Rain/glints sample the correct receiver elevation.
- Reactive-effect numeric goldens prove sampled light is applied once, later
  foreground coverage erases older effects, and zero light adds zero colour.
- reduceFlashes and reduced motion cover every new effect.

### Exit gate

- The forest screenshot retains biome/material information in Lifted mode
  without changing Authentic output.
- Tree shadows are finite and feathered; flame cores remain readable.
- Cloud/local-light raw composition golden passes and its screenshot review is
  accepted.
- Directional, glint, and rain stages fit their documented sub-budgets.

## 11. M7 — Revision-driven scene preparation and renderer modularization

### Objective

Keep RAF presentation smooth while removing repeated snapshot scans, object
graphs, strings, closures, UI derivation, and layout work from unchanged
frames.

### Primary files

- packages/client/src/overworld-main.ts
- packages/client/src/render/renderer.ts
- packages/client/src/render/raised-terrain-depth.ts
- packages/client/src/render/terrain.ts
- packages/client/src/render/farmland.ts
- packages/client/src/render/animated-terrain.ts
- packages/client/src/render/pixel-ui.ts
- packages/client/src/ui/overworld-ui.ts
- packages/client/src/net/keyed-store.ts
- packages/client/src/net/keyed-store.test.ts
- packages/client/src/net/netcode.ts
- packages/client/src/net/netcode.test.ts
- packages/client/src/net/overworld-connection.ts
- new packages/client/src/render/world-frame.ts
- new packages/client/src/render/world-scene-builder.ts
- new packages/client/src/render/world-renderer.ts
- new packages/client/src/render/frame-indexes.ts
- new packages/client/src/ui/overworld-ui-model.ts
- new packages/client/src/render/text-cache.ts
- related tests

### Implementation

1. Add separate monotonic `membershipRevision` and `valueRevision` to
   KeyedStore/ReadonlyKeyedStore. Insert/delete/key-set change membership;
   every delivered insert/update `set` changes value regardless of object-
   reference reuse; clear changes both when nonempty. Do not deep-compare
   generated rows. Stable identity ordinals and structural indexes key from
   membership revisions, while motion/content interpolation keys from value or
   narrower domain revisions.
   Add a group-complete callback to netcode.ts's LatencyInjector.incomingGrouped
   boundary. OverworldConnection applies every mirrored store callback first,
   then publishes domain revisions and exactly one aggregate snapshotRevision,
   so a frame never observes half a SpacetimeDB transaction group. Per-row
   onChanged callbacks may mark pending domains but may not publish the facade.
   Document and test this contract.
   Track at least positions, resources, soil/crops, items,
   projectiles, chests/placeables, appearances, inventory/equipment,
   progression/quests, chat/speech, environment, topology, cellar geometry,
   permissions, and presence.
2. Make the network view a stable facade or materialize it only during fixed
   update. It must not manufacture a new wrapper/object graph for every RAF.
3. Define PreparedWorldFrame as plain reusable data:

   - camera/layout/space identity;
   - visible terrain/chunk descriptors;
   - numeric WorldRenderRecords;
   - lighting emitters/receivers/casters;
   - weather merge input;
   - nameplate/marker anchors;
   - UI-facing immutable/revisioned model;
   - debug counters.

4. Replace draw closures and localeCompare tie strings where practical with:

   - a discriminated numeric command kind;
   - indices/handles into stable snapshot or prepared arrays;
   - integer elevation, phase, projected foot Y, and a collision-free tie
     tuple;
   - receiver metadata from M2/M4.

5. Assign stable tie ordinals only when the source collection's membership revision
   changes by sorting its original string/bigint identity with the legacy
   comparator, then store `(sourceKindOrdinal, sourceOrdinal)`. Never coerce a
   database bigint to number and never treat a hash as collision-free. If two
   records legitimately share the tuple, use the retained legacy identity
   comparator as the final tie. Property tests compare the complete order.
6. Keep revision-cached topology/index records persistent. Use two reusable
   transient arenas for interpolation, weather merge entries, and the final
   painter list; prepare into the non-presented arena and swap atomically.
   Reset/reuse that arena at the beginning of its next preparation, never at
   frame end, so diagnostics, screenshots, and future consumers may retain the
   completed frame until the next swap.
7. Build FrameIndexes once per relevant network/snapshot revision:

   - mounts/riders;
   - carried chests, targets, and placeables by player;
   - quest/world items by surface or location;
   - interaction candidates;
   - other collections currently searched with repeated find calls.

8. Separate preparation revisions:

   - network/content revision;
   - camera-visible-chunk revision;
   - animation/presentation revision;
   - UI state revision;
   - viewport/UI-scale revision.

   Moving sprites still interpolate every RAF, but unchanged topology,
   inventory, quests, skills, equipment, dialogs, and window geometry are not
   rematerialized.
9. Split overworld-main.ts by responsibility without changing the public boot
   flow:

   - bootstrap/lifecycle;
   - fixed update and presentation clock;
   - snapshot/index preparation;
   - visible scene preparation;
   - Canvas world presentation;
   - lighting assembly;
   - UI presentation;
   - developer diagnostics.

10. Keep new modules purpose-built and acyclic. Do not introduce a generic
   scene graph or ECS.
11. Split OverworldUi work into updateLayout, updateBindings, and
    updateDynamic. Layout responds only to viewport, UI scale, touch mode,
    permissions, PWA affordances, and structural panel changes. Bindings
    respond to the relevant inventory/container/menu revisions. Dynamic
    animation, hover, cooldown, health, stamina, and time remain per frame.
12. Cache outlined bitmap text in a byte/entry-bounded LRU keyed by font,
   content, scale, colour, outline, and relevant style. Animated/changing text
   bypasses or invalidates correctly.
13. Revision-cache farmland topology/water sets and sparse animated-terrain
   descriptors per chunk.
14. Reuse minimap canvas storage and update only when its inputs change; avoid
    constructing a new canvas for every player tile crossing.
15. Add allocation counters in the render lab and inspect a browser allocation
    timeline after warm-up.

### Tests

- Numeric painter order matches the legacy comparator for randomized fixtures.
- Every non-ground command still enters the one painter stream.
- Prepared indexes reproduce current carried/rider/quest outcomes.
- An unchanged snapshot and UI state do not rebuild indexes or layout.
- Interpolated local/remote motion still updates every RAF.
- Text cache keys distinguish every visual style and evict predictably.
- Render-lab output is unchanged from the accepted post-M6 goldens.
- Module dependency test or lint check rejects cycles.

### Exit gate

- Idle and walking RAF allocation profiles are flat after warm-up except for
  browser-owned/transient instrumentation.
- Snapshot/index and UI-model p95 each improve by at least 25% in their
  triggering dense/full-UI fixtures, steady-state owned allocations fall by at
  least 80%, and total render p95 does not regress by more than 3%. If baseline
  work is already below the timer noise floor, accept zero rebuilds on
  unchanged revisions plus the allocation target instead and record why.
- No newly extracted module exceeds a 400-line soft cap without an explicit
  reason in its header.
- overworld-main.ts is a coordinator, not the implementation of every render
  subsystem.

### Rollback

Maintain a temporary development switch between legacy scene preparation and
PreparedWorldFrame until screenshot review, ordering, and input tests pass. Delete the
legacy preparer after acceptance; do not maintain two evolving scene systems.

## 12. M8 — Single-preparation weather merge and local dynamic-ground invalidation

### Objective

Remove multiplicative particle scanning and make soil, animated terrain,
minimap, and cellar mutations proportional to changed/visible chunks.

### Primary files

- packages/client/src/render/particles.ts
- packages/client/src/render/renderer.ts
- packages/client/src/render/ground-cache.ts
- packages/client/src/render/terrain.ts
- packages/client/src/render/farmland.ts
- packages/client/src/render/animated-terrain.ts
- packages/client/src/overworld-main.ts
- packages/sim/src/cave-autotile.ts
- packages/sim/src/cave-autotile.test.ts
- packages/client/src/net/overworld-connection.ts
- packages/client/src/render/light-occlusion.ts
- packages/client/src/render/terrain.test.ts
- packages/client/src/render/ground-cache.test.ts
- new packages/client/src/render/cellar-terrain.ts
- new packages/client/src/render/cellar-terrain.test.ts
- new packages/client/src/net/overworld-connection.cellar-region.test.ts
- relevant tests

### Weather implementation

1. Build one reusable list of active particle indices from every particle pool.
2. Give each active index its complete deterministic depth key and stable tie.
3. Sort active indices once, or place them into bounded depth buckets where
   that preserves exact order.
4. Initially preserve the renderer's existing depth-gap callback, but make it
   consume one monotonic cursor over the prepared active list. Once token-order
   parity is proven it may become a direct two-cursor merge. Either form is
   O(pool capacity + P log P + world records) with comparison sort, where P is
   active particles. Claim linear time only if a proven bounded bucket sort
   replaces P log P without changing tie order.
5. Draw each active particle exactly once. Do not scan inactive capacity for
   every world item.
6. Preserve complete rain streak/splash ordering at ground-impact depth and
   existing camera/zoom behavior.

### Dynamic-ground and cellar implementation

1. Introduce a client-only CellarTerrainOverlay that clones the generator's
   blocked/elevation/collision buffers once per space/seed/base version and
   applies insert/update/delete excavation deltas in place. Include a monotonic
   client cellar geometry revision for cache invalidation; it is not an
   authoritative sequence and is never used to infer a missed server delta.
2. Keep the existing full terrain/collision construction as the test/debug
   correctness oracle and reconnect/reset fallback, not work performed on every
   production mutation. Add a bounded regional recompute that
   clears and rebuilds the changed cells plus the contour/projected-face
   dependency halo. Randomized tests compare incremental state with a full
   rebuild after every mutation.
3. Add groundCache.invalidateChunk and invalidateNeighbourhood APIs keyed by
   full space/generator/seed/version identity.
   The monotonic excavation revision is not part of GroundChunkCache's whole-
   terrain identity: including it would clear every chunk on every dig.
4. Coalesce all deltas from one transaction/frame. Dirty both old and new
   coordinates for moves/updates and the required topology halo, then
   invalidate each affected cellar chunk once.
5. Update both authoritative-shape client collision planes (base blocked and
   per-elevation terrainPlaneBlocked) and light-occlusion chunk deltas from the
   same terrain change record before publishing the new geometry revision.
6. Cache/pre-tint cave-floor/background chunks rather than performing
   drawImage plus save/composite/fill/restore per visible tile every RAF.
7. Revision-cache farmland topology, watered state, and dynamic soil
   descriptors; cull before materializing draw data.
8. Store sparse animated-terrain descriptors by chunk instead of scanning
   every visible tile when only a few animate.
9. Reuse minimap backing storage and update dirty strips/chunks when practical.
10. Replace or explicitly invalidate terrain.ts's mutable-terrain WeakMap
    derivatives (contours, transitions, plateau grids, and maximum elevation)
    for the changed tile plus halo. A cellar-specific regional derivation is
    acceptable; retaining stale WeakMap results is not.
11. On a detectable OverworldConnection subscriptionGeneration change,
    reconnect/resubscribe, mirrored-table clear/full-snapshot replacement, or
    active space/seed/base-version change, pause client prediction against that geometry,
    atomically rebuild the overlay and both collision planes, invalidate the
    whole cellar once, then resume. Do not alter authority collision in this
    milestone. Ordinary row groups are assumed complete at M7's group-complete
    publication boundary; without an authority sequence the client does not
    claim to detect a missing row event.

### Tests

- Randomized merge output equals the current depth-range result.
- Complexity counters show one pool-capacity scan, one monotonic cursor advance
  and draw per active particle, and no capacity rescan per world record; sort
  comparisons are reported separately.
- Maximum pool capacity with zero active particles performs one O(pool
  capacity) scan, independent of world-item count.
- One cellar excavation changes only expected terrain/light/collision chunks.
- Insert/update/delete batches dirty old and new coordinates, coalesce same-
  frame changes, and recompute both collision planes.
- Neighbour-dependent autotile edges invalidate exactly the required halo.
- Incremental contour/transition/plateau/maximum-elevation results equal a full
  reconstruction after randomized mutation sequences.
- Cave-floor cached output matches the current tinted result.
- Soil and animated terrain caches update on their precise revisions.

### Exit gate

- The 500-world-item rain fixture no longer performs roughly
  (items + 1) times 296 checks.
- Repeated single-tile excavation produces no full-array clone or whole-cache
  flush.
- Rain and cellar p95 remain inside total render budget without ordering
  regressions.

## 13. M9 — Bounded atlas pages and demand-driven asset loading

### Objective

Eliminate extremely tall decoded atlases, lower startup/decoded memory, permit
future GPU-compatible texture sizes, and make transient asset failures retryable.

### Primary files

- packages/tools/src/build-atlas.ts
- packages/tools/src/validate-assets.ts
- packages/tools/src/assets/types.ts
- packages/tools/src/assets/pipeline.test.ts
- packages/tools/src/preview.ts
- packages/client/src/render/assets.ts
- packages/client/src/render/assets.test.ts
- new packages/client/src/render/asset-page-cache.ts
- new packages/client/src/render/asset-page-cache.test.ts
- packages/client/src/overworld-art.ts
- packages/client/src/overworld-art.test.ts
- packages/client/src/loading-screen.ts
- packages/client/src/loading-screen.test.ts
- packages/client/src/optimization-boundaries.test.ts
- packages/client/vite.config.ts
- packages/client/pwa-service-worker.ts
- packages/client/src/pwa.ts
- packages/client/src/pwa.test.ts
- docs/44-progressive-web-app.md
- loading-screen and space-transition modules
- generated-manifest tests

### Page format

1. Cap generated atlas pages by both dimensions and decoded bytes: 512 by 2048
   and at most 4 MiB RGBA decoded in this rollout. A larger cap requires a
   separate measured decision; 4096 by 4096 is explicitly disallowed because
   it decodes to roughly 64 MiB. Keep the existing pixel-exact PNG encoding
   unless evidence supports another lossless format.
2. Keep all frames of one asset on one page whenever possible so LoadedAsset
   continues to own one CanvasImageSource. Fail the build with an actionable
   error if one asset itself exceeds the page.
3. Add atlas page identity to BuiltAssetRecord and page-aware manifest keys.
   Land dual readers before changing writers: index v4 reads current v3,
   category v3 reads M4's v2, marker v2 reads current v1, and registry v4 reads
   M4's v3 through M13's minimum 30-day window. Then switch writers, fixtures,
   and service-worker discovery together; M13 removes legacy readers only after
   old sessions are outside support.
4. Frame rectangles and marker layers remain page-local and revisioned (unless
   marker coordinates are converted to frame-local during this migration).
   Lighting alpha runs, contours, contact masks, and emissive masks remain
   asset-frame-local/page-independent as required by M4.
5. Validate maximum width/height, decoded byte estimates, missing page
   references, overlapping frames, and stable asset IDs during asset build.
6. Content-address every lazy dependency. Each encoded PNG filename contains
   its own SHA-256 content hash. Build a canonical pre-index/Merkle descriptor
   from schema versions, packer algorithm/version, dimensions, encoder
   settings, sidecar formats, and ordered child artifact names/content hashes.
   Explicitly exclude the root index and its revision/revisionId fields, hash
   that descriptor once, then emit the root index with the resulting release
   revision. The root index names revisioned/content-addressed category
   manifests, marker/mask sidecars, and registry as well as pages; runtime code
   never reconstructs a fixed sidecar path. A query string alone is
   insufficient. Publish release directories atomically and retain supported
   revision files for M13's minimum 30-day service-worker/session window so an old
   active client can lazily request an uncached optional page after deployment.
7. Generate, encode, and release one page/season RGBA buffer at a time. Do not
   retain every page or every season's decoded build buffer simultaneously.
8. Before switching production writers, the owner confirms an actual deploy
   path that publishes versioned directories atomically and retains supported
   prior releases. That infrastructure is outside this repository; without it,
   keep paging behind its migration flag and mark the deployed old-session
   acceptance externally blocked. A service worker cannot infer that no old
   live client exists.

### Loading

1. Split loadOverworldArt into explicit bundles:

   - core: missing asset, UI, terrain, local avatar;
   - active-space: environment/building/space-specific pages;
   - nearby entity kinds derived from the incoming snapshot;
   - optional crop, wildlife, crafting, mine/interior, seasonal, and editor
     groups.

2. Start core-art loading and connection/current-space discovery concurrently.
   Once the first committed snapshot identifies Overworld, Homestead,
   interior, cellar, season, and visible kinds, await that exact active-space
   bundle and publish it atomically before revealing play. A season/space
   transaction keeps the prior complete art snapshot visible until the new
   required bundle is ready. Prefetch portal destinations and snapshot-visible
   entity pages.
   If either bootstrap peer fails or is cancelled, dispose/abort the surviving
   peer through WorldSessionLifetime before exposing retry; no orphan
   connection or loader may outlive a failed start.
3. Render a deliberate placeholder while an optional page loads, then
   invalidate the relevant prepared frame when it resolves.
4. Add an image/page loader with:

   - promise deduplication;
   - rejected-promise removal;
   - bounded retry with backoff for transient failures;
   - byte/entry accounting and active/recent diagnostics;
   - AbortSignal on fetch/blob acquisition;
   - loader-generation and active-space-generation checks before publication;
   - explicit disposal.

   Introduce that ownership model in M9: LoadedAsset stores an AssetPageHandle,
   not an untracked permanent image reference. Core/active-space art snapshots
   and any completed frame arena that can outlive a swap hold explicit leases;
   atomic snapshot replacement releases the old leases only after its last
   presented arena retires. AtlasPageCache accounts decoded bytes, evicts only
   refcount-zero least-recent pages, and closes an evicted ImageBitmap when the
   conditional bitmap path is active. Space transition releases the old
   bundle, and session/loader disposal invalidates its generation and releases
   every lease. Mandatory core/active pages may temporarily oversubscribe only
   with M10's diagnostic and aggregate-pressure policy.

5. Call image.decode where supported before first draw and record decode time.
   HTMLImageElement.decode is not cancellable: an abort suppresses its late
   publication through loader/disposed generations rather than pretending to
   cancel the browser decode.
   createImageBitmap is Conditional: use it only if M0 proves a decode/present
   benefit and every replaced/stale bitmap is closed; otherwise defer it.
6. Do not duplicate a complete atlas page for marker recolouring. Cache
   recoloured assets as snug canvases or generate small derived pages keyed by
   marker override. A snug result also rewrites frame source rectangles to the
   new zero-based origin while preserving anchor/local mask coordinates; tests
   forbid sampling its former page coordinates.
7. Add build/bundle reports for initial compressed JS, initial images, total
   route JS, page dimensions, and estimated decoded bytes. Code-split rare UI,
   editor, debug, and benchmark modules where the current build graph shows
   they are eagerly loaded.
8. Prefer an OverworldArtStore whose published art snapshot changes atomically
   when a required bundle completes. Idle-prefetch likely next bundles through
   requestIdleCallback with a timeout fallback; hidden tabs do not prefetch.
9. Update PWA precache/runtime discovery for revisioned pages. New service
   workers remove cache entries only for release revisions outside the
   owner-declared support window; activation/claim alone is not proof that no
   old tab exists, and client code never unregisters the worker as cleanup.
   Failed activation leaves the previous release usable. Test the update
   handshake described by docs/44.

### Tests

- No generated page exceeds its cap.
- No asset spans pages unexpectedly.
- Every frame and marker/mask reference resolves to its declared page.
- Seasonal pages preserve identical pixels/metadata.
- Legacy manifest migration either works intentionally or fails with a clear
  version message.
- Transient image failure can retry in the same session.
- Optional page completion triggers exactly one presentation invalidation.
- Refcount-zero pages evict by decoded-byte LRU; live core, active-space, and
  retained-frame leases never evict, and transitions/disposal release them.
- Marker overrides allocate only snug output storage.
- A disposed loader and a superseded space generation ignore every late fetch
  or decode completion.
- An old active session can fetch a previously uncached old-revision category
  manifest, mask/marker sidecar, and optional PNG page after a new deployment.

### Exit gate

- The 512 by 24,640 character atlas no longer exists.
- Initial decoded-image estimate is at least 40% below M0's baseline and cold
  start p95 regresses by no more than 10%; replace those relative gates with
  owner-adopted absolute byte/time limits once M0 writes the reference record.
- Cold-start and portal-transition fixtures show no missing-frame crashes.
- Production build and service-worker asset discovery include every page and
  no stale monolithic page.

## 14. M10 — Memory budgets, quality settings, lifecycle, and loop hardening

### Objective

Bound display/canvas/cache memory, provide explicit quality tradeoffs, and make
the client safe across visibility changes, remounts, failures, and long stalls.

M10 has a binding decision gate before implementation: effective-DPR world
backing and the separate HudPresenter canvas topology deviate from docs/21's
native-DPR single-display-canvas contract. The owner must first approve the
change, append the decision to DECISIONS.md, and amend docs/21 in that same
checkpoint. This is required even if Native remains the default and
Balanced/Low are opt-in. If approval is withheld, retain the existing
native-DPR display/HUD path and rewrite M10's DPR/HudPresenter branch; do not
silently introduce the topology as an implementation detail.

### Primary files

- packages/client/src/render/renderer.ts
- packages/client/src/render/lighting.ts
- packages/client/src/render/ground-cache.ts
- packages/client/src/render/terrain.ts
- packages/client/src/loop.ts
- packages/client/src/display.ts
- new packages/client/src/render/hud-presenter.ts
- new packages/client/src/render/hud-presenter.test.ts
- packages/client/src/overworld-main.ts
- packages/client/src/net/overworld-connection.ts
- packages/client/src/main.ts
- packages/client/src/account-main.ts
- packages/client/src/audio/audio-bus.ts
- packages/client/src/audio/audio.test.ts
- packages/client/src/pwa.ts
- packages/client/src/pwa.test.ts
- packages/client/src/lifecycle-registry.ts
- packages/client/src/lifecycle-registry.test.ts
- settings/UI modules
- related tests

### Quality model

Add a documented setting:

| Mode | Display backing | Light resolution | Effects |
|---|---|---|---|
| Native | Existing full device DPR | Four texels/tile | All approved effects |
| Balanced/Auto | Backing-pixel budget selected from measured device/display constraints | Four texels/tile where budget permits | Hero shadow budget; normal atmosphere |
| Low | Lower backing-pixel budget | Two texels/tile | Reduced nonessential shafts/particles and lower-cadence animated lighting |

Native preserves the accepted post-M6 unified reference. Making Balanced the
default requires the decision amendment in §1.2.

Native first attempts the browser's requested DPR. Balanced chooses from the
discrete tested set `[2, 1.5, 1.25, 1]` and Low from `[1.25, 1]`, removing
candidates above the requested value and choosing the first that fits both the
pixel budget and an 8,192-pixel backing dimension. Balanced normally never
falls below 1. Native falls back through `[3, 2, 1.5, 1.25, 1]` filtered to
values strictly below the failed/requested DPR if allocation
throws, returns a null context, silently reports the wrong backing dimensions,
fails a one-pixel resize-time draw/read probe, loses the context, or a dimension
limit would be exceeded;
the fallback is visible in diagnostics. A sub-1 emergency tier requires a
separate decision and a dedicated HUD strategy. Parse persisted quality and
Night Visibility before the first renderer resize so startup cannot allocate a
Native backing and immediately discard it. Define final pixel budgets from
reference-device measurements; do not bury unexplained limits in renderer.ts.

Balanced/Low use that dedicated strategy in this plan: the world presentation
canvas uses effective DPR, while HudPresenter renders at requested native DPR
into at most eight reusable, absolutely positioned canvases covering the snug
UI layout rectangles (overlaps are merged). It never allocates a transparent
viewport-sized HUD merely for a few corner panels. Bitmap/UI scale remains an
integer in CSS game pixels; physical backing uses requested DPR, so arbitrary
requested/effective ratios do not add a browser resample to text. Full-screen
dim/color wash belongs to the world/CSS layer; a genuinely full-screen menu is
accounted as such by the aggregate budget. Pointer mapping remains in CSS
coordinates. Native may use the same presenter after parity, avoiding two UI
architectures.

### Implementation

1. Report display, world, light, halo, chunk, terrain, text, atlas, and scratch
   backing estimates separately.
2. Add byte-budgeted LRUs for terrain identity/classification, ground chunks,
   light occlusion chunks, text bitmaps, derived marker assets, and M9's
   refcounted atlas pages. The active working set is mandatory; a previous-space pin
   is only opportunistic and becomes evictable under pressure. Emit an explicit
   oversubscribed-budget diagnostic whenever mandatory active resources alone
   exceed a cache or aggregate budget.
3. Add one aggregate renderer-memory coordinator. On pressure it evicts, in
   order: unpinned text/derived assets and refcount-zero atlas pages,
   previous-space caches, eligible terrain and ground/occlusion chunks, then
   requests a lower quality tier if policy
   permits. Independently bounded caches are not allowed to exceed the total
   budget invisibly.
4. Allow the grow-only world backing to trim on explicit space transition,
   quality change, or disposal—not during ordinary eased zoom.
5. Implement HudPresenter from UI layout rectangles, with deterministic overlap
   merge, native-DPR backing, integer CSS placement, capacity reuse, disposal,
   and aggregate byte accounting. Composite order in the DOM is WebGL/world,
   then HUD panels; all panels use alpha:true and pointer-events remain routed
   through the existing input layer.
6. Benchmark alpha:false for opaque world/display contexts and remove redundant
   full clears only after exact visual/browser checks. Light/halo/mask canvases
   retain alpha.
7. Extend and audit M0's nested LifecycleRegistry. Disposing a world session
   reverses its initialization:

   - stop RAF;
   - abort DOM listeners through an AbortController;
   - clear timers/intervals;
   - close subscriptions/network handles;
   - terminate workers;
   - release audio and optional ImageBitmap/WebGL resources;
   - clear appropriate caches and developer globals.

   Every subsystem introduced in M1–M9 registers its disposer when it is
   created rather than postponing leak fixes to M10. Fetch/decode completions
   check a disposed generation before publication. Clear held keyboard,
   pointer, touch, and gamepad input on hide, blur, and dispose. Clear
   window.__orchardOverworld only when it still references the disposing
   instance.

   AppLifetime separately owns PWA/update and account-shell resources. A world
   remount never unregisters the service worker or clears PWA caches.
   PwaClient.dispose removes only its own listeners/interval and resets its
   restart/update state; service-worker unregister is an explicit user/admin
   operation outside normal disposal. Final app teardown disposes children
   before the parent.

8. Fix FixedStepLoop with an explicit running generation/token. stop called
   inside update, render, or the initial render must prevent the next RAF.
   Double start remains idempotent. Add an accumulator reset used on a fresh
   start after visibility pause so hidden time never creates a catch-up burst.
9. Instrument current 250 ms/15-update catch-up behavior before changing it.
   If reference traces show long catch-up hitches, define and test an explicit
   maximum-update/drop policy compatible with client prediction; do not
   silently drop deterministic authority work.
10. Extend reduced-motion behavior to nonessential weather/lighting/camera/UI
   animation while leaving gameplay timing unchanged.
11. Ensure all rejected manifest/category/image promises are evicted so later
   retry works.
12. Keep effective quality/DPR, estimated bytes, evictions, oversubscription,
    disposal state,
    active RAF generation, and catch-up data visible in diagnostics.

### Tests

- Effective-DPR math for requested DPR 1, 1.25, 1.5, 1.75, 2, 2.625, and 3,
  large 4K viewports, and every quality mode.
- At arbitrary requested/effective ratios, world may rescale but HUD bitmap
  text/panel pixels use native backing, integer CSS placement, and no extra
  browser-scale pass; panel count/capacity remains bounded.
- Native fallback never tries a DPR above the failed request and handles thrown,
  null-context, clamped-dimension, and silent draw-probe allocation failures.
- Repeated resize does not accumulate transforms or reallocations within a
  capacity bucket.
- Byte-budgeted caches evict least-recent eligible entries and preserve pins.
- When active resources exceed a budget, the previous-space pin is released
  and an over-budget diagnostic remains until pressure resolves.
- stop inside update/render/initial render schedules no further RAF.
- Hidden/show and remount cycles run exactly one loop.
- dispose releases every registered listener, timer, subscription, worker, and
  resource handle.
- Blur/hide/dispose clears every held input; stale asynchronous completions and
  an older instance's disposer cannot mutate the active client/global.
- Failed asset load can retry.
- Reduced-motion modes preserve logical game state and input.

### Exit gate

- A 4K/DPR-2 display cannot allocate an undocumented 126.6 MiB display buffer
  in Balanced/Low mode.
- Fifty space changes, resizes, hide/show cycles, and route remounts reach a
  stable memory plateau after GC.
- Native mode remains identical to the accepted post-M6 unified reference.
- No lifecycle-related console errors or duplicate network/RAF activity.

## 15. M11 — Conditional worker and GPU experiments

### This milestone is not automatic

M11 executes only when M0–M10 measurements prove a remaining bottleneck or the
owner explicitly approves a GPU-only visual requirement. A failure to meet a
gate produces an OPEN decision and evidence package; it does not authorize an
engine migration. The sole ordering exception is an owner-approved M3-E after
M5 remeasurement; it uses the same predeclared gates and remains behind the M3
flag. Before any WebGL prototype—including visual-only capability work—the
owner updates docs/01 and docs/21 and records the narrowly scoped experiment in
DECISIONS.md.

### Worker gate

Prototype a worker only if:

- LightFieldSolver is a significant main-thread p95/long-task contributor;
- total CPU cost is acceptable but input/RAF scheduling is not;
- the target devices have useful spare cores;
- transfer/cancellation cost is expected to be smaller than the contention.

If triggered:

1. Keep LightFieldSolver DOM-free.
2. Send compact light descriptors and chunk/revision changes, not full terrain
   every RAF.
3. Let the worker own its occlusion/light caches.
4. Use double-buffered transferable typed arrays or ImageBitmap output.
5. Tag jobs with space, camera, quality, occlusion, and light revisions; discard
   stale completions.
6. Allow at most one job in flight and one coalesced latest request; never queue
   every RAF. Define ownership of each transferable buffer. A posted buffer is
   worker-owned until returned, stale/replaced ImageBitmaps are closed, and
   results from old space/quality/dispose generations are rejected.
7. Permit decorative lighting no more than one 60 Hz simulation tick stale;
   accept a camera-generation mismatch only when the returned solved bounds,
   including its sampling guard, fully cover the current visible/sample
   rectangle and space, quality, occlusion, receiver, and light dependencies
   still match. Never block presentation while waiting. If the bound is
   missed, reuse the last spatially compatible field
   with a diagnostic or run the main-thread fallback according to the tested
   policy.
8. Terminate on dispose and retain the main-thread fallback.
9. Compare total CPU, main-thread p95, sampled input-to-render-submit p95, transfer
   bytes, memory,
   and battery/thermal behavior.

### WebGL2 gate

Prototype WebGL2 only if optimized Canvas still violates the 4 ms renderer
budget or the owner approves a separate capability experiment for features
such as many soft-shadowed lights,
selective normal maps, or per-pixel receiver materials.

If triggered:

1. First formalize LightingBackend/LightingCompositor lifecycle and capability
   interfaces. Canvas remains the reference implementation.
2. Implement WebGL2 behind a developer flag with:

   - nearest-filtered world/sprite inputs;
   - low-resolution light/receiver/height/material textures;
   - no GPU-to-CPU readback;
   - context-loss/restoration;
   - explicit texture/framebuffer/shader disposal;
   - Canvas fallback.

3. Prototype and measure both possible synchronization topologies:

   - candidate A: WebGL owns final world presentation, uploads the Canvas world
     once per frame, applies the light shader, and M10's overlaid alpha:true
     HudPresenter canvases are presented afterward;
   - diagnostic B: WebGL produces a light overlay that Canvas 2D draws back
     before its HUD, including any forced GPU/CPU synchronization.

   Adopt A only if the extra HUD surface/lifecycle passes; B is not accepted if
   readback or synchronization erases the gain. Measure full-world
   Canvas-to-texture upload. A compositor that uploads a
   multi-megabyte world canvas every RAF is not accepted merely because its
   shader is fast.
4. A light-only overlay must preserve receiver/elevation identity; a shader
   over an already flattened colour canvas cannot repair missing semantics.
5. Consider 1D polar shadow maps for a bounded set of hero point lights before
   SDF/JFA. Selective normal/specular maps come only after the basic backend
   passes.
6. Do not implement WebGPU-only, Radiance Cascades, or a full framework
   migration in this plan.

### Adoption gate

Declare the gate before writing the prototype. A worker ships only if it lowers
both main-thread lighting p95 and sampled input-to-render-submit p95 by at least 25%
in the triggering fixture, adds at most 10% total CPU and 15% renderer memory,
and respects the one-tick staleness bound. A WebGL backend ships only if it
lowers triggering total-render p95 by at least 25%; p99 and low-end p95 may not
regress by more than 5%, renderer memory by more than 15%, startup by more than
the greater of 100 ms or 5%, and the dormant fallback abstraction by more than
3%. A capability-triggered WebGL feature with no like-for-like Canvas baseline
uses a separate owner-approved gate: it must stay within the normal 4 ms total
render and 2 ms lighting p95 budgets plus the same p99, memory, startup,
low-end, fallback, and browser-support ceilings; it does not invent a 25%
speedup comparison. In addition, either experiment ships only if it:

- preserves exact raw-field goldens and accepted visual-review artifacts;
- works on the minimum supported browsers/hardware or falls back cleanly;
- handles context loss;
- meets the predeclared numerical improvement and regression ceilings;
- causes no repeatable battery/thermal regression in the fixed-duration device
  trace;
- is approved and recorded in DECISIONS.md.

Otherwise delete/reject the failed backend experiment. Retain only a backend
interface that has an owner-recorded architectural reason, stays within the 3%
fallback overhead ceiling, and removes more duplicated Canvas lifecycle/test
code than it adds.

## 16. M12 — Final qualification, cleanup, and documentation

### Automated verification

At minimum:

    npm run assets:build
    npm run assets:validate
    npm run typecheck
    npm run lint
    npm test
    npm run build

Run targeted suites after each milestone and the complete commands at every
phase boundary. Generated atlases/build output remain ignored unless repository
policy explicitly says otherwise.

Separately run `npm run dev`, confirm that the development server boots, open
the candidate through the project's preview/run workflow, and actually play for
at least two minutes: walk, interact, complete a timed action, inspect layering,
and watch the console. Capture the screenshot required by docs/15 for this
visual work. This development boot/interactive check is mandatory and does not
substitute for the deployed canonical-URL gate below. When the T3 shared preview
is used, follow AGENTS.md and use `https://orchard.dastari.net/` after the
candidate has been deployed there.

### Browser and visual verification

Use the deterministic render lab first, then authenticated gameplay. Verify the
canonical deployment at https://orchard.dastari.net/.

Before claiming M12, the owner must provide or authorize: deployment of the
candidate build at the canonical URL, two non-production test identities, and
permission/access for any admin time/weather controls used by the fixtures.
Without these external prerequisites, complete every local check and record M12
as externally blocked rather than fabricating a live-pass result.

Required passes:

- Chromium fixed-viewport screenshots for human review for all M0 fixtures;
- the exact minimum Chromium, Firefox, and Safari/WebKit versions and oldest
  supported OS/device rows adopted in M0, at least as functional/visual smoke
  checks. If a minimum row is unavailable, M12 is blocked until it can run or
  the owner formally reduces the support matrix in DECISIONS.md and the
  affected docs; only additional browser versions beyond the matrix are
  optional;
- DPR 1, 1.25, 1.5, 2, and 3;
- integer and fractional zoom, rapid resize, and quality changes;
- synthetic RAF-timestamp tests at 60, 120, and 144 Hz plus real 120/144 Hz
  hardware checks where available (headless viewport settings do not prove a
  real high-refresh presentation path);
- two authenticated clients for remote lights and building doorway spill;
- hidden tab for 30 seconds and restore;
- reduced motion, reduce flashes, Authentic/Lifted night visibility;
- five minutes of travel;
- fifty space transitions;
- repeated cellar excavation;
- cold and failed/retried asset loads;
- context loss if M11 WebGL exists.

Capture:

- before/after screenshots;
- benchmark JSON;
- Chrome Performance traces for representative normal and stress scenes;
- allocation/heap snapshots;
- bundle and atlas reports;
- console output.

docs/15 currently prohibits client rendered-pixel assertions. Therefore raw
CPU light/height/receiver arrays and operation sequences are the automated
goldens; complete rendered screenshots are immutable before/after review
artifacts, not CI assertions. If the owner amends docs/15 to permit a pinned-
Chromium image gate, set the initial tolerance to maximum per-channel delta 2
and at most 0.1% differing pixels. Only the owner may approve a rebaseline, and
the immutable pre-plan artifact remains stored beside the accepted new golden.

### Documentation

This list is an M12 audit/reconciliation pass, not permission to defer docs.
Every behavior-changing milestone must update DECISIONS.md and each affected
binding document in the same logical commit, as docs/15 requires. At M12,
re-read and reconcile those already-current records without overwriting
concurrent owner changes:

- DECISIONS.md: confirm the adopted or owner-amended docs/39 model actually
  implemented, and record each default/quality/backend decision. If the owner
  rejected the core model, this plan was blocked/superseded at §1.2 and must
  not enter M12;
- docs/02-architecture.md: final preparation/renderer/lighting boundaries;
- docs/11 asset pipeline documentation: lighting metadata, prebuilt masks,
  page format, bundles;
- docs/14-roadmap.md: claimed/completed milestone and measured results;
- docs/21-unified-renderer.md: field bounds, metrics, quality, lifecycle;
- docs/27-lighting-design.md: retained aesthetic and completed features;
- docs/30-infinite-terrain.md and docs/35-homesteads-and-farming.md: height
  provider/building contracts;
- docs/39-lighting-v2.md: adoption status and implementation deviations;
- this document: completion ledger, actual measurements, and deliberately
  deferred work.

### Cleanup

- Remove temporary subphase flags and adapters except the explicitly supported
  classic rollback, dual manifest readers, runtime legacy-mask fallback, and
  retained release files listed for M13. Record those exceptions and their
  expiry; M12 must not delete compatibility needed by an active old session.
- Delete vestigial blocker classes, unused pulse/profile plumbing only when no
  authored asset or retained support-window classic path uses them, redundant
  unified cliff/trunk paths, and stale metrics.
- Confirm no debug benchmark fixture is eagerly shipped into production.

M12 exits when the owner-reviewed candidate passes the local and canonical
release gates and ships with its declared compatibility paths retained. That is
release readiness, not final completion of this program; the M7.3 roadmap claim
remains open until M13 finishes after the support window.

## 17. M13 — Post-release compatibility retirement

This is a real final phase, not work performed in the M12 release commit. Ship
the unified default with the old classic architecture and dual manifest readers,
then support it for at least one owner-reviewed production release and 30
calendar days. The same 30-day window governs server release-directory and PWA
cache compatibility. The owning agent may pause for this external window but
retains the M7.3 claim and resumes from the recorded release/hash.

Primary retirement files are lighting.ts/light-flood.ts/light-occlusion.ts,
render/assets.ts and asset-page-cache.ts, build-atlas.ts, pwa-service-worker.ts,
their migration tests, docs/14, docs/21, docs/27, docs/39, and DECISIONS.md.

After the window, and only with owner approval plus either seven consecutive
days of deployment logs showing no legacy artifact requests or the full 30-day
expiry when such logs are unavailable:

1. Convert any retained classic visual behavior into a parameter preset on the
   unified solver/compositor, then delete parallel bounds, sampling, occlusion,
   and composition code.
2. Remove the explicitly versioned legacy category/registry/index/marker
   readers, runtime atlas mask readback, and expired service-worker/release
   artifacts. Never delete a still-supported immutable release.
3. Run the complete M12 suite, retry an upgrade from the last supported old
   service worker once more, update the completion ledger/DECISIONS/docs, and
   only then mark roadmap M7.3 complete.

M13 exits only when no parallel classic implementation, legacy manifest reader,
runtime mask readback, expired release cache, or temporary compatibility flag
remains; the unified/classic-preset raw goldens and new-manifest cold load stay
green.

## 18. Feature and rollback policy

Keep the durable surface small:

- lightingModel: classic | unified during migration;
- renderQuality: native | balanced | low;
- nightVisibility: authentic | lifted;
- reducedMotion and reduceFlashes;
- lightingBackend only if an approved optional backend exists.

Internal milestone flags may exist while work is incomplete, but are removed at
the milestone's exit. Correctness fixes and metrics are not user flags.

Classic is a visual rollback, not a second architecture that receives every new
feature forever. Each behavioral milestone must provide:

- a deterministic old/new comparison fixture;
- one clear flag or commit-level rollback;
- an explicit data/schema migration path;
- a removal condition for the old implementation.

By M13, `classic` is either a parameter preset on the new solver/compositor or
is retired by an owner decision; it is never a second architecture after the
support window.

## 19. Benchmark matrix and acceptance budgets

Warm each steady-state scenario for five seconds, then measure for 30 seconds
(expect at least 1,800 frames at 60 Hz) on the same browser/device. Record p50,
p95, p99, maximum, rebuild
counts, allocation counts, cache statistics, estimated bytes, and RAF intervals.
Cold load follows M0's 30 independent measured browser starts after one harness
validation run. Transition measurement follows M0's five complete cycles of 50
transitions (250 transition samples). Do not pool these protocols or substitute
five cold starts.

| Scenario | Primary acceptance |
|---|---|
| Day, no lights, idle camera | Stable light fields perform no solve; total render p95 at most 4 ms on the reference laptop. |
| Dense forest, moving lantern | Only dynamic field rebuilds; no edge pop; lighting p95 target at most 2 ms. |
| 36 torches plus 4 campfires plus blockers | Normal multi-light field stays within docs/27's adopted budget. |
| 40 maximum-radius blocked lights | Pathological report: no crash, long-task cascade, or unbounded allocation; p95 at most 16.67 ms on the reference device. |
| 500 world items plus maximum rain | One capacity scan and one draw/cursor advance per active particle; no per-world capacity rescans; total render target maintained. |
| Three nested levels, ramp, cliff, door | Correct containment, receiver level, finite shadow, penumbra, and rim spill. |
| Eight simultaneous levels, two light channels | Correct mask isolation; Native/Low field bytes remain inside M3's adopted caps. |
| Building inside/outside lights | Walls contain, door spills, two clients agree. |
| Clear/rain Full Moon and New Moon | Authentic anchors exact; cloud affects sky rather than direct local light. |
| Minimum, fractional, 2/4/8 zoom | No repeated backing allocation; no world shimmer. |
| DPR 1/1.25/1.5/2/3 and 4K | Correct square pixels, crisp HUD, documented/bounded quality memory. |
| 60/120/144 Hz | Simulation remains 60 Hz; no duplicate loops; revision-driven preparation avoids unnecessary work. |
| Inventory/trade/chat open | UI model/layout rebuild only on their revisions. |
| Repeated excavation | Local terrain/light/collision/cache invalidation only. |
| Fifty space transitions/resizes | Cache and decoded memory plateau after GC; no listener/resource leak. |
| Hidden/restore/remount | Zero active RAF while hidden/disposed; exactly one after resume. |
| Accessibility modes | Night lift, reduced motion, and reduced flashes operate independently of simulation. |

Absolute timing gates belong to the documented reference device, not variable
shared CI runners. CI gates deterministic output, operation/rebuild counts,
allocation events, dimensions, bundle budgets, and memory-budget logic.

Until re-measured/adopted values replace them, retain docs/27's component
targets on its established reference fixtures: ordinary ambient/flood/stamp at
most 1.5 ms, total normal lighting p95 at most 2 ms, halo at most 0.3 ms,
directional shadows at most 0.5 ms, and glints/lit-rain at most 0.2 ms.
Pathological maximum-radius stress scenes are reported separately.

For the fifty-transition/resizes memory plateau, use a pinned Chromium build
with precise-memory information enabled where supported. Run three untimed
warm-up transitions, then five independent 50-transition cycles. Request GC
three times only in the instrumented test build, wait two animation frames,
and record JS heap, `measureUserAgentSpecificMemory` where available, Canvas/
image estimates, and browser renderer-process RSS. The post-cycle median may
retain no more than the greater of 5% or 16 MiB over the post-warm-up median;
JS heap alone cannot pass the gate.

M0 writes compressed-byte baselines and owner-approved absolute limits for
initial JS, initial required images, and each lazy route. Until those absolute
numbers are adopted, no checkpoint may increase initial or route compressed
bytes by more than 5%; M9 must additionally meet its 40% decoded-image
reduction. Bundle reports fail on either the absolute or relative limit.

## 20. Test and CI strategy

### Vitest

Add raw numeric goldens and unit/integration tests for:

- M1 solve bounds and all off-screen positions;
- coordinate round trips and bilinear sampling;
- face gating and competing lights;
- height comparison, projection, penumbra, containment, doors, nested levels,
  receiver ownership, and rim spill;
- authored metadata and legacy migration;
- static/dynamic/ambient invalidation;
- chunk seams, revisions, eviction, and byte budgets;
- cloud/direct composition, canonical ambient, accessibility LUT, deterministic
  atmosphere;
- painter numeric-key parity;
- snapshot indexes and UI revisions;
- particle/world merge order and work counters;
- cellar/soil/animated-terrain invalidation;
- atlas page placement, metadata, retry, pins, and loading bundles;
- quality/DPR/backing calculations;
- loop stop/double-start/visibility/disposal.

Prefer raw light, height, receiver, and shadow arrays as exact goldens. Complete
Canvas screenshots remain review artifacts under docs/15 unless the explicit
M12 amendment and numeric gate are adopted.

### Browser regression

If a pinned browser-test dependency is approved:

1. Add test:browser:render, bench:render, and bundle:check scripts.
2. Run the no-auth render lab in fixed Chromium with fixed viewport, DPR, seed,
   tick, and fonts/assets.
3. Compare low-resolution CPU fields exactly. Keep full screenshots as review
   artifacts unless docs/15 is explicitly amended; if amended, use M12's
   numeric tolerance and rebaseline authority.
4. Run Firefox/WebKit as smoke tests, not pixel-identical references.
5. Upload screenshots, diffs, metrics, traces, and reports as artifacts.

If no dependency/docs-15 amendment is approved, keep deterministic Vitest
goldens and make T3/shared-browser screenshot review mandatory.

### CI jobs

- existing check/typecheck/lint/unit/asset validation;
- production build;
- Chromium renderer regression when approved;
- atlas/page/bundle budget validation;
- optional non-blocking reference benchmark report.

Do not make absolute milliseconds a flaky shared-runner gate.

## 21. Suggested implementation checkpoints

One agent may own the whole effort, but it should preserve independently
reviewable/revertible checkpoints:

1. docs: adopt renderer and lighting hardening plan
2. test(client): add deterministic renderer laboratory
3. chore(client): make renderer telemetry phase accurate
4. fix(client): preserve offscreen point-light origins
5. fix(client): stabilize lightmap capacity
6. feat(client): unify receiver light sampling
7. feat(client): add receiver-aware height fields and finite shadows
8. feat(assets): compile authored light metadata and masks
9. feat(client): consume terrain/building height and light metadata
10. feat(client): split steady, animated, and moving light fields
11. feat(client): cache visibility and chunk occlusion
12. feat(client): correct sky/direct/emissive atmosphere composition
13. feat(client): extract prepared world-frame pipeline
14. fix(client): index snapshot state and cache UI presentation
15. fix(client): prepare weather once and merge with painter records
16. fix(client): make cellar and dynamic ground invalidation local
17. feat(assets): page atlases and load bundles on demand
18. feat(client): enforce cache/canvas quality budgets
19. fix(client): add complete disposal and loop lifecycle
20. test(client): add browser and memory regression coverage
21. chore(client): run the gated worker or WebGL2 experiment if triggered
22. docs: record measured release and retained M13 compatibility
23. chore(client): retire compatibility after M13's support window

Implementation approval must include permission for the roadmap claim and these
checkpoint commits because docs/15 requires them. Do not squash them before
review. If commit permission is withheld, stop after planning/baseline evidence
and ask the owner to resolve the workflow conflict; an execution log is not a
silent substitute for the binding claim rule.

## 22. Recommendation traceability

| Audit recommendation | Planned milestone |
|---|---|
| Fix off-screen source clamping | M1 |
| Correct misleading LIGHT timing and add percentiles | M0 |
| One sampled light truth for faces/effects | M2 |
| True receiver elevation and explicit heights | M3 |
| Finite, feathered tree/prop/cliff shadows | M3 |
| Authored caster/receiver/material semantics | M4 |
| Prebuild alpha masks/contours | M4 |
| Complete missing furniture/building/generated-tree occlusion | M4 |
| Static/dynamic split and geometry cache | M5 |
| Chunked occlusion and granular revisions | M5 |
| Cloud affects sky rather than local light | M6 |
| Emissive layer and accessibility night lift | M6 |
| Directional/contact grounding and light-reactive weather | M6 |
| Data-driven hero-light budgets and quality tiers | M6/M10 |
| Remove per-RAF scene/index/UI reconstruction | M7 |
| Replace closure/string painter churn and repeated finds | M7 |
| Cache text, soil, animation, and minimap work | M7/M8 |
| Replace multiplicative rain scanning | M8 |
| Chunk-local cellar excavation/cache updates | M8 |
| Page and lazy-load large atlases | M9 |
| Retry failed assets and avoid full-atlas recolour copies | M9 |
| Bound DPR, terrain, canvas, chunk, image, and text memory | M10 |
| Fix stop-inside-frame and add one dispose boundary | M10 |
| Worker only for proven main-thread contention | M11 |
| WebGL2 only behind an owner/performance gate | M11 |
| WebGPU/SDF/JFA/normals/GI kept as research, not baseline | Deferred by M11 |

## 23. Final Definition of Done

The complete program is done only when:

- The implementation is based on an owner-approved checkpoint and contains no
  lost or overwritten user work.
- docs/39's core model is formally adopted or owner-amended and that exact
  recorded model is implemented. Rejection blocks/supersedes this plan and can
  never satisfy this Definition of Done.
- All commands in M12 pass.
- Off-screen lights retain their real origins and all four edge goldens pass.
- Ground, faces, effects, and diagnostics use one sampled light truth.
- Receiver elevation, terrain height, walls, doors, buildings, nested cliffs,
  finite shadows, penumbrae, and rim spill pass numeric goldens and visual
  owner review.
- Static, animated, moving, ambient, and halo changes invalidate independently.
- Production light occlusion comes from authored metadata and chunk revisions;
  normal startup performs no sprite-atlas readback.
- Clouds, emissive pixels, canonical moon values, accessibility lift,
  directional shadows, glints/rain, reduced motion, and reduced flashes match
  their adopted specs.
- The normal, stress, rain, and whole-render reference budgets pass on the
  documented machine.
- Light, particle, terrain-tile, and prepared-record hot loops allocate nothing
  in steady-state fixtures below their preallocated capacity; deliberate
  capacity growth, cache miss, and asset arrival allocations are counted and
  bounded separately.
- Rain/world interleaving eliminates multiplicative rescans and remains within
  O(pool capacity + active particles log active particles + world records)
  unless the tested bucket implementation proves a linear bound.
- Cellar and dynamic-ground changes invalidate local chunks only.
- Atlases are bounded pages, initial loading is demand-driven, and failures can
  retry.
- Display and every persistent renderer cache have observable budgets and
  memory plateaus after stress/GC.
- Native output matches the newly owner-approved post-M2/M3/M6 unified
  reference (not the pre-plan shadow/composition bugs); lower quality and night
  lift are explicit user choices.
- Hidden-tab, resume, remount, dispose, reduced-motion, and long-stall paths are
  tested.
- Browser visual regression, real gameplay, and two-client lighting passes are
  complete.
- Any worker/GPU experiment either meets its adoption gate and has an approved
  decision, or is clearly rejected/deferred with evidence.
- Temporary migration flags, compatibility shims, debug-only allocations, and
  dead paths are removed.
- DECISIONS.md and affected design documents record actual final behavior and
  measurements.

The intended meaning of “one shot” is one agent owning the whole dependency
chain, evidence, and cleanup. It is not permission for a flag-day rewrite that
remains red until the final step.
