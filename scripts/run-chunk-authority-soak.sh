#!/usr/bin/env bash
set -euo pipefail

# Static-world S2c chunk-authority soak on a DISPOSABLE local SpacetimeDB host.
#
# Starts its own in-memory host on a loopback port (never 3000, the production host),
# publishes a copy of packages/world with production OIDC switched off and a fresh
# local identity bootstrapped as the world owner, runs scripts/chunk-authority-soak.ts
# against it, then stops the host (only the PID it started) and deletes the copy.
#
# Environment:
#   CHUNK_SOAK_PORT       loopback port (default 3470; must be free, never 3000)
#   CHUNK_SOAK_DATABASE   disposable database name (orchard-chunk-soak-*)
#   CHUNK_SOAK_EVIDENCE   evidence directory (default output/chunk-authority-soak-<stamp>)
#   CHUNK_SOAK_PROBES     1 (default) adds the disposable-only probe reducers
# Extra arguments pass through to the soak (for example --with-on, --walk-limit 20).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
listen_port="${CHUNK_SOAK_PORT:-3470}"
host="http://127.0.0.1:${listen_port}"
database="${CHUNK_SOAK_DATABASE:-orchard-chunk-soak-local01}"
probes="${CHUNK_SOAK_PROBES:-1}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
evidence_dir="${CHUNK_SOAK_EVIDENCE:-${repo_root}/output/chunk-authority-soak-${stamp}}"

if [[ ! "${listen_port}" =~ ^[0-9]+$ ]] || (( listen_port < 1024 || listen_port > 65535 || listen_port == 3000 )); then
  echo "chunk_soak_invalid_loopback_port" >&2
  exit 64
fi
if [[ ! "${database}" =~ ^orchard-chunk-soak-[a-z0-9][a-z0-9-]{2,40}$ ]]; then
  echo "chunk_soak_requires_disposable_database_name" >&2
  exit 64
fi
if curl -fsS --max-time 2 "${host}/v1/ping" >/dev/null 2>&1 || ss -ltnH "sport = :${listen_port}" 2>/dev/null | grep -q .; then
  echo "chunk_soak_port_in_use: ${listen_port}" >&2
  exit 69
fi

work_dir="$(mktemp -d -t orchard-chunk-soak.XXXXXX)"
if [[ "${work_dir}" != /tmp/orchard-chunk-soak.* || ! -d "${work_dir}" ]]; then
  echo "chunk_soak_unsafe_temporary_directory" >&2
  exit 1
fi
host_pid=""
cleanup() {
  if [[ -n "${host_pid}" ]] && kill -0 "${host_pid}" >/dev/null 2>&1; then
    kill "${host_pid}" >/dev/null 2>&1 || true
    wait "${host_pid}" 2>/dev/null || true
  fi
  if [[ -f "${work_dir}/host.log" && -d "${evidence_dir}" ]]; then cp "${work_dir}/host.log" "${evidence_dir}/host.log" || true; fi
  if [[ "${work_dir}" == /tmp/orchard-chunk-soak.* && -d "${work_dir}" ]]; then rm -rf -- "${work_dir}"; fi
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

spacetime start --listen-addr "127.0.0.1:${listen_port}" --data-dir "${work_dir}/data" --in-memory --non-interactive >"${work_dir}/host.log" 2>&1 &
host_pid="$!"
for _ in $(seq 1 150); do
  if curl -fsS "${host}/v1/ping" >/dev/null 2>&1; then break; fi
  if ! kill -0 "${host_pid}" >/dev/null 2>&1; then
    echo "chunk_soak_disposable_host_failed" >&2
    tail -50 "${work_dir}/host.log" >&2
    exit 1
  fi
  sleep 0.2
done
curl -fsS "${host}/v1/ping" >/dev/null

# A fresh identity from the disposable host. The token goes straight to a 0600 file.
curl -fsS -X POST "${host}/v1/identity" >"${work_dir}/identity.json"
soak_identity="$(jq -r '.identity' "${work_dir}/identity.json")"
jq -r '.token' "${work_dir}/identity.json" >"${work_dir}/soak-token"
rm -f "${work_dir}/identity.json"
chmod 600 "${work_dir}/soak-token"
if [[ ! "${soak_identity}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "chunk_soak_identity_unexpected" >&2
  exit 1
fi

# Disposable-only patches: no production OIDC, and the soak identity is the bootstrap owner.
auth_file="${work_dir}/packages/world/src/auth-policy.ts"
index_file="${work_dir}/packages/world/src/index.ts"
if ! grep -Fq "export const OIDC_CLIENT_IDS: readonly string[] = ['orchard-web', 'orchard-studio'];" "${auth_file}" \
  || [[ "$(grep -c "^export const BOOTSTRAP_OWNER_IDENTITIES: readonly string\[\] = \[$" "${auth_file}")" != "1" ]] \
  || [[ "$(grep -c "^  if (productionAuthEnabled()$" "${index_file}")" != "1" ]]; then
  echo "chunk_soak_auth_seam_unexpected" >&2
  exit 1
fi
sed -i "s/export const OIDC_CLIENT_IDS: readonly string\[\] = \['orchard-web', 'orchard-studio'\];/export const OIDC_CLIENT_IDS: readonly string[] = [];/" "${auth_file}"
sed -i "s/^export const BOOTSTRAP_OWNER_IDENTITIES: readonly string\[\] = \[$/export const BOOTSTRAP_OWNER_IDENTITIES: readonly string[] = ['${soak_identity}',/" "${auth_file}"
sed -i "s/^  if (productionAuthEnabled()$/  if (true/" "${index_file}"
if [[ "${probes}" == "1" ]]; then
  cat >>"${index_file}" <<'PROBES'

// --- chunk-authority soak probes: DISPOSABLE HOST ONLY (added by run-chunk-authority-soak.sh) ---
let soakProbeCounter = 0;
export const soakProbeGlobals = spacetimedb.reducer({}, () => {
  soakProbeCounter += 1;
  console.info(JSON.stringify({ event: 'soak_probe_globals', counter: soakProbeCounter }));
});
export const soakProbeThrow = spacetimedb.reducer({}, () => {
  throw new Error('soak_probe_plain_error');
});
export const soakProbeBusy = spacetimedb.reducer({ millis: t.u32() }, (_ctx, { millis }) => {
  const clock = typeof globalThis.performance?.now === 'function' ? () => globalThis.performance.now() : () => Date.now();
  const start = clock();
  let spins = 0;
  while (clock() - start < millis && spins < 4_000_000_000) spins += 1;
  console.info(JSON.stringify({ event: 'soak_probe_busy', millis, elapsedMs: Math.round(clock() - start), spins,
    clock: typeof globalThis.performance?.now === 'function' ? 'performance' : 'date' }));
});
PROBES
fi

if ! spacetime publish "${database}" --no-config --server "${host}" --module-path "${work_dir}/packages/world" --delete-data=never --yes=remote,migrate,break-clients >"${work_dir}/publish.log" 2>&1; then
  echo "chunk_soak_disposable_publish_failed" >&2
  tail -100 "${work_dir}/publish.log" >&2
  exit 1
fi

soak_args=(--host "${host}" --database "${database}" --token-file "${work_dir}/soak-token"
  --evidence "${evidence_dir}/evidence.json" --work-dir "${work_dir}/soak" --host-log "${work_dir}/host.log")
if [[ "${probes}" == "1" ]]; then soak_args+=(--probes); fi
status=0
(cd "${repo_root}" && node node_modules/tsx/dist/cli.mjs scripts/chunk-authority-soak.ts "${soak_args[@]}" "$@") || status=$?
echo "${evidence_dir}/evidence.json"
exit "${status}"
