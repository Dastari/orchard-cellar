#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: WORLD_REJOIN_TOKENS_FILE=/absolute/tokens.json \
       WORLD_RELEASE_BACKUP_DIRECTORY=/absolute/new-backup-directory \
       WORLD_RELEASE_PRE_DRAIN_SNAPSHOT=/absolute/new-pre-drain-expected.json \
       WORLD_RELEASE_POST_DRAIN_SNAPSHOT=/absolute/new-post-drain-expected.json \
       WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT=/absolute/new-production-pre-drain.json \
       WORLD_RELEASE_CONTENT_CANDIDATE=/absolute/reviewed-content-candidate.json \
       WORLD_RELEASE_CONTENT_CANDIDATE_SHA256=<64-lowercase-hex> \
       WORLD_RELEASE_CONTENT_OWNER_LABEL=<credential-label> \
       WORLD_RELEASE_CONTENT_CONFIRM=publish:<digest>:orchard-cellar-world \
       scripts/world-release.sh

WORLD_RELEASE_MIGRATION_KIND defaults to legacy-chests: rehearse both chest stages
on an isolated restore and stop production at verified placeable reads. Set
schema-only for an additive schema/content update with restored-row reconnect
verification and no chest backfill, phase changes, or draining.
USAGE
  exit 64
}

[[ $# -eq 0 ]] || usage
repository=/home/toby/projects/orchard-cellar
# Dry-runs inspect the checkout under test; live operations retain the fixed path.
if [[ "${WORLD_RELEASE_DRY_RUN:-false}" = true ]]; then
  repository=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
fi
[[ "$(pwd -P)" = "$repository" ]] || {
  printf 'Run this release from %s.\n' "$repository" >&2
  exit 64
}

token_file=${WORLD_REJOIN_TOKENS_FILE:-}
backup_directory=${WORLD_RELEASE_BACKUP_DIRECTORY:-}
pre_drain_snapshot=${WORLD_RELEASE_PRE_DRAIN_SNAPSHOT:-}
post_drain_snapshot=${WORLD_RELEASE_POST_DRAIN_SNAPSHOT:-}
production_pre_drain_snapshot=${WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT:-}
content_candidate=${WORLD_RELEASE_CONTENT_CANDIDATE:-}
content_candidate_sha256=${WORLD_RELEASE_CONTENT_CANDIDATE_SHA256:-}
content_owner_label=${WORLD_RELEASE_CONTENT_OWNER_LABEL:-}
content_release_confirm=${WORLD_RELEASE_CONTENT_CONFIRM:-}
canonical_server=local
canonical_database=orchard-cellar-world
canonical_host=http://127.0.0.1:3000
server=${SPACETIMEDB_SERVER:-$canonical_server}
database=${SPACETIMEDB_DATABASE:-$canonical_database}
host=${SPACETIMEDB_HOST:-$canonical_host}
rehearsal_port=${WORLD_RELEASE_REHEARSAL_PORT:-3300}
dry_run=${WORLD_RELEASE_DRY_RUN:-false}
migration_kind=${WORLD_RELEASE_MIGRATION_KIND:-legacy-chests}
[[ "$migration_kind" = legacy-chests || "$migration_kind" = schema-only ]] || usage
studio_mode=${WORLD_RELEASE_STUDIO_MODE:-build}
studio_reviewed_source=${WORLD_RELEASE_STUDIO_REVIEWED_SOURCE:-}
studio_reviewed_artifact=${WORLD_RELEASE_STUDIO_REVIEWED_ARTIFACT:-}
[[ "$studio_mode" = build || "$studio_mode" = preserve-current ]] || usage
if [[ "$studio_mode" = preserve-current ]]; then
  [[ "$studio_reviewed_source" = /* && -d "$studio_reviewed_source"
    && -f "$studio_reviewed_source/source-manifest.json"
    && "$studio_reviewed_artifact" = /* && -d "$studio_reviewed_artifact" ]] || usage
fi
rehearsal_pre_drain_log=${WORLD_RELEASE_REHEARSAL_PRE_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-rehearsal-pre-drain.jsonl}
rehearsal_post_drain_log=${WORLD_RELEASE_REHEARSAL_POST_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-rehearsal-post-drain.jsonl}
production_pre_drain_log=${WORLD_RELEASE_PRODUCTION_PRE_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-production-pre-drain.jsonl}


[[ "$token_file" = /* && -f "$token_file" ]] || usage
[[ "$backup_directory" = /* && ! -e "$backup_directory" ]] || usage
[[ "$pre_drain_snapshot" = /* && ! -e "$pre_drain_snapshot" ]] || usage
[[ "$post_drain_snapshot" = /* && ! -e "$post_drain_snapshot"
  && "$post_drain_snapshot" != "$pre_drain_snapshot" ]] || usage
[[ "$production_pre_drain_snapshot" = /* && ! -e "$production_pre_drain_snapshot"
  && "$production_pre_drain_snapshot" != "$pre_drain_snapshot"
  && "$production_pre_drain_snapshot" != "$post_drain_snapshot" ]] || usage
release_output_paths=("$pre_drain_snapshot" "$post_drain_snapshot" "$production_pre_drain_snapshot"
  "$rehearsal_pre_drain_log" "$rehearsal_post_drain_log" "$production_pre_drain_log")
declare -A release_output_seen=()
for release_output in "${release_output_paths[@]}"; do
  [[ "$release_output" = /* && ! -e "$release_output" && -z "${release_output_seen[$release_output]:-}" ]] || usage
  release_output_seen[$release_output]=1
done
[[ "$database" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || usage
[[ "$dry_run" = true || "$dry_run" = false ]] || usage
if [[ "$dry_run" = false ]]; then
  [[ "$content_candidate" = /* && -f "$content_candidate" && ! -L "$content_candidate" ]] || usage
  [[ "$content_candidate_sha256" =~ ^[a-f0-9]{64}$ ]] || usage
  [[ "$content_owner_label" =~ ^[A-Za-z0-9._-]+$ ]] || usage
  [[ "$content_release_confirm" = "publish:$content_candidate_sha256:$database" ]] || {
    printf 'Refusing content-head release without exact candidate confirmation.\n' >&2
    exit 77
  }
fi
[[ "$server" = "$canonical_server" && "$database" = "$canonical_database"
  && "$host" = "$canonical_host" ]] || {
  printf 'Production target must be %s / %s / %s.\n' \
    "$canonical_server" "$canonical_host" "$canonical_database" >&2
  exit 64
}
[[ "$(stat -c '%a' "$token_file")" = 600 ]] || {
  printf 'WORLD_REJOIN_TOKENS_FILE must have mode 0600.\n' >&2
  exit 77
}

if [[ "$dry_run" = true ]]; then
  [[ "$rehearsal_port" =~ ^[0-9]+$ && "$rehearsal_port" -ge 1024
    && "$rehearsal_port" -le 65535 && "$rehearsal_port" -ne 3000 ]] || usage
  bash -n scripts/world-release.sh ops/orchard-runtime/bin/backup-world.sh \
    ops/orchard-runtime/bin/restore-world-rehearsal.sh \
    ops/orchard-runtime/bin/validate-client-static.sh \
    ops/orchard-runtime/bin/validate-studio-static.sh \
    ops/orchard-runtime/bin/package-rollback-artifacts.sh \
    scripts/world-module-source-manifest.sh
  npm run world:release:typecheck
  normalized_release=$(sed -e ':again' -e '/\\$/ { N; s/\\\n/ /; b again; }' \
    scripts/world-release.sh ops/orchard-runtime/bin/restore-world-rehearsal.sh)
  publish_count=$(grep -Ec 'spacetime[[:space:]]+publish' <<<"$normalized_release" || true)
  safe_publish_count=$(grep -Ec 'spacetime[[:space:]]+publish.*--delete-data=never' <<<"$normalized_release" || true)
  [[ "$publish_count" -gt 0 && "$publish_count" -eq "$safe_publish_count" ]] || {
    printf 'A release publish command is missing --delete-data=never.\n' >&2
    exit 65
  }
  printf 'World release stage-A dry-run passed: gates, reviewed additive content-head CAS, quiesced backup, isolated pre/post-drain expectations, production no-delete publish, placeable-read migration, parity verify, and static-service validation are ordered.\n'
  exit 0
fi

# A full backup, isolated rehearsal, module swap, and rebuild is longer than the
# production ID-token lifetime. Every rejoin invocation must be able to rotate a
# refresh token immediately before connecting.
export WORLD_REJOIN_REQUIRE_REFRESH=1

# Fail before builds or downtime when the saved rotating session is already
# unusable. This OIDC-only check never opens or mutates a world connection.
printf 'Preflighting refresh-capable rejoin credentials before release work...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" npm run world:rejoin-smoke -- refresh

# Verify in-place escrow compatibility before release work. Pending jobs remain
# usable through authored claims; this does not query or require an empty table.
node --import tsx scripts/legacy-cooking-release-gate.ts "$repository"

printf 'Verifying the reviewed content-head candidate and its captured live CAS base...\n'
SPACETIMEDB_DATABASE="$database" \
npm run world:content-head -- verify \
  "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$host" \
SPACETIMEDB_DATABASE="$database" \
npm run world:content-head -- assert-current \
  "$content_candidate" "$content_candidate_sha256" "$content_owner_label"

frontend_was_active=false
studio_was_active=false
traffic_stopped=false
release_world_quiescence_started=false
live_publish_started=false
module_source_manifest=''
rollback_staging_directory=''
rollback_artifacts=''
restore_traffic() {
  if [[ "$traffic_stopped" = true ]]; then
    if [[ "$frontend_was_active" = true ]]; then sudo systemctl start orchard-frontend.service; fi
    if [[ "$studio_was_active" = true ]]; then sudo systemctl start orchard-studio.service; fi
  fi
}
keep_traffic_quiesced_on_failure() {
  if [[ "$traffic_stopped" = true ]]; then
    sudo systemctl stop orchard-frontend.service orchard-studio.service >/dev/null 2>&1 || true
    printf 'Release did not complete; game and Studio traffic remain stopped for investigation.\n' >&2
  fi
  if [[ "$release_world_quiescence_started" = true ]]; then
    if [[ "$live_publish_started" = true ]]; then
      sudo systemctl stop orchard-world.service >/dev/null 2>&1 || true
      printf 'Release failed after production publication began; the world authority remains stopped for investigation.\n' >&2
    else
      printf 'Release failed before production publication; restarting the unchanged world authority while web traffic remains closed.\n' >&2
      if sudo systemctl start orchard-world.service; then
        old_world_ready=false
        for _attempt in $(seq 1 30); do
          if curl --max-time 2 -fsS "$canonical_host/v1/ping" >/dev/null; then
            old_world_ready=true
            break
          fi
          sleep 1
        done
        if [[ "$old_world_ready" != true ]]; then
          printf 'The unchanged world authority did not recover its health endpoint.\n' >&2
        fi
      else
        printf 'The unchanged world authority could not be restarted.\n' >&2
      fi
    fi
  fi
  if [[ -n "$module_source_manifest" ]]; then rm -f -- "$module_source_manifest"; fi
  if [[ -n "$rollback_artifacts" ]]; then rm -f -- "$rollback_artifacts"; fi
  if [[ -n "$rollback_staging_directory" ]]; then rmdir -- "$rollback_staging_directory" 2>/dev/null || true; fi
}
trap keep_traffic_quiesced_on_failure EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

rollback_staging_directory=$(mktemp -d /tmp/orchard-release-rollback.XXXXXX)
rollback_artifacts=$rollback_staging_directory/pre-release-rollback-artifacts.tar.gz
ops/orchard-runtime/bin/package-rollback-artifacts.sh "$rollback_artifacts"

# Pin the explicitly handed-off Studio before any candidate build. A preserved
# editor must match both its reviewed output and reviewed source/API snapshot.
studio_stage=$(mktemp -d /tmp/orchard-release-reviewed-studio.XXXXXX)
if [[ "$studio_mode" = preserve-current ]]; then
  node scripts/studio-release-inputs.mjs "$studio_reviewed_source" "$studio_stage/source-before.json"
  cmp "$studio_reviewed_source/source-manifest.json" "$studio_stage/source-before.json"
  node --import tsx scripts/world-release-routine.ts manifest "$studio_reviewed_artifact" > "$studio_stage/reviewed.sha256"
  node --import tsx scripts/world-release-routine.ts preserve-studio \
    packages/studio/dist "$studio_stage/dist" "$studio_stage/reviewed.sha256"
fi

printf 'Running repository and content gates...\n'
npm run lifecycle:integrity
npm run build --workspace @orchard/world
npm run typecheck
npm run world:release:typecheck
npm test
npm run content:validate

module_source_manifest=$(mktemp /tmp/orchard-world-module-source.XXXXXX)
module_source_hash=$(scripts/world-module-source-manifest.sh create \
  "$module_source_manifest" "$repository")
printf 'Pinned world module source manifest: sha256=%s\n' "$module_source_hash"

assert_module_source_unchanged() {
  local actual_hash
  actual_hash=$(scripts/world-module-source-manifest.sh verify \
    "$module_source_manifest" "$repository")
  [[ "$actual_hash" = "$module_source_hash" ]] || {
    printf 'World module source manifest hash changed unexpectedly.\n' >&2
    exit 65
  }
}

# Rebuild and generate only from the pinned tree. The earlier checked world build
# is a repository gate; this second build closes the edit window between that gate
# and the manifest, and the final assertion catches any concurrent edit during
# generation or either static production build.
assert_module_source_unchanged
npm run build --workspace @orchard/world
npm run generate --workspace @orchard/world
npm run typecheck --workspace @orchard/world-bindings

# Stage the integrated Studio with this repository's generated API before
# stopping traffic; retain the reviewed UI-kit guard.
if [[ "$studio_mode" = preserve-current ]]; then
  node packages/studio/scripts/verify-ui-kit.mjs
  cmp packages/studio/scripts/verify-ui-kit.mjs "$studio_reviewed_source/packages/studio/scripts/verify-ui-kit.mjs"
  node "$studio_reviewed_source/packages/studio/scripts/verify-ui-kit.mjs"
  node scripts/studio-release-inputs.mjs "$studio_reviewed_source" "$studio_stage/source-after.json"
  cmp "$studio_stage/source-before.json" "$studio_stage/source-after.json"
  node --import tsx scripts/world-release-routine.ts same-schema \
    "$studio_reviewed_source/packages/world-bindings/src" packages/world-bindings/src
else
  bash scripts/build-reviewed-studio.sh "$studio_stage/source" "$studio_stage/dist"
fi
printf '%s\n' "$studio_mode" > "$studio_stage/studio-mode"
node --import tsx scripts/world-release-routine.ts manifest "$studio_stage/dist" > "$studio_stage/static.sha256"
node --import tsx scripts/world-release-routine.ts manifest packages/world-bindings/src > "$studio_stage/bindings.sha256"
install_reviewed_studio() {
  node --import tsx scripts/world-release-routine.ts manifest "$studio_stage/dist" > "$studio_stage/static-current.sha256"
  cmp "$studio_stage/static.sha256" "$studio_stage/static-current.sha256"
  node --import tsx scripts/world-release-routine.ts manifest packages/world-bindings/src > "$studio_stage/bindings-current.sha256"
  cmp "$studio_stage/bindings.sha256" "$studio_stage/bindings-current.sha256"
  rsync -a --delete "$studio_stage/dist/" packages/studio/dist/
}

# Vite preview serves these exact dist directories. Close both routes before
# either build replaces files, so a client cannot load the candidate against
# the old authority. The rollback bundle above already retains the old apps.
if systemctl is-active --quiet orchard-frontend.service; then frontend_was_active=true; fi
if systemctl is-active --quiet orchard-studio.service; then studio_was_active=true; fi
traffic_stopped=true
if [[ "$frontend_was_active" = true ]]; then sudo systemctl stop orchard-frontend.service; fi
if [[ "$studio_was_active" = true ]]; then sudo systemctl stop orchard-studio.service; fi

npm run build --workspace @orchard/client -- --mode client-production
npm run client:chunks:check
CLIENT_STATIC_DRY_RUN=true ops/orchard-runtime/bin/validate-client-static.sh
install_reviewed_studio
STUDIO_STATIC_DRY_RUN=true ops/orchard-runtime/bin/validate-studio-static.sh
assert_module_source_unchanged

# Close the last authoring race before the backup stops the authority. The
# reducer CAS repeats this check, but the backup and rehearsal must start from
# the same explicitly reviewed head too.
# Repository coverage and production builds can outlive the ID token refreshed
# at entry. Rotate the saved session before this authenticated pre-backup check.
WORLD_REJOIN_TOKENS_FILE="$token_file" npm run world:rejoin-smoke -- refresh
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$host" \
SPACETIMEDB_DATABASE="$database" \
npm run world:content-head -- assert-current \
  "$content_candidate" "$content_candidate_sha256" "$content_owner_label"

release_world_quiescence_started=true
WORLD_BACKUP_LEAVE_STOPPED=true \
WORLD_ROLLBACK_ARTIFACTS_FILE="$rollback_artifacts" \
  ops/orchard-runtime/bin/backup-world.sh "$backup_directory"
rm -f -- "$rollback_artifacts"
rmdir -- "$rollback_staging_directory"
rollback_artifacts=''
rollback_staging_directory=''

# The repository gates and quiesced multi-gigabyte backup may take most of the
# realm's refresh-token idle window. Rotate again immediately before the first
# isolated-restore use. Failure here still restarts the unchanged authority.
printf 'Refreshing rejoin credentials immediately before restore rehearsal...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" npm run world:rejoin-smoke -- refresh

printf 'Publishing/migrating the restored backup and capturing expected post-schema state...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_DATABASE="$database" \
WORLD_RESTORE_REHEARSAL_PORT="$rehearsal_port" \
WORLD_RESTORE_MIGRATION_KIND="$migration_kind" \
WORLD_RESTORE_PRE_DRAIN_CHEST_LOG="$rehearsal_pre_drain_log" \
WORLD_RESTORE_POST_DRAIN_CHEST_LOG="$rehearsal_post_drain_log" \
WORLD_MODULE_SOURCE_MANIFEST="$module_source_manifest" \
WORLD_RESTORE_CONTENT_CANDIDATE="$content_candidate" \
WORLD_RESTORE_CONTENT_CANDIDATE_SHA256="$content_candidate_sha256" \
WORLD_RESTORE_CONTENT_OWNER_LABEL="$content_owner_label" \
WORLD_RESTORE_CONTENT_CONFIRM="$content_release_confirm" \
ops/orchard-runtime/bin/restore-world-rehearsal.sh \
  "$backup_directory" "$pre_drain_snapshot" "$post_drain_snapshot"

printf 'Starting the quiesced authority for the production publish...\n'
sudo systemctl start orchard-world.service
for _attempt in $(seq 1 60); do
  if curl -fsS "$canonical_host/v1/ping" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "$canonical_host/v1/ping" >/dev/null || {
  printf 'World authority did not become healthy for the production publish.\n' >&2
  exit 69
}

printf 'Publishing with destructive migration disabled...\n'
assert_module_source_unchanged
node --import tsx scripts/legacy-cooking-release-gate.ts "$repository"
live_publish_started=true
spacetime publish "$database" \
  --server "$canonical_host" \
  --module-path "$repository/packages/world" \
  --delete-data=never \
  --yes=remote,migrate,break-clients \
  --no-config

# Reverify the retained escrow schema and authored claim capability after publish.
# Failure keeps authority and traffic stopped, preserving every job for repair.
node --import tsx scripts/legacy-cooking-release-gate.ts "$repository"

printf 'Applying the reviewed additive content-head CAS before migration or rejoin...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$host" \
SPACETIMEDB_DATABASE="$database" \
CONTENT_HEAD_RELEASE_CONFIRM="$content_release_confirm" \
npm run world:content-head -- apply \
  "$content_candidate" "$content_candidate_sha256" "$content_owner_label"

npm run generate --workspace @orchard/world
npm run typecheck --workspace @orchard/world-bindings
npm run build --workspace @orchard/client -- --mode client-production
npm run client:chunks:check
CLIENT_STATIC_DRY_RUN=true ops/orchard-runtime/bin/validate-client-static.sh
install_reviewed_studio
STUDIO_STATIC_DRY_RUN=true ops/orchard-runtime/bin/validate-studio-static.sh

printf 'Running production migration through verified placeable reads without draining legacy rows...\n'
assert_module_source_unchanged
if [[ "$migration_kind" = legacy-chests ]]; then
(umask 077
  WORLD_REJOIN_TOKENS_FILE="$token_file" \
  SPACETIMEDB_HOST="$host" \
  SPACETIMEDB_DATABASE="$database" \
  CHEST_MIGRATION_TARGET=production \
  CHEST_MIGRATION_STOP_AFTER=placeable_reads \
  CHEST_MIGRATION_CONFIRM="migrate:$database" \
  CHEST_MIGRATION_PRODUCTION_CONFIRM="$database" \
  CHEST_MIGRATION_CLIENTS_READY=1 \
  CHEST_MIGRATION_STUDIO_READY=1 \
  npm run world:chest-migrate | tee "$production_pre_drain_log")
else
  printf 'Schema-only update: no chest backfill, phase change or drain requested.\n'
fi

printf 'Verifying production against the pre-drain restored-backup expectation before returning traffic...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$host" \
SPACETIMEDB_DATABASE="$database" \
npm run world:rejoin-smoke -- verify "$pre_drain_snapshot" "$production_pre_drain_snapshot"

installed_frontend_unit=$(systemctl show orchard-frontend.service --property=FragmentPath --value)
[[ "$installed_frontend_unit" = /* && -r "$installed_frontend_unit" ]] || {
  printf 'Installed orchard-frontend.service fragment is missing or unreadable.\n' >&2
  exit 66
}
CLIENT_STATIC_DRY_RUN=true \
CLIENT_STATIC_UNIT="$installed_frontend_unit" \
ops/orchard-runtime/bin/validate-client-static.sh

installed_studio_unit=$(systemctl show orchard-studio.service --property=FragmentPath --value)
[[ "$installed_studio_unit" = /* && -r "$installed_studio_unit" ]] || {
  printf 'Installed orchard-studio.service fragment is missing or unreadable.\n' >&2
  exit 66
}
STUDIO_STATIC_DRY_RUN=true \
STUDIO_STATIC_UNIT="$installed_studio_unit" \
ops/orchard-runtime/bin/validate-studio-static.sh

restore_traffic

# A successful process start is not sufficient: do not declare the release
# complete until each route that was serving before the release serves the
# checked static artifact through its canonical proxy again. The EXIT trap
# closes both routes if either validation exhausts the bounded retry window.
if [[ "$frontend_was_active" = true ]]; then
  frontend_ready=false
  for _attempt in $(seq 1 60); do
    if CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net \
      ops/orchard-runtime/bin/validate-client-static.sh >/dev/null 2>&1; then
      frontend_ready=true
      break
    fi
    sleep 1
  done
  [[ "$frontend_ready" = true ]] || {
    CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net \
      ops/orchard-runtime/bin/validate-client-static.sh
  }
fi
if [[ "$studio_was_active" = true ]]; then
  studio_ready=false
  for _attempt in $(seq 1 60); do
    if STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net \
      ops/orchard-runtime/bin/validate-studio-static.sh >/dev/null 2>&1; then
      studio_ready=true
      break
    fi
    sleep 1
  done
  [[ "$studio_ready" = true ]] || {
    STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net \
      ops/orchard-runtime/bin/validate-studio-static.sh
  }
fi

traffic_stopped=false
release_world_quiescence_started=false
live_publish_started=false
rm -f -- "$module_source_manifest"
module_source_manifest=''
printf 'World release completed (%s); backup=%s expected=%s rehearsal-reconnect=%s production=%s rehearsal-pre-log=%s rehearsal-post-log=%s production-pre-log=%s\n' \
  "$migration_kind" \
  "$backup_directory" "$pre_drain_snapshot" "$post_drain_snapshot" \
  "$production_pre_drain_snapshot" "$rehearsal_pre_drain_log" \
  "$rehearsal_post_drain_log" "$production_pre_drain_log"
