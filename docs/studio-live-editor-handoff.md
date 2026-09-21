# Cellar Studio live editor handoff

Date: 2026-09-21. Branch: `feat/studio-live-map-tools`.

## Delivered behavior

Studio 0.9.0 authenticates immediately, automatically connects to production and
gates editing until the live map head verifies. Connection loss closes the editing
surface. The global sandbox/connect toolbar is removed.

The map drawer has six icon tools, a searchable virtual palette with six object
filters, fixed medium icon buttons and a selected-item reticle. Its width supports
three or more palette columns. The footer contains the selected name and Auto
surround. Canvas controls expose the active height and explicit publication.
Layer rows contain visibility and selection only. Resource trees now appear under
Canopy at overview and detail, using the gameplay resource painter.

Shared terrain compilation preserves material, biome and height through undo and
serialization. Height tools respect the active source plane and plan supported
2×2 footprints. Fill respects semantic boundaries and the active height. Shared
object topology covers six native fence/hedge families and all sixteen cardinal
connection masks, including editor-only authored overrides. The game player
painter derives joins automatically from runtime state.

See [generation rules](studio-generation-rules.md) for the 103-tile inventory,
biome recipes, native artwork limits and object adjacency contract, and the
[design specification](studio-live-editor-spec.md) for acceptance criteria.

## Release boundary and integration

Only Studio is deployed by this task. Shared game/authority changes are delivered
in this PR and require their own guarded release. No map edits, stored content
publication, schema migration or game restart are part of this update.

PR #40 (`feat/willowharbour-connected-world`, stacked on #39) independently changes
shared rendering and versions. Agent Mail coordination was authorized; editing
began after its conflicting reservations were released. Reconcile those shared
files and release versions when integrating the two PRs. Do not drop town lamp,
interior or boundary changes from that work. This branch recognizes its native
boundary asset IDs for connectivity.

Auto surround controls height footprint expansion and object joins. It does not
disable the terrain compositor globally; exact terrain role overrides remain in
the inspector. Missing snow source, shroomlands tall inverse corners and dedicated
lava shore art are documented capability limits, not substituted artwork.

## Verification and release evidence

- Workspace TypeScript and ESLint checks pass. The final staged build also checks
  Studio and its shared dependencies with the reviewed UI-kit guard intact.
- Exhaustive world/terrain suite: 51 tests pass. Targeted final drawer, tree,
  connection, material, height and native-fringe regressions pass.
- Full coverage suite: 935 files / 5,688 tests pass. Statements 88.66%, branches
  83.93%, functions 94.32%, lines 92.78%; all repository thresholds pass. Together
  with the exhaustive suite this is 5,739 passing tests across 937 files.
- Lifecycle artifact integrity and the final world build pass. Assets validate:
  1,198 art assets, three songs, ten sound effects, 55 colors and four seasons.
- Independent source/native-art review found no remaining material blockers.
  Final changed-content credential-pattern and whitespace scans pass.
- The deployed bundle is `/assets/index-D8CYj2-I.js`, built in `studio-production`
  from `checked-source-release` and installed from `output-release`.
- Public static/headers/proxy checks and reachable JS/CSS byte validation pass.
  Game and world PIDs remain 3549396 and 26438 respectively.
- The first final-install attempt received a transient startup 502 and restored
  the original artifact. The subsequent release waited for HTTP readiness before
  running validation and passed. No game/world process was restarted.

The private release directory is
`/home/toby/.local/state/orchard-release/studio-live-tools-20260921T0455`.
The original checked rollback is `studio-before`. Staged releases preserve the
reviewed UI-kit prebuild guard and collision-check retained hashed assets.

The user confirmed sign-in twice, but the automation-connected preview (`tab_5`)
still reports the Orchard sign-in page with no Studio session, including after
reloading the final deployment. Anonymous immediate authentication is verified;
authenticated visual verification remains unresolved. No credentials are stored
here, and no production test strokes were published.
