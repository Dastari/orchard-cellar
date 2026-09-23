#!/usr/bin/env bash
set -euo pipefail
umask 077

# Stage the integrated workspace without changing source or served static files.
# Keep this CLI stable for the guarded world release callers.
repository=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
work=${1:-}
output=${2:-}
[[ $# -eq 2 && "$work" = /* && "$output" = /* && ! -e "$work" && ! -L "$work" && ! -e "$output" && ! -L "$output" ]] || {
  printf 'Usage: build-reviewed-studio.sh /absolute/new-workspace /absolute/new-output\n' >&2
  exit 64
}
work=$(realpath -m -- "$work")
output=$(realpath -m -- "$output")
for destination in "$work" "$output"; do
  if [[ "$destination" = "$repository" || "$destination" = "$repository/"* ]]; then
    printf 'Studio staging destinations must be outside the source repository.\n' >&2
    exit 64
  fi
done
if [[ "$work" = "$output" || "$work" = "$output/"* || "$output" = "$work/"* ]]; then
  printf 'Studio workspace and output must be separate directories.\n' >&2
  exit 64
fi
node "$repository/packages/studio/scripts/verify-ui-kit.mjs"
mkdir -p -- "$work"
for file in package.json package-lock.json tsconfig.base.json vitest.config.ts eslint.config.js; do
  cp -- "$repository/$file" "$work/$file"
done
for tree in packages scripts ui ops; do
  rsync -a --exclude=node_modules --exclude=dist "$repository/$tree/" "$work/$tree/"
done
# Materialize only the known shared public-resource links inside the snapshot.
# The manifest rejects any other symlinks instead of reading an external source.
for app in client studio; do
  generated="$work/packages/$app/public/generated"
  if [[ -L "$generated" ]]; then
    [[ "$(realpath "$generated")" = "$work/packages/assets/generated" ]] || exit 65
    rm -- "$generated"
    cp -a "$work/packages/assets/generated" "$generated"
  fi
done
install -m 0600 "$repository/.env.studio-production.local" "$work/.env.studio-production.local"
(
  cd -- "$work"
  # The checked lockfile is the complete dependency authority for both clients.
  npm ci --ignore-scripts --offline --no-audit --no-fund
  # Public UI files are generated from the canonical shared package. Include
  # their completed copies in the baseline before checking build immutability.
  npm run ui:assets -w @orchard/tools
  node "$repository/scripts/studio-release-inputs.mjs" "$work" "$work/source-manifest.json"
  npm run typecheck -w @orchard/studio
  npm run build -w @orchard/studio -- --mode studio-production --outDir "$output"
)
node "$repository/scripts/studio-release-inputs.mjs" "$work" "$work/source-after.json"
cmp "$work/source-manifest.json" "$work/source-after.json"
cmp "$repository/packages/studio/scripts/verify-ui-kit.mjs" "$work/packages/studio/scripts/verify-ui-kit.mjs"
printf 'Integrated Studio staged at %s; source evidence %s\n' "$output" "$work/source-manifest.json"
