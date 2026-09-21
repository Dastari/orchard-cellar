# Live map freeze fix — 2026-09-22

Branch: `fix/studio-map-character-art`, based on `cb1b97aa` (current main).
Studio 0.9.3 / root 0.18.2 / engine 0.18.1. PR and installation checks are
recorded below at release closeout; earlier entries are historical.

The supplied console log contained 85 `playerRig.hair` drawing exceptions.
An isolated sign-in using the dedicated development account reproduced the same
incomplete-art problem for `rogueEnemies.slime_small_red`, plus a localStorage
quota exception while accepting published map revision 6. The map art loader
had deliberately omitted the actor banks even though the live renderer uses them.

The loader now includes player appearance and held-light poses, wildlife/mounts,
enemies and legacy NPC/chest/target artwork. It still excludes the gameplay UI skin,
weather and combat tools and retains the shared asset request budget. Draft saving
uses compact, lossless map JSON instead of pretty export JSON. Failed storage reads
or writes cannot abort initialization, checkout, validation or editing; write failures
preserve the in-memory and previously saved drafts and warn to export before closing.
Existing draft versions and explicit map conflict choices remain unchanged.

Regression coverage reproduces the exact missing-hair failure with the actual map
art loader and actor painters, tests compact draft round-trip, and exercises editing,
undo and checkout while storage throws. The signed-in staged production candidate
loads map revision 6, persists a clean draft and supports detailed zoom/right-drag pan
without errors. No production map edits or publication are used for verification.

Release evidence: `/home/toby/.local/state/orchard-release/studio-freeze-20260922`.
Guarded source: `source`; output: `output`; entry: `/assets/index-NbK5V0gu.js`.
All changed runtime inputs match the staged snapshot; only a test call's explicit
`hitFlash=false` argument was completed after staging and checked separately.

All 5,915 tests pass (5,814 coverage + 101 exhaustive), with all thresholds met:
88.69% statements, 84.02% branches, 94.35% functions, 92.78% lines. Workspace
TypeScript/ESLint, canonical content, lifecycle integrity, world build and 1,320-asset
validation pass. The real saved draft shrank from 6,141,603 to 4,150,073 characters
and restores cleanly after reload.

## Historical integration update — 2026-09-21

The owner now authorizes merging and publishing #41 with the town release.
RubyBay is reconciling current main into this branch. Version 0.18.0 / Studio
0.9.2 keeps both rendering paths, repairs crafted-fence family recognition and
inherits the serial timing-test lane and canonical export gate. Full validation
and deployment are pending; the 0.9.1 artifact below remains rollback evidence.
See [town release handoff](town-release-handoff.md) for current release state.

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

Studio 0.9.1 is deployed from implementation commit `fba0fc44`; release evidence is at
`/home/toby/.local/state/orchard-release/studio-feedback-20260921`.
The checked source is `source-checked`; installed artifact is
`output-checked`, entry `/assets/index-CpnebIh7.js`. `studio-before` retains the
previous 0.9.0 artifact. Browser screenshots and validation logs are retained there.
Public static, headers, proxy, JS/CSS byte checks and all six pixel-icon byte checks pass.
Studio PID is 4076339; game/world PIDs stayed 3549396 / 26438. The installation
waited for HTTP readiness and succeeded without rollback. The terrain-build fixture
also passes all ten tests after removing the explicit CI timeout; assertions and
repository-configured coverage timeout are preserved. New PR CI is pending.

Only Studio is deployed by this task. Shared gameplay/authority code needs its own
guarded release. No production test strokes, content publication, schema migration
or game/world restart are part of this update. PRs #40/#42 independently change
shared rendering and versions; reconcile them on integration. Release agent RubyBay
has permission for a narrow isolated-worktree terrain-build test timeout correction;
the clean primary checkout is handed back after this release closeout. Preserve the
installed checked Studio artifact during the town release; do not replace it by
building unmerged Studio source from another branch.

The user confirmed sign-in twice, but automation tab_5 still shows Orchard login
without a Studio session. Anonymous immediate authentication is verified; authenticated
live visual verification remains unavailable. Do not infer successful authentication
from the local fixture or HTTP checks. No credentials are recorded here.

Auto surround does not disable the terrain compositor globally; exact terrain role
overrides remain in the inspector. Missing native snow source, shroomlands tall
inverse corners and dedicated lava shore artwork remain documented capability limits.
