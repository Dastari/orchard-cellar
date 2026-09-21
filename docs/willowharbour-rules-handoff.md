# Connected Willowharbour handoff

Branch: `feat/willowharbour-connected-world`; worktree: `/home/toby/projects/orchard-town-rules`.
Builds on unmerged PR39 (`feat/willowharbour-river-gardens`); the new PR is stacked on that branch. No main merge or game/world deployment was performed.

Implemented: shared six-family native boundary grammar, native player-fence joins, two-cell shallow shelf masks with inner returns, repaired farm enclosure, removal of decorative town chests, persistent Auto/On/Off streetlamps, native wall framing/windows, and ten explicit room programmes. See the [spec](willowharbour-rules-spec.md), [room rationale](willowharbour-rules-interiors.md), and [Astra review](review/willowharbour-rules-pass-01.md).

Evidence remains in `output/town-rules/`: final-town.png, final-interiors.png, final-night.png and renderer JSON sidecars. Reproduce with `npx tsx packages/tools/src/render-hearth-study.ts <output.png>` plus `--residents`, `--interiors`, or `--town --dynamic`, respectively. Native licensed source files are required for reimport/pixel comparisons and are not committed.

The local PR39 saved-map upgrade rehearsal completed through `exportHearthMap` with a reviewed baseline; every non-Willowharbour terrain cell was preserved. Local rehearsal input/result: `output/town-rules/prior-pr39-map.json` and `output/town-rules/upgraded-final/map.json`. This is not a dump of live production and must not replace production without the normal current-map conflict review.

Release scope is game/client assets, world code and content plus the reviewed saved-map update. No new persistence table. Before any publication, follow `ops/orchard-runtime/PUBLISHING.md` and its guarded lane; verify the real saved map and live lamp interaction/reconnect behavior through https://orchard.dastari.net/. The current session performed offline engine visual verification and functional tests, not a live authority/reconnect acceptance. Studio UI was deliberately left to the separate editor task; the only Studio file change is the bootstrap content hash fixture.

Validation details are recorded in the PR. Local logs are `/tmp/town-rules-*-final*.log`, `/tmp/town-lamp-tests-final.log`, `/tmp/town-rules-native-tests-final.log`, and `/tmp/town-rules-upgrade-final.log`.

## Final validation

- Coverage: 928 files passed; 5,658 tests passed, two skipped. Statements 88.71%, branches 84.03%, functions 94.26%, lines 92.78%; all thresholds passed.
- Exhaustive terrain: 51 passed. Licensed native source-pixel checks: 139 passed. Interior layout/routes: 64 passed. Farm, bridge and resident access: five passed.
- Workspace type checks, ESLint, simulation/tools/world/client builds, 1,309 assets built/validated, and lifecycle integrity passed.
- Payload 559,637 bytes, within budget, content hash `5107433c`.
- PR: https://github.com/Dastari/orchard-cellar/pull/40 (base PR39). GitHub checks were still running at local closeout. Working tree clean after documentation commit; no deployment or merge.
