#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
container=$(docker compose ps -q keycloak)
if [[ -z "$container" || $(docker inspect --format '{{.State.Health.Status}}' "$container") != healthy ]]; then
  echo 'Keycloak must be healthy before refreshing the administrative truststore.' >&2
  exit 1
fi

docker exec "$container" keytool -delete -alias orchard-auth-ca \
  -keystore /tmp/orchard-truststore.p12 -storetype PKCS12 -storepass changeit \
  >/dev/null 2>&1 || true
docker exec "$container" keytool -importcert -noprompt -alias orchard-auth-ca \
  -file /run/orchard-tls/ca.crt -keystore /tmp/orchard-truststore.p12 \
  -storetype PKCS12 -storepass changeit >/dev/null
docker exec "$container" sh -c 'exec cat /tmp/orchard-truststore.p12' > tls/truststore.p12
chmod 0644 tls/truststore.p12
docker exec "$container" keytool -list -keystore /run/orchard-tls/truststore.p12 \
  -storetype PKCS12 -storepass changeit -alias orchard-auth-ca >/dev/null
echo 'Administrative Java truststore refreshed and verified.'
