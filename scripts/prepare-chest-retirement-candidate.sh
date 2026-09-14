#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/prepare-chest-retirement-candidate.sh \
         /absolute/generic-only-candidate-repository /absolute/new-source-manifest

Builds and generates an isolated post-drop candidate, rejects every legacy chest
storage/mapping/session/reducer/binding surface, builds both browser consumers,
then pins every world-module source input.  It never connects to SpacetimeDB.

The candidate must be a separate checkout/worktree.  Keep the transitional
production checkout intact because it contains the authenticated drain reducers
and is part of the rollback package.
USAGE
  exit 64
}

[[ $# -eq 2 ]] || usage
tool_repository=/home/toby/projects/orchard-cellar
candidate=$1
manifest=$2

[[ "$candidate" = /* && -d "$candidate" && ! -L "$candidate" ]] || usage
candidate=$(realpath "$candidate")
[[ "$candidate" != "$tool_repository" ]] || {
  printf 'Retirement candidate must be an isolated checkout, not the live transition checkout.\n' >&2
  exit 65
}
[[ "$manifest" = /* && ! -e "$manifest" && ! -L "$manifest" ]] || usage
manifest_parent=$(dirname "$manifest")
[[ -d "$manifest_parent" && ! -L "$manifest_parent" ]] || usage
for required in package.json package-lock.json packages/world/package.json \
  packages/client/package.json packages/studio/package.json; do
  [[ -f "$candidate/$required" && ! -L "$candidate/$required" ]] || {
    printf 'Candidate input is missing or unsafe: %s\n' "$required" >&2
    exit 66
  }
done

printf 'Building isolated generic-only world candidate...\n'
npm --prefix "$candidate" run build --workspace @orchard/world
npm --prefix "$candidate" run generate --workspace @orchard/world
npm --prefix "$candidate" run typecheck --workspace @orchard/world-bindings
"$tool_repository/scripts/assert-chest-retirement-source.sh" "$candidate"

printf 'Building candidate consumers against freshly generated bindings...\n'
npm --prefix "$candidate" run typecheck --workspace @orchard/client
npm --prefix "$candidate" run typecheck --workspace @orchard/studio
npm --prefix "$candidate" run build --workspace @orchard/client -- --mode client-production
npm --prefix "$candidate" run build --workspace @orchard/studio -- --mode studio-production

source_hash=$("$tool_repository/scripts/world-module-source-manifest.sh" create "$manifest" "$candidate")
verify_candidate() {
  local actual
  actual=$("$tool_repository/scripts/world-module-source-manifest.sh" verify "$manifest" "$candidate")
  [[ "$actual" = "$source_hash" ]] || {
    printf 'Candidate source manifest digest changed unexpectedly.\n' >&2
    exit 65
  }
  "$tool_repository/scripts/assert-chest-retirement-source.sh" "$candidate" >/dev/null
}

# Repeat the schema-producing steps after pinning.  This detects generated output
# or build hooks that attempted to rewrite a source input after the first gate.
verify_candidate
npm --prefix "$candidate" run build --workspace @orchard/world
npm --prefix "$candidate" run generate --workspace @orchard/world
npm --prefix "$candidate" run typecheck --workspace @orchard/world-bindings
verify_candidate

printf 'Retirement candidate prepared: repository=%s manifest=%s sha256=%s\n' \
  "$candidate" "$manifest" "$source_hash"
