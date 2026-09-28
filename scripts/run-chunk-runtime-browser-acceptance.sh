#!/usr/bin/env bash
set -euo pipefail

# Static-world S4g: chunk-runtime browser acceptance on a DISPOSABLE local SpacetimeDB host.
#
# Starts its own in-memory host on a loopback port (never 3000, the production host),
# publishes a copy of packages/world with production OIDC switched off and a fresh local
# identity bootstrapped as the world owner, builds the game client twice (legacy `off`
# and `on`, scripts/chunk-runtime-acceptance.vite.config.ts, never into packages/client/dist),
# serves both with `vite preview` on loopback ports (proxying /v1 to the disposable host,
# serving /world/ from a temporary chunk directory), and runs
# scripts/chunk-runtime-browser-acceptance.ts in headless Chrome. It stops only the
# processes it started and deletes its temporary directory; the in-memory database goes
# with the host.
#
# Needs `npm run assets:build` first, and playwright-core (not a workspace dependency):
#   S4G_PLAYWRIGHT_MODULE  absolute path of a playwright-core package directory
#                          (default: the playwright-cli copy in the npx cache)
# Environment:
#   S4G_WORLD_PORT       disposable host port (default 3471; never 3000)
#   S4G_LEGACY_PORT      legacy build preview port (default 4271)
#   S4G_ON_PORT          on build preview port (default 4272)
#   S4G_DATABASE         disposable database name (orchard-chunk-soak-*; default orchard-chunk-soak-s4g01)
#   S4G_EVIDENCE         evidence directory (default output/chunk-runtime-acceptance-<stamp>)
#   S4G_CHROME           Chrome executable (default /usr/bin/google-chrome)
#   S4G_SWAP_PORT        the rollback drill's own preview port (default 4273; used with --rollback-drill)
#   S4G_ON_BUILD_MODE    chunk-runtime-preview (default) or client-production: the release build mode,
#                        which needs S4G_ACTIVATION_RELEASE equal to the committed
#                        CHUNK_RUNTIME_ACTIVATION_RELEASE (S5c G5a)
#   S4G_ACTIVATION_RELEASE  the activation release id for a client-production on build
# Extra arguments pass through to the driver (for example --limit 12).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
world_port="${S4G_WORLD_PORT:-3471}"
legacy_port="${S4G_LEGACY_PORT:-4271}"
on_port="${S4G_ON_PORT:-4272}"
host="http://127.0.0.1:${world_port}"
database="${S4G_DATABASE:-orchard-chunk-soak-s4g01}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
evidence_dir="${S4G_EVIDENCE:-${repo_root}/output/chunk-runtime-acceptance-${stamp}}"
chrome="${S4G_CHROME:-/usr/bin/google-chrome}"
swap_port="${S4G_SWAP_PORT:-4273}"
on_build_mode="${S4G_ON_BUILD_MODE:-chunk-runtime-preview}"
activation_release="${S4G_ACTIVATION_RELEASE:-}"
case "${on_build_mode}" in
  chunk-runtime-preview) [[ -z "${activation_release}" ]] || { echo "s4g_activation_release_needs_client_production" >&2; exit 64; } ;;
  client-production) [[ "${activation_release}" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { echo "s4g_client_production_needs_activation_release" >&2; exit 64; } ;;
  *) echo "s4g_on_build_mode_invalid" >&2; exit 64 ;;
esac
playwright_module="${S4G_PLAYWRIGHT_MODULE:-}"
if [[ -z "${playwright_module}" ]]; then
  playwright_module="$(ls -d "${HOME}"/.npm/_npx/*/node_modules/playwright-core 2>/dev/null | head -1 || true)"
fi

for port in "${world_port}" "${legacy_port}" "${on_port}" "${swap_port}"; do
  if [[ ! "${port}" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 || port == 3000 || port == 5173 )); then
    echo "s4g_invalid_loopback_port: ${port}" >&2; exit 64
  fi
  if ss -ltnH "sport = :${port}" 2>/dev/null | grep -q .; then echo "s4g_port_in_use: ${port}" >&2; exit 69; fi
done
if [[ ! "${database}" =~ ^orchard-chunk-soak-[a-z0-9][a-z0-9-]{2,40}$ ]]; then
  echo "s4g_requires_disposable_database_name" >&2; exit 64
fi
if [[ -z "${playwright_module}" || ! -f "${playwright_module}/package.json" ]]; then
  echo "s4g_playwright_core_missing: set S4G_PLAYWRIGHT_MODULE" >&2; exit 64
fi
if [[ ! -x "${chrome}" ]]; then echo "s4g_chrome_missing: ${chrome}" >&2; exit 64; fi
if [[ ! -f "${repo_root}/packages/assets/generated/atlas.packs.json" ]]; then
  echo "s4g_assets_missing: run npm run assets:build first" >&2; exit 64
fi

work_dir="$(mktemp -d -t orchard-s4g-acceptance.XXXXXX)"
if [[ "${work_dir}" != /tmp/orchard-s4g-acceptance.* || ! -d "${work_dir}" ]]; then
  echo "s4g_unsafe_temporary_directory" >&2; exit 1
fi
pids=()
cleanup() {
  for pid in "${pids[@]}"; do
    if kill -0 "${pid}" >/dev/null 2>&1; then kill "${pid}" >/dev/null 2>&1 || true; wait "${pid}" 2>/dev/null || true; fi
  done
  if [[ -d "${evidence_dir}" ]]; then
    for log in host.log publish.log build-legacy.log build-on.log preview-legacy.log preview-on.log release-check.log; do
      [[ -f "${work_dir}/${log}" ]] && cp "${work_dir}/${log}" "${evidence_dir}/${log}" || true
    done
  fi
  if [[ "${work_dir}" == /tmp/orchard-s4g-acceptance.* && -d "${work_dir}" ]]; then rm -rf -- "${work_dir}"; fi
}
trap cleanup EXIT INT TERM
umask 077
mkdir -p "${evidence_dir}"

# The module copy keeps the repository layout (packages/world imports ../../sim/src).
mkdir -p "${work_dir}/packages"
cp -a "${repo_root}/packages/world" "${work_dir}/packages/world"
rm -rf "${work_dir}/packages/world/node_modules"
ln -s "${repo_root}/packages/world/node_modules" "${work_dir}/packages/world/node_modules"
for package_dir in "${repo_root}"/packages/*; do
  name="$(basename "${package_dir}")"
  [[ "${name}" == "world" ]] || ln -s "${package_dir}" "${work_dir}/packages/${name}"
done
ln -s "${repo_root}/node_modules" "${work_dir}/node_modules"
find "${work_dir}/packages/world/src" -type f -name '*.test.ts' -delete

spacetime start --listen-addr "127.0.0.1:${world_port}" --data-dir "${work_dir}/data" --in-memory --non-interactive >"${work_dir}/host.log" 2>&1 &
pids+=("$!")
for _ in $(seq 1 150); do
  if curl -fsS "${host}/v1/ping" >/dev/null 2>&1; then break; fi
  if ! kill -0 "${pids[0]}" >/dev/null 2>&1; then echo "s4g_disposable_host_failed" >&2; tail -50 "${work_dir}/host.log" >&2; exit 1; fi
  sleep 0.2
done
curl -fsS "${host}/v1/ping" >/dev/null

# A fresh identity from the disposable host (the world owner). The token goes straight to a 0600 file.
curl -fsS -X POST "${host}/v1/identity" >"${work_dir}/identity.json"
owner_identity="$(jq -r '.identity' "${work_dir}/identity.json")"
jq -r '.token' "${work_dir}/identity.json" >"${work_dir}/owner-token"
rm -f "${work_dir}/identity.json"
chmod 600 "${work_dir}/owner-token"
if [[ ! "${owner_identity}" =~ ^[0-9a-f]{64}$ ]]; then echo "s4g_identity_unexpected" >&2; exit 1; fi

# Disposable-only patches: no production OIDC, and the owner identity is the bootstrap owner.
auth_file="${work_dir}/packages/world/src/auth-policy.ts"
index_file="${work_dir}/packages/world/src/index.ts"
if ! grep -Fq "export const OIDC_CLIENT_IDS: readonly string[] = ['orchard-web', 'orchard-studio'];" "${auth_file}" \
  || [[ "$(grep -c "^export const BOOTSTRAP_OWNER_IDENTITIES: readonly string\[\] = \[$" "${auth_file}")" != "1" ]] \
  || [[ "$(grep -c "^  if (productionAuthEnabled()$" "${index_file}")" != "1" ]]; then
  echo "s4g_auth_seam_unexpected" >&2; exit 1
fi
sed -i "s/export const OIDC_CLIENT_IDS: readonly string\[\] = \['orchard-web', 'orchard-studio'\];/export const OIDC_CLIENT_IDS: readonly string[] = [];/" "${auth_file}"
sed -i "s/^export const BOOTSTRAP_OWNER_IDENTITIES: readonly string\[\] = \[$/export const BOOTSTRAP_OWNER_IDENTITIES: readonly string[] = ['${owner_identity}',/" "${auth_file}"
sed -i "s/^  if (productionAuthEnabled()$/  if (true/" "${index_file}"
# The production-shaped fixture (the full Hearth composition the nightly parity tests use)
# serialises to about 5.3 M characters, over the 4 M live-map cap (disposable copy only).
publication_file="${work_dir}/packages/world/src/live-map-publication.ts"
if [[ "$(grep -c "^export const LIVE_MAP_MAX_DOCUMENT_CHARACTERS = 4_000_000;$" "${publication_file}")" != "1" ]]; then
  echo "s4g_live_map_cap_unexpected" >&2; exit 1
fi
sed -i "s/^export const LIVE_MAP_MAX_DOCUMENT_CHARACTERS = 4_000_000;$/export const LIVE_MAP_MAX_DOCUMENT_CHARACTERS = 8_000_000;/" "${publication_file}"

if ! spacetime publish "${database}" --no-config --server "${host}" --module-path "${work_dir}/packages/world" --delete-data=never --yes=remote,migrate,break-clients >"${work_dir}/publish.log" 2>&1; then
  echo "s4g_disposable_publish_failed" >&2; tail -100 "${work_dir}/publish.log" >&2; exit 1
fi

chunk_dir="${work_dir}/world-chunks"
vite=(node "${repo_root}/node_modules/vite/bin/vite.js")
config="${repo_root}/scripts/chunk-runtime-acceptance.vite.config.ts"
client_env() { # label out_dir port chunk_mode authority
  local activation=()
  [[ "$1" != on || -z "${activation_release}" ]] || activation=(ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE="${activation_release}")
  env -u VITE_SPACETIMEDB_URI -u VITE_OIDC_CLIENT_ID -u ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE "${activation[@]}" \
    S4G_OUT_DIR="$2" S4G_PREVIEW_PORT="$3" S4G_WORLD_HOST="${host}" S4G_CHUNK_AUTHORITY="$5" \
    VITE_CHUNK_RUNTIME_MODE="$4" VITE_SPACETIMEDB_DATABASE="${database}" VITE_ENABLE_LOCAL_PROFILES=true \
    ORCHARD_WORLD_CHUNK_DIR="${chunk_dir}" "${@:6}"
}
for build in "legacy ${legacy_port} off" "on ${on_port} on"; do
  read -r label port mode <<<"${build}"
  authority=""; [[ "${mode}" == "on" ]] && authority="on"
  build_mode=chunk-runtime-preview; expected_release=""
  if [[ "${label}" == on && "${on_build_mode}" == client-production ]]; then build_mode=client-production; expected_release="${activation_release}"; fi
  if ! (cd "${repo_root}" && client_env "${label}" "${work_dir}/dist-${label}" "${port}" "${mode}" "${authority}" \
      "${vite[@]}" build --config "${config}" --mode "${build_mode}") >"${work_dir}/build-${label}.log" 2>&1; then
    echo "s4g_client_build_failed: ${label}" >&2; tail -60 "${work_dir}/build-${label}.log" >&2; exit 1
  fi
  jq -e --arg mode "${mode}" --arg release "${expected_release}" \
    'if $release == "" then (.mode == $mode and .activationAllowed == false) else (.mode == $mode and .activationAllowed == true and .activationRelease == $release) end' \
    "${work_dir}/dist-${label}/chunk-runtime-audit.json" >/dev/null || { echo "s4g_build_audit_unexpected: ${label}" >&2; exit 1; }
  if [[ "${build_mode}" == client-production ]]; then
    # The release checks on the release-mode artifact: static chunks and a releasable audit.
    mkdir -p "${work_dir}/release-check/packages/client"
    cp -a "${work_dir}/dist-${label}" "${work_dir}/release-check/packages/client/dist"
    (cd "${work_dir}/release-check" && node "${repo_root}/node_modules/tsx/dist/cli.mjs" "${repo_root}/scripts/check-client-build-chunks.ts") \
      >"${work_dir}/release-check.log" 2>&1 || { echo "s4g_client_production_release_check_failed" >&2; tail -40 "${work_dir}/release-check.log" >&2; exit 1; }
  fi
done
for build in "legacy ${legacy_port} off" "on ${on_port} on"; do
  read -r label port mode <<<"${build}"
  authority=""; [[ "${mode}" == "on" ]] && authority="on"
  (cd "${repo_root}" && exec env -u VITE_SPACETIMEDB_URI -u VITE_OIDC_CLIENT_ID \
    S4G_OUT_DIR="${work_dir}/dist-${label}" S4G_PREVIEW_PORT="${port}" S4G_WORLD_HOST="${host}" S4G_CHUNK_AUTHORITY="${authority}" \
    VITE_CHUNK_RUNTIME_MODE="${mode}" VITE_SPACETIMEDB_DATABASE="${database}" VITE_ENABLE_LOCAL_PROFILES=true \
    ORCHARD_WORLD_CHUNK_DIR="${chunk_dir}" \
    "${vite[@]}" preview --config "${config}" --mode chunk-runtime-preview) >"${work_dir}/preview-${label}.log" 2>&1 &
  pids+=("$!")
done
for port in "${legacy_port}" "${on_port}"; do
  for _ in $(seq 1 150); do curl -fsS "http://127.0.0.1:${port}/chunk-runtime-audit.json" >/dev/null 2>&1 && break; sleep 0.2; done
  # The preview proxy must reach the disposable database (it does not exist on any other host).
  curl -fsS "http://127.0.0.1:${port}/v1/database/${database}" >/dev/null \
    || { echo "s4g_preview_proxy_not_on_disposable_host: ${port}" >&2; exit 1; }
done

status=0
(cd "${repo_root}" && node node_modules/tsx/dist/cli.mjs scripts/chunk-runtime-browser-acceptance.ts \
  --host "${host}" --database "${database}" --token-file "${work_dir}/owner-token" \
  --legacy-url "http://127.0.0.1:${legacy_port}" --on-url "http://127.0.0.1:${on_port}" \
  --chunk-dir "${chunk_dir}" --evidence "${evidence_dir}" --playwright "${playwright_module}" --chrome "${chrome}" \
  --swap-port "${swap_port}" --dist-on "${work_dir}/dist-on" --dist-legacy "${work_dir}/dist-legacy" --swap-dir "${work_dir}/dist-swap" --work-dir "${work_dir}" "$@") || status=$?
echo "${evidence_dir}/summary.json"
exit "${status}"
