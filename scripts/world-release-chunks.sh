#!/usr/bin/env bash
set -euo pipefail
umask 077

# Static-world S5b release hook, called by world-release-routine.sh once the release
# is deployed (after the content CAS, with the web services serving the new build).
#
#   WORLD_RELEASE_CHUNKS=off      (default) do nothing.
#   WORLD_RELEASE_CHUNKS=check    fail unless the published chunk heads match the live
#                                 map revision, content hash and served asset revision.
#   WORLD_RELEASE_CHUNKS=publish  if the map, content or assets changed since the heads
#                                 were published, run the publish pipeline (it needs
#                                 WORLD_RELEASE_CHUNKS_CONFIRM=publish:<manifestHash>:<db>),
#                                 then check again.
#
# Stale heads fail this check but never lock players out: nothing here removes or
# disables heads, and the client falls back while they are stale.
mode=${WORLD_RELEASE_CHUNKS:-off}
case "$mode" in
  off) printf 'World chunk heads: skipped (WORLD_RELEASE_CHUNKS=off).\n'; exit 0 ;;
  check | publish) ;;
  *) printf 'WORLD_RELEASE_CHUNKS must be off, check or publish.\n' >&2; exit 64 ;;
esac
evidence=${1:-}
host=${WORLD_CHUNKS_HOST:-}
database=${WORLD_CHUNKS_DATABASE:-}
origin=${WORLD_CHUNKS_ORIGIN:-}
chunk_dir=${ORCHARD_WORLD_CHUNK_DIR:-}
[[ $# -eq 1 && "$evidence" = /* && ! -e "$evidence" && ! -L "$evidence"
  && -n "$host" && -n "$database" && -n "$origin"
  && "${WORLD_CHUNKS_TOKEN_FILE:-}" = /* ]] || {
  printf 'usage: WORLD_CHUNKS_{HOST,DATABASE,ORIGIN,TOKEN_FILE} world-release-chunks.sh NEW_EVIDENCE_DIRECTORY\n' >&2; exit 64;
}
[[ "$mode" != publish || "$chunk_dir" = /* ]] || {
  printf 'WORLD_RELEASE_CHUNKS=publish needs the absolute ORCHARD_WORLD_CHUNK_DIR the frontend serves.\n' >&2; exit 64;
}
install -d -m 0700 "$evidence"
pipeline=(node --import tsx scripts/world-chunks-publish.ts)
target=(--host "$host" --database "$database" --origin "$origin")

status=0
"${pipeline[@]}" check "${target[@]}" --report "$evidence/check-before.json" || status=$?
if [[ "$status" -eq 0 ]]; then
  printf 'World chunk heads: fresh (map, content and assets unchanged since they were published).\n'
  exit 0
fi
# 1 is "stale"; anything else is an error of the check itself.
[[ "$status" -eq 1 ]] || exit "$status"
if [[ "$mode" = check ]]; then
  printf 'World chunk heads are stale or unpublished: see %s/check-before.json.\n' "$evidence" >&2
  exit 1
fi
WORLD_CHUNKS_PUBLISH_CONFIRM="${WORLD_RELEASE_CHUNKS_CONFIRM:-}" ORCHARD_WORLD_CHUNK_DIR="$chunk_dir" \
  "${pipeline[@]}" publish "${target[@]}" --chunk-dir "$chunk_dir" --report "$evidence/publish.json"
"${pipeline[@]}" check "${target[@]}" --report "$evidence/check-after.json"
printf 'World chunk heads: published and fresh.\n'
