#!/usr/bin/env bash
set -euo pipefail
umask 077

# Build the reviewed UI in isolation with this release's generated API and atlas.
# Neither source checkout nor the currently served static directories is changed.
repository=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
reviewed=/home/toby/projects/orchard-cellar-studio-release
work=${1:-}
output=${2:-}
[[ $# -eq 2 && "$work" = /* && "$output" = /* && ! -e "$work" && ! -L "$work" && ! -e "$output" && ! -L "$output" ]] || {
  printf 'Usage: build-reviewed-studio.sh /absolute/new-workspace /absolute/new-output\n' >&2
  exit 64
}
node "$reviewed/packages/studio/scripts/verify-ui-kit.mjs"
mkdir -p -- "$work"
for file in package.json package-lock.json tsconfig.base.json vitest.config.ts eslint.config.js; do
  cp -- "$reviewed/$file" "$work/$file"
done
for tree in packages scripts ui ops; do
  rsync -a --exclude=node_modules --exclude=dist "$reviewed/$tree/" "$work/$tree/"
done
for app in client studio; do
  generated="$work/packages/$app/public/generated"
  if [[ -L "$generated" ]]; then
    [[ "$(realpath "$generated")" = "$work/packages/assets/generated" ]] || exit 65
    rm -- "$generated"
    cp -a "$work/packages/assets/generated" "$generated"
  fi
done
music="$work/packages/studio/public/music"
if [[ -L "$music" ]]; then
  [[ "$(realpath "$music")" = "$work/packages/client/public/music" ]] || exit 65
  rm -- "$music"
  cp -a "$work/packages/client/public/music" "$music"
fi
install -m 0600 "$reviewed/.env.studio-production.local" "$work/.env.studio-production.local"
# Keep the guard byte-for-byte, including when a future reviewed source changes it.
cmp "$repository/packages/studio/scripts/verify-ui-kit.mjs" "$work/packages/studio/scripts/verify-ui-kit.mjs"
rsync -a --delete "$repository/packages/world-bindings/src/" "$work/packages/world-bindings/src/"
rsync -a --delete "$repository/packages/assets/content/" "$work/packages/assets/content/"
for package in sim auth engine assets lifecycle-authoring; do
  rsync -a --delete --exclude=node_modules --exclude=dist "$repository/packages/$package/" "$work/packages/$package/"
done
# Retain the reviewed renderer's small engine adapters over the current terrain
# implementation; these adapters depend on the kit rather than retired game UI.
for file in loading-screen.ts tile-raster.ts tile-raster.test.ts sprite-variant.ts sprite-variant.test.ts; do
  cp "$reviewed/packages/engine/src/$file" "$work/packages/engine/src/$file"
done
printf '\nexport * from "./tile-raster.js";\n' >> "$work/packages/engine/src/index.ts"
# The renderer stays reviewed; its content model must understand new quest kinds.
for file in model.ts model.test.ts; do
  cp "$repository/packages/studio/src/tools/narrative/$file" "$work/packages/studio/src/tools/narrative/$file"
done
rsync -a --delete "$repository/packages/client/public/generated/" "$work/packages/studio/public/generated/"
cp "$work/package-lock.json" "$work/reviewed-package-lock.json"
(
  cd -- "$work"
  # The reviewed checkout added its canvas tooling after its last lock update.
  # Reconcile only the isolated copy, then pin and use the resulting lock.
  npm install --package-lock-only --ignore-scripts --offline --no-audit --no-fund
  node "$repository/scripts/studio-release-inputs.mjs" "$work" "$work/source-manifest.json"
  npm ci --ignore-scripts --offline --no-audit --no-fund
  npm run typecheck -w @orchard/studio
  npm run build -w @orchard/studio -- --mode studio-production --outDir "$output"
)
node "$repository/scripts/studio-release-inputs.mjs" "$work" "$work/source-after.json"
cmp "$work/source-manifest.json" "$work/source-after.json"
cmp "$repository/packages/studio/scripts/verify-ui-kit.mjs" "$work/packages/studio/scripts/verify-ui-kit.mjs"
printf 'Reviewed Studio staged at %s; source evidence %s\n' "$output" "$work/source-manifest.json"
