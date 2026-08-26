#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
"$SERVICE_DIR/bin/refresh-admin-truststore.sh" >/dev/null
set -a
# shellcheck disable=SC1091
source ./.env
set +a

for name in SMTP_HOST SMTP_PORT SMTP_FROM SMTP_USER SMTP_PASSWORD SMTP_STARTTLS SMTP_SSL; do
  if [[ -z ${!name:-} ]]; then
    echo "Missing $name in $SERVICE_DIR/.env" >&2
    exit 1
  fi
done

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config truststore \
  /run/orchard-tls/truststore.p12 --trustpass changeit \
  --config /tmp/orchard-kcadm.config >/dev/null
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server https://keycloak:8443 --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" \
  --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" \
  --config /tmp/orchard-kcadm.config >/dev/null

smtp_json=$(node -e 'process.stdout.write(JSON.stringify({
  host: process.env.SMTP_HOST, port: process.env.SMTP_PORT,
  from: process.env.SMTP_FROM, fromDisplayName: process.env.SMTP_FROM_DISPLAY_NAME,
  user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD,
  starttls: process.env.SMTP_STARTTLS, ssl: process.env.SMTP_SSL,
  auth: "true"
}))')
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update realms/orchard \
  -s "smtpServer=$smtp_json" -s registrationAllowed=false \
  --config /tmp/orchard-kcadm.config >/dev/null
unset smtp_json SMTP_PASSWORD KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD
echo 'SMTP configured; self-registration remains disabled pending delivery tests.'
