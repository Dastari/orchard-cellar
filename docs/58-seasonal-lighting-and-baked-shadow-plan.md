# 58 — Seasonal Lighting and Asset-Declared Baked Shadows

Implementation plan, **2026-09-05**. Status: **core implementation deployed as 0.5.0 — 2026-09-06; asset exceptions and measured performance limits recorded below**.
Companion to [11](11-asset-pipeline.md) (asset compilation),
[21](21-unified-renderer.md) (Canvas composition),
[27](27-lighting-design.md) (lighting aesthetic and lunar calendar),
[39](39-lighting-v2.md) (height-aware lighting), and
[47](47-rendering-lighting-performance-plan.md) (execution and performance gates).

The owner's direction: preserve the artist's baked shadows in the **same asset**.
Declare their exact RGBA colour in asset metadata. When dynamic lighting is on,
do not render those pixels; when it is off, render the original pixels and apply
one screen-wide darkness/colour treatment. Dynamic sunlight should travel across
the sky, rising and setting; moonlight should read blue; seasons should change
the illumination. **Full-moon nights must cast visible moon shadows**, moving
with the moon in Dynamic mode. Do not maintain shadowed/shadowless source assets or ship
separate lighting variants of the artwork.

This document specifies the implementation; completed portions are recorded in §12.
The owner requirements above are settled. Numeric art presets below are proposed
starting values to tune through the existing visual-review workflow.

## 1. Goal and scope

A single sprite can be drawn in two lighting modes without changing its asset ID,
pixel grid, animation, anchor, collision, or seasonal art selection:

| Behaviour | Dynamic | Basic |
|---|---|---|
| Declared baked-shadow pixels | Omitted from world artwork | Rendered unchanged |
| Local lights and occlusion | Enabled | No preparation, solve, or composite |
| Generated sun/moon and contact shadows | Enabled | Disabled |
| Sky appearance | Directional and diffuse components | One uniform world tint |
| Day, season, moon phase, weather | Shared celestial state | Same celestial state |
| HUD and menus | Separate, untinted | Separate, untinted |

Basic is the low-cost option described as “potato” in the owner discussion. Its
player-facing label is **Basic**. It is not full brightness, a frozen daytime
scene, or a smaller version of the dynamic light solver.

Required work includes metadata, build validation, cached Canvas drawing,
graphics settings and persistence, complete Basic bypasses, seasonal celestial
state, directional light integration, replacement shadows, and deterministic
visual/performance fixtures. Existing native source shading inside opaque
artwork remains intact. Normal maps, repainting assets, a GPU backend, accurate
astronomical ephemerides, new weather simulation, and authority-side lighting
state are outside this plan.

## 2. Findings from the current workspace

### 2.1 The shadow colour is explicit in existing art

The imported `sourcePalette` and pixel grids contain:

| Asset | Exact shadow colour | Matching pixels in its current base frame |
|---|---|---:|
| `tree_cf_oak_mature` | `#00000028` | 285 |
| `tree_cf_birch_mature` | `#00000028` | 408 |
| `tree_cf_spruce_mature` | `#00000028` | 250 |
| `tree_cf_palm_mature` | `#00000028` | 383 |
| `tree_cf_fruit_mature` | `#00000028` | 100 |

`#00000028` means RGBA `(0, 0, 0, 40)`, approximately 15.7% opacity. It occurs
in 34 of 39 current tree source palettes. `tree_cf_oak_stump` instead declares
`#00000064`, approximately 39.2% opacity. That second colour also occurs in 164
of 355 prop palettes; this is a candidate inventory, not proof that every such
prop pixel is a ground shadow. Seven current effect palettes contain neither
exact value. These are source-data observations, not a pack-wide classification.

### 2.2 Existing seams to extend

- `packages/tools/src/assets/types.ts`: `AssetSource`, including exact native
  palette values. `build-atlas.ts` resolves pixel RGBA and writes one image per
  category/season, plus category metadata and a compact bootstrap index.
- `packages/ui/src/assets.ts`: `BuiltAssetRecord`, `LoadedAsset`, lazy category
  loading, revision checks, seasonal image selection, and marker recolouring.
- `packages/ui/src/sprite.ts`: shared frame selection across animations,
  variants, and named states.
- `packages/engine/src/overworld-art.ts`: common world draw helpers; other
  direct atlas consumers also exist in terrain, weather, and cache code.
- `packages/engine/src/light-occlusion.ts`: sprite caster masks use alpha
  `>= 128`. This happens to exclude both observed shadow values from blocking,
  but does not hide them in the displayed sprite or identify their semantics.
- `packages/engine/src/lighting.ts`: local flood, ambient colour keyframes,
  lunar darkness, and the Classic/Unified comparison. The ambient schedule has
  fixed hours and does not consume seasonal progress.
- `packages/client/src/overworld-main.ts`: light collection, occluder creation,
  receiver correction, world composition, settings, and diagnostics. The
  developer “lighting effects disabled” switch currently forces white ambient
  and skips the lightmap; it is not the requested Basic mode.
- `packages/sim/src/time.ts`: existing authority-derived 15-minute days,
  seven-day seasons, 28-day years, and independent 29.5-day lunar phase.

### 2.3 Constraints from existing plans

Doc 47 still treats Classic as a preserved A/B baseline and its M3/M4/M6 work as
separate milestones. Its native-contact-shadow option and fixed nighttime
directional offset do not express this owner's newer requirement. Section 3
below states the amendments explicitly; do not quietly call all of doc 47
implemented or duplicate its height/receiver solver under new names.

The canonical shared-browser URL is `https://orchard.dastari.net/`. It returned
502 during the preceding review. There is no new visual acceptance evidence
from that review; implementation must capture it when the preview is available.

## 3. Decisions and invariants

1. **One authored asset and one asset ID.** `bakedShadowColor` identifies the
   declared pixels; original artwork remains unchanged. Doc 59 A1 emits
   disposable per-page `.omit.png` variants without alternate authored assets
   or content IDs. Existing seasonal images remain supported.
2. **Exact per-asset RGBA selection.** No global alpha threshold, RGB-only
   match, tolerance range, or automatic black-pixel rule. A missing declaration
   means there is no suppression. Never infer the runtime rule from a filename.
3. **Compile spans and shadowless page variants.** The atlas builder derives
   compact frame-local spans from the exact declared colour, then emits an
   `.omit.png` for each affected bounded page. Every byte outside the declared
   spans must equal the original. Runtime selects the committed page cohort;
   the filtered-frame cache, preparation budget and streaming fallback are deleted.
4. **Original artwork remains immutable.** Never erase pixels from a shared
   atlas or replace `LoadedAsset.image` globally. UI thumbnails, Basic mode,
   another scene, and Studio may consume the same loaded asset concurrently.
5. **Preserve the three settled Video modes.** Basic and Classic use original
   pages and never request `.omit` images. Dynamic uses unified seasonal
   lighting and the shadowless cohort. Internally the persisted Basic/Dynamic
   quality and Classic/Unified solver keys remain independent; the 2026-09-06
   Video amendment exposes Basic / Classic / Dynamic as already shipped.
6. **Basic does no spatial lighting work.** It has one uniform tint operation
   over the active world viewport and no lighting-specific full-screen scratch
   surfaces. Ambient evaluation is constant work, independent of light count.
7. **One celestial state.** Dynamic and Basic consume the same time, seasonal
   interpolation, moon phase, and weather inputs. No new database rows, timers,
   reducer calls, gameplay clock changes, or wall-clock astronomy.
8. **Separate diffuse sky, sun, moon, and local illumination.** Shadows attenuate
   their contributing light before combination. A sunlight shadow cannot erase
   moonlight, a lantern, or all diffuse sky illumination.
9. **No double shadows.** A declared pixel is either present in Basic or absent
   in Dynamic. Dynamic generates contact/directional shadows from body geometry,
   not from the extracted baked ellipse. Replacement ground shadows respect
   receiver level, coverage, owner, and painter depth.
10. **Atomic transitions.** A frame uses one effective quality and one atlas
    revision throughout preparation, drawing, and composition. Never show a
    partially prepared mixture of original and shadowless artwork.

These requirements amend doc 47's pixel-identical Classic requirement for the
new owner-directed shadow suppression, its native contact policy for declared
assets in Dynamic, and its static moon-shadow offset. They amend doc 27's fixed
daylight hours through the seasonal policy below. Unrelated performance,
accessibility, terrain, and gameplay contracts remain binding.

**Amendment (2026-09-06, doc 59 decision A1):** D1 and D3 are amended. The
atlas builder now also emits a per-page `.omit.png` variant with the declared
spans cleared. One authored asset, one asset ID and one source PNG still hold;
the variant is disposable build output derived from `bakedShadowColor`, like
the spans. [Doc 59](59-client-render-performance-recovery-plan.md) P3 deletes
the runtime filtered-frame cache and replaces §5.1 with committed page selection. D4 (original
artwork immutable at runtime) and D10 (atomic transitions) are unchanged.

## 4. Asset and build contract

### 4.1 Source metadata

```jsonc
{
  "name": "tree_cf_oak_mature",
  "bakedShadowColor": "#00000028",
  "sourcePalette": {
    "6": "#00000028"
  }
  // Existing frames, anchor, collision, and provenance remain unchanged.
}
```

The field is optional and singular. A declared colour identifies **every pixel
with that exact RGBA within that asset's frames**. It is not restricted to the
bottom of the frame. An asset using the same RGBA for an unrelated effect must
remain undeclared until that ambiguity is resolved; do not silently introduce
position-based exceptions or another mask-authoring system.

Validation rules:

- Accept exactly `#RRGGBBAA`, case-insensitively; normalize to lowercase.
- Require `0 < AA < 255`: this contract classifies translucent baked shadows,
  not invisible padding or opaque body shading.
- Require at least one matching pixel across all exported frames. A frame with
  zero matches is valid and carries no filtered surface.
- Compare decoded integer RGBA, including alpha, using the build's pixel colour
  resolver. Include autotile expansion and every animation/variant/state.
- A declared shadow pixel may not be a runtime recolour marker. Seasonal remaps
  must preserve the declared RGBA at those coordinates; validate every season.
  Non-shadow coordinates may not remap into the reserved colour either. Native
  exact source palettes already bypass seasonal remaps.
- Reject declarations on UI/font assets for this rollout. World thumbnails can
  still display declared world assets without suppression.
- Report asset name, group/frame, matching count, bounds, and non-shadow
  translucent colours. Inventory scripts suggest declarations; they do not
  approve every matching asset automatically.

### 4.2 Generated representation

Extend each category's built asset record with the colour and a per-frame
selection. Use the existing group/frame identity and local pixel coordinates:

```ts
interface BuiltBakedShadowFrame {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  // Sorted, disjoint triples: y, startX, length. End is exclusive.
  readonly spans: readonly number[];
}

interface BuiltBakedShadow {
  readonly color: string;
  readonly frames: Readonly<Record<string, readonly BuiltBakedShadowFrame[]>>;
}
```

Built frame selection must align with `selectAtlasFrame` for animations,
variants, and states (a state is frame index 0). Validate span bounds, ordering,
length, frame count, and agreement between span lengths and `pixelCount`.
Deduplicate aliases of an identical frame rectangle inside a loaded revision.

Build spans while exact RGBA is available, before browser image decoding. This
avoids relying on Canvas readback to round-trip semitransparent colour channels
through premultiplication. It also makes the runtime selector independent of
whether an image is an HTML image, a recoloured canvas, or an ImageBitmap.

Keep spans in lazy category metadata, not `atlas.meta.json` or the compact
global registry. No second raster mask is shipped. Doc 59 A1 additionally
emits one shadowless variant per affected bounded page, listed in `omitAtlases`.
Metadata changes participate in the revision hash even when PNG bytes are
unchanged. An unchanged original atlas should remain byte-identical after
adding only the shadow declaration.

The current category manifest is schema v1 and compact registry is v2. Add a
category v2 reader before emitting category v2; accept both versions and legacy
monolithic records. Missing metadata is a no-op. The compact registry need not
change when its structure does not change. Coordinate with doc 47 if its schema
migration has already landed: extend the current schema rather than reusing an
existing version number for a different format. Never accept mismatched image,
category, and index revisions. Follow the existing PWA update lifecycle.

## 5. Rendering and quality contract

### 5.1 Canvas page selection (doc 59 P3 amendment)

`world-asset-presentation.ts` selects a committed page cohort for world contexts.
Original intent uses `LoadedAsset.image`; shadowless intent uses the `.omit.png`
image at the **same page-local frame rectangle**. Anchor, destination size,
transform, flip, seasonal identity and marker recolours remain unchanged.
`asset-frame-types.ts` contains only pure frame/span metadata helpers.
`AssetFrameSourceCache`, its tests, `WorldShadowAssets`, filtered-frame budgets,
pinning and runtime clearing/preparation are removed.

The UI loader requests omit pages only for unified Dynamic. A candidate cohort
keeps the previous complete cohort usable until all required pages are ready;
commit occurs at the quality frame boundary. A newly streamed affected asset's
load promise waits for its omit source before publication. Basic/Classic/reset
cancel outstanding requests and release omit page references and any marker
recolour canvases. These pages never enter the permanent original-page cache.
Unique decoded image bytes and marker Canvas bytes are diagnosed separately.

World frame descriptors are immutable rectangle metadata with a lazy image
getter. They create no surfaces and retain no omit image after cohort reset,
even when inherited chunk contexts outlive the quality transition. Chunk cache
keys include cohort identity/revision; original UI contexts remain independent.
Dynamic casts from body-only geometry; collision remains unchanged.

### 5.2 Quality state and settings

Introduce `LightingQuality = 'basic' | 'dynamic'` and store it as
`orchard.video.lighting-quality`. The shared setter is used by Graphics UI,
diagnostics, and automation. The settled Video UI displays **Lighting: Basic / Classic / Dynamic**;
Basic retains baked shadows with day/night colour.

Persistence precedence:

1. Valid new quality key wins.
2. If absent/invalid, a stored legacy effects-disabled value of `true` migrates
   to Basic; all other values resolve to Dynamic to preserve current intent.
3. Persist the resolved quality once and retire the old effects toggle as a
   player preference. If a full-bright diagnostic is retained, give it a
   separate development-only control with no automatic persistence migration.
4. Preserve the stored Classic/Unified solver value independently. Basic ignores
   it; the existing Video selector maps Basic / Classic / Dynamic onto the two
   persisted keys.

Maintain requested and effective quality while preparing a transition. Basic
and Classic release variant ownership at the next frame boundary. Dynamic
commits only when its required page cohort and lighting inputs are ready;
until then retain the previous complete presentation. A newly streamed asset
waits for its required page before its loader publishes it. Cancellation and
superseded generation guards prevent late results from reviving retired pages.
A page load/decode/dimension failure records a concise reason and uses the
existing complete Basic fallback while preserving the requested choice for
retry. There is no filtered-frame budget, preparation queue or budget fallback.

### 5.3 Basic render path

```text
authority clock + environment -> shared celestial state -> uniform ambient RGB
input/update -> ordinary world painter using original artwork
             -> one world-only multiply fill -> ordinary HUD/UI -> display
```

The fill covers the active world viewport, not spare canvas capacity. Set and
restore transform, clipping, alpha, and composite operation explicitly. Use
`multiply` with an opaque RGB fill; skip the fill when RGB is white. Do not use
a CSS filter on the containing page or include HUD pixels in the operation.

Gate work at its producer, not only `lightmap.prepare()`:

- Skip lighting-only point-light collection, flicker evaluation, occluder list
  assembly/rasterization, prefix tables, receiver buffers, local solves, halo
  passes, celestial shadow geometry, generated contact shadows, and uploads.
- Skip per-sprite lighting samples and `context.filter` correction.
- Keep shared collision, terrain presentation, entity updates, and ordinary
  flame/torch artwork. Do not skip gameplay logic because it also supplies a
  light emitter. Lighting-dependent rain/glints/shafts are disabled; unrelated
  weather animation retains its own quality settings.
- Clear stale lighting metrics when entering Basic so F3 does not report the
  last Dynamic frame as ongoing work. Release lighting-only retained surfaces
  through an explicit dispose/reset path; preserve ordinary world caches.

Fixed-ambient interiors use their configured uniform ambient. Outdoor Basic
uses the same unoccluded sky colour as Dynamic. No torch-radius comfort bubble
or local-light approximation is added to Basic. Night remains playable under
the existing accessibility brightness policy, applied consistently after
ambient calculation; this plan does not change authority-side visibility.

## 6. Sun, moon, seasons, and light composition

### 6.1 Shared state

Add DOM-free `packages/engine/src/celestial-lighting.ts` and
`celestial-lighting-presets.ts`, using existing `@orchard/sim` clock helpers.
The evaluator consumes authority tick, outdoor/indoor policy, and the existing
render-weather sample; it returns:

- sun direction, altitude, colour, and intensity;
- moon direction, altitude, phase illumination, colour, and intensity;
- diffuse sky RGB and unoccluded combined sky RGB for Basic;
- the active seasonal interpolation and shadow-cache generation keys.

Use one interpolated authority-derived render clock for both modes. Do not use
`Date.now`, reset lunar progress at a season boundary, or introduce a second
game calendar. Snapshot/admin clock jumps invalidate celestial caches; a local
review override never writes the shared clock. Indoor fixed ambient bypasses
celestial evaluation beyond the environment selection.

### 6.2 Seasonal solar arc

Use explicit art-directed curves rather than tying a fictional 28-day year to
real-world dates or the user's location. Proposed season-midpoint anchors:

| Season midpoint | Sunrise | Sunset | Maximum sun altitude |
|---|---|---|---:|
| Spring | 06:00 | 18:00 | 50 degrees |
| Summer | 05:00 | 21:00 | 75 degrees |
| Autumn | 06:00 | 18:00 | 50 degrees |
| Winter | 08:00 | 16:00 | 25 degrees |

Interpolate cyclically between the four seven-day season centres using
`smoothstep`. Derive continuous position from day count plus fractional day,
including winter-to-spring wrap. The 06:00 named-day boundary must not cause a
lighting jump. These anchors affect light only: no new sleep, growth, shop, or
schedule rules. Because nights become materially longer than today's fixed
23:00–05:00 interval, include actual night-play screenshots in acceptance.

For daylight progress `u = (clockHours - sunrise) / (sunset - sunrise)`:

- Above the horizon for `0 < u < 1`; no direct sun outside it.
- Altitude follows `maximumAltitude * sin(pi * u)`.
- Ground direction **toward the sun** is `(cos(pi * u), sin(pi * u))` in logical
  world axes, with +X east and +Y south. Morning light comes from the east,
  noon from the south, evening from the west. Cast shadows in the opposite
  direction. This is a chosen game-world convention, not a latitude simulator.
- Form a 3D unit direction using cosine/sine of altitude for receiver-facing
  tests. Quantize outputs for caches only after evaluation.
- Ramp direct strength from zero near the horizon, blending warm low-angle
  RGB toward neutral daylight above roughly 20 degrees. Diffuse twilight lasts
  a proposed 45 game minutes before sunrise and after sunset, blended smoothly.

Keep all tunable anchors in one preset, not duplicated between Basic, Dynamic,
the clock display, and debug tools. The underlying coordinate concepts follow
[NOAA's solar geometry](https://gml.noaa.gov/grad/solcalc/solareqns.PDF); the curves
above intentionally implement the game's compressed calendar and art direction.

### 6.3 Moon arc and cool nights

Reuse the existing 29.5-day phase and illumination weights. Phase controls
brightness but is not a substitute for whether the moon is above the horizon.

For a bounded first implementation, let lunar cycle progress `p = 0` be full
moon and set moon culmination to `(24 * p) mod 24` game hours. At full moon it
culminates at midnight; at new moon at noon. Give it a 12-hour visible arc
centred on culmination, with a smooth altitude bell and east-to-west travel.
Use cyclic hour differences to handle midnight. Proposed maximum moon altitude
is 50 degrees in spring/autumn, 35 in summer, and 65 in winter, interpolated by
the same seasonal policy. This is a deterministic artistic orbit, not a claim
of astronomical accuracy. A crescent may be visible during daylight.

Direct moon intensity is phase weight times altitude weight times cloud
transmission. It becomes zero below the horizon; residual night sky remains.
Use a muted blue-silver moon colour, initially `#aabfff`, with intensity tuned
so the reference full-moon clear night preserves current comfortable luminance.
Use the existing New Moon floor `#141420` as the initial residual outdoor night
floor. Calibrate luminance and hue separately: do not turn a full-strength blue
RGB fill into the entire night's lighting. Moonlight is reflected sunlight;
the blue appearance here is an explicit artistic choice
([NASA](https://science.nasa.gov/moon/moonlight/)).

Sun and moon can coexist. Compute each contribution independently; do not
replace them with a hard sunrise/sunset switch or multiply phase strength twice.
Weather attenuates directional components and adjusts diffuse colour using one
shared policy, without applying the existing rain multiplier again downstream.

**Full-moon shadow requirement (owner follow-up):** on a clear full-moon night
with the moon above the horizon, Dynamic must visibly cast shadows from trees,
props, and terrain geometry admitted by the directional caster contract. Their
direction tracks the moon, their length responds to altitude and caster height,
and their contrast is subtler than daylight but clearly visible beside the
unshadowed blue-silver ground. These are shadows in the moon contribution, not
painted blue silhouettes over the final scene. Diffuse sky keeps their interiors
readable, and local lanterns can illuminate them. Below-horizon moonlight casts
none. Lesser phases attenuate the same mechanism; Basic never generates it.
The moon-versus-diffuse balance must be tuned so a full-moon mask cannot pass
numeric tests while becoming invisible after max composition.

### 6.4 Surface illumination and shadow geometry

Use doc 47's M3 receiver-level/class/owner architecture as the required seam.
If it is incomplete, implement the needed receiver resolve within that
milestone and report it there; do not merge unrelated elevations into one
screen RGB field or introduce a second height system in this plan.

For each visible receiver, compute diffuse sky, gated/occluded sunlight, and
gated/occluded moonlight independently, then combine component-wise maximum to
retain the existing max-merge aesthetic. Combine that sky result with the
existing local-light field by component-wise maximum. Basic's uniform RGB is
the same combination for an unoccluded flat receiver. Any accessibility lift
is applied once after the combination in both modes.

This is a stylized combination, not additive physical irradiance. Keep the
diffuse daylight component below the direct component so sunlight shadows have
visible contrast. Tune that split against the currently white midday baseline;
simply max-merging a sun field into white ambient would make the feature invisible.

Directional casting requirements:

- On a level receiver plane, projected length starts from
  `casterHeight / tan(lightAltitude)`, converted through the existing height-to-
  world-pixel scale. Clamp to an authored maximum near the horizon and disable
  a source below it; never divide at zero altitude.
- Use the same terrain/caster/receiver heights and coordinate mapper as local
  lighting. For slopes or different receiver levels, clip/intersect against
  those levels; do not project a flat-ground shadow blindly onto an upper cap.
- The tree's point-light caster may remain trunk-only; its directional caster
  may use an authored body contour. These are distinct geometry choices already
  anticipated by doc 47. Neither includes the baked-shadow spans.
- Ground shadows never darken the caster's elevated artwork or unrelated
  foreground pixels. Lit faces use the appropriate source-facing RGB result;
  do not compensate a coloured sun/moon with one foot-sampled scalar filter.
- Start with whole-game-pixel silhouettes and two opacity bands, firm near
  contact and softer toward the far end. Cache by quantized direction/length,
  geometry revision, receiver level, and moving-caster state. Camera panning
  alone should move the cached logical mask rather than change its geometry.
- Merge overlapping shadows of one contributor by maximum darkness; apply only
  to that contributor. A nearby lantern can illuminate sun-shadowed ground.
- Generate small contact shading from explicit footprints/body geometry for
  declared upright objects. Basic generates none. Existing `native` contact
  metadata cannot reinsert the removed pixels in Dynamic. Honour explicit
  `none` for flat/emissive or otherwise exempt objects.

Coordinate this composite with doc 47's sky/local resolve. UI remains last;
emissive pixels preserve painter occlusion, and ordinary flames remain visible
as artwork in Basic. Do not add a second ambient multiply to Dynamic or bake
the time-of-day tint into source images.

## 7. Migration and authoring inventory

| Area | Existing files | Planned change |
|---|---|---|
| Source metadata | `packages/tools/src/assets/types.ts`, `validate-assets.ts` | Optional colour, validation, classification report |
| Build | `packages/tools/src/build-atlas.ts`, `assets/png.ts` | Exact span generation and revisioned category metadata |
| Loader | `packages/ui/src/assets.ts`, `sprite.ts`, package exports | Validated metadata and frame source integration |
| Atlas page presentation | `packages/ui/src/atlas-variant-cohort.ts`, `packages/engine/src/world-asset-presentation.ts` | Atomic whole-page selection and explicit omission lifecycle; doc 59 P3 replaces the former frame cache |
| World drawing | `packages/engine/src/overworld-art.ts` and direct consumers listed in §5 | Explicit presentation intent, cache invalidation |
| Lighting | `lighting.ts`, `light-occlusion.ts`, `light-flood.ts` | Basic bypass, clean coverage, doc 47 receiver integration |
| Celestial state | New `celestial-lighting.ts`, `celestial-lighting-presets.ts` | Shared seasonal sun/moon evaluator |
| Directional geometry | Doc 47's planned `directional-shadows.ts` | Moving sun/moon, height-aware projection, contact integration |
| Client/settings | `packages/client/src/overworld-main.ts`, `packages/ui/src/overworld-ui.ts` | Quality, migration, effective-state transitions, diagnostics |
| Review tooling | `packages/tools/src/render-review.ts`, Studio object/map previews | Original/suppressed inspection and celestial fixtures |
| Measurement | `metrics.ts`, `render-benchmark.ts`, `render-benchmark-scenarios.ts` | Quality, cache, bypass, and celestial measurements |

Begin annotation with the five measured tree assets, their actual growth/state
siblings, and the oak stump. Then review representative furniture, stations,
rocks, and animated props using the inventory. Keep source grids/palettes
unchanged. Register each declaration only after viewing its exact matched
pixels against its body on both light and dark backgrounds.

The supported metadata location is the artwork source, not every placeable,
item, or world entity that references that artwork. Studio object definitions
continue to refer to one asset ID. Provide a read-only shadow-colour/count
inspection and Original/Dynamic art preview in the existing asset preview path;
only expose editing where source-art metadata already has a persistence path.
Do not invent a second live-content shadow setting to bypass the source pipeline.

Review tools derive their highlighted selection from the compiled spans. Do not
store hand-painted alternate masks. Mixed-quality game clients must render the
same world state without introducing network traffic for this setting.

## 8. Implementation milestones

Dependencies: `M0 -> M1 -> M2`; `M0 -> M3 -> M4`;
`M2 + M4 + doc47 receiver/height seam -> M5 -> M6`.
Each milestone records files changed, commands, artifact paths, unresolved
failures, and measured counters in the ledger. No milestone is complete merely
because its interfaces exist or a switch is present.

### M0 — Baseline and reproducible fixtures

**Files:** benchmark scenarios, relevant asset tests, existing lighting review
tools, and this ledger.

1. Record the current commit, scoped working-tree status, browser/toolchain,
   viewport/DPR, active solver, and device. Preserve unrelated workspace work.
2. Inventory declared-colour candidates and verify source counts in §2. Capture
   original reference frames and a deterministic scene containing a tree,
   stump, rock, station, cliff, doorway, water, and a carried lantern.
3. Record original atlas hashes and asset identity/frame/collision data.
4. Measure Dynamic light work and the current disabled toggle separately. The
   latter is a historical full-bright baseline, not proof of Basic performance.

**Tests/exit:** repeatable fixture state, inventory, baseline command results,
and original screenshots exist. A preview outage is recorded as missing visual
evidence, not converted into a screenshot pass.

### M1 — Metadata and exact compiled selection

**Files:** source types, validator, atlas builder, category loader, and their
tests; the initial reviewed tree metadata.

1. Implement and test the source and built contracts in §4.
2. Add category compatibility/validation before emitting the new metadata.
3. Generate spans from all exported frame kinds; include metadata in revisions.
4. Annotate the initial reviewed tree set without modifying pixel grids.

**Tests/exit:** exact counts, alpha/RGB near misses, malformed spans, mismatched
revisions, no-op undeclared assets, seasonal/marker restrictions, and legacy
loading pass. Original atlas PNG bytes and asset identities are unchanged.
No visible rendering change is enabled yet.

### M2 — Cached omission and rendering coverage

**Files:** new frame-source helper, loader exports, world draw helpers, affected
world caches, mask consumers, and renderer fixtures.

1. Implement original/suppressed descriptors, snug frame preparation, bounded
   cache, generation cancellation, and disposal.
2. Route declared world assets through the helper, including direct draw paths.
3. Keep UI/original previews explicit and independent. Exclude matched pixels
   from dynamic owner/caster/receiver coverage.
4. Expose suppression in the local review fixture while replacement directional
   work is developed; do not ship a partially integrated public default.

**Tests/exit:** no surviving or missing pixels beyond the declared selection;
frame/flip/anchor correctness; animation/state/variant and recolour/season
coverage; zero steady-state readback or filtered-frame rebuilds; bounded cache
and stale-generation tests. A screenshot confirms the body is unchanged.

### M3 — Basic quality and complete work bypass

**Files:** lighting policy/helper, client orchestration, settings UI, persistence,
metrics, and benchmark descriptors.

1. Implement quality parsing/migration and atomic effective-state selection.
2. Add the one-fill Basic world composite using current ambient policy first.
3. Gate all producer and consumer work listed in §5.3. Release dynamic-only
   surfaces and keep shared gameplay/terrain dependencies active.
4. Verify Basic always selects original artwork, including assets annotated by
   M1 and world chunks previously cached in Dynamic.

**Tests/exit:** Basic retains nighttime colour, original shadows, untinted HUD,
and interior ambient; zero dynamic operation counters with 0/1/40 emitters;
settings survive reload; legacy preferences migrate; repeated switching and
async revision changes never mix presentations. Basic may ship independently
with existing ambient timing; label seasonal behaviour pending until M4.

### M4 — Shared seasonal sun/moon state

**Files:** celestial evaluator/presets, `lighting.ts`, client environment bridge,
clock diagnostic fixtures, and tests.

1. Implement continuous season interpolation, solar altitude/direction,
   twilight, moon position/phase, and weather policy from §6.
2. Produce the unoccluded uniform RGB for Basic and the separate components for
   Dynamic. Remove duplicate fixed-hour ambient decisions from consumers.
3. Add local time/season/phase/weather controls for review without server writes.
4. Tune sunrise/noon/sunset/night presets against original scene screenshots,
   retaining accessibility and fixed-space policies.

**Tests/exit:** wrap continuity at midnight/06:00/year boundary, exact seasonal
anchor values, lunar non-reset, moon below-horizon suppression, sun/moon
coexistence, single weather application, and Basic/Dynamic shared-input parity.
Visual fixtures show longer summer days, lower winter sun state, warm twilight,
and blue night colour. State tests alone do not claim moving shadows shipped.

### M5 — Dynamic celestial illumination and replacement shadows

**Files:** doc 47 receiver/height integration, directional shadows, lighting
composite, world coverage, filtered art integration, and fixture suite.

1. Complete or reuse doc 47's height/receiver resolve required by §6.4.
2. Project sun and moon shadows from body/caster geometry, with height, receiver
   clipping, bounded lengths, penumbra bands, and correct facing RGB.
3. Supply generated contact shading for migrated upright objects and remove
   conflicting native-contact paths in Dynamic.
4. Combine diffuse/celestial/local contributions once; maintain local lantern
   illumination inside a celestial shadow.
5. Activate baked-pixel omission and generated replacement together in the
   public Dynamic path. Amend the Classic A/B contract as stated in §3.

**Tests/exit:** directional motion is visible at dawn/noon/dusk and moonrise;
no double shadows, self-shadowed sprites, false plateau illumination, baked
shadow flashes, or global tint over UI. Mixed warm/cool lights retain correct
face hue. Integration acceptance includes animation and moving actors, not
only static trees.

### M6 — Asset rollout, performance, and release handoff

**Files:** reviewed source declarations, preview tooling, benchmark scenarios,
docs 11/27/47, settings help, and this ledger.

1. Review and annotate remaining supported world-art families; document
   deliberately undeclared ambiguous assets. Do not claim pack-wide removal
   while known baked-shadow assets remain unclassified.
2. Complete §9 visual matrix and §10 performance/memory evidence, including
   physical low-end hardware when available and separately labelled throttling.
3. Verify PWA revision transitions and repeated Basic/Dynamic switches, including
   a season/space change while dynamic frame preparation is pending.
4. Run appropriate workspace checks, update implemented contracts/decisions,
   and publish the exact remaining asset exceptions in the handoff.

**Tests/exit:** required matrix and checks pass, operation/memory budgets hold,
and source metadata is the sole authored suppression control. No duplicate
quality-specific assets/images, stale solver counters, or pending required
visual evidence are described as complete.

## 9. Verification matrix

### 9.1 Automated contracts

| Fixture | Required observation |
|---|---|
| Declared RGBA plus RGB/alpha near misses | Only the exact four-channel match is omitted |
| Undeclared asset containing the same colour | All original pixels remain |
| Opaque black, water, smoke, glow, foliage edges | Nonmatching transparency remains unchanged |
| Multiple groups, states, variants, flipped frames | Selection aligns with frame, crop, anchor, and transform |
| Same ID, different season/recolour/revision | Correct image identity; no stale or shared mutation |
| UI and Dynamic world draw same asset | UI remains original; world omits declared pixels |
| Basic scene with 0/1/40 lights | Same spatial-lighting operation counts: zero |
| Basic outside/inside at night | One appropriate uniform tint; HUD unchanged |
| Quality switch during load/space/season update | One effective mode per frame; stale work discarded |
| Sun near horizon/at noon/below horizon | Bounded long/short/no direct-source shadow |
| Moon full/new/below horizon | Visible full-moon shadows; phase and horizon weights applied independently once |
| Winter-to-spring and named-day rollover | No brightness, direction, or duration discontinuity |
| Lantern in sun shadow; opposing coloured sources | Local light survives; face receives correct contributor hue |
| Cliff plus overlapping tree/foreground actor | Correct receiver plane and painter coverage |
| Repeated mode/asset revision cycles | Retained surfaces and metadata caches reach a bounded plateau |

Source-data tests provide exact RGBA/mask comparisons. Browser snapshots compare
rendered pixels against the same browser's original path, avoiding false failures
from unrelated image-decoding differences. Use small deterministic fixtures to
test visual semantics rather than tests that merely copy the implementation.

### 9.2 Visual review

Use the canonical shared preview. Save artifacts under
`output/acceptance/lighting-58-<date>/` with a manifest containing revision,
fixture seed, logical coordinates, quality, solver, clock, season, lunar phase,
weather, viewport/DPR/zoom, browser, and device. Do not include auth credentials.

Required comparisons:

1. Original versus suppressed tree/stump/prop on checkerboard, light, and dark
   backgrounds, plus a highlight of the derived shadow selection.
2. The same world scene at seasonal sunrise, solar noon, sunset, and night,
   Basic beside Dynamic; include summer and winter as complete sequences.
3. Spring/autumn anchor stills and season/year boundary sequences.
4. Full moon at moonrise, culmination, and moonset, plus crescent near rise/set,
   new moon, and moon below horizon. Show visible full-moon shadows changing
   direction and length; compare a lantern illuminating the shadowed ground.
   A blue tint without visible moon-cast shadows fails this case.
5. Clear versus existing rainy/cloudy weather; lantern in shadow; a cliff edge;
   fixed-ambient cellar; HUD/settings over a dark scene.
6. An animation and a camera pan through cached terrain while toggling quality.

In addition to stills, record a locally accelerated complete day/night cycle
and a season-boundary transition to expose popping, shadow crawling, or abrupt
tint changes. Use existing reduced-motion/reduced-flash policies in a separate
pass. Local preview acceleration must not alter the shared world clock.

## 10. Performance and validation commands

Target 60 Hz presentation on the established reference device; use doc 47's
5-second warm-up and 30-second active-rAF sampling protocol. Compare matched
viewport/DPR/zoom and visible-world content. Record p50/p95/p99 separately for
cold load, mode transitions, camera movement, and steady state. Synthetic hidden
tab loops and desktop CPU throttling are diagnostics, not physical-device proof.

Required counters:

- `lightingQualityRequested`, `lightingQualityEffective`, transition/fallback
  reason, and active comparison solver;
- original/filtered frame hits, preparation misses, allocated surfaces/bytes,
  evictions, generation cancellations, and preparation duration;
- light collection, occluder preparation, raster/solve/upload, receiver reads,
  directional/contact rebuilds, and Basic tint operations;
- celestial evaluation/cache time, current altitude/direction, and rebuild cause.

Hard structural gates:

- Basic: zero lighting-only list builds, raster/solve/upload operations,
  receiver correction, generated shadow work, and filtered-frame allocations.
  Exactly zero or one tint fill per world frame; no extra world-sized lighting
  canvases and no lighting pixel readback.
- Dynamic steady state with resident frames: zero frame extraction/readback and
  zero cache allocation. Repeated tree instances share frame surfaces.
- Derived frame cache remains within the 8 MiB accounted-pixel budget. Basic
  releases its ownership of filtered surfaces by the next settled frame; actual
  browser/GPU reclamation is measured over repeated cycles, not assumed instant.
- Mode changes invalidate affected work once per generation. Directional masks
  rebuild on their real quantized dependencies, not every camera movement.

Proposed timing gates on the baseline reference device: Basic celestial policy
plus tint p95 <= 0.5 ms; dynamic directional shadow pass p95 <= 0.5 ms at 200
visible casters, retaining doc 47's target; resident-frame selection adds <= 3%
to matched painter p95. Preparation jobs yield between bounded frame batches;
no lighting-preparation long task >= 50 ms. Report original timings as well as
percentages; use operation evidence when values are below timer resolution.
If the budget fails, fix cache granularity, cadence, or work bypass before
changing the renderer backend or claiming an unmeasured low-end benefit.

Commands for implementation (run only those appropriate to each milestone,
then the integrated checks at M6):

```sh
npx vitest run packages/tools/src/assets packages/ui/src/assets.test.ts
npx vitest run packages/engine/src/lighting.test.ts packages/engine/src/light-flood.test.ts packages/engine/src/light-occlusion.test.ts
npx vitest run packages/ui/src/overworld-ui.test.ts packages/engine/src/render-benchmark.test.ts
npm run assets:validate
npm run assets:build
npm run typecheck
npm run lint
npm test
npm run build
```

Add the new selector, celestial, and integration tests to the targeted commands
when they exist. Record pre-existing failures separately; never overwrite source
art or reset unrelated work to make a baseline green. Runtime/performance tests
are required for implementation; this documentation-only plan does not claim
they have run for the proposed feature.

## 11. Release, compatibility, and rollback

Land contracts/cache plumbing without enabling public suppression. Basic can
land separately because it uses original art. The public Dynamic change lands
only after replacement shadows, celestial resolve, and omission pass together.
Preserve a frozen legacy fixture for historical A/B comparisons; do not retain
duplicate implementations of every subsequent feature merely to extend it.

On rollback, select Basic and original draw intent, release dynamic state, and
retain a working ambient tint. Assets and content IDs require no rollback or
rewriting. A binary release rollback must restore a matching code/index/category
revision set through the existing deployment/PWA mechanism. Do not remove source
declarations or source pixels as part of a runtime recovery.

## 12. Bookkeeping and execution ledger

When implementation lands:

- Update doc 11 with the source field, compiled spans, validation, and the
  single-asset rule; document the Canvas selector and cache lifecycle near it.
- Update docs 27/39/47 with explicit completed portions, the seasonal/celestial
  contract, Basic semantics, and amendments listed in §3. Do not mark unrelated
  performance milestones complete.
- Record implemented owner decisions in `DECISIONS.md`, including exact RGBA
  omission, immutable original art, Basic tint/bypass, and moving seasonal sky.
- Add/claim the implementation milestone in doc 14 when code work begins.
  The plan's presence in the overview is not a claim that work has started.
- Link screenshots, measured budgets, remaining asset exceptions, and migration
  results here. Describe the final effective behaviour in the release handoff.

### 2026-09-05 — plan authored

- Audited source palette counts, asset build/loader/frame interfaces, current
  lighting toggles, celestial clock inputs, and existing plan conventions.
- Captured the owner's single-asset requirement and Basic/Dynamic behaviour.
- Added the owner's follow-up requiring visible full-moon shadows, including
  movement, altitude response, lantern interaction, and explicit visual gates.
- No source artwork, runtime code, graphics preferences, authority state, or
  generated atlases changed as part of writing this plan.
- Implementation milestones M0–M6 remain unstarted.

### 2026-09-05 — first implementation: asset baseline and M1 contracts

- **Scope:** M0 asset baseline captured and M1 metadata/compiler/loader implemented.
  M0 remains open for the deterministic in-world scene and measured Dynamic versus
  historical disabled-toggle work. M1 integrated acceptance remains gated on that
  baseline; this is not completion of the runtime lighting overhaul. M2–M6 remain
  pending. Public suppression has not been enabled and no lighting release was made.
- Captured commit, scoped pre-existing work, Node version and browser/device details
  in `output/lighting-58-20260905/`. The canonical browser was available at the account
  screen: Chrome 150, viewport 1682×1052, DPR 1.25, stored solver `unified`, no stored
  disabled-effects value. An authenticated in-world scene/performance capture is
  still missing; the account screen is not gameplay acceptance evidence.
- Added source `bakedShadowColor`, shared original-pixel resolution/autotile expansion,
  exact frame-local span compilation and source validation. Seasonal introduction or
  removal of reserved pixels, marker overlaps, invalid alpha, missing matches and
  UI/font declarations are rejected. Source frames and palettes remain immutable.
- Added validated category schema v2 loading with v1 and legacy monolithic
  compatibility, stale-revision rejection/retry, and stable loaded shadow metadata.
  Category schema participates in the revision hash. Spans stay out of the bootstrap
  index and compact registry. No extra raster exports or live-content fields exist.
- Added repeatable `packages/tools/src/shadow-inventory.ts`. Reviewed 35 tree/stump
  frames on light and dark backgrounds with the compiled selection highlighted;
  annotated those 35 source assets, including the five measured mature trees, their
  growth/fruit/stump siblings and reviewed acacia. Other asset categories remain
  undeclared pending review. See `output/lighting-58-20260905/trees/inventory.json`
  and `review-1.png` through `review-6.png`.
- Preservation check: all **36 atlas PNGs byte-identical**; all 39 tree sources
  unchanged after excluding the new declaration. IDs/layout/anchors/collisions are
  preserved. Mature counts: oak 285, birch 408, spruce 250, palm 383, fruit 100.
- Validation: 19 targeted test files / 123 tests passed, including loader integration
  and exported-frame alignment. Tools/UI/client/engine typechecks, targeted ESLint, asset validation and
  atlas build passed. Production-mode client build passed into the isolated
  `output/lighting-58-20260905/client-dist`; existing large-chunk warnings remain.
- Measured 500 samples after 50 warmups of JSON parsing plus category validation in
  Node v24.19.0: p50 0.078 ms, p95 0.118 ms. Tree category 25,293 bytes; shadow
  metadata 7,074 bytes for 35 assets. These are load-time measurements, not browser
  frame timings or proof of Basic/Dynamic performance. Details and reproducible
  commands are in `output/lighting-58-20260905/README.md`.
- **Next:** finish M0's in-world fixture/counters, then M2's bounded frame cache and
  world-only omission coverage; M3 introduces Basic with complete work bypass.
  Seasonal celestial state and replacement sun/full-moon shadows follow M4/M5.

### 2026-09-05 — runtime foundation: M2/M3/M4 implementation checkpoint

- **Scope:** implemented M2's cache and world/mask plumbing, M3's quality policy,
  bypass and tint, and M4's seasonal celestial evaluator plus client ambient bridge.
  Full milestone acceptance remains open where stated below. M5/M6 are not complete.
  Public Dynamic still draws original artwork; omission is exercised only in the
  local fixture, pending replacement shadows. No lighting deployment was performed.
- `AssetFrameSourceCache` owns snug filtered canvases under an 8 MiB budget. It pins
  complete visible sets, shares aliases/instances, keys image/revision/metadata/frame
  identity, cancels stale generations, yields bounded preparation batches, reports
  budget/allocation failure and releases state on reset. Drawing performs descriptor
  lookup only. Preparation generations are separate from presentation invalidation,
  preventing unchanged ground chunks from rebaking after every preparation job.
- Per-context world intent now reaches common anchored/sliced/flipped/scaled sprites,
  authored objects and their contents, animated/raised/farm terrain, ground chunks,
  live-map objects, boats and doorways. Chunks inherit intent; palette transforms
  consume the selected source. UI drawers/portraits keep originals. Sprite light masks
  exclude declared spans even above the legacy alpha threshold and key actual image
  identity. The reviewed tree/stump set is covered; other categories still require
  declaration review, including special effect paths before any future declarations.
- Video settings now expose persisted **Basic / Dynamic** independently of the
  Developer **Unified solver** switch. Valid new preferences win; legacy disabled=true
  migrates to Basic without changing the solver key. Quality commits at a frame
  boundary. Basic skips all four emitter producers, lighting occlusion preparation,
  masks, receiver correction, field solve/upload/composite and cloud shadow drawing.
  Entering Basic releases lightmap/flood/mask/static-light state and clears historical
  lighting metrics while retaining shared collision/terrain. Lightmap construction is
  lazy, so Basic startup creates no lightmap canvases or flood solver.
- Basic performs one opaque multiply over the active world rectangle (white is a
  no-op), after world/weather drawing and before `renderer.compositeWorld()`. HUD is
  drawn afterwards. Configured interior ambient is preserved. Six real-renderer
  browser checks at DPR 1/1.25/2 and zoom 2/2.5 produced exact `[80,90,120,255]` world
  and edge pixels, unchanged white HUD, and no capacity-padding leakage.
- `celestial-lighting.ts` is DOM-free and uses BigInt modulo before number conversion.
  Seasonal presets interpolate continuously across the 28-day year; the existing
  independent 29.5-day moon retains its phase. Sun/moon direction and altitude,
  warm low sun, blue lunar illumination, twilight, diffuse floor and cloud attenuation
  feed both qualities. Weather now exposes cloud cover before the old daylight-only
  shadow fade, so cloudy nights also attenuate moonlight. Current Dynamic receives
  the unoccluded combined ambient; separate contributor visibility is still M5 work.
- Browser evidence in `output/lighting-58-20260905/runtime/`: `scene-review.png`
  compares six modes using actual sprite/lightmap modules; `seasonal-review.png`
  shows four season midpoints at 06:30/noon/18:30/full moon. JSON includes vectors,
  values, counters and device identity. These are deterministic local scenes in the
  canonical browser, not authenticated gameplay. The cliff and doorway are artwork
  in a flat fixture, not proof of multi-elevation receiver correctness.
- Exact browser omission: **285 oak pixels removed, zero body pixels changed**;
  two filtered frames occupy 16,384 bytes, returning to zero after reset. Basic:
  **zero** point lights, mask calls, field rebuilds, visited light texels and retained
  lightmap surfaces. Historical disabled mode still collected one light and one
  mask; Classic/Unified each visited 2,301 texels for the fixture's single lantern.
  Basic tint Canvas-submission p95 was **0.1 ms** (100 samples after 20 warmups).
  This desktop fixture does not establish end-to-end GPU/frame or low-end performance.
- Validation: **16 test files / 215 tests passed** across cache, quality/migration,
  celestial math, world/UI selection, static projection, terrain rendering, solvers,
  masks, metrics, settings and weather. Engine/client/UI/sim typechecks and scoped
  ESLint passed. Isolated production client build passed; existing chunk-size warnings
  remain. Reproduction and logs are in the runtime evidence README.
- **Remaining:** authenticated gameplay and multi-elevation baseline; 0/1/40-emitter
  and low-end acceptance; streaming/revision/budget fallback connected to the public
  effective presentation; all animation/appearance/space transition visual gates;
  M5 contributor-specific receiver/height shadows and contact, including visibly
  moving full-moon shadows and lantern interaction. Complete those before public
  suppression or claiming the full overhaul finished. M6 release is still pending.

### 2026-09-05 — owner art direction: eerie blue moonlight

- Owner requested moonlight to have an eerie blue glow. Tuned the lunar source
  from RGB 170/191/255 at 0.48 strength to 105/118/255 at 0.78 strength. At clear
  full-moon culmination this changes the combined illumination from 82/92/122 to
  82/92/199: red/green exposure stays subdued while the blue contribution becomes
  visibly luminous. Phase, altitude and clouds still modulate the source; new-moon
  ambient remains 20/20/32 and daylight presets are unchanged.
- Browser-rendered original-art comparison is in
  `output/lighting-58-20260905/moonlight/comparison.png`, with evaluated values and
  reproducible drawing code alongside it. This is a colour study, not generated
  glow/bloom, directional highlights, or moon-shadow acceptance. M5 should carry
  this source colour into exposed surfaces while preserving dark sheltered areas.
- Celestial/quality regression suites: 17 tests passed; preset ESLint passed.
  No deployment. Earlier runtime screenshots retain the earlier palette as baseline.

### 2026-09-05 — M5 renderer core and combined shadow review

- Implemented moving directional sun/moon shadow geometry in
  `directional-shadows.ts`: clean body silhouettes and finite footprint volumes,
  receiver-height clipping, 192-pixel horizon limit, whole-pixel masks with firm/
  soft coverage bands, owner exemption, and maximum overlap. Geometry caches use
  quantized direction/altitude, clean-mask identity, footprint and relative height;
  translated instances reuse the same logical mask. Basic creates none.
- Added doc 47's four-subunit height/receiver contract and a mapper using the
  existing terrain projection and datum. `groundedSpriteCaster` derives contact
  from the last clean body row rather than transparent baked-shadow padding;
  the artwork draw anchor is unchanged. Contact uses explicit footprint geometry.
- Added `CelestialReceiverScene` to resolve diffuse, sun, moon and local RGB per
  receiver class/height/owner. Shadows attenuate their own contributor, so lanterns
  illuminate moon shadows. Blue moon scattering now supplies sheltered diffuse:
  clear full-moon diffuse is 53/60/129, while the approved exposed 82/92/199 and
  new-moon 20/20/32 remain unchanged. This avoids near-black full-moon shadows.
- `TileLightmap.prepare(..., retainReceiverFields=true)` now retains separate local
  RGB fields per elevation and south-facing RGB instead of reducing mixed light to
  one brightness value. At most eight active local-light levels are admitted. The
  legacy call path remains selected in gameplay; its local-light math is preserved.
  Optional receiver fields are removed on resize/reset and when a level disappears.
- Added bounded RGB sprite-frame presentation with original alpha retained. World
  contexts opt into it explicitly; UI remains original. The fixture applies the
  ground field before drawing each separately lit sprite and clips upper-plane
  fields to the visible platform, preventing a ground shadow from tinting a canopy.
- Added bounded geometry preparation yielding after eight casters or four ms,
  stale-generation cancellation, receiver-coverage caching separate from RGB, and
  cache accounting/disposal. Geometry cache: 8 MiB; active mask references: another
  bounded 8 MiB; receiver coverage: 8 MiB; resolved RGB: 16 MiB; tinted frames: 16 MiB.
  These are ceilings, not allocated startup sizes. Basic/reset releases them.
- Combined browser review: `output/lighting-58-20260905/shadows/review.png` shows
  sunrise/noon/sunset, full-moon rise/midnight/set, a warm lantern, Basic and new moon.
  Dynamic panels omit declared tree/stump shadows and generate their replacements
  together. Basic retains originals and releases filtered/tinted/shadow/receiver
  resources. A synthetic stepped platform exercises separate receiver planes;
  this is not an authenticated gameplay/cliff-art acceptance capture.
- 200 repeated oak casters, 640×384 logical world, 160×96 receiver texels, 20 warmups
  and 100 samples: cold coverage 2.1 ms, resident lookup p95 below timer resolution
  (reported 0), local RGB re-merge p95 1.1 ms, zero steady geometry rebuilds. Shared
  geometry was 4,750 bytes; coverage 46,080 bytes. RGB cache retained 3,932,160 bytes
  after intentionally cycling local revisions. These isolated desktop CPU results
  do not prove the full doc 47/58 frame budget, GPU time or low-end acceptance.
- Validation: 11 targeted files / 85 tests passed, covering sun/moon direction and
  altitude, height clipping, owner exclusion, overlap, silhouette holes, grounding,
  cached translation, budget/reset/cancellation, RGB plane isolation, source/UI
  selection, existing local solvers and asset/ground caches. Engine/client
  typechecks, scoped ESLint and isolated production client build passed.
- **Still required before public activation:** connect the combined receiver pass,
  live caster/animation collection, prepared-scope commits and fallback into the
  gameplay painter; audit streamed/authored assets and all terrain/appearance/effect
  paths; verify moving actors, real cliff receivers, 0/1/40 local emitters and low-end
  performance. M5 is in progress, M6 pending. No lighting release was made.


### 2026-09-06 — gameplay integration and 0.5.0 publication

The owner explicitly authorized completing the implementation, making it the
new default and deploying it. Dynamic now activates exact baked-pixel omission
and replacement celestial/contact shadows together. Filtered frames prepare in
generation-guarded batches; unavailable/budget-exceeded preparation retains a
complete Basic presentation. Basic releases filtered frames, sprite masks,
receiver tints, directional fields and local-light surfaces. The original shared
atlas is immutable. Streamed declared assets participate in readiness.

Ground drawing waits for local-light preparation. Base ground resolves once;
projected cap runs resolve on their own elevation before cutaway composition.
Cliff faces and sprite bodies consume their own RGB receiver. The old final
whole-world lightmap multiply and duplicate cloud attenuation are removed.
Growing trees/stumps use shared art selection for drawing and clean masks.
Moving actors use interpolated upright volumes, while their animation artwork
receives independent RGB. Rain and wind sprites use the same world source policy.
The approved full-moon blue palette is unchanged. A presentation-only diagnostic
preview changes camera/sky for review without mutating the authority clock.

The release declares 45 reviewed assets (35 tree/stump and 10 prop/resource).
The exact declaration and exception lists, gameplay captures, terrain-painter
matrix and measurements are in
[release evidence](../output/lighting-58-20260906/release/README.md).
161 prop candidates deliberately remain undeclared pending individual semantic
and replacement-geometry review; no pack-wide suppression is claimed.

Validation passed: 111 tests in 13 suites, client types, scoped lint, asset build,
production build, six authenticated Basic/Dynamic cycles and the production
terrain-painter fixture. All 36 original atlas PNGs are unchanged. Basic retained
zero lighting bytes after every switch. The 30-second desktop gameplay sample
measured whole-frame p95 13.4 ms Basic and 21.5 ms Dynamic; sustained 60 Hz Dynamic
and physical low-end acceptance are **not** claimed. The original proposed
0.5 ms directional budget is not established by this whole-frame measurement;
general M7.3/doc47 performance work remains open.

0.5.0 was published as a static frontend update. Canonical public artifacts
matched installed bytes, same-identity reconnect passed across 38 tables, and
the world process was unchanged. Checked rollback and private release evidence:
`/home/toby/.local/state/orchard-lighting-20260906/`. Open PWA sessions activate
this release through the existing Refresh now flow so the atlas cache advances.

### 2026-09-06 — post-release canvas exhaustion correction (published in 0.5.1)

An iPad report of progressive FPS loss and missing terrain/UI exposed a tint
cache resource problem: RGB changes allocated new canvases under a pixel-only
16 MiB limit. Receiver frames now reuse at most 256 surfaces with a 4 MiB pixel
budget; reset explicitly releases their backing stores. Persistent stone palette
conversion runs before mutable receiver tinting in full and banded drawing.
Allocation/retention counters are exposed in gameplay diagnostics.

Nine suites / 51 tests, client types, scoped lint and the final isolated build
pass. A six-minute accelerated Chromium sky-cycle soak retained 256 tint canvases
through over 100,000 reuses; Basic released all lighting surfaces. Physical iPad
confirmation remains required. The concurrent combined 0.5.1 release initially
stopped at its changed-source guard; its fourth attempt subsequently published
all five exact fix source hashes. Independently verified the canonical public
HTML, referenced renderer/gameplay chunks and service worker against installed
bytes at 03:09 AEST; live build is `orchard-0.5.1-mtok06nd`. No additional publish
was needed. See [fix and release evidence](../output/lighting-lockup-20260906/README.md)
for measured frame times, limitations, source hashes and browser evidence.

### 2026-09-06 — camp water and humanoid contact corrections (published in 0.5.2)

Flat world sprites now consume the spatial ground field over their rectangle,
including pond shimmer, instead of tinting the whole sprite from one anchor
sample. This removes the dark grass rectangle when a nearby character shadow
crosses the pond anchor. Seven active/fallback humanoid assets declare the exact
black alpha-100 baked shadow; Fin's coloured transparency and Basic originals
are preserved. Merchant and unmounted player celestial shadows originate at the
authored neutral shoes, eight pixels above the rig anchor.

Validated 68 tests, types, lint, assets and the production build. The browser
fixture matched pond-border grass within one colour channel value near/far from
the actor; all fixed filtered frames prepared within 4.1 MB and reset to zero.
All 36 original atlas PNGs remain unchanged. Static client 0.5.2 was published
with checked rollback; canonical public bytes match and the world process did
not restart. Physical iPad walking confirmation remains with the affected device.
See [0.5.2 release evidence](../output/playwright/camp-lighting-20260906/README.md).

### 2026-09-06 — temporary Classic default restored (published in 0.5.3)

At the owner's request, missing/invalid model preferences select Classic while
performance work continues. Explicit Unified choices remain opt-in. Classic now
bypasses the seasonal renderer entirely: no filtered-frame preparation, celestial
casters, receiver planes or sprite tint pool. It uses original baked-shadow art
and the existing local-light lightmap/final composite. Switching models releases
resources and invalidates optical caches; Basic remains independent.

25 lighting tests, types, lint, production build and the Classic browser fixture
passed. Public 0.5.3 artifacts were verified against installed bytes; world process
unchanged. Object-light unification remains pending and was not included in this
release. See [Classic rollback evidence and remaining work](../output/playwright/classic-default-20260906/README.md).

### 2026-09-06 — public lighting selection repaired (published in 0.5.4)

The Video control now selects Basic, Classic and Dynamic as complete modes;
previously its Basic/Dynamic quality label hid the independently stored Classic
renderer. Both Video and developer selection now enable the correct quality for
the selected renderer. Labels/toasts agree and the Video footer exposes Dynamic
preparation/fallback. Classic remains the default.

125 tests, types, lint, build and a real-settings-widget browser fixture passed.
Two full mode cycles prepared and released the filtered resources correctly.
Static 0.5.4 publication and canonical public artifact bytes were verified;
world process unchanged. See [selector release evidence](../output/playwright/lighting-toggle-20260906/README.md).

### 2026-09-06 — moving shadows and broad world omission (published in 0.5.5)

Fractional actor contacts now update even when rounded geometry signatures match.
Ground-light cells average directional coverage and contact falloff is continuous,
removing position/opacity stepping without rebuilding moving geometry. Integral
storage is included in the existing bounded mask cache.

389 additional world assets declare their exact baked shadow colour, including
tents, cliffs, furniture, buildings, crops and remaining character poses/parts.
Classic remains the default; Classic/Basic keep original shadows. World draw
observation prepares encountered assets and their animation frames within 8 MiB,
instead of allocating 8,349 preloaded frames. Streaming preparation recovers from
a temporary complete Basic frame automatically.

91 tests, types, lint, assets, build and browser checks passed. Pixel comparisons
covered 344 loaded declared assets; a 600-frame shadow test changed coverage on
all 599 movement transitions without rebuilding geometry. Original atlas PNGs
unchanged. Public 0.5.5 files and all candidate JS chunks verified; world process
unchanged. Physical iPad performance and object-light unification remain pending.
See [release evidence and limits](../output/playwright/shadow-motion-20260906/README.md).

### 2026-09-06 — eliminate streaming fallback and light cliff caps (published in 0.5.6)

The 0.5.5 temporary Basic frame caused visible flicker as walking discovered
assets. Gameplay now filters only the requested frame immediately, keeping the
Dynamic quality and ground-cache presentation stable. Precomputed spans avoid
pixel readback. Current-frame sources are protected while an LRU resident index
evicts older frames under 8 MiB and 512 surfaces. This supersedes 0.5.5's
observed-asset/all-pose preparation; Classic remains the default.

Cliff caps/ledges were scoped as flat receivers but their draw helper omitted the
spatial source lookup. It now applies ground lighting using logical coordinates;
wall faces keep their face lighting. 82 tests, types, lint, build and throttled
browser checks passed. 16,728 streamed draws had zero missing/original frames;
16,692 cliff pixels now receive lighting. Public 0.5.6 files and all candidate JS
chunks verified, world process unchanged. See [evidence and performance limits](../output/playwright/shadow-streaming-20260906/README.md).


### 2026-09-06 — grounded animals, moon HUD, lantern and flame emission (published in 0.5.7)

Animal, mounted-horse and rogue shadows now use neutral-pose body bounds compiled
without the baked shadow, correcting transparent padding and oversized volumes.
Cached directional masks soften outward while preserving contact. The Overworld
ribbon now has an eight-state 32×32 moon texture and no connection icon.

Hotbar light use equips and lights the item through existing server actions.
Dynamic flame pixels bypass receiver tint, with an orange local light and small
reusable warm halo. Visible emissive states provide a fallback light for authored
objects without a light component. Extinguished frames remain dark.

210 focused tests plus final emission/humanoid checks, workspace types, lint,
assets and build passed. Browser checks covered 102 wildlife assets, eight moon
phases and 1,175 exact fullbright pixels. Public 0.5.7 artifacts verified; world
process unchanged. Classic stays default. Authenticated lantern/device acceptance,
Classic fullbright treatment and local-light character shadows remain pending.
See [release evidence and limits](../output/playwright/animal-grounding-20260906/README.md).


### 2026-09-06 — doc59 recovery implementation, unreleased

Doc59's settled A1/B2/C amendments now have implementation checkpoints:100
bounded omit-page variants load only for the atomic Dynamic cohort; the runtime
filtered-frame cache/preparation machinery is deleted. Original artwork and the
36 legacy atlases remain immutable;341 unique assets in the historical344
comparison have zero unexpected changed pixels. D4 and D10 still bind.

Canvas 1× is the default world resolution, with2×/Native in Video. Ordered HUD
caches and an optional30Hz presentation cap preserve Canvas pixels and fixed
updates. Experimental WebGL is off by default and falls back visibly; incomplete
GPU lighting parity does not amend this document's visual contract. Classic's
legacy lightmap and remaining world filters/cap scratch work are explicitly
OPEN in doc59. These are local implementation records, not a0.6.0 deployment
or completed desktop/iPad performance acceptance.
