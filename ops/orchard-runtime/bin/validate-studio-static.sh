#!/usr/bin/env bash
set -euo pipefail

repository=/home/toby/projects/orchard-cellar
dist=${STUDIO_STATIC_DIST:-$repository/packages/studio/dist}
unit=${STUDIO_STATIC_UNIT:-$repository/ops/orchard-runtime/systemd/orchard-studio.service}
npm_fragment=${STUDIO_NPM_FRAGMENT:-$repository/ops/orchard-runtime/npm/orchard-studio.conf}
edge_http_top=${STUDIO_NPM_HTTP_TOP:-$repository/ops/orchard-auth/npm/http_top.conf}
origin=${STUDIO_VALIDATE_ORIGIN:-}
dry_run=${STUDIO_STATIC_DRY_RUN:-false}

[[ "$dry_run" = true || "$dry_run" = false ]] || { printf 'STUDIO_STATIC_DRY_RUN must be true or false.\n' >&2; exit 64; }
[[ -f "$dist/index.html" && -f "$unit" && -f "$npm_fragment" && -f "$edge_http_top" ]] || {
  printf 'Studio static artifact, unit, or NPM policy is missing.\n' >&2; exit 66;
}
[[ "$(realpath "$dist")" = "$repository/packages/studio/dist" ]] || {
  printf 'Studio dist path must resolve to the checked production artifact.\n' >&2; exit 65;
}
grep -Fq 'ConditionPathExists=/home/toby/projects/orchard-cellar/packages/studio/dist/index.html' "$unit"
grep -Fq 'npm run preview -w @orchard/studio' "$unit"
if grep -Eq 'vite[[:space:]]+dev|npm[[:space:]]+run[[:space:]]+dev' "$unit"; then
  printf 'Studio unit must never serve source or run the dev server.\n' >&2; exit 65
fi
for required in \
  'access_log /data/logs/orchard-studio_access.log orchard_studio;' \
  'limit_req zone=orchard_studio_dynamic_per_ip' \
  'Content-Security-Policy:' \
  'Referrer-Policy: no-referrer' \
  'X-Content-Type-Options: nosniff' \
  'Cache-Control: no-store'; do
  grep -Fq "$required" "$npm_fragment" || { printf 'Studio NPM fragment is missing a required control.\n' >&2; exit 65; }
done
for required in \
  'map $uri $orchard_studio_client_key' \
  '~^/(?:assets|generated|ui)(?:/|$) "";' \
  'limit_req_zone $orchard_studio_client_key' \
  'limit_conn_zone $orchard_studio_client_key'; do
  grep -Fq "$required" "$edge_http_top" || {
    printf 'Studio NPM HTTP policy is missing its static-asset rate exemption.\n' >&2; exit 65;
  }
done
if grep -Eq '\$request_uri|\$args|\$query_string' "$npm_fragment"; then
  printf 'Studio NPM fragment may not log query-bearing request values.\n' >&2; exit 65
fi

if [[ "$dry_run" = true ]]; then
  printf 'Studio static/NPM dry-run passed: built artifact, static-only unit, CSP, query-free logging, static-asset exemption, and edge limits validated.\n'
  exit 0
fi

[[ "$origin" =~ ^https://cellar\.dastari\.net/?$ ]] || {
  printf 'STUDIO_VALIDATE_ORIGIN must be the canonical HTTPS Studio origin.\n' >&2; exit 64;
}
headers=$(mktemp)
trap 'rm -f -- "$headers"' EXIT INT TERM
curl -fsS -D "$headers" -o /dev/null "$origin"
for header in 'content-security-policy:' 'referrer-policy: no-referrer' 'x-content-type-options: nosniff' 'cache-control: no-store'; do
  grep -Fiq "$header" "$headers" || { printf 'Public Studio response is missing a required security header.\n' >&2; exit 69; }
done
curl -fsS "${origin%/}/v1/ping" >/dev/null
printf 'Studio static service and public NPM route validation passed.\n'
