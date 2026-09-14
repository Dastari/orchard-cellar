#!/usr/bin/env bash
set -euo pipefail

# Development may publish a separate database on the local host. It must never
# target the canonical production database or inherit spacetime.local.json.
[[ $# -eq 0 ]] || { printf 'world:dev accepts no CLI overrides.\n' >&2; exit 64; }
database=${ORCHARD_DEV_DATABASE:-orchard-cellar-dev}
[[ "$database" =~ ^orchard-cellar-dev(-[a-z0-9]+)*$ ]] || {
  printf 'world:dev requires orchard-cellar-dev or an orchard-cellar-dev-* database.\n' >&2
  exit 64
}
for _attempt in $(seq 1 150); do
  if curl -fsS http://127.0.0.1:3000/v1/ping >/dev/null 2>&1; then
    exec spacetime dev "$database" --no-config --server http://127.0.0.1:3000 \
      --project-path . --module-path packages/world \
      --module-bindings-path packages/world-bindings/src --client-lang typescript \
      --yes --delete-data=never --server-only
  fi
  sleep 0.2
done
printf 'Local development world host did not become ready.\n' >&2
exit 69
