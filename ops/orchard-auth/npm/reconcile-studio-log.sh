#!/usr/bin/env bash
set -euo pipefail

container=${NPM_CONTAINER:-nginx-proxy-manager-app-1}
host=${STUDIO_HOST:-cellar.dastari.net}

mapfile -t configs < <(docker exec "$container" sh -lc \
  "grep -R -l -F 'server_name $host;' /data/nginx/proxy_host/*.conf")
[[ ${#configs[@]} -eq 1 ]] || {
  printf 'Expected one generated NPM proxy config for %s, found %s.\n' "$host" "${#configs[@]}" >&2
  exit 65
}
config=${configs[0]}

query_log_count=$(docker exec "$container" sh -lc \
  "grep -cE '^  access_log /data/logs/proxy-host-[0-9]+_access[.]log proxy;' '$config' || true")
safe_log_count=$(docker exec "$container" sh -lc \
  "grep -cE '^  access_log /data/logs/proxy-host-[0-9]+_access[.]log orchard_studio;' '$config' || true")
if [[ "$query_log_count" = 0 && "$safe_log_count" = 1 ]]; then
  printf 'Studio generated access log is already query-free: %s\n' "$config"
  exit 0
fi
[[ "$query_log_count" = 1 && "$safe_log_count" = 0 ]] || {
  printf 'Refusing unexpected access_log state in %s (%s query, %s safe).\n' \
    "$config" "$query_log_count" "$safe_log_count" >&2
  exit 65
}

docker exec "$container" sh -lc \
  "sed -i -E 's#^  access_log (/data/logs/proxy-host-[0-9]+_access[.]log) proxy;#  access_log \\1 orchard_studio;#' '$config'; nginx -t; nginx -s reload"

docker exec "$container" sh -lc \
  "test \"\$(grep -cE '^  access_log /data/logs/proxy-host-[0-9]+_access[.]log orchard_studio;' '$config')\" = 1"
printf 'Reconciled query-free Studio logging in %s.\n' "$config"
