#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run only after the owner gives Go for this specific release in conversation.
# The owner manages Proxmox recovery snapshots. This lane makes no stored-data
# migration: any full private schema difference must use world-release.sh.
repository=/home/toby/projects/orchard-cellar
database=orchard-cellar-world
canonical_host=http://127.0.0.1:3000
[[ $# -eq 0 && "$(pwd -P)" = "$repository" ]] || exit 64
[[ "${SPACETIMEDB_SERVER:-local}" = local
  && "${SPACETIMEDB_DATABASE:-$database}" = "$database"
  && "${SPACETIMEDB_HOST:-$canonical_host}" = "$canonical_host" ]] || {
  printf 'Routine release requires the canonical existing production target.\n' >&2; exit 64;
}
evidence=${WORLD_ROUTINE_RELEASE_DIRECTORY:-}
content_candidate=${WORLD_RELEASE_CONTENT_CANDIDATE:-}
content_candidate_sha256=${WORLD_RELEASE_CONTENT_CANDIDATE_SHA256:-}
content_owner_label=${WORLD_RELEASE_CONTENT_OWNER_LABEL:-}
token_file=${WORLD_REJOIN_TOKENS_FILE:-}
[[ "$evidence" = /* && ! -e "$evidence" && ! -L "$evidence"
  && "$content_candidate" = /* && -f "$content_candidate" && ! -L "$content_candidate"
  && "$content_candidate_sha256" =~ ^[a-f0-9]{64}$
  && "$content_owner_label" =~ ^[A-Za-z0-9._-]+$
  && "$token_file" = /* && -f "$token_file" && ! -L "$token_file" ]] || {
  printf 'Set a new WORLD_ROUTINE_RELEASE_DIRECTORY and the existing reviewed content candidate/owner/token inputs.\n' >&2; exit 64;
}
[[ "${WORLD_RELEASE_CONTENT_CONFIRM:-}" = "publish:$content_candidate_sha256:$database"
  && "$(stat -c '%a' "$token_file")" = 600 ]] || exit 77
export WORLD_REJOIN_REQUIRE_REFRESH=1 SPACETIMEDB_HOST="$canonical_host" SPACETIMEDB_DATABASE="$database"
helper=(node --import tsx scripts/world-release-routine.ts)
install -d -m 0700 "$evidence" "$evidence/rollback" "$evidence/staged/packages/client" "$evidence/staged/packages/studio"
exec 9>"$repository/.git/orchard-release.lock"
flock -n 9 || { printf 'Another guarded release is running.\n' >&2; exit 75; }
printf 'candidate\n' > "$evidence/status"
published=false
traffic_stopped=false
complete=false
on_exit() {
  status=$?
  if [[ "$complete" != true && "$traffic_stopped" = true ]]; then
    sudo systemctl stop orchard-frontend.service orchard-studio.service || true
    if [[ "$published" = true ]]; then
      printf 'Release failed after publication began; web traffic remains stopped. Inspect %s. No automatic authority rollback.\n' "$evidence" >&2
      printf 'publication-started-review-required\n' > "$evidence/status"
    else
      printf 'failed-before-publication-recovery-required\n' > "$evidence/status"
      for app in client studio; do
        if [[ -d "$evidence/rollback/$app-dist" ]]; then
          if [[ -e "$repository/packages/$app/dist" ]]; then
            mv -T "$repository/packages/$app/dist" "$evidence/failed-$app-dist" || return "$status"
          fi
          cp -aT "$evidence/rollback/$app-dist" "$repository/packages/$app/dist" || return "$status"
          "${helper[@]}" manifest "$repository/packages/$app/dist" > "$evidence/$app-restored.sha256" || return "$status"
          cmp "$evidence/$app-static-before.sha256" "$evidence/$app-restored.sha256" || return "$status"
        fi
      done
      sudo systemctl start orchard-frontend.service orchard-studio.service || return "$status"
      systemctl is-active --quiet orchard-frontend.service || return "$status"
      systemctl is-active --quiet orchard-studio.service || return "$status"
      for attempt in $(seq 1 30); do
        if CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net ops/orchard-runtime/bin/validate-client-static.sh >/dev/null 2>&1 \
          && STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net ops/orchard-runtime/bin/validate-studio-static.sh >/dev/null 2>&1; then break; fi
        [[ "$attempt" -lt 30 ]] || return "$status"
        sleep 1
      done
      printf 'failed-before-publication-original-static-restored\n' > "$evidence/status"
    fi
  fi
  return "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm run world:rejoin-smoke -- refresh
npm run world:content-head -- verify "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
npm run world:content-head -- assert-current "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
systemctl is-active --quiet orchard-world.service
systemctl is-active --quiet orchard-frontend.service
systemctl is-active --quiet orchard-studio.service
"${helper[@]}" live-program "$evidence/rollback/world.js" > "$evidence/live-program-before.json"
for app in client studio; do
  "${helper[@]}" manifest "packages/$app/dist" > "$evidence/$app-static-before.sha256"
  cp -a "packages/$app/dist" "$evidence/rollback/$app-dist"
  "${helper[@]}" manifest "$evidence/rollback/$app-dist" > "$evidence/$app-rollback.sha256"
  cmp "$evidence/$app-static-before.sha256" "$evidence/$app-rollback.sha256"
done
assert_original_static() {
  for app in client studio; do
    "${helper[@]}" manifest "packages/$app/dist" > "$evidence/$app-static-current.sha256"
    cmp "$evidence/$app-static-before.sha256" "$evidence/$app-static-current.sha256"
  done
}
for unit in orchard-world orchard-frontend orchard-studio; do
  systemctl cat "$unit.service" > "$evidence/rollback/$unit.service"
done
"${helper[@]}" manifest "$evidence/rollback" > "$evidence/rollback.sha256"

# Pin before tests, including presentation source and generated bindings. No
# git checkout/stash is involved; every concurrent source edit fails the pin.
scripts/world-module-source-manifest.sh create "$evidence/world-source.sha256" "$repository"
source_manifest() {
  for tree in packages scripts ops/orchard-runtime; do
    printf 'TREE %s\n' "$tree"
    "${helper[@]}" manifest "$tree" source
  done
}
source_manifest > "$evidence/repository-source.sha256"
assert_source() {
  scripts/world-module-source-manifest.sh verify "$evidence/world-source.sha256" "$repository" >/dev/null
  source_manifest > "$evidence/current-source.sha256"
  cmp "$evidence/repository-source.sha256" "$evidence/current-source.sha256"
}
npm run lifecycle:integrity
node --import tsx scripts/legacy-cooking-release-gate.ts "$repository"
npm run typecheck
npm run world:release:typecheck
npx vitest run
npm run lint
npm run content:validate
npm run build --workspace @orchard/world
cp packages/world/dist/bundle.js "$evidence/candidate-world.js"
candidate_program_hash=$("${helper[@]}" keccak "$evidence/candidate-world.js")
printf '%s\n' "$candidate_program_hash" > "$evidence/candidate-program.keccak256"

# Extract both complete schemas from the actual immutable module bytes. This
# includes private escrow/receipt/container rows and rejects even additive DDL.
spacetime generate --lang typescript --include-private --js-path "$evidence/rollback/world.js" \
  --out-dir "$evidence/schema-before" --no-config --yes
spacetime generate --lang typescript --include-private --js-path "$evidence/candidate-world.js" \
  --out-dir "$evidence/schema-candidate" --no-config --yes
"${helper[@]}" same-schema "$evidence/schema-before" "$evidence/schema-candidate"
# Visibility is reflected by membership in the public binding surface, so pin
# that surface too; include-private alone intentionally includes both classes.
spacetime generate --lang typescript --js-path "$evidence/rollback/world.js" \
  --out-dir "$evidence/public-bindings-before" --no-config --yes
spacetime generate --lang typescript --js-path "$evidence/candidate-world.js" \
  --out-dir "$evidence/public-bindings" --no-config --yes
"${helper[@]}" same-schema "$evidence/public-bindings-before" "$evidence/public-bindings"
"${helper[@]}" same-schema "$evidence/public-bindings" packages/world-bindings/src
npm run build --workspace @orchard/client -- --mode client-production --outDir "$evidence/staged/packages/client/dist"
bash scripts/build-reviewed-studio.sh "$evidence/reviewed-studio-source" "$evidence/staged/packages/studio/dist"
"${helper[@]}" static "$evidence/staged/packages/client/dist"
"${helper[@]}" static "$evidence/staged/packages/studio/dist"
(cd "$evidence/staged" && "$repository/node_modules/.bin/tsx" "$repository/scripts/check-client-build-chunks.ts")
# Keep immutable URLs for already connected browsers loading old lazy chunks.
# Clean candidate chunk checks above run before this collision-checked union.
for app in client studio; do
  "${helper[@]}" retain-assets "$evidence/rollback/$app-dist" "$evidence/staged/packages/$app/dist"
done
"${helper[@]}" manifest "$evidence/staged" > "$evidence/staged.sha256"
assert_source
git diff --check
npm run world:rejoin-smoke -- refresh
"${helper[@]}" live-program > "$evidence/live-program-pre-publish.json"
cmp "$evidence/live-program-before.json" "$evidence/live-program-pre-publish.json"
npm run world:content-head -- assert-current "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
assert_original_static

# Only web services stop. Never stop the authority, migrate chest custody, or
# close another player's frame to make this same-schema code update pass.
traffic_stopped=true
sudo systemctl stop orchard-frontend.service orchard-studio.service
npm run world:rejoin-smoke -- capture "$evidence/rejoin-before.json"
"${helper[@]}" expected-snapshot "$evidence/rejoin-before.json" "$content_candidate" "$evidence/rejoin-expected.json"
assert_source
"${helper[@]}" live-program > "$evidence/live-program-final-cas.json"
cmp "$evidence/live-program-before.json" "$evidence/live-program-final-cas.json"
npm run world:content-head -- assert-current "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
"${helper[@]}" manifest "$evidence/rollback" > "$evidence/rollback-recheck.sha256"
cmp "$evidence/rollback.sha256" "$evidence/rollback-recheck.sha256"
[[ "$("${helper[@]}" keccak "$evidence/candidate-world.js")" = "$candidate_program_hash" ]]
assert_original_static
published=true
spacetime publish "$database" --server "$canonical_host" --js-path "$evidence/candidate-world.js" \
  --delete-data=never --yes=remote,migrate --no-config
"${helper[@]}" live-program > "$evidence/live-program-after.json"
node --input-type=module - "$evidence/live-program-before.json" "$evidence/live-program-after.json" "$candidate_program_hash" <<'JS'
import fs from 'node:fs';
const [beforePath,afterPath,hash]=process.argv.slice(2);
const before=JSON.parse(fs.readFileSync(beforePath));const after=JSON.parse(fs.readFileSync(afterPath));
if(before.identity!==after.identity||after.programHash!==hash)throw Error('routine_published_program_mismatch');
JS
assert_source
CONTENT_HEAD_RELEASE_CONFIRM="$WORLD_RELEASE_CONTENT_CONFIRM" \
  npm run world:content-head -- apply "$content_candidate" "$content_candidate_sha256" "$content_owner_label"
npm run world:rejoin-smoke -- verify "$evidence/rejoin-expected.json" "$evidence/rejoin-after.json"
"${helper[@]}" manifest "$evidence/staged" > "$evidence/staged-recheck.sha256"
cmp "$evidence/staged.sha256" "$evidence/staged-recheck.sha256"
assert_original_static
for app in client studio; do
  mv "packages/$app/dist" "$evidence/original-$app-dist"
  mv "$evidence/staged/packages/$app/dist" "packages/$app/dist"
done
CLIENT_STATIC_DRY_RUN=true CLIENT_STATIC_UNIT="$(systemctl show orchard-frontend.service --property=FragmentPath --value)" \
  ops/orchard-runtime/bin/validate-client-static.sh
STUDIO_STATIC_DRY_RUN=true STUDIO_STATIC_UNIT="$(systemctl show orchard-studio.service --property=FragmentPath --value)" \
  ops/orchard-runtime/bin/validate-studio-static.sh
sudo systemctl start orchard-frontend.service orchard-studio.service
for attempt in $(seq 1 30); do
  if CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net ops/orchard-runtime/bin/validate-client-static.sh >/dev/null 2>&1 \
    && STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net ops/orchard-runtime/bin/validate-studio-static.sh >/dev/null 2>&1; then break; fi
  [[ "$attempt" -lt 30 ]] || exit 1
  sleep 1
done
for app in client studio; do
  origin=https://orchard.dastari.net
  [[ "$app" != studio ]] || origin=https://cellar.dastari.net
  curl --max-time 20 -fsS "$origin/" -o "$evidence/$app-served.html"
  cmp "packages/$app/dist/index.html" "$evidence/$app-served.html"
  "${helper[@]}" static "$repository/packages/$app/dist" "$origin"
done
complete=true
traffic_stopped=false
printf 'deployed\n' > "$evidence/status"
printf 'Routine same-schema release completed; verified code rollback and durable-state parity evidence: %s\n' "$evidence"
