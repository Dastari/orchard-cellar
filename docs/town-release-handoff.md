# Approved town release — 2026-09-21

The owner approved merging and publishing PRs #39, #40 and #42, in stack order.
PR #41 is excluded. IndigoForge's explicit primary checkout and service handoff has been received. RubyBay is the current release coordinator.

## Current evidence

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
Do not merge #41 or silently replace the independently deployed Studio UI.

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
