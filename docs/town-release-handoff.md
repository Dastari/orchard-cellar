# Approved town release — 2026-09-21

The owner approved merging and publishing PRs #39, #40 and #42, in stack order.
PR #41 is excluded. Publication must wait for IndigoForge's explicit primary
checkout and service handoff. RubyBay is the current release coordinator.

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
  Full coverage is still running; its earlier frame-budget failure is now assigned
  to the non-coverage lane without weakening the assertion.
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
Use the tested `WORLD_RELEASE_STUDIO_MODE=preserve-current` routine option to pin
and preserve the installed artifact, subject to full schema and public binding
equality. All existing release gates and the UI-kit guard remain required.
Do not merge #41 or silently replace the independently deployed Studio UI.

Determine full live/candidate schema equality, prepare the reviewed content and
saved-map upgrades, retain rollback evidence, and pass same-identity reconnect
and live route/lamp acceptance before declaring the release complete.

The existing `/dev/shm/orchard-pr18-rejoin.json` failed guarded refresh with HTTP
400; do not retry it as a valid session. The owner requested a permanent agent
development account. A private Playwright registration session is open, awaiting
the owner's chosen verification email. User-scoped `systemd-creds` encryption was
verified for durable credential storage; no account or password has been created.
