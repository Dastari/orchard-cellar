# Orchard pre-auth backup and restore commands

The 2026-08-25 pre-change snapshot is permission-restricted at
`/home/toby/backups/orchard/2026-08-25-pre-oidc/`. It contains:

- `repository.bundle`: all committed refs;
- `worktree.patch`: tracked uncommitted changes as a binary patch;
- `worktree.tar.gz`: the working tree without Git, dependency/build, and coverage
  directories (it is mode `0600` because ignored local credentials may be present);
- `spacetime-data.tar.gz`: a quiesced copy of `.spacetime-data`.

The SHA-256 values printed at backup time are recorded in doc 24 acceptance evidence.
Re-run `sha256sum -c` from a separately stored manifest before restoring after any copy.

## Repository restore test

Restore into a new empty directory, never over the current checkout:

```bash
git clone /approved/backup/repository.bundle orchard-restore
git -C orchard-restore apply --check /approved/backup/worktree.patch
tar -C orchard-restore -xzf /approved/backup/worktree.tar.gz
npm ci --ignore-scripts
```

The tar archive is the full dirty-worktree recovery source; the patch is an independent
reviewable record of tracked changes. Keep both encrypted or on owner-only storage.

## SpaceTimeDB restore test

The archive was captured only after confirming no SpaceTimeDB process was running. For
a future production backup, discover and record the actual service manager first, stop
or quiesce it, and confirm the process has exited before archiving the data directory.
The checked backup wrapper archives every hard-linked directory entry as a regular file
so its output satisfies the restore guard's directories-and-regular-files-only policy.
New backups also contain a versioned, owner-only rollback set:

- `rollback-artifacts.tar.gz` contains the pre-build game and Studio `dist` trees,
  installed world/frontend/Studio unit fragments and drop-ins, and the captured world
  source/build inputs, including the committed `packages/assets/content` pack and
  SpaceTimeDB project configuration;
- `DEPLOYED-PROGRAMS.sha256` inventories the content-addressed module binaries already
  held in `spacetime-data.tar.gz`; the archived control database retains the exact
  active database-to-program mapping;
- `ROLLBACK-SHA256SUMS` protects both rollback records, while the bundle's
  `FILE-SHA256SUMS` protects every extracted file.

The packager selects only explicit repository paths and unit files. It never includes
local `.env` files, token files, dependency trees, or credentials, and refuses symbolic
links, inline unit credentials, and special files. Source hard links are materialized
as independent regular archive members. A versioned restore rehearsal requires this
set and validates both levels of checksums before starting an isolated authority;
older data-only backups remain rehearsal-compatible but do not claim static rollback
coverage.

The checked world backup and both restore-rehearsal wrappers lower their entire
process trees to CPU nice level 15 and idle I/O scheduling before hashing,
compression, extraction, or starting a disposable authority. This prevents the
multi-gigabyte archive work from competing at normal priority with the live host.
`WORLD_MAINTENANCE_NICE_LEVEL` may raise or lower that value within 0–19 for an
observed maintenance window; the default should remain in place during normal
operation. A visible 100% figure for `sha256sum` or `tar` then describes one
low-priority core, not priority over the live authority.

Restore into a new directory and bind a test-only loopback port:

```bash
install -d -m 0700 /srv/orchard-restore-test
tar -C /srv/orchard-restore-test -xzf /approved/backup/spacetime-data.tar.gz
spacetime start --listen-addr 127.0.0.1:3300 \
  --data-dir /srv/orchard-restore-test/.spacetime-data --non-interactive
```

To inspect or restore the matching pre-release application artifacts, first verify and
extract into a new owner-only directory, never directly over the live checkout:

```bash
cd /approved/backup/20260903T000000Z-pre-release
sha256sum -c SHA256SUMS
sha256sum -c ROLLBACK-SHA256SUMS
install -d -m 0700 /srv/orchard-rollback-review
tar -C /srv/orchard-rollback-review -xzf rollback-artifacts.tar.gz
cd /srv/orchard-rollback-review/rollback-artifacts
sha256sum -c FILE-SHA256SUMS
```

After review, copy the two captured `repository/packages/*/dist` trees back with their
normal ownership, install the three captured `fragment.service` files (and recorded
drop-ins) at the paths listed in `SERVICE-UNITS`, run `systemctl daemon-reload`, and run
the static validators before restarting traffic. Restoring `spacetime-data.tar.gz`
restores the matching deployed module mapping and program bytes together; do not
publish source merely to roll back a module.

In another shell, publish nothing and connect the two saved OIDC test identities to the
restored database through the test port. Verify identity, membership, private inventory,
world entities, positions, and clock before stopping the test host. Never point the
restore test at the live NPM route or overwrite the sole live data directory.

For the transitional chest release, the checked wrapper takes paths for new pre- and
post-drain expected snapshots; it does not accept a pre-schema capture. It verifies the one-file
checksum manifest, rejects absolute/traversal, link, and special-file archive entries,
extracts into a fresh owner-only `/tmp` directory, and starts a separate authority on
loopback port 3300. It publishes and migrates only that isolated restore before
capturing and reconnect-verifying both staged expectations. It never stops or
reconfigures the live service:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
WORLD_RESTORE_CONTENT_CANDIDATE=/secure/reviewed-content-candidate.json \
WORLD_RESTORE_CONTENT_CANDIDATE_SHA256=<printed-digest> \
WORLD_RESTORE_CONTENT_OWNER_LABEL=owner \
WORLD_RESTORE_CONTENT_CONFIRM=publish:<printed-digest>:orchard-cellar-world \
  npm run world:restore-rehearsal -- \
  /approved/backup/20260903T000000Z-pre-release \
  /secure/new-pre-drain-expected.json \
  /secure/new-post-drain-expected.json
```

Use `WORLD_RESTORE_REHEARSAL_PORT` only for another unprivileged, unused loopback
port; port 3000 is rejected. The wrapper emits separate bounded migration receipts beside
the backup, runs the exact rejoin parity verifier against the migrated restored
database, then stops the isolated process and removes its temporary copy.
To validate inputs and isolation without starting a process, set
`WORLD_RESTORE_REHEARSAL_DRY_RUN=true`.

The guarded release supplies a mode-`0600` deterministic source manifest to this
helper. The helper compares the current world/simulation build inputs with that pin
immediately before its isolated publish and each migration stage. A
standalone restore rehearsal may omit the manifest, but it is mandatory in the release
orchestrator so rehearsal and production cannot silently use different source trees.

## World continuity and rejoin gate

The release/restore acceptance check uses the same saved identities before and after
downtime and performs subscription reads only. Put their credentials in an owner-only
file. Long-running releases must use refresh-capable records of the form
`{"label":"...","clientId":"orchard-web","refreshToken":"..."}`. The checker
refreshes immediately before each capture, atomically replaces the file with the
rotated refresh token at mode `0600`, and never prints it. This is required because
the production realm rotates refresh tokens and its ID-token lifetime is shorter than
a full backup/rehearsal. The legacy label-to-token object and
`{"label":"...","token":"..."}` array remain supported only when the supplied
opaque token is independently long-lived. Never put this file in the repository.

```bash
umask 077
install -m 0600 /dev/null /secure/orchard-rejoin-tokens.json
# Populate /secure/orchard-rejoin-tokens.json without printing tokens to the terminal.
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
  SPACETIMEDB_HOST=http://127.0.0.1:3000 \
  npm run world:rejoin-smoke -- capture /secure/orchard-before-rejoin.json
```

Quiesce traffic, take and verify the backup, perform the additive publish without
`--delete-data`, and start the restored/upgraded authority. Then use the exact same
credential file and database name:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
  SPACETIMEDB_HOST=http://127.0.0.1:3300 \
  npm run world:rejoin-smoke -- verify /secure/orchard-before-rejoin.json \
  /secure/orchard-after-rejoin.json
```

The credential file and its atomic rotation replacement remain mode `0600`. The
capture is created exclusively with mode `0600` and never contains tokens. The
optional post-verify snapshot is also created exclusively with mode `0600`, making
both sides of the invariant comparison available as release evidence. The
credential helper admits exactly one rotating process through a same-directory
mode-`0600` lock and compares the file fingerprint before every atomic replacement.
Each successful identity refresh is fsynced before the next identity is attempted,
so a later refresh failure or handled interruption retains every replacement token
already issued. Never run release, migration, rejoin, or Stage-A commands concurrently
against the same file, and never copy one rotating refresh token into multiple files.
An unclean process death can leave `<credential-file>.lock`; fail closed, verify no
credential consumer is still running, preserve the owner-only file for diagnosis,
and remove only that exact stale lock before retrying. A provider response followed
by an uncatchable process or host failure before its checkpoint remains inherently
ambiguous and requires a fresh interactive login for that identity.

The gate fails closed on a missing binding/view or required singleton row, subscription
or authentication error, credential-label change, identity drift, or any canonical
durable-row mismatch. It covers inventory (including cursor and overflow), equipment,
appearance/profile, wallet/stats/survival/effects/statistics, recipes/quests/skills/
thought, homestead/upgrades/membership, position/spawn, owned generic placeables, every
owned placeable slot/damage row, and process state. Connection presence,
per-connection notices, the temporary legacy chest mirror, and in-flight container/
prediction/fishing/trade/dialogue/speech UI rows are explicitly excluded.

Pending historical cooking batches remain in the private `player_cooking_job`
table with its original schema. They are ingredient escrow: publication must not
clear, convert, reschedule, or recompute them. The cooking compatibility gate
checks the retained schema, authored claim callbacks, server adapter and claim
fixtures; it does not query a global empty-table count or claim to inventory every
player. Authenticated rejoin snapshots retain every `ownCookingJob` field exactly,
including its input/output kinds, quantity and start/ready ticks. A batch may
remain pending through release. Collection transfers its saved output only when
ready and its original fire is lit and reachable; cancellation returns its saved
input even when the player moved away or the fire disappeared. Full inventory
must leave escrow untouched, and successful resolution must be atomic and recorded.
Exercise both outcomes on disposable restored test state and verify the original
player's pending batch through reconnect before reopening. Retirement of this
escrow requires a separate verified zero-job gate; this release does not retire it.
The prospective merged content head must also preserve the recovery callbacks,
original station/landmark routes, saved item kinds and archived progression policy.
Checking only the repository bootstrap content cannot prove that a live content
override leaves those promises usable. Historical captures remain readable; this
compatibility requirement applies when preparing and verifying the new publication.
`player_public.online` and `lastActiveAtMicros` are presence projection fields. The
`own_stats.regen_tick` scheduler cursor advances with authority time even when all
resource values and fractional remainders are full and unchanged; only that cursor is
ignored, while attributes, health, mana, vigour, remainders, and `last_swing_tick`
remain exact. The
read-only reconnect act itself increments `connections_opened`, and may update
`world_entries` and `time_played`; exactly those three statistic subjects are ignored,
while every other statistic must match. A future authority-side quiesced snapshot can
remove that observer-effect exception.

The repository module now includes the additive caller-private `own_player_spawn`,
`own_placed_placeable_slots`, and `own_placed_placeable_damage` views and their
generated bindings. The live module must be backed up and published non-destructively
before capture; a stale live module or client fails closed on any missing required
view. Never bypass that check. Protect the snapshot
for the audit retention period, then remove it through the approved secure-data
disposal process.

### Staged chest unification

Chest unification is a two-maintenance-window release. Stage A publishes the transition,
backfills and verifies both representations, switches reads to unified placeables, and
then reopens game and Studio while every legacy row and mapping is retained:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
CHEST_MIGRATION_OWNER_LABEL=owner \
WORLD_RELEASE_BACKUP_DIRECTORY=/secure/new-release-backup \
WORLD_RELEASE_PRE_DRAIN_SNAPSHOT=/secure/new-pre-drain-expected.json \
WORLD_RELEASE_POST_DRAIN_SNAPSHOT=/secure/new-post-drain-expected.json \
WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT=/secure/new-production-pre-drain.json \
WORLD_RELEASE_CONTENT_CANDIDATE=/secure/reviewed-content-candidate.json \
WORLD_RELEASE_CONTENT_CANDIDATE_SHA256=<printed-digest> \
WORLD_RELEASE_CONTENT_OWNER_LABEL=owner \
WORLD_RELEASE_CONTENT_CONFIRM=publish:<printed-digest>:orchard-cellar-world \
scripts/world-release.sh
```

The script quiesces traffic and takes the backup first. Its restore helper then starts
a disposable loopback authority, publishes the transitional module to that restored
database with `--delete-data=never`, captures and reconnect-verifies the expected
`placeable_reads` state, then drains only the disposable copy and captures/verifies its
`drop_ready` expectation. Production publishes the identical module but stops at
`placeable_reads`, compares against the pre-drain expectation, and reopens traffic.
The pre- and post-drain migrations have separate receipts. A raw snapshot from the old
live schema is intentionally never used as the new-schema expectation.

While production remains at `placeable_reads`, run the authenticated visual,
two-client, reconnect, game-container, and Studio-container acceptance. Writes remain
dual-written and legacy rows remain available for rollback. Undo every disposable test
mutation, but do not assume the Stage-A snapshots remain current after real sessions.

Begin that window with the reusable read-only Stage-A harness. It requires a regular
mode-`0600` JSON credential file containing at least two refresh-capable entries with
distinct live identities. It refreshes and atomically rotates every credential, opens
both clients together, subscribes only the live map head, live content head and
definitions, generic chest placeables, and each caller's public profile/position, then
disconnects and repeats the same checks after reconnect:

```bash
STAGE_A_CREDENTIALS_FILE=/secure/orchard-stage-a-identities.json \
SPACETIMEDB_HOST=https://orchard.dastari.net \
npm run world:stage-a:acceptance -- /secure/orchard-stage-a-readonly-evidence.json
```

The output path must be new. The harness creates it at mode `0600` and writes only
SHA-256 hashes, counts, revisions, and timestamps—never tokens or raw identities. It
fails closed for stale bindings, a missing table or row, refresh/connection/subscription
failure, duplicate identities, a non-generic chest row, mismatched heads/chest
visibility, or reconnect drift. A passing read-only artifact deliberately leaves
`visualCanvasReview`, `mutableAdminAndUndo`, `contentPublishUseRollback`, and
`twoClientGameplayInteraction` as `not_run`; complete and record those separate
operator scenarios before treating Stage A as accepted.

Only after acceptance succeeds, run the separate finalizer. It stops traffic, takes a
fresh quiesced backup of the accepted `placeable_reads` state, and starts an isolated
copy using the exact deployed module bytes and database-to-program mapping in that
backup. This rehearsal explicitly performs no module publish and produces fresh
pre/post-drain expectations; it also requires the restored control row to begin at
`placeable_reads` rather than silently advancing an incomplete Stage A. The finalizer then starts live production, verifies the
fresh pre-drain expectation, drains to `drop_ready`, verifies the fresh post-drain
expectation, and only then reopens traffic:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
CHEST_MIGRATION_OWNER_LABEL=owner \
WORLD_FINALIZE_BACKUP_DIRECTORY=/secure/new-finalize-backup \
WORLD_FINALIZE_PRE_DRAIN_SNAPSHOT=/secure/new-finalize-pre-expected.json \
WORLD_FINALIZE_POST_DRAIN_SNAPSHOT=/secure/new-finalize-post-expected.json \
WORLD_FINALIZE_PRODUCTION_PRE_DRAIN_SNAPSHOT=/secure/new-finalize-pre-actual.json \
WORLD_FINALIZE_PRODUCTION_POST_DRAIN_SNAPSHOT=/secure/new-finalize-post-actual.json \
scripts/world-release-finalize.sh
```

Before downtime, the repository gates run first, then a deterministic manifest pins the
module source before the final world, bindings, game, and Studio production builds. The release backup's
explicit leave-stopped mode keeps `orchard-world.service` down while the isolated copy
is rehearsed, avoiding live tick drift after the snapshot. Ordinary direct invocations
of `backup-world.sh` still restart and health-check the authority by default. The
release restarts it only immediately before publishing to the fixed
`http://127.0.0.1:3000/orchard-cellar-world` target. Any later failure closes both web
routes. A failure before production publication restarts the unchanged authority but
keeps web traffic closed. Once production publication begins, any failure stops the
authority as well; it never auto-restarts a potentially partially published world.

### Reviewed content-head compatibility candidate

The module source can require newer bootstrap definitions than the durable live
content head. Do not reseed the table or replace it wholesale. First refresh the
private credentials, capture the complete public head and definition fingerprints,
then have an independent reviewer prepare an immutable additive candidate:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
CONTENT_HEAD_CAPTURE_LABEL=reviewer \
SPACETIMEDB_HOST=http://127.0.0.1:3000 \
npm run world:content-head -- capture /secure/live-content-capture.json

CONTENT_HEAD_REVIEWER=reviewer \
CONTENT_HEAD_CHANGE_REQUEST=ORCHARD-55-release \
npm run world:content-head -- prepare \
  /secure/live-content-capture.json /secure/reviewed-content-candidate.json
```

`capture` prints its SHA-256 and writes a new mode-0600 canonical artifact.
`prepare` prints the candidate SHA-256 and writes a new mode-0400 canonical
artifact. The first adoption without a prior candidate is allowed only from the
untouched revision-1 `bootstrap-content-v1` head. Later preparation must provide
the prior approved target and its recorded digest using
`CONTENT_HEAD_BASE_CANDIDATE` and `CONTENT_HEAD_BASE_CANDIDATE_SHA256`. This is a
three-way comparison: a target-owned definition that no longer matches the prior
approved target is a conflict, while unrelated live-only definitions and bootstrap
definitions removed from the repository are retained. The candidate format has no
delete operation. The complete resulting registry is validated before the artifact
is written.

Hand the candidate path and printed digest to a different owner credential. A real
Stage-A release now additionally requires:

```bash
WORLD_RELEASE_CONTENT_CANDIDATE=/secure/reviewed-content-candidate.json \
WORLD_RELEASE_CONTENT_CANDIDATE_SHA256=<printed-digest> \
WORLD_RELEASE_CONTENT_OWNER_LABEL=owner \
WORLD_RELEASE_CONTENT_CONFIRM=publish:<printed-digest>:orchard-cellar-world \
scripts/world-release.sh
```

The release verifies the artifact against the checked-out bootstrap, requires the
reviewer and owner labels to differ, and verifies the exact captured head before
builds and again after web traffic closes. The isolated restored database applies
the same `publishContentChangeSet` CAS before its rejoin expectation is captured.
Production applies it only after the no-delete module publish and before migration,
parity, rejoin, or traffic reopening. Any head/row fingerprint drift, custom edit to
a target-owned row, invalid merged registry, reducer rejection, or post-publish head
mismatch leaves the release closed. Content revision history is preserved because
the normal append-only reducer is the only write path.

The reviewer label in this repository artifact is a process separation gate, not a
cryptographic signature or external ticket lookup. Protect the capture, candidate,
recorded digests, and change-request record in owner-controlled storage. Lifecycle
code uses normal repository AST validation, deterministic generation, integrity
checks, typechecks, tests, and the checked world build. Before each production
release, present the specific changes and gate results and wait for the user's
explicit “go” in chat for that release. A policy decision or earlier release
approval does not provide that authorization. Do not replace the chat instruction
with an invented approval flag or artifact. The repository tool never deletes
definitions and does not infer whether a conflicting live edit is safe to overwrite.

Archive all Stage-A and finalizer pre/post migration JSONL files with their mode-0600
snapshots. These contain every status and exact verification/drain receipt. The
runner requires refresh-capable OIDC entries in the mode-0600 credential file,
refuses active chest sessions, validates exact legacy/mapping counts when stopping at
`placeable_reads`, and only succeeds at `drop_ready` with literal zero
legacy chest, slot, damage, mapping, and session rows. Any failed command leaves
traffic stopped for investigation; review the failure and receipts before retrying
the resumable phase sequence or explicitly restoring service. Do not remove the
legacy table declarations yet.
First publish the transition with `--delete-data=never`, complete/rejoin-verify this
sequence, and preserve its receipts. A later source revision may remove the empty
legacy declarations in a second `--delete-data=never` publish only after an operator
reviews those receipts. Never use `--delete-data` for either stage.

After the finalizer has completed and the separately reviewed source revision has
actually removed the legacy storage, mapping, session, views, reducers, and generated
bindings, use the dedicated retirement wrapper—not either earlier release command:

Keep that removal revision in a separate checkout; do not remove the drain reducers
from the transition checkout while production still reports `placeable_reads`. First
produce and pin its generated candidate without contacting an authority:

```bash
scripts/prepare-chest-retirement-candidate.sh \
  /secure/orchard-cellar-retired /secure/new-retired-source.manifest
```

The preparation gate scans every non-test world source file (including nested
behaviour adapters), freshly generated bindings, and direct client reducer calls. It
also builds both browser consumers. Any legacy storage, mapping, session, migration,
view, reducer, or generated binding keeps the candidate closed.

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
WORLD_RETIREMENT_CANDIDATE_REPOSITORY=/secure/orchard-cellar-retired \
CHEST_MIGRATION_OWNER_LABEL=owner \
WORLD_RETIREMENT_BACKUP_DIRECTORY=/secure/new-retirement-backup \
WORLD_RETIREMENT_REHEARSAL_PRE_SNAPSHOT=/secure/retirement-rehearsal-pre.json \
WORLD_RETIREMENT_REHEARSAL_POST_SNAPSHOT=/secure/retirement-rehearsal-post.json \
WORLD_RETIREMENT_PRODUCTION_PRE_SNAPSHOT=/secure/retirement-production-pre.json \
WORLD_RETIREMENT_PRODUCTION_POST_SNAPSHOT=/secure/retirement-production-post.json \
WORLD_RETIREMENT_CONFIRM=retire:orchard-cellar-world \
WORLD_RETIREMENT_PRODUCTION_CONFIRM=orchard-cellar-world \
npm run world:release:retire-chests
```

The wrapper refuses the live transition checkout as its candidate, a noncanonical endpoint, stale source/bindings, reused evidence
path, or non-0600 credentials. It builds and pins the candidate, packages rollback
artifacts, stops both web routes, and takes a fresh leave-stopped backup. Its separate
retirement restore helper boots only that backup's deployed transition program, calls
the retained status boundary to require `drop_ready` plus literal `"0"` chest, slot,
damage, mapping, legacy-session, and generic-session counts, captures a v2 generic-only
snapshot, publishes the pinned isolated candidate with `--delete-data=never`, proves the legacy
schema names disappeared, then reconnect-verifies the same identities. Production
must pass the identical status gate and match the restored pre-state before its own
no-delete publish, schema proof, second status receipt, and exact pre/post identity
comparison. Only after the database and parity proofs pass does it install the already
built candidate game/Studio static artifacts while traffic remains stopped. A failure after production publication begins stops the world authority;
all failures keep game and Studio traffic closed. Until the removal revision exists,
`scripts/assert-chest-retirement-source.sh` intentionally prevents a real run.

## Authentication and NPM

Keycloak/PostgreSQL isolated restore commands are implemented by
`orchard-auth/bin/restore-test.sh`; the NPM discovery, backup, and rollback procedure is
in `orchard-auth/README.md`. NPM paths and service/container names must be recorded from
the verified host rather than guessed.

## Rollback after a failed authoring/Studio release

Keep game and Studio traffic stopped if post-publish parity fails. Preserve the failed
authority data directory and logs as evidence; do not publish again, delete tables, or
reuse the backup directory. Stop `orchard-world.service`, move the failed data directory
to a timestamped owner-only quarantine path, extract the verified archive into the exact
canonical `.spacetime-data` path, restore its owner/mode, and start the service. Before
returning either frontend, run `world:rejoin-smoke verify` with the original snapshot
and credentials. If the old module cannot read an additive schema, restore and run the
backed-up matching binary/module policy; never use `--delete-data` as rollback.

Studio is independently recoverable: stop `orchard-studio.service`, restore the last
checked `packages/studio/dist` artifact, run `npm run studio:static:validate` against
the canonical HTTPS origin, then restart it. An edge rollback removes only the Studio
NPM proxy/SNI entry or restores its checksumed NPM/HAProxy backup; it never changes the
game route or world database. Record the archive checksum, quarantined path, parity
result, module revision, static artifact hash, and service restart times in the incident.
