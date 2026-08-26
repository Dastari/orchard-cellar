# 21 — Unified Overworld Renderer

Binding owner-directed spec (2026-08-24). The solo farm scene is **retired for now**;
the root Vite application loads the overworld as its only game client. Farms return
later as instanced per-player interiors rendered by this same renderer (M7+). The engine
decision in [01-engine-decision.md](01-engine-decision.md) stands: **Canvas 2D**.
WebGL2 was evaluated (owner hardware includes a GT730, which does support WebGL2 via
ANGLE/D3D11) and deliberately deferred — everything below must live behind one
renderer module so a WebGL2 backend can be swapped in later without touching game
logic. Do not add WebGL in this milestone.

Note: line references below were accurate at authoring time; another agent may have
touched these files since. Re-verify against the current tree before editing.

## 1. Scope

**In scope:** one renderer module used by the overworld; fixed compositing pipeline
with DPR handling and continuous zoom; chunked ground cache; tile lightmap with
day/night and point lights; client collision-rebuild fix; weather/particle layer
hooks; render instrumentation; removal of the farm scene client code.

**Out of scope (do not build here):** WebGL, netcode prediction-replay/snapshot
interpolation, combat, farm instancing, auth/permissions, seasonal-atlas cleanup.
Do **not** modify `packages/sim/src/movement.ts` or `state.ts` collision types —
they run verbatim on the SpacetimeDB authority; any change there requires a matched
module republish and is a separate task.

## 2. Farm-scene removal

Delete (git history preserves them): `src/scenes/` (scene stack + farm scene),
`src/render/bitmap-font.ts` (per-pixel
`fillRect` font — the atlas font in `render/pixel-ui.ts` is the only text path),
`src/render/map-source.ts` consumers in the client, `src/save/local-save.ts` (+ test),
and the farm wiring in `src/engine.test.ts`. The conventional `index.html` and
`src/main.ts` root entry select between account and overworld modules; only the root
application and explicit developer preview pages are Vite build inputs. Keep untouched:
`packages/sim` economy/tick/tests (the future instanced farm), `packages/assets`
maps/sprites, audio, `account-main.ts`. `CachedTileMapRenderer` in
`render/tilemap.ts` is superseded by the chunk cache (§4) — retire it, but
`blob47FrameIndex` and the tile-definition types must survive as the **single** copy
(delete the duplicate `canonicalBlob47Index` in `overworld-art.ts`).

## 3. Compositing pipeline

One module (suggest `src/render/renderer.ts`) owning canvas sizing, the frame
composite, and the world→screen transform. Nothing else may call
`getContext`/`drawImage` against the display canvas.

- **Display canvas:** backing store = CSS size × `devicePixelRatio` (read it; today
  it is ignored — `display.ts`), `image-rendering: pixelated` stays, re-assert
  `imageSmoothingEnabled` after every resize.
- **World offscreen ("sharp pass"):** each frame the world is drawn to an offscreen
  canvas at integer scale `k = ceil(z)` where `z` is the continuous zoom in device
  pixels per world pixel. All world drawing uses nearest-neighbour and
  integer-rounded coordinates here, exactly as today.
- **Final blit ("smooth pass"):** the offscreen is drawn once onto the display
  canvas scaled by `z / k`, with `imageSmoothingEnabled = true` **for this call
  only**. Integer `z` therefore stays pixel-perfect (k = z, scale 1.0); fractional
  `z` gets shimmer-free sharp-bilinear. This replaces both existing transform
  conventions (`ctx.scale` in the farm scene vs manual `*zoom` in
  `overworld-art.ts`).
- **Zoom:** continuous `z`, wheel steps of 0.25 with a short eased lerp between
  steps; `-`/`+` keep stepping it; the displayed label keeps the owner convention
  (source scale 2 shows as `1×`). Clamp `z_min` per display so the offscreen never
  exceeds 4096×2304 device px and the view never exceeds the 192-tile island;
  clamp `z_max = 8`. `Shift -`/`+` whole-pixel UI scale is unchanged and separate.
- **Frame order:** ground chunks → weather particles interleaved with Y-sorted world
  sprites by ground-impact/foot Y (`localeCompare` id tiebreak kept for deterministic
  world sprites) → lighting multiply pass (§5) → diagnostic overlays → world nameplates → [final blit] →
  screen-space UI at UI scale (never lit, never zoomed).
- **Depth-queue invariant:** every non-ground world drawable must enter the renderer's
  one `WorldDepthItem` queue with a foot/base/door-line Y. This includes resources,
  ground items, players, NPCs, animals, crops, props, houses, and other buildings.
  Only terrain and genuinely flat ground decals may bypass it beneath the queue.
- **Elevation-aware terrain depth:** raised caps, projected cliff faces, inverse
  corners, and transition art are not flat ground. They interleave with the same
  depth queue at their contour's lower level. An entity's deterministic depth key is
  its foot Y plus the tileset-projected height of every terrain level beneath its
  foot tile. A lower-level actor north of a cliff therefore draws behind its opaque
  foreground pixels; an actor on the plateau draws above that contour; and a
  lower-level actor farther south still sorts in front. Logical elevation never
  changes the actor's screen position.
- **Interpolation:** `render(alpha)` must actually receive and use alpha for the
  local predicted player (previous/current lerp, as the farm scene did at
  `scenes/farm.ts:261`). Remote-player smoothing stays as-is; replacing it is the
  netcode task.

## 4. Chunked ground cache

Replace the per-frame procedural ground pass (`overworld-art.ts:145` — ~2,300
`fillRect`s and ~57k allocations per frame) with cached chunk canvases:

- Chunk = 16×16 tiles = 256×256 px at source scale, matching `CHUNK_TILES`
  (`world-rules.ts:16`). One offscreen canvas per chunk, drawn once via the existing
  biome fill + hash-gated decal logic, then blitted per frame (≈ 6–12 `drawImage`
  calls per frame at default zoom).
- Each cached chunk has a flat/base canvas and a sparse raised-structure foreground
  description. The base canvas blits once; visible foreground rows are submitted in
  depth order without rebaking. Do not duplicate the whole chunk once per elevation.
- LRU-evict beyond ~64 resident chunks. Invalidate a single chunk when a resource
  in it changes state, if resource art is baked into the chunk; if resources stay
  in the Y-sorted sprite pass (they must — trees sort against players), ground
  chunks are effectively immutable and only seed/version changes flush the cache.
- Terrain classification: compute the 192×192 biome byte-array **once** per
  (seed, version) at module level — the client-side mirror of the precomputed
  terrain in `world-rules.ts:29` — and have chunk rendering, minimap-ish debug,
  lighting (§5) and collision (§6) all read this one array so they can never
  disagree. Hoist the per-tile biome→color object literal out of the loop.

## 5. Lighting

Tile-resolution lightmap, composited in the world pass (Terraria-style):

- **Lightmap:** an RGB buffer covering visible tiles + 2-tile margin (~70×40 at
  default zoom). Each frame: fill with the ambient color, then stamp point lights
  with radial falloff (max over ambient, per channel). Draw the buffer into a tiny
  canvas at **1 px per tile**, then draw that canvas over the world offscreen
  scaled to `16k` px per tile with nearest-neighbour sampling and
  `globalCompositeOperation = 'multiply'`. This intentionally exposes readable,
  pixel-stepped falloff regions rather than a soft gradient.
- **Ambient day/night:** drive from the shared world clock (`world_clock` table;
  1 day = 54,000 ticks, `sim/src/time.ts`). Keyframed curve: day `#ffffff`, dawn
  warm tint, dusk purple, night clamped at the R12 palette tints
  (`#141420`/`#232338`, docs/10 §R12) but **never below ~35% luminance** — the
  island must stay readable at midnight. Unit-test the curve keyframes.
- **Point lights:** v1 sources are the player's selected Lantern (radius 5 tiles,
  warm `#ffd9a0`) and Torch (radius 3); every remote player with one selected also
  emits (selection is already public via hotbar state). Optional additive glow:
  after the multiply pass, draw a small radial gradient per light with
  `globalCompositeOperation = 'lighter'` at low alpha.
- **Occlusion:** none in v1 (lights shine through ridges/trees). When wanted later,
  a BFS/flood propagation over the §4 terrain array is the intended design — do not
  invent a raycaster.
- Lighting multiplies the **world offscreen only**. Nameplates are then drawn into that
  same world pass so they scale and track identically with players without being
  darkened; UI and the hotbar are drawn after the final blit.

## 6. Collision — required fixes and constraints

- **Kill the chunk-crossing freeze.** `refreshCollision`
  (`overworld-main.ts:128-144`) currently regenerates all 36,864 tiles of terrain
  *and* resources (~200 ms, measured) whenever the subscribed resource set changes
  — which happens on every chunk boundary. Fix: the `blocked` boolean array is
  derived once from the §4 cached terrain array and never rebuilt; only the
  `obstacles` list (8×6 px trunk boxes of *live, subscribed* trees) is rebuilt when
  resource rows change, which is O(hundreds). Drop the
  `resources.map(...).sort().join(',')` cache key; key on seed/version + a cheap
  count/dirty flag from the subscription callbacks.
- **Do not touch shared sim collision.** `movePlayer`/`positionCollides` and the
  `CollisionMap` shape stay byte-identical to what the authority runs. The client's
  obstacle list is already region-scoped by subscription, so the linear scan is
  acceptable here; a per-chunk obstacle index is a future shared-sim task, not this
  one.
- **Debug overlays must survive:** `G` keeps drawing the cyan 8×6 foot box and
  amber trunk boxes at the correct composite stage (world pass, post-lighting so
  they remain undarkened and visible at night). Add chunk boundaries + cache residency to the debug
  overlay.
- Lighting and collision consume the same terrain array (§4) — a tile can never be
  lit as water but collide as ridge.

## 7. Weather / particle hooks

A pooled particle layer (preallocated typed arrays, no per-particle allocation) is
drawn into the world offscreen before lighting: `spawn/update/draw` API, world-space
and screen-space emitters. The proof rain effect uses ~200 exact-RGBA licensed
diagonal streaks and the licensed seven-frame impact animation. A drop expires at its
calculated ground endpoint and spawns the splash at that exact point. Both pools shift
opposite camera travel, reset their tracking baseline on zoom changes, remain correctly
positioned in screen space, and scale visually and kinetically with world zoom around
source zoom 2. Close zooms reduce the active streak target quadratically so enlarged
sprites do not make the storm appear denser. Each pooled particle carries the Y depth
of its eventual ground impact; depth-range drawing interleaves complete streaks and
splashes with the renderer's complete world-depth queue before the lighting pass.
Rain adds subtle ambient darkening and can coexist with every day/night phase. The
top-right test panel scrubs time and overrides rain locally; cloud- or region-scoped
weather remains later content. Snow/leaves are not part of this task.

## 8. Instrumentation and budgets

- Debug HUD (suggest `F3`; `F` and `G` are taken): frame ms (avg/worst over 60),
  draw calls this frame, resident ground chunks, particle count, current `z`/`k`.
- Budgets on a mid laptop: render ≤ 4 ms, zero allocations in the per-tile and
  per-particle loops, `network.snapshot()` called **once** per frame (currently
  twice — pass the result from update to render).

## 9. Tests and acceptance

- Unit: zoom math (`z→k`, clamps, label mapping), ambient curve keyframes, chunk
  cache invalidation (resource change redraws exactly one chunk), LRU eviction,
  lightmap stamp falloff. Existing overworld/net/sim tests stay green; farm-scene
  tests are deleted with the scene.
- Browser verification: walk across several chunk boundaries with the F3 overlay —
  no frame spike from collision or ground rebuild; wheel zoom is smooth and crisp
  at integer stops; accelerated day cycle shows dawn/dusk/night with a readable
  night; lantern/torch selection lights the player (and a second client sees it);
  chop ×3, pickup/drop, reconnect, and `G` overlay all still work; verify on a
  `devicePixelRatio: 2` emulation that world pixels are square.

## 10. Bookkeeping

Update docs/02 (client architecture section) and docs/20 §5 (zoom wording) to match;
add DECISIONS.md entries for: farm-scene retirement (supersedes docs/02 scene stack
until instanced farms), continuous sharp-bilinear zoom (supersedes the three stepped
render scales), Canvas-2D-retained-after-WebGL-evaluation (notes the GT730
constraint and the renderer-module swap path), and the terrain-array/collision cache
unification.

## 11. Implementation verification (2026-08-24)

- Unit coverage includes renderer layout/clamps, terrain identity, chunk LRU and
  invalidation, collision overlays, light falloff/ambient keyframes, pooled rain
  endpoint/full animation/camera/zoom behavior, metrics, and weather-control hit tests.
- Shared-browser verification covered continuous rapid zoom, DPR-aware backing size,
  diagonal movement across chunk boundaries, exact player/tree collision overlays,
  pixelated night lighting with local/remote equipment, three-hit tree harvesting,
  licensed rain plus splashes, combined rain/night, inverse-camera weather parallax,
  rain scaling/density/speed at zoom 1 and 4, and impact-depth weather ordering.
- Rain-heavy measured frames remained below the 4 ms renderer budget in the shared
  preview; the widest tested view recorded a 2.7 ms worst frame.
- Review hardening makes the world-pass backing canvas grow only in coarse buckets
  while compositing the active source rectangle, avoiding full offscreen reallocations
  during eased zoom. Resource effect caches prune on region revisions, and client
  terrain walkability delegates to the shared survival-biome rule.
