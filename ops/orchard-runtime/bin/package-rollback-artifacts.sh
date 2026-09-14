#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s /absolute/new-rollback-artifacts.tar.gz\n' "$0" >&2
  exit 64
}

[[ $# -eq 1 ]] || usage
output=$1
[[ "$output" = /* && ! -e "$output" && ! -e "$output.partial" ]] || usage

repository=${ORCHARD_ROLLBACK_REPOSITORY:-/home/toby/projects/orchard-cellar}
[[ "$repository" = /* && -d "$repository" ]] || usage
repository=$(realpath "$repository")

required_paths=(
  package.json
  package-lock.json
  tsconfig.base.json
  scripts/spacetime-build-checked.sh
  spacetime.json
  spacetime.local.json
  packages/assets/content
  packages/world/package.json
  packages/world/tsconfig.json
  packages/world/src
  packages/world/dist
  packages/sim/package.json
  packages/sim/tsconfig.json
  packages/sim/src
  packages/lifecycle-authoring/package.json
  packages/lifecycle-authoring/tsconfig.json
  packages/lifecycle-authoring/src
  packages/lifecycle-authoring/source
  packages/lifecycle-authoring/generated
  scripts/lifecycle-artifact-integrity.ts
  scripts/lifecycle-code-build.ts
  scripts/legacy-cooking-release-gate.ts
  scripts/legacy-cooking-release-gate.test.ts
  scripts/cooking-content-continuity.ts
  scripts/cooking-content-continuity.test.ts
  scripts/world-rejoin-snapshot.ts
  packages/client/dist
  packages/studio/dist
)

for relative_path in "${required_paths[@]}"; do
  source_path=$repository/$relative_path
  [[ -e "$source_path" ]] || {
    printf 'Required rollback input is missing: %s\n' "$source_path" >&2
    exit 66
  }
  [[ ! -L "$source_path" ]] || {
    printf 'Rollback input must not be a symbolic link: %s\n' "$source_path" >&2
    exit 65
  }
done

# Refuse links and special files at the source rather than following them. This
# both prevents a build artifact from reaching outside its tree and guarantees
# the resulting recovery archive contains directories and regular files only.
for relative_path in "${required_paths[@]}"; do
  source_path=$repository/$relative_path
  if find "$source_path" -type l -print -quit | grep -q .; then
    printf 'Rollback input contains a symbolic link: %s\n' "$source_path" >&2
    exit 65
  fi
  if find "$source_path" \! -type d \! -type f -print -quit | grep -q .; then
    printf 'Rollback input contains a special file: %s\n' "$source_path" >&2
    exit 65
  fi
done

staging_root=$(mktemp -d "${TMPDIR:-/tmp}/orchard-rollback-artifacts.XXXXXX")
archive_root=$staging_root/rollback-artifacts
cleanup() {
  [[ "$staging_root" = "${TMPDIR:-/tmp}"/orchard-rollback-artifacts.* ]] && rm -rf -- "$staging_root"
  rm -f -- "$output.partial"
}
trap cleanup EXIT INT TERM
install -d -m 0700 "$archive_root/repository" "$archive_root/service-units"

for relative_path in "${required_paths[@]}"; do
  target=$archive_root/repository/$relative_path
  install -d -m 0700 "$(dirname "$target")"
  cp -R --no-preserve=ownership -- "$repository/$relative_path" "$target"
done

declare -a unit_names=(orchard-world.service orchard-frontend.service orchard-studio.service)
declare -a unit_overrides=(
  "${ROLLBACK_WORLD_UNIT:-}"
  "${ROLLBACK_FRONTEND_UNIT:-}"
  "${ROLLBACK_STUDIO_UNIT:-}"
)

units_manifest=$archive_root/SERVICE-UNITS
: > "$units_manifest"
for index in "${!unit_names[@]}"; do
  unit=${unit_names[$index]}
  override=${unit_overrides[$index]}
  if [[ -n "$override" ]]; then
    fragment=$override
    dropins=''
  else
    fragment=$(systemctl show "$unit" --property=FragmentPath --value)
    dropins=$(systemctl show "$unit" --property=DropInPaths --value)
  fi
  [[ "$fragment" = /* && -f "$fragment" && ! -L "$fragment" && "$fragment" != *$'\n'* ]] || {
    printf 'Unit fragment is missing, unsafe, or not a regular file: %s\n' "$unit" >&2
    exit 66
  }

  unit_directory=$archive_root/service-units/$unit
  install -d -m 0700 "$unit_directory"
  if grep -Eiq '^[[:space:]]*(Environment|SetCredential|SetCredentialEncrypted)[[:space:]]*=.*(password|secret|token|private[_-]?key)[[:space:]]*=' "$fragment"; then
    printf 'Refusing to archive an inline service credential: %s\n' "$fragment" >&2
    exit 77
  fi
  install -m 0600 "$fragment" "$unit_directory/fragment.service"
  printf 'unit=%s\tfragment_source=%s\tbundle_path=service-units/%s/fragment.service\n' \
    "$unit" "$fragment" "$unit" >> "$units_manifest"

  dropin_index=0
  for dropin in $dropins; do
    [[ "$dropin" = /* && -f "$dropin" && ! -L "$dropin" && "$dropin" != *$'\n'* ]] || {
      printf 'Unit drop-in is missing, unsafe, or not a regular file: %s\n' "$dropin" >&2
      exit 66
    }
    if grep -Eiq '^[[:space:]]*(Environment|SetCredential|SetCredentialEncrypted)[[:space:]]*=.*(password|secret|token|private[_-]?key)[[:space:]]*=' "$dropin"; then
      printf 'Refusing to archive an inline service credential: %s\n' "$dropin" >&2
      exit 77
    fi
    dropin_index=$((dropin_index + 1))
    bundled_name=$(printf 'dropin-%03d-%s' "$dropin_index" "$(basename "$dropin")")
    install -m 0600 "$dropin" "$unit_directory/$bundled_name"
    printf 'unit=%s\tdropin_source=%s\tbundle_path=service-units/%s/%s\n' \
      "$unit" "$dropin" "$unit" "$bundled_name" >> "$units_manifest"
  done
done
chmod 0600 "$units_manifest"

git_head=unavailable
git_dirty=unknown
if git -C "$repository" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_head=$(git -C "$repository" rev-parse HEAD)
  if [[ -z "$(git -C "$repository" status --porcelain=v1 -- \
      package.json package-lock.json scripts/spacetime-build-checked.sh \
      spacetime.json spacetime.local.json tsconfig.base.json \
      packages/assets/content packages/world packages/sim)" ]]; then
    git_dirty=false
  else
    git_dirty=true
  fi
fi

node_version=$(node --version 2>/dev/null || printf 'unavailable')
npm_version=$(npm --version 2>/dev/null || printf 'unavailable')
spacetime_binary=$(command -v spacetime 2>/dev/null || true)
spacetime_binary_sha256=unavailable
if [[ -n "$spacetime_binary" && -f "$spacetime_binary" && ! -L "$spacetime_binary" ]]; then
  spacetime_binary_sha256=$(sha256sum "$spacetime_binary" | awk '{ print $1 }')
fi
{
  printf 'format=orchard-rollback-artifacts-v1\n'
  printf 'captured_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'repository=%s\n' "$repository"
  printf 'git_head=%s\n' "$git_head"
  printf 'world_source_dirty=%s\n' "$git_dirty"
  printf 'node_version=%s\n' "$node_version"
  printf 'npm_version=%s\n' "$npm_version"
  printf 'spacetime_binary_sha256=%s\n' "$spacetime_binary_sha256"
  printf 'deployed_module_restore=spacetime-data.tar.gz control-db plus program-bytes\n'
  printf 'world_source_scope=repository package manifests, SpaceTimeDB configuration, committed content pack, world source/build, sim source, and checked build wrapper\n'
  printf 'static_restore_scope=packages/client/dist and packages/studio/dist\n'
} > "$archive_root/PROVENANCE"
chmod 0600 "$archive_root/PROVENANCE"

(
  cd "$archive_root"
  find . -type f ! -name FILE-SHA256SUMS -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum > FILE-SHA256SUMS
  sha256sum -c FILE-SHA256SUMS >/dev/null
  chmod 0600 FILE-SHA256SUMS
)

install -d -m 0700 "$(dirname "$output")"
tar --one-file-system --hard-dereference -C "$staging_root" -czf "$output.partial" rollback-artifacts
chmod 0600 "$output.partial"
if tar -tvzf "$output.partial" | awk '$1 !~ /^[d-]/ { unsafe=1 } END { exit !unsafe }'; then
  printf 'Rollback archive contains a link or special file.\n' >&2
  exit 65
fi
mv "$output.partial" "$output"
printf 'Rollback artifacts packaged: %s\n' "$output"
