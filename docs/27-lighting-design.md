# 27 — Lighting Design Pass: Occlusion, Color, Flicker, Water, and Rain

Binding owner-directed spec (2026-08-25). Status: **design approved, not implemented**.
A design pass over the lighting system of [21-unified-renderer.md](21-unified-renderer.md)
§5 — this doc supersedes that section where they differ; everything else in doc 21
(composite order, world-offscreen-only multiply, nameplates after lighting) stays
binding. Feeds [26-underground-mines.md](26-underground-mines.md) §6 (per-space
ambient, torches, static and crystal lights), which depends on the occlusion and
emitter work here. Lighting is **pure presentation**: the authority never computes
light; nothing here touches `packages/world` or the sim's determinism rules
(client render code may use wall-clock time — the `Date.now` ban is sim-only).

## 1. The aesthetic charter (binding)

The owner's direction: the current **blocky, tile-quantized light** is the look.
It is not a placeholder for soft lighting — it *is* the lighting art style.
Rules every change below must obey:

1. **One texel per tile, forever.** The lightmap stays at 1 px per 16 px tile,
   scaled up with `imageSmoothingEnabled = false`. No per-pixel light, no
   half-tile texels, no shader-style gradients.
2. **Falloff is stepped, deliberately.** Light strength is quantized to
   `LIGHT_BANDS = 5` discrete levels before stamping
   (`strength = ceil(raw * 5) / 5`), so every light renders as readable
   concentric pixel rings rather than a smooth ramp. Today's continuous falloff
   already reads stepped at tile resolution; banding makes it intentional and
   consistent at every radius. Tunable in one constant; golden-tested.
3. **Soft glow is banned.** Doc 21's optional post-multiply radial-gradient
   `'lighter'` glow is **rejected** — a smooth gradient over pixel-stepped
   light would break the charter. If additive glow is ever wanted (spells),
   it must be tile-quantized through this same lightmap path (a second banded
   buffer composited with `'lighter'` at low alpha), never a Canvas gradient.
4. **Blend math is fixed:** ambient fill → per-channel `max` light merge →
   one `multiply` composite over the world offscreen. Nothing may add a second
   full-screen pass without a docs/21 §8 budget entry.

## 2. What stays (baseline)

`render/lighting.ts` as shipped: `TileLightmap` sizing/blitting, the
`AMBIENT_KEYFRAMES` day curve, `fillLightmap`, per-channel-max merging,
`lightmapCoordinate` tile-center sampling, `playerLightPosition` chest-height
anchor, and equipped-item emission for local + remote players. The design pass
*extends* this file's model; it does not rewrite it.

## 3. Light emitters — one registry, five source kinds

Today lights are hand-pushed inline for equipped items only. That becomes a
single collection pass per frame producing `PointLight[]`, driven by a data
registry in `render/light-sources.ts`:

```ts
export interface LightEmitterDefinition {
  readonly radiusTiles: number;
  readonly color: RgbColor;            // from the LIGHT_COLORS table only (§5)
  readonly flicker: 'steady' | 'flame' | 'pulse';  // §6
}
```

| Source kind | Position from | Examples |
|---|---|---|
| Equipped item | player rows (`equippedKind`), local + remote | torch r3 `#ffb868` flame; lantern r5 `#ffd9a0` steady |
| Generated prop | deterministic space generation (no rows — doc 26 §4.5) | cave wall lantern r4 flame; brazier/campfire r4 flame |
| Resource row | subscribed `world_resource` | crystal nodes r2 pulse, per-kind color; light dies when mined (row-driven) |
| Portal | `space_portal` rows | soft exit glow r2 steady, cool `#a8c4ff` |
| Transient | client events/particles (future spells, doc 25 §12) | cast flashes; must still band and quantize |

Collection is culled to the lightmap bounds before stamping; the frame's final
`PointLight[]` is also kept for §7/§8 sampling.

## 4. Occlusion — tile-flood propagation (the headline feature)

Doc 21's deferral ends here, on its own sanctioned terms: **BFS flood over the
terrain array — not a raycaster** (that instruction stands). New pure module
`render/light-flood.ts`:

- **The occluder grid.** Per space, derive `lightBlockedAt(x, y)` from the same
  terrain classification the renderer and collision already share: cliff/plateau
  wall faces, cave wall tiles, and (future) building wall tiles block light.
  **Doorways, portals, ramps, and open floor never block** — light spills
  through a door mouth at tile fidelity, per the owner's explicit call. Trees,
  props, resources, and players do **not** block (sub-tile obstacles are
  beneath the system's fidelity; a tree shadowing a lantern would read as a
  glitch at 1 texel/tile). One rule of thumb: *if you can't walk through it
  and it's tile-classified terrain, it blocks light; anything smaller doesn't.*
- **The flood.** Per light: BFS from the source texel over the lightmap window,
  8-connected, integer path costs (2 per orthogonal step, 3 per diagonal ≈ ×1.5),
  capped at `radius × 2`. A blocked tile **receives** light (so the near face
  of a wall is lit) but never **propagates** it (nothing comes out the far
  side). Strength derives from *path* distance, not straight-line distance —
  so light wrapping through a doorway around a corner arrives dimmer, which is
  exactly the cave-mouth look the mines want. Then band per §1.2 and merge
  per-channel max as today.
- **Shape.** Integer-cost BFS falloff is octagonal rather than circular. At
  tile fidelity with banding this reads as *more* deliberate, not less — it is
  accepted as part of the charter look (verify in the §13 review shots before
  tuning further).
- **Cost.** Radii are ≤ 6 tiles → ≤ 169 texels visited per light, tens of
  lights per frame: microseconds. The flood allocates nothing per frame
  (reused visit buffer keyed by generation counter). Budget entry in §10.
- **Fallback:** a space with a null occluder grid floods in the open — one
  code path everywhere, no legacy radial stamp to maintain.

## 5. Colored light (palette discipline)

Per-channel max merging already supports color; what's missing is restraint.

- **`LIGHT_COLORS` is the only source of light colors** — an authored table in
  `light-sources.ts` reviewed like palette work (docs/10 rules): warm flame
  (`#ffb868`), lantern gold (`#ffd9a0`), the four crystal glows
  (verdant `#7be07b`-family, azure `#6fc0ff`, violet `#c08cff`, amber `#ffd166`),
  portal cool (`#a8c4ff`), moon-cold reserve. Ad-hoc hex literals at call
  sites are banned.
- **Readability caps:** every entry keeps `min(r,g,b) ≥ 64` and avoids full
  saturation — a multiply pass with a deeply saturated light drives sprite
  channels to zero and makes art unreadable. A unit test asserts the caps over
  the whole table.
- Overlapping colored lights blend by channel-max toward their union (a torch
  meeting azure crystal light goes pale warm-cyan) — this is the desired
  behavior and gets a two-light golden test.

## 6. Flicker and animation

Flicker is jitter of **radius and strength only** — never color, never position
— so it reads as flame breathing, not strobing:

- `flame`: at `FLICKER_HZ = 8`, radius jitters ±0.4 tiles and strength ±8%,
  from `hash(emitterId, floor(nowMs / 125))` (the sim's integer hash reused;
  deterministic per time-slot so all clients see the *same* flicker pattern,
  merely unsynchronized by their clocks). Values interpolate between slots so
  band edges advance/retreat by whole texels — the visible effect is edge
  texels popping in and out, which is precisely the chunky torch feel wanted.
- `pulse`: slow triangle wave (~0.4 Hz) of ±15% strength, no radius change —
  crystals breathe; portals stay `steady`.
- Global cap: combined jitter can never move a light through more than one
  band per slot (no full-ring flashes), and flicker disables below UI scale 1
  viewport minimums where single texels get large.

## 7. Water — glints and reflections

Goal: water reacts to light and sky convincingly at pixel-art fidelity, without
a reflection renderer.

- **Ambient does most of it for free.** The multiply pass already tints water
  with dawn gold / dusk purple / night blue — sunset water looks right today.
  Keep it; add nothing full-screen.
- **Light glints (v1 deliverable).** `TileLightmap` gains
  `sampleLight(worldX, worldY): RgbColor` reading the frame's CPU-side buffer
  — a new shared primitive (§8 reuses it). Water tiles whose sampled light
  exceeds ambient by a threshold draw a sparse **glint decal**: 1–3 bright
  pixels from a small new `tile_cf_water_glint` animation (3 frames, hash-
  phased per tile like the existing ripple decals), tinted with the sampled
  light color, drawn in the animated-terrain pass at `'lighter'` low alpha.
  Result: a torch at the cave pool's edge scatters small dancing sparks on the
  water — chunky, cheap, and per-tile. Glints inherit the light's flicker
  because they resample each frame.
- **Sprite mirror reflections (explicit later hook, not v1).** The SNES trick —
  flipped avatar drawn at ~25% alpha onto water tiles directly south of an
  entity standing at a shoreline — is sketched here as the sanctioned approach
  if the owner wants it after seeing glints: same world pass, pre-lighting,
  clipped to water tiles, static (no wobble). Deferred because glints + ambient
  may already deliver "looks nice" at a fraction of the edge cases.

## 8. Rain interaction

Rain and light currently ignore each other except for the flat ambient
darkening. The pass makes weather read through the lighting:

- **Rain ambient goes cool, not just dark.** `ambientAtProgress`'s uniform
  `weather` multiplier becomes slightly channel-weighted (about
  `r × 0.80, g × 0.84, b × 0.92` at full darkening) — storms feel blue-grey,
  and warm torchlight pops against them. Same clamp floor, keyframes untouched.
- **Lit rain.** Rain streak/splash particles sample `sampleLight()` at their
  position; particles whose light exceeds ambient draw tinted toward the light
  color at raised alpha. A torch in night rain gets a cone of catching-light
  streaks — the single highest-value nice-looking-ness win in this doc. Cost
  is one buffer read per particle (the pool is already capped); no per-light
  loops.
- **Splash glints:** splash frames on lit tiles tint the same way — free once
  the sampling primitive exists.
- **Underground:** `SpaceDefinition.weather: false` (doc 26) means no rain,
  no rain darkening, no lit-rain path — already handled by the space model.
- Deferred: wet-ground gloss under lights (listed, unbudgeted; likely
  unnecessary once lit rain lands).

## 9. The ambient pipeline, consolidated

One function decides the frame's ambient — today's logic plus doc 26, in one
place: clock-driven spaces evaluate the keyframe curve with channel-weighted
rain darkening and the **89/channel comfort floor**; fixed-ambient spaces
(mines) return their literal, explicitly below the floor, ignoring weather.
The floor is thereby formalized as a *surface* rule, not a lightmap rule.
Night keyframes stay as shipped (they match docs/10 R12 tints); any retune is
a `balance:`-style art decision with before/after review shots, not part of
this pass.

## 10. Performance and instrumentation (extends docs/21 §8)

- Budgets: lightmap fill + flood + stamp ≤ 0.5 ms at default zoom with 40
  lights; glint/lit-rain sampling ≤ 0.2 ms at max rain density. No per-frame
  allocations in the flood or sampling paths.
- The F3 overlay gains a lighting line: light count, flood texels visited,
  lightmap ms — alongside the existing renderer metrics.
- `sampleLight` reads the existing CPU buffer; it must never force a canvas
  readback (`getImageData` stays banned in the frame loop).

## 11. Phasing

1. **Emitter registry + banding:** `light-sources.ts`, `LIGHT_COLORS` + caps,
   quantized falloff, flicker profiles. Pure client, ships alone — torches
   (once doc 26 phase 3 adds the item) immediately get the flame feel.
2. **Occlusion:** `light-flood.ts`, occluder grids per space, path-distance
   falloff. Unblocks doc 26's cave feel (walls actually contain light).
3. **Water glints + `sampleLight`.**
4. **Rain pass:** cool rain ambient, lit rain, splash glints.
5. **Later hooks:** sprite mirror reflections (§7), quantized additive glow
   for spells (§1.3), light-aware nameplate dimming (nameplates currently
   escape lighting entirely by design — revisit only if night screenshots
   argue for it).

## 12. Out of scope

Per-pixel or shader lighting; soft gradients of any kind; sub-tile occlusion
(trees/props/players casting shadows); directional shadows; day/night keyframe
retuning; authority-side light (creature AI reacting to light is a combat-era
question and would need sim-side determinism this doc deliberately avoids).

## 13. Tests and acceptance

- **Unit:** banding goldens (radius → exact per-texel strength rings, named
  `27§1`); flood goldens on authored occluder fixtures — wall containment,
  door spill-through, corner wrap dimming, blocked-tile-lit-but-terminal
  (named `27§4`); `LIGHT_COLORS` cap assertions; flicker determinism (same
  emitterId + slot → same jitter) and one-band cap; `sampleLight` coordinate
  round-trips; channel-weighted rain ambient goldens with floor.
- **Browser/review (pixel-art skill loop, before/after pairs):** torch against
  a cave wall — light stops at the wall, spills through the doorway; two
  overlapping colored lights; flame flicker capture (short recording); glints
  on the cave pool and on overworld freshwater at night; night rain around a
  torch vs. today's build; midnight overworld unchanged outside light radii
  (charter regression shot).
- **Two-client:** remote player's torch floods/occludes identically to local;
  crystal light dies for both clients when the node depletes.
- **Perf:** §10 budgets asserted via the F3 metrics under a 40-light fixture
  scene and max-density rain.

## 14. Bookkeeping

- **docs/21 §5**: annotate as superseded by this doc (occlusion no longer
  deferred; glow option replaced by the §1.3 ban).
- **docs/00**: doc-map row for 27. **docs/26 §6**: point its occlusion
  paragraph here.
- **DECISIONS.md** on adoption: (1) blocky tile-quantized lighting is the
  binding art direction — banded falloff, no soft gradients ever; (2) occlusion
  is tile-fidelity BFS flood with path-distance falloff; walls block, doors
  spill, sub-tile objects never occlude; (3) light colors come only from the
  capped `LIGHT_COLORS` table.
- New art tickets: `tile_cf_water_glint` (3-frame, few-pixel sparkle).
