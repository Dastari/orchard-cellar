# 27 — Lighting Design: Sub-Tile Light, Shadows, Height, and Sky Cycles

Binding owner-directed spec. **Revision 3 (2026-08-26)** — adds the complete
eight-phase lunar cycle and makes moon illumination control clear-night ambient
darkness. Full Moon preserves the current readable night; New Moon is deliberately
near-black and makes local light sources matter. Revision 2 raised the
fidelity target with visual references (Core-Keeper-style dungeon shots: light
pooling between obstacles, sconce cones on walls, soft-but-pixelated falloff)
and added shadow casting, terrain height awareness, and global light events.
Revision 1's strict one-texel-per-tile charter is **superseded** (DECISIONS
updated); its occlusion, color, flicker, water, and rain designs carry forward
at the new resolution. Status: **phases 1–3 implemented; phases 4–7 planned**.

Supersedes [21-unified-renderer.md](21-unified-renderer.md) §5 where they
differ; doc 21's composite order (multiply over the world offscreen only,
nameplates after) stays binding. Feeds [26-underground-mines.md](26-underground-mines.md)
§6 and [32-combat.md](32-combat.md) §6 (light-based detection reads the same
emitter list). Requires the **height contract** from
[30-infinite-terrain.md](30-infinite-terrain.md) §3 (below, §5). Lighting
remains pure presentation: the authority never computes light (combat's
detection rule re-derives emitter positions from the same pure data, not from
render state).

## 1. The aesthetic charter (revised, binding)

The light must stay recognizably **pixelated — but finer-grained**. The
reference shots are the calibration: falloff you can see stepping, but pools
and cones that curve convincingly around walls and furniture.

1. **Quarter-tile texels.** The lightmap resolves at `LIGHT_TEXELS_PER_TILE = 4`
   → one texel per 4×4 world pixels (16× revision 1's density). Only this
   light layer is bilinear-upscaled; world sprites remain nearest-neighbour.
   This is the single constant the whole system hangs off; 2 (8 px) is the
   sanctioned fallback if perf demands, 8 is the ceiling nobody should reach.
2. **Spatial grain, continuous falloff.** Strength uses the complete 8-bit
   `LIGHT_BANDS = 255` range. Quarter-tile texels retain the pixel-art spatial
   grain, while interpolation between adjacent strengths prevents rings from
   visibly holding and jumping during player movement. Canvas radial gradients
   remain forbidden; the flood remains deterministic and golden-testable.
3. **Smooth glow stays banned; quantized halo is in.** Canvas radial gradients
   remain forbidden. Flame emitters may draw an **ember halo**: 1–2 extra
   bands of additive (`'lighter'`) light at low alpha through the same
   quantized buffer — the warm sconce bloom in the references, chunky at 4 px.
4. **Blend math unchanged:** ambient fill → per-channel max merge → one
   multiply composite; plus the single optional additive halo pass. Nothing
   else full-screen without a §10 budget entry.

**Implemented resolution note (2026-08-26):** owner review of the live
two-texel/ten-band result found the rings too terraced and a carried light
snapped too visibly. The shipped constants are therefore the intended
`LIGHT_TEXELS_PER_TILE = 4` and 8-bit strength. Open and occluded flood centers
track quarter-world-pixel increments through fractional multi-seeding, so the
pool follows interpolated player presentation rather than snapping at the
authority or light-texel cadence.

## 2. Light emitters

Unchanged from revision 1 (registry in `render/light-sources.ts`,
`LIGHT_COLORS` table with readability caps — min channel 64, no full
saturation; equipped items / generated props / resource rows / portals /
transients). Flame flicker varies radius only ±0.18 tiles and strength ±3%
through blended deterministic 3 Hz/7 Hz value noise; `pulse` breathes
slowly, color and position never jitter. Wall-mounted emitters (mine sconces,
future interior torches) declare a **facing**, biasing their flood seed one
texel outward so the cone throws into the room, not the wall — the sconce look
in both reference shots.

**Implemented emitter subset (2026-08-26):** docs/28 phases 1–3 register placed
`campfire` and `standing_torch` rows through `render/light-sources.ts`. Their
deterministic flame flicker feeds the same client point-light list for every
subscriber. This does not mark the quarter-tile occlusion/shadow design below
implemented.

## 3. Occlusion — the sub-tile flood

Revision 1's tile-BFS design, upgraded to quarter-tile resolution with authored
silhouettes (this supersedes r1's "sub-tile objects never occlude"):

- **Hard blockers** — walls, cliff faces, closed structural tiles, at tile
  resolution expanded to their 4×4 texels: receive light (lit near faces),
  never propagate. Authored `wall_*` and `lower_wall_*` rows form one
  south-facing receiver surface: light on the lower approach illuminates the
  full visible rock face without leaking onto the plateau behind it, and other
  opaque silhouettes may still cast onto that face. Doorways/portals/ramps
  stay transparent (owner rule: light spills through doors).
- **Alpha-silhouette casters and receivers** — solid elevated objects such as
  boulders, ore nodes, trees, placed stations, chests, fences, and campsite
  furniture use authored opaque pixels for both the caster shape and visible
  receiver. Transparent sprite padding and translucent painted ground shadows
  remain excluded. The silhouette produces the strong, long umbra preferred by
  the art direction; a directly visible owner mask relights its elevated face
  without filling the ground shadow behind it. Emissive props are excluded from
  their own caster list. Collision alone never makes an optical blocker:
  water/ponds, dirt/inset terrace edges, crops, floor decals, and other low
  obstacles stay transparent.
- **Painter-depth ownership** — each authored alpha silhouette carries its
  owner and painter-depth foot Y, so its own umbra cannot be multiplied back
  over its elevated sprite; a lower-foot sprite wins overlapping receiver pixels.
  The same owner records the visible face orientation. Current top-down tree
  and prop artwork presents a south-facing front: direct light from south fully
  illuminates it, lateral light is softened, and light north of the ground foot
  is behind the artwork and contributes no direct front-face light. Ambient
  remains visible in every case. This restriction is applied as brightness
  compensation during the receiver's own depth-ordered sprite draw, using its
  exact authored alpha; it must not punch dark receiver cells into the bilinear
  ground lightmap, which creates halos and can shade unrelated foreground art.
  Future multi-face assets must declare their receiver orientation rather than
  inferring it from collision.
  Receiver masks have two thresholds: broad alpha ownership prevents a caster's
  own projected ground shadow from multiplying over its sprite, while only
  fully opaque receiver texels may bypass the umbra for direct front lighting.
  Never reuse partially covered edge texels for relighting—the bilinear
  lightmap turns them into bright holes immediately behind the silhouette.
  Other lights fill these shadows through the normal maximum merge. Players
  and NPCs never occlude (a
  moving silhouette shadow reads as a bug; they get §6 sprite shadows instead).
- **Tree trunk columns** — trees are the deliberate exception to full-sprite
  casting. Only the narrow authoritative trunk collision mesh casts, producing
  a long, strong column away from the source. The canopy receives light and
  participates in painter depth but never widens or originates a shadow.
- The field itself: open regions use the direct lookup-table fast path; solid
  regions use symmetric shadowcasting once per light, linear in affected
  texels; the legacy soft-attenuator compatibility path retains the 8-connected
  integer flood. Strength uses octile distance (2 orthogonal / 3 diagonal),
  fractional centers remove the old rounded-source jump, and every source
  merges by per-channel maximum. A blocker is lit-but-terminal; doors and
  transparent sprite gaps pass light while cells behind rocks and walls remain
  in umbra. Trunk shadows use a separate bounded attenuation buffer. Reusable
  epoch/owner buffers keep the hot path allocation free.

## 4. What carries forward verbatim (r1 §§5–9)

Colored light rules and the capped `LIGHT_COLORS` table; flicker profiles;
water glints via `sampleLight` (now sampling the finer buffer — glints gain
sub-tile placement for free); rain interaction (channel-weighted cool
darkening, lit rain streaks/splashes sampling the buffer); and the consolidated
per-space ambient pipeline. The former 89/channel surface comfort floor is now
the **Full Moon clear-night baseline**, not a universal floor: §7 may lower
surface night ambient as far as `#141420` at New Moon. Fixed mine ambients remain
unchanged and never receive moon or surface-weather modulation. All numeric
goldens are re-baked at the new resolution.

## 5. Height — the terrain contract

2D top-down still has a Z story: cliffs, plateaus, terraces, mine walls. The
terrain system (doc 30 §3's integer elevation field; the current
plateau/terrace generator until it lands) must expose one pure function —

```ts
terrainHeightAt(x: number, y: number): number   // integer level; 0 = base ground
```

— consumed identically by client and any future authority need. Lighting uses
it three ways:

Nested terrain is resolved one contour at a time. A level-3 torch is contained by
the level-3 contour and may illuminate levels 0–3 where line-of-sight permits; it
does not infer height from cliff pixels. Editor-authored slopes, stairs, ladders,
and ropes expose the same explicit contour transition used by collision.

1. **Light containment.** A light floods only texels whose height ≤ the
   emitter's level: a torch at a cliff base leaves the plateau above dark; a
   lantern on the rim lights the top and **spills over the edge** 2–3 texels
   down the face (rim-glow on the cliff wall), then stops. Upward steps are
   hard blockers from below.
2. **Cliff drop-shadows.** Every downward height edge casts a banded ambient
   shadow onto the lower ground on the away-from-sun side (§6's sun azimuth):
   width `2 + 2 × Δheight` texels, two bands (darker at the base). This is
   cheap (derived per visible tile from the height field, no flood) and
   grounds every cliff visually.
3. **Ambient depth cue (subtle).** Texels below level 0 (future
   canyons/pits) darken ambient one band; levels above brighten nothing
   (sunlit already). One lookup, no drama.

## 6. Primitive directional shadows (objects, entities, cliffs)

A new **shadow pass**, drawn into the world offscreen at low-alpha multiply
*before* the lightmap — daytime's answer to the flood's point-light shadows:

- **Sun azimuth** is a pure function of the world clock: shadows stretch long
  to the west at dawn, shrink toward noon (minimum length, straight south),
  stretch east toward dusk; fixed dim short shadows on overcast/rain; a faint
  static offset at night whose alpha follows §7's moon illumination (strongest
  at Full Moon, absent at New Moon), or none under heavy cloud.
- **Entities** (trees, props, placeables, resources, players, NPCs, horses):
  one skewed, vertically-flattened blit of the sprite's silhouette — affine
  skew only, "primitive" by design, no projection math. Alpha ~25%, quantized
  to whole pixels, anchored at the sprite's ground line. Canopy-sized trees
  cap shadow length so noon orchards don't stripe.
- **Cliffs** join via §5.2's bands rather than silhouette blits.
- **Interaction rule:** directional shadows are ambient-only dressing — the
  point-light flood ignores them (no double-darkening: multiply floors at the
  shadowed texel's band, it doesn't stack twice). In fixed-ambient spaces
  (mines) the directional pass is off entirely; the flood is the only shadow
  source underground — matching the references, which are interiors.

## 7. Lunar cycle and global light events

The ambient pipeline (r1 §9) grows a **sky layer** — deterministic
functions of `(authorityTick, weatherMode, space)` so every client renders the
same sky with zero new netcode:

### 7.1 Eight-phase lunar cycle (binding)

The surface has a **29.5 in-game-day lunar month** (`59 / 2` days), derived from
the shared authority tick. It does not reset at dawn, season boundaries, or New
Year. Because the calendar year is 28 days, the moon drifts by 1.5 days against
the seasons each year; over time, every season receives every lunar phase rather
than permanently owning one kind of night.

- Calendar epoch (`authorityTick = 0`, Spring 1 Year 1) is the center of **Full
  Moon**. The ordered phase centers are: **Full Moon → Waning Gibbous → Last
  Quarter → Waning Crescent → New Moon → Waxing Crescent → First Quarter →
  Waxing Gibbous → Full Moon**. Phase labels select the nearest eighth of the
  cycle, including a wrap-safe Full Moon window around progress 0/1.
- `packages/sim/src/time.ts` owns pure helpers for lunar progress, phase, and
  illumination. Use integer/fixed-point interpolation between the phase-center
  illumination anchors `[1000, 854, 500, 146, 0, 146, 500, 854]`; do not store a
  moon row, advance it with scheduled writes, use wall-clock time, or call
  `Math.random`. Admin date/time changes naturally move the moon because they
  move the same authoritative calendar tick.
- Lunar modulation is surface-only and fades in over the dusk keyframes. It has
  zero influence during full daylight. At clear midnight, interpolate each RGB
  channel from **New Moon `#141420`** at illumination 0 to **Full Moon
  `#595969`** at illumination 1000. `#595969` is byte-for-byte the current
  readable-night ambient, so a clear Full Moon looks exactly as bright as night
  does before this revision. New Moon is intentionally very dark outside point
  lights.
- Weather composes after lunar ambient. Rain/cloud cover may attenuate moonlight
  further but clamps at `#141420`; lightning still overrides the result for its
  flash envelope. Mines and other fixed-ambient spaces ignore the lunar cycle.
  Moon illumination is ambient dressing, not a point emitter and not an
  authority-side combat light source.
- The day/season dial renders all eight distinct pixel silhouettes: waxing light
  grows on the right, waning light recedes on the left. Its tooltip appends the
  phase name (for example, `Autumn, Day 3 — Year 2 — Waxing Crescent`). No
  full-screen moon sprite or new licensed visual asset is required for v1.

### 7.2 Deterministic events

- **Lightning.** During storm weather, strikes schedule from a tick hash
  (mean ~45 s apart, never < 8 s). Envelope: full-screen ambient lifts to
  near-white blue-tint for ~120 ms, drops, re-flashes ~80 ms — the classic
  double strobe — then thunder SFX after a hash-rolled 0.5–3 s (distance
  illusion; `game-music` skill owns the sample). The flash **overrides** the
  rain-cool darkening for its frames and pushes every point light visually
  under ambient (correct: lightning outshines torches). Underground spaces
  ignore it entirely. Accessibility: a `reduceFlashes` setting caps the lift
  at two bands — required, not optional (docs/13).
- **Sun shafts.** Quantized additive light columns at the §1.3 halo grain,
  two placements: **canopy shafts** — at low sun (dawn/dusk hours), 1–3
  slowly-drifting angled columns through hash-picked forest canopy gaps,
  1–2 bands, barely-there; **portal rays** — a static angled column just
  inside mine entrances from the surface-lit doorway (doc 26's "the way out
  is always findable" made literal and pretty). Hard caps: ≤ 3 shafts
  visible, combined additive alpha ≤ one band above ambient.
- **Hooks, not scope:** aurora nights, festival lanterns, eclipse events —
  the events layer is where they plug in later.

## 8. UI/feedback integration

Unchanged: nameplates and UI escape lighting (doc 21); hit-flash and vitals
feedback (docs 25/32) are sprite-space cosmetics, not lightmap features.
`sampleLight` remains the one sanctioned read-back (CPU buffer, never canvas
readback) — combat's light-based detection (doc 32 §6) does **not** read it;
the authority re-derives light pools from pure emitter data.

## 9. Phasing

1. **Resolution lift**: quarter-tile buffer, banding, halo pass, re-baked
   goldens — the whole world immediately looks like the references at night.
2. **Lunar ambient**: shared pure 29.5-day calendar helpers, all eight UI
   silhouettes, phase-dependent night ambient, and F3 readout. This is additive
   to the clock and requires no schema or subscription change.
3. **Flood occlusion**: hard blockers + soft attenuators + facing-seeded
   sconces (unblocks doc 26's cave feel at the new fidelity).
4. **Height**: `terrainHeightAt` contract wired (current plateau generator
   first, doc 30 sampler when it lands), light containment + cliff
   drop-shadows + rim spill.
5. **Directional shadows**: sun azimuth, entity silhouette blits, overcast/
   phase-weighted moon states.
6. **Global events**: lightning + reduceFlashes, portal rays, canopy shafts.
7. **Carried-forward content** (water glints, lit rain) lands with its r1
   phase order inside the above.

**2026-08-26 implementation verification (phases 1–3).** The client now uses
a reusable 8-bit sub-tile flood buffer, quantized flame halo, hard terrain
occluders, depth-owned alpha-silhouette prop/tree casters and receivers,
door/ramp spill, and optional
facing-seeded emitters. The shared calendar derives all eight moon phases and
interpolated illumination from the authority tick; clear surface ambient
reaches the exact Full/New Moon anchors, while the HUD supplies distinct 7×7
phase silhouettes and phase/illumination tooltip text. Placed and held flame
emitters use the same deterministic blended flame noise. The light-only layer
is bilinear-filtered during compositing to blend neighboring flood strengths;
terrain and sprites retain nearest-neighbor pixel rendering. Owner review then
added quarter-world-pixel fractional seeding so carried light no longer
advances in visible steps. The follow-up depth pass gives elevated solid sprites
receiver ownership ordered by painter-depth foot Y and excludes low collision
or relief such as ponds and inset terrain from optical blocking. Owner review
retained the authored long silhouette umbrae—especially the strong tree
columns—while directly visible owner masks keep those shadows off the caster's
own elevated face. Tree columns originate exclusively from the authoritative
trunk collision mesh; canopy pixels are receiver-only.
Raised terrain now distinguishes its visible south-facing wall artwork from a
generic hard tile. Stacked wall rows receive approach-side point light as one
continuous face while remaining terminal blockers, so the plateau behind the
face stays in umbra.

The public browser's representative 40-light fixture (36 standing torches and
4 campfires) measured **1.1–1.3 ms warmed** at four texels/tile, below the
1.5 ms §10 gate. Forty simultaneous maximum-radius campfires remain a
pathological **5.7–7.8 ms rebuild** and are intentionally reported separately.
After composite caching, 120 steady daytime renders measured **0.002 ms
average lightmap work** and **0.78 ms whole-frame average**. Height,
directional shadows, global events, water glints, and lit rain remain phases
4–7 and were not started.

The owner-reviewed motion/umbra refinement replaces per-target rays with one
symmetric visibility field per light. After adding compact trunk-cell indexing
and receiver ownership, a deterministic 280×160-texel synthetic fixture with
36 torch-radius lights, 4 campfires, and 100 mixed silhouette/trunk blockers
measured **0.81 ms average** (0.73 ms best; 1.79 ms warm-runtime outlier),
versus 3.51 ms for the rejected naïve ray pass. Overlapping sources remain
per-channel maximum merges; neither the light buffer nor the single max-merged
halo layer adds repeated source brightness.

## 10. Performance and instrumentation (revised budgets)

- The four-texel buffer at default zoom is ≈ 280×160 texels (~45 k). Budgets: ambient
  fill + flood + stamp ≤ **1.5 ms** at 40 lights; halo pass ≤ 0.3 ms;
  directional shadow pass ≤ 0.5 ms at 200 visible entities; glint/lit-rain
  sampling ≤ 0.2 ms. No per-frame allocations anywhere in the light path.
- If profiling on low-end hardware breaks the budget, the sanctioned lever is
  `LIGHT_TEXELS_PER_TILE = 2` — not disabling features.
- F3: light count, flood texels visited, lightmap ms, shadow-pass ms, lunar
  phase + illumination per mille, and active event (storm/shaft) state.

## 11. Out of scope

Per-pixel (16×/tile) light; full-resolution projected/raycast shadows;
colored shadow tints; player-visible time-of-day shadow puzzles; authority-side
light state; dynamic weather beyond the existing modes (new weather kinds are
doc 30/06 business).

## 12. Tests and acceptance

- **Unit:** banding/falloff goldens at the active profiled resolution (named `27§1`);
  flood goldens on fixture grids — wall containment, door spill, corner
  dimming, alpha-silhouette transparency and umbra profiles, facing-seeded cone shape (named
  `27§3`); height gates — containment, rim spill depth, drop-shadow widths vs
  Δheight (named `27§5`); lunar phase-center and wrap boundaries for all eight
  names; 29.5-day rollover and season/year non-reset goldens; Full Moon
  midnight equals the pre-r3 `{89, 89, 105}` baseline exactly; New Moon
  midnight is `{20, 20, 32}`; lunar modulation is absent at midday and in
  fixed-ambient spaces; weather composition never brightens the lunar result;
  sun azimuth curve keyframes; lightning schedule
  determinism (same tick window → same strikes on two simulated clients) and
  minimum-gap invariant; shaft placement determinism + caps; `LIGHT_COLORS`
  caps; `sampleLight` round-trips at sub-tile coordinates.
- **Browser/review (pixel-art skill loop, before/after pairs):** the two
  owner reference shots recreated in-engine — a mine gallery with facing
  sconces and furniture (pooling + soft object shadows), and a lit interior
  row of tables; cliff edge at dawn/noon/dusk (drop-shadow + rim spill);
  orchard at dawn with canopy shafts; clear Full Moon and New Moon at the same
  place/time-of-night (with and without a standing torch); all eight dial
  silhouettes; storm night with lightning (and with `reduceFlashes` on).
- **Two-client:** identical lunar phase/illumination and ambient RGB at the same
  authority tick; identical flicker patterns, lightning timing, and shaft
  placement (all tick/hash-derived); remote torch floods/shadows identically.
- **Perf:** §10 budgets asserted via F3 under a 40-light + 200-entity + storm
  fixture scene.

## 13. Bookkeeping

- **DECISIONS.md** on adoption: (1) supersede the 2026-08-25 one-texel-per-tile
  charter — quarter-tile texels with 8-bit strength is the revised
  binding look (owner-directed, reference-calibrated); (2) supersede
  "sub-tile objects never occlude" — opaque authored object pixels,
  walls/cliffs are direct-umbra blockers and south-facing cliff artwork is an
  opaque receiver, while authoritative tree-trunk footprints are long,
  collision-width ground-shadow projectors with self-owner/depth masking;
  transparent padding and low collision stay open, emissive props never self-occlude,
  and players/NPCs still never occlude;
  (3) terrain must export the integer `terrainHeightAt` contract (doc 30
  elevation) — lighting and future systems consume height, never re-derive
  it; (4) global light events (lightning, shafts) are deterministic functions
  of the authority tick — zero netcode, identical on every client, with the
  `reduceFlashes` accessibility cap mandatory; (5) the 29.5-day eight-phase
  lunar cycle is derived from that same tick, drifts across the 28-day year,
  and explicitly supersedes the universal 89/channel surface-night floor.
- **docs/30 §3**: annotate the elevation bullet as the `terrainHeightAt`
  provider. **docs/26 §6**: mine sconces gain facing; portal rays noted.
  **docs/21 §5**: still superseded, now by r3. **docs/13**: `reduceFlashes`
  added to the a11y list and the day/season dial gains eight lunar silhouettes
  plus the phase-name tooltip.
- Art tickets: none — shafts/halos/shadows are runtime effects; the water
  glint decal from r1 remains the only sprite ask.
