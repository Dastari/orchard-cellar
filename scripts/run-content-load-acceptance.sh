#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
listen_port="${CONTENT_MEASURE_PORT:-3400}"
host="http://127.0.0.1:${listen_port}"
database="${SPACETIMEDB_DATABASE:-orchard-content-measure-local01}"
evidence_path="${CONTENT_MEASURE_EVIDENCE:-${repo_root}/.artifacts/content-load-acceptance.json}"

if [[ ! "${listen_port}" =~ ^[0-9]+$ ]] || (( listen_port < 1024 || listen_port > 65535 || listen_port == 3000 )); then
  echo "content_measure_invalid_loopback_port" >&2
  exit 1
fi
if [[ ! "${database}" =~ ^orchard-content-measure-[a-z0-9][a-z0-9-]{5,48}$ ]]; then
  echo "content_measure_requires_disposable_database_name" >&2
  exit 1
fi

work_dir="$(mktemp -d -t orchard-content-measure.XXXXXX)"
if [[ "${work_dir}" != /tmp/orchard-content-measure.* || ! -d "${work_dir}" ]]; then
  echo "content_measure_unsafe_temporary_directory" >&2
  exit 1
fi
host_pid=""
cleanup() {
  if [[ -n "${host_pid}" ]]; then kill "${host_pid}" >/dev/null 2>&1 || true; fi
  if [[ "${work_dir}" == /tmp/orchard-content-measure.* && -d "${work_dir}" ]]; then
    rm -rf -- "${work_dir}"
  fi
}
trap cleanup EXIT

mkdir -p "${work_dir}/module"
cp -a "${repo_root}/packages/world/." "${work_dir}/module/"
ln -s "${repo_root}/node_modules" "${work_dir}/node_modules"
# Unit-test sources are not part of the deployed module. Omitting them also
# isolates this measurement from unrelated, concurrently edited test fixtures.
find "${work_dir}/module/src" -type f -name '*.test.ts' -delete

auth_file="${work_dir}/module/src/auth-policy.ts"
index_file="${work_dir}/module/src/index.ts"
if ! grep -Fq "['orchard-web', 'orchard-studio']" "${auth_file}"; then
  echo "content_measure_production_auth_source_unexpected" >&2
  exit 1
fi
sed -i "s/\['orchard-web', 'orchard-studio'\]/[]/" "${auth_file}"
if [[ "$(grep -Fc "if (!contentEditorAuthorized(member, grant))" "${index_file}")" != "1" ]]; then
  echo "content_measure_auth_seam_unexpected" >&2
  exit 1
fi
sed -i "s/if (!contentEditorAuthorized(member, grant))/if (productionAuthEnabled() \&\& !contentEditorAuthorized(member, grant))/" "${index_file}"

spacetime start --listen-addr "127.0.0.1:${listen_port}" --data-dir "${work_dir}/data" --in-memory --non-interactive >"${work_dir}/host.log" 2>&1 &
host_pid="$!"
for _ in $(seq 1 150); do
  if curl -fsS "${host}/v1/ping" >/dev/null 2>&1; then break; fi
  if ! kill -0 "${host_pid}" >/dev/null 2>&1; then
    echo "content_measure_disposable_host_failed" >&2
    tail -50 "${work_dir}/host.log" >&2
    exit 1
  fi
  sleep 0.2
done
curl -fsS "${host}/v1/ping" >/dev/null

if ! spacetime publish "${database}" --server "${host}" --module-path "${work_dir}/module" --delete-data=never --yes=remote,migrate,break-clients >"${work_dir}/publish.log" 2>&1; then
  echo "content_measure_disposable_publish_failed" >&2
  tail -100 "${work_dir}/publish.log" >&2
  exit 1
fi
mkdir -p "$(dirname "${evidence_path}")"
umask 077
raw_evidence="${work_dir}/measurement-output.log"
SPACETIMEDB_HOST="${host}" SPACETIMEDB_DATABASE="${database}" npx tsx "${repo_root}/scripts/content-database-measure.ts" >"${raw_evidence}"
sed -n '/^{/,$p' "${raw_evidence}" >"${evidence_path}"
if ! jq -e '.schemaVersion == 1' "${evidence_path}" >/dev/null; then
  echo "content_measure_invalid_evidence" >&2
  exit 1
fi
echo "${evidence_path}"
