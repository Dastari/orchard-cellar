# Studio integration handoff — 2026-09-21

Cellar Studio is served at https://cellar.dastari.net/ from the canonical repository,
`/home/toby/projects/orchard-cellar`, with editor source in `packages/studio` and
shared kit source in `packages/ui/src/kit`. It retains its own `studio-production`
build, static `packages/studio/dist`, port 5174, auth client and
`orchard-studio.service`.

Source integration PR: https://github.com/Dastari/orchard-cellar/pull/36.
The owner authorized its inclusion in aggregate [PR #38](https://github.com/Dastari/orchard-cellar/pull/38).
See [the current integration handoff](branch-integration-handoff.md) for the exact
Git/cleanup status. The aggregate source is Studio 0.8.1; the installed artifact
remains the separately verified 0.8.0 deployment described below.
Use explicit branch refs when pushing: this host retains a legacy default push
mapping for `public-main`. Preserve the reviewed renderer guard and staged-release
procedure when preparing any future editor deployment.

## Build and shared resources

Run `npm ci`, `npm run assets:build`, and
`npm run studio:build -- --mode studio-production` with the ignored production
environment configured. For a running service, follow the isolated staging and
artifact-switch procedure in `ops/orchard-runtime/README.md`.

- `@orchard/ui/studio` exposes the kit/workbench only to Studio.
- Game entry `@orchard/ui` retains its current UI and small shared primitives.
- Real emitted-module checks reject editor dependencies in the game build.
- `packages/ui/public` owns shared public symbols; builds create ignored app copies.
- Shared assets, sim, auth, lifecycle and bindings come from this repository.
- `scripts/build-reviewed-studio.sh` uses one repository and proves source
  immutability around an isolated Studio build; no retired source overlay remains.

## Validation and deployment

Deployed Studio 0.8.0 successfully. Public entry: `/assets/index-D9QsJ_OB.js`.
Runtime build commit: `d555be8d`; subsequent commits contain documentation only.
The source switch, service restart and static checks completed successfully;
public HTML and installed files matched the checked artifact exactly.

- Lifecycle integrity, world build, all workspace typechecks and lint passed.
- Coverage and exhaustive suites: **907 files, 5,557 passed, 2 skipped**.
- Coverage: statements 88.52%, branches 83.71%, functions 94.08%, lines 92.66%.
- Assets: 1,187 art assets, 3 songs, 10 SFX, 55 palette colors and four seasonal remaps.
- Independent Studio production build and unchanged-source manifests passed.
- Public static/security-header and same-origin `/v1/ping` checks passed.
- Native browser: map, Items, NPC and UI Lab rendered without canvas or console
  errors or failed HTTP responses; UI Lab exposes 104 specimens.
- Immediately before/after the switch, game artifact hashes and frontend/world
  service PIDs matched. Studio alone was stopped and restarted.

The initial full run found one source-readback guard failure. Character-tool
palette conversion now requests a CPU-read canvas, and the guard permits only
that exact source-image expression. Focused regression and a full coverage
rerun passed; the rerun used two workers, followed by the serial exhaustive suite.
Licensed external-art exclusions match CI (`ORCHARD_TEST_LICENSED_ART=0`).

The browser checks exercise anonymous shell/tool rendering and same-origin API
connectivity. They do not claim authenticated publishing or mutate stored content.
No world publish, content publication, database migration or game deployment is
part of this integration. A separate PR #24 release advanced main while validation
ran; its icon changes were incorporated before the final build.

The independent game build passes normal chunk checks and the new editor boundary.
Its game-UI chunk is 358.77 kB (103.38 kB gzip). Studio's existing large-chunk warning
remains; broader delivery optimization is tracked by the asset-delivery audit PR #23.

## Cleanup and rollback

Removed the archived `/home/toby/projects/orchard-cellar-studio-release` source
directory and the temporary integration checkout. Removed these six clean,
merged worktrees after checking HEAD ancestry, private inputs and active processes:

- `orchard-cellar-chest-controls`
- `orchard-cellar-fruit-seeds`
- `orchard-cellar-harvest-audit`
- `orchard-cellar-mount-fix`
- `orchard-cellar-release-080`
- `orchard-cellar-release-084`

Their Git branches remain available. Active PR worktrees were preserved, including
the asset-delivery audit. `orchard-cellar-mobile-build` and
`orchard-cellar-pr-integration` were retained because they have unique local
history that is not safely covered by ancestor checks. No branch was deleted.
Superseded migration staging copies were removed; the final checked source,
artifact and rollback evidence remain.

Private evidence:
`/home/toby/.local/state/orchard-release/studio-integration-20260921T003033Z`.
`reviewed-source.tar.gz` preserves the retired source and ignored private inputs;
its checksum and all 4,747 source-file comparisons passed before removal.
`studio-at-switch` and its SHA-256 manifest preserve the immediately preceding
live artifact, including changes from any release during this session.
`deployment.json`, `protected-at-switch.json`, the `checked-source` manifests,
validation logs and `worktree-cleanup.json` record the exact operational results.

To roll back only Studio, stop `orchard-studio.service`, restore the checked
`studio-at-switch` contents into canonical `packages/studio/dist`, restart Studio,
and rerun the public static validator. Keep source integration and the separate
frontend/world services intact. The older source archive is for recovery, not an
active build input.

Review decisions: `docs/review/studio-integration-pass-01.md`.
Architecture: `docs/adr/ADR-studio-single-repository.md`.
