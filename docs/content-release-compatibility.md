# Historical content compatibility repair

## Problem and contract

The revision-9 live pack uses older mount, space and upgrade fields. The current
parser rejects those fields before capture or prior-candidate parsing can prepare
an upgrade. The game connection itself succeeds; the recovery overlay mislabels
invalid content as reconnection.

Historical captures and prior approved artifacts must retain their original JSON.
Verify row identities, unique IDs, row hashes, full-pack hash and definition count
without applying today's game semantics. Prior artifacts still require an exact
SHA-256, private ownership, immutable mode and a structurally consistent additive
change set. Only the prior-artifact read path uses historical candidate parsing.

Candidate preparation, normal candidate parsing and publication verification must
validate the target and complete merged result against today's runtime. Retain
three-way conflict detection, live-only definitions, zero deletion and content-head
compare-and-swap. Invalid retained custom content blocks release for explicit
resolution; never silently drop it. New and resulting content retain strict server-side validation.

## Evidence and rollout

Offline preparation from the actual approved Sep10 artifact succeeds: revision 9,
843 definitions, 471 upserts, 896 resulting definitions, hash `34de4fe6`. This
reconstructs the archived result, not a fresh capture of today's live database.
Fresh authenticated capture and conflict review remain mandatory before release.

Regression coverage checks obsolete upgrade fields, prior-candidate parsing,
strict candidate validation, corruption, truncation, identity mismatch, conflicting
live edits and unsupported retained custom content. The client now displays
CONTENT UPDATE REQUIRED for content_registry_invalid.

Release through the existing schema-only workflow with backup/rehearsal and
same-player reconnect validation. The restored compatible client remains live
until module, content and client can be deployed together. Studio's reviewed
renderer guard remains unchanged.

## Handoff

Branch: `fix/content-release-legacy-capture`, based on merged integration
`88931047`. No production publication occurred during this repair. The main
checkout's compatible client remains served; this branch's builds use the isolated
integration checkout. Original local Git instructions and skill installation are
untouched. The remaining deployment step needs a fresh authenticated capture and
the existing guarded schema migration/reconnect workflow, not a standalone client
replacement. Existing authorization to deploy the gameplay release remains valid.

## Hosted CI portability

CI builds the generated atlas before tests and installs ripgrep explicitly. Release
dry-runs resolve the checkout containing their script; non-dry runs still require
the canonical production directory. Program hashing uses pinned `@noble/hashes`
Keccak-256 instead of depending on the host OpenSSL algorithm list. SHA3-256 is
not an interchangeable substitute. Empty and nonempty known vectors are tested.

GitHub does not receive original licensed vendor sheets. Its explicit
`ORCHARD_TEST_LICENSED_ART=0` mode runs a fingerprint regression over 1,008 reviewed
imports, including pixels, provenance and placement metadata. Eight original-sheet
files and one plain-icon pixel test are reserved for the full local release gate;
all other icon/import tests remain active in CI. Default `npm run check` includes
these original-sheet tests. Refreshing reviewed fingerprints requires passing them
on the licensed host; hashes cannot establish correctness of new artwork alone.

Coverage, the two explicitly timed simulation fixtures, and Studio terrain
initialization fixtures allow instrumentation overhead; assertions and coverage thresholds remain unchanged. GitHub actions use Node-24-compatible
checkout/setup-node versions. Generated assets and licensed source sheets remain
untracked.

## Refresh checkpoint repair

The authenticated preflight exposed a second issue: a successful OIDC rotation
was discarded when the subsequent signing-key request timed out. The release
credential store now checkpoints the replacement refresh token before validation,
with no identity token in that intermediate record. Signature and issuer/audience/
expiry checks must succeed before the usable identity token is saved or returned.
A failed check releases the lock and permits retry with the replacement refresh
token; content capture refuses the tokenless intermediate record. Regression
coverage exercises failure, durable recovery, and withholding unverified tokens.

Hosted validation on commit 77edbb62 passed in the push run (820 files, 4,633
tests), while the slower PR runner hit one remaining hard-coded 20-second Studio
terrain timeout. Studio's generation fixtures now have a fixed 120-second deadline;
terrain equality and the separate 5ms cache-hit performance assertion are unchanged.

A worker-level probe confirmed that Vitest does not forward the parent CLI's
`--coverage` argument in worker `process.argv`. The Studio deadlines therefore
use literal 120-second values, as the simulation fixtures do. No test-body
assertion or coverage threshold changes.

## Server recovery path

The server had the same ordering defect: connection initialization and content
publication both loaded the incompatible pack before an editor could replace it.
Existing authenticated owners/admins or explicitly granted editors may now open
a recovery connection after historical row identities, counts, revisions and
fingerprints pass. These connections skip player/gameplay-session initialization. A minimal
connection-notice marker isolates their disconnect cleanup and blocks gameplay
heartbeats; normal expired-session cleanup remains intact. Normal connections and gameplay
content reads keep strict runtime parsing; membership and grant checks are
unchanged. No new RPC, table, bootstrap fallback or role is introduced.

Publication authenticates the editor and verifies historical byte integrity before
planning its transaction. The full resulting registry, CAS, idempotency, inverse
history and audit remain mandatory. Corruption does not qualify as compatibility.
Once the new pack is published, ordinary reconnect initialization resumes.

## Exhaustive test execution

The complete hosted run at f0995034 exposed coverage-profiler overhead in the
196,608-cell procedural sweep and the whole-world plateau check: they exceeded
their existing 600-second and 30-second limits. `npm test` now requires both
`test:coverage` and `test:exhaustive`. The latter runs the unchanged procedural
terrain and survival-world files serially without coverage profiling. All 51
tests remain mandatory; their deadlines and geographic coverage are unchanged.
The remaining suites still measure every simulation source file and enforce the
existing line/function/statement/branch thresholds. The two exhaustive files are
excluded only from that profiling pass, not from the full test gate.

The cooking source gate also reuses its parsed world module within each check
and parses other files only when they contain a protected table name. Existing
AST-based write checks still distinguish executable mutations from inert text.
