# Orchard runtime services

Agent quick start: [Publishing and credential handoff](PUBLISHING.md).

The public NPM host forwards the game to `10.0.1.150:5173`. The production frontend
is a checked static Vite build supervised by `orchard-frontend.service`; its preview
server proxies same-origin `/v1` HTTP and WebSocket traffic to the loopback-only
SpaceTimeDB host supervised by `orchard-world.service`. The unit refuses to start
without `packages/client/dist/index.html` and never builds or serves source on start.

Before any world module publish, create a new quiesced, owner-only archive with:

```bash
ops/orchard-runtime/bin/backup-world.sh \
  /home/toby/backups/orchard/$(date -u +%Y%m%dT%H%M%SZ)-pre-authoring-suite
```

The script refuses an existing or non-absolute destination, resolves the one canonical
data directory, stops only `orchard-world.service`, verifies the authority process has
exited, writes and verifies `SHA256SUMS`, and restarts the world even after an error.
It also writes a separately verified `rollback-artifacts.tar.gz`,
`ROLLBACK-SHA256SUMS`, and `DEPLOYED-PROGRAMS.sha256`. The bundle contains the exact
game and Studio static output, the installed world/frontend/Studio unit fragments and
drop-ins, the checked world build, its committed content pack, and its reproducible
source/build inputs. Local env
files, dependency trees, credentials, symlinks, hard-link members, and special files
are excluded. The data archive remains the authoritative pre-release world-module
recovery source: its control database maps the database to the content-addressed
program bytes listed in the inventory. Keep the resulting path and hashes in the
release evidence. These archives complement, but do not replace, the identity-scoped
`world:rejoin-smoke` capture/verify gate.

The guarded release captures rollback artifacts before any build can overwrite the
currently served `dist` directories, then supplies that owner-only file to the
quiesced backup:

```bash
umask 077
rollback_stage=$(mktemp /tmp/orchard-pre-release-rollback.XXXXXX.tar.gz)
rm -- "$rollback_stage"
ops/orchard-runtime/bin/package-rollback-artifacts.sh "$rollback_stage"
WORLD_ROLLBACK_ARTIFACTS_FILE="$rollback_stage" \
  ops/orchard-runtime/bin/backup-world.sh /absolute/new-backup-directory
```

`WORLD_ROLLBACK_ARTIFACTS_FILE` must be an absolute, non-symlink, mode-`0600`
archive. The backup copies it; the staging copy can be removed only after the backup
has verified its safe paths, member types, required files, and internal hashes.

Orchard Studio is a separate static Vite build. Its public NPM host forwards
`cellar.dastari.net` to `10.0.1.150:5174`; the supervised static preview
server proxies its same-origin `/v1` HTTP and WebSocket traffic to that same
loopback-only SpaceTimeDB process. Studio does not share the game service worker,
build, origin, OIDC client, or CSP.

Studio's reviewed source is now integrated in this repository: `packages/studio`
and `packages/ui/src/kit`. The independent production entry remains
`packages/studio/dist`; source is never served. The helper
`scripts/build-reviewed-studio.sh /absolute/new-workspace /absolute/new-output`
stages this repository's current source, shared assets and checked dependency lock.
It materializes shared public resources, runs the UI-kit guard and Studio typecheck,
builds with `--mode studio-production`, and verifies source manifests before/after.
The historical helper name remains for the guarded world-release callers; it no
longer reads a separate reviewed checkout or overlays different source versions.

Studio-only updates build/install only this frontend and restart only
`orchard-studio.service`. Coordinated releases can still stage it alongside the
game. Keep a verified prior artifact and retain hashed assets needed by open tabs.
The source integration requires no database migration or content publication.

For an additive schema update that does not migrate legacy chests, set
`WORLD_RELEASE_MIGRATION_KIND=schema-only`. This keeps the verified fresh backup,
isolated production-row restore, no-delete module publication, content CAS, and
durable reconnect comparison. It skips chest backfill, phase changes, and draining.
The existing `WORLD_RELEASE_PRE_DRAIN_SNAPSHOT` and
`WORLD_RELEASE_POST_DRAIN_SNAPSHOT` paths hold the restored candidate's first and
second reconnect snapshots in this mode; their names are retained for compatibility.
The default `legacy-chests` mode retains the original two-stage chest rehearsal.
Choose the mode from the actual live/candidate stored schema and intended data
changes, not from the size of the working-tree diff or an unrelated Studio guard.

### Lifecycle code checks and release approval

Lifecycle callbacks use the normal repository workflow: edit the bounded source,
run `lifecycle:verify` and `lifecycle:build` with its source path and generated output
directory, then run `lifecycle:integrity`, typechecks, tests, and the checked world
build. Generated server code, client metadata, and provenance retain their source
digest for reproducibility. There is no separate candidate service or approval
artifact workflow.

Before each production release, show the user the concrete release scope and gate
results and wait for their explicit “go” in chat for that specific release. The
policy change itself is not permission to release, and approval for an earlier
release does not authorize a later one. This is an operational instruction; do not
invent a token, environment flag, signature, or receipt to stand in for the user's
message. Advance chat approval is valid only for the specified release. If a
required publication, rollback, parity or reconnect check fails, stop and report
the failure; “go” never waives the data-preservation invariant.

**Routine-update policy, 2026-09-05:** the owner will manage Proxmox backups.
Agents are not to set up application backups or require a fresh application
backup and restoration rehearsal for each routine code or UI update. Routine
updates still require checked code rollback, non-destructive publication and
same-identity reconnect checks. This does not claim host backups are configured
or verified. Actual stored-data migrations retain the fresh verified backup,
isolated restoration rehearsal, content-head continuity and state-parity gates
in the migration workflows below; historical backup and release records remain
unchanged.

Use `npm run world:release:routine` for updates with an unchanged full database
schema. It runs the normal tests without coverage, pins the original database
identity and current module bytes, retains checked code/static rollback artifacts,
publishes the reviewed module and content head with deletion disabled, and verifies
same-player state after reconnect. Set `WORLD_ROUTINE_RELEASE_DIRECTORY` to a new
private evidence directory and supply the existing content-candidate, owner-label
and rejoin-credential inputs. A schema difference routes the change to the full
migration workflow below; this command never runs chest retirement or drains rows.

Install or refresh the units with:

```bash
sudo install -m 0644 ops/orchard-runtime/systemd/orchard-world.service /etc/systemd/system/
sudo install -m 0644 ops/orchard-runtime/systemd/orchard-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now orchard-world.service
curl -fsS http://127.0.0.1:3000/v1/ping
# Publish only after the user explicitly says go for this release in chat,
# all repository gates pass, and backup/content-head/snapshot variables are set.
npm run world:release
install -m 0600 ops/orchard-runtime/orchard-client.env.example .env.client-production.local
npm run build -w @orchard/client -- --mode client-production
test -r packages/client/dist/index.html
sudo systemctl enable --now orchard-frontend.service
```

`world:dev` and the project CLI default use the separate `orchard-cellar-dev`
database. Named development variants must use `orchard-cellar-dev-*`; production
target overrides are rejected. `npm run dev` connects its client to that same
development database. The workspace `publish:local` alias invokes the guarded
production release instead of directly publishing a module.

Publishing and building are deliberately separate from starting the durable host. Module
updates must be built, checked, backed up, and explicitly published without
`--delete-data`. Both services use `Restart=always` and start at boot. Inspect
their logs with `journalctl -u orchard-world -u orchard-frontend`.

Validate the checked game artifact and repository service definition without contacting
the public host:

```bash
CLIENT_STATIC_DRY_RUN=true npm run client:static:validate
```

After installing or refreshing the unit, validate the canonical public game route and
same-origin SpaceTimeDB proxy:

```bash
CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net npm run client:static:validate
```

The validator rejects Vite development clients, `/src/` and `/@fs/` source paths,
TypeScript module entry points, non-hashed client entry scripts, a source-serving unit,
or any public origin other than the canonical HTTPS game origin. This catches an old
development process or stale Vite module graph before the game is returned to players.
The guarded world release always builds the game with `--mode client-production`, builds
Studio with `--mode studio-production`, and validates both static artifacts before it
stops traffic. It repeats both builds after binding generation, then resolves each
unit's loaded `FragmentPath` with `systemctl show` for one final installed-unit
validation before restoring traffic. A repository unit that differs from the installed
service therefore cannot silently return a development server to players.

### Chunk runtime mode and activation (static world S4a)

`VITE_CHUNK_RUNTIME_MODE` is `off` (the default), `shadow` or `on`. Every client build
except `--mode chunk-runtime-preview` is a production build and refuses `on` unless the
committed `CHUNK_RUNTIME_ACTIVATION_RELEASE` in `packages/client/src/chunk-shadow-build-gate.ts`
(null until the S5c activation release) equals `ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE`
in the build environment. `npm run client:chunks:check` and `client:static:validate` reject a
`dist` whose `chunk-runtime-audit.json` is an unapproved `on` build. The preview mode writes
`packages/client/dist-chunk-preview`, never `dist`, and is only served by an explicit
`vite preview --mode chunk-runtime-preview` on a separate port.

Once S5c sets the committed release constant, a leftover
`ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE` in the environment makes every later `off` or
`shadow` build fail with `chunk_runtime_activation_release_mismatch`. Unset it once the
activation build is done.

### World chunk blobs (`/world/`)

The static-world client fetches content-addressed chunk blobs from
`/world/<spaceId>/<sha256>.bin` (`chunkBlobPath` in `packages/sim/src/chunk-runtime.ts`).
They are not build output: `vite build` empties `packages/client/dist` on every
build, so the blobs live in a persistent directory named by `ORCHARD_WORLD_CHUNK_DIR`
and are served by the `orchard-world-chunk-serving` plugin
(`packages/client/world-chunk-serving.ts`) in both `vite preview` and `vite dev`.

- **Unset (the default) serves nothing.** Every `/world/` request is a `404`, so
  releases without the variable behave as before. A relative path is also rejected
  (a warning is logged and every blob is a 404). An absolute directory that is
  missing or unreadable at startup stays configured, so blobs appear once it is
  created, but one warning is logged when the server starts. The recommended production value is
  `/home/toby/.local/share/orchard/world-chunks`: it is persistent, owned by the
  service user, and outside the checkout, so builds, `git clean` and worktree changes
  cannot remove it.
- **Layout.** `<dir>/<spaceId>/<hash>.bin`, with optional precompressed siblings
  `<hash>.bin.br` and `<hash>.bin.gz` that must be compressed from that same file.
  Blob files are opened with `O_NOFOLLOW | O_NONBLOCK` and served only if they are
  regular files. A symlink as the final `.bin` (or sibling) component is treated as
  missing, and so is a FIFO or device. A symlinked root or `<spaceId>` directory is
  followed. The identity `.bin` must exist for any variant to be served.
- **Installing blobs.** The S5b pipeline (`scripts/world-chunks-publish.ts`, not yet
  written) will materialise and verify each blob, write it and its siblings, and
  then publish the heads. Blobs are immutable and addressed by hash, so installing
  is additive: never rewrite or delete a published blob during a release (open tabs
  and rollback may still need it). The blobs can be regenerated from the world
  database, so they are not part of the world backup.
- **Responses.** Only the exact address shape is served (decimal space id without
  leading zeros, 64 lowercase hex, `.bin`, no query string); everything else under
  `/world/` is a `404` and never falls back to the SPA `index.html`. `GET` and `HEAD`
  return `Content-Type: application/octet-stream`,
  `Cache-Control: public, max-age=31536000, immutable`, `Vary: Accept-Encoding`,
  `X-Content-Type-Options: nosniff` and an ETag of the hash (`"<hash>"`, or
  `"<hash>-br"`/`"<hash>-gzip"` for a compressed variant). `If-None-Match` returns
  `304` only when it matches the tag of the representation that would be sent. The
  best sibling the client accepts is chosen (`br` ahead of `gzip` when their
  q-values are equal), with `Content-Encoding` set; otherwise the identity bytes are
  sent. `identity;q=0` is ignored, so identity is still sent as the last resort.
  Misses are `404` and errors are `500`, both with `Cache-Control: no-store` and
  without the blob's ETag, `Content-Encoding` or `Vary: Accept-Encoding`. Other methods get
  `405` with `Allow: GET, HEAD`. Range requests are not supported.
- **Service worker.** The PWA worker does not intercept `/world/`. The client's
  IndexedDB chunk cache is the only client-side cache.

Enabling the directory in production takes one line in `orchard-frontend.service`
(installed and repository copies), followed by `systemctl daemon-reload` and a
restart of the frontend only:

```ini
Environment=ORCHARD_WORLD_CHUNK_DIR=/home/toby/.local/share/orchard/world-chunks
```

Create the directory first as the service user (`install -d -m 0755
/home/toby/.local/share/orchard/world-chunks`). The unit's `PrivateTmp=true` means a
directory under `/tmp` would not be visible to the service.

Once heads are published, the public validator can also check every head over the
origin. It is off by default; enable it with a heads file listing one head per line
as `<spaceId> <contentHash> <byteLength>` (blank lines and `#` comments are ignored).
The file can come from the S5b pipeline or from `SELECT space_id, content_hash,
byte_length FROM world_chunk_head`:

```bash
CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net \
CLIENT_VALIDATE_WORLD_CHUNKS=1 \
CLIENT_VALIDATE_WORLD_CHUNK_HEADS=/absolute/path/heads.txt \
  npm run client:static:validate
```

For each head it fetches the blob with `curl --compressed` (capped at 1 MiB, the
client's blob limit, and 30 seconds per request), then checks:

- the blob is served as `application/octet-stream` with immutable caching;
- the decoded length equals `byteLength`;
- it has the `OCCHNK` envelope magic;
- `sha256(bytes[40:])` equals both the address hash and the digest embedded at
  bytes 8–40, which is how `world-chunk.ts` defines a chunk's content hash. The hash
  does not cover the whole file.

It also checks that a missing blob is a real `404`. It reports how many blobs were
served with each encoding, which shows whether Brotli survives the public reverse
proxy. With `CLIENT_STATIC_DRY_RUN=true` it only parses the heads file.

For a Tier-B rollout that migrates stored data, provide owner-only token, backup, and snapshot paths
and use the checked orchestrator rather than invoking `spacetime publish` directly:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
WORLD_RELEASE_BACKUP_DIRECTORY=/home/toby/backups/orchard/$(date -u +%Y%m%dT%H%M%SZ)-pre-release \
WORLD_RELEASE_PRE_DRAIN_SNAPSHOT=/secure/orchard-pre-drain-expected.json \
WORLD_RELEASE_POST_DRAIN_SNAPSHOT=/secure/orchard-post-drain-expected.json \
WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT=/secure/orchard-production-pre-drain.json \
npm run world:release
```

Backup compression, checksum verification, restore extraction, and isolated
rehearsal authorities inherit CPU nice level 15 plus idle I/O priority by default.
This keeps maintenance work behind the live services in the scheduler even when a
checksum process reports 100% of one core. Override only for a supervised window with
`WORLD_MAINTENANCE_NICE_LEVEL=0..19`.

The production target is intentionally not configurable: the release rejects any
`SPACETIMEDB_SERVER`, `SPACETIMEDB_HOST`, or `SPACETIMEDB_DATABASE` override that does
not equal `local`, `http://127.0.0.1:3000`, and `orchard-cellar-world` respectively,
and publication uses the canonical loopback URL directly. After repository gates pass,
the script records a deterministic SHA-256 manifest of all repository-owned world and
simulation module inputs. The isolated publish/migration and production
publish/migration each verify that manifest immediately before mutation; an edit made
during the release fails closed. The fresh release backup leaves the world authority
stopped through the potentially long isolated rehearsal. It is started only when the
production authority is needed, immediately before the pinned production publish.
Production stops at verified `placeable_reads` and reopens with legacy rows retained;
run authenticated visual/two-client acceptance before the separately documented
`npm run world:release:finalize` drain in `ops/BACKUP-RESTORE.md`.

Historical cooking jobs remain private escrow in their original table. Their
presence does not block a compatible release: the cooking gate verifies retained
schema and authored collection/cancellation capability with regression fixtures,
while authenticated rejoin parity preserves the original job fields. It does not
claim a global empty table or authorize deleting jobs. Collection uses the saved
output and deadline; cancellation must still refund the saved input after moving
away or losing the fire. Inventory-full failures retain the batch. Follow the
restored-state and reconnect checks in `ops/BACKUP-RESTORE.md`; escrow retirement
is a separate operation requiring verified zero remaining jobs.

Finalization requires fresh paths because its backup is taken after acceptance. The
isolated finalization rehearsal restores the already-deployed module from that backup
and never publishes the mutable checkout:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
WORLD_FINALIZE_BACKUP_DIRECTORY=/home/toby/backups/orchard/$(date -u +%Y%m%dT%H%M%SZ)-pre-drain \
WORLD_FINALIZE_PRE_DRAIN_SNAPSHOT=/secure/finalize-pre-expected.json \
WORLD_FINALIZE_POST_DRAIN_SNAPSHOT=/secure/finalize-post-expected.json \
WORLD_FINALIZE_PRODUCTION_PRE_DRAIN_SNAPSHOT=/secure/finalize-pre-actual.json \
WORLD_FINALIZE_PRODUCTION_POST_DRAIN_SNAPSHOT=/secure/finalize-post-actual.json \
npm run world:release:finalize
```

Once that finalizer has reached verified `drop_ready`, legacy source removal is a
third guarded maintenance operation. The command below remains intentionally unusable
until a separate checkout and its freshly generated bindings are genuinely generic-only.
Prepare that checkout first with
`scripts/prepare-chest-retirement-candidate.sh /absolute/candidate /absolute/new-manifest`;
the preparation is local-only and rejects nested world adapters and direct browser
calls to legacy reducers as well as schema/binding remnants:

```bash
WORLD_REJOIN_TOKENS_FILE=/secure/orchard-rejoin-tokens.json \
WORLD_RETIREMENT_CANDIDATE_REPOSITORY=/absolute/generic-only-candidate \
CHEST_MIGRATION_OWNER_LABEL=owner \
WORLD_RETIREMENT_BACKUP_DIRECTORY=/home/toby/backups/orchard/$(date -u +%Y%m%dT%H%M%SZ)-pre-retirement \
WORLD_RETIREMENT_REHEARSAL_PRE_SNAPSHOT=/secure/retirement-rehearsal-pre.json \
WORLD_RETIREMENT_REHEARSAL_POST_SNAPSHOT=/secure/retirement-rehearsal-post.json \
WORLD_RETIREMENT_PRODUCTION_PRE_SNAPSHOT=/secure/retirement-production-pre.json \
WORLD_RETIREMENT_PRODUCTION_POST_SNAPSHOT=/secure/retirement-production-post.json \
WORLD_RETIREMENT_CONFIRM=retire:orchard-cellar-world \
WORLD_RETIREMENT_PRODUCTION_CONFIRM=orchard-cellar-world \
npm run world:release:retire-chests
```

This wrapper creates another leave-stopped backup with rollback artifacts, rehearses
the no-delete empty-table removal from that exact backup, requires literal-zero
drop-readiness receipts on restored and live authorities, and compares v2 generic-only
snapshots for the same identities. It pins the candidate source and regenerates,
builds, and statically validates the bindings, game, and Studio around the production
publish. See `ops/BACKUP-RESTORE.md` for the failure-closed and evidence-retention rules.

For a release which can exceed the realm's five-minute ID-token lifetime, each
credential record must carry `label`, `clientId`, and `refreshToken`. The rejoin
checker refreshes before capture and verify and atomically persists Keycloak's
rotated token without logging it; see `ops/BACKUP-RESTORE.md` for the exact format.
Rotation is single-writer and incrementally checkpointed. Do not run two release,
migration, rejoin, or Stage-A processes against the same credential file, and do not
duplicate a rotating refresh token into a second file.

The deployed module must already expose the additive `ownPlayerSpawn` continuity
view. The one-time bridge for an older deployment therefore requires the separately
documented quiesced backup and additive no-delete publish before this orchestrator can
capture; a missing view is a hard failure, not a reason to skip the check.

## Orchard Studio repository deployment inputs

The repository contains no credential or token. All `VITE_*` values become public
browser code. Prepare the ignored, mode-`0600` build environment and build the static
site before installing or restarting its unit:

```bash
install -m 0600 ops/orchard-runtime/orchard-studio.env.example .env.studio-production.local
npm run assets:build
npm run studio:build -- --mode studio-production
test -r packages/studio/dist/index.html
sudo install -m 0644 ops/orchard-runtime/systemd/orchard-studio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now orchard-studio.service
curl -fsS -H 'Host: cellar.dastari.net' http://10.0.1.150:5174/ >/dev/null
curl -fsS -H 'Host: cellar.dastari.net' http://10.0.1.150:5174/v1/ping
```

For an already running service, build with the staging helper into a new private
release directory first. Preserve and checksum the old `packages/studio/dist`,
run the helper's Studio checks, then use `world-release-routine.ts retain-assets`
to carry forward collision-checked old hashed chunks. Stop only
`orchard-studio.service`, install the checked output into `packages/studio/dist`,
restart it, and run the static/public validators below plus a browser check.
Restore the preserved artifact and restart if verification fails. Keep the game
service, game dist, authority and stored content unchanged during Studio-only work.

The unit deliberately refuses to start without `packages/studio/dist/index.html`.
It serves only the built output; it does not rebuild on startup. Repeat the checked
build and restart the unit for each Studio release. Vite's preview process is pinned
by the workspace lockfile and supplies the loopback `/v1` proxy for both HTTP and
WebSocket requests.

Validate the checked artifact and repository NPM fragment without touching services:

```bash
STUDIO_STATIC_DRY_RUN=true npm run studio:static:validate
```

After installation, validate the canonical public route, response headers, and the
same-origin authority proxy:

```bash
STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net npm run studio:static:validate
```

The validator rejects a source/dev-server unit, missing build artifact, a query-bearing
NPM log expression, missing rate limits, or missing CSP/security headers.

## Public proxy and OIDC rollout

**Live edge progress (2026-09-03):** after a quiesced NPM SQLite/Nginx backup, the
`cellar.dastari.net` proxy host and ECDSA Let's Encrypt certificate were created in NPM.
HAProxy's exact SNI allowlist was backed up, extended by that one name, validated, and
reloaded. The host forwards to `10.0.1.150:5174`, enables WebSockets, HTTP/2, forced
HTTPS and HSTS, and serves the reviewed limits, query-free log, and security headers.
Public TLS verifies successfully and the Studio upstream now serves HTTP 200. A
300-request concurrency probe returned 156 rate-limited HTTP 429 responses. NPM's
otherwise query-bearing generated host log was changed only for proxy host 33 to the
query-free `orchard_studio` format after backup
`/opt/nginx-proxy-manager/data/backups/orchard-studio-logfix-20260903T1836`; a
synthetic callback code appeared in neither active log. Re-run the checked
`npm/reconcile-studio-log.sh` after any NPM edit regenerates the host config. The
pre-change recovery source is
`/opt/nginx-proxy-manager/data/backups/orchard-studio-prechange-20260903T1600/` on the
NPM host, with the SNI file separately retained as
`/etc/gema/haproxy/gema-web-sni.lst.pre-orchard-studio-20260903T1601`. The verified
post-change database, Nginx configuration, certificate material, SNI list, and checksum
manifest are in
`/opt/nginx-proxy-manager/data/backups/orchard-studio-verified-20260903T1606/`.

The remaining operator work is:

1. Retain the completed edge backups and re-run the query-free generated-log
   reconciler after any NPM proxy-host edit.
2. Back up Keycloak/PostgreSQL, reconcile the separate public `orchard-studio` client
   from `ops/orchard-auth/realm/orchard-realm.json`, and prove that only the exact
   Studio callback and web origin are accepted. Never add a client secret, wildcard,
   game-origin callback, or localhost callback to this client.
3. Back up the SpaceTimeDB world, build and test the module with both
   `orchard-web` and `orchard-studio` audiences, capture the pre-change state with
   `npm run world:rejoin-smoke -- capture ...`, then publish without `--delete-data`.
   Before traffic resumes, verify the same saved identities with
   `npm run world:rejoin-smoke -- verify ...`; follow `ops/BACKUP-RESTORE.md`. The
   repository contains the additive `ownPlayerSpawn` projection and bindings, but the
   live module must be published non-destructively before capture; never bypass the
   gate when a stale deployment reports that the projection is missing.
4. Install the Studio unit, then in a clean browser verify CSP/security headers, exact
   OIDC redirect and logout,
   no callback parameters or tokens in logs, refresh/session revocation, anonymous
   denial before a live adapter is constructed, an authorized Studio connection, and
   game/Studio sessions in simultaneous tabs. Run the repository and secret-scan
   gates, then take and restore-test fresh off-machine backups.

Rollback removes only the new Studio proxy host/SNI entry and stops
`orchard-studio.service`; restore the validated NPM/HAProxy backups if needed. If the
new audience must be withdrawn, republish the last backed-up module policy and remove
only the `orchard-studio` Keycloak client after active Studio sessions are revoked.
Never open anonymous world access as a rollback mechanism.

## Active game frontend recovery — 2026-09-14

The game currently serves the compatible Sep10 artifact `index-CKcDWewg.js`, restored after the Sep11 frontend (`index-2602UFnc.js`) rejected the live revision9/843-definition content pack and left players on Reconnecting. The signed-in browser now reports connected/content-ready with no error. Only the frontend service was restarted; world/content/map/Studio were unchanged.

Both artifacts and checksums are retained in `/home/toby/.local/state/orchard-release/login-recovery-20260914`; incident evidence is `output/ops/login-recovery-20260914/report.json`. A fresh build from the newer source needs compatibility verification against actual live content and bindings before replacing this artifact. Restoring service does not publish the newer content or complete that migration.
