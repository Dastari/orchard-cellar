#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: WORLD_REJOIN_TOKENS_FILE=/absolute/tokens.json WORLD_MODULE_SOURCE_MANIFEST=/absolute/manifest WORLD_RETIREMENT_CANDIDATE_REPOSITORY=/absolute/candidate %s /absolute/backup-directory /absolute/new-pre-retirement-snapshot.json /absolute/new-post-retirement-snapshot.json\n' "$0" >&2
  exit 64
}

[[ $# -eq 3 ]] || usage
backup_directory=$1
pre_snapshot=$2
post_snapshot=$3
repository=/home/toby/projects/orchard-cellar
candidate_repository=${WORLD_RETIREMENT_CANDIDATE_REPOSITORY:-}
token_file=${WORLD_REJOIN_TOKENS_FILE:-}
source_manifest=${WORLD_MODULE_SOURCE_MANIFEST:-}
database=${SPACETIMEDB_DATABASE:-orchard-cellar-world}
port=${WORLD_RETIREMENT_REHEARSAL_PORT:-3400}
dry_run=${WORLD_RETIREMENT_REHEARSAL_DRY_RUN:-false}
owner_label=${CHEST_MIGRATION_OWNER_LABEL:-}
pre_status_log=${WORLD_RETIREMENT_REHEARSAL_PRE_STATUS_LOG:-$backup_directory/chest-retirement-rehearsal-pre.jsonl}
post_status_log=${WORLD_RETIREMENT_REHEARSAL_POST_STATUS_LOG:-$backup_directory/chest-retirement-rehearsal-post.jsonl}
maintenance_nice=${WORLD_MAINTENANCE_NICE_LEVEL:-15}

[[ "$backup_directory" = /* && -d "$backup_directory" ]] || usage
outputs=("$pre_snapshot" "$post_snapshot" "$pre_status_log" "$post_status_log")
declare -A output_seen=()
for output in "${outputs[@]}"; do
  [[ "$output" = /* && ! -e "$output" && -z "${output_seen[$output]:-}" ]] || usage
  output_seen[$output]=1
done
[[ "$token_file" = /* && -f "$token_file" && ! -L "$token_file"
  && "$(stat -c '%a' "$token_file")" = 600 ]] || usage
[[ "$source_manifest" = /* && -f "$source_manifest" && ! -L "$source_manifest" ]] || usage
[[ "$database" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || usage
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1024 && "$port" -le 65535
  && "$port" -ne 3000 ]] || usage
[[ "$dry_run" = true || "$dry_run" = false ]] || usage
[[ "$maintenance_nice" =~ ^([0-9]|1[0-9])$ ]] || usage
if [[ -n "$owner_label" && ! "$owner_label" =~ ^[A-Za-z0-9._-]+$ ]]; then usage; fi

# Keep restored-data hashing, extraction, and the disposable authority behind
# the live world in both CPU and I/O scheduling priority.
current_nice=$(ps -o ni= -p $$ | tr -d ' ')
if (( current_nice < maintenance_nice )); then
  renice "$maintenance_nice" -p $$ >/dev/null \
    || printf 'Warning: could not lower retirement rehearsal CPU priority.\n' >&2
fi
if command -v ionice >/dev/null; then
  ionice -c 3 -p $$ >/dev/null \
    || printf 'Warning: could not lower retirement rehearsal I/O priority.\n' >&2
fi

validation_root=$(mktemp -d /tmp/orchard-retirement-validation.XXXXXX)
cleanup_validation() {
  [[ "$validation_root" = /tmp/orchard-retirement-validation.* ]] && rm -rf -- "$validation_root"
}
trap cleanup_validation EXIT INT TERM
WORLD_RESTORE_REHEARSAL_DRY_RUN=true \
WORLD_RESTORE_PRE_DRAIN_CHEST_LOG="$validation_root/pre-status.jsonl" \
WORLD_RESTORE_POST_DRAIN_CHEST_LOG="$validation_root/post-status.jsonl" \
WORLD_REJOIN_TOKENS_FILE="$token_file" \
  "$repository/ops/orchard-runtime/bin/restore-world-rehearsal.sh" \
  "$backup_directory" "$validation_root/pre.json" "$validation_root/post.json" >/dev/null
cleanup_validation
trap - EXIT INT TERM

if [[ "$dry_run" = true ]]; then
  bash -n "$repository/ops/orchard-runtime/bin/restore-world-retirement-rehearsal.sh" \
    "$repository/scripts/assert-chest-retirement-source.sh"
  printf 'Retirement restore rehearsal dry-run passed: backup/rollback validation, exact drop-ready gates, pinned no-delete publish, retired schema check, and v2 generic-only identity parity are ordered.\n'
  exit 0
fi

[[ "$candidate_repository" = /* && -d "$candidate_repository" && ! -L "$candidate_repository" ]] || usage
candidate_repository=$(realpath "$candidate_repository")
[[ "$candidate_repository" != "$repository" ]] || {
  printf 'Retirement rehearsal requires a separate generic-only candidate checkout.\n' >&2
  exit 65
}

"$repository/scripts/assert-chest-retirement-source.sh" "$candidate_repository"
"$repository/scripts/world-module-source-manifest.sh" verify "$source_manifest" "$candidate_repository" >/dev/null

archive=$backup_directory/spacetime-data.tar.gz
program_inventory=$backup_directory/DEPLOYED-PROGRAMS.sha256
restore_root=$(mktemp -d /tmp/orchard-world-retirement.XXXXXX)
server_pid=''
server_name="orchard-retirement-rehearsal-$$"
server_registered=false
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  if [[ "$server_registered" = true ]]; then spacetime server remove "$server_name" >/dev/null 2>&1 || true; fi
  [[ "$restore_root" = /tmp/orchard-world-retirement.* ]] && rm -rf -- "$restore_root"
}
trap cleanup EXIT INT TERM

tar -C "$restore_root" -xzf "$archive"
restored_data=$restore_root/.spacetime-data
[[ -d "$restored_data" && "$(realpath "$restored_data")" = "$restore_root/.spacetime-data" ]] || {
  printf 'Retirement rehearsal archive lacks the isolated data directory.\n' >&2
  exit 66
}
[[ -s "$program_inventory" ]] || {
  printf 'Retirement requires a rollback-bundled deployed-program inventory.\n' >&2
  exit 66
}
(cd "$restored_data" && sha256sum -c "$program_inventory" >/dev/null)

spacetime start --listen-addr "127.0.0.1:$port" --data-dir "$restored_data" --non-interactive \
  >"$restore_root/host.log" 2>&1 &
server_pid=$!
for _attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/v1/ping" >/dev/null; then break; fi
  kill -0 "$server_pid" 2>/dev/null || { printf 'Retirement rehearsal host exited early.\n' >&2; exit 69; }
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/v1/ping" >/dev/null || {
  printf 'Retirement rehearsal host did not become healthy.\n' >&2
  exit 69
}
spacetime server add "$server_name" --url "http://127.0.0.1:$port" --no-fingerprint >/dev/null
server_registered=true

run_drop_ready_gate() {
  local target=$1 log=$2
  (umask 077
    WORLD_REJOIN_TOKENS_FILE="$token_file" \
    SPACETIMEDB_HOST="http://127.0.0.1:$port" \
    SPACETIMEDB_DATABASE="$database" \
    CHEST_MIGRATION_TARGET="$target" \
    CHEST_MIGRATION_STOP_AFTER=drop_ready \
    CHEST_MIGRATION_CONFIRM="migrate:$database" \
    CHEST_MIGRATION_CLIENTS_READY=1 \
    CHEST_MIGRATION_STUDIO_READY=1 \
    npm --prefix "$repository" run world:chest-migrate | tee "$log")
}

printf 'Proving restored transition state is exactly drop_ready with literal-zero custody/data counts...\n'
run_drop_ready_gate rehearsal "$pre_status_log"
WORLD_REJOIN_REQUIRE_GENERIC_ONLY=1 \
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="http://127.0.0.1:$port" \
SPACETIMEDB_DATABASE="$database" \
  npm --prefix "$repository" run world:rejoin-smoke -- capture "$pre_snapshot"

"$repository/scripts/assert-chest-retirement-source.sh" "$candidate_repository"
"$repository/scripts/world-module-source-manifest.sh" verify "$source_manifest" "$candidate_repository" >/dev/null
printf 'Publishing retired generic-only source to the isolated restore with destructive migration disabled...\n'
node --import tsx "$repository/scripts/legacy-cooking-release-gate.ts" "$candidate_repository"
spacetime publish "$database" \
  --server "$server_name" \
  --module-path "$candidate_repository/packages/world" \
  --delete-data=never \
  --yes=migrate,break-clients,skip-login \
  --no-config

node --import tsx "$repository/scripts/legacy-cooking-release-gate.ts" "$candidate_repository"

schema_json=$restore_root/retired-schema.json
spacetime describe "$database" --server "$server_name" --json --anonymous --no-config >"$schema_json"
npx --prefix "$repository" tsx "$repository/scripts/chest-retirement-schema.ts" "$schema_json"

printf 'Rechecking the retained status receipt after isolated retirement...\n'
run_drop_ready_gate rehearsal "$post_status_log"
WORLD_REJOIN_REQUIRE_GENERIC_ONLY=1 \
WORLD_REJOIN_TOKENS_FILE="$token_file" \
SPACETIMEDB_HOST="http://127.0.0.1:$port" \
SPACETIMEDB_DATABASE="$database" \
  npm --prefix "$repository" run world:rejoin-smoke -- verify "$pre_snapshot" "$post_snapshot"
"$repository/scripts/world-module-source-manifest.sh" verify "$source_manifest" "$candidate_repository" >/dev/null

printf 'Isolated retirement rehearsal passed; backup=%s pre=%s post=%s pre-status=%s post-status=%s.\n' \
  "$backup_directory" "$pre_snapshot" "$post_snapshot" "$pre_status_log" "$post_status_log"
