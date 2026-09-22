# NPC camera jitter — 22 September 2026

## Finding

Stationary NPCs at fractional world coordinates can move a pixel relative to
terrain while the player/camera moves. This is independent of network position
updates: sleeping animals already render their authoritative, stationary position,
and other NPCs already interpolate between fixed updates.

The ground cache rasterizes tile-aligned coordinates, while actor sprites round
their own camera-relative destination. A fractional NPC position crosses a
rounding threshold on a different frame from the ground. At the default 1x world
pass and 2x zoom, one world-pass pixel becomes two CSS pixels.

## Evidence

Used the authorized development account in an isolated browser at
`https://orchard.dastari.net/`, 1280×800, DPR 1, Canvas 2D, world scale 1x, zoom 2.
The initial idle sample sustained about 59.9 Hz, with 11.4 ms p95 render submission
time and no missed 60 Hz frames in the 240-frame pacing window. These are local
browser measurements, not a general performance claim.

A presentation-only camera sweep around a resting cow at world position
`(6198.125, 7351.25)` captured actual sprite and terrain draw destinations. The
32-frame sweep kept the world simulation unchanged within each synchronous run:

| Camera presentation | Cow/ground relative X drift | Relative Y drift |
| --- | ---: | ---: |
| Existing fractional camera | 1 pass pixel | 1 pass pixel |
| Shared camera snapped to pass pixels | 0 | 0 |

No server clock, NPC position, map or content was modified. The temporary draw
capture and lighting/camera preview were restored after measurement.

## Fix

- Snap the interpolated/clamped gameplay camera once at `frame.layout.integerScale`
  before sharing it with terrain, NPCs, players, lighting, targeting and overlays.
  Simulation, authority and interpolation retain their original precision.
- Subtract the rounded camera in pixel space in anchored actor, partial actor
  and boat drawing. This avoids floating-point cancellation at exact half-pixel
  ties when a snapped world offset is a third or sixth of a world pixel.
- Retain sub-world-pixel movement at higher world-pass resolutions. The maximum
  camera quantization is half a pass pixel; pixel-art scrolling still advances
  in pass-pixel increments at 1x.

The regression uses the actual wildlife drawing and ground snapping functions,
rest/sleep animations, both horizontal facings, camera reversals, pass scales
1/2/3/4/6, fractional zoom/DPR, negative centred-map offsets and map edges. Before
the fix, the stationary cow occupies two different positions relative to ground.
Existing NPC interpolation and local prediction tests remain required.

## Verification and handoff

The versioned production candidate loaded `overworld-main-CDzx3bN4.js` through
browser-local static overrides at the canonical origin. With the original,
fractional camera preview input, its 32-frame sweep measured **zero X/Y drift**;
an explicitly snapped control also measured zero drift. The probe observes the
world-pass context only and follows the cow across animation-frame changes,
excluding scratch surfaces used to prepare artwork. No override was installed
on the public server. A normal keyboard walk changed the predicted position from
`(94336, 106624)` to `(95120, 106624)` with no page errors during that check.

All 63 focused camera/actor/prediction tests and 101 exhaustive tests pass, as do
workspace type checking, linting, lifecycle and content validation, world module
compilation, asset validation (1,320 assets), production client build and chunk
boundaries. The broad run completed 938 files / 5,821 tests: 5,676 passed and the
145 fixture-dependent cases below failed before their inputs were linked. The
targeted rerun passed all 147 cases in those two files. Together with the 101
exhaustive tests, all 5,922 distinct tests have passing results on this source.
The initial `npm run check` exits nonzero for the missing fixtures and does not
emit coverage percentages; a fresh CI run must supply the aggregate coverage
gate. The failed files were rerun rather than repeating unaffected tests.

Candidate branch: `fix/npc-camera-jitter`; isolated checkout:
`/home/toby/projects/orchard-npc-camera-jitter`.

The first broad run lacked ignored licensed artwork in this new worktree.
Linking the existing local `references/` and `art/custom/tool-progression/`
fixtures resolved the two affected test files; all 147 tests in their targeted
rerun pass. No source change was required for these fixture failures.

Root version 0.18.3, client 0.18.1 and engine 0.18.2 were coordinated with the
parallel tasks. At integration, preserve PR46's Studio artwork loading change,
this PR's actor rounding changes, all changelog entries and the highest package
versions; do not replace the independently deployed Studio build.

This is a rendering change with no world schema, gameplay or content change.
It does not authorize merging or deploying the game. Keep the independently
reviewed Studio artifact when preparing any later approved game release, and
follow `ops/orchard-runtime/PUBLISHING.md`.

The finding explains a reproducible stationary-animal jerk. It does not establish
that every reported hitch has this cause; physical-device performance and moving
NPC network corrections remain separate validation concerns.
