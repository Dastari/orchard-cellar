# Approved town release — 2026-09-21

The owner approved the town release and subsequently approved all remaining PRs,
including Studio #41. IndigoForge's explicit primary checkout and service handoff has been received. RubyBay is the current release coordinator.

## Latest release checkpoint — 09:48 UTC

The owner now explicitly approves merging and publishing **all remaining PRs**,
including Studio #41. This supersedes the earlier exclusion. #43 passed both
hosted checks and merged at `f6bb638f`; #39, #40 and #42 were already merged.
RubyBay is integrating #41 with current main in
`/home/toby/projects/orchard-release-integration`. Root/client/engine/sim/tools/UI
are 0.18.0; Studio is 0.9.2. The integrated Studio must be rebuilt so town wall
framing and shared rendering match gameplay; use the migration lane's normal
`build` mode, retaining the UI-kit guard and rollback artifact.

Conflict resolution retains authoritative lamp rendering and complete-document
fence topology together. Independent review found the new crafted-fence sprite
missing from Studio's family resolver; a content-backed regression now checks
its E/W joins. Focused tests pass; full integration validation is running.

The owner reconnect handoff expired while the session was idle (refresh HTTP400).
Do not reuse it. Prepare a new encrypted handoff after integration checks, then
validate owner membership and refresh before publication. No production module,
content or map publication has occurred; services remain active.

The previous map candidate must be re-exported against integrated source/assets
and its source/registry hashes repinned. Retain the same reviewed historical
map baseline and occupancy checks. Public preflight runs while services are active;
map apply requires frontend and Studio inactive and repeats content/map CAS and
occupancy checks before the owner reducer. Restore both routes after verification.
Acceptance helpers target only OrchardAgent. Run all ten interior round trips,
persisted lamp cycles and canonical signed-in browser verification.

## Earlier preparation evidence

- Current desktop shared preview opens https://orchard.dastari.net/ and permits
  page evaluation. It initially had no signed-in session; user sign-in requested.
  Snapshot automation fails with `PreviewAutomationExecutionError`; page state
  evaluation succeeds. The user confirmed our temporary marker was absent from
  their signed-in window, proving the desktop connection mismatch. A new tab
  retained the mismatch. No authenticated visual acceptance is claimed.
- PR #39 (`7660762c`), #40 (`32a5761e`) and #42 (`36db5f29`) fail CI on
  coverage-instrumented village route and Studio terrain fixtures, with an
  additional 8 ms UI layout-budget failure on several runners.
- The three affected suites pass without coverage on the isolated #39 candidate:
  3 files, 16 tests, 30.83 seconds with `CI=true`, licensed-art tests disabled,
  and file parallelism disabled. All original assertions and time budgets remain.
- All six suites in the updated non-coverage lane pass: 90 tests in 164.34 seconds.
  Lifecycle integrity, world build, workspace typechecks, lint and 1,213-asset
  validation passed. The seven release-helper tests and release typecheck pass.
  Final candidate local coverage finished with 5,781 passing tests and one failure:
  a licensed artwork source missing from this worktree. Restored source artwork
  from the primary checkout; the affected three premium-icon tests now pass.
  CI for repaired heads remains pending. No merge or publication has occurred.
- Release investigation uses
  `/home/toby/projects/orchard-town-release-ci`, branch `fix/town-release-ci`,
  created from upstream main and advanced to the #39 candidate.

## Publication constraints

Read `ops/orchard-runtime/PUBLISHING.md` and its linked runtime procedure.
Obtain credentials only through the authorized encrypted local handoff, validate
refresh, and retain single-writer ownership. Never record tokens in this file.

IndigoForge completed the Studio 0.9.1 deployment and explicitly handed off the
clean primary checkout at `d2f290fb` on PR #41. All Studio reservations are released.
The reviewed Studio 0.9.1 artifact is
`/home/toby/.local/state/orchard-release/studio-feedback-20260921/output-checked`
with entry `index-CpnebIh7.js`.
The actual full-schema comparison rejects the routine lane: candidate adds village
order progress, crop composted and resource fruit-ready fields. Use the guarded
`schema-only` migration lane with backup and restore rehearsal. The reviewed
Studio source snapshot's generated public API exactly matches the candidate.
The migration preservation option is being validated on #42; it pins installed
bytes against `output-checked` and validates `source-checked/source-manifest.json`,
the UI-kit guard and generated public API before downtime.
Earlier preservation requirement is superseded by the owner’s all-PR approval.
Rebuild integrated Studio through the guarded lane and retain its prior artifact.

Determine full live/candidate schema equality, prepare the reviewed content and
saved-map upgrades, retain rollback evidence, and pass same-identity reconnect
and live route/lamp acceptance before declaring the release complete.

The old `/dev/shm/orchard-pr18-rejoin.json` failed refresh; do not reuse it.
The owner-requested account is now signed-in verified with an active Content
Editor grant, confirmed by an authenticated own-grant query after the owner
committed it in Studio. See `docs/agent-development-account.md` for safe reuse.
RubyBay owns refresh of `/dev/shm/orchard-agent-town-rejoin.json`; the browser was
cleared and navigated away to prevent competing refresh. Refresh succeeds.
Private release evidence is under
`/home/toby/.local/state/orchard-release/town-20260921-rubybay`.

Repaired stack heads: #39 c1072537, #40 422afa48, #42 80d2c6bb before the account
and migration-preservation follow-up. Check current GitHub heads and all CI before
merging. Remaining work: content/live-map capture and reviewed town upgrade,
exact candidate checks, guarded schema-only release, route/lamp and reconnect
acceptance, and final evidence. Never claim these remaining steps completed.

Follow-up validation: all 90 exhaustive tests pass on the final town candidate;
17 release continuity/helper tests and release typecheck pass. Installed Studio
preservation and reviewed-source manifest checks pass against the handed-off
artifacts. A separate read-only agent review found no blocking preservation issue.
Content candidate starts at live revision 14 and updates 56 definitions to hash
`2f704947`; digest `b946603a3e9318f3032232019a4474aab0ac50790380178ec4fc3e2e951b15ea`.
Live map is revision 5/hash `38ce9f5e`. Its current-parser export adds only the
inferred `soil.watered` role to 18 farm landmarks; a comparison verified all other
fields and collection members are preserved. The raw capture and normalization
report are retained privately. Town-map upgrade verification remains in progress.

## Follow-up gates and owner handoff

The completed map candidate is private at
`town-20260921-rubybay/map-candidate/map.json` under the evidence root above:
revision 6, SHA256 `78d2ad5275a4e03e76168894e2d039ff2c7ac402610c3f13b3d6736ba6f4e394`,
39,954 cells, 201 prefabs and 2,100 objects, zero unapproved assets. The original
published baseline was recovered from `output/doc60/map-candidate-live-r4-v3`
(SHA256 `ef53c93da32b0eabcae33477317effeb1f49c6b53e81dfa96cec69b96ace087b`).
The unmodified baseline passed town cell/object/prefab/transition checks. Eleven
retained shared prefab definitions match that baseline exactly; only their asset
registry references were updated, recorded privately. Export then passes and an
independent comparison verifies every terrain cell and object outside town is
unchanged. Publication still requires occupancy/asset/live-CAS and route checks.

`publishLiveMapDocument` requires a world owner. Content Editor alone cannot
publish this map. The previous persistent owner reconnect file fails refresh
HTTP 400. A fresh encrypted owner handoff is pending user action via
`python3 /home/toby/.local/state/orchard-agent/store-owner-handoff.py`.
It prints a same-origin Studio encryption snippet and accepts only its ciphertext
at a hidden prompt. The temporary RSA key is private in `/dev/shm/orchard-town-owner`;
success writes `/dev/shm/orchard-town-owner-rejoin.json` and deletes the key. Do not
claim owner verification until guarded refresh and own-membership checks pass.

PR40 had one passing CI run and one failing selection-inspection 50ms budget
under coverage (66ms). The nine-test suite passes without coverage in 3.95s and
has been added to the unchanged-budget serial lane across all three PRs. Fresh
CI is required on the updated heads. A fresh full local check is running with
restored licensed art; log `/tmp/orchard-town-headwaters-check-verified.log`.
No PR has been merged, no service stopped, and no production module/content/map
has been published by RubyBay. Keep PR41 excluded and preserve its deployed UI.
