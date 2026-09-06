#!/usr/bin/env bash
set -euo pipefail

repository=${CLIENT_STATIC_REPOSITORY:-/home/toby/projects/orchard-cellar}
dist=${CLIENT_STATIC_DIST:-$repository/packages/client/dist}
unit=${CLIENT_STATIC_UNIT:-$repository/ops/orchard-runtime/systemd/orchard-frontend.service}
origin=${CLIENT_VALIDATE_ORIGIN:-}
dry_run=${CLIENT_STATIC_DRY_RUN:-false}

[[ "$dry_run" = true || "$dry_run" = false ]] || {
  printf 'CLIENT_STATIC_DRY_RUN must be true or false.\n' >&2; exit 64;
}
[[ -f "$dist/index.html" && -f "$unit" ]] || {
  printf 'Game static artifact or unit is missing.\n' >&2; exit 66;
}
[[ "$(realpath "$dist")" = "$(realpath "$repository/packages/client/dist")" ]] || {
  printf 'Game dist path must resolve to the checked production artifact.\n' >&2; exit 65;
}

grep -Fq "ConditionPathExists=$repository/packages/client/dist/index.html" "$unit"
grep -Fq 'npm run preview -w @orchard/client' "$unit"
if grep -Eq 'vite[[:space:]]+dev|npm[[:space:]]+run[[:space:]]+dev' "$unit"; then
  printf 'Game unit must never serve source or run the dev server.\n' >&2; exit 65
fi

reject_dev_html() {
  local html=$1
  if grep -Eq "/@vite/client|/src/|/@fs/|<script[^>]+src=['\"][^'\"]+[.]tsx?([?'\"])" "$html"; then
    printf 'Game response contains a Vite development or source-module path.\n' >&2
    return 1
  fi
  grep -Eq "<script[^>]+type=['\"]module['\"][^>]+src=['\"]/assets/[^'\"]+[.]js['\"]" "$html" || {
    printf 'Game response does not reference a hashed static module asset.\n' >&2
    return 1
  }
}

reject_dev_html "$dist/index.html" || exit 65

if [[ "$dry_run" = true ]]; then
  printf 'Game static dry-run passed: built artifact and static-only unit validated.\n'
  exit 0
fi

[[ "$origin" =~ ^https://orchard\.dastari\.net/?$ ]] || {
  printf 'CLIENT_VALIDATE_ORIGIN must be the canonical HTTPS game origin.\n' >&2; exit 64;
}
headers=$(mktemp)
html=$(mktemp)
trap 'rm -f -- "$headers" "$html"' EXIT INT TERM
curl -fsS -D "$headers" -o "$html" "$origin"
grep -Fiq 'content-type: text/html' "$headers" || {
  printf 'Public game response is not HTML.\n' >&2; exit 69;
}
reject_dev_html "$html" || exit 69
curl -fsS "${origin%/}/v1/ping" >/dev/null
printf 'Game static service and canonical public route validation passed.\n'
