#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="$ROOT/scripts/fixtures/spacetimedb-drop-proof"
PORT="${DROP_PROOF_PORT:-3199}"
SERVER_NAME="orchard-drop-proof-$$"
DATABASE="orchard-drop-proof-$$"
WORK="$(mktemp -d -t orchard-drop-proof.XXXXXX)"
DATA="$WORK/data"
MODULE="$WORK/module"
SERVER_LOG="$WORK/server.log"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  spacetime server remove "$SERVER_NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

spacetime --version | grep -F 'spacetimedb tool version 2.8.2'
cp -R "$FIXTURE" "$MODULE"
ln -s "$ROOT/node_modules" "$WORK/node_modules"
spacetime start --listen-addr "127.0.0.1:$PORT" --data-dir "$DATA" --non-interactive >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:$PORT/v1/ping" >/dev/null; then break; fi
  sleep 0.05
done
curl -fsS "http://127.0.0.1:$PORT/v1/ping" >/dev/null
spacetime server add "$SERVER_NAME" --url "http://127.0.0.1:$PORT" --no-fingerprint >/dev/null

publish() {
  spacetime publish "$DATABASE" --server "$SERVER_NAME" --module-path "$MODULE" \
    --delete-data=never --yes=migrate,break-clients,skip-login --no-config
}

cp "$MODULE/versions/initial.ts" "$MODULE/src/index.ts"
publish
spacetime sql "$DATABASE" 'SELECT * FROM filled_probe' --server "$SERVER_NAME" --no-config | grep -F 'must-survive'

cp "$MODULE/versions/empty-removed.ts" "$MODULE/src/index.ts"
publish
if spacetime sql "$DATABASE" 'SELECT * FROM empty_probe' --server "$SERVER_NAME" --no-config >"$WORK/empty-query.log" 2>&1; then
  echo 'empty_probe unexpectedly survived' >&2; exit 1
fi
grep -F 'no such table' "$WORK/empty-query.log"

cp "$MODULE/versions/nonempty-removed.ts" "$MODULE/src/index.ts"
if publish >"$WORK/nonempty-publish.log" 2>&1; then
  echo 'non-empty filled_probe was unexpectedly removed' >&2; exit 1
fi
grep -F 'table contains data' "$WORK/nonempty-publish.log"
spacetime sql "$DATABASE" 'SELECT * FROM filled_probe' --server "$SERVER_NAME" --no-config | grep -F 'must-survive'
echo 'SpacetimeDB 2.8.2 empty-table drop proof passed.'
