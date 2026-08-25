#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f $1 ]]; then
  echo 'Usage: restore-test.sh /path/to/keycloak.pgdump' >&2
  exit 2
fi

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

dump_file=$(realpath "$1")
suffix="${$}-$(date -u +%H%M%S)"
network="orchard-auth-restore-$suffix"
volume="orchard-auth-restore-$suffix"
postgres_container="orchard-auth-restore-postgres-$suffix"
keycloak_container="orchard-auth-restore-keycloak-$suffix"
test_port=${AUTH_RESTORE_TEST_PORT:-18443}

cleanup() {
  docker rm -f "$keycloak_container" "$postgres_container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker volume create "$volume" >/dev/null
docker run --detach --name "$postgres_container" --network "$network" --network-alias postgres \
  --env "POSTGRES_DB=$POSTGRES_DB" --env "POSTGRES_USER=$POSTGRES_USER" \
  --env "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
  --volume "$volume:/var/lib/postgresql/data" \
  --health-cmd "pg_isready -U $POSTGRES_USER -d $POSTGRES_DB" --health-interval 2s --health-retries 30 \
  docker.io/library/postgres:17.11-alpine3.24@sha256:7456ef82e5f5bc43d997f4781bbd7c0d6389bff397564649a356e206ba473aee >/dev/null

for _ in $(seq 1 40); do
  [[ $(docker inspect --format '{{.State.Health.Status}}' "$postgres_container") == healthy ]] && break
  sleep 1
done
[[ $(docker inspect --format '{{.State.Health.Status}}' "$postgres_container") == healthy ]]
docker exec -i "$postgres_container" pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-acl < "$dump_file"

realm_count=$(docker exec "$postgres_container" psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --tuples-only --no-align --command "SELECT count(*) FROM realm WHERE name = 'orchard'")
client_count=$(docker exec "$postgres_container" psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --tuples-only --no-align --command "SELECT count(*) FROM client WHERE client_id = 'orchard-web'")
[[ "$realm_count" == 1 && "$client_count" == 1 ]]

docker run --detach --name "$keycloak_container" --network "$network" \
  --publish "127.0.0.1:$test_port:8443" \
  --env KC_DB=postgres --env "KC_DB_URL=jdbc:postgresql://postgres:5432/$POSTGRES_DB" \
  --env "KC_DB_USERNAME=$POSTGRES_USER" --env "KC_DB_PASSWORD=$POSTGRES_PASSWORD" \
  --env KC_HOSTNAME=https://auth.orchard.dastari.net --env KC_HTTP_ENABLED=false \
  --env KC_HTTPS_CERTIFICATE_FILE=/run/orchard-tls/server.crt \
  --env KC_HTTPS_CERTIFICATE_KEY_FILE=/run/orchard-tls/server.key \
  --env KC_HTTPS_PORT=8443 --env KC_PROXY_HEADERS=xforwarded \
  --env KC_HEALTH_ENABLED=true --env KC_HTTP_MANAGEMENT_SCHEME=http \
  --volume "$SERVICE_DIR/tls:/run/orchard-tls:ro" \
  --health-cmd "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q '200 OK' <&3" \
  --health-interval 3s --health-retries 40 \
  quay.io/keycloak/keycloak:26.7.2@sha256:eb81d22bb82bc358ee10bdd4ab15dea2caae0add01416a1b146e2c7c7eb9cfab \
  start >/dev/null

for _ in $(seq 1 60); do
  [[ $(docker inspect --format '{{.State.Health.Status}}' "$keycloak_container") == healthy ]] && break
  sleep 2
done
[[ $(docker inspect --format '{{.State.Health.Status}}' "$keycloak_container") == healthy ]]

curl --fail --silent --show-error --cacert tls/ca.crt \
  --connect-to "auth.orchard.dastari.net:443:127.0.0.1:$test_port" \
  https://auth.orchard.dastari.net/realms/orchard/.well-known/openid-configuration \
  | node -e '
let s=""; process.stdin.on("data", d => s += d).on("end", () => {
  const discovery = JSON.parse(s);
  if (discovery.issuer !== "https://auth.orchard.dastari.net/realms/orchard") throw new Error("issuer_mismatch");
  if (!discovery.jwks_uri) throw new Error("jwks_missing");
});'
echo 'Isolated PostgreSQL restore, realm/client rows, Keycloak health, and discovery passed.'
