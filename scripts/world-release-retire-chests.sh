#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: WORLD_REJOIN_TOKENS_FILE=/absolute/tokens.json \
       WORLD_RETIREMENT_CANDIDATE_REPOSITORY=/absolute/generic-only-checkout \
       WORLD_RETIREMENT_BACKUP_DIRECTORY=/absolute/new-backup-directory \
       WORLD_RETIREMENT_REHEARSAL_PRE_SNAPSHOT=/absolute/new-rehearsal-pre.json \
       WORLD_RETIREMENT_REHEARSAL_POST_SNAPSHOT=/absolute/new-rehearsal-post.json \
       WORLD_RETIREMENT_PRODUCTION_PRE_SNAPSHOT=/absolute/new-production-pre.json \
       WORLD_RETIREMENT_PRODUCTION_POST_SNAPSHOT=/absolute/new-production-post.json \
       WORLD_RETIREMENT_CONFIRM=retire:orchard-cellar-world \
       WORLD_RETIREMENT_PRODUCTION_CONFIRM=orchard-cellar-world \
       scripts/world-release-retire-chests.sh

Publishes the generic-only chest schema only after a fresh quiesced backup and both
restored/live authorities prove drop_ready with literal-zero legacy, mapping, and
session counts. Every publish uses --delete-data=never and failures remain closed.
USAGE
  exit 64
}

[[ $# -eq 0 ]] || usage
repository=/home/toby/projects/orchard-cellar
candidate_repository=${WORLD_RETIREMENT_CANDIDATE_REPOSITORY:-}
[[ "$(pwd -P)" = "$repository" ]] || usage

token_file=${WORLD_REJOIN_TOKENS_FILE:-}
backup_directory=${WORLD_RETIREMENT_BACKUP_DIRECTORY:-}
rehearsal_pre_snapshot=${WORLD_RETIREMENT_REHEARSAL_PRE_SNAPSHOT:-}
rehearsal_post_snapshot=${WORLD_RETIREMENT_REHEARSAL_POST_SNAPSHOT:-}
production_pre_snapshot=${WORLD_RETIREMENT_PRODUCTION_PRE_SNAPSHOT:-}
production_post_snapshot=${WORLD_RETIREMENT_PRODUCTION_POST_SNAPSHOT:-}
rehearsal_pre_status=${WORLD_RETIREMENT_REHEARSAL_PRE_STATUS_LOG:-$backup_directory/chest-retirement-rehearsal-pre.jsonl}
rehearsal_post_status=${WORLD_RETIREMENT_REHEARSAL_POST_STATUS_LOG:-$backup_directory/chest-retirement-rehearsal-post.jsonl}
production_pre_status=${WORLD_RETIREMENT_PRODUCTION_PRE_STATUS_LOG:-$backup_directory/chest-retirement-production-pre.jsonl}
production_post_status=${WORLD_RETIREMENT_PRODUCTION_POST_STATUS_LOG:-$backup_directory/chest-retirement-production-post.jsonl}
rehearsal_port=${WORLD_RETIREMENT_REHEARSAL_PORT:-3400}
database=${SPACETIMEDB_DATABASE:-orchard-cellar-world}
host=${SPACETIMEDB_HOST:-http://127.0.0.1:3000}
canonical_database=orchard-cellar-world
canonical_host=http://127.0.0.1:3000
dry_run=${WORLD_RETIREMENT_DRY_RUN:-false}
owner_label=${CHEST_MIGRATION_OWNER_LABEL:-}

[[ "$token_file" = /* && -f "$token_file" && ! -L "$token_file"
  && "$(stat -c '%a' "$token_file")" = 600 ]] || usage
[[ "$backup_directory" = /* && ! -e "$backup_directory" ]] || usage
outputs=("$rehearsal_pre_snapshot" "$rehearsal_post_snapshot"
  "$production_pre_snapshot" "$production_post_snapshot"
  "$rehearsal_pre_status" "$rehearsal_post_status" "$production_pre_status" "$production_post_status")
declare -A output_seen=()
for output in "${outputs[@]}"; do
  [[ "$output" = /* && ! -e "$output" && -z "${output_seen[$output]:-}" ]] || usage
  output_seen[$output]=1
done
[[ "$database" = "$canonical_database" && "$host" = "$canonical_host" ]] || {
  printf 'Retirement target must be %s / %s.\n' "$canonical_host" "$canonical_database" >&2
  exit 64
}
[[ "$rehearsal_port" =~ ^[0-9]+$ && "$rehearsal_port" -ge 1024
  && "$rehearsal_port" -le 65535 && "$rehearsal_port" -ne 3000 ]] || usage
[[ "$dry_run" = true || "$dry_run" = false ]] || usage
if [[ -n "$owner_label" && ! "$owner_label" =~ ^[A-Za-z0-9._-]+$ ]]; then usage; fi

if [[ "$dry_run" = true ]]; then
  bash -n scripts/world-release-retire-chests.sh \
    scripts/prepare-chest-retirement-candidate.sh \
    ops/orchard-runtime/bin/restore-world-retirement-rehearsal.sh \
    scripts/assert-chest-retirement-source.sh
  npm run world:release:typecheck
  printf 'Chest retirement release dry-run passed: fresh leave-stopped rollback backup, restored/live literal-zero gates, pinned isolated/production no-delete publishes, v2 generic-only parity, build/static validation, and fail-closed ordering validated.\n'
  exit 0
fi

[[ "$candidate_repository" = /* && -d "$candidate_repository" && ! -L "$candidate_repository" ]] || usage
candidate_repository=$(realpath "$candidate_repository")
[[ "$candidate_repository" != "$repository" ]] || {
  printf 'Retirement requires a separate generic-only candidate checkout.\n' >&2
  exit 65
}

[[ "${WORLD_RETIREMENT_CONFIRM:-}" = "retire:$canonical_database" ]] || {
  printf 'WORLD_RETIREMENT_CONFIRM must equal retire:%s.\n' "$canonical_database" >&2
  exit 64
}
[[ "${WORLD_RETIREMENT_PRODUCTION_CONFIRM:-}" = "$canonical_database" ]] || {
  printf 'WORLD_RETIREMENT_PRODUCTION_CONFIRM must equal %s.\n' "$canonical_database" >&2
  exit 64
}
export WORLD_REJOIN_REQUIRE_REFRESH=1

frontend_was_active=false
studio_was_active=false
traffic_stopped=false
world_quiescence_started=false
production_publish_started=false
source_manifest=''
rollback_staging=''
rollback_artifacts=''
production_schema=''

restore_traffic() {
  if [[ "$traffic_stopped" = true ]]; then
    if [[ "$frontend_was_active" = true ]]; then sudo systemctl start orchard-frontend.service; fi
    if [[ "$studio_was_active" = true ]]; then sudo systemctl start orchard-studio.service; fi
  fi
}

fail_closed() {
  if [[ "$traffic_stopped" = true ]]; then
    sudo systemctl stop orchard-frontend.service orchard-studio.service >/dev/null 2>&1 || true
    printf 'Chest retirement did not complete; game and Studio traffic remain stopped.\n' >&2
  fi
  if [[ "$world_quiescence_started" = true ]]; then
    if [[ "$production_publish_started" = true ]]; then
      sudo systemctl stop orchard-world.service >/dev/null 2>&1 || true
      printf 'Retirement failed after production publication began; the world authority remains stopped.\n' >&2
    else
      printf 'Retirement failed before production publication; restarting the unchanged drop-ready authority.\n' >&2
      sudo systemctl start orchard-world.service >/dev/null 2>&1 || true
    fi
  fi
  [[ -z "$source_manifest" ]] || rm -f -- "$source_manifest"
  [[ -z "$rollback_artifacts" ]] || rm -f -- "$rollback_artifacts"
  [[ -z "$rollback_staging" ]] || rmdir -- "$rollback_staging" 2>/dev/null || true
  [[ -z "$production_schema" ]] || rm -f -- "$production_schema"
}
trap fail_closed EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Building the candidate and proving its source/bindings are actually generic-only...\n'
npm run world:release:typecheck
npm test
npm run content:validate

source_manifest=$(mktemp /tmp/orchard-chest-retirement-source.XXXXXX)
rm -f -- "$source_manifest"
scripts/prepare-chest-retirement-candidate.sh "$candidate_repository" "$source_manifest"
source_hash=$(scripts/world-module-source-manifest.sh verify "$source_manifest" "$candidate_repository")
printf 'Pinned retired world source manifest: sha256=%s\n' "$source_hash"
assert_source_unchanged() {
  local actual
  actual=$(scripts/world-module-source-manifest.sh verify "$source_manifest" "$candidate_repository")
  [[ "$actual" = "$source_hash" ]] || { printf 'Retirement source manifest changed.\n' >&2; exit 65; }
  scripts/assert-chest-retirement-source.sh "$candidate_repository" >/dev/null
}

assert_source_unchanged
[[ -s "$candidate_repository/packages/client/dist/index.html"
  && -s "$candidate_repository/packages/studio/dist/index.html" ]] || {
  printf 'Prepared candidate is missing browser build output.\n' >&2
  exit 66
}
assert_source_unchanged

rollback_staging=$(mktemp -d /tmp/orchard-chest-retirement-rollback.XXXXXX)
rollback_artifacts=$rollback_staging/pre-retirement-rollback-artifacts.tar.gz
ops/orchard-runtime/bin/package-rollback-artifacts.sh "$rollback_artifacts"

if systemctl is-active --quiet orchard-frontend.service; then frontend_was_active=true; fi
if systemctl is-active --quiet orchard-studio.service; then studio_was_active=true; fi
traffic_stopped=true
if [[ "$frontend_was_active" = true ]]; then sudo systemctl stop orchard-frontend.service; fi
if [[ "$studio_was_active" = true ]]; then sudo systemctl stop orchard-studio.service; fi

world_quiescence_started=true
WORLD_BACKUP_LEAVE_STOPPED=true \
WORLD_ROLLBACK_ARTIFACTS_FILE="$rollback_artifacts" \
  ops/orchard-runtime/bin/backup-world.sh "$backup_directory"
rm -f -- "$rollback_artifacts"
rmdir -- "$rollback_staging"
rollback_artifacts=''
rollback_staging=''

printf 'Rehearsing the exact retirement against the fresh restored drop-ready authority...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
WORLD_MODULE_SOURCE_MANIFEST="$source_manifest" \
WORLD_RETIREMENT_CANDIDATE_REPOSITORY="$candidate_repository" \
SPACETIMEDB_DATABASE="$database" \
WORLD_RETIREMENT_REHEARSAL_PORT="$rehearsal_port" \
WORLD_RETIREMENT_REHEARSAL_PRE_STATUS_LOG="$rehearsal_pre_status" \
WORLD_RETIREMENT_REHEARSAL_POST_STATUS_LOG="$rehearsal_post_status" \
  ops/orchard-runtime/bin/restore-world-retirement-rehearsal.sh \
  "$backup_directory" "$rehearsal_pre_snapshot" "$rehearsal_post_snapshot"

sudo systemctl start orchard-world.service
for _attempt in $(seq 1 60); do
  if curl -fsS "$canonical_host/v1/ping" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "$canonical_host/v1/ping" >/dev/null || {
  printf 'World authority did not become healthy for retirement.\n' >&2
  exit 69
}

run_live_drop_ready_gate() {
  local log=$1
  (umask 077
    WORLD_REJOIN_TOKENS_FILE="$token_file" \
    SPACETIMEDB_HOST="$canonical_host" \
    SPACETIMEDB_DATABASE="$canonical_database" \
    CHEST_MIGRATION_TARGET=production \
    CHEST_MIGRATION_STOP_AFTER=drop_ready \
    CHEST_MIGRATION_CONFIRM="migrate:$canonical_database" \
    CHEST_MIGRATION_PRODUCTION_CONFIRM="$canonical_database" \
    CHEST_MIGRATION_CLIENTS_READY=1 \
    CHEST_MIGRATION_STUDIO_READY=1 \
    npm run world:chest-migrate | tee "$log")
}

printf 'Proving live transition state is exactly drop_ready with literal-zero custody/data counts...\n'
run_live_drop_ready_gate "$production_pre_status"
WORLD_REJOIN_REQUIRE_GENERIC_ONLY=1 \
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$canonical_host" \
SPACETIMEDB_DATABASE="$canonical_database" \
  npm run world:rejoin-smoke -- verify "$rehearsal_pre_snapshot" "$production_pre_snapshot"

assert_source_unchanged
printf 'Publishing retired production schema with destructive migration disabled...\n'
node --import tsx scripts/legacy-cooking-release-gate.ts "$candidate_repository"
production_publish_started=true
spacetime publish "$canonical_database" \
  --server "$canonical_host" \
  --module-path "$candidate_repository/packages/world" \
  --delete-data=never \
  --yes=remote,migrate,break-clients \
  --no-config

node --import tsx scripts/legacy-cooking-release-gate.ts "$candidate_repository"

production_schema=$(mktemp /tmp/orchard-retired-production-schema.XXXXXX)
spacetime describe "$canonical_database" --server "$canonical_host" --json --anonymous --no-config >"$production_schema"
npx tsx scripts/chest-retirement-schema.ts "$production_schema"
rm -f -- "$production_schema"
production_schema=''

scripts/assert-chest-retirement-source.sh "$candidate_repository"
rsync -a --delete -- "$candidate_repository/packages/client/dist/" "$repository/packages/client/dist/"
rsync -a --delete -- "$candidate_repository/packages/studio/dist/" "$repository/packages/studio/dist/"
npm run client:chunks:check
CLIENT_STATIC_DRY_RUN=true ops/orchard-runtime/bin/validate-client-static.sh
STUDIO_STATIC_DRY_RUN=true ops/orchard-runtime/bin/validate-studio-static.sh
assert_source_unchanged

run_live_drop_ready_gate "$production_post_status"
WORLD_REJOIN_REQUIRE_GENERIC_ONLY=1 \
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$canonical_host" \
SPACETIMEDB_DATABASE="$canonical_database" \
  npm run world:rejoin-smoke -- verify "$production_pre_snapshot" "$production_post_snapshot"

installed_frontend_unit=$(systemctl show orchard-frontend.service --property=FragmentPath --value)
installed_studio_unit=$(systemctl show orchard-studio.service --property=FragmentPath --value)
[[ "$installed_frontend_unit" = /* && -r "$installed_frontend_unit"
  && "$installed_studio_unit" = /* && -r "$installed_studio_unit" ]] || exit 66
CLIENT_STATIC_DRY_RUN=true CLIENT_STATIC_UNIT="$installed_frontend_unit" \
  ops/orchard-runtime/bin/validate-client-static.sh
STUDIO_STATIC_DRY_RUN=true STUDIO_STATIC_UNIT="$installed_studio_unit" \
  ops/orchard-runtime/bin/validate-studio-static.sh

restore_traffic
if [[ "$frontend_was_active" = true ]]; then
  CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net ops/orchard-runtime/bin/validate-client-static.sh
fi
if [[ "$studio_was_active" = true ]]; then
  STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net ops/orchard-runtime/bin/validate-studio-static.sh
fi

traffic_stopped=false
world_quiescence_started=false
production_publish_started=false
rm -f -- "$source_manifest"
source_manifest=''
printf 'Chest retirement completed without destructive migration; backup=%s rehearsal-pre=%s rehearsal-post=%s production-pre=%s production-post=%s.\n' \
  "$backup_directory" "$rehearsal_pre_snapshot" "$rehearsal_post_snapshot" \
  "$production_pre_snapshot" "$production_post_snapshot"
