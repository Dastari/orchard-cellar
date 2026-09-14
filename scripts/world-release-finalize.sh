#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: WORLD_REJOIN_TOKENS_FILE=/absolute/tokens.json \
       WORLD_FINALIZE_BACKUP_DIRECTORY=/absolute/new-backup-directory \
       WORLD_FINALIZE_PRE_DRAIN_SNAPSHOT=/absolute/new-pre-drain-expected.json \
       WORLD_FINALIZE_POST_DRAIN_SNAPSHOT=/absolute/new-post-drain-expected.json \
       WORLD_FINALIZE_PRODUCTION_PRE_DRAIN_SNAPSHOT=/absolute/new-pre-drain-actual.json \
       WORLD_FINALIZE_PRODUCTION_POST_DRAIN_SNAPSHOT=/absolute/new-post-drain-actual.json \
       scripts/world-release-finalize.sh

Finalizes an accepted stage-A chest migration. It takes a fresh quiesced backup,
rehearses pre/post drain using only that backup's deployed module bytes, proves live
production matches the fresh pre-drain expectation, then drains and proves the result.
USAGE
  exit 64
}

[[ $# -eq 0 ]] || usage
repository=/home/toby/projects/orchard-cellar
[[ "$(pwd -P)" = "$repository" ]] || {
  printf 'Run this finalizer from %s.\n' "$repository" >&2
  exit 64
}

token_file=${WORLD_REJOIN_TOKENS_FILE:-}
backup_directory=${WORLD_FINALIZE_BACKUP_DIRECTORY:-}
pre_drain_snapshot=${WORLD_FINALIZE_PRE_DRAIN_SNAPSHOT:-}
post_drain_snapshot=${WORLD_FINALIZE_POST_DRAIN_SNAPSHOT:-}
production_pre_drain_snapshot=${WORLD_FINALIZE_PRODUCTION_PRE_DRAIN_SNAPSHOT:-}
production_post_drain_snapshot=${WORLD_FINALIZE_PRODUCTION_POST_DRAIN_SNAPSHOT:-}
rehearsal_pre_drain_log=${WORLD_FINALIZE_REHEARSAL_PRE_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-finalize-rehearsal-pre-drain.jsonl}
rehearsal_post_drain_log=${WORLD_FINALIZE_REHEARSAL_POST_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-finalize-rehearsal-post-drain.jsonl}
production_post_drain_log=${WORLD_FINALIZE_PRODUCTION_POST_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-production-post-drain.jsonl}
rehearsal_port=${WORLD_FINALIZE_REHEARSAL_PORT:-3300}
canonical_database=orchard-cellar-world
canonical_host=http://127.0.0.1:3000
database=${SPACETIMEDB_DATABASE:-$canonical_database}
host=${SPACETIMEDB_HOST:-$canonical_host}
dry_run=${WORLD_FINALIZE_DRY_RUN:-false}

[[ "$token_file" = /* && -f "$token_file" && ! -L "$token_file" ]] || usage
[[ "$(stat -c '%a' "$token_file")" = 600 ]] || {
  printf 'WORLD_REJOIN_TOKENS_FILE must have mode 0600.\n' >&2
  exit 77
}
[[ "$backup_directory" = /* && ! -e "$backup_directory" ]] || usage
[[ "$pre_drain_snapshot" = /* && ! -e "$pre_drain_snapshot" ]] || usage
[[ "$post_drain_snapshot" = /* && ! -e "$post_drain_snapshot"
  && "$post_drain_snapshot" != "$pre_drain_snapshot" ]] || usage
finalize_outputs=("$pre_drain_snapshot" "$post_drain_snapshot"
  "$production_pre_drain_snapshot" "$production_post_drain_snapshot"
  "$rehearsal_pre_drain_log" "$rehearsal_post_drain_log" "$production_post_drain_log")
declare -A finalize_output_seen=()
for finalize_output in "${finalize_outputs[@]}"; do
  [[ "$finalize_output" = /* && ! -e "$finalize_output"
    && -z "${finalize_output_seen[$finalize_output]:-}"
    ]] || usage
  finalize_output_seen[$finalize_output]=1
done
[[ "$database" = "$canonical_database" && "$host" = "$canonical_host" ]] || {
  printf 'Finalization target must be %s / %s.\n' "$canonical_host" "$canonical_database" >&2
  exit 64
}
[[ "$dry_run" = true || "$dry_run" = false ]] || usage
[[ "$rehearsal_port" =~ ^[0-9]+$ && "$rehearsal_port" -ge 1024
  && "$rehearsal_port" -le 65535 && "$rehearsal_port" -ne 3000 ]] || usage

if [[ "$dry_run" = true ]]; then
  bash -n scripts/world-release-finalize.sh ops/orchard-runtime/bin/backup-world.sh \
    ops/orchard-runtime/bin/restore-world-rehearsal.sh \
    ops/orchard-runtime/bin/validate-client-static.sh \
    ops/orchard-runtime/bin/validate-studio-static.sh \
    ops/orchard-runtime/bin/package-rollback-artifacts.sh
  npm run world:release:typecheck
  printf 'World release finalizer dry-run passed: fresh quiesced backup, no-publish isolated pre/post-drain expectations, bounded live drain, parity, and fail-closed traffic ordering validated.\n'
  exit 0
fi

export WORLD_REJOIN_REQUIRE_REFRESH=1
frontend_was_active=false
studio_was_active=false
traffic_stopped=false
world_quiescence_started=false
finalization_started=false
rollback_staging_directory=''
rollback_artifacts=''

restore_traffic() {
  if [[ "$traffic_stopped" = true ]]; then
    if [[ "$frontend_was_active" = true ]]; then sudo systemctl start orchard-frontend.service; fi
    if [[ "$studio_was_active" = true ]]; then sudo systemctl start orchard-studio.service; fi
  fi
}

fail_closed() {
  if [[ "$traffic_stopped" = true ]]; then
    sudo systemctl stop orchard-frontend.service orchard-studio.service >/dev/null 2>&1 || true
    printf 'Chest finalization did not complete; game and Studio traffic remain stopped.\n' >&2
  fi
  if [[ "$world_quiescence_started" = true ]]; then
    if [[ "$finalization_started" = true ]]; then
      sudo systemctl stop orchard-world.service >/dev/null 2>&1 || true
      printf 'Finalization failed after drain began; the world authority remains stopped for investigation.\n' >&2
    else
      printf 'Finalization failed before drain began; restarting the unchanged placeable-read authority.\n' >&2
      sudo systemctl start orchard-world.service >/dev/null 2>&1 || true
    fi
  fi
  if [[ -n "$rollback_artifacts" ]]; then rm -f -- "$rollback_artifacts"; fi
  if [[ -n "$rollback_staging_directory" ]]; then rmdir -- "$rollback_staging_directory" 2>/dev/null || true; fi
}
trap fail_closed EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

rollback_staging_directory=$(mktemp -d /tmp/orchard-finalize-rollback.XXXXXX)
rollback_artifacts=$rollback_staging_directory/pre-finalize-rollback-artifacts.tar.gz
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
rmdir -- "$rollback_staging_directory"
rollback_artifacts=''
rollback_staging_directory=''

printf 'Rehearsing finalization from the fresh backup without publishing repository source...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_DATABASE="$database" \
WORLD_RESTORE_REHEARSAL_PORT="$rehearsal_port" \
WORLD_RESTORE_TRANSITION_ALREADY_DEPLOYED=true \
WORLD_RESTORE_PRE_DRAIN_CHEST_LOG="$rehearsal_pre_drain_log" \
WORLD_RESTORE_POST_DRAIN_CHEST_LOG="$rehearsal_post_drain_log" \
ops/orchard-runtime/bin/restore-world-rehearsal.sh \
  "$backup_directory" "$pre_drain_snapshot" "$post_drain_snapshot"

sudo systemctl start orchard-world.service
for _attempt in $(seq 1 60); do
  if curl -fsS "$canonical_host/v1/ping" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "$canonical_host/v1/ping" >/dev/null || {
  printf 'World authority did not become healthy for chest finalization.\n' >&2
  exit 69
}

printf 'Confirming live production still matches the fresh pre-drain expectation...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$host" \
SPACETIMEDB_DATABASE="$database" \
npm run world:rejoin-smoke -- verify "$pre_drain_snapshot" "$production_pre_drain_snapshot"

printf 'Resuming the accepted production migration through drop readiness...\n'
finalization_started=true
(umask 077
  WORLD_REJOIN_TOKENS_FILE="$token_file" \
  SPACETIMEDB_HOST="$host" \
  SPACETIMEDB_DATABASE="$database" \
  CHEST_MIGRATION_TARGET=production \
  CHEST_MIGRATION_STOP_AFTER=drop_ready \
  CHEST_MIGRATION_REQUIRE_PLACEABLE_READS_START=1 \
  CHEST_MIGRATION_CONFIRM="migrate:$database" \
  CHEST_MIGRATION_PRODUCTION_CONFIRM="$database" \
  CHEST_MIGRATION_CLIENTS_READY=1 \
  CHEST_MIGRATION_STUDIO_READY=1 \
  npm run world:chest-migrate | tee "$production_post_drain_log")

printf 'Verifying production against the rehearsed post-drain expectation...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="$host" \
SPACETIMEDB_DATABASE="$database" \
npm run world:rejoin-smoke -- verify "$post_drain_snapshot" "$production_post_drain_snapshot"

installed_frontend_unit=$(systemctl show orchard-frontend.service --property=FragmentPath --value)
[[ "$installed_frontend_unit" = /* && -r "$installed_frontend_unit" ]] || exit 66
CLIENT_STATIC_DRY_RUN=true CLIENT_STATIC_UNIT="$installed_frontend_unit" \
  ops/orchard-runtime/bin/validate-client-static.sh
installed_studio_unit=$(systemctl show orchard-studio.service --property=FragmentPath --value)
[[ "$installed_studio_unit" = /* && -r "$installed_studio_unit" ]] || exit 66
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
finalization_started=false
printf 'World release finalization completed at drop_ready; backup=%s pre-expected=%s post-expected=%s pre-actual=%s post-actual=%s rehearsal-pre-log=%s rehearsal-post-log=%s production-post-log=%s\n' \
  "$backup_directory" "$pre_drain_snapshot" "$post_drain_snapshot" \
  "$production_pre_drain_snapshot" "$production_post_drain_snapshot" \
  "$rehearsal_pre_drain_log" "$rehearsal_post_drain_log" "$production_post_drain_log"
