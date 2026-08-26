#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPOSITORY_DIR=${ORCHARD_REPOSITORY_DIR:-/home/toby/projects/orchard-cellar}
cd "$SERVICE_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

logs_file=$(mktemp)
trap 'rm -f "$logs_file"' EXIT
docker compose logs --no-color > "$logs_file"

for name in POSTGRES_PASSWORD KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD SMTP_PASSWORD; do
  value=${!name:-}
  if [[ -n "$value" ]] && grep -Fq -- "$value" "$logs_file"; then
    echo "$name was found in container logs" >&2
    exit 1
  fi
done

if grep -Eq '(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "$logs_file"; then
  echo 'JWT-like value found in container logs' >&2
  exit 1
fi
if grep -Eqi '([?&]code=|refresh_token=|id_token=|authorization:[[:space:]]*bearer)' "$logs_file"; then
  echo 'Authorization material found in container logs' >&2
  exit 1
fi

if git -C "$REPOSITORY_DIR" grep -En '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|refresh_token[[:space:]]*=[^=]|SMTP_PASSWORD=.+|POSTGRES_PASSWORD=.+|KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=.+)' \
  -- . ':!ops/orchard-auth/bin/secret-scan.sh' \
  | grep -vE '(GENERATE_AT_LEAST|SMTP_PASSWORD=$|PASSWORD=%s|PASSWORD=\$[A-Z_]+)' \
  | grep -vF 'SMTP_PASSWORD=\n' >/dev/null; then
  echo 'Potential secret found in tracked repository content' >&2
  exit 1
fi
echo 'Tracked repository and Keycloak/PostgreSQL logs contain no detected credentials, tokens, or authorization codes.'
