#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: WORLD_REJOIN_TOKENS_FILE=/absolute/tokens.json %s /absolute/backup-directory /absolute/new-pre-drain-snapshot.json /absolute/new-post-drain-snapshot.json\n' "$0" >&2
  exit 64
}

[[ $# -eq 3 ]] || usage
backup_directory=$1
pre_drain_snapshot=$2
post_drain_snapshot=$3
token_file=${WORLD_REJOIN_TOKENS_FILE:-}
database=${SPACETIMEDB_DATABASE:-orchard-cellar-world}
port=${WORLD_RESTORE_REHEARSAL_PORT:-3300}
dry_run=${WORLD_RESTORE_REHEARSAL_DRY_RUN:-false}
repository=/home/toby/projects/orchard-cellar
pre_drain_migration_log=${WORLD_RESTORE_PRE_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-rehearsal-pre-drain.jsonl}
post_drain_migration_log=${WORLD_RESTORE_POST_DRAIN_CHEST_LOG:-$backup_directory/chest-migration-rehearsal-post-drain.jsonl}
module_source_manifest=${WORLD_MODULE_SOURCE_MANIFEST:-}
transition_already_deployed=${WORLD_RESTORE_TRANSITION_ALREADY_DEPLOYED:-false}
maintenance_nice=${WORLD_MAINTENANCE_NICE_LEVEL:-15}
content_candidate=${WORLD_RESTORE_CONTENT_CANDIDATE:-}
content_candidate_sha256=${WORLD_RESTORE_CONTENT_CANDIDATE_SHA256:-}
content_owner_label=${WORLD_RESTORE_CONTENT_OWNER_LABEL:-}
content_release_confirm=${WORLD_RESTORE_CONTENT_CONFIRM:-}

[[ "$backup_directory" = /* && -d "$backup_directory" ]] || usage
[[ "$pre_drain_snapshot" = /* && ! -e "$pre_drain_snapshot" ]] || usage
[[ "$post_drain_snapshot" = /* && ! -e "$post_drain_snapshot"
  && "$post_drain_snapshot" != "$pre_drain_snapshot" ]] || usage
[[ "$pre_drain_migration_log" = /* && ! -e "$pre_drain_migration_log"
  && "$pre_drain_migration_log" != "$pre_drain_snapshot"
  && "$pre_drain_migration_log" != "$post_drain_snapshot" ]] || usage
[[ "$post_drain_migration_log" = /* && ! -e "$post_drain_migration_log"
  && "$post_drain_migration_log" != "$pre_drain_migration_log"
  && "$post_drain_migration_log" != "$pre_drain_snapshot"
  && "$post_drain_migration_log" != "$post_drain_snapshot" ]] || usage
[[ "$token_file" = /* && -f "$token_file" ]] || usage
[[ "$(stat -c '%a' "$token_file")" = 600 ]] || { printf 'Token file must have mode 0600.\n' >&2; exit 77; }
[[ "$database" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || usage
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1024 && "$port" -le 65535 && "$port" -ne 3000 ]] || {
  printf 'Rehearsal port must be an unprivileged non-live port.\n' >&2; exit 64;
}
[[ "$dry_run" = true || "$dry_run" = false ]] || usage
[[ "$transition_already_deployed" = true || "$transition_already_deployed" = false ]] || usage
[[ "$maintenance_nice" =~ ^([0-9]|1[0-9])$ ]] || usage
if [[ "$dry_run" = false && "$transition_already_deployed" = false ]]; then
  [[ "$content_candidate" = /* && -f "$content_candidate" && ! -L "$content_candidate" ]] || usage
  [[ "$content_candidate_sha256" =~ ^[a-f0-9]{64}$ ]] || usage
  [[ "$content_owner_label" =~ ^[A-Za-z0-9._-]+$ ]] || usage
  [[ "$content_release_confirm" = "publish:$content_candidate_sha256:$database" ]] || usage
fi
if [[ -n "$module_source_manifest" ]]; then
  [[ "$module_source_manifest" = /* && -f "$module_source_manifest" ]] || usage
fi
if [[ "$transition_already_deployed" = true && -n "$module_source_manifest" ]]; then
  printf 'An already-deployed transition rehearsal must use only the module bytes in the backup.\n' >&2
  exit 64
fi

# Restored-archive verification and extraction are deliberately background
# maintenance. Descendants, including the isolated rehearsal authority, inherit
# low CPU and idle-I/O priority so the live world remains responsive.
current_nice=$(ps -o ni= -p $$ | tr -d ' ')
if (( current_nice < maintenance_nice )); then
  renice "$maintenance_nice" -p $$ >/dev/null \
    || printf 'Warning: could not lower rehearsal CPU priority.\n' >&2
fi
if command -v ionice >/dev/null; then
  ionice -c 3 -p $$ >/dev/null \
    || printf 'Warning: could not lower rehearsal I/O priority.\n' >&2
fi

archive=$backup_directory/spacetime-data.tar.gz
checksums=$backup_directory/SHA256SUMS
[[ -f "$archive" && -f "$checksums" && -f "$backup_directory/MANIFEST" ]] || {
  printf 'Backup archive, checksum, or manifest is missing.\n' >&2; exit 66;
}
if [[ "$(wc -l < "$checksums")" -ne 1 ]] \
  || ! grep -Eq '^[0-9a-f]{64}  spacetime-data\.tar\.gz$' "$checksums"; then
  printf 'Backup checksum manifest is not the expected single archive entry.\n' >&2; exit 65;
fi

(cd "$backup_directory" && sha256sum -c SHA256SUMS >/dev/null)
if tar -tzf "$archive" | awk '/(^|\/)\.\.($|\/)|^\// { found=1 } END { exit !found }'; then
  printf 'Backup archive contains an unsafe path.\n' >&2
  exit 65
fi
if tar -tvzf "$archive" | awk '$1 !~ /^[d-]/ { unsafe=1 } END { exit !unsafe }'; then
  printf 'Backup archive contains a link or special file.\n' >&2
  exit 65
fi

rollback_bundle_version=$(sed -n 's/^rollback_bundle_version=//p' "$backup_directory/MANIFEST")
if [[ -n "$rollback_bundle_version" ]]; then
  [[ "$rollback_bundle_version" = 1 ]] || {
    printf 'Unsupported rollback bundle version: %s\n' "$rollback_bundle_version" >&2
    exit 65
  }
  rollback_archive=$backup_directory/rollback-artifacts.tar.gz
  rollback_checksums=$backup_directory/ROLLBACK-SHA256SUMS
  program_inventory=$backup_directory/DEPLOYED-PROGRAMS.sha256
  [[ -f "$rollback_archive" && ! -L "$rollback_archive"
    && -f "$rollback_checksums" && ! -L "$rollback_checksums"
    && -f "$program_inventory" && ! -L "$program_inventory" ]] || {
    printf 'Versioned backup is missing a rollback artifact or inventory.\n' >&2
    exit 66
  }
  if [[ "$(wc -l < "$rollback_checksums")" -ne 2 ]] \
    || ! grep -Eq '^[0-9a-f]{64}  rollback-artifacts\.tar\.gz$' "$rollback_checksums" \
    || ! grep -Eq '^[0-9a-f]{64}  DEPLOYED-PROGRAMS\.sha256$' "$rollback_checksums"; then
    printf 'Rollback checksum manifest does not contain the two expected artifacts.\n' >&2
    exit 65
  fi
  (cd "$backup_directory" && sha256sum -c ROLLBACK-SHA256SUMS >/dev/null)
  if tar -tzf "$rollback_archive" | awk '/(^|\/)\.\.($|\/)|^\// { found=1 } END { exit !found }'; then
    printf 'Rollback archive contains an unsafe path.\n' >&2
    exit 65
  fi
  if tar -tvzf "$rollback_archive" | awk '$1 !~ /^[d-]/ { unsafe=1 } END { exit !unsafe }'; then
    printf 'Rollback archive contains a link or special file.\n' >&2
    exit 65
  fi
  if [[ ! -s "$program_inventory" ]] \
    || ! awk '
      NF != 2 || $1 !~ /^[0-9a-f]{64}$/ || $2 !~ /^program-bytes\/[0-9a-f]{2}\/[0-9a-f]{62}$/ { bad=1; next }
      seen[$2]++ { bad=1 }
      END { exit bad }
    ' "$program_inventory"; then
    printf 'Deployed program inventory is empty or malformed.\n' >&2
    exit 65
  fi

  rollback_validation_root=$(mktemp -d /tmp/orchard-rollback-validation.XXXXXX)
  cleanup_rollback_validation() {
    [[ "$rollback_validation_root" = /tmp/orchard-rollback-validation.* ]] \
      && rm -rf -- "$rollback_validation_root"
  }
  trap cleanup_rollback_validation EXIT INT TERM
  tar -C "$rollback_validation_root" -xzf "$rollback_archive"
  rollback_root=$rollback_validation_root/rollback-artifacts
  required_rollback_files=(
    PROVENANCE
    SERVICE-UNITS
    FILE-SHA256SUMS
    repository/spacetime.json
    repository/spacetime.local.json
    repository/packages/assets/content/items.json
    repository/packages/world/src/index.ts
    repository/packages/world/dist/bundle.js
    repository/packages/client/dist/index.html
    repository/packages/studio/dist/index.html
    service-units/orchard-world.service/fragment.service
    service-units/orchard-frontend.service/fragment.service
    service-units/orchard-studio.service/fragment.service
  )
  for relative_path in "${required_rollback_files[@]}"; do
    [[ -f "$rollback_root/$relative_path" && ! -L "$rollback_root/$relative_path" ]] || {
      printf 'Rollback archive is missing required regular file: %s\n' "$relative_path" >&2
      exit 66
    }
  done
  if find "$rollback_root" -type l -o \! -type d \! -type f | grep -q .; then
    printf 'Extracted rollback bundle contains a link or special file.\n' >&2
    exit 65
  fi
  (cd "$rollback_root" && sha256sum -c FILE-SHA256SUMS >/dev/null)
  cleanup_rollback_validation
  trap - EXIT INT TERM
fi

if [[ "$dry_run" = true ]]; then
  printf 'Restore rehearsal dry-run passed: checksum, archive paths, rollback artifacts, credentials mode, transition publish, staged pre-drain capture, post-drain capture, and isolated rejoin plan validated.\n'
  exit 0
fi

restore_root=$(mktemp -d /tmp/orchard-world-restore.XXXXXX)
server_pid=''
server_name="orchard-restore-rehearsal-$$"
server_registered=false
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  if [[ "$server_registered" = true ]]; then spacetime server remove "$server_name" >/dev/null 2>&1 || true; fi
  [[ "$restore_root" = /tmp/orchard-world-restore.* ]] && rm -rf -- "$restore_root"
}
trap cleanup EXIT INT TERM

tar -C "$restore_root" -xzf "$archive"
restored_data=$restore_root/.spacetime-data
[[ -d "$restored_data" && "$(realpath "$restored_data")" = "$restore_root/.spacetime-data" ]] || {
  printf 'Restored archive does not contain the expected isolated data directory.\n' >&2; exit 66;
}
if [[ -n "$rollback_bundle_version" ]]; then
  if ! diff -q \
    <(awk '{ print $2 }' "$program_inventory" | LC_ALL=C sort) \
    <(cd "$restored_data" && find program-bytes -type f -print | LC_ALL=C sort) \
    >/dev/null; then
    printf 'Deployed program inventory does not exactly cover the restored program store.\n' >&2
    exit 65
  fi
  (cd "$restored_data" && sha256sum -c "$program_inventory" >/dev/null)
  command -v openssl >/dev/null || {
    printf 'OpenSSL with Keccak-256 support is required to verify the restored program store.\n' >&2
    exit 69
  }
  if ! (
    cd "$restored_data"
    while read -r _digest program_path; do
      encoded=${program_path#program-bytes/}
      encoded=${encoded/\//}
      actual=$(openssl dgst -keccak-256 -r "$program_path" 2>/dev/null | awk '{ print $1 }')
      [[ "$actual" = "$encoded" ]] || exit 1
    done < "$program_inventory"
  ); then
    printf 'A restored program file does not match its SpaceTimeDB Keccak-256 store key.\n' >&2
    exit 65
  fi
fi

spacetime start --listen-addr "127.0.0.1:$port" --data-dir "$restored_data" --non-interactive \
  >"$restore_root/host.log" 2>&1 &
server_pid=$!
for _attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/v1/ping" >/dev/null; then break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    printf 'Isolated restore host exited before becoming healthy.\n' >&2; exit 69
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/v1/ping" >/dev/null || {
  printf 'Isolated restore host did not become healthy.\n' >&2; exit 69;
}

spacetime server add "$server_name" --url "http://127.0.0.1:$port" --no-fingerprint >/dev/null
server_registered=true
node --import tsx "$repository/scripts/legacy-cooking-release-gate.ts" "$repository"
if [[ "$transition_already_deployed" = true ]]; then
  printf 'Using the exact already-deployed transition module restored from backup; no module publish will run.\n'
  export CHEST_MIGRATION_REQUIRE_PLACEABLE_READS_START=1
else
  unset CHEST_MIGRATION_REQUIRE_PLACEABLE_READS_START
  printf 'Publishing the transitional module to the isolated restored authority...\n'
  if [[ -n "$module_source_manifest" ]]; then
    "$repository/scripts/world-module-source-manifest.sh" verify \
      "$module_source_manifest" "$repository" >/dev/null
  fi
  spacetime publish "$database" \
    --server "$server_name" \
    --module-path "$repository/packages/world" \
    --delete-data=never \
    --yes=migrate,break-clients,skip-login \
    --no-config
fi

node --import tsx "$repository/scripts/legacy-cooking-release-gate.ts" "$repository"
if [[ "$transition_already_deployed" = false ]]; then
  printf 'Applying the reviewed content-head CAS to the isolated restore...\n'
  WORLD_REJOIN_TOKENS_FILE="$token_file" \
  SPACETIMEDB_HOST="http://127.0.0.1:$port" \
  SPACETIMEDB_DATABASE="$database" \
  CONTENT_HEAD_RELEASE_CONFIRM="$content_release_confirm" \
  npm --prefix "$repository" run world:content-head -- apply \
    "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
fi

printf 'Migrating the isolated restore through verified placeable reads without draining legacy rows...\n'
if [[ -n "$module_source_manifest" ]]; then
  "$repository/scripts/world-module-source-manifest.sh" verify \
    "$module_source_manifest" "$repository" >/dev/null
fi
(umask 077
  WORLD_REJOIN_TOKENS_FILE="$token_file" \
  SPACETIMEDB_HOST="http://127.0.0.1:$port" \
  SPACETIMEDB_DATABASE="$database" \
  CHEST_MIGRATION_TARGET=rehearsal \
  CHEST_MIGRATION_STOP_AFTER=placeable_reads \
  CHEST_MIGRATION_CONFIRM="migrate:$database" \
  CHEST_MIGRATION_CLIENTS_READY=1 \
  CHEST_MIGRATION_STUDIO_READY=1 \
  npm --prefix "$repository" run world:chest-migrate | tee "$pre_drain_migration_log")

printf 'Capturing and reconnect-verifying the expected pre-drain state...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="http://127.0.0.1:$port" \
SPACETIMEDB_DATABASE="$database" \
npm --prefix "$repository" run world:rejoin-smoke -- capture "$pre_drain_snapshot"

WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="http://127.0.0.1:$port" \
SPACETIMEDB_DATABASE="$database" \
npm --prefix "$repository" run world:rejoin-smoke -- verify "$pre_drain_snapshot"

printf 'Resuming the isolated migration through verified drain readiness...\n'
if [[ -n "$module_source_manifest" ]]; then
  "$repository/scripts/world-module-source-manifest.sh" verify \
    "$module_source_manifest" "$repository" >/dev/null
fi
(umask 077
  WORLD_REJOIN_TOKENS_FILE="$token_file" \
  SPACETIMEDB_HOST="http://127.0.0.1:$port" \
  SPACETIMEDB_DATABASE="$database" \
  CHEST_MIGRATION_TARGET=rehearsal \
  CHEST_MIGRATION_STOP_AFTER=drop_ready \
  CHEST_MIGRATION_CONFIRM="migrate:$database" \
  CHEST_MIGRATION_CLIENTS_READY=1 \
  CHEST_MIGRATION_STUDIO_READY=1 \
  npm --prefix "$repository" run world:chest-migrate | tee "$post_drain_migration_log")

printf 'Capturing and reconnect-verifying the expected post-drain state...\n'
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="http://127.0.0.1:$port" \
SPACETIMEDB_DATABASE="$database" \
npm --prefix "$repository" run world:rejoin-smoke -- capture "$post_drain_snapshot"

WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="http://127.0.0.1:$port" \
SPACETIMEDB_DATABASE="$database" \
npm --prefix "$repository" run world:rejoin-smoke -- verify "$post_drain_snapshot"

printf 'Isolated world restore rehearsal passed on loopback port %s; pre-drain=%s post-drain=%s pre-log=%s post-log=%s.\n' \
  "$port" "$pre_drain_snapshot" "$post_drain_snapshot" \
  "$pre_drain_migration_log" "$post_drain_migration_log"
