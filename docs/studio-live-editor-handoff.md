# Map delta publication — 2026-09-22

Branch: `feat/studio-map-delta-publish`, stacked on PR46's `42dbb7ee`.
PR: https://github.com/Dastari/orchard-cellar/pull/47; implementation `891b905b`.
Root/sim 0.19.0, world 0.18.0, Studio 0.10.0; engine remains 0.18.1.
Status: implemented and checked; **not deployed**. The live editor remains 0.9.3.

The reported deletion at 386,373 is the authored object
`asset-3132196081-animation-base-0-386-373-1`. A read-only authenticated query
confirmed it remains in live map revision 6 (`140237bf`). The old publication
uploads 5.27 million characters of pretty JSON (above the server's 4,000,000 limit),
although the compact head is 3,525,763 characters. Its keyed deletion is now
146 bytes: envelope/base/target hashes plus one object ID mapped to null.

Studio diffs its final draft against the verified subscribed base, including
undo/restored drafts and automatically generated terrain neighbors. The authority
accepts the versioned delta inside the existing reducer JSON argument, checks
permissions/CAS/hashes/limits, reconstructs and fully validates the map, and commits
through existing snapshot/history/streetlamp code. Snapshot callers are unchanged.
Derived landmark roles follow authority content rather than the editor's bundled
catalog. Missing combat policy cannot clear an existing policy accidentally.

Publish errors now appear on canvas with Retry/Dismiss while preserving the draft.
Only the matching live head clears dirty state; edits during publication form the
next delta. The existing game runtime adopts the new revision and removes the
tree's artwork/object entry and collision. Downloads and history still use complete
heads; this feature reduces uploads, not subscription payloads or validation work.

Validation: 939 coverage files / 5,825 tests, all thresholds passing (88.77%
statements, 84.10% branches, 94.44% functions, 92.84% lines); 7 exhaustive files /
101 tests; 50 final focused regressions after the catalog-role review. Workspace
typecheck/lint, content/lifecycle/1,320-asset checks and world/game/guarded Studio
production builds pass. Generated complete private schema matches the deployed
fruit-fell release; public bindings match the checked-in surface. No migration or
binding change is needed. Staged static dependency graphs pass verification.

An isolated local browser with a stand-in authority exercised the actual Publish
button: 122-byte terrain delta, visible rejection with the draft still dirty,
successful explicit retry, then clean revision 7. No production edit, publication,
service restart or reconnect credential handoff occurred. The dedicated account
was used only for read-only live diagnosis; its isolated browser is closed.

Evidence: `/home/toby/.local/state/orchard-release/map-delta-20260922`.
Final reviewed Studio source/artifact: `source-final` / `output-final`;
entry `/assets/index-9MeJb9eh.js`. Game: `game-output-final`.
Authority: `candidate-world.js`, SHA256
`06c0a18bfd58a1038cf292ed4bd02c2a8644e223588dd1d0d5733735118c7951`.
Schema evidence: `schema-final` / `public-final`; browser screenshots:
`before-publish.png`, `rejected.png`, `accepted.png`.

Next: obtain explicit approval for the concrete world release, then use the
unchanged-schema routine lane from the publishing runbook with fresh authorized
reconnect/content-candidate inputs. Include PR46's deployed freeze fix. Install
delta Studio only with the server support; do not deploy it against the old module.
After release, the user can reload Studio with their retained local draft and
Publish the deletion; do not replace or publish someone else's browser draft.

# Historical live map freeze fix — 2026-09-22

Branch: `fix/studio-map-character-art`, based on `cb1b97aa` (current main).
Studio 0.9.3 / root 0.18.2 / engine 0.18.1. Implementation `721379c4`.
PR: https://github.com/Dastari/orchard-cellar/pull/46 (open, not merged; CI running).
Earlier entries below are historical.

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

Deployed successfully with public static/headers/proxy and JS/CSS byte checks.
Only Studio restarted (PID 563170); game/world PIDs stayed 535262 / 134213.
Dedicated account verification was repeated against the public release with all
candidate overrides removed: authenticated map revision 6, working detailed zoom
and right-drag pan, zero page/unhandled errors and a persisted clean draft.
Rollback: `studio-before` (0.9.2). No production map edits/publication, role changes
or reconnect credential handoffs occurred. The isolated browser session is closed.

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


## PR47 deployment verification

Live: https://cellar.dastari.net/
Source: c6b4f32818af7b3098bb08ce5b944afbff5f43ec, feat/studio-map-delta-publish.
PR: https://github.com/Dastari/orchard-cellar/pull/47 (open, unmerged; source CI passed).
Bundle: /assets/index-9MeJb9eh.js
Bundle SHA256: df8ab4f39eb29ef8387f7d1e8c21260f20a88a378799bc36379592655fe5e5c7
World module: d3e9761d54325593612cc85465016d10f213dc5c377e8590d5268e1514ff1b7d
Database identity: c200af6ca3e4663bde9be65c18114d5d296f4b811bf0fa35d3771f8fdba89c21
Content remains R15 / 2f704947. No content upserts or map publication.
Evidence/rollback: /home/toby/.local/state/orchard-release/map-delta-20260922-routine
Status: deployed. Full schema and public bindings unchanged; guarded routine lane,
rollback manifests, 42-table owner reconnect parity and static/public byte checks passed.
Reviewed Studio guard preserved. Dedicated account sign-in and live R6 canvas verified.
Owner reconnect credentials removed after verification; user Studio draft untouched.
New selection/terrain work is isolated in orchard-studio-feedback and is NOT deployed.

