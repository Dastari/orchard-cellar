#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: [WORLD_BACKUP_LEAVE_STOPPED=true|false] %s /absolute/new-backup-directory\n' "$0" >&2
  exit 64
}

[[ $# -eq 1 ]] || usage
destination=$1
[[ "$destination" = /* ]] || usage
[[ ! -e "$destination" ]] || {
  printf 'Refusing to overwrite existing path: %s\n' "$destination" >&2
  exit 73
}

repository=/home/toby/projects/orchard-cellar
data_directory=$repository/.spacetime-data
service=orchard-world.service
archive_partial=$destination/spacetime-data.tar.gz.partial
archive=$destination/spacetime-data.tar.gz
rollback_archive=$destination/rollback-artifacts.tar.gz
rollback_source=${WORLD_ROLLBACK_ARTIFACTS_FILE:-}
leave_stopped=${WORLD_BACKUP_LEAVE_STOPPED:-false}
maintenance_nice=${WORLD_MAINTENANCE_NICE_LEVEL:-15}

[[ "$leave_stopped" = true || "$leave_stopped" = false ]] || usage
[[ "$maintenance_nice" =~ ^([0-9]|1[0-9])$ ]] || {
  printf 'WORLD_MAINTENANCE_NICE_LEVEL must be between 0 and 19.\n' >&2
  exit 64
}

# Archive compression and verification can otherwise saturate a core and the
# storage queue. Lower this shell before any heavy work so tar, checksum tools,
# rollback packaging, and their descendants cannot starve the host services.
current_nice=$(ps -o ni= -p $$ | tr -d ' ')
if (( current_nice < maintenance_nice )); then
  renice "$maintenance_nice" -p $$ >/dev/null \
    || printf 'Warning: could not lower backup CPU priority.\n' >&2
fi
if command -v ionice >/dev/null; then
  ionice -c 3 -p $$ >/dev/null \
    || printf 'Warning: could not lower backup I/O priority.\n' >&2
fi

[[ -d "$data_directory" ]] || {
  printf 'Missing world data directory: %s\n' "$data_directory" >&2
  exit 66
}
[[ "$(realpath "$data_directory")" = "$repository/.spacetime-data" ]] || {
  printf 'World data path did not resolve to the canonical directory.\n' >&2
  exit 65
}
systemctl is-active --quiet "$service" || {
  printf 'Expected %s to be active before backup.\n' "$service" >&2
  exit 69
}

install -d -m 0700 "$destination"
restart_required=true
restart_world() {
  if [[ "$restart_required" = true && "$leave_stopped" = false ]]; then
    sudo systemctl start "$service" || true
  fi
}
trap restart_world EXIT INT TERM

sudo systemctl stop "$service"
if systemctl is-active --quiet "$service"; then
  printf '%s did not stop cleanly.\n' "$service" >&2
  exit 70
fi
if pgrep -u toby -f 'spacetimedb-standalone start.*orchard-cellar/.spacetime-data' >/dev/null; then
  printf 'A SpaceTimeDB process still owns the live data directory.\n' >&2
  exit 70
fi

# SpaceTimeDB's data tree can contain multiple directory entries for the same
# inode. GNU tar otherwise records later entries as hard-link members, while the
# restore guard deliberately accepts directories and regular files only.
tar --one-file-system --hard-dereference -C "$repository" -czf "$archive_partial" .spacetime-data
chmod 0600 "$archive_partial"
mv "$archive_partial" "$archive"

# Preserve the exact static sites and service policy that were serving before
# the release. A guarded release can capture this before overwriting dist; a
# standalone backup captures the same inputs while the authority is quiesced.
if [[ -n "$rollback_source" ]]; then
  [[ "$rollback_source" = /* && -f "$rollback_source" && ! -L "$rollback_source" ]] || {
    printf 'WORLD_ROLLBACK_ARTIFACTS_FILE must name an absolute regular archive.\n' >&2
    exit 66
  }
  [[ "$(stat -c '%a' "$rollback_source")" = 600 ]] || {
    printf 'WORLD_ROLLBACK_ARTIFACTS_FILE must have mode 0600.\n' >&2
    exit 77
  }
  install -m 0600 "$rollback_source" "$rollback_archive"
else
  "$repository/ops/orchard-runtime/bin/package-rollback-artifacts.sh" "$rollback_archive"
fi

if tar -tzf "$rollback_archive" | awk '/(^|\/)\.\.($|\/)|^\// { found=1 } END { exit !found }'; then
  printf 'Rollback archive contains an unsafe path.\n' >&2
  exit 65
fi
if tar -tvzf "$rollback_archive" | awk '$1 !~ /^[d-]/ { unsafe=1 } END { exit !unsafe }'; then
  printf 'Rollback archive contains a link or special file.\n' >&2
  exit 65
fi
rollback_validation_root=$(mktemp -d /tmp/orchard-backup-rollback-validation.XXXXXX)
rollback_validation_status=0
(
  tar -C "$rollback_validation_root" -xzf "$rollback_archive"
  validation_root=$rollback_validation_root/rollback-artifacts
  required_files=(
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
  for relative_path in "${required_files[@]}"; do
    [[ -f "$validation_root/$relative_path" && ! -L "$validation_root/$relative_path" ]]
  done
  ! find "$validation_root" -type l -o \! -type d \! -type f | grep -q .
  cd "$validation_root"
  sha256sum -c FILE-SHA256SUMS >/dev/null
) || rollback_validation_status=$?
if [[ "$rollback_validation_root" = /tmp/orchard-backup-rollback-validation.* ]]; then
  find "$rollback_validation_root" -depth -delete
fi
[[ "$rollback_validation_status" -eq 0 ]] || {
  printf 'Rollback archive failed its internal file validation.\n' >&2
  exit 65
}

# SpaceTimeDB 2.8.x stores program bytes under a Keccak-256 program-hash key,
# which is not the file's SHA-256 digest. Record an independent SHA-256
# inventory so the restored paths and exact bytes can be verified without
# copying the deployable binaries a second time.
(
  cd "$data_directory"
  find program-bytes -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum > "$destination/DEPLOYED-PROGRAMS.sha256"
)
chmod 0600 "$destination/DEPLOYED-PROGRAMS.sha256"
[[ -s "$destination/DEPLOYED-PROGRAMS.sha256" ]] || {
  printf 'Quiesced world has no deployed program-byte inventory.\n' >&2
  exit 65
}
(
  cd "$destination"
  sha256sum spacetime-data.tar.gz > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
  sha256sum rollback-artifacts.tar.gz DEPLOYED-PROGRAMS.sha256 > ROLLBACK-SHA256SUMS
  sha256sum -c ROLLBACK-SHA256SUMS >/dev/null
  {
    printf 'captured_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'source=%s\n' "$data_directory"
    printf 'service=%s\n' "$service"
    printf 'database=orchard-cellar-world\n'
    printf 'archive_bytes=%s\n' "$(stat -c %s spacetime-data.tar.gz)"
    printf 'rollback_bundle_version=1\n'
    printf 'rollback_archive=rollback-artifacts.tar.gz\n'
    printf 'deployed_program_inventory=DEPLOYED-PROGRAMS.sha256\n'
  } > MANIFEST
  chmod 0600 SHA256SUMS ROLLBACK-SHA256SUMS MANIFEST
)

if [[ "$leave_stopped" = true ]]; then
  restart_required=false
  printf 'World backup verified; authority remains stopped for guarded release: %s\n' "$destination"
  exit 0
fi

sudo systemctl start "$service"
restart_required=false
for _attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/v1/ping >/dev/null; then
    printf 'World backup verified: %s\n' "$destination"
    exit 0
  fi
  sleep 1
done

printf '%s restarted but its health endpoint did not recover in time.\n' "$service" >&2
exit 69
