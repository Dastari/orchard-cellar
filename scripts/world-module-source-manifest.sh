#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s create|verify /absolute/manifest /absolute/repository\n' "$0" >&2
  exit 64
}

[[ $# -eq 3 ]] || usage
operation=$1
manifest=$2
repository=$3
[[ "$operation" = create || "$operation" = verify ]] || usage
[[ "$manifest" = /* && "$repository" = /* && -d "$repository" ]] || usage

# These are every repository-owned input to the world module build. Generated
# bindings and dist output are deliberately excluded: they are products of this
# source tree, while the dependency lock and SpaceTimeDB project configuration
# pin the external build inputs.
source_inputs=(
  package.json
  package-lock.json
  tsconfig.base.json
  spacetime.json
  spacetime.local.json
  packages/assets/content
  packages/sim/package.json
  packages/sim/tsconfig.json
  packages/sim/src
  packages/lifecycle-authoring/package.json
  packages/lifecycle-authoring/tsconfig.json
  packages/lifecycle-authoring/src
  packages/lifecycle-authoring/source
  packages/lifecycle-authoring/generated
  packages/world/package.json
  packages/world/tsconfig.json
  packages/world/src
  scripts/spacetime-build-checked.sh
  scripts/lifecycle-artifact-integrity.ts
  scripts/lifecycle-code-build.ts
  scripts/legacy-cooking-release-gate.ts
  scripts/legacy-cooking-release-gate.test.ts
  scripts/cooking-content-continuity.ts
  scripts/cooking-content-continuity.test.ts
  scripts/world-rejoin-snapshot.ts
  scripts/world-module-source-manifest.sh
)

write_manifest() {
  local output=$1 input file
  local -a files=()
  for input in "${source_inputs[@]}"; do
    [[ -e "$repository/$input" ]] || {
      printf 'World module source input is missing: %s\n' "$input" >&2
      return 66
    }
    [[ ! -L "$repository/$input" ]] || {
      printf 'World module source input must not be a symbolic link: %s\n' "$input" >&2
      return 65
    }
    if [[ -d "$repository/$input" ]]; then
      if find "$repository/$input" -type l -print -quit | grep -q .; then
        printf 'World module source input contains a symbolic link: %s\n' "$input" >&2
        return 65
      fi
      if find "$repository/$input" \! -type d \! -type f -print -quit | grep -q .; then
        printf 'World module source input contains a special file: %s\n' "$input" >&2
        return 65
      fi
      while IFS= read -r -d '' file; do files+=("$file"); done \
        < <(cd "$repository" && find "$input" -type f -print0)
    else
      [[ -f "$repository/$input" ]] || {
        printf 'World module source input must be a regular file: %s\n' "$input" >&2
        return 65
      }
      files+=("$input")
    fi
  done
  (cd "$repository" && printf '%s\0' "${files[@]}" | LC_ALL=C sort -z \
    | xargs -0 sha256sum --) > "$output"
}

if [[ "$operation" = create ]]; then
  [[ ! -L "$manifest" ]] || { printf 'Manifest path must not be a symlink.\n' >&2; exit 65; }
  temporary="$manifest.partial.$$"
  trap 'rm -f -- "$temporary"' EXIT INT TERM
  write_manifest "$temporary"
  chmod 0600 "$temporary"
  mv -f -- "$temporary" "$manifest"
  sha256sum "$manifest" | awk '{print $1}'
  exit 0
fi

[[ -f "$manifest" && ! -L "$manifest" ]] || {
  printf 'Pinned world module source manifest is missing or unsafe.\n' >&2
  exit 66
}
temporary=$(mktemp)
trap 'rm -f -- "$temporary"' EXIT INT TERM
write_manifest "$temporary"
if ! cmp -s -- "$manifest" "$temporary"; then
  printf 'World module source changed after the release gates; refusing to continue.\n' >&2
  diff -u -- "$manifest" "$temporary" >&2 || true
  exit 65
fi
sha256sum "$manifest" | awk '{print $1}'
