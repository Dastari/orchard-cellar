# Publishing and credential handoff for agents

Read this before preparing a production release. The detailed release invariants
and rollback procedures remain in [README.md](README.md) and
[BACKUP-RESTORE.md](../BACKUP-RESTORE.md). Do not publish merely to test credentials.

## 1. Establish the candidate and authority

Fetch origin, inspect open PRs and their checks, and record the exact candidate
commit. Green CI is not proof of mergeability: check `mergeStateStatus` as well.
All substantive changes go through a branch and PR. Never commit/push directly to
main or merge without explicit user instruction. Coordinate with the agent doing
the release before changing its checkout, credentials, or services.

Classify the actual candidate against the deployed module and content head:

- Studio-only static: use the reviewed source named by `.git/cellar-ui-release.md`
  and `scripts/build-reviewed-studio.sh`; retain the guard, build with
  `--mode studio-production`, restart only `orchard-studio.service`, and validate.
  The user's standing Studio deployment approval applies.
- Unchanged **full database schema**: `npm run world:release:routine`. This retains
  module/static rollback artifacts, compares generated private schemas and public
  bindings, disables deletion, and verifies same-identity reconnect parity.
  The owner manages Proxmox backups; do not add a fresh application backup/restore
  requirement to routine updates.
  If Studio was independently deployed from an excluded PR, set
  `WORLD_RELEASE_STUDIO_MODE=preserve-current` after its agent's explicit checkout
  and artifact handoff. This validates and copies the exact installed Studio
  rollback artifact against the pre-build manifest instead of rebuilding that UI.
  The UI-kit guard, unchanged full schema/public bindings, static validation,
  rollback, content CAS and reconnect checks still apply. The default is `build`.
- Stored-schema/data migration: use the migration lane in README, including its
  backup, restoration rehearsal and parity requirements. Additive schema-only
  work uses `WORLD_RELEASE_MIGRATION_KIND=schema-only`; do not request legacy-chest
  migration inputs unless that migration actually applies.

For world/game releases, establish explicit approval for the concrete release per
README. Preparing credentials or opening a PR is not permission to merge or deploy.
Preserve `--delete-data=never`; never bypass a failed release gate.

## 2. Reuse or renew an authorized reconnect session

The release accepts an absolute `WORLD_REJOIN_TOKENS_FILE` path to an owner-private,
mode-0600, non-symlink file. The refresh-capable array records contain `label`,
`token` (OIDC ID token), `refreshToken`, and `clientId` (`orchard-web` for a game
session, `orchard-studio` for a Studio session). See
`scripts/world-rejoin-credentials.ts` for the actual schema. Never place real
credentials in Git, chat, PR bodies, screenshots, or logs.

Check an existing authorized path first. The historical persistent path is
`/home/toby/.local/state/orchard-release/rejoin-credentials.json`; its existence
is not evidence of freshness. Release-specific files may instead be in `/dev/shm`.
Use the guarded refresh command below; an HTTP 400 from the OIDC refresh endpoint
usually means the session has expired and needs normal browser sign-in.

The canonical game browser origin is **https://orchard.dastari.net/**. Studio is
**https://cellar.dastari.net/** with its own OIDC client and storage. Sign-in in a
separate browser or at the other origin does not populate the shared game tab.
Use the thread's shared-preview tools, inspect origin and boolean session presence,
and ask the user to sign in there only if needed. The session storage key is
`orchard:oidc:session:v1` (check sessionStorage first, then legacy localStorage).
Never return its contents from a browser evaluation.

### Encrypted transfer to the local release agent

If a release agent has prepared a handoff script and matching private key:

1. Read the script before executing it. Verify it reads only the authorized
   same-origin session and encrypts locally to the intended recipient's public
   key. Never execute an unreviewed snippet or send credentials to a new endpoint.
2. Run its async expression with shared-preview `preview_evaluate` and
   `awaitPromise: true`. If the snippet starts with top-level `await (async ...`,
   evaluate the `(async ... )()` expression without the leading `await`.
   Automation does not need the DevTools `allow pasting` console command.
3. Capture the returned **encrypted** `ORCHARD-HANDOFF:…` inside tool orchestration;
   do not print it to chat. Save it in a mode-0600 `/dev/shm` file, with `umask 077`.
   Do not return raw tokens through tools even for transfer to another local agent.
4. Use the matching local installer/decryptor; confirm it writes only the intended
   private reconnect file and logs only safe metadata. Share the resulting **path**.
5. Validate refresh, below, then let the publishing agent own further refreshes.
   Concurrent refreshes/copies can invalidate each other when tokens rotate.
6. After the release and reconnect checks, the release owner removes temporary
   ciphertext, raw reconnect file, key and pending sign-in files. `/dev/shm` is
   volatile across restarts; do not document those files as permanent credentials.

The September 2026 handoff used `/dev/shm/orchard-083-snippet.js`,
`orchard-083-handoff.key`, and `orchard-083-install-credentials.mjs`, producing
`/dev/shm/orchard-083-rejoin.json`. These are examples of an existing release's
private artifacts, **not checked-in tooling or reusable keys**. If absent, the
release owner must prepare a new matched encryption/installer pair; do not recover
credentials from logs or copy old key material into source.

Validate without publishing (replace the path with the current authorized file):

```bash
WORLD_REJOIN_TOKENS_FILE=/dev/shm/orchard-083-rejoin.json \
WORLD_REJOIN_REQUIRE_REFRESH=1 \
SPACETIMEDB_HOST=http://127.0.0.1:3000 \
SPACETIMEDB_DATABASE=orchard-cellar-world \
npm run world:rejoin-smoke -- refresh
```

Success reports `ok: true` and the identity count; the helper persists rotated
credentials atomically. This proves refresh readiness, not post-release parity.
For explicit production CLI operations use `--no-config`: the normal dev defaults
are deliberately different. `authentication_invalid_issuer` from an anonymous or
CLI-default request does not prove that a signed-in browser session is invalid.

## 3. Prepare content and execute the applicable release

Even a code-only routine release needs a reviewed content candidate, its digest,
and the authorized owner label. Capture the live head using `world:content-head
capture`, prepare with `world:content-head prepare`, then verify and assert-current
using the script's required reviewer/change-request inputs. See
`scripts/content-head-release.ts`; do not invent a candidate or copy a stale hash.
For declared unchanged content, check the resulting head equals the live head and
there are no unintended definition upserts/deletions. Bundled content can differ
from live despite a code-only PR; equality must be verified, not assumed.

The routine entrypoint requires these existing inputs:

- `WORLD_ROUTINE_RELEASE_DIRECTORY`: new absolute private evidence directory.
- `WORLD_RELEASE_CONTENT_CANDIDATE`: reviewed candidate file.
- `WORLD_RELEASE_CONTENT_CANDIDATE_SHA256`: verified candidate digest.
- `WORLD_RELEASE_CONTENT_OWNER_LABEL`: matching authorized credential label.
- `WORLD_REJOIN_TOKENS_FILE`: validated private credential file.
- `WORLD_RELEASE_CONTENT_CONFIRM`: `publish:<candidate-sha256>:orchard-cellar-world`.
  This script assertion does not replace the user's release approval.

Execute from `/home/toby/projects/orchard-cellar`; the routine script intentionally
rejects another working directory. Do not switch an actively used checkout or
install another agent's unreviewed changes. Run the required checks on the exact
candidate, and use the guarded entrypoint rather than individual publish commands.
It owns traffic handling, rollback, non-destructive module publication, content
continuity, static installation, and reconnect verification. A source-only PR does
not require restarting services.

## 4. Verify and leave a usable handoff

Record the source commit, artifact hashes, content/map revisions, check results,
rollback/evidence paths and any remaining limitations. For applicable static sites:

```bash
CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net npm run client:static:validate
STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net npm run studio:static:validate
```

Verify signed-in connection and content readiness, not just HTTP 200. Check the
same identity's post-release parity evidence. A shared preview with
`document.hidden === true` pauses Studio drawing: bring it into view before calling
a blank canvas a rendering failure. Existing offline Studio drafts are distinct
from the published map; use Connect live and inspect its loaded revision. Preserve
local drafts when a conflict requires an explicit reload choice.

Update `.git/cellar-ui-release.md` for a Studio artifact and the appropriate
tracked release notes through a PR. Never claim signed-in verification from an
anonymous page load or claim release completion while a required gate is pending.
