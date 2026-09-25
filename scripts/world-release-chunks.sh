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
#                                 WORLD_RELEASE_CHUNKS_CONFIRM=publish:<manifestHash>:<contentHash>:<db>),
#                                 then check again. Without the right confirmation it
#                                 exits 77 and publish.json records the value to use.
#
# WORLD_CHUNKS_REFRESH=rejoin refreshes the token file through the rejoin refresh path
# before every pipeline run (the file must be refresh capable).
#
# Pipeline exit codes: 0 fresh/done, 3 stale heads, anything else an error. An error in
# a check is never treated as stale and never leads to a publish.
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
refresh=${WORLD_CHUNKS_REFRESH:-none}
[[ $# -eq 1 && "$evidence" = /* && ! -e "$evidence" && ! -L "$evidence"
  && -n "$host" && -n "$database" && -n "$origin"
  && "${WORLD_CHUNKS_TOKEN_FILE:-}" = /* ]] || {
  printf 'usage: WORLD_CHUNKS_{HOST,DATABASE,ORIGIN,TOKEN_FILE} world-release-chunks.sh NEW_EVIDENCE_DIRECTORY\n' >&2; exit 64;
}
[[ "$refresh" = none || "$refresh" = rejoin ]] || {
  printf 'WORLD_CHUNKS_REFRESH must be none or rejoin.\n' >&2; exit 64;
}
[[ "$mode" != publish || "$chunk_dir" = /* ]] || {
  printf 'WORLD_RELEASE_CHUNKS=publish needs the absolute ORCHARD_WORLD_CHUNK_DIR the frontend serves.\n' >&2; exit 64;
}
install -d -m 0700 "$evidence"
pipeline=(node --import tsx scripts/world-chunks-publish.ts)
target=(--host "$host" --database "$database" --origin "$origin")

refresh_token() {
  [[ "$refresh" = rejoin ]] || return 0
  WORLD_REJOIN_TOKENS_FILE="$WORLD_CHUNKS_TOKEN_FILE" npm run --silent world:rejoin-smoke -- refresh
}
# run NAME COMMAND...: refresh, run the pipeline with a report, and return its exit code.
run() {
  local name=$1; shift
  local code=0
  refresh_token || { printf 'World chunk heads: token refresh failed before %s.\n' "$name" >&2; return 70; }
  "${pipeline[@]}" "$@" "${target[@]}" --report "$evidence/$name.json" || code=$?
  return "$code"
}

status=0
run check-before check || status=$?
case "$status" in
  0) printf 'World chunk heads: fresh (map, content and assets unchanged since they were published).\n'; exit 0 ;;
  3) ;;
  *) printf 'World chunk heads: the check itself failed (exit %s); see %s.\n' "$status" "$evidence" >&2; exit "$status" ;;
esac
if [[ "$mode" = check ]]; then
  printf 'World chunk heads are stale or unpublished: see %s/check-before.json.\n' "$evidence" >&2
  exit 3
fi
status=0
WORLD_CHUNKS_PUBLISH_CONFIRM="${WORLD_RELEASE_CHUNKS_CONFIRM:-}" ORCHARD_WORLD_CHUNK_DIR="$chunk_dir" \
  run publish publish --chunk-dir "$chunk_dir" || status=$?
if [[ "$status" -ne 0 ]]; then
  if [[ "$status" -eq 77 ]]; then
    printf 'World chunk heads: publication needs WORLD_RELEASE_CHUNKS_CONFIRM; the value for these rows is in %s/publish.json (confirmation).\n' "$evidence" >&2
  else
    printf 'World chunk heads: publish failed (exit %s); see %s/publish.json.\n' "$status" "$evidence" >&2
  fi
  exit "$status"
fi
status=0
run check-after check || status=$?
case "$status" in
  0) printf 'World chunk heads: published and fresh.\n' ;;
  3) printf 'World chunk heads are still stale after publishing: see %s/check-after.json.\n' "$evidence" >&2; exit 3 ;;
  *) printf 'World chunk heads: the check after publishing failed (exit %s); see %s.\n' "$status" "$evidence" >&2; exit "$status" ;;
esac
