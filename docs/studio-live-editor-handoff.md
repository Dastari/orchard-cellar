# Cellar Studio live editor handoff

Date: 2026-09-21. Branch: `feat/studio-live-map-tools`.
PR: https://github.com/Dastari/orchard-cellar/pull/41 (not merged).

## Delivered behavior

Studio 0.9.1 authenticates immediately, automatically connects to production and
gates editing until the live map head verifies. Ordinary edits stay in a browser
draft until Publish changes, below Auto surround, is selected. Auto controls
surrounding generation, not publication.

Six generated pixel-art tools occupy one row. Both palettes use larger previews,
the native inventory reticle and responsive grids with at least three columns.
Native category icons sit in their own frame. The selected name truncates without
clipping footer button artwork. Right-drag pans, palette objects drag onto the map,
and existing object artwork follows the pointer before one local history commit.
The right drawer separates a selection preview/editable properties from compact
layer rows. The development-only `feedback.fixture.html` exercises these actual
components without permitting a live connection or publication.

The Studio art loader now includes every built-in resource growth/depletion sprite;
missing sapling/young/stump art previously interrupted the resource paint queue.
Explicit resource identity is preserved and Canopy trees retain overview silhouettes.
Small terrain edits resolve affected cells through shared generation rules and
invalidate nearby ground chunks. Completed terrain remains visible during larger
compiles. Sparse overview updates preserve shading, undo and pending full replacements.

Shared generation preserves biome, material, collision and height through undo and
serialization. Height tools respect the active source plane and supported 2×2
footprints. Fence/hedge topology covers six native families and all sixteen cardinal
masks, with editor-only overrides. See [generation rules](studio-generation-rules.md),
[specification](studio-live-editor-spec.md) and [icon prompts](studio-pixel-tool-icons.md).

## Validation

- Full coverage reports 937 files / 5,701 tests passing. Statements 88.67%, branches
  83.93%, functions 94.32%, lines 92.78%; all configured thresholds pass.
- Exhaustive world/terrain suite: 51 tests / two files pass, for 5,752 tests across
  939 files together with coverage. Targeted final cache, drawer and publication
  checks also pass.
- Workspace TypeScript, ESLint, lifecycle integrity, world build and asset validation
  pass (1,198 art assets, three songs, ten effects, 55 colors, four seasons).
- Guarded independent Studio production build passes; all 38 changed code/asset
  inputs match the staged source. The original UI-kit prebuild guard is preserved.
- Actual local browser verifies palette/object dragging, right-drag pan, immediate
  terrain feedback, the new palettes/reticles/footer and separate selection panels.
- Actual resource resolver/painter covers every built-in growth/depletion state.
  Generated-island/cave-floor parity, sparse chunk retention and cache replacement
  races have regression coverage. Independent review and diff/credential scans pass.

## Deployment and integration

Studio 0.9.1 is prepared at
`/home/toby/.local/state/orchard-release/studio-feedback-20260921`.
The checked source is `source-checked`; intended installed artifact is
`output-checked`, entry `/assets/index-CpnebIh7.js`. `studio-before` retains the
previous 0.9.0 artifact. Browser screenshots and validation logs are retained there.
Installation/public verification results will be recorded after deployment.

Only Studio is deployed by this task. Shared gameplay/authority code needs its own
guarded release. No production test strokes, content publication, schema migration
or game/world restart are part of this update. PRs #40/#42 independently change
shared rendering and versions; reconcile them on integration. Release agent RubyBay
has permission for a narrow isolated-worktree terrain-build test timeout correction;
primary checkout ownership transfers only after this Studio release is recorded.

The user confirmed sign-in twice, but automation tab_5 still shows Orchard login
without a Studio session. Anonymous immediate authentication is verified; authenticated
live visual verification remains unavailable. Do not infer successful authentication
from the local fixture or HTTP checks. No credentials are recorded here.

Auto surround does not disable the terrain compositor globally; exact terrain role
overrides remain in the inspector. Missing native snow source, shroomlands tall
inverse corners and dedicated lava shore artwork remain documented capability limits.
